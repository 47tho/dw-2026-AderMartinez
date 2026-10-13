import { Controller, Global, MessageEvent, Module, Req, Sse, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Observable, defer, filter, interval, map, merge, switchMap } from 'rxjs';
import { Sequelize } from 'sequelize-typescript';
import { Inject } from '@nestjs/common';
import { requireAuthUser } from '../../../shared/auth/auth-user.js';
import { SEQUELIZE } from '../../../infrastructure/database/sequelize/sequelize.module.js';
import { JwtAuthGuard, PermissionsGuard } from '../../auth/access/index.js';
import { DriverModel } from '../drivers/infrastructure/persistence/models/driver.model.js';
import { EventsService } from './application/events.service.js';

/**
 * `GET /api/events` — flujo SSE con los cambios del parqueadero.
 *
 * Se autentica con el mismo `Authorization: Bearer` (el panel y la app leen
 * el flujo con fetch, no con EventSource, para poder enviar el header).
 * El personal recibe todo; un conductor recibe el estado de los espacios
 * (sin placas) y solo los tickets de sus vehículos.
 */
@ApiTags('events')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('events')
export class EventsController {
  constructor(
    private readonly events: EventsService,
    @Inject(SEQUELIZE) private readonly sequelize: Sequelize,
  ) {}

  @Sse()
  @ApiOperation({ summary: 'Eventos en tiempo real (text/event-stream)' })
  stream(@Req() req: Request): Observable<MessageEvent> {
    const userId = requireAuthUser(req).id;
    return defer(() => this.sequelize.getRepository(DriverModel).findOne({ where: { userId } })).pipe(
      switchMap((driver) => {
        const ownClientId = driver?.clientId ?? null;
        const updates = this.events.stream().pipe(
          filter((e) => ownClientId === null || e.clientId === undefined || e.clientId === ownClientId),
          map((e): MessageEvent => ({ type: e.type, data: e.data as object })),
        );
        const heartbeat = interval(25_000).pipe(map((): MessageEvent => ({ type: 'ping', data: {} })));
        return merge(updates, heartbeat);
      }),
    );
  }
}

@Global()
@Module({
  controllers: [EventsController],
  providers: [EventsService],
  exports: [EventsService],
})
export class EventsModule {}
