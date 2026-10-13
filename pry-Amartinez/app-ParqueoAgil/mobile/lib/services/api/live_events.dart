import 'dart:async';
import 'dart:convert';
import 'dart:math';
import 'package:http/http.dart' as http;
import 'api_client.dart';

/// Cliente del flujo SSE `GET /api/events` del backend.
///
/// Se lee con una peticion HTTP normal para poder enviar el header
/// `Authorization`. Si la conexion se cae, reintenta con espera creciente
/// (1, 2, 4... hasta 15 s) y renueva el token si hace falta.
///
/// Nota: en Flutter web el cliente HTTP del navegador no entrega la
/// respuesta por partes, por eso alli la app actualiza por intervalos.
class LiveEvents {
  final ApiClient api;
  final void Function(String type, Map<String, dynamic> data) onEvent;

  http.Client? _client;
  bool _closed = false;
  int _attempt = 0;

  LiveEvents(this.api, this.onEvent);

  void start() => unawaited(_loop());

  void close() {
    _closed = true;
    _client?.close();
  }

  Future<void> _loop() async {
    while (!_closed) {
      final client = http.Client();
      _client = client;
      try {
        final token = await api.accessToken();
        if (token == null) return;
        final request = http.Request('GET', api.uri('/events'))
          ..headers.addAll({'Authorization': 'Bearer $token', 'Accept': 'text/event-stream'});
        final response = await client.send(request);
        if (response.statusCode != 200) throw Exception('SSE ${response.statusCode}');
        _attempt = 0;

        var buffer = '';
        await for (final chunk in response.stream.transform(utf8.decoder)) {
          buffer += chunk.replaceAll('\r\n', '\n');
          var boundary = buffer.indexOf('\n\n');
          while (boundary != -1) {
            _dispatch(buffer.substring(0, boundary));
            buffer = buffer.substring(boundary + 2);
            boundary = buffer.indexOf('\n\n');
          }
        }
      } catch (_) {
        // Se reintenta abajo.
      } finally {
        client.close();
      }
      if (_closed) return;
      await Future<void>.delayed(Duration(seconds: min(15, 1 << min(_attempt++, 4))));
    }
  }

  void _dispatch(String block) {
    var type = 'message';
    final data = <String>[];
    for (final line in block.split('\n')) {
      if (line.startsWith('event:')) type = line.substring(6).trim();
      if (line.startsWith('data:')) data.add(line.substring(5).trimLeft());
    }
    if (type == 'ping' || data.isEmpty) return;
    try {
      final decoded = jsonDecode(data.join('\n'));
      if (decoded is Map<String, dynamic>) onEvent(type, decoded);
    } catch (_) {
      // Evento mal formado: se ignora.
    }
  }
}
