import 'api/api_client.dart';

/// Resultado de leer un QR en la porteria (rol LECTOR).
sealed class GateReading {
  final String driverName;
  final String plate;
  final bool isMotorcycle;

  const GateReading(this.driverName, this.plate, this.isMotorcycle);
}

/// El vehiculo entro: el servidor ya asigno el espacio y abrio el ticket.
class ReaderEntry extends GateReading {
  final String spotCode;
  final String zoneName;
  final int floor;
  final String reason;

  const ReaderEntry({
    required String driverName,
    required String plate,
    required bool isMotorcycle,
    required this.spotCode,
    required this.zoneName,
    required this.floor,
    required this.reason,
  }) : super(driverName, plate, isMotorcycle);
}

/// El vehiculo va a salir: el valor quedo fijo al leer el QR.
class ReaderExit extends GateReading {
  final int ticketId;
  final DateTime entryAt;
  final int minutes;
  final int fractions;
  final int pricePerFraction;
  final int total;

  /// Tarjeta del cobro automatico ("Visa •••• 4242"), o null si el
  /// conductor no lo activo: entonces se cobra en el panel web.
  final String? autoChargeCard;

  const ReaderExit({
    required String driverName,
    required String plate,
    required bool isMotorcycle,
    required this.ticketId,
    required this.entryAt,
    required this.minutes,
    required this.fractions,
    required this.pricePerFraction,
    required this.total,
    required this.autoChargeCard,
  }) : super(driverName, plate, isMotorcycle);
}

/// Pago aprobado del cobro automatico.
class AutoPayment {
  final String reference;
  final String? authorization;
  final int total;

  const AutoPayment({required this.reference, required this.authorization, required this.total});
}

/// Lector de QR de la porteria (rol LECTOR). Solo lee el QR del conductor
/// y, si el conductor activo el cobro automatico, cobra la salida. Las
/// validaciones (firma, vigencia, QR ya usado) las hace el servidor.
class GateReader {
  final ApiClient api;

  const GateReader(this.api);

  /// true si la cuenta de la sesion tiene permiso para leer QR en porteria
  /// (rol LECTOR, o personal del parqueadero).
  static Future<bool> canRead(ApiClient api) async {
    final data = await api.get('/permisos') as Map<String, dynamic>;
    final permissions = (data['permissions'] as List).cast<Map<String, dynamic>>();
    return permissions.any((p) => p['method'] == 'POST' && p['path'] == '/api/gate/scan');
  }

  Future<GateReading> scan(String code) async {
    final data = await api.post('/gate/scan', {'code': code.trim()}) as Map<String, dynamic>;
    final vehicle = data['vehicle'] as Map<String, dynamic>;
    final driverName = (data['driverName'] as String?) ?? '';
    final plate = vehicle['plate'] as String;
    final isMotorcycle = vehicle['kind'] == 'motorcycle';

    if (data['kind'] == 'entry') {
      final spot = data['spot'] as Map<String, dynamic>;
      final zone = data['zone'] as Map<String, dynamic>;
      return ReaderEntry(
        driverName: driverName,
        plate: plate,
        isMotorcycle: isMotorcycle,
        spotCode: spot['code'] as String,
        // 'Zona A - Piso 1' -> 'Zona A' (el piso se muestra aparte).
        zoneName: (zone['name'] as String).replaceAll(RegExp(r'\s*-\s*Piso\s*\d+$'), ''),
        floor: _int(zone['floor']),
        reason: (data['reason'] as String?) ?? '',
      );
    }

    final ticket = data['ticket'] as Map<String, dynamic>;
    final quote = data['quote'] as Map<String, dynamic>;
    final card = data['savedCard'] as Map<String, dynamic>?;
    return ReaderExit(
      driverName: driverName,
      plate: plate,
      isMotorcycle: isMotorcycle,
      ticketId: _int(ticket['id']),
      entryAt: DateTime.parse(ticket['entryAt'] as String).toLocal(),
      minutes: _int(quote['minutes']),
      fractions: _int(quote['fractions']),
      pricePerFraction: _int(quote['pricePerFraction']),
      total: _int(quote['total']),
      autoChargeCard: card?['label'] as String?,
    );
  }

  /// Cobra la salida a la tarjeta guardada del conductor.
  Future<AutoPayment> autoPay(int ticketId) async {
    final ticket = await api.post('/tickets/$ticketId/auto-pay') as Map<String, dynamic>;
    return AutoPayment(
      reference: (ticket['paymentRef'] as String?) ?? 'T$ticketId',
      authorization: ticket['authorization'] as String?,
      total: _int(ticket['total']),
    );
  }

  static int _int(Object? value) => value is num ? value.toInt() : int.tryParse('$value') ?? 0;
}
