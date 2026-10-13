import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** Datos de `POST /api/me/vehicles`. */
export class CreateMyVehicleDto {
  @ApiProperty({ example: 'ABC123', description: 'Placa (se normaliza a mayúsculas y sin espacios)' })
  @IsString({ message: 'plate debe ser texto' })
  @MaxLength(15, { message: 'plate es demasiado larga' })
  plate!: string;

  @ApiProperty({ example: 1, description: 'ID del tipo de vehículo (activo)' })
  @IsInt({ message: 'vehicleTypeId debe ser entero' })
  @Min(1, { message: 'vehicleTypeId es requerido' })
  vehicleTypeId!: number;

  @ApiPropertyOptional({ example: 'Mazda 3 rojo', maxLength: 150 })
  @IsOptional()
  @Transform(trim)
  @IsString({ message: 'description debe ser texto' })
  @MaxLength(150, { message: 'La descripción admite máximo 150 caracteres' })
  description?: string | null;
}
