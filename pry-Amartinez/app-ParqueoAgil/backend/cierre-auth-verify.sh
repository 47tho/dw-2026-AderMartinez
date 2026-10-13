#!/usr/bin/env bash
# =============================================================================
# cierre-auth-verify.sh — Smoke test E2E de las 3 modalidades (CIERRE-AUTH)
# Adaptado a ParqueoÁgil (NestJS + ResponseInterceptor {data: ...})
# =============================================================================
set -u
BASE="http://localhost:3003"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

PASS=0; FAIL=0

c()    { curl -s -o /dev/null -w '%{http_code}' "$@"; }
chk()  { if [ "$2" = "$3" ]; then printf '  ✅ PASS  [%s] %s\n' "$3" "$1"; PASS=$((PASS+1));
         else printf '  ❌ FAIL  esperado=%s obtenido=%s :: %s\n' "$2" "$3" "$1"; FAIL=$((FAIL+1)); fi; }

extract() {
  node -pe "const j=JSON.parse(require('fs').readFileSync('$1','utf8')); j.data?.$2 ?? j.$2 ?? ''" 2>/dev/null || echo ""
}

login() {
  curl -s -X POST "$BASE/api/sesion/login" -H 'Content-Type: application/json' -d "$1" > "$2"
}

echo "=============================================="
echo "  CIERRE-AUTH · Smoke test E2E"
echo "=============================================="

# ---------- Login para obtener tokens ----------
login '{"identifier":"admin","password":"Admin123!"}' "$TMP/admin.json"
login '{"identifier":"seller","password":"Seller123!"}' "$TMP/seller.json"

ADMIN_TOKEN=$(extract "$TMP/admin.json" access_token)
ADMIN_REFRESH=$(extract "$TMP/admin.json" refresh_token)
SELLER_TOKEN=$(extract "$TMP/seller.json" access_token)

echo ""
echo "=== Modalidad 1 — OPEN ==="
chk "1. Login admin (OPEN)"              200 "$(c -X POST "$BASE/api/sesion/login" -H 'Content-Type: application/json' -d '{"identifier":"admin","password":"Admin123!"}')"
chk "2. Login seller (OPEN)"             200 "$(c -X POST "$BASE/api/sesion/login" -H 'Content-Type: application/json' -d '{"identifier":"seller","password":"Seller123!"}')"
chk "3. Refresh (OPEN con credencial)"   200 "$(c -X POST "$BASE/api/sesion/refresh" -H 'Content-Type: application/json' -d "{\"refresh_token\":\"$ADMIN_REFRESH\"}")"
chk "4. Reuse de refresh viejo (401)"    401 "$(c -X POST "$BASE/api/sesion/refresh" -H 'Content-Type: application/json' -d "{\"refresh_token\":\"$ADMIN_REFRESH\"}")"
chk "5. Logout (OPEN)"                   200 "$(c -X POST "$BASE/api/sesion/logout" -H 'Content-Type: application/json' -d "{\"refresh_token\":\"$ADMIN_REFRESH\"}")"

echo ""
echo "=== Modalidad 2 — JWT ==="
chk "6. Perfil con token admin (200)"    200 "$(c -H "Authorization: Bearer $ADMIN_TOKEN" "$BASE/api/sesion/perfil")"
chk "7. Permisos con token admin (200)"  200 "$(c -H "Authorization: Bearer $ADMIN_TOKEN" "$BASE/api/permisos")"
chk "13. Sin token (401)"                401 "$(c "$BASE/api/sesion/perfil")"

echo ""
echo "=== Modalidad 3 — JWT + RBAC ==="
chk "11. GET /api/clients con admin (200)"     200 "$(c -H "Authorization: Bearer $ADMIN_TOKEN" "$BASE/api/clients")"
chk "12. GET /api/clients con seller (200)"    200 "$(c -H "Authorization: Bearer $SELLER_TOKEN" "$BASE/api/clients")"
chk "14. Ruta admin no concedida a seller (403)" 403 "$(c -H "Authorization: Bearer $SELLER_TOKEN" "$BASE/api/usuarios")"

echo ""
echo "=== Conteo de permisos ==="
PERMS_ADMIN=$(curl -s -H "Authorization: Bearer $ADMIN_TOKEN" "$BASE/api/permisos" | node -pe "const d=JSON.parse(require('fs').readFileSync(0,'utf8')); d.data?.permissions?.length ?? d.permissions?.length ?? 0")
PERMS_SELLER=$(curl -s -H "Authorization: Bearer $SELLER_TOKEN" "$BASE/api/permisos" | node -pe "const d=JSON.parse(require('fs').readFileSync(0,'utf8')); d.data?.permissions?.length ?? d.permissions?.length ?? 0")
chk "Permisos admin = 58"    "58" "$PERMS_ADMIN"
chk "Permisos seller = 7"    "7"  "$PERMS_SELLER"

echo ""
echo "=============================================="
echo "  Resultado: $PASS PASS / $FAIL FAIL"
echo "=============================================="
[ "$FAIL" -eq 0 ]

