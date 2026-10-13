import { ApplicationException } from '../../../../common/exceptions/application.exception.js';

export type VehicleKind = 'car' | 'motorcycle' | 'van';

/**
 * Clase de vehículo a partir del nombre de su tipo ('Automóvil',
 * 'Motocicleta', 'Camioneta'). Decide el formato de placa y el ícono en las
 * apps; las zonas se siguen asignando por `vehicleTypeId`.
 */
export function vehicleKindOf(typeName: string | null | undefined): VehicleKind {
  const name = (typeName ?? '').toLowerCase();
  if (name.includes('moto')) return 'motorcycle';
  if (name.includes('camioneta') || name.includes('van') || name.includes('cami')) return 'van';
  return 'car';
}

/** 'abc 123' → 'ABC123' */
export function normalizePlate(value: string): string {
  return value.toUpperCase().replace(/[\s-]/g, '');
}

/**
 * Placas colombianas: carro y camioneta ABC123; moto ABC12D (o ABC12 en las
 * antiguas). Lanza 422 con el formato esperado.
 */
export function assertValidPlate(plate: string, kind: VehicleKind): void {
  const pattern = kind === 'motorcycle' ? /^[A-Z]{3}\d{2}[A-Z]?$/ : /^[A-Z]{3}\d{3}$/;
  if (!pattern.test(plate)) {
    const hint = kind === 'motorcycle' ? 'ABC12D' : 'ABC123';
    throw new ApplicationException(422, `Formato de placa inválido: ${plate || '(vacía)'}. Ejemplo: ${hint}`);
  }
}
