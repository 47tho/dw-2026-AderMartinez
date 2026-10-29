import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:parqueoagil/services/api/api_client.dart';
import 'package:parqueoagil/services/api/session_store.dart';
import 'package:parqueoagil/services/gate_reader.dart';
import 'support/fake_gate_backend.dart';

void main() {
  late FakeGateBackend backend;
  late ApiClient api;
  late GateReader reader;

  setUp(() async {
    backend = FakeGateBackend();
    api = ApiClient(baseUrl: 'http://servidor/api', store: MemorySessionStore(), httpClient: backend.client);
    await api.login('lector', 'Lector123!');
    reader = GateReader(api);
  });

  test('una cuenta con permiso para leer QR abre el perfil de lector', () async {
    expect(await GateReader.canRead(api), isTrue);
    backend.canScan = false;
    expect(await GateReader.canRead(api), isFalse);
  });

  test('entrada: muestra el espacio que asigno el servidor', () async {
    final reading = await reader.scan('  PQA1.12.59707080.1.b4b18f78b8a980d6 ');
    expect(reading, isA<ReaderEntry>());
    final entry = reading as ReaderEntry;
    expect(entry.plate, 'ABC123');
    expect(entry.driverName, 'Carlos Ruiz');
    expect(entry.spotCode, 'A05');
    expect(entry.zoneName, 'Zona A');
    expect(entry.floor, 1);

    final sent = backend.requests.lastWhere((r) => r.url.path == '/api/gate/scan');
    expect(jsonDecode(sent.body), {'code': 'PQA1.12.59707080.1.b4b18f78b8a980d6'});
    expect(sent.headers['Authorization'], 'Bearer acceso');
  });

  test('salida con cobro automatico: trae la tarjeta y se cobra con auto-pay', () async {
    backend.scanResult = 'exit-auto';
    final exit = await reader.scan('PQA1.12.59707080.1.b4b18f78b8a980d6') as ReaderExit;
    expect(exit.total, 5300);
    expect(exit.fractions, 7);
    expect(exit.autoChargeCard, 'Visa •••• 4242');

    final payment = await reader.autoPay(exit.ticketId);
    expect(payment.reference, 'PA-000040');
    expect(payment.authorization, 'AUT123456');
    expect(backend.requests.last.url.path, '/api/tickets/40/auto-pay');
  });

  test('salida sin cobro automatico: no trae tarjeta (se cobra en el panel web)', () async {
    backend.scanResult = 'exit-cash';
    final exit = await reader.scan('PQA1.12.59707080.1.b4b18f78b8a980d6') as ReaderExit;
    expect(exit.autoChargeCard, isNull);
  });

  test('el error del servidor llega tal cual', () async {
    backend.scanResult = 'QR vencido: pide al conductor el código actual de su app (cambia cada 30 s)';
    expect(
      () => reader.scan('PQA1.12.1.1.b4b18f78b8a980d6'),
      throwsA(isA<ApiException>().having((e) => e.message, 'message', contains('QR vencido'))),
    );
  });
}
