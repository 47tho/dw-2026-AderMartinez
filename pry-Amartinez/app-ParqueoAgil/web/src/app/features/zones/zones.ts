import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { CopPipe } from '../../core/format';
import { LiveService } from '../../core/live.service';
import type { VehicleType, Zone } from '../../core/models';
import { messageOf } from '../form-utils';
import { VehicleTypesCard } from './vehicle-types';
import { ZoneForm } from './zone-form';

/** Zonas del parqueadero, sus tarifas y los tipos de vehículo. El cupo se actualiza en vivo. */
@Component({
  selector: 'app-zones',
  imports: [CopPipe, ZoneForm, VehicleTypesCard],
  templateUrl: './zones.html',
  styleUrl: './zones.css',
})
export class ZonesPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly live = inject(LiveService);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly auth = inject(AuthService);

  protected readonly zones = signal<Zone[]>([]);
  protected readonly types = signal<VehicleType[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);

  protected readonly sortedZones = computed(() =>
    [...this.zones()].sort((a, b) => a.floor - b.floor || a.position - b.position || a.name.localeCompare(b.name, 'es')),
  );
  private readonly typeNames = computed(() => new Map(this.types().map((t) => [t.id, t.name])));

  ngOnInit(): void {
    void this.load();

    // Cada entrada o salida cambia los cupos; una zona desconocida se trae de nuevo.
    this.live
      .on('zone.updated')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ data }) => {
        if (this.loading()) return;
        if (!this.zones().some((z) => z.id === data.id)) {
          void this.refreshZones();
          return;
        }
        this.zones.update((list) =>
          list.map((z) => (z.id === data.id ? { ...z, availableSpots: data.availableSpots, capacity: data.capacity } : z)),
        );
      });
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const [zones, types] = await Promise.all([this.api.zones(), this.api.vehicleTypes()]);
      this.zones.set(zones);
      this.types.set(types);
    } catch (error) {
      this.error.set(messageOf(error, 'No se pudieron cargar las zonas.'));
    } finally {
      this.loading.set(false);
    }
  }

  protected typeName(id: number): string {
    return this.typeNames().get(id) ?? `Tipo ${id}`;
  }

  /** Precio de una fracción de 15 min, aproximado. */
  protected fraction(hourlyRate: number): number {
    return Math.round((hourlyRate * 15) / 60);
  }

  protected onZoneCreated(zone: Zone): void {
    this.zones.update((list) => (list.some((z) => z.id === zone.id) ? list : [...list, zone]));
  }

  protected onTypeCreated(type: VehicleType): void {
    this.types.update((list) => (list.some((t) => t.id === type.id) ? list : [...list, type]));
  }

  private async refreshZones(): Promise<void> {
    try {
      this.zones.set(await this.api.zones());
    } catch {
      /* el próximo evento o "Actualizar" lo reintenta */
    }
  }
}
