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

Cada agente fija su **primario** en el bloque `agent` de `opencode.json`. La cadena de respaldo
**no es por agente: es global**, y vive en `.opencode/opencode-fallback.jsonc`. Las dos salen de
la misma tabla `MODELOS` de `scripts/gen-opencode.mjs`.

Que sea global no fue una preferencia: `fallback_models` en el frontmatter de un agente —o en el
bloque `agent`— hace que opencode filtre esa clave a la petición del modelo, y NVIDIA la rechaza
con `400 Validation: Unsupported parameter(s)`. El arnés no arrancaba.

| Agente | Primario | Por qué |
| --- | --- | --- |
| `leader` | `nemotron-3-super` | Retiene el ciclo entero y no escribe código: RULER@1M 91,75, a tres puntos del Ultra y 85 veces más rápido |
| `spec_author` | `deepseek-v4-flash` | Redactar EARS correcto es juicio; el más capaz de los tres rápidos |
| `implementer` | `deepseek-v4-flash` | Coordina y hace terminal: Terminal-Bench 82,7 |
| `frontend_dev` | `deepseek-v4-flash` | Mejor capacidad de código con latencia de trabajo |
| `backend_dev` | `deepseek-v4-flash` | Migraciones y RLS: lo más caro de equivocar |
| `reviewer` | `nemotron-3-super` | Buscar el test que falta es recuperación a profundidad |
| `extractor` | `nemotron-3-super` | Lectura exhaustiva, rápida |

**En la cadena del `reviewer`, `deepseek` va el último de los tres, y es deliberado.** Es el
primario del `implementer`: un reviewer que cae en el mismo modelo que escribió el código aprueba
sus propios puntos ciegos, y el aviso del fallback dice "cambié de modelo", no "acabas de perder
la revisión cruzada".

El reparto está elegido por capacidad **dentro de los que responden en segundos**. La versión
anterior lo eligió sólo por capacidad, y sus primarios tardaban entre 85 y 124 segundos por
turno.

## Credenciales: una

El arnés usa tres modelos y **una sola credencial**:

| Credencial | Cubre | Dónde se saca |
| --- | --- | --- |
| `NVIDIA_API_KEY` | `nemotron-3-super-120b-a12b`, `deepseek-v4-flash-0731`, `gpt-oss-20b` | https://build.nvidia.com |

**Una sola credencial, para los tres modelos.** Las keys son por *proveedor*, no por modelo: los
sirve el mismo endpoint (`integrate.api.nvidia.com/v1`) y lo único que cambia entre uno y otro es
el campo `model` del cuerpo. El botón "Get API Key" que aparece en la ficha de cada modelo y el
de `build.nvidia.com/settings/api-keys` llevan al mismo generador. Añadir un modelo de NVIDIA a
la cadena **no** añade una credencial.

**Los modelos de opencode Zen salieron de la cadena.** `opencode auth list` no mostraba
credencial de Zen, y con `opencode/big-pickle` de último eslabón la primera prueba real murió ahí
con `MessageAbortedError`, dejando el `task` al subagente en `Task cancelled`. Un eslabón sin
credencial no es un respaldo: es donde muere la corrida. Si algún día haces `/connect`, se añade
a mano **y se comprueba** que la corrida sobrevive a llegar hasta él.

## El respaldo en caliente: DESACTIVADO, y por qué

El plugin `opencode-runtime-fallback` **no está declarado** en la clave `plugin` de
`opencode.json`. `.opencode/opencode-fallback.jsonc` se conserva —la cadena se sigue generando y
el paso `4c` del gate la verifica— pero hoy no tiene efecto.

**Su aborto-y-reenvío mata la tarea de un subagente en vez de reintentarla.** Medido: con el
plugin cargado, delegar en el `reviewer` falló 3 de 3 veces con `Task cancelled`; con `--pure`
—sin plugins externos— funcionó a la primera. Un arnés de siete agentes vive de delegar, así que
entre respaldo y delegación gana delegación.

**El coste es real:** sin él, un `Provider is overloaded` de NVIDIA —frecuente en la capa
gratuita— corta el turno en vez de saltar al siguiente modelo. Hay que relanzar a mano.

Para reactivarlo: añadir `"plugin": ["opencode-runtime-fallback"]` a `opencode.json`. No hay que
instalarlo, opencode lo descarga solo a `~/.cache/opencode/packages/`. Y antes de confiar en él,
comprobar que la delegación a un subagente sigue completando.

Cuando estuvo activo quedó demostrado que **la cadena sí actúa** (`Fallback replay succeeded`),
y que su log `~/.config/opencode/opencode-fallback.log` dice `Plugin initialized with N agents`.

Dos cosas que el plugin no resolvía ni estando activo:

1. **Un id retirado no es un fallo transitorio.** Lo mete en cooldown y lo reintenta: contra un
   404 permanente son llamadas quemadas cada pocos minutos. Por eso existe el paso `4c` del gate
   (`scripts/check-modelos.mjs`), que cruza cada id contra el catálogo y deja el gate en rojo si
   desapareció.
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

# 4. (Opcional) Que opencode no cargue las skills de ~/.claude/. Ver la nota de abajo:
#    lo unico que cambia es una skill, no hay duplicacion de comandos. Si la quieres,
#    ponla en .env y el wrapper la carga sola.

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

Petición real **con herramientas declaradas**, que es lo único que hace un agente. Los seis
candidatos emitieron el `tool_call` correcto, así que el soporte de herramientas no discrimina.
Lo que separa es la latencia:

| Modelo | Con herramientas | En las cadenas |
| --- | --- | --- |
| `nemotron-3-super-120b-a12b` | **1,0 s** | primario de `leader`, `reviewer`, `extractor` |
| `gpt-oss-20b` | **1,5 s** | primer respaldo de todos |
| `deepseek-v4-flash-0731` | **4,4 s** | primario de los cuatro que escriben |
| `glm-5.3-flash` | 78 s | descartado |
| `nemotron-3-ultra-550b-a55b` | 85 s | descartado |
| `kimi-k3` | 124 s | descartado |

**Medir sin herramientas medía la tarea equivocada**, y medir una sola vez, peor todavía:
`nemotron-3-super` devolvió `HTTP 500` en el primer intento y respondió en 1 segundo en el
segundo; `deepseek` pasó de "sin respuesta en 90 s" a 4,4 s. En esta capa gratuita **una muestra
no significa nada**, y eso tiene una consecuencia directa: el plugin de respaldo no es una
comodidad por si retiran un modelo, es lo que absorbe los 500 y los cuelgues que forman parte
del funcionamiento normal aquí.

Lo que sí es real es el orden de magnitud. `kimi-k3` y `nemotron-3-ultra` eran los primarios de
los siete agentes y tardan dos minutos y minuto y medio por turno: en un ciclo agéntico, donde
cada tarea son decenas de idas y vueltas, eso convierte una feature en una jornada. Por eso
salieron. El techo de ~40 peticiones/minuto de la cuenta nunca fue el cuello de botella.

Dos ausencias que conviene conocer: `nemotron-3.5-lightning-30b-a3b` tardó **285 s** pese a
anunciarse como *"the fastest 30B A3B MoE model"*, y tres modelos del catálogo —`kimi-k2.6`,
`nemotron-nano-3-30b-a3b`, `llama-3.1-nemotron-ultra-253b-v1`— **devuelven 404 al inferir aunque
`/v1/models` los liste**. Eso acota lo que `scripts/check-modelos.mjs` puede prometer: verifica
que el id esté **listado**, no que **responda**.

**`OPENCODE_DISABLE_CLAUDE_CODE` es opcional, y probablemente no la quieras.** Medido en este
repo, comparando `opencode debug config` y `opencode debug skill` con y sin ella:

| | Sin la variable | Con la variable |
| --- | --- | --- |
| Comandos del arnés | 4 | 4 |
| Skills | 3 (incluye `codebase-memory` de `~/.claude/skills/`) | 2 |

**Lo único que cambia es que deja de cargar una skill.** Ninguna duplicación de comandos, que es
lo que una versión anterior de este documento afirmaba sin haberlo medido — venía del título de
una issue, no de una comprobación.

Si algún día la necesitas, va en `.env` como el resto: el wrapper lo carga al entorno antes de
arrancar, así que no hay que tocar variables de la máquina ni escribirla en cada sesión.

## Una herramienta a la vez

`feature_list.json`, `progress/current.md`, `.worktrees/` y el propio git **son uno solo**, y
ninguna de las dos herramientas sabe que la otra existe. Si corres Claude Code y opencode a la
vez sobre `dev`, las dos transicionan estados sobre el mismo archivo y la regla 1 —máximo 2
`in_progress` por zona— deja de significar nada: `validate-features.mjs` ve un archivo
consistente mientras cuatro agentes de dos arneses distintos editan.

Para comparar las dos herramientas de verdad, **un clon por herramienta**, no dos worktrees del
mismo repo: los worktrees comparten el `feature_list.json` de su rama.
