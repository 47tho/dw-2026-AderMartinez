import { Inject, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Op, Transaction } from 'sequelize';
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
import type { ParsedAccessCode } from '../domain/access-code.js';
import { PaymentGatewaySimulator, PaymentOutcome } from '../domain/payment-gateway.simulator.js';
import { SpotAssigner } from '../domain/spot-assigner.js';

export const VISITOR_EMAIL = 'visitantes@parqueoagil.local';

/** Un cobro "en proceso" más viejo que esto se considera interrumpido. */
const STALE_PAYMENT_MS = 60_000;

/** Tickets que siguen dentro del parqueadero (un cobro en curso también). */
const INSIDE = ['open', 'paying'];

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

/** El conductor activó el cobro automático y tiene tarjeta guardada. */
function autoChargeEnabled(driver: DriverModel | null): boolean {
  return Boolean(driver?.cardToken) && driver?.paymentMethod === 'auto';
}

/**
 * Portería: lo que pasa cuando la terminal lee el QR del conductor (o el
 * operador registra una placa a mano) y cuando se cobra la salida.
 *
 * Reglas:
 *  - El QR se valida con la clave del dueño del vehículo (HMAC), su vigencia
 *    (±30 s), que traiga el contador actual del vehículo y que no se haya
 *    leído antes.
 *  - Sin ticket abierto → entrada: se asigna espacio según preferencias y se
 *    abre el ticket. Con ticket abierto → salida: el valor queda fijo en ese
 *    momento (`quotedAt`).
 *  - El cobro reclama el ticket con un UPDATE atómico (open → paying), así un
 *    doble clic o dos cajas a la vez nunca cobran dos veces. Si el proceso se
 *    interrumpe, el ticket se recupera solo (ver `recoverPayment`).
 *  - Todas las transacciones bloquean en el mismo orden: vehículo, zona,
 *    espacio. Así dos operaciones cruzadas no se bloquean entre sí.
 */
@Injectable()
export class GateService implements OnApplicationBootstrap {
  private readonly logger = new Logger(GateService.name);
  private readonly calculator = new TicketCalculator();
  private readonly gateway = new PaymentGatewaySimulator();
  /** QR ya leídos (forma canónica) → ventana en que se leyeron. */
  private readonly usedCodes = new Map<string, number>();

  constructor(
    @Inject(SEQUELIZE) private readonly sequelize: Sequelize,
    @Inject(TICKET_REPOSITORY) private readonly tickets: ITicketRepository,
    private readonly events: EventsService,
  ) {}

  /** Al arrancar, termina o devuelve los cobros que quedaron a medias. */
  async onApplicationBootstrap(): Promise<void> {
    const stuck = await this.sequelize.getRepository(TicketModel).findAll({ where: { status: 'paying' } });
    for (const ticket of stuck) await this.recoverPayment(ticket);
  }

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
    this.claimCode(code, now);
    // El contador cambia con cada entrada y salida: el QR con el que se entró
    // no sirve para salir (ni el de salida para volver a entrar).
    if (code.counter !== vehicle.gateCounter) {
      throw new ApplicationException(409, 'QR desactualizado: pide al conductor que actualice la app (desliza hacia abajo)');
    }

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
      const [created] = await this.sequelize.getRepository(VehicleModel).findOrCreate({
        where: { plate },
        defaults: { clientId: visitor.id, vehicleTypeId: type.id, plate, description: null },
      });
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
    let ticket = await repo.findByPk(ticketId);
    if (!ticket) throw new ApplicationException(404, `Ticket ${ticketId} no encontrado`);
    if (ticket.status === 'paying' && Date.now() - ticket.updatedAt.getTime() > STALE_PAYMENT_MS) {
      await this.recoverPayment(ticket);
      ticket = (await repo.findByPk(ticketId))!;
    }
    if (ticket.status === 'paying') throw new ApplicationException(409, 'Ya se está procesando el pago de este ticket');
    if (ticket.status !== 'open') throw new ApplicationException(409, 'Este ticket ya fue pagado');
    if (!ticket.quotedAt) {
      throw new ApplicationException(409, 'Primero lee el QR de salida (o registra la salida por placa) para fijar el valor');
    }

    const total = this.totalOf(ticket);
    const driver = await this.driverOf(ticket.clientId);

    if (method === 'cash' && (cashReceived === undefined || cashReceived < total)) {
      throw new ApplicationException(422, `El efectivo recibido no alcanza para el total ($${total.toLocaleString('es-CO')})`);
    }
    if (method === 'auto' && !autoChargeEnabled(driver)) {
      throw new ApplicationException(422, 'El conductor no activó el cobro automático con una tarjeta guardada');
    }

    // Reclamo atómico: solo una petición pasa de 'open' a 'paying', y solo si
    // el valor no cambió (nadie volvió a leer el QR de salida mientras tanto).
    const [claimed] = await repo.update(
      { status: 'paying' },
      { where: { id: ticketId, status: 'open', quotedAt: ticket.quotedAt } },
    );
    if (claimed === 0) throw new ApplicationException(409, 'Este ticket ya fue pagado, se está cobrando o cambió su valor');

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

    // El pago quedó aprobado: se registra ANTES de cerrar, para que si el cierre
    // falla el ticket se pueda terminar después sin volver a cobrar.
    await repo.update(
      {
        paymentMethod: method,
        paymentRef: reference,
        authorization: outcome.authorization,
        amountReceived: method === 'cash' ? cashReceived : total,
        changeGiven: method === 'cash' ? (cashReceived ?? total) - total : 0,
        cardLabel: method === 'auto' && driver ? `${driver.cardBrand} •••• ${driver.cardLast4}` : null,
      },
      { where: { id: ticketId, status: 'paying' } },
    );
    try {
      await this.finishPayment(ticketId);
    } catch (error) {
      this.logger.error(`Ticket ${ticketId}: pago aprobado pero no se pudo cerrar (${String(error)})`);
      throw new ApplicationException(503, 'El pago quedó aprobado pero no se pudo cerrar el ticket. Intenta cobrar de nuevo en un minuto: no se cobrará dos veces.');
    }

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
    const lock = Transaction.LOCK.UPDATE;

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
        // 1) Vehículo: dos entradas simultáneas del mismo vehículo se ordenan aquí.
        await this.sequelize.getRepository(VehicleModel).findByPk(vehicle.id, { lock, transaction: t });
        const inside = await this.sequelize
          .getRepository(TicketModel)
          .count({ where: { vehicleId: vehicle.id, status: { [Op.in]: INSIDE } }, transaction: t });
        if (inside > 0) throw new ApplicationException(409, `El vehículo ${vehicle.plate} ya está dentro`);

        // 2) Zona y 3) espacio.
        const zone = (await this.sequelize
          .getRepository(ParkingZoneModel)
          .findByPk(assignment.spot.zoneId, { lock, transaction: t }))!;
        const spot = await spotsRepo.findByPk(assignment.spot.id, { lock, transaction: t });
        if (!spot || spot.status !== 'free') return null;

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
    // Solo se re-cotiza un ticket abierto: si ya se está cobrando, el valor no cambia.
    const [updated] = await this.sequelize
      .getRepository(TicketModel)
      .update({ quotedAt: now }, { where: { id: open.id, status: 'open' } });
    if (updated === 0) {
      throw new ApplicationException(409, 'Este vehículo se está cobrando en este momento en otra caja');
    }
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
      // Solo se ofrece la tarjeta si el conductor activó el cobro automático.
      savedCard: autoChargeEnabled(driver) ? { label: `${driver!.cardBrand} •••• ${driver!.cardLast4}` } : null,
    };
  }

  // ================== RECUPERACIÓN DE COBROS ==================

  /**
   * Un ticket quedó en 'paying' (el proceso cayó o el cierre falló):
   *  - con referencia de pago, la pasarela ya aprobó → se termina de cerrar;
   *  - sin referencia, no se cobró nada → vuelve a 'open' para cobrarlo de nuevo.
   */
  private async recoverPayment(ticket: TicketModel): Promise<void> {
    if (ticket.paymentRef) {
      await this.finishPayment(ticket.id);
      const closed = await this.tickets.findById(ticket.id);
      if (closed) {
        this.events.publishTicket('ticket.closed', closed);
        await this.events.publishOccupancy(closed.parkingZoneId, closed.parkingSpotId);
      }
      this.logger.warn(`Ticket ${ticket.id}: cobro interrumpido terminado (${ticket.paymentRef})`);
    } else {
      await this.sequelize
        .getRepository(TicketModel)
        .update({ status: 'open' }, { where: { id: ticket.id, status: 'paying' } });
      this.logger.warn(`Ticket ${ticket.id}: cobro interrumpido sin pago, vuelve a quedar abierto`);
    }
  }

  /** Cierra un ticket 'paying' ya pagado: valores finales, espacio y contador. */
  private async finishPayment(ticketId: number): Promise<void> {
    await this.sequelize.transaction(async (t) => {
      const lock = Transaction.LOCK.UPDATE;
      const current = await this.sequelize.getRepository(TicketModel).findByPk(ticketId, { lock, transaction: t });
      if (!current || current.status !== 'paying' || !current.quotedAt) return;
      if (current.vehicleId) {
        await this.sequelize.getRepository(VehicleModel).findByPk(current.vehicleId, { lock, transaction: t });
      }
      const zone = await this.sequelize
        .getRepository(ParkingZoneModel)
        .findByPk(current.parkingZoneId, { lock, transaction: t });

      const quote = this.calculator.quote(current.entryAt, current.quotedAt, Number(current.hourlyRate));
      await current.update(
        {
          status: 'closed',
          exitAt: current.quotedAt,
          hours: Math.ceil(quote.minutes / 60),
          fractions: quote.fractions,
          minutesPerFraction: quote.minutesPerFraction,
          pricePerFraction: quote.pricePerFraction,
          subtotal: quote.subtotal,
          total: this.totalOf(current),
        },
        { transaction: t },
      );
      if (current.parkingSpotId) {
        await this.sequelize
          .getRepository(ParkingSpotModel)
          .update({ status: 'free' }, { where: { id: current.parkingSpotId, status: 'occupied' }, transaction: t });
      }
      if (zone) {
        await zone.update({ availableSpots: Math.min(zone.capacity, zone.availableSpots + 1) }, { transaction: t });
      }
      if (current.vehicleId) {
        await this.sequelize
          .getRepository(VehicleModel)
          .increment('gateCounter', { by: 1, where: { id: current.vehicleId }, transaction: t });
      }
    });
  }

  // ================== AUXILIARES ==================

  /** Total a cobrar con el valor fijado al leer el QR de salida. */
  private totalOf(ticket: TicketModel): number {
    const quote = this.calculator.quote(ticket.entryAt, ticket.quotedAt!, Number(ticket.hourlyRate));
    return this.calculator.total(quote.total, Number(ticket.tax), Number(ticket.discounts));
  }

  /** Un QR se acepta una sola vez. La clave es canónica: "0" y "00" son el mismo código. */
  private claimCode(code: ParsedAccessCode, now: Date): void {
    const window = AccessCode.windowAt(now.getTime());
    for (const [key, w] of this.usedCodes) {
      if (w < window - 2) this.usedCodes.delete(key);
    }
    const key = `${code.vehicleId}.${code.window}.${code.counter}`;
    if (this.usedCodes.has(key)) {
      throw new ApplicationException(409, 'QR ya usado: espera el siguiente código (cambia cada 30 s)');
    }
    this.usedCodes.set(key, window);
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
        return this.gateway.chargeToken(driver!.cardToken!, total, reference);
      case 'qr':
        return this.gateway.confirmQrTransfer(reference, total);
      case 'card':
        return this.gateway.chargeCardPresent(total, reference);
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
      where: { vehicleId, status: { [Op.in]: INSIDE } },
      include: [{ model: ParkingSpotModel, as: 'parkingSpot', attributes: ['id', 'code'] }],
    });
  }

  private async driverName(clientId: number, driver: DriverModel | null): Promise<string> {
    if (!driver) return 'Visitante (sin app)';
    const client = await this.sequelize.getRepository(ClientModel).findByPk(clientId);
    return client?.name ?? 'Conductor';
  }
}
