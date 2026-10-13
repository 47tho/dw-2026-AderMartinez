import { Component, ElementRef, OnDestroy, input, output, signal, viewChild } from '@angular/core';
import jsQR from 'jsqr';

/**
 * Lector de QR con la cámara del computador (o una webcam USB en la caseta).
 * Decodifica con jsQR unas 7 veces por segundo; ignora el mismo texto durante
 * 4 s para no enviar dos veces el código que sigue frente a la cámara.
 */
@Component({
  selector: 'app-qr-scanner',
  template: `
    <div class="frame" [class.active]="running()" [class.flash]="flash()">
      <video #video playsinline muted aria-label="Vista de la cámara"></video>
      @if (!running()) {
        <div class="idle">
          <p>{{ message() }}</p>
          <button type="button" class="btn primary" (click)="start()">Activar cámara</button>
        </div>
      } @else if (paused()) {
        <div class="idle dim"><p>Lectura en pausa mientras se atiende este vehículo</p></div>
      } @else {
        <span class="target" aria-hidden="true"></span>
      }
    </div>
    @if (running()) {
      <div class="bar">
        <span class="subtle" role="status">{{ paused() ? 'En pausa' : 'Buscando un QR de ParqueoÁgil…' }}</span>
        <button type="button" class="btn sm ghost" (click)="stop()">Apagar cámara</button>
      </div>
    }
    <canvas #canvas hidden></canvas>
  `,
  styles: `
    .frame { position: relative; aspect-ratio: 4 / 3; background: #000; border-radius: var(--radius); overflow: hidden; border: 2px solid var(--border); }
    .frame.active { border-color: var(--accent); }
    .frame.flash { border-color: var(--ok); }
    video { width: 100%; height: 100%; object-fit: cover; display: block; }
    .idle { position: absolute; inset: 0; display: flex; flex-direction: column; gap: var(--space-3); align-items: center; justify-content: center; padding: var(--space-4); text-align: center; background: var(--surface-2); color: var(--text-2); }
    .idle.dim { background: rgb(11 15 30 / 0.75); }
    .target { position: absolute; inset: 18% 24%; border: 3px solid rgb(255 255 255 / 0.85); border-radius: 12px; box-shadow: 0 0 0 999px rgb(0 0 0 / 0.25); }
    .bar { display: flex; justify-content: space-between; align-items: center; margin-top: var(--space-2); }
  `,
})
export class QrScanner implements OnDestroy {
  /** Mientras es `true` no se decodifica (p. ej. durante un cobro). */
  readonly paused = input(false);
  readonly scanned = output<string>();

  private readonly video = viewChild.required<ElementRef<HTMLVideoElement>>('video');
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');

  protected readonly running = signal(false);
  protected readonly flash = signal(false);
  protected readonly message = signal('La cámara está apagada.');

  private stream: MediaStream | null = null;
  private frame = 0;
  private lastDecode = 0;
  private lastText = '';
  private lastTextAt = 0;

  async start(): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia) {
      this.message.set('Este navegador no permite usar la cámara. Usa "Pegar código" o la entrada por placa.');
      return;
    }
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 } },
        audio: false,
      });
      const video = this.video().nativeElement;
      video.srcObject = this.stream;
      await video.play();
      this.running.set(true);
      this.frame = requestAnimationFrame(() => this.tick());
    } catch (error) {
      const name = error instanceof DOMException ? error.name : '';
      this.message.set(
        name === 'NotAllowedError'
          ? 'Permiso de cámara denegado. Habilítalo en el candado de la barra de direcciones y vuelve a intentar.'
          : name === 'NotFoundError'
            ? 'No se encontró ninguna cámara en este equipo.'
            : 'No se pudo abrir la cámara. ¿La está usando otra aplicación?',
      );
      this.stop();
    }
  }

  stop(): void {
    cancelAnimationFrame(this.frame);
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.running.set(false);
  }

  ngOnDestroy(): void {
    this.stop();
  }

  private tick(): void {
    if (!this.running()) return;
    this.frame = requestAnimationFrame(() => this.tick());
    const now = performance.now();
    if (this.paused() || now - this.lastDecode < 140) return;
    this.lastDecode = now;

    const video = this.video().nativeElement;
    if (video.readyState < video.HAVE_ENOUGH_DATA || video.videoWidth === 0) return;
    const scale = Math.min(1, 640 / video.videoWidth);
    const width = Math.round(video.videoWidth * scale);
    const height = Math.round(video.videoHeight * scale);
    const canvas = this.canvas().nativeElement;
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return;
    context.drawImage(video, 0, 0, width, height);
    const code = jsQR(context.getImageData(0, 0, width, height).data, width, height, {
      inversionAttempts: 'dontInvert',
    });
    if (!code?.data) return;
    if (code.data === this.lastText && now - this.lastTextAt < 4000) return;
    this.lastText = code.data;
    this.lastTextAt = now;
    this.flash.set(true);
    setTimeout(() => this.flash.set(false), 400);
    this.scanned.emit(code.data);
  }
}
