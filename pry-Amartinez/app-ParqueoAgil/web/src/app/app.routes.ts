import { inject } from '@angular/core';
import { CanActivateFn, Router, Routes } from '@angular/router';
import { AuthService } from './core/auth.service';

/** Exige sesión; la primera vez carga perfil y permisos. */
const requireSession: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!auth.isLoggedIn()) return router.parseUrl('/login');
  if (auth.profile()) return true;
  return (await auth.loadIdentity()) ? true : router.parseUrl('/login');
};

/** Solo entra si el rol tiene permiso sobre `METHOD path` (matriz RBAC). */
const requirePermission =
  (method: string, path: string): CanActivateFn =>
  () =>
    inject(AuthService).can(method, path) || inject(Router).parseUrl('/');

export const routes: Routes = [
  { path: 'login', loadComponent: () => import('./features/login/login').then((m) => m.LoginPage) },
  {
    path: '',
    canActivate: [requireSession],
    loadComponent: () => import('./layout/shell').then((m) => m.Shell),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'tablero' },
      {
        path: 'tablero',
        title: 'Tablero · ParqueoÁgil',
        canActivate: [requirePermission('GET', '/api/reports/summary')],
        loadComponent: () => import('./features/dashboard/dashboard').then((m) => m.DashboardPage),
      },
      {
        path: 'porteria',
        title: 'Portería · ParqueoÁgil',
        canActivate: [requirePermission('POST', '/api/gate/scan')],
        loadComponent: () => import('./features/gate/gate').then((m) => m.GatePage),
      },
      {
        path: 'mapa',
        title: 'Mapa · ParqueoÁgil',
        canActivate: [requirePermission('GET', '/api/parking-spots')],
        loadComponent: () => import('./features/map/map').then((m) => m.MapPage),
      },
      {
        path: 'tickets',
        title: 'Tickets · ParqueoÁgil',
        canActivate: [requirePermission('GET', '/api/tickets')],
        loadComponent: () => import('./features/tickets/tickets').then((m) => m.TicketsPage),
      },
      {
        path: 'zonas',
        title: 'Zonas y tarifas · ParqueoÁgil',
        canActivate: [requirePermission('GET', '/api/parking-zones')],
        loadComponent: () => import('./features/zones/zones').then((m) => m.ZonesPage),
      },
      {
        path: 'conductores',
        title: 'Conductores · ParqueoÁgil',
        canActivate: [requirePermission('GET', '/api/drivers')],
        loadComponent: () => import('./features/drivers/drivers').then((m) => m.DriversPage),
      },
      {
        path: 'personal',
        title: 'Personal · ParqueoÁgil',
        canActivate: [requirePermission('GET', '/api/usuarios')],
        loadComponent: () => import('./features/staff/staff').then((m) => m.StaffPage),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
