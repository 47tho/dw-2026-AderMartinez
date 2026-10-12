import { Transaction } from 'sequelize';
import { RefreshTokenModel } from '../../infrastructure/persistence/models/refresh-token.model.js';

/**
 * Puerto del feature RefreshTokens.
 *
 * Detalles de diseño:
 *  - `findByHash` acepta un flag `lock` para añadir `FOR UPDATE` dentro de la
 *    transacción de rotación.
 *  - `revokeFamily` materializa el reuse detection: revoca toda la familia.
 *  - `create` y `update` aceptan transacción para participar de la rotación
 *    atómica.
 */
export const REFRESH_TOKEN_REPOSITORY = 'IRefreshTokenRepository';

export interface IRefreshTokenRepository {
  findByHash(
    tokenHash: string,
    transaction?: Transaction,
    lock?: boolean,
  ): Promise<RefreshTokenModel | null>;

  findAllByUser(userId: number, onlyActive?: boolean): Promise<RefreshTokenModel[]>;
  findById(id: number): Promise<RefreshTokenModel | null>;

  create(
    data: {
      user_id: number;
      token_hash: string;
      family_id: string;
      device_info: string | null;
      expires_at: Date;
      status?: 'active' | 'inactive';
    },
    transaction?: Transaction,
  ): Promise<RefreshTokenModel>;

  update(
    token: RefreshTokenModel,
    data: Partial<{ status: 'active' | 'inactive' }>,
    transaction?: Transaction,
  ): Promise<RefreshTokenModel>;

  revokeFamily(familyId: string, transaction?: Transaction): Promise<number>;
  revokeAllByUser(userId: number): Promise<number>;
  purgeInactiveByUser(userId: number): Promise<number>;
  countActiveByUser(userId: number): Promise<number>;
}
