import { Body, Controller, Get, Param, ParseIntPipe, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Min } from 'class-validator';
import { JwtAuthGuard, PermissionsGuard } from '../../../auth/access/index.js';
import { ParkingSpotsService } from '../application/parking-spots.service.js';

export class ListSpotsQueryDto {
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  zoneId?: number;
}

export class UpdateSpotStatusDto {
  @ApiProperty({ enum: ['free', 'blocked'] })
  @IsIn(['free', 'blocked'], { message: 'status debe ser free o blocked' })
  status!: 'free' | 'blocked';
}

/**
 * Plano de espacios. La lista es pública para todos los roles con sesión
 * (incluido el conductor) porque no dice quién ocupa cada espacio.
 */
@ApiTags('parking-spots')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('parking-spots')
export class ParkingSpotsController {
  constructor(private readonly service: ParkingSpotsService) {}

  @Get()
  @ApiOperation({ summary: 'Listar espacios (opcional: ?zoneId)' })
  list(@Query() query: ListSpotsQueryDto) {
    return this.service.list(query.zoneId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Bloquear o liberar un espacio (ADMIN)' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateSpotStatusDto) {
    return this.service.setStatus(id, dto.status);
  }
}
