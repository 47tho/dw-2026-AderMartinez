import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard, PermissionsGuard } from '../../../../access/index.js';
import {
  CreateRoleDto,
  PatchRoleDto,
  UpdateRoleDto,
} from '../../../application/dto/index.js';
import { RolesService } from '../../../application/use-cases/roles.service.js';

@ApiTags('roles')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('roles')
export class RolesController {
  constructor(private readonly service: RolesService) {}

  @Get()
  @ApiOperation({ summary: 'Listar roles activos' })
  async getAll() {
    const roles = await this.service.getAll();
    return { roles };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener rol por id' })
  async getOne(@Param('id', ParseIntPipe) id: number) {
    const role = await this.service.getOne(id);
    return { role };
  }

  @Post()
  @HttpCode(201)
  @ApiOperation({ summary: 'Crear rol (nace SIN permisos)' })
  async create(@Body() dto: CreateRoleDto) {
    const role = await this.service.create(dto);
    return { role };
  }

  @Put(':id')
  @ApiOperation({ summary: 'Reemplazar rol (PUT)' })
  async updatePut(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateRoleDto) {
    const role = await this.service.updatePut(id, dto);
    return { role };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Modificar rol (PATCH)' })
  async updatePatch(@Param('id', ParseIntPipe) id: number, @Body() dto: PatchRoleDto) {
    const role = await this.service.updatePatch(id, dto);
    return { role };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar rol (físico)' })
  async deletePhysical(@Param('id', ParseIntPipe) id: number) {
    await this.service.deletePhysical(id);
    return { message: 'Rol eliminado permanentemente', id };
  }

  @Patch(':id/deactivate')
  @ApiOperation({ summary: 'Desactivar rol (borrado lógico)' })
  async deleteLogical(@Param('id', ParseIntPipe) id: number) {
    const role = await this.service.deleteLogical(id);
    return { message: 'Rol desactivado (borrado lógico)', role };
  }
}
