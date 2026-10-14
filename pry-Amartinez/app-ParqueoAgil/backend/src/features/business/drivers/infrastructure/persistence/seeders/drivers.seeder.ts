import { Inject, Injectable, Logger } from '@nestjs/common';
import { Op } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { SEQUELIZE } from '../../../../../../infrastructure/database/sequelize/sequelize.module.js';
import { UserModel } from '../../../../../auth/users/infrastructure/persistence/models/user.model.js';
import { ParkingSpotModel } from '../../../../parking-spots/infrastructure/persistence/models/parking-spot.model.js';
import { ParkingZoneModel } from '../../../../parking-zones/infrastructure/persistence/models/parking-zone.model.js';
import { VehicleModel } from '../../../../vehicles/infrastructure/persistence/models/vehicle.model.js';
import { VehicleTypeModel } from '../../../../vehicle-types/infrastructure/persistence/models/vehicle-type.model.js';
import { DriversService } from '../../../application/drivers.service.js';
import { DriverModel } from '../models/driver.model.js';
import { demoSeedingEnabled } from '../../../../../../infrastructure/database/seeders/demo-flag.js';

/**
 * Conductor de demostración (mismos datos que el modo demo de la app):
 *   conductor@parqueoagil.local / Conductor123!
 * con tres vehículos y preferencias Zona A, Zona B y espacio A05.
 *
 * Idempotente: si ya existe no se toca (el usuario pudo cambiar sus datos
 * desde la app).
 */
@Injectable()
export class DriversSeeder {
  private readonly logger = new Logger(DriversSeeder.name);

  static readonly DEMO_EMAIL = 'conductor@parqueoagil.local';

  constructor(
    @Inject(SEQUELIZE) private readonly sequelize: Sequelize,
    private readonly drivers: DriversService,
  ) {}

  async seed(): Promise<void> {
    // Cuenta con contraseña conocida: solo para desarrollo y demostraciones.
    if (!demoSeedingEnabled()) return;
    const existing = await this.sequelize
      .getRepository(UserModel)
      .findOne({ where: { email: DriversSeeder.DEMO_EMAIL } });
    if (existing) {
      this.logger.log('Seeder drivers: ya existía el conductor demo (idempotente)');
      return;
    }

    const driver = await this.drivers.createAccount({
      name: 'Carlos Ruiz',
      email: DriversSeeder.DEMO_EMAIL,
      password: 'Conductor123!',
      phone: '3001234567',
      docType: 'CC',
      docNumber: '1023456789',
    });

    const types = await this.sequelize.getRepository(VehicleTypeModel).findAll();
    const typeId = (name: string) => types.find((t) => t.name === name)?.id;
    const demoVehicles = [
      { plate: 'ABC123', type: 'Automóvil', description: 'Mazda 3 gris' },
      { plate: 'XYZ789', type: 'Automóvil', description: 'Renault Logan blanco' },
      { plate: 'QWE12F', type: 'Motocicleta', description: 'Yamaha NMAX negra' },
    ];
    const vehicles = this.sequelize.getRepository(VehicleModel);
    for (const v of demoVehicles) {
      const vehicleTypeId = typeId(v.type);
      if (!vehicleTypeId || (await vehicles.findOne({ where: { plate: v.plate } }))) continue;
      await vehicles.create({ clientId: driver.clientId, vehicleTypeId, plate: v.plate, description: v.description });
    }

    const zones = await this.sequelize
      .getRepository(ParkingZoneModel)
      .findAll({ where: { code: { [Op.in]: ['A', 'B'] } } });
    const zoneA = zones.find((z) => z.code === 'A');
    const zoneB = zones.find((z) => z.code === 'B');
    const spotA05 = await this.sequelize.getRepository(ParkingSpotModel).findOne({ where: { code: 'A05' } });
    await this.sequelize.getRepository(DriverModel).update(
      {
        preferredZoneIds: [zoneA?.id, zoneB?.id].filter(Boolean).join(','),
        preferredSpotId: spotA05?.id ?? null,
      },
      { where: { id: driver.id } },
    );

    this.logger.log('Seeder drivers: conductor demo creado (conductor@parqueoagil.local)');
  }
}
