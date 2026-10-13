/// Usuario registrado. Un usuario (1) tiene uno o varios vehiculos (N),
/// que se guardan aparte y lo referencian por [id].
///
/// Los datos sensibles (documento y telefono) se guardan como privados
/// y solo se exponen por defecto a traves de getters "enmascarados",
/// siguiendo la recomendacion de no mostrar informacion personal
/// completa en pantalla sin necesidad real de verla.
class UserAccount {
  final String id;
  final String name;
  final String docType; // CC, CE, PA
  final String _docNumber;
  final String _phone;

  /// Clave con la que la app firma el QR de acceso. En produccion se
  /// genera al registrarse, se guarda en el almacenamiento seguro del
  /// celular y el servidor conserva una copia; nunca viaja en el QR.
  final String accessKey;

  UserAccount({
    required this.id,
    required this.name,
    required String docNumber,
    required String phone,
    required this.accessKey,
    this.docType = 'CC',
  })  : _docNumber = docNumber,
        _phone = phone;

  static const docTypes = ['CC', 'CE', 'PA'];

  /// Documento enmascarado, ej: 102****789
  String get maskedDoc => _mask(_docNumber);

  /// Telefono enmascarado, ej: 300****567
  String get maskedPhone => _mask(_phone);

  /// Solo deberian usarse tras confirmar la identidad del usuario
  /// (en produccion: biometria/PIN real con el paquete local_auth).
  String get fullDoc => _docNumber;
  String get fullPhone => _phone;

  UserAccount copyWith({String? name, String? docType, String? docNumber, String? phone}) {
    return UserAccount(
      id: id,
      name: name ?? this.name,
      docType: docType ?? this.docType,
      docNumber: docNumber ?? _docNumber,
      phone: phone ?? _phone,
      accessKey: accessKey,
    );
  }

  /// Validaciones del formulario de perfil. Devuelven el mensaje de
  /// error o null si el valor es valido.
  static String? validateName(String? value) {
    if (value == null || value.trim().length < 3) return 'Escribe tu nombre completo';
    return null;
  }

  static String? validateDocNumber(String? value) {
    if (value == null || !RegExp(r'^\d{6,10}$').hasMatch(value.trim())) return 'Entre 6 y 10 digitos';
    return null;
  }

  static String? validatePhone(String? value) {
    if (value == null || !RegExp(r'^3\d{9}$').hasMatch(value.trim())) return 'Celular de 10 digitos que empieza por 3';
    return null;
  }

  static String _mask(String value) {
    if (value.length <= 6) return value;
    final start = value.substring(0, 3);
    final end = value.substring(value.length - 3);
    final hidden = '*' * (value.length - 6);
    return '$start$hidden$end';
  }
}
