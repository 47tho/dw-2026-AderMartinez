import 'package:flutter/foundation.dart';
import '../models/parking_session.dart';
import '../models/parking_spot.dart';
import '../models/parking_zone.dart';
import '../models/payment_method.dart';
import '../models/receipt.dart';
import '../models/saved_card.dart';
import '../models/ticket_notice.dart';
import '../models/tariff.dart';
import '../models/user_account.dart';
import '../models/vehicle.dart';
import 'access_code.dart';
import 'payment_gateway.dart';

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

/// Estado del parqueadero que ve la app del conductor: espacios, usuario,
/// vehiculos, sesiones, preferencias y recibos.
///
/// Guarda el estado en memoria y avisa a las pantallas cuando cambia. En la
/// app se usa [RemoteParkingService], que llena este estado desde la API del
/// backend y envia cada cambio al servidor; esta clase base se usa sola en
/// las pruebas automaticas.
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
  final Map<String, int> _gateEvents = {}; // vehiculo -> entradas + salidas
  int _vehicleCounter;

  ParkingService({
    required List<ParkingZone> zones,
    required List<ParkingSpot> spots,
    required List<UserAccount> users,
    required List<Vehicle> vehicles,
    required Map<VehicleType, Tariff> tariffs,
    required this.currentUserId,
    Map<String, UserPreferences>? preferences,
    List<ParkingSession> activeSessions = const [],
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
        now = clock ?? DateTime.now {
    for (final session in activeSessions) {
      _activeByVehicle[session.vehicle.id] = session;
      _setSpotStatus(session.spotId, SpotStatus.occupied);
    }
  }

  // ------------------------------------------------------------ estado

  /// Avisos para mostrar al usuario (ej. un cambio que el servidor rechazo).
  final ValueNotifier<String?> notices = ValueNotifier(null);

  /// Entradas, salidas y pagos de mis vehiculos que registro la porteria
  /// (la pantalla principal los muestra en una ventana emergente).
  final ValueNotifier<TicketNotice?> ticketNotices = ValueNotifier(null);

  /// Vuelve a cargar el estado (sin servidor no hay nada que cargar).
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
    ticketNotices.dispose();
    super.dispose();
  }

  // ---------------------------------------------------------------- consultas

  List<ParkingZone> get zones => List.unmodifiable(_zones);

  Map<VehicleType, Tariff> get tariffs => Map.unmodifiable(_tariffs);

  List<ParkingSpot> get spots => List.unmodifiable(_spots);

  List<ParkingSpot> spotsForZone(String zoneId) => _spots.where((s) => s.zoneId == zoneId).toList();

  int freeSpotsIn(String zoneId) => _spots.where((s) => s.zoneId == zoneId && s.status == SpotStatus.free).length;

  ParkingZone zoneById(String zoneId) => zones.firstWhere((z) => z.id == zoneId);

  ParkingZone zoneOfSpot(String spotId) => zoneById(_spots.firstWhere((s) => s.id == spotId).zoneId);

  UserAccount get currentUser => userById(currentUserId)!;

  UserAccount? userById(String id) => _users.where((u) => u.id == id).firstOrNull;

  Vehicle? vehicleById(String id) => _vehicles.where((v) => v.id == id).firstOrNull;

  List<Vehicle> vehiclesOf(String userId) => _vehicles.where((v) => v.ownerId == userId).toList();

  ParkingSession? activeSessionFor(String vehicleId) => _activeByVehicle[vehicleId];

  UserPreferences preferencesOf(String userId) => _preferences.putIfAbsent(userId, UserPreferences.new);

  Tariff tariffFor(VehicleType type) => _tariffs[type] ?? _tariffs.values.first;

  List<Receipt> receiptsOf(String userId) => _receipts.where((r) => r.userId == userId).toList().reversed.toList();

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
    final normalized =
        updated.copyWith(plate: Vehicle.normalizePlate(updated.plate), description: updated.description.trim());
    final parked = _activeByVehicle.containsKey(updated.id);
    if (parked && (normalized.plate != current.plate || normalized.type != current.type)) {
      return 'No puedes cambiar la placa ni el tipo mientras el vehiculo esta dentro del parqueadero';
    }
    final error =
        Vehicle.validatePlate(normalized.plate, normalized.type) ?? _duplicatePlateError(normalized.plate, updated.id);
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

  void _setSpotStatus(String spotId, SpotStatus status) {
    final index = _spots.indexWhere((s) => s.id == spotId);
    if (index != -1) _spots[index] = _spots[index].copyWith(status: status);
  }
}
