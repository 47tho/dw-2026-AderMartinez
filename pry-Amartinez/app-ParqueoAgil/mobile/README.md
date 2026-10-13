# ParqueoAgil (prototipo movil - Flutter)

Prototipo funcional en Flutter de la app movil de usuarios para el
proyecto de parqueaderos, hecho como trabajo parcial de la asignatura
Desarrollo Movil. Reemplaza el tiquete de papel por un QR dinamico en
el celular: el usuario elige con que vehiculo entra, una terminal en la
puerta lee su QR (con la camara), le asigna espacio automaticamente y
al salir cobra por fracciones de 15 minutos. No hay backend real: un
servicio en memoria simula el servidor.

## Como ejecutarlo

1. Tener Flutter SDK instalado (`flutter --version` para confirmar).
2. Desde la carpeta del proyecto:
   ```
   flutter pub get
   flutter run
   ```
3. Se puede correr en un emulador/celular Android o iOS, o en Chrome
   (`flutter run -d chrome`). La camara funciona en Android, iOS, macOS
   y web (pide permiso la primera vez); en Windows/Linux de escritorio
   no hay camara compatible y se usa la simulacion.

## Como hacer la demo

- **Con un solo celular:** en "Mi QR" elige el vehiculo y toca
  *Simular lectura en la terminal*. Se abre la terminal como si hubiera
  leido ese QR: entrada (espacio asignado) o salida (cobro y recibo).
- **Con dos celulares:** en el celular B abre la terminal (icono de caja
  arriba a la derecha o *Abrir terminal con camara*) y apunta al QR que
  muestra el celular A. Como no hay servidor, cada celular guarda su
  propio estado: los vehiculos de ejemplo son los mismos, asi que la
  identificacion funciona, pero lo que pasa en B no se ve en A.
- **Casos de error:** en la terminal, *Simular lectura* tiene botones
  para un QR vencido, alterado o de otra app, y un campo para pegar
  cualquier contenido.

## Estructura

```
lib/
  main.dart                  -> punto de entrada, tema oscuro
  models/
    user_account.dart        -> usuario (1) con documento y celular enmascarados
    vehicle.dart             -> vehiculo (N): id estable, placa, carro/moto
    parking_zone.dart        -> zona (piso, posicion, tipo de vehiculo)
    parking_spot.dart        -> espacio individual (fila/columna, SpotStatus)
    parking_session.dart     -> sesion de parqueo (entrada/salida)
    tariff.dart              -> cobro por fracciones + redondeo al cambio
    payment_method.dart      -> clase abstracta PaymentMethod y 4 metodos
    saved_card.dart          -> tarjeta guardada (solo token)
    receipt.dart             -> recibo digital
  services/
    parking_service.dart     -> "backend" simulado: estado, terminal, pagos
    access_code.dart         -> QR firmado (HMAC) que cambia cada 30 s
    spot_assigner.dart       -> asignacion automatica de espacio
    payment_gateway.dart     -> pasarela de pagos simulada (tokens de prueba)
  data/
    mock_data.dart           -> datos de ejemplo (tarifas, zonas, usuario)
  screens/
    home_shell.dart          -> escucha el servicio + barra de navegacion
    my_qr_screen.dart        -> QR del usuario y eleccion del vehiculo
    terminal_screen.dart     -> terminal de la puerta: camara, simulacion, cobro
    map_screen.dart          -> plano por piso y zona
    zones_screen.dart        -> zonas y espacio preferidos
    payment_screen.dart      -> metodo de pago, tarjeta, tarifas, historial
    profile_screen.dart      -> datos personales y vehiculos
  widgets/
    status_badge.dart, info_banner.dart
```

## Reglas de negocio implementadas

- **QR de acceso:** `PQA1.<vehiculo>.<ventana>.<contador>.<firma>`. Se
  renueva cada 30 s, va firmado con la clave del usuario (HMAC-SHA256) y
  cambia despues de cada entrada/salida. La terminal rechaza QR
  vencidos, alterados, ya usados o de otras apps. La placa sola nunca
  abre la barrera.
- **Ingreso:** asignacion automatica (`SpotAssigner`): espacio preferido
  si esta libre; si no, el libre mas cercano en las zonas preferidas
  (hasta 3, en orden de prioridad); si estan llenas, el mas cercano en
  cualquier zona (prefiere el mismo piso). Las motos van a su zona.
- **Cobro (`Tariff`):** por fracciones de 15 minutos (cada fraccion que
  empieza se cobra completa), aproximado a los $100 mas cercanos. Tarifa
  distinta para carro y moto. Gracia, fraccion y redondeo configurables
  (si una alcaldia exige cobro por minuto: `minutesPerFraction: 1`). El
  valor queda fijo cuando la terminal lee el QR de salida.
- **Pagos (simulados):** efectivo con calculo de cambio, tarjeta en
  datafono, QR de cobro (Bre-B/Nequi/Daviplata) y cobro automatico con
  tarjeta guardada. La tarjeta se "guarda" en la pasarela simulada y la
  app solo conserva el token; hay una tarjeta de prueba que siempre se
  rechaza para mostrar el manejo de errores.
- **Perfil:** un usuario con varios vehiculos (carro o moto), placas
  validadas con el formato colombiano y sin duplicados. No se puede
  cambiar la placa ni el tipo de un vehiculo que esta dentro.

Pruebas: `flutter test` (QR, cobro, asignacion, entrada/salida, pagos,
perfil y un flujo completo de interfaz).

## Fuera de alcance (por ser un prototipo)

- No hay backend real ni sincronizacion entre celulares: el estado vive
  en memoria (`ParkingService`) y se reinicia al cerrar la app.
- La clave para firmar el QR es fija para la demo; en produccion se
  genera al registrarse y se guarda en almacenamiento seguro.
- NFC esta simulado (fase 2: Android con HCE).
- La confirmacion de identidad para ver datos completos es un dialogo,
  no biometria real (`local_auth`).
- La pasarela y el QR de cobro son simulados: no hay integracion con
  Wompi, ePayco, Mercado Pago ni Bre-B.
