import 'package:flutter/foundation.dart';
import '../models/parking_session.dart';
import '../models/parking_spot.dart';
import '../models/parking_zone.dart';
import '../models/payment_method.dart';
import '../models/receipt.dart';
import '../models/saved_card.dart';
import '../models/tariff.dart';
import '../models/user_account.dart';
import '../models/vehicle.dart';
import 'access_code.dart';
import 'payment_gateway.dart';
import 'spot_assigner.dart';

/// Preferencias de un usuario. Las guarda el servidor, asi cualquier
/// terminal las conoce al leer su QR.
class UserPreferences {
  final List<String> preferredZones; // en orden de prioridad
  String? preferredSpotId;
  PaymentMethod paymentMethod;
  SavedCard? savedCard;

  UserPreferences({List<String>? preferredZones, this.preferredSpotId, PaymentMethod? paymentMethod, this.savedCard})
      : preferredZones = preferredZones ?? [],
        paymentMethod = paymentMethod ?? CashPayment();
}

/// Valor de la salida. Queda fijo en el momento en que la terminal lee
/// el QR, aunque el pago tarde un par de minutos.
class ExitQuote {
  final ParkingSession session;
  final DateTime at;
  final Tariff tariff;

  const ExitQuote(this.session, this.at, this.tariff);

  Duration get elapsed => at.difference(session.entryTime);
  int get fractions => tariff.fractions(elapsed);
  int get subtotal => tariff.subtotal(elapsed);
  int get total => tariff.amountFor(elapsed);
}

/// Lo que responde la terminal despues de leer un QR.
sealed class GateResult {
  const GateResult();
}

class GateRejected extends GateResult {
  final String title;
  final String detail;

  const GateRejected(this.title, this.detail);
}

class GateEntry extends GateResult {
  final UserAccount user;
  final Vehicle vehicle;
  final ParkingSession session;
  final ParkingZone zone;
  final String reason;

  const GateEntry(this.user, this.vehicle, this.session, this.zone, this.reason);
}

class GateExit extends GateResult {
  final UserAccount user;
  final Vehicle vehicle;
  final ExitQuote quote;
  final UserPreferences preferences;

  const GateExit(this.user, this.vehicle, this.quote, this.preferences);
}

class ExitResult {
  final PaymentOutcome outcome;
  final Receipt? receipt;

  const ExitResult(this.outcome, [this.receipt]);
}

/// Estado del parqueadero que ve la app: espacios, usuario, vehiculos,
/// sesiones, preferencias y recibos.
///
/// Esta clase es el modo DEMO (sin servidor): simula en memoria tambien la
/// terminal de la porteria y los pagos. En el modo conectado se usa
/// [RemoteParkingService], que llena este mismo estado desde la API del
/// backend y envia los cambios al servidor; las pantallas no notan la
/// diferencia.
class ParkingService extends ChangeNotifier {
  static const maxPreferredZones = 3;

  List<ParkingZone> _zones;
  Map<VehicleType, Tariff> _tariffs;
  final String currentUserId;
  final PaymentGatewaySimulator gateway;
  final DateTime Function() now;

  final List<ParkingSpot> _spots;
  final List<UserAccount> _users;
  final List<Vehicle> _vehicles;
  final Map<String, UserPreferences> _preferences;
  final Map<String, ParkingSession> _activeByVehicle = {};
  final List<Receipt> _receipts = [];
  final Map<String, int> _usedCodes = {}; // codigo -> ventana
  final Map<String, int> _gateEvents = {}; // vehiculo -> entradas + salidas
  int _sessionCounter = 0;
  int _receiptCounter = 0;
  int _vehicleCounter;

  ParkingService({
    required List<ParkingZone> zones,
    required List<ParkingSpot> spots,
    required List<UserAccount> users,
    required List<Vehicle> vehicles,
    required Map<VehicleType, Tariff> tariffs,
    required this.currentUserId,
    Map<String, UserPreferences>? preferences,
    PaymentGatewaySimulator? gateway,
    DateTime Function()? clock,
  })  : _zones = List.of(zones),
        _tariffs = Map.of(tariffs),
        _spots = List.of(spots),
        _users = List.of(users),
        _vehicles = List.of(vehicles),
        _preferences = preferences ?? {},
        _vehicleCounter = vehicles.length,
        gateway = gateway ?? PaymentGatewaySimulator(),
        now = clock ?? DateTime.now;

  // ------------------------------------------------------------ modo de uso

  /// true en el modo demo: la terminal y los pagos se simulan en la app.
  bool get isDemo => true;

  /// Avisos para mostrar al usuario (ej. un cambio que el servidor rechazo).
  final ValueNotifier<String?> notices = ValueNotifier(null);

  /// Vuelve a cargar el estado (en el modo demo no hay nada que cargar).
  Future<void> refresh() async {}

  /// Reemplaza todo el estado de una vez (lo usa el modo conectado al
  /// recibir los datos del servidor).
  @protected
  void applySnapshot({
    required List<ParkingZone> zones,
    required Map<VehicleType, Tariff> tariffs,
    required List<ParkingSpot> spots,
    required List<UserAccount> users,
    required List<Vehicle> vehicles,
    required UserPreferences preferences,
    required List<ParkingSession> activeSessions,
    required List<Receipt> receipts,
    required Map<String, int> gateCounters,
  }) {
    _zones = List.of(zones);
    _tariffs = Map.of(tariffs);
    _spots
      ..clear()
      ..addAll(spots);
    _users
      ..clear()
      ..addAll(users);
    _vehicles
      ..clear()
      ..addAll(vehicles);
    _preferences
      ..clear()
      ..[currentUserId] = preferences;
    _activeByVehicle
      ..clear()
      ..addAll({for (final s in activeSessions) s.vehicle.id: s});
    _receipts
      ..clear()
      ..addAll(receipts);
    _gateEvents
      ..clear()
      ..addAll(gateCounters);
    notifyListeners();
  }

  /// Cambia el estado de un espacio (eventos en tiempo real del servidor).
  @protected
  void updateSpot(String spotId, SpotStatus status) {
    _setSpotStatus(spotId, status);
    notifyListeners();
  }

  @override
  void dispose() {
    notices.dispose();
    super.dispose();
  }

  // ---------------------------------------------------------------- consultas

  List<ParkingZone> get zones => List.unmodifiable(_zones);

  Map<VehicleType, Tariff> get tariffs => Map.unmodifiable(_tariffs);

  List<ParkingSpot> get spots => List.unmodifiable(_spots);

  List<ParkingSpot> spotsForZone(String zoneId) => _spots.where((s) => s.zoneId == zoneId).toList();

  int freeSpotsIn(String zoneId) =>
      _spots.where((s) => s.zoneId == zoneId && s.status == SpotStatus.free).length;

  ParkingZone zoneById(String zoneId) => zones.firstWhere((z) => z.id == zoneId);

  ParkingZone zoneOfSpot(String spotId) => zoneById(_spots.firstWhere((s) => s.id == spotId).zoneId);

  UserAccount get currentUser => userById(currentUserId)!;

  UserAccount? userById(String id) => _users.where((u) => u.id == id).firstOrNull;

  Vehicle? vehicleById(String id) => _vehicles.where((v) => v.id == id).firstOrNull;

  List<Vehicle> vehiclesOf(String userId) => _vehicles.where((v) => v.ownerId == userId).toList();

  ParkingSession? activeSessionFor(String vehicleId) => _activeByVehicle[vehicleId];

  UserPreferences preferencesOf(String userId) => _preferences.putIfAbsent(userId, UserPreferences.new);

  Tariff tariffFor(VehicleType type) => _tariffs[type] ?? _tariffs.values.first;

  List<Receipt> receiptsOf(String userId) =>
      _receipts.where((r) => r.userId == userId).toList().reversed.toList();

  // ------------------------------------------------------ preferencias (app)

  void toggleZone(String zoneId) {
    final zones = preferencesOf(currentUserId).preferredZones;
    if (zones.contains(zoneId)) {
      zones.remove(zoneId);
    } else if (zones.length < maxPreferredZones) {
      zones.add(zoneId);
    }
    notifyListeners();
  }

  void setPreferredSpot(String? spotId) {
    preferencesOf(currentUserId).preferredSpotId = spotId;
    notifyListeners();
  }

  void setPaymentMethod(PaymentMethod method) {
    preferencesOf(currentUserId).paymentMethod = method;
    notifyListeners();
  }

  /// Registra una tarjeta en la pasarela; la app solo guarda el token.
  Future<SavedCard> addCard(TestCard card) async {
    final saved = await gateway.tokenize(card);
    preferencesOf(currentUserId).savedCard = saved;
    notifyListeners();
    return saved;
  }

  void removeCard() {
    final prefs = preferencesOf(currentUserId);
    prefs.savedCard = null;
    if (prefs.paymentMethod is AutoChargePayment) prefs.paymentMethod = CashPayment();
    notifyListeners();
  }

  // ------------------------------------------------------------ perfil (app)

  void updateUser(UserAccount updated) {
    final index = _users.indexWhere((u) => u.id == updated.id);
    if (index == -1) return;
    _users[index] = updated;
    notifyListeners();
  }

  /// Devuelve un mensaje de error, o null si se agrego.
  Future<String?> addVehicle({required String plate, required VehicleType type, String description = ''}) async {
    final normalized = Vehicle.normalizePlate(plate);
    final error = Vehicle.validatePlate(normalized, type) ?? _duplicatePlateError(normalized, null);
    if (error != null) return error;
    _vehicles.add(Vehicle(
      id: 'v${++_vehicleCounter}',
      ownerId: currentUserId,
      plate: normalized,
      type: type,
      description: description.trim(),
    ));
    notifyListeners();
    return null;
  }

  /// Devuelve un mensaje de error, o null si se guardo.
  Future<String?> updateVehicle(Vehicle updated) async {
    final index = _vehicles.indexWhere((v) => v.id == updated.id);
    if (index == -1) return 'Vehiculo no encontrado';
    final current = _vehicles[index];
    final normalized = updated.copyWith(plate: Vehicle.normalizePlate(updated.plate), description: updated.description.trim());
    final parked = _activeByVehicle.containsKey(updated.id);
    if (parked && (normalized.plate != current.plate || normalized.type != current.type)) {
      return 'No puedes cambiar la placa ni el tipo mientras el vehiculo esta dentro del parqueadero';
    }
    final error = Vehicle.validatePlate(normalized.plate, normalized.type) ?? _duplicatePlateError(normalized.plate, updated.id);
    if (error != null) return error;
    _vehicles[index] = normalized;
    notifyListeners();
    return null;
  }

  String? _duplicatePlateError(String plate, String? exceptVehicleId) {
    final taken = _vehicles.any((v) => v.plate == plate && v.id != exceptVehicleId);
    return taken ? 'La placa $plate ya esta registrada' : null;
  }

  // ---------------------------------------------------------- QR de acceso

  /// QR que muestra la app del usuario para ese vehiculo, en este momento.
  /// El contador de entradas/salidas hace que despues de entrar la app
  /// muestre de inmediato un QR nuevo para salir.
  String accessCodeFor(String vehicleId, {DateTime? at}) {
    final vehicle = vehicleById(vehicleId)!;
    final owner = userById(vehicle.ownerId)!;
    return AccessCode.generate(
      vehicleId: vehicleId,
      key: owner.accessKey,
      now: at ?? now(),
      counter: _gateEvents[vehicleId] ?? 0,
    );
  }

  // -------------------------------------------------------------- terminal

  /// Procesa un QR leido por la terminal (con la camara o simulado):
  /// lo valida, identifica al usuario y su vehiculo, y decide si es una
  /// entrada (asigna espacio y abre la barrera) o una salida (cotiza).
  GateResult handleScan(String raw) {
    final time = now();
    final code = AccessCode.parse(raw);
    if (code == null) {
      final shown = raw.trim().length > 60 ? '${raw.trim().substring(0, 60)}...' : raw.trim();
      return GateRejected('Este QR no es de ParqueoAgil', 'Contenido leido: "$shown"');
    }

    final vehicle = vehicleById(code.vehicleId);
    final owner = vehicle == null ? null : userById(vehicle.ownerId);
    if (vehicle == null || owner == null) {
      return const GateRejected('Vehiculo no registrado', 'El QR tiene el formato correcto pero el vehiculo no existe.');
    }

    switch (AccessCode.verify(code, key: owner.accessKey, now: time)) {
      case AccessCodeStatus.badSignature:
        return const GateRejected('QR falsificado o alterado', 'La firma no coincide con la clave del usuario.');
      case AccessCodeStatus.expired:
        return const GateRejected('QR vencido', 'Pide al usuario que muestre el codigo actual de su app (cambia cada 30 s).');
      case AccessCodeStatus.valid:
        break;
    }

    final window = AccessCode.windowAt(time);
    _usedCodes.removeWhere((_, w) => w < window - 2);
    if (_usedCodes.containsKey(code.raw)) {
      return const GateRejected('QR ya usado', 'Este codigo ya se leyo una vez. Espera el siguiente (cambia cada 30 s).');
    }
    _usedCodes[code.raw] = window;

    final session = _activeByVehicle[vehicle.id];
    if (session != null) {
      return GateExit(owner, vehicle, ExitQuote(session, time, tariffFor(vehicle.type)), preferencesOf(owner.id));
    }

    final entry = _enter(vehicle, owner, time);
    if (entry == null) {
      return GateRejected('Parqueadero lleno', 'No hay espacios libres para ${vehicle.type.label.toLowerCase()} en este momento.');
    }
    return entry;
  }

  /// Crea una sesion sin pasar por la terminal (datos de ejemplo).
  void seedSession(String vehicleId, DateTime entryTime) {
    final vehicle = vehicleById(vehicleId)!;
    _enter(vehicle, userById(vehicle.ownerId)!, entryTime);
  }

  GateEntry? _enter(Vehicle vehicle, UserAccount owner, DateTime time) {
    final prefs = preferencesOf(owner.id);
    final assignment = SpotAssigner(zones).assign(
      spots: _spots,
      preferredZones: prefs.preferredZones,
      preferredSpotId: prefs.preferredSpotId,
      vehicleType: vehicle.type,
    );
    if (assignment == null) return null;

    _setSpotStatus(assignment.spot.id, SpotStatus.occupied);
    final session = ParkingSession(
      id: 'S${(++_sessionCounter).toString().padLeft(4, '0')}',
      vehicle: vehicle,
      spotId: assignment.spot.id,
      entryTime: time,
    );
    _activeByVehicle[vehicle.id] = session;
    _gateEvents.update(vehicle.id, (n) => n + 1, ifAbsent: () => 1);
    notifyListeners();
    return GateEntry(owner, vehicle, session, zoneById(assignment.spot.zoneId), assignment.reason);
  }

  /// Referencia que viaja en el QR de cobro de la caja.
  String paymentReference(ExitQuote quote) => 'PAGO-${quote.session.id}';

  /// Cobra la salida con el metodo elegido. Si el pago se aprueba,
  /// cierra la sesion, libera el espacio y genera el recibo.
  Future<ExitResult> pay(GateExit exit, PaymentMethod method, {int? cashReceived}) async {
    final quote = exit.quote;
    if (!quote.session.isActive) {
      return const ExitResult(PaymentOutcome.declined('Esta salida ya fue pagada'));
    }

    final total = quote.total;
    String? cardLabel;
    final PaymentOutcome outcome;
    switch (method) {
      case CashPayment():
        if (cashReceived == null || cashReceived < total) {
          return const ExitResult(PaymentOutcome.declined('El efectivo recibido no alcanza para el total'));
        }
        outcome = const PaymentOutcome.approved(null);
      case AutoChargePayment():
        final card = exit.preferences.savedCard;
        if (card == null) {
          return const ExitResult(PaymentOutcome.declined('El usuario no tiene tarjeta guardada'));
        }
        cardLabel = card.label;
        outcome = await gateway.chargeToken(card.token, total);
      case QrTransferPayment():
        outcome = await gateway.confirmQrTransfer(paymentReference(quote), total);
      default:
        outcome = await gateway.chargeCardPresent(total);
    }
    if (!outcome.approved) return ExitResult(outcome);
    if (!quote.session.isActive) {
      return const ExitResult(PaymentOutcome.declined('Esta salida ya fue pagada'));
    }

    final session = quote.session;
    session.exitTime = quote.at;
    _activeByVehicle.remove(session.vehicle.id);
    _gateEvents.update(session.vehicle.id, (n) => n + 1, ifAbsent: () => 1);
    _setSpotStatus(session.spotId, SpotStatus.free);
    final receipt = Receipt(
      reference: 'PA-${(++_receiptCounter).toString().padLeft(5, '0')}',
      userId: exit.user.id,
      plate: session.vehicle.plate,
      vehicleType: session.vehicle.type,
      spotId: session.spotId,
      entryTime: session.entryTime,
      exitTime: quote.at,
      fractions: quote.fractions,
      minutesPerFraction: quote.tariff.minutesPerFraction,
      pricePerFraction: quote.tariff.pricePerFraction,
      subtotal: quote.subtotal,
      total: total,
      methodName: method.name,
      cardLabel: cardLabel,
      authorization: outcome.authorization,
      cashReceived: method is CashPayment ? cashReceived : null,
    );
    _receipts.add(receipt);
    notifyListeners();
    return ExitResult(outcome, receipt);
  }

  void _setSpotStatus(String spotId, SpotStatus status) {
    final index = _spots.indexWhere((s) => s.id == spotId);
    if (index != -1) _spots[index] = _spots[index].copyWith(status: status);
  }
}
