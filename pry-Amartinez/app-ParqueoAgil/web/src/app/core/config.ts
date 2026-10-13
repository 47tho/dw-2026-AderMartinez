/**
 * URL base de la API. Por defecto el backend local (`npm run start:dev` en
 * `backend/`). Para apuntar a otro servidor sin recompilar, definir antes de
 * cargar la app: `<script>window.PQA_API_URL = 'http://192.168.1.10:3003/api'</script>`.
 */
export const API_URL: string =
  (globalThis as { PQA_API_URL?: string }).PQA_API_URL ?? 'http://localhost:3003/api';
