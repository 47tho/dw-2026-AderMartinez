import { Module } from '@nestjs/common';
import { TicketsModule } from '../tickets/tickets.module.js';
import { MeService } from './application/me.service.js';
import { MeController } from './presentation/me.controller.js';

/** "Mi cuenta" del conductor. Reutiliza el listado de tickets de `TicketsModule`. */
@Module({
  imports: [TicketsModule],
  controllers: [MeController],
  providers: [MeService],
})
export class MeModule {}
