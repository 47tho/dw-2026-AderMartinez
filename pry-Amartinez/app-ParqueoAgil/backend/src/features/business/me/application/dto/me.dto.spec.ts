import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateMyVehicleDto } from './create-my-vehicle.dto.js';
import { MyTicketsQueryDto } from './my-tickets-query.dto.js';
import { SaveCardDto } from './save-card.dto.js';
import { UpdateMeDto } from './update-me.dto.js';
import { UpdateMyVehicleDto } from './update-my-vehicle.dto.js';
import { UpdatePreferencesDto } from './update-preferences.dto.js';

/** Mismas opciones que el ValidationPipe global (main.ts). */
async function check<T extends object>(cls: new () => T, plain: unknown) {
  const instance = plainToInstance(cls, plain);
  const errors = await validate(instance, { whitelist: true, forbidNonWhitelisted: true });
  return { instance, errors, fields: errors.map((e) => e.property) };
}

describe('DTOs de /api/me', () => {
  describe('UpdateMeDto', () => {
    it('acepta un cuerpo vacío y recorta los textos', async () => {
      expect((await check(UpdateMeDto, {})).errors).toHaveLength(0);
      const { instance, errors } = await check(UpdateMeDto, { name: '  Ana Pérez  ', docType: 'CE' });
      expect(errors).toHaveLength(0);
      expect(instance.name).toBe('Ana Pérez');
    });

    it('reutiliza las validaciones del registro', async () => {
      const { fields } = await check(UpdateMeDto, { name: 'Al', phone: '12345', docType: 'XX', docNumber: 'a b' });
      expect(fields.sort()).toEqual(['docNumber', 'docType', 'name', 'phone']);
    });

    it('rechaza campos que no son suyos', async () => {
      expect((await check(UpdateMeDto, { email: 'a@b.co' })).fields).toEqual(['email']);
    });
  });

  describe('CreateMyVehicleDto / UpdateMyVehicleDto', () => {
    it('exige placa y tipo al crear', async () => {
      expect((await check(CreateMyVehicleDto, {})).fields.sort()).toEqual(['plate', 'vehicleTypeId']);
      expect((await check(CreateMyVehicleDto, { plate: 'abc 123', vehicleTypeId: 1 })).errors).toHaveLength(0);
    });

    it('limita la descripción a 150 caracteres', async () => {
      const ok = await check(CreateMyVehicleDto, { plate: 'ABC123', vehicleTypeId: 1, description: 'x'.repeat(150) });
      const long = await check(CreateMyVehicleDto, { plate: 'ABC123', vehicleTypeId: 1, description: 'x'.repeat(151) });
      expect(ok.errors).toHaveLength(0);
      expect(long.fields).toEqual(['description']);
    });

    it('al modificar todos los campos son opcionales', async () => {
      expect((await check(UpdateMyVehicleDto, {})).errors).toHaveLength(0);
      expect((await check(UpdateMyVehicleDto, { description: null })).errors).toHaveLength(0);
      expect((await check(UpdateMyVehicleDto, { vehicleTypeId: 0 })).fields).toEqual(['vehicleTypeId']);
    });
  });

  describe('UpdatePreferencesDto', () => {
    const base = { preferredZoneIds: [1, 2], preferredSpotId: 5, paymentMethod: 'qr' };

    it('acepta preferencias válidas y un espacio null', async () => {
      expect((await check(UpdatePreferencesDto, base)).errors).toHaveLength(0);
      expect((await check(UpdatePreferencesDto, { ...base, preferredZoneIds: [], preferredSpotId: null })).errors).toHaveLength(0);
    });

    it('rechaza más de 3 zonas, repetidas o no enteras', async () => {
      expect((await check(UpdatePreferencesDto, { ...base, preferredZoneIds: [1, 2, 3, 4] })).fields).toEqual(['preferredZoneIds']);
      expect((await check(UpdatePreferencesDto, { ...base, preferredZoneIds: [1, 1] })).fields).toEqual(['preferredZoneIds']);
      expect((await check(UpdatePreferencesDto, { ...base, preferredZoneIds: ['a'] })).fields).toEqual(['preferredZoneIds']);
      expect((await check(UpdatePreferencesDto, { ...base, preferredZoneIds: 3 })).fields).toEqual(['preferredZoneIds']);
    });

    it('exige preferredSpotId (número o null) y un método de pago conocido', async () => {
      const { preferredSpotId: _omit, ...withoutSpot } = base;
      expect((await check(UpdatePreferencesDto, withoutSpot)).fields).toEqual(['preferredSpotId']);
      expect((await check(UpdatePreferencesDto, { ...base, preferredSpotId: 'x' })).fields).toEqual(['preferredSpotId']);
      expect((await check(UpdatePreferencesDto, { ...base, paymentMethod: 'bitcoin' })).fields).toEqual(['paymentMethod']);
    });
  });

  describe('SaveCardDto', () => {
    const base = { token: 'tok_test_visa_4242_17', brand: 'visa', last4: '4242' };

    it('acepta el token de pruebas de la pasarela', async () => {
      expect((await check(SaveCardDto, base)).errors).toHaveLength(0);
    });

    it('rechaza tokens, marcas y últimos 4 inválidos', async () => {
      expect((await check(SaveCardDto, { ...base, token: '4242424242424242' })).fields).toEqual(['token']);
      expect((await check(SaveCardDto, { ...base, token: `tok_test_visa_4242_${'1'.repeat(120)}` })).fields).toEqual(['token']);
      expect((await check(SaveCardDto, { ...base, brand: 'x'.repeat(31) })).fields).toEqual(['brand']);
      expect((await check(SaveCardDto, { ...base, last4: '424' })).fields).toEqual(['last4']);
    });

    it('no admite el número completo ni el CVV', async () => {
      expect((await check(SaveCardDto, { ...base, number: '4242424242424242', cvv: '123' })).fields.sort()).toEqual(['cvv', 'number']);
    });
  });

  describe('MyTicketsQueryDto', () => {
    it('convierte página y límite, y solo admite status/page/limit', async () => {
      const { instance, errors } = await check(MyTicketsQueryDto, { status: 'open', page: '2', limit: '20' });
      expect(errors).toHaveLength(0);
      expect(instance).toMatchObject({ status: 'open', page: 2, limit: 20 });
      expect((await check(MyTicketsQueryDto, { plate: 'ABC' })).fields).toEqual(['plate']);
      expect((await check(MyTicketsQueryDto, { status: 'paying' })).fields).toEqual(['status']);
    });
  });
});
