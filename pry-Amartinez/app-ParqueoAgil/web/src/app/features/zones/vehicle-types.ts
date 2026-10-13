import { Component, inject, input, output } from '@angular/core';
import { AuthService } from '../../core/auth.service';
import { CopPipe } from '../../core/format';
import type { VehicleType } from '../../core/models';
import { VehicleTypeForm } from './vehicle-type-form';

/** Tipos de vehículo con su tarifa base, y el formulario «Nuevo tipo» si hay permiso. */
@Component({
  selector: 'app-vehicle-types',
  imports: [CopPipe, VehicleTypeForm],
  template: `
    <section class="card" aria-labelledby="types-title">
      <header>
        <h2 id="types-title">Tipos de vehículo</h2>
        <span class="subtle num">{{ types().length }} en total</span>
      </header>

      @if (types().length === 0) {
        <p class="empty">Aún no hay tipos de vehículo. Cada zona necesita uno (carro, moto…).</p>
      } @else {
        <div class="table-wrap" role="region" aria-label="Tabla de tipos de vehículo" tabindex="0">
          <table class="table">
            <caption class="sr-only">Tipos de vehículo y su tarifa por hora</caption>
            <thead>
              <tr>
                <th scope="col">Nombre</th>
                <th scope="col" class="right">Tarifa por hora</th>
                <th scope="col">Descripción</th>
                <th scope="col">Estado</th>
              </tr>
            </thead>
            <tbody>
              @for (t of types(); track t.id) {
                <tr>
                  <td>{{ t.name }}</td>
                  <td class="right num">{{ t.hourlyRate | cop }}</td>
                  <td class="muted">{{ t.description || '—' }}</td>
                  <td>
                    <span class="badge" [class.ok]="t.status === 'active'">{{ t.status === 'active' ? 'Activo' : 'Inactivo' }}</span>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }

      @if (auth.can('POST', '/api/vehicle-types')) {
        <app-vehicle-type-form (created)="created.emit($event)" />
      }
    </section>
  `,
  styles: `
    :host { display: block; min-width: 0; }
    .table-wrap:focus-visible { outline-offset: -2px; }
  `,
})
export class VehicleTypesCard {
  protected readonly auth = inject(AuthService);

  readonly types = input.required<VehicleType[]>();
  readonly created = output<VehicleType>();
}
