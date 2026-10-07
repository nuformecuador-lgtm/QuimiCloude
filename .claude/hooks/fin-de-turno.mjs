#!/usr/bin/env node
// Hook Stop del arnes v2. Corre el validador de features (offline, <1 s) y solo habla si falla:
// un recordatorio que sale en cada turno se deja de leer. Sale siempre con 0 para no bloquear.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

if (existsSync('scripts/validate-features.mjs')) {
  const r = spawnSync(process.execPath, ['scripts/validate-features.mjs'], { encoding: 'utf8' });
  if (r.status !== 0) {
    const detalle = (r.stderr || r.stdout || '').trim().split('\n').slice(0, 6).join(' | ');
    console.log(JSON.stringify({ systemMessage: `[arnes] el validador de features esta en ROJO: ${detalle}` }));
  }
}
