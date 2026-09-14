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

Lo pone el plugin `opencode-runtime-fallback` (`.opencode/opencode-fallback.jsonc`). Dispara con
429, 5xx, cuota agotada y `model not found`, reenvía el mensaje al siguiente de la cadena y avisa
con un toast.

Dos cosas que el plugin **no** resuelve:

1. **Un id retirado no es un fallo transitorio.** El plugin mete el modelo en cooldown y lo
   reintenta al expirar: contra un 404 permanente son llamadas quemadas cada cinco minutos. Por
   eso el cooldown está en 300s y no en los 60 por defecto, y por eso existe el paso `4c` del
   gate (`scripts/check-modelos.mjs`), que hace ping a cada id y deja el gate en rojo si murió.
2. **Un toast es chat.** Este arnés está pensado para correr solo, y su regla 3 dice que el
   estado va a disco. El aviso que sobrevive a que no estés delante es el gate en rojo.

## Montarlo

```bash
# 1. La clave de NVIDIA en el entorno (ver .env.example)
#    Windows: [Environment]::SetEnvironmentVariable("NVIDIA_API_KEY", "nvapi-...", "User")
#    y abrir una terminal NUEVA: una variable de usuario no entra en procesos ya vivos.

# 2. Los modelos gratuitos de Zen, para el último eslabón de cada cadena.
#    No lleva variable de entorno: /connect guarda la credencial en el almacén de
#    opencode y con eso basta. Una key en el entorno solo hace falta headless (CI).
opencode auth login   # o /connect dentro de la TUI

# 3. Que opencode no lea la configuración de Claude Code por detrás
export OPENCODE_DISABLE_CLAUDE_CODE=1

# 4. Comprobar que carga los siete agentes con sus modos
opencode agent list
opencode debug agent reviewer
```

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
