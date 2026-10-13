import 'package:flutter_test/flutter_test.dart';
import 'package:parqueoagil/models/tariff.dart';

void main() {
  group('Tariff - fracciones de 15 minutos', () {
    const tariff = Tariff(pricePerFraction: 1250);

    test('cada fraccion iniciada se cobra completa', () {
      expect(tariff.fractions(Duration.zero), 0);
      expect(tariff.fractions(const Duration(seconds: 1)), 1);
      expect(tariff.fractions(const Duration(minutes: 15)), 1);
      expect(tariff.fractions(const Duration(minutes: 15, seconds: 1)), 2);
      expect(tariff.fractions(const Duration(hours: 1, minutes: 30)), 6);
    });

    test('valor por hora derivado de la fraccion', () {
      expect(tariff.pricePerHour, 5000);
    });

    test('aproxima al cambio mas cercano (hacia arriba o abajo)', () {
      // 1h 45m = 7 fracciones = 8.750 -> 8.800
      expect(tariff.subtotal(const Duration(hours: 1, minutes: 45)), 8750);
      expect(tariff.amountFor(const Duration(hours: 1, minutes: 45)), 8800);
      // 1h 30m = 6 fracciones = 7.500 exacto, no se toca
      expect(tariff.amountFor(const Duration(hours: 1, minutes: 30)), 7500);
    });
  });

  group('Tariff - modos de redondeo', () {
    test('nearest, down y up', () {
      const nearest = Tariff(pricePerFraction: 1000);
      const down = Tariff(pricePerFraction: 1000, roundingMode: RoundingMode.down);
      const up = Tariff(pricePerFraction: 1000, roundingMode: RoundingMode.up);
      expect(nearest.round(8740), 8700);
      expect(nearest.round(8750), 8800);
      expect(down.round(8790), 8700);
      expect(up.round(8710), 8800);
      expect(up.round(8700), 8700);
    });

    test('denominacion de \$50', () {
      const tariff = Tariff(pricePerFraction: 1000, roundTo: 50);
      expect(tariff.round(8720), 8700);
      expect(tariff.round(8730), 8750);
    });
  });

  group('Tariff - configuraciones alternativas', () {
    test('minutos de gracia: salir antes no cuesta nada', () {
      const tariff = Tariff(pricePerFraction: 1250, graceMinutes: 10);
      expect(tariff.amountFor(const Duration(minutes: 10)), 0);
      expect(tariff.amountFor(const Duration(minutes: 11)), 1300); // 1.250 -> 1.300
    });

    test('cobro por minuto (si la alcaldia lo exige)', () {
      const perMinute = Tariff(pricePerFraction: 90, minutesPerFraction: 1);
      // 47 min 10 s = 48 minutos iniciados x $90 = 4.320 -> 4.300
      expect(perMinute.fractions(const Duration(minutes: 47, seconds: 10)), 48);
      expect(perMinute.amountFor(const Duration(minutes: 47, seconds: 10)), 4300);
    });
  });

  test('formatCop usa punto como separador de miles', () {
    expect(formatCop(0), '\$0');
    expect(formatCop(800), '\$800');
    expect(formatCop(8800), '\$8.800');
    expect(formatCop(1250000), '\$1.250.000');
  });
}
