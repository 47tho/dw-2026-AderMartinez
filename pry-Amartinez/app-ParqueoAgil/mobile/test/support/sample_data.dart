import 'dart:math';
import 'package:flutter/material.dart';
import 'package:parqueoagil/models/parking_session.dart';
import 'package:parqueoagil/models/parking_zone.dart';
import 'package:parqueoagil/models/parking_spot.dart';
import 'package:parqueoagil/models/payment_method.dart';
import 'package:parqueoagil/models/tariff.dart';
import 'package:parqueoagil/models/user_account.dart';
import 'package:parqueoagil/models/vehicle.dart';
import 'package:parqueoagil/services/parking_service.dart';
import 'package:parqueoagil/services/payment_gateway.dart';

/// Datos de ejemplo para las pruebas automaticas: un parqueadero con
/// zonas y espacios, y un conductor con tres vehiculos. En la app estos
/// datos vienen del servidor.
class SampleData {
  /// Carro: $1.250 cada 15 minutos ($5.000 la hora), aproximado a $100.
  static const carTariff = Tariff(pricePerFraction: 1250);

  /// Moto: $500 cada 15 minutos ($2.000 la hora).
  static const motorcycleTariff = Tariff(pricePerFraction: 500);

  static const int spotsPerRow = 6;

  static const List<ParkingZone> zones = [
    ParkingZone(
        id: 'A',
        label: 'Zona A',
        color: Color(0xFF3B82F6),
        floor: 1,
        position: 0,
        totalSpots: 40,
        occupiedSpots: 17,
        expiredSpots: 2),
    ParkingZone(
        id: 'B', label: 'Zona B', color: Color(0xFF9333EA), floor: 1, position: 1, totalSpots: 24, occupiedSpots: 11),
    ParkingZone(
        id: 'C',
        label: 'Zona C',
        color: Color(0xFFEA580C),
        floor: 1,
        position: 2,
        totalSpots: 24,
        occupiedSpots: 7,
        expiredSpots: 2),
    ParkingZone(
        id: 'M',
        label: 'Zona M (motos)',
        color: Color(0xFF64748B),
        floor: 1,
        position: 3,
        totalSpots: 30,
        occupiedSpots: 18,
        vehicleType: VehicleType.motorcycle),
    ParkingZone(
        id: 'D', label: 'Zona D', color: Color(0xFF16A34A), floor: 2, position: 0, totalSpots: 24, occupiedSpots: 24),
    ParkingZone(
        id: 'E',
        label: 'Zona E',
        color: Color(0xFFDB2777),
        floor: 2,
        position: 1,
        totalSpots: 24,
        occupiedSpots: 22,
        expiredSpots: 2),
    ParkingZone(
        id: 'F', label: 'Zona F', color: Color(0xFF0D9488), floor: 2, position: 2, totalSpots: 24, occupiedSpots: 24),
  ];

  /// Estado de ejemplo: un conductor con tres vehiculos, el primero ya
  /// parqueado en el espacio A05 hace 1h 30m.
  static ParkingService createService({PaymentGatewaySimulator? gateway, DateTime Function()? clock}) {
    final user = UserAccount(
      id: 'u1',
      name: 'Carlos Ruiz',
      docNumber: '1023456789',
      phone: '3001234567',
      // Solo para las pruebas: en la app la clave la entrega el servidor.
      accessKey: 'demo-clave-u1-parqueoagil',
    );
    final now = (clock ?? DateTime.now)();
    const parked = Vehicle(id: 'v1', ownerId: 'u1', plate: 'ABC123', description: 'Mazda 3 gris');
    return ParkingService(
      zones: zones,
      spots: [for (final zone in zones) ..._generateSpots(zone)],
      users: [user],
      vehicles: const [
        parked,
        Vehicle(id: 'v2', ownerId: 'u1', plate: 'XYZ789', description: 'Renault Logan blanco'),
        Vehicle(
            id: 'v3', ownerId: 'u1', plate: 'QWE12F', type: VehicleType.motorcycle, description: 'Yamaha NMAX negra'),
      ],
      tariffs: const {VehicleType.car: carTariff, VehicleType.motorcycle: motorcycleTariff},
      currentUserId: user.id,
      preferences: {
        user.id: UserPreferences(preferredZones: ['A', 'B'], preferredSpotId: 'A05', paymentMethod: CashPayment()),
      },
      activeSessions: [
        ParkingSession(
            id: 'S0001',
            vehicle: parked,
            spotId: 'A05',
            entryTime: now.subtract(const Duration(hours: 1, minutes: 30))),
      ],
      gateway: gateway,
      clock: clock,
    );
  }

  /// Reparte los ocupados/vencidos de forma "aleatoria" pero siempre
  /// igual (semilla fija), para que el mapa se vea realista.
  static List<ParkingSpot> _generateSpots(ParkingZone zone) {
    final order = List<int>.generate(zone.totalSpots, (i) => i)..shuffle(Random(zone.id.codeUnitAt(0)));
    final statusByIndex = <int, SpotStatus>{};
    for (var k = 0; k < order.length; k++) {
      if (k < zone.occupiedSpots) {
        statusByIndex[order[k]] = SpotStatus.occupied;
      } else if (k < zone.occupiedSpots + zone.expiredSpots) {
        statusByIndex[order[k]] = SpotStatus.expired;
      } else {
        statusByIndex[order[k]] = SpotStatus.free;
      }
    }
    return [
      for (var i = 0; i < zone.totalSpots; i++)
        ParkingSpot(
          id: '${zone.id}${(i + 1).toString().padLeft(2, '0')}',
          zoneId: zone.id,
          row: i ~/ spotsPerRow,
          column: i % spotsPerRow,
          status: statusByIndex[i]!,
        ),
    ];
  }
}
