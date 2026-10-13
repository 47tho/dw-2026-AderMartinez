import { Pipe, PipeTransform } from '@angular/core';

/** 8800 → $8.800 (pesos colombianos, sin decimales). */
export function formatCop(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  const rounded = Math.round(value);
  const digits = Math.abs(rounded).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${rounded < 0 ? '-' : ''}$${digits}`;
}

/** 91 → "1 h 31 min" */
export function formatMinutes(total: number): string {
  const minutes = Math.max(0, Math.floor(total));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** Minutos entre una fecha ISO y ahora (o `until`). */
export function minutesSince(iso: string, until: Date = new Date()): number {
  return Math.max(0, Math.floor((until.getTime() - new Date(iso).getTime()) / 60000));
}

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-CO', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

@Pipe({ name: 'cop' })
export class CopPipe implements PipeTransform {
  transform(value: number | null | undefined): string {
    return formatCop(value);
  }
}

@Pipe({ name: 'duration' })
export class DurationPipe implements PipeTransform {
  transform(minutes: number | null | undefined): string {
    return minutes === null || minutes === undefined ? '—' : formatMinutes(minutes);
  }
}

@Pipe({ name: 'hora' })
export class TimePipe implements PipeTransform {
  transform(iso: string | null | undefined): string {
    return formatTime(iso);
  }
}

@Pipe({ name: 'fechaHora' })
export class DateTimePipe implements PipeTransform {
  transform(iso: string | null | undefined): string {
    return formatDateTime(iso);
  }
}
