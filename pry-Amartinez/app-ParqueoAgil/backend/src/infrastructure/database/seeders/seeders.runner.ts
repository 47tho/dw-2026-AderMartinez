import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ClientSeeder } from '../../../features/business/clients/infrastructure/persistence/seeders/client.seeder.js';
import { VehicleTypeSeeder } from '../../../features/business/vehicle-types/infrastructure/persistence/seeders/vehicle-type.seeder.js';
import { ParkingZoneSeeder } from '../../../features/business/parking-zones/infrastructure/persistence/seeders/parking-zone.seeder.js';
import { UsersSeeder } from '../../../features/auth/users/infrastructure/persistence/seeders/users.seeder.js';
import { RolesSeeder } from '../../../features/auth/roles/infrastructure/persistence/seeders/roles.seeder.js';
import { ResourcesSeeder } from '../../../features/auth/resources/infrastructure/persistence/seeders/resources.seeder.js';
import { RoleUsersSeeder } from '../../../features/auth/role-users/infrastructure/persistence/seeders/role-users.seeder.js';
import { ResourceRolesSeeder } from '../../../features/auth/resource-roles/infrastructure/persistence/seeders/resource-roles.seeder.js';
import { ParkingLayoutSeeder } from '../../../features/business/parking-spots/infrastructure/persistence/seeders/parking-layout.seeder.js';
import { DriversSeeder } from '../../../features/business/drivers/infrastructure/persistence/seeders/drivers.seeder.js';
import { DemoActivitySeeder } from '../../../features/business/gate/infrastructure/demo-activity.seeder.js';

/**
 * Orquestador de seeders. Se ejecuta tras el bootstrap de Nest.
 *
 * Orden de ejecución (el orden importa: cada eslabón depende del anterior):
 *   - Business: clients → vehicle-types → parking-zones → parking-layout (espacios)
 *   - Auth:     users → roles → resources → role-users → resource-roles
 *   - App:      drivers (conductor demo) → demo-activity (tickets de ejemplo)
 *
 * Todos los seeders son idempotentes: reejecutarlos no duplica datos.
 */
@Injectable()
export class SeedersRunner implements OnApplicationBootstrap {
  private readonly logger = new Logger(SeedersRunner.name);

  constructor(
    private readonly clientSeeder: ClientSeeder,
    private readonly vehicleTypeSeeder: VehicleTypeSeeder,
    private readonly parkingZoneSeeder: ParkingZoneSeeder,
    private readonly usersSeeder: UsersSeeder,
    private readonly rolesSeeder: RolesSeeder,
    private readonly resourcesSeeder: ResourcesSeeder,
    private readonly roleUsersSeeder: RoleUsersSeeder,
    private readonly resourceRolesSeeder: ResourceRolesSeeder,
    private readonly parkingLayoutSeeder: ParkingLayoutSeeder,
    private readonly driversSeeder: DriversSeeder,
    private readonly demoActivitySeeder: DemoActivitySeeder,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    this.logger.log(
      'Ejecutando seeders (idempotentes) en orden: clients → vehicle-types → parking-zones → parking-layout → users → roles → resources → role-users → resource-roles → drivers → demo-activity',
    );

    // ── Business ─────────────────────────────
    await this.clientSeeder.seed();
    await this.vehicleTypeSeeder.seed();
    await this.parkingZoneSeeder.seed();
    await this.parkingLayoutSeeder.seed();

    // ── Auth: catálogos ──────────────────────
    await this.usersSeeder.seed();
    await this.rolesSeeder.seed();
    await this.resourcesSeeder.seed();

    // ── Auth: matriz RBAC ────────────────────
    await this.roleUsersSeeder.seed();
    await this.resourceRolesSeeder.seed();

    // ── App móvil + panel web ────────────────
    await this.driversSeeder.seed();
    await this.demoActivitySeeder.seed();

    this.logger.log('Seeders ejecutados correctamente');
  }
}
