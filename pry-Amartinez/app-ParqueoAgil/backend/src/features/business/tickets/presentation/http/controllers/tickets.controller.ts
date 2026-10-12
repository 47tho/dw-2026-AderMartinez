import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  JwtAuthGuard,
  PermissionsGuard,
} from '../../../../../auth/access/index.js';
import { CreateTicketDto } from '../../../application/dto/create-ticket.dto.js';
import { CloseTicketDto } from '../../../application/dto/close-ticket.dto.js';
import { TicketMapper } from '../../../application/mappers/ticket.mapper.js';
import { CreateTicketUseCase } from '../../../application/use-cases/create-ticket.use-case.js';
import { CloseTicketUseCase } from '../../../application/use-cases/close-ticket.use-case.js';
import { GetTicketByIdUseCase } from '../../../application/use-cases/get-ticket-by-id.use-case.js';

/**
 * Controller del feature Tickets.
 *
 * **Modalidad 3 — JWT + RBAC**: SELLER recibe las 4 operaciones (listar,
 * consultar, abrir, cerrar); ADMIN las hereda todas.
 */
@ApiTags('tickets')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('tickets')
export class TicketsController {
  constructor(
    private readonly createTicket: CreateTicketUseCase,
    private readonly closeTicket: CloseTicketUseCase,
    private readonly getTicket: GetTicketByIdUseCase,
  ) {}

  @Post()
  @HttpCode(201)
  @ApiOperation({ summary: 'Registrar entrada (abre ticket y ocupa cupo)' })
  async create(@Body() dto: CreateTicketDto) {
    const ticket = await this.createTicket.execute(dto);
    return TicketMapper.toResponse(ticket);
  }

  @Post(':id/close')
  @HttpCode(200)
  @ApiOperation({ summary: 'Registrar salida (cierra ticket y libera cupo)' })
  async close(@Param('id', ParseIntPipe) id: number, @Body() dto: CloseTicketDto) {
    const ticket = await this.closeTicket.execute(id, dto);
    return TicketMapper.toResponse(ticket);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener ticket por id' })
  async findOne(@Param('id', ParseIntPipe) id: number) {
    const ticket = await this.getTicket.execute(id);
    return TicketMapper.toResponse(ticket);
  }
}
