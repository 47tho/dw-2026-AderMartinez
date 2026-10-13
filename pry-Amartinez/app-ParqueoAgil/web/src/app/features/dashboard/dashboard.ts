import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { debounceTime } from 'rxjs';
import { ApiError, ApiService } from '../../core/api.service';
import { CopPipe, DurationPipe, TimePipe } from '../../core/format';
import { LiveService } from '../../core/live.service';
import { PAYMENT_LABELS, type PaymentMethodCode, type Summary, type Ticket } from '../../core/models';
import { HourlyChart } from './hourly-chart';

interface FeedItem {
  id: string;
  kind: 'in' | 'out' | 'quote';
  ticket: Ticket;
  at: Date;
}

/** Tablero en vivo: ocupación, movimiento del día y actividad de la portería. */
@Component({
  selector: 'app-dashboard',
  imports: [CopPipe, DurationPipe, TimePipe, HourlyChart],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
})
export class DashboardPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly live = inject(LiveService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly summary = signal<Summary | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly feed = signal<FeedItem[]>([]);
  protected readonly methodLabels = PAYMENT_LABELS;

  protected readonly occupancyPct = computed(() => {
    const s = this.summary();
    return s && s.occupancy.capacity > 0 ? Math.round((s.occupancy.occupied / s.occupancy.capacity) * 100) : 0;
  });

  protected readonly methods = computed(() => {
    const s = this.summary();
    if (!s) return [];
    const total = s.today.revenue || 1;
    return (['cash', 'card', 'qr', 'auto'] as PaymentMethodCode[]).map((code) => ({
      code,
      label: PAYMENT_LABELS[code],
      amount: s.today.byMethod[code] ?? 0,
      pct: Math.round(((s.today.byMethod[code] ?? 0) / total) * 100),
    }));
  });

  ngOnInit(): void {
    void this.load();

    this.live
      .on('ticket.opened', 'ticket.closed', 'ticket.quoted')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((event) => {
        const kind = event.type === 'ticket.opened' ? 'in' : event.type === 'ticket.closed' ? 'out' : 'quote';
        const item: FeedItem = { id: `${event.type}-${event.data.id}-${Date.now()}`, kind, ticket: event.data, at: new Date() };
        this.feed.update((items) => [item, ...items].slice(0, 12));
      });

    // Los cambios de ocupación y de cobros recalculan el resumen (agrupados).
    this.live
      .on('ticket.opened', 'ticket.closed', 'spot.updated')
      .pipe(debounceTime(800), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => void this.load());

    const timer = setInterval(() => void this.load(), 60_000);
    this.destroyRef.onDestroy(() => clearInterval(timer));
  }

  async load(): Promise<void> {
    try {
      this.summary.set(await this.api.summary());
      this.error.set(null);
    } catch (error) {
      this.error.set(error instanceof ApiError ? error.message : 'No se pudo cargar el resumen');
    }
  }

  protected zonePct(occupied: number, capacity: number): number {
    return capacity > 0 ? Math.round((occupied / capacity) * 100) : 0;
  }
}
