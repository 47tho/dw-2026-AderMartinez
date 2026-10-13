import 'package:flutter/material.dart';
import '../services/parking_service.dart';
import 'map_screen.dart';
import 'my_qr_screen.dart';
import 'payment_screen.dart';
import 'profile_screen.dart';
import 'terminal_screen.dart';
import 'zones_screen.dart';

/// Contenedor principal: escucha el servicio (el "backend" simulado),
/// guarda el vehiculo elegido para mostrar su QR y controla la barra de
/// navegacion inferior.
class HomeShell extends StatefulWidget {
  final ParkingService service;
  final bool enableCamera;

  const HomeShell({super.key, required this.service, this.enableCamera = true});

  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  int _currentIndex = 0;
  late String _selectedVehicleId;

  ParkingService get _service => widget.service;

  @override
  void initState() {
    super.initState();
    final vehicles = _service.vehiclesOf(_service.currentUserId);
    // Si ya hay un vehiculo dentro, se muestra ese (su QR es el de salida).
    _selectedVehicleId = vehicles
        .firstWhere((v) => _service.activeSessionFor(v.id) != null, orElse: () => vehicles.first)
        .id;
  }

  /// Abre la terminal. Sin [code] se usa la camara; con [code] se
  /// simula que la terminal leyo ese QR.
  void _openTerminal(String? code) {
    Navigator.of(context).push(MaterialPageRoute<void>(
      builder: (_) => TerminalScreen(
        service: _service,
        initialCode: code,
        enableCamera: widget.enableCamera,
      ),
    ));
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: _service,
      builder: (context, _) {
        final user = _service.currentUser;
        final mySpots = <String>{
          for (final v in _service.vehiclesOf(user.id))
            if (_service.activeSessionFor(v.id) case final session?) session.spotId,
        };
        final screens = [
          MyQrScreen(
            service: _service,
            vehicleId: _selectedVehicleId,
            onSelectVehicle: (id) => setState(() => _selectedVehicleId = id),
            onOpenTerminal: _openTerminal,
          ),
          MapScreen(service: _service, mySpotIds: mySpots),
          ZonesScreen(service: _service),
          PaymentScreen(service: _service, vehicleId: _selectedVehicleId),
          ProfileScreen(service: _service),
        ];

        return Scaffold(
          body: SafeArea(child: IndexedStack(index: _currentIndex, children: screens)),
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
