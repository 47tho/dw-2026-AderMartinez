import { Component, ElementRef, Injector, afterNextRender, afterRenderEffect, inject, output, signal, viewChild } from '@angular/core';
import { CopPipe } from '../../core/format';
import { PAYMENT_LABELS, type GateExit, type Ticket } from '../../core/models';
import { PaymentPanel } from '../../shared/payment-panel';

/**
 * Diálogo modal para cobrar la salida de un vehículo: primero el panel de
 * cobro y, al pagar, un recibo corto. Usa el `<dialog>` nativo (Escape cierra,
 * el foco queda atrapado dentro y vuelve al botón que lo abrió).
 */
@Component({
  selector: 'app-charge-dialog',
  imports: [PaymentPanel, CopPipe],
  templateUrl: './charge-dialog.html',
  styleUrl: './charge-dialog.css',
})
export class ChargeDialog {
  private readonly injector = inject(Injector);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dlg');
  private readonly closeButton = viewChild<ElementRef<HTMLButtonElement>>('closeBtn');
  private opener: HTMLElement | null = null;

  /** Se emite al cerrarse el diálogo (pagado o no), para que la lista se actualice. */
  readonly closed = output<void>();

  protected readonly labels = PAYMENT_LABELS;
  protected readonly exit = signal<GateExit | null>(null);
  protected readonly receipt = signal<Ticket | null>(null);

  constructor() {
    // Al aparecer el recibo, el foco pasa a "Cerrar" (el botón de cobrar desapareció).
    afterRenderEffect(() => this.closeButton()?.nativeElement.focus());
  }

  open(exit: GateExit, opener: HTMLElement): void {
    this.opener = opener;
    this.receipt.set(null);
    this.exit.set(exit);
    // Se abre cuando el contenido ya está pintado para que el foco caiga dentro.
    afterNextRender(
      () => {
        const dialog = this.dialog().nativeElement;
        if (!dialog.open) dialog.showModal();
      },
      { injector: this.injector },
    );
  }

  close(): void {
    this.dialog().nativeElement.close();
  }

  /** Evento `close` del `<dialog>`: botón, Escape o cierre programático. */
  protected onClosed(): void {
    this.exit.set(null);
    this.receipt.set(null);
    if (this.opener?.isConnected) this.opener.focus();
    this.opener = null;
    this.closed.emit();
  }
}
