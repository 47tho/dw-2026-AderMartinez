import {
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  Model,
  Table,
} from 'sequelize-typescript';
import { VehicleTypeModel } from '../../../../vehicle-types/infrastructure/persistence/models/vehicle-type.model.js';

@Table({ tableName: 'parking_zones', timestamps: true })
export class ParkingZoneModel extends Model {
  @Column({ type: DataType.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true })
  declare id: number;

  @Column({ type: DataType.STRING(150), allowNull: false })
  declare name: string;

  @ForeignKey(() => VehicleTypeModel)
  @Column({ type: DataType.INTEGER.UNSIGNED, allowNull: false })
  declare vehicleTypeId: number;

  @BelongsTo(() => VehicleTypeModel)
  vehicleType?: VehicleTypeModel;

  @Column({ type: DataType.INTEGER.UNSIGNED, allowNull: false })
  declare capacity: number;

  @Column({ type: DataType.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 })
  declare availableSpots: number;

  @Column({ type: DataType.DECIMAL(10, 2), allowNull: false })
  declare hourlyRate: number;

  @Column({ type: DataType.STRING(20), allowNull: false, defaultValue: 'active' })
  declare status: string;

  // ── Integración app + panel web ──────────────────────────────
  // Columnas opcionales: en una base ya creada las agrega el SchemaUpgrader.

  /** Letra corta de la zona ('A', 'M'...). Prefijo de los códigos de espacio. */
  @Column({ type: DataType.STRING(10), allowNull: true })
  declare code: string | null;

  @Column({ type: DataType.INTEGER.UNSIGNED, allowNull: false, defaultValue: 1 })
  declare floor: number;

  /** Orden dentro del piso (0 = la más cercana a la entrada). */
  @Column({ type: DataType.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 })
  declare position: number;

  @Column({ type: DataType.STRING(9), allowNull: true })
  declare color: string | null;
}
