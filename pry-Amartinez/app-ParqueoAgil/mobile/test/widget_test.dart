import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:parqueoagil/main.dart';
import 'package:parqueoagil/services/api/session_store.dart';
import 'package:parqueoagil/services/payment_gateway.dart';
import 'support/fake_gate_backend.dart';
import 'support/sample_data.dart';

void main() {
  testWidgets('El conductor solo ve sus pantallas: QR, mapa, zonas, pago y perfil', (tester) async {
    final service = SampleData.createService(gateway: PaymentGatewaySimulator(latency: Duration.zero));
    await tester.pumpWidget(ParqueoAgilApp(service: service, enableCamera: false));
    await tester.pump();

    for (final tab in ['Mi QR', 'Mapa', 'Zonas', 'Pago', 'Perfil']) {
      expect(find.text(tab), findsOneWidget);
    }
    expect(find.textContaining('Estacionado en A05'), findsOneWidget);
    // Nada de la porteria ni del modo demo.
    expect(find.text('Abrir terminal con camara'), findsNothing);
    expect(find.byTooltip('Modo terminal (camara)'), findsNothing);
    expect(find.textContaining('modo demo'), findsNothing);
    expect(find.text('Lector de QR'), findsNothing);
  });

  group('Perfil lector de QR', () {
    late FakeGateBackend backend;

    Future<void> signIn(WidgetTester tester) async {
      // Pantalla de celular (1080 x 2400).
      tester.view.physicalSize = const Size(1080, 2400);
      tester.view.devicePixelRatio = 2.5;
      addTearDown(tester.view.reset);
      await tester
          .pumpWidget(ParqueoAgilApp(store: MemorySessionStore(), httpClient: backend.client, enableCamera: false));
      await tester.pumpAndSettle();
      expect(find.textContaining('modo demo'), findsNothing);
      await tester.enterText(find.byType(TextFormField).at(0), 'lector');
      await tester.enterText(find.byType(TextFormField).at(1), 'Lector123!');
      await tester.tap(find.text('Entrar'));
      await tester.pumpAndSettle();
    }

    Future<void> readCode(WidgetTester tester) async {
      await tester.enterText(find.byKey(const Key('codigo-manual')), 'PQA1.12.59707080.1.b4b18f78b8a980d6');
      await tester.tap(find.byTooltip('Validar codigo'));
      await tester.pumpAndSettle();
    }

    setUp(() => backend = FakeGateBackend());

    testWidgets('entra directo a la pantalla de leer QR, sin las pestanas del conductor', (tester) async {
      await signIn(tester);
      expect(find.text('Lector de QR'), findsOneWidget);
      expect(find.text('Mi QR'), findsNothing);
      expect(find.text('Mapa'), findsNothing);
    });

    testWidgets('entrada: muestra el espacio asignado', (tester) async {
      await signIn(tester);
      await readCode(tester);
      expect(find.text('Entrada permitida - barrera abierta'), findsOneWidget);
      expect(find.text('A05'), findsOneWidget);
      expect(find.text('Carlos Ruiz'), findsOneWidget);

      await tester.ensureVisible(find.text('Leer siguiente'));
      await tester.tap(find.text('Leer siguiente'));
      await tester.pumpAndSettle();
      expect(find.text('Apunta la camara al QR del conductor'), findsOneWidget);
    });

    testWidgets('salida con cobro automatico: cobra solo y abre la barrera', (tester) async {
      backend.scanResult = 'exit-auto';
      await signIn(tester);
      await readCode(tester);
      expect(find.text('Pago aprobado - barrera abierta'), findsOneWidget);
      expect(find.text('PA-000040'), findsOneWidget);
      expect(backend.requests.any((r) => r.url.path == '/api/tickets/40/auto-pay'), isTrue);
    });

    testWidgets('salida sin cobro automatico: el lector no cobra, avisa que es en caja', (tester) async {
      backend.scanResult = 'exit-cash';
      await signIn(tester);
      await readCode(tester);
      expect(find.text(r'Salida: $5.300'), findsOneWidget);
      expect(find.textContaining('cobra este valor en la caja'), findsOneWidget);
      expect(backend.requests.any((r) => r.url.path.endsWith('/auto-pay')), isFalse);
    });

    testWidgets('QR rechazado: muestra el motivo del servidor', (tester) async {
      backend.scanResult = 'QR vencido: pide al conductor el código actual de su app (cambia cada 30 s)';
      await signIn(tester);
      await readCode(tester);
      expect(find.text('Acceso negado'), findsOneWidget);
      expect(find.textContaining('QR vencido'), findsOneWidget);
    });
  });

  testWidgets('una cuenta que no es conductor ni lector no puede entrar', (tester) async {
    final backend = FakeGateBackend()..canScan = false;
    await tester
        .pumpWidget(ParqueoAgilApp(store: MemorySessionStore(), httpClient: backend.client, enableCamera: false));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextFormField).at(0), 'admin');
    await tester.enterText(find.byType(TextFormField).at(1), 'Admin123!');
    await tester.tap(find.text('Entrar'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Esta cuenta no puede usar la app'), findsOneWidget);
    expect(backend.requests.any((r) => r.url.path == '/api/sesion/logout'), isTrue);
  });
}
