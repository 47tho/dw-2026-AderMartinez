import { RefreshTokenModel } from '../../infrastructure/persistence/models/refresh-token.model.js';

/**
 * Respuesta HTTP de una sesión persistida (refresh token).
 *
 * `token_hash` **se omite deliberadamente**: es un artefacto de seguridad. Ni
 * siquiera su hash tiene por qué salir de la API. El `id` basta para revocar.
 */
export interface RefreshTokenResponseDto {
  id: number;
  user_id: number;
  family_id: string;
  device_info: string | null;
  expires_at: Date;
  status: 'active' | 'inactive';
  is_expired: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** Mapper modelo -> DTO de respuesta (objeto plano; elimina `token_hash`). */
export function toRefreshTokenResponse(token: RefreshTokenModel): RefreshTokenResponseDto {
  const raw = token.toJSON() as Record<string, unknown>;
  delete raw.token_hash;
  return {
    ...(raw as Omit<RefreshTokenResponseDto, 'is_expired'>),
    is_expired: new Date(token.expires_at).getTime() <= Date.now(),
  };
}
