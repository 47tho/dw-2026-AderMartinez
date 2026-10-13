import 'package:flutter/material.dart';
import 'data/mock_data.dart';
import 'screens/home_shell.dart';
import 'services/parking_service.dart';

void main() {
  runApp(const ParqueoAgilApp());
}

class ParqueoAgilApp extends StatefulWidget {
  /// Permite inyectar un servicio (ej. en pruebas). Por defecto se usan
  /// los datos de ejemplo.
  final ParkingService? service;

  /// En pruebas automaticas no hay camara: se desactiva.
  final bool enableCamera;

  const ParqueoAgilApp({super.key, this.service, this.enableCamera = true});

  @override
  State<ParqueoAgilApp> createState() => _ParqueoAgilAppState();
}

class _ParqueoAgilAppState extends State<ParqueoAgilApp> {
  late final ParkingService _service = widget.service ?? MockData.createService();

  @override
  void dispose() {
    if (widget.service == null) _service.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'ParqueoÁgil',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        useMaterial3: true,
        brightness: Brightness.dark,
        scaffoldBackgroundColor: const Color(0xFF0B0F1E),
        colorScheme: ColorScheme.fromSeed(
          seedColor: Colors.blueAccent,
          brightness: Brightness.dark,
        ),
      ),
      home: HomeShell(service: _service, enableCamera: widget.enableCamera),
    );
  }
}
