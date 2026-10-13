import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

/**
 * Datos de entrada de `POST /api/sesion/login` (modalidad OPEN).
 *
 * `identifier` acepta **usuario o correo**: la consulta de credenciales busca
 * por cualquiera de los dos, normalizando a minúsculas.
 */
export class LoginDto {
  @ApiProperty({ example: 'admin', description: 'username o email' })
  @IsString()
  @IsNotEmpty({ message: 'identifier es requerido' })
  identifier!: string;

  @ApiProperty({ example: 'Admin123!', minLength: 8 })
  @IsString()
  @IsNotEmpty({ message: 'password es requerido' })
  password!: string;
}
