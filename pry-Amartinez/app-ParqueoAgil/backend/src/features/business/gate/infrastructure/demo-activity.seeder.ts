import { Inject, Injectable, Logger } from '@nestjs/common';
import { Sequelize } from 'sequelize-typescript';
import { SEQUELIZE } from '../../../../infrastructure/database/sequelize/sequelize.module.js';
import { DriverModel } from '../../drivers/infrastructure/persistence/models/driver.model.js';
import { ParkingSpotModel } from '../../parking-spots/infrastructure/persistence/models/parking-spot.model.js';
import { ParkingZoneModel } from '../../parking-zones/infrastructure/persistence/models/parking-zone.model.js';
import { TicketCalculator } from '../../tickets/domain/services/ticket-calculator.js';
import { TicketModel } from '../../tickets/infrastructure/persistence/models/ticket.model.js';
import { vehicleKindOf } from '../../vehicles/domain/vehicle-rules.js';
import { VehicleModel } from '../../vehicles/infrastructure/persistence/models/vehicle.model.js';
import { VehicleTypeModel } from '../../vehicle-types/infrastructure/persistence/models/vehicle-type.model.js';
import { GateService } from '../application/gate.service.js';

/** Generador pseudoaleatorio con semilla: la demo sale igual en todos los equipos. */
function seededRandom(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Actividad de demostración para que el tablero no arranque vacío:
 *  - el carro ABC123 del conductor demo, dentro hace 1 h 30 min (como en la app);
 *  - visitantes ocupando cerca del 40 % de cada zona;
 *  - salidas ya pagadas durante el día, con distintos métodos de pago.
 *
 * Solo corre si la tabla de tickets está vacía (base nueva) y se puede apagar
 * con `SEED_DEMO_ACTIVITY=false`.
 */
@Injectable()
export class DemoActivitySeeder {
  private readonly logger = new Logger(DemoActivitySeeder.name);
  private readonly calculator = new TicketCalculator();

  constructor(
    @Inject(SEQUELIZE) private readonly sequelize: Sequelize,
    private readonly gate: GateService,
  ) {}

  async seed(): Promise<void> {
    if (process.env.SEED_DEMO_ACTIVITY === 'false') return;
    const tickets = this.sequelize.getRepository(TicketModel);
    if ((await tickets.count()) > 0) {
      this.logger.log('Seeder demo-activity: ya hay tickets, no se agrega actividad (idempotente)');
      return;
    }

    const random = seededRandom(2026);
    const now = new Date();
    const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000);
    const vehicles = this.sequelize.getRepository(VehicleModel);
    const spotsRepo = this.sequelize.getRepository(ParkingSpotModel);
    const types = await this.sequelize.getRepository(VehicleTypeModel).findAll();
    const visitor = await this.gate.visitorClient();

    const used = new Set((await vehicles.findAll({ attributes: ['plate'] })).map((v) => v.plate));
    const letters = 'BCDFGHJKLMNPRSTVWXYZ';
    const newPlate = (kind: string) => {
      for (;;) {
        const l = () => letters[Math.floor(random() * letters.length)];
        const d = () => String(Math.floor(random() * 10));
        const plate = kind === 'motorcycle' ? `${l()}${l()}${l()}${d()}${d()}${l()}` : `${l()}${l()}${l()}${d()}${d()}${d()}`;
        if (!used.has(plate)) {
          used.add(plate);
          return plate;
        }
      }
    };

    // 1) El carro del conductor demo, en su espacio preferido.
    const demo = await vehicles.findOne({
      where: { plate: 'ABC123' },
      include: [{ model: VehicleTypeModel, as: 'vehicleType' }],
    });
    if (demo) {
      const driver = await this.sequelize.getRepository(DriverModel).findOne({ where: { clientId: demo.clientId } });
      await this.gate.enter(demo, driver, 'qr', minutesAgo(90));
    }

    // 2) Visitantes dentro, repartidos al azar en cada zona.
    let inside = 0;
    const zones = await this.sequelize.getRepository(ParkingZoneModel).findAll({ where: { status: 'active' } });
    for (const zone of zones) {
      const type = types.find((t) => t.id === zone.vehicleTypeId);
      const kind = vehicleKindOf(type?.name);
      const target = Math.floor(zone.capacity * (0.3 + random() * 0.25));
      for (let i = 0; i < target; i++) {
        const free = await spotsRepo.findAll({ where: { parkingZoneId: zone.id, status: 'free' }, attributes: ['id'] });
        if (free.length <= 1) break;
        const spot = free[Math.floor(random() * free.length)];
        const created = await vehicles.create({ clientId: visitor.id, vehicleTypeId: zone.vehicleTypeId, plate: newPlate(kind) });
        const vehicle = (await vehicles.findByPk(created.id, { include: [{ model: VehicleTypeModel, as: 'vehicleType' }] }))!;
        // Preferencia "falsa" para ubicar al visitante en ese espacio exacto.
        const placement = { preferredZoneIds: String(zone.id), preferredSpotId: spot.id } as DriverModel;
        await this.gate.enter(vehicle, placement, 'manual', minutesAgo(5 + Math.floor(random() * 300)));
        inside++;
      }
    }

    // 3) Salidas ya pagadas hoy.
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    const windowStart = Math.max(dayStart.getTime(), now.getTime() - 11 * 3600_000);
    const windowMinutes = Math.floor((now.getTime() - windowStart) / 60_000);
    const methods = ['cash', 'cash', 'cash', 'card', 'card', 'qr', 'qr', 'qr'];
    let closed = 0;
    for (let i = 0; i < 28 && windowMinutes > 30; i++) {
      const zone = zones[Math.floor(random() * zones.length)];
      const kind = vehicleKindOf(types.find((t) => t.id === zone.vehicleTypeId)?.name);
      const vehicle = await vehicles.create({ clientId: visitor.id, vehicleTypeId: zone.vehicleTypeId, plate: newPlate(kind) });
      const duration = 15 + Math.floor(random() * Math.min(200, windowMinutes - 20));
      const entryAt = new Date(windowStart + Math.floor(random() * (windowMinutes - duration - 5)) * 60_000);
      const exitAt = new Date(entryAt.getTime() + duration * 60_000);
      const quote = this.calculator.quote(entryAt, exitAt, Number(zone.hourlyRate));
      const method = methods[Math.floor(random() * methods.length)];
      const cash = method === 'cash' ? Math.ceil(quote.total / 5000) * 5000 : quote.total;
      const spot = await spotsRepo.findOne({ where: { parkingZoneId: zone.id }, attributes: ['id'] });
      const ticket = await tickets.create({
        clientId: visitor.id,
        parkingZoneId: zone.id,
        entryAt,
        exitAt,
        hours: Math.ceil(quote.minutes / 60),
        hourlyRate: zone.hourlyRate,
        subtotal: quote.subtotal,
        tax: 0,
        discounts: 0,
        total: quote.total,
        status: 'closed',
        vehicleId: vehicle.id,
        parkingSpotId: spot?.id ?? null,
        channel: 'manual',
        fractions: quote.fractions,
        minutesPerFraction: quote.minutesPerFraction,
        pricePerFraction: quote.pricePerFraction,
        quotedAt: exitAt,
        paymentMethod: method,
        amountReceived: cash,
        changeGiven: cash - quote.total,
        authorization: method === 'cash' ? '' : `AUT${100000 + Math.floor(random() * 899999)}`,
      });
      await ticket.update({ paymentRef: `PA-${String(ticket.id).padStart(6, '0')}` });
      await vehicles.increment('gateCounter', { by: 2, where: { id: vehicle.id } });
      closed++;
    }

    this.logger.log(`Seeder demo-activity: ${inside + (demo ? 1 : 0)} vehículos dentro y ${closed} salidas pagadas hoy`);
  }
}
