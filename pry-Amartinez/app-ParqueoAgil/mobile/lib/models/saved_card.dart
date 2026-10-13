/// Tarjeta guardada para el cobro automatico. Solo contiene el token
/// que entrega la pasarela de pagos y datos para mostrarla: la app
/// nunca guarda (ni ve) el numero completo ni el CVV.
class SavedCard {
  final String token;
  final String brand;
  final String last4;

  const SavedCard({required this.token, required this.brand, required this.last4});

  String get label => '$brand •••• $last4';
}
