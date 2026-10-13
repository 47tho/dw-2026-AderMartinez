import { Inject, Injectable, Logger } from '@nestjs/common';
import { ROLE_USER_REPOSITORY } from '../../../domain/interfaces/role-user.repository.js';
import type { IRoleUserRepository } from '../../../domain/interfaces/role-user.repository.js';
import { USER_REPOSITORY } from '../../../../users/domain/interfaces/user.repository.js';
import type { IUserRepository } from '../../../../users/domain/interfaces/user.repository.js';
import { ROLE_REPOSITORY } from '../../../../roles/domain/interfaces/role.repository.js';
import type { IRoleRepository } from '../../../../roles/domain/interfaces/role.repository.js';

/**
 * Seeder de las asignaciones usuario ↔ rol (`role_users`).
 *
 * Crea las dos asignaciones de referencia:
 *   - admin  → ADMIN
 *   - seller → SELLER
 *
 * Con esto el usuario `admin` hereda los 75 recursos de `ADMIN` y el usuario
 * `seller` los 18 de `SELLER`, sin escribir ni una fila de autorización a mano.
 * Los conductores reciben el rol DRIVER al registrarse desde la app.
 *
 * Idempotente: si la pareja ya existe (activa o no), se asegura de que quede
 * activa en lugar de duplicarla.
 */
@Injectable()
export class RoleUsersSeeder {
  private readonly logger = new Logger(RoleUsersSeeder.name);

  private static readonly SEED_ROLE_USERS = [
    { username: 'admin', roleName: 'ADMIN' },
    { username: 'seller', roleName: 'SELLER' },
  ] as const;

  constructor(
    @Inject(ROLE_USER_REPOSITORY)
    private readonly repository: IRoleUserRepository,
    @Inject(USER_REPOSITORY)
    private readonly usersRepository: IUserRepository,
    @Inject(ROLE_REPOSITORY)
    private readonly rolesRepository: IRoleRepository,
  ) {}

  async seed(): Promise<void> {
    for (const item of RoleUsersSeeder.SEED_ROLE_USERS) {
      const user = await this.usersRepository.findByIdentifierWithPassword(item.username);
      const role = await this.rolesRepository.findByName(item.roleName);

      if (!user || !role) {
        this.logger.warn(
          `Seeder role-users: falta ${item.username} o ${item.roleName}, se omite esa asignación`,
        );
        continue;
      }

      const existing = await this.repository.findByUserAndRole(user.id, role.id);

      if (!existing) {
        await this.repository.create({
          user_id: user.id,
          role_id: role.id,
          status: 'active',
        });
        this.logger.log(
          `Seeder role-users: "${item.username}" → "${item.roleName}" creada`,
        );
        continue;
      }

      if (existing.status !== 'active') {
        await this.repository.update(existing, { status: 'active' });
        this.logger.log(
          `Seeder role-users: "${item.username}" → "${item.roleName}" reactivada`,
        );
      } else {
        this.logger.log(
          `Seeder role-users: "${item.username}" → "${item.roleName}" ya existía (idempotente)`,
        );
      }
    }
  }
}
