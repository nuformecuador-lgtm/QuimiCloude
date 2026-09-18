# QC-129 — textos-definitivos-de-los-prompts · tasks.md

> `[P]` = puede ir en paralelo con las tareas marcadas igual en su mismo nivel.
> `[HUMANO]` = **ningún agente puede ejecutarla ni darla por hecha.** La marca no es un adorno: una
> tarea `[HUMANO]` marcada por un agente es un incumplimiento, no un atajo.
> Cada tarea lista **los archivos que espera tocar** y cierra con su criterio de **Hecho**.
> Las rutas sin prefijo cuelgan de `lib/modules/documentos/`.

## T0 — Leer antes de escribir (bloquea todo)

- [x] Leer `adapters/driven/config/ai-config-env.ts` entero (es el precedente exacto),
      `domain/process-pdf-by-strategy.ts`, `domain/pdf-strategy.ts`, `ports/strategy-run-log.ts`,
      el bloque `documentos` de `lib/composition/index.ts` (≈1110–1210) y
      `tests/unit/documentos/qc109-alcance.test.ts`.
- **Archivos:** ninguno (solo lectura).
- **Hecho:** puedes decir sin mirar por qué `ai-config-env.ts` lee dentro de la función y no al
  importar, y coincide con `design.md > 2`.

## T1 — El puerto del prompt `[P]` · depende de T0

- [x] `ports/strategy-prompt.ts`: tipo `StrategyPrompt` con `promptFor(strategy): string`, tal como
      lo fija `design.md > 4.1`, con la cabecera que explica por qué **lanza** en vez de devolver
      `null`.
- **Archivos:** `ports/strategy-prompt.ts` (nuevo).
- **Hecho:** `pnpm typecheck` verde; el puerto no importa nada fuera del módulo salvo el tipo
  `PdfStrategy` del propio dominio. Cubre **R1, R19**.

## T2 — El adaptador de entorno `[P]` · depende de T0

- [x] `adapters/driven/config/strategy-prompt-env.ts`: `readStrategyPromptFromEnv(strategy)`, con el
      `Record<PdfStrategy, string>` de nombres (`CATALOG_PROMPT`, `FORMULA_PROMPT`) como **única**
      aparición de esos dos nombres, lectura dentro de la función, vacío/solo-espacios = ausente,
      valor devuelto **sin recortar** y error que nombra la variable sin filtrar ningún valor.
- **Archivos:** `adapters/driven/config/strategy-prompt-env.ts` (nuevo).
- **Hecho:** `pnpm typecheck` y `pnpm lint` verdes; importar el archivo con el entorno vacío **no**
  lanza. Cubre **R1, R2, R3, R5**.

## T3 — El caso de uso lee el prompt en la invocación · depende de T1

- [x] `domain/process-pdf-by-strategy.ts`: `prompt: StrategyPrompt` en `ProcessPdfByStrategyDeps`,
      fuera el import de `./prompts`, y el bloque `try/catch` de `design.md > 4.3` **antes** de
      contar páginas y **antes** de llamar a `readPdfWithAi`.
- **Archivos:** `domain/process-pdf-by-strategy.ts`.
- **Hecho:** `pnpm typecheck` verde; el archivo ya no nombra `PROMPT_BY_STRATEGY`; el fallo devuelve
  `code: 'unexpected'` con el `reason` que trae el nombre de la variable y registra **una** línea.
  Cubre **R2, R4, R6, R7**.

## T4 — Borrar los prompts del repositorio · depende de T3

- [x] `git rm` de `domain/prompts/catalogo.json`, `domain/prompts/formula.json` y
      `domain/prompts/index.ts` (la carpeta queda vacía y desaparece).
- [x] Actualizar el comentario del último bloque de `index.ts` (el barril): el prompt ya no es «un
      detalle interno de la estrategia» que vive dentro, llega **por dependencia desde el entorno**.
      **No se añade ni se quita ninguna exportación.**
- **Archivos:** los tres borrados + `index.ts`.
- **Hecho:** `rg "PROMPT_BY_STRATEGY|domain/prompts"` no devuelve nada en código ni en tests (solo
  en `specs/` y en la nota de T8); `pnpm typecheck` verde. Cubre **R8, R9, R19**.

## T5 — Cablear en composición · depende de T2 y T4

- [x] `lib/composition/index.ts`: importar el adaptador por su ruta exacta, `const strategyPrompt:
      StrategyPrompt = { promptFor: readStrategyPromptFromEnv }` junto a `strategyRunLog`, y pasar
      `prompt: strategyPrompt` a `createProcessPdfByStrategy`. Sin reordenar nada de lo que ya hay.
- **Archivos:** `lib/composition/index.ts`.
- **Hecho:** `tests/guards/guard-arquitectura-modulos.test.ts` y
      `tests/unit/composition/documentos-facade.test.ts` verdes; construir la fachada **no lee
      ninguna variable**. Cubre **R1, R2**.

## T6 — `.env.example` `[P]` · depende de T2

- [x] Bloque nuevo al final de `.env.example` con `CATALOG_PROMPT=` y `FORMULA_PROMPT=`, en la misma
      voz que los cuatro bloques anteriores: se leen en la invocación, si falta el procesamiento
      falla nombrándola, **sin valor de ejemplo**.
- **Archivos:** `.env.example`.
- **Hecho:** las dos variables aparecen vacías y ninguna línea del archivo contiene texto de prompt.
  Cubre **R9, R14** (la mitad que el arnés puede hacer: declararlas).

## T7 — Actualizar la guardia de QC-109 · depende de T4

> Trabajo **declarado** de esta ficha por `[D12]`, no efecto colateral. Precedente: **T3 de QC-81**.

- [x] `tests/unit/documentos/qc109-alcance.test.ts`, punto por punto según `design.md > 8.3`:
      quitar los tres imports de prompts; rehacer `ARCHIVOS_NUEVOS` (fuera los tres `.json`/`index`,
      dentro `ports/strategy-prompt.ts` y el adaptador; `toHaveLength(7)` → `6`, corregido el 2026-09-18: 7 − 3 + 2 = 6); reescribir el
      `describe` de **R4** como «derogado por QC-129 `[D7]`», conservando la mitad viva (ni `fs`, ni
      `path`, ni `process.cwd`) y su caso de detector; **borrar** el `describe` de **R6** dejando en
      su lugar la nota de la derogación; actualizar la lista exacta de símbolos de **R15**; sumar
      `StrategyPrompt` a lo que **no** publica el barril en **R13**.
- [x] **No tocar** los casos de R11, R14, R16 ni R17: siguen mordiendo sobre la lista nueva.
- **Archivos:** `tests/unit/documentos/qc109-alcance.test.ts`.
- **Hecho:** el archivo entero en verde; sigue habiendo un caso de detector por cada detector; el
  texto de las derogaciones cita QC-129 y su decisión. Cubre **R8, R9, R19, R20**.

## T8 — La nota fechada en el spec de QC-109 · depende de T4

- [x] Añadir al final de `specs/QC-109-procesamiento-de-pdf-por-estrategia/requirements.md` una
      **nota fechada 2026-09-18** que diga: **R4 queda derogado en su primera mitad** (el texto ya no
      entra por import) y **vivo en la segunda** (sigue sin leerse disco ni red); **R6 queda derogado
      entero** (no hay `.json` que marcar); **`[D6]` y `[D15]` quedan derogados por `[D7]` y `[D11]`
      de QC-129**; y **qué lo sustituye** (dos variables de entorno leídas en la invocación).
      **No se borra ni se reescribe una sola línea del original.**
- **Archivos:** `specs/QC-109-procesamiento-de-pdf-por-estrategia/requirements.md`.
- **Hecho:** la nota existe, está fechada, nombra QC-129 y no hay diff de supresión en ese archivo.
  Cubre **R21**.

## T9 — La plantilla del registro de revisión `[P]` · depende de T0

> **La plantilla la escribe el arnés; el contenido lo firma una persona (T11).**

- [x] `docs/revision-de-prompts.md` con la estructura exacta de `design.md > 4.8`: cabecera con el
      porqué y con la **consecuencia aceptada de `[D13]`**; ficha de pasada (fecha, estrategia, PDF
      de muestra, firma); tabla de **seis** filas para `catalogo`; tabla de **cinco** filas para
      `formula`; **dos** filas de cierre (JSON con la forma declarada; lo ausente vuelve `null`); la
      definición literal de **bien / mal / no estaba**; y la regla de cierre (un prompt es bueno
      cuando no hay ningún **mal**; toda fila con **mal** lleva nota).
- [x] **Ninguna columna, fila ni ejemplo puede contener texto de prompt** ni una huella de él.
- **Archivos:** `docs/revision-de-prompts.md` (nuevo).
- **Hecho:** las once filas de campo existen, los tres veredictos aparecen literales, y el documento
  dice con todas sus letras que un veredicto no se puede volver a comprobar contra su texto. Cubre
  **R15, R16**.

## T10 — [HUMANO] Escribir los dos textos en Vercel · depende de T5, T6 y T9

> **`[D5]` y `[D6]`: esto lo hace una persona.** Ningún agente tiene acceso a Vercel, ningún agente
> puede redactar el texto definitivo por su cuenta y **ningún agente puede marcar esta casilla**.

- [ ] Redactar el prompt de `catalogo` cumpliendo **R10** (los seis campos, y **ni moneda, ni
      vigencia, ni referencia del proveedor**), **R12** (JSON, con la forma declarada dentro del
      propio texto) y **R13** (lo ausente vuelve `null`, nunca se inventa).
- [ ] Redactar el prompt de `formula` cumpliendo **R11**, **R12** y **R13**.
- [ ] Ponerlos en Vercel como `CATALOG_PROMPT` y `FORMULA_PROMPT`, en **producción**. Los entornos
      **preview** y **local** quedan como estén: es la **pregunta abierta 1** y esta tarea **no la
      cierra**.
- **Archivos:** **ninguno del repositorio.** Si esta tarea produce un diff, algo se hizo mal:
  el texto **no entra al repo** (`[D11]`, `[D13]`, R9).
- **Hecho:** un procesamiento real de cada estrategia deja de fallar con «falta la variable de
  entorno …». Cubre **R14** (producción).

## T11 — [HUMANO] La pasada de revisión, firmada · depende de T10

> **`[D5]` y `[D6]`: esto lo hace una persona, con PDFs reales que aporta ella.** Un agente puede
> preparar la fila vacía, **no** el veredicto. **Ningún agente puede marcar esta casilla.**

- [ ] Pasar **un catálogo de proveedor real** y **una fórmula real** por su estrategia, una vez cada
      uno.
- [ ] Rellenar en `docs/revision-de-prompts.md` una sección por pasada, con veredicto **campo por
      campo** y nota en toda fila con **mal**, y **firmar**.
- [ ] Si alguna tabla queda con un **mal**: corregir el texto en Vercel (T10) y **repetir la pasada
      en una sección nueva**. No se edita una pasada firmada.
- **Archivos:** `docs/revision-de-prompts.md` (solo contenido; la plantilla no se cambia).
- **Hecho:** dos secciones firmadas, una por estrategia, sin ningún **mal**. Cubre **R10, R11, R12,
  R13, R17**.

## T12 — Tests del mecanismo · depende de T3, T4, T5

- [x] `tests/unit/documentos/strategy-prompt-env.test.ts`: cada estrategia lee **su** variable;
      ausente / `''` / `'   '` fallan igual y el mensaje nombra la variable; el valor se devuelve
      **sin recortar**; con una puesta y la otra vacía, la que falta **no hereda**; importar el
      adaptador con el entorno vacío no lanza. Restaura `process.env` en `afterEach`, como
      `ai-config.test.ts`.
- [x] Casos nuevos en `tests/unit/documentos/process-pdf-by-strategy.test.ts`, con un `promptFor`
      falso: éxito con texto inyectado; **fallo por prompt ausente** con `readPdfWithAi` espía a
      **cero llamadas**, `code: 'unexpected'`, `reason` con el nombre de la variable y **una** línea
      de registro con `mode` y `pages: null`; y un caso que afirma que **ni el `reason` ni el
      resumen contienen el texto inyectado**.
- [x] Un caso de documento (donde viva la guardia de la ficha) que afirme la forma de
      `docs/revision-de-prompts.md`: las once filas de campo, los tres veredictos literales, la
      frase de la consecuencia aceptada y **ninguna** columna de texto de prompt.
- [x] Ningún caso nuevo hace red, ni exige `GEMINI_API_KEY`, ni exige las dos variables nuevas.
- **Archivos:** `tests/unit/documentos/strategy-prompt-env.test.ts` (nuevo),
  `tests/unit/documentos/process-pdf-by-strategy.test.ts`.
- **Hecho:** los nombres de los casos citan su `R<n>`; quitar el `return` temprano de T3 pone rojo el
  caso de R4 (probado a mano y revertido). Cubre **R1–R9, R15, R16, R18, R19**.

## T13 — Trazabilidad · depende de T12

- [x] Escribir el mapa `R<n> → evidencia` en `progress/impl_QC-129-textos-definitivos-de-los-prompts.md`, los **21** sin huecos,
      copiando `design.md > 8.2`. Las filas de **R10–R14 y R17** apuntan a la fila del registro
      humano y **se marcan como tales**, con el motivo (`[D5]`: ningún test llama a Gemini) escrito
      al lado. **R14 y R17 quedan pendientes hasta que T10 y T11 estén firmadas.**
- **Archivos:** `progress/impl_QC-129-textos-definitivos-de-los-prompts.md` (nuevo).
- **Hecho:** cada fila apunta a un caso que existe en la suite o a una fila que existe en
  `docs/revision-de-prompts.md`.

## T14 — Gate completo · depende de todo lo anterior

- [ ] `./init.sh --rapido` al cerrar cada tanda; `./init.sh` completo antes del PR, sin excepción
      (regla 5 de `CLAUDE.md`).
- **Archivos:** ninguno.
- **Hecho:** termina en verde, guardias incluidas. **Si sigue cortando en
  `faltan specs para features sdd en vuelo: QC-82`** —deuda ajena, no de esta rama— se **declara**
  en esta tarea qué se corrió a mano (`pnpm typecheck`, `pnpm lint`, `pnpm exec vitest related`) y
  el PR lo dice en su descripción, como hizo la T11 de QC-109. **No se maquilla.**

---

### Orden corto

`T0 → (T1 ‖ T2 ‖ T9) → T3 → T4 → (T5 ‖ T6 ‖ T7) → T12 → [HUMANO T10] → [HUMANO T11] → T13 → T14`
con `T8` en paralelo desde T4.

### Dependencias humanas pendientes

- **T10 y T11 bloquean el cierre de la ficha**, no el trabajo del arnés: todo lo demás (T1–T9, T12)
  se puede terminar y dejar verde sin ellas, porque ningún test depende de que las variables existan
  (R18).
- **Las dos preguntas abiertas siguen abiertas** y esta ficha no las cierra: quién pone las
  variables en **preview** (afecta a R14) y cómo llegan los textos al **desarrollo local** (afecta a
  la comodidad, no al gate). Si alguien las responde, se escriben en `requirements.md` como decisión
  nueva y fechada, no se dan por supuestas aquí.

### Mapa `R<n>` → tarea

| Requisito | Tareas |
|---|---|
| R1 | T1, T2, T5, T12 |
| R2 | T2, T3, T5, T12 |
| R3 | T2, T12 |
| R4 | T3, T12 |
| R5 | T2, T12 |
| R6 | T3, T12 |
| R7 | T3, T12 |
| R8 | T4, T7, T12 |
| R9 | T4, T6, T7, T12 |
| R10 | **T11 (humana)** |
| R11 | **T11 (humana)** |
| R12 | **T11 (humana)** |
| R13 | **T11 (humana)** |
| R14 | T6 (declararlas), **T10 (humana)** — solo producción |
| R15 | T9, T12 |
| R16 | T9, T12 |
| R17 | **T11 (humana)** |
| R18 | T12, T14 |
| R19 | T1, T4, T7, T12 |
| R20 | T7 |
| R21 | T8 |
