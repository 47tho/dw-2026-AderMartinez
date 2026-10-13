#!/usr/bin/env bash
# =============================================================================
# verify-iss15.sh — adaptado al envoltorio {statusCode, message, data, timestamp}
# Ubicación: ~/ia-lab/projects/DW/pry-Amartinez/app-ParqueoAgil/backend/
# Ejecutar: bash verify-iss15.sh
# =============================================================================
set -u
BASE="http://localhost:3003"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

# Helper: extrae un campo de .data.<campo> del JSON del servidor
extract() {
  local file="$1" field="$2"
  node -pe "const j=JSON.parse(require('fs').readFileSync('$file','utf8')); j.data?.$field ?? j.$field ?? ''" 2>/dev/null || echo ""
}

echo "=== 1) LOGIN admin (OPEN) ==="
echo "URL: POST $BASE/api/sesion/login"
curl -s -X POST "$BASE/api/sesion/login" \
  -H 'Content-Type: application/json' \
  -d '{"identifier":"admin","password":"Admin123!"}' > "$TMP/login.json"

echo "Respuesta cruda:"
cat "$TMP/login.json" | head -c 300
echo ""

ADMIN_ACCESS=$(extract "$TMP/login.json" access_token)
ADMIN_REFRESH=$(extract "$TMP/login.json" refresh_token)

echo "Access token length: ${#ADMIN_ACCESS}"
echo "Refresh token length: ${#ADMIN_REFRESH}"

if [ "${#ADMIN_ACCESS}" -lt 50 ]; then
  echo "❌ Token mal extraído. Revisa la respuesta cruda."
  exit 1
fi

echo ""
echo "=== 2) GET /api/sesion/perfil (JWT) ==="
curl -s -w "\nHTTP: %{http_code}\n" \
  -H "Authorization: Bearer $ADMIN_ACCESS" \
  "$BASE/api/sesion/perfil" | head -c 500
echo ""

echo ""
echo "=== 3) GET /api/permisos (JWT) — admin debe tener 58 ==="
curl -s -H "Authorization: Bearer $ADMIN_ACCESS" "$BASE/api/permisos" \
  | node -pe "const d=JSON.parse(require('fs').readFileSync(0,'utf8')); 'Permisos admin: ' + (d.data?.permissions?.length ?? d.permissions?.length ?? 'N/A')"
echo ""

echo "=== 4) GET /api/clients con admin (JWT + RBAC) ==="
curl -s -w "\nHTTP: %{http_code}\n" \
  -H "Authorization: Bearer $ADMIN_ACCESS" \
  "$BASE/api/clients" | head -c 300
echo ""

echo "=== 5) REFRESH (rotación) ==="
curl -s -X POST "$BASE/api/sesion/refresh" \
  -H 'Content-Type: application/json' \
  -d "{\"refresh_token\":\"$ADMIN_REFRESH\"}" > "$TMP/refresh.json"

cat "$TMP/refresh.json" | head -c 300
echo ""

NEW_REFRESH=$(extract "$TMP/refresh.json" refresh_token)
echo "Nuevo refresh length: ${#NEW_REFRESH}"
echo ""

echo "=== 6) REUSE del refresh viejo (debe dar 401) ==="
curl -s -w "\nHTTP: %{http_code}\n" -X POST "$BASE/api/sesion/refresh" \
  -H 'Content-Type: application/json' \
  -d "{\"refresh_token\":\"$ADMIN_REFRESH\"}" | head -c 500
echo ""

echo "=== 7) Consecuencia: el refresh rotado tampoco sirve (401) ==="
curl -s -w "\nHTTP: %{http_code}\n" -X POST "$BASE/api/sesion/refresh" \
  -H 'Content-Type: application/json' \
  -d "{\"refresh_token\":\"$NEW_REFRESH\"}" | head -c 500
echo ""
