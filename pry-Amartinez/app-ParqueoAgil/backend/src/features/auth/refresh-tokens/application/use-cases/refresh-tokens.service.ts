import { Inject, Injectable } from '@nestjs/common';
import { Transaction } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { randomUUID } from 'node:crypto';
import { EntityNotFoundException } from '../../../../../common/exceptions/entity-not-found.exception.js';
import {
  generateOpaqueToken,
  sha256Hex,
} from '../../../../../shared/auth/password.js';
import { SEQUELIZE } from '../../../../../infrastructure/database/sequelize/sequelize.module.js';
import {
  RefreshTokenResponseDto,
  toRefreshTokenResponse,
} from '../dto/index.js';
import { REFRESH_TOKEN_REPOSITORY } from '../../domain/interfaces/refresh-token.repository.js';
import type { IRefreshTokenRepository } from '../../domain/interfaces/refresh-token.repository.js';
import { RefreshTokenModel } from '../../infrastructure/persistence/models/refresh-token.model.js';

/** Vida útil de un refresh token (días). Configurable por entorno. */
const REFRESH_TTL_DAYS = Number(process.env.JWT_REFRESH_TTL_DAYS ?? 7);

/** Resultado de emitir una sesión nueva. */
export interface IssuedSession {
  rawToken: string;
  familyId: string;
  expiresAt: Date;
}

/**
 * Resultado de intentar rotar un refresh token.
 *
 * Se devuelve una **unión discriminada** en lugar de lanzar dentro de la
 * transacción: si se lanzara, el `rollback` desharía la revocación de la familia
 * que acabamos de escribir. El service de sesión (ISS-15) decide el error
 * **después** de que la transacción confirme.
 */
export type RotationOutcome =
  | { kind: 'rotated'; userId: number; rawToken: string; familyId: string; expiresAt: Date }
  | { kind: 'invalid' }
  | { kind: 'expired' }
  | { kind: 'reuse'; familyId: string; revoked: number };

/**
 * Capa Service del feature RefreshTokens.
 *
 * Cubre dos responsabilidades:
 *  1. **Gestión de las sesiones propias** (listar, consultar, revocar): es la
 *     parte que se expone con la modalidad JWT, sin RBAC.
 *  2. **Ciclo de vida del token** (issue, rotate, revokeByToken), que consumirá
 *     el feature session en ISS-15 (login/refresh/logout).
 */
@Injectable()
export class RefreshTokensService {
  constructor(
    @Inject(REFRESH_TOKEN_REPOSITORY)
    private readonly repository: IRefreshTokenRepository,
    @Inject(SEQUELIZE)
    private readonly sequelize: Sequelize,
  ) {}

  // ================== GESTIÓN (sesiones propias) ==================
  async getAllMine(userId: number): Promise<RefreshTokenResponseDto[]> {
    const tokens = await this.repository.findAllByUser(userId);
    return tokens.map((token) => toRefreshTokenResponse(token));
  }

  async getMine(userId: number, id: number): Promise<RefreshTokenResponseDto> {
    return toRefreshTokenResponse(await this.findMineOrFail(userId, id));
  }

  async revokeMine(userId: number, id: number): Promise<RefreshTokenResponseDto> {
    const token = await this.findMineOrFail(userId, id);
    await this.repository.update(token, { status: 'inactive' });
    return toRefreshTokenResponse(token);
  }

  async revokeAllMine(userId: number): Promise<number> {
    return this.repository.revokeAllByUser(userId);
  }

  async purgeMine(userId: number): Promise<number> {
    return this.repository.purgeInactiveByUser(userId);
  }

  async countActiveMine(userId: number): Promise<number> {
    return this.repository.countActiveByUser(userId);
  }

  // ================== CICLO DE VIDA ==================
  /**
   * Emite una sesión nueva (alta de login).
   *
   * Genera un `rawToken` opaco, un `family_id` nuevo y persiste únicamente el
   * `sha256Hex(rawToken)`. Devuelve el `rawToken` en claro **una sola vez**: en
   * la BD solo queda el hash.
   */
  async issue(
    userId: number,
    deviceInfo: string | null,
    transaction?: Transaction,
  ): Promise<IssuedSession> {
    const rawToken = generateOpaqueToken();
    const familyId = randomUUID();
    const expiresAt = expiryFromNow();

    await this.repository.create(
      {
        user_id: userId,
        token_hash: sha256Hex(rawToken),
        family_id: familyId,
        device_info: deviceInfo,
        expires_at: expiresAt,
        status: 'active',
      },
      transaction,
    );

    return { rawToken, familyId, expiresAt };
  }

  /**
   * Rota un refresh token: lo invalida y emite uno nuevo con el mismo
   * `family_id`. Todo dentro de una transacción con bloqueo de fila.
   *
   * Concurrencia: si dos peticiones presentan el mismo token, una rota y la otra
   * encuentra el token ya inactivo → se interpreta como reutilización y se
   * revoca la familia completa.
   */
  async rotate(rawToken: string, deviceInfo: string | null): Promise<RotationOutcome> {
    const hash = sha256Hex(rawToken);

    const outcome = await this.sequelize.transaction<RotationOutcome>(async (t) => {
      const current = await this.repository.findByHash(hash, t, true);

      if (!current) {
        return { kind: 'invalid' };
      }

      // REUSE DETECTION: el token existía pero ya no está activo (fue rotado).
      if (current.status !== 'active') {
        const revoked = await this.repository.revokeFamily(current.family_id, t);
        return { kind: 'reuse', familyId: current.family_id, revoked };
      }

      if (new Date(current.expires_at).getTime() <= Date.now()) {
        await this.repository.update(current, { status: 'inactive' }, t);
        return { kind: 'expired' };
      }

      // Rotación: el token usado se invalida y nace uno nuevo en la misma familia.
      await this.repository.update(current, { status: 'inactive' }, t);

      const rawNext = generateOpaqueToken();
      const expiresAt = expiryFromNow();
      await this.repository.create(
        {
          user_id: current.user_id,
          token_hash: sha256Hex(rawNext),
          family_id: current.family_id,
          device_info: deviceInfo ?? current.device_info,
          expires_at: expiresAt,
          status: 'active',
        },
        t,
      );

      return {
        kind: 'rotated',
        userId: current.user_id,
        rawToken: rawNext,
        familyId: current.family_id,
        expiresAt,
      };
    });

    return outcome;
  }

  /**
   * Cierra la sesión asociada a un refresh token (logout).
   *
   * Idempotente: un token inexistente o ya revocado no es un error, porque el
   * efecto deseado (que no sirva) ya se cumple.
   */
  async revokeByToken(rawToken: string): Promise<boolean> {
    const token = await this.repository.findByHash(sha256Hex(rawToken));
    if (!token) return false;
    if (token.status !== 'active') return true;

    await this.repository.update(token, { status: 'inactive' });
    return true;
  }

  // ================== HELPERS ==================
  private async findMineOrFail(userId: number, id: number): Promise<RefreshTokenModel> {
    const token = await this.repository.findById(id);
    if (!token || token.user_id !== userId) {
      throw new EntityNotFoundException('Sesión no encontrada');
    }
    return token;
  }
}

/** `now + REFRESH_TTL_DAYS`. Ventana deslizante: cada rotación la renueva. */
function expiryFromNow(): Date {
  return new Date(Date.now() + REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000);
}
