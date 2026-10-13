import { Sequelize } from 'sequelize-typescript';
import { getDbBlock } from '../../../config/environment/db-env.js';
import { IEnvConfig } from '../../../config/environment/env.interface.js';

// ── Business (Fase I) ────────────────────────────────────────
import { ClientModel } from '../../../features/business/clients/infrastructure/persistence/models/client.model.js';
import { VehicleTypeModel } from '../../../features/business/vehicle-types/infrastructure/persistence/models/vehicle-type.model.js';
import { ParkingZoneModel } from '../../../features/business/parking-zones/infrastructure/persistence/models/parking-zone.model.js';
import { TicketModel } from '../../../features/business/tickets/infrastructure/persistence/models/ticket.model.js';

// ── Integración app móvil + panel web ───────────────────────
import { VehicleModel } from '../../../features/business/vehicles/infrastructure/persistence/models/vehicle.model.js';
import { ParkingSpotModel } from '../../../features/business/parking-spots/infrastructure/persistence/models/parking-spot.model.js';
import { DriverModel } from '../../../features/business/drivers/infrastructure/persistence/models/driver.model.js';

// ── Auth (Fase II) ───────────────────────────────────────────
import { UserModel } from '../../../features/auth/users/infrastructure/persistence/models/user.model.js';
import { RoleModel } from '../../../features/auth/roles/infrastructure/persistence/models/role.model.js';
import { ResourceModel } from '../../../features/auth/resources/infrastructure/persistence/models/resource.model.js';
import { RoleUserModel } from '../../../features/auth/role-users/infrastructure/persistence/models/role-user.model.js';
import { ResourceRoleModel } from '../../../features/auth/resource-roles/infrastructure/persistence/models/resource-role.model.js';
import { RefreshTokenModel } from '../../../features/auth/refresh-tokens/infrastructure/persistence/models/refresh-token.model.js';

export const ALL_MODELS: any[] = [
  // Business
  ClientModel,
  VehicleTypeModel,
  ParkingZoneModel,
  TicketModel,
  VehicleModel,
  ParkingSpotModel,
  // Auth
  UserModel,
  RoleModel,
  ResourceModel,
  RoleUserModel,
  ResourceRoleModel,
  RefreshTokenModel,
  // Conductores (dependen de users y clients)
  DriverModel,
];

export function sequelizeFactory(cfg: IEnvConfig): Sequelize {
  const block = getDbBlock(cfg);
  const options: Record<string, unknown> = {
    dialect: cfg.dbDialect,
    host: block.host,
    port: block.port,
    username: block.username,
    password: block.password,
    database: block.name,
    models: ALL_MODELS,
    logging: false,
  };
  if (cfg.dbDialect === 'oracle' && block.connectString) {
    options.connectString = block.connectString;
  }

  const sequelize = new Sequelize(options);

  // ── Asociaciones RBAC ─────────────────────────────────────
  // Se declaran AQUÍ (después de `new Sequelize`) porque sequelize-typescript
  // exige que los modelos ya estén registrados en la instancia antes de aceptar
  // `belongsTo` / `hasMany`.
  //
  // Si se importaran desde `auth.module.ts`, el orden real sería:
  //   1. Nest carga AuthModule → importa rbac.associations
  //   2. rbac.associations llama belongsTo() → ERROR (modelo sin inicializar)
  //   3. SequelizeModule crea la instancia y registra modelos
  registerRbacAssociations();

  return sequelize;
}

/**
 * Registra el grafo RBAC sobre los modelos ya cargados en la instancia.
 *
 * Está en una función para que el import de los modelos ocurra antes y no se
 * mezcle con la lógica de creación de la instancia.
 */
function registerRbacAssociations(): void {
  // --- La concesión conoce su rol y su recurso ---
  ResourceRoleModel.belongsTo(RoleModel, { foreignKey: 'role_id', as: 'role' });
  ResourceRoleModel.belongsTo(ResourceModel, {
    foreignKey: 'resource_id',
    as: 'resource',
  });
  RoleModel.hasMany(ResourceRoleModel, {
    foreignKey: 'role_id',
    as: 'resource_roles',
  });
  ResourceModel.hasMany(ResourceRoleModel, {
    foreignKey: 'resource_id',
    as: 'resource_roles',
  });

  // --- La asignación conoce su usuario y su rol ---
  RoleUserModel.belongsTo(UserModel, { foreignKey: 'user_id', as: 'user' });
  RoleUserModel.belongsTo(RoleModel, { foreignKey: 'role_id', as: 'role' });
  UserModel.hasMany(RoleUserModel, {
    foreignKey: 'user_id',
    as: 'role_users',
  });
  RoleModel.hasMany(RoleUserModel, {
    foreignKey: 'role_id',
    as: 'role_users',
  });

  // --- Las sesiones pertenecen a un usuario ---
  RefreshTokenModel.belongsTo(UserModel, {
    foreignKey: 'user_id',
    as: 'user',
  });
  UserModel.hasMany(RefreshTokenModel, {
    foreignKey: 'user_id',
    as: 'refresh_tokens',
  });
}
