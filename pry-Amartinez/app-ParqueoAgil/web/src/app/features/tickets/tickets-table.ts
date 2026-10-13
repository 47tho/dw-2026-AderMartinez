import { Component, DestroyRef, computed, inject, input, output, signal } from '@angular/core';
import { CopPipe, DateTimePipe, DurationPipe, minutesSince } from '../../core/format';
import { PAYMENT_LABELS, type Ticket, type Zone } from '../../core/models';

export interface ChargeRequest {
  ticket: Ticket;
  /** Botón que originó la acción: el diálogo le devuelve el foco al cerrarse. */
  opener: HTMLElement;
}

/** Tabla de tickets (presentacional). */
@Component({
  selector: 'app-tickets-table',
  imports: [CopPipe, DateTimePipe, DurationPipe],
  templateUrl: './tickets-table.html',
  styleUrl: './tickets-table.css',
})
export class TicketsTable {
  readonly tickets = input.required<Ticket[]>();
  readonly zones = input<Zone[]>([]);
  readonly canCharge = input(false);
  readonly chargingId = input<number | null>(null);
  readonly charge = output<ChargeRequest>();

  protected readonly paymentLabels = PAYMENT_LABELS;
  protected readonly channelLabels: Record<Ticket['channel'], string> = { qr: 'QR app', manual: 'Manual', api: 'API' };
  protected readonly zoneNames = computed(() => new Map(this.zones().map((z) => [z.id, z.name])));

  /** Reloj para que el tiempo de los tickets abiertos avance sin recargar. */
  private readonly now = signal(new Date());

  constructor() {
    const timer = setInterval(() => this.now.set(new Date()), 30_000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  /** Minutos de la entrada a la salida (o a ahora si sigue abierto). */
  protected minutes(ticket: Ticket): number {
    return minutesSince(ticket.entryAt, ticket.exitAt ? new Date(ticket.exitAt) : this.now());
  }

  protected isClosed(ticket: Ticket): boolean {
    return ticket.status === 'closed';
  }
}
