import 'package:flutter/material.dart';

enum VehicleType { car, motorcycle }

extension VehicleTypeInfo on VehicleType {
  String get label => this == VehicleType.car ? 'Carro' : 'Moto';
  IconData get icon => this == VehicleType.car ? Icons.directions_car : Icons.two_wheeler;
  String get plateHint => this == VehicleType.car ? 'ABC123' : 'ABC12D';
}

/// Vehiculo registrado por un usuario.
///
/// [id] es estable: no cambia aunque el usuario corrija la placa, asi
/// las sesiones y el QR siguen apuntando al mismo vehiculo.
class Vehicle {
  final String id;
  final String ownerId;
  final String plate;
  final VehicleType type;
  final String description; // marca y color, ayuda al vigilante

  const Vehicle({
    required this.id,
    required this.ownerId,
    required this.plate,
    this.type = VehicleType.car,
    this.description = '',
  });

  Vehicle copyWith({String? plate, VehicleType? type, String? description}) {
    return Vehicle(
      id: id,
      ownerId: ownerId,
      plate: plate ?? this.plate,
      type: type ?? this.type,
      description: description ?? this.description,
    );
  }

  /// Placas colombianas: carro ABC123, moto ABC12D (o ABC12 en las antiguas).
  static String? validatePlate(String? value, VehicleType type) {
    final plate = normalizePlate(value ?? '');
    final pattern = type == VehicleType.car ? RegExp(r'^[A-Z]{3}\d{3}$') : RegExp(r'^[A-Z]{3}\d{2}[A-Z]?$');
    if (!pattern.hasMatch(plate)) return 'Formato de placa: ${type.plateHint}';
    return null;
  }

  static String normalizePlate(String value) => value.toUpperCase().replaceAll(RegExp(r'[\s-]'), '');
}
