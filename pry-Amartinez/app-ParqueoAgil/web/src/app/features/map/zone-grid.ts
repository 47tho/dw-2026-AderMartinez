import { Component, computed, input, output } from '@angular/core';
import type { Spot } from '../../core/models';
import type { Occupant, ZoneView } from './map.store';

const STATE_LABELS: Record<Spot['status'], string> = { free: 'libre', occupied: 'ocupado', blocked: 'bloqueado' };

/** Una zona del plano: franja de color, encabezado y rejilla de espacios. */
@Component({
  selector: 'app-zone-grid',
  templateUrl: './zone-grid.html',
  styleUrl: './zone-grid.css',
})
export class ZoneGrid {
  readonly view = input.required<ZoneView>();
  readonly occupants = input.required<ReadonlyMap<number, Occupant>>();
  readonly selectedId = input<number | null>(null);
  readonly highlighted = input<ReadonlySet<number>>(new Set());
  readonly pick = output<number>();

  /** Origen de la rejilla (por si `row`/`column` empiezan en 1) y número de columnas. */
  protected readonly layout = computed(() => {
    const spots = this.view().spots;
    const rows = spots.map((s) => s.row);
    const cols = spots.map((s) => s.column);
    const minRow = Math.min(...rows);
    const minCol = Math.min(...cols);
    return { minRow, minCol, columns: Math.max(6, Math.max(...cols) - minCol + 1) };
  });

  protected label(spot: Spot): string {
    const plate = this.occupants().get(spot.id)?.plate;
    return `Espacio ${spot.code}, ${STATE_LABELS[spot.status]}${plate ? `, placa ${plate}` : ''}`;
  }
}
