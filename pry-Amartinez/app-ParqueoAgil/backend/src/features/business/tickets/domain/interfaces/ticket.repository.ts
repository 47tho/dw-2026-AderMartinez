import { Ticket } from '../entities/ticket.entity.js';
import type { TicketStatus } from '../entities/ticket.entity.js';

export const TICKET_REPOSITORY = 'ITicketRepository';

export interface TicketFilters {
  status?: TicketStatus;
  zoneId?: number;
  plate?: string;
  /** Limita a estos vehículos (historial del conductor). */
  vehicleIds?: number[];
}

export interface ITicketRepository {
  createOpen(ticket: Ticket): Promise<Ticket>;
  closeTicket(
    id: number,
    exitAt: Date,
    adjustments?: { tax?: number; discounts?: number },
  ): Promise<Ticket>;
  findById(id: number): Promise<Ticket | null>;
  findOpenByZone(parkingZoneId: number): Promise<Ticket[]>;
  findPage(
    filters: TicketFilters,
    page: number,
    limit: number,
  ): Promise<{ items: Ticket[]; total: number }>;
}
