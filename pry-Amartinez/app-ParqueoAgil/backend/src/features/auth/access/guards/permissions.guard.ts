import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ApplicationException } from '../../../../common/exceptions/application.exception.js';
import {
  isOperationGranted,
  normalizePath,
} from '../../../../shared/auth/resource-match.js';
import { RESOURCE_ROLE_REPOSITORY } from '../../resource-roles/domain/interfaces/resource-role.repository.js';
import type { IResourceRoleRepository } from '../../resource-roles/domain/interfaces/resource-role.repository.js';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';

/**
 * **MODALIDAD 3 — JWT + RBAC.** Guard de autorización.
 *
 * Equivalente NestJS de `authorize` de StoreLab. Debe montarse **después** de
 * `JwtAuthGuard`. Responde a la segunda pregunta: *¿puede esta identidad
 * ejecutar `method + path`?*
 *
 *  - **Deny by default**: sin concesión activa que cubra la operación → 403.
 *  - **401** si no hay identidad (falta `JwtAuthGuard` o el token no valió).
 *  - **403** si hay identidad válida pero no hay permiso.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(RESOURCE_ROLE_REPOSITORY)
    private readonly resourceRolesRepository: IResourceRoleRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const req = context.switchToHttp().getRequest<Request>();

    if (!req.auth) {
      throw new ApplicationException(401, 'Autenticación requerida');
    }

    const method = req.method.toUpperCase();
    const path = normalizePath(req.originalUrl);
    const granted = await this.resourceRolesRepository.findEffectiveForUser(req.auth.id);

    if (!isOperationGranted(granted, method, path)) {
      throw new ApplicationException(
        403,
        `Acceso denegado: sin concesión para ${method} ${path}`,
      );
    }

    return true;
  }
}
