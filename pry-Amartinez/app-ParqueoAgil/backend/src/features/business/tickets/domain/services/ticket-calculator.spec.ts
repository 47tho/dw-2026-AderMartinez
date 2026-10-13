import { describe, expect, it } from 'vitest';
import { TicketCalculator, tariffSettingsFromEnv } from './ticket-calculator.js';

const MINUTE = 60_000;
const entry = new Date(Date.UTC(2026, 9, 5, 12, 0, 0));

/** Salida `minutes` minutos y `seconds` segundos después de la entrada. */
function exitAfter(minutes: number, seconds = 0): Date {
  return new Date(entry.getTime() + minutes * MINUTE + seconds * 1000);
}

const defaultSettings = { minutesPerFraction: 15, graceMinutes: 0, roundTo: 100 };

describe('TicketCalculator', () => {
  const calc = new TicketCalculator(defaultSettings);

  describe('fractionsBetween', () => {
    it('15:00 exactos son 1 fracción', () => {
      expect(calc.fractionsBetween(entry, exitAfter(15))).toBe(1);
    });

    it('15:01 son 2 fracciones (la fracción que empezó se cobra completa)', () => {
      expect(calc.fractionsBetween(entry, exitAfter(15, 1))).toBe(2);
    });

    it('0 segundos son 0 fracciones', () => {
      expect(calc.fractionsBetween(entry, entry)).toBe(0);
    });

    it('1 segundo ya cuenta como 1 fracción cuando no hay gracia', () => {
      expect(calc.fractionsBetween(entry, exitAfter(0, 1))).toBe(1);
    });

    it('1h30m son 6 fracciones', () => {
      expect(calc.fractionsBetween(entry, exitAfter(90))).toBe(6);
    });

    it('una salida anterior a la entrada son 0 fracciones', () => {
      expect(calc.fractionsBetween(entry, exitAfter(-10))).toBe(0);
    });

    it('con gracia de 10 min, 9:59 cuesta 0 fracciones', () => {
      const graceCalc = new TicketCalculator({ ...defaultSettings, graceMinutes: 10 });
      expect(graceCalc.fractionsBetween(entry, exitAfter(9, 59))).toBe(0);
    });

    it('con gracia de 10 min, 10:00 exactos todavía cuestan 0 y 10:01 cuesta 1', () => {
      const graceCalc = new TicketCalculator({ ...defaultSettings, graceMinutes: 10 });
      expect(graceCalc.fractionsBetween(entry, exitAfter(10))).toBe(0);
      expect(graceCalc.fractionsBetween(entry, exitAfter(10, 1))).toBe(1);
    });

    it('la gracia no es un descuento: pasada la gracia se cobra todo el tiempo', () => {
      const graceCalc = new TicketCalculator({ ...defaultSettings, graceMinutes: 10 });
      // 20 min => ceil(20 / 15) = 2 fracciones, no ceil(10 / 15) = 1.
      expect(graceCalc.fractionsBetween(entry, exitAfter(20))).toBe(2);
    });

    it('con minutesPerFraction 60, 61 min son 2 fracciones y 60 min es 1', () => {
      const hourly = new TicketCalculator({ ...defaultSettings, minutesPerFraction: 60 });
      expect(hourly.fractionsBetween(entry, exitAfter(60))).toBe(1);
      expect(hourly.fractionsBetween(entry, exitAfter(61))).toBe(2);
    });
  });

  describe('pricePerFraction', () => {
    it('una fracción de 15 min a 3000/h cuesta 750', () => {
      expect(calc.pricePerFraction(3000)).toBe(750);
    });

    it('con fracciones de 60 min la fracción vale lo mismo que la hora', () => {
      const hourly = new TicketCalculator({ ...defaultSettings, minutesPerFraction: 60 });
      expect(hourly.pricePerFraction(3000)).toBe(3000);
    });

    it('con fracciones de 1 min la fracción es la hora dividida entre 60', () => {
      const perMinute = new TicketCalculator({ ...defaultSettings, minutesPerFraction: 1 });
      expect(perMinute.pricePerFraction(3000)).toBe(50);
    });

    it('redondea al entero más cercano cuando la división no es exacta', () => {
      // 1000 * 15 / 60 = 250 exacto; 2000 * 7 / 60 = 233.33 -> 233.
      const seven = new TicketCalculator({ ...defaultSettings, minutesPerFraction: 7 });
      expect(seven.pricePerFraction(2000)).toBe(233);
    });
  });

  describe('roundToChange', () => {
    it('4549 baja a 4500', () => {
      expect(calc.roundToChange(4549)).toBe(4500);
    });

    it('4550 sube a 4600 (la mitad sube)', () => {
      expect(calc.roundToChange(4550)).toBe(4600);
    });

    it('un múltiplo exacto no cambia', () => {
      expect(calc.roundToChange(4500)).toBe(4500);
      expect(calc.roundToChange(0)).toBe(0);
    });

    it('con roundTo 1 solo redondea al entero más cercano', () => {
      const exact = new TicketCalculator({ ...defaultSettings, roundTo: 1 });
      expect(exact.roundToChange(4549)).toBe(4549);
      expect(exact.roundToChange(4549.4)).toBe(4549);
      expect(exact.roundToChange(4549.6)).toBe(4550);
    });

    it('respeta otros múltiplos (roundTo 500)', () => {
      const five = new TicketCalculator({ ...defaultSettings, roundTo: 500 });
      expect(five.roundToChange(1249)).toBe(1000);
      expect(five.roundToChange(1250)).toBe(1500);
    });
  });

  describe('quote', () => {
    it('1h30m a 3000/h: 6 fracciones, subtotal 4500 y total 4500', () => {
      const q = calc.quote(entry, exitAfter(90), 3000);
      expect(q).toEqual({
        minutes: 90,
        fractions: 6,
        minutesPerFraction: 15,
        pricePerFraction: 750,
        subtotal: 4500,
        total: 4500,
      });
    });

    it('1h31m a 3000/h: 7 fracciones, subtotal 5250 y total 5300 (50 sube)', () => {
      const q = calc.quote(entry, exitAfter(91), 3000);
      expect(q.minutes).toBe(91);
      expect(q.fractions).toBe(7);
      expect(q.pricePerFraction).toBe(750);
      expect(q.subtotal).toBe(5250);
      expect(q.total).toBe(5300);
    });

    it('sin tiempo transcurrido todo es 0', () => {
      const q = calc.quote(entry, entry, 3000);
      expect(q.minutes).toBe(0);
      expect(q.fractions).toBe(0);
      expect(q.subtotal).toBe(0);
      expect(q.total).toBe(0);
    });

    it('si la salida es anterior a la entrada los minutos no son negativos', () => {
      const q = calc.quote(entry, exitAfter(-30), 3000);
      expect(q.minutes).toBe(0);
      expect(q.total).toBe(0);
    });

    it('los minutos se truncan (90 min y 59 s siguen siendo 90 min)', () => {
      const q = calc.quote(entry, exitAfter(90, 59), 3000);
      expect(q.minutes).toBe(90);
      // 90 min 59 s => 7 fracciones aunque se muestren 90 minutos.
      expect(q.fractions).toBe(7);
    });

    it('dentro de la gracia no cobra nada', () => {
      const graceCalc = new TicketCalculator({ ...defaultSettings, graceMinutes: 10 });
      const q = graceCalc.quote(entry, exitAfter(9, 59), 3000);
      expect(q.fractions).toBe(0);
      expect(q.subtotal).toBe(0);
      expect(q.total).toBe(0);
    });

    it('con cobro por hora (60 min) 61 min a 3000/h cobran 2 horas', () => {
      const hourly = new TicketCalculator({ ...defaultSettings, minutesPerFraction: 60 });
      const q = hourly.quote(entry, exitAfter(61), 3000);
      expect(q.fractions).toBe(2);
      expect(q.minutesPerFraction).toBe(60);
      expect(q.subtotal).toBe(6000);
      expect(q.total).toBe(6000);
    });
  });

  describe('métodos antiguos (cobro por hora)', () => {
    describe('hoursBetween', () => {
      it('una estadía exacta de 1 hora es 1 hora', () => {
        expect(calc.hoursBetween(entry, exitAfter(60))).toBe(1);
      });

      it('1h01m se redondea hacia arriba a 2 horas', () => {
        expect(calc.hoursBetween(entry, exitAfter(61))).toBe(2);
      });

      it('mínimo 1 hora aunque hayan pasado solo 5 minutos', () => {
        expect(calc.hoursBetween(entry, exitAfter(5))).toBe(1);
      });

      it('mínimo 1 hora con 0 ms y con salida anterior a la entrada', () => {
        expect(calc.hoursBetween(entry, entry)).toBe(1);
        expect(calc.hoursBetween(entry, exitAfter(-120))).toBe(1);
      });

      it('2h30m son 3 horas', () => {
        expect(calc.hoursBetween(entry, exitAfter(150))).toBe(3);
      });

      it('no depende de la configuración por fracciones', () => {
        const hourly = new TicketCalculator({ minutesPerFraction: 1, graceMinutes: 30, roundTo: 1000 });
        expect(hourly.hoursBetween(entry, exitAfter(90))).toBe(2);
      });
    });

    describe('subtotal', () => {
      it('es horas por tarifa', () => {
        expect(calc.subtotal(3, 3000)).toBe(9000);
        expect(calc.subtotal(0, 3000)).toBe(0);
      });
    });

    describe('total', () => {
      it('es subtotal más impuesto menos descuentos', () => {
        expect(calc.total(10000, 1900, 500)).toBe(11400);
      });

      it('nunca es negativo', () => {
        expect(calc.total(1000, 0, 5000)).toBe(0);
      });

      it('un descuento exacto deja el total en 0', () => {
        expect(calc.total(1000, 0, 1000)).toBe(0);
      });
    });
  });
});

describe('TicketCalculator sin configuración explícita', () => {
  it('lee la configuración de TARIFF_* del entorno en cada consulta', () => {
    const calc = new TicketCalculator();
    const names = ['TARIFF_MINUTES_PER_FRACTION', 'TARIFF_GRACE_MINUTES', 'TARIFF_ROUND_TO'] as const;
    const saved = names.map((n) => process.env[n]);
    try {
      process.env.TARIFF_MINUTES_PER_FRACTION = '30';
      process.env.TARIFF_GRACE_MINUTES = '5';
      process.env.TARIFF_ROUND_TO = '50';
      expect(calc.settings).toEqual({ minutesPerFraction: 30, graceMinutes: 5, roundTo: 50 });
      // 30 min a 3000/h: 1 fracción de 1500.
      expect(calc.quote(entry, exitAfter(30), 3000).total).toBe(1500);

      process.env.TARIFF_MINUTES_PER_FRACTION = '60';
      expect(calc.settings.minutesPerFraction).toBe(60);
    } finally {
      names.forEach((n, i) => {
        if (saved[i] === undefined) delete process.env[n];
        else process.env[n] = saved[i];
      });
    }
  });
});

describe('tariffSettingsFromEnv', () => {
  it('usa 15 / 0 / 100 cuando no hay variables', () => {
    expect(tariffSettingsFromEnv({})).toEqual({ minutesPerFraction: 15, graceMinutes: 0, roundTo: 100 });
  });

  it('lee los valores válidos del entorno', () => {
    expect(
      tariffSettingsFromEnv({
        TARIFF_MINUTES_PER_FRACTION: '60',
        TARIFF_GRACE_MINUTES: '10',
        TARIFF_ROUND_TO: '500',
      }),
    ).toEqual({ minutesPerFraction: 60, graceMinutes: 10, roundTo: 500 });
  });

  it('ignora valores inválidos o por debajo del mínimo y usa el valor por defecto', () => {
    expect(
      tariffSettingsFromEnv({
        TARIFF_MINUTES_PER_FRACTION: '0',
        TARIFF_GRACE_MINUTES: '-5',
        TARIFF_ROUND_TO: 'abc',
      }),
    ).toEqual({ minutesPerFraction: 15, graceMinutes: 0, roundTo: 100 });
  });

  it('acepta 0 como gracia pero no como minutos por fracción', () => {
    const s = tariffSettingsFromEnv({ TARIFF_GRACE_MINUTES: '0', TARIFF_MINUTES_PER_FRACTION: '0' });
    expect(s.graceMinutes).toBe(0);
    expect(s.minutesPerFraction).toBe(15);
  });
});
