import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:qr_flutter/qr_flutter.dart';
import '../models/payment_method.dart';
import '../models/receipt.dart';
import '../models/tariff.dart';
import '../models/vehicle.dart';
import '../services/parking_service.dart';

/// Terminal de la puerta del parqueadero (simulada en el celular).
///
/// Lee el QR del usuario con la camara (o se simula la lectura), lo
/// valida, identifica al usuario y su vehiculo, y segun el caso abre
/// la barrera de entrada con el espacio asignado o cobra la salida.
class TerminalScreen extends StatefulWidget {
  final ParkingService service;

  /// Si viene, la terminal procesa este codigo al abrir (lectura
  /// simulada desde la app del usuario) y no enciende la camara.
  final String? initialCode;
  final bool enableCamera;

  const TerminalScreen({super.key, required this.service, this.initialCode, this.enableCamera = true});

  /// mobile_scanner funciona en Android, iOS, macOS y web.
  static bool get cameraSupported =>
      kIsWeb ||
      defaultTargetPlatform == TargetPlatform.android ||
      defaultTargetPlatform == TargetPlatform.iOS ||
      defaultTargetPlatform == TargetPlatform.macOS;

  @override
  State<TerminalScreen> createState() => _TerminalScreenState();
}

class _TerminalScreenState extends State<TerminalScreen> {
  MobileScannerController? _controller;
  GateResult? _result;
  final _manualController = TextEditingController();

  ParkingService get _service => widget.service;
  bool get _canUseCamera => widget.enableCamera && TerminalScreen.cameraSupported;
  bool get _fromApp => widget.initialCode != null;

  @override
  void initState() {
    super.initState();
    final code = widget.initialCode;
    if (code != null) {
      // Despues del primer frame: procesar cambia el estado del servicio
      // y la pantalla de atras se redibuja.
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _process(code);
      });
    } else if (_canUseCamera) {
      _startCamera();
    }
  }

  @override
  void dispose() {
    _controller?.dispose();
    _manualController.dispose();
    super.dispose();
  }

  void _startCamera() {
    setState(() {
      _controller = MobileScannerController(
        formats: const [BarcodeFormat.qrCode],
        detectionSpeed: DetectionSpeed.noDuplicates,
      );
    });
  }

  void _stopCamera() {
    final controller = _controller;
    setState(() => _controller = null);
    controller?.dispose();
  }

  void _onDetect(BarcodeCapture capture) {
    if (_result != null) return; // hay una operacion en pantalla
    final raw = capture.barcodes.map((b) => b.rawValue).whereType<String>().firstOrNull;
    if (raw != null) _process(raw);
  }

  void _process(String raw) {
    if (raw.trim().isEmpty) return;
    final result = _service.handleScan(raw);
    setState(() => _result = result);
  }

  void _next() {
    if (_fromApp) {
      Navigator.of(context).pop();
    } else {
      setState(() => _result = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final result = _result;
    return Scaffold(
      appBar: AppBar(
        backgroundColor: const Color(0xFF11162A),
        title: const Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Terminal de acceso', style: TextStyle(fontSize: 18)),
            Text('Simulacion de la puerta del parqueadero', style: TextStyle(fontSize: 12, color: Colors.white54)),
          ],
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          if (result == null || !_fromApp) _buildCameraSection(),
          if (result != null) ...[
            const SizedBox(height: 16),
            switch (result) {
              GateRejected rejected => _buildRejected(rejected),
              GateEntry entry => _buildEntry(entry),
              GateExit exit => _ExitPanel(
                  key: ValueKey(exit.quote.session.id),
                  service: _service,
                  exit: exit,
                  onDone: _next,
                  doneLabel: _fromApp ? 'Volver a la app' : 'Siguiente vehiculo',
                ),
            },
          ],
          if (result == null) ...[
            const SizedBox(height: 16),
            _buildSimulationSection(),
          ],
        ],
      ),
    );
  }

  // ------------------------------------------------------------- camara

  Widget _buildCameraSection() {
    final controller = _controller;
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(color: const Color(0xFF161B2E), borderRadius: BorderRadius.circular(16)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(12),
            child: SizedBox(
              height: 280,
              child: controller == null
                  ? _cameraPlaceholder()
                  : MobileScanner(
                      controller: controller,
                      onDetect: _onDetect,
                      errorBuilder: _cameraError,
                      // Solo se dibuja con la camara funcionando (no sobre el error).
                      overlayBuilder: (context, constraints) => Stack(
                        fit: StackFit.expand,
                        children: [
                          Center(
                            child: Container(
                              width: 200,
                              height: 200,
                              decoration: BoxDecoration(
                                border: Border.all(color: _result == null ? Colors.greenAccent : Colors.white24, width: 3),
                                borderRadius: BorderRadius.circular(16),
                              ),
                            ),
                          ),
                          if (_result != null)
                            Container(
                              color: Colors.black54,
                              alignment: Alignment.center,
                              child: const Text('Lectura en pausa', style: TextStyle(color: Colors.white70)),
                            ),
                        ],
                      ),
                    ),
            ),
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: Text(
                  controller == null ? 'Camara apagada' : 'Apunta al QR de la app ParqueoAgil',
                  style: const TextStyle(color: Colors.white54, fontSize: 12.5),
                ),
              ),
              if (_canUseCamera)
                TextButton.icon(
                  onPressed: controller == null ? _startCamera : _stopCamera,
                  icon: Icon(controller == null ? Icons.videocam : Icons.videocam_off, size: 18),
                  label: Text(controller == null ? 'Encender camara' : 'Apagar'),
                ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _cameraPlaceholder() {
    return Container(
      color: Colors.black,
      alignment: Alignment.center,
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(Icons.qr_code_scanner, size: 56, color: Colors.white38),
          const SizedBox(height: 12),
          Text(
            _canUseCamera
                ? 'Enciende la camara para leer el QR de un usuario'
                : 'Este dispositivo no tiene una camara compatible. Usa la simulacion de abajo.',
            textAlign: TextAlign.center,
            style: const TextStyle(color: Colors.white54),
          ),
        ],
      ),
    );
  }

  Widget _cameraError(BuildContext context, MobileScannerException error) {
    final message = switch (error.errorCode) {
      MobileScannerErrorCode.permissionDenied =>
        'Permiso de camara denegado. Activalo en los ajustes del celular o del navegador y vuelve a abrir la terminal.',
      MobileScannerErrorCode.unsupported => 'Este dispositivo no tiene una camara compatible. Usa la simulacion de abajo.',
      _ => 'No se pudo abrir la camara (${error.errorCode.name}). Usa la simulacion de abajo.',
    };
    return Container(
      color: Colors.black,
      alignment: Alignment.center,
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(Icons.no_photography_outlined, size: 48, color: Colors.orangeAccent),
          const SizedBox(height: 12),
          Text(message, textAlign: TextAlign.center, style: const TextStyle(color: Colors.white70)),
        ],
      ),
    );
  }

  // ---------------------------------------------------------- simulacion

  Widget _buildSimulationSection() {
    final vehicles = _service.vehiclesOf(_service.currentUserId);
    final first = vehicles.first;
    final current = _service.accessCodeFor(first.id);
    final tampered = '${current.substring(0, current.length - 1)}${current.endsWith('0') ? '1' : '0'}';
    final old = _service.accessCodeFor(first.id, at: _service.now().subtract(const Duration(minutes: 5)));

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(color: const Color(0xFF161B2E), borderRadius: BorderRadius.circular(16)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Simular lectura', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 16)),
          const SizedBox(height: 4),
          const Text(
            'Sin segundo celular: elige que QR "lee" la terminal.',
            style: TextStyle(color: Colors.white54, fontSize: 12.5),
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final v in vehicles)
                ActionChip(
                  avatar: Icon(v.type.icon, size: 18, color: Colors.greenAccent),
                  label: Text('QR actual ${v.plate}'),
                  onPressed: () => _process(_service.accessCodeFor(v.id)),
                ),
              ActionChip(
                avatar: const Icon(Icons.history, size: 18, color: Colors.orangeAccent),
                label: Text('QR vencido ${first.plate}'),
                onPressed: () => _process(old),
              ),
              ActionChip(
                avatar: const Icon(Icons.warning_amber, size: 18, color: Colors.redAccent),
                label: const Text('QR alterado'),
                onPressed: () => _process(tampered),
              ),
              ActionChip(
                avatar: const Icon(Icons.link, size: 18, color: Colors.redAccent),
                label: const Text('QR de otra app'),
                onPressed: () => _process('https://www.ejemplo.com/promo?id=42'),
              ),
            ],
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _manualController,
            style: const TextStyle(color: Colors.white),
            decoration: InputDecoration(
              labelText: 'O pega el contenido de un QR',
              labelStyle: const TextStyle(color: Colors.white54),
              suffixIcon: IconButton(
                icon: const Icon(Icons.send),
                onPressed: () => _process(_manualController.text),
              ),
            ),
            onSubmitted: _process,
          ),
        ],
      ),
    );
  }

  // ----------------------------------------------------------- resultados

  Widget _buildRejected(GateRejected result) {
    return _ResultCard(
      color: Colors.redAccent,
      icon: Icons.block,
      title: result.title,
      details: [
        Text(result.detail, style: const TextStyle(color: Colors.white70)),
        const SizedBox(height: 6),
        const Text('Barrera cerrada', style: TextStyle(color: Colors.redAccent, fontWeight: FontWeight.bold)),
      ],
      actionLabel: _fromApp ? 'Volver a la app' : 'Leer otro codigo',
      onAction: _next,
    );
  }

  Widget _buildEntry(GateEntry result) {
    return _ResultCard(
      color: Colors.greenAccent,
      icon: Icons.check_circle,
      title: 'Acceso permitido - barrera abierta',
      details: [
        _InfoRow('Usuario', '${result.user.name} (${result.user.docType} ${result.user.maskedDoc})'),
        _InfoRow('Vehiculo', _vehicleLabel(result.vehicle)),
        _InfoRow('Espacio asignado', '${result.session.spotId} - ${result.zone.label}, piso ${result.zone.floor}'),
        _InfoRow('Hora de entrada', _hhmm(result.session.entryTime)),
        const SizedBox(height: 8),
        Text(result.reason, style: const TextStyle(color: Colors.white70, fontStyle: FontStyle.italic)),
      ],
      actionLabel: _fromApp ? 'Volver a la app' : 'Siguiente vehiculo',
      onAction: _next,
    );
  }
}

/// Cobro de la salida en la terminal: muestra el valor, deja elegir el
/// metodo (o cobra solo si el usuario tiene cobro automatico) y al
/// aprobarse abre la barrera y muestra el recibo.
class _ExitPanel extends StatefulWidget {
  final ParkingService service;
  final GateExit exit;
  final VoidCallback onDone;
  final String doneLabel;

  const _ExitPanel({super.key, required this.service, required this.exit, required this.onDone, required this.doneLabel});

  @override
  State<_ExitPanel> createState() => _ExitPanelState();
}

class _ExitPanelState extends State<_ExitPanel> {
  late PaymentMethod _method;
  int? _cashReceived;
  bool _processing = false;
  String? _error;
  Receipt? _receipt;

  GateExit get _exit => widget.exit;
  bool get _hasCard => _exit.preferences.savedCard != null;

  @override
  void initState() {
    super.initState();
    final preferred = _exit.preferences.paymentMethod;
    _method = preferred is AutoChargePayment && !_hasCard ? CashPayment() : preferred;
    if (_method is AutoChargePayment) {
      // Cobro automatico: no hay que hacer nada en la caja.
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _pay();
      });
    }
  }

  Future<void> _pay() async {
    setState(() {
      _processing = true;
      _error = null;
    });
    final result = await widget.service.pay(_exit, _method, cashReceived: _cashReceived);
    if (!mounted) return;
    setState(() {
      _processing = false;
      _receipt = result.receipt;
      _error = result.outcome.approved ? null : result.outcome.error;
    });
  }

  @override
  Widget build(BuildContext context) {
    final quote = _exit.quote;
    final receipt = _receipt;
    return _ResultCard(
      color: receipt != null ? Colors.greenAccent : Colors.amber,
      icon: receipt != null ? Icons.check_circle : Icons.logout,
      title: receipt != null ? 'Pago aprobado - barrera abierta' : 'Salida: cobrar ${formatCop(quote.total)}',
      details: [
        _InfoRow('Usuario', '${_exit.user.name} (${_exit.user.docType} ${_exit.user.maskedDoc})'),
        _InfoRow('Vehiculo', _vehicleLabel(_exit.vehicle)),
        _InfoRow('Espacio', quote.session.spotId),
        _InfoRow('Entrada', '${_hhmm(quote.session.entryTime)}  (${_durationLabel(quote.elapsed)})'),
        _InfoRow(
          'Fracciones',
          '${quote.fractions} x ${formatCop(quote.tariff.pricePerFraction)} = ${formatCop(quote.subtotal)}',
        ),
        _InfoRow(
          'Total',
          '${formatCop(quote.total)}${quote.total != quote.subtotal ? '  (aprox. a ${formatCop(quote.tariff.roundTo)})' : ''}',
          bold: true,
        ),
        const Divider(color: Colors.white12, height: 24),
        if (receipt != null)
          ..._buildReceipt(receipt)
        else if (_processing)
          _buildProcessing()
        else
          ..._buildPaymentOptions(quote.total),
      ],
      actionLabel: receipt != null ? widget.doneLabel : null,
      onAction: widget.onDone,
    );
  }

  List<Widget> _buildReceipt(Receipt receipt) {
    return [
      _InfoRow('Recibo', receipt.reference),
      _InfoRow('Metodo', receipt.cardLabel == null ? receipt.methodName : '${receipt.methodName} - ${receipt.cardLabel}'),
      if (receipt.authorization != null) _InfoRow('Autorizacion', receipt.authorization!),
      if (receipt.cashReceived != null) ...[
        _InfoRow('Recibido', formatCop(receipt.cashReceived!)),
        _InfoRow('Cambio', formatCop(receipt.change!), bold: true),
      ],
      const SizedBox(height: 6),
      const Text('El recibo digital queda en la app del usuario (Pago > Historial).', style: TextStyle(color: Colors.white54, fontSize: 12)),
    ];
  }

  Widget _buildProcessing() {
    final text = switch (_method) {
      AutoChargePayment() => 'Cobro automatico a ${_exit.preferences.savedCard?.label}...',
      QrTransferPayment() => 'Esperando confirmacion del banco...',
      _ => 'Esperando el datafono...',
    };
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 16),
      child: Row(
        children: [
          const SizedBox(width: 24, height: 24, child: CircularProgressIndicator(strokeWidth: 3)),
          const SizedBox(width: 16),
          Expanded(child: Text(text, style: const TextStyle(color: Colors.white))),
        ],
      ),
    );
  }

  List<Widget> _buildPaymentOptions(int total) {
    return [
      if (_error != null)
        Container(
          width: double.infinity,
          margin: const EdgeInsets.only(bottom: 12),
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(color: Colors.redAccent.withValues(alpha: 0.15), borderRadius: BorderRadius.circular(8)),
          child: Text('$_error. Elige otro metodo.', style: const TextStyle(color: Colors.redAccent)),
        ),
      const Text('Metodo de pago', style: TextStyle(color: Colors.white54, fontSize: 12.5)),
      const SizedBox(height: 8),
      Wrap(
        spacing: 8,
        runSpacing: 8,
        children: [
          for (final method in PaymentMethod.all)
            ChoiceChip(
              avatar: Icon(method.icon, size: 18, color: method.color),
              label: Text(method is AutoChargePayment && !_hasCard ? '${method.name} (sin tarjeta)' : method.name),
              selected: method.runtimeType == _method.runtimeType,
              onSelected: method is AutoChargePayment && !_hasCard
                  ? null
                  : (_) => setState(() {
                        _method = method;
                        _error = null;
                      }),
            ),
        ],
      ),
      const SizedBox(height: 14),
      ..._buildMethodDetail(total),
      const SizedBox(height: 8),
      TextButton(
        onPressed: widget.onDone,
        child: const Text('Cancelar (el vehiculo sigue dentro)'),
      ),
    ];
  }

  List<Widget> _buildMethodDetail(int total) {
    switch (_method) {
      case CashPayment():
        final options = <int>{total, for (final bill in [10000, 20000, 50000, 100000]) if (bill > total) bill}.take(4);
        final received = _cashReceived;
        return [
          const Text('Efectivo recibido', style: TextStyle(color: Colors.white54, fontSize: 12.5)),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            children: [
              for (final value in options)
                ChoiceChip(
                  label: Text(value == total ? 'Exacto ${formatCop(value)}' : formatCop(value)),
                  selected: received == value,
                  onSelected: (_) => setState(() => _cashReceived = value),
                ),
            ],
          ),
          if (received != null) ...[
            const SizedBox(height: 8),
            Text('Cambio a entregar: ${formatCop(received - total)}', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
          ],
          const SizedBox(height: 12),
          _payButton('Registrar pago en efectivo', received == null ? null : _pay),
        ];
      case QrTransferPayment():
        final reference = widget.service.paymentReference(_exit.quote);
        return [
          Center(
            child: Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(10)),
              child: QrImageView(data: 'PARQUEOAGIL-COBRO|ref=$reference|valor=$total', size: 150),
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'QR de cobro (simulado) por ${formatCop(total)} - ref. $reference. El usuario lo escanea con Nequi, Daviplata o su banco (Bre-B).',
            textAlign: TextAlign.center,
            style: const TextStyle(color: Colors.white54, fontSize: 12),
          ),
          const SizedBox(height: 12),
          _payButton('Simular pago recibido', _pay),
        ];
      case AutoChargePayment():
        return [_payButton('Cobrar a ${_exit.preferences.savedCard!.label}', _pay)];
      default:
        return [_payButton('Cobrar ${formatCop(total)} en el datafono', _pay)];
    }
  }

  Widget _payButton(String label, VoidCallback? onPressed) {
    return SizedBox(
      width: double.infinity,
      child: ElevatedButton(
        style: ElevatedButton.styleFrom(
          backgroundColor: Colors.green,
          foregroundColor: Colors.white,
          padding: const EdgeInsets.symmetric(vertical: 14),
        ),
        onPressed: onPressed,
        child: Text(label, style: const TextStyle(fontWeight: FontWeight.bold)),
      ),
    );
  }
}

class _ResultCard extends StatelessWidget {
  final Color color;
  final IconData icon;
  final String title;
  final List<Widget> details;
  final String? actionLabel;
  final VoidCallback onAction;

  const _ResultCard({
    required this.color,
    required this.icon,
    required this.title,
    required this.details,
    required this.actionLabel,
    required this.onAction,
  });

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
          ...details,
          if (actionLabel != null) ...[
            const SizedBox(height: 14),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(onPressed: onAction, child: Text(actionLabel!)),
            ),
          ],
        ],
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  final String label;
  final String value;
  final bool bold;

  const _InfoRow(this.label, this.value, {this.bold = false});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(width: 120, child: Text(label, style: const TextStyle(color: Colors.white38, fontSize: 13))),
          Expanded(
            child: Text(
              value,
              style: TextStyle(color: Colors.white, fontSize: bold ? 16 : 13.5, fontWeight: bold ? FontWeight.bold : FontWeight.w500),
            ),
          ),
        ],
      ),
    );
  }
}

String _vehicleLabel(Vehicle v) =>
    '${v.plate} - ${v.type.label}${v.description.isEmpty ? '' : ' - ${v.description}'}';

String _hhmm(DateTime t) => '${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')}';

String _durationLabel(Duration d) {
  final h = d.inHours;
  final m = d.inMinutes.remainder(60);
  return h > 0 ? '$h h $m min' : '$m min';
}
