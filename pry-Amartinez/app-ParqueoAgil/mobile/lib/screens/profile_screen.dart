import 'package:flutter/material.dart';
import '../models/user_account.dart';
import '../models/vehicle.dart';
import '../services/parking_service.dart';

/// Perfil del usuario (sus datos personales) y sus vehiculos. Los
/// datos personales se muestran enmascarados por defecto y solo se
/// revelan tras una confirmacion explicita (en produccion: biometria
/// o PIN real con el paquete local_auth).
class ProfileScreen extends StatefulWidget {
  final ParkingService service;

  const ProfileScreen({super.key, required this.service});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  bool _revealData = false;

  ParkingService get _service => widget.service;

  Future<void> _confirmReveal() async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF161B2E),
        title: const Text('Confirmar identidad', style: TextStyle(color: Colors.white)),
        content: const Text(
          'En una version real, aqui se pediria huella o PIN antes de mostrar tus datos completos.',
          style: TextStyle(color: Colors.white70),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancelar')),
          ElevatedButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Continuar')),
        ],
      ),
    );
    if (confirm == true) setState(() => _revealData = true);
  }

  @override
  Widget build(BuildContext context) {
    final user = _service.currentUser;
    final vehicles = _service.vehiclesOf(user.id);

    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            const Text('Mi perfil', style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
            IconButton(
              icon: const Icon(Icons.edit, color: Colors.blueAccent),
              tooltip: 'Editar mis datos',
              onPressed: () => showDialog<void>(
                context: context,
                builder: (_) => _UserDialog(service: _service, user: user),
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),
        Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(color: const Color(0xFF161B2E), borderRadius: BorderRadius.circular(12)),
          child: Column(
            children: [
              _infoRow('Nombre', user.name),
              _infoRow('Documento', '${user.docType} ${_revealData ? user.fullDoc : user.maskedDoc}'),
              _infoRow('Celular', _revealData ? user.fullPhone : user.maskedPhone),
              Align(
                alignment: Alignment.centerRight,
                child: TextButton.icon(
                  onPressed: _revealData ? () => setState(() => _revealData = false) : _confirmReveal,
                  icon: Icon(_revealData ? Icons.visibility_off : Icons.visibility, size: 16),
                  label: Text(_revealData ? 'Ocultar datos' : 'Mostrar datos completos'),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 20),
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text('Mis vehiculos (${vehicles.length})', style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold)),
            TextButton.icon(
              onPressed: () => _openVehicleDialog(null),
              icon: const Icon(Icons.add, size: 18),
              label: const Text('Agregar'),
            ),
          ],
        ),
        const SizedBox(height: 4),
        for (final vehicle in vehicles) _buildVehicleTile(vehicle),
        const SizedBox(height: 8),
        const Text(
          'El QR de cada vehiculo esta en "Mi QR": va firmado y cambia cada 30 segundos.',
          style: TextStyle(color: Colors.white38, fontSize: 12),
        ),
      ],
    );
  }

  Widget _buildVehicleTile(Vehicle vehicle) {
    final session = _service.activeSessionFor(vehicle.id);
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(color: const Color(0xFF161B2E), borderRadius: BorderRadius.circular(10)),
      child: Row(
        children: [
          Icon(vehicle.type.icon, color: Colors.white70),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(vehicle.plate, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, letterSpacing: 1)),
                Text(
                  '${vehicle.type.label}${vehicle.description.isEmpty ? '' : ' - ${vehicle.description}'}',
                  style: const TextStyle(color: Colors.white54, fontSize: 12),
                ),
                Text(
                  session == null ? 'Fuera del parqueadero' : 'Dentro - espacio ${session.spotId}',
                  style: TextStyle(color: session == null ? Colors.white38 : Colors.redAccent, fontSize: 11.5),
                ),
              ],
            ),
          ),
          IconButton(
            icon: const Icon(Icons.edit_outlined, color: Colors.blueAccent, size: 20),
            tooltip: 'Editar vehiculo',
            onPressed: () => _openVehicleDialog(vehicle),
          ),
        ],
      ),
    );
  }

  void _openVehicleDialog(Vehicle? vehicle) {
    showDialog<void>(
      context: context,
      builder: (_) => _VehicleDialog(
        service: _service,
        vehicle: vehicle,
        parked: vehicle != null && _service.activeSessionFor(vehicle.id) != null,
      ),
    );
  }

  Widget _infoRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: const TextStyle(color: Colors.white38, fontSize: 12.5)),
          Text(value, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600)),
        ],
      ),
    );
  }
}

const _fieldLabel = TextStyle(color: Colors.white54);

class _UserDialog extends StatefulWidget {
  final ParkingService service;
  final UserAccount user;

  const _UserDialog({required this.service, required this.user});

  @override
  State<_UserDialog> createState() => _UserDialogState();
}

class _UserDialogState extends State<_UserDialog> {
  final _formKey = GlobalKey<FormState>();
  late final _name = TextEditingController(text: widget.user.name);
  late final _doc = TextEditingController(text: widget.user.fullDoc);
  late final _phone = TextEditingController(text: widget.user.fullPhone);
  late String _docType = widget.user.docType;

  @override
  void dispose() {
    _name.dispose();
    _doc.dispose();
    _phone.dispose();
    super.dispose();
  }

  void _save() {
    if (!_formKey.currentState!.validate()) return;
    widget.service.updateUser(widget.user.copyWith(
      name: _name.text.trim(),
      docType: _docType,
      docNumber: _doc.text.trim(),
      phone: _phone.text.trim(),
    ));
    Navigator.pop(context);
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      backgroundColor: const Color(0xFF161B2E),
      title: const Text('Mis datos', style: TextStyle(color: Colors.white)),
      content: Form(
        key: _formKey,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextFormField(
                controller: _name,
                style: const TextStyle(color: Colors.white),
                decoration: const InputDecoration(labelText: 'Nombre completo', labelStyle: _fieldLabel),
                validator: UserAccount.validateName,
              ),
              Row(
                children: [
                  DropdownButton<String>(
                    value: _docType,
                    dropdownColor: const Color(0xFF161B2E),
                    items: [for (final t in UserAccount.docTypes) DropdownMenuItem(value: t, child: Text(t))],
                    onChanged: (v) => setState(() => _docType = v ?? _docType),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: TextFormField(
                      controller: _doc,
                      style: const TextStyle(color: Colors.white),
                      keyboardType: TextInputType.number,
                      decoration: const InputDecoration(labelText: 'Numero de documento', labelStyle: _fieldLabel),
                      validator: UserAccount.validateDocNumber,
                    ),
                  ),
                ],
              ),
              TextFormField(
                controller: _phone,
                style: const TextStyle(color: Colors.white),
                keyboardType: TextInputType.phone,
                decoration: const InputDecoration(labelText: 'Celular', labelStyle: _fieldLabel),
                validator: UserAccount.validatePhone,
              ),
            ],
          ),
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancelar', style: TextStyle(color: Colors.white70))),
        ElevatedButton(onPressed: _save, child: const Text('Guardar')),
      ],
    );
  }
}

/// Agregar (vehicle == null) o editar un vehiculo. Si esta dentro del
/// parqueadero no se puede cambiar la placa ni el tipo.
class _VehicleDialog extends StatefulWidget {
  final ParkingService service;
  final Vehicle? vehicle;
  final bool parked;

  const _VehicleDialog({required this.service, required this.vehicle, required this.parked});

  @override
  State<_VehicleDialog> createState() => _VehicleDialogState();
}

class _VehicleDialogState extends State<_VehicleDialog> {
  final _formKey = GlobalKey<FormState>();
  late final _plate = TextEditingController(text: widget.vehicle?.plate ?? '');
  late final _description = TextEditingController(text: widget.vehicle?.description ?? '');
  late VehicleType _type = widget.vehicle?.type ?? VehicleType.car;
  String? _error;

  @override
  void dispose() {
    _plate.dispose();
    _description.dispose();
    super.dispose();
  }

  void _save() {
    if (!_formKey.currentState!.validate()) return;
    final vehicle = widget.vehicle;
    final error = vehicle == null
        ? widget.service.addVehicle(plate: _plate.text, type: _type, description: _description.text)
        : widget.service.updateVehicle(vehicle.copyWith(plate: _plate.text, type: _type, description: _description.text));
    if (error != null) {
      setState(() => _error = error);
      return;
    }
    Navigator.pop(context);
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      backgroundColor: const Color(0xFF161B2E),
      title: Text(widget.vehicle == null ? 'Agregar vehiculo' : 'Editar vehiculo', style: const TextStyle(color: Colors.white)),
      content: Form(
        key: _formKey,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (widget.parked)
                const Padding(
                  padding: EdgeInsets.only(bottom: 8),
                  child: Text(
                    'Este vehiculo esta dentro del parqueadero: la placa y el tipo no se pueden cambiar hasta que salga.',
                    style: TextStyle(color: Colors.orangeAccent, fontSize: 12.5),
                  ),
                ),
              SegmentedButton<VehicleType>(
                segments: [
                  for (final t in VehicleType.values) ButtonSegment(value: t, label: Text(t.label), icon: Icon(t.icon)),
                ],
                selected: {_type},
                onSelectionChanged: widget.parked ? null : (s) => setState(() => _type = s.first),
              ),
              TextFormField(
                controller: _plate,
                enabled: !widget.parked,
                style: const TextStyle(color: Colors.white),
                textCapitalization: TextCapitalization.characters,
                decoration: InputDecoration(labelText: 'Placa (${_type.plateHint})', labelStyle: _fieldLabel),
                validator: (v) => Vehicle.validatePlate(v, _type),
              ),
              TextFormField(
                controller: _description,
                style: const TextStyle(color: Colors.white),
                decoration: const InputDecoration(labelText: 'Marca y color (opcional)', labelStyle: _fieldLabel),
              ),
              if (_error != null)
                Padding(
                  padding: const EdgeInsets.only(top: 10),
                  child: Text(_error!, style: const TextStyle(color: Colors.redAccent)),
                ),
            ],
          ),
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancelar', style: TextStyle(color: Colors.white70))),
        ElevatedButton(onPressed: _save, child: const Text('Guardar')),
      ],
    );
  }
}
