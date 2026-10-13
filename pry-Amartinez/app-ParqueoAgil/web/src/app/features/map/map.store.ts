import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { LiveService } from '../../core/live.service';
import type { Spot, Ticket, Zone } from '../../core/models';

/** Quién ocupa un espacio (sale del ticket abierto). */
export interface Occupant {
  ticketId: number;
  plate: string | null;
  entryAt: string;
}
export interface ZoneView {
  zone: Zone;
  spots: Spot[];
  free: number;
}
export interface FloorTab {
  floor: number;
  free: number;
}

const normalize = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, '');
const messageOf = (error: unknown) => (error instanceof Error ? error.message : 'Error inesperado');

/**
 * Estado del plano. Se provee a nivel de `MapPage`, así vive y muere con la
 * vista (y sus suscripciones al tiempo real se cancelan solas).
 */
@Injectable()
export class MapStore {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly live = inject(LiveService);
  private loaded = false;
  private dropped = false;

  readonly zones = signal<Zone[]>([]);
  readonly spots = signal<Spot[]>([]);
  readonly occupants = signal<ReadonlyMap<number, Occupant>>(new Map());
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly floor = signal<number | null>(null);
  readonly selectedId = signal<number | null>(null);
  readonly query = signal('');
  readonly busy = signal(false);
  readonly actionError = signal<string | null>(null);

  private readonly zonesById = computed(() => new Map(this.zones().map((z) => [z.id, z])));
  private readonly spotsById = computed(() => new Map(this.spots().map((s) => [s.id, s])));

  /** Todas las zonas con sus espacios ordenados por fila y columna. */
  private readonly allViews = computed<ZoneView[]>(() => {
    const byZone = new Map<number, Spot[]>();
    for (const spot of this.spots()) {
      const list = byZone.get(spot.zoneId);
      if (list) list.push(spot);
      else byZone.set(spot.zoneId, [spot]);
    }
    return [...this.zones()]
      .sort((a, b) => a.floor - b.floor || a.position - b.position)
      .map((zone) => {
        const spots = (byZone.get(zone.id) ?? []).sort((a, b) => a.row - b.row || a.column - b.column);
        return { zone, spots, free: spots.filter((s) => s.status === 'free').length };
      });
  });

  readonly floors = computed<FloorTab[]>(() => {
    const tabs = new Map<number, FloorTab>();
    for (const v of this.allViews()) {
      const tab = tabs.get(v.zone.floor) ?? { floor: v.zone.floor, free: 0 };
      tab.free += v.free;
      tabs.set(tab.floor, tab);
    }
    return [...tabs.values()].sort((a, b) => a.floor - b.floor);
  });
  /** Piso elegido si existe; si no, el primero. */
  readonly activeFloor = computed(() => {
    const floors = this.floors();
    return floors.some((f) => f.floor === this.floor()) ? this.floor() : (floors[0]?.floor ?? null);
  });
  readonly views = computed(() => this.allViews().filter((v) => v.zone.floor === this.activeFloor()));

  readonly totals = computed(() => {
    const all = this.spots();
    const count = (status: Spot['status']) => all.filter((s) => s.status === status).length;
    return { free: count('free'), occupied: count('occupied'), blocked: count('blocked') };
  });

  readonly selected = computed(() => {
    const spot = this.spotsById().get(this.selectedId() ?? -1);
    if (!spot) return null;
    return { spot, zone: this.zonesById().get(spot.zoneId) ?? null, occupant: this.occupants().get(spot.id) ?? null };
  });

  /** Espacios cuya placa contiene lo digitado en el buscador. */
  readonly matches = computed(() => {
    const q = normalize(this.query());
    if (!q) return [];
    const found: { spotId: number; plate: string }[] = [];
    for (const [spotId, occ] of this.occupants()) {
      if (occ.plate && normalize(occ.plate).includes(q) && this.spotsById().has(spotId)) {
        found.push({ spotId, plate: occ.plate });
      }
    }
    return found.sort((a, b) => a.plate.localeCompare(b.plate));
  });
  readonly highlighted = computed<ReadonlySet<number>>(() => new Set(this.matches().map((m) => m.spotId)));
  readonly firstMatchId = computed(() => this.matches()[0]?.spotId ?? null);

  readonly searchStatus = computed(() => {
    const q = normalize(this.query());
    const found = this.matches();
    if (!q) return '';
    if (found.length === 0) return `Ningún vehículo dentro del parqueadero coincide con «${q}».`;
    if (found.length > 1) return `${found.length} placas coinciden; están resaltadas en el plano.`;
    const spot = this.spotsById().get(found[0].spotId);
    return `${found[0].plate} está en el espacio ${spot?.code} (${this.zonesById().get(spot?.zoneId ?? -1)?.name}).`;
  });

  constructor() {
    void this.load();
    this.live.on('spot.updated').pipe(takeUntilDestroyed()).subscribe((e) => this.applySpot(e.data));
    this.live
      .on('ticket.opened', 'ticket.quoted', 'ticket.closed')
      .pipe(takeUntilDestroyed())
      .subscribe((e) => {
        if (e.type === 'ticket.opened') this.addOccupant(e.data);
        else if (e.type === 'ticket.closed') this.removeOccupant(e.data.parkingSpotId, e.data.id);
      });
    // Si el flujo en vivo se cayó y volvió, pudimos perdernos eventos: recarga en silencio.
    effect(() => {
      const status = this.live.status();
      untracked(() => {
        if (status === 'offline') this.dropped = this.loaded;
        else if (status === 'live' && this.dropped) {
          this.dropped = false;
          void this.load(true);
        }
      });
    });
  }

  async load(silent = false): Promise<void> {
    if (!silent) {
      this.loading.set(true);
      this.error.set(null);
    }
    try {
      const [zones, spots, tickets] = await Promise.all([this.api.zones(), this.api.spots(), this.openTickets()]);
      const occupants = new Map<number, Occupant>();
      for (const t of tickets) if (t.parkingSpotId !== null) occupants.set(t.parkingSpotId, toOccupant(t));
      this.zones.set(zones);
      this.spots.set(spots);
      this.occupants.set(occupants);
      this.error.set(null);
      this.loaded = true;
    } catch (error) {
      if (!silent) this.error.set(messageOf(error));
    } finally {
      this.loading.set(false);
    }
  }

  select(id: number): void {
    this.selectedId.update((current) => (current === id ? null : id));
    this.actionError.set(null);
  }

  /** Actualiza el buscador y, si la placa está en otro piso, cambia de piso. */
  search(value: string): void {
    this.query.set(value);
    const found = this.matches();
    if (found.length === 0) return;
    const floorOf = (id: number) => this.zonesById().get(this.spotsById().get(id)?.zoneId ?? -1)?.floor ?? null;
    if (!found.some((m) => floorOf(m.spotId) === this.activeFloor())) this.floor.set(floorOf(found[0].spotId));
  }

  async toggleBlocked(): Promise<void> {
    const spot = this.selected()?.spot;
    if (!spot || spot.status === 'occupied' || this.busy()) return;
    this.busy.set(true);
    this.actionError.set(null);
    try {
      this.applySpot(await this.api.setSpotStatus(spot.id, spot.status === 'blocked' ? 'free' : 'blocked'));
    } catch (error) {
      this.actionError.set(messageOf(error));
    } finally {
      this.busy.set(false);
    }
  }

  /** Tickets abiertos de todas las páginas (para saber quién ocupa cada espacio). */
  private async openTickets(): Promise<Ticket[]> {
    if (!this.auth.can('GET', '/api/tickets')) return [];
    const all: Ticket[] = [];
    for (let page = 1, pages = 1; page <= pages; page++) {
      const res = await this.api.tickets({ status: 'open', limit: 100, page });
      all.push(...res.items);
      pages = res.meta.totalPages;
    }
    return all;
  }

  private applySpot(update: Spot): void {
    this.spots.update((list) => {
      const i = list.findIndex((s) => s.id === update.id);
      if (i < 0) return [...list, update];
      const next = list.slice();
      next[i] = { ...list[i], ...update };
      return next;
    });
    if (update.status !== 'occupied') this.removeOccupant(update.id);
  }

  private addOccupant(ticket: Ticket): void {
    if (ticket.parkingSpotId === null) return;
    this.occupants.update((map) => new Map(map).set(ticket.parkingSpotId as number, toOccupant(ticket)));
  }

  private removeOccupant(spotId: number | null, ticketId?: number): void {
    const current = spotId === null ? undefined : this.occupants().get(spotId);
    if (!current || (ticketId !== undefined && current.ticketId !== ticketId)) return;
    this.occupants.update((map) => {
      const next = new Map(map);
      next.delete(spotId as number);
      return next;
    });
  }
}

function toOccupant(ticket: Ticket): Occupant {
  return { ticketId: ticket.id, plate: ticket.plate, entryAt: ticket.entryAt };
}
