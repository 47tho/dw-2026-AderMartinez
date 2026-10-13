import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:parqueoagil/data/mock_data.dart';
import 'package:parqueoagil/main.dart';
import 'package:parqueoagil/services/payment_gateway.dart';

void main() {
  testWidgets('Flujo completo: QR del usuario -> terminal -> pago en efectivo', (tester) async {
    await tester.binding.setSurfaceSize(const Size(430, 1600));
    addTearDown(() => tester.binding.setSurfaceSize(null));

    final now = DateTime(2026, 10, 5, 10, 0, 0);
    final service = MockData.createService(
      gateway: PaymentGatewaySimulator(latency: Duration.zero),
      clock: () => now,
    );
    await tester.pumpWidget(ParqueoAgilApp(service: service, enableCamera: false));

    // Pantalla Mi QR: el vehiculo que esta dentro y su QR de salida.
    expect(find.text('ParqueoÁgil'), findsOneWidget);
    expect(find.text('DENTRO'), findsOneWidget);
    expect(find.textContaining('Estacionado en '), findsOneWidget);
    expect(find.text('Muestra este codigo en la terminal de SALIDA'), findsOneWidget);

    // Simular que la terminal lee el QR.
    await tester.tap(find.text('Simular lectura en la terminal (salida)'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 600));

    expect(find.text('Salida: cobrar \$7.500'), findsOneWidget);
    expect(find.textContaining('Carlos Ruiz'), findsOneWidget);

    await tester.tap(find.text('Exacto \$7.500'));
    await tester.pump();
    await tester.tap(find.text('Registrar pago en efectivo'));
    await tester.pump();
    await tester.pump();

    expect(find.text('Pago aprobado - barrera abierta'), findsOneWidget);
    expect(find.text('PA-00001'), findsOneWidget);

    await tester.tap(find.text('Volver a la app'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 600));

    expect(find.text('FUERA'), findsOneWidget);
    expect(find.text('Muestra este codigo en la terminal de ENTRADA'), findsOneWidget);
  });
}
