import { Component, OnDestroy, OnInit, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { LiveService } from '../core/live.service';

interface NavItem {
  path: string;
  label: string;
  icon: string;
  method: string;
  api: string;
}

const NAV: NavItem[] = [
  { path: '/tablero', label: 'Tablero', icon: 'M3 13h8V3H3zm10 8h8V11h-8zM3 21h8v-6H3zm10-18v6h8V3z', method: 'GET', api: '/api/reports/summary' },
  { path: '/porteria', label: 'Portería', icon: 'M3 3h7v7H3zm11 0h7v7h-7zM3 14h7v7H3zm14 0h4v2h-4zm-3 3h3v4h-3zm5 2h2v2h-2z', method: 'POST', api: '/api/gate/scan' },
  { path: '/mapa', label: 'Mapa', icon: 'M3 4h18v16H3zm2 2v12h4V6zm6 0v12h2V6zm4 0v12h4V6z', method: 'GET', api: '/api/parking-spots' },
  { path: '/tickets', label: 'Tickets', icon: 'M4 5h16v4a3 3 0 0 0 0 6v4H4v-4a3 3 0 0 0 0-6zm5 2v10h2V7z', method: 'GET', api: '/api/tickets' },
  { path: '/zonas', label: 'Zonas y tarifas', icon: 'M12 2 3 7v10l9 5 9-5V7zm0 2.3L18.7 8 12 11.7 5.3 8zM5 9.7l6 3.3v6.7l-6-3.3zm8 10V13l6-3.3v6.7z', method: 'GET', api: '/api/parking-zones' },
  { path: '/conductores', label: 'Conductores', icon: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-8 8c0-3.3 3.6-6 8-6s8 2.7 8 6v1H4z', method: 'GET', api: '/api/drivers' },
  { path: '/personal', label: 'Personal', icon: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zm7 0a3 3 0 1 0 0-6M2 20c0-3 3.1-5 7-5s7 2 7 5v1H2zm15-5c2.9.3 5 2 5 4.5V21h-4', method: 'GET', api: '/api/usuarios' },
];

/** Estructura del panel: navegación lateral, estado de la conexión en vivo y contenido. */
@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './shell.html',
  styleUrl: './shell.css',
})
export class Shell implements OnInit, OnDestroy {
  protected readonly auth = inject(AuthService);
  protected readonly live = inject(LiveService);

  protected readonly nav = computed(() => {
    this.auth.permissions(); // dependencia: se recalcula al cargar permisos
    return NAV.filter((item) => this.auth.can(item.method, item.api));
  });

  protected readonly statusLabel = computed(() => {
    switch (this.live.status()) {
      case 'live':
        return 'En vivo';
      case 'connecting':
        return 'Conectando…';
      default:
        return 'Sin conexión en vivo';
    }
  });

  ngOnInit(): void {
    this.live.start();
  }

  ngOnDestroy(): void {
    this.live.stop();
  }

  logout(): void {
    this.live.stop();
    void this.auth.logout();
  }
}
