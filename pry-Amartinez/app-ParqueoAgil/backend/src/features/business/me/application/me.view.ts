import type { ClientModel } from '../../clients/infrastructure/persistence/models/client.model.js';
import type { DriverModel } from '../../drivers/infrastructure/persistence/models/driver.model.js';
import { vehicleKindOf } from '../../vehicles/domain/vehicle-rules.js';
import type { VehicleTypeModel } from '../../vehicle-types/infrastructure/persistence/models/vehicle-type.model.js';

/** '3,1,2' → [3, 1, 2] (las zonas preferidas se guardan como texto separado por comas). */
export function parseZoneIds(csv: string | null | undefined): number[] {
  return (csv ?? '')
    .split(',')
    .map((s) => Number(s))
    .filter((n) => Number.isInteger(n) && n > 0);
}

/** `driver` del contrato. Nunca incluye el token de la tarjeta. */
export function toDriverView(driver: DriverModel, client: ClientModel) {
  return {
    id: driver.id,
    clientId: driver.clientId,
    name: client.name,
    phone: client.phone ?? null,
    docType: driver.docType,
    docNumber: driver.docNumber,
    qrSecret: driver.qrSecret,
    preferredZoneIds: parseZoneIds(driver.preferredZoneIds),
    preferredSpotId: driver.preferredSpotId ?? null,
    paymentMethod: driver.paymentMethod,
    card: driver.cardToken ? { brand: driver.cardBrand ?? '', last4: driver.cardLast4 ?? '' } : null,
  };
}

/** `VehicleTypeRef` del contrato. */
export function toVehicleTypeRef(type: VehicleTypeModel) {
  return {
    id: type.id,
    name: type.name,
    kind: vehicleKindOf(type.name),
    hourlyRate: Number(type.hourlyRate),
  };
}
