# QC-109 — procesamiento-de-pdf-por-estrategia · tasks.md

> `[P]` = puede ir en paralelo con las tareas marcadas igual en su mismo nivel.
> Cada tarea cierra con su criterio de **Hecho**, comprobable sin interpretar.
> Todos los archivos viven en `lib/modules/documentos/`, salvo los tests y `lib/composition/`.

## T0 — Leer antes de escribir (bloquea todo)

- [x] Leer `domain/read-pdf-with-ai.ts`, `domain/ai-read-input.ts`, `domain/limits.ts`,
      `ports/ai-reader.ts`, `index.ts` y el bloque `documentos` de `lib/composition/index.ts`.
- **Hecho:** puedes decir de memoria qué literal de `AiReadMode` manda imágenes y cuál manda el PDF
  entero, y coincide con la tabla de `design.md > 2`.

## T1 — El enum cerrado y su mapa a modo `[P]` · depende de T0

- [x] `domain/pdf-strategy.ts`: `pdfStrategySchema` (unión de literales zod), tipo `PdfStrategy` y
      `Record<PdfStrategy, AiReadMode>` con `catalogo -> 'images'` y `formula -> 'pdf'`.
- **Hecho:** `pnpm typecheck` verde; quitar una entrada del `Record` rompe la compilación (probado a
  mano y revertido). Cubre R1, R2, R3, R15.

## T2 — Los dos `.json` de prompt `[P]` · depende de T0

- [x] `domain/prompts/catalogo.json` y `domain/prompts/formula.json`, cada uno con
      `{ "provisional": true, "loDefine": "QC-129", "prompt": "<texto no vacío que funcione>" }`.
- [x] `domain/prompts/index.ts`: importa los dos `.json` y expone el `Record<PdfStrategy, string>`,
      única fuente del prompt de cada estrategia.
- **Hecho:** `pnpm typecheck` verde con el import por defecto de los `.json` —`resolveJsonModule` ya
  está activo (`tsconfig.json:12`), no se toca el build ni se añade loader—; los dos textos pasan
  `aiReadInputSchema.shape.prompt.safeParse(...)` con `success: true`; `index.ts` no importa `fs`,
  `path` ni usa `process.cwd`. Cubre R4, R5, R6.

## T3 — El puerto del registro `[P]` · depende de T0

- [x] `ports/strategy-run-log.ts`: `StrategyRunSummary` (`strategy`, `mode: AiReadMode | null`,
      `path`, `pages: number | null`, `textLength`) y `StrategyRunLog.run(summary)`, tal como los
      fija `design.md > 3.4`.
- **Hecho:** la firma **no admite el texto** en ningún campo, así que registrarlo por descuido no
  compila; la cabecera explica por qué es un puerto y no un `console.log` suelto. Cubre R8, R9.

> **Enmienda fechada — 2026-09-18.** Esta tarea decía `mode` **no anulable** y fijaba los cinco
> campos «exactamente» así. Pasa a `AiReadMode | null`, igual que `pages`.
>
> **Por qué.** Con el modo no anulable, el rechazo por **estrategia inválida** no se podía registrar
> —el modo sale de la estrategia, y con una inválida no hay ninguno que poner sin inventarlo—, así
> que ese caso salía **mudo** de los registros. Y ese caso **puede ocurrir de verdad**: **QC-111 va a
> leer la estrategia de la BASE DE DATOS**, no de una constante del código, así que un valor podrido
> no es solo un error de programación que TypeScript frena en el borde. Es justo lo que se querría
> ver en el registro.
>
> **Qué arrastra.** El caso de uso de T4 registra también ese rechazo, con `mode: null`, `pages:
> null`, `textLength: 0` y la estrategia tal como llegó, **antes** de devolver el fallo. Con eso
> **R8 queda cumplido a la letra** y su redacción **no se toca**. Lo que NO cambia: la firma sigue
> sin admitir el texto de la IA (R9). Detalle y motivo largo en `design.md > 3.4`.

## T4 — El caso de uso · depende de T1, T2, T3

- [x] `domain/process-pdf-by-strategy.ts`: `createProcessPdfByStrategy` con el contrato de
      `design.md > 3.3`. Valida la estrategia, resuelve modo y prompt, cuenta páginas para el
      resumen, llama al `readPdfWithAi` inyectado, registra una vez y devuelve el resultado con
      `strategy`.
- **Hecho:** `pnpm typecheck` verde; el archivo **no** importa `limits.ts`, ni un adaptador, ni
  `AiReader`, ni menciona al proveedor; la firma pública no admite actor; un `countPages` que lanza
  deja `pages: null` sin cambiar el resultado. Cubre R7, R10, R11, R12, R14.

## T5 — El adaptador del registro `[P]` · depende de T3

- [x] `adapters/driven/observability/strategy-run-log-console.ts`: implementación única, con la
      función de escritura por parámetro y `console.log` por defecto.
- **Hecho:** un test puede sustituir la escritura sin parchear la consola global, y la línea que
  escribe no contiene el texto de la IA. Cubre R8, R9 (lado de implementación).

## T6 — Tests unitarios · depende de T4 y T5

- [x] `tests/unit/documentos/process-pdf-by-strategy.test.ts`, con dobles: un `readPdfWithAi` falso,
      un `countPages` falso y un `log` espía. Un caso por requisito de comportamiento, con `R<n>` en
      el nombre del caso.
- [x] Casos de forma (R4, R6, R11, R13, R14, R16, R17): leen los archivos del disco desde el test y
      comprueban imports, campos del `.json`, literales y símbolos exportados.
- **Hecho:** `pnpm test` verde y **los 17 requisitos** tienen al menos un caso que los nombra. Cubre
  R1–R17.

## T7 — Publicar en el barrel · depende de T4

- [x] `lib/modules/documentos/index.ts`: exportar `pdfStrategySchema`, `PdfStrategy`,
      `createProcessPdfByStrategy` y sus tipos. **No** exportar el puerto ni los prompts. Sin
      reordenar lo que ya hay.
- **Hecho:** el barrel sigue importable desde un componente de cliente (la guardia de arquitectura
  pasa) y el diff solo añade líneas al final. Cubre R13.

## T8 — Cablear en composición · depende de T5 y T7

- [x] `lib/composition/index.ts`: atar `StrategyRunLog` -> adaptador de consola y añadir
      `processPdfByStrategy: createProcessPdfByStrategy({ readPdfWithAi, countPages, log })` a la
      fachada `documentos`, reutilizando el `readPdfWithAi` y el `pdfConverter` que ya están
      cableados ahí.
- **Hecho:** `tests/guards/guard-arquitectura-modulos.test.ts` verde; construir la fachada no lee
  ninguna variable de entorno ni toca la red; nada de `app/` ni ningún driving la invoca. Cubre R13.

## T9 — Comprobar que no entró ninguna dependencia `[P]` · depende de T4

- [x] Revisar que `package.json` no cambió y que los imports de los archivos nuevos son solo `zod` y
      código del módulo.
- **Hecho:** `git diff --stat` no incluye `package.json`, `pnpm-lock.yaml`, `tsconfig.json` ni
      `next.config`, y `tests/guards/guard-dependencias-aprobadas.test.ts` verde. Cubre R16.

## T10 — Trazabilidad · depende de T6

- [x] Escribir el mapa `R<n> -> test` en `progress/impl_QC-109.md`, los 17 sin huecos.
- **Hecho:** cada fila apunta a un nombre de caso que existe en la suite.

## T11 — Gate completo · depende de todo lo anterior

- [x] `./init.sh` completo antes del PR, sin excepción.
- **Hecho:** termina en verde, incluidas todas las guardias.
- **CERRADA EL 2026-09-18 CON UNA SALVEDAD AUTORIZADA POR EL HUMANO, y se escribe en vez de
  maquillarse.** El gate **NO llegó a mirar esta rama**: `scripts/validate-features.mjs` corta en su
  bloque 0 con `faltan specs para features sdd en vuelo: QC-82`, que es **ANTES de typecheck**, así
  que ni typecheck, ni lint, ni la suite, ni las guardias se ejecutaron. **No es deuda de esta rama**:
  QC-82 figura en vuelo en el board sin spec en disco —trabajo de otra sesión sin empujar— y el diff
  de esta rama no toca esa entrada del `feature_list.json`. Verificado también por el `reviewer`.
- **Lo que SÍ se corrió a mano, que es lo que el gate no alcanzó** (2026-09-18, sobre la rama ya
  sincronizada con `dev` y con las migraciones de QC-92 aplicadas):
  - `pnpm typecheck` — limpio.
  - `pnpm lint` — limpio.
  - `pnpm exec prisma generate` — hizo falta: el cliente venía desactualizado tras las migraciones
    de QC-92 y tumbaba `presentation-unit.int.test.ts` con `Cannot read properties of undefined`.
    No era un rojo de la rama; el gate lo regenera solo, y correr a mano se lo salta.
  - `pnpm exec vitest related --run <diff de la rama>` — **152 archivos, 2373 tests, 0 fallos**.
- **La excepción es a la regla 5 de `CLAUDE.md`** («el gate completo antes de cada PR, sin
  excepción») y la autorizó el humano expresamente, con las tres salidas a la vista: esperar a
  QC-82, saltar el bloque de validación, o abrir el PR declarando el bloqueo. Eligió declararlo.
  **El PR lo dice en su descripción.** Cuando QC-82 se resuelva, el gate vuelve a correr entero sin
  que esta ficha tenga que hacer nada.

---

### Orden corto

`T0 → (T1 ‖ T2 ‖ T3) → T4 → (T5 ‖ T9) → T6 → T7 → T8 → T10 → T11`

**Sin dependencias humanas pendientes.** La pregunta abierta que bloqueaba T3 —y con ella T4— la
cerró el humano el 2026-09-18 (`[D16]`), y el formato de los prompts quedó fijado en `[D15]`. La
cadena corre entera.
