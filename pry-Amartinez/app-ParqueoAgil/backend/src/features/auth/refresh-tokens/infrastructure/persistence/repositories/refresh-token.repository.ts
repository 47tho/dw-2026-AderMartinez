import { Inject, Injectable } from '@nestjs/common';
import { Op, Transaction } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { SEQUELIZE } from '../../../../../../infrastructure/database/sequelize/sequelize.module.js';
import { RefreshTokenModel } from '../models/refresh-token.model.js';
import { IRefreshTokenRepository } from '../../../domain/interfaces/refresh-token.repository.js';

/**
 * Implementación Sequelize del puerto `IRefreshTokenRepository`.
 *
 * Única que habla con Sequelize. Las consultas que participan en la rotación
 * aceptan transacción y, cuando corresponde, bloquean la fila (`FOR UPDATE`)
 * para que dos peticiones de refresh simultáneas no emitan dos tokens válidos.
 */
@Injectable()
export class RefreshTokenRepository implements IRefreshTokenRepository {
  constructor(@Inject(SEQUELIZE) private readonly sequelize: Sequelize) {}

  private get repo() {
    return this.sequelize.getRepository(RefreshTokenModel);
  }

  async findByHash(
    tokenHash: string,
    transaction?: Transaction,
    lock = false,
  ): Promise<RefreshTokenModel | null> {
    return this.repo.findOne({
      where: { token_hash: tokenHash },
      transaction,
      ...(lock ? { lock: transaction?.LOCK.UPDATE } : {}),
    });
  }

  async findAllByUser(userId: number, onlyActive = true): Promise<RefreshTokenModel[]> {
    const where: Record<string, unknown> = { user_id: userId };
    if (onlyActive) where.status = 'active';

    return this.repo.findAll({ where, order: [['createdAt', 'DESC']] });
  }

  async findById(id: number): Promise<RefreshTokenModel | null> {
    return this.repo.findByPk(id);
  }

  async create(
    data: {
      user_id: number;
      token_hash: string;
      family_id: string;
      device_info: string | null;
      expires_at: Date;
      status?: 'active' | 'inactive';
    },
    transaction?: Transaction,
  ): Promise<RefreshTokenModel> {
    return this.repo.create(
      {
        user_id: data.user_id,
        token_hash: data.token_hash,
        family_id: data.family_id,
        device_info: data.device_info,
        expires_at: data.expires_at,
        status: data.status ?? 'active',
      },
      { transaction },
    );
  }

  async update(
    token: RefreshTokenModel,
    data: Partial<{ status: 'active' | 'inactive' }>,
    transaction?: Transaction,
  ): Promise<RefreshTokenModel> {
    return token.update(data, { transaction });
  }

  async revokeFamily(familyId: string, transaction?: Transaction): Promise<number> {
    const [updated] = await this.repo.update(
      { status: 'inactive' },
      { where: { family_id: familyId, status: 'active' }, transaction },
    );
    return updated;
  }

  async revokeAllByUser(userId: number): Promise<number> {
    const [updated] = await this.repo.update(
      { status: 'inactive' },
      { where: { user_id: userId, status: 'active' } },
    );
    return updated;
  }

  async purgeInactiveByUser(userId: number): Promise<number> {
    return this.repo.destroy({
      where: {
        user_id: userId,
        [Op.or]: [{ status: 'inactive' }, { expires_at: { [Op.lt]: new Date() } }],
      },
    });
  }

  async countActiveByUser(userId: number): Promise<number> {
    return this.repo.count({ where: { user_id: userId, status: 'active' } });
  }
}
