import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

/**
 * Datos de entrada de `POST /api/sesion/logout`.
 *
 * Se envía el refresh token que se quiere revocar (la sesión concreta). Es
 * idempotente: repetirlo no devuelve error.
 */
export class LogoutSessionDto {
  @ApiProperty({ example: '9f2c...' })
  @IsString()
  @IsNotEmpty({ message: 'refresh_token es requerido' })
  refresh_token!: string;
}
