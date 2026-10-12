/**
 * Barrel del submódulo `access/`.
 *
 * Punto único de importación para que los controllers (y futuros módulos) no
 * conozcan la organización interna de la carpeta:
 *
 *   import { JwtAuthGuard, PermissionsGuard, Public } from '../../auth/access';
 *
 * Es el punto de acoplamiento estable: si mañana cambia la organización interna,
 * los consumidores no se enteran.
 */

// Decoradores
export * from './decorators/public.decorator.js';

// Guards
export * from './guards/jwt-auth.guard.js';
export * from './guards/permissions.guard.js';
