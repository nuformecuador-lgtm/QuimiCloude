// Verifica que cada id de modelo configurado en `.opencode/agents/*.md` sigue existiendo.
//
// Esto existe por un incidente real: el 2026-07-31 el id `opus-4.8` dejo de estar disponible
// y un `backend_dev` murio al arrancar sin escribir una linea. La respuesta de entonces fue
// prohibir que los agentes fijaran modelo. Ahora vuelven a fijarlo -es lo que hace viable
// repartir siete roles entre modelos gratuitos-, asi que el agujero se tapa por el otro lado:
// el id muerto se detecta en el gate y no a mitad de una feature.
//
// Un id retirado es ademas el peor caso para el plugin de fallback, que mete el modelo en
// cooldown y lo REINTENTA cuando expira: contra un 404 permanente son llamadas quemadas cada
// cinco minutos, para siempre.
//
// COMO se comprueba: se pide UNA vez el catalogo a `GET /v1/models` y se cruza con los ids
// configurados. La primera version mandaba un chat de un token a cada modelo, y eso estaba
// mal por dos motivos que solo se vieron corriendolo de verdad: gastaba cinco llamadas del
// techo de ritmo en vez de una, y sobre todo medía otra cosa -cuatro de los cinco modelos
// tardaron mas de 45s en contestar un `ping`, porque razonan antes de emitir, y un timeout
// se parece a un id muerto sin serlo-. El catalogo responde la pregunta exacta: existe o no.
//
// Sin `NVIDIA_API_KEY` no falla: avisa y sigue. El gate tiene que correr tambien para quien
// clona el repo y todavia no configuro nada.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const DIR = join(process.cwd(), '.opencode', 'agents');
const CATALOGO = 'https://integrate.api.nvidia.com/v1/models';

if (!existsSync(DIR)) {
  console.log('check-modelos: no hay `.opencode/agents/`, nada que verificar.');
  process.exit(0);
}

// Recoge todos los ids -primarios y de respaldo- de todos los agentes.
const usos = new Map();
for (const archivo of readdirSync(DIR).filter((f) => f.endsWith('.md'))) {
  const texto = readFileSync(join(DIR, archivo), 'utf8');
  const fm = texto.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fm) continue;
  const agente = archivo.replace(/\.md$/, '');
  const ids = [
    ...(fm[1].match(/^model:\s*(\S+)/m) || []).slice(1),
    ...[...fm[1].matchAll(/^\s+-\s+(\S+)\s*$/gm)].map((m) => m[1]),
  ];
  for (const id of ids) {
    if (!usos.has(id)) usos.set(id, []);
    usos.get(id).push(agente);
  }
}

const nvidia = [...usos.keys()].filter((id) => id.startsWith('nvidia/')).sort();
const zen = [...usos.keys()].filter((id) => id.startsWith('opencode/')).sort();

// La clave vale igual en el entorno o en `.env`, y el entorno manda -es el orden de dotenv, y
// permite pisar el archivo para una corrida suelta-. Se miran los dos porque el gate se lanza
// desde bash sin cargar nada, y opencode la recibe del wrapper `scripts/opencode.ps1` / `.sh`.
function claveDeDotenv() {
  try {
    // El `\r?` no sobra: el `.env` de Windows viene con CRLF y sin el, `$` no casa nunca y la
    // clave parece ausente estando puesta. El BOM se descarta por el mismo motivo.
    const texto = readFileSync(join(process.cwd(), '.env'), 'utf8').replace(/^﻿/, '');
    const m = texto.match(/^NVIDIA_API_KEY=(.+?)\r?$/m);
    return m ? m[1].trim().replace(/^["']|["']$/g, '') : null;
  } catch {
    return null;
  }
}

// El catalogo NO pide credencial: comprobado, responde 200 con los 81 modelos sin cabecera de
// autorizacion y tambien con una clave inventada. Asi que este guardia corre siempre, tengas o
// no la key configurada, y verifica lo unico que puede verificar: que los ids existen.
//
// Lo que NO demuestra, y por eso no lo insinua en su salida: que TU clave sirva. Una clave
// equivocada da exactamente el mismo verde aqui y falla al primer turno real.
let catalogo;
try {
  const r = await fetch(CATALOGO, { signal: AbortSignal.timeout(30_000) });
  if (!r.ok) {
    // Un fallo del catalogo NO es un id muerto: puede ser la red o un corte del servicio. Se
    // avisa y se sigue, porque dejar el gate en rojo por eso bloquearia el trabajo sin motivo.
    console.log(`check-modelos: el catalogo respondio HTTP ${r.status}, no se pudo comprobar.`);
    process.exit(0);
  }
  const json = await r.json();
  catalogo = new Set((json.data || []).map((m) => m.id));
} catch (e) {
  console.log(`check-modelos: no se pudo leer el catalogo (${e.message}), sin comprobar.`);
  process.exit(0);
}

const muertos = [];
for (const id of nvidia) {
  // El id de opencode lleva el prefijo del proveedor: `nvidia/<lo que espera la API>`.
  const idApi = id.replace(/^nvidia\//, '');
  const vivo = catalogo.has(idApi);
  if (!vivo) muertos.push(id);
  console.log(
    `${vivo ? 'ok ' : '>>>'} ${id.padEnd(46)} ${vivo ? 'existe' : 'NO EXISTE'}   (${usos.get(id).join(', ')})`,
  );
}
for (const id of zen) {
  console.log(`--  ${id.padEnd(46)} sin verificar (Zen usa la sesion de opencode, no una key)`);
}

if (muertos.length > 0) {
  console.error(
    `\ncheck-modelos: ${muertos.length} id(s) no estan en el catalogo de NVIDIA: ${muertos.join(', ')}.`,
  );
  console.error('Corrige el bloque NVIDIA de scripts/gen-opencode.mjs y regenera.');
  process.exit(1);
}
// Si no hay credencial en ningun sitio se dice aparte, para no mezclarlo con lo anterior: los
// ids pueden estar perfectos y el arnes no arrancar igualmente por falta de clave.
const hayClave = Boolean(process.env.NVIDIA_API_KEY || claveDeDotenv());
console.log(
  `\ncheck-modelos: los ${nvidia.length} ids de NVIDIA existen en el catalogo ` +
    `(${catalogo.size} modelos disponibles). El catalogo es publico: esto NO valida tu clave.`,
);
if (!hayClave) {
  console.log(
    'check-modelos: aviso, NVIDIA_API_KEY no esta ni en el entorno ni en .env. ' +
      'Sin ella los modelos no resolveran.',
  );
}
