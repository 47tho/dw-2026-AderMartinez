# Contrato de la API de integración (app móvil + panel web)

Base: `http://localhost:3003/api`. Swagger: `/api/docs`.

Se conservan las convenciones del backend:

- **Éxito:** `{ statusCode, message: "OK", data, timestamp }`. Abajo solo se
  muestra `data`.
- **Error:** `{ statusCode, message, timestamp, path }`. `message` es un texto
  para mostrar tal cual al usuario.
- **Listas paginadas:** `?page=1&limit=10` → `{ items: [...], meta: { page, limit, total, totalPages } }`.
- **Autenticación:** `Authorization: Bearer <access_token>` (de
  `POST /api/sesion/login` o `POST /api/drivers/register`). El access token
  dura 15 min; se renueva con `POST /api/sesion/refresh`.
- **Permisos:** matriz RBAC. Roles: `ADMIN` (todo), `SELLER` (operador de
  portería), `DRIVER` (conductor, nuevo).

Todos los cambios son **aditivos**: los endpoints existentes responden igual,
con campos nuevos opcionales.

## Tipos

```ts
type VehicleKind = 'car' | 'motorcycle' | 'van';
type PaymentMethodCode = 'cash' | 'card' | 'qr' | 'auto';
type SpotStatus = 'free' | 'occupied' | 'blocked';

interface Zone {            // GET /api/parking-zones (campos nuevos: code..color)
  id: number; name: string; vehicleTypeId: number;
  capacity: number; availableSpots: number; hourlyRate: number; status: string;
  code: string | null;      // 'A', 'B', 'M'...
  floor: number; position: number; color: string | null;
}

interface Spot { id: number; code: string; zoneId: number; row: number; column: number; status: SpotStatus; }

interface VehicleTypeRef { id: number; name: string; kind: VehicleKind; hourlyRate: number; }

interface Vehicle {
  id: number; plate: string; vehicleTypeId: number; kind: VehicleKind;
  description: string | null;
  gateCounter: number;      // entradas + salidas: forma parte del QR
  activeTicket: { id: number; spotCode: string | null; zoneId: number; entryAt: string } | null;
}

interface Ticket {          // respuesta existente + campos nuevos
  id: number; clientId: number; parkingZoneId: number;
  entryAt: string; exitAt: string | null; hours: number; hourlyRate: number;
  subtotal: number; tax: number; discounts: number; total: number;
  status: 'open' | 'closed';
  vehicleId: number | null; plate: string | null;
  parkingSpotId: number | null; spotCode: string | null;
  channel: 'qr' | 'manual' | 'api';
  fractions: number; minutesPerFraction: number; pricePerFraction: number;
  quotedAt: string | null;  // momento en que la portería leyó el QR de salida
  paymentMethod: PaymentMethodCode | null;
  amountReceived: number | null; change: number | null;
  paymentRef: string | null; authorization: string | null; cardLabel: string | null;
}

interface Quote { quotedAt: string; minutes: number; fractions: number; minutesPerFraction: number; pricePerFraction: number; subtotal: number; total: number; }

type GateResult =
  | { kind: 'entry'; ticket: Ticket; vehicle: Vehicle; driverName: string; spot: Spot | null; zone: Zone; reason: string }
  | { kind: 'exit'; ticket: Ticket; vehicle: Vehicle; driverName: string; quote: Quote;
      preferredPaymentMethod: PaymentMethodCode; savedCard: { label: string } | null };
```

## Conductor (app móvil)

| Método y ruta | Rol | Cuerpo → respuesta |
|---|---|---|
| `POST /api/drivers/register` | público | `{ name, email, password, phone, docType, docNumber }` → tokens de sesión (igual que login). 409 si el correo o el documento ya existen. |
| `GET /api/me` | DRIVER | → `{ user: {id, username, email}, driver: {id, clientId, name, phone, docType, docNumber, qrSecret, preferredZoneIds, preferredSpotId, paymentMethod, card: {brand, last4} \| null}, vehicles: Vehicle[], vehicleTypes: VehicleTypeRef[] }` |
| `PATCH /api/me` | DRIVER | `{ name?, phone?, docType?, docNumber? }` → igual que `GET /api/me` |
| `POST /api/me/vehicles` | DRIVER | `{ plate, vehicleTypeId, description? }` → `Vehicle` (201). Placa normalizada y validada (carro `ABC123`, moto `ABC12D`). 409 si ya existe. |
| `PATCH /api/me/vehicles/:id` | DRIVER | `{ plate?, vehicleTypeId?, description? }` → `Vehicle`. 409 si está dentro y se cambia placa o tipo. |
| `PUT /api/me/preferences` | DRIVER | `{ preferredZoneIds: number[] (máx. 3), preferredSpotId: number \| null, paymentMethod }` → `GET /api/me` |
| `PUT /api/me/card` | DRIVER | `{ token, brand, last4 }` (token de la pasarela; nunca el número) → `GET /api/me` |
| `DELETE /api/me/card` | DRIVER | → `GET /api/me`. Si el método era `auto`, pasa a `cash`. |
| `GET /api/me/tickets` | DRIVER | `?status=open\|closed&page&limit` → `Ticket[]` paginado (solo sus vehículos) |

## Portería y cobro (panel web)

| Método y ruta | Rol | Cuerpo → respuesta |
|---|---|---|
| `POST /api/gate/scan` | SELLER, ADMIN | `{ code }` → `GateResult`. Errores: 422 no es de ParqueoÁgil o firma alterada, 404 vehículo no registrado, 410 QR vencido, 409 QR ya usado o parqueadero lleno. |
| `POST /api/gate/manual-entry` | SELLER, ADMIN | `{ plate, vehicleTypeId }` → `GateResult` (`entry`). Para visitantes sin app. |
| `POST /api/gate/manual-exit` | SELLER, ADMIN | `{ plate }` → `GateResult` (`exit`) |
| `POST /api/tickets/:id/pay` | SELLER, ADMIN | `{ method: PaymentMethodCode, cashReceived? }` → `Ticket` cerrado. 409 si no está abierto o no tiene cotización; 402 si la pasarela rechaza; 422 si el efectivo no alcanza. Seguro ante doble clic: el ticket se reclama con un `UPDATE ... WHERE status='open'` atómico. |
| `GET /api/tickets` | SELLER, ADMIN | `?status&zoneId&plate&page&limit` → `Ticket[]` paginado |
| `GET /api/drivers` | SELLER, ADMIN | `?page&limit` → `{ id, name, email, phone, vehicles: {id, plate, kind}[], activeTickets }[]` paginado |
| `GET /api/reports/summary` | SELLER, ADMIN | → `{ occupancy: {capacity, occupied, free, blocked, zones: [{id, code, name, capacity, occupied}]}, today: {entries, exits, revenue, byMethod: {cash, card, qr, auto}, avgMinutes}, entriesByHour: number[24] }` |
| `PATCH /api/parking-spots/:id` | ADMIN | `{ status: 'free' \| 'blocked' }` → `Spot`. 409 si está ocupado. |

## Compartidos

| Método y ruta | Rol | Respuesta |
|---|---|---|
| `GET /api/parking-zones` | todos | `Zone[]` paginado (existente) |
| `GET /api/vehicle-types` | todos | existente |
| `GET /api/parking-spots` | todos | `?zoneId` → `Spot[]` (sin paginar; un parqueadero tiene cientos de espacios, no miles) |
| `GET /api/events` | todos | Flujo SSE (`text/event-stream`), ver abajo |

## Eventos en tiempo real (SSE)

`GET /api/events` con el header `Authorization`. Cada mensaje:

```
event: spot.updated
data: {"id":12,"code":"A05","zoneId":1,"status":"occupied"}
```

| Evento | Datos | Quién lo recibe |
|---|---|---|
| `spot.updated` | `Spot` | todos (sin placas) |
| `zone.updated` | `{ id, availableSpots, capacity }` | todos |
| `ticket.opened`, `ticket.quoted`, `ticket.closed` | `Ticket` | personal; el conductor solo los de sus vehículos |
| `ping` | `{}` cada 25 s | todos |

## Reglas de negocio en el servidor

- **Cobro:** fracciones de `TARIFF_MINUTES_PER_FRACTION` minutos (15). Cada
  fracción que empieza se cobra completa. Precio por fracción =
  `tarifa por hora × minutos / 60`. Total aproximado al múltiplo de
  `TARIFF_ROUND_TO` (100) más cercano. `TARIFF_GRACE_MINUTES` (0) gratis.
- **QR:** `PQA1.<vehiculo>.<ventana30s>.<contador>.<firma16hex>`, firma
  `HMAC-SHA256(qrSecret, "PQA1|vehiculo|ventana|contador")`. Se acepta la
  ventana actual ±1. Un código leído no se acepta otra vez.
- **Asignación:** espacio preferido si está libre; si no, el libre más
  cercano en las zonas preferidas (en orden); si no, el más cercano en
  cualquier zona del tipo de vehículo. Cambiar de piso pesa 30, entre zonas
  10.
