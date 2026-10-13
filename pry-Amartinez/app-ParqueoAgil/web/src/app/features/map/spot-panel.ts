import { Component, DestroyRef, computed, inject, input, output, signal } from '@angular/core';
import { DateTimePipe, DurationPipe, minutesSince } from '../../core/format';
import type { Spot, Zone } from '../../core/models';
import type { Occupant } from './map.store';

/** Detalle del espacio elegido en el plano, con la acción de bloquear o liberar. */
@Component({
  selector: 'app-spot-panel',
  imports: [DateTimePipe, DurationPipe],
  templateUrl: './spot-panel.html',
  styleUrl: './spot-panel.css',
})
export class SpotPanel {
  readonly spot = input<Spot | null>(null);
  readonly zone = input<Zone | null>(null);
  readonly occupant = input<Occupant | null>(null);
  readonly canManage = input(false);
  readonly busy = input(false);
  readonly error = input<string | null>(null);
  readonly toggle = output<void>();
  readonly closed = output<void>();

  /** Reloj para que el tiempo transcurrido avance sin recargar. */
  private readonly now = signal(new Date());
  protected readonly minutes = computed(() => {
    const occupant = this.occupant();
    return occupant ? minutesSince(occupant.entryAt, this.now()) : 0;
  });

  constructor() {
    const timer = setInterval(() => this.now.set(new Date()), 30_000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }
}
