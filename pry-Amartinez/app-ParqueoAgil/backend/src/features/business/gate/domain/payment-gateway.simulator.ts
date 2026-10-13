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
 */
export class PaymentGatewaySimulator {
  constructor(private readonly latencyMs = 400) {}

  async chargeToken(token: string, _amount: number): Promise<PaymentOutcome> {
    await this.wait();
    const match = /^tok_test_[a-z]+_(\d{4})_\d+$/.exec(token);
    if (!match) return { approved: false, error: 'Tarjeta no encontrada en la pasarela' };
    if (match[1] === '0002') return { approved: false, error: 'Tarjeta rechazada: fondos insuficientes' };
    return { approved: true, authorization: this.authorization() };
  }

  /** Pago con tarjeta en el datáfono de la caja. */
  async chargeCardPresent(_amount: number): Promise<PaymentOutcome> {
    await this.wait();
    return { approved: true, authorization: this.authorization() };
  }

  /** Confirmación de una transferencia por QR (Bre-B, Nequi, Daviplata). */
  async confirmQrTransfer(_reference: string, _amount: number): Promise<PaymentOutcome> {
    await this.wait();
    return { approved: true, authorization: this.authorization() };
  }

  private authorization(): string {
    return `AUT${randomInt(100000, 999999)}`;
  }

  private wait(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, this.latencyMs));
  }
}
