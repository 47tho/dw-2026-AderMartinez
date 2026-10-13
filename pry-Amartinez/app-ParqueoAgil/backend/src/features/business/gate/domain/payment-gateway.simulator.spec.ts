import { describe, expect, it } from 'vitest';
import { PaymentGatewaySimulator, type PaymentOutcome } from './payment-gateway.simulator.js';

/** Afirma que el pago fue aprobado y devuelve la autorización. */
function approvedAuthorization(outcome: PaymentOutcome): string {
  expect(outcome.approved).toBe(true);
  if (!outcome.approved) throw new Error(`Se esperaba aprobado, llegó: ${outcome.error}`);
  return outcome.authorization;
}

/** Afirma que el pago fue rechazado y devuelve el mensaje de error. */
function rejectionError(outcome: PaymentOutcome): string {
  expect(outcome.approved).toBe(false);
  if (outcome.approved) throw new Error(`Se esperaba rechazado, llegó: ${outcome.authorization}`);
  return outcome.error;
}

describe('PaymentGatewaySimulator', () => {
  const gateway = new PaymentGatewaySimulator(0);

  describe('chargeToken', () => {
    it('aprueba un token de prueba normal con una autorización que empieza por AUT', async () => {
      const outcome = await gateway.chargeToken('tok_test_visa_4242_1', 5000);
      const authorization = approvedAuthorization(outcome);
      expect(authorization.startsWith('AUT')).toBe(true);
      expect(authorization).toMatch(/^AUT\d{6}$/);
    });

    it('rechaza la tarjeta terminada en 0002 con un mensaje de tarjeta rechazada', async () => {
      const outcome = await gateway.chargeToken('tok_test_visa_0002_3', 5000);
      expect(rejectionError(outcome)).toContain('rechazada');
    });

    it('rechaza un token inventado con "no encontrada"', async () => {
      const outcome = await gateway.chargeToken('token-inventado', 5000);
      expect(rejectionError(outcome)).toContain('no encontrada');
    });

    it.each([
      ['cadena vacía', ''],
      ['sin el consecutivo final', 'tok_test_visa_4242'],
      ['últimos 4 con menos dígitos', 'tok_test_visa_424_1'],
      ['últimos 4 con más dígitos', 'tok_test_visa_42421_1'],
      ['marca en mayúsculas', 'tok_test_VISA_4242_1'],
      ['prefijo distinto', 'tok_live_visa_4242_1'],
      ['con texto antes', 'x_tok_test_visa_4242_1'],
      ['con texto después', 'tok_test_visa_4242_1x'],
    ])('rechaza como no encontrado un token mal formado (%s)', async (_label, token) => {
      const outcome = await gateway.chargeToken(token, 5000);
      expect(rejectionError(outcome)).toContain('no encontrada');
    });

    it('reconoce distintas marcas con otros últimos 4 dígitos', async () => {
      for (const token of ['tok_test_mastercard_5555_2', 'tok_test_amex_0005_10', 'tok_test_visa_0001_1']) {
        const outcome = await gateway.chargeToken(token, 12000);
        expect(approvedAuthorization(outcome)).toMatch(/^AUT\d{6}$/);
      }
    });

    it('el rechazo de 0002 aplica a cualquier marca y consecutivo', async () => {
      for (const token of ['tok_test_mastercard_0002_1', 'tok_test_amex_0002_99']) {
        const outcome = await gateway.chargeToken(token, 12000);
        expect(rejectionError(outcome)).toContain('rechazada');
      }
    });

    it('el rechazo no depende del monto', async () => {
      const outcome = await gateway.chargeToken('tok_test_visa_0002_3', 1);
      expect(rejectionError(outcome)).toContain('rechazada');
    });
  });

  describe('chargeCardPresent (datáfono)', () => {
    it('siempre aprueba con una autorización AUT', async () => {
      const outcome = await gateway.chargeCardPresent(8000);
      expect(approvedAuthorization(outcome)).toMatch(/^AUT\d{6}$/);
    });

    it('aprueba también con montos extremos', async () => {
      expect((await gateway.chargeCardPresent(0)).approved).toBe(true);
      expect((await gateway.chargeCardPresent(10_000_000)).approved).toBe(true);
    });
  });

  describe('confirmQrTransfer (QR)', () => {
    it('siempre aprueba con una autorización AUT', async () => {
      const outcome = await gateway.confirmQrTransfer('REF-123', 8000);
      expect(approvedAuthorization(outcome)).toMatch(/^AUT\d{6}$/);
    });

    it('aprueba aunque la referencia esté vacía', async () => {
      expect((await gateway.confirmQrTransfer('', 8000)).approved).toBe(true);
    });
  });

  describe('autorizaciones', () => {
    it('siempre tienen 6 dígitos entre 100000 y 999999', async () => {
      for (let i = 0; i < 25; i++) {
        const authorization = approvedAuthorization(await gateway.chargeCardPresent(1000));
        const digits = Number(authorization.slice(3));
        expect(digits).toBeGreaterThanOrEqual(100000);
        expect(digits).toBeLessThan(1000000);
      }
    });
  });

  describe('latencia', () => {
    it('con latencia 0 responde sin demora apreciable', async () => {
      const start = Date.now();
      await gateway.chargeToken('tok_test_visa_4242_1', 1000);
      expect(Date.now() - start).toBeLessThan(250);
    });

    it('con latencia positiva espera antes de responder', async () => {
      const slow = new PaymentGatewaySimulator(60);
      const start = performance.now();
      await slow.chargeCardPresent(1000);
      // Margen por la imprecisión de los temporizadores.
      expect(performance.now() - start).toBeGreaterThanOrEqual(50);
    });
  });
});
