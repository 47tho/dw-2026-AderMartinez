import { Inject, Injectable } from '@nestjs/common';
import { TICKET_REPOSITORY } from '../../domain/interfaces/ticket.repository.js';
import type { ITicketRepository, TicketFilters } from '../../domain/interfaces/ticket.repository.js';
import { TicketMapper } from '../mappers/ticket.mapper.js';

@Injectable()
export class ListTicketsUseCase {
  constructor(
    @Inject(TICKET_REPOSITORY) private readonly ticketRepo: ITicketRepository,
  ) {}

  async execute(query: TicketFilters & { page?: number; limit?: number }) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const { items, total } = await this.ticketRepo.findPage(
      { status: query.status, zoneId: query.zoneId, plate: query.plate, vehicleIds: query.vehicleIds },
      page,
      limit,
    );
    return {
      items: items.map(TicketMapper.toResponse),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }
}
