import { Module } from '@nestjs/common';
import { REFRESH_TOKEN_REPOSITORY } from './domain/interfaces/refresh-token.repository.js';
import { RefreshTokenRepository } from './infrastructure/persistence/repositories/refresh-token.repository.js';
import { RefreshTokensService } from './application/use-cases/refresh-tokens.service.js';
import { RefreshTokensController } from './presentation/http/controllers/refresh-tokens.controller.js';

/**
 * RefreshTokensModule — feature RefreshTokens completo.
 *
 * Registra el controller de "mis sesiones" (modalidad JWT pura) y expone el
 * servicio para que el feature session (ISS-15) consuma `issue`, `rotate` y
 * `revokeByToken`.
 */
@Module({
  controllers: [RefreshTokensController],
  providers: [
    RefreshTokensService,
    { provide: REFRESH_TOKEN_REPOSITORY, useClass: RefreshTokenRepository },
  ],
  exports: [REFRESH_TOKEN_REPOSITORY, RefreshTokensService],
})
export class RefreshTokensModule {}
