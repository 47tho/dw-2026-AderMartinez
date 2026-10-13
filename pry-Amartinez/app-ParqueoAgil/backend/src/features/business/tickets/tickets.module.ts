import { Module } from '@nestjs/common';
import { ClientsModule } from '../clients/clients.module.js';
import { ParkingZonesModule } from '../parking-zones/parking-zones.module.js';
import { CreateTicketUseCase } from './application/use-cases/create-ticket.use-case.js';
import { CloseTicketUseCase } from './application/use-cases/close-ticket.use-case.js';
import { GetTicketByIdUseCase } from './application/use-cases/get-ticket-by-id.use-case.js';
import { ListTicketsUseCase } from './application/use-cases/list-tickets.use-case.js';
import { TICKET_REPOSITORY } from './domain/interfaces/ticket.repository.js';
import { TicketRepository } from './infrastructure/persistence/repositories/ticket.repository.js';
import { TicketsController } from './presentation/http/controllers/tickets.controller.js';

@Module({
  imports: [ClientsModule, ParkingZonesModule],
  controllers: [TicketsController],
  providers: [
    CreateTicketUseCase,
    CloseTicketUseCase,
    GetTicketByIdUseCase,
    ListTicketsUseCase,
    { provide: TICKET_REPOSITORY, useClass: TicketRepository },
  ],
  exports: [TICKET_REPOSITORY, ListTicketsUseCase],
})
export class TicketsModule {}
