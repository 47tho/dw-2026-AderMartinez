/**
 * Script de prueba manual para el ciclo issue → rotate → reuse.
 * Uso: node scripts/test-refresh.mjs
 */
import { readFileSync } from 'node:fs';

// Cargar .env manualmente
const envContent = readFileSync('.env', 'utf-8');
for (const line of envContent.split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}

// Importar desde dist/
const { Sequelize } = await import('sequelize-typescript');
const { RefreshTokenModel } = await import('../dist/features/auth/refresh-tokens/infrastructure/persistence/models/refresh-token.model.js');
const { RefreshTokenRepository } = await import('../dist/features/auth/refresh-tokens/infrastructure/persistence/repositories/refresh-token.repository.js');
const { RefreshTokensService } = await import('../dist/features/auth/refresh-tokens/application/use-cases/refresh-tokens.service.js');

// Conectar a MySQL (mismo .env)
const sequelize = new Sequelize({
  dialect: 'mysql',
  host: process.env.DB_MYSQL_HOST,
  port: Number(process.env.DB_MYSQL_PORT),
  username: process.env.DB_MYSQL_USERNAME,
  password: process.env.DB_MYSQL_PASSWORD,
  database: process.env.DB_MYSQL_NAME,
  models: [RefreshTokenModel],
  logging: false,
});

await sequelize.authenticate();
console.log('✅ Conectado a MySQL');

const repo = new RefreshTokenRepository(sequelize);
const service = new RefreshTokensService(repo, sequelize);

// USER_ID de admin = 1
const USER_ID = 1;

console.log('\n=== 1) issue() ===');
const session1 = await service.issue(USER_ID, 'Test-Script');
console.log('Token A emitido (primeros 40 chars):', session1.rawToken.substring(0, 40) + '...');
console.log('familyId:', session1.familyId);
console.log('expiresAt:', session1.expiresAt.toISOString());

console.log('\n=== 2) rotate() con token A ===');
const out1 = await service.rotate(session1.rawToken, 'Test-Script');
console.log('Resultado:', out1.kind);
if (out1.kind === 'rotated') {
  console.log('Token B (primeros 40 chars):', out1.rawToken.substring(0, 40) + '...');
  console.log('Mismo familyId:', out1.familyId === session1.familyId);
}

console.log('\n=== 3) rotate() con token A (ya usado → reuse detection) ===');
const out2 = await service.rotate(session1.rawToken, 'Test-Script');
console.log('Resultado:', out2.kind);
if (out2.kind === 'reuse') {
  console.log('FamilyId:', out2.familyId);
  console.log('Filas revocadas:', out2.revoked);
}

console.log('\n=== 4) rotate() con token B (que debería estar revocado por la familia) ===');
if (out1.kind === 'rotated') {
  const out3 = await service.rotate(out1.rawToken, 'Test-Script');
  console.log('Resultado:', out3.kind);
}

console.log('\n=== 5) Estado en BD ===');
const allTokens = await RefreshTokenModel.findAll({
  where: { family_id: session1.familyId },
  order: [['id', 'ASC']],
});
for (const t of allTokens) {
  console.log(`  id=${t.id} status=${t.status} token_hash=${t.token_hash.substring(0, 16)}...`);
}

await sequelize.close();
console.log('\n✅ Script completado');
