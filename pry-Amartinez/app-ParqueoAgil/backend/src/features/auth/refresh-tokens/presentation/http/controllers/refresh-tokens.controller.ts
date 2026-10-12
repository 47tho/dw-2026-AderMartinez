import {
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../../../access/guards/jwt-auth.guard.js';
import { requireAuthUser } from '../../../../../../shared/auth/auth-user.js';
import { RefreshTokensService } from '../../../application/use-cases/refresh-tokens.service.js';

/**
 * Controller del feature RefreshTokens — **modalidad JWT pura**.
 *
 * Todas las operaciones actúan sobre las sesiones del usuario autenticado
 * (`req.auth.id`). **No exigen RBAC**: poder ver y revocar **tus propias**
 * sesiones es un derecho derivado de estar autenticado, no de tener un permiso
 * concreto. Por eso solo montan `JwtAuthGuard`, no `PermissionsGuard`.
 *
 * Estas rutas no figuran en el catálogo de recursos (no hay permiso que conceder
 * para cerrar tu propia sesión).
 */
@ApiTags('sesiones')
@UseGuards(JwtAuthGuard)
@Controller('sesiones')
export class RefreshTokensController {
  constructor(private readonly service: RefreshTokensService) {}

  // ================== READ ==================
  @Get()
  @ApiOperation({ summary: 'Listar mis sesiones activas' })
  async getAll(@Req() req: Request) {
    const userId = requireAuthUser(req).id;
    const sessions = await this.service.getAllMine(userId);
    return { sessions };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Consultar una sesión propia' })
  async getOne(
    @Req() req: Request,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const userId = requireAuthUser(req).id;
    const session = await this.service.getMine(userId, id);
    return { session };
  }

  // ================== STATE (revocar) ==================
  @Patch('deactivate-all')
  @ApiOperation({ summary: 'Revocar TODAS mis sesiones' })
  async revokeAll(@Req() req: Request) {
    const userId = requireAuthUser(req).id;
    const revoked = await this.service.revokeAllMine(userId);
    return { message: 'Todas las sesiones revocadas', revoked };
  }

  @Patch(':id/deactivate')
  @ApiOperation({ summary: 'Revocar una sesión propia' })
  async revokeOne(
    @Req() req: Request,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const userId = requireAuthUser(req).id;
    const session = await this.service.revokeMine(userId, id);
    return { message: 'Sesión revocada', session };
  }

  // ================== PURGE ==================
  @Delete()
  @ApiOperation({ summary: 'Purgar mis sesiones revocadas/expiradas' })
  async purge(@Req() req: Request) {
    const userId = requireAuthUser(req).id;
    const purged = await this.service.purgeMine(userId);
    return { message: 'Sesiones inactivas purgadas', purged };
  }
}
