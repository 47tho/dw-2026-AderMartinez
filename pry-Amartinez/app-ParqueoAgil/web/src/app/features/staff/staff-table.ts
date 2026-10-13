import { Component, input, output } from '@angular/core';
import { ADMIN_ROLE, type StaffRole, type StaffRow } from './staff.types';

/** Tabla de usuarios con sus roles. Solo muestra; la página decide qué hacer al quitar un rol. */
@Component({
  selector: 'app-staff-table',
  template: `
    <div class="table-wrap" role="region" aria-label="Tabla de personal" tabindex="0">
      <table class="table">
        <caption class="sr-only">Usuarios del sistema con sus roles y estado</caption>
        <thead>
          <tr>
            <th scope="col">Usuario</th>
            <th scope="col">Correo</th>
            <th scope="col">Roles</th>
            <th scope="col">Estado</th>
          </tr>
        </thead>
        <tbody>
          @for (row of rows(); track row.user.id) {
            <tr>
              <td class="nowrap">
                <strong>{{ row.user.username }}</strong>
                @if (row.user.id === selfId()) {
                  <span class="badge info">Tú</span>
                }
              </td>
              <td class="email">{{ row.user.email }}</td>
              <td>
                <ul class="roles">
                  @for (role of row.roles; track role.assignmentId) {
                    <li>
                      <span class="badge" [class.info]="role.name === 'ADMIN'" [class.ok]="role.name === 'SELLER'">{{ role.name }}</span>
                      @if (canRemove()) {
                        @if (isOwnAdmin(row, role)) {
                          <span class="subtle">Es tu rol actual</span>
                        } @else {
                          <button type="button" class="btn sm danger" [disabled]="removingId() !== null"
                                  [attr.aria-label]="removingId() === role.assignmentId ? null : 'Quitar rol ' + role.name + ' a ' + row.user.username"
                                  (click)="removeRole.emit({ row, role })">
                            {{ removingId() === role.assignmentId ? 'Quitando…' : 'Quitar rol' }}
                          </button>
                        }
                      }
                    </li>
                  } @empty {
                    <li><span class="badge warn">Sin rol</span></li>
                  }
                </ul>
              </td>
              <td>
                <span class="badge" [class.ok]="row.user.status === 'active'">{{ row.user.status === 'active' ? 'Activo' : 'Inactivo' }}</span>
              </td>
            </tr>
          }
        </tbody>
      </table>
    </div>
  `,
  styles: `
    :host { display: block; min-width: 0; }
    .table-wrap:focus-visible { outline-offset: -2px; }
    .nowrap { white-space: nowrap; }
    .email { overflow-wrap: anywhere; }
    .roles { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-2); }
    .roles li { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); }
  `,
})
export class StaffTable {
  readonly rows = input.required<StaffRow[]>();
  readonly canRemove = input(false);
  readonly selfId = input<number | null>(null);
  readonly removingId = input<number | null>(null);
  readonly removeRole = output<{ row: StaffRow; role: StaffRole }>();

  /** El administrador con sesión no puede quitarse su propio rol ADMIN. */
  protected isOwnAdmin(row: StaffRow, role: StaffRole): boolean {
    return row.user.id === this.selfId() && role.name === ADMIN_ROLE;
  }
}
