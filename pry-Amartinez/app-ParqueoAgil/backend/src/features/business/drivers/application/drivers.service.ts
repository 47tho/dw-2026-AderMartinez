import { Inject, Injectable } from '@nestjs/common';
import { randomBytes, randomInt } from 'node:crypto';
import { Op } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { ApplicationException } from '../../../../common/exceptions/application.exception.js';
import { SEQUELIZE } from '../../../../infrastructure/database/sequelize/sequelize.module.js';
import { RoleUserModel } from '../../../auth/role-users/infrastructure/persistence/models/role-user.model.js';
import { RoleModel } from '../../../auth/roles/infrastructure/persistence/models/role.model.js';
import { SessionService } from '../../../auth/session/application/use-cases/session.service.js';
import type { SessionTokensDto } from '../../../auth/session/application/dto/index.js';
import { UserModel } from '../../../auth/users/infrastructure/persistence/models/user.model.js';
import { ClientModel } from '../../clients/infrastructure/persistence/models/client.model.js';
import { TicketModel } from '../../tickets/infrastructure/persistence/models/ticket.model.js';
import { vehicleKindOf } from '../../vehicles/domain/vehicle-rules.js';
import { VehicleModel } from '../../vehicles/infrastructure/persistence/models/vehicle.model.js';
import { VehicleTypeModel } from '../../vehicle-types/infrastructure/persistence/models/vehicle-type.model.js';
import { DriverModel } from '../infrastructure/persistence/models/driver.model.js';
import { RegisterDriverDto } from './dto/register-driver.dto.js';

export const DRIVER_ROLE = 'DRIVER';

/** 1023456789 → 102****789 */
export function maskDoc(value: string): string {
  if (value.length <= 6) return value;
  return `${value.slice(0, 3)}${'*'.repeat(value.length - 6)}${value.slice(-3)}`;
}

/**
 * Cuentas de conductor. Un conductor es, a la vez:
 *  - un `user` con rol DRIVER (inicia sesión con `/api/sesion/login`);
 *  - un `client` del parqueadero (a su nombre quedan los tickets);
 *  - un `driver` con documento, clave del QR y preferencias.
 * Las tres filas se crean en una sola transacción.
 */
@Injectable()
export class DriversService {
  constructor(
    @Inject(SEQUELIZE) private readonly sequelize: Sequelize,
    private readonly sessions: SessionService,
  ) {}

  /** Registro desde la app: crea la cuenta y abre sesión de una vez. */
  async register(dto: RegisterDriverDto, deviceInfo: string | null): Promise<SessionTokensDto> {
    await this.createAccount(dto);
    return this.sessions.login({ identifier: dto.email, password: dto.password }, deviceInfo);
  }

  async createAccount(dto: RegisterDriverDto): Promise<DriverModel> {
    const email = dto.email.trim().toLowerCase();
    return this.sequelize.transaction(async (transaction) => {
      const users = this.sequelize.getRepository(UserModel);
      const drivers = this.sequelize.getRepository(DriverModel);
      const clients = this.sequelize.getRepository(ClientModel);

      if (await users.findOne({ where: { email }, transaction })) {
        throw new ApplicationException(409, 'Ya existe una cuenta con ese correo');
      }
      if (await drivers.findOne({ where: { docNumber: dto.docNumber }, transaction })) {
        throw new ApplicationException(409, 'Ya existe un conductor con ese documento');
      }
      const role = await this.sequelize.getRepository(RoleModel).findOne({ where: { name: DRIVER_ROLE }, transaction });
      if (!role) {
        throw new ApplicationException(500, 'El rol DRIVER no existe: reinicie el backend para ejecutar los seeders');
      }

      const user = await users.create(
        {
          username: await this.freeUsername(email),
          email,
          password: dto.password,
          avatar: null,
          status: 'active',
        },
        { transaction },
      );
      await this.sequelize
        .getRepository(RoleUserModel)
        .create({ user_id: user.id, role_id: role.id, status: 'active' }, { transaction });

      // Si el parqueadero ya lo tenía como cliente (mismo correo) se reutiliza.
      let client = await clients.findOne({ where: { email }, transaction });
      if (client && (await drivers.findOne({ where: { clientId: client.id }, transaction }))) {
        throw new ApplicationException(409, 'Ya existe una cuenta con ese correo');
      }
      if (client) {
        await client.update({ name: dto.name, phone: dto.phone, status: 'active' }, { transaction });
      } else {
        client = await clients.create({ name: dto.name, email, phone: dto.phone, status: 'active' }, { transaction });
      }

      return drivers.create(
        {
          userId: user.id,
          clientId: client.id,
          docType: dto.docType,
          docNumber: dto.docNumber,
          qrSecret: randomBytes(32).toString('base64url'),
          preferredZoneIds: '',
          paymentMethod: 'cash',
        },
        { transaction },
      );
    });
  }

  async findByUserId(userId: number): Promise<DriverModel | null> {
    return this.sequelize.getRepository(DriverModel).findOne({ where: { userId } });
  }

  /** Lista para el panel web (sin la clave del QR ni el token de la tarjeta). */
  async list(page: number, limit: number) {
    const { rows, count } = await this.sequelize.getRepository(DriverModel).findAndCountAll({
      include: [{ model: ClientModel, as: 'client' }],
      offset: (page - 1) * limit,
      limit,
      order: [['id', 'DESC']],
    });
    const clientIds = rows.map((d) => d.clientId);
    const vehicles = clientIds.length
      ? await this.sequelize.getRepository(VehicleModel).findAll({
          where: { clientId: { [Op.in]: clientIds }, status: 'active' },
          include: [{ model: VehicleTypeModel, as: 'vehicleType', attributes: ['name'] }],
          order: [['id', 'ASC']],
        })
      : [];
    const openTickets = clientIds.length
      ? await this.sequelize.getRepository(TicketModel).findAll({
          where: { clientId: { [Op.in]: clientIds }, status: 'open' },
          attributes: ['clientId'],
        })
      : [];

    const items = rows.map((d) => ({
      id: d.id,
      clientId: d.clientId,
      name: d.client?.name ?? '',
      email: d.client?.email ?? null,
      phone: d.client?.phone ?? null,
      docType: d.docType,
      docNumber: maskDoc(d.docNumber),
      paymentMethod: d.paymentMethod,
      hasCard: Boolean(d.cardToken),
      vehicles: vehicles
        .filter((v) => v.clientId === d.clientId)
        .map((v) => ({ id: v.id, plate: v.plate, kind: vehicleKindOf(v.vehicleType?.name) })),
      activeTickets: openTickets.filter((t) => t.clientId === d.clientId).length,
      createdAt: d.createdAt,
    }));
    return { items, meta: { page, limit, total: count, totalPages: Math.ceil(count / limit) } };
  }

  /** Usuario a partir del correo: carlos.ruiz@x.com → carlos.ruiz (o carlos.ruiz.4821 si existe). */
  private async freeUsername(email: string): Promise<string> {
    const base = email.split('@')[0].toLowerCase().replace(/[^a-z0-9._]/g, '').slice(0, 60) || 'conductor';
    const users = this.sequelize.getRepository(UserModel);
    let candidate = base.length >= 3 ? base : `${base}.app`;
    while (await users.findOne({ where: { username: candidate } })) {
      candidate = `${base}.${randomInt(1000, 9999)}`;
    }
    return candidate;
  }
}
