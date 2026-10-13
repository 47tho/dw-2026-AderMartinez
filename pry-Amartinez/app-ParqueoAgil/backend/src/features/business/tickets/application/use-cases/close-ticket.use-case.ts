import { Inject, Injectable } from '@nestjs/common';
import { TICKET_REPOSITORY } from '../../domain/interfaces/ticket.repository.js';
import type { ITicketRepository } from '../../domain/interfaces/ticket.repository.js';
import { TicketNotFoundException } from '../../domain/exceptions/ticket-not-found.exception.js';
import { TicketAlreadyClosedException } from '../../domain/exceptions/ticket-already-closed.exception.js';
import type { Ticket } from '../../domain/entities/ticket.entity.js';
import { EventsService } from '../../../events/application/events.service.js';
import { CloseTicketDto } from '../dto/close-ticket.dto.js';

/**
 * Cierra un ticket sin pasar por el cobro de la portería (cierre
 * administrativo). El valor se calcula por fracciones en el repositorio,
 * dentro de la misma transacción que libera el espacio.
 */
@Injectable()
export class CloseTicketUseCase {
  constructor(
    @Inject(TICKET_REPOSITORY) private readonly ticketRepo: ITicketRepository,
    private readonly events: EventsService,
  ) {}

  async execute(id: number, dto: CloseTicketDto): Promise<Ticket> {
    const ticket = await this.ticketRepo.findById(id);
    if (!ticket) {
      throw new TicketNotFoundException(id);
    }
    if (ticket.status === 'closed') {
      throw new TicketAlreadyClosedException(id);
    }

    const closed = await this.ticketRepo.closeTicket(id, new Date(), {
      tax: dto.tax,
      discounts: dto.discounts,
    });
    this.events.publishTicket('ticket.closed', closed);
    await this.events.publishOccupancy(closed.parkingZoneId, closed.parkingSpotId);
    return closed;
  }
}
