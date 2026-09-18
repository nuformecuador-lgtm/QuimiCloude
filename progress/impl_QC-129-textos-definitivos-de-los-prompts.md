# QC-129 — textos-definitivos-de-los-prompts · bitacora de implementacion

> Rama `feature/QC-129-textos-definitivos-de-los-prompts`, worktree
> `.worktrees/QC-129-textos-definitivos-de-los-prompts`. Zona `backend`. Fecha 2026-09-18.
> Rol: `implementer` (coordinacion); todo el codigo lo escribio `backend_dev`.
>
> **Esta bitacora no contiene el texto de ningun prompt, y no puede contenerlo** (R9, `[D11]`,
> `[D13]`). Los dos textos viven fuera del repositorio, en `CATALOG_PROMPT` y `FORMULA_PROMPT`.

## Estado: PARADA DECLARADA en la puerta humana

**T0-T9 y T12-T13 cerradas. T10, T11 y T14 NO, y no por descuido.**

- **T10 y T11 estan marcadas `[HUMANO]`** en `tasks.md`. Escribir los dos textos en Vercel y firmar
  la pasada de revision sobre PDFs reales lo hace una persona (`[D5]`, `[D6]`, R17). **Ningun agente
  de esta sesion las ha ejecutado ni marcado**, y sus casillas siguen en `[ ]`.
- **T14 (gate completo y PR) es del leader**, no del implementer (`AGENTS.md > Regla del gate`).

## Delegacion

`zone: backend` y **sin una sola pieza de UI**: `design.md > 6` declara «sin endpoint, sin ruta de
Next, sin Server Action y sin pantalla». **No hubo delegacion a `frontend_dev` porque no habia nada
que delegarle.** Cuatro encargos a `backend_dev`:

| Encargo | Tareas | Ambito |
|---|---|---|
| A | T1-T6 | puerto, adaptador, caso de uso, borrado, composicion, `.env.example` |
| B | T9 | `docs/revision-de-prompts.md` |
| C | T7-T8 | guardia de QC-109 y nota fechada en su spec |
| D | T12 | los tres archivos de test |

## Archivos creados

| Archivo | Tarea |
|---|---|
| `lib/modules/documentos/ports/strategy-prompt.ts` | T1 |
| `lib/modules/documentos/adapters/driven/config/strategy-prompt-env.ts` | T2 |
| `docs/revision-de-prompts.md` | T9 |
| `tests/unit/documentos/strategy-prompt-env.test.ts` | T12 |
| `tests/unit/documentos/revision-de-prompts-doc.test.ts` | T12 |

## Archivos modificados

| Archivo | Tarea |
|---|---|
| `lib/modules/documentos/domain/process-pdf-by-strategy.ts` | T3 |
| `lib/modules/documentos/index.ts` | T4 (solo el comentario del ultimo bloque; cero cambios de exportacion) |
| `lib/composition/index.ts` | T5 |
| `.env.example` | T6 (las dos variables, **vacias**, como `GEMINI_API_KEY`) |
| `tests/unit/documentos/qc109-alcance.test.ts` | T7 |
| `specs/QC-109-procesamiento-de-pdf-por-estrategia/requirements.md` | T8 (**28 adiciones, 0 supresiones**) |
| `tests/unit/documentos/process-pdf-by-strategy.test.ts` | T12 |

## Archivos borrados (T4)

`lib/modules/documentos/domain/prompts/catalogo.json`, `.../formula.json`, `.../index.ts`.
La carpeta desaparece. Su contenido **no se copio a ningun sitio** antes de borrarlo.

## Mapa `R<n>` -> evidencia

Sigue `design.md > 8.2`. Los **21** requisitos, sin huecos.

| R | Evidencia | Tipo |
|---|---|---|
| R1 | `strategy-prompt-env.test.ts`: R1 - catalogo lee CATALOG_PROMPT y formula lee FORMULA_PROMPT | test |
| R2 | `strategy-prompt-env.test.ts`: R2 - importar el adaptador con el entorno vacio no lanza; mas `tests/unit/composition/documentos-facade.test.ts` (construir la fachada no lee ninguna variable) | test |
| R3 | `strategy-prompt-env.test.ts`: ausente / vacia / solo-espacios fallan igual; R3 - el valor se devuelve sin recortar | test |
| R4 | `process-pdf-by-strategy.test.ts`: R4 - si el prompt de la estrategia falta, el procesamiento falla sin llamar a la lectura con IA (`readPdfWithAi` espia con **cero** llamadas, `code: unexpected`, `reason` con el nombre de la variable) | test |
| R5 | `strategy-prompt-env.test.ts`: R5 - con una puesta y la otra vacia, la que falta no hereda | test |
| R6 | `process-pdf-by-strategy.test.ts`: R6 - el fallo por prompt ausente registra una sola linea, con el modo y paginas nulas | test |
| R7 | `process-pdf-by-strategy.test.ts`: R7 - ni el reason ni el resumen registrado contienen el texto del prompt inyectado | test |
| R8 | `qc109-alcance.test.ts`, `describe` de R4 derogado: las tres rutas de `domain/prompts/` **no existen** en disco | test |
| R9 | mismo caso, mas el barrido propio del implementer sobre el arbol entero (ver Comprobacion de fuga) | test + inspeccion |
| R10 | **fila del registro humano**: tabla `catalogo` de `docs/revision-de-prompts.md`, seis campos. **PENDIENTE de T11.** `[D5]`: ningun test llama a Gemini | humano |
| R11 | **fila del registro humano**: tabla `formula`, cinco campos. **PENDIENTE de T11.** `[D5]` | humano |
| R12 | **fila del registro humano**: fila de cierre de JSON con la forma declarada. **PENDIENTE de T11.** `[D5]` | humano |
| R13 | **fila del registro humano**: fila de cierre de lo ausente vuelve null, y el veredicto "no estaba". **PENDIENTE de T11.** `[D5]` | humano |
| R14 | T6 declara las dos variables vacias en `.env.example`. La mitad que falta es **T10 (humana)** y **solo cubre produccion**: preview sigue siendo la **pregunta abierta 1**. **PENDIENTE** | mixto |
| R15 | `revision-de-prompts-doc.test.ts`: las seis filas de `catalogo`, las cinco de `formula`, once en total, y los tres veredictos literales | test |
| R16 | `revision-de-prompts-doc.test.ts`: la frase de la consecuencia aceptada (no se puede volver a comprobar) y que no hay columna de texto de prompt | test |
| R17 | **la pasada firmada, T11. PENDIENTE.** `[D5]`, `[D6]`: ningun agente puede darla por hecha | humano |
| R18 | ningun test nuevo hace red, ni exige `GEMINI_API_KEY`, ni exige `CATALOG_PROMPT`/`FORMULA_PROMPT`; el dominio recibe un `promptFor` falso por dependencia y el adaptador manipula `process.env` restaurandolo en `afterEach` | test |
| R19 | `qc109-alcance.test.ts`: caso de R13 (el barril no publica `PROMPT_BY_STRATEGY` **ni `StrategyPrompt`**) y caso de R15 (lista exacta de simbolos exportados) | test |
| R20 | `qc109-alcance.test.ts` entero en verde, con R11, R13, R14, R15, R16 y R17 **vivos** - ninguna guardia desactivada ni saltada | test |
| R21 | la nota fechada 2026-09-18 al final del `requirements.md` de QC-109 | inspeccion |

**Aviso al reviewer, de `design.md > 8.1`:** R10-R14 y R17 **no se mapean a un caso de Vitest y eso
no es un hueco de trazabilidad**. `[D5]` cerro que ningun test llama al proveedor; su evidencia es
una fila firmada de `docs/revision-de-prompts.md`, igual que la pasada en iPhone de QC-114. Hoy esas
filas **estan vacias a proposito**: las firma una persona en T11.

## Comprobacion de fuga (R9), hecha por el implementer

Se extrajeron de `HEAD` los dos `.json` borrados y se barrio **todo** el arbol -versionado y
archivos nuevos sin versionar- buscando ventanas deslizantes de sus textos:

- ventana de **12 palabras**: **cero coincidencias**.
- ventanas mas cortas: la unica coincidencia es la enumeracion de los seis campos del catalogo, que
  **R10 y `[D1]` obligan a escribir** en el spec y en la descripcion del board, y que ya aparecia
  antes de esta rama en `specs/QC-26-pantalla-de-recetas/requirements.md`, una ficha ajena. Es
  vocabulario del dominio, no huella de prompt.
- `rg "PROMPT_BY_STRATEGY|domain/prompts"` no devuelve nada en codigo de produccion. En
  `qc109-alcance.test.ts` quedan las apariciones **deliberadas** de `design.md > 8.3`: las rutas que
  el caso de R4 derogado afirma que **ya no existen**, y el nombre en la lista de lo que el barril
  **no publica** y en la fuente **inventada** del detector de reexportaciones.

## Verificacion ejecutada

Reparto de `AGENTS.md > Regla del gate`: **ni el implementer ni `backend_dev` corren la suite
completa.** Nadie corrio `pnpm test` ni `./init.sh`.

```
$ pnpm typecheck
> tsc --noEmit
(sin salida: 0 errores)

$ pnpm lint
> eslint
(sin salida: 0 errores, 0 warnings)

$ pnpm exec vitest related --run [los 5 archivos de produccion y los 4 de test de la ficha]

 Test Files  154 passed (154)
      Tests  2387 passed | 3 skipped (2390)
   Duration  556.20s
[exited with code 0]
```

Los 3 `skipped` son preexistentes: casos de QC-109 que solo corren estando en la rama
`feature/QC-109-...`. No los introduce esta ficha.

Las dos `[HUMANO]` no tienen verificacion ejecutable, y es el punto de la ficha.

### E2E

**No hace falta, y no lo corrio nadie.** `design.md > 6`: esta ficha no persiste ni expone nada
-sin endpoint, sin ruta de Next, sin Server Action y sin pantalla-, asi que no hay recorrido de
navegador que ejercitar.

### La prueba de que el test de R4 muerde

T12 exigia comprobar a mano que quitar el `return` temprano del `catch` de
`process-pdf-by-strategy.ts` pone **rojo** el caso de R4. Se hizo: el caso fallo con
`expected true to be false` (el resultado pasaba a `ok: true`). El archivo se revirtio y se
confirmo **byte a byte** que quedo igual que antes de la prueba.

## Discrepancia declarada entre el design y la realidad (para el reviewer)

`design.md > 8.3` dice que en `qc109-alcance.test.ts` el `toHaveLength(7)` de `ARCHIVOS_NUEVOS`
pasa a **8**. La aritmetica no cuadra: la lista tenia **7** entradas, **tres** de ellas los archivos
de prompts, y entran **dos** nuevas. 7 - 3 + 2 = **6**. El test usa **6**, el numero real de la
lista que queda. **No se inflo la lista para cuadrar con el design ni se toco el design para cuadrar
con el test**: se deja escrito aqui para que lo resuelva quien corresponda.

## Las dos preguntas abiertas siguen ABIERTAS

Regla 6 de `CLAUDE.md`. **Ninguna se cerro con un supuesto**, ni en codigo, ni en comentario, ni en
esta bitacora.

1. **Quien pone las dos variables en preview.** Sin decidir. Con `[D9]` -sin texto de repuesto- un
   preview sin variables **no puede procesar ningun PDF**. Afecta a **R14**, que por eso queda
   garantizado solo para produccion, y solo cuando T10 este hecha.
2. **Como llega el texto al desarrollo local y a la suite.** Sin decidir. Lo que esta ficha hace es
   lo que R18 ya fijaba: los tests **inyectan un texto de mentira por dependencia**. Eso mantiene el
   gate corriendo sin red y sin claves, pero **no responde** como trabaja una persona en local.

## Lo que falta para cerrar la ficha

1. **T10 `[HUMANO]`** - redactar los dos textos (R10-R13) y ponerlos en Vercel, en produccion.
2. **T11 `[HUMANO]`** - la pasada firmada sobre un catalogo real y una formula real, campo por
   campo, en `docs/revision-de-prompts.md`.
3. **T14 (leader)** - `./init.sh` completo y el PR. **Aviso heredado:** el gate esta rojo hoy por
   deuda ajena ya presente en `origin/dev` -`feature_list.json invalido: faltan specs para features
   sdd en vuelo: QC-82`-. **No es de esta rama y no se arreglo desde aqui.** Si sigue cortando, se
   declara lo que se corrio a mano, como hizo la T11 de QC-109. **No se maquilla.**
