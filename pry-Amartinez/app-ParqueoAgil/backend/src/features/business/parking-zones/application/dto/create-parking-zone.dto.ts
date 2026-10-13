import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateParkingZoneDto {
  @ApiProperty({ example: 'Zona A - Piso 1' })
  @IsString()
  @IsNotEmpty({ message: 'name es requerido' })
  @MaxLength(150)
  name!: string;

  @ApiProperty({ example: 1, description: 'ID del tipo de vehículo' })
  @IsInt({ message: 'vehicleTypeId debe ser entero' })
  @Min(1, { message: 'vehicleTypeId es requerido' })
  vehicleTypeId!: number;

  @ApiProperty({ example: 20, description: 'Cupos totales de la zona' })
  @IsInt({ message: 'capacity debe ser entero' })
  @Min(1, { message: 'capacity debe ser mayor que 0' })
  capacity!: number;

  @ApiPropertyOptional({ example: 20, description: 'Cupos disponibles (default = capacity)' })
  @IsOptional()
  @IsInt({ message: 'availableSpots debe ser entero' })
  @Min(0, { message: 'availableSpots no puede ser negativo' })
  availableSpots?: number;

  @ApiProperty({ example: 3000, description: 'Tarifa por hora en COP' })
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'hourlyRate debe ser un número' })
  @IsPositive({ message: 'hourlyRate debe ser mayor que 0' })
  hourlyRate!: number;

  @ApiPropertyOptional({ example: 'A', description: 'Letra de la zona; prefijo de los espacios (A01, A02...)' })
  @IsOptional()
  @Matches(/^[A-Z][A-Z0-9]{0,3}$/, { message: 'code: de 1 a 4 letras o números en mayúscula, empezando por letra' })
  code?: string;

  @ApiPropertyOptional({ example: 1, description: 'Piso' })
  @IsOptional()
  @IsInt({ message: 'floor debe ser entero' })
  @Min(1)
  @Max(20)
  floor?: number;

  @ApiPropertyOptional({ example: 0, description: 'Orden dentro del piso (0 = la más cercana a la entrada)' })
  @IsOptional()
  @IsInt({ message: 'position debe ser entero' })
  @Min(0)
  @Max(50)
  position?: number;

  @ApiPropertyOptional({ example: '#3B82F6' })
  @IsOptional()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'color debe tener el formato #RRGGBB' })
  color?: string;
}
