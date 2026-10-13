import { Component, ElementRef, computed, inject, input, output, signal } from '@angular/core';
import { AbstractControl, FormControl, FormGroup, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { ApiService } from '../../core/api.service';
import type { VehicleType, Zone } from '../../core/models';
import { type ErrorMessages, fieldError, focusFirstInvalid, integer, messageOf, notBlank } from '../form-utils';

const DEFAULT_COLOR = '#3B82F6';
const CODE_PATTERN = /^[A-Z][A-Z0-9]{0,3}$/;

/** 1–4 caracteres A–Z / 0–9 empezando por letra (se compara en mayúscula). */
const codeFormat = (control: AbstractControl): ValidationErrors | null =>
  CODE_PATTERN.test(String(control.value ?? '').trim().toUpperCase()) ? null : { code: true };

const rangeMessages = (label: string, min: number, max: number): ErrorMessages => ({
  required: `Indica ${label}.`,
  min: `Mínimo ${min}.`,
  max: `Máximo ${max}.`,
  integer: 'Debe ser un número entero.',
});

const MESSAGES = {
  name: { required: 'Escribe el nombre de la zona.', maxlength: 'Máximo 150 caracteres.' },
  code: { required: 'Escribe la letra de la zona.', code: 'Usa de 1 a 4 caracteres (A–Z o 0–9), empezando por letra.' },
  vehicleTypeId: { required: 'Elige el tipo de vehículo.' },
  capacity: rangeMessages('la capacidad', 1, 500),
  hourlyRate: { required: 'Indica la tarifa por hora.', min: 'La tarifa debe ser de al menos $1.', integer: 'Escríbela en pesos, sin decimales.' },
  floor: rangeMessages('el piso', 1, 20),
  position: rangeMessages('la posición', 0, 50),
} satisfies Record<string, ErrorMessages>;

type FieldName = keyof typeof MESSAGES;

/** Formulario «Nueva zona». Los espacios (A01, A02…) los crea el backend con la zona. */
@Component({
  selector: 'app-zone-form',
  imports: [ReactiveFormsModule],
  templateUrl: './zone-form.html',
  styleUrl: './zone-form.css',
})
export class ZoneForm {
  private readonly api = inject(ApiService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly types = input.required<VehicleType[]>();
  readonly created = output<Zone>();

  protected readonly activeTypes = computed(() => this.types().filter((t) => t.status === 'active'));
  protected readonly saving = signal(false);
  protected readonly submitted = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly success = signal<string | null>(null);

  protected readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [notBlank, Validators.maxLength(150)] }),
    code: new FormControl('', { nonNullable: true, validators: [notBlank, codeFormat] }),
    vehicleTypeId: new FormControl<number | null>(null, Validators.required),
    capacity: new FormControl<number | null>(null, [Validators.required, Validators.min(1), Validators.max(500), integer]),
    hourlyRate: new FormControl<number | null>(null, [Validators.required, Validators.min(1), integer]),
    floor: new FormControl<number | null>(1, [Validators.required, Validators.min(1), Validators.max(20), integer]),
    position: new FormControl<number | null>(0, [Validators.required, Validators.min(0), Validators.max(50), integer]),
    color: new FormControl(DEFAULT_COLOR, { nonNullable: true }),
  });

  protected err(name: FieldName): string | null {
    return fieldError(this.form.get(name), MESSAGES[name], this.submitted());
  }

  /** La letra se guarda siempre en mayúscula y sin espacios. */
  protected normalizeCode(): void {
    const code = this.form.controls.code;
    code.setValue(code.value.trim().toUpperCase());
  }

  protected async submit(): Promise<void> {
    this.normalizeCode();
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
      const zone = await this.api.createZone({
        name: v.name.trim(),
        code: v.code,
        vehicleTypeId: v.vehicleTypeId!,
        capacity: v.capacity!,
        hourlyRate: v.hourlyRate!,
        floor: v.floor!,
        position: v.position!,
        color: v.color,
      });
      const digits = Math.max(2, String(zone.capacity).length);
      this.success.set(
        `Zona ${zone.code ?? v.code} «${zone.name}» creada. Sus ${zone.capacity} espacios se generaron solos, desde ${zone.code ?? v.code}${'1'.padStart(digits, '0')}.`,
      );
      this.created.emit(zone);
      this.form.reset({ name: '', code: '', vehicleTypeId: null, capacity: null, hourlyRate: null, floor: 1, position: 0, color: DEFAULT_COLOR });
      this.submitted.set(false);
    } catch (error) {
      this.error.set(messageOf(error, 'No se pudo crear la zona. Intenta de nuevo.'));
    } finally {
      this.saving.set(false);
    }
  }
}
