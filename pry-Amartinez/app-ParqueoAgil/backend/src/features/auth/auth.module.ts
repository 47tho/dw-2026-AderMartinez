import { Global, Module } from '@nestjs/common';
import { UsersModule } from './users/users.module.js';
import { RolesModule } from './roles/roles.module.js';
import { ResourcesModule } from './resources/resources.module.js';
import { RoleUsersModule } from './role-users/role-users.module.js';
import { ResourceRolesModule } from './resource-roles/resource-roles.module.js';
import { RefreshTokensModule } from './refresh-tokens/refresh-tokens.module.js';
import { SessionModule } from './session/session.module.js';
import { JwtAuthGuard } from './access/guards/jwt-auth.guard.js';
import { PermissionsGuard } from './access/guards/permissions.guard.js';

/**
 * AuthModule — agrupa todo lo relacionado con autenticación y autorización.
 *
 * **@Global()**: al ser global, los providers que exporta están disponibles en
 * cualquier otro módulo sin necesidad de importar AuthModule.
 *
 * Estado en ISS-15: incluye UsersModule, RolesModule, ResourcesModule,
 * RoleUsersModule, ResourceRolesModule, RefreshTokensModule y SessionModule.
 * La Fase II (Auth con RBAC) queda completa.
 */
@Global()
@Module({
  imports: [
    UsersModule,
    RolesModule,
    ResourcesModule,
    RoleUsersModule,
    ResourceRolesModule,
    RefreshTokensModule,
    SessionModule,
  ],
  providers: [JwtAuthGuard, PermissionsGuard],
  exports: [
    UsersModule,
    RolesModule,
    ResourcesModule,
    RoleUsersModule,
    ResourceRolesModule,
    RefreshTokensModule,
    SessionModule,
    JwtAuthGuard,
    PermissionsGuard,
  ],
})
export class AuthModule {}
