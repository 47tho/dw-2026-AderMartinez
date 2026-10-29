import '../models/saved_card.dart';

/// Tarjeta de prueba de la pasarela simulada.
class TestCard {
  final String brand;
  final String last4;
  final String note;
  final bool declines;

  const TestCard(this.brand, this.last4, this.note, {this.declines = false});
}

/// Pasarela de pagos SIMULADA. En produccion esto lo hace el widget de
/// Wompi, ePayco, Mercado Pago, etc.: recibe la tarjeta y la app solo
/// recibe un token. El cobro se hace contra ese token desde el servidor
/// (cobro automatico al salir). Aqui se usan tarjetas de prueba.
class PaymentGatewaySimulator {
  final Duration latency;

  PaymentGatewaySimulator({this.latency = const Duration(milliseconds: 1500)});

  static const testCards = [
    TestCard('Visa', '4242', 'Siempre aprobada'),
    TestCard('Mastercard', '5100', 'Siempre aprobada'),
    TestCard('Visa', '0002', 'Siempre rechazada (fondos insuficientes)', declines: true),
  ];

  int _counter = 0;

  /// "Guarda" la tarjeta en la pasarela y devuelve el token.
  Future<SavedCard> tokenize(TestCard card) async {
    await Future<void>.delayed(latency);
    final token = 'tok_test_${card.brand.toLowerCase()}_${card.last4}_${++_counter}';
    return SavedCard(token: token, brand: card.brand, last4: card.last4);
  }
}
