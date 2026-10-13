import 'package:flutter/material.dart';
import 'vehicle.dart';

/// Representa una zona del parqueadero (A, B, C...) con su color
/// identificador, el piso donde esta, su posicion dentro del piso
/// (0 = la mas cercana a la entrada) y el tipo de vehiculo que recibe.
///
/// occupiedSpots y expiredSpots son solo los valores iniciales con
/// los que se generan los datos de ejemplo; los cupos libres reales
/// se calculan a partir de los espacios (ParkingService.freeSpotsIn).
class ParkingZone {
  final String id; // 'A', 'B', ...
  final String label; // 'Zona A'
  final Color color;
  final int floor;
  final int position;
  final int totalSpots;
  final VehicleType vehicleType;
  final int occupiedSpots;
  final int expiredSpots;

  const ParkingZone({
    required this.id,
    required this.label,
    required this.color,
    required this.floor,
    required this.position,
    required this.totalSpots,
    this.vehicleType = VehicleType.car,
    this.occupiedSpots = 0,
    this.expiredSpots = 0,
  });
}
