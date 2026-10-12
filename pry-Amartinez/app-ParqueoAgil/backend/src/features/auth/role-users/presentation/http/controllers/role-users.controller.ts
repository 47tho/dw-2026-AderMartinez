import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard, PermissionsGuard } from '../../../../access/index.js';
import { CreateRoleUserDto } from '../../../application/dto/index.js';
import { RoleUsersService } from '../../../application/use-cases/role-users.service.js';

@ApiTags('asignaciones-rol')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('asignaciones-rol')
export class RoleUsersController {
  constructor(private readonly service: RoleUsersService) {}

  @Get()
  @ApiOperation({ summary: 'Listar asignaciones activas' })
  async getAll() {
    const assignments = await this.service.getAll();
    return { assignments };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener asignación por id' })
  async getOne(@Param('id', ParseIntPipe) id: number) {
    const assignment = await this.service.getOne(id);
    return { assignment };
  }

  @Post()
  @HttpCode(201)
  @ApiOperation({ summary: 'Asignar rol a usuario (idempotente)' })
  async assign(@Body() dto: CreateRoleUserDto) {
    const assignment = await this.service.assign(dto);
    return { assignment };
  }

  @Patch(':id/deactivate')
  @ApiOperation({ summary: 'Retirar rol a usuario (borrado lógico)' })
  async deactivate(@Param('id', ParseIntPipe) id: number) {
    const assignment = await this.service.deactivate(id);
    return { message: 'Asignación desactivada', assignment };
  }

  @Patch(':id/reactivate')
  @ApiOperation({ summary: 'Reactivar asignación' })
  async reactivate(@Param('id', ParseIntPipe) id: number) {
    const assignment = await this.service.reactivate(id);
    return { message: 'Asignación reactivada', assignment };
  }
}
