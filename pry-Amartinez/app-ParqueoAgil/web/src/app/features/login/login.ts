import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-login',
  imports: [FormsModule],
  template: `
    <main class="wrap">
      <section class="card panel" aria-labelledby="login-title">
        <div class="brand">
          <span class="logo" aria-hidden="true">P</span>
          <div>
            <h1 id="login-title">ParqueoÁgil</h1>
            <p class="muted">Panel del parqueadero: administración y portería</p>
          </div>
        </div>

        <form (ngSubmit)="submit()" class="form">
          <div class="field">
            <label for="identifier">Usuario o correo</label>
            <input id="identifier" name="identifier" class="input" autocomplete="username" required
                   [(ngModel)]="identifier" [disabled]="busy()" />
          </div>
          <div class="field">
            <label for="password">Contraseña</label>
            <input id="password" name="password" type="password" class="input" autocomplete="current-password"
                   required [(ngModel)]="password" [disabled]="busy()" />
          </div>
          @if (error()) {
            <p class="alert error" role="alert">{{ error() }}</p>
          }
          <button type="submit" class="btn primary" [disabled]="busy() || !identifier || !password">
            {{ busy() ? 'Ingresando…' : 'Ingresar' }}
          </button>
        </form>

        <details class="demo">
          <summary>Usuarios de prueba</summary>
          <p class="subtle">Administrador: <code>admin</code> / <code>Admin123!</code></p>
          <p class="subtle">Operador de portería: <code>seller</code> / <code>Seller123!</code></p>
        </details>
      </section>
    </main>
  `,
  styles: `
    .wrap { min-height: 100vh; display: grid; place-items: center; padding: var(--space-4); }
    .panel { width: min(400px, 100%); padding: var(--space-6) var(--space-5); display: flex; flex-direction: column; gap: var(--space-5); }
    .brand { display: flex; gap: var(--space-3); align-items: center; }
    .logo { display: grid; place-items: center; width: 44px; height: 44px; border-radius: var(--radius-sm); background: var(--accent); color: #fff; font-weight: 800; font-size: 1.3rem; }
    .form { display: flex; flex-direction: column; gap: var(--space-4); }
    .demo summary { cursor: pointer; color: var(--text-2); font-size: 0.85rem; }
    .demo p { margin-top: var(--space-2); }
    code { font-family: var(--mono); color: var(--text); }
  `,
})
export class LoginPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected identifier = '';
  protected password = '';
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  async submit(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.auth.login(this.identifier.trim(), this.password);
      // Un conductor (o una cuenta sin permisos de operación) no usa el panel: su lugar es la app.
      if (!this.auth.can('POST', '/api/gate/scan') && !this.auth.can('GET', '/api/reports/summary')) {
        await this.auth.logout();
        this.error.set('Esta cuenta es de conductor: usa la app móvil de ParqueoÁgil.');
        return;
      }
      await this.router.navigate([this.auth.can('GET', '/api/reports/summary') ? '/tablero' : '/porteria']);
    } catch (error) {
      const status = error instanceof HttpErrorResponse ? error.status : -1;
      this.error.set(
        status === 0
          ? 'No hay conexión con el servidor. ¿Está encendido el backend en el puerto 3003?'
          : status === 401
            ? 'Usuario o contraseña incorrectos.'
            : 'No se pudo iniciar sesión. Intenta de nuevo.',
      );
    } finally {
      this.busy.set(false);
    }
  }
}
