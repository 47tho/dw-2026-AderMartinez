import { Inject, Injectable } from '@nestjs/common';
import { Op, Transaction, WhereOptions } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { SEQUELIZE } from '../../../../../../infrastructure/database/sequelize/sequelize.module.js';
import { ParkingZoneModel } from '../../../../parking-zones/infrastructure/persistence/models/parking-zone.model.js';
import { ParkingZoneNotFoundException } from '../../../../parking-zones/domain/exceptions/parking-zone-not-found.exception.js';
import { NoAvailableSpotsException } from '../../../../parking-zones/domain/exceptions/no-available-spots.exception.js';
import { ParkingSpotModel } from '../../../../parking-spots/infrastructure/persistence/models/parking-spot.model.js';
import { VehicleModel } from '../../../../vehicles/infrastructure/persistence/models/vehicle.model.js';
import { Ticket } from '../../../domain/entities/ticket.entity.js';
import type { TicketChannel, TicketStatus } from '../../../domain/entities/ticket.entity.js';
import { ITicketRepository, TicketFilters } from '../../../domain/interfaces/ticket.repository.js';
import { TicketNotFoundException } from '../../../domain/exceptions/ticket-not-found.exception.js';
import { TicketCalculator } from '../../../domain/services/ticket-calculator.js';
import { ApplicationException } from '../../../../../../common/exceptions/application.exception.js';
import { TicketModel } from '../models/ticket.model.js';

/** Relaciones que se cargan para responder placa y código de espacio. */
const TICKET_INCLUDE = [
  { model: VehicleModel, as: 'vehicle', attributes: ['id', 'plate'] },
  { model: ParkingSpotModel, as: 'parkingSpot', attributes: ['id', 'code'] },
];

@Injectable()
export class TicketRepository implements ITicketRepository {
  private readonly calculator = new TicketCalculator();

  constructor(@Inject(SEQUELIZE) private readonly sequelize: Sequelize) {}

  async createOpen(ticket: Ticket): Promise<Ticket> {
    const id = await this.sequelize.transaction(async (t) => {
      const ticketRepo = this.sequelize.getRepository(TicketModel);
      const zoneRepo = this.sequelize.getRepository(ParkingZoneModel);
      const spotRepo = this.sequelize.getRepository(ParkingSpotModel);

      const zone = await zoneRepo.findByPk(ticket.parkingZoneId, {
        lock: Transaction.LOCK.UPDATE,
        transaction: t,
      });
      if (!zone) {
        throw new ParkingZoneNotFoundException(ticket.parkingZoneId);
      }
      if (zone.availableSpots < 1) {
        throw new NoAvailableSpotsException(zone.id, zone.availableSpots, 1);
      }

      // Si la zona tiene espacios individuales, se ocupa el primero libre.
      const spot = await spotRepo.findOne({
        where: { parkingZoneId: zone.id, status: 'free' },
        order: [['code', 'ASC']],
        lock: Transaction.LOCK.UPDATE,
        transaction: t,
      });
      if (spot) {
        await spot.update({ status: 'occupied' }, { transaction: t });
      }

      const created = await ticketRepo.create(
        {
          clientId: ticket.clientId,
          parkingZoneId: ticket.parkingZoneId,
          entryAt: ticket.entryAt,
          exitAt: null,
          hours: 0,
          hourlyRate: ticket.hourlyRate,
          subtotal: 0,
          tax: ticket.tax,
          discounts: ticket.discounts,
          total: 0,
          status: 'open',
          vehicleId: ticket.vehicleId,
          parkingSpotId: spot?.id ?? null,
          channel: ticket.channel,
        },
        { transaction: t },
      );

      await zone.update(
        { availableSpots: zone.availableSpots - 1 },
        { transaction: t },
      );

      return created.id;
    });
    return (await this.findById(id))!;
  }

  /**
   * Cierra el ticket con el cobro por fracciones. Si la portería ya leyó el
   * QR de salida (`quotedAt`), se cobra hasta ese momento: el valor queda
   * fijo aunque el pago tarde.
   */
  async closeTicket(
    id: number,
    exitAt: Date,
    adjustments: { tax?: number; discounts?: number } = {},
  ): Promise<Ticket> {
    await this.sequelize.transaction(async (t) => {
      const ticketRepo = this.sequelize.getRepository(TicketModel);
      const zoneRepo = this.sequelize.getRepository(ParkingZoneModel);
      const spotRepo = this.sequelize.getRepository(ParkingSpotModel);

      const current = await ticketRepo.findByPk(id, {
        lock: Transaction.LOCK.UPDATE,
        transaction: t,
      });
      if (!current) {
        throw new TicketNotFoundException(id);
      }
      // Se verifica dentro de la transacción: dos cierres a la vez, o un cierre
      // mientras la portería cobra, no pueden liberar el cupo dos veces.
      if (current.status !== 'open') {
        throw new ApplicationException(409, `El ticket ${id} ya se cerró o se está cobrando en la portería`);
      }
      // Mismo orden de bloqueo en todo el sistema: zona y luego espacio.
      const zone = await zoneRepo.findByPk(current.parkingZoneId, {
        lock: Transaction.LOCK.UPDATE,
        transaction: t,
      });

      const billedUntil = current.quotedAt ?? exitAt;
      const quote = this.calculator.quote(current.entryAt, billedUntil, Number(current.hourlyRate));
      const tax = adjustments.tax ?? Number(current.tax);
      const discounts = adjustments.discounts ?? Number(current.discounts);
      const total = this.calculator.total(quote.total, tax, discounts);

      await current.update(
        {
          exitAt: billedUntil,
          hours: Math.ceil(quote.minutes / 60),
          fractions: quote.fractions,
          minutesPerFraction: quote.minutesPerFraction,
          pricePerFraction: quote.pricePerFraction,
          subtotal: quote.subtotal,
          tax,
          discounts,
          total,
          status: 'closed',
        },
        { transaction: t },
      );

      if (current.parkingSpotId) {
        await spotRepo.update(
          { status: 'free' },
          { where: { id: current.parkingSpotId, status: 'occupied' }, transaction: t },
        );
      }

      if (zone) {
        const next = zone.availableSpots + 1;
        const capped = next > zone.capacity ? zone.capacity : next;
        await zone.update({ availableSpots: capped }, { transaction: t });
      }
    });
    return (await this.findById(id))!;
  }

  async findById(id: number): Promise<Ticket | null> {
    const repo = this.sequelize.getRepository(TicketModel);
    const found = await repo.findByPk(id, { include: TICKET_INCLUDE });
    return found ? TicketRepository.toDomain(found) : null;
  }

  async findOpenByZone(parkingZoneId: number): Promise<Ticket[]> {
    const repo = this.sequelize.getRepository(TicketModel);
    const rows = await repo.findAll({
      where: { parkingZoneId, status: 'open' },
      include: TICKET_INCLUDE,
      order: [['id', 'ASC']],
    });
    return rows.map((r) => TicketRepository.toDomain(r));
  }

  async findPage(filters: TicketFilters, page: number, limit: number) {
    const repo = this.sequelize.getRepository(TicketModel);
    const where: WhereOptions = {};
    // Un ticket que se está cobrando ('paying') sigue estando dentro.
    if (filters.status) {
      Object.assign(where, { status: filters.status === 'open' ? { [Op.in]: ['open', 'paying'] } : filters.status });
    }
    if (filters.clientId) Object.assign(where, { clientId: filters.clientId });
    if (filters.zoneId) Object.assign(where, { parkingZoneId: filters.zoneId });
    if (filters.vehicleIds) Object.assign(where, { vehicleId: { [Op.in]: filters.vehicleIds } });

    const include = filters.plate
      ? [
          {
            model: VehicleModel,
            as: 'vehicle',
            attributes: ['id', 'plate'],
            required: true,
            where: { plate: { [Op.like]: `%${filters.plate.toUpperCase()}%` } },
          },
          TICKET_INCLUDE[1],
        ]
      : TICKET_INCLUDE;

    const { rows, count } = await repo.findAndCountAll({
      where,
      include,
      offset: (page - 1) * limit,
      limit,
      order: [['id', 'DESC']],
      distinct: true,
    });
    return { items: rows.map((r) => TicketRepository.toDomain(r)), total: count };
  }

  /** Público para que otros features (portería, conductor) usen la misma proyección. */
  static toDomain(m: TicketModel): Ticket {
    return new Ticket({
      id: m.id,
      clientId: m.clientId,
      parkingZoneId: m.parkingZoneId,
      entryAt: m.entryAt,
      exitAt: m.exitAt ?? null,
      hours: m.hours,
      hourlyRate: Number(m.hourlyRate),
      subtotal: Number(m.subtotal),
      tax: Number(m.tax),
      discounts: Number(m.discounts),
      total: Number(m.total),
      status: (m.status === 'closed' ? 'closed' : 'open') as TicketStatus,
      vehicleId: m.vehicleId ?? null,
      plate: m.vehicle?.plate ?? null,
      parkingSpotId: m.parkingSpotId ?? null,
      spotCode: m.parkingSpot?.code ?? null,
      channel: (m.channel as TicketChannel) ?? 'api',
      fractions: m.fractions ?? 0,
      minutesPerFraction: m.minutesPerFraction ?? 0,
      pricePerFraction: Number(m.pricePerFraction ?? 0),
      quotedAt: m.quotedAt ?? null,
      paymentMethod: m.paymentMethod ?? null,
      amountReceived: m.amountReceived === null || m.amountReceived === undefined ? null : Number(m.amountReceived),
      change: m.changeGiven === null || m.changeGiven === undefined ? null : Number(m.changeGiven),
      paymentRef: m.paymentRef ?? null,
      authorization: m.authorization ?? null,
      cardLabel: m.cardLabel ?? null,
    });
  }
}
