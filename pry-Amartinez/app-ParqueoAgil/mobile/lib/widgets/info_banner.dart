import 'package:flutter/material.dart';

/// Banner informativo reutilizable. Se usa para reforzar la
/// heuristica "ayuda y documentacion" en pantallas con logica
/// que no es obvia a simple vista (ej. reasignacion de zona,
/// calculo automatico de tiempo, etc).
class InfoBanner extends StatelessWidget {
  final String text;

  const InfoBanner({super.key, required this.text});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.blueAccent.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(Icons.info_outline, color: Colors.lightBlueAccent, size: 18),
          const SizedBox(width: 8),
          Expanded(
            child: Text(text, style: const TextStyle(color: Colors.white70, fontSize: 12.5)),
          ),
        ],
      ),
    );
  }
}
