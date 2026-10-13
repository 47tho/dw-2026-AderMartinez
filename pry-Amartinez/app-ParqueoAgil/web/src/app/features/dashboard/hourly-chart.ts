import { Component, computed, input } from '@angular/core';

/**
 * Barras de entradas por hora (0–23). SVG sin librerías; los datos también
 * van en una tabla oculta para lectores de pantalla.
 */
@Component({
  selector: 'app-hourly-chart',
  template: `
    <svg [attr.viewBox]="'0 0 ' + width + ' ' + height" role="img" [attr.aria-label]="summary()">
      @for (bar of bars(); track bar.hour) {
        <rect [attr.x]="bar.x" [attr.y]="bar.y" [attr.width]="barWidth" [attr.height]="bar.h" rx="2"
              [class.now]="bar.hour === currentHour" />
        @if (bar.hour % 3 === 0) {
          <text [attr.x]="bar.x + barWidth / 2" [attr.y]="height - 2" text-anchor="middle">{{ bar.hour }}h</text>
        }
      }
    </svg>
    <table class="sr-only">
      <caption>Entradas por hora</caption>
      <tbody>
        @for (bar of bars(); track bar.hour) {
          <tr><th scope="row">{{ bar.hour }}:00</th><td>{{ bar.value }}</td></tr>
        }
      </tbody>
    </table>
  `,
  styles: `
    svg { width: 100%; height: auto; display: block; }
    rect { fill: var(--accent); opacity: 0.55; }
    rect.now { opacity: 1; }
    text { fill: var(--text-3); font-size: 9px; font-family: var(--font); }
  `,
})
export class HourlyChart {
  readonly values = input.required<number[]>();

  protected readonly width = 480;
  protected readonly height = 150;
  protected readonly barWidth = 14;
  protected readonly currentHour = new Date().getHours();

  protected readonly bars = computed(() => {
    const values = this.values();
    const max = Math.max(1, ...values);
    const step = this.width / 24;
    const plot = this.height - 16;
    return values.map((value, hour) => {
      const h = Math.max(value > 0 ? 3 : 1, (value / max) * (plot - 4));
      return { hour, value, x: hour * step + (step - this.barWidth) / 2, y: plot - h, h };
    });
  });

  protected readonly summary = computed(() => {
    const values = this.values();
    const total = values.reduce((a, b) => a + b, 0);
    const peak = values.indexOf(Math.max(...values));
    return total === 0 ? 'Sin entradas hoy' : `${total} entradas hoy; la hora con más entradas fue las ${peak}:00`;
  });
}
