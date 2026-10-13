import { PickType } from '@nestjs/swagger';
import { ListTicketsQueryDto } from '../../../tickets/application/dto/list-tickets-query.dto.js';

/**
 * Query de `GET /api/me/tickets`: solo estado y paginación. El filtro por
 * zona o placa es del panel web; aquí el conductor ve únicamente sus vehículos.
 */
export class MyTicketsQueryDto extends PickType(ListTicketsQueryDto, ['status', 'page', 'limit'] as const) {}
