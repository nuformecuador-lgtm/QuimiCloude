# QC-109 — procesamiento-de-pdf-por-estrategia · tasks.md

> `[P]` = puede ir en paralelo con las tareas marcadas igual en su mismo nivel.
> Cada tarea cierra con su criterio de **Hecho**, comprobable sin interpretar.
> Todos los archivos viven en `lib/modules/documentos/`, salvo los tests y `lib/composition/`.

## T0 — Leer antes de escribir (bloquea todo)

- [ ] Leer `domain/read-pdf-with-ai.ts`, `domain/ai-read-input.ts`, `domain/limits.ts`,
      `ports/ai-reader.ts`, `index.ts` y el bloque `documentos` de `lib/composition/index.ts`.
- **Hecho:** puedes decir de memoria qué literal de `AiReadMode` manda imágenes y cuál manda el PDF
  entero, y coincide con la tabla de `design.md > 2`.

## T1 — El enum cerrado y su mapa a modo `[P]` · depende de T0

- [ ] `domain/pdf-strategy.ts`: `pdfStrategySchema` (unión de literales zod), tipo `PdfStrategy` y
      `Record<PdfStrategy, AiReadMode>` con `catalogo -> 'images'` y `formula -> 'pdf'`.
- **Hecho:** `pnpm typecheck` verde; quitar una entrada del `Record` rompe la compilación (probado a
  mano y revertido). Cubre R1, R2, R3, R14.

## T2 — Los dos archivos de prompt `[P]` · depende de T0

- [ ] `domain/prompts/catalogo-prompt.ts` y `domain/prompts/formula-prompt.ts`: una constante de
      texto **no vacía** cada uno, con la cabecera que declara el texto provisional y remite a
      QC-129.
- [ ] `domain/prompts/index.ts`: el mapa `Record<PdfStrategy, string>`, única fuente del prompt de
      cada estrategia.
- **Hecho:** los dos textos pasan `aiReadInputSchema.shape.prompt.safeParse(...)` con `success:
  true`; ninguno de los tres archivos importa `fs`, `path` ni usa `process.cwd`. Cubre R4, R5, R6.

## T3 — El puerto del registro · depende de T0 y de la **pregunta abierta**

- [ ] `ports/strategy-run-log.ts`: la interfaz del registro de una ejecución.
- **BLOQUEADA** hasta que el humano responda qué se registra y con qué recorte
      (`requirements.md > Preguntas abiertas`). No se inventa la firma.
- **Hecho:** la interfaz refleja literalmente la respuesta del humano, y su cabecera explica por qué
  es un puerto y no un `console.log` suelto. Cubre R8 (mitad de forma).

## T4 — El caso de uso · depende de T1, T2, T3

- [ ] `domain/process-pdf-by-strategy.ts`: `createProcessPdfByStrategy` con el contrato de
      `design.md > 3.3`. Valida la estrategia, resuelve modo y prompt, llama al `readPdfWithAi`
      inyectado, registra una vez y devuelve el resultado con `strategy`.
- **Hecho:** `pnpm typecheck` verde; el archivo **no** importa `limits.ts`, ni un adaptador, ni
  `AiReader`, ni menciona al proveedor; la firma pública no admite actor. Cubre R7, R9, R10, R11,
  R13.

## T5 — El adaptador del registro `[P]` · depende de T3

- [ ] `adapters/driven/observability/strategy-run-log-console.ts`: implementación única, con la
      función de escritura por parámetro y `console.log` por defecto.
- **Hecho:** un test puede sustituir la escritura sin parchear la consola global. Cubre R8 (mitad de
  implementación).

## T6 — Tests unitarios · depende de T4 y T5

- [ ] `tests/unit/documentos/process-pdf-by-strategy.test.ts`, con dobles: un `readPdfWithAi` falso
      y un `log` espía. Un caso por requisito de comportamiento, con `R<n>` en el nombre del caso.
- [ ] Casos de forma (R4, R6, R10, R12, R13, R15, R16): leen los archivos del disco desde el test y
      comprueban imports, literales y símbolos exportados.
- **Hecho:** `pnpm test` verde y **los 16 requisitos** tienen al menos un caso que los nombra. Cubre
  R1–R16.

## T7 — Publicar en el barrel · depende de T4

- [ ] `lib/modules/documentos/index.ts`: exportar `pdfStrategySchema`, `PdfStrategy`,
      `createProcessPdfByStrategy` y sus tipos. **No** exportar el puerto ni los prompts. Sin
      reordenar lo que ya hay.
- **Hecho:** el barrel sigue importable desde un componente de cliente (la guardia de arquitectura
  pasa) y el diff solo añade líneas al final. Cubre R12.

## T8 — Cablear en composición · depende de T5 y T7

- [ ] `lib/composition/index.ts`: atar `StrategyRunLog` -> adaptador de consola y añadir
      `processPdfByStrategy: createProcessPdfByStrategy({ readPdfWithAi, log })` a la fachada
      `documentos`, reutilizando el `readPdfWithAi` que ya está cableado ahí.
- **Hecho:** `tests/guards/guard-arquitectura-modulos.test.ts` verde; construir la fachada no lee
  ninguna variable de entorno ni toca la red; nada de `app/` ni ningún driving la invoca. Cubre R12.

## T9 — Comprobar que no entró ninguna dependencia `[P]` · depende de T4

- [ ] Revisar que `package.json` no cambió y que los imports de los archivos nuevos son solo `zod` y
      código del módulo.
- **Hecho:** `git diff --stat` no incluye `package.json` ni `pnpm-lock.yaml`, y
      `tests/guards/guard-dependencias-aprobadas.test.ts` verde. Cubre R15.

## T10 — Trazabilidad · depende de T6

- [ ] Escribir el mapa `R<n> -> test` en `progress/impl_QC-109.md`, los 16 sin huecos.
- **Hecho:** cada fila apunta a un nombre de caso que existe en la suite.

## T11 — Gate completo · depende de todo lo anterior

- [ ] `./init.sh` completo antes del PR, sin excepción.
- **Hecho:** termina en verde, incluidas todas las guardias.

---

### Orden corto

`T0 → (T1 ‖ T2) → T3* → T4 → (T5 ‖ T9) → T6 → T7 → T8 → T10 → T11`

`T3*` es la única con dependencia **humana**: sin la respuesta a la pregunta abierta, la cadena se
detiene ahí. Es deliberado.
