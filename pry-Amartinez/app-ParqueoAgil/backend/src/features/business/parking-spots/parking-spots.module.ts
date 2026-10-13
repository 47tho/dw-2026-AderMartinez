import { Module } from '@nestjs/common';
import { ParkingSpotsService } from './application/parking-spots.service.js';
import { ParkingLayoutSeeder } from './infrastructure/persistence/seeders/parking-layout.seeder.js';
import { ParkingSpotsController } from './presentation/parking-spots.controller.js';

@Module({
  controllers: [ParkingSpotsController],
  providers: [ParkingSpotsService, ParkingLayoutSeeder],
  exports: [ParkingSpotsService, ParkingLayoutSeeder],
})
export class ParkingSpotsModule {}
