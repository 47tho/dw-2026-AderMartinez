import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  JwtAuthGuard,
  PermissionsGuard,
} from '../../../../../auth/access/index.js';
import { CreateVehicleTypeDto } from '../../../application/dto/create-vehicle-type.dto.js';
import { VehicleTypeMapper } from '../../../application/mappers/vehicle-type.mapper.js';
import { CreateVehicleTypeUseCase } from '../../../application/use-cases/create-vehicle-type.use-case.js';
import { GetVehicleTypeByIdUseCase } from '../../../application/use-cases/get-vehicle-type-by-id.use-case.js';
import { ListVehicleTypesUseCase } from '../../../application/use-cases/list-vehicle-types.use-case.js';

/**
 * Controller del feature VehicleTypes.
 *
 * **Modalidad 3 — JWT + RBAC**.
 */
@ApiTags('vehicle-types')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('vehicle-types')
export class VehicleTypesController {
  constructor(
    private readonly createVehicleType: CreateVehicleTypeUseCase,
    private readonly listVehicleTypes: ListVehicleTypesUseCase,
    private readonly getVehicleType: GetVehicleTypeByIdUseCase,
  ) {}

  @Post()
  @HttpCode(201)
  @ApiOperation({ summary: 'Crear tipo de vehículo' })
  async create(@Body() dto: CreateVehicleTypeDto) {
    const vt = await this.createVehicleType.execute(dto);
    return VehicleTypeMapper.toResponse(vt);
  }

  @Get()
  @ApiOperation({ summary: 'Listar tipos de vehículo (paginado)' })
  async list(@Query('page') page = '1', @Query('limit') limit = '10') {
    return this.listVehicleTypes.execute(Number(page), Number(limit));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener tipo de vehículo por id' })
  async findOne(@Param('id', ParseIntPipe) id: number) {
    const vt = await this.getVehicleType.execute(id);
    return VehicleTypeMapper.toResponse(vt);
  }
}
