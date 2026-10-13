import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiError, ApiService } from '../../core/api.service';
import { formatCop } from '../../core/format';
import type { GateEntry, GateExit, Ticket, VehicleType } from '../../core/models';
import { PaymentPanel } from '../../shared/payment-panel';
import { EntryCard, ReceiptCard } from './gate-outcome';
import { QrScanner } from './qr-scanner';

type View =
  | { kind: 'idle' }
  | { kind: 'entry'; entry: GateEntry }
  | { kind: 'exit'; exit: GateExit }
  | { kind: 'receipt'; ticket: Ticket }
  | { kind: 'error'; title: string; detail: string };

interface HistoryItem {
  at: Date;
  plate: string;
  text: string;
  tone: 'ok' | 'info' | 'danger';
}

const ERROR_TITLES: Record<number, string> = {
  0: 'Sin conexión',
  402: 'Pago rechazado',
  404: 'No encontrado',
  409: 'No se puede continuar',
  410: 'QR vencido',
  422: 'QR no válido',
};

/**
 * Portería: la terminal de la entrada/salida. Lee el QR del conductor con la
 * cámara (o se pega el código), registra visitantes sin app por placa y
 * cobra la salida.
 */
@Component({
  selector: 'app-gate',
  imports: [FormsModule, QrScanner, PaymentPanel, EntryCard, ReceiptCard],
  templateUrl: './gate.html',
  styleUrl: './gate.css',
})
export class GatePage implements OnInit {
  private readonly api = inject(ApiService);

  protected readonly view = signal<View>({ kind: 'idle' });
  protected readonly busy = signal(false);
  protected readonly history = signal<HistoryItem[]>([]);
  protected readonly types = signal<VehicleType[]>([]);
  protected readonly scannerPaused = computed(() => this.busy() || this.view().kind === 'exit');

  protected code = '';
  protected entryPlate = '';
  protected entryTypeId: number | null = null;
  protected exitPlate = '';

  async ngOnInit(): Promise<void> {
    try {
      const types = (await this.api.vehicleTypes()).filter((t) => t.status === 'active');
      this.types.set(types);
      this.entryTypeId = types[0]?.id ?? null;
    } catch {
      /* el formulario manual mostrará el error al enviar */
    }
  }

  onScanned(text: string): void {
    void this.run(() => this.api.scan(text));
  }

  submitCode(): void {
    const text = this.code.trim();
    if (!text) return;
    this.code = '';
    void this.run(() => this.api.scan(text));
  }

  submitEntry(): void {
    const plate = this.entryPlate.trim();
    if (!plate || !this.entryTypeId) return;
    void this.run(() => this.api.manualEntry(plate, this.entryTypeId!)).then((ok) => ok && (this.entryPlate = ''));
  }

  submitExit(): void {
    const plate = this.exitPlate.trim();
    if (!plate) return;
    void this.run(() => this.api.manualExit(plate)).then((ok) => ok && (this.exitPlate = ''));
  }

  onPaid(ticket: Ticket): void {
    this.view.set({ kind: 'receipt', ticket });
    this.log(ticket.plate ?? '—', `Salida pagada ${formatCop(ticket.total)}`, 'info');
  }

  reset(): void {
    this.view.set({ kind: 'idle' });
  }

  private async run(action: () => Promise<GateEntry | GateExit>): Promise<boolean> {
    if (this.busy()) return false;
    this.busy.set(true);
    try {
      const result = await action();
      if (result.kind === 'entry') {
        this.view.set({ kind: 'entry', entry: result });
        this.log(result.vehicle.plate, `Entrada → ${result.spot?.code ?? result.zone.name}`, 'ok');
      } else {
        this.view.set({ kind: 'exit', exit: result });
        this.log(result.vehicle.plate, `Salida por cobrar ${formatCop(result.quote.total)}`, 'info');
      }
      return true;
    } catch (error) {
      const status = error instanceof ApiError ? error.status : -1;
      const detail = error instanceof ApiError ? error.message : 'Error inesperado';
      this.view.set({ kind: 'error', title: ERROR_TITLES[status] ?? 'No se pudo procesar', detail });
      this.log('—', detail, 'danger');
      return false;
    } finally {
      this.busy.set(false);
    }
  }

  private log(plate: string, text: string, tone: HistoryItem['tone']): void {
    this.history.update((items) => [{ at: new Date(), plate, text, tone }, ...items].slice(0, 8));
  }
}
