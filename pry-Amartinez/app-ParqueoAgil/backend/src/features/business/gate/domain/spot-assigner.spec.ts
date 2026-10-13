import { describe, expect, it } from 'vitest';
import { SpotAssigner, type AssignableSpot, type AssignableZone } from './spot-assigner.js';

type Status = AssignableSpot['status'];

const CAR = 1;
const MOTO = 2;
const SPOTS_PER_ZONE = 12;
const SPOTS_PER_ROW = 6;

const zoneA: AssignableZone = { id: 1, code: 'A', floor: 1, position: 0, vehicleTypeId: CAR };
const zoneB: AssignableZone = { id: 2, code: 'B', floor: 1, position: 1, vehicleTypeId: CAR };
const zoneD: AssignableZone = { id: 4, code: 'D', floor: 2, position: 0, vehicleTypeId: CAR };
const zoneM: AssignableZone = { id: 3, code: 'M', floor: 1, position: 3, vehicleTypeId: MOTO };
const zones = [zoneA, zoneB, zoneD, zoneM];

/** Código de un espacio: letra de la zona + número de 2 dígitos (A01 es el índice 0). */
function codeOf(zone: AssignableZone, index: number): string {
  return `${zone.code}${String(index + 1).padStart(2, '0')}`;
}

/** Id único por espacio: id de zona * 100 + índice. */
function idOf(zone: AssignableZone, index: number): number {
  return zone.id * 100 + index;
}

/** 12 espacios por zona, 6 por fila. `statusOf` decide el estado de cada uno. */
function buildSpots(statusOf: (zone: AssignableZone, index: number) => Status = () => 'free'): AssignableSpot[] {
  return zones.flatMap((zone) =>
    Array.from({ length: SPOTS_PER_ZONE }, (_, i) => ({
      id: idOf(zone, i),
      code: codeOf(zone, i),
      zoneId: zone.id,
      row: Math.floor(i / SPOTS_PER_ROW),
      column: i % SPOTS_PER_ROW,
      status: statusOf(zone, i),
    })),
  );
}

/** Estado: todo libre salvo lo que `overrides` indique. */
function spotsWith(overrides: (zone: AssignableZone, index: number) => Status | undefined): AssignableSpot[] {
  return buildSpots((zone, i) => overrides(zone, i) ?? 'free');
}

/** Zona entera con un estado; el resto libre. */
function zoneAll(target: AssignableZone, status: Status): AssignableSpot[] {
  return spotsWith((zone) => (zone.id === target.id ? status : undefined));
}

describe('SpotAssigner', () => {
  const assigner = new SpotAssigner(zones);

  it('el generador de datos de prueba arma 12 espacios por zona con filas de 6', () => {
    const spots = buildSpots();
    expect(spots).toHaveLength(zones.length * SPOTS_PER_ZONE);
    const b = spots.filter((s) => s.zoneId === zoneB.id);
    expect(b[0]).toMatchObject({ code: 'B01', row: 0, column: 0 });
    expect(b[5]).toMatchObject({ code: 'B06', row: 0, column: 5 });
    expect(b[6]).toMatchObject({ code: 'B07', row: 1, column: 0 });
    expect(b[11]).toMatchObject({ code: 'B12', row: 1, column: 5 });
  });

  describe('espacio preferido', () => {
    it('si el preferido está libre se asigna ese y la razón lo menciona', () => {
      const preferredId = idOf(zoneB, 4); // B05
      const result = assigner.assign({
        spots: buildSpots(),
        preferredZoneIds: [zoneA.id],
        preferredSpotId: preferredId,
        vehicleTypeId: CAR,
      });
      expect(result).not.toBeNull();
      expect(result!.spot.id).toBe(preferredId);
      expect(result!.spot.code).toBe('B05');
      expect(result!.reason).toContain('B05');
      expect(result!.reason).toContain('libre');
    });

    it('si el preferido está ocupado se asigna el libre más cercano de su misma zona', () => {
      // B01 (row 0, col 0) ocupado: vecinos B02 (col 1) y B07 (row 1) a distancia 1.
      const spots = spotsWith((zone, i) => (zone.id === zoneB.id && i === 0 ? 'occupied' : undefined));
      const result = assigner.assign({
        spots,
        preferredZoneIds: [zoneA.id],
        preferredSpotId: idOf(zoneB, 0),
        vehicleTypeId: CAR,
      });
      expect(result).not.toBeNull();
      expect(result!.spot.zoneId).toBe(zoneB.id);
      // Dos vecinos empatan a distancia 1; gana el primero de la lista (B02).
      expect(result!.spot.code).toBe('B02');
      expect(result!.reason).toContain('B01');
      expect(result!.reason).toContain('ocupado');
      expect(result!.reason).toContain('Zona B');
    });

    it('elige realmente el más cercano al preferido, no el primero libre', () => {
      // Preferido B12 (row 1, col 5) ocupado y B11 también: el más cercano libre es B06 (row 0, col 5).
      const spots = spotsWith((zone, i) => (zone.id === zoneB.id && (i === 11 || i === 10) ? 'occupied' : undefined));
      const result = assigner.assign({
        spots,
        preferredZoneIds: [],
        preferredSpotId: idOf(zoneB, 11),
        vehicleTypeId: CAR,
      });
      expect(result!.spot.code).toBe('B06');
    });

    it('con el preferido ocupado, otra zona preferida solo se usa si la del preferido está llena', () => {
      // B entera ocupada, el preferido está en B. A es la siguiente preferida.
      const spots = zoneAll(zoneB, 'occupied');
      const result = assigner.assign({
        spots,
        preferredZoneIds: [zoneA.id],
        preferredSpotId: idOf(zoneB, 0),
        vehicleTypeId: CAR,
      });
      expect(result!.spot.zoneId).toBe(zoneA.id);
      // El más cercano a B01 dentro de A es el de la última fila, columna 0 (A07).
      expect(result!.spot.code).toBe('A07');
      expect(result!.reason).toContain('Zona B');
      expect(result!.reason).toContain('Zona A');
    });

    it('un preferido bloqueado no se asigna', () => {
      const spots = spotsWith((zone, i) => (zone.id === zoneB.id && i === 0 ? 'blocked' : undefined));
      const result = assigner.assign({
        spots,
        preferredZoneIds: [zoneB.id],
        preferredSpotId: idOf(zoneB, 0),
        vehicleTypeId: CAR,
      });
      expect(result!.spot.code).not.toBe('B01');
      expect(result!.spot.status).toBe('free');
      expect(result!.spot.zoneId).toBe(zoneB.id);
    });

    it('un preferido de otro tipo de vehículo se ignora', () => {
      // Un conductor de carro con un espacio de motos como preferido: se ignora.
      const result = assigner.assign({
        spots: buildSpots(),
        preferredZoneIds: [zoneB.id],
        preferredSpotId: idOf(zoneM, 0),
        vehicleTypeId: CAR,
      });
      expect(result!.spot.zoneId).toBe(zoneB.id);
      expect(result!.spot.code).toBe('B01');
    });
  });

  describe('sin espacio preferido', () => {
    it('con zonas [B, A] asigna el más cercano a la entrada de B (row 0, column 0)', () => {
      const result = assigner.assign({
        spots: buildSpots(),
        preferredZoneIds: [zoneB.id, zoneA.id],
        vehicleTypeId: CAR,
      });
      expect(result).not.toBeNull();
      expect(result!.spot.zoneId).toBe(zoneB.id);
      expect(result!.spot).toMatchObject({ code: 'B01', row: 0, column: 0 });
      expect(result!.reason).toContain('Zona B');
      expect(result!.reason).toContain('zona preferida');
    });

    it('con preferredSpotId null o inexistente se comporta igual', () => {
      const base = assigner.assign({ spots: buildSpots(), preferredZoneIds: [zoneB.id], vehicleTypeId: CAR });
      const withNull = assigner.assign({
        spots: buildSpots(),
        preferredZoneIds: [zoneB.id],
        preferredSpotId: null,
        vehicleTypeId: CAR,
      });
      const withMissing = assigner.assign({
        spots: buildSpots(),
        preferredZoneIds: [zoneB.id],
        preferredSpotId: 99999,
        vehicleTypeId: CAR,
      });
      expect(withNull).toEqual(base);
      expect(withMissing).toEqual(base);
    });

    it('se salta los ocupados y toma el siguiente más cercano a la entrada', () => {
      // B01 y B02 ocupados: el más cercano a (row 0, col 0) es B07 (row 1, col 0) a distancia 1.
      const spots = spotsWith((zone, i) => (zone.id === zoneB.id && (i === 0 || i === 1) ? 'occupied' : undefined));
      const result = assigner.assign({ spots, preferredZoneIds: [zoneB.id], vehicleTypeId: CAR });
      expect(result!.spot.code).toBe('B07');
    });

    it('si B está llena va a A y la razón dice que B estaba llena', () => {
      const result = assigner.assign({
        spots: zoneAll(zoneB, 'occupied'),
        preferredZoneIds: [zoneB.id, zoneA.id],
        vehicleTypeId: CAR,
      });
      expect(result).not.toBeNull();
      expect(result!.spot.zoneId).toBe(zoneA.id);
      expect(result!.reason).toContain('Zona B');
      expect(result!.reason).toContain('llena');
      expect(result!.reason).toContain('Zona A');
    });

    it('sin zonas preferidas asigna el más cercano a la entrada principal', () => {
      const result = assigner.assign({ spots: buildSpots(), preferredZoneIds: [], vehicleTypeId: CAR });
      // La zona principal de carros es la de menor piso/posición: A.
      expect(result!.spot.code).toBe('A01');
      expect(result!.reason).toBe('Espacio libre más cercano a la entrada.');
    });
  });

  describe('todas las zonas preferidas llenas', () => {
    it('asigna otro espacio libre y avisa que las preferidas estaban llenas', () => {
      const spots = spotsWith((zone) => (zone.id === zoneA.id || zone.id === zoneB.id ? 'occupied' : undefined));
      const result = assigner.assign({ spots, preferredZoneIds: [zoneA.id, zoneB.id], vehicleTypeId: CAR });
      expect(result).not.toBeNull();
      expect(result!.spot.zoneId).toBe(zoneD.id);
      expect(result!.spot.code).toBe('D01');
      expect(result!.reason).toContain('preferidas están llenas');
    });

    it('prefiere el mismo piso antes que el piso 2', () => {
      // A llena. B solo tiene libre su último espacio (B12, piso 1, lejos de la entrada de A).
      // D (piso 2) está entera libre, con D01 justo en su entrada, pero cambiar de piso penaliza.
      const spots = spotsWith((zone, i) => {
        if (zone.id === zoneA.id) return 'occupied';
        if (zone.id === zoneB.id) return i === 11 ? 'free' : 'occupied';
        return undefined;
      });
      const result = assigner.assign({ spots, preferredZoneIds: [zoneA.id], vehicleTypeId: CAR });
      expect(result!.spot.code).toBe('B12');
      expect(result!.spot.zoneId).toBe(zoneB.id);
    });

    it('si el piso 1 no tiene nada libre va al piso 2', () => {
      const spots = spotsWith((zone) => (zone.floor === 1 ? 'occupied' : undefined));
      const result = assigner.assign({ spots, preferredZoneIds: [zoneA.id], vehicleTypeId: CAR });
      expect(result!.spot.zoneId).toBe(zoneD.id);
    });

    it('con preferido ocupado y su zona llena, el cercano se mide desde el preferido', () => {
      // Preferido A12 (piso 1, A llena). B07..B12 libres; D01 libre en piso 2.
      const spots = spotsWith((zone, i) => {
        if (zone.id === zoneA.id) return 'occupied';
        if (zone.id === zoneB.id) return i >= 6 ? 'free' : 'occupied';
        if (zone.id === zoneD.id) return i === 0 ? 'free' : 'occupied';
        return undefined;
      });
      const result = assigner.assign({
        spots,
        preferredZoneIds: [],
        preferredSpotId: idOf(zoneA, 11),
        vehicleTypeId: CAR,
      });
      // Desde A12 (y = 1, x = 5): B07 (y = 11, x = 0) queda a 10 + 5 = 15; B12 (y = 11, x = 5) a 10;
      // D01 está en el piso 2 (30 de penalización más 6).
      expect(result!.spot.code).toBe('B12');
    });
  });

  describe('motos', () => {
    it('las motos siempre van a la zona M aunque haya preferencias de carro', () => {
      const result = assigner.assign({
        spots: buildSpots(),
        preferredZoneIds: [zoneA.id, zoneB.id],
        vehicleTypeId: MOTO,
        isMotorcycle: true,
      });
      expect(result).not.toBeNull();
      expect(result!.spot.zoneId).toBe(zoneM.id);
      expect(result!.spot.code).toBe('M01');
      expect(result!.reason).toBe('Espacio libre más cercano en la zona de motos.');
    });

    it('un espacio preferido de carro se ignora para una moto', () => {
      const result = assigner.assign({
        spots: buildSpots(),
        preferredZoneIds: [zoneB.id],
        preferredSpotId: idOf(zoneB, 3),
        vehicleTypeId: MOTO,
        isMotorcycle: true,
      });
      expect(result!.spot.zoneId).toBe(zoneM.id);
    });

    it('una moto puede tener preferido dentro de la zona M', () => {
      const result = assigner.assign({
        spots: buildSpots(),
        preferredZoneIds: [zoneM.id],
        preferredSpotId: idOf(zoneM, 5),
        vehicleTypeId: MOTO,
        isMotorcycle: true,
      });
      expect(result!.spot.code).toBe('M06');
    });

    it('si M está llena no se manda la moto a una zona de carros', () => {
      const result = assigner.assign({
        spots: zoneAll(zoneM, 'occupied'),
        preferredZoneIds: [zoneA.id],
        vehicleTypeId: MOTO,
        isMotorcycle: true,
      });
      expect(result).toBeNull();
    });

    it('los carros nunca van a la zona de motos', () => {
      const spots = spotsWith((zone) => (zone.vehicleTypeId === CAR ? 'occupied' : undefined));
      const result = assigner.assign({ spots, preferredZoneIds: [zoneM.id], vehicleTypeId: CAR });
      expect(result).toBeNull();
    });
  });

  describe('sin espacio disponible', () => {
    it('devuelve null si no hay ninguno libre', () => {
      const spots = buildSpots(() => 'occupied');
      expect(assigner.assign({ spots, preferredZoneIds: [zoneA.id], vehicleTypeId: CAR })).toBeNull();
    });

    it('devuelve null con una lista vacía de espacios', () => {
      expect(assigner.assign({ spots: [], preferredZoneIds: [], vehicleTypeId: CAR })).toBeNull();
    });

    it('devuelve null si el tipo de vehículo no tiene zonas', () => {
      expect(assigner.assign({ spots: buildSpots(), preferredZoneIds: [], vehicleTypeId: 99 })).toBeNull();
    });
  });

  describe('espacios bloqueados', () => {
    it('nunca se asignan: si todo está bloqueado u ocupado devuelve null', () => {
      const spots = buildSpots((_zone, i) => (i % 2 === 0 ? 'blocked' : 'occupied'));
      expect(assigner.assign({ spots, preferredZoneIds: [zoneB.id], vehicleTypeId: CAR })).toBeNull();
    });

    it('se saltan aunque sean los más cercanos a la entrada', () => {
      // B01 y B02 bloqueados, B03 ocupado: lo más cercano libre es B07 (row 1, col 0).
      const spots = spotsWith((zone, i) => {
        if (zone.id !== zoneB.id) return undefined;
        if (i === 0 || i === 1) return 'blocked';
        if (i === 2) return 'occupied';
        return undefined;
      });
      const result = assigner.assign({ spots, preferredZoneIds: [zoneB.id], vehicleTypeId: CAR });
      expect(result!.spot.code).toBe('B07');
    });

    it('con una zona entera bloqueada se usa la siguiente', () => {
      const result = assigner.assign({
        spots: zoneAll(zoneB, 'blocked'),
        preferredZoneIds: [zoneB.id, zoneA.id],
        vehicleTypeId: CAR,
      });
      expect(result!.spot.zoneId).toBe(zoneA.id);
      expect(result!.reason).toContain('llena');
    });

    it('el único libre se asigna aunque esté rodeado de bloqueados', () => {
      const spots = buildSpots((zone, i) => (zone.id === zoneD.id && i === 7 ? 'free' : 'blocked'));
      const result = assigner.assign({ spots, preferredZoneIds: [zoneA.id], vehicleTypeId: CAR });
      expect(result!.spot.code).toBe('D08');
    });
  });
});
