import { Component, ElementRef, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Subject, debounceTime, map } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { LiveService } from '../../core/live.service';
import type { Ticket, Zone } from '../../core/models';
import { ChargeDialog } from './charge-dialog';
import { TicketsTable, type ChargeRequest } from './tickets-table';

type StatusFilter = 'open' | 'closed' | 'all';

const PAGE_SIZE = 15;
const messageOf = (error: unknown, fallback: string) => (error instanceof Error ? error.message : fallback);

/** Lista paginada de tickets con filtros y cobro de salida por placa. */
@Component({
  selector: 'app-tickets',
  imports: [FormsModule, TicketsTable, ChargeDialog],
  templateUrl: './tickets.html',
  styleUrl: './tickets.css',
})
export class TicketsPage {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly live = inject(LiveService);
  private readonly dialog = viewChild.required(ChargeDialog);
  private readonly results = viewChild.required<ElementRef<HTMLElement>>('results');

  private readonly plateInput = new Subject<string>();
  private requestSeq = 0;
  private loaded = false;
  private dropped = false;

  protected readonly status = signal<StatusFilter>('open');
  protected readonly plate = signal('');
  protected readonly appliedPlate = signal('');
  protected readonly zoneId = signal<number | null>(null);
  protected readonly page = signal(1);

  protected readonly zones = signal<Zone[]>([]);
  protected readonly items = signal<Ticket[]>([]);
  protected readonly meta = signal({ total: 0, totalPages: 1 });
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly chargingId = signal<number | null>(null);
  protected readonly chargeError = signal<string | null>(null);
  protected readonly skeletons = [1, 2, 3, 4, 5, 6];

  protected readonly canCharge = computed(() => this.auth.can('POST', '/api/gate/manual-exit'));
  protected readonly isFiltered = computed(
    () => this.status() !== 'open' || this.plate() !== '' || this.zoneId() !== null,
  );

  protected readonly summary = computed(() => {
    const { total } = this.meta();
    if (this.loading() || this.error()) return '';
    if (total === 0) return '0 tickets';
    const from = (this.page() - 1) * PAGE_SIZE + 1;
    return `Mostrando ${from}–${from + this.items().length - 1} de ${total}`;
  });

  protected readonly emptyText = computed(() => {
    if (this.appliedPlate()) {
      return `Ningún ticket coincide con la placa «${this.appliedPlate()}». Revisa la placa o cambia el filtro de estado.`;
    }
    if (this.status() === 'open' && this.zoneId() === null) return 'No hay vehículos dentro del parqueadero en este momento.';
    return 'No hay tickets con los filtros elegidos. Prueba con otra zona u otro estado.';
  });

  constructor() {
    void this.load();
    this.api.zones().then((zones) => this.zones.set(zones), () => undefined);

    // La búsqueda por placa espera a que se deje de escribir.
    this.plateInput
      .pipe(
        debounceTime(300),
        map((value) => value.replace(/[^a-z0-9]/gi, '').toUpperCase()),
        takeUntilDestroyed(),
      )
      .subscribe((value) => {
        if (value === this.appliedPlate()) return;
        this.appliedPlate.set(value);
        this.restart();
      });

    // Cualquier cambio de tickets en vivo recarga la página actual.
    this.live
      .on('ticket.opened', 'ticket.closed', 'ticket.quoted')
      .pipe(debounceTime(500), takeUntilDestroyed())
      .subscribe(() => void this.load(true));

    // Si el flujo en vivo se cayó y volvió, pudimos perdernos eventos.
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

  protected setStatus(value: StatusFilter): void {
    this.status.set(value);
    this.restart();
  }

  protected setZone(value: number | null): void {
    this.zoneId.set(value);
    this.restart();
  }

  protected onPlate(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.plate.set(value);
    this.plateInput.next(value);
  }

  protected clearFilters(): void {
    this.status.set('open');
    this.zoneId.set(null);
    this.plate.set('');
    this.appliedPlate.set('');
    this.restart();
  }

  protected go(delta: number): void {
    this.page.update((p) => Math.min(Math.max(1, p + delta), this.meta().totalPages));
    void this.load();
  }

  /** Cotiza la salida por placa y abre el diálogo de cobro. */
  protected async charge({ ticket, opener }: ChargeRequest): Promise<void> {
    if (this.chargingId() !== null || !ticket.plate) return;
    this.chargingId.set(ticket.id);
    this.chargeError.set(null);
    try {
      this.dialog().open(await this.api.manualExit(ticket.plate), opener);
    } catch (error) {
      this.chargeError.set(messageOf(error, 'No se pudo cotizar la salida'));
    } finally {
      this.chargingId.set(null);
    }
  }

  protected async onDialogClosed(): Promise<void> {
    await this.load(true);
    // El ticket cobrado ya no está en la lista abierta: el foco no debe perderse.
    if (!document.activeElement || document.activeElement === document.body) this.results().nativeElement.focus();
  }

  private restart(): void {
    this.page.set(1);
    void this.load();
  }

  protected async load(silent = false): Promise<void> {
    const seq = ++this.requestSeq;
    if (!silent) {
      this.loading.set(true);
      this.error.set(null);
    }
    try {
      const status = this.status();
      const res = await this.api.tickets({
        status: status === 'all' ? undefined : status,
        zoneId: this.zoneId() ?? undefined,
        plate: this.appliedPlate() || undefined,
        page: this.page(),
        limit: PAGE_SIZE,
      });
      if (seq !== this.requestSeq) return;
      if (res.items.length === 0 && this.page() > res.meta.totalPages && this.page() > 1) {
        // La última página quedó vacía (por ejemplo, se cobraron sus tickets): retrocede.
        this.page.set(Math.max(1, res.meta.totalPages));
        return await this.load(silent);
      }
      this.items.set(res.items);
      this.meta.set({ total: res.meta.total, totalPages: Math.max(1, res.meta.totalPages) });
      this.error.set(null);
      this.loaded = true;
    } catch (error) {
      if (seq === this.requestSeq && (!silent || !this.loaded)) this.error.set(messageOf(error, 'No se pudieron cargar los tickets'));
    } finally {
      if (seq === this.requestSeq) this.loading.set(false);
    }
  }
}
