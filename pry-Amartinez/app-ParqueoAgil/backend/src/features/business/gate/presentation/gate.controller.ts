import { Body, Controller, HttpCode, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { JwtAuthGuard, PermissionsGuard } from '../../../auth/access/index.js';
import type { PaymentMethodCode } from '../../drivers/infrastructure/persistence/models/driver.model.js';
import { GateService } from '../application/gate.service.js';

export class ScanDto {
  @ApiProperty({ example: 'PQA1.12.59707080.0.b4b18f78b8a980d6', description: 'Texto leído del QR' })
  @IsString()
  @IsNotEmpty({ message: 'code es requerido' })
  @MaxLength(300)
  code!: string;
}

export class ManualEntryDto {
  @ApiProperty({ example: 'KLM456' })
  @IsString()
  @IsNotEmpty({ message: 'plate es requerida' })
  @MaxLength(10)
  plate!: string;

  @ApiProperty({ example: 1 })
  @IsInt({ message: 'vehicleTypeId debe ser entero' })
  @Min(1)
  vehicleTypeId!: number;
}

export class ManualExitDto {
  @ApiProperty({ example: 'KLM456' })
  @IsString()
  @IsNotEmpty({ message: 'plate es requerida' })
  @MaxLength(10)
  plate!: string;
}

export class PayTicketDto {
  @ApiProperty({ enum: ['cash', 'card', 'qr', 'auto'] })
  @IsIn(['cash', 'card', 'qr', 'auto'], { message: 'method debe ser cash, card, qr o auto' })
  method!: PaymentMethodCode;

  @ApiPropertyOptional({ example: 10000, description: 'Efectivo recibido (solo method=cash)' })
  @IsOptional()
  @IsInt({ message: 'cashReceived debe ser un valor en pesos, sin decimales' })
  @Min(0)
  @Max(10_000_000, { message: 'cashReceived no puede superar $10.000.000' })
  cashReceived?: number;
}

/** Terminal de la portería (panel web). Rol SELLER u ADMIN. */
@ApiTags('gate')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('gate')
export class GateController {
  constructor(private readonly gate: GateService) {}

  @Post('scan')
  @HttpCode(200)
  @ApiOperation({ summary: 'Leer el QR del conductor: entrada (asigna espacio) o salida (fija el valor)' })
  scan(@Body() dto: ScanDto) {
    return this.gate.scan(dto.code);
  }

  @Post('manual-entry')
  @HttpCode(200)
  @ApiOperation({ summary: 'Entrada por placa (visitante sin app)' })
  manualEntry(@Body() dto: ManualEntryDto) {
    return this.gate.manualEntry(dto.plate, dto.vehicleTypeId);
  }

  @Post('manual-exit')
  @HttpCode(200)
  @ApiOperation({ summary: 'Salida por placa: fija el valor a cobrar' })
  manualExit(@Body() dto: ManualExitDto) {
    return this.gate.manualExit(dto.plate);
  }
}

/** Cobro de la salida. Vive en /api/tickets junto al resto del ciclo del ticket. */
@ApiTags('tickets')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('tickets')
export class TicketPaymentsController {
  constructor(private readonly gate: GateService) {}

  @Post(':id/pay')
  @HttpCode(200)
  @ApiOperation({ summary: 'Cobrar la salida (efectivo, datáfono, QR o cobro automático) y cerrar el ticket' })
  pay(@Param('id', ParseIntPipe) id: number, @Body() dto: PayTicketDto) {
    return this.gate.pay(id, dto.method, dto.cashReceived);
  }
}
