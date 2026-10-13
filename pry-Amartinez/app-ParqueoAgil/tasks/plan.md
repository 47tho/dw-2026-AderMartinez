# Plan de implementación: integración backend + app móvil + panel web

Rama: `feature/integracion-app-web`

## Resumen

ParqueoÁgil queda como un solo sistema con tres piezas que comparten la
misma base de datos (MySQL) a través del backend NestJS:

| Pieza | Usuario | Carpeta |
|-------|---------|---------|
| Backend (API REST + eventos en tiempo real) | — | `backend/` |
| Panel web (Angular) | El parqueadero: administrador y operador de portería | `web/` |
| App móvil (Flutter) | Conductores | `mobile/` |

Flujo: el conductor se registra en la app, agrega sus vehículos y muestra
un QR firmado que cambia cada 30 s. La portería (panel web, con la cámara
del computador) lee el QR, el backend valida la firma, asigna un espacio
según las preferencias y abre el ticket. Al salir, la portería lee el QR
otra vez, el valor queda fijo y se cobra (efectivo, datáfono, QR o cobro
automático). La app y el panel se enteran al instante por SSE.

## Decisiones de arquitectura

- **Se extiende el backend existente sin romperlo.** Se respetan la
  arquitectura por features, el envoltorio de respuestas, los guards
  JWT + RBAC y los seeders idempotentes. Los endpoints actuales siguen
  funcionando igual.
- **Rol nuevo `DRIVER` (conductor)** en la misma matriz RBAC: el
  conductor inicia sesión con `POST /api/sesion/login` como cualquier
  usuario, pero solo tiene permisos sobre `/api/me/*` y las consultas
  públicas del mapa. Un conductor es un `user` + un `client` + un
  `driver` (perfil 1:1 con documento, clave del QR y preferencias).
- **Tablas nuevas:** `vehicles`, `parking_spots`, `drivers`. **Columnas
  nuevas** en `parking_zones` (code, floor, position, color) y `tickets`
  (vehículo, espacio, fracciones, pago). Como `sync({ alter: false })`
  no agrega columnas a tablas que ya existen, un `SchemaUpgrader`
  idempotente las agrega al arrancar (bases de datos ya creadas no se
  pierden).
- **Cobro por fracciones de 15 min** (regla del producto), redondeado al
  múltiplo de $100 más cercano. Configurable por `.env`
  (`TARIFF_MINUTES_PER_FRACTION=60` vuelve al cobro por hora).
- **QR:** el mismo formato de la app (`PQA1.<vehiculo>.<ventana>.<contador>.<firma>`,
  HMAC-SHA256). La clave la genera el servidor al registrarse y solo se
  entrega al dueño (`GET /api/me`). Se rechazan QR vencidos, alterados,
  reutilizados o de otras apps.
- **Tiempo real con SSE** (`GET /api/events`): sin dependencias nuevas.
  El personal recibe todo; el conductor recibe solo el estado de los
  espacios (sin placas) y sus propios tickets.
- **Pagos simulados:** la tarjeta se tokeniza del lado de la app (como
  lo haría el widget de Wompi/ePayco); el servidor solo guarda token,
  marca y últimos 4.
- **Panel web en Angular** porque el backend ya tiene CORS para
  `localhost:4200` (puerto por defecto de Angular).
- **App móvil con dos modos:** "Conectado al servidor" (nuevo) y "Demo
  sin servidor" (el prototipo actual, intacto para presentaciones sin
  internet).

## Tareas

Ver `tasks/todo.md`.

## Riesgos

| Riesgo | Impacto | Mitigación |
|--------|---------|------------|
| Cambiar el cálculo del ticket del compañero | Medio | Configurable por `.env`; se documenta en el PR |
| BD existente sin columnas nuevas | Alto | `SchemaUpgrader` idempotente |
| Códigos QR usados en memoria (se pierden al reiniciar) | Bajo | Ventana de 30 s; documentado como límite del prototipo |
| Celular sin acceso al `localhost` del PC | Medio | `adb reverse tcp:3003 tcp:3003` o IP de la red local |
