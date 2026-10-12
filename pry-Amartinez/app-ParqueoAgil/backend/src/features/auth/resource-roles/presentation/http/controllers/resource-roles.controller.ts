import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard, PermissionsGuard } from '../../../../access/index.js';
import {
  CreateResourceRoleDto,
  ListResourceRolesDto,
} from '../../../application/dto/index.js';
import { ResourceRolesService } from '../../../application/use-cases/resource-roles.service.js';

@ApiTags('concesiones-rol')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('concesiones-rol')
export class ResourceRolesController {
  constructor(private readonly service: ResourceRolesService) {}

  @Get()
  @ApiOperation({ summary: 'Listar concesiones (filtros ?role_id=, ?resource_id=)' })
  async getAll(@Query() filters: ListResourceRolesDto) {
    const grants = await this.service.getAll(filters);
    return { grants };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener concesión por id' })
  async getOne(@Param('id', ParseIntPipe) id: number) {
    const grant = await this.service.getOne(id);
    return { grant };
  }

  @Post()
  @HttpCode(201)
  @ApiOperation({ summary: 'Conceder recurso a rol (crea permiso, idempotente)' })
  async grant(@Body() dto: CreateResourceRoleDto) {
    const grant = await this.service.grant(dto);
    return { message: 'Permiso concedido', grant };
  }

  @Patch(':id/deactivate')
  @ApiOperation({ summary: 'Retirar permiso (borrado lógico)' })
  async deactivate(@Param('id', ParseIntPipe) id: number) {
    const grant = await this.service.deactivate(id);
    return { message: 'Permiso retirado', grant };
  }

  @Patch(':id/reactivate')
  @ApiOperation({ summary: 'Reactivar permiso' })
  async reactivate(@Param('id', ParseIntPipe) id: number) {
    const grant = await this.service.reactivate(id);
    return { message: 'Permiso reactivado', grant };
  }
}
