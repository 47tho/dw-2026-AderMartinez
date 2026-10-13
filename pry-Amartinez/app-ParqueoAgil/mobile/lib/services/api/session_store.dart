import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Donde la app guarda la sesion y la direccion del servidor.
abstract class SessionStore {
  Future<String?> readRefreshToken();
  Future<void> writeRefreshToken(String token);
  Future<void> clearSession();
  Future<String?> readServerUrl();
  Future<void> writeServerUrl(String url);
}

/// Almacenamiento seguro del sistema (Keystore en Android, Keychain en iOS).
/// El refresh token es una credencial: nunca va a preferencias en texto plano.
class SecureSessionStore implements SessionStore {
  static const _refreshKey = 'pqa.refresh_token';
  static const _serverKey = 'pqa.server_url';

  final FlutterSecureStorage _storage;

  SecureSessionStore([FlutterSecureStorage? storage]) : _storage = storage ?? const FlutterSecureStorage();

  @override
  Future<String?> readRefreshToken() => _safe(() => _storage.read(key: _refreshKey));

  @override
  Future<void> writeRefreshToken(String token) => _storage.write(key: _refreshKey, value: token);

  @override
  Future<void> clearSession() => _storage.delete(key: _refreshKey);

  @override
  Future<String?> readServerUrl() => _safe(() => _storage.read(key: _serverKey));

  @override
  Future<void> writeServerUrl(String url) => _storage.write(key: _serverKey, value: url);

  Future<String?> _safe(Future<String?> Function() read) async {
    try {
      return await read();
    } catch (e) {
      // Un almacen dañado (ej. tras restaurar el celular) no debe bloquear la app.
      debugPrint('SecureSessionStore: $e');
      return null;
    }
  }
}

/// En memoria, para pruebas.
class MemorySessionStore implements SessionStore {
  String? refreshToken;
  String? serverUrl;

  MemorySessionStore({this.refreshToken, this.serverUrl});

  @override
  Future<String?> readRefreshToken() async => refreshToken;

  @override
  Future<void> writeRefreshToken(String token) async => refreshToken = token;

  @override
  Future<void> clearSession() async => refreshToken = null;

  @override
  Future<String?> readServerUrl() async => serverUrl;

  @override
  Future<void> writeServerUrl(String url) async => serverUrl = url;
}
