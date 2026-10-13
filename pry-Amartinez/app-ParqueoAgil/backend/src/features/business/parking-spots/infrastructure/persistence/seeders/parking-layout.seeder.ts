import { Inject, Injectable, Logger } from '@nestjs/common';
import { Sequelize } from 'sequelize-typescript';
import { SEQUELIZE } from '../../../../../../infrastructure/database/sequelize/sequelize.module.js';
import { ParkingZoneModel } from '../../../../parking-zones/infrastructure/persistence/models/parking-zone.model.js';
import { VehicleTypeModel } from '../../../../vehicle-types/infrastructure/persistence/models/vehicle-type.model.js';
import { ParkingSpotsService } from '../../../application/parking-spots.service.js';

/** Plano de demostración: el mismo de la app (zonas A–F en dos pisos y M para motos). */
const LAYOUT = [
  { code: 'A', name: 'Zona A - Piso 1', type: 'Automóvil', floor: 1, position: 0, capacity: 20, color: '#3B82F6' },
  { code: 'B', name: 'Zona B - Piso 1', type: 'Automóvil', floor: 1, position: 1, capacity: 24, color: '#9333EA' },
  { code: 'C', name: 'Zona C - Piso 1', type: 'Automóvil', floor: 1, position: 2, capacity: 24, color: '#EA580C' },
  { code: 'M', name: 'Zona M - Motos', type: 'Motocicleta', floor: 1, position: 3, capacity: 30, color: '#64748B' },
  { code: 'D', name: 'Zona D - Piso 2', type: 'Automóvil', floor: 2, position: 0, capacity: 24, color: '#16A34A' },
  { code: 'E', name: 'Zona E - Piso 2', type: 'Automóvil', floor: 2, position: 1, capacity: 24, color: '#DB2777' },
  { code: 'F', name: 'Zona F - Camionetas', type: 'Camioneta', floor: 2, position: 2, capacity: 12, color: '#0D9488' },
] as const;

/**
 * Completa el plano del parqueadero:
 *  1. Le pone letra, piso y color a la "Zona A - Piso 1" del seeder original.
 *  2. Crea las demás zonas del plano si no existen (por letra).
 *  3. Genera los espacios individuales de todas las zonas hasta su capacidad.
 *
 * Idempotente: no duplica zonas ni espacios, ni cambia lo que el
 * administrador haya editado.
 */
@Injectable()
export class ParkingLayoutSeeder {
  private readonly logger = new Logger(ParkingLayoutSeeder.name);

  constructor(
    @Inject(SEQUELIZE) private readonly sequelize: Sequelize,
    private readonly spots: ParkingSpotsService,
  ) {}

  async seed(): Promise<void> {
    const zones = this.sequelize.getRepository(ParkingZoneModel);
    const types = await this.sequelize.getRepository(VehicleTypeModel).findAll();

    let createdZones = 0;
    for (const item of LAYOUT) {
      if (await zones.findOne({ where: { code: item.code } })) continue;

      const legacy = await zones.findOne({ where: { name: item.name, code: null } });
      if (legacy) {
        await legacy.update({ code: item.code, floor: item.floor, position: item.position, color: item.color });
        continue;
      }

      const type = types.find((t) => t.name === item.type && t.status === 'active');
      if (!type) continue;
      await zones.create({
        name: item.name,
        vehicleTypeId: type.id,
        capacity: item.capacity,
        availableSpots: item.capacity,
        hourlyRate: Number(type.hourlyRate),
        status: 'active',
        code: item.code,
        floor: item.floor,
        position: item.position,
        color: item.color,
      });
      createdZones++;
    }

    let createdSpots = 0;
    for (const zone of await zones.findAll()) {
      createdSpots += await this.spots.ensureSpotsForZone(zone.id);
    }
    this.logger.log(`Seeder parking-layout: ${createdZones} zonas y ${createdSpots} espacios creados (idempotente)`);
  }
}
