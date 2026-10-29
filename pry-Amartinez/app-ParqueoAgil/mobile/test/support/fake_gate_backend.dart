import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

/// Servidor falso para el perfil LECTOR: inicio de sesion, permisos y
/// lectura del QR, con las mismas respuestas que el backend.
class FakeGateBackend {
  final requests = <http.Request>[];

  /// Que responde `POST /gate/scan`: 'entry', 'exit-auto', 'exit-cash' o un
  /// mensaje de error (responde 410 con ese mensaje).
  String scanResult = 'entry';

  /// true = la cuenta es de conductor (`GET /me` responde 200).
  bool isDriver = false;

  /// true = la cuenta puede leer QR (permiso POST /api/gate/scan).
  bool canScan = true;

  late final MockClient client = MockClient((request) async {
    requests.add(request);
    final path = request.url.path.replaceFirst('/api', '');
    return switch ((request.method, path)) {
      ('POST', '/sesion/login') => _ok({
          'access_token': 'acceso',
          'token_type': 'Bearer',
          'expires_in': 900,
          'refresh_token': 'refresco',
          'refresh_expires_in': 604800,
        }),
      ('POST', '/sesion/logout') => _ok({'message': 'Sesión cerrada'}),
      // Como el backend real: el LECTOR no tiene permiso sobre /me (403); el
      // personal sin rol de lector si lo tiene, pero no tiene perfil (404).
      ('GET', '/me') => isDriver
          ? _ok(_me)
          : canScan
              ? _error(403, 'Acceso denegado: sin concesión para GET /api/me')
              : _error(404, 'Esta cuenta no tiene perfil de conductor'),
      ('GET', '/permisos') => _ok({
          'permissions': [
            if (canScan) {'method': 'POST', 'path': '/api/gate/scan', 'role_name': 'LECTOR'},
            if (canScan) {'method': 'POST', 'path': '/api/tickets/:id/auto-pay', 'role_name': 'LECTOR'},
          ],
        }),
      ('POST', '/gate/scan') => switch (scanResult) {
          'entry' => _ok(_entry),
          'exit-auto' => _ok(_exit(autoCharge: true)),
          'exit-cash' => _ok(_exit(autoCharge: false)),
          final message => _error(410, message),
        },
      ('POST', '/tickets/40/auto-pay') => _ok({
          'id': 40,
          'total': 5300,
          'status': 'closed',
          'paymentRef': 'PA-000040',
          'authorization': 'AUT123456',
        }),
      _ => _error(404, 'Ruta no encontrada: ${request.method} $path'),
    };
  });

  static http.Response _ok(Object data) => http.Response.bytes(
        utf8.encode(jsonEncode({'statusCode': 200, 'message': 'OK', 'data': data})),
        200,
        headers: {'content-type': 'application/json; charset=utf-8'},
      );

  static http.Response _error(int status, String message) => http.Response.bytes(
        utf8.encode(jsonEncode({'statusCode': status, 'message': message})),
        status,
        headers: {'content-type': 'application/json; charset=utf-8'},
      );

  static const _vehicle = {
    'id': 12,
    'plate': 'ABC123',
    'vehicleTypeId': 1,
    'kind': 'car',
    'description': 'Mazda 3 gris',
    'gateCounter': 1,
  };

  static const _entry = {
    'kind': 'entry',
    'ticket': {'id': 40, 'entryAt': '2026-10-05T15:00:00.000Z', 'status': 'open'},
    'vehicle': _vehicle,
    'driverName': 'Carlos Ruiz',
    'spot': {'id': 105, 'code': 'A05', 'zoneId': 1, 'row': 0, 'column': 4, 'status': 'occupied'},
    'zone': {'id': 1, 'name': 'Zona A - Piso 1', 'code': 'A', 'floor': 1},
    'reason': 'Tu espacio preferido A05 estaba libre.',
  };

  static Map<String, dynamic> _exit({required bool autoCharge}) => {
        'kind': 'exit',
        'ticket': {'id': 40, 'entryAt': '2026-10-05T15:00:00.000Z', 'status': 'open'},
        'vehicle': _vehicle,
        'driverName': 'Carlos Ruiz',
        'quote': {
          'minutes': 91,
          'fractions': 7,
          'minutesPerFraction': 15,
          'pricePerFraction': 750,
          'subtotal': 5250,
          'total': 5300,
          'quotedAt': '2026-10-05T16:31:00.000Z',
        },
        'preferredPaymentMethod': autoCharge ? 'auto' : 'cash',
        'savedCard': autoCharge ? {'label': 'Visa •••• 4242'} : null,
      };

  static const _me = {
    'user': {'id': 7, 'username': 'carlos', 'email': 'carlos@correo.com'},
    'driver': {
      'id': 3,
      'clientId': 9,
      'name': 'Carlos Ruiz',
      'phone': '3001234567',
      'docType': 'CC',
      'docNumber': '1023456789',
      'qrSecret': 'secreto-del-servidor',
      'preferredZoneIds': <int>[],
      'preferredSpotId': null,
      'paymentMethod': 'cash',
      'card': null,
    },
    'vehicles': <Object>[],
    'vehicleTypes': [
      {'id': 1, 'name': 'Automóvil', 'kind': 'car', 'hourlyRate': 3000},
    ],
  };
}
