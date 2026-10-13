import { Module } from '@nestjs/common';
import { TicketsModule } from '../tickets/tickets.module.js';
import { GateService } from './application/gate.service.js';
import { DemoActivitySeeder } from './infrastructure/demo-activity.seeder.js';
import { GateController, TicketPaymentsController } from './presentation/gate.controller.js';

@Module({
  imports: [TicketsModule],
  controllers: [GateController, TicketPaymentsController],
  providers: [GateService, DemoActivitySeeder],
  exports: [GateService, DemoActivitySeeder],
})
export class GateModule {}
