import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { AccessCode, type ParsedAccessCode } from './access-code.js';

const key = 'clave-de-prueba';
const now = Date.UTC(2026, 9, 5, 15, 0, 7);

/** Genera, separa y verifica un QR producido en `generatedAtMs`, visto en `verifiedAtMs`. */
function statusOf(generatedAtMs: number, verifiedAtMs = now, verifyKey = key, vehicleId = '12', counter = 0) {
  const text = AccessCode.generate(vehicleId, key, generatedAtMs, counter);
  const parsed = AccessCode.parse(text);
  expect(parsed).not.toBeNull();
  return AccessCode.verify(parsed as ParsedAccessCode, verifyKey, verifiedAtMs);
}

describe('AccessCode.windowAt', () => {
  it('cambia cada 30 segundos', () => {
    const start = Date.UTC(2026, 9, 5, 15, 0, 0);
    expect(AccessCode.windowAt(start + 29_999)).toBe(AccessCode.windowAt(start));
    expect(AccessCode.windowAt(start + 30_000)).toBe(AccessCode.windowAt(start) + 1);
  });

  it('es el segundo UNIX dividido entre 30, hacia abajo', () => {
    expect(AccessCode.windowAt(now)).toBe(Math.floor(now / 1000 / 30));
    expect(AccessCode.windowAt(0)).toBe(0);
    expect(AccessCode.windowAt(29_999)).toBe(0);
    expect(AccessCode.windowAt(30_000)).toBe(1);
  });
});

describe('AccessCode.generate', () => {
  it('un código recién generado empieza por PQA1.12.', () => {
    const text = AccessCode.generate('12', key, now);
    expect(text.startsWith('PQA1.12.')).toBe(true);
  });

  it('tiene la forma PQA1.<vehiculo>.<ventana>.<contador>.<firma de 16 hex>', () => {
    const text = AccessCode.generate('12', key, now, 3);
    const window = AccessCode.windowAt(now);
    expect(text).toMatch(/^PQA1\.12\.\d+\.3\.[0-9a-f]{16}$/);
    expect(text.split('.')[2]).toBe(String(window));
  });

  it('el contador por defecto es 0', () => {
    expect(AccessCode.parse(AccessCode.generate('12', key, now))?.counter).toBe(0);
  });

  it('es determinista para la misma ventana', () => {
    expect(AccessCode.generate('12', key, now)).toBe(AccessCode.generate('12', key, now + 5_000));
  });

  it('cambia al pasar a la siguiente ventana', () => {
    expect(AccessCode.generate('12', key, now)).not.toBe(AccessCode.generate('12', key, now + 30_000));
  });

  it('contadores distintos en la misma ventana dan códigos distintos', () => {
    const a = AccessCode.generate('12', key, now, 0);
    const b = AccessCode.generate('12', key, now, 1);
    expect(a).not.toBe(b);
    expect(AccessCode.parse(a)?.signature).not.toBe(AccessCode.parse(b)?.signature);
  });
});

describe('AccessCode.sign (compatibilidad con la app)', () => {
  it('es HMAC-SHA256(clave, "PQA1|vehiculo|ventana|contador") en hex, primeros 16 caracteres', () => {
    const window = AccessCode.windowAt(now);
    const expected = createHmac('sha256', key).update(`PQA1|12|${window}|0`).digest('hex').slice(0, 16);
    expect(AccessCode.sign('12', window, 0, key)).toBe(expected);
    expect(expected).toHaveLength(16);
  });

  it('coincide con un vector fijo calculado por separado', () => {
    // Vector independiente (calculado con node:crypto): ventana 59707080 = now.
    expect(AccessCode.windowAt(now)).toBe(59707080);
    expect(AccessCode.sign('12', 59707080, 0, key)).toBe('b4b18f78b8a980d6');
    expect(AccessCode.sign('12', 59707080, 7, key)).toBe('42237a3174f1b155');
  });

  it('generate incluye exactamente esa firma', () => {
    const window = AccessCode.windowAt(now);
    expect(AccessCode.generate('12', key, now, 7)).toBe(`PQA1.12.${window}.7.${AccessCode.sign('12', window, 7, key)}`);
  });

  it('cada componente cambia la firma', () => {
    const base = AccessCode.sign('12', 100, 0, key);
    expect(AccessCode.sign('13', 100, 0, key)).not.toBe(base);
    expect(AccessCode.sign('12', 101, 0, key)).not.toBe(base);
    expect(AccessCode.sign('12', 100, 1, key)).not.toBe(base);
    expect(AccessCode.sign('12', 100, 0, 'otra-clave')).not.toBe(base);
  });
});

describe('AccessCode.parse', () => {
  it('separa un código válido en sus partes', () => {
    const window = AccessCode.windowAt(now);
    const text = AccessCode.generate('12', key, now, 4);
    expect(AccessCode.parse(text)).toEqual({
      vehicleId: '12',
      window,
      counter: 4,
      signature: AccessCode.sign('12', window, 4, key),
      raw: text,
    });
  });

  it('recorta espacios y saltos de línea alrededor', () => {
    const text = AccessCode.generate('12', key, now, 2);
    const parsed = AccessCode.parse(`  \n${text}\t \r\n`);
    expect(parsed).not.toBeNull();
    expect(parsed?.raw).toBe(text);
    expect(parsed?.vehicleId).toBe('12');
    expect(parsed?.counter).toBe(2);
  });

  it.each([
    ['texto cualquiera', 'hola'],
    ['una URL', 'https://www.ejemplo.com'],
    ['faltan partes (4 en vez de 5)', 'PQA1.12.123.0'],
    ['prefijo de otra versión', 'PQA2.12.1.0.0123456789abcdef'],
    ['ventana no numérica', 'PQA1.12.x.0.0123456789abcdef'],
    ['contador no numérico', 'PQA1.12.1.x.0123456789abcdef'],
    ['firma que no es hexadecimal', 'PQA1.12.1.0.NOESHEXADECIMAL00'],
    ['vehículo vacío', 'PQA1..1.0.0123456789abcdef'],
    ['contador con cero a la izquierda (reusaría un QR ya leído)', 'PQA1.12.1.00.0123456789abcdef'],
    ['contador -0', 'PQA1.12.1.-0.0123456789abcdef'],
    ['ventana con cero a la izquierda', 'PQA1.12.0123.0.0123456789abcdef'],
  ])('devuelve null para %s', (_label, raw) => {
    expect(AccessCode.parse(raw)).toBeNull();
  });

  it('devuelve null para la cadena vacía y para partes extra', () => {
    expect(AccessCode.parse('')).toBeNull();
    expect(AccessCode.parse('   ')).toBeNull();
    expect(AccessCode.parse('PQA1.12.1.0.0123456789abcdef.extra')).toBeNull();
  });

  it('rechaza firmas con mayúsculas o de longitud incorrecta', () => {
    expect(AccessCode.parse('PQA1.12.1.0.0123456789ABCDEF')).toBeNull();
    expect(AccessCode.parse('PQA1.12.1.0.0123456789abcde')).toBeNull();
    expect(AccessCode.parse('PQA1.12.1.0.0123456789abcdef0')).toBeNull();
  });

  it('el prefijo distingue mayúsculas de minúsculas', () => {
    expect(AccessCode.parse('pqa1.12.1.0.0123456789abcdef')).toBeNull();
  });
});

describe('AccessCode.verify', () => {
  it('un código recién generado es valid', () => {
    expect(statusOf(now)).toBe('valid');
  });

  it('el generado hace 30 s es valid (ventana anterior)', () => {
    expect(statusOf(now - 30_000)).toBe('valid');
  });

  it('el generado hace 60 s está expired', () => {
    expect(statusOf(now - 60_000)).toBe('expired');
  });

  it('el generado 30 s adelante es valid (reloj del celular adelantado)', () => {
    expect(statusOf(now + 30_000)).toBe('valid');
  });

  it('el generado 60 s adelante está expired', () => {
    expect(statusOf(now + 60_000)).toBe('expired');
  });

  it('generado con otra clave es badSignature', () => {
    expect(statusOf(now, now, 'otra-clave')).toBe('badSignature');
  });

  it('cambiar el vehículo (.12. por .13.) es badSignature', () => {
    const text = AccessCode.generate('12', key, now).replace('.12.', '.13.');
    expect(text.startsWith('PQA1.13.')).toBe(true);
    const parsed = AccessCode.parse(text) as ParsedAccessCode;
    expect(AccessCode.verify(parsed, key, now)).toBe('badSignature');
  });

  it('cambiar el contador dentro del texto es badSignature', () => {
    const window = AccessCode.windowAt(now);
    const text = AccessCode.generate('12', key, now, 5).replace(`.${window}.5.`, `.${window}.6.`);
    const parsed = AccessCode.parse(text) as ParsedAccessCode;
    expect(parsed.counter).toBe(6);
    expect(AccessCode.verify(parsed, key, now)).toBe('badSignature');
  });

  it('cambiar la ventana dentro del texto es badSignature', () => {
    const window = AccessCode.windowAt(now);
    const text = AccessCode.generate('12', key, now).replace(`.${window}.`, `.${window + 1}.`);
    const parsed = AccessCode.parse(text) as ParsedAccessCode;
    expect(AccessCode.verify(parsed, key, now)).toBe('badSignature');
  });

  it('cambiar un carácter de la firma es badSignature', () => {
    const text = AccessCode.generate('12', key, now);
    const last = text.slice(-1);
    const tampered = text.slice(0, -1) + (last === '0' ? '1' : '0');
    const parsed = AccessCode.parse(tampered) as ParsedAccessCode;
    expect(AccessCode.verify(parsed, key, now)).toBe('badSignature');
  });

  it('una firma falsa y vencida es badSignature (la firma se revisa primero)', () => {
    const parsed = AccessCode.parse('PQA1.12.1.0.0123456789abcdef') as ParsedAccessCode;
    expect(AccessCode.verify(parsed, key, now)).toBe('badSignature');
  });

  it('el contador firmado sigue siendo valid mientras la ventana sea vigente', () => {
    expect(statusOf(now, now, key, '12', 42)).toBe('valid');
  });
});
