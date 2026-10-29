import 'package:flutter/material.dart';
import '../services/parking_service.dart';
import 'map_screen.dart';
import 'my_qr_screen.dart';
import 'payment_screen.dart';
import 'profile_screen.dart';
import 'zones_screen.dart';

/// Contenedor principal del conductor: escucha el servicio conectado al
/// servidor, guarda el vehiculo elegido para mostrar su QR y controla la
/// barra de navegacion inferior.
class HomeShell extends StatefulWidget {
  final ParkingService service;

  /// Cerrar sesion.
  final VoidCallback? onSignOut;

  const HomeShell({super.key, required this.service, this.onSignOut});

  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  static const _profileTab = 4;

  int _currentIndex = 0;
  String? _selectedVehicleId;

  ParkingService get _service => widget.service;

  @override
  void initState() {
    super.initState();
    final vehicles = _service.vehiclesOf(_service.currentUserId);
    // Si ya hay un vehiculo dentro, se muestra ese (su QR es el de salida).
    _selectedVehicleId =
        vehicles.where((v) => _service.activeSessionFor(v.id) != null).firstOrNull?.id ?? vehicles.firstOrNull?.id;
    _service.notices.addListener(_showNotice);
  }

  @override
  void dispose() {
    _service.notices.removeListener(_showNotice);
    super.dispose();
  }

  /// Avisos del servicio (ej. un cambio que el servidor rechazo).
  void _showNotice() {
    final message = _service.notices.value;
    if (message == null || !mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
    _service.notices.value = null;
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: _service,
      builder: (context, _) {
        final user = _service.currentUser;
        final vehicles = _service.vehiclesOf(user.id);
        // El vehiculo elegido pudo desaparecer (o ser el primero recien agregado).
        final vehicleId =
            vehicles.any((v) => v.id == _selectedVehicleId) ? _selectedVehicleId : vehicles.firstOrNull?.id;
        final mySpots = <String>{
          for (final v in vehicles)
            if (_service.activeSessionFor(v.id) case final session?) session.spotId,
        };
        final noVehicle = _NoVehicle(onAdd: () => setState(() => _currentIndex = _profileTab));
        final screens = [
          vehicleId == null
              ? noVehicle
              : MyQrScreen(
                  service: _service,
                  vehicleId: vehicleId,
                  onSelectVehicle: (id) => setState(() => _selectedVehicleId = id),
                ),
          MapScreen(service: _service, mySpotIds: mySpots),
          ZonesScreen(service: _service),
          vehicleId == null ? noVehicle : PaymentScreen(service: _service, vehicleId: vehicleId),
          ProfileScreen(service: _service, onSignOut: widget.onSignOut),
        ];

        return Scaffold(
          body: SafeArea(
            child: RefreshIndicator(
              onRefresh: _service.refresh,
              child: IndexedStack(index: _currentIndex, children: screens),
            ),
          ),
          bottomNavigationBar: NavigationBar(
            selectedIndex: _currentIndex,
            onDestinationSelected: (i) => setState(() => _currentIndex = i),
            backgroundColor: const Color(0xFF11162A),
            destinations: const [
              NavigationDestination(icon: Icon(Icons.qr_code_2), label: 'Mi QR'),
              NavigationDestination(icon: Icon(Icons.map_outlined), label: 'Mapa'),
              NavigationDestination(icon: Icon(Icons.star_border), label: 'Zonas'),
              NavigationDestination(icon: Icon(Icons.attach_money), label: 'Pago'),
              NavigationDestination(icon: Icon(Icons.person_outline), label: 'Perfil'),
            ],
          ),
        );
      },
    );
  }
}

/// Cuenta nueva sin vehiculos: el QR necesita saber con cual entra.
class _NoVehicle extends StatelessWidget {
  final VoidCallback onAdd;

  const _NoVehicle({required this.onAdd});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.directions_car_outlined, size: 56, color: Colors.white38),
            const SizedBox(height: 16),
            const Text('Registra tu primer vehiculo',
                style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
            const SizedBox(height: 8),
            const Text(
              'Tu QR de acceso va a nombre de un vehiculo: agrega la placa de tu carro o moto para usarlo.',
              textAlign: TextAlign.center,
              style: TextStyle(color: Colors.white54),
            ),
            const SizedBox(height: 20),
            FilledButton.icon(onPressed: onAdd, icon: const Icon(Icons.add), label: const Text('Agregar vehiculo')),
          ],
        ),
      ),
    );
  }
}
