import { Global, Module } from '@nestjs/common';
import { UsersModule } from './users/users.module.js';
import { RolesModule } from './roles/roles.module.js';
import { ResourcesModule } from './resources/resources.module.js';
import { RoleUsersModule } from './role-users/role-users.module.js';
import { ResourceRolesModule } from './resource-roles/resource-roles.module.js';
import { JwtAuthGuard } from './access/guards/jwt-auth.guard.js';
import { PermissionsGuard } from './access/guards/permissions.guard.js';

/**
 * AuthModule — agrupa todo lo relacionado con autenticación y autorización.
 *
 * **@Global()**: al ser global, los providers que exporta (JwtAuthGuard,
 * PermissionsGuard y los tokens USER_REPOSITORY, ROLE_REPOSITORY, etc.) están
 * disponibles en cualquier otro módulo SIN necesidad de importar AuthModule.
 *
 * Esto es lo que permite que `@UseGuards(JwtAuthGuard, PermissionsGuard)` en
 * cualquier controller (de negocio o de auth) resuelva sus dependencias sin
 * tener que importar AuthModule en cada feature module.
 *
 * Estado en ISS-13: incluye UsersModule, RolesModule, ResourcesModule,
 * RoleUsersModule, ResourceRolesModule y expone los guards.
 */
@Global()
@Module({
  imports: [
    UsersModule,
    RolesModule,
    ResourcesModule,
    RoleUsersModule,
    ResourceRolesModule,
  ],
  providers: [JwtAuthGuard, PermissionsGuard],
  exports: [
    UsersModule,
    RolesModule,
    ResourcesModule,
    RoleUsersModule,
    ResourceRolesModule,
    JwtAuthGuard,
    PermissionsGuard,
  ],
})
export class AuthModule {}
