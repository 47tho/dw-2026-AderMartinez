import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Patch, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { requireAuthUser } from '../../../../shared/auth/auth-user.js';
import { JwtAuthGuard, PermissionsGuard } from '../../../auth/access/index.js';
import { CreateMyVehicleDto } from '../application/dto/create-my-vehicle.dto.js';
import { MyTicketsQueryDto } from '../application/dto/my-tickets-query.dto.js';
import { SaveCardDto } from '../application/dto/save-card.dto.js';
import { UpdateMeDto } from '../application/dto/update-me.dto.js';
import { UpdateMyVehicleDto } from '../application/dto/update-my-vehicle.dto.js';
import { UpdatePreferencesDto } from '../application/dto/update-preferences.dto.js';
import { MeService } from '../application/me.service.js';

/**
 * "Mi cuenta" del conductor (app móvil). JWT + RBAC (rol DRIVER). El
 * conductor es siempre el usuario de la sesión: nunca llega un id por la URL
 * para identificarlo.
 */
@ApiTags('me')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('me')
export class MeController {
  constructor(private readonly service: MeService) {}

  @Get()
  @ApiOperation({ summary: 'Mi perfil: usuario, conductor, vehículos y tipos de vehículo' })
  get(@Req() req: Request) {
    return this.service.getMe(requireAuthUser(req).id);
  }

  @Patch()
  @ApiOperation({ summary: 'Actualizar nombre, celular y documento' })
  update(@Req() req: Request, @Body() dto: UpdateMeDto) {
    return this.service.updateMe(requireAuthUser(req).id, dto);
  }

  @Post('vehicles')
  @HttpCode(201)
  @ApiOperation({ summary: 'Registrar un vehículo (placa normalizada y validada)' })
  addVehicle(@Req() req: Request, @Body() dto: CreateMyVehicleDto) {
    return this.service.addVehicle(requireAuthUser(req).id, dto);
  }

  @Patch('vehicles/:id')
  @ApiOperation({ summary: 'Modificar un vehículo (placa y tipo solo si está fuera del parqueadero)' })
  updateVehicle(@Req() req: Request, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateMyVehicleDto) {
    return this.service.updateVehicle(requireAuthUser(req).id, id, dto);
  }

  @Put('preferences')
  @ApiOperation({ summary: 'Zonas y espacio preferidos y método de pago' })
  setPreferences(@Req() req: Request, @Body() dto: UpdatePreferencesDto) {
    return this.service.setPreferences(requireAuthUser(req).id, dto);
  }

  @Put('card')
  @ApiOperation({ summary: 'Guardar tarjeta (token de la pasarela) para el cobro automático' })
  saveCard(@Req() req: Request, @Body() dto: SaveCardDto) {
    return this.service.saveCard(requireAuthUser(req).id, dto);
  }

  @Delete('card')
  @ApiOperation({ summary: 'Quitar la tarjeta guardada (si el pago era automático pasa a efectivo)' })
  removeCard(@Req() req: Request) {
    return this.service.removeCard(requireAuthUser(req).id);
  }

  @Get('tickets')
  @ApiOperation({ summary: 'Mi historial de parqueo (paginado, filtro: status)' })
  tickets(@Req() req: Request, @Query() query: MyTicketsQueryDto) {
    return this.service.myTickets(requireAuthUser(req).id, query);
  }
}
