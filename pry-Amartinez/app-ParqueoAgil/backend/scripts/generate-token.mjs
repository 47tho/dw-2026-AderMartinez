import { readFileSync } from 'node:fs';
import { signAccessToken } from '../dist/shared/auth/jwt.js';

const args = process.argv.slice(2);
const username = args[0] ?? 'admin';

// Cargar .env manualmente
const envContent = readFileSync('.env', 'utf-8');
for (const line of envContent.split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}

// El ID del usuario: admin=1, seller=2 (según seeders)
const userId = username === 'admin' ? 1 : 2;

const { token, expiresIn } = signAccessToken({ id: userId, username });
console.log(token);
