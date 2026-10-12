import { Global, Module } from '@nestjs/common';
import { UsersModule } from './users/users.module.js';
import { RolesModule } from './roles/roles.module.js';
import { ResourcesModule } from './resources/resources.module.js';
import { RoleUsersModule } from './role-users/role-users.module.js';
import { ResourceRolesModule } from './resource-roles/resource-roles.module.js';
import { RefreshTokensModule } from './refresh-tokens/refresh-tokens.module.js';
import { JwtAuthGuard } from './access/guards/jwt-auth.guard.js';
import { PermissionsGuard } from './access/guards/permissions.guard.js';

/**
 * AuthModule — agrupa todo lo relacionado con autenticación y autorización.
 *
 * **@Global()**: al ser global, los providers que exporta (JwtAuthGuard,
 * PermissionsGuard, y los repos/servicios que cada submódulo expone) están
 * disponibles en cualquier otro módulo.
 *
 * Estado en ISS-14: incluye UsersModule, RolesModule, ResourcesModule,
 * RoleUsersModule, ResourceRolesModule y RefreshTokensModule (feature de
 * sesiones renovables con rotación y detección de reúso).
 *
 * El siguiente ISS (ISS-15) añadirá SessionModule con login/refresh/logout.
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
  ],
  providers: [JwtAuthGuard, PermissionsGuard],
  exports: [
    UsersModule,
    RolesModule,
    ResourcesModule,
    RoleUsersModule,
    ResourceRolesModule,
    RefreshTokensModule,
    JwtAuthGuard,
    PermissionsGuard,
  ],
})
export class AuthModule {}
