/// Como se aproxima el total al "cambio" mas cercano.
/// - nearest: a la denominacion mas cercana (hacia arriba o abajo).
/// - down: siempre a favor del usuario.
/// - up: siempre a favor del parqueadero.
enum RoundingMode { nearest, down, up }

/// Regla de cobro del parqueadero.
///
/// Se cobra por fracciones (por defecto de 15 minutos): cualquier
/// fraccion que ya empezo se cobra completa. El total se aproxima a
/// la denominacion de cambio mas cercana (por defecto $100) para que
/// el pago en efectivo no dependa de monedas que casi no circulan.
///
/// Todo es configurable porque en Colombia las tarifas las fija cada
/// alcaldia: si un municipio exige cobro por minuto basta con usar
/// minutesPerFraction = 1, sin tocar el resto de la app.
class Tariff {
  final int pricePerFraction; // pesos (COP) por fraccion
  final int minutesPerFraction;
  final int graceMinutes; // si no se superan, la salida es gratis
  final int roundTo; // denominacion de cambio, ej. 100 o 50
  final RoundingMode roundingMode;

  const Tariff({
    required this.pricePerFraction,
    this.minutesPerFraction = 15,
    this.graceMinutes = 0,
    this.roundTo = 100,
    this.roundingMode = RoundingMode.nearest,
  });

  int get pricePerHour => pricePerFraction * 60 ~/ minutesPerFraction;

  /// Numero de fracciones a cobrar. Ej. con fracciones de 15 min:
  /// 15:00 -> 1 fraccion, 15:01 -> 2 fracciones.
  int fractions(Duration elapsed) {
    final seconds = elapsed.inSeconds;
    if (seconds <= 0 || seconds <= graceMinutes * 60) return 0;
    final fractionSeconds = minutesPerFraction * 60;
    return (seconds + fractionSeconds - 1) ~/ fractionSeconds;
  }

  /// Valor sin redondear (fracciones x precio).
  int subtotal(Duration elapsed) => fractions(elapsed) * pricePerFraction;

  /// Valor final a cobrar, ya aproximado al cambio.
  int amountFor(Duration elapsed) => round(subtotal(elapsed));

  int round(int value) {
    if (roundTo <= 1) return value;
    final remainder = value % roundTo;
    if (remainder == 0) return value;
    final down = value - remainder;
    switch (roundingMode) {
      case RoundingMode.down:
        return down;
      case RoundingMode.up:
        return down + roundTo;
      case RoundingMode.nearest:
        return remainder * 2 >= roundTo ? down + roundTo : down;
    }
  }
}

/// Formatea pesos colombianos con separador de miles: 8800 -> $8.800
String formatCop(int value) {
  final digits = value.abs().toString();
  final buffer = StringBuffer();
  for (var i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 == 0) buffer.write('.');
    buffer.write(digits[i]);
  }
  return '${value < 0 ? '-' : ''}\$$buffer';
}
