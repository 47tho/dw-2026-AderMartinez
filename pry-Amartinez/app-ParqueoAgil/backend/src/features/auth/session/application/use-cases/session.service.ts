import { Inject, Injectable } from '@nestjs/common';
import { ApplicationException } from '../../../../../common/exceptions/application.exception.js';
import { EntityNotFoundException } from '../../../../../common/exceptions/entity-not-found.exception.js';
import { comparePassword } from '../../../../../shared/auth/password.js';
import { signAccessToken } from '../../../../../shared/auth/jwt.js';
import { USER_REPOSITORY } from '../../../users/domain/interfaces/user.repository.js';
import type { IUserRepository } from '../../../users/domain/interfaces/user.repository.js';
import { RESOURCE_ROLE_REPOSITORY } from '../../../resource-roles/domain/interfaces/resource-role.repository.js';
import type { IResourceRoleRepository } from '../../../resource-roles/domain/interfaces/resource-role.repository.js';
import { RefreshTokensService } from '../../../refresh-tokens/application/use-cases/refresh-tokens.service.js';
import { UserModel } from '../../../users/infrastructure/persistence/models/user.model.js';
import {
  LoginDto,
  LogoutSessionDto,
  ProfileDto,
  RefreshSessionDto,
  SessionTokensDto,
} from '../dto/index.js';

/**
 * Capa Service del feature Session — el ciclo de vida de la sesión.
 *
 * Cubre las dos modalidades sin autorización granular:
 *
 * | Operación        | Modalidad                   | Escribe seguridad              |
 * |------------------|-----------------------------|--------------------------------|
 * | `login`          | OPEN (valida credenciales)  | `refresh_tokens` (nueva familia)|
 * | `refresh`        | OPEN (credencial de sesión) | `refresh_tokens` (rotación)    |
 * | `logout`         | OPEN (credencial de sesión) | `refresh_tokens` (revocación)  |
 * | `profile`        | JWT                         | — (solo lectura)               |
 * | `myPermissions`  | JWT                         | — (solo lectura)               |
 *
 * Renovación automática: el cliente renueva el access token sin volver a pedir
 * credenciales. La ventana del refresh se reinicia en cada rotación.
 */
@Injectable()
export class SessionService {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly usersRepository: IUserRepository,
    @Inject(RESOURCE_ROLE_REPOSITORY)
    private readonly resourceRolesRepository: IResourceRoleRepository,
    private readonly refreshTokensService: RefreshTokensService,
  ) {}

  // ================== LOGIN (OPEN) ==================
  /**
   * Valida credenciales y abre una sesión.
   *
   * Seguridad: la respuesta es **la misma** para «usuario inexistente» y
   * «contraseña incorrecta» para no revelar qué usuarios existen. La comparación
   * de la contraseña ocurre en memoria; el hash nunca sale de la base de datos.
   */
  async login(body: LoginDto, deviceInfo: string | null): Promise<SessionTokensDto> {
    if (!body.identifier || !body.password) {
      throw new ApplicationException(400, 'identifier y password son requeridos');
    }

    const user = await this.usersRepository.findByIdentifierWithPassword(body.identifier);
    if (!user || user.status !== 'active') {
      throw new ApplicationException(401, 'Credenciales inválidas');
    }

    const matches = await comparePassword(body.password, user.password);
    if (!matches) {
      throw new ApplicationException(401, 'Credenciales inválidas');
    }

    const session = await this.refreshTokensService.issue(user.id, deviceInfo);
    return this.buildTokens(user, session.rawToken, session.expiresAt);
  }

  // ================== REFRESH (OPEN con credencial de sesión) ==================
  /**
   * Rota el refresh token y emite un par nuevo.
   *
   * Traduce el resultado de la rotación (que no lanza dentro de la transacción,
   * para no deshacer la revocación por reutilización) al error HTTP que
   * corresponde:
   *  - `invalid` → 401
   *  - `expired` → 401
   *  - `reuse`   → 401 habiendo revocado toda la familia
   */
  async refresh(body: RefreshSessionDto, deviceInfo: string | null): Promise<SessionTokensDto> {
    if (!body.refresh_token) {
      throw new ApplicationException(400, 'refresh_token es requerido');
    }

    const outcome = await this.refreshTokensService.rotate(body.refresh_token, deviceInfo);

    if (outcome.kind === 'invalid') {
      throw new ApplicationException(401, 'Refresh token inválido');
    }
    if (outcome.kind === 'expired') {
      throw new ApplicationException(401, 'Refresh token expirado');
    }
    if (outcome.kind === 'reuse') {
      throw new ApplicationException(401, 'Reutilización de refresh token detectada: familia revocada');
    }

    // Revalida la identidad: si el usuario fue desactivado, se corta la sesión
    // aunque el refresh token siga siendo válido.
    const user = await this.usersRepository.findById(outcome.userId);
    if (!user || user.status !== 'active') {
      await this.refreshTokensService.revokeAllMine(outcome.userId);
      throw new ApplicationException(401, 'Usuario inactivo');
    }

    return this.buildTokens(user, outcome.rawToken, outcome.expiresAt);
  }

  // ================== LOGOUT (OPEN con credencial de sesión) ==================
  /** Revoca la sesión del refresh token presentado. Idempotente. */
  async logout(body: LogoutSessionDto): Promise<void> {
    if (!body.refresh_token) {
      throw new ApplicationException(400, 'refresh_token es requerido');
    }
    await this.refreshTokensService.revokeByToken(body.refresh_token);
  }

  // ================== PERFIL (JWT) ==================
  /** Datos públicos del usuario autenticado. */
  async profile(userId: number): Promise<ProfileDto> {
    const user = await this.usersRepository.findById(userId);
    if (!user || user.status !== 'active') {
      throw new EntityNotFoundException('Usuario no encontrado');
    }
    return toProfile(user);
  }

  /** Permisos efectivos del propio usuario (modalidad JWT, sin RBAC). */
  async myPermissions(userId: number) {
    return this.resourceRolesRepository.findEffectiveForUser(userId);
  }

  // ================== HELPERS ==================
  /** Arma el par de tokens: firma el access y adjunta el refresh recién emitido. */
  private buildTokens(user: UserModel, refreshToken: string, refreshExpiresAt: Date): SessionTokensDto {
    const access = signAccessToken({ id: user.id, username: user.username });
    return {
      access_token: access.token,
      token_type: 'Bearer',
      expires_in: access.expiresIn,
      refresh_token: refreshToken,
      refresh_expires_in: Math.max(
        0,
        Math.floor((refreshExpiresAt.getTime() - Date.now()) / 1000),
      ),
    };
  }
}

/** Proyección a `ProfileDto`: solo campos públicos. */
function toProfile(user: UserModel): ProfileDto {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    avatar: user.avatar ?? null,
    status: user.status,
  };
}
