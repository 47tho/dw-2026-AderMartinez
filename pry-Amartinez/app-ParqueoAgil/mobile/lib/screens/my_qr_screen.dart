import 'dart:async';
import 'package:flutter/material.dart';
import 'package:qr_flutter/qr_flutter.dart';
import '../models/parking_session.dart';
import '../models/tariff.dart';
import '../models/vehicle.dart';
import '../services/access_code.dart';
import '../services/parking_service.dart';
import '../widgets/status_badge.dart';

/// Pantalla principal del usuario: elige con que vehiculo entra (o ve
/// el que tiene dentro) y muestra su QR dinamico para la terminal.
class MyQrScreen extends StatefulWidget {
  final ParkingService service;
  final String vehicleId;
  final ValueChanged<String> onSelectVehicle;

  const MyQrScreen({
    super.key,
    required this.service,
    required this.vehicleId,
    required this.onSelectVehicle,
  });

  @override
  State<MyQrScreen> createState() => _MyQrScreenState();
}

class _MyQrScreenState extends State<MyQrScreen> {
  bool _useNfc = false;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    // Refresca cada segundo: cuenta regresiva del QR, tiempo y costo
    // en vivo (heuristica: visibilidad del estado del sistema).
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
    final service = widget.service;
    final vehicle = service.vehicleById(widget.vehicleId)!;
    final session = service.activeSessionFor(vehicle.id);
    final isParked = session != null;
    final now = service.now();
    final tariff = service.tariffFor(vehicle.type);
    final code = service.accessCodeFor(vehicle.id, at: now);
    final secondsLeft = AccessCode.secondsLeft(now);
    final actionColor = isParked ? Colors.redAccent : Colors.green;

    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('ParqueoÁgil', style: TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold)),
          Text(
            isParked
                ? 'Estacionado en ${session.spotId} - ${formatDuration(session.elapsedAt(now))}'
                : 'Fuera del parqueadero',
            style: TextStyle(color: isParked ? Colors.redAccent : Colors.white54, fontSize: 13),
          ),
          const SizedBox(height: 16),
          InkWell(
            borderRadius: BorderRadius.circular(16),
            onTap: _pickVehicle,
            child: Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(color: const Color(0xFF161B2E), borderRadius: BorderRadius.circular(16)),
              child: Row(
                children: [
                  Icon(vehicle.type.icon, color: Colors.white70, size: 28),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(vehicle.plate,
                            style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold)),
                        Text(
                          '${vehicle.type.label}${vehicle.description.isEmpty ? '' : ' - ${vehicle.description}'}',
                          style: const TextStyle(color: Colors.white54, fontSize: 12),
                        ),
                      ],
                    ),
                  ),
                  StatusBadge(
                    text: isParked ? 'DENTRO' : 'FUERA',
                    color: isParked ? Colors.redAccent : Colors.greenAccent,
                  ),
                  const SizedBox(width: 4),
                  const Icon(Icons.unfold_more, color: Colors.white38),
                ],
              ),
            ),
          ),
          if (isParked) ...[
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 14),
              decoration: BoxDecoration(color: const Color(0xFF161B2E), borderRadius: BorderRadius.circular(12)),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Flexible(
                    child: Text(
                      'Costo acumulado (${tariff.fractions(session.elapsedAt(now))} x ${tariff.minutesPerFraction} min)',
                      style: const TextStyle(color: Colors.white54, fontSize: 12),
                    ),
                  ),
                  Text(formatCop(tariff.amountFor(session.elapsedAt(now))),
                      style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                ],
              ),
            ),
          ],
          const SizedBox(height: 20),
          Center(
            child: ToggleButtons(
              borderRadius: BorderRadius.circular(10),
              isSelected: [!_useNfc, _useNfc],
              onPressed: (i) => setState(() => _useNfc = i == 1),
              children: const [
                Padding(padding: EdgeInsets.symmetric(horizontal: 24, vertical: 8), child: Text('QR')),
                Padding(padding: EdgeInsets.symmetric(horizontal: 24, vertical: 8), child: Text('NFC')),
              ],
            ),
          ),
          const SizedBox(height: 16),
          Center(child: _useNfc ? _buildNfcPanel() : _buildQrPanel(code, secondsLeft, isParked)),
          const SizedBox(height: 20),
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(color: const Color(0xFF161B2E), borderRadius: BorderRadius.circular(14)),
            child: Row(
              children: [
                Icon(_useNfc ? Icons.nfc : Icons.qr_code_scanner, color: actionColor),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    isParked
                        ? 'Para salir, muestra este QR en la porteria: se cobra y se abre la barrera.'
                        : 'Muestra este QR en la porteria: la camara lo lee, te asigna un espacio y se abre la barrera.',
                    style: const TextStyle(color: Colors.white70, fontSize: 13),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildQrPanel(String code, int secondsLeft, bool isParked) {
    return Column(
      children: [
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12)),
          child: QrImageView(data: code, size: 210, version: QrVersions.auto),
        ),
        const SizedBox(height: 10),
        SizedBox(
          width: 234,
          child: LinearProgressIndicator(
            value: secondsLeft / AccessCode.periodSeconds,
            minHeight: 4,
            borderRadius: BorderRadius.circular(2),
          ),
        ),
        const SizedBox(height: 6),
        Text('Se renueva en $secondsLeft s', style: const TextStyle(color: Colors.white54, fontSize: 12)),
        const SizedBox(height: 4),
        Text(
          'Muestra este codigo en la terminal de ${isParked ? 'SALIDA' : 'ENTRADA'}',
          style: const TextStyle(color: Colors.white70, fontSize: 12.5, fontWeight: FontWeight.w600),
        ),
      ],
    );
  }

  Widget _buildNfcPanel() {
    return Container(
      width: 234,
      height: 260,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        border: Border.all(color: Colors.blueAccent, width: 2),
        borderRadius: BorderRadius.circular(20),
      ),
      child: const Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.nfc, size: 64, color: Colors.white54),
          SizedBox(height: 12),
          Text('Acerca tu celular al lector de la puerta',
              textAlign: TextAlign.center, style: TextStyle(color: Colors.white70)),
          SizedBox(height: 8),
          Text(
            'NFC llega en la fase 2 (Android). Envia el mismo codigo firmado que el QR; en el prototipo se simula.',
            textAlign: TextAlign.center,
            style: TextStyle(color: Colors.white38, fontSize: 11.5),
          ),
        ],
      ),
    );
  }

  Future<void> _pickVehicle() async {
    final service = widget.service;
    final selected = await showModalBottomSheet<String>(
      context: context,
      backgroundColor: const Color(0xFF161B2E),
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Padding(
              padding: EdgeInsets.fromLTRB(20, 20, 20, 8),
              child: Text('Con que vehiculo vas a ingresar?',
                  style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold)),
            ),
            for (final v in service.vehiclesOf(service.currentUserId))
              ListTile(
                leading: Icon(v.type.icon, color: Colors.white70),
                title: Text(v.plate, style: const TextStyle(color: Colors.white)),
                subtitle: Text(_statusOf(v), style: const TextStyle(color: Colors.white54)),
                trailing: v.id == widget.vehicleId ? const Icon(Icons.check, color: Colors.blueAccent) : null,
                onTap: () => Navigator.pop(ctx, v.id),
              ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
    if (selected != null) widget.onSelectVehicle(selected);
  }

  String _statusOf(Vehicle vehicle) {
    final session = widget.service.activeSessionFor(vehicle.id);
    return session != null ? 'Dentro - espacio ${session.spotId}' : 'Fuera - ${vehicle.type.label}';
  }
}
