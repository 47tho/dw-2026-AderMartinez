import 'tariff.dart';

/// Aviso para el conductor cuando la porteria registra algo de uno de sus
/// vehiculos. Llega por el tiempo real (eventos ticket.* del servidor).
sealed class TicketNotice {
  final String plate;
  final DateTime entryTime;

  const TicketNotice(this.plate, this.entryTime);
}

/// El vehiculo entro: el servidor asigno el espacio.
class EntryNotice extends TicketNotice {
  final String spotId;

  /// Codigo de la zona ('A'), o null si la app no la conoce.
  final String? zoneId;
  final Tariff tariff;

  const EntryNotice({
    required String plate,
    required DateTime entryTime,
    required this.spotId,
    required this.zoneId,
    required this.tariff,
  }) : super(plate, entryTime);
}

/// Se leyo el QR de salida: el valor quedo fijo en ese momento.
class ExitQuoteNotice extends TicketNotice {
  final DateTime quotedAt;
  final int fractions;
  final int total;

  /// Tarjeta del cobro automatico ("Visa •••• 4242"); null = paga en la caja.
  final String? autoChargeCard;

  const ExitQuoteNotice({
    required String plate,
    required DateTime entryTime,
    required this.quotedAt,
    required this.fractions,
    required this.total,
    required this.autoChargeCard,
  }) : super(plate, entryTime);

  Duration get duration => quotedAt.difference(entryTime);
}

/// La salida quedo pagada: el vehiculo ya puede salir.
class PaymentNotice extends TicketNotice {
  final DateTime exitTime;
  final int total;
  final String reference;
  final String methodName;
  final String? cardLabel;

  /// Cambio entregado (solo efectivo).
  final int? change;

  const PaymentNotice({
    required String plate,
    required DateTime entryTime,
    required this.exitTime,
    required this.total,
    required this.reference,
    required this.methodName,
    required this.cardLabel,
    required this.change,
  }) : super(plate, entryTime);

  Duration get duration => exitTime.difference(entryTime);
}
