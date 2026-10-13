/**
 * Regla de cobro del parqueadero.
 *
 * Se cobra por fracciones (por defecto de 15 minutos): cualquier fracción que
 * ya empezó se cobra completa. El total se aproxima al múltiplo de
 * `roundTo` más cercano (por defecto $100) para que el pago en efectivo no
 * dependa de monedas que casi no circulan.
 *
 * Todo se configura por `.env` porque en Colombia las tarifas las regula cada
 * alcaldía: `TARIFF_MINUTES_PER_FRACTION=60` vuelve al cobro por hora y `=1`
 * cobra por minuto.
 */
export interface TariffSettings {
  minutesPerFraction: number;
  graceMinutes: number;
  roundTo: number;
}

export interface TariffQuote {
  minutes: number;
  fractions: number;
  minutesPerFraction: number;
  pricePerFraction: number;
  subtotal: number;
  total: number;
}

function intFromEnv(value: string | undefined, fallback: number, min: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isInteger(parsed) && parsed >= min ? parsed : fallback;
}

export function tariffSettingsFromEnv(env: NodeJS.ProcessEnv = process.env): TariffSettings {
  return {
    minutesPerFraction: intFromEnv(env.TARIFF_MINUTES_PER_FRACTION, 15, 1),
    graceMinutes: intFromEnv(env.TARIFF_GRACE_MINUTES, 0, 0),
    roundTo: intFromEnv(env.TARIFF_ROUND_TO, 100, 1),
  };
}

export class TicketCalculator {
  /** Sin configuración explícita se lee el `.env` en cada cálculo. */
  constructor(private readonly fixedSettings?: TariffSettings) {}

  get settings(): TariffSettings {
    return this.fixedSettings ?? tariffSettingsFromEnv();
  }

  /**
   * Calcula horas transcurridas (redondeo hacia arriba, mínimo 1 hora).
   */
  hoursBetween(entryAt: Date, exitAt: Date): number {
    const ms = exitAt.getTime() - entryAt.getTime();
    if (ms <= 0) return 1;
    const hours = ms / (1000 * 60 * 60);
    return Math.max(1, Math.ceil(hours));
  }

  subtotal(hours: number, hourlyRate: number): number {
    return hours * hourlyRate;
  }

  total(subtotal: number, tax: number, discounts: number): number {
    const t = subtotal + tax - discounts;
    return t < 0 ? 0 : t;
  }

  // ── Cobro por fracciones ─────────────────────────────────────

  /** Precio de una fracción a partir de la tarifa por hora de la zona. */
  pricePerFraction(hourlyRate: number): number {
    return Math.round((hourlyRate * this.settings.minutesPerFraction) / 60);
  }

  /** 15:00 → 1 fracción, 15:01 → 2 fracciones. Dentro de la gracia → 0. */
  fractionsBetween(entryAt: Date, exitAt: Date): number {
    const { minutesPerFraction, graceMinutes } = this.settings;
    const seconds = Math.floor((exitAt.getTime() - entryAt.getTime()) / 1000);
    if (seconds <= 0 || seconds <= graceMinutes * 60) return 0;
    const fractionSeconds = minutesPerFraction * 60;
    return Math.ceil(seconds / fractionSeconds);
  }

  /** Aproxima al cambio más cercano (hacia arriba o hacia abajo). */
  roundToChange(value: number): number {
    const { roundTo } = this.settings;
    if (roundTo <= 1) return Math.round(value);
    const remainder = value % roundTo;
    if (remainder === 0) return value;
    const down = value - remainder;
    return remainder * 2 >= roundTo ? down + roundTo : down;
  }

  /** Cotización completa de una estadía. */
  quote(entryAt: Date, exitAt: Date, hourlyRate: number): TariffQuote {
    const fractions = this.fractionsBetween(entryAt, exitAt);
    const pricePerFraction = this.pricePerFraction(hourlyRate);
    const subtotal = fractions * pricePerFraction;
    return {
      minutes: Math.max(0, Math.floor((exitAt.getTime() - entryAt.getTime()) / 60000)),
      fractions,
      minutesPerFraction: this.settings.minutesPerFraction,
      pricePerFraction,
      subtotal,
      total: this.roundToChange(subtotal),
    };
  }
}
