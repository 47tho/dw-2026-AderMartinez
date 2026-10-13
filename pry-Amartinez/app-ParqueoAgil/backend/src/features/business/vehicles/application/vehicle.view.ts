import type { VehicleModel } from '../infrastructure/persistence/models/vehicle.model.js';
import { vehicleKindOf } from '../domain/vehicle-rules.js';

export interface ActiveTicketRef {
  id: number;
  spotCode: string | null;
  zoneId: number;
  entryAt: Date;
}

/**
 * Proyección de un vehículo para la API (`Vehicle` en el contrato).
 * Requiere `vehicleType` incluido en la consulta.
 */
export function toVehicleView(vehicle: VehicleModel, activeTicket: ActiveTicketRef | null = null) {
  return {
    id: vehicle.id,
    plate: vehicle.plate,
    vehicleTypeId: vehicle.vehicleTypeId,
    kind: vehicleKindOf(vehicle.vehicleType?.name),
    description: vehicle.description ?? null,
    gateCounter: vehicle.gateCounter,
    activeTicket,
  };
}
