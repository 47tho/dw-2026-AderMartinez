import 'vehicle.dart';

/// Recibo digital que reemplaza al tiquete de papel. Se genera cuando
/// el pago de la salida queda aprobado.
class Receipt {
  final String reference;
  final String userId;
  final String plate;
  final VehicleType vehicleType;
  final String spotId;
  final DateTime entryTime;
  final DateTime exitTime;
  final int fractions;
  final int minutesPerFraction;
  final int pricePerFraction;
  final int subtotal;
  final int total;
  final String methodName;
  final String? cardLabel;
  final String? authorization;
  final int? cashReceived;

  const Receipt({
    required this.reference,
    required this.userId,
    required this.plate,
    required this.vehicleType,
    required this.spotId,
    required this.entryTime,
    required this.exitTime,
    required this.fractions,
    required this.minutesPerFraction,
    required this.pricePerFraction,
    required this.subtotal,
    required this.total,
    required this.methodName,
    this.cardLabel,
    this.authorization,
    this.cashReceived,
  });

  int? get change => cashReceived == null ? null : cashReceived! - total;

  Duration get duration => exitTime.difference(entryTime);
}
