# ParqueoÁgil

ParqueoÁgil reemplaza el tiquete de papel de los parqueaderos de Riohacha por un código QR dinámico en el celular del conductor. El conductor muestra su QR desde la app, la portería lo lee con la cámara del computador, el sistema asigna un espacio y, al salir, se cobra.

Proyecto de clase de Desarrollo Web y Base de Datos II (Uniguajira, 2026-II).

El sistema tiene tres piezas que comparten la base de datos MySQL a través del backend:

| Pieza | Carpeta | Tecnología | Quién la usa |
|---|---|---|---|
| Backend: API REST y eventos en tiempo real (SSE) | `backend/` | NestJS, Sequelize, MySQL | Lo usan las otras dos piezas |
| Panel web: administración y portería | `web/` | Angular | Administrador y operador de portería |
| App móvil | `mobile/` | Flutter | Conductores |

## Flujo

1. **Registro.** El conductor crea su cuenta en la app.
2. **Vehículos.** Agrega sus carros y motos por placa.
3. **QR.** La app muestra un QR que cambia cada 30 s y va firmado con HMAC-SHA256.
4. **Entrada.** La portería lee el QR con la cámara. El backend valida la firma, asigna un espacio según las preferencias del conductor y abre el ticket.
5. **Salida.** Se lee el QR otra vez. El valor queda fijo y se cobra en efectivo, con datáfono, con QR (Bre-B, Nequi o Daviplata) o con cobro automático de la tarjeta guardada.

La app y el panel se actualizan al instante por SSE. Si un visitante no tiene la app, la portería registra su placa a mano.

## Requisitos

| Herramienta | Versión | Notas |
|---|---|---|
| Node.js | 20 o superior | Backend y panel; npm 10 o superior |
| MySQL | 8 | Local, con XAMPP o Docker |
| Flutter | 3.x | Solo para la app móvil |

Para leer QR en el panel hace falta una cámara o una webcam USB. Si no hay cámara, el panel permite pegar el código o registrar la placa.

## Cómo correrlo

Seguir el orden. El backend crea las tablas y carga los datos de ejemplo al arrancar.

1. **Base de datos.** Crear la base `ParqueoAgil` en MySQL.
2. **Backend.**
   ```bash
   cd backend
   cp .env.example .env
   # Editar .env: JWT_SECRET (32 caracteres o más) y los datos de MySQL
   npm install
   npm run start:dev
   ```
   Al arrancar crea las tablas, agrega las columnas nuevas a las bases existentes y siembra datos de ejemplo. Swagger: http://localhost:3003/api/docs
3. **Panel web.**
   ```bash
   cd web
   npm install
   npm start
   ```
   Abrir http://localhost:4200. Si el backend no está en `localhost:3003`, definir `window.PQA_API_URL` antes de cargar la app (ver `web/src/app/core/config.ts`).
4. **App móvil.**
   ```bash
   cd mobile
   flutter pub get
   flutter run
   ```
   En la pantalla de bienvenida, el botón *Servidor* permite cambiar la dirección de la API:

   | Cómo se conecta el celular | Dirección de la API |
   |---|---|
   | USB, con `adb reverse tcp:3003 tcp:3003` | `http://localhost:3003/api` |
   | Emulador de Android | `http://10.0.2.2:3003/api` |
   | Misma red Wi-Fi | `http://IP_DEL_COMPUTADOR:3003/api` |

   La app tiene dos perfiles según la cuenta que inicia sesión:

   - **Conductor** (rol DRIVER): Mi QR, Mapa, Zonas, Pago y Perfil.
   - **Lector de QR** (rol LECTOR): una sola pantalla que lee con la cámara el QR del conductor. Al entrar muestra el espacio asignado; al salir muestra el valor y, si el conductor activó el cobro automático, lo cobra. Si no, el cobro se hace en *Portería* del panel web. Si el dispositivo no tiene cámara, se puede escribir el código.

## Usuarios de prueba

| Usuario | Contraseña | Rol | Qué puede hacer |
|---|---|---|---|
| `admin` | `Admin123!` | ADMIN | Panel completo, incluida la página Personal |
| `seller` | `Seller123!` | SELLER | Operador de portería: todo el panel excepto Personal |
| `lector` | `Lector123!` | LECTOR | App móvil, perfil lector de QR: solo leer el QR en portería y el cobro automático |
| `conductor@parqueoagil.local` | `Conductor123!` | DRIVER | App móvil. Es el conductor Carlos Ruiz, con los vehículos ABC123 (carro), XYZ789 (carro) y QWE12F (moto) |

Los accesos del panel y de la app aceptan usuario o correo.

## Demo sugerida para la clase

Conviene tener el panel en el computador (o proyectado) y la app en el celular, uno al lado del otro.

La base recién sembrada deja a ABC123 dentro desde hace 1 h 30 min, en su espacio preferido A05. Si la base ya tenía tickets, ese vehículo no aparece dentro: en ese caso se empieza por la entrada del paso 3 con XYZ789 y después se hace la salida de ABC123.

1. **Panel, operador.** Entrar como `seller`. En *Tablero* mostrar el resumen del día (ocupación e ingresos). En *Mapa*, mostrar el plano por zonas; A05 aparece ocupado por ABC123.
2. **Celular, conductor.** Entrar con `conductor@parqueoagil.local`. En *Mi QR* elegir XYZ789 y mostrar que el código cambia cada 30 s.
3. **Entrada.** En *Portería*, tocar *Activar cámara* y apuntar al QR del celular. El panel muestra la entrada con el espacio asignado. Como A05 está ocupado, el sistema toma el libre más cercano en las zonas preferidas (A y B). El QR del celular cambia después de la entrada.
4. **Salida con cobro.** En el celular, elegir ABC123 y mostrar su QR. En *Portería*, leerlo: el panel muestra la cotización por fracciones de 15 min. Elegir el método de pago (por ejemplo, efectivo con cálculo de cambio) y cobrar. El ticket queda cerrado en *Tickets* y el recibo aparece en la pestaña *Pago* de la app.
5. **Lector de QR en otro celular.** Entrar a la app con `lector`: aparece solo la pantalla de leer QR. Leer el QR del conductor muestra la entrada con el espacio asignado, o la salida con su valor (con cobro automático, se cobra solo).
6. **Errores.** Leer otra vez el mismo QR: el panel lo rechaza porque ya fue usado. Un QR vencido también se rechaza.
7. **Visitante.** En *Portería*, registrar la entrada de un vehículo sin app escribiendo su placa en *Placa que entra*. *Tablero* y *Mapa* se actualizan sin recargar la página.

## Variables nuevas del `.env`

| Variable | Valor por defecto | Para qué sirve |
|---|---|---|
| `CORS_ORIGINS` | `http://localhost:4200` | Orígenes permitidos, separados por coma. 4200 es el panel web; 8765, la app Flutter en el navegador. |
| `TARIFF_MINUTES_PER_FRACTION` | `15` | Minutos por fracción cobrable. Cada fracción que empieza se cobra completa. `60` vuelve al cobro por hora; `1` cobra por minuto. |
| `TARIFF_ROUND_TO` | `100` | El total se aproxima al múltiplo de este valor más cercano. |
| `TARIFF_GRACE_MINUTES` | `0` | Minutos gratis al inicio de la estadía. |
| `SEED_DEMO_ACTIVITY` | `true` | Crea tickets de ejemplo en una base nueva. `false` lo desactiva. |

## Documentación

| Documento | Contenido |
|---|---|
| [`docs/API-INTEGRACION.md`](docs/API-INTEGRACION.md) | Contrato de la API: endpoints, tipos, eventos SSE y reglas de negocio |
| [`backend/README.md`](backend/README.md) | Backend: roles, tablas, seeders y pruebas |
| [`mobile/README.md`](mobile/README.md) | App móvil: modos de funcionamiento, estructura y pruebas |
| [`tasks/plan.md`](tasks/plan.md) | Plan de implementación y decisiones de arquitectura |
| [`docs/promo/parqueoagil_promo.html`](docs/promo/parqueoagil_promo.html) | Video promocional |

## Límites del prototipo

- Los pagos son simulados: no hay pasarela real (Wompi, ePayco, Mercado Pago ni Bre-B).
- Los QR ya usados se recuerdan en la memoria del servidor. Al reiniciar el backend se olvidan; la vigencia de cada QR es de 30 s.
- En Flutter web, la app actualiza sus datos cada 10 s en lugar de recibir eventos SSE.
- La API funciona por HTTP sin TLS: sirve para la demo en red local, no para producción.
