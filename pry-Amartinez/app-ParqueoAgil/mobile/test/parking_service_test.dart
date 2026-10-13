import 'package:flutter_test/flutter_test.dart';
import 'package:parqueoagil/data/mock_data.dart';
import 'package:parqueoagil/models/parking_spot.dart';
import 'package:parqueoagil/models/payment_method.dart';
import 'package:parqueoagil/models/vehicle.dart';
import 'package:parqueoagil/services/parking_service.dart';
import 'package:parqueoagil/services/payment_gateway.dart';

void main() {
  late DateTime now;
  late ParkingService service;

  setUp(() {
    now = DateTime(2026, 10, 5, 10, 0, 0);
    service = MockData.createService(
      gateway: PaymentGatewaySimulator(latency: Duration.zero),
      clock: () => now,
    );
  });

  ParkingSpot spot(String id) => service.spots.firstWhere((s) => s.id == id);

  group('Entrada', () {
    test('identifica al usuario, asigna espacio y lo marca ocupado', () {
      final result = service.handleScan(service.accessCodeFor('v2'));
      expect(result, isA<GateEntry>());
      final entry = result as GateEntry;
      expect(entry.user.name, 'Carlos Ruiz');
      expect(entry.vehicle.plate, 'XYZ789');
      expect(['A', 'B'], contains(entry.zone.id)); // sus zonas preferidas
      expect(spot(entry.session.spotId).status, SpotStatus.occupied);
      expect(service.activeSessionFor('v2'), isNotNull);
    });

    test('la moto va a la zona de motos', () {
      final entry = service.handleScan(service.accessCodeFor('v3')) as GateEntry;
      expect(entry.zone.id, 'M');
      expect(entry.vehicle.type, VehicleType.motorcycle);
    });

    test('entrar y salir de inmediato funciona: tras entrar la app muestra un QR nuevo', () {
      final entryCode = service.accessCodeFor('v2');
      expect(service.handleScan(entryCode), isA<GateEntry>());
      final exitCode = service.accessCodeFor('v2'); // misma ventana de 30 s
      expect(exitCode, isNot(entryCode));
      expect(service.handleScan(exitCode), isA<GateExit>());
    });

    test('el mismo QR no se puede usar dos veces', () {
      final code = service.accessCodeFor('v2');
      service.handleScan(code);
      final second = service.handleScan(code);
      expect((second as GateRejected).title, 'QR ya usado');
    });

    test('rechaza QR alterados, vencidos o de otras apps', () {
      final code = service.accessCodeFor('v2');
      final tampered = '${code.substring(0, code.length - 1)}${code.endsWith('0') ? '1' : '0'}';
      final old = service.accessCodeFor('v2', at: now.subtract(const Duration(minutes: 2)));

      expect((service.handleScan(tampered) as GateRejected).title, 'QR falsificado o alterado');
      expect((service.handleScan(old) as GateRejected).title, 'QR vencido');
      expect((service.handleScan('https://www.ejemplo.com') as GateRejected).title, 'Este QR no es de ParqueoAgil');
      expect(service.activeSessionFor('v2'), isNull);
    });
  });

  group('Salida y pago', () {
    test('cotiza por fracciones y cobra en efectivo con cambio', () async {
      // v1 entro hace exactamente 1h 30m = 6 fracciones de $1.250
      final exit = service.handleScan(service.accessCodeFor('v1')) as GateExit;
      expect(exit.quote.fractions, 6);
      expect(exit.quote.total, 7500);
      final spotId = exit.quote.session.spotId;

      final short = await service.pay(exit, CashPayment(), cashReceived: 5000);
      expect(short.outcome.approved, isFalse);
      expect(service.activeSessionFor('v1'), isNotNull);

      final ok = await service.pay(exit, CashPayment(), cashReceived: 10000);
      expect(ok.outcome.approved, isTrue);
      expect(ok.receipt!.change, 2500);
      expect(service.activeSessionFor('v1'), isNull);
      expect(spot(spotId).status, SpotStatus.free);
      expect(service.receiptsOf('u1'), hasLength(1));
    });

    test('el valor queda fijo al leer el QR aunque el pago tarde', () async {
      final exit = service.handleScan(service.accessCodeFor('v1')) as GateExit;
      now = now.add(const Duration(minutes: 20));
      final result = await service.pay(exit, CardPayment());
      expect(result.receipt!.total, 7500);
    });

    test('cobro automatico rechazado y luego pago con tarjeta en caja', () async {
      final declining = PaymentGatewaySimulator.testCards.firstWhere((c) => c.declines);
      await service.addCard(declining);
      service.setPaymentMethod(AutoChargePayment());

      final exit = service.handleScan(service.accessCodeFor('v1')) as GateExit;
      final failed = await service.pay(exit, AutoChargePayment());
      expect(failed.outcome.approved, isFalse);
      expect(failed.outcome.error, contains('rechazada'));
      expect(service.activeSessionFor('v1'), isNotNull);

      final ok = await service.pay(exit, CardPayment());
      expect(ok.outcome.approved, isTrue);
    });

    test('cobro automatico aprobado guarda la tarjeta en el recibo', () async {
      await service.addCard(PaymentGatewaySimulator.testCards.first);
      final exit = service.handleScan(service.accessCodeFor('v1')) as GateExit;
      final result = await service.pay(exit, AutoChargePayment());
      expect(result.receipt!.cardLabel, 'Visa •••• 4242');
    });

    test('no se puede pagar dos veces la misma salida', () async {
      final exit = service.handleScan(service.accessCodeFor('v1')) as GateExit;
      await service.pay(exit, CardPayment());
      final again = await service.pay(exit, CardPayment());
      expect(again.outcome.approved, isFalse);
      expect(service.receiptsOf('u1'), hasLength(1));
    });
  });

  group('Perfil y vehiculos', () {
    test('no se puede cambiar la placa de un vehiculo que esta dentro', () async {
      final v1 = service.vehicleById('v1')!;
      expect(await service.updateVehicle(v1.copyWith(plate: 'AAA111')), isNotNull);
      expect(await service.updateVehicle(v1.copyWith(description: 'Mazda 3 rojo')), isNull);
      expect(service.vehicleById('v1')!.description, 'Mazda 3 rojo');
    });

    test('valida formato de placa y evita duplicados', () async {
      expect(await service.addVehicle(plate: 'abc 123', type: VehicleType.car), contains('ya esta registrada'));
      expect(await service.addVehicle(plate: 'XX1', type: VehicleType.car), contains('Formato'));
      expect(await service.addVehicle(plate: 'ABC12D', type: VehicleType.car), contains('Formato'));
      expect(await service.addVehicle(plate: 'jkl34m', type: VehicleType.motorcycle), isNull);
      expect(service.vehiclesOf('u1').map((v) => v.plate), contains('JKL34M'));
    });

    test('corregir la placa no rompe la identidad: el QR sigue funcionando', () async {
      final v2 = service.vehicleById('v2')!;
      expect(await service.updateVehicle(v2.copyWith(plate: 'XYZ788')), isNull);
      final entry = service.handleScan(service.accessCodeFor('v2')) as GateEntry;
      expect(entry.vehicle.plate, 'XYZ788');
    });

    test('quitar la tarjeta desactiva el cobro automatico', () async {
      await service.addCard(PaymentGatewaySimulator.testCards.first);
      service.setPaymentMethod(AutoChargePayment());
      service.removeCard();
      final prefs = service.preferencesOf('u1');
      expect(prefs.savedCard, isNull);
      expect(prefs.paymentMethod, isA<CashPayment>());
    });
  });
}
