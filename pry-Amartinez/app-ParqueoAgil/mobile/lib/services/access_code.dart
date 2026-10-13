import 'dart:convert';
import 'package:crypto/crypto.dart';

enum AccessCodeStatus { valid, badSignature, expired }

/// Contenido de un QR de ParqueoAgil ya separado en sus partes.
class ParsedAccessCode {
  final String vehicleId;
  final int window;
  final int counter;
  final String signature;
  final String raw;

  const ParsedAccessCode(this.vehicleId, this.window, this.counter, this.signature, this.raw);
}

/// QR de acceso dinamico, con el formato
///   PQA1.<vehiculo>.<ventana>.<contador>.<firma>
///
/// - <ventana> cambia cada [periodSeconds] segundos, asi que el QR se
///   renueva solo y un pantallazo deja de servir rapido.
/// - <contador> cambia con cada entrada o salida del vehiculo: asi el
///   QR de salida nunca es el mismo que se acaba de usar para entrar.
/// - <firma> es un HMAC-SHA256 con la clave del usuario: sin la clave
///   no se puede fabricar un QR valido, aunque se conozca la placa.
/// - Se genera sin internet (como los codigos de los bancos); la
///   terminal lo valida con la copia de la clave que tiene el servidor.
class AccessCode {
  static const prefix = 'PQA1';
  static const periodSeconds = 30;

  static int windowAt(DateTime time) => time.millisecondsSinceEpoch ~/ 1000 ~/ periodSeconds;

  /// Segundos que le quedan al QR actual antes de renovarse.
  static int secondsLeft(DateTime time) {
    final seconds = time.millisecondsSinceEpoch ~/ 1000;
    return periodSeconds - seconds % periodSeconds;
  }

  static String generate({required String vehicleId, required String key, required DateTime now, int counter = 0}) {
    final window = windowAt(now);
    return '$prefix.$vehicleId.$window.$counter.${_sign(vehicleId, window, counter, key)}';
  }

  /// Separa el texto del QR. Devuelve null si no es un QR de ParqueoAgil.
  static ParsedAccessCode? parse(String raw) {
    final parts = raw.trim().split('.');
    if (parts.length != 5 || parts[0] != prefix || parts[1].isEmpty) return null;
    final window = int.tryParse(parts[2]);
    final counter = int.tryParse(parts[3]);
    if (window == null || counter == null || !RegExp(r'^[0-9a-f]{16}$').hasMatch(parts[4])) return null;
    return ParsedAccessCode(parts[1], window, counter, parts[4], raw.trim());
  }

  /// Valida la firma y la vigencia. Se acepta la ventana actual y la
  /// anterior (el QR que se estaba mostrando justo antes de renovarse),
  /// y una hacia adelante por si el reloj del celular esta adelantado.
  static AccessCodeStatus verify(ParsedAccessCode code, {required String key, required DateTime now}) {
    if (!_equals(code.signature, _sign(code.vehicleId, code.window, code.counter, key))) {
      return AccessCodeStatus.badSignature;
    }
    final age = windowAt(now) - code.window;
    if (age > 1 || age < -1) return AccessCodeStatus.expired;
    return AccessCodeStatus.valid;
  }

  static String _sign(String vehicleId, int window, int counter, String key) {
    final mac = Hmac(sha256, utf8.encode(key)).convert(utf8.encode('$prefix|$vehicleId|$window|$counter'));
    return mac.toString().substring(0, 16);
  }

  /// Comparacion en tiempo constante para no filtrar la firma por tiempos.
  static bool _equals(String a, String b) {
    if (a.length != b.length) return false;
    var diff = 0;
    for (var i = 0; i < a.length; i++) {
      diff |= a.codeUnitAt(i) ^ b.codeUnitAt(i);
    }
    return diff == 0;
  }
}
