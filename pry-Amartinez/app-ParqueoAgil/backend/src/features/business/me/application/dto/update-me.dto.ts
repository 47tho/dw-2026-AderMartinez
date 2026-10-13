import { PartialType, PickType } from '@nestjs/swagger';
import { RegisterDriverDto } from '../../../drivers/application/dto/register-driver.dto.js';

/**
 * Datos de `PATCH /api/me`. Reutiliza las validaciones del registro (nombre,
 * celular y documento) y hace todos los campos opcionales.
 */
export class UpdateMeDto extends PartialType(
  PickType(RegisterDriverDto, ['name', 'phone', 'docType', 'docNumber'] as const),
) {}
