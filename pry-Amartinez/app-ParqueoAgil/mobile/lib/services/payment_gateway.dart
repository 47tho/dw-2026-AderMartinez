import '../models/saved_card.dart';

/// Tarjeta de prueba de la pasarela simulada.
class TestCard {
  final String brand;
  final String last4;
  final String note;
  final bool declines;

  const TestCard(this.brand, this.last4, this.note, {this.declines = false});
}

class PaymentOutcome {
  final bool approved;
  final String? authorization;
  final String? error;

  const PaymentOutcome.approved(this.authorization)
      : approved = true,
        error = null;

  const PaymentOutcome.declined(this.error)
      : approved = false,
        authorization = null;
}

/// Pasarela de pagos SIMULADA. En produccion esto lo hace Wompi,
/// ePayco, Mercado Pago, etc.: su widget recibe la tarjeta, la app solo
/// recibe un token, y el cobro se hace contra ese token desde el
/// servidor. Aqui todo ocurre en memoria y con tarjetas de prueba.
class PaymentGatewaySimulator {
  final Duration latency;

  PaymentGatewaySimulator({this.latency = const Duration(milliseconds: 1500)});

  static const testCards = [
    TestCard('Visa', '4242', 'Siempre aprobada'),
    TestCard('Mastercard', '5100', 'Siempre aprobada'),
    TestCard('Visa', '0002', 'Siempre rechazada (fondos insuficientes)', declines: true),
  ];

  final Map<String, TestCard> _tokens = {};
  int _counter = 0;

  /// "Guarda" la tarjeta en la pasarela y devuelve el token.
  Future<SavedCard> tokenize(TestCard card) async {
    await Future<void>.delayed(latency);
    final token = 'tok_test_${card.brand.toLowerCase()}_${card.last4}_${++_counter}';
    _tokens[token] = card;
    return SavedCard(token: token, brand: card.brand, last4: card.last4);
  }

  /// Cobro automatico contra una tarjeta guardada.
  Future<PaymentOutcome> chargeToken(String token, int amount) async {
    await Future<void>.delayed(latency);
    final card = _tokens[token];
    if (card == null) return const PaymentOutcome.declined('Tarjeta no encontrada en la pasarela');
    if (card.declines) return const PaymentOutcome.declined('Tarjeta rechazada: fondos insuficientes');
    return PaymentOutcome.approved(_authorization());
  }

  /// Pago con tarjeta en el datafono de la caja.
  Future<PaymentOutcome> chargeCardPresent(int amount) async {
    await Future<void>.delayed(latency);
    return PaymentOutcome.approved(_authorization());
  }

  /// Confirmacion de una transferencia por QR (Bre-B, Nequi, Daviplata).
  Future<PaymentOutcome> confirmQrTransfer(String reference, int amount) async {
    await Future<void>.delayed(latency);
    return PaymentOutcome.approved(_authorization());
  }

  String _authorization() => 'AUT${(100000 + ++_counter * 7919 % 900000)}';
}
