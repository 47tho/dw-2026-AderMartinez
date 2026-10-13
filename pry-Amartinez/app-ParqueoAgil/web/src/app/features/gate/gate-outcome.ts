import { Component, input, output } from '@angular/core';
import { CopPipe, DurationPipe, TimePipe } from '../../core/format';
import { KIND_LABELS, PAYMENT_LABELS, type GateEntry, type Ticket } from '../../core/models';

/** Tarjeta de entrada registrada (espacio asignado y por qué). */
@Component({
  selector: 'app-entry-card',
  imports: [TimePipe],
  template: `
    @let e = entry();
    <section class="result ok" aria-labelledby="entry-title">
      <p class="badge ok">Entrada registrada · barrera abierta</p>
      <h2 id="entry-title" class="spot">{{ e.spot?.code ?? e.zone.name }}</h2>
      <p class="zone">{{ e.zone.name }} · Piso {{ e.zone.floor }}</p>
      <p class="who">
        <span class="plate">{{ e.vehicle.plate }}</span>
        <span>{{ kinds[e.vehicle.kind] }}{{ e.vehicle.description ? ' · ' + e.vehicle.description : '' }}</span>
      </p>
      <p class="muted">{{ e.driverName }} · {{ e.ticket.entryAt | hora }} · {{ e.ticket.channel === 'qr' ? 'QR de la app' : 'Entrada manual' }}</p>
      <p class="reason">{{ e.reason }}</p>
      <button type="button" class="btn" (click)="done.emit()">Siguiente vehículo</button>
    </section>
  `,
  styles: `
    .result { display: flex; flex-direction: column; gap: var(--space-2); align-items: flex-start; }
    .spot { font-size: 3.5rem; line-height: 1; font-weight: 800; font-family: var(--mono); letter-spacing: 0.04em; }
    .zone { font-weight: 600; color: var(--text-2); }
    .who { display: flex; flex-wrap: wrap; gap: var(--space-2); align-items: center; }
    .reason { padding: var(--space-2) var(--space-3); border-left: 3px solid var(--accent); background: var(--accent-soft); border-radius: var(--radius-sm); }
  `,
})
export class EntryCard {
  readonly entry = input.required<GateEntry>();
  readonly done = output<void>();
  protected readonly kinds = KIND_LABELS;
}

/** Recibo digital que reemplaza al tiquete de papel. */
@Component({
  selector: 'app-receipt-card',
  imports: [CopPipe, DurationPipe, TimePipe],
  template: `
    @let t = ticket();
    <section class="receipt" aria-labelledby="receipt-title">
      <p class="badge ok">Pago aprobado · barrera abierta</p>
      <h2 id="receipt-title">Recibo {{ t.paymentRef }}</h2>
      <dl>
        <div><dt>Placa</dt><dd><span class="plate">{{ t.plate }}</span></dd></div>
        <div><dt>Espacio</dt><dd>{{ t.spotCode ?? '—' }}</dd></div>
        <div><dt>Entrada</dt><dd class="num">{{ t.entryAt | hora }}</dd></div>
        <div><dt>Salida</dt><dd class="num">{{ t.exitAt | hora }}</dd></div>
        <div><dt>Tiempo</dt><dd class="num">{{ minutes() | duration }}</dd></div>
        <div><dt>Fracciones</dt><dd class="num">{{ t.fractions }} × {{ t.pricePerFraction | cop }}</dd></div>
        <div><dt>Método</dt><dd>{{ t.paymentMethod ? methods[t.paymentMethod] : '—' }}{{ t.cardLabel ? ' · ' + t.cardLabel : '' }}</dd></div>
        @if (t.authorization) {
          <div><dt>Autorización</dt><dd class="num">{{ t.authorization }}</dd></div>
        }
        @if (t.paymentMethod === 'cash') {
          <div><dt>Recibido</dt><dd class="num">{{ t.amountReceived | cop }}</dd></div>
          <div><dt>Cambio</dt><dd class="num">{{ t.change | cop }}</dd></div>
        }
      </dl>
      <p class="total"><span>Total pagado</span><strong class="num">{{ t.total | cop }}</strong></p>
      <button type="button" class="btn" (click)="done.emit()">Siguiente vehículo</button>
    </section>
  `,
  styles: `
    .receipt { display: flex; flex-direction: column; gap: var(--space-3); align-items: flex-start; }
    dl { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: var(--space-3); margin: 0; width: 100%; }
    dt { font-size: 0.78rem; color: var(--text-3); text-transform: uppercase; letter-spacing: 0.04em; }
    dd { margin: 0; font-weight: 600; }
    .total { display: flex; justify-content: space-between; align-items: baseline; width: 100%; padding: var(--space-3) var(--space-4); background: var(--ok-soft); border-radius: var(--radius-sm); }
    .total strong { font-size: 1.6rem; }
  `,
})
export class ReceiptCard {
  readonly ticket = input.required<Ticket>();
  readonly done = output<void>();
  protected readonly methods = PAYMENT_LABELS;

  protected minutes(): number {
    const t = this.ticket();
    return t.exitAt ? Math.floor((new Date(t.exitAt).getTime() - new Date(t.entryAt).getTime()) / 60000) : 0;
  }
}
