import { Inject, Injectable, Logger } from '@nestjs/common';
import { USER_REPOSITORY } from '../../../domain/interfaces/user.repository.js';
import type { IUserRepository } from '../../../domain/interfaces/user.repository.js';

/**
 * Seeder de usuarios.
 *
 * Crea los usuarios canónicos que sostienen la demostración de RBAC:
 *   - admin  / Admin123!
 *   - seller / Seller123!
 *   - lector / Lector123!  (lector de QR en la app móvil)
 *
 * Las contraseñas se guardan como hash (lo hace el hook @BeforeCreate del modelo).
 * Idempotente por username: reejecutarlo no duplica. Además **reactiva** a los
 * canónicos si quedaron inactivos.
 */
@Injectable()
export class UsersSeeder {
  private readonly logger = new Logger(UsersSeeder.name);

  private static readonly SEED_USERS = [
    {
      username: 'admin',
      email: 'admin@parqueoagil.local',
      password: 'Admin123!',
    },
    {
      username: 'seller',
      email: 'seller@parqueoagil.local',
      password: 'Seller123!',
    },
    {
      username: 'lector',
      email: 'lector@parqueoagil.local',
      password: 'Lector123!',
    },
  ] as const;

  constructor(
    @Inject(USER_REPOSITORY)
    private readonly repository: IUserRepository,
  ) {}

  async seed(): Promise<void> {
    for (const item of UsersSeeder.SEED_USERS) {
      const existing = await this.repository.findByIdentifierWithPassword(item.username);

      if (!existing) {
        await this.repository.create({
          username: item.username,
          email: item.email,
          password: item.password,
          avatar: null,
          status: 'active',
        });
        this.logger.log(`Seeder users: "${item.username}" creado`);
        continue;
      }

      if (existing.status !== 'active') {
        await this.repository.update(existing, { status: 'active' });
        this.logger.log(`Seeder users: "${item.username}" reactivado`);
      } else {
        this.logger.log(`Seeder users: "${item.username}" ya existía (idempotente)`);
      }
    }
  }
}
