// Genera `.opencode/` a partir de `.claude/`.
//
// El arnes vive en dos herramientas y los formatos NO son intercambiables: Claude Code
// declara `tools:` como CSV y no conoce `mode:` ni `permission:`; opencode quiere un objeto
// de booleanos, exige `mode` para distinguir primario de subagente, y aplica globs de
// escritura que el modelo no puede desobedecer. Mantener 22 archivos a mano es garantizar
// que diverjan en silencio, asi que la prosa vive UNA vez -en `.claude/`- y esto la emite.
//
// No edites nada bajo `.opencode/agents/` ni `.opencode/commands/`: se sobreescribe.
// `./init.sh` regenera y compara; si lo generado no coincide con la fuente, el gate falla.

import { readFileSync, writeFileSync, readdirSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = process.cwd();
const AVISO = '<!-- GENERADO por scripts/gen-opencode.mjs desde .claude/ - no editar a mano -->';

// --- Enrutado de modelos -----------------------------------------------------------------
//
// Cada agente lleva su cadena completa: primario + 3 respaldos. Los tres primeros son de
// NVIDIA y el ultimo es un free de opencode Zen, para que el arnes siga en pie incluso si la
// cuenta de NVIDIA entera esta en 429 -el limite parece ser de cuenta, no por modelo, asi que
// una cadena que no salga de NVIDIA no protege del fallo mas probable-.
//
// El `reviewer` NO lleva kimi-k3 en ninguna posicion, y es deliberado: revisa lo que escribio
// el implementer, que si lo lleva. Un reviewer que cae al mismo modelo que produjo el codigo
// aprueba sus propios puntos ciegos, y el toast del fallback avisa del cambio de modelo, no
// de que acabas de perder la revision cruzada.
// Los tres que quedan se eligieron MIDIENDO, con una peticion real que incluye herramientas
// -que es lo unico que hace un agente-. Los seis candidatos emiten `tool_call` correcto, asi
// que el soporte de herramientas no discrimina; lo que separa es la latencia, por dos ordenes
// de magnitud:
//
//   nemotron-3-super   1,0 s      deepseek-v4-flash   4,4 s      gpt-oss-20b   1,5 s
//   glm-5.3-flash     78 s        nemotron-3-ultra   85 s        kimi-k3     124 s
//
// Por eso salieron de las cadenas `kimi-k3` y `nemotron-3-ultra`, que eran primarios de los
// siete agentes: dos minutos por turno convierten una feature en una jornada. Tambien salio
// `nemotron-3.5-lightning` (285 s), pese a anunciarse como "the fastest 30B A3B MoE model".
const NVIDIA = {
  deepseek: 'nvidia/deepseek-ai/deepseek-v4-flash-0731',
  super: 'nvidia/nvidia/nemotron-3-super-120b-a12b',
  gptoss: 'nvidia/openai/gpt-oss-20b',
};
const ZEN = {
  pickle: 'opencode/big-pickle',
  ultraFree: 'opencode/nemotron-3-ultra-free',
  mimo: 'opencode/mimo-v2.5-free',
};

// Nombre legible de cada modelo de NVIDIA, para el bloque `provider` de opencode.json.
const NOMBRES = {
  [NVIDIA.deepseek]: 'DeepSeek V4 Flash',
  [NVIDIA.super]: 'Nemotron 3 Super',
  [NVIDIA.gptoss]: 'GPT-OSS 20B',
};

const MODELOS = {
  // Retiene el estado del ciclo entero y no escribe codigo: RULER@1M de 91,75 -a tres puntos
  // del Ultra- a 1 segundo en vez de 85.
  leader: [NVIDIA.super, NVIDIA.gptoss, NVIDIA.deepseek, ZEN.ultraFree],
  // Redactar EARS correcto es juicio; deepseek es el mas capaz de los tres rapidos.
  spec_author: [NVIDIA.deepseek, NVIDIA.super, NVIDIA.gptoss, ZEN.pickle],
  // Coordina pero tambien hace terminal: tests, commit, `gh pr create`. Terminal-Bench 82,7.
  implementer: [NVIDIA.deepseek, NVIDIA.super, NVIDIA.gptoss, ZEN.pickle],
  frontend_dev: [NVIDIA.deepseek, NVIDIA.super, NVIDIA.gptoss, ZEN.pickle],
  // Migraciones Prisma y RLS son lo mas caro de equivocar en este stack.
  backend_dev: [NVIDIA.deepseek, NVIDIA.super, NVIDIA.gptoss, ZEN.pickle],
  // Buscar el test que falta es recuperacion a profundidad: RULER manda. Y `deepseek` va el
  // ULTIMO de los tres a proposito: es el primario del implementer, y un reviewer que cae en
  // el mismo modelo que escribio el codigo aprueba sus propios puntos ciegos.
  reviewer: [NVIDIA.super, NVIDIA.gptoss, NVIDIA.deepseek, ZEN.ultraFree],
  extractor: [NVIDIA.super, NVIDIA.gptoss, NVIDIA.deepseek, ZEN.mimo],
};

// --- Vallas de escritura -----------------------------------------------------------------
//
// Esto es lo que `.claude/agents/*.md` ya dice en prosa -"no toques backend", "no edites
// codigo"- convertido en algo que el modelo no puede saltarse aunque quiera. La ultima regla
// que hace match gana, asi que el `*: deny` va SIEMPRE primero y las negaciones finas al final.
const PERMISOS = {
  // Lista NEGRA, no blanca, porque es lo que dice su propio archivo: "NO edites archivos en
  // `src/`, `app/`, `lib/`, `components/` ni `tests/`". La primera version lo tradujo como
  // lista blanca -solo `progress/**` y `feature_list.json`- y eso rompia dos comandos: el
  // leader es el agente primario, o sea quien ejecuta `/afinar-feature`, que siembra
  // `specs/<key>-<slug>/requirements.md`, y `/afinar-regla`, que parchea `.claude/agents/*.md`,
  // `docs/*.md`, `AGENTS.md` y `CHECKPOINTS.md`. Con la lista blanca los dos morian al escribir.
  // "El leader no edita codigo" sigue en pie: lo que se le niega es codigo, no el arnes.
  leader: {
    '*': 'allow',
    'app/**': 'deny',
    'lib/**': 'deny',
    'components/**': 'deny',
    'hooks/**': 'deny',
    'tests/**': 'deny',
    'e2e/**': 'deny',
    'db/**': 'deny',
    'prisma/**': 'deny',
  },
  spec_author: { '*': 'deny', 'specs/**': 'allow' },
  implementer: { '*': 'deny', 'progress/**': 'allow' },
  frontend_dev: {
    '*': 'deny',
    'components/**': 'allow',
    'app/**': 'allow',
    'hooks/**': 'allow',
    'tests/**': 'allow',
    'app/api/**': 'deny',
    'db/**': 'deny',
    'prisma/**': 'deny',
  },
  backend_dev: {
    '*': 'deny',
    'lib/**': 'allow',
    'db/**': 'allow',
    'prisma/**': 'allow',
    'app/api/**': 'allow',
    'tests/**': 'allow',
    'scripts/**': 'allow',
  },
  reviewer: { '*': 'deny' },
  extractor: { '*': 'deny', 'extracciones/**': 'allow' },
};

// Modelo de cada comando. Sin esto heredan el del agente activo -el `leader`, que lleva
// nemotron-3-ultra porque su eje es retener contexto-. Pero `/afinar-feature` y `/afinar-regla`
// no retienen: interrogan al humano y redactan, que es el mismo trabajo de juicio por el que
// `spec_author` lleva kimi-k3. Los otros dos se quedan con el del leader: `/extraer-modulo`
// delega en el subagente `extractor` y `/jira-connect` solo encadena llamadas al MCP.
const MODELO_COMANDO = {
  'afinar-feature': NVIDIA.deepseek,
  'afinar-regla': NVIDIA.deepseek,
};

const MODO = { leader: 'primary' };
const HERRAMIENTAS = {
  Read: 'read',
  Glob: 'glob',
  Grep: 'grep',
  Write: 'write',
  Edit: 'edit',
  Bash: 'bash',
  Task: 'task',
};
const TODAS = ['read', 'glob', 'grep', 'list', 'write', 'edit', 'bash', 'task', 'webfetch', 'patch'];

function partir(texto) {
  const m = texto.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!m) throw new Error('sin frontmatter');
  const meta = {};
  for (const linea of m[1].split(/\r?\n/)) {
    const kv = linea.match(/^([a-zA-Z-]+):\s*(.*)$/);
    if (kv) meta[kv[1]] = kv[2].trim();
  }
  return { meta, cuerpo: m[2] };
}

const yamlValor = (v) => JSON.stringify(String(v));

function bloquePermisos(nombre) {
  const p = PERMISOS[nombre];
  if (!p) return [];
  const lineas = ['permission:', '  edit:'];
  for (const [glob, valor] of Object.entries(p)) lineas.push(`    ${yamlValor(glob)}: ${valor}`);
  return lineas;
}

function agente(archivo) {
  const { meta, cuerpo } = partir(readFileSync(archivo, 'utf8'));
  const nombre = meta.name;
  const cadena = MODELOS[nombre];
  if (!cadena) throw new Error(`${nombre}: sin cadena de modelos en MODELOS`);

  const permitidas = new Set(
    (meta.tools || '')
      .split(',')
      .map((t) => HERRAMIENTAS[t.trim()])
      .filter(Boolean),
  );
  const frontmatter = [
    '---',
    `description: ${yamlValor(meta.description)}`,
    `mode: ${MODO[nombre] || 'subagent'}`,
    // Solo `model`. `fallback_models` NO puede ir aqui: opencode 1.18.30 filtra el frontmatter
    // del agente a la peticion del modelo, y NVIDIA la rechaza con
    // `400 Validation: Unsupported parameter(s): fallback_models`. El arnes no arrancaba. Lo
    // mismo pasa declarandolo en el bloque `agent` de opencode.json. La cadena vive en
    // `.opencode/opencode-fallback.jsonc`, que es del plugin y no viaja a la API.
    `model: ${cadena[0]}`,
    'tools:',
    // Las omitidas se apagan EXPLICITAMENTE. Callarlas dejaria que el default de opencode le
    // devuelva `bash` al reviewer, que en Claude Code no lo tiene.
    //
    // OJO con `write` y `edit`: aqui son informativos. Comprobado con `opencode debug agent`,
    // quien decide si el agente puede escribir es el bloque `permission.edit` de mas abajo, no
    // esta lista: con `permission.edit: {"*": deny}` salen los dos en false aunque digan true,
    // y con `allow` salen en true aunque digan false. La valla real es el permiso.
    ...TODAS.map((t) => `  ${t}: ${permitidas.has(t)}`),
    ...bloquePermisos(nombre),
    '---',
  ];
  return { nombre, texto: `${frontmatter.join('\n')}\n${AVISO}\n\n${cuerpo.trimStart()}` };
}

function comando(archivo) {
  const { meta, cuerpo } = partir(readFileSync(archivo, 'utf8'));
  // `argument-hint` no existe en opencode: se pliega en la descripcion para no perderlo.
  const desc = meta['argument-hint']
    ? `${meta.description} (argumento: ${meta['argument-hint']})`
    : meta.description;
  // opencode EJECUTA !`comando` dentro del cuerpo de un comando. La prosa de jira-connect
  // habla del prefijo `!` y deja al parser un `!` pegado a un backtick. Se reescribe ese
  // span como <code>!</code>: renderiza identico en markdown y ya no hay backtick que abrir.
  const seguro = cuerpo.split('`!`').join('<code>!</code>');
  const slug = archivo.replace(/\\/g, '/').split('/').pop().replace(/\.md$/, '');
  const frontmatter = ['---', `description: ${yamlValor(desc)}`];
  if (MODELO_COMANDO[slug]) frontmatter.push(`model: ${MODELO_COMANDO[slug]}`);
  frontmatter.push('---');
  return { texto: `${frontmatter.join('\n')}\n${AVISO}\n\n${seguro.trimStart()}` };
}

// `--check` no escribe: compara lo que saldria contra lo que hay en disco y falla si difieren.
// Se compara contra el disco y NO contra git a proposito: el gate corre antes de commitear, asi
// que preguntarle a git si hay cambios pendientes daria rojo justo cuando acabas de regenerar
// bien. Lo que importa es si lo generado esta al dia con su fuente, no si esta commiteado.
const CHECK = process.argv.includes('--check');
const desfasados = [];
const huerfanos = [];

function escribir(ruta, texto) {
  if (!CHECK) {
    writeFileSync(ruta, texto, 'utf8');
    return;
  }
  const actual = existsSync(ruta) ? readFileSync(ruta, 'utf8') : null;
  if (actual !== texto) desfasados.push(ruta.replace(`${RAIZ}\\`, '').replace(`${RAIZ}/`, ''));
}

function emitir(origen, destino, fn) {
  if (!CHECK) {
    rmSync(join(RAIZ, destino), { recursive: true, force: true });
    mkdirSync(join(RAIZ, destino), { recursive: true });
  }
  const archivos = readdirSync(join(RAIZ, origen)).filter((f) => f.endsWith('.md'));
  for (const archivo of archivos) {
    const { texto } = fn(join(RAIZ, origen, archivo));
    escribir(join(RAIZ, destino, archivo), texto);
  }

  // En modo normal el directorio se borra entero antes de emitir, asi que un huerfano no
  // sobrevive. En `--check` no se borra nada, y comparar archivo a archivo NO basta: si
  // alguien elimina `.claude/agents/foo.md`, el `.opencode/agents/foo.md` generado se queda
  // ahi para siempre y opencode sigue cargando un agente fantasma, con el gate en verde.
  if (CHECK && existsSync(join(RAIZ, destino))) {
    const esperados = new Set(archivos);
    for (const f of readdirSync(join(RAIZ, destino)).filter((f) => f.endsWith('.md'))) {
      if (!esperados.has(f)) huerfanos.push(`${destino}/${f}`);
    }
  }
  return archivos.length;
}

const agentes = emitir('.claude/agents', '.opencode/agents', agente);
const comandos = emitir('.claude/commands', '.opencode/commands', comando);

// El bloque `agent` de `opencode.json` tambien se emite desde aqui.
//
// Las cadenas van en el frontmatter de cada agente Y en `opencode.json`, porque el plugin de
// respaldo documenta `opencode.json` como su sitio y `opencode debug agent` confirma que la
// clave `fallback_models` no sobrevive al config resuelto por ninguna de las dos vias -es una
// clave del plugin, no del nucleo-. Declararla en los dos sitios es barato; declararla a mano
// en dos sitios seria la receta para que diverjan, asi que sale del mismo MODELOS que el resto.
const rutaConfig = join(RAIZ, 'opencode.json');
const config = JSON.parse(readFileSync(rutaConfig, 'utf8'));
// Solo el primario por agente. La cadena de respaldo es GLOBAL y vive en el config del plugin;
// ponerla aqui rompe el arranque igual que en el frontmatter (ver la nota de `agente()`).
config.agent = Object.fromEntries(
  Object.entries(MODELOS).map(([nombre, cadena]) => [nombre, { model: cadena[0] }]),
);

// `provider.nvidia.models` tambien se emite desde la misma tabla, y no es cosmetico.
//
// Estuvo escrito a mano mientras las cadenas se generaban, o sea DOS fuentes para el mismo
// conjunto de ids. Cuando se corrigio `nemotron-3-ultra` -> `nemotron-3-ultra-550b-a55b`, las
// cadenas quedaron bien y esta lista se quedo declarando el id muerto y sin declarar el bueno.
// El verificador no lo vio porque lee los ids de `.opencode/agents/`, no de aqui. Generandolo
// del mismo sitio, ese desfase no puede volver a existir.
const usados = new Set(Object.values(MODELOS).flat().filter((m) => m.startsWith('nvidia/')));
config.provider.nvidia.models = Object.fromEntries(
  [...usados].sort().map((id) => {
    const idApi = id.replace(/^nvidia\//, '');
    if (!NOMBRES[id]) throw new Error(`${id}: falta su entrada en NOMBRES`);
    return [idApi, { name: NOMBRES[id] }];
  }),
);
escribir(rutaConfig, `${JSON.stringify(config, null, 2)}\n`);

// La cadena de respaldo, global, dentro del config del plugin. Se emite desde la misma tabla
// MODELOS que los primarios, reemplazando SOLO el array para no perder los comentarios del
// archivo. El orden sale de cuantos agentes usan cada modelo como primario: primero el mas
// usado, y los de Zen al final.
const frecuencia = new Map();
for (const cadena of Object.values(MODELOS)) {
  for (const [i, m] of cadena.entries()) frecuencia.set(m, (frecuencia.get(m) || 0) + (i === 0 ? 10 : 1));
}
//
// Los modelos de Zen quedan FUERA de la cadena, y no es un descuido. Un eslabon sin credencial
// no es un respaldo: es donde muere la corrida. Con `opencode/big-pickle` al final, la primera
// prueba real termino asi -del log del plugin-:
//
//   model: opencode/big-pickle  errorName: MessageAbortedError
//   error not retryable and not in fallback chain, skipping
//
// ...y el `task` al subagente quedo en "Task cancelled". `opencode auth list` mostraba
// credenciales de Nvidia y MiniMax, ninguna de Zen. Si algun dia se hace `/connect`, se añade
// el modelo de Zen aqui a mano y se comprueba que la corrida sobrevive a llegar hasta el.
const CADENA_GLOBAL = [...frecuencia.keys()]
  .filter((m) => !m.startsWith('opencode/'))
  .sort((a, b) => frecuencia.get(b) - frecuencia.get(a) || a.localeCompare(b));

const rutaPlugin = join(RAIZ, '.opencode', 'opencode-fallback.jsonc');
if (existsSync(rutaPlugin)) {
  const texto = readFileSync(rutaPlugin, 'utf8');
  const array = `"fallback_models": [\n${CADENA_GLOBAL.map((m) => `    "${m}"`).join(',\n')}\n  ]`;
  const nuevo = texto.replace(/"fallback_models":\s*\[[^\]]*\]/, array);
  if (nuevo === texto && !texto.includes('"fallback_models"')) {
    throw new Error('.opencode/opencode-fallback.jsonc: falta la clave `fallback_models` que emitir');
  }
  escribir(rutaPlugin, nuevo);
}

if (CHECK) {
  if (desfasados.length > 0 || huerfanos.length > 0) {
    if (desfasados.length > 0) {
      console.error('gen-opencode --check: desfasados respecto a `.claude/`:');
      for (const f of desfasados) console.error(`  - ${f}`);
    }
    if (huerfanos.length > 0) {
      console.error('gen-opencode --check: sin fuente en `.claude/` (agentes fantasma):');
      for (const f of huerfanos) console.error(`  - ${f}`);
    }
    console.error('Corre `node scripts/gen-opencode.mjs` y commitea el resultado.');
    process.exit(1);
  }
  console.log('gen-opencode --check: `.opencode/` al dia con `.claude/`.');
  process.exit(0);
}

console.log(
  `gen-opencode: ${agentes} agentes y ${comandos} comandos emitidos, ` +
    `y el bloque \`agent\` de opencode.json con ${Object.keys(MODELOS).length} cadenas.`,
);
