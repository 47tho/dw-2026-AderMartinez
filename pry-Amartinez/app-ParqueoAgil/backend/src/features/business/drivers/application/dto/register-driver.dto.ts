import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsIn, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export const DOC_TYPES = ['CC', 'CE', 'PA', 'TI'] as const;

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** Datos de `POST /api/drivers/register` (registro desde la app móvil). */
export class RegisterDriverDto {
  @ApiProperty({ example: 'Carlos Ruiz' })
  @Transform(trim)
  @IsString()
  @MinLength(3, { message: 'Escribe tu nombre completo' })
  @MaxLength(150)
  name!: string;

  @ApiProperty({ example: 'carlos@correo.com' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail({}, { message: 'Correo inválido' })
  @MaxLength(150)
  email!: string;

  @ApiProperty({ example: 'Conductor123!', minLength: 8 })
  @IsString()
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres' })
  @MaxLength(100)
  password!: string;

  @ApiProperty({ example: '3001234567' })
  @Transform(trim)
  @Matches(/^3\d{9}$/, { message: 'Celular de 10 dígitos que empieza por 3' })
  phone!: string;

  @ApiProperty({ example: 'CC', enum: DOC_TYPES })
  @IsIn(DOC_TYPES, { message: 'Tipo de documento: CC, CE, PA o TI' })
  docType!: (typeof DOC_TYPES)[number];

  @ApiProperty({ example: '1023456789' })
  @Transform(trim)
  @Matches(/^[0-9A-Za-z]{6,12}$/, { message: 'Documento de 6 a 12 caracteres, sin puntos ni espacios' })
  docNumber!: string;
}
