import { Module } from '@nestjs/common';
import { EnvironmentModule } from './config/environment/environment.module.js';
import { AuthModule } from './features/auth/auth.module.js';
import { BusinessModule } from './features/business/business.module.js';
import { HealthController } from './health/health.controller.js';
import { SeedersRunner } from './infrastructure/database/seeders/seeders.runner.js';
import { SequelizeModule } from './infrastructure/database/sequelize/sequelize.module.js';

/**
 * AppModule — módulo raíz de la aplicación.
 *
 * Los guards de auth/RBAC (JwtAuthGuard, PermissionsGuard) NO son globales:
 * se aplican a nivel de controller con `@UseGuards(JwtAuthGuard, PermissionsGuard)`.
 *
 * Esa decisión garantiza el orden correcto (primero authenticate, luego authorize)
 * y deja explícito qué rutas están protegidas.
 */
@Module({
  imports: [
    EnvironmentModule,
    SequelizeModule,
    BusinessModule,
    AuthModule,
  ],
  controllers: [HealthController],
  providers: [SeedersRunner],
})
export class AppModule {}
