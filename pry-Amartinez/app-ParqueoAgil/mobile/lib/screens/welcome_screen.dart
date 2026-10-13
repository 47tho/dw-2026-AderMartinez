import 'package:flutter/material.dart';
import '../models/user_account.dart';
import '../services/api/api_client.dart';
import '../services/api/session_store.dart';

/// Direccion por defecto del backend. En un celular por USB funciona con
/// `adb reverse tcp:3003 tcp:3003`; en el emulador de Android usar
/// http://10.0.2.2:3003/api; en la misma red Wi-Fi, la IP del computador.
const defaultServerUrl = 'http://localhost:3003/api';

/// Bienvenida: iniciar sesion o crear la cuenta de conductor contra el
/// servidor, o entrar al modo demo (sin servidor).
class WelcomeScreen extends StatefulWidget {
  final SessionStore store;
  final String initialServerUrl;
  final String? notice;
  final Future<void> Function(ApiClient api) onAuthenticated;
  final VoidCallback onDemo;

  const WelcomeScreen({
    super.key,
    required this.store,
    required this.initialServerUrl,
    required this.onAuthenticated,
    required this.onDemo,
    this.notice,
  });

  @override
  State<WelcomeScreen> createState() => _WelcomeScreenState();
}

class _WelcomeScreenState extends State<WelcomeScreen> {
  final _form = GlobalKey<FormState>();
  late final _server = TextEditingController(text: widget.initialServerUrl);
  final _identifier = TextEditingController();
  final _password = TextEditingController();
  final _name = TextEditingController();
  final _phone = TextEditingController();
  final _docNumber = TextEditingController();
  String _docType = 'CC';
  bool _register = false;
  bool _busy = false;
  bool _showPassword = false;
  bool _showServer = false;
  late String? _error = widget.notice;

  @override
  void dispose() {
    for (final c in [_server, _identifier, _password, _name, _phone, _docNumber]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_form.currentState!.validate()) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    final url = _server.text.trim();
    final api = ApiClient(baseUrl: url, store: widget.store);
    try {
      await widget.store.writeServerUrl(url);
      if (_register) {
        await api.register(
          name: _name.text.trim(),
          email: _identifier.text.trim(),
          password: _password.text,
          phone: _phone.text.trim(),
          docType: _docType,
          docNumber: _docNumber.text.trim(),
        );
      } else {
        await api.login(_identifier.text.trim(), _password.text);
      }
      await widget.onAuthenticated(api);
    } on ApiException catch (e) {
      if (e.status == 404) await api.logout(); // cuenta del personal: no tiene perfil de conductor
      setState(() => _error = e.status == 401 && !_register ? 'Correo o contrasena incorrectos.' : e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Form(
                key: _form,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const Icon(Icons.local_parking, size: 56, color: Colors.blueAccent),
                    const SizedBox(height: 8),
                    const Text('ParqueoÁgil',
                        textAlign: TextAlign.center,
                        style: TextStyle(color: Colors.white, fontSize: 26, fontWeight: FontWeight.bold)),
                    const Text('Tu celular es el tiquete',
                        textAlign: TextAlign.center, style: TextStyle(color: Colors.white54)),
                    const SizedBox(height: 24),
                    SegmentedButton<bool>(
                      segments: const [
                        ButtonSegment(value: false, label: Text('Iniciar sesion')),
                        ButtonSegment(value: true, label: Text('Crear cuenta')),
                      ],
                      selected: {_register},
                      onSelectionChanged: _busy ? null : (s) => setState(() => _register = s.first),
                    ),
                    const SizedBox(height: 20),
                    if (_register) ..._registerFields(),
                    TextFormField(
                      controller: _identifier,
                      enabled: !_busy,
                      keyboardType: TextInputType.emailAddress,
                      autofillHints: const [AutofillHints.email],
                      decoration: InputDecoration(labelText: _register ? 'Correo' : 'Correo o usuario'),
                      validator: (v) => (v == null || v.trim().length < 3)
                          ? 'Escribe tu correo'
                          : (_register && !v.contains('@') ? 'Correo invalido' : null),
                    ),
                    const SizedBox(height: 12),
                    TextFormField(
                      controller: _password,
                      enabled: !_busy,
                      obscureText: !_showPassword,
                      autofillHints: const [AutofillHints.password],
                      decoration: InputDecoration(
                        labelText: 'Contrasena',
                        suffixIcon: IconButton(
                          tooltip: _showPassword ? 'Ocultar contrasena' : 'Mostrar contrasena',
                          icon: Icon(_showPassword ? Icons.visibility_off : Icons.visibility),
                          onPressed: () => setState(() => _showPassword = !_showPassword),
                        ),
                      ),
                      validator: (v) => (v == null || v.length < 8) ? 'Minimo 8 caracteres' : null,
                    ),
                    if (_error != null) ...[
                      const SizedBox(height: 16),
                      Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: Colors.redAccent.withValues(alpha: 0.12),
                          borderRadius: BorderRadius.circular(10),
                          border: Border.all(color: Colors.redAccent.withValues(alpha: 0.5)),
                        ),
                        child: Text(_error!, style: const TextStyle(color: Colors.redAccent)),
                      ),
                    ],
                    const SizedBox(height: 20),
                    FilledButton(
                      onPressed: _busy ? null : _submit,
                      style: FilledButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 14)),
                      child: _busy
                          ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2.5))
                          : Text(_register ? 'Crear cuenta' : 'Entrar'),
                    ),
                    const SizedBox(height: 8),
                    TextButton.icon(
                      onPressed: _busy ? null : () => setState(() => _showServer = !_showServer),
                      icon: const Icon(Icons.dns_outlined, size: 18),
                      label: Text(_showServer ? 'Ocultar servidor' : 'Servidor: ${_server.text}'),
                    ),
                    if (_showServer) ...[
                      TextFormField(
                        controller: _server,
                        enabled: !_busy,
                        keyboardType: TextInputType.url,
                        decoration: const InputDecoration(
                          labelText: 'Direccion de la API',
                          helperMaxLines: 3,
                          helperText: 'Celular por USB: localhost con "adb reverse tcp:3003 tcp:3003". '
                              'Emulador: http://10.0.2.2:3003/api. Wi-Fi: la IP del computador.',
                        ),
                        validator: (v) => Uri.tryParse(v ?? '')?.hasScheme == true ? null : 'Ej: http://192.168.1.10:3003/api',
                      ),
                    ],
                    const Divider(height: 32),
                    OutlinedButton.icon(
                      onPressed: _busy ? null : widget.onDemo,
                      icon: const Icon(Icons.science_outlined),
                      label: const Text('Probar sin servidor (modo demo)'),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  List<Widget> _registerFields() => [
        TextFormField(
          controller: _name,
          enabled: !_busy,
          textCapitalization: TextCapitalization.words,
          autofillHints: const [AutofillHints.name],
          decoration: const InputDecoration(labelText: 'Nombre completo'),
          validator: UserAccount.validateName,
        ),
        const SizedBox(height: 12),
        Row(
          children: [
            SizedBox(
              width: 90,
              child: DropdownButtonFormField<String>(
                initialValue: _docType,
                decoration: const InputDecoration(labelText: 'Tipo'),
                items: [for (final t in [...UserAccount.docTypes, 'TI']) DropdownMenuItem(value: t, child: Text(t))],
                onChanged: _busy ? null : (v) => setState(() => _docType = v ?? 'CC'),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: TextFormField(
                controller: _docNumber,
                enabled: !_busy,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(labelText: 'Numero de documento'),
                validator: UserAccount.validateDocNumber,
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        TextFormField(
          controller: _phone,
          enabled: !_busy,
          keyboardType: TextInputType.phone,
          autofillHints: const [AutofillHints.telephoneNumber],
          decoration: const InputDecoration(labelText: 'Celular'),
          validator: UserAccount.validatePhone,
        ),
        const SizedBox(height: 12),
      ];
}
