import { Component, afterRenderEffect, computed, inject } from '@angular/core';
import { AuthService } from '../../core/auth.service';
import { MapStore } from './map.store';
import { SpotPanel } from './spot-panel';
import { ZoneGrid } from './zone-grid';

/** Plano en vivo de los espacios, por piso y por zona. */
@Component({
  selector: 'app-map',
  imports: [ZoneGrid, SpotPanel],
  providers: [MapStore],
  templateUrl: './map.html',
  styleUrl: './map.css',
})
export class MapPage {
  protected readonly store = inject(MapStore);
  private readonly auth = inject(AuthService);

  protected readonly canManage = computed(() => this.auth.can('PATCH', '/api/parking-spots/:id'));
  protected readonly skeletons = [1, 2, 3, 4];

  constructor() {
    // Al buscar una placa, lleva el espacio encontrado a la vista (ya en el piso correcto).
    afterRenderEffect(() => {
      const id = this.store.firstMatchId();
      this.store.activeFloor();
      if (id !== null) document.getElementById(`spot-${id}`)?.scrollIntoView({ block: 'nearest' });
    });
  }

  protected onSearch(event: Event): void {
    this.store.search((event.target as HTMLInputElement).value);
  }
}
