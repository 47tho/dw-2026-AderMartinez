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
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  JwtAuthGuard,
  PermissionsGuard,
} from '../../../../../auth/access/index.js';
import { CreateClientDto } from '../../../application/dto/create-client.dto.js';
import { ClientMapper } from '../../../application/mappers/client.mapper.js';
import { CreateClientUseCase } from '../../../application/use-cases/create-client.use-case.js';
import { GetClientByIdUseCase } from '../../../application/use-cases/get-client-by-id.use-case.js';
import { ListClientsUseCase } from '../../../application/use-cases/list-clients.use-case.js';

/**
 * Controller del feature Clients.
 *
 * **Modalidad 3 — JWT + RBAC**: `JwtAuthGuard` resuelve la identidad (401 si no
 * hay token válido o el usuario está inactivo) y `PermissionsGuard` decide sobre
 * el par `(method, path)` (403 si no hay concesión activa).
 *
 * El rol SELLER recibe solo las lecturas; ADMIN, las 7 operaciones.
 */
@ApiTags('clients')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('clients')
export class ClientsController {
  constructor(
    private readonly createClient: CreateClientUseCase,
    private readonly listClients: ListClientsUseCase,
    private readonly getClient: GetClientByIdUseCase,
  ) {}

  @Post()
  @HttpCode(201)
  @ApiOperation({ summary: 'Crear cliente' })
  async create(@Body() dto: CreateClientDto) {
    const client = await this.createClient.execute(dto);
    return ClientMapper.toResponse(client);
  }

  @Get()
  @ApiOperation({ summary: 'Listar clientes (paginado)' })
  async list(@Query('page') page = '1', @Query('limit') limit = '10') {
    return this.listClients.execute(Number(page), Number(limit));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener cliente por id' })
  async findOne(@Param('id', ParseIntPipe) id: number) {
    const client = await this.getClient.execute(id);
    return ClientMapper.toResponse(client);
  }
}
