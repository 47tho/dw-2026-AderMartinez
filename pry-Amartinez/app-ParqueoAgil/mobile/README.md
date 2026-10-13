# ParqueoÁgil — App móvil (Flutter)

App de los conductores de ParqueoÁgil. Reemplaza el tiquete de papel por un QR dinámico en el celular: el conductor elige con qué vehículo entra, la portería lee su QR con la cámara, le asigna un espacio y, al salir, cobra por fracciones de 15 minutos.

La app funciona en dos modos (ver [Modos](#modos)): **conectada al backend**, donde los datos y los cambios quedan guardados en MySQL, o **demo**, sin servidor, para presentaciones sin internet.

Proyecto de clase (Uniguajira, 2026-II). Hace parte del sistema completo descrito en el [README de la raíz](../README.md).

## Modos

| | Conectado al servidor | Demo sin servidor |
|---|---|---|
| Cómo se entra | Iniciar sesión o crear la cuenta de conductor en la pantalla de bienvenida | Botón *Probar sin servidor (modo demo)* |
| Datos | En el backend (MySQL): vehículos, preferencias, tarjeta e historial | En memoria; se reinicia al cerrar la app |
| QR | Firmado con la clave que entrega el servidor | Firmado con una clave fija de la demo |
| Asignación de espacio y cobro | Los calcula el backend | Los calcula la app |
| Terminal de la portería | Es el panel web: la app no simula entradas ni pagos | Terminal simulada en la app, con cámara |
| Actualización | En vivo por SSE (`GET /api/events`) | No aplica: cada celular tiene su propio estado |
| Servicio | `RemoteParkingService` (`lib/services/remote_parking_service.dart`) | `ParkingService` (`lib/services/parking_service.dart`) |

`RemoteParkingService` extiende `ParkingService`, así que las pantallas son las mismas en los dos modos.

### Modo conectado al servidor

- **Sesión.** El refresh token se guarda en el almacenamiento seguro del sistema (Keystore en Android, Keychain en iOS) mediante `lib/services/api/session_store.dart`. El access token vive solo en memoria, dura 15 min y se renueva con `POST /api/sesion/refresh` (`lib/services/api/api_client.dart`). Si hay una sesión guardada, la app entra directo al abrirse.
- **QR.** La clave para firmar el QR la entrega el servidor en `GET /api/me`. El formato es el mismo del modo demo (`PQA1.<vehículo>.<ventana>.<contador>.<firma>`): cambia cada 30 s y también después de cada entrada o salida.
- **Tiempo real.** `lib/services/api/live_events.dart` mantiene abierto `GET /api/events`. Si la conexión se cae, reintenta con espera creciente (1, 2, 4… hasta 15 s). Como respaldo, la app vuelve a consultar el estado cada minuto.
- **Flutter web.** El navegador no entrega SSE por partes con el paquete `http`, así que en web la app consulta el estado cada 10 s.
- **Dirección del servidor.** Se cambia en la pantalla de bienvenida, con el botón *Servidor* → *Dirección de la API*. El valor por defecto es `defaultServerUrl` en `lib/screens/welcome_screen.dart` (`http://localhost:3003/api`).

### Modo demo

Todo vive en memoria, dentro de `ParkingService`: estado del parqueadero, terminal simulada, cámara y pagos simulados. No necesita red. Los pasos de la demo están más abajo.

## Cómo ejecutarlo

Requisitos: Flutter SDK 3.x (`flutter --version` para confirmar). Para el modo conectado, el backend debe estar corriendo (ver [`../backend/README.md`](../backend/README.md) y el orden de la [raíz](../README.md)).

1. Desde la carpeta `mobile/`:
   ```bash
   flutter pub get
   flutter run
   ```
2. Para el modo conectado, elegir la dirección del servidor según cómo se conecte el celular:

   | Dónde corre la app | Dirección de la API |
   |---|---|
   | Celular por USB | `http://localhost:3003/api`, con `adb reverse tcp:3003 tcp:3003` |
   | Emulador de Android | `http://10.0.2.2:3003/api` |
   | Celular en la misma Wi-Fi | `http://IP_DEL_COMPUTADOR:3003/api` |

   Si la app corre en el navegador, su origen debe estar en `CORS_ORIGINS` del backend (el `.env.example` incluye `http://localhost:8765`).
3. En el navegador: `flutter run -d chrome`. La cámara funciona en Android, iOS, macOS y web (pide permiso la primera vez). En Windows y Linux de escritorio no hay cámara compatible y se usa la simulación.

## Demo sin servidor (modo demo)

Estos pasos funcionan solo en el modo demo.

- **Con un solo celular:** en *Mi QR* elige el vehículo y toca *Simular lectura en la terminal*. Se abre la terminal como si hubiera leído ese QR: entrada (con espacio asignado) o salida (cobro y recibo).
- **Con dos celulares:** en el celular B abre la terminal (icono de caja arriba a la derecha o *Abrir terminal con cámara*) y apunta al QR que muestra el celular A. Como no hay servidor, cada celular guarda su propio estado: los vehículos de ejemplo son los mismos, así que la identificación funciona, pero lo que pasa en B no se ve en A.
- **Casos de error:** en la terminal, *Simular lectura* tiene botones para un QR vencido, alterado o de otra app, y un campo para pegar cualquier contenido.

Para la demo con el panel web y el backend, ver la sección *Demo sugerida para la clase* del [README de la raíz](../README.md).

## Estructura

```
lib/
  main.dart                    -> punto de entrada: bienvenida, modo conectado o demo; tema oscuro
  models/
    user_account.dart          -> usuario (1) con documento y celular enmascarados
    vehicle.dart               -> vehículo (N): id estable, placa, carro/moto
    parking_zone.dart          -> zona (piso, posición, tipo de vehículo)
    parking_spot.dart          -> espacio individual (fila/columna, SpotStatus)
    parking_session.dart       -> sesión de parqueo (entrada/salida)
    tariff.dart                -> cobro por fracciones + redondeo al cambio
    payment_method.dart        -> clase abstracta PaymentMethod y 4 métodos
    saved_card.dart            -> tarjeta guardada (solo token)
    receipt.dart               -> recibo digital
  services/
    parking_service.dart       -> servicio del modo demo: estado, terminal, pagos (en memoria)
    remote_parking_service.dart -> servicio del modo conectado: mismas pantallas, datos del backend
    access_code.dart           -> QR firmado (HMAC) que cambia cada 30 s
    spot_assigner.dart         -> asignación automática de espacio (modo demo)
    payment_gateway.dart       -> pasarela de pagos simulada (tokens de prueba)
    api/
      api_client.dart          -> cliente HTTP: rutas, Bearer, renovación de token, ApiException
      session_store.dart       -> refresh token y dirección del servidor en almacenamiento seguro
      live_events.dart         -> cliente SSE de GET /api/events, con reintentos
  data/
    mock_data.dart             -> datos de ejemplo del modo demo (tarifas, zonas, usuario)
  screens/
    welcome_screen.dart        -> bienvenida: iniciar sesión, crear cuenta o modo demo
    home_shell.dart            -> escucha el servicio + barra de navegación
    my_qr_screen.dart          -> QR del usuario y elección del vehículo
    terminal_screen.dart       -> terminal de la puerta (solo modo demo)
    map_screen.dart            -> plano por piso y zona
    zones_screen.dart          -> zonas y espacio preferidos
    payment_screen.dart        -> método de pago, tarjeta, tarifas, historial
    profile_screen.dart        -> datos personales y vehículos
  widgets/
    status_badge.dart, info_banner.dart
```

## Reglas de negocio implementadas

- **QR de acceso:** `PQA1.<vehículo>.<ventana>.<contador>.<firma>`. Se renueva cada 30 s, va firmado con la clave del conductor (HMAC-SHA256) y cambia después de cada entrada o salida. La terminal rechaza QR vencidos, alterados, ya usados o de otras apps. La placa sola nunca abre la barrera.
- **Ingreso:** asignación automática: espacio preferido si está libre; si no, el libre más cercano en las zonas preferidas (hasta 3, en orden de prioridad); si están llenas, el más cercano en cualquier zona (prefiere el mismo piso). Las motos van a su zona. En modo conectado, esta regla la aplica el backend.
- **Cobro (`Tariff`):** por fracciones de 15 minutos (cada fracción que empieza se cobra completa), aproximado a los $100 más cercanos. Tarifa distinta para carro y moto. Gracia, fracción y redondeo son configurables (si una alcaldía exige cobro por minuto: `minutesPerFraction: 1`). El valor queda fijo cuando la terminal lee el QR de salida.
- **Pagos (simulados):** efectivo con cálculo de cambio, tarjeta en datáfono, QR de cobro (Bre-B, Nequi o Daviplata) y cobro automático con tarjeta guardada. La tarjeta se tokeniza en la pasarela simulada y la app solo conserva el token. En modo conectado, el servidor guarda únicamente el token, la marca y los últimos 4 dígitos. Una tarjeta de prueba (terminada en 0002) siempre se rechaza, para mostrar el manejo de errores.
- **Perfil:** un usuario con varios vehículos (carro o moto), placas validadas con el formato colombiano y sin duplicados. No se puede cambiar la placa ni el tipo de un vehículo que está dentro.

## Pruebas

`flutter test` ejecuta 46 pruebas:

| Archivo | Qué prueba | Pruebas |
|---|---|---:|
| `test/access_code_test.dart` | QR firmado, ventanas de 30 s y QR alterados | 7 |
| `test/tariff_test.dart` | Cobro por fracciones y redondeo | 8 |
| `test/spot_assigner_test.dart` | Asignación automática de espacio | 10 |
| `test/parking_service_test.dart` | Entrada y salida, pagos y perfil (modo demo) | 14 |
| `test/remote_parking_service_test.dart` | Modo conectado contra un servidor simulado (`FakeBackend`), con las respuestas de [`docs/API-INTEGRACION.md`](../docs/API-INTEGRACION.md) | 6 |
| `test/widget_test.dart` | Flujo completo de la interfaz | 1 |

## Fuera de alcance (prototipo)

- **Modo demo:** no hay sincronización entre celulares. El estado vive en memoria y se reinicia al cerrar la app.
- **Clave de firma:** en el modo demo es fija. En el modo conectado la entrega el servidor (`GET /api/me`).
- **Flutter web:** la actualización es por intervalos (10 s), no por SSE.
- **Transporte:** la API se usa por HTTP sin TLS. Sirve para la demo en red local, no para producción.
- **NFC:** simulado (fase 2: Android con HCE).
- **Identidad:** la confirmación para ver datos completos es un diálogo, no biometría real (`local_auth`).
- **Pagos:** la pasarela y el QR de cobro son simulados. No hay integración con Wompi, ePayco, Mercado Pago ni Bre-B, y la tokenización de la tarjeta también es simulada.
