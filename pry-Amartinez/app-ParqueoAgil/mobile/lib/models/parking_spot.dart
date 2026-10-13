/// Estado individual de un espacio de parqueo. `blocked` = el
/// administrador lo cerro (mantenimiento, reservado).
enum SpotStatus { free, occupied, expired, blocked }

/// Espacio individual. [row] y [column] son su posicion dentro de la
/// zona; el asignador automatico las usa para calcular distancias.
class ParkingSpot {
  final String id;
  final String zoneId;
  final int row;
  final int column;
  final SpotStatus status;

  const ParkingSpot({
    required this.id,
    required this.zoneId,
    required this.row,
    required this.column,
    required this.status,
  });

  ParkingSpot copyWith({SpotStatus? status}) {
    return ParkingSpot(
      id: id,
      zoneId: zoneId,
      row: row,
      column: column,
      status: status ?? this.status,
    );
  }
}
