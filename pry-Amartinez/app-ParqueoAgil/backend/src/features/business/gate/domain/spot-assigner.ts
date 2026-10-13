export interface AssignableZone {
  id: number;
  code: string;
  floor: number;
  position: number;
  vehicleTypeId: number;
}

export interface AssignableSpot {
  id: number;
  code: string;
  zoneId: number;
  row: number;
  column: number;
  status: 'free' | 'occupied' | 'blocked';
}

export interface SpotAssignment {
  spot: AssignableSpot;
  /** Explicación corta que se le muestra al conductor. */
  reason: string;
}

interface Point {
  floor: number;
  y: number;
  x: number;
}

/**
 * Asigna automáticamente un espacio al entrar:
 *  1. El espacio preferido del conductor, si está libre.
 *  2. Si no, el libre más cercano dentro de sus zonas preferidas, en orden de
 *     prioridad (la zona del espacio preferido siempre va primero).
 *  3. Si todas están llenas, el libre más cercano en cualquier otra zona.
 *
 * "Cercano" se mide desde el espacio preferido o, si no eligió uno, desde la
 * entrada de su zona de mayor prioridad (o la principal). Solo cuentan las
 * zonas del tipo de vehículo. Devuelve `null` si no hay espacio libre.
 *
 * Misma regla que `lib/services/spot_assigner.dart` de la app.
 */
export class SpotAssigner {
  /** Cambiar de piso "cuesta" lo mismo que recorrer 30 espacios. */
  static readonly floorPenalty = 30;
  /** Separación (en filas) entre zonas consecutivas del mismo piso. */
  static readonly zoneGap = 10;

  constructor(private readonly zones: AssignableZone[]) {}

  assign(params: {
    spots: AssignableSpot[];
    preferredZoneIds: number[];
    preferredSpotId?: number | null;
    vehicleTypeId: number;
    isMotorcycle?: boolean;
  }): SpotAssignment | null {
    const allowed = new Set(this.zones.filter((z) => z.vehicleTypeId === params.vehicleTypeId).map((z) => z.id));
    const usable = params.spots.filter((s) => allowed.has(s.zoneId));
    const free = usable.filter((s) => s.status === 'free');
    if (free.length === 0) return null;

    const preferred = usable.find((s) => s.id === params.preferredSpotId) ?? null;
    if (preferred && preferred.status === 'free') {
      return { spot: preferred, reason: `Tu espacio preferido ${preferred.code} estaba libre.` };
    }

    const zoneOrder = [
      ...(preferred ? [preferred.zoneId] : []),
      ...params.preferredZoneIds.filter((z) => z !== preferred?.zoneId && allowed.has(z)),
    ];
    const reference = preferred
      ? this.positionOf(preferred)
      : this.entranceOf(zoneOrder[0] ?? null, params.vehicleTypeId);

    for (const zoneId of zoneOrder) {
      const candidates = free.filter((s) => s.zoneId === zoneId);
      if (candidates.length === 0) continue;
      return {
        spot: this.closest(candidates, reference),
        reason: this.reasonForPreferredZone(zoneId, zoneOrder[0], preferred),
      };
    }

    let reason: string;
    if (zoneOrder.length > 0) {
      reason = 'Tus zonas preferidas están llenas. Te asignamos el espacio libre más cercano.';
    } else if (params.isMotorcycle) {
      reason = 'Espacio libre más cercano en la zona de motos.';
    } else {
      reason = 'Espacio libre más cercano a la entrada.';
    }
    return { spot: this.closest(free, reference), reason };
  }

  private zoneLabel(zoneId: number): string {
    return `Zona ${this.zones.find((z) => z.id === zoneId)?.code ?? zoneId}`;
  }

  private reasonForPreferredZone(zoneId: number, firstZoneId: number, preferred: AssignableSpot | null): string {
    if (preferred && zoneId === preferred.zoneId) {
      return `Tu espacio ${preferred.code} estaba ocupado. Este es el libre más cercano en la ${this.zoneLabel(zoneId)}.`;
    }
    if (zoneId === firstZoneId) {
      return `Espacio libre más cercano a la entrada de tu zona preferida (${this.zoneLabel(zoneId)}).`;
    }
    return `La ${this.zoneLabel(firstZoneId)} estaba llena. Te asignamos tu siguiente zona preferida (${this.zoneLabel(zoneId)}).`;
  }

  private closest(candidates: AssignableSpot[], reference: Point): AssignableSpot {
    return candidates.reduce((a, b) =>
      this.distance(this.positionOf(a), reference) <= this.distance(this.positionOf(b), reference) ? a : b,
    );
  }

  private positionOf(spot: AssignableSpot): Point {
    const zone = this.zones.find((z) => z.id === spot.zoneId);
    if (!zone) return { floor: 0, y: spot.row, x: spot.column };
    return { floor: zone.floor, y: zone.position * SpotAssigner.zoneGap + spot.row, x: spot.column };
  }

  private entranceOf(zoneId: number | null, vehicleTypeId: number): Point {
    let zone = zoneId === null ? undefined : this.zones.find((z) => z.id === zoneId);
    if (!zone) {
      zone = this.zones
        .filter((z) => z.vehicleTypeId === vehicleTypeId)
        .sort((a, b) => (a.floor !== b.floor ? a.floor - b.floor : a.position - b.position))[0];
      if (!zone) return { floor: 1, y: 0, x: 0 };
    }
    return { floor: zone.floor, y: zone.position * SpotAssigner.zoneGap, x: 0 };
  }

  private distance(a: Point, b: Point): number {
    return Math.abs(a.floor - b.floor) * SpotAssigner.floorPenalty + Math.abs(a.y - b.y) + Math.abs(a.x - b.x);
  }
}
