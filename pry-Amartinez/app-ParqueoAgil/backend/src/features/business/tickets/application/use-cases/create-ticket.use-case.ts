import { Inject, Injectable } from '@nestjs/common';
import { CLIENT_REPOSITORY } from '../../../clients/domain/interfaces/client.repository.js';
import type { IClientRepository } from '../../../clients/domain/interfaces/client.repository.js';
import { ClientNotFoundException } from '../../../clients/domain/exceptions/client-not-found.exception.js';
import { PARKING_ZONE_REPOSITORY } from '../../../parking-zones/domain/interfaces/parking-zone.repository.js';
import type { IParkingZoneRepository } from '../../../parking-zones/domain/interfaces/parking-zone.repository.js';
import { ParkingZoneNotFoundException } from '../../../parking-zones/domain/exceptions/parking-zone-not-found.exception.js';
import { Ticket } from '../../domain/entities/ticket.entity.js';
import { TICKET_REPOSITORY } from '../../domain/interfaces/ticket.repository.js';
import type { ITicketRepository } from '../../domain/interfaces/ticket.repository.js';
import { EventsService } from '../../../events/application/events.service.js';
import { CreateTicketDto } from '../dto/create-ticket.dto.js';

@Injectable()
export class CreateTicketUseCase {
  constructor(
    @Inject(CLIENT_REPOSITORY) private readonly clientRepo: IClientRepository,
    @Inject(PARKING_ZONE_REPOSITORY) private readonly zoneRepo: IParkingZoneRepository,
    @Inject(TICKET_REPOSITORY) private readonly ticketRepo: ITicketRepository,
    private readonly events: EventsService,
  ) {}

  async execute(dto: CreateTicketDto): Promise<Ticket> {
    const client = await this.clientRepo.findById(dto.clientId);
    if (!client) {
      throw new ClientNotFoundException(dto.clientId);
    }

    const zone = await this.zoneRepo.findById(dto.parkingZoneId);
    if (!zone) {
      throw new ParkingZoneNotFoundException(dto.parkingZoneId);
    }

    // Regla de dominio: si no hay cupos, lanza 409.
    zone.occupySpot(1);

    const entryAt = new Date();
    const ticket = new Ticket({
      clientId: dto.clientId,
      parkingZoneId: dto.parkingZoneId,
      entryAt,
      hourlyRate: zone.hourlyRate,
      subtotal: 0,
      tax: dto.tax ?? 0,
      discounts: dto.discounts ?? 0,
      total: 0,
      status: 'open',
    });

    const created = await this.ticketRepo.createOpen(ticket);
    this.events.publishTicket('ticket.opened', created);
    await this.events.publishOccupancy(created.parkingZoneId, created.parkingSpotId);
    return created;
  }
}
