import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../features/auth/access/decorators/public.decorator.js';

/**
 * Health check técnico.
 *
 * Marcado con `@Public()` para que el `PermissionsGuard` global no exija
 * autenticación: es una ruta de monitoreo, no un recurso RBAC.
 */
@ApiTags('health')
@Controller('health')
export class HealthController {
  @Public()
  @Get()
  check() {
    return { status: 'ok' };
  }
}
