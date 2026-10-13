import 'package:flutter/material.dart';
import 'data/mock_data.dart';
import 'screens/home_shell.dart';
import 'screens/welcome_screen.dart';
import 'services/api/api_client.dart';
import 'services/api/session_store.dart';
import 'services/parking_service.dart';
import 'services/remote_parking_service.dart';

void main() {
  runApp(const ParqueoAgilApp());
}

class ParqueoAgilApp extends StatefulWidget {
  /// Permite inyectar un servicio (ej. en pruebas): la app arranca
  /// directamente en la pantalla principal con ese servicio.
  final ParkingService? service;

  /// En pruebas automaticas no hay camara: se desactiva.
  final bool enableCamera;

  /// Donde se guarda la sesion (por defecto, almacenamiento seguro).
  final SessionStore? store;

  const ParqueoAgilApp({super.key, this.service, this.enableCamera = true, this.store});

  @override
  State<ParqueoAgilApp> createState() => _ParqueoAgilAppState();
}

class _ParqueoAgilAppState extends State<ParqueoAgilApp> {
  late final SessionStore _store = widget.store ?? SecureSessionStore();
  ParkingService? _service;
  ApiClient? _api;
  bool _booting = true;
  String _serverUrl = defaultServerUrl;
  String? _notice;

  @override
  void initState() {
    super.initState();
    if (widget.service != null) {
      _service = widget.service;
      _booting = false;
    } else {
      _restore();
    }
  }

  /// Si quedo una sesion guardada, entra directo con los datos del servidor.
  Future<void> _restore() async {
    _serverUrl = await _store.readServerUrl() ?? defaultServerUrl;
    final api = ApiClient(baseUrl: _serverUrl, store: _store);
    try {
      if (await api.restoreSession()) await _connect(api);
    } on ApiException catch (e) {
      _notice = e.isNetwork ? '${e.message} Puedes reintentar o usar el modo demo.' : e.message;
    }
    if (mounted) setState(() => _booting = false);
  }

  Future<void> _connect(ApiClient api) async {
    final service = await RemoteParkingService.connect(api);
    api.onSessionExpired = () => _signOut(notice: 'Tu sesion termino. Vuelve a iniciar sesion.');
    if (!mounted) {
      service.dispose();
      return;
    }
    setState(() {
      _api = api;
      _service = service;
      _notice = null;
    });
  }

  void _startDemo() => setState(() => _service = MockData.createService());

  Future<void> _signOut({String? notice}) async {
    final service = _service;
    final api = _api;
    setState(() {
      _service = null;
      _api = null;
      _notice = notice;
    });
    await api?.logout();
    if (service != widget.service) service?.dispose();
  }

  @override
  void dispose() {
    if (_service != widget.service) _service?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final service = _service;
    return MaterialApp(
      title: 'ParqueoÁgil',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        useMaterial3: true,
        brightness: Brightness.dark,
        scaffoldBackgroundColor: const Color(0xFF0B0F1E),
        colorScheme: ColorScheme.fromSeed(
          seedColor: Colors.blueAccent,
          brightness: Brightness.dark,
        ),
      ),
      home: _booting
          ? const Scaffold(body: Center(child: CircularProgressIndicator()))
          : service != null
              ? HomeShell(
                  key: ObjectKey(service),
                  service: service,
                  enableCamera: widget.enableCamera,
                  onSignOut: widget.service != null ? null : () => _signOut(),
                )
              : WelcomeScreen(
                  store: _store,
                  initialServerUrl: _serverUrl,
                  notice: _notice,
                  onAuthenticated: _connect,
                  onDemo: _startDemo,
                ),
    );
  }
}
