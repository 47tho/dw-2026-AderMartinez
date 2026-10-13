import { Component, ElementRef, inject, output, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ApiService } from '../../core/api.service';
import type { VehicleType } from '../../core/models';
import { type ErrorMessages, fieldError, focusFirstInvalid, integer, messageOf, notBlank } from '../form-utils';

const MESSAGES = {
  name: { required: 'Escribe el nombre del tipo.', maxlength: 'Máximo 100 caracteres.' },
  hourlyRate: { required: 'Indica la tarifa por hora.', min: 'La tarifa debe ser de al menos $1.', integer: 'Escríbela en pesos, sin decimales.' },
  description: { maxlength: 'Máximo 255 caracteres.' },
} satisfies Record<string, ErrorMessages>;

type FieldName = keyof typeof MESSAGES;

/** Formulario «Nuevo tipo» de vehículo: nombre, tarifa por hora y descripción opcional. */
@Component({
  selector: 'app-vehicle-type-form',
  imports: [ReactiveFormsModule],
  template: `
    <form [formGroup]="form" (ngSubmit)="submit()" class="type-form" aria-labelledby="type-form-title">
      <h3 id="type-form-title">Nuevo tipo</h3>

      @let nameErr = err('name');
      <div class="field">
        <label for="type-name">Nombre</label>
        <input id="type-name" class="input" formControlName="name" maxlength="100" autocomplete="off" placeholder="Motocicleta"
               [attr.aria-invalid]="nameErr ? true : null" [attr.aria-describedby]="nameErr ? 'type-name-err' : null" />
        @if (nameErr) { <p class="form-error" id="type-name-err">{{ nameErr }}</p> }
      </div>

      @let rateErr = err('hourlyRate');
      <div class="field">
        <label for="type-rate">Tarifa por hora (COP)</label>
        <input id="type-rate" class="input num" type="number" inputmode="numeric" min="1" step="100" formControlName="hourlyRate" placeholder="1500"
               [attr.aria-invalid]="rateErr ? true : null" [attr.aria-describedby]="rateErr ? 'type-rate-hint type-rate-err' : 'type-rate-hint'" />
        <p class="subtle" id="type-rate-hint">En pesos, sin puntos ni comas.</p>
        @if (rateErr) { <p class="form-error" id="type-rate-err">{{ rateErr }}</p> }
      </div>

      @let descErr = err('description');
      <div class="field">
        <label for="type-description">Descripción (opcional)</label>
        <input id="type-description" class="input" formControlName="description" maxlength="255" autocomplete="off"
               [attr.aria-invalid]="descErr ? true : null" [attr.aria-describedby]="descErr ? 'type-description-err' : null" />
        @if (descErr) { <p class="form-error" id="type-description-err">{{ descErr }}</p> }
      </div>

      <div aria-live="polite">
        @if (success(); as message) {
          <p class="alert ok">{{ message }}</p>
        }
      </div>
      @if (error(); as message) {
        <p class="alert error" role="alert">{{ message }}</p>
      }
      <button type="submit" class="btn primary" [disabled]="saving()">{{ saving() ? 'Creando…' : 'Crear tipo' }}</button>
    </form>
  `,
  styles: `
    .type-form { display: flex; flex-direction: column; gap: var(--space-3); margin-top: var(--space-5); padding-top: var(--space-4); border-top: 1px solid var(--border); }
    .type-form .btn { align-self: flex-start; }
  `,
})
export class VehicleTypeForm {
  private readonly api = inject(ApiService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly created = output<VehicleType>();

  protected readonly saving = signal(false);
  protected readonly submitted = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly success = signal<string | null>(null);

  protected readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [notBlank, Validators.maxLength(100)] }),
    hourlyRate: new FormControl<number | null>(null, [Validators.required, Validators.min(1), integer]),
    description: new FormControl('', { nonNullable: true, validators: Validators.maxLength(255) }),
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
    const description = v.description.trim();
    this.saving.set(true);
    try {
      const type = await this.api.createVehicleType({
        name: v.name.trim(),
        hourlyRate: v.hourlyRate!,
        ...(description ? { description } : {}),
      });
      this.success.set(`Tipo «${type.name}» creado. Ya puedes usarlo al crear una zona.`);
      this.created.emit(type);
      this.form.reset({ name: '', hourlyRate: null, description: '' });
      this.submitted.set(false);
    } catch (error) {
      this.error.set(messageOf(error, 'No se pudo crear el tipo de vehículo. Intenta de nuevo.'));
    } finally {
      this.saving.set(false);
    }
  }
}
