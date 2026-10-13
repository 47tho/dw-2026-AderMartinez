/** Tipos del contrato de la API (docs/API-INTEGRACION.md). */

export type VehicleKind = 'car' | 'motorcycle' | 'van';
export type PaymentMethodCode = 'cash' | 'card' | 'qr' | 'auto';
export type SpotStatus = 'free' | 'occupied' | 'blocked';

export interface Page<T> {
  items: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export interface SessionTokens {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  refresh_token: string;
  refresh_expires_in: number;
}

export interface Profile {
  id: number;
  username: string;
  email: string;
  avatar: string | null;
  status: 'active' | 'inactive';
}

export interface Permission {
  method: string;
  path: string;
  description?: string;
}

export interface Zone {
  id: number;
  name: string;
  vehicleTypeId: number;
  capacity: number;
  availableSpots: number;
  hourlyRate: number;
  status: string;
  code: string | null;
  floor: number;
  position: number;
  color: string | null;
}

export interface VehicleType {
  id: number;
  name: string;
  hourlyRate: number;
  description: string | null;
  status: string;
}

export interface Spot {
  id: number;
  code: string;
  zoneId: number;
  row: number;
  column: number;
  status: SpotStatus;
}

export interface Vehicle {
  id: number;
  plate: string;
  vehicleTypeId: number;
  kind: VehicleKind;
  description: string | null;
  gateCounter: number;
  activeTicket: { id: number; spotCode: string | null; zoneId: number; entryAt: string } | null;
}

export interface Ticket {
  id: number;
  clientId: number;
  parkingZoneId: number;
  entryAt: string;
  exitAt: string | null;
  hours: number;
  hourlyRate: number;
  subtotal: number;
  tax: number;
  discounts: number;
  total: number;
  status: 'open' | 'closed';
  vehicleId: number | null;
  plate: string | null;
  parkingSpotId: number | null;
  spotCode: string | null;
  channel: 'qr' | 'manual' | 'api';
  fractions: number;
  minutesPerFraction: number;
  pricePerFraction: number;
  quotedAt: string | null;
  paymentMethod: PaymentMethodCode | null;
  amountReceived: number | null;
  change: number | null;
  paymentRef: string | null;
  authorization: string | null;
  cardLabel: string | null;
}

export interface Quote {
  quotedAt: string;
  minutes: number;
  fractions: number;
  minutesPerFraction: number;
  pricePerFraction: number;
  subtotal: number;
  total: number;
}

export interface GateEntry {
  kind: 'entry';
  ticket: Ticket;
  vehicle: Vehicle;
  driverName: string;
  spot: Spot | null;
  zone: Zone;
  reason: string;
}

export interface GateExit {
  kind: 'exit';
  ticket: Ticket;
  vehicle: Vehicle;
  driverName: string;
  quote: Quote;
  preferredPaymentMethod: PaymentMethodCode;
  savedCard: { label: string } | null;
}

export type GateResult = GateEntry | GateExit;

export interface DriverRow {
  id: number;
  clientId: number;
  name: string;
  email: string | null;
  phone: string | null;
  docType: string;
  docNumber: string;
  paymentMethod: PaymentMethodCode;
  hasCard: boolean;
  vehicles: { id: number; plate: string; kind: VehicleKind }[];
  activeTickets: number;
  createdAt: string;
}

export interface Summary {
  generatedAt: string;
  occupancy: {
    capacity: number;
    occupied: number;
    blocked: number;
    free: number;
    zones: {
      id: number;
      code: string | null;
      name: string;
      floor: number;
      color: string | null;
      capacity: number;
      occupied: number;
      blocked: number;
    }[];
  };
  today: {
    entries: number;
    exits: number;
    revenue: number;
    byMethod: Record<PaymentMethodCode | 'other', number>;
    avgMinutes: number;
  };
  entriesByHour: number[];
}

/** Usuarios del personal (`/api/usuarios`). */
export interface StaffUser {
  id: number;
  username: string;
  email: string;
  avatar: string | null;
  status: 'active' | 'inactive';
}

export interface Role {
  id: number;
  name: string;
  description: string | null;
  status: 'active' | 'inactive';
}

/** Eventos del flujo SSE `/api/events`. */
export type LiveEvent =
  | { type: 'spot.updated'; data: Spot }
  | { type: 'zone.updated'; data: { id: number; availableSpots: number; capacity: number } }
  | { type: 'ticket.opened' | 'ticket.quoted' | 'ticket.closed'; data: Ticket };

export const PAYMENT_LABELS: Record<PaymentMethodCode, string> = {
  cash: 'Efectivo',
  card: 'Tarjeta (datáfono)',
  qr: 'QR Bre-B / Nequi / Daviplata',
  auto: 'Cobro automático',
};

export const KIND_LABELS: Record<VehicleKind, string> = {
  car: 'Carro',
  motorcycle: 'Moto',
  van: 'Camioneta',
};
