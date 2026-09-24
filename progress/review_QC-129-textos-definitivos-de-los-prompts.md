# QC-129 — textos-definitivos-de-los-prompts · review

> Rama `feature/QC-129-textos-definitivos-de-los-prompts`, tip `708fa42d`.
> Diff revisado: `git diff origin/dev...HEAD` (21 archivos, +1527 / -84).
> Revisor: `reviewer`, 2026-09-18.
>
> **Este informe no contiene texto de prompt** (R9, `[D11]`, `[D13]`).

## Veredicto

**OK (aprobado).** 0 hallazgos BLOQUEANTES, 5 menores.

La ficha **no puede pasar a `done` todavia**, y eso es correcto: T10 y T11 son `[HUMANO]` y siguen
sin marcar, T14 es del leader. Lo que se aprueba aqui es el trabajo del arnes (T0-T9, T12, T13).

## Checklist de CHECKPOINTS.md

| Punto | Estado |
|---|---|
| `specs/<feature>/requirements.md` EARS numerados | **si** — R1-R21 |
| `design.md` con alternativa descartada y su porque | **si** — tres (§ 9, § 10, § 11) |
| `tasks.md` con todas las tasks `[x]` | **no, y es lo correcto**: T10 y T11 `[HUMANO]` sin marcar, T14 del leader. Bloquea el paso a `done`, no la revision |
| Cada `R<n>` mapea a test concreto | **si para el mecanismo**; R10-R14 y R17 mapean a fila del registro humano por `[D5]`, declarado en `design.md > 8.1`. Ver la seccion de Trazabilidad |
| `progress/impl_<feature>.md` con el mapa | **si**, 21 filas sin huecos |
| `pnpm typecheck` | **verde** (corrido por mi, 0 errores) |
| `pnpm lint` | **verde** (corrido por mi, 0 errores / 0 warnings) |
| Tests | **verdes** (corridos por mi): `tests/unit/documentos` + `tests/unit/composition` + `tests/guards` -> 67 archivos, 823 pasados, 23 saltados |
| E2E de flujo critico | **no aplica** — `design.md > 6`: sin endpoint, sin ruta, sin Server Action, sin pantalla |
| Multiplataforma (UI) | **no aplica** — el diff no toca `app/`, `components/` ni `hooks/` |
| Dependencias | **no aplica** — `package.json`, `pnpm-lock.yaml`, `tsconfig.json` y `next.config` **intactos**: no aparecen en el diff |
| Aislamiento por empresa / RLS / migraciones | **no aplica** — el diff no toca `db/` ni `db/schema.prisma`; sin tabla, sin columna, sin consulta de operacion |
| Secretos hardcodeados | **ninguno** — las dos variables van vacias en `.env.example`; no hay valor por defecto en codigo |
| Webhooks | no aplica |
| Modulos hexagonales | **si** — puerto en `ports/`, adaptador en `adapters/driven/config/`, `domain/` importa solo el **tipo** del puerto, `lib/composition` es quien ata. `tests/guards/guard-arquitectura-modulos.test.ts` verde |
| `use server` reexportado del barril | no; el barril no gana ni pierde exportaciones |
| Configuracion por entorno, nada hardcodeado | **si** — es el punto entero de la ficha |
| `./init.sh` verde | **no corrido aqui** (es F2.4 del leader). Aviso: el corte por `faltan specs para features sdd en vuelo: QC-82` es **deuda ajena ya presente en origin/dev**, no de esta rama |
| `progress/review_<feature>.md` con veredicto OK | este archivo |

## Los siete puntos que el encargo pedia verificar

### 1. R9 — ni una letra de texto de prompt en el repositorio · **VERIFICADO**

No me fie del barrido del implementer: extraje los dos `.json` de `708fa42d^` y barri **todos** los
archivos versionados con ventanas deslizantes normalizadas (minusculas, sin tildes, sin puntuacion).

- ventana de **9 palabras**: 4 coincidencias, todas la misma cadena —la enumeracion de campos de
  formula que `[D2]` y R11 **obligan** a escribir— en `feature_list.json` (descripcion del board) y
  en `specs/QC-129-textos-definitivos-de-los-prompts/requirements.md`;
- ventana de **7**: las mismas 4 cadenas, en los mismos 2 archivos;
- ventana de **5**: 22 coincidencias, todas vocabulario del dominio, y la mayoria **preexistentes**
  en fichas ajenas (`specs/QC-24-modelo-recetas`, `QC-25`, `QC-26`, `QC-43`, `QC-64`);
- ventana de **4**: ruido puro, presente en decenas de archivos de `dev`.

No hay ningun fragmento reconocible de prompt. La busqueda de `PROMPT_BY_STRATEGY` y de
`domain/prompts` no devuelve nada en codigo de produccion; lo que queda en `qc109-alcance.test.ts`
son las apariciones **deliberadas** de `design.md > 8.3`: las rutas que el caso afirma que ya **no
existen**, y el nombre en la lista de lo que el barril no publica y en la fuente **inventada** del
detector de reexportaciones.

`lib/modules/documentos/domain/prompts/` **ya no existe** en disco. Arbol limpio, sin restos.

`.env.example`: `CATALOG_PROMPT=` y `FORMULA_PROMPT=` **vacias**, sin valor de ejemplo.

`docs/revision-de-prompts.md`: **no copia texto de prompt ni huella de el** — solo nombres de campo
del modelo de datos. R16 cumplido.

### 2. R2 y R10 de la ficha — la variable se lee DENTRO de la invocacion · **VERIFICADO**

`adapters/driven/config/strategy-prompt-env.ts`: el top-level solo declara `ENV_VAR_BY_STRATEGY`;
la lectura de `process.env` vive **dentro** de `readStrategyPromptFromEnv`.
`lib/composition/index.ts` **referencia** la funcion, no la invoca. `domain/process-pdf-by-strategy.ts`
llama a `deps.prompt.promptFor(strategy)` dentro del caso de uso, y el `return` del `catch` va
**antes** de contar paginas y **antes** de `deps.readPdfWithAi`. El caso «R2 — importar el adaptador
con el entorno vacio no lanza» muerde, y la suite entera corre sin `CATALOG_PROMPT` ni
`FORMULA_PROMPT` configuradas: lo comprobe al correrla.

### 3. R20 — ninguna guardia viva de QC-109 desactivada · **VERIFICADO**

Lei el diff de `tests/unit/documentos/qc109-alcance.test.ts` entero. Lo tocado es **exactamente** lo
derogado:

- los tres imports de prompts, fuera (obligado: si no, el archivo ni compila);
- `ARCHIVOS_NUEVOS`: fuera los 3 de prompts, dentro `ports/strategy-prompt.ts` y el adaptador;
  **`toHaveLength(6)`**, que es el numero correcto (7 − 3 + 2 = 6). El `8` del `design.md` era el
  error, no el test; ya corregido por el leader en F2.2 y declarado en la bitacora;
- `describe` de R4 reescrito como derogado, **conservando la mitad viva** (ni `fs`, ni `path`, ni
  `process.cwd`) y su caso de detector, y sumando la comprobacion de que las tres rutas **no
  existen** en disco. El helper de lectura lanza si el archivo falta, asi que el `toThrow()` muerde;
- `describe` de R6 **borrado entero**, con nota de derogacion en su lugar. Borrado, no `skip`;
- R13 ampliado con `StrategyPrompt`; R15 con la lista exacta actualizada: `PROMPT_BY_STRATEGY`
  fuera, `StrategyPrompt` y `readStrategyPromptFromEnv` dentro.

**R11, R14, R16 y R17 no se tocan.** Ninguna guardia queda desactivada ni saltada por esta ficha.

### 4. R21 — la nota de QC-109 anade y no reescribe · **VERIFICADO**

`git diff --numstat` sobre `specs/QC-109-procesamiento-de-pdf-por-estrategia/requirements.md` da
**28 adiciones y 0 supresiones**. La nota esta fechada 2026-09-18, dice que queda derogado (R4 en su
primera mitad, R6 entero, `[D6]` y `[D15]` de QC-109), por que y que lo sustituye. Coincide con lo
que reporta la bitacora.

### 5. T10 y T11 sin marcar y el registro vacio · **VERIFICADO**

`tasks.md`: las seis casillas de T10 y T11 estan en `[ ]`. `docs/revision-de-prompts.md` esta con la
**plantilla vacia**: ni una fecha (solo el marcador de formato), ni un veredicto elegido (todas las
celdas dicen bien / mal / no estaba), ni una firma (solo «nombre de la persona que reviso»).
**Ningun agente relleno nada.** Es lo correcto, y era el hallazgo bloqueante mas probable.

### 6. Las dos preguntas abiertas siguen abiertas · **VERIFICADO**

`requirements.md > Preguntas abiertas` intacto; `tasks.md > Dependencias humanas pendientes` las
repite; la bitacora tiene seccion propia diciendo que ninguna se cerro con un supuesto. Ni el codigo
ni los comentarios inventan quien pone las variables en preview ni como llega el texto a local. El
`design.md > 10` deja escrita la consecuencia aceptada —un preview sin variables no procesa ningun
PDF— sin resolverla por su cuenta. Regla 6 de `CLAUDE.md` respetada.

### 7. `docs/conventions.md > Comentarios` · **VERIFICADO en produccion**

En las lineas que el diff **anade o modifica en archivos de produccion** —`app/`, `lib/`,
`components/`, `hooks/`, `middleware.ts`, `db/`; `.env.example` no esta en esa lista cerrada— **no
hay ni una cita de ficha, requisito, design.md ni «decision cerrada»**:

- `ports/strategy-prompt.ts`: dos bloques cortos, ambos con un porque que el codigo no muestra —por
  que sincrono, por que lanza—. Sin citas.
- `adapters/driven/config/strategy-prompt-env.ts`: cabecera y dos bloques, todos porques. Sin citas.
- `domain/process-pdf-by-strategy.ts`: el bloque nuevo no lleva comentario.
- `lib/composition/index.ts`: bloque de 2 lineas con el porque que importa (se referencia, no se
  invoca). Sin citas.
- `lib/modules/documentos/index.ts`: el comentario tocado **pierde** la parte obsoleta y no gana
  citas.

Nada bloqueante. Lo que si hay son citas en **tests**: menor-4.

## Trazabilidad `R<n>` -> evidencia

**Completa.** Los 21 requisitos tienen evidencia, y la particion en dos familias es la decision del
humano aprobada en F1.4, no un hueco (`[D5]`, `design.md > 8.1`; mismo trato que la pasada en iPhone
de QC-114).

**Mecanismo — caso de Vitest que muerde, verificado uno a uno:**

| R | Caso | Muerde |
|---|---|---|
| R1 | `strategy-prompt-env.test.ts` «R1 — catalogo lee CATALOG_PROMPT y formula lee FORMULA_PROMPT», mas `process-pdf-by-strategy.test.ts` «R1 — con el prompt inyectado, la lectura recibe ese texto» | si |
| R2 | `strategy-prompt-env.test.ts` «R2 — importar el adaptador con el entorno vacio no lanza», mas inspeccion del adaptador y de `lib/composition` | si |
| R3 | tres casos: ausente, vacia y solo-espacios fallan igual; y el caso de que el valor se devuelve sin recortar, con espacios y saltos al borde | si |
| R4 | `process-pdf-by-strategy.test.ts` «R4 — si el prompt de la estrategia falta, el procesamiento falla sin llamar a la lectura con IA»: espia **no llamado**, `code` `unexpected`, `reason` con el nombre de la variable | si |
| R5 | «R5 — con CATALOG_PROMPT puesta y FORMULA_PROMPT vacia, formula falla y no hereda» | si |
| R6 | «R6 — el fallo por prompt ausente registra una sola linea…»: una llamada, `mode` de la estrategia y `pages` nulas; y el caso de R4 compara el resumen **entero** con `toEqual` | si |
| R7 | «R7 — ni el reason ni el resumen registrado contienen el texto del prompt inyectado», recorriendo el resumen en profundidad | si |
| R8 | `qc109-alcance.test.ts`, R4 derogado: las tres rutas lanzan al leerse porque no existen | si |
| R9 | mismo caso, mas mi barrido de ventanas deslizantes | si |
| R15 | `revision-de-prompts-doc.test.ts`: 6 filas de catalogo y 5 de formula buscadas **en el documento** por regex de celda, y los tres veredictos literales | si (ver menor-2) |
| R16 | mismo archivo: la frase de la consecuencia aceptada y la ausencia de columna de texto de prompt | si |
| R18 | corri la suite del ambito sin `GEMINI_API_KEY` ni las dos variables nuevas: verde. Ningun caso nuevo hace red | si |
| R19 | `qc109-alcance.test.ts` R13 (`StrategyPrompt` entre lo no publicado) y R15 (lista exacta de simbolos del barril) | si |
| R20 | `qc109-alcance.test.ts` entero en verde, con R11, R13, R14, R15, R16 y R17 vivos | si |
| R21 | inspeccion del `numstat` de la nota: 28 adiciones, 0 supresiones | si |

**Calidad del texto — evidencia humana, PENDIENTE a proposito:** R10, R11, R12, R13 y R17 (fila
firmada de `docs/revision-de-prompts.md`, T11) y R14 (mitad declarada en `.env.example` por T6;
mitad humana en T10, y **solo produccion** mientras la pregunta abierta 1 siga abierta).
**No es un hueco de trazabilidad y no se rechaza como tal.**

## Hallazgos

### BLOQUEANTES: ninguno

### menor-1 — la evidencia de R2 en `documentos-facade.test.ts` esta algo sobredeclarada

`design.md > 8.2` y la bitacora citan `tests/unit/composition/documentos-facade.test.ts` como prueba
de que construir la fachada no lee ninguna variable. Ese test **no se toco** y solo borra
`GEMINI_API_KEY` y `GEMINI_MODEL`; no borra explicitamente `CATALOG_PROMPT` ni `FORMULA_PROMPT`.
Pasa —esas dos no estan puestas en el entorno de la suite—, pero no lo **afirma**. La evidencia
fuerte de R2 es `strategy-prompt-env.test.ts` mas la inspeccion del adaptador, y ambas estan.
Anadir los dos `delete` a ese test es trabajo de una linea para una ficha futura.

### menor-2 — un caso de `revision-de-prompts-doc.test.ts` es tautologico

«R15 — son once filas de campo en total» suma las longitudes de sus **propias constantes** y las
compara con 11: pasaria aunque el documento estuviera vacio. R15 queda cubierto igual por los dos
casos anteriores, que si buscan cada fila en el documento.

### menor-3 — `.env.example` llama SECRETO a lo que el `design.md` dice que no lo es

El bloque nuevo dice «SECRETO de despliegue, no de codigo», mientras que `design.md > 6` escribe
«aunque **no son un secreto**, no tienen por que viajar al navegador». Es un motivo no verificado
contra su propio diseno. No cambia el comportamiento.

### menor-4 — comentarios que citan fichas en el test de alcance de QC-109

Los bloques de derogacion anadidos en `tests/unit/documentos/qc109-alcance.test.ts` citan QC-129,
`[D7]`, `[D11]` y `design.md > 4.1`. **No es bloqueante**: la regla bloqueante es sobre archivos de
**produccion**, y aqui la cita la **exige** el propio spec (`design.md > 8.3`: el cambio se deja
escrito en el propio test, no silenciado; T7: el texto de las derogaciones cita QC-129 y su
decision). Se anota para que no se lea como permiso general: `docs/conventions.md > Comentarios`
dice que en tests la regla del comentario es la misma y que `R<n>` va en el **nombre del caso**.

### menor-5 — el recuento de saltados de la bitacora no es comparable, aunque el motivo si se confirma

La bitacora declara 3 saltados, preexistentes, de casos de QC-109 que solo corren en su rama. Lo
verifique: en `tests/unit/documentos` los saltos son **18** —seleccion distinta de la suya, que fue
`vitest related`—, y **todos** traen el mismo motivo preexistente: el helper de precondicion de rama
de QC-106, QC-108 y QC-109, que salta cuando la rama actual no es la de esa ficha. **Ninguno lo
introduce esta ficha y ninguno es un salto puesto para tapar un rojo.** Efecto lateral a tener
presente: en esta rama, QC-109 R16 y R17 se saltan solos, asi que R20 se sostiene por **inspeccion
del archivo** —siguen escritos e intactos— y no por ejecucion aqui.

## Verificacion ejecutada por mi

- `pnpm typecheck`: 0 errores.
- `pnpm lint`: 0 errores, 0 warnings.
- `pnpm exec vitest run tests/unit/documentos tests/unit/composition tests/guards`:
  67 archivos pasados, 823 tests pasados, 23 saltados.
- Barrido de fuga de R9 con ventanas de 4, 5, 7 y 9 palabras sobre `git ls-files`.
- `numstat` de la nota de QC-109; recuento de `in_progress` por zona (frontend 1, backend 1);
  inspeccion de `tasks.md` y de `docs/revision-de-prompts.md`.

`./init.sh` completo **no lo corri**: es F2.4 del leader. Recordatorio: el corte por
`faltan specs para features sdd en vuelo: QC-82` es deuda ya presente en `origin/dev`, no de esta
rama, y `--rapido` no consulta `tests/baseline-rojos.json`.

## Que falta para cerrar la ficha (no es trabajo del implementer)

1. **T10 `[HUMANO]`** — redactar los dos textos y ponerlos en Vercel, en produccion.
2. **T11 `[HUMANO]`** — la pasada firmada sobre PDFs reales, campo por campo.
3. **T14 (leader)** — `./init.sh` completo y el PR, declarando el rojo heredado sin maquillarlo.
