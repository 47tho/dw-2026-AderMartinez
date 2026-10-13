import { createHmac, timingSafeEqual } from 'node:crypto';

export type AccessCodeStatus = 'valid' | 'badSignature' | 'expired';

export interface ParsedAccessCode {
  vehicleId: string;
  window: number;
  counter: number;
  signature: string;
  raw: string;
}

/**
 * QR de acceso dinámico que genera la app del conductor (sin internet):
 *
 *   PQA1.<vehiculo>.<ventana>.<contador>.<firma>
 *
 * - <ventana> cambia cada 30 s: un pantallazo deja de servir rápido.
 * - <contador> cambia con cada entrada o salida: el QR de salida nunca es el
 *   mismo que se acaba de usar para entrar.
 * - <firma> = primeros 16 hex de HMAC-SHA256(clave del conductor,
 *   "PQA1|vehiculo|ventana|contador"). Sin la clave no se puede fabricar.
 *
 * Es la misma implementación que `lib/services/access_code.dart` de la app;
 * las pruebas de ambos lados usan los mismos casos.
 */
export class AccessCode {
  static readonly prefix = 'PQA1';
  static readonly periodSeconds = 30;

  static windowAt(timeMs: number): number {
    return Math.floor(Math.floor(timeMs / 1000) / AccessCode.periodSeconds);
  }

  static sign(vehicleId: string, window: number, counter: number, key: string): string {
    return createHmac('sha256', key)
      .update(`${AccessCode.prefix}|${vehicleId}|${window}|${counter}`)
      .digest('hex')
      .slice(0, 16);
  }

  static generate(vehicleId: string, key: string, nowMs: number, counter = 0): string {
    const window = AccessCode.windowAt(nowMs);
    return `${AccessCode.prefix}.${vehicleId}.${window}.${counter}.${AccessCode.sign(vehicleId, window, counter, key)}`;
  }

  /** Separa el texto del QR. `null` si no es un QR de ParqueoÁgil. */
  static parse(raw: string): ParsedAccessCode | null {
    const text = raw.trim();
    const parts = text.split('.');
    if (parts.length !== 5 || parts[0] !== AccessCode.prefix || parts[1] === '') return null;
    if (!/^-?\d+$/.test(parts[2]) || !/^-?\d+$/.test(parts[3])) return null;
    if (!/^[0-9a-f]{16}$/.test(parts[4])) return null;
    return {
      vehicleId: parts[1],
      window: Number(parts[2]),
      counter: Number(parts[3]),
      signature: parts[4],
      raw: text,
    };
  }

  /**
   * Firma y vigencia. Se acepta la ventana actual, la anterior (el QR que se
   * mostraba justo antes de renovarse) y una adelante (reloj del celular
   * adelantado).
   */
  static verify(code: ParsedAccessCode, key: string, nowMs: number): AccessCodeStatus {
    const expected = AccessCode.sign(code.vehicleId, code.window, code.counter, key);
    const same = timingSafeEqual(Buffer.from(code.signature), Buffer.from(expected));
    if (!same) return 'badSignature';
    const age = AccessCode.windowAt(nowMs) - code.window;
    if (age > 1 || age < -1) return 'expired';
    return 'valid';
  }
}
