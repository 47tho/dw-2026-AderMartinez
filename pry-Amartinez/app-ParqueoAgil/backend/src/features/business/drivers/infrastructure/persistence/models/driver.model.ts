import {
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  Model,
  Table,
} from 'sequelize-typescript';
import { UserModel } from '../../../../../auth/users/infrastructure/persistence/models/user.model.js';
import { ClientModel } from '../../../../clients/infrastructure/persistence/models/client.model.js';

export type PaymentMethodCode = 'cash' | 'card' | 'qr' | 'auto';

/**
 * Perfil de conductor (app móvil). Une la identidad (`users`, para iniciar
 * sesión) con el cliente del parqueadero (`clients`) y guarda lo que solo
 * tiene sentido para quien usa la app: documento, clave del QR,
 * preferencias de asignación y método de pago.
 *
 * Seguridad:
 *  - `qrSecret` firma los QR de acceso. Solo se entrega a su dueño.
 *  - De la tarjeta se guarda el token de la pasarela, la marca y los
 *    últimos 4 dígitos. Nunca el número completo ni el CVV.
 */
@Table({ tableName: 'drivers', timestamps: true })
export class DriverModel extends Model {
  @Column({ type: DataType.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true })
  declare id: number;

  @ForeignKey(() => UserModel)
  @Column({ type: DataType.INTEGER.UNSIGNED, allowNull: false, unique: 'uq_drivers_user' })
  declare userId: number;

  @BelongsTo(() => UserModel)
  declare user?: UserModel;

  @ForeignKey(() => ClientModel)
  @Column({ type: DataType.INTEGER.UNSIGNED, allowNull: false, unique: 'uq_drivers_client' })
  declare clientId: number;

  @BelongsTo(() => ClientModel)
  declare client?: ClientModel;

  @Column({ type: DataType.STRING(5), allowNull: false, defaultValue: 'CC' })
  declare docType: string;

  @Column({ type: DataType.STRING(20), allowNull: false, unique: 'uq_drivers_doc' })
  declare docNumber: string;

  @Column({ type: DataType.STRING(100), allowNull: false })
  declare qrSecret: string;

  /** Ids de zona en orden de prioridad, separados por coma (máx. 3). */
  @Column({ type: DataType.STRING(60), allowNull: false, defaultValue: '' })
  declare preferredZoneIds: string;

  @Column({ type: DataType.INTEGER.UNSIGNED, allowNull: true })
  declare preferredSpotId: number | null;

  @Column({ type: DataType.STRING(10), allowNull: false, defaultValue: 'cash' })
  declare paymentMethod: PaymentMethodCode;

  @Column({ type: DataType.STRING(120), allowNull: true })
  declare cardToken: string | null;

  @Column({ type: DataType.STRING(30), allowNull: true })
  declare cardBrand: string | null;

  @Column({ type: DataType.STRING(4), allowNull: true })
  declare cardLast4: string | null;
}
