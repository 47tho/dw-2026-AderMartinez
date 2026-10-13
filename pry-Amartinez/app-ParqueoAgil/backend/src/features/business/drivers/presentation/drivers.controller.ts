import { Body, Controller, Get, HttpCode, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { JwtAuthGuard, PermissionsGuard } from '../../../auth/access/index.js';
import { Public } from '../../../auth/access/decorators/public.decorator.js';
import { RegisterDriverDto } from '../application/dto/register-driver.dto.js';
import { DriversService } from '../application/drivers.service.js';

/**
 * Conductores. El registro es OPEN (lo usa la app antes de tener sesión) y
 * devuelve los mismos tokens que `/api/sesion/login`. La lista es para el
 * panel web (JWT + RBAC).
 */
@ApiTags('drivers')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('drivers')
export class DriversController {
  constructor(private readonly service: DriversService) {}

  @Public()
  @Post('register')
  @HttpCode(201)
  @ApiOperation({ summary: 'Registro de conductor desde la app (OPEN)' })
  register(@Body() dto: RegisterDriverDto, @Req() req: Request) {
    const agent = req.headers['user-agent'];
    return this.service.register(dto, agent ? String(agent).slice(0, 500) : null);
  }

  @Get()
  @ApiOperation({ summary: 'Listar conductores con sus vehículos (paginado)' })
  list(@Query('page') page = '1', @Query('limit') limit = '10') {
    return this.service.list(Math.max(1, Number(page) || 1), Math.min(100, Math.max(1, Number(limit) || 10)));
  }
}
