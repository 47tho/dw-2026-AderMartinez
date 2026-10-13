import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

/**
 * Datos de entrada de `POST /api/sesion/refresh` (modalidad OPEN con credencial
 * de sesión).
 *
 * El refresh token viaja en el **cuerpo**, no en la cabecera `Authorization`:
 * es una credencial de sesión, no un token de acceso.
 */
export class RefreshSessionDto {
  @ApiProperty({ example: '9f2c...' })
  @IsString()
  @IsNotEmpty({ message: 'refresh_token es requerido' })
  refresh_token!: string;
}
