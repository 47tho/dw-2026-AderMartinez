import type { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';
import { ApiError } from '../core/api.service';

/** Mensaje del backend (ya en español) o el de respaldo si el error es otro. */
export function messageOf(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

/** Mensajes de validación por clave de error (`required`, `min`, …). */
export type ErrorMessages = Record<string, string>;

/** Primer mensaje de error del control; solo aparece si ya se tocó o se intentó enviar. */
export function fieldError(control: AbstractControl | null, messages: ErrorMessages, submitted: boolean): string | null {
  if (!control?.invalid || !(control.touched || submitted)) return null;
  const key = Object.keys(control.errors ?? {})[0];
  return messages[key] ?? 'El valor no es válido.';
}

/** Texto obligatorio: rechaza vacío y solo espacios. */
export const notBlank: ValidatorFn = (control: AbstractControl): ValidationErrors | null =>
  typeof control.value === 'string' && control.value.trim() === '' ? { required: true } : null;

/** Número entero (los vacíos los atiende `Validators.required`). */
export const integer: ValidatorFn = (control: AbstractControl): ValidationErrors | null =>
  control.value === null || control.value === '' || Number.isInteger(control.value) ? null : { integer: true };

/** Lleva el foco al primer campo inválido de un formulario (para teclado y lectores de pantalla). */
export function focusFirstInvalid(host: HTMLElement): void {
  host.querySelector<HTMLElement>('input.ng-invalid, select.ng-invalid, textarea.ng-invalid')?.focus();
}
