import 'package:flutter/material.dart';
import '../models/vehicle.dart';
import '../services/parking_service.dart';
import '../widgets/info_banner.dart';

/// Seleccion de zonas preferidas (hasta 3) en orden de prioridad, mas
/// el espacio preferido. Una zona llena tambien se puede elegir: la
/// preferencia es para siempre, no solo para hoy.
class ZonesScreen extends StatelessWidget {
  final ParkingService service;

  const ZonesScreen({super.key, required this.service});

  @override
  Widget build(BuildContext context) {
    final prefs = service.preferencesOf(service.currentUserId);
    final selectedZones = prefs.preferredZones;
    const maxZones = ParkingService.maxPreferredZones;
    final carZones = service.zones.where((z) => z.vehicleType == VehicleType.car).toList();
    final motoZones = service.zones.where((z) => z.vehicleType == VehicleType.motorcycle).map((z) => z.label).join(', ');

    return Padding(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Zonas preferidas', style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
          const SizedBox(height: 4),
          Text(
            'Elige hasta $maxZones zonas en orden de prioridad (${selectedZones.length}/$maxZones). '
            'El numero indica la prioridad.',
            style: const TextStyle(color: Colors.white54, fontSize: 12.5),
          ),
          const SizedBox(height: 16),
          Expanded(
            child: GridView.builder(
              itemCount: carZones.length,
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 3,
                mainAxisSpacing: 12,
                crossAxisSpacing: 12,
                childAspectRatio: 0.95,
              ),
              itemBuilder: (ctx, i) {
                final zone = carZones[i];
                final priority = selectedZones.indexOf(zone.id) + 1; // 0 = no elegida
                final selected = priority > 0;
                final free = service.freeSpotsIn(zone.id);
                final canAdd = selected || selectedZones.length < maxZones;
                return GestureDetector(
                  onTap: canAdd ? () => service.toggleZone(zone.id) : null,
                  child: Opacity(
                    opacity: canAdd ? 1 : 0.4,
                    child: Container(
                      decoration: BoxDecoration(
                        color: const Color(0xFF161B2E),
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(color: selected ? zone.color : Colors.white12, width: selected ? 2 : 1),
                      ),
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          CircleAvatar(
                            backgroundColor: zone.color,
                            radius: 18,
                            child: Text(zone.id, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                          ),
                          const SizedBox(height: 6),
                          if (selected)
                            Text('Prioridad $priority', style: const TextStyle(color: Colors.amber, fontSize: 10, fontWeight: FontWeight.bold)),
                          const SizedBox(height: 2),
                          Text(
                            free == 0 ? 'Sin cupos ahora' : '$free libres - Piso ${zone.floor}',
                            style: const TextStyle(color: Colors.white54, fontSize: 10),
                          ),
                        ],
                      ),
                    ),
                  ),
                );
              },
            ),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
            decoration: BoxDecoration(color: const Color(0xFF161B2E), borderRadius: BorderRadius.circular(12)),
            child: Row(
              children: [
                const Icon(Icons.star, color: Colors.amber, size: 18),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    prefs.preferredSpotId == null
                        ? 'Sin espacio preferido. Eligelo tocando un espacio en el Mapa.'
                        : 'Espacio preferido: ${prefs.preferredSpotId}',
                    style: const TextStyle(color: Colors.white70, fontSize: 12.5),
                  ),
                ),
                if (prefs.preferredSpotId != null)
                  TextButton(onPressed: () => service.setPreferredSpot(null), child: const Text('Quitar')),
              ],
            ),
          ),
          const SizedBox(height: 12),
          InfoBanner(
            text: 'Al ingresar se te asigna tu espacio preferido. Si esta ocupado, el libre mas cercano '
                'en tus zonas (en orden de prioridad); si todas estan llenas, el mas cercano disponible. '
                'Las motos se asignan en: $motoZones.',
          ),
        ],
      ),
    );
  }
}
