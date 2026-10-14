import { randomInt } from 'node:crypto';

export type PaymentOutcome =
  | { approved: true; authorization: string }
  | { approved: false; error: string };

/**
 * Pasarela de pagos SIMULADA del lado del servidor.
 *
 * En producción la app tokeniza la tarjeta con el widget de la pasarela
 * (Wompi, ePayco, Mercado Pago...) y el servidor cobra contra ese token. Aquí
 * se reconocen los tokens de prueba que genera la app
 * (`tok_test_<marca>_<ultimos4>_<n>`): la tarjeta terminada en 0002 siempre se
 * rechaza para poder mostrar el manejo de errores.
 *
 * `reference` es la clave de idempotencia (como el Idempotency-Key de las
 * pasarelas reales): reintentar un cobro con la misma referencia devuelve la
 * misma aprobación en vez de cobrar otra vez.
 */
export class PaymentGatewaySimulator {
  private readonly approved = new Map<string, string>();

  constructor(private readonly latencyMs = 400) {}

  async chargeToken(token: string, _amount: number, reference?: string): Promise<PaymentOutcome> {
    await this.wait();
    const previous = reference ? this.approved.get(reference) : undefined;
    if (previous) return { approved: true, authorization: previous };
    const match = /^tok_test_[a-z]+_(\d{4})_\d+$/.exec(token);
    if (!match) return { approved: false, error: 'Tarjeta no encontrada en la pasarela' };
    if (match[1] === '0002') return { approved: false, error: 'Tarjeta rechazada: fondos insuficientes' };
    return { approved: true, authorization: this.authorize(reference) };
  }

  /** Pago con tarjeta en el datáfono de la caja. */
  async chargeCardPresent(_amount: number, reference?: string): Promise<PaymentOutcome> {
    await this.wait();
    const previous = reference ? this.approved.get(reference) : undefined;
    return { approved: true, authorization: previous ?? this.authorize(reference) };
  }

  /** Confirmación de una transferencia por QR (Bre-B, Nequi, Daviplata). */
  async confirmQrTransfer(_reference: string, _amount: number): Promise<PaymentOutcome> {
    await this.wait();
    return { approved: true, authorization: this.authorization() };
  }

  private authorization(): string {
    return `AUT${randomInt(100000, 999999)}`;
  }

  private authorize(reference?: string): string {
    const code = this.authorization();
    if (reference) this.approved.set(reference, code);
    return code;
  }

  private wait(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, this.latencyMs));
  }
}
