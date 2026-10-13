import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:parqueoagil/models/parking_spot.dart';
import 'package:parqueoagil/models/payment_method.dart';
import 'package:parqueoagil/models/vehicle.dart';
import 'package:parqueoagil/services/access_code.dart';
import 'package:parqueoagil/services/api/api_client.dart';
import 'package:parqueoagil/services/api/session_store.dart';
import 'package:parqueoagil/services/parking_service.dart';
import 'package:parqueoagil/services/payment_gateway.dart';
import 'package:parqueoagil/services/remote_parking_service.dart';

/// Servidor falso con las mismas respuestas que el backend
/// (docs/API-INTEGRACION.md), para probar el modo conectado sin red.
class FakeBackend {
  final requests = <http.Request>[];
  Map<String, dynamic> me = _me();

  static Map<String, dynamic> _me() => {
        'user': {'id': 7, 'username': 'carlos', 'email': 'carlos@correo.com'},
        'driver': {
          'id': 3,
          'clientId': 9,
          'name': 'Carlos Ruiz',
          'phone': '3001234567',
          'docType': 'CC',
          'docNumber': '1023456789',
          'qrSecret': 'secreto-del-servidor',
          'preferredZoneIds': [1],
          'preferredSpotId': 105,
          'paymentMethod': 'cash',
          'card': null,
        },
        'vehicles': [
          {
            'id': 12,
            'plate': 'ABC123',
            'vehicleTypeId': 1,
            'kind': 'car',
            'description': 'Mazda 3 gris',
            'gateCounter': 1,
            'activeTicket': {'id': 40, 'spotCode': 'A05', 'zoneId': 1, 'entryAt': '2026-10-05T15:00:00.000Z'},
          },
          {
            'id': 13,
            'plate': 'QWE12F',
            'vehicleTypeId': 2,
            'kind': 'motorcycle',
            'description': null,
            'gateCounter': 0,
            'activeTicket': null,
          },
        ],
        'vehicleTypes': [
          {'id': 1, 'name': 'Automóvil', 'kind': 'car', 'hourlyRate': 3000},
          {'id': 2, 'name': 'Motocicleta', 'kind': 'motorcycle', 'hourlyRate': 1500},
        ],
      };

  static const zones = {
    'items': [
      {'id': 1, 'name': 'Zona A - Piso 1', 'code': 'A', 'floor': 1, 'position': 0, 'color': '#3B82F6', 'vehicleTypeId': 1, 'capacity': 2, 'availableSpots': 1, 'hourlyRate': 3000, 'status': 'active'},
      {'id': 2, 'name': 'Zona M - Motos', 'code': 'M', 'floor': 1, 'position': 3, 'color': '#64748B', 'vehicleTypeId': 2, 'capacity': 1, 'availableSpots': 1, 'hourlyRate': 1500, 'status': 'active'},
    ],
    'meta': {'page': 1, 'limit': 100, 'total': 2, 'totalPages': 1},
  };

  static const spots = [
    {'id': 104, 'code': 'A04', 'zoneId': 1, 'row': 0, 'column': 3, 'status': 'blocked'},
    {'id': 105, 'code': 'A05', 'zoneId': 1, 'row': 0, 'column': 4, 'status': 'occupied'},
    {'id': 201, 'code': 'M01', 'zoneId': 2, 'row': 0, 'column': 0, 'status': 'free'},
  ];

  http.Response _json(Object? data, [int status = 200]) => http.Response.bytes(
        utf8.encode(jsonEncode(status < 300 ? {'statusCode': status, 'message': 'OK', 'data': data} : data)),
        status,
        headers: {'content-type': 'application/json'},
      );

  late final client = MockClient((request) async {
    requests.add(request);
    final path = request.url.path.replaceFirst('/api', '');
    switch ('${request.method} $path') {
      case 'POST /sesion/login':
      case 'POST /sesion/refresh':
        return _json({'access_token': 'acc', 'token_type': 'Bearer', 'expires_in': 900, 'refresh_token': 'ref', 'refresh_expires_in': 604800});
      case 'GET /me':
        return _json(me);
      case 'GET /parking-zones':
        return _json(zones);
      case 'GET /parking-spots':
        return _json(spots);
      case 'GET /me/tickets':
        return _json({'items': [], 'meta': {'page': 1, 'limit': 30, 'total': 0, 'totalPages': 0}});
      case 'POST /me/vehicles':
        return _json({'statusCode': 409, 'message': 'La placa XYZ789 ya está registrada'}, 409);
      case 'PUT /me/preferences':
        return _json(me);
    }
    return _json({'statusCode': 404, 'message': 'No existe'}, 404);
  });
}

void main() {
  late FakeBackend backend;
  late ApiClient api;
  late RemoteParkingService service;

  setUp(() async {
    backend = FakeBackend();
    api = ApiClient(baseUrl: 'http://servidor/api', store: MemorySessionStore(), httpClient: backend.client);
    await api.login('carlos@correo.com', 'Conductor123!');
    service = await RemoteParkingService.connect(api, live: false, gateway: PaymentGatewaySimulator(latency: Duration.zero));
  });

  tearDown(() => service.dispose());

  test('arma el estado de la app con los datos del servidor', () {
    expect(service.isDemo, isFalse);
    expect(service.currentUser.name, 'Carlos Ruiz');
    expect(service.zones.map((z) => z.id), ['A', 'M']);
    expect(service.zones.first.label, 'Zona A');
    expect(service.zoneById('M').vehicleType, VehicleType.motorcycle);
    expect(service.spots.map((s) => s.status), [SpotStatus.blocked, SpotStatus.occupied, SpotStatus.free]);
    expect(service.vehiclesOf(service.currentUserId).map((v) => v.plate), ['ABC123', 'QWE12F']);
    expect(service.activeSessionFor('12')!.spotId, 'A05');
    expect(service.activeSessionFor('13'), isNull);
    final prefs = service.preferencesOf(service.currentUserId);
    expect(prefs.preferredZones, ['A']);
    expect(prefs.preferredSpotId, 'A05');
    expect(prefs.paymentMethod, isA<CashPayment>());
    // 3000/h en fracciones de 15 min = $750.
    expect(service.tariffFor(VehicleType.car).pricePerFraction, 750);
  });

  test('el QR se firma con la clave del servidor y el contador de entradas/salidas', () {
    final now = DateTime(2026, 10, 5, 10);
    final code = AccessCode.parse(service.accessCodeFor('12', at: now))!;
    expect(code.vehicleId, '12');
    expect(code.counter, 1);
    expect(AccessCode.verify(code, key: 'secreto-del-servidor', now: now), AccessCodeStatus.valid);
  });

  test('las preferencias viajan con los ids del servidor', () async {
    service.toggleZone('M');
    await Future<void>.delayed(Duration.zero);
    final put = backend.requests.lastWhere((r) => r.method == 'PUT');
    expect(jsonDecode(put.body), {'preferredZoneIds': [1, 2], 'preferredSpotId': 105, 'paymentMethod': 'cash'});
  });

  test('el mensaje de error del servidor llega tal cual al formulario', () async {
    expect(await service.addVehicle(plate: 'xyz 789', type: VehicleType.car), 'La placa XYZ789 ya está registrada');
    // La validacion local responde sin ir al servidor.
    final before = backend.requests.length;
    expect(await service.addVehicle(plate: 'XX1', type: VehicleType.car), contains('Formato'));
    expect(backend.requests.length, before);
  });

  test('la terminal no se simula en el modo conectado', () {
    expect(service.handleScan('PQA1.12.1.0.0123456789abcdef'), isA<GateRejected>());
  });

  test('cada peticion lleva el token de acceso', () {
    final me = backend.requests.firstWhere((r) => r.url.path == '/api/me');
    expect(me.headers['Authorization'], 'Bearer acc');
  });
}
