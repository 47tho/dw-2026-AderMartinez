import { describe, expect, it } from 'vitest';
import { isOperationGranted } from '../../../../../shared/auth/resource-match.js';
import { DRIVER_RESOURCES, LECTOR_RESOURCES, RESOURCE_CATALOG } from './resource-catalog.js';

describe('Catálogo de recursos', () => {
  it('no repite ninguna operación', () => {
    const keys = RESOURCE_CATALOG.map((r) => `${r.method} ${r.path}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  describe('rol LECTOR (lector de QR en la app)', () => {
    it('solo puede leer el QR y hacer el cobro automático', () => {
      expect(LECTOR_RESOURCES.map((r) => `${r.method} ${r.path}`)).toEqual([
        'POST /api/gate/scan',
        'POST /api/tickets/:id/auto-pay',
      ]);
    });

    it('no puede cobrar en efectivo ni registrar placas a mano', () => {
      expect(isOperationGranted(LECTOR_RESOURCES, 'POST', '/api/tickets/40/pay')).toBe(false);
      expect(isOperationGranted(LECTOR_RESOURCES, 'POST', '/api/gate/manual-entry')).toBe(false);
      expect(isOperationGranted(LECTOR_RESOURCES, 'POST', '/api/tickets/40/auto-pay')).toBe(true);
    });

    it('no tiene perfil de conductor ni ve el plano', () => {
      expect(isOperationGranted(LECTOR_RESOURCES, 'GET', '/api/me')).toBe(false);
      expect(isOperationGranted(LECTOR_RESOURCES, 'GET', '/api/parking-spots')).toBe(false);
    });
  });

  it('el conductor no puede leer QR en portería', () => {
    expect(isOperationGranted(DRIVER_RESOURCES, 'POST', '/api/gate/scan')).toBe(false);
  });
});
