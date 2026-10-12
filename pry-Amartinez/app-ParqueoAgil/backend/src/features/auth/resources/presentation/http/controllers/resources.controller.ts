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
  CreateResourceDto,
  PatchResourceDto,
  UpdateResourceDto,
} from '../../../application/dto/index.js';
import { ResourcesService } from '../../../application/use-cases/resources.service.js';

@ApiTags('recursos')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('recursos')
export class ResourcesController {
  constructor(private readonly service: ResourcesService) {}

  @Get()
  @ApiOperation({ summary: 'Listar recursos activos' })
  async getAll() {
    const resources = await this.service.getAll();
    return { resources };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener recurso por id' })
  async getOne(@Param('id', ParseIntPipe) id: number) {
    const resource = await this.service.getOne(id);
    return { resource };
  }

  @Post()
  @HttpCode(201)
  @ApiOperation({ summary: 'Crear recurso (par method+path)' })
  async create(@Body() dto: CreateResourceDto) {
    const resource = await this.service.create(dto);
    return { resource };
  }

  @Put(':id')
  @ApiOperation({ summary: 'Reemplazar recurso (PUT)' })
  async updatePut(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateResourceDto) {
    const resource = await this.service.updatePut(id, dto);
    return { resource };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Modificar recurso (PATCH)' })
  async updatePatch(@Param('id', ParseIntPipe) id: number, @Body() dto: PatchResourceDto) {
    const resource = await this.service.updatePatch(id, dto);
    return { resource };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar recurso (físico)' })
  async deletePhysical(@Param('id', ParseIntPipe) id: number) {
    await this.service.deletePhysical(id);
    return { message: 'Recurso eliminado permanentemente', id };
  }

  @Patch(':id/deactivate')
  @ApiOperation({ summary: 'Desactivar recurso (borrado lógico)' })
  async deleteLogical(@Param('id', ParseIntPipe) id: number) {
    const resource = await this.service.deleteLogical(id);
    return { message: 'Recurso desactivado (borrado lógico)', resource };
  }
}
