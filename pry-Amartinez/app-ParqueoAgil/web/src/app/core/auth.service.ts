import { HttpBackend, HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { API_URL } from './config';
import type { Permission, Profile, SessionTokens } from './models';

interface Envelope<T> {
  data: T;
}

const STORAGE_KEY = 'pqa.session';

/** Coincidencia de rutas igual a la del backend (`resource-match.ts`). */
function pathMatches(pattern: string, path: string): boolean {
  const a = pattern.split('/').filter(Boolean);
  const b = path.split('/').filter(Boolean);
  return a.length === b.length && a.every((part, i) => part.startsWith(':') || part === b[i]);
}

/**
 * Sesión del personal. Guarda el par de tokens en `sessionStorage` (dura lo
 * que dure la pestaña) y renueva el access token con el refresh token antes
 * de que venza o cuando el backend responde 401.
 *
 * Las peticiones de autenticación usan un HttpClient sin interceptores para
 * no entrar en bucle con el interceptor que agrega el token.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = new HttpClient(inject(HttpBackend));
  private readonly router = inject(Router);

  private accessExpiresAt = 0; // antes de `tokens`: restore() lo actualiza
  private readonly tokens = signal<SessionTokens | null>(this.restore());
  private refreshing: Promise<string | null> | null = null;

  readonly profile = signal<Profile | null>(null);
  readonly permissions = signal<Permission[]>([]);
  readonly isLoggedIn = computed(() => this.tokens() !== null);

  /** `true` si la matriz RBAC concede `METHOD /api/...`. */
  can(method: string, path: string): boolean {
    return this.permissions().some((p) => p.method === method && pathMatches(p.path, path));
  }

  async login(identifier: string, password: string): Promise<void> {
    const res = await firstValueFrom(
      this.http.post<Envelope<SessionTokens>>(`${API_URL}/sesion/login`, { identifier, password }),
    );
    this.store(res.data);
    await this.loadIdentity();
  }

  async logout(): Promise<void> {
    const refresh = this.tokens()?.refresh_token;
    this.clear();
    if (refresh) {
      await firstValueFrom(this.http.post(`${API_URL}/sesion/logout`, { refresh_token: refresh })).catch(() => null);
    }
    await this.router.navigate(['/login']);
  }

  /** Carga perfil y permisos; si la sesión ya no sirve, la cierra. */
  async loadIdentity(): Promise<boolean> {
    const token = await this.accessToken();
    if (!token) return false;
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const [profile, permissions] = await Promise.all([
        firstValueFrom(this.http.get<Envelope<{ user: Profile }>>(`${API_URL}/sesion/perfil`, { headers })),
        firstValueFrom(this.http.get<Envelope<{ permissions: Permission[] }>>(`${API_URL}/permisos`, { headers })),
      ]);
      this.profile.set(profile.data.user);
      this.permissions.set(permissions.data.permissions);
      return true;
    } catch {
      this.clear();
      return false;
    }
  }

  /** Access token vigente; lo renueva si vence en menos de 30 s. */
  async accessToken(): Promise<string | null> {
    const current = this.tokens();
    if (!current) return null;
    if (Date.now() < this.accessExpiresAt - 30_000) return current.access_token;
    return this.refresh();
  }

  /** Renueva una sola vez aunque varias peticiones fallen a la vez. */
  refresh(): Promise<string | null> {
    this.refreshing ??= this.doRefresh().finally(() => (this.refreshing = null));
    return this.refreshing;
  }

  private async doRefresh(): Promise<string | null> {
    const refresh = this.tokens()?.refresh_token;
    if (!refresh) return null;
    try {
      const res = await firstValueFrom(
        this.http.post<Envelope<SessionTokens>>(`${API_URL}/sesion/refresh`, { refresh_token: refresh }),
      );
      this.store(res.data);
      return res.data.access_token;
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 0) return null; // sin conexión: se reintenta luego
      this.clear();
      await this.router.navigate(['/login']);
      return null;
    }
  }

  private store(tokens: SessionTokens): void {
    this.tokens.set(tokens);
    this.accessExpiresAt = Date.now() + tokens.expires_in * 1000;
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ ...tokens, savedAt: Date.now() }));
    } catch {
      /* sin almacenamiento: la sesión vive solo en memoria */
    }
  }

  private restore(): SessionTokens | null {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const saved = JSON.parse(raw) as SessionTokens & { savedAt: number };
      this.accessExpiresAt = saved.savedAt + saved.expires_in * 1000;
      return saved;
    } catch {
      return null;
    }
  }

  private clear(): void {
    this.tokens.set(null);
    this.profile.set(null);
    this.permissions.set([]);
    this.accessExpiresAt = 0;
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      /* nada que limpiar */
    }
  }
}
