import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'screens/home_shell.dart';
import 'screens/reader_screen.dart';
import 'screens/welcome_screen.dart';
import 'services/api/api_client.dart';
import 'services/api/session_store.dart';
import 'services/gate_reader.dart';
import 'services/parking_service.dart';
import 'services/remote_parking_service.dart';

void main() {
  runApp(const ParqueoAgilApp());
}

/// La app tiene dos perfiles segun la cuenta que inicia sesion:
///  - conductor (rol DRIVER): sus vehiculos, su QR, el mapa y sus pagos;
///  - lector de QR (rol LECTOR): solo la pantalla para leer el QR en porteria.
class ParqueoAgilApp extends StatefulWidget {
  /// Permite inyectar un servicio (ej. en pruebas): la app arranca
  /// directamente en la pantalla del conductor con ese servicio.
  final ParkingService? service;

  /// En pruebas automaticas no hay camara: se desactiva.
  final bool enableCamera;

  /// Donde se guarda la sesion (por defecto, almacenamiento seguro).
  final SessionStore? store;

  /// Cliente HTTP (en pruebas, un servidor falso).
  final http.Client? httpClient;

  const ParqueoAgilApp({super.key, this.service, this.enableCamera = true, this.store, this.httpClient});

  @override
  State<ParqueoAgilApp> createState() => _ParqueoAgilAppState();
}

class _ParqueoAgilAppState extends State<ParqueoAgilApp> {
  late final SessionStore _store = widget.store ?? SecureSessionStore();
  ParkingService? _service;
  GateReader? _reader;
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

  ApiClient _client(String url) => ApiClient(baseUrl: url, store: _store, httpClient: widget.httpClient);

  /// Si quedo una sesion guardada, entra directo con el perfil de esa cuenta.
  Future<void> _restore() async {
    _serverUrl = await _store.readServerUrl() ?? defaultServerUrl;
    final api = _client(_serverUrl);
    try {
      if (await api.restoreSession()) await _connect(api);
    } on ApiException catch (e) {
      _notice = e.isNetwork ? '${e.message} Revisa la conexion e intenta de nuevo.' : e.message;
    }
    if (mounted) setState(() => _booting = false);
  }

  /// Abre la app con el perfil de la cuenta: conductor si tiene perfil de
  /// conductor, lector si puede leer QR en porteria. Otra cuenta (ej. el
  /// administrador del panel web) no puede usar la app.
  Future<void> _connect(ApiClient api) async {
    api.onSessionExpired = () => _signOut(notice: 'Tu sesion termino. Vuelve a iniciar sesion.');
    try {
      final service = await RemoteParkingService.connect(api);
      if (!mounted) {
        service.dispose();
        return;
      }
      setState(() {
        _api = api;
        _service = service;
        _notice = null;
      });
      return;
    } on ApiException catch (e) {
      // 403 = el rol no puede ver /me (ej. LECTOR); 404 = sin perfil de conductor (ej. ADMIN).
      if (e.status != 403 && e.status != 404) rethrow;
    }

    if (await GateReader.canRead(api)) {
      if (!mounted) return;
      setState(() {
        _api = api;
        _reader = GateReader(api);
        _notice = null;
      });
      return;
    }
    await api.logout();
    throw const ApiException(
        403, 'Esta cuenta no puede usar la app. Entra con una cuenta de conductor o de lector de QR.');
  }

  Future<void> _signOut({String? notice}) async {
    final service = _service;
    final api = _api;
    setState(() {
      _service = null;
      _reader = null;
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
    final reader = _reader;
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
                  onSignOut: widget.service != null ? null : () => _signOut(),
                )
              : reader != null
                  ? ReaderScreen(
                      key: ObjectKey(reader),
                      reader: reader,
                      enableCamera: widget.enableCamera,
                      onSignOut: () => _signOut(),
                    )
                  : WelcomeScreen(
                      store: _store,
                      initialServerUrl: _serverUrl,
                      notice: _notice,
                      httpClient: widget.httpClient,
                      onAuthenticated: _connect,
                    ),
    );
  }
}
