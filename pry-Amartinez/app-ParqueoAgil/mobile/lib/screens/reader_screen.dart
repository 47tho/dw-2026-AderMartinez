import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import '../models/tariff.dart';
import '../services/api/api_client.dart';
import '../services/gate_reader.dart';

/// Pantalla unica del perfil LECTOR: lee con la camara el QR que muestra el
/// conductor y muestra lo que respondio el servidor (entrada con espacio
/// asignado o salida con el valor). Si el conductor tiene cobro automatico,
/// la salida se cobra sola; si no, se cobra en el panel web de la porteria.
class ReaderScreen extends StatefulWidget {
  final GateReader reader;
  final VoidCallback onSignOut;

  /// En pruebas automaticas no hay camara: se desactiva.
  final bool enableCamera;

  const ReaderScreen({super.key, required this.reader, required this.onSignOut, this.enableCamera = true});

  /// mobile_scanner funciona en Android, iOS, macOS y web.
  static bool get cameraSupported =>
      kIsWeb ||
      defaultTargetPlatform == TargetPlatform.android ||
      defaultTargetPlatform == TargetPlatform.iOS ||
      defaultTargetPlatform == TargetPlatform.macOS;

  @override
  State<ReaderScreen> createState() => _ReaderScreenState();
}

class _ReaderScreenState extends State<ReaderScreen> {
  MobileScannerController? _camera;
  final _manual = TextEditingController();

  bool _busy = false;
  GateReading? _reading;
  String? _error;

  /// Estado del cobro automatico de una salida.
  bool _charging = false;
  AutoPayment? _payment;
  String? _paymentError;

  bool get _canUseCamera => widget.enableCamera && ReaderScreen.cameraSupported;
  bool get _showingResult => _reading != null || _error != null;

  @override
  void initState() {
    super.initState();
    if (_canUseCamera) {
      _camera = MobileScannerController(
        formats: const [BarcodeFormat.qrCode],
        detectionSpeed: DetectionSpeed.noDuplicates,
      );
    }
  }

  @override
  void dispose() {
    _camera?.dispose();
    _manual.dispose();
    super.dispose();
  }

  void _onDetect(BarcodeCapture capture) {
    final raw = capture.barcodes.map((b) => b.rawValue).whereType<String>().firstOrNull;
    if (raw != null) _read(raw);
  }

  Future<void> _read(String raw) async {
    // Mientras hay un resultado en pantalla no se lee otro QR.
    if (_busy || _showingResult || raw.trim().isEmpty) return;
    setState(() => _busy = true);
    try {
      final reading = await widget.reader.scan(raw);
      if (!mounted) return;
      setState(() => _reading = reading);
      if (reading is ReaderExit && reading.autoChargeCard != null) await _autoCharge(reading);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _autoCharge(ReaderExit exit) async {
    setState(() => _charging = true);
    try {
      final payment = await widget.reader.autoPay(exit.ticketId);
      if (mounted) setState(() => _payment = payment);
    } on ApiException catch (e) {
      if (mounted) setState(() => _paymentError = e.message);
    } finally {
      if (mounted) setState(() => _charging = false);
    }
  }

  void _next() {
    setState(() {
      _reading = null;
      _error = null;
      _payment = null;
      _paymentError = null;
      _manual.clear();
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        backgroundColor: const Color(0xFF11162A),
        title: const Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Lector de QR', style: TextStyle(fontSize: 18)),
            Text('Porteria ParqueoÁgil', style: TextStyle(fontSize: 12, color: Colors.white54)),
          ],
        ),
        actions: [
          IconButton(icon: const Icon(Icons.logout), tooltip: 'Cerrar sesion', onPressed: widget.onSignOut),
        ],
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            _buildCamera(),
            const SizedBox(height: 16),
            if (_busy && !_showingResult)
              const _Card(
                color: Colors.blueAccent,
                icon: Icons.hourglass_top,
                title: 'Validando el QR...',
                children: [LinearProgressIndicator()],
              )
            else if (_error != null)
              _Card(
                color: Colors.redAccent,
                icon: Icons.block,
                title: 'Acceso negado',
                children: [
                  Text(_error!, style: const TextStyle(color: Colors.white70)),
                  const SizedBox(height: 6),
                  const Text('Barrera cerrada', style: TextStyle(color: Colors.redAccent, fontWeight: FontWeight.bold)),
                ],
                action: _NextButton(onPressed: _next),
              )
            else if (_reading case final ReaderEntry entry)
              _buildEntry(entry)
            else if (_reading case final ReaderExit exit)
              _buildExit(exit)
            else
              _buildManualInput(),
          ],
        ),
      ),
    );
  }

  Widget _buildCamera() {
    final camera = _camera;
    return ClipRRect(
      borderRadius: BorderRadius.circular(16),
      child: SizedBox(
        height: 300,
        child: camera == null
            ? Container(
                color: Colors.black,
                alignment: Alignment.center,
                padding: const EdgeInsets.all(24),
                child: const Text(
                  'Este dispositivo no tiene una camara compatible. Escribe o pega el codigo abajo.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: Colors.white54),
                ),
              )
            : MobileScanner(
                controller: camera,
                onDetect: _onDetect,
                errorBuilder: (context, error) => Container(
                  color: Colors.black,
                  alignment: Alignment.center,
                  padding: const EdgeInsets.all(24),
                  child: Text(
                    error.errorCode == MobileScannerErrorCode.permissionDenied
                        ? 'Permiso de camara denegado. Activalo en los ajustes del celular.'
                        : 'No se pudo abrir la camara (${error.errorCode.name}).',
                    textAlign: TextAlign.center,
                    style: const TextStyle(color: Colors.white70),
                  ),
                ),
                overlayBuilder: (context, constraints) => Stack(
                  fit: StackFit.expand,
                  children: [
                    Center(
                      child: Container(
                        width: 210,
                        height: 210,
                        decoration: BoxDecoration(
                          border: Border.all(color: _showingResult ? Colors.white24 : Colors.greenAccent, width: 3),
                          borderRadius: BorderRadius.circular(16),
                        ),
                      ),
                    ),
                    if (_showingResult)
                      Container(
                        color: Colors.black54,
                        alignment: Alignment.center,
                        child: const Text('Lectura en pausa', style: TextStyle(color: Colors.white70)),
                      ),
                  ],
                ),
              ),
      ),
    );
  }

  Widget _buildManualInput() {
    return _Card(
      color: Colors.white24,
      icon: Icons.qr_code_scanner,
      title: 'Apunta la camara al QR del conductor',
      children: [
        const Text(
          'El servidor valida el codigo, asigna el espacio al entrar y fija el valor al salir.',
          style: TextStyle(color: Colors.white54, fontSize: 12.5),
        ),
        const SizedBox(height: 10),
        TextField(
          key: const Key('codigo-manual'),
          controller: _manual,
          style: const TextStyle(color: Colors.white),
          decoration: InputDecoration(
            labelText: 'O escribe el codigo del QR',
            labelStyle: const TextStyle(color: Colors.white54),
            suffixIcon: IconButton(
              icon: const Icon(Icons.send),
              tooltip: 'Validar codigo',
              onPressed: () => _read(_manual.text),
            ),
          ),
          onSubmitted: _read,
        ),
      ],
    );
  }

  Widget _buildEntry(ReaderEntry entry) {
    return _Card(
      color: Colors.greenAccent,
      icon: Icons.check_circle,
      title: 'Entrada permitida - barrera abierta',
      children: [
        _Row('Conductor', entry.driverName),
        _Row('Vehiculo', '${entry.plate} - ${entry.isMotorcycle ? 'Moto' : 'Carro'}'),
        _Row('Espacio', entry.spotCode, bold: true),
        _Row('Zona', '${entry.zoneName}, piso ${entry.floor}'),
        if (entry.reason.isNotEmpty) ...[
          const SizedBox(height: 8),
          Text(entry.reason, style: const TextStyle(color: Colors.white70, fontStyle: FontStyle.italic)),
        ],
      ],
      action: _NextButton(onPressed: _next),
    );
  }

  Widget _buildExit(ReaderExit exit) {
    final paid = _payment != null;
    final autoCharge = exit.autoChargeCard != null;
    return _Card(
      color: paid ? Colors.greenAccent : (_paymentError != null ? Colors.redAccent : Colors.amber),
      icon: paid ? Icons.check_circle : Icons.logout,
      title: paid ? 'Pago aprobado - barrera abierta' : 'Salida: ${formatCop(exit.total)}',
      children: [
        _Row('Conductor', exit.driverName),
        _Row('Vehiculo', '${exit.plate} - ${exit.isMotorcycle ? 'Moto' : 'Carro'}'),
        _Row('Tiempo', _duration(exit.minutes)),
        _Row('Fracciones', '${exit.fractions} x ${formatCop(exit.pricePerFraction)}'),
        _Row('Total', formatCop(exit.total), bold: true),
        const Divider(color: Colors.white12, height: 24),
        if (!autoCharge)
          const Text(
            'El conductor no tiene cobro automatico: cobra este valor en la caja (panel web de la porteria).',
            style: TextStyle(color: Colors.amber, fontWeight: FontWeight.w600),
          )
        else if (_charging)
          Row(
            children: [
              const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 3)),
              const SizedBox(width: 14),
              Expanded(
                  child: Text('Cobro automatico a ${exit.autoChargeCard}...',
                      style: const TextStyle(color: Colors.white))),
            ],
          )
        else if (_payment case final payment?) ...[
          _Row('Tarjeta', exit.autoChargeCard!),
          _Row('Recibo', payment.reference),
          if (payment.authorization != null) _Row('Autorizacion', payment.authorization!),
        ] else if (_paymentError != null)
          Text(
            '$_paymentError. Cobra en la caja (panel web de la porteria).',
            style: const TextStyle(color: Colors.redAccent),
          ),
      ],
      action: _charging ? null : _NextButton(onPressed: _next),
    );
  }

  static String _duration(int minutes) {
    final h = minutes ~/ 60;
    final m = minutes % 60;
    return h > 0 ? '$h h $m min' : '$m min';
  }
}

class _Card extends StatelessWidget {
  final Color color;
  final IconData icon;
  final String title;
  final List<Widget> children;
  final Widget? action;

  const _Card({required this.color, required this.icon, required this.title, required this.children, this.action});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFF161B2E),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: color, width: 2),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, color: color, size: 28),
              const SizedBox(width: 10),
              Expanded(child: Text(title, style: TextStyle(color: color, fontSize: 17, fontWeight: FontWeight.bold))),
            ],
          ),
          const SizedBox(height: 12),
          ...children,
          if (action != null) ...[const SizedBox(height: 14), action!],
        ],
      ),
    );
  }
}

class _NextButton extends StatelessWidget {
  final VoidCallback onPressed;

  const _NextButton({required this.onPressed});

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      child: ElevatedButton(onPressed: onPressed, child: const Text('Leer siguiente')),
    );
  }
}

class _Row extends StatelessWidget {
  final String label;
  final String value;
  final bool bold;

  const _Row(this.label, this.value, {this.bold = false});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(width: 110, child: Text(label, style: const TextStyle(color: Colors.white38, fontSize: 13))),
          Expanded(
            child: Text(
              value,
              style: TextStyle(
                  color: Colors.white,
                  fontSize: bold ? 16 : 13.5,
                  fontWeight: bold ? FontWeight.bold : FontWeight.w500),
            ),
          ),
        ],
      ),
    );
  }
}
