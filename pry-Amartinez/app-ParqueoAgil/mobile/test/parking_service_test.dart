import 'package:flutter_test/flutter_test.dart';
import 'package:parqueoagil/models/parking_spot.dart';
import 'package:parqueoagil/models/payment_method.dart';
import 'package:parqueoagil/models/vehicle.dart';
import 'package:parqueoagil/services/access_code.dart';
import 'package:parqueoagil/services/parking_service.dart';
import 'package:parqueoagil/services/payment_gateway.dart';
import 'support/sample_data.dart';

void main() {
  late DateTime now;
  late ParkingService service;

  setUp(() {
    now = DateTime(2026, 10, 5, 10, 0, 0);
    service = SampleData.createService(
      gateway: PaymentGatewaySimulator(latency: Duration.zero),
      clock: () => now,
    );
  });

  group('Estado del conductor', () {
    test('el vehiculo que esta dentro ocupa su espacio', () {
      expect(service.activeSessionFor('v1')!.spotId, 'A05');
      expect(service.spots.firstWhere((s) => s.id == 'A05').status, SpotStatus.occupied);
      expect(service.activeSessionFor('v2'), isNull);
    });

    test('el QR va firmado con la clave del conductor y cambia cada 30 s', () {
      final code = AccessCode.parse(service.accessCodeFor('v2'))!;
      expect(code.vehicleId, 'v2');
      expect(AccessCode.verify(code, key: 'demo-clave-u1-parqueoagil', now: now), AccessCodeStatus.valid);
      expect(AccessCode.verify(code, key: 'otra-clave', now: now), AccessCodeStatus.badSignature);
      expect(service.accessCodeFor('v2', at: now.add(const Duration(seconds: 30))), isNot(service.accessCodeFor('v2')));
    });

    test('maximo 3 zonas preferidas, en orden de prioridad', () {
      service.toggleZone('C');
      service.toggleZone('D');
      expect(service.preferencesOf('u1').preferredZones, ['A', 'B', 'C']);
      service.toggleZone('A');
      service.toggleZone('D');
      expect(service.preferencesOf('u1').preferredZones, ['B', 'C', 'D']);
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

    test('corregir la placa no rompe la identidad: el QR sigue siendo del mismo vehiculo', () async {
      final v2 = service.vehicleById('v2')!;
      expect(await service.updateVehicle(v2.copyWith(plate: 'XYZ788')), isNull);
      expect(AccessCode.parse(service.accessCodeFor('v2'))!.vehicleId, 'v2');
      expect(service.vehicleById('v2')!.plate, 'XYZ788');
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
