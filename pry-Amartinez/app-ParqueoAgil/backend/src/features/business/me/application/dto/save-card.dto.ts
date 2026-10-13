import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/**
 * Datos de `PUT /api/me/card`. Llega el token de la pasarela, nunca el número
 * de la tarjeta ni el CVV.
 */
export class SaveCardDto {
  @ApiProperty({ example: 'tok_test_visa_4242_1', description: 'Token de la pasarela (modo de pruebas)' })
  @Transform(trim)
  @IsString({ message: 'token debe ser texto' })
  @MaxLength(120, { message: 'token es demasiado largo' })
  @Matches(/^tok_test_[a-z]+_\d{4}_\d+$/, { message: 'Token de tarjeta inválido' })
  token!: string;

  @ApiProperty({ example: 'visa', maxLength: 30 })
  @Transform(trim)
  @IsString({ message: 'brand debe ser texto' })
  @MinLength(1, { message: 'brand es requerida' })
  @MaxLength(30, { message: 'brand admite máximo 30 caracteres' })
  brand!: string;

  @ApiProperty({ example: '4242', description: 'Últimos 4 dígitos' })
  @Transform(trim)
  @Matches(/^\d{4}$/, { message: 'last4 debe tener 4 dígitos' })
  last4!: string;
}
