import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import type { Role, StaffUser } from '../../core/models';
import { messageOf } from '../form-utils';
import { StaffForm } from './staff-form';
import { StaffTable } from './staff-table';
import {
  ADMIN_ROLE,
  type AssignmentsResponse,
  DRIVER_ROLE,
  type MemberCreated,
  type RoleAssignment,
  type RolesResponse,
  type StaffRole,
  type StaffRow,
  type UsersResponse,
} from './staff.types';

interface Notice {
  kind: 'ok' | 'error';
  text: string;
}

/** Personal del parqueadero: usuarios del sistema y los roles que definen qué pueden hacer. */
@Component({
  selector: 'app-staff',
  imports: [FormsModule, StaffTable, StaffForm],
  templateUrl: './staff.html',
  styleUrl: './staff.css',
})
export class StaffPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);

  protected readonly users = signal<StaffUser[]>([]);
  protected readonly roles = signal<Role[]>([]);
  protected readonly assignments = signal<RoleAssignment[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly showDrivers = signal(false);
  protected readonly removingId = signal<number | null>(null);
  protected readonly notice = signal<Notice | null>(null);

  protected readonly selfId = computed(() => this.auth.profile()?.id ?? null);
  protected readonly canCreate = computed(() => this.auth.can('POST', '/api/usuarios'));
  protected readonly canRemove = computed(() => this.auth.can('PATCH', '/api/asignaciones-rol/:id/deactivate'));

  /** Cada usuario con sus roles activos. */
  private readonly rows = computed<StaffRow[]>(() => {
    const roleNames = new Map(this.roles().map((r) => [r.id, r.name]));
    const byUser = new Map<number, StaffRole[]>();
    for (const a of this.assignments()) {
      if (a.status !== 'active') continue;
      const name = a.role?.name ?? roleNames.get(a.role_id) ?? `Rol ${a.role_id}`;
      byUser.set(a.user_id, [...(byUser.get(a.user_id) ?? []), { assignmentId: a.id, name }]);
    }
    return this.users()
      .map((user) => {
        const roles = byUser.get(user.id) ?? [];
        return { user, roles, isDriver: roles.length > 0 && roles.every((r) => r.name === DRIVER_ROLE) };
      })
      .sort((a, b) => a.user.username.localeCompare(b.user.username, 'es'));
  });

  protected readonly driverCount = computed(() => this.rows().filter((r) => r.isDriver).length);
  protected readonly visibleRows = computed(() => this.rows().filter((r) => this.showDrivers() || !r.isDriver));

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const [users, roles, assignments] = await Promise.all([
        this.api.get<UsersResponse>('/usuarios'),
        this.api.get<RolesResponse>('/roles'),
        this.api.get<AssignmentsResponse>('/asignaciones-rol'),
      ]);
      this.users.set(users.users);
      this.roles.set(roles.roles);
      this.assignments.set(assignments.assignments);
    } catch (error) {
      this.error.set(messageOf(error, 'No se pudo cargar el personal.'));
    } finally {
      this.loading.set(false);
    }
  }

  protected async removeRole({ row, role }: { row: StaffRow; role: StaffRole }): Promise<void> {
    if (row.user.id === this.selfId() && role.name === ADMIN_ROLE) return; // no puedes quitarte el acceso
    const who = row.user.username;
    if (!confirm(`¿Quitar el rol ${role.name} a ${who}?\n\nPerderá los permisos de ese rol de inmediato.`)) return;

    this.removingId.set(role.assignmentId);
    this.notice.set(null);
    try {
      await this.api.patch(`/asignaciones-rol/${role.assignmentId}/deactivate`);
      this.assignments.update((list) => list.filter((a) => a.id !== role.assignmentId));
      this.notice.set({ kind: 'ok', text: `Se quitó el rol ${role.name} a ${who}.` });
    } catch (error) {
      this.notice.set({ kind: 'error', text: messageOf(error, `No se pudo quitar el rol ${role.name} a ${who}.`) });
    } finally {
      this.removingId.set(null);
    }
  }

  protected onCreated({ user, assignment }: MemberCreated): void {
    this.users.update((list) => (list.some((u) => u.id === user.id) ? list : [...list, user]));
    if (assignment) {
      this.assignments.update((list) => (list.some((a) => a.id === assignment.id) ? list : [...list, assignment]));
    }
    this.notice.set(null);
  }
}
