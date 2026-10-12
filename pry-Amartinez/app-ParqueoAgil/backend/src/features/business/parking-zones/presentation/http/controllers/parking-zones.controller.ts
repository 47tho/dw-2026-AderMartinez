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
import { CreateParkingZoneDto } from '../../../application/dto/create-parking-zone.dto.js';
import { ParkingZoneMapper } from '../../../application/mappers/parking-zone.mapper.js';
import { CreateParkingZoneUseCase } from '../../../application/use-cases/create-parking-zone.use-case.js';
import { GetParkingZoneByIdUseCase } from '../../../application/use-cases/get-parking-zone-by-id.use-case.js';
import { ListParkingZonesUseCase } from '../../../application/use-cases/list-parking-zones.use-case.js';

/**
 * Controller del feature ParkingZones.
 *
 * **Modalidad 3 — JWT + RBAC**.
 */
@ApiTags('parking-zones')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('parking-zones')
export class ParkingZonesController {
  constructor(
    private readonly createZone: CreateParkingZoneUseCase,
    private readonly listZones: ListParkingZonesUseCase,
    private readonly getZone: GetParkingZoneByIdUseCase,
  ) {}

  @Post()
  @HttpCode(201)
  @ApiOperation({ summary: 'Crear zona de parqueo' })
  async create(@Body() dto: CreateParkingZoneDto) {
    const zone = await this.createZone.execute(dto);
    return ParkingZoneMapper.toResponse(zone);
  }

  @Get()
  @ApiOperation({ summary: 'Listar zonas de parqueo (paginado)' })
  async list(@Query('page') page = '1', @Query('limit') limit = '10') {
    return this.listZones.execute(Number(page), Number(limit));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener zona por id' })
  async findOne(@Param('id', ParseIntPipe) id: number) {
    const zone = await this.getZone.execute(id);
    return ParkingZoneMapper.toResponse(zone);
  }
}
