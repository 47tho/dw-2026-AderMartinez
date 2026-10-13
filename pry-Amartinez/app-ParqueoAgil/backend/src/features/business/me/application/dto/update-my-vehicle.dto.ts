import { PartialType } from '@nestjs/swagger';
import { CreateMyVehicleDto } from './create-my-vehicle.dto.js';

/** Datos de `PATCH /api/me/vehicles/:id`: los mismos campos, todos opcionales. */
export class UpdateMyVehicleDto extends PartialType(CreateMyVehicleDto) {}
