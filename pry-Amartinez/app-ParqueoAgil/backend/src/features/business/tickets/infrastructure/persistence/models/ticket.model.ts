import {
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  Model,
  Table,
} from 'sequelize-typescript';
import { ClientModel } from '../../../../clients/infrastructure/persistence/models/client.model.js';
import { ParkingZoneModel } from '../../../../parking-zones/infrastructure/persistence/models/parking-zone.model.js';
import { ParkingSpotModel } from '../../../../parking-spots/infrastructure/persistence/models/parking-spot.model.js';
import { VehicleModel } from '../../../../vehicles/infrastructure/persistence/models/vehicle.model.js';

@Table({ tableName: 'tickets', timestamps: true })
export class TicketModel extends Model {
  @Column({ type: DataType.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true })
  declare id: number;

  @ForeignKey(() => ClientModel)
  @Column({ type: DataType.INTEGER.UNSIGNED, allowNull: false })
  declare clientId: number;

  @BelongsTo(() => ClientModel)
  client?: ClientModel;

  @ForeignKey(() => ParkingZoneModel)
  @Column({ type: DataType.INTEGER.UNSIGNED, allowNull: false })
  declare parkingZoneId: number;

  @BelongsTo(() => ParkingZoneModel)
  parkingZone?: ParkingZoneModel;

  @Column({ type: DataType.DATE, allowNull: false, defaultValue: DataType.NOW })
  declare entryAt: Date;

  @Column({ type: DataType.DATE, allowNull: true })
  declare exitAt: Date | null;

  @Column({ type: DataType.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 })
  declare hours: number;

  @Column({ type: DataType.DECIMAL(10, 2), allowNull: false })
  declare hourlyRate: number;

  @Column({ type: DataType.DECIMAL(12, 2), allowNull: false, defaultValue: 0 })
  declare subtotal: number;

  @Column({ type: DataType.DECIMAL(12, 2), allowNull: false, defaultValue: 0 })
  declare tax: number;

  @Column({ type: DataType.DECIMAL(12, 2), allowNull: false, defaultValue: 0 })
  declare discounts: number;

  @Column({ type: DataType.DECIMAL(12, 2), allowNull: false, defaultValue: 0 })
  declare total: number;

  @Column({ type: DataType.STRING(20), allowNull: false, defaultValue: 'open' })
  declare status: string;

  // ── Integración app + portería ───────────────────────────────
  // Columnas opcionales: en una base ya creada las agrega el SchemaUpgrader.
  // Las relaciones van sin restricción de llave foránea para que una base
  // actualizada y una creada desde cero queden iguales.

  @Column({ type: DataType.INTEGER.UNSIGNED, allowNull: true })
  declare vehicleId: number | null;

  @BelongsTo(() => VehicleModel, { foreignKey: 'vehicleId', constraints: false })
  vehicle?: VehicleModel;

  @Column({ type: DataType.INTEGER.UNSIGNED, allowNull: true })
  declare parkingSpotId: number | null;

  @BelongsTo(() => ParkingSpotModel, { foreignKey: 'parkingSpotId', constraints: false })
  parkingSpot?: ParkingSpotModel;

  /** Cómo se abrió: QR de la app, entrada manual en portería o API directa. */
  @Column({ type: DataType.STRING(10), allowNull: false, defaultValue: 'api' })
  declare channel: string;

  @Column({ type: DataType.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 })
  declare fractions: number;

  @Column({ type: DataType.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 })
  declare minutesPerFraction: number;

  @Column({ type: DataType.DECIMAL(10, 2), allowNull: false, defaultValue: 0 })
  declare pricePerFraction: number;

  /** Momento en que la portería leyó el QR de salida: el valor queda fijo. */
  @Column({ type: DataType.DATE, allowNull: true })
  declare quotedAt: Date | null;

  @Column({ type: DataType.STRING(10), allowNull: true })
  declare paymentMethod: string | null;

  @Column({ type: DataType.DECIMAL(12, 2), allowNull: true })
  declare amountReceived: number | null;

  @Column({ type: DataType.DECIMAL(12, 2), allowNull: true })
  declare changeGiven: number | null;

  @Column({ type: DataType.STRING(40), allowNull: true })
  declare paymentRef: string | null;

  @Column({ type: DataType.STRING(40), allowNull: true })
  declare authorization: string | null;

  @Column({ type: DataType.STRING(40), allowNull: true })
  declare cardLabel: string | null;
}
