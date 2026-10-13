import { Module } from '@nestjs/common';
import { VehicleTypesModule } from '../vehicle-types/vehicle-types.module.js';
import { ParkingSpotsModule } from '../parking-spots/parking-spots.module.js';
import { CreateParkingZoneUseCase } from './application/use-cases/create-parking-zone.use-case.js';
import { GetParkingZoneByIdUseCase } from './application/use-cases/get-parking-zone-by-id.use-case.js';
import { ListParkingZonesUseCase } from './application/use-cases/list-parking-zones.use-case.js';
import { PARKING_ZONE_REPOSITORY } from './domain/interfaces/parking-zone.repository.js';
import { ParkingZoneRepository } from './infrastructure/persistence/repositories/parking-zone.repository.js';
import { ParkingZoneSeeder } from './infrastructure/persistence/seeders/parking-zone.seeder.js';
import { ParkingZonesController } from './presentation/http/controllers/parking-zones.controller.js';

@Module({
  imports: [VehicleTypesModule, ParkingSpotsModule],
  controllers: [ParkingZonesController],
  providers: [
    CreateParkingZoneUseCase,
    ListParkingZonesUseCase,
    GetParkingZoneByIdUseCase,
    ParkingZoneSeeder,
    { provide: PARKING_ZONE_REPOSITORY, useClass: ParkingZoneRepository },
  ],
  exports: [PARKING_ZONE_REPOSITORY, ParkingZoneSeeder],
})
export class ParkingZonesModule {}
