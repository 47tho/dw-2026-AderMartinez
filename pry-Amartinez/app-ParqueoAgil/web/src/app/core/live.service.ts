import { Injectable, OnDestroy, inject, signal } from '@angular/core';
import { Observable, Subject, filter } from 'rxjs';
import { AuthService } from './auth.service';
import { API_URL } from './config';
import type { LiveEvent } from './models';

export type LiveStatus = 'connecting' | 'live' | 'offline';

/**
 * Eventos en tiempo real del backend (`GET /api/events`, SSE).
 *
 * Se lee con `fetch` y no con `EventSource` porque EventSource no permite
 * enviar el header `Authorization`. Si la conexión se cae, reintenta con
 * espera creciente (1 s, 2 s, 4 s… hasta 15 s) y renueva el token si hace falta.
 */
@Injectable({ providedIn: 'root' })
export class LiveService implements OnDestroy {
  private readonly auth = inject(AuthService);
  private readonly events$ = new Subject<LiveEvent>();
  private controller: AbortController | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private attempts = 0;

  readonly status = signal<LiveStatus>('offline');
  /** Hora del último evento recibido (para "actualizado hace…"). */
  readonly lastEventAt = signal<Date | null>(null);

  /** Eventos de uno o varios tipos. */
  on<T extends LiveEvent['type']>(...types: T[]): Observable<Extract<LiveEvent, { type: T }>> {
    return this.events$.pipe(filter((e): e is Extract<LiveEvent, { type: T }> => types.includes(e.type as T)));
  }

  start(): void {
    if (this.controller) return;
    void this.connect();
  }

  stop(): void {
    this.controller?.abort();
    this.controller = null;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.status.set('offline');
  }

  ngOnDestroy(): void {
    this.stop();
  }

  private async connect(): Promise<void> {
    const controller = new AbortController();
    this.controller = controller;
    this.status.set('connecting');
    try {
      const token = await this.auth.accessToken();
      if (!token) {
        this.stop();
        return;
      }
      const res = await fetch(`${API_URL}/events`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' },
        signal: controller.signal,
        cache: 'no-store',
      });
      if (res.status === 401) await this.auth.refresh();
      if (!res.ok || !res.body) throw new Error(`SSE ${res.status}`);

      this.status.set('live');
      this.attempts = 0;
      await this.read(res.body);
      throw new Error('El servidor cerró el flujo');
    } catch {
      if (controller.signal.aborted || this.controller !== controller) return;
      this.status.set('offline');
      this.controller = null;
      const delay = Math.min(15_000, 1000 * 2 ** this.attempts++);
      this.retryTimer = setTimeout(() => {
        this.retryTimer = null;
        this.start();
      }, delay);
    }
  }

  /** Parser mínimo de text/event-stream: bloques separados por línea en blanco. */
  private async read(body: ReadableStream<Uint8Array>): Promise<void> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return;
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
      let boundary = buffer.indexOf('\n\n');
      while (boundary !== -1) {
        this.dispatch(buffer.slice(0, boundary));
        buffer = buffer.slice(boundary + 2);
        boundary = buffer.indexOf('\n\n');
      }
    }
  }

  private dispatch(block: string): void {
    let type = 'message';
    const data: string[] = [];
    for (const line of block.split('\n')) {
      if (line.startsWith('event:')) type = line.slice(6).trim();
      else if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
    }
    if (type === 'ping' || data.length === 0) return;
    try {
      this.events$.next({ type, data: JSON.parse(data.join('\n')) } as LiveEvent);
      this.lastEventAt.set(new Date());
    } catch {
      /* evento mal formado: se ignora */
    }
  }
}
