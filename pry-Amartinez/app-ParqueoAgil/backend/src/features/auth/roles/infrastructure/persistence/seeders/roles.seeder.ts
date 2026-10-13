import { Inject, Injectable, Logger } from '@nestjs/common';
import { ROLE_REPOSITORY } from '../../../domain/interfaces/role.repository.js';
import type { IRoleRepository } from '../../../domain/interfaces/role.repository.js';

/**
 * Seeder del catálogo de roles.
 *
 * Crea los dos roles de referencia del sistema (ADMIN y SELLER). Es determinista
 * (no usa datos aleatorios) e idempotente: `findByName` + `create` + reactivación.
 *
 * Los roles nacen **sin permisos**: las concesiones las crea el seeder de
 * `resource_roles` en ISS-12 (ADMIN recibirá todos los recursos, SELLER los de operación).
 */
@Injectable()
export class RolesSeeder {
  private readonly logger = new Logger(RolesSeeder.name);

  private static readonly SEED_ROLES = [
    {
      name: 'ADMIN',
      description: 'Administración del sistema: gestiona usuarios, roles y permisos',
    },
    {
      name: 'SELLER',
      description: 'Operación de ventas: consulta catálogo y registra tickets',
    },
    {
      name: 'DRIVER',
      description: 'Conductor de la app móvil: sus vehículos, su QR y su historial',
    },
  ] as const;

  constructor(
    @Inject(ROLE_REPOSITORY)
    private readonly repository: IRoleRepository,
  ) {}

  async seed(): Promise<void> {
    for (const item of RolesSeeder.SEED_ROLES) {
      const existing = await this.repository.findByName(item.name);

      if (!existing) {
        await this.repository.create({
          name: item.name,
          description: item.description,
          status: 'active',
        });
        this.logger.log(`Seeder roles: "${item.name}" creado`);
        continue;
      }

      if (existing.status !== 'active') {
        await this.repository.update(existing, { status: 'active' });
        this.logger.log(`Seeder roles: "${item.name}" reactivado`);
      } else {
        this.logger.log(`Seeder roles: "${item.name}" ya existía (idempotente)`);
      }
    }
  }
}
