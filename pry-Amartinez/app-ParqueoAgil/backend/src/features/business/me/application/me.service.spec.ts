import 'reflect-metadata';
import type { Mock } from 'vitest';
import { ApplicationException } from '../../../../common/exceptions/application.exception.js';
import { UserModel } from '../../../auth/users/infrastructure/persistence/models/user.model.js';
import { ClientModel } from '../../clients/infrastructure/persistence/models/client.model.js';
import { DriverModel } from '../../drivers/infrastructure/persistence/models/driver.model.js';
import { VISITOR_EMAIL } from '../../gate/application/gate.service.js';
import { ParkingSpotModel } from '../../parking-spots/infrastructure/persistence/models/parking-spot.model.js';
import { ParkingZoneModel } from '../../parking-zones/infrastructure/persistence/models/parking-zone.model.js';
import { TicketModel } from '../../tickets/infrastructure/persistence/models/ticket.model.js';
import { VehicleModel } from '../../vehicles/infrastructure/persistence/models/vehicle.model.js';
import { VehicleTypeModel } from '../../vehicle-types/infrastructure/persistence/models/vehicle-type.model.js';
import { MeService } from './me.service.js';

type Row = Record<string, any> & { update: Mock };
type Repo = Record<'findOne' | 'findAll' | 'findByPk' | 'create' | 'update', Mock>;

/** Fila simulada: `update` aplica los cambios como lo haría Sequelize. */
function row(props: Record<string, any>): Row {
  const r: Row = {
    ...props,
    update: vi.fn(async (values: Record<string, any>) => {
      Object.assign(r, values);
      return r;
    }),
  };
  return r;
}

const CAR = { id: 1, name: 'Automóvil', status: 'active', hourlyRate: '4000.00' };
const MOTO = { id: 2, name: 'Motocicleta', status: 'active', hourlyRate: '2000.00' };

describe('MeService', () => {
  let repos: Map<unknown, Repo>;
  let listTickets: { execute: Mock };
  let service: MeService;
  let driver: Row;
  let client: Row;

  const repo = (model: unknown): Repo => repos.get(model)!;

  beforeEach(() => {
    repos = new Map();
    for (const model of [UserModel, ClientModel, DriverModel, VehicleModel, VehicleTypeModel, TicketModel, ParkingZoneModel, ParkingSpotModel]) {
      repos.set(model, {
        findOne: vi.fn(async () => null),
        findAll: vi.fn(async () => []),
        findByPk: vi.fn(async () => null),
        create: vi.fn(),
        update: vi.fn(async () => [0]),
      });
    }
    const sequelize = {
      getRepository: (model: unknown) => repos.get(model),
      transaction: async (work: (t: object) => Promise<unknown>) => work({}),
    };
    listTickets = { execute: vi.fn(async () => ({ items: [], meta: {} })) };
    service = new MeService(sequelize as never, listTickets as never);

    client = row({ id: 20, name: 'Ana Pérez', phone: '3001234567' });
    driver = row({
      id: 7,
      userId: 3,
      clientId: 20,
      client,
      docType: 'CC',
      docNumber: '1023456789',
      qrSecret: 'secreto-qr',
      preferredZoneIds: '2,1',
      preferredSpotId: 5,
      paymentMethod: 'auto',
      cardToken: 'tok_test_visa_4242_1',
      cardBrand: 'visa',
      cardLast4: '4242',
    });
    repo(DriverModel).findOne.mockResolvedValue(driver);
    repo(UserModel).findByPk.mockResolvedValue({ id: 3, username: 'ana', email: 'ana@correo.com' });
    repo(VehicleTypeModel).findAll.mockResolvedValue([CAR, MOTO]);
    repo(VehicleTypeModel).findByPk.mockImplementation(async (id: number) => [CAR, MOTO].find((t) => t.id === id) ?? null);
  });

  const status = async (promise: Promise<unknown>) => {
    const error = await promise.then(() => null, (e: unknown) => e);
    expect(error).toBeInstanceOf(ApplicationException);
    return error as ApplicationException;
  };

  describe('getMe', () => {
    it('arma la respuesta del contrato sin exponer el token de la tarjeta', async () => {
      const car = row({ id: 1, plate: 'ABC123', vehicleTypeId: 1, vehicleType: CAR, description: null, gateCounter: 2, clientId: 20 });
      const parked = new Date('2026-10-13T10:00:00Z');
      repo(VehicleModel).findAll.mockResolvedValue([car]);
      repo(TicketModel).findAll.mockResolvedValue([
        { id: 9, vehicleId: 1, parkingZoneId: 2, entryAt: parked, parkingSpot: { code: 'A05' } },
      ]);

      const me = await service.getMe(3);

      expect(me.user).toEqual({ id: 3, username: 'ana', email: 'ana@correo.com' });
      expect(me.driver).toEqual({
        id: 7,
        clientId: 20,
        name: 'Ana Pérez',
        phone: '3001234567',
        docType: 'CC',
        docNumber: '1023456789',
        qrSecret: 'secreto-qr',
        preferredZoneIds: [2, 1],
        preferredSpotId: 5,
        paymentMethod: 'auto',
        card: { brand: 'visa', last4: '4242' },
      });
      expect(me.vehicles).toEqual([
        {
          id: 1,
          plate: 'ABC123',
          vehicleTypeId: 1,
          kind: 'car',
          description: null,
          gateCounter: 2,
          activeTicket: { id: 9, spotCode: 'A05', zoneId: 2, entryAt: parked },
        },
      ]);
      expect(me.vehicleTypes).toEqual([
        { id: 1, name: 'Automóvil', kind: 'car', hourlyRate: 4000 },
        { id: 2, name: 'Motocicleta', kind: 'motorcycle', hourlyRate: 2000 },
      ]);
      expect(JSON.stringify(me)).not.toContain('tok_test');
    });

    it('sin tarjeta devuelve card null, y sin ticket abierto activeTicket null', async () => {
      Object.assign(driver, { cardToken: null, cardBrand: null, cardLast4: null, preferredZoneIds: '' });
      repo(VehicleModel).findAll.mockResolvedValue([
        row({ id: 1, plate: 'ABC123', vehicleTypeId: 1, vehicleType: CAR, description: 'Rojo', gateCounter: 0, clientId: 20 }),
      ]);

      const me = await service.getMe(3);

      expect(me.driver.card).toBeNull();
      expect(me.driver.preferredZoneIds).toEqual([]);
      expect(me.vehicles[0].activeTicket).toBeNull();
    });

    it('404 si la cuenta no tiene perfil de conductor', async () => {
      repo(DriverModel).findOne.mockResolvedValue(null);
      const error = await status(service.getMe(99));
      expect(error.statusCode).toBe(404);
      expect(error.message).toBe('Esta cuenta no tiene perfil de conductor');
    });
  });

  describe('updateMe', () => {
    it('actualiza nombre y celular en el cliente, y el documento en el conductor', async () => {
      // 1.ª consulta: el conductor; 2.ª: nadie más tiene ese documento.
      repo(DriverModel).findOne.mockResolvedValueOnce(driver).mockResolvedValueOnce(null);
      await service.updateMe(3, { name: 'Ana María', phone: '3109876543', docNumber: '99887766' });
      expect(client.update).toHaveBeenCalledWith({ name: 'Ana María', phone: '3109876543' }, expect.anything());
      expect(driver.update).toHaveBeenCalledWith({ docNumber: '99887766' }, expect.anything());
    });

    it('409 si otro conductor tiene ese documento', async () => {
      repo(DriverModel).findOne.mockResolvedValueOnce(driver).mockResolvedValueOnce({ id: 8 });
      const error = await status(service.updateMe(3, { docNumber: '99887766' }));
      expect(error.statusCode).toBe(409);
      expect(error.message).toBe('Ya existe un conductor con ese documento');
      expect(client.update).not.toHaveBeenCalled();
    });

    it('ignora los campos null', async () => {
      await service.updateMe(3, { name: null as never, docNumber: null as never });
      expect(client.update).not.toHaveBeenCalled();
      expect(driver.update).not.toHaveBeenCalled();
    });
  });

  describe('addVehicle', () => {
    const visitor = { id: 1 };
    const stored = (props: Record<string, any>) =>
      row({ id: 31, plate: 'ABC123', vehicleTypeId: 1, vehicleType: CAR, description: null, gateCounter: 0, clientId: 20, status: 'active', ...props });

    it('crea el vehículo con la placa normalizada', async () => {
      repo(VehicleModel).create.mockResolvedValue({ id: 31 });
      repo(VehicleModel).findByPk.mockResolvedValue(stored({}));

      const vehicle = await service.addVehicle(3, { plate: 'abc 123', vehicleTypeId: 1, description: '  Mazda  ' });

      expect(repo(VehicleModel).create).toHaveBeenCalledWith({ clientId: 20, vehicleTypeId: 1, plate: 'ABC123', description: 'Mazda' });
      expect(vehicle).toMatchObject({ id: 31, plate: 'ABC123', kind: 'car', activeTicket: null });
    });

    it('404 si el tipo no existe o está inactivo, 422 si la placa no cuadra con el tipo', async () => {
      expect((await status(service.addVehicle(3, { plate: 'ABC123', vehicleTypeId: 77 }))).statusCode).toBe(404);
      repo(VehicleTypeModel).findByPk.mockResolvedValueOnce({ ...CAR, status: 'inactive' });
      expect((await status(service.addVehicle(3, { plate: 'ABC123', vehicleTypeId: 1 }))).statusCode).toBe(404);
      expect((await status(service.addVehicle(3, { plate: 'ABC123', vehicleTypeId: 2 }))).statusCode).toBe(422);
      expect((await status(service.addVehicle(3, { plate: 'ABC12D', vehicleTypeId: 1 }))).statusCode).toBe(422);
    });

    it('409 si la placa es de otro cliente o ya es suya y está activa', async () => {
      repo(VehicleModel).findOne.mockResolvedValue(stored({ clientId: 55 }));
      repo(ClientModel).findOne.mockResolvedValue(visitor);
      const other = await status(service.addVehicle(3, { plate: 'ABC123', vehicleTypeId: 1 }));
      expect(other.statusCode).toBe(409);
      expect(other.message).toBe('La placa ABC123 ya está registrada');

      repo(VehicleModel).findOne.mockResolvedValue(stored({}));
      expect((await status(service.addVehicle(3, { plate: 'ABC123', vehicleTypeId: 1 }))).statusCode).toBe(409);
    });

    it('reactiva el vehículo propio que estaba inactivo', async () => {
      const inactive = stored({ status: 'inactive', description: 'viejo' });
      repo(VehicleModel).findOne.mockResolvedValue(inactive);
      repo(VehicleModel).findByPk.mockResolvedValue(inactive);

      await service.addVehicle(3, { plate: 'ABC123', vehicleTypeId: 1, description: 'nuevo' });

      expect(inactive.update).toHaveBeenCalledWith({ vehicleTypeId: 1, description: 'nuevo', status: 'active' });
    });

    it('reasigna al conductor el vehículo del cliente de visitantes y le pasa su ticket abierto', async () => {
      const guest = stored({ clientId: visitor.id });
      repo(VehicleModel).findOne.mockResolvedValue(guest);
      repo(VehicleModel).findByPk.mockResolvedValue(guest);
      repo(ClientModel).findOne.mockResolvedValue(visitor);

      await service.addVehicle(3, { plate: 'ABC123', vehicleTypeId: 1 });

      expect(repo(ClientModel).findOne).toHaveBeenCalledWith(expect.objectContaining({ where: { email: VISITOR_EMAIL } }));
      expect(guest.update).toHaveBeenCalledWith(
        { clientId: 20, vehicleTypeId: 1, description: null, status: 'active' },
        expect.anything(),
      );
      expect(repo(TicketModel).update).toHaveBeenCalledWith({ clientId: 20 }, expect.objectContaining({ where: expect.objectContaining({ vehicleId: 31 }) }));
    });
  });

  describe('updateVehicle', () => {
    const mine = () =>
      row({ id: 31, plate: 'ABC123', vehicleTypeId: 1, vehicleType: CAR, description: null, gateCounter: 0, clientId: 20, status: 'active' });
    const parkedInside = () =>
      repo(TicketModel).findAll.mockResolvedValue([
        { id: 9, vehicleId: 31, parkingZoneId: 2, entryAt: new Date(), parkingSpot: { code: 'A05' } },
      ]);

    it('404 si el vehículo no es de este conductor', async () => {
      const error = await status(service.updateVehicle(3, 31, { description: 'x' }));
      expect(error.statusCode).toBe(404);
      expect(repo(VehicleModel).findOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 31, clientId: 20, status: 'active' } }),
      );
    });

    it('cambia placa y descripción cuando está fuera', async () => {
      const vehicle = mine();
      repo(VehicleModel).findOne.mockResolvedValueOnce(vehicle).mockResolvedValueOnce(null);
      repo(VehicleModel).findByPk.mockResolvedValue(vehicle);

      await service.updateVehicle(3, 31, { plate: 'xyz 987', description: '  Nuevo  ' });

      expect(vehicle.update).toHaveBeenCalledWith({ plate: 'XYZ987', vehicleTypeId: 1, description: 'Nuevo' });
    });

    it('409 si está dentro y cambia la placa o el tipo, pero puede cambiar la descripción', async () => {
      const vehicle = mine();
      repo(VehicleModel).findOne.mockResolvedValue(vehicle);
      repo(VehicleModel).findByPk.mockResolvedValue(vehicle);
      parkedInside();

      const plate = await status(service.updateVehicle(3, 31, { plate: 'XYZ987' }));
      expect(plate.statusCode).toBe(409);
      expect(plate.message).toBe('No puedes cambiar la placa ni el tipo mientras el vehículo está dentro del parqueadero');
      expect((await status(service.updateVehicle(3, 31, { vehicleTypeId: 2 }))).statusCode).toBe(409);

      await service.updateVehicle(3, 31, { plate: 'ABC123', description: 'Solo texto' });
      expect(vehicle.update).toHaveBeenCalledWith({ description: 'Solo texto' });
    });

    it('422 si la placa no cuadra con el tipo y 409 si ya existe', async () => {
      repo(VehicleModel).findOne.mockResolvedValue(mine());
      expect((await status(service.updateVehicle(3, 31, { vehicleTypeId: 2 }))).statusCode).toBe(422);
      expect((await status(service.updateVehicle(3, 31, { plate: '123ABC' }))).statusCode).toBe(422);

      repo(VehicleModel).findOne.mockResolvedValueOnce(mine()).mockResolvedValueOnce({ id: 40 });
      const error = await status(service.updateVehicle(3, 31, { plate: 'XYZ987' }));
      expect(error.statusCode).toBe(409);
      expect(error.message).toBe('La placa XYZ987 ya está registrada');
    });
  });

  describe('setPreferences', () => {
    const valid = { preferredZoneIds: [1, 2], preferredSpotId: 8, paymentMethod: 'qr' as const };

    it('guarda zonas (en orden, separadas por coma), espacio y método', async () => {
      repo(ParkingZoneModel).findAll.mockResolvedValue([{ id: 2 }, { id: 1 }]);
      repo(ParkingSpotModel).findByPk.mockResolvedValue({ id: 8 });

      await service.setPreferences(3, valid);

      expect(driver.update).toHaveBeenCalledWith({ preferredZoneIds: '1,2', preferredSpotId: 8, paymentMethod: 'qr' });
    });

    it('acepta ninguna zona ni espacio', async () => {
      await service.setPreferences(3, { preferredZoneIds: [], preferredSpotId: null, paymentMethod: 'cash' });
      expect(driver.update).toHaveBeenCalledWith({ preferredZoneIds: '', preferredSpotId: null, paymentMethod: 'cash' });
      expect(repo(ParkingZoneModel).findAll).not.toHaveBeenCalled();
      expect(repo(ParkingSpotModel).findByPk).not.toHaveBeenCalled();
    });

    it('422 si una zona no existe o no está activa', async () => {
      repo(ParkingZoneModel).findAll.mockResolvedValue([{ id: 1 }]);
      expect((await status(service.setPreferences(3, valid))).statusCode).toBe(422);
      expect(driver.update).not.toHaveBeenCalled();
    });

    it('422 si el espacio no existe', async () => {
      repo(ParkingZoneModel).findAll.mockResolvedValue([{ id: 1 }, { id: 2 }]);
      expect((await status(service.setPreferences(3, valid))).statusCode).toBe(422);
    });

    it('422 con cobro automático sin tarjeta guardada', async () => {
      Object.assign(driver, { cardToken: null });
      const error = await status(
        service.setPreferences(3, { preferredZoneIds: [], preferredSpotId: null, paymentMethod: 'auto' }),
      );
      expect(error.statusCode).toBe(422);
      expect(error.message).toBe('Guarda una tarjeta para usar el cobro automático');
    });
  });

  describe('tarjeta', () => {
    it('guarda token, marca y últimos 4', async () => {
      await service.saveCard(3, { token: 'tok_test_mc_5555_2', brand: 'mastercard', last4: '5555' });
      expect(driver.update).toHaveBeenCalledWith({ cardToken: 'tok_test_mc_5555_2', cardBrand: 'mastercard', cardLast4: '5555' });
    });

    it('al quitarla, el cobro automático pasa a efectivo', async () => {
      const me = await service.removeCard(3);
      expect(driver.update).toHaveBeenCalledWith({ cardToken: null, cardBrand: null, cardLast4: null, paymentMethod: 'cash' });
      expect(me.driver.card).toBeNull();
      expect(me.driver.paymentMethod).toBe('cash');
    });

    it('al quitarla conserva cualquier otro método', async () => {
      Object.assign(driver, { paymentMethod: 'qr' });
      await service.removeCard(3);
      expect(driver.update).toHaveBeenCalledWith(expect.objectContaining({ paymentMethod: 'qr' }));
    });
  });

  describe('myTickets', () => {
    it('lista los tickets de todos los vehículos del cliente, activos o no', async () => {
      repo(VehicleModel).findAll.mockResolvedValue([{ id: 1 }, { id: 4 }]);

      await service.myTickets(3, { status: 'closed', page: 2, limit: 5 });

      expect(repo(VehicleModel).findAll).toHaveBeenCalledWith(expect.objectContaining({ where: { clientId: 20 } }));
      expect(listTickets.execute).toHaveBeenCalledWith({ status: 'closed', page: 2, limit: 5, vehicleIds: [1, 4] });
    });

    it('sin vehículos devuelve una página vacía sin consultar tickets', async () => {
      const page = await service.myTickets(3, {});
      expect(page).toEqual({ items: [], meta: { page: 1, limit: 10, total: 0, totalPages: 0 } });
      expect(listTickets.execute).not.toHaveBeenCalled();
    });
  });
});
