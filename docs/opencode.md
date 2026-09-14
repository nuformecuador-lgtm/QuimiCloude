# El arnés en dos herramientas

Este arnés corre igual en **Claude Code** y en **opencode**. El proceso, el gate y las specs
son los mismos archivos; lo que cambia es la capa de configuración de cada herramienta, y eso
se genera en vez de mantenerse a mano.

## Qué se genera y qué no

| Archivo | Quién lo escribe |
| --- | --- |
| `.claude/agents/*.md`, `.claude/commands/*.md` | **Tú.** Es la fuente: la prosa vive aquí |
| `.opencode/agents/*.md`, `.opencode/commands/*.md` | `scripts/gen-opencode.mjs` |
| El bloque `agent` de `opencode.json` | `scripts/gen-opencode.mjs` |
| El resto de `opencode.json` (MCP, permisos, proveedores) | **Tú** |
| `.opencode/plugins/arnes.js`, `.opencode/opencode-fallback.jsonc` | **Tú** |

Los formatos no son intercambiables: Claude Code declara `tools:` como CSV y no conoce `mode:`
ni `permission:`; opencode quiere un objeto de booleanos, exige `mode` para separar primario de
subagente, y acepta globs de escritura por agente. Mantener 22 archivos a mano es garantizar que
diverjan, así que la prosa vive una vez y el resto se emite.

```bash
node scripts/gen-opencode.mjs           # regenera
node scripts/gen-opencode.mjs --check   # falla si lo generado no está al día
```

`./init.sh` corre el `--check` en los dos modos. **Si editas un agente, edita el de `.claude/` y
regenera.** Lo que escribas en `.opencode/agents/` se pierde en la siguiente corrida.

## Las vallas de escritura

En Claude Code, "el `frontend_dev` no toca backend" es una frase en un prompt. En opencode es
`permission.edit` con globs, y el modelo no puede desobedecerla. `scripts/gen-opencode.mjs` las
deriva de lo que cada agente ya dice de sí mismo:

| Agente | Puede escribir en |
| --- | --- |
| `leader` | `progress/**`, `feature_list.json` |
| `spec_author` | `specs/**` |
| `implementer` | `progress/**` |
| `frontend_dev` | `components/**`, `app/**`, `hooks/**`, `tests/**` — nunca `app/api/**`, `db/**`, `prisma/**` |
| `backend_dev` | `lib/**`, `db/**`, `prisma/**`, `app/api/**`, `tests/**`, `scripts/**` |
| `reviewer` | nada |
| `extractor` | `extracciones/**` |

Consecuencia a anticipar: **vas a ver rojos donde antes veías verde.** Un `backend_dev` que hoy
toca de refilón un archivo de `components/` y nadie se entera, en opencode falla duro. No es una
regresión: es la regla que ya tenías, empezando a cumplirse.

## Los permisos significan cosas distintas

En `.claude/settings.local.json` **gana el `deny`**. En `opencode.json` gana **la última regla
que hace match**. El mismo conjunto de permisos, escrito en el mismo orden, se comporta distinto
en cada herramienta.

Por eso en `opencode.json` el `"*": "ask"` va primero, los `allow` en medio y los `ask` de
instalación de dependencias **al final**: si `"pnpm add *": "ask"` fuera antes de un `allow` más
amplio, la regla 7 del arnés —ninguna dependencia entra sin aprobación humana— se abriría sola.

## El enrutado de modelos

Cada agente lleva primario + tres respaldos. Los tres primeros son de NVIDIA; el último es un
modelo gratuito de opencode Zen, para que el arnés siga en pie cuando la cuenta de NVIDIA entera
esté en 429 — el techo de ritmo parece ser de cuenta, no por modelo, así que una cadena que no
salga de NVIDIA no protege del fallo más probable.

| Agente | Primario | Por qué |
| --- | --- | --- |
| `leader` | `nemotron-3-ultra-550b-a55b` | Retiene el estado del ciclo entero y no escribe código: RULER@1M de 94.7 |
| `spec_author` | `kimi-k3` | Redactar EARS correcto es juicio, no checklist |
| `implementer` | `kimi-k3` | Coordina y hace terminal: Terminal-Bench 88.3 |
| `frontend_dev` | `kimi-k3` | FrontierSWE 81.2 |
| `backend_dev` | `kimi-k3` | Migraciones y RLS: lo más caro de equivocar |
| `reviewer` | `nemotron-3-ultra-550b-a55b` | Buscar el test que falta es recuperación a profundidad |
| `extractor` | `kimi-k3` | La pasada 2 es síntesis |

**El `reviewer` no lleva `kimi-k3` en ninguna posición de su cadena, y es deliberado.** Revisa lo
que escribió el `implementer`, que sí lo lleva. Un reviewer que cae al mismo modelo que produjo
el código aprueba sus propios puntos ciegos, y el aviso del fallback dice "cambié de modelo", no
"acabas de perder la revisión cruzada".

Cuando exista `scripts/next-feature.mjs` y el `leader` deje de cargar `feature_list.json` entero,
su eje deja de ser retención y pasa a ser disciplina de orquestación: ahí el primario correcto
pasa a ser `kimi-k3`. Es un cambio de una línea en `MODELOS`.

## Credenciales: dos, no ocho

Las keys son **por proveedor, no por modelo**. Los ocho modelos que usa el arnés se cubren con
dos credenciales, porque cada proveedor sirve todos los suyos por el mismo endpoint:

| Credencial | Cubre | Dónde se saca |
| --- | --- | --- |
| `NVIDIA_API_KEY` | `kimi-k3`, `deepseek-v4-flash-0731`, `nemotron-3-ultra-550b-a55b`, `nemotron-3-super-120b-a12b`, `nemotron-3.5-lightning-30b-a3b` | https://build.nvidia.com |
| La sesión de opencode (`/connect`) | `big-pickle`, `nemotron-3-ultra-free`, `mimo-v2.5-free` | https://opencode.ai/auth |

Los cinco modelos de NVIDIA —primarios y de respaldo— entran por **la misma** key, porque los
sirve el mismo endpoint (`integrate.api.nvidia.com/v1`). Lo mismo con los tres de Zen. Añadir un
modelo a una cadena de respaldo **no** añade una credencial mientras sea del mismo proveedor.

Zen **no lleva variable de entorno**: `/connect` en la TUI guarda la credencial en el almacén de
opencode y con eso basta. `opencode.json` no declara `provider.opencode` a propósito — si lo
hiciera apuntando a una variable vacía, esa cadena vacía podría ensombrecer la credencial que ya
guardó el login. Para un entorno headless sin TUI, añade el bloque entonces y no antes.

## El respaldo en caliente

Lo pone el plugin `opencode-runtime-fallback`, declarado en la clave `plugin` de `opencode.json`.
**No hay que instalarlo a mano ni con `pnpm`**: opencode lo descarga solo al arrancar, a su propia
caché (`~/.cache/opencode/packages/`), no a los `node_modules` del proyecto. Para forzar una
versión concreta o instalarlo en la config global existe `opencode plugin <modulo>` (con `-g`
global, `-f` para reemplazar la versión instalada).

Que está vivo y leyendo las cadenas se comprueba en su log,
`~/.config/opencode/opencode-fallback.log`:

```
[opencode-fallback] Plugin initialized with 7 agents
```

Ese `7 agents` es la prueba de que recoge los `fallback_models` de cada agente. Si dijera `0`,
las cadenas no le estarían llegando.

Su comportamiento se afina en `.opencode/opencode-fallback.jsonc`. Dispara con
429, 5xx, cuota agotada y `model not found`, reenvía el mensaje al siguiente de la cadena y avisa
con un toast.

Dos cosas que el plugin **no** resuelve:

1. **Un id retirado no es un fallo transitorio.** El plugin mete el modelo en cooldown y lo
   reintenta al expirar: contra un 404 permanente son llamadas quemadas cada cinco minutos. Por
   eso el cooldown está en 300s y no en los 60 por defecto, y por eso existe el paso `4c` del
   gate (`scripts/check-modelos.mjs`), que cruza cada id contra el catálogo de NVIDIA y deja el
   gate en rojo si desapareció.
2. **Un toast es chat.** Este arnés está pensado para correr solo, y su regla 3 dice que el
   estado va a disco. El aviso que sobrevive a que no estés delante es el gate en rojo.

## Montarlo

La clave de NVIDIA vale igual en `.env` que como variable de entorno. **Pero opencode no carga
el `.env` por su cuenta**, y eso está medido: con el valor sólo en `.env`, un `{env:...}` se
resuelve a **cadena vacía** y la petición sale con la credencial en blanco, sin error ni aviso.
Por eso el arnés trae un lanzador que lo carga antes de arrancar.

```bash
# 1. La clave en .env, junto al resto de la configuración del repo:
#       NVIDIA_API_KEY=nvapi-...
#    Una sola cubre los cinco modelos de NVIDIA. Si prefieres variable de entorno del
#    usuario, también vale y manda sobre el .env.

# 2. Lanzar opencode SIEMPRE por el wrapper, que carga .env al entorno del proceso.
./scripts/opencode.ps1                 # Windows / PowerShell
./scripts/opencode.sh                  # Git Bash, WSL, Linux
./scripts/opencode.ps1 agent list      # los argumentos pasan tal cual

# 3. Los modelos gratuitos de Zen, para el último eslabón de cada cadena.
#    No lleva variable de entorno: /connect guarda la credencial en el almacén de opencode.
opencode auth login   # o /connect dentro de la TUI

# 4. Que opencode no lea la configuración de Claude Code por detrás
export OPENCODE_DISABLE_CLAUDE_CODE=1

# 5. El plugin de respaldo NO se instala a mano: opencode lo baja solo porque
#    `opencode.json` lo declara en la clave `plugin`. Se comprueba en su log.
grep "Plugin initialized" ~/.config/opencode/opencode-fallback.log | tail -2
#    Tiene que decir "with 7 agents". Si dice 0, las cadenas no le llegan.

# 6. Comprobar que carga los siete agentes con sus modos
./scripts/opencode.ps1 agent list
./scripts/opencode.ps1 debug agent reviewer
```

Si lanzas `opencode` a pelo con la clave sólo en `.env`, arranca sin quejarse y falla al primer
turno. El wrapper avisa antes de lanzar si `NVIDIA_API_KEY` sigue vacía.

## Latencia: medido, y no es menor

Petición real de un prompt trivial a cada modelo de las cadenas, con una clave válida:

| Modelo | Respuesta a un prompt trivial | Rol donde está hoy |
| --- | --- | --- |
| `nemotron-3-super-120b-a12b` | **0,6 s** | sólo respaldo |
| `deepseek-v4-flash-0731` | **8,4 s** | sólo respaldo |
| `nemotron-3-ultra-550b-a55b` | **85 s** | primario de `leader` y `reviewer` |
| `kimi-k3` | **144 s** | primario de otros cinco |
| `nemotron-3.5-lightning-30b-a3b` | **285 s** | respaldo de `extractor` |

Devolver "4" a la pregunta "2+2?" le costó a `kimi-k3` dos minutos y medio, y a
`nemotron-3.5-lightning` —anunciado como *"the fastest 30B A3B MoE model"*— casi cinco. No es
falta de presupuesto de tokens: se repitió con `max_tokens` amplio y el resultado fue el mismo.
Todos devuelven `reasoning_content`: razonan antes de emitir la primera palabra visible.

**Esto invierte el criterio de reparto.** El techo de ~40 peticiones/minuto deja de ser el
cuello de botella: en un ciclo agéntico, donde cada tarea son decenas de idas y vueltas, un
primario de 144 s convierte una feature en una jornada. Los dos únicos modelos con latencia de
trabajo son `nemotron-3-super` (0,6 s, RULER@1M 91,75 e IFBench 72,56 — muy cerca del Ultra) y
`deepseek-v4-flash` (8,4 s, Terminal-Bench 82,7).

Son medidas de una sola muestra, en capa gratuita y en un momento dado; repítelas antes de
rediseñar una cadena. Pero el orden de magnitud no es un matiz.

El paso 3 no es cosmético: opencode escanea `~/.claude/skills/` y sincroniza comandos de Claude
Code, así que sin él te aparecen los comandos del arnés duplicados y con sintaxis distinta.

## Una herramienta a la vez

`feature_list.json`, `progress/current.md`, `.worktrees/` y el propio git **son uno solo**, y
ninguna de las dos herramientas sabe que la otra existe. Si corres Claude Code y opencode a la
vez sobre `dev`, las dos transicionan estados sobre el mismo archivo y la regla 1 —máximo 2
`in_progress` por zona— deja de significar nada: `validate-features.mjs` ve un archivo
consistente mientras cuatro agentes de dos arneses distintos editan.

Para comparar las dos herramientas de verdad, **un clon por herramienta**, no dos worktrees del
mismo repo: los worktrees comparten el `feature_list.json` de su rama.
