import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Public } from '../../../../access/decorators/public.decorator.js';
import { JwtAuthGuard } from '../../../../access/guards/jwt-auth.guard.js';
import { requireAuthUser } from '../../../../../../shared/auth/auth-user.js';
import {
  LoginDto,
  LogoutSessionDto,
  RefreshSessionDto,
} from '../../../application/dto/index.js';
import { SessionService } from '../../../application/use-cases/session.service.js';

/**
 * Controller del feature Session.
 *
 * Mezcla las **tres modalidades** en un solo archivo:
 *
 * | Ruta                     | Modalidad                    | Guard              |
 * |--------------------------|------------------------------|--------------------|
 * | `POST /api/sesion/login` | OPEN                         | `@Public()`        |
 * | `POST /api/sesion/refresh` | OPEN (credencial de sesión) | `@Public()`      |
 * | `POST /api/sesion/logout`  | OPEN (credencial de sesión) | `@Public()`      |
 * | `GET  /api/sesion/perfil`  | JWT                          | `JwtAuthGuard`   |
 * | `GET  /api/permisos`       | JWT                          | `JwtAuthGuard`   |
 *
 * Ninguna lleva `PermissionsGuard`: son puntos de acceso previos o ajenos a la
 * matriz de permisos.
 */
@ApiTags('sesion')
@Controller('sesion')
export class SessionController {
  constructor(private readonly service: SessionService) {}

  // ================== OPEN ==================
  @Public()
  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Iniciar sesión (OPEN)' })
  async login(@Body() dto: LoginDto, @Req() req: Request) {
    const tokens = await this.service.login(dto, deviceInfo(req));
    return tokens;
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({ summary: 'Renovar access token (OPEN con refresh en body)' })
  async refresh(@Body() dto: RefreshSessionDto, @Req() req: Request) {
    const tokens = await this.service.refresh(dto, deviceInfo(req));
    return tokens;
  }

  @Public()
  @Post('logout')
  @HttpCode(200)
  @ApiOperation({ summary: 'Cerrar sesión (OPEN con refresh en body)' })
  async logout(@Body() dto: LogoutSessionDto) {
    await this.service.logout(dto);
    return { message: 'Sesión cerrada' };
  }

  // ================== JWT ==================
  @UseGuards(JwtAuthGuard)
  @Get('perfil')
  @ApiOperation({ summary: 'Perfil del usuario autenticado (JWT)' })
  async profile(@Req() req: Request) {
    const userId = requireAuthUser(req).id;
    const user = await this.service.profile(userId);
    return { user };
  }
}

/**
 * Controller separado para /api/permisos.
 *
 * Es una ruta distinta (no está bajo /api/sesion) y por eso vive en otro
 * `@Controller`. Mantiene la misma modalidad JWT que `perfil`.
 */
@ApiTags('sesion')
@Controller('permisos')
export class PermissionsController {
  constructor(private readonly service: SessionService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  @ApiOperation({ summary: 'Permisos efectivos del usuario autenticado (JWT)' })
  async myPermissions(@Req() req: Request) {
    const userId = requireAuthUser(req).id;
    const permissions = await this.service.myPermissions(userId);
    return { permissions };
  }
}

/** `device_info` de auditoría a partir del encabezado `User-Agent`. */
function deviceInfo(req: Request): string | null {
  const value = req.headers['user-agent'];
  if (!value) return null;
  return String(value).slice(0, 500);
}
