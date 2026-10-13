import 'dart:async';
import 'dart:convert';
import 'package:http/http.dart' as http;
import 'session_store.dart';

/// Error de la API con el mensaje del backend (ya viene en espanol).
class ApiException implements Exception {
  final int status;
  final String message;

  const ApiException(this.status, this.message);

  bool get isNetwork => status == 0;

  @override
  String toString() => message;
}

/// Cliente HTTP del backend de ParqueoAgil.
///
/// - Desenvuelve la respuesta `{ statusCode, message, data }` y devuelve `data`.
/// - Agrega `Authorization: Bearer` y, si el servidor responde 401, renueva
///   el access token con el refresh token una sola vez y reintenta.
/// - El refresh token vive en el almacenamiento seguro del celular
///   ([SessionStore]); el access token solo en memoria.
class ApiClient {
  final String baseUrl;
  final SessionStore store;
  final http.Client _http;
  final Duration timeout;

  String? _accessToken;
  DateTime _accessExpiresAt = DateTime.fromMillisecondsSinceEpoch(0);
  Future<bool>? _refreshing;

  /// Se llama cuando la sesion ya no se puede renovar (hay que volver a entrar).
  void Function()? onSessionExpired;

  ApiClient({
    required this.baseUrl,
    required this.store,
    http.Client? httpClient,
    this.timeout = const Duration(seconds: 12),
  }) : _http = httpClient ?? http.Client();

  http.Client get httpClient => _http;

  Uri uri(String path, [Map<String, String>? query]) {
    final base = baseUrl.endsWith('/') ? baseUrl.substring(0, baseUrl.length - 1) : baseUrl;
    return Uri.parse('$base$path').replace(queryParameters: query == null || query.isEmpty ? null : query);
  }

  // ------------------------------------------------------------- sesion

  Future<void> login(String identifier, String password) async {
    final data = await _send('POST', '/sesion/login', body: {'identifier': identifier, 'password': password}, auth: false);
    await _storeTokens(data as Map<String, dynamic>);
  }

  Future<void> register({
    required String name,
    required String email,
    required String password,
    required String phone,
    required String docType,
    required String docNumber,
  }) async {
    final data = await _send('POST', '/drivers/register',
        body: {
          'name': name,
          'email': email,
          'password': password,
          'phone': phone,
          'docType': docType,
          'docNumber': docNumber,
        },
        auth: false);
    await _storeTokens(data as Map<String, dynamic>);
  }

  /// true si hay un refresh token guardado que todavia sirve.
  Future<bool> restoreSession() async {
    if (await store.readRefreshToken() == null) return false;
    return _refresh();
  }

  Future<void> logout() async {
    final refresh = await store.readRefreshToken();
    _accessToken = null;
    await store.clearSession();
    if (refresh != null) {
      try {
        await _send('POST', '/sesion/logout', body: {'refresh_token': refresh}, auth: false);
      } catch (_) {
        // Sin conexion: la sesion ya quedo cerrada en el celular.
      }
    }
  }

  /// Access token vigente (lo renueva si vence en menos de 30 s).
  Future<String?> accessToken() async {
    if (_accessToken != null && DateTime.now().isBefore(_accessExpiresAt.subtract(const Duration(seconds: 30)))) {
      return _accessToken;
    }
    return await _refresh() ? _accessToken : null;
  }

  // -------------------------------------------------------------- verbos

  Future<dynamic> get(String path, [Map<String, String>? query]) => _send('GET', path, query: query);
  Future<dynamic> post(String path, [Object? body]) => _send('POST', path, body: body);
  Future<dynamic> patch(String path, [Object? body]) => _send('PATCH', path, body: body);
  Future<dynamic> put(String path, [Object? body]) => _send('PUT', path, body: body);
  Future<dynamic> delete(String path) => _send('DELETE', path);

  Future<dynamic> _send(String method, String path,
      {Object? body, Map<String, String>? query, bool auth = true, bool retried = false}) async {
    final headers = <String, String>{'Content-Type': 'application/json', 'Accept': 'application/json'};
    if (auth) {
      final token = await accessToken();
      if (token == null) throw const ApiException(401, 'Tu sesion termino. Vuelve a iniciar sesion.');
      headers['Authorization'] = 'Bearer $token';
    }

    final request = http.Request(method, uri(path, query))..headers.addAll(headers);
    if (body != null) request.body = jsonEncode(body);

    final http.Response response;
    try {
      response = await http.Response.fromStream(await _http.send(request).timeout(timeout));
    } on TimeoutException {
      throw const ApiException(0, 'El servidor no responde. Revisa la conexion.');
    } catch (_) {
      throw ApiException(0, 'No hay conexion con el servidor ($baseUrl).');
    }

    if (response.statusCode == 401 && auth && !retried && await _refresh()) {
      return _send(method, path, body: body, query: query, auth: auth, retried: true);
    }

    final decoded = _decode(response.bodyBytes);
    if (response.statusCode >= 200 && response.statusCode < 300) {
      return decoded is Map<String, dynamic> && decoded.containsKey('data') ? decoded['data'] : decoded;
    }
    final message = decoded is Map<String, dynamic> ? decoded['message']?.toString() : null;
    throw ApiException(response.statusCode, message ?? 'Error ${response.statusCode}');
  }

  /// El backend responde JSON en UTF-8 (tildes y la Ñ de los mensajes).
  dynamic _decode(List<int> bytes) {
    if (bytes.isEmpty) return null;
    try {
      return jsonDecode(utf8.decode(bytes, allowMalformed: true));
    } catch (_) {
      return null;
    }
  }

  // ------------------------------------------------------------- tokens

  /// Renueva una sola vez aunque varias peticiones fallen a la vez.
  Future<bool> _refresh() => _refreshing ??= _doRefresh().whenComplete(() => _refreshing = null);

  Future<bool> _doRefresh() async {
    final refresh = await store.readRefreshToken();
    if (refresh == null) return false;
    try {
      final data = await _send('POST', '/sesion/refresh', body: {'refresh_token': refresh}, auth: false);
      await _storeTokens(data as Map<String, dynamic>);
      return true;
    } on ApiException catch (e) {
      if (e.isNetwork) rethrow;
      _accessToken = null;
      await store.clearSession();
      onSessionExpired?.call();
      return false;
    }
  }

  Future<void> _storeTokens(Map<String, dynamic> tokens) async {
    _accessToken = tokens['access_token'] as String;
    _accessExpiresAt = DateTime.now().add(Duration(seconds: (tokens['expires_in'] as num).toInt()));
    await store.writeRefreshToken(tokens['refresh_token'] as String);
  }

  void close() => _http.close();
}
