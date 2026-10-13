import '../models/parking_spot.dart';
import '../models/parking_zone.dart';
import '../models/vehicle.dart';

/// Resultado de una asignacion: el espacio y una explicacion corta
/// que se le muestra al usuario (por que le toco ese espacio).
class SpotAssignment {
  final ParkingSpot spot;
  final String reason;

  const SpotAssignment(this.spot, this.reason);
}

/// Asigna automaticamente un espacio al ingresar, segun las reglas:
///   1. El espacio preferido del usuario, si esta libre.
///   2. Si no, el libre mas cercano dentro de sus zonas preferidas,
///      recorriendolas en orden de prioridad (la zona del espacio
///      preferido siempre va primero).
///   3. Si todas sus zonas estan llenas, el libre mas cercano en
///      cualquier otra zona.
/// "Cercano" se mide desde el espacio preferido o, si no eligio uno,
/// desde la entrada de su zona de mayor prioridad (o la entrada
/// principal si no tiene preferencias). Solo se consideran las zonas
/// del tipo de vehiculo (las motos van a sus zonas, aunque el usuario
/// tenga preferencias para su carro). Devuelve null si no hay ningun
/// espacio libre.
class SpotAssigner {
  /// Cambiar de piso "cuesta" lo mismo que recorrer esta cantidad
  /// de espacios, para preferir quedarse en el mismo piso.
  static const floorPenalty = 30;

  /// Separacion (en filas) entre zonas consecutivas del mismo piso.
  /// En produccion cada espacio tendria coordenadas reales cargadas
  /// desde el panel web del administrador.
  static const zoneGap = 10;

  final List<ParkingZone> zones;

  const SpotAssigner(this.zones);

  SpotAssignment? assign({
    required List<ParkingSpot> spots,
    required List<String> preferredZones,
    String? preferredSpotId,
    VehicleType vehicleType = VehicleType.car,
  }) {
    final allowedZones = {for (final z in zones) if (z.vehicleType == vehicleType) z.id};
    final usable = spots.where((s) => allowedZones.contains(s.zoneId)).toList();

    final free = usable.where((s) => s.status == SpotStatus.free).toList();
    if (free.isEmpty) return null;

    final preferred = usable.where((s) => s.id == preferredSpotId).firstOrNull;
    if (preferred != null && preferred.status == SpotStatus.free) {
      return SpotAssignment(preferred, 'Tu espacio preferido ${preferred.id} estaba libre.');
    }

    final zoneOrder = [
      if (preferred != null) preferred.zoneId,
      ...preferredZones.where((z) => z != preferred?.zoneId && allowedZones.contains(z)),
    ];
    final reference = preferred != null
        ? _positionOf(preferred)
        : _entranceOf(zoneOrder.isEmpty ? null : zoneOrder.first, vehicleType);

    for (final zoneId in zoneOrder) {
      final candidates = free.where((s) => s.zoneId == zoneId).toList();
      if (candidates.isEmpty) continue;
      return SpotAssignment(
        _closest(candidates, reference),
        _reasonForPreferredZone(zoneId, zoneOrder.first, preferred),
      );
    }

    return SpotAssignment(
      _closest(free, reference),
      zoneOrder.isEmpty
          ? (vehicleType == VehicleType.motorcycle
              ? 'Espacio libre mas cercano en la zona de motos.'
              : 'Espacio libre mas cercano a la entrada.')
          : 'Tus zonas preferidas estan llenas. Te asignamos el espacio libre mas cercano.',
    );
  }

  String _reasonForPreferredZone(String zoneId, String firstZoneId, ParkingSpot? preferred) {
    if (preferred != null && zoneId == preferred.zoneId) {
      return 'Tu espacio ${preferred.id} estaba ocupado. Este es el libre mas cercano en la Zona $zoneId.';
    }
    if (zoneId == firstZoneId) {
      return 'Espacio libre mas cercano a la entrada de tu zona preferida (Zona $zoneId).';
    }
    return 'La Zona $firstZoneId estaba llena. Te asignamos tu siguiente zona preferida (Zona $zoneId).';
  }

  ParkingSpot _closest(List<ParkingSpot> candidates, _Point reference) {
    return candidates.reduce((a, b) =>
        _distance(_positionOf(a), reference) <= _distance(_positionOf(b), reference) ? a : b);
  }

  ParkingZone? _zoneOrNull(String id) => zones.where((z) => z.id == id).firstOrNull;

  _Point _positionOf(ParkingSpot spot) {
    final zone = _zoneOrNull(spot.zoneId);
    if (zone == null) return _Point(0, spot.row, spot.column);
    return _Point(zone.floor, zone.position * zoneGap + spot.row, spot.column);
  }

  /// Entrada de una zona; sin zona, la de la primera zona (piso mas
  /// bajo, mas cerca de la entrada) que recibe ese tipo de vehiculo.
  _Point _entranceOf(String? zoneId, VehicleType vehicleType) {
    var zone = zoneId == null ? null : _zoneOrNull(zoneId);
    if (zone == null) {
      final candidates = zones.where((z) => z.vehicleType == vehicleType).toList()
        ..sort((a, b) => a.floor != b.floor ? a.floor - b.floor : a.position - b.position);
      if (candidates.isEmpty) return const _Point(1, 0, 0);
      zone = candidates.first;
    }
    return _Point(zone.floor, zone.position * zoneGap, 0);
  }

  int _distance(_Point a, _Point b) {
    return (a.floor - b.floor).abs() * floorPenalty + (a.y - b.y).abs() + (a.x - b.x).abs();
  }
}

class _Point {
  final int floor;
  final int y;
  final int x;

  const _Point(this.floor, this.y, this.x);
}
