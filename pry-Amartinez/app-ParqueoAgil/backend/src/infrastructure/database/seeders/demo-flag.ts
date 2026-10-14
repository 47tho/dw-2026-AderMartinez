/**
 * ¿Se siembran datos de demostración (conductor con contraseña conocida y
 * tickets de ejemplo)?
 *
 * - Desarrollo: sí, salvo `SEED_DEMO_ACTIVITY=false`.
 * - Producción (`NODE_ENV=production`): no, salvo `SEED_DEMO_ACTIVITY=true`.
 */
export function demoSeedingEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const flag = (env.SEED_DEMO_ACTIVITY ?? '').trim().toLowerCase();
  if (env.NODE_ENV === 'production') return flag === 'true';
  return flag !== 'false';
}
