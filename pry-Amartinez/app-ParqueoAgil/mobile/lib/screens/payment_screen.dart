import 'dart:async';
import 'package:flutter/material.dart';
import '../models/parking_session.dart';
import '../models/payment_method.dart';
import '../models/receipt.dart';
import '../models/tariff.dart';
import '../models/vehicle.dart';
import '../services/parking_service.dart';
import '../services/payment_gateway.dart';

/// Metodo de pago preferido, tarjeta para el cobro automatico, tarifas,
/// costo en vivo e historial de recibos.
///
/// El valor a pagar NUNCA lo manda el celular: lo calcula la terminal
/// (el servidor) con la hora de entrada que tiene registrada.
class PaymentScreen extends StatefulWidget {
  final ParkingService service;
  final String vehicleId;

  const PaymentScreen({super.key, required this.service, required this.vehicleId});

  @override
  State<PaymentScreen> createState() => _PaymentScreenState();
}

class _PaymentScreenState extends State<PaymentScreen> {
  Timer? _timer;

  ParkingService get _service => widget.service;

  @override
  void initState() {
    super.initState();
    // Costo estimado en vivo, igual que en la pantalla principal.
    _timer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final prefs = _service.preferencesOf(_service.currentUserId);
    final card = prefs.savedCard;
    final vehicle = _service.vehicleById(widget.vehicleId)!;
    final session = _service.activeSessionFor(vehicle.id);
    final receipts = _service.receiptsOf(_service.currentUserId);

    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Metodo de pago', style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
          const SizedBox(height: 4),
          const Text('La terminal de salida usara este metodo por defecto.', style: TextStyle(color: Colors.white54, fontSize: 12.5)),
          const SizedBox(height: 16),
          for (final option in PaymentMethod.all) _buildOption(option, prefs.paymentMethod, card != null),
          const SizedBox(height: 8),
          _buildCardSection(card?.label),
          const SizedBox(height: 18),
          _buildTariffs(vehicle, session),
          const SizedBox(height: 18),
          const Text('Historial', style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold)),
          const SizedBox(height: 8),
          if (receipts.isEmpty)
            const Text('Aun no tienes pagos. Tus recibos digitales apareceran aqui.', style: TextStyle(color: Colors.white38, fontSize: 12.5))
          else
            for (final receipt in receipts) _ReceiptTile(receipt),
        ],
      ),
    );
  }

  Widget _buildOption(PaymentMethod option, PaymentMethod current, bool hasCard) {
    final selected = option.runtimeType == current.runtimeType;
    final needsCard = option is AutoChargePayment && !hasCard;
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: () async {
          if (needsCard && !await _addCard()) return;
          _service.setPaymentMethod(option);
        },
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: const Color(0xFF161B2E),
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: selected ? Colors.blueAccent : Colors.white12, width: selected ? 2 : 1),
          ),
          child: Row(
            children: [
              Icon(option.icon, color: option.color),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(option.name, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600)),
                    Text(
                      needsCard ? 'Primero agrega una tarjeta' : option.description,
                      style: const TextStyle(color: Colors.white54, fontSize: 12),
                    ),
                  ],
                ),
              ),
              if (selected) const Icon(Icons.check_circle, color: Colors.blueAccent),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildCardSection(String? cardLabel) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(color: const Color(0xFF161B2E), borderRadius: BorderRadius.circular(12)),
      child: Row(
        children: [
          const Icon(Icons.credit_card, color: Colors.white54),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Tarjeta para cobro automatico', style: TextStyle(color: Colors.white38, fontSize: 11)),
                Text(cardLabel ?? 'Sin tarjeta guardada', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600)),
              ],
            ),
          ),
          if (cardLabel == null)
            TextButton(onPressed: _addCard, child: const Text('Agregar'))
          else
            TextButton(onPressed: _service.removeCard, child: const Text('Quitar', style: TextStyle(color: Colors.redAccent))),
        ],
      ),
    );
  }

  Widget _buildTariffs(Vehicle vehicle, ParkingSession? session) {
    final now = _service.now();
    final tariff = _service.tariffFor(vehicle.type);
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(color: const Color(0xFF161B2E), borderRadius: BorderRadius.circular(12)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('TARIFAS', style: TextStyle(color: Colors.white38, fontSize: 11)),
          const SizedBox(height: 4),
          for (final type in VehicleType.values)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 2),
              child: Row(
                children: [
                  Icon(type.icon, size: 18, color: Colors.white54),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text.rich(
                      TextSpan(
                        text: '${type.label}: ${formatCop(_service.tariffFor(type).pricePerFraction)} / ${_service.tariffFor(type).minutesPerFraction} min',
                        style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600),
                        children: [
                          TextSpan(
                            text: '  (${formatCop(_service.tariffFor(type).pricePerHour)}/hora)',
                            style: const TextStyle(color: Colors.white54, fontSize: 12, fontWeight: FontWeight.normal),
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
          const SizedBox(height: 6),
          Text(
            'Cada fraccion de ${tariff.minutesPerFraction} min que empieza se cobra completa. '
            'El total se aproxima a los ${formatCop(tariff.roundTo)} mas cercanos.',
            style: const TextStyle(color: Colors.white38, fontSize: 11.5),
          ),
          if (session != null) ...[
            const SizedBox(height: 6),
            Text(
              'Si ${vehicle.plate} sale ahora, pagaria ${formatCop(tariff.amountFor(session.elapsedAt(now)))} '
              '(${formatDuration(session.elapsedAt(now))}).',
              style: const TextStyle(color: Colors.white70, fontSize: 12),
            ),
          ],
        ],
      ),
    );
  }

  /// Simula el widget de la pasarela: el usuario elige una tarjeta de
  /// prueba y la app solo recibe el token. Devuelve true si se guardo.
  Future<bool> _addCard() async {
    final card = await showModalBottomSheet<TestCard>(
      context: context,
      backgroundColor: const Color(0xFFF4F4F5),
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Padding(
              padding: EdgeInsets.fromLTRB(20, 20, 20, 4),
              child: Row(
                children: [
                  Icon(Icons.lock, color: Colors.black54, size: 18),
                  SizedBox(width: 8),
                  Text('Pasarela de pagos (simulada)', style: TextStyle(color: Colors.black87, fontSize: 16, fontWeight: FontWeight.bold)),
                ],
              ),
            ),
            const Padding(
              padding: EdgeInsets.fromLTRB(20, 0, 20, 8),
              child: Text(
                'En produccion esta ventana es de la pasarela (Wompi, ePayco, Mercado Pago). '
                'ParqueoAgil solo recibe un token: nunca ve el numero de la tarjeta ni el CVV. '
                'Elige una tarjeta de prueba:',
                style: TextStyle(color: Colors.black54, fontSize: 12.5),
              ),
            ),
            for (final testCard in PaymentGatewaySimulator.testCards)
              ListTile(
                leading: Icon(Icons.credit_card, color: testCard.declines ? Colors.redAccent : Colors.indigo),
                title: Text('${testCard.brand} •••• ${testCard.last4}', style: const TextStyle(color: Colors.black87)),
                subtitle: Text(testCard.note, style: const TextStyle(color: Colors.black54)),
                onTap: () => Navigator.pop(ctx, testCard),
              ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
    if (card == null || !mounted) return false;

    showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (_) => const AlertDialog(
        backgroundColor: Color(0xFF161B2E),
        content: Row(
          children: [
            SizedBox(width: 24, height: 24, child: CircularProgressIndicator(strokeWidth: 3)),
            SizedBox(width: 16),
            Expanded(child: Text('Guardando tarjeta en la pasarela...', style: TextStyle(color: Colors.white))),
          ],
        ),
      ),
    );
    final saved = await _service.addCard(card);
    if (!mounted) return true;
    Navigator.of(context).pop();
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Tarjeta ${saved.label} guardada (solo el token)')));
    return true;
  }
}

class _ReceiptTile extends StatelessWidget {
  final Receipt receipt;

  const _ReceiptTile(this.receipt);

  @override
  Widget build(BuildContext context) {
    final t = receipt.exitTime;
    final date = '${t.day.toString().padLeft(2, '0')}/${t.month.toString().padLeft(2, '0')} '
        '${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')}';
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(color: const Color(0xFF161B2E), borderRadius: BorderRadius.circular(10)),
      child: Row(
        children: [
          Icon(receipt.vehicleType.icon, color: Colors.white54),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('${receipt.plate} - ${receipt.spotId}', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600)),
                Text(
                  '$date - ${formatDuration(receipt.duration)} - ${receipt.methodName}',
                  style: const TextStyle(color: Colors.white54, fontSize: 11.5),
                ),
                Text(receipt.reference, style: const TextStyle(color: Colors.white38, fontSize: 11)),
              ],
            ),
          ),
          Text(formatCop(receipt.total), style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
        ],
      ),
    );
  }
}
