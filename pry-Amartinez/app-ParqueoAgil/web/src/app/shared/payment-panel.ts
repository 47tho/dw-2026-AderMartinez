import { Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiError, ApiService } from '../core/api.service';
import { CopPipe, DurationPipe, TimePipe, formatCop } from '../core/format';
import { PAYMENT_LABELS, type GateExit, type PaymentMethodCode, type Ticket } from '../core/models';

/**
 * Cobro de una salida ya cotizada (después de leer el QR de salida o de
 * registrar la salida por placa). Lo usan la portería y la lista de tickets.
 *
 * Emite `paid` con el ticket cerrado (para mostrar el recibo).
 */
@Component({
  selector: 'app-payment-panel',
  imports: [FormsModule, CopPipe, DurationPipe, TimePipe],
  template: `
    @let q = exit().quote;
    <section class="pay" aria-labelledby="pay-title">
      <header>
        <h2 id="pay-title">Cobrar salida</h2>
        <span class="plate">{{ exit().vehicle.plate }}</span>
      </header>

      <dl class="detail">
        <div><dt>Conductor</dt><dd>{{ exit().driverName }}</dd></div>
        <div><dt>Entrada</dt><dd class="num">{{ exit().ticket.entryAt | hora }}</dd></div>
        <div><dt>Tiempo</dt><dd class="num">{{ q.minutes | duration }}</dd></div>
        <div><dt>Fracciones</dt><dd class="num">{{ q.fractions }} × {{ q.pricePerFraction | cop }} ({{ q.minutesPerFraction }} min)</dd></div>
      </dl>
      <p class="total"><span>Total</span><strong class="num">{{ q.total | cop }}</strong></p>
      <p class="subtle">Valor fijado al leer el QR de salida ({{ q.quotedAt | hora }}). Aproximado a $100.</p>

      <fieldset class="methods">
        <legend>Método de pago</legend>
        @for (m of methods(); track m) {
          <label class="method" [class.selected]="method() === m">
            <input type="radio" name="method" [value]="m" [ngModel]="method()" (ngModelChange)="chosen.set($event)" [disabled]="busy()" />
            <span>{{ labels[m] }}</span>
            @if (m === 'auto' && exit().savedCard; as card) {
              <span class="subtle">{{ card.label }}</span>
            }
            @if (m === exit().preferredPaymentMethod) {
              <span class="badge info">Preferido</span>
            }
          </label>
        }
      </fieldset>

      @if (method() === 'cash') {
        <div class="field">
          <label for="cash">Efectivo recibido</label>
          <input id="cash" class="input num" type="number" min="0" step="1000" inputmode="numeric"
                 [ngModel]="cash()" (ngModelChange)="cash.set($event)" [disabled]="busy()" />
          <div class="quick">
            @for (bill of quickBills(); track bill) {
              <button type="button" class="btn sm" (click)="cash.set(bill)" [disabled]="busy()">{{ bill | cop }}</button>
            }
          </div>
          @if (change() !== null) {
            <p class="change" [class.short]="change()! < 0">
              {{ change()! < 0 ? 'Faltan ' + format(-change()!) : 'Cambio: ' + format(change()!) }}
            </p>
          }
        </div>
      }

      @if (error()) {
        <p class="alert error" role="alert">{{ error() }}</p>
      }

      <div class="actions">
        <button type="button" class="btn" (click)="cancelled.emit()" [disabled]="busy()">Cancelar</button>
        <button type="button" class="btn primary" (click)="pay()" [disabled]="busy() || !canPay()">
          {{ busy() ? 'Procesando…' : 'Cobrar ' + format(q.total) }}
        </button>
      </div>
    </section>
  `,
  styles: `
    .pay { display: flex; flex-direction: column; gap: var(--space-4); }
    header { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); }
    .detail { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: var(--space-3); margin: 0; }
    dt { font-size: 0.78rem; color: var(--text-3); text-transform: uppercase; letter-spacing: 0.04em; }
    dd { margin: 0; font-weight: 600; }
    .total { display: flex; align-items: baseline; justify-content: space-between; padding: var(--space-3) var(--space-4); background: var(--surface-2); border-radius: var(--radius-sm); }
    .total strong { font-size: 1.75rem; }
    .methods { border: 0; padding: 0; margin: 0; display: grid; gap: var(--space-2); }
    legend { font-size: 0.85rem; color: var(--text-2); font-weight: 600; margin-bottom: var(--space-2); }
    .method { display: flex; align-items: center; gap: var(--space-3); padding: var(--space-2) var(--space-3); border: 1px solid var(--border); border-radius: var(--radius-sm); cursor: pointer; }
    .method.selected { border-color: var(--accent); background: var(--accent-soft); }
    .quick { display: flex; flex-wrap: wrap; gap: var(--space-2); margin-top: var(--space-2); }
    .change { margin-top: var(--space-2); font-weight: 700; color: var(--ok); }
    .change.short { color: var(--danger); }
    .actions { display: flex; justify-content: flex-end; gap: var(--space-2); flex-wrap: wrap; }
  `,
})
export class PaymentPanel {
  private readonly api = inject(ApiService);

  readonly exit = input.required<GateExit>();
  readonly paid = output<Ticket>();
  readonly cancelled = output<void>();

  protected readonly labels = PAYMENT_LABELS;
  protected readonly format = formatCop;
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly cash = signal<number | null>(null);
  protected readonly chosen = signal<PaymentMethodCode | null>(null);

  /** El cobro automático solo aparece si el conductor tiene tarjeta guardada. */
  protected readonly methods = computed<PaymentMethodCode[]>(() =>
    this.exit().savedCard ? ['auto', 'cash', 'card', 'qr'] : ['cash', 'card', 'qr'],
  );

  /** Método elegido; por defecto el preferido del conductor. */
  protected readonly method = computed(() => this.chosen() ?? this.defaultMethod());

  protected readonly change = computed(() => {
    const received = this.cash();
    return received === null || received === undefined ? null : received - this.exit().quote.total;
  });

  /** Billetes que alcanzan para el total (para no tener que digitar). */
  protected readonly quickBills = computed(() => {
    const total = this.exit().quote.total;
    const options = new Set<number>([total]);
    for (const bill of [2000, 5000, 10000, 20000, 50000, 100000]) {
      options.add(Math.ceil(total / bill) * bill);
    }
    return [...options].filter((v) => v >= total && v > 0).sort((a, b) => a - b).slice(0, 4);
  });

  protected canPay(): boolean {
    if (this.method() !== 'cash') return true;
    const change = this.change();
    return change !== null && change >= 0;
  }

  async pay(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      const method = this.method();
      const ticket = await this.api.pay(this.exit().ticket.id, method, method === 'cash' ? (this.cash() ?? 0) : undefined);
      this.paid.emit(ticket);
    } catch (error) {
      this.error.set(error instanceof ApiError ? error.message : 'No se pudo cobrar');
    } finally {
      this.busy.set(false);
    }
  }

  private defaultMethod(): PaymentMethodCode {
    const preferred = this.exit().preferredPaymentMethod;
    return this.methods().includes(preferred) ? preferred : 'cash';
  }
}
