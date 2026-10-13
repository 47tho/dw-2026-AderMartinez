# ParqueoÁgil — Backend solo Business

Backend NestJS + Sequelize + Clean Architecture por feature, para el sistema de gestión de parqueadero **ParqueoÁgil**.

Proyecto de la materia **Desarrollo Web y Base de Datos II** (Uniguajira · 2026-II), basado en el proyecto guía StoreLab, adaptado al dominio de parqueadero.

## Stack

- **NestJS 12** (ESM, `module: nodenext`)
- **Sequelize + sequelize-typescript** (ORM multi-motor)
- **MySQL** como motor activo (también soporta PostgreSQL, SQL Server, Oracle)
- **class-validator** + **class-transformer** (validación)
- **Swagger** en `/api/docs`
- **vitest** para pruebas
- **oxlint** para linting

## Requisitos

- Node.js ≥ 20
- npm ≥ 10
- Docker (para levantar el contenedor MySQL)
- MySQL accesible en `localhost:3306`

## Integración con la app móvil y el panel web

El backend también atiende a la app Flutter (`../mobile/`) y al panel Angular (`../web/`). Todos los cambios son aditivos: los endpoints existentes responden igual. El contrato completo (rutas, cuerpos, respuestas y eventos SSE) está en [`../docs/API-INTEGRACION.md`](../docs/API-INTEGRACION.md); la documentación interactiva está en `/api/docs`.

### Roles y matriz RBAC

Se agrega el rol **`DRIVER`** (conductor) a `ADMIN` y `SELLER`. El catálogo de recursos (`src/features/auth/resources/infrastructure/persistence/resource-catalog.ts`) es la fuente única: 75 recursos, cada uno con un par `(método, ruta)`.

| Rol | Recursos | Alcance |
|---|---:|---|
| `ADMIN` | 75 | Todo |
| `SELLER` | 18 | Operación de portería: escaneo de QR y cobro, tickets, plano, zonas, conductores y reportes. No accede a `/api/usuarios`. |
| `DRIVER` | 14 | `/api/me/*`, tipos de vehículo, zonas, plano de espacios y eventos SSE |

- Las concesiones se derivan del catálogo en el seeder `resource-roles`: `ADMIN` recibe todos, `SELLER` los marcados con `seller: true` y `DRIVER` los marcados con `driver: true`.
- Un conductor es un `user` + un `client` + un `driver` (perfil 1:1 con documento, clave del QR y preferencias). Inicia sesión con `POST /api/sesion/login`, como cualquier usuario.
- Las rutas de sesión (`/api/sesion/*`) no son recursos RBAC.

### Tablas nuevas y columnas agregadas

| Tabla | Cambio | Contenido |
|---|---|---|
| `vehicles` | Nueva | Vehículos de cada cliente: placa, tipo, descripción y `gateCounter` (contador de entradas y salidas, que forma parte del QR) |
| `parking_spots` | Nueva | Espacios individuales por zona: código, fila, columna y estado (`free`, `occupied`, `blocked`) |
| `drivers` | Nueva | Perfil del conductor: documento, `qrSecret`, zonas y espacio preferidos, método de pago y tarjeta tokenizada (token, marca y últimos 4 dígitos) |
| `parking_zones` | Columnas nuevas | `code`, `floor`, `position`, `color` |
| `tickets` | Columnas nuevas | Vehículo, espacio, fracciones y pago: `vehicleId`, `parkingSpotId`, `channel`, `fractions`, `minutesPerFraction`, `pricePerFraction`, `quotedAt`, `paymentMethod`, `amountReceived`, `changeGiven`, `paymentRef`, `authorization`, `cardLabel` |

**Migración de bases existentes.** `sequelize.sync({ alter: false })` crea las tablas que faltan, pero no toca las que ya existen. Después, `upgradeSchema` (`src/infrastructure/database/sequelize/schema-upgrader.ts`) compara cada modelo con su tabla y agrega las columnas que faltan. Corre en cada arranque y es idempotente:

- Solo agrega columnas que admiten `NULL` o tienen valor por defecto.
- No borra ni modifica columnas existentes.
- Si falta una columna obligatoria sin valor por defecto, lo registra en el log para agregarla a mano.

### Cobro por fracciones

El cálculo está en `src/features/business/tickets/domain/services/ticket-calculator.ts` y lee la configuración `TARIFF_*` del entorno en cada consulta:

- Cada fracción que empieza se cobra completa. `TARIFF_MINUTES_PER_FRACTION` vale 15 por defecto; `60` vuelve al cobro por hora.
- Precio por fracción = tarifa por hora × minutos de la fracción / 60.
- El total se aproxima al múltiplo de `TARIFF_ROUND_TO` (100) más cercano. `TARIFF_GRACE_MINUTES` (0) define los minutos gratis.

### Endpoints nuevos

| Grupo | Endpoints |
|---|---|
| Conductor (`drivers`, `me`) | `POST /api/drivers/register` · `GET` y `PATCH /api/me` · `POST /api/me/vehicles` · `PATCH /api/me/vehicles/:id` · `PUT /api/me/preferences` · `PUT` y `DELETE /api/me/card` · `GET /api/me/tickets` |
| Portería y cobro (`gate`, `tickets`) | `POST /api/gate/scan` · `POST /api/gate/manual-entry` · `POST /api/gate/manual-exit` · `POST /api/tickets/:id/pay` |
| Espacios, conductores y reportes | `GET /api/parking-spots?zoneId=` · `PATCH /api/parking-spots/:id` · `GET /api/drivers` · `GET /api/reports/summary` |
| Tiempo real (`events`) | `GET /api/events` (SSE; envía `ping` cada 25 s) |

`GET /api/tickets` acepta además los filtros `status`, `zoneId` y `plate`.

### Seeders nuevos

`SeedersRunner` (`src/infrastructure/database/seeders/seeders.runner.ts`) los ejecuta al arrancar, después de los seeders originales. Todos son idempotentes.

| Seeder | Qué crea |
|---|---|
| `parking-layout` | Zonas A, B y C (automóviles, piso 1), M (motos), D y E (automóviles, piso 2) y F (camionetas), con letra, piso, posición y color. Genera los espacios de cada zona hasta su capacidad. Si ya existe la "Zona A - Piso 1" del seeder original, la completa en lugar de duplicarla. |
| `drivers` | Conductor de demostración `conductor@parqueoagil.local` (Carlos Ruiz) con los vehículos ABC123, XYZ789 y QWE12F, y preferencias de zonas A y B con espacio A05. No se modifica si ya existe. |
| `demo-activity` | Actividad de ejemplo: ABC123 dentro desde hace 1 h 30 min, entre 30 % y 55 % de cada zona ocupada por visitantes y salidas pagadas del día. Solo corre si la tabla `tickets` está vacía. Se apaga con `SEED_DEMO_ACTIVITY=false`. |

Las variables nuevas del `.env` (`CORS_ORIGINS`, `TARIFF_*` y `SEED_DEMO_ACTIVITY`) están en `.env.example` y en la tabla del [README de la raíz](../README.md).

### Pruebas

`npm test` ejecuta `vitest run`. Las pruebas cubren el código QR firmado (`access-code.spec.ts`), la asignación de espacios (`spot-assigner.spec.ts`), el cobro por fracciones (`ticket-calculator.spec.ts`), la pasarela de pagos simulada (`payment-gateway.simulator.spec.ts`) y el perfil del conductor (`me.service.spec.ts`, `me.dto.spec.ts`). `npm run test:watch` las repite al guardar cambios y `npm run test:cov` muestra la cobertura.
