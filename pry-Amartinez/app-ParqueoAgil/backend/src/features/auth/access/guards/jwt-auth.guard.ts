import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ApplicationException } from '../../../../common/exceptions/application.exception.js';
import { extractBearerToken, verifyAccessToken } from '../../../../shared/auth/jwt.js';
import { USER_REPOSITORY } from '../../users/domain/interfaces/user.repository.js';
import type { IUserRepository } from '../../users/domain/interfaces/user.repository.js';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';

/**
 * **MODALIDAD 2 — JWT (identidad).** Guard de autenticación.
 *
 * Equivalente NestJS de `authenticate` de StoreLab. Responde únicamente a la
 * pregunta **¿quién eres?**:
 *
 *  1. Si la ruta está marcada con `@Public()`, deja pasar sin exigir token.
 *  2. Lee el token de `Authorization: Bearer <token>` (RFC 6750).
 *  3. Verifica firma, algoritmo, `iss`, `aud`, `exp` (RFC 8725).
 *  4. **Revalida contra la BD** que el usuario siga existiendo y activo. Un JWT
 *     sigue siendo válido tras desactivar la cuenta, así que sin este paso la
 *     desactivación no tendría efecto hasta que caduque el token.
 *  5. Publica la identidad en `req.auth` (tipada por `auth-user.ts`).
 *
 * NO consulta la matriz de permisos: eso es responsabilidad del `PermissionsGuard`.
 * Cualquier fallo se responde con **401**.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(USER_REPOSITORY)
    private readonly usersRepository: IUserRepository,
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

    const token = extractBearerToken(req.headers.authorization);
    if (!token) {
      throw new ApplicationException(401, 'Token Bearer ausente');
    }

    const payload = verifyAccessToken(token);

    const userId = Number(payload.sub);
    if (!Number.isInteger(userId) || userId < 1) {
      throw new ApplicationException(401, 'Token de acceso inválido o expirado');
    }

    const user = await this.usersRepository.findById(userId);
    if (!user || user.status !== 'active') {
      throw new ApplicationException(401, 'Usuario inactivo o inexistente');
    }

    req.auth = {
      id: user.id,
      username: user.username,
      email: user.email,
      tokenId: payload.jti,
    };

    return true;
  }
}
