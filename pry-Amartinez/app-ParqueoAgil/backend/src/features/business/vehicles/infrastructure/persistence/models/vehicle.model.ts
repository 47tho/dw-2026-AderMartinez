import {
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  Model,
  Table,
} from 'sequelize-typescript';
import { ClientModel } from '../../../../clients/infrastructure/persistence/models/client.model.js';
import { VehicleTypeModel } from '../../../../vehicle-types/infrastructure/persistence/models/vehicle-type.model.js';

/**
 * Vehículo de un cliente. Un cliente (conductor) tiene uno o varios.
 *
 * Los vehículos de visitantes sin app (entrada manual en portería) quedan
 * a nombre del cliente "Visitante".
 *
 * `gateCounter` cuenta entradas + salidas: forma parte del QR para que el
 * código de salida nunca sea el mismo que se acaba de usar para entrar.
 */
@Table({ tableName: 'vehicles', timestamps: true })
export class VehicleModel extends Model {
  @Column({ type: DataType.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true })
  declare id: number;

  @ForeignKey(() => ClientModel)
  @Column({ type: DataType.INTEGER.UNSIGNED, allowNull: false })
  declare clientId: number;

  @BelongsTo(() => ClientModel)
  declare client?: ClientModel;

  @ForeignKey(() => VehicleTypeModel)
  @Column({ type: DataType.INTEGER.UNSIGNED, allowNull: false })
  declare vehicleTypeId: number;

  @BelongsTo(() => VehicleTypeModel)
  declare vehicleType?: VehicleTypeModel;

  @Column({ type: DataType.STRING(10), allowNull: false, unique: 'uq_vehicles_plate' })
  declare plate: string;

  @Column({ type: DataType.STRING(150), allowNull: true })
  declare description: string | null;

  @Column({ type: DataType.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 })
  declare gateCounter: number;

  @Column({ type: DataType.STRING(20), allowNull: false, defaultValue: 'active' })
  declare status: string;
}
