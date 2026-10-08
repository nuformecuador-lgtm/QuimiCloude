#!/usr/bin/env node
/**
 * Frescura del PERFIL DE PROYECTO (arnes v2, `docs/equipo.md > El perfil del proyecto`).
 *
 * El arnes es generico; lo que cambia de proyecto en proyecto (arquitectura, verificacion,
 * convenciones, dependencias) vive en los docs que lista `arnes.config.json > perfil.docs`.
 * Esos docs envejecen en silencio: nadie los relee porque nada lo pide. Este check lo pide.
 *
 *   - FALLA si `arnes.config.json` falta o no declara `jira.project`: sin eso el arnes no sabe
 *     a que proyecto pertenece (lo genera `/arnes-init`).
 *   - AVISA si un doc del perfil no existe, no lleva el marcador
 *     `<!-- perfil: revisado=AAAA-MM-DD ... -->` en su primera linea, o lo lleva vencido
 *     (`perfil.max_dias_sin_revisar`, 60 por defecto). Avisa y no falla: bloquear un PR porque
 *     un doc cumple 61 dias seria un gate que se ignora. Se renueva con `/arnes-init` (modo
 *     revision), que relee el doc con el humano y actualiza la fecha.
 *
 * La deriva de DEPENDENCIAS no se mira aqui: la caza `tests/guards/guard-dependencias-aprobadas`.
 *
 * Salida: lineas `AVISO: ...` y notas en stdout; errores en stderr y exit 1.
 */
import { existsSync, readFileSync } from 'node:fs';

const CONFIG = 'arnes.config.json';
const MARCADOR = /<!--\s*perfil:\s*revisado=(\d{4}-\d{2}-\d{2})/;

if (!existsSync(CONFIG)) {
  console.error(`falta ${CONFIG}: el arnes no sabe a que proyecto pertenece. Corre /arnes-init.`);
  process.exit(1);
}
let config;
try {
  config = JSON.parse(readFileSync(CONFIG, 'utf8'));
} catch (err) {
  console.error(`${CONFIG} no es JSON valido: ${err.message}`);
  process.exit(1);
}
if (!config.jira?.project) {
  console.error(`${CONFIG} no declara "jira.project". Corre /arnes-init.`);
  process.exit(1);
}

const docs = config.perfil?.docs ?? [];
const maxDias = config.perfil?.max_dias_sin_revisar ?? 60;
const hoy = Date.now();
let vencidos = 0;

for (const doc of docs) {
  if (!existsSync(doc)) {
    console.log(`AVISO: el perfil declara ${doc} y no existe. Corre /arnes-init.`);
    vencidos++;
    continue;
  }
  const primera = readFileSync(doc, 'utf8').split('\n', 1)[0];
  const m = MARCADOR.exec(primera);
  if (!m) {
    console.log(`AVISO: ${doc} no lleva el marcador "<!-- perfil: revisado=AAAA-MM-DD -->": nadie ha confirmado que siga vigente.`);
    vencidos++;
    continue;
  }
  const dias = Math.floor((hoy - Date.parse(`${m[1]}T00:00:00Z`)) / 86_400_000);
  if (dias > maxDias) {
    console.log(`AVISO: ${doc} lleva ${dias} dias sin revisar (max ${maxDias}). Revisalo con /arnes-init.`);
    vencidos++;
  }
}

console.log(`perfil del proyecto ${config.jira.project}: ${docs.length - vencidos}/${docs.length} docs revisados en los ultimos ${maxDias} dias`);
