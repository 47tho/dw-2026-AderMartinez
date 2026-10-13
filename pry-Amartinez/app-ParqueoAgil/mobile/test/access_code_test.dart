import 'package:flutter_test/flutter_test.dart';
import 'package:parqueoagil/services/access_code.dart';

void main() {
  const key = 'clave-de-prueba';
  final now = DateTime(2026, 10, 5, 10, 0, 7);

  AccessCodeStatus check(String raw, {String k = key, DateTime? at}) {
    return AccessCode.verify(AccessCode.parse(raw)!, key: k, now: at ?? now);
  }

  test('un QR recien generado es valido e identifica al vehiculo', () {
    final raw = AccessCode.generate(vehicleId: 'v1', key: key, now: now);
    expect(raw, startsWith('PQA1.v1.'));
    expect(AccessCode.parse(raw)!.vehicleId, 'v1');
    expect(check(raw), AccessCodeStatus.valid);
  });

  test('vigencia: se acepta el QR anterior, no uno de hace un minuto', () {
    final previous = AccessCode.generate(vehicleId: 'v1', key: key, now: now.subtract(const Duration(seconds: 30)));
    final old = AccessCode.generate(vehicleId: 'v1', key: key, now: now.subtract(const Duration(seconds: 60)));
    final ahead = AccessCode.generate(vehicleId: 'v1', key: key, now: now.add(const Duration(seconds: 30)));
    expect(check(previous), AccessCodeStatus.valid);
    expect(check(old), AccessCodeStatus.expired);
    expect(check(ahead), AccessCodeStatus.valid); // reloj del celular adelantado
  });

  test('sin la clave del usuario no se puede fabricar un QR valido', () {
    final forged = AccessCode.generate(vehicleId: 'v1', key: 'otra-clave', now: now);
    expect(check(forged), AccessCodeStatus.badSignature);
  });

  test('cambiar el vehiculo o el contador dentro del QR invalida la firma', () {
    final raw = AccessCode.generate(vehicleId: 'v1', key: key, now: now, counter: 3);
    expect(check(raw), AccessCodeStatus.valid);
    expect(check(raw.replaceFirst('.v1.', '.v2.')), AccessCodeStatus.badSignature);
    expect(check(raw.replaceFirst('.3.', '.4.')), AccessCodeStatus.badSignature);
  });

  test('el contador produce un QR distinto en la misma ventana de 30 s', () {
    final first = AccessCode.generate(vehicleId: 'v1', key: key, now: now, counter: 1);
    final second = AccessCode.generate(vehicleId: 'v1', key: key, now: now, counter: 2);
    expect(first, isNot(second));
  });

  test('textos que no son QR de ParqueoAgil', () {
    for (final raw in [
      'hola',
      'https://www.ejemplo.com',
      'PQA1.v1.123.0',
      'PQA2.v1.1.0.0123456789abcdef',
      'PQA1.v1.x.0.0123456789abcdef',
      'PQA1.v1.1.x.0123456789abcdef',
      'PQA1.v1.1.0.NOESHEXADECIMAL00',
      'PQA1..1.0.0123456789abcdef',
    ]) {
      expect(AccessCode.parse(raw), isNull, reason: raw);
    }
  });

  test('cuenta regresiva entre 1 y 30 segundos', () {
    expect(AccessCode.secondsLeft(DateTime.fromMillisecondsSinceEpoch(30000)), 30);
    expect(AccessCode.secondsLeft(DateTime.fromMillisecondsSinceEpoch(59000)), 1);
  });
}
