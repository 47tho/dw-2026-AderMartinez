# Tareas — integración backend + app + web

## Fase 1: Backend

- [x] **T1. Esquema y datos base.** Modelos `vehicles`, `parking_spots`,
  `drivers`; columnas nuevas en zonas y tickets; `SchemaUpgrader`;
  seeders (zonas A–F y M con espacios, conductor demo con 3 vehículos,
  rol DRIVER y sus permisos).
  - Verificación: `npm run build`; el backend arranca dos veces seguidas
    contra MySQL sin duplicar datos.
- [x] **T2. Dominio puro + pruebas.** `TariffCalculator` (fracciones),
  `AccessCode` (HMAC), `SpotAssigner` (preferencias y cercanía).
  - Verificación: `npm test` (vitest) con los mismos casos que la app.
- [x] **T3. Conductor.** `POST /api/drivers/register` (público),
  `GET/PATCH /api/me`, vehículos, preferencias, tarjeta, historial.
  - Verificación: registro → login → `GET /api/me` devuelve la clave del QR.
- [x] **T4. Portería y cobro.** `POST /api/gate/scan`,
  `POST /api/gate/manual-entry`, `POST /api/gate/manual-exit`,
  `POST /api/tickets/:id/pay`, `GET /api/tickets`.
  - Verificación: QR válido → entrada con espacio; mismo QR → "ya usado";
    segundo QR → cotización; pago → espacio libre.
- [x] **T5. Tiempo real y reportes.** `GET /api/events` (SSE),
  `GET /api/parking-spots`, `GET /api/reports/summary`, `GET /api/drivers`.

### Checkpoint 1
- [x] Build y pruebas del backend en verde; flujo completo con `curl`.

## Fase 2: Panel web (Angular)

- [x] **T6. Base:** proyecto, login con refresh automático, layout,
  cliente de API, servicio de eventos SSE.
- [x] **T7. Tablero en vivo** (ocupación, ingresos del día, actividad) y
  **mapa de espacios**.
- [x] **T8. Portería:** cámara + lectura de QR, entrada/salida manual por
  placa, cobro y recibo.
- [x] **T9. Gestión:** tickets, zonas y tarifas, conductores, personal.

### Checkpoint 2
- [x] `ng build` sin errores; flujo de portería probado en el navegador.

## Fase 3: App móvil (Flutter)

- [x] **T10. Cliente de API y sesión** (login, registro, refresh,
  almacenamiento seguro, URL del servidor configurable).
- [x] **T11. Modo conectado:** QR con la clave del servidor, vehículos,
  preferencias, tarjeta, historial y mapa desde la API; actualización en
  vivo. Modo demo intacto.
  - Verificación: `flutter analyze` y `flutter test` en verde.

### Checkpoint 3 (final)
- [x] Prueba de punta a punta: registro en la app → QR → portería web →
  la app muestra el espacio → salida y pago → recibo en la app.
- [x] Revisión de código, documentación y push de la rama.
