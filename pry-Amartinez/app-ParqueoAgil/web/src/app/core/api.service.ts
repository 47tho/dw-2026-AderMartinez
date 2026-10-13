import { HttpClient, HttpErrorResponse, HttpInterceptorFn, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { catchError, from, firstValueFrom, switchMap, throwError } from 'rxjs';
import { AuthService } from './auth.service';
import { API_URL } from './config';
import type {
  DriverRow,
  GateEntry,
  GateExit,
  GateResult,
  Page,
  PaymentMethodCode,
  Role,
  Spot,
  StaffUser,
  Summary,
  Ticket,
  VehicleType,
  Zone,
} from './models';

/** Error de la API con el mensaje del backend, listo para mostrar. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Agrega `Authorization` y, ante un 401, renueva el token y reintenta una vez. */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith(API_URL)) return next(req);
  const auth = inject(AuthService);
  const withToken = (token: string | null) =>
    token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;

  return from(auth.accessToken()).pipe(
    switchMap((token) => next(withToken(token))),
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse && error.status === 401) {
        return from(auth.refresh()).pipe(
          switchMap((token) => (token ? next(withToken(token)) : throwError(() => error))),
        );
      }
      return throwError(() => error);
    }),
  );
};

function toApiError(error: unknown): ApiError {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 0) {
      return new ApiError(0, 'No hay conexión con el servidor. ¿Está encendido el backend en el puerto 3003?');
    }
    const message = (error.error as { message?: string } | null)?.message;
    return new ApiError(error.status, message ?? `Error ${error.status}`);
  }
  return new ApiError(-1, error instanceof Error ? error.message : 'Error inesperado');
}

function params(query: Record<string, string | number | undefined | null>): HttpParams {
  let p = new HttpParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') p = p.set(key, String(value));
  }
  return p;
}

/**
 * Cliente tipado de la API. Desenvuelve `{ data }` y convierte los errores
 * en `ApiError` con el mensaje del backend (ya viene en español).
 */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);

  private async call<T>(request: ReturnType<HttpClient['get']>): Promise<T> {
    try {
      const res = (await firstValueFrom(request)) as { data: T };
      return res.data;
    } catch (error) {
      throw toApiError(error);
    }
  }

  get<T>(path: string, query: Record<string, string | number | undefined | null> = {}): Promise<T> {
    return this.call<T>(this.http.get(`${API_URL}${path}`, { params: params(query) }));
  }

  post<T>(path: string, body: unknown = {}): Promise<T> {
    return this.call<T>(this.http.post(`${API_URL}${path}`, body));
  }

  patch<T>(path: string, body: unknown = {}): Promise<T> {
    return this.call<T>(this.http.patch(`${API_URL}${path}`, body));
  }

  // ── Operación ─────────────────────────────────────────────
  summary() {
    return this.get<Summary>('/reports/summary');
  }
  zones() {
    return this.get<Page<Zone>>('/parking-zones', { page: 1, limit: 100 }).then((p) => p.items);
  }
  vehicleTypes() {
    return this.get<Page<VehicleType>>('/vehicle-types', { page: 1, limit: 100 }).then((p) => p.items);
  }
  spots(zoneId?: number) {
    return this.get<Spot[]>('/parking-spots', { zoneId });
  }
  setSpotStatus(id: number, status: 'free' | 'blocked') {
    return this.patch<Spot>(`/parking-spots/${id}`, { status });
  }
  tickets(query: { status?: 'open' | 'closed'; zoneId?: number; plate?: string; page?: number; limit?: number }) {
    return this.get<Page<Ticket>>('/tickets', query);
  }

  // ── Portería ──────────────────────────────────────────────
  scan(code: string) {
    return this.post<GateResult>('/gate/scan', { code });
  }
  manualEntry(plate: string, vehicleTypeId: number) {
    return this.post<GateEntry>('/gate/manual-entry', { plate, vehicleTypeId });
  }
  manualExit(plate: string) {
    return this.post<GateExit>('/gate/manual-exit', { plate });
  }
  pay(ticketId: number, method: PaymentMethodCode, cashReceived?: number) {
    return this.post<Ticket>(`/tickets/${ticketId}/pay`, { method, cashReceived });
  }

  // ── Administración ────────────────────────────────────────
  createZone(body: {
    name: string;
    code?: string;
    vehicleTypeId: number;
    capacity: number;
    hourlyRate: number;
    floor?: number;
    position?: number;
    color?: string;
  }) {
    return this.post<Zone>('/parking-zones', body);
  }
  createVehicleType(body: { name: string; hourlyRate: number; description?: string }) {
    return this.post<VehicleType>('/vehicle-types', body);
  }
  drivers(page = 1, limit = 10) {
    return this.get<Page<DriverRow>>('/drivers', { page, limit });
  }
  staff() {
    return this.get<StaffUser[] | Page<StaffUser>>('/usuarios');
  }
  roles() {
    return this.get<Role[] | Page<Role>>('/roles');
  }
}
