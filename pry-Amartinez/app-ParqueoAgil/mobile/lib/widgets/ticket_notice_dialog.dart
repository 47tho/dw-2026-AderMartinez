import 'package:flutter/material.dart';
import '../models/parking_session.dart';
import '../models/parking_zone.dart';
import '../models/tariff.dart';
import '../models/ticket_notice.dart';

/// Ventana emergente que ve el conductor cuando la porteria registra su
/// entrada (espacio asignado), lee su QR de salida (valor a pagar) o se
/// aprueba el pago. Devuelve true si el conductor toco "Ver en el mapa".
class TicketNoticeDialog extends StatelessWidget {
  final TicketNotice notice;

  /// Zona del espacio asignado (solo en la entrada), para mostrar su nombre y piso.
  final ParkingZone? zone;

  const TicketNoticeDialog({super.key, required this.notice, this.zone});

  @override
  Widget build(BuildContext context) {
    return switch (notice) {
      EntryNotice entry => _entry(context, entry),
      ExitQuoteNotice quote => _quote(context, quote),
      PaymentNotice payment => _payment(context, payment),
    };
  }

  Widget _entry(BuildContext context, EntryNotice entry) {
    final zone = this.zone;
    final tariff = entry.tariff;
    return _Frame(
      color: Colors.greenAccent,
      icon: Icons.local_parking,
      eyebrow: 'Bienvenido',
      title: 'Tu espacio es ${entry.spotId}',
      children: [
        if (zone != null)
          Text('${zone.label} · Piso ${zone.floor}',
              style: TextStyle(color: zone.color, fontSize: 16, fontWeight: FontWeight.bold)),
        const SizedBox(height: 14),
        _Row(Icons.directions_car_outlined, entry.plate),
        _Row(Icons.login, 'Entrada ${_time(entry.entryTime)}'),
        _Row(
          Icons.payments_outlined,
          '${formatCop(tariff.pricePerFraction)} cada ${tariff.minutesPerFraction} min '
          '(${formatCop(tariff.pricePerHour)}/hora)',
        ),
        const SizedBox(height: 6),
        Text(
          'Cada fraccion de ${tariff.minutesPerFraction} min que empieza se cobra completa.',
          style: const TextStyle(color: Colors.white38, fontSize: 12),
        ),
      ],
      actions: [
        TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Entendido')),
        FilledButton.icon(
          onPressed: () => Navigator.pop(context, true),
          icon: const Icon(Icons.map_outlined, size: 18),
          label: const Text('Ver en el mapa'),
        ),
      ],
    );
  }

  Widget _quote(BuildContext context, ExitQuoteNotice quote) {
    final auto = quote.autoChargeCard;
    return _Frame(
      color: Colors.amber,
      icon: Icons.logout,
      eyebrow: 'Salida de ${quote.plate}',
      title: 'Valor a pagar ${formatCop(quote.total)}',
      children: [
        _Row(Icons.schedule, '${formatDuration(quote.duration)} · ${quote.fractions} ${quote.fractions == 1 ? 'fraccion' : 'fracciones'}'),
        _Row(Icons.login, 'Entrada ${_time(quote.entryTime)}'),
        const SizedBox(height: 10),
        Text(
          auto != null
              ? 'Se cobra automaticamente a $auto. No tienes que hacer fila.'
              : 'Paga en la caja de la salida. El valor quedo fijo al leer tu QR.',
          style: const TextStyle(color: Colors.white70),
        ),
      ],
      actions: [FilledButton(onPressed: () => Navigator.pop(context, false), child: const Text('Entendido'))],
    );
  }

  Widget _payment(BuildContext context, PaymentNotice payment) {
    return _Frame(
      color: Colors.greenAccent,
      icon: Icons.check_circle,
      eyebrow: 'Pago aprobado',
      title: '${formatCop(payment.total)} · buen viaje',
      children: [
        _Row(Icons.directions_car_outlined, payment.plate),
        _Row(Icons.schedule, '${formatDuration(payment.duration)} (${_time(payment.entryTime)} a ${_time(payment.exitTime)})'),
        _Row(Icons.credit_card, payment.cardLabel == null ? payment.methodName : '${payment.methodName} · ${payment.cardLabel}'),
        if (payment.change != null && payment.change! > 0) _Row(Icons.payments_outlined, 'Cambio ${formatCop(payment.change!)}'),
        _Row(Icons.receipt_long_outlined, 'Recibo ${payment.reference}'),
        const SizedBox(height: 6),
        const Text('El recibo queda en Pago > Historial.', style: TextStyle(color: Colors.white38, fontSize: 12)),
      ],
      actions: [FilledButton(onPressed: () => Navigator.pop(context, false), child: const Text('Listo'))],
    );
  }

  static String _time(DateTime t) {
    final hour = t.hour % 12 == 0 ? 12 : t.hour % 12;
    return '$hour:${t.minute.toString().padLeft(2, '0')} ${t.hour < 12 ? 'a. m.' : 'p. m.'}';
  }
}

class _Frame extends StatelessWidget {
  final Color color;
  final IconData icon;
  final String eyebrow;
  final String title;
  final List<Widget> children;
  final List<Widget> actions;

  const _Frame({
    required this.color,
    required this.icon,
    required this.eyebrow,
    required this.title,
    required this.children,
    required this.actions,
  });

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      backgroundColor: const Color(0xFF161B2E),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18), side: BorderSide(color: color, width: 2)),
      icon: Icon(icon, color: color, size: 40),
      title: Column(
        children: [
          Text(eyebrow.toUpperCase(),
              style: const TextStyle(color: Colors.white54, fontSize: 12, letterSpacing: 1.2, fontWeight: FontWeight.w600)),
          const SizedBox(height: 4),
          Text(title,
              textAlign: TextAlign.center,
              style: TextStyle(color: color, fontSize: 22, fontWeight: FontWeight.bold)),
        ],
      ),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.center,
        children: children,
      ),
      actionsAlignment: MainAxisAlignment.center,
      actions: actions,
    );
  }
}

class _Row extends StatelessWidget {
  final IconData icon;
  final String text;

  const _Row(this.icon, this.text);

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        children: [
          Icon(icon, size: 18, color: Colors.white54),
          const SizedBox(width: 10),
          Expanded(child: Text(text, style: const TextStyle(color: Colors.white, fontSize: 14))),
        ],
      ),
    );
  }
}
