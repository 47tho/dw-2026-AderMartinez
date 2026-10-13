import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module.js';
import { RefreshTokensModule } from '../refresh-tokens/refresh-tokens.module.js';
import { ResourceRolesModule } from '../resource-roles/resource-roles.module.js';
import { SessionService } from './application/use-cases/session.service.js';
import {
  PermissionsController,
  SessionController,
} from './presentation/http/controllers/session.controller.js';

/**
 * SessionModule — feature Session completo.
 *
 * Importa UsersModule (para inyectar USER_REPOSITORY), RefreshTokensModule
 * (para inyectar RefreshTokensService) y ResourceRolesModule (para inyectar
 * RESOURCE_ROLE_REPOSITORY).
 *
 * Expone `SessionService` para que otros módulos puedan usar sus métodos.
 */
@Module({
  imports: [UsersModule, RefreshTokensModule, ResourceRolesModule],
  controllers: [SessionController, PermissionsController],
  providers: [SessionService],
  exports: [SessionService],
})
export class SessionModule {}
