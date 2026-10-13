import { Inject, Injectable } from '@nestjs/common';
import { Sequelize } from 'sequelize-typescript';
import { SEQUELIZE } from '../../../../../../infrastructure/database/sequelize/sequelize.module.js';
import { ParkingZone } from '../../../domain/entities/parking-zone.entity.js';
import type { ParkingZoneStatus } from '../../../domain/entities/parking-zone.entity.js';
import { IParkingZoneRepository } from '../../../domain/interfaces/parking-zone.repository.js';
import { ParkingZoneModel } from '../models/parking-zone.model.js';

@Injectable()
export class ParkingZoneRepository implements IParkingZoneRepository {
  constructor(@Inject(SEQUELIZE) private readonly sequelize: Sequelize) {}

  private get repo() {
    return this.sequelize.getRepository(ParkingZoneModel);
  }

  async create(z: ParkingZone): Promise<ParkingZone> {
    const created = await this.repo.create({
      name: z.name,
      vehicleTypeId: z.vehicleTypeId,
      capacity: z.capacity,
      availableSpots: z.availableSpots,
      hourlyRate: z.hourlyRate,
      status: z.status,
      code: z.code,
      floor: z.floor,
      position: z.position,
      color: z.color,
    });
    return this.toDomain(created);
  }

  async findAll(page: number, limit: number) {
    const { rows, count } = await this.repo.findAndCountAll({
      offset: (page - 1) * limit,
      limit,
      order: [['id', 'ASC']],
    });
    return { items: rows.map((r) => this.toDomain(r)), total: count };
  }

  async findById(id: number): Promise<ParkingZone | null> {
    const found = await this.repo.findByPk(id);
    return found ? this.toDomain(found) : null;
  }

  async findByCode(code: string): Promise<ParkingZone | null> {
    const found = await this.repo.findOne({ where: { code } });
    return found ? this.toDomain(found) : null;
  }

  async count(): Promise<number> {
    return this.repo.count();
  }

  private toDomain(m: ParkingZoneModel): ParkingZone {
    return new ParkingZone({
      id: m.id,
      name: m.name,
      vehicleTypeId: m.vehicleTypeId,
      capacity: m.capacity,
      availableSpots: m.availableSpots,
      hourlyRate: Number(m.hourlyRate),
      status: (m.status as ParkingZoneStatus) ?? 'active',
      code: m.code ?? null,
      floor: m.floor ?? 1,
      position: m.position ?? 0,
      color: m.color ?? null,
    });
  }
}
