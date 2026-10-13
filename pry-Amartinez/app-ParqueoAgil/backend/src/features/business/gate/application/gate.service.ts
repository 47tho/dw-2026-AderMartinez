import { Inject, Injectable } from '@nestjs/common';
import { Transaction } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { ApplicationException } from '../../../../common/exceptions/application.exception.js';
import { SEQUELIZE } from '../../../../infrastructure/database/sequelize/sequelize.module.js';
import { ClientModel } from '../../clients/infrastructure/persistence/models/client.model.js';
import { DriverModel } from '../../drivers/infrastructure/persistence/models/driver.model.js';
import type { PaymentMethodCode } from '../../drivers/infrastructure/persistence/models/driver.model.js';
import { EventsService, toSpotView } from '../../events/application/events.service.js';
import { ParkingSpotModel } from '../../parking-spots/infrastructure/persistence/models/parking-spot.model.js';
import { ParkingZoneModel } from '../../parking-zones/infrastructure/persistence/models/parking-zone.model.js';
import { TicketMapper } from '../../tickets/application/mappers/ticket.mapper.js';
import { TICKET_REPOSITORY } from '../../tickets/domain/interfaces/ticket.repository.js';
import type { ITicketRepository } from '../../tickets/domain/interfaces/ticket.repository.js';
import { TicketCalculator } from '../../tickets/domain/services/ticket-calculator.js';
import { TicketModel } from '../../tickets/infrastructure/persistence/models/ticket.model.js';
import { toVehicleView } from '../../vehicles/application/vehicle.view.js';
import { assertValidPlate, normalizePlate, vehicleKindOf } from '../../vehicles/domain/vehicle-rules.js';
import { VehicleModel } from '../../vehicles/infrastructure/persistence/models/vehicle.model.js';
import { VehicleTypeModel } from '../../vehicle-types/infrastructure/persistence/models/vehicle-type.model.js';
import { AccessCode } from '../domain/access-code.js';
import { PaymentGatewaySimulator, PaymentOutcome } from '../domain/payment-gateway.simulator.js';
import { SpotAssigner } from '../domain/spot-assigner.js';

export const VISITOR_EMAIL = 'visitantes@parqueoagil.local';

function zoneView(zone: ParkingZoneModel) {
  return {
    id: zone.id,
    name: zone.name,
    code: zone.code,
    floor: zone.floor,
    position: zone.position,
    color: zone.color,
    vehicleTypeId: zone.vehicleTypeId,
    capacity: zone.capacity,
    availableSpots: zone.availableSpots,
    hourlyRate: Number(zone.hourlyRate),
    status: zone.status,
  };
}

function parseZoneIds(csv: string | null | undefined): number[] {
  return (csv ?? '')
    .split(',')
    .map((s) => Number(s))
    .filter((n) => Number.isInteger(n) && n > 0);
}

/**
 * Portería: lo que pasa cuando la terminal lee el QR del conductor (o el
 * operador registra una placa a mano) y cuando se cobra la salida.
 *
 * Reglas:
 *  - El QR se valida con la clave del dueño del vehículo (HMAC), su vigencia
 *    (±30 s) y que no se haya leído antes.
 *  - Sin ticket abierto → entrada: se asigna espacio según preferencias y se
 *    abre el ticket. Con ticket abierto → salida: el valor queda fijo en ese
 *    momento (`quotedAt`).
 *  - El cobro reclama el ticket con un UPDATE atómico, así un doble clic o
 *    dos cajas a la vez nunca cobran dos veces.
 */
@Injectable()
export class GateService {
  private readonly calculator = new TicketCalculator();
  private readonly gateway = new PaymentGatewaySimulator();
  /** QR ya leídos → ventana en que se leyeron. Se purgan pasadas 2 ventanas. */
  private readonly usedCodes = new Map<string, number>();

  constructor(
    @Inject(SEQUELIZE) private readonly sequelize: Sequelize,
    @Inject(TICKET_REPOSITORY) private readonly tickets: ITicketRepository,
    private readonly events: EventsService,
  ) {}

  // ================== LECTURA DEL QR ==================

  async scan(raw: string, now = new Date()) {
    const code = AccessCode.parse(raw);
    if (!code) {
      throw new ApplicationException(422, 'Este QR no es de ParqueoÁgil');
    }

    const vehicleId = /^\d+$/.test(code.vehicleId) ? Number(code.vehicleId) : null;
    const vehicle = vehicleId ? await this.loadVehicle({ id: vehicleId }) : null;
    const driver = vehicle ? await this.driverOf(vehicle.clientId) : null;
    if (!vehicle || !driver || vehicle.status !== 'active') {
      throw new ApplicationException(404, 'Vehículo no registrado: el QR tiene el formato correcto pero el vehículo no existe');
    }

    const status = AccessCode.verify(code, driver.qrSecret, now.getTime());
    if (status === 'badSignature') {
      throw new ApplicationException(422, 'QR falsificado o alterado: la firma no coincide con la clave del conductor');
    }
    if (status === 'expired') {
      throw new ApplicationException(410, 'QR vencido: pide al conductor el código actual de su app (cambia cada 30 s)');
    }
    this.claimCode(code.raw, now);

    const open = await this.openTicketOf(vehicle.id);
    if (open) return this.quoteExit(open, vehicle, driver, now);
    return this.enter(vehicle, driver, 'qr', now);
  }

  // ================== SIN APP (POR PLACA) ==================

  async manualEntry(plateInput: string, vehicleTypeId: number, now = new Date()) {
    const plate = normalizePlate(plateInput);
    let vehicle = await this.loadVehicle({ plate });

    if (!vehicle) {
      const type = await this.sequelize.getRepository(VehicleTypeModel).findByPk(vehicleTypeId);
      if (!type || type.status !== 'active') {
        throw new ApplicationException(404, `Tipo de vehículo ${vehicleTypeId} no encontrado`);
      }
      assertValidPlate(plate, vehicleKindOf(type.name));
      const visitor = await this.visitorClient();
      const created = await this.sequelize
        .getRepository(VehicleModel)
        .create({ clientId: visitor.id, vehicleTypeId: type.id, plate, description: null });
      vehicle = (await this.loadVehicle({ id: created.id }))!;
    } else {
      const open = await this.openTicketOf(vehicle.id);
      if (open) {
        throw new ApplicationException(409, `El vehículo ${plate} ya está dentro${open.parkingSpot ? ` (espacio ${open.parkingSpot.code})` : ''}`);
      }
    }

    return this.enter(vehicle, await this.driverOf(vehicle.clientId), 'manual', now);
  }

  async manualExit(plateInput: string, now = new Date()) {
    const plate = normalizePlate(plateInput);
    const vehicle = await this.loadVehicle({ plate });
    const open = vehicle ? await this.openTicketOf(vehicle.id) : null;
    if (!vehicle || !open) {
      throw new ApplicationException(404, `No hay ningún vehículo con placa ${plate || '(vacía)'} dentro del parqueadero`);
    }
    return this.quoteExit(open, vehicle, await this.driverOf(vehicle.clientId), now);
  }

  // ================== COBRO ==================

  async pay(ticketId: number, method: PaymentMethodCode, cashReceived: number | undefined) {
    const repo = this.sequelize.getRepository(TicketModel);
    const ticket = await repo.findByPk(ticketId);
    if (!ticket) throw new ApplicationException(404, `Ticket ${ticketId} no encontrado`);
    if (ticket.status === 'paying') throw new ApplicationException(409, 'Ya se está procesando el pago de este ticket');
    if (ticket.status !== 'open') throw new ApplicationException(409, 'Este ticket ya fue pagado');
    if (!ticket.quotedAt) {
      throw new ApplicationException(409, 'Primero lee el QR de salida (o registra la salida por placa) para fijar el valor');
    }

    const quote = this.calculator.quote(ticket.entryAt, ticket.quotedAt, Number(ticket.hourlyRate));
    const tax = Number(ticket.tax);
    const discounts = Number(ticket.discounts);
    const total = this.calculator.total(quote.total, tax, discounts);
    const driver = await this.driverOf(ticket.clientId);

    if (method === 'cash' && (cashReceived === undefined || cashReceived < total)) {
      throw new ApplicationException(422, `El efectivo recibido no alcanza para el total ($${total.toLocaleString('es-CO')})`);
    }
    if (method === 'auto' && !driver?.cardToken) {
      throw new ApplicationException(422, 'El conductor no tiene tarjeta guardada para el cobro automático');
    }

    // Reclamo atómico: solo una petición pasa de 'open' a 'paying'.
    const [claimed] = await repo.update({ status: 'paying' }, { where: { id: ticketId, status: 'open' } });
    if (claimed === 0) throw new ApplicationException(409, 'Este ticket ya fue pagado o se está cobrando');

    const reference = `PA-${String(ticketId).padStart(6, '0')}`;
    let outcome: PaymentOutcome;
    try {
      outcome = await this.charge(method, driver, reference, total);
    } catch (error) {
      await repo.update({ status: 'open' }, { where: { id: ticketId, status: 'paying' } });
      throw error;
    }
    if (!outcome.approved) {
      await repo.update({ status: 'open' }, { where: { id: ticketId, status: 'paying' } });
      throw new ApplicationException(402, outcome.error);
    }

    await this.sequelize.transaction(async (t) => {
      const current = (await repo.findByPk(ticketId, { lock: Transaction.LOCK.UPDATE, transaction: t }))!;
      await current.update(
        {
          status: 'closed',
          exitAt: current.quotedAt,
          hours: Math.ceil(quote.minutes / 60),
          fractions: quote.fractions,
          minutesPerFraction: quote.minutesPerFraction,
          pricePerFraction: quote.pricePerFraction,
          subtotal: quote.subtotal,
          total,
          paymentMethod: method,
          amountReceived: method === 'cash' ? cashReceived : total,
          changeGiven: method === 'cash' ? (cashReceived ?? total) - total : 0,
          paymentRef: reference,
          authorization: outcome.authorization,
          cardLabel: method === 'auto' && driver ? `${driver.cardBrand} •••• ${driver.cardLast4}` : null,
        },
        { transaction: t },
      );
      await this.releaseSpot(current, t);
      if (current.vehicleId) {
        await this.sequelize
          .getRepository(VehicleModel)
          .increment('gateCounter', { by: 1, where: { id: current.vehicleId }, transaction: t });
      }
    });

    const closed = (await this.tickets.findById(ticketId))!;
    this.events.publishTicket('ticket.closed', closed);
    await this.events.publishOccupancy(closed.parkingZoneId, closed.parkingSpotId);
    return TicketMapper.toResponse(closed);
  }

  /** Cliente al que quedan los vehículos de visitantes sin app. */
  async visitorClient(): Promise<ClientModel> {
    const clients = this.sequelize.getRepository(ClientModel);
    const [client] = await clients.findOrCreate({
      where: { email: VISITOR_EMAIL },
      defaults: { name: 'Visitantes (sin app)', email: VISITOR_EMAIL, status: 'active' },
    });
    return client;
  }

  // ================== ENTRADA Y SALIDA ==================

  /** Público para el seeder de actividad de demostración. */
  async enter(vehicle: VehicleModel, driver: DriverModel | null, channel: 'qr' | 'manual', now = new Date()) {
    const zones = await this.sequelize
      .getRepository(ParkingZoneModel)
      .findAll({ where: { status: 'active', vehicleTypeId: vehicle.vehicleTypeId } });
    const typeName = vehicle.vehicleType?.name ?? 'este tipo de vehículo';
    if (zones.length === 0) {
      throw new ApplicationException(409, `No hay zonas habilitadas para ${typeName.toLowerCase()}`);
    }

    const assigner = new SpotAssigner(
      zones.map((z) => ({ id: z.id, code: z.code ?? `Z${z.id}`, floor: z.floor, position: z.position, vehicleTypeId: z.vehicleTypeId })),
    );
    const spotsRepo = this.sequelize.getRepository(ParkingSpotModel);

    // Si otro vehículo toma el mismo espacio entre la consulta y el bloqueo, se recalcula.
    for (let attempt = 0; attempt < 3; attempt++) {
      const spots = await spotsRepo.findAll({ where: { parkingZoneId: zones.map((z) => z.id) } });
      const assignment = assigner.assign({
        spots: spots.map(toSpotView),
        preferredZoneIds: parseZoneIds(driver?.preferredZoneIds),
        preferredSpotId: driver?.preferredSpotId ?? null,
        vehicleTypeId: vehicle.vehicleTypeId,
        isMotorcycle: vehicleKindOf(typeName) === 'motorcycle',
      });
      if (!assignment) {
        throw new ApplicationException(409, `Parqueadero lleno: no hay espacios libres para ${typeName.toLowerCase()}`);
      }

      const opened = await this.sequelize.transaction(async (t) => {
        const spot = await spotsRepo.findByPk(assignment.spot.id, { lock: Transaction.LOCK.UPDATE, transaction: t });
        if (!spot || spot.status !== 'free') return null;
        const zone = (await this.sequelize
          .getRepository(ParkingZoneModel)
          .findByPk(spot.parkingZoneId, { lock: Transaction.LOCK.UPDATE, transaction: t }))!;

        await spot.update({ status: 'occupied' }, { transaction: t });
        await zone.update({ availableSpots: Math.max(0, zone.availableSpots - 1) }, { transaction: t });
        const ticket = await this.sequelize.getRepository(TicketModel).create(
          {
            clientId: vehicle.clientId,
            parkingZoneId: zone.id,
            entryAt: now,
            hourlyRate: zone.hourlyRate,
            subtotal: 0,
            tax: 0,
            discounts: 0,
            total: 0,
            status: 'open',
            vehicleId: vehicle.id,
            parkingSpotId: spot.id,
            channel,
          },
          { transaction: t },
        );
        await this.sequelize
          .getRepository(VehicleModel)
          .increment('gateCounter', { by: 1, where: { id: vehicle.id }, transaction: t });
        return { ticketId: ticket.id, spot, zone };
      });
      if (!opened) continue;

      const ticket = (await this.tickets.findById(opened.ticketId))!;
      this.events.publishTicket('ticket.opened', ticket);
      await this.events.publishOccupancy(opened.zone.id, opened.spot.id);
      const fresh = (await this.loadVehicle({ id: vehicle.id }))!;
      return {
        kind: 'entry' as const,
        ticket: TicketMapper.toResponse(ticket),
        vehicle: toVehicleView(fresh, { id: ticket.id!, spotCode: opened.spot.code, zoneId: opened.zone.id, entryAt: ticket.entryAt }),
        driverName: await this.driverName(vehicle.clientId, driver),
        spot: toSpotView(opened.spot),
        zone: zoneView(opened.zone),
        reason: assignment.reason,
      };
    }
    throw new ApplicationException(409, 'Hay mucho movimiento en la entrada: intenta de nuevo');
  }

  private async quoteExit(open: TicketModel, vehicle: VehicleModel, driver: DriverModel | null, now: Date) {
    await open.update({ quotedAt: now });
    const quote = this.calculator.quote(open.entryAt, now, Number(open.hourlyRate));
    const ticket = (await this.tickets.findById(open.id))!;
    this.events.publishTicket('ticket.quoted', ticket);
    return {
      kind: 'exit' as const,
      ticket: TicketMapper.toResponse(ticket),
      vehicle: toVehicleView(vehicle, {
        id: open.id,
        spotCode: open.parkingSpot?.code ?? null,
        zoneId: open.parkingZoneId,
        entryAt: open.entryAt,
      }),
      driverName: await this.driverName(vehicle.clientId, driver),
      quote: {
        ...quote,
        total: this.calculator.total(quote.total, Number(open.tax), Number(open.discounts)),
        quotedAt: now,
      },
      preferredPaymentMethod: (driver?.paymentMethod ?? 'cash') as PaymentMethodCode,
      savedCard: driver?.cardToken ? { label: `${driver.cardBrand} •••• ${driver.cardLast4}` } : null,
    };
  }

  // ================== AUXILIARES ==================

  private claimCode(raw: string, now: Date): void {
    const window = AccessCode.windowAt(now.getTime());
    for (const [code, w] of this.usedCodes) {
      if (w < window - 2) this.usedCodes.delete(code);
    }
    if (this.usedCodes.has(raw)) {
      throw new ApplicationException(409, 'QR ya usado: espera el siguiente código (cambia cada 30 s)');
    }
    this.usedCodes.set(raw, window);
  }

  private async charge(
    method: PaymentMethodCode,
    driver: DriverModel | null,
    reference: string,
    total: number,
  ): Promise<PaymentOutcome> {
    switch (method) {
      case 'cash':
        return { approved: true, authorization: '' };
      case 'auto':
        return this.gateway.chargeToken(driver!.cardToken!, total);
      case 'qr':
        return this.gateway.confirmQrTransfer(reference, total);
      case 'card':
        return this.gateway.chargeCardPresent(total);
    }
  }

  private async releaseSpot(ticket: TicketModel, t: Transaction): Promise<void> {
    if (ticket.parkingSpotId) {
      await this.sequelize
        .getRepository(ParkingSpotModel)
        .update({ status: 'free' }, { where: { id: ticket.parkingSpotId, status: 'occupied' }, transaction: t });
    }
    const zone = await this.sequelize
      .getRepository(ParkingZoneModel)
      .findByPk(ticket.parkingZoneId, { lock: Transaction.LOCK.UPDATE, transaction: t });
    if (zone) {
      await zone.update({ availableSpots: Math.min(zone.capacity, zone.availableSpots + 1) }, { transaction: t });
    }
  }

  private loadVehicle(where: { id: number } | { plate: string }): Promise<VehicleModel | null> {
    return this.sequelize.getRepository(VehicleModel).findOne({
      where,
      include: [{ model: VehicleTypeModel, as: 'vehicleType' }],
    });
  }

  private driverOf(clientId: number): Promise<DriverModel | null> {
    return this.sequelize.getRepository(DriverModel).findOne({ where: { clientId } });
  }

  private openTicketOf(vehicleId: number): Promise<TicketModel | null> {
    return this.sequelize.getRepository(TicketModel).findOne({
      where: { vehicleId, status: ['open', 'paying'] },
      include: [{ model: ParkingSpotModel, as: 'parkingSpot', attributes: ['id', 'code'] }],
    });
  }

  private async driverName(clientId: number, driver: DriverModel | null): Promise<string> {
    if (!driver) return 'Visitante (sin app)';
    const client = await this.sequelize.getRepository(ClientModel).findByPk(clientId);
    return client?.name ?? 'Conductor';
  }
}
