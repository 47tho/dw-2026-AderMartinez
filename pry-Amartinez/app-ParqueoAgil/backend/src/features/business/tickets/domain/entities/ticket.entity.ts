export type TicketStatus = 'open' | 'closed';
export type TicketChannel = 'qr' | 'manual' | 'api';

/** Campos de la integración con la app y la portería (todos opcionales). */
export interface TicketExtras {
  vehicleId?: number | null;
  plate?: string | null;
  parkingSpotId?: number | null;
  spotCode?: string | null;
  channel?: TicketChannel;
  fractions?: number;
  minutesPerFraction?: number;
  pricePerFraction?: number;
  quotedAt?: Date | null;
  paymentMethod?: string | null;
  amountReceived?: number | null;
  change?: number | null;
  paymentRef?: string | null;
  authorization?: string | null;
  cardLabel?: string | null;
}

export interface TicketProps extends TicketExtras {
  id?: number | null;
  clientId: number;
  parkingZoneId: number;
  entryAt: Date;
  exitAt?: Date | null;
  hours?: number;
  hourlyRate: number;
  subtotal: number;
  tax: number;
  discounts: number;
  total: number;
  status?: TicketStatus;
}

export class Ticket {
  readonly id: number | null;
  readonly clientId: number;
  readonly parkingZoneId: number;
  readonly entryAt: Date;
  readonly exitAt: Date | null;
  readonly hours: number;
  readonly hourlyRate: number;
  readonly subtotal: number;
  readonly tax: number;
  readonly discounts: number;
  readonly total: number;
  readonly status: TicketStatus;
  readonly vehicleId: number | null;
  readonly plate: string | null;
  readonly parkingSpotId: number | null;
  readonly spotCode: string | null;
  readonly channel: TicketChannel;
  readonly fractions: number;
  readonly minutesPerFraction: number;
  readonly pricePerFraction: number;
  readonly quotedAt: Date | null;
  readonly paymentMethod: string | null;
  readonly amountReceived: number | null;
  readonly change: number | null;
  readonly paymentRef: string | null;
  readonly authorization: string | null;
  readonly cardLabel: string | null;

  constructor(props: TicketProps) {
    this.id = props.id ?? null;
    this.clientId = props.clientId;
    this.parkingZoneId = props.parkingZoneId;
    this.entryAt = props.entryAt;
    this.exitAt = props.exitAt ?? null;
    this.hours = props.hours ?? 0;
    this.hourlyRate = props.hourlyRate;
    this.subtotal = props.subtotal;
    this.tax = props.tax;
    this.discounts = props.discounts;
    this.total = props.total;
    this.status = props.status ?? 'open';
    this.vehicleId = props.vehicleId ?? null;
    this.plate = props.plate ?? null;
    this.parkingSpotId = props.parkingSpotId ?? null;
    this.spotCode = props.spotCode ?? null;
    this.channel = props.channel ?? 'api';
    this.fractions = props.fractions ?? 0;
    this.minutesPerFraction = props.minutesPerFraction ?? 0;
    this.pricePerFraction = props.pricePerFraction ?? 0;
    this.quotedAt = props.quotedAt ?? null;
    this.paymentMethod = props.paymentMethod ?? null;
    this.amountReceived = props.amountReceived ?? null;
    this.change = props.change ?? null;
    this.paymentRef = props.paymentRef ?? null;
    this.authorization = props.authorization ?? null;
    this.cardLabel = props.cardLabel ?? null;
  }
}
