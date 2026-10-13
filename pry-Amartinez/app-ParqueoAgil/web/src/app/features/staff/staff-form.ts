import { Component, ElementRef, computed, inject, input, output, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ApiService } from '../../core/api.service';
import type { Role, StaffUser } from '../../core/models';
import { type ErrorMessages, fieldError, focusFirstInvalid, messageOf, notBlank } from '../form-utils';
import { ASSIGNABLE_ROLES, type MemberCreated, type RoleAssignment } from './staff.types';

const MESSAGES = {
  username: { required: 'Escribe el nombre de usuario.', minlength: 'Mínimo 3 caracteres.', maxlength: 'Máximo 80 caracteres.' },
  email: { required: 'Escribe el correo.', pattern: 'Escribe un correo válido, por ejemplo nombre@dominio.com.', maxlength: 'Máximo 150 caracteres.' },
  password: { required: 'Escribe una contraseña.', minlength: 'La contraseña debe tener al menos 8 caracteres.', maxlength: 'Máximo 100 caracteres.' },
  roleId: { required: 'Elige el rol del integrante.' },
} satisfies Record<string, ErrorMessages>;

type FieldName = keyof typeof MESSAGES;

/**
 * Formulario «Nuevo integrante». Crea el usuario (`POST /usuarios`) y después
 * le asigna el rol (`POST /asignaciones-rol`): son dos llamadas del backend.
 * Si la segunda falla, el usuario ya existe sin rol y se ofrece reintentar solo la asignación.
 */
@Component({
  selector: 'app-staff-form',
  imports: [ReactiveFormsModule],
  templateUrl: './staff-form.html',
  styleUrl: './staff-form.css',
})
export class StaffForm {
  private readonly api = inject(ApiService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly roles = input.required<Role[]>();
  readonly created = output<MemberCreated>();

  protected readonly assignable = computed(() =>
    ASSIGNABLE_ROLES.map((name) => this.roles().find((r) => r.name === name)).filter((r): r is Role => !!r),
  );
  protected readonly saving = signal(false);
  protected readonly submitted = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly success = signal<string | null>(null);
  /** Usuario creado al que falta asignarle el rol. */
  protected readonly orphan = signal<{ user: StaffUser; reason: string } | null>(null);

  protected readonly form = new FormGroup({
    username: new FormControl('', { nonNullable: true, validators: [notBlank, Validators.minLength(3), Validators.maxLength(80)] }),
    email: new FormControl('', { nonNullable: true, validators: [notBlank, Validators.pattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/), Validators.maxLength(150)] }),
    password: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(8), Validators.maxLength(100)] }),
    roleId: new FormControl<number | null>(null, Validators.required),
  });

  protected err(name: FieldName): string | null {
    return fieldError(this.form.get(name), MESSAGES[name], this.submitted());
  }

  protected async submit(): Promise<void> {
    this.submitted.set(true);
    this.success.set(null);
    this.error.set(null);
    if (this.form.invalid) {
      focusFirstInvalid(this.host.nativeElement);
      return;
    }

    const v = this.form.getRawValue();
    this.saving.set(true);
    try {
      const { user } = await this.api.post<{ user: StaffUser }>('/usuarios', {
        username: v.username.trim(),
        email: v.email.trim(),
        password: v.password,
      });
      this.orphan.set(null); // un usuario nuevo reemplaza el aviso de uno anterior sin rol
      await this.assign(user, v.roleId!, false);
    } catch (error) {
      this.error.set(messageOf(error, 'No se pudo crear el usuario. Intenta de nuevo.'));
    } finally {
      this.saving.set(false);
    }
  }

  /** Reintenta solo la asignación del rol a un usuario ya creado. */
  protected async retryAssignment(): Promise<void> {
    const orphan = this.orphan();
    const roleId = this.form.controls.roleId.value;
    if (!orphan || roleId === null) return;
    this.saving.set(true);
    this.orphan.set(null);
    try {
      await this.assign(orphan.user, roleId, true);
    } finally {
      this.saving.set(false);
    }
  }

  private async assign(user: StaffUser, roleId: number, alreadyReported: boolean): Promise<void> {
    try {
      const { assignment } = await this.api.post<{ assignment: RoleAssignment }>('/asignaciones-rol', {
        user_id: user.id,
        role_id: roleId,
      });
      const role = this.assignable().find((r) => r.id === roleId)?.name ?? assignment.role?.name ?? '';
      this.created.emit({ user, assignment });
      this.success.set(`Integrante «${user.username}» creado con el rol ${role}.`);
      this.form.reset({ username: '', email: '', password: '', roleId: null });
      this.submitted.set(false);
    } catch (error) {
      if (!alreadyReported) this.created.emit({ user, assignment: null });
      this.orphan.set({ user, reason: messageOf(error, 'No se pudo asignar el rol.') });
    }
  }
}
