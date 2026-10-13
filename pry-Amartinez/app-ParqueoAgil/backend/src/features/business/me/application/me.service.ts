import { Inject, Injectable } from '@nestjs/common';
import { Op, UniqueConstraintError } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { ApplicationException } from '../../../../common/exceptions/application.exception.js';
import { SEQUELIZE } from '../../../../infrastructure/database/sequelize/sequelize.module.js';
import { UserModel } from '../../../auth/users/infrastructure/persistence/models/user.model.js';
import { ClientModel } from '../../clients/infrastructure/persistence/models/client.model.js';
import { DriverModel } from '../../drivers/infrastructure/persistence/models/driver.model.js';
import { VISITOR_EMAIL } from '../../gate/application/gate.service.js';
import { ParkingSpotModel } from '../../parking-spots/infrastructure/persistence/models/parking-spot.model.js';
import { ParkingZoneModel } from '../../parking-zones/infrastructure/persistence/models/parking-zone.model.js';
import { ListTicketsUseCase } from '../../tickets/application/use-cases/list-tickets.use-case.js';
import { TicketModel } from '../../tickets/infrastructure/persistence/models/ticket.model.js';
import { toVehicleView } from '../../vehicles/application/vehicle.view.js';
import type { ActiveTicketRef } from '../../vehicles/application/vehicle.view.js';
import { assertValidPlate, normalizePlate, vehicleKindOf } from '../../vehicles/domain/vehicle-rules.js';
import { VehicleModel } from '../../vehicles/infrastructure/persistence/models/vehicle.model.js';
import { VehicleTypeModel } from '../../vehicle-types/infrastructure/persistence/models/vehicle-type.model.js';
import { CreateMyVehicleDto } from './dto/create-my-vehicle.dto.js';
import { MyTicketsQueryDto } from './dto/my-tickets-query.dto.js';
import { SaveCardDto } from './dto/save-card.dto.js';
import { UpdateMeDto } from './dto/update-me.dto.js';
import { UpdateMyVehicleDto } from './dto/update-my-vehicle.dto.js';
import { UpdatePreferencesDto } from './dto/update-preferences.dto.js';
import { toDriverView, toVehicleTypeRef } from './me.view.js';

/** Estados de un ticket cuyo vehículo sigue dentro del parqueadero. */
const INSIDE_STATUSES = ['open', 'paying'];

const NO_DRIVER_PROFILE = 'Esta cuenta no tiene perfil de conductor';

function cleanDescription(value: string | null | undefined): string | null {
  return (value ?? '').trim() || null;
}

/** En los PATCH, `null` y `undefined` significan "no tocar" (salvo `description`, que con `null` se borra). */
function given<T>(value: T | null | undefined): value is T {
  return value !== undefined && value !== null;
}

/**
 * "Mi cuenta" del conductor (`/api/me`). Toda operación parte del usuario
 * autenticado: se busca su `DriverModel` por `userId` y solo se toca lo que
 * pertenece a su cliente (vehículos, tickets) o a su perfil.
 */
@Injectable()
export class MeService {
  constructor(
    @Inject(SEQUELIZE) private readonly sequelize: Sequelize,
    private readonly listTickets: ListTicketsUseCase,
  ) {}

  // ================== PERFIL ==================

  /** `GET /api/me`: la respuesta que también devuelven los demás endpoints de perfil. */
  async getMe(userId: number) {
    const { driver, client } = await this.loadDriver(userId);
    const user = await this.sequelize
      .getRepository(UserModel)
      .findByPk(userId, { attributes: ['id', 'username', 'email'] });
    if (!user) throw new ApplicationException(404, NO_DRIVER_PROFILE);

    const vehicles = await this.sequelize.getRepository(VehicleModel).findAll({
      where: { clientId: driver.clientId, status: 'active' },
      include: [{ model: VehicleTypeModel, as: 'vehicleType' }],
      order: [['id', 'ASC']],
    });
    const inside = await this.activeTicketsOf(vehicles.map((v) => v.id));
    const types = await this.sequelize
      .getRepository(VehicleTypeModel)
      .findAll({ where: { status: 'active' }, order: [['id', 'ASC']] });

    return {
      user: { id: user.id, username: user.username, email: user.email },
      driver: toDriverView(driver, client),
      vehicles: vehicles.map((v) => toVehicleView(v, inside.get(v.id) ?? null)),
      vehicleTypes: types.map(toVehicleTypeRef),
    };
  }

  async updateMe(userId: number, dto: UpdateMeDto) {
    const { driver, client } = await this.loadDriver(userId);

    if (given(dto.docNumber) && dto.docNumber !== driver.docNumber) {
      const taken = await this.sequelize
        .getRepository(DriverModel)
        .findOne({ where: { docNumber: dto.docNumber, id: { [Op.ne]: driver.id } }, attributes: ['id'] });
      if (taken) throw new ApplicationException(409, 'Ya existe un conductor con ese documento');
    }

    const clientChanges: Partial<Pick<ClientModel, 'name' | 'phone'>> = {};
    if (given(dto.name)) clientChanges.name = dto.name;
    if (given(dto.phone)) clientChanges.phone = dto.phone;
    const driverChanges: Partial<Pick<DriverModel, 'docType' | 'docNumber'>> = {};
    if (given(dto.docType)) driverChanges.docType = dto.docType;
    if (given(dto.docNumber)) driverChanges.docNumber = dto.docNumber;

    try {
      await this.sequelize.transaction(async (transaction) => {
        if (Object.keys(clientChanges).length) await client.update(clientChanges, { transaction });
        if (Object.keys(driverChanges).length) await driver.update(driverChanges, { transaction });
      });
    } catch (error) {
      // Otro conductor tomó el documento entre la consulta y el guardado.
      if (error instanceof UniqueConstraintError) {
        throw new ApplicationException(409, 'Ya existe un conductor con ese documento');
      }
      throw error;
    }
    return this.getMe(userId);
  }

  // ================== VEHÍCULOS ==================

  async addVehicle(userId: number, dto: CreateMyVehicleDto) {
    const { driver } = await this.loadDriver(userId);
    const type = await this.activeType(dto.vehicleTypeId);
    const plate = normalizePlate(dto.plate);
    assertValidPlate(plate, vehicleKindOf(type.name));
    const description = cleanDescription(dto.description);

    const vehicles = this.sequelize.getRepository(VehicleModel);
    const existing = await vehicles.findOne({ where: { plate } });

    let vehicleId: number;
    if (!existing) {
      const created = await this.uniquePlate(plate, () =>
        vehicles.create({ clientId: driver.clientId, vehicleTypeId: type.id, plate, description }),
      );
      vehicleId = created.id;
    } else if (existing.clientId === driver.clientId && existing.status !== 'active') {
      // Era suyo y lo había dado de baja: se reactiva con los datos nuevos.
      await existing.update({ vehicleTypeId: type.id, description, status: 'active' });
      vehicleId = existing.id;
    } else if (existing.clientId !== driver.clientId && (await this.isVisitorClient(existing.clientId))) {
      // Entró alguna vez como visitante sin app: el conductor lo reclama. Si
      // está dentro, su ticket abierto pasa a su nombre para que lo cobre a él.
      await this.sequelize.transaction(async (transaction) => {
        await existing.update(
          { clientId: driver.clientId, vehicleTypeId: type.id, description, status: 'active' },
          { transaction },
        );
        await this.sequelize
          .getRepository(TicketModel)
          .update(
            { clientId: driver.clientId },
            { where: { vehicleId: existing.id, status: { [Op.in]: INSIDE_STATUSES } }, transaction },
          );
      });
      vehicleId = existing.id;
    } else {
      throw new ApplicationException(409, `La placa ${plate} ya está registrada`);
    }

    return this.vehicleView(vehicleId);
  }

  async updateVehicle(userId: number, vehicleId: number, dto: UpdateMyVehicleDto) {
    const { driver } = await this.loadDriver(userId);
    const vehicles = this.sequelize.getRepository(VehicleModel);
    const vehicle = await vehicles.findOne({
      where: { id: vehicleId, clientId: driver.clientId, status: 'active' },
      include: [{ model: VehicleTypeModel, as: 'vehicleType' }],
    });
    if (!vehicle) throw new ApplicationException(404, 'Vehículo no encontrado');

    const nextPlate = given(dto.plate) ? normalizePlate(dto.plate) : vehicle.plate;
    const nextTypeId = dto.vehicleTypeId ?? vehicle.vehicleTypeId;
    const plateChanged = nextPlate !== vehicle.plate;
    const typeChanged = nextTypeId !== vehicle.vehicleTypeId;

    const changes: Partial<Pick<VehicleModel, 'plate' | 'vehicleTypeId' | 'description'>> = {};
    if (plateChanged || typeChanged) {
      // Si el tipo no cambia se usa el actual aunque ya no esté activo en el catálogo.
      const type = typeChanged || !vehicle.vehicleType ? await this.activeType(nextTypeId) : vehicle.vehicleType;
      if ((await this.activeTicketsOf([vehicle.id])).has(vehicle.id)) {
        throw new ApplicationException(
          409,
          'No puedes cambiar la placa ni el tipo mientras el vehículo está dentro del parqueadero',
        );
      }
      assertValidPlate(nextPlate, vehicleKindOf(type.name));
      if (plateChanged && (await vehicles.findOne({ where: { plate: nextPlate }, attributes: ['id'] }))) {
        throw new ApplicationException(409, `La placa ${nextPlate} ya está registrada`);
      }
      changes.plate = nextPlate;
      changes.vehicleTypeId = nextTypeId;
    }
    if (dto.description !== undefined) changes.description = cleanDescription(dto.description);

    await this.uniquePlate(nextPlate, () => vehicle.update(changes));
    return this.vehicleView(vehicle.id);
  }

  // ================== PREFERENCIAS ==================

  async setPreferences(userId: number, dto: UpdatePreferencesDto) {
    const { driver } = await this.loadDriver(userId);

    if (dto.preferredZoneIds.length) {
      const zones = await this.sequelize
        .getRepository(ParkingZoneModel)
        .findAll({ where: { id: { [Op.in]: dto.preferredZoneIds }, status: 'active' }, attributes: ['id'] });
      if (zones.length !== dto.preferredZoneIds.length) {
        throw new ApplicationException(422, 'Alguna de las zonas elegidas no existe o no está activa');
      }
    }
    if (dto.preferredSpotId !== null) {
      const spot = await this.sequelize
        .getRepository(ParkingSpotModel)
        .findByPk(dto.preferredSpotId, { attributes: ['id'] });
      if (!spot) throw new ApplicationException(422, 'El espacio elegido no existe');
    }
    if (dto.paymentMethod === 'auto' && !driver.cardToken) {
      throw new ApplicationException(422, 'Guarda una tarjeta para usar el cobro automático');
    }

    await driver.update({
      preferredZoneIds: dto.preferredZoneIds.join(','),
      preferredSpotId: dto.preferredSpotId,
      paymentMethod: dto.paymentMethod,
    });
    return this.getMe(userId);
  }

  // ================== TARJETA ==================

  async saveCard(userId: number, dto: SaveCardDto) {
    const { driver } = await this.loadDriver(userId);
    await driver.update({ cardToken: dto.token, cardBrand: dto.brand, cardLast4: dto.last4 });
    return this.getMe(userId);
  }

  async removeCard(userId: number) {
    const { driver } = await this.loadDriver(userId);
    await driver.update({
      cardToken: null,
      cardBrand: null,
      cardLast4: null,
      // Sin tarjeta no hay cobro automático posible.
      paymentMethod: driver.paymentMethod === 'auto' ? 'cash' : driver.paymentMethod,
    });
    return this.getMe(userId);
  }

  // ================== HISTORIAL ==================

  /** Tickets de TODOS los vehículos del conductor, activos o dados de baja. */
  async myTickets(userId: number, query: MyTicketsQueryDto) {
    const { driver } = await this.loadDriver(userId);
    const vehicles = await this.sequelize
      .getRepository(VehicleModel)
      .findAll({ where: { clientId: driver.clientId }, attributes: ['id'] });

    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    if (vehicles.length === 0) {
      return { items: [], meta: { page, limit, total: 0, totalPages: 0 } };
    }
    return this.listTickets.execute({
      status: query.status,
      page,
      limit,
      vehicleIds: vehicles.map((v) => v.id),
    });
  }

  // ================== AUXILIARES ==================

  /** Conductor (con su cliente) del usuario autenticado, o 404. */
  private async loadDriver(userId: number): Promise<{ driver: DriverModel; client: ClientModel }> {
    const driver = await this.sequelize.getRepository(DriverModel).findOne({
      where: { userId },
      include: [{ model: ClientModel, as: 'client' }],
    });
    if (!driver?.client) throw new ApplicationException(404, NO_DRIVER_PROFILE);
    return { driver, client: driver.client };
  }

  private async activeType(vehicleTypeId: number): Promise<VehicleTypeModel> {
    const type = await this.sequelize.getRepository(VehicleTypeModel).findByPk(vehicleTypeId);
    if (!type || type.status !== 'active') {
      throw new ApplicationException(404, `Tipo de vehículo ${vehicleTypeId} no encontrado`);
    }
    return type;
  }

  private async isVisitorClient(clientId: number): Promise<boolean> {
    const visitor = await this.sequelize
      .getRepository(ClientModel)
      .findOne({ where: { email: VISITOR_EMAIL }, attributes: ['id'] });
    return visitor?.id === clientId;
  }

  /** Ticket abierto (o en cobro) de cada vehículo que sigue dentro; el más reciente por vehículo. */
  private async activeTicketsOf(vehicleIds: number[]): Promise<Map<number, ActiveTicketRef>> {
    const inside = new Map<number, ActiveTicketRef>();
    if (vehicleIds.length === 0) return inside;

    const tickets = await this.sequelize.getRepository(TicketModel).findAll({
      where: { vehicleId: { [Op.in]: vehicleIds }, status: { [Op.in]: INSIDE_STATUSES } },
      include: [{ model: ParkingSpotModel, as: 'parkingSpot', attributes: ['id', 'code'] }],
      order: [['id', 'DESC']],
    });
    for (const t of tickets) {
      if (t.vehicleId !== null && !inside.has(t.vehicleId)) {
        inside.set(t.vehicleId, {
          id: t.id,
          spotCode: t.parkingSpot?.code ?? null,
          zoneId: t.parkingZoneId,
          entryAt: t.entryAt,
        });
      }
    }
    return inside;
  }

  /** `Vehicle` del contrato, leído de nuevo para reflejar el tipo y el ticket actuales. */
  private async vehicleView(vehicleId: number) {
    const vehicle = await this.sequelize.getRepository(VehicleModel).findByPk(vehicleId, {
      include: [{ model: VehicleTypeModel, as: 'vehicleType' }],
    });
    if (!vehicle) throw new ApplicationException(404, 'Vehículo no encontrado');
    const inside = await this.activeTicketsOf([vehicle.id]);
    return toVehicleView(vehicle, inside.get(vehicle.id) ?? null);
  }

  /** Convierte la violación de la placa única (carrera entre dos peticiones) en 409. */
  private async uniquePlate<T>(plate: string, work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if (error instanceof UniqueConstraintError) {
        throw new ApplicationException(409, `La placa ${plate} ya está registrada`);
      }
      throw error;
    }
  }
}
