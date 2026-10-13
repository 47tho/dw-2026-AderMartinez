import 'package:flutter/material.dart';
import 'tariff.dart';

/// Clase abstracta que define el contrato de un metodo de pago.
/// Cada metodo concreto implementa su propia presentacion visual.
/// calculateAmount() queda implementado aqui porque la formula es
/// igual para todos (fracciones de la tarifa), pero queda disponible
/// para sobrescribirse si un metodo nuevo necesita una logica distinta
/// (ej. tarifas planas, descuentos).
abstract class PaymentMethod {
  String get name;
  String get description;
  IconData get icon;
  Color get color;

  /// true si el pago se hace en la caja de salida (con el cajero);
  /// false si se cobra solo, sin que el usuario haga fila.
  bool get atCashier => true;

  int calculateAmount(Duration elapsed, Tariff tariff) => tariff.amountFor(elapsed);

  static final all = <PaymentMethod>[CashPayment(), CardPayment(), QrTransferPayment(), AutoChargePayment()];
}

class CashPayment extends PaymentMethod {
  @override
  String get name => 'Efectivo';

  @override
  String get description => 'Pagas en caja; el total se aproxima a \$100';

  @override
  IconData get icon => Icons.payments_outlined;

  @override
  Color get color => const Color(0xFF3DDC97);
}

class CardPayment extends PaymentMethod {
  @override
  String get name => 'Tarjeta en caja';

  @override
  String get description => 'Debito o credito en el datafono de la salida';

  @override
  IconData get icon => Icons.credit_card;

  @override
  Color get color => const Color(0xFF7C6CF0);
}

class QrTransferPayment extends PaymentMethod {
  @override
  String get name => 'QR Bre-B / Nequi / Daviplata';

  @override
  String get description => 'Escaneas el QR de cobro de la caja con tu banco';

  @override
  IconData get icon => Icons.qr_code_2;

  @override
  Color get color => const Color(0xFFF59E0B);
}

class AutoChargePayment extends PaymentMethod {
  @override
  String get name => 'Cobro automatico';

  @override
  String get description => 'Se cobra solo a tu tarjeta guardada: sin fila';

  @override
  IconData get icon => Icons.bolt;

  @override
  Color get color => const Color(0xFF38BDF8);

  @override
  bool get atCashier => false;
}
