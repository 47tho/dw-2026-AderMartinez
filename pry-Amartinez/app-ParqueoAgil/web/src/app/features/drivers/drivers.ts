import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { debounceTime } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { DateTimePipe } from '../../core/format';
import { LiveService } from '../../core/live.service';
import { type DriverRow, KIND_LABELS, PAYMENT_LABELS, type Page } from '../../core/models';
import { messageOf } from '../form-utils';

const PAGE_SIZE = 15;

/** Conductores registrados desde la app móvil, con sus vehículos y si están dentro. */
@Component({
  selector: 'app-drivers',
  imports: [DateTimePipe],
  templateUrl: './drivers.html',
  styleUrl: './drivers.css',
})
export class DriversPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly live = inject(LiveService);
  private readonly destroyRef = inject(DestroyRef);
  private requestId = 0;

  protected readonly result = signal<Page<DriverRow> | null>(null);
  protected readonly loading = signal(true);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly meta = computed(() => this.result()?.meta ?? null);

  protected readonly paymentLabels = PAYMENT_LABELS;
  protected readonly kindLabels = KIND_LABELS;

  ngOnInit(): void {
    void this.load(1);

    // Una entrada o salida cambia quién está dentro: se refresca la página actual sin parpadeo.
    this.live
      .on('ticket.opened', 'ticket.closed')
      .pipe(debounceTime(800), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => void this.load(this.meta()?.page ?? 1, true));
  }

  async load(page: number, quiet = false): Promise<void> {
    const id = ++this.requestId;
    if (!quiet) this.busy.set(true);
    try {
      const result = await this.api.drivers(page, PAGE_SIZE);
      if (id !== this.requestId) return; // llegó una respuesta más nueva
      this.result.set(result);
      this.error.set(null);
    } catch (error) {
      if (id === this.requestId && !quiet) this.error.set(messageOf(error, 'No se pudieron cargar los conductores.'));
    } finally {
      if (id === this.requestId) {
        this.loading.set(false);
        this.busy.set(false);
      }
    }
  }
}
