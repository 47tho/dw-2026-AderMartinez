import type { Role, StaffUser } from '../../core/models';

/**
 * Formas reales de `/api/usuarios`, `/api/roles` y `/api/asignaciones-rol`
 * (backend `features/auth`): tras desenvolver `{ data }` no son arreglos
 * sino objetos con una clave: `{ users }`, `{ roles }` y `{ assignments }`.
 */
export interface UsersResponse {
  users: StaffUser[];
}
export interface RolesResponse {
  roles: Role[];
}
export interface RoleAssignment {
  id: number;
  user_id: number;
  role_id: number;
  status: 'active' | 'inactive';
  user?: { id: number; username: string; email: string } | null;
  role?: { id: number; name: string } | null;
}
export interface AssignmentsResponse {
  assignments: RoleAssignment[];
}

/** Rol de un usuario con el id de la asignación (necesario para quitarlo). */
export interface StaffRole {
  assignmentId: number;
  name: string;
}

export interface StaffRow {
  user: StaffUser;
  roles: StaffRole[];
  /** Solo tiene el rol DRIVER: es un conductor de la app, no personal. */
  isDriver: boolean;
}

export interface MemberCreated {
  user: StaffUser;
  /** `null` si el usuario se creó pero no se le pudo asignar el rol. */
  assignment: RoleAssignment | null;
}

export const DRIVER_ROLE = 'DRIVER';
export const ADMIN_ROLE = 'ADMIN';
/** Roles que se pueden dar a un integrante nuevo del personal. */
export const ASSIGNABLE_ROLES = ['ADMIN', 'SELLER'] as const;
