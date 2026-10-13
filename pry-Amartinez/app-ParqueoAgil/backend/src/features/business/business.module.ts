import { Module } from '@nestjs/common';
import { ClientsModule } from './clients/clients.module.js';
import { VehicleTypesModule } from './vehicle-types/vehicle-types.module.js';
import { ParkingZonesModule } from './parking-zones/parking-zones.module.js';
import { TicketsModule } from './tickets/tickets.module.js';
// ── Integración app móvil + panel web ──
import { EventsModule } from './events/events.controller.js';
import { ParkingSpotsModule } from './parking-spots/parking-spots.module.js';
import { DriversModule } from './drivers/drivers.module.js';
import { GateModule } from './gate/gate.module.js';
import { ReportsModule } from './reports/reports.controller.js';
import { MeModule } from './me/me.module.js';

@Module({
  imports: [
    EventsModule,
    ClientsModule,
    VehicleTypesModule,
    ParkingZonesModule,
    TicketsModule,
    ParkingSpotsModule,
    DriversModule,
    GateModule,
    ReportsModule,
    MeModule,
  ],
  exports: [
    ClientsModule,
    VehicleTypesModule,
    ParkingZonesModule,
    TicketsModule,
    ParkingSpotsModule,
    DriversModule,
    GateModule,
  ],
})
export class BusinessModule {}
