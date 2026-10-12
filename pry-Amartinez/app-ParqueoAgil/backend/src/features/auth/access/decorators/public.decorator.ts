import { SetMetadata } from '@nestjs/common';

/**
 * Marca una ruta o controller como **OPEN** (sin autenticación).
 *
 * El `JwtAuthGuard` lee esta metadata con el `Reflector` de NestJS: si está
 * presente, deja pasar la petición sin exigir token.
 *
 * Ejemplos de uso:
 *   - `GET /api/health`
 *   - `POST /api/auth/login` (ISS-15)
 *   - `POST /api/auth/refresh` (ISS-15)
 *   - `GET /api/docs` (Swagger)
 */
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
