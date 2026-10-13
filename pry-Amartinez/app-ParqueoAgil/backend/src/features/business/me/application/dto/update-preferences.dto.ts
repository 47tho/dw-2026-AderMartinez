import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayUnique, IsArray, IsIn, IsInt, Min, ValidateIf } from 'class-validator';
import type { PaymentMethodCode } from '../../../drivers/infrastructure/persistence/models/driver.model.js';

export const PAYMENT_METHODS = ['cash', 'card', 'qr', 'auto'] as const;

/** Datos de `PUT /api/me/preferences` (reemplazo completo de las preferencias). */
export class UpdatePreferencesDto {
  @ApiProperty({ type: [Number], example: [1, 2], maxItems: 3, description: 'Zonas preferidas, en orden de prioridad' })
  @IsArray({ message: 'preferredZoneIds debe ser una lista' })
  @ArrayMaxSize(3, { message: 'Puedes elegir máximo 3 zonas preferidas' })
  @ArrayUnique({ message: 'No repitas zonas en las preferidas' })
  @IsInt({ each: true, message: 'Cada zona preferida debe ser un id entero' })
  @Min(1, { each: true, message: 'Cada zona preferida debe ser un id válido' })
  preferredZoneIds!: number[];

  @ApiProperty({ type: Number, nullable: true, example: null, description: 'Espacio preferido o null' })
  @ValidateIf((o: UpdatePreferencesDto) => o.preferredSpotId !== null)
  @IsInt({ message: 'preferredSpotId debe ser un entero o null' })
  @Min(1, { message: 'preferredSpotId debe ser un id válido' })
  preferredSpotId!: number | null;

  @ApiProperty({ enum: PAYMENT_METHODS })
  @IsIn(PAYMENT_METHODS, { message: 'paymentMethod debe ser cash, card, qr o auto' })
  paymentMethod!: PaymentMethodCode;
}
