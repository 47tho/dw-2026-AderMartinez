import {
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  Model,
  Table,
} from 'sequelize-typescript';
import { ParkingZoneModel } from '../../../../parking-zones/infrastructure/persistence/models/parking-zone.model.js';

export type SpotStatus = 'free' | 'occupied' | 'blocked';

/**
 * Espacio individual de una zona (A01, A02...). `rowIndex`/`colIndex` son
 * su posición dentro de la zona: el asignador automático los usa para
 * calcular la cercanía.
 */
@Table({ tableName: 'parking_spots', timestamps: true })
export class ParkingSpotModel extends Model {
  @Column({ type: DataType.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true })
  declare id: number;

  @ForeignKey(() => ParkingZoneModel)
  @Column({ type: DataType.INTEGER.UNSIGNED, allowNull: false })
  declare parkingZoneId: number;

  @BelongsTo(() => ParkingZoneModel)
  declare parkingZone?: ParkingZoneModel;

  @Column({ type: DataType.STRING(10), allowNull: false, unique: 'uq_parking_spots_code' })
  declare code: string;

  @Column({ type: DataType.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 })
  declare rowIndex: number;

  @Column({ type: DataType.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 })
  declare colIndex: number;

  @Column({ type: DataType.STRING(20), allowNull: false, defaultValue: 'free' })
  declare status: SpotStatus;
}
