import { Controller, Global, Inject, MessageEvent, Module, Req, Sse, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Observable, defer, filter, interval, map, merge, switchMap } from 'rxjs';
import { Sequelize } from 'sequelize-typescript';
import { requireAuthUser } from '../../../shared/auth/auth-user.js';
import { isOperationGranted } from '../../../shared/auth/resource-match.js';
import { SEQUELIZE } from '../../../infrastructure/database/sequelize/sequelize.module.js';
import { JwtAuthGuard, PermissionsGuard } from '../../auth/access/index.js';
import { RESOURCE_ROLE_REPOSITORY } from '../../auth/resource-roles/domain/interfaces/resource-role.repository.js';
import type { IResourceRoleRepository } from '../../auth/resource-roles/domain/interfaces/resource-role.repository.js';
import { DriverModel } from '../drivers/infrastructure/persistence/models/driver.model.js';
import { EventsService } from './application/events.service.js';

/**
 * `GET /api/events` — flujo SSE con los cambios del parqueadero.
 *
 * Se autentica con el mismo `Authorization: Bearer` (el panel y la app leen
 * el flujo con fetch, no con EventSource, para poder enviar el header).
 *
 * Quién ve qué se decide con la matriz RBAC, no por la ausencia de perfil:
 *  - con permiso para listar tickets (personal) → todos los eventos;
 *  - sin ese permiso (conductor) → estado de espacios y zonas (sin placas) y
 *    solo los tickets de su propio cliente; si no tiene perfil de conductor,
 *    ningún ticket.
 *
 * El token se valida al conectar; el cliente reconecta al renovarlo.
 */
@ApiTags('events')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('events')
export class EventsController {
  constructor(
    private readonly events: EventsService,
    @Inject(SEQUELIZE) private readonly sequelize: Sequelize,
    @Inject(RESOURCE_ROLE_REPOSITORY) private readonly permissions: IResourceRoleRepository,
  ) {}

  @Sse()
  @ApiOperation({ summary: 'Eventos en tiempo real (text/event-stream)' })
  stream(@Req() req: Request): Observable<MessageEvent> {
    const userId = requireAuthUser(req).id;
    const audience = defer(async () => {
      const granted = await this.permissions.findEffectiveForUser(userId);
      if (isOperationGranted(granted, 'GET', '/api/tickets')) return { staff: true, clientId: null };
      const driver = await this.sequelize.getRepository(DriverModel).findOne({ where: { userId } });
      return { staff: false, clientId: driver?.clientId ?? null };
    });

    return audience.pipe(
      switchMap(({ staff, clientId }) => {
        const updates = this.events.stream().pipe(
          filter((e) => staff || e.clientId === undefined || (clientId !== null && e.clientId === clientId)),
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
