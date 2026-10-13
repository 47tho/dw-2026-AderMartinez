import { Inject, Injectable, Logger } from '@nestjs/common';
import { ROLE_REPOSITORY } from '../../../../roles/domain/interfaces/role.repository.js';
import type { IRoleRepository } from '../../../../roles/domain/interfaces/role.repository.js';
import { RESOURCE_REPOSITORY } from '../../../../resources/domain/interfaces/resource.repository.js';
import type { IResourceRepository } from '../../../../resources/domain/interfaces/resource.repository.js';
import { ResourceRolesService } from '../../../application/use-cases/resource-roles.service.js';
import {
  DRIVER_RESOURCES,
  RESOURCE_CATALOG,
  SELLER_RESOURCES,
} from '../../../../resources/infrastructure/persistence/resource-catalog.js';

/**
 * Seeder de las concesiones rol ↔ recurso (`resource_roles`).
 *
 * **Este es el que construye la matriz de permisos.**
 *
 * Reparto de referencia:
 *   - ADMIN  → los 75 recursos (administración total).
 *   - SELLER → los 18 recursos de operación (clientes, vehicle-types,
 *     parking-zones, tickets, portería, cobro, conductores y reportes).
 *   - DRIVER → los 14 recursos de la app del conductor (/api/me, plano,
 *     zonas y eventos).
 *
 * Como `reconcileRole` es determinista, reejecutar el seeder **reconcilia** el
 * catálogo: concede lo que falte, reactiva lo inactivo y retira lo que sobre.
 * Así el rol SELLER nunca acumula permisos por accidente.
 */
@Injectable()
export class ResourceRolesSeeder {
  private readonly logger = new Logger(ResourceRolesSeeder.name);

  constructor(
    private readonly service: ResourceRolesService,
    @Inject(ROLE_REPOSITORY)
    private readonly rolesRepository: IRoleRepository,
    @Inject(RESOURCE_REPOSITORY)
    private readonly resourcesRepository: IResourceRepository,
  ) {}

  async seed(): Promise<void> {
    // 1) Construye un Map "METHOD /path" → resource_id reales de la BD.
    const resources = await this.resourcesRepository.findAllActive();
    const idByOperation = new Map(
      resources.map((r) => [`${r.method} ${r.path}`, r.id]),
    );

    /** Traduce el catálogo en código a los resource_id reales de la base. */
    const idsFor = (
      catalog: ReadonlyArray<{ method: string; path: string }>,
    ): number[] =>
      catalog
        .map((item) => idByOperation.get(`${item.method} ${item.path}`))
        .filter((id): id is number => typeof id === 'number');

    // 2) ADMIN → todos los recursos.
    const admin = await this.rolesRepository.findByName('ADMIN');
    if (admin) {
      const result = await this.service.reconcileRole(
        admin.id,
        idsFor(RESOURCE_CATALOG),
      );
      this.logger.log(
        `Seeder resource-roles: ADMIN → ${result.total_active} recursos ` +
          `(${result.activated} altas, ${result.deactivated} bajas)`,
      );
    } else {
      this.logger.warn('Seeder resource-roles: rol ADMIN no encontrado, se omite');
    }

    // 3) SELLER → solo los recursos marcados con seller: true.
    const seller = await this.rolesRepository.findByName('SELLER');
    if (seller) {
      const result = await this.service.reconcileRole(
        seller.id,
        idsFor(SELLER_RESOURCES),
      );
      this.logger.log(
        `Seeder resource-roles: SELLER → ${result.total_active} recursos ` +
          `(${result.activated} altas, ${result.deactivated} bajas)`,
      );
    } else {
      this.logger.warn('Seeder resource-roles: rol SELLER no encontrado, se omite');
    }

    // 4) DRIVER → solo los recursos marcados con driver: true.
    const driver = await this.rolesRepository.findByName('DRIVER');
    if (driver) {
      const result = await this.service.reconcileRole(
        driver.id,
        idsFor(DRIVER_RESOURCES),
      );
      this.logger.log(
        `Seeder resource-roles: DRIVER → ${result.total_active} recursos ` +
          `(${result.activated} altas, ${result.deactivated} bajas)`,
      );
    } else {
      this.logger.warn('Seeder resource-roles: rol DRIVER no encontrado, se omite');
    }
  }
}
