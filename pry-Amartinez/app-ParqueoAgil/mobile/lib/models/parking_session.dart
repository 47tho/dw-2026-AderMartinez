import 'tariff.dart';
import 'vehicle.dart';

/// Representa la sesion de parqueo de un vehiculo: desde que la
/// terminal lee su QR de entrada hasta que se paga la salida.
class ParkingSession {
  final String id;
  final Vehicle vehicle; // copia del vehiculo al momento de entrar
  final String spotId;
  final DateTime entryTime;
  DateTime? exitTime;

  ParkingSession({
    required this.id,
    required this.vehicle,
    required this.spotId,
    required this.entryTime,
  });

  bool get isActive => exitTime == null;

  Duration elapsedAt(DateTime now) => (exitTime ?? now).difference(entryTime);

  Duration get elapsed => elapsedAt(DateTime.now());

  /// Costo segun el tiempo transcurrido y la tarifa (por fracciones).
  int cost(Tariff tariff) => tariff.amountFor(elapsed);

  String get formattedElapsed => formatDuration(elapsed);
}

String formatDuration(Duration d) {
  final h = d.inHours;
  final m = d.inMinutes.remainder(60);
  final s = d.inSeconds.remainder(60);
  if (h > 0) return '${h}h ${m}m';
  return '${m}m ${s}s';
}
