import { ParkingZone } from '../../domain/entities/parking-zone.entity.js';
import { CreateParkingZoneDto } from '../dto/create-parking-zone.dto.js';

export class ParkingZoneMapper {
  static toEntity(dto: CreateParkingZoneDto): ParkingZone {
    return new ParkingZone({
      name: dto.name,
      vehicleTypeId: dto.vehicleTypeId,
      capacity: dto.capacity,
      availableSpots: dto.availableSpots ?? dto.capacity,
      hourlyRate: dto.hourlyRate,
      status: 'active',
      code: dto.code ?? null,
      floor: dto.floor ?? 1,
      position: dto.position ?? 0,
      color: dto.color ?? null,
    });
  }

  static toResponse(z: ParkingZone) {
    return {
      id: z.id,
      name: z.name,
      vehicleTypeId: z.vehicleTypeId,
      capacity: z.capacity,
      availableSpots: z.availableSpots,
      hourlyRate: z.hourlyRate,
      status: z.status,
      code: z.code,
      floor: z.floor,
      position: z.position,
      color: z.color,
    };
  }
}
