import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:parqueoagil/models/parking_spot.dart';
import 'package:parqueoagil/models/parking_zone.dart';
import 'package:parqueoagil/models/vehicle.dart';
import 'package:parqueoagil/services/spot_assigner.dart';

/// Parqueadero de prueba: zonas A y B en el piso 1, C en el piso 2.
/// Cada zona tiene 2 filas x 3 columnas (ids A01..A06).
const zones = [
  ParkingZone(id: 'A', label: 'Zona A', color: Colors.blue, floor: 1, position: 0, totalSpots: 6),
  ParkingZone(id: 'B', label: 'Zona B', color: Colors.purple, floor: 1, position: 1, totalSpots: 6),
  ParkingZone(id: 'C', label: 'Zona C', color: Colors.orange, floor: 2, position: 0, totalSpots: 6),
];

List<ParkingSpot> buildSpots({Set<String> occupied = const {}}) {
  return [
    for (final zone in zones)
      for (var i = 0; i < 6; i++)
        ParkingSpot(
          id: '${zone.id}0${i + 1}',
          zoneId: zone.id,
          row: i ~/ 3,
          column: i % 3,
          status: occupied.contains('${zone.id}0${i + 1}') ? SpotStatus.occupied : SpotStatus.free,
        ),
  ];
}

Set<String> allOf(String zoneId) => {for (var i = 1; i <= 6; i++) '${zoneId}0$i'};

void main() {
  const assigner = SpotAssigner(zones);

  test('asigna el espacio preferido si esta libre', () {
    final result = assigner.assign(spots: buildSpots(), preferredZones: ['B'], preferredSpotId: 'A05');
    expect(result!.spot.id, 'A05');
  });

  test('si el preferido esta ocupado, el libre mas cercano en su misma zona', () {
    // A05 = fila 1, col 1. A02 (fila 0, col 1) y A04/A06 estan a distancia 1.
    final result = assigner.assign(
      spots: buildSpots(occupied: {'A05', 'A02', 'A04'}),
      preferredZones: ['B'],
      preferredSpotId: 'A05',
    );
    expect(result!.spot.id, 'A06');
  });

  test('si la zona del preferido esta llena, pasa a la siguiente zona preferida', () {
    final result = assigner.assign(
      spots: buildSpots(occupied: allOf('A')),
      preferredZones: ['C', 'B'],
      preferredSpotId: 'A05',
    );
    expect(result!.spot.zoneId, 'C');
  });

  test('respeta el orden de prioridad de las zonas', () {
    final result = assigner.assign(spots: buildSpots(), preferredZones: ['B', 'A']);
    expect(result!.spot.id, 'B01'); // entrada de la zona B
  });

  test('si todas sus zonas estan llenas, el libre mas cercano (prefiere mismo piso)', () {
    final result = assigner.assign(
      spots: buildSpots(occupied: allOf('A')),
      preferredZones: ['A'],
      preferredSpotId: 'A01',
    );
    // B esta en el mismo piso que A; C esta en otro piso.
    expect(result!.spot.zoneId, 'B');
  });

  test('sin preferencias, el mas cercano a la entrada principal', () {
    final result = assigner.assign(spots: buildSpots(occupied: {'A01'}), preferredZones: []);
    expect(['A02', 'A04'], contains(result!.spot.id));
  });

  test('ignora zonas preferidas que no existen', () {
    final result = assigner.assign(spots: buildSpots(), preferredZones: ['Z', 'B']);
    expect(result!.spot.zoneId, 'B');
  });

  test('devuelve null si el parqueadero esta lleno', () {
    final full = {...allOf('A'), ...allOf('B'), ...allOf('C')};
    expect(assigner.assign(spots: buildSpots(occupied: full), preferredZones: ['A']), isNull);
  });

  test('las motos solo van a zonas de motos, ignorando las preferencias del carro', () {
    const withMotos = SpotAssigner([
      ...zones,
      ParkingZone(id: 'M', label: 'Motos', color: Colors.grey, floor: 1, position: 2, totalSpots: 6, vehicleType: VehicleType.motorcycle),
    ]);
    final spots = [
      ...buildSpots(),
      for (var i = 0; i < 6; i++)
        ParkingSpot(id: 'M0${i + 1}', zoneId: 'M', row: i ~/ 3, column: i % 3, status: i == 0 ? SpotStatus.occupied : SpotStatus.free),
    ];
    final moto = withMotos.assign(spots: spots, preferredZones: ['A'], preferredSpotId: 'A01', vehicleType: VehicleType.motorcycle);
    expect(moto!.spot.id, 'M02');
    final car = withMotos.assign(spots: spots, preferredZones: [], vehicleType: VehicleType.car);
    expect(car!.spot.zoneId, isNot('M'));
  });

  test('nunca asigna un espacio vencido u ocupado', () {
    final spots = buildSpots(occupied: {'A01'})
      ..[1] = buildSpots()[1].copyWith(status: SpotStatus.expired); // A02 vencido
    final result = assigner.assign(spots: spots, preferredZones: ['A'], preferredSpotId: 'A02');
    expect(result!.spot.status, SpotStatus.free);
    expect(['A01', 'A02'], isNot(contains(result.spot.id)));
  });
}
