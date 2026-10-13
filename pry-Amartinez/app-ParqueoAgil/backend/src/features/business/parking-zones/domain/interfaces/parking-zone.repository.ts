import { ParkingZone } from '../entities/parking-zone.entity.js';

export const PARKING_ZONE_REPOSITORY = 'IParkingZoneRepository';

export interface IParkingZoneRepository {
  create(parkingZone: ParkingZone): Promise<ParkingZone>;
  findAll(page: number, limit: number): Promise<{ items: ParkingZone[]; total: number }>;
  findById(id: number): Promise<ParkingZone | null>;
  findByCode(code: string): Promise<ParkingZone | null>;
  count(): Promise<number>;
}
