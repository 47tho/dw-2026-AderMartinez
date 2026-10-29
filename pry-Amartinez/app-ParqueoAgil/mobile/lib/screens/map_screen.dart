import 'package:flutter/material.dart';
import '../models/parking_spot.dart';
import '../models/parking_zone.dart';
import '../models/vehicle.dart';
import '../services/parking_service.dart';

/// Plano del parqueadero por piso y zona. Muestra los espacios de los
/// vehiculos del usuario y permite marcar su espacio preferido.
class MapScreen extends StatefulWidget {
  final ParkingService service;
  final Set<String> mySpotIds;

  const MapScreen({super.key, required this.service, required this.mySpotIds});

  @override
  State<MapScreen> createState() => _MapScreenState();
}

class _MapScreenState extends State<MapScreen> {
  /// Espacios por fila en el plano.
  static const _spotsPerRow = 6;

  int _selectedFloor = 1;

  ParkingService get _service => widget.service;
  String? get _preferredSpotId => _service.preferencesOf(_service.currentUserId).preferredSpotId;

  Color _colorFor(SpotStatus status, bool isMyCar) {
    if (isMyCar) return const Color(0xFF3B82F6); // Blue
    switch (status) {
      case SpotStatus.free:
        return const Color(0xFF4ADE80); // Lighter green matching the image
      case SpotStatus.occupied:
        return const Color(0xFFF87171); // Lighter red
      case SpotStatus.expired:
        return const Color(0xFFFB923C); // Orange
      case SpotStatus.blocked:
        return const Color(0xFF64748B); // Gris
    }
  }

  @override
  Widget build(BuildContext context) {
    final floorZones = _service.zones.where((z) => z.floor == _selectedFloor).toList();

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text('Plano del Parqueadero', style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 12),
                decoration: BoxDecoration(
                  color: const Color(0xFF161B2E),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: DropdownButton<int>(
                  value: _selectedFloor,
                  dropdownColor: const Color(0xFF161B2E),
                  style: const TextStyle(color: Colors.blueAccent, fontWeight: FontWeight.bold),
                  underline: const SizedBox(),
                  icon: const Icon(Icons.keyboard_arrow_down, color: Colors.blueAccent),
                  items: const [
                    DropdownMenuItem(value: 1, child: Text('Piso 1')),
                    DropdownMenuItem(value: 2, child: Text('Piso 2')),
                  ],
                  onChanged: (val) {
                    if (val != null) setState(() => _selectedFloor = val);
                  },
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
          const Text('Toca un espacio para verlo o marcarlo como preferido.', style: TextStyle(color: Colors.white38, fontSize: 12)),
          const SizedBox(height: 14),
          Expanded(
            child: ListView.builder(
              itemCount: floorZones.length,
              itemBuilder: (ctx, i) {
                return _buildParkingLot(floorZones[i]);
              },
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildParkingLot(ParkingZone zone) {
    final spots = _service.spotsForZone(zone.id);

    List<Widget> gridItems = [];

    // Convert flat list of spots into chunks of one row each
    const perRow = _spotsPerRow;
    List<List<ParkingSpot>> chunks = [];
    for (var i = 0; i < spots.length; i += perRow) {
      chunks.add(spots.sublist(i, i + perRow > spots.length ? spots.length : i + perRow));
    }

    // Logic: 2 rows of spots, then an aisle, repeat.
    for (int i = 0; i < chunks.length; i++) {
      gridItems.add(_buildSpotRow(chunks[i]));

      // Add a small spacer between the two back-to-back rows
      if (i % 2 == 0 && i < chunks.length - 1) {
        gridItems.add(const SizedBox(height: 10));
      }

      // Add aisle after every 2nd row
      if (i % 2 != 0 && i < chunks.length - 1) {
        gridItems.add(_buildAisle());
      }
    }

    return Container(
      margin: const EdgeInsets.only(bottom: 30),
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: const Color(0xFF11162A), // Dark background matching the image
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.blueAccent.withValues(alpha: 0.3), width: 1.5),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('PISO ${zone.floor}', style: const TextStyle(color: Colors.white38, fontSize: 12, fontWeight: FontWeight.bold, letterSpacing: 1)),
                    const SizedBox(height: 4),
                    Text('Sección: ${zone.label}', style: const TextStyle(color: Colors.blueAccent, fontWeight: FontWeight.bold, fontSize: 20)),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text('${_service.freeSpotsIn(zone.id)}', style: const TextStyle(color: Colors.greenAccent, fontSize: 24, fontWeight: FontWeight.bold)),
                  Text('libres de ${zone.totalSpots}', style: const TextStyle(color: Colors.white38, fontSize: 12)),
                ],
              ),
            ],
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              _buildChip('Entrada'),
              const SizedBox(width: 8),
              _buildChip('Salida'),
            ],
          ),
          const SizedBox(height: 24),
          ...gridItems,
        ],
      ),
    );
  }

  Widget _buildChip(String label) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: Colors.white12),
      ),
      child: Text(label, style: const TextStyle(color: Colors.white54, fontSize: 12)),
    );
  }

  Widget _buildAisle() {
    return Container(
      height: 30,
      margin: const EdgeInsets.symmetric(vertical: 6),
      alignment: Alignment.center,
      child: const Row(
        mainAxisAlignment: MainAxisAlignment.spaceEvenly,
        children: [
           Icon(Icons.arrow_right_alt, color: Colors.white24, size: 16),
           Icon(Icons.arrow_right_alt, color: Colors.white24, size: 16),
           Icon(Icons.arrow_right_alt, color: Colors.white24, size: 16),
           Icon(Icons.arrow_right_alt, color: Colors.white24, size: 16),
        ],
      )
    );
  }

  Widget _buildSpotRow(List<ParkingSpot> rowSpots) {
    List<Widget> rowChildren = [];
    for (int i = 0; i < _spotsPerRow; i++) {
      if (i < rowSpots.length) {
        rowChildren.add(_buildSingleSpot(rowSpots[i]));
      } else {
        rowChildren.add(const SizedBox(width: 45, height: 70));
      }
    }

    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: rowChildren,
    );
  }

  Widget _buildSingleSpot(ParkingSpot spot) {
    final isMyCar = widget.mySpotIds.contains(spot.id);
    final isPreferred = spot.id == _preferredSpotId;

    return GestureDetector(
      onTap: () => _showSpotDetail(spot, isMyCar),
      child: Container(
        width: 45,
        height: 70,
        decoration: BoxDecoration(
          color: _colorFor(spot.status, isMyCar),
          borderRadius: BorderRadius.circular(6),
          boxShadow: isMyCar ? [
            BoxShadow(color: Colors.blueAccent.withValues(alpha: 0.6), blurRadius: 10, spreadRadius: 2)
          ] : null,
          border: isMyCar ? Border.all(color: Colors.white, width: 1.5) : null,
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            if (isPreferred) const Icon(Icons.star, size: 12, color: Colors.amber),
            Text(
              spot.id,
              style: TextStyle(
                color: isMyCar ? Colors.white : const Color(0xFF1E293B),
                fontWeight: FontWeight.bold,
                fontSize: 10,
              ),
            ),
            if (isMyCar) ...[
              const SizedBox(height: 6),
              const Text('Tuyo', style: TextStyle(color: Colors.white, fontSize: 8, fontWeight: FontWeight.bold)),
            ]
          ],
        ),
      ),
    );
  }

  void _showSpotDetail(ParkingSpot spot, bool isMyCar) {
    final labels = {
      SpotStatus.free: 'Libre',
      SpotStatus.occupied: 'Ocupado',
      SpotStatus.expired: 'Vencido',
      SpotStatus.blocked: 'Bloqueado',
    };
    final isPreferred = spot.id == _preferredSpotId;
    // El espacio preferido es para carros; las motos van a su zona.
    final canPrefer = _service.zoneById(spot.zoneId).vehicleType == VehicleType.car;
    showModalBottomSheet(
      context: context,
      backgroundColor: const Color(0xFF161B2E),
      builder: (ctx) => Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(isMyCar ? 'Tu Espacio ${spot.id}' : 'Espacio ${spot.id}', style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
            const SizedBox(height: 6),
            Text('Estado: ${isMyCar ? 'Tu vehiculo' : labels[spot.status]}', style: TextStyle(color: _colorFor(spot.status, isMyCar), fontSize: 16, fontWeight: FontWeight.bold)),
            const SizedBox(height: 20),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                if (canPrefer) ...[
                  OutlinedButton.icon(
                    onPressed: () {
                      _service.setPreferredSpot(isPreferred ? null : spot.id);
                      Navigator.pop(ctx);
                    },
                    icon: Icon(isPreferred ? Icons.star : Icons.star_border, color: Colors.amber),
                    label: Text(isPreferred ? 'Quitar preferido' : 'Marcar como preferido'),
                  ),
                  const SizedBox(width: 12),
                ],
                ElevatedButton(
                  onPressed: () => Navigator.pop(ctx),
                  child: const Text('Cerrar'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
