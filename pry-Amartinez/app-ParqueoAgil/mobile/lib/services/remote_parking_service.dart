import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import '../models/parking_session.dart';
import '../models/parking_spot.dart';
import '../models/parking_zone.dart';
import '../models/payment_method.dart';
import '../models/receipt.dart';
import '../models/saved_card.dart';
import '../models/tariff.dart';
import '../models/user_account.dart';
import '../models/vehicle.dart';
import 'api/api_client.dart';
import 'api/live_events.dart';
import 'parking_service.dart';
import 'payment_gateway.dart';

/// Modo CONECTADO: el mismo estado que [ParkingService], pero cargado desde
/// el backend y con cada cambio enviado al servidor. La terminal de la
/// porteria es el panel web, asi que aqui no se simulan entradas ni pagos.
///
/// Correspondencias con la API: las zonas y los espacios se identifican en
/// la app por su codigo ('A', 'A05') y en el servidor por su id numerico.
class RemoteParkingService extends ParkingService {
  final ApiClient api;

  LiveEvents? _live;
  Timer? _poll;
  Future<void>? _inFlight;
  bool _reloadAgain = false;

  final Map<String, int> _zoneIds = {};
  final Map<int, String> _zoneCodes = {};
  final Map<String, int> _spotIds = {};
  final Map<int, String> _spotCodes = {};
  final Map<VehicleType, int> _typeIds = {};
  final Map<int, VehicleType> _typeKinds = {};

  RemoteParkingService._(this.api, String userId, PaymentGatewaySimulator? gateway)
      : super(
          zones: const [],
          spots: const [],
          users: const [],
          vehicles: const [],
          tariffs: const {},
          currentUserId: userId,
          gateway: gateway,
        );

  /// Carga todo desde el servidor y empieza a escuchar los cambios en vivo.
  static Future<RemoteParkingService> connect(ApiClient api,
      {PaymentGatewaySimulator? gateway, bool live = true}) async {
    final me = await api.get('/me') as Map<String, dynamic>;
    final user = me['user'] as Map<String, dynamic>;
    final service = RemoteParkingService._(api, '${user['id']}', gateway);
    await service._load(me);
    if (live) service._startLive();
    return service;
  }

  @override
  bool get isDemo => false;

  @override
  Future<void> refresh() => _load();

  @override
  void dispose() {
    _live?.close();
    _poll?.cancel();
    super.dispose();
  }

  // --------------------------------------------------------- carga inicial

  /// Si ya hay una carga en curso no se lanza otra en paralelo: se repite
  /// al terminar, para no perder un cambio que llego mientras tanto.
  Future<void> _load([Map<String, dynamic>? me]) {
    if (_inFlight != null) {
      _reloadAgain = true;
      return _inFlight!;
    }
    return _inFlight = _fetch(me).whenComplete(() {
      _inFlight = null;
      if (_reloadAgain) {
        _reloadAgain = false;
        _safeRefresh();
      }
    });
  }

  Future<void> _fetch(Map<String, dynamic>? me) async {
    final results = await Future.wait([
      me != null ? Future.value(me) : api.get('/me'),
      api.get('/parking-zones', {'page': '1', 'limit': '100'}),
      api.get('/parking-spots'),
      api.get('/me/tickets', {'status': 'closed', 'page': '1', 'limit': '30'}),
    ]);
    _apply(
      results[0] as Map<String, dynamic>,
      ((results[1] as Map<String, dynamic>)['items'] as List).cast<Map<String, dynamic>>(),
      (results[2] as List).cast<Map<String, dynamic>>(),
      ((results[3] as Map<String, dynamic>)['items'] as List).cast<Map<String, dynamic>>(),
    );
  }

  void _apply(
    Map<String, dynamic> me,
    List<Map<String, dynamic>> zoneRows,
    List<Map<String, dynamic>> spotRows,
    List<Map<String, dynamic>> closedTickets,
  ) {
    final driver = me['driver'] as Map<String, dynamic>;

    _typeIds.clear();
    _typeKinds.clear();
    final rates = <VehicleType, num>{};
    for (final t in (me['vehicleTypes'] as List).cast<Map<String, dynamic>>()) {
      final kind = t['kind'] == 'motorcycle' ? VehicleType.motorcycle : VehicleType.car;
      _typeKinds[t['id'] as int] = kind;
      // Carro = el primer tipo "car" (Automovil); las camionetas se muestran como carro.
      if (t['kind'] != 'van' || !_typeIds.containsKey(kind)) {
        _typeIds.putIfAbsent(kind, () => t['id'] as int);
        rates.putIfAbsent(kind, () => t['hourlyRate'] as num);
      }
    }

    _zoneIds.clear();
    _zoneCodes.clear();
    final zones = <ParkingZone>[];
    for (final z in zoneRows.where((z) => z['status'] == 'active')) {
      final id = z['id'] as int;
      final code = (z['code'] as String?) ?? 'Z$id';
      _zoneIds[code] = id;
      _zoneCodes[id] = code;
      zones.add(ParkingZone(
        id: code,
        label: (z['name'] as String).replaceAll(RegExp(r'\s*-\s*Piso\s*\d+$'), ''),
        color: _color(z['color'] as String?),
        floor: z['floor'] as int,
        position: z['position'] as int,
        totalSpots: z['capacity'] as int,
        vehicleType: _typeKinds[z['vehicleTypeId']] ?? VehicleType.car,
      ));
    }

    _spotIds.clear();
    _spotCodes.clear();
    final spots = <ParkingSpot>[];
    for (final s in spotRows) {
      final zoneCode = _zoneCodes[s['zoneId']];
      if (zoneCode == null) continue;
      _spotIds[s['code'] as String] = s['id'] as int;
      _spotCodes[s['id'] as int] = s['code'] as String;
      spots.add(ParkingSpot(
        id: s['code'] as String,
        zoneId: zoneCode,
        row: s['row'] as int,
        column: s['column'] as int,
        status: _spotStatus(s['status'] as String),
      ));
    }

    final user = UserAccount(
      id: currentUserId,
      name: driver['name'] as String,
      docType: driver['docType'] as String,
      docNumber: driver['docNumber'] as String,
      phone: (driver['phone'] as String?) ?? '',
      accessKey: driver['qrSecret'] as String,
    );

    final vehicles = <Vehicle>[];
    final sessions = <ParkingSession>[];
    final counters = <String, int>{};
    for (final v in (me['vehicles'] as List).cast<Map<String, dynamic>>()) {
      final vehicle = Vehicle(
        id: '${v['id']}',
        ownerId: currentUserId,
        plate: v['plate'] as String,
        type: v['kind'] == 'motorcycle' ? VehicleType.motorcycle : VehicleType.car,
        description: (v['description'] as String?) ?? '',
      );
      vehicles.add(vehicle);
      counters[vehicle.id] = v['gateCounter'] as int;
      final active = v['activeTicket'] as Map<String, dynamic>?;
      if (active != null) {
        sessions.add(ParkingSession(
          id: 'T${active['id']}',
          vehicle: vehicle,
          spotId: (active['spotCode'] as String?) ?? '',
          entryTime: DateTime.parse(active['entryAt'] as String).toLocal(),
        ));
      }
    }

    final card = driver['card'] as Map<String, dynamic>?;
    final preferences = UserPreferences(
      preferredZones: [
        for (final id in (driver['preferredZoneIds'] as List).cast<int>())
          if (_zoneCodes[id] case final code?) code,
      ],
      preferredSpotId: _spotCodes[driver['preferredSpotId']],
      paymentMethod: _methodFromCode(driver['paymentMethod'] as String?),
      // El servidor nunca devuelve el token: solo marca y ultimos 4.
      savedCard:
          card == null ? null : SavedCard(token: '', brand: card['brand'] as String, last4: card['last4'] as String),
    );

    applySnapshot(
      zones: zones,
      tariffs: {
        for (final entry in rates.entries) entry.key: Tariff(pricePerFraction: (entry.value * 15 / 60).round()),
      },
      spots: spots,
      users: [user],
      vehicles: vehicles,
      preferences: preferences,
      activeSessions: sessions,
      receipts: [for (final t in closedTickets) _receipt(t, vehicles)],
      gateCounters: counters,
    );
  }

  // ---------------------------------------------------------- tiempo real

  void _startLive() {
    if (kIsWeb) {
      // El navegador no entrega SSE por partes con package:http: se consulta cada 10 s.
      _poll = Timer.periodic(const Duration(seconds: 10), (_) => _safeRefresh());
      return;
    }
    _live = LiveEvents(api, _onEvent)..start();
    // Respaldo por si se pierde algun evento.
    _poll = Timer.periodic(const Duration(minutes: 1), (_) => _safeRefresh());
  }

  void _onEvent(String type, Map<String, dynamic> data) {
    switch (type) {
      case 'spot.updated':
        updateSpot(data['code'] as String, _spotStatus(data['status'] as String));
      case 'ticket.opened' || 'ticket.quoted' || 'ticket.closed':
        // Solo llegan los tickets de mis vehiculos: cambia mi QR y mi sesion.
        _safeRefresh();
    }
  }

  void _safeRefresh() {
    _load().catchError((Object _) {});
  }

  // ------------------------------------------------------------ cambios

  @override
  void toggleZone(String zoneId) {
    super.toggleZone(zoneId);
    _savePreferences();
  }

  @override
  void setPreferredSpot(String? spotId) {
    super.setPreferredSpot(spotId);
    _savePreferences();
  }

  @override
  void setPaymentMethod(PaymentMethod method) {
    super.setPaymentMethod(method);
    _savePreferences();
  }

  /// La pasarela (simulada en la app, como el widget de Wompi/ePayco)
  /// entrega el token; al servidor solo viajan token, marca y ultimos 4.
  @override
  Future<SavedCard> addCard(TestCard card) async {
    final saved = await gateway.tokenize(card);
    await _send(() => api.put('/me/card', {'token': saved.token, 'brand': saved.brand, 'last4': saved.last4}),
        rethrowErrors: true);
    return saved;
  }

  @override
  void removeCard() {
    super.removeCard();
    _send(() => api.delete('/me/card'));
  }

  @override
  void updateUser(UserAccount updated) {
    super.updateUser(updated);
    _send(() => api.patch('/me', {
          'name': updated.name,
          'phone': updated.fullPhone,
          'docType': updated.docType,
          'docNumber': updated.fullDoc,
        }));
  }

  @override
  Future<String?> addVehicle({required String plate, required VehicleType type, String description = ''}) async {
    final normalized = Vehicle.normalizePlate(plate);
    final invalid = Vehicle.validatePlate(normalized, type);
    if (invalid != null) return invalid;
    return _sendForMessage(() => api.post('/me/vehicles', {
          'plate': normalized,
          'vehicleTypeId': _typeIds[type],
          'description': description.trim(),
        }));
  }

  @override
  Future<String?> updateVehicle(Vehicle updated) async {
    final normalized = Vehicle.normalizePlate(updated.plate);
    final invalid = Vehicle.validatePlate(normalized, updated.type);
    if (invalid != null) return invalid;
    return _sendForMessage(() => api.patch('/me/vehicles/${updated.id}', {
          'plate': normalized,
          'vehicleTypeId': _typeIds[updated.type],
          'description': updated.description.trim(),
        }));
  }

  /// La terminal en el modo conectado es el panel web de la porteria.
  @override
  GateResult handleScan(String raw) => const GateRejected(
        'La terminal esta en la porteria',
        'En el modo conectado el QR lo lee el panel web del parqueadero.',
      );

  void _savePreferences() {
    final prefs = preferencesOf(currentUserId);
    _send(() => api.put('/me/preferences', {
          'preferredZoneIds': [
            for (final code in prefs.preferredZones)
              if (_zoneIds[code] case final id?) id
          ],
          'preferredSpotId': _spotIds[prefs.preferredSpotId],
          'paymentMethod': _codeOf(prefs.paymentMethod),
        }));
  }

  /// Envia un cambio; si el servidor lo rechaza, avisa y vuelve a cargar
  /// el estado real (deshace el cambio optimista).
  Future<void> _send(Future<dynamic> Function() request, {bool rethrowErrors = false}) async {
    try {
      await request();
      await _load();
    } on ApiException catch (e) {
      notices.value = e.message;
      _safeRefresh();
      if (rethrowErrors) rethrow;
    }
  }

  Future<String?> _sendForMessage(Future<dynamic> Function() request) async {
    try {
      await request();
      await _load();
      return null;
    } on ApiException catch (e) {
      return e.message;
    }
  }

  // ------------------------------------------------------------ mapeos

  static Color _color(String? hex) {
    final value = int.tryParse((hex ?? '').replaceFirst('#', ''), radix: 16);
    return value == null ? const Color(0xFF3B82F6) : Color(0xFF000000 | value);
  }

  static SpotStatus _spotStatus(String status) => switch (status) {
        'occupied' => SpotStatus.occupied,
        'blocked' => SpotStatus.blocked,
        _ => SpotStatus.free,
      };

  static PaymentMethod _methodFromCode(String? code) => switch (code) {
        'card' => CardPayment(),
        'qr' => QrTransferPayment(),
        'auto' => AutoChargePayment(),
        _ => CashPayment(),
      };

  static String _codeOf(PaymentMethod method) => switch (method) {
        CardPayment() => 'card',
        QrTransferPayment() => 'qr',
        AutoChargePayment() => 'auto',
        _ => 'cash',
      };

  Receipt _receipt(Map<String, dynamic> t, List<Vehicle> vehicles) {
    final vehicle = vehicles.where((v) => v.id == '${t['vehicleId']}').firstOrNull;
    final method = t['paymentMethod'] as String?;
    final exit = t['exitAt'] as String?;
    return Receipt(
      reference: (t['paymentRef'] as String?) ?? 'T${t['id']}',
      userId: currentUserId,
      plate: (t['plate'] as String?) ?? vehicle?.plate ?? '',
      vehicleType: vehicle?.type ?? VehicleType.car,
      spotId: (t['spotCode'] as String?) ?? '-',
      entryTime: DateTime.parse(t['entryAt'] as String).toLocal(),
      exitTime: DateTime.parse(exit ?? t['entryAt'] as String).toLocal(),
      fractions: t['fractions'] as int,
      minutesPerFraction: t['minutesPerFraction'] as int,
      pricePerFraction: (t['pricePerFraction'] as num).toInt(),
      subtotal: (t['subtotal'] as num).toInt(),
      total: (t['total'] as num).toInt(),
      methodName: _methodFromCode(method).name,
      cardLabel: t['cardLabel'] as String?,
      authorization: (t['authorization'] as String?)?.isEmpty ?? true ? null : t['authorization'] as String,
      cashReceived: method == 'cash' ? (t['amountReceived'] as num?)?.toInt() : null,
    );
  }
}
