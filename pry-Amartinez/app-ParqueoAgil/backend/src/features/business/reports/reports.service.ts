import { Inject, Injectable } from '@nestjs/common';
import { Op } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { SEQUELIZE } from '../../../infrastructure/database/sequelize/sequelize.module.js';
import { ParkingSpotModel } from '../parking-spots/infrastructure/persistence/models/parking-spot.model.js';
import { ParkingZoneModel } from '../parking-zones/infrastructure/persistence/models/parking-zone.model.js';
import { TicketModel } from '../tickets/infrastructure/persistence/models/ticket.model.js';

/**
 * Resumen para el tablero del panel web: ocupación actual y movimiento del
 * día (hora local del servidor).
 */
@Injectable()
export class ReportsService {
  constructor(@Inject(SEQUELIZE) private readonly sequelize: Sequelize) {}

  async summary(now = new Date()) {
    const zones = await this.sequelize
      .getRepository(ParkingZoneModel)
      .findAll({ where: { status: 'active' }, order: [['floor', 'ASC'], ['position', 'ASC'], ['id', 'ASC']] });
    const spots = await this.sequelize
      .getRepository(ParkingSpotModel)
      .findAll({ attributes: ['parkingZoneId', 'status'] });

    const zoneRows = zones.map((zone) => {
      const own = spots.filter((s) => s.parkingZoneId === zone.id);
      // Zonas sin espacios individuales: se usa el contador de cupos.
      const occupied = own.length > 0 ? own.filter((s) => s.status === 'occupied').length : zone.capacity - zone.availableSpots;
      const blocked = own.filter((s) => s.status === 'blocked').length;
      return {
        id: zone.id,
        code: zone.code,
        name: zone.name,
        floor: zone.floor,
        color: zone.color,
        capacity: zone.capacity,
        occupied,
        blocked,
      };
    });
    const capacity = zoneRows.reduce((sum, z) => sum + z.capacity, 0);
    const occupied = zoneRows.reduce((sum, z) => sum + z.occupied, 0);
    const blocked = zoneRows.reduce((sum, z) => sum + z.blocked, 0);

    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    const tickets = this.sequelize.getRepository(TicketModel);
    const enteredToday = await tickets.findAll({
      where: { entryAt: { [Op.gte]: dayStart } },
      attributes: ['entryAt'],
    });
    const closedToday = await tickets.findAll({
      where: { status: 'closed', exitAt: { [Op.gte]: dayStart } },
      attributes: ['entryAt', 'exitAt', 'total', 'paymentMethod'],
    });

    const byMethod = { cash: 0, card: 0, qr: 0, auto: 0, other: 0 };
    let minutes = 0;
    for (const t of closedToday) {
      const key = (t.paymentMethod ?? 'other') as keyof typeof byMethod;
      byMethod[key in byMethod ? key : 'other'] += Number(t.total);
      minutes += (t.exitAt!.getTime() - t.entryAt.getTime()) / 60000;
    }
    const entriesByHour = Array.from({ length: 24 }, () => 0);
    for (const t of enteredToday) entriesByHour[t.entryAt.getHours()]++;

    return {
      generatedAt: now,
      occupancy: { capacity, occupied, blocked, free: capacity - occupied - blocked, zones: zoneRows },
      today: {
        entries: enteredToday.length,
        exits: closedToday.length,
        revenue: closedToday.reduce((sum, t) => sum + Number(t.total), 0),
        byMethod,
        avgMinutes: closedToday.length ? Math.round(minutes / closedToday.length) : 0,
      },
      entriesByHour,
    };
  }
}
