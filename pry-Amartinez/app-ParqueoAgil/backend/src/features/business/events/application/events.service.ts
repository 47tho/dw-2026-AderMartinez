import { Inject, Injectable } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';
import { Sequelize } from 'sequelize-typescript';
import { SEQUELIZE } from '../../../../infrastructure/database/sequelize/sequelize.module.js';
import { ParkingSpotModel } from '../../parking-spots/infrastructure/persistence/models/parking-spot.model.js';
import { ParkingZoneModel } from '../../parking-zones/infrastructure/persistence/models/parking-zone.model.js';
import { TicketMapper } from '../../tickets/application/mappers/ticket.mapper.js';
import type { Ticket } from '../../tickets/domain/entities/ticket.entity.js';

export type ParkingEventType =
  | 'spot.updated'
  | 'zone.updated'
  | 'ticket.opened'
  | 'ticket.quoted'
  | 'ticket.closed';

export interface ParkingEvent {
  type: ParkingEventType;
  data: unknown;
  /**
   * Dueño del dato. `undefined` = público (estado de espacios y zonas, sin
   * placas). Con valor, el conductor solo lo recibe si es su `clientId`.
   */
  clientId?: number;
}

/**
 * Bus de eventos en memoria para el tiempo real (SSE).
 *
 * Los casos de uso publican aquí después de confirmar la transacción; el
 * controller de `/api/events` filtra según quién escucha. En un despliegue
 * con varias instancias esto se reemplaza por Redis pub/sub sin tocar a
 * quienes publican.
 */
@Injectable()
export class EventsService {
  private readonly subject = new Subject<ParkingEvent>();

  constructor(@Inject(SEQUELIZE) private readonly sequelize: Sequelize) {}

  stream(): Observable<ParkingEvent> {
    return this.subject.asObservable();
  }

  publish(event: ParkingEvent): void {
    this.subject.next(event);
  }

  publishTicket(type: 'ticket.opened' | 'ticket.quoted' | 'ticket.closed', ticket: Ticket): void {
    this.publish({ type, data: TicketMapper.toResponse(ticket), clientId: ticket.clientId });
  }

  /** Publica el estado actual de un espacio y de su zona. */
  async publishOccupancy(zoneId: number, spotId?: number | null): Promise<void> {
    if (spotId) {
      const spot = await this.sequelize.getRepository(ParkingSpotModel).findByPk(spotId);
      if (spot) this.publish({ type: 'spot.updated', data: toSpotView(spot) });
    }
    const zone = await this.sequelize.getRepository(ParkingZoneModel).findByPk(zoneId);
    if (zone) {
      this.publish({
        type: 'zone.updated',
        data: { id: zone.id, availableSpots: zone.availableSpots, capacity: zone.capacity },
      });
    }
  }
}

/** Proyección pública de un espacio (no incluye quién lo ocupa). */
export function toSpotView(spot: ParkingSpotModel) {
  return {
    id: spot.id,
    code: spot.code,
    zoneId: spot.parkingZoneId,
    row: spot.rowIndex,
    column: spot.colIndex,
    status: spot.status,
  };
}
