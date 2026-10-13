import { Inject, Injectable } from '@nestjs/common';
import { Transaction } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { ApplicationException } from '../../../../common/exceptions/application.exception.js';
import { SEQUELIZE } from '../../../../infrastructure/database/sequelize/sequelize.module.js';
import { EventsService, toSpotView } from '../../events/application/events.service.js';
import { ParkingZoneModel } from '../../parking-zones/infrastructure/persistence/models/parking-zone.model.js';
import { ParkingSpotModel } from '../infrastructure/persistence/models/parking-spot.model.js';

/** Espacios por fila en el plano generado automáticamente. */
export const SPOTS_PER_ROW = 6;

@Injectable()
export class ParkingSpotsService {
  constructor(
    @Inject(SEQUELIZE) private readonly sequelize: Sequelize,
    private readonly events: EventsService,
  ) {}

  private get spots() {
    return this.sequelize.getRepository(ParkingSpotModel);
  }

  async list(zoneId?: number) {
    const rows = await this.spots.findAll({
      where: zoneId ? { parkingZoneId: zoneId } : {},
      order: [['parkingZoneId', 'ASC'], ['code', 'ASC']],
    });
    return rows.map(toSpotView);
  }

  /**
   * Crea los espacios que le falten a una zona hasta completar su capacidad
   * (A01, A02...). Idempotente: no toca los que ya existen.
   */
  async ensureSpotsForZone(zoneId: number): Promise<number> {
    const zone = await this.sequelize.getRepository(ParkingZoneModel).findByPk(zoneId);
    if (!zone) return 0;
    const prefix = zone.code ?? `Z${zone.id}`;
    const digits = Math.max(2, String(zone.capacity).length);
    const existing = await this.spots.count({ where: { parkingZoneId: zone.id } });

    const missing = [];
    for (let i = existing; i < zone.capacity; i++) {
      missing.push({
        parkingZoneId: zone.id,
        code: `${prefix}${String(i + 1).padStart(digits, '0')}`,
        rowIndex: Math.floor(i / SPOTS_PER_ROW),
        colIndex: i % SPOTS_PER_ROW,
        status: 'free',
      });
    }
    if (missing.length > 0) await this.spots.bulkCreate(missing);
    return missing.length;
  }

  /**
   * Bloquea un espacio (mantenimiento, reservado) o lo libera. Un espacio
   * ocupado no se puede tocar: primero debe salir el vehículo.
   */
  async setStatus(id: number, status: 'free' | 'blocked') {
    const spot = await this.sequelize.transaction(async (t) => {
      const current = await this.spots.findByPk(id, { lock: Transaction.LOCK.UPDATE, transaction: t });
      if (!current) throw new ApplicationException(404, `Espacio ${id} no encontrado`);
      if (current.status === 'occupied') {
        throw new ApplicationException(409, `El espacio ${current.code} está ocupado: primero debe salir el vehículo`);
      }
      if (current.status === status) return current;

      const zone = await this.sequelize
        .getRepository(ParkingZoneModel)
        .findByPk(current.parkingZoneId, { lock: Transaction.LOCK.UPDATE, transaction: t });
      if (zone) {
        const delta = status === 'blocked' ? -1 : 1;
        const next = Math.min(zone.capacity, Math.max(0, zone.availableSpots + delta));
        await zone.update({ availableSpots: next }, { transaction: t });
      }
      await current.update({ status }, { transaction: t });
      return current;
    });
    await this.events.publishOccupancy(spot.parkingZoneId, spot.id);
    return toSpotView(spot);
  }
}
