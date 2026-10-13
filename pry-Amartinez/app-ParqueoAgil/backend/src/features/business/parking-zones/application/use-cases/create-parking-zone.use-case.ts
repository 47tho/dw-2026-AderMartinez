import { Inject, Injectable } from '@nestjs/common';
import { BusinessRuleException } from '../../../../../common/exceptions/business-rule.exception.js';
import { ParkingSpotsService } from '../../../parking-spots/application/parking-spots.service.js';
import { EventsService } from '../../../events/application/events.service.js';
import { VEHICLE_TYPE_REPOSITORY } from '../../../vehicle-types/domain/interfaces/vehicle-type.repository.js';
import type { IVehicleTypeRepository } from '../../../vehicle-types/domain/interfaces/vehicle-type.repository.js';
import { VehicleTypeNotFoundException } from '../../../vehicle-types/domain/exceptions/vehicle-type-not-found.exception.js';
import { VehicleTypeInactiveException } from '../../domain/exceptions/vehicle-type-inactive.exception.js';
import { PARKING_ZONE_REPOSITORY } from '../../domain/interfaces/parking-zone.repository.js';
import type { IParkingZoneRepository } from '../../domain/interfaces/parking-zone.repository.js';
import type { ParkingZone } from '../../domain/entities/parking-zone.entity.js';
import { CreateParkingZoneDto } from '../dto/create-parking-zone.dto.js';
import { ParkingZoneMapper } from '../mappers/parking-zone.mapper.js';

@Injectable()
export class CreateParkingZoneUseCase {
  constructor(
    @Inject(PARKING_ZONE_REPOSITORY) private readonly zoneRepo: IParkingZoneRepository,
    @Inject(VEHICLE_TYPE_REPOSITORY) private readonly typeRepo: IVehicleTypeRepository,
    private readonly spots: ParkingSpotsService,
    private readonly events: EventsService,
  ) {}

  async execute(dto: CreateParkingZoneDto): Promise<ParkingZone> {
    const type = await this.typeRepo.findById(dto.vehicleTypeId);
    if (!type) {
      throw new VehicleTypeNotFoundException(dto.vehicleTypeId);
    }
    if (type.status !== 'active') {
      throw new VehicleTypeInactiveException(dto.vehicleTypeId);
    }
    if (dto.code && (await this.zoneRepo.findByCode(dto.code))) {
      throw new BusinessRuleException(`Ya existe una zona con la letra ${dto.code}`);
    }
    const zone = await this.zoneRepo.create(ParkingZoneMapper.toEntity(dto));
    // Los espacios individuales (A01, A02...) se generan con la zona.
    await this.spots.ensureSpotsForZone(zone.id!);
    await this.events.publishOccupancy(zone.id!);
    return zone;
  }
}
