import { Module } from '@nestjs/common';
import { DriversService } from './application/drivers.service.js';
import { DriversSeeder } from './infrastructure/persistence/seeders/drivers.seeder.js';
import { DriversController } from './presentation/drivers.controller.js';

/** SessionService llega por AuthModule (global). */
@Module({
  controllers: [DriversController],
  providers: [DriversService, DriversSeeder],
  exports: [DriversService, DriversSeeder],
})
export class DriversModule {}
