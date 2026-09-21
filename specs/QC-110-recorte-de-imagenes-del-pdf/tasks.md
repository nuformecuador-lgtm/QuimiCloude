# QC-110 — recorte-de-imagenes-del-pdf · tasks.md

> Cada task tiene su criterio de «hecho». `[P]` marca lo que puede ir en paralelo con las de su mismo
> bloque. Nada se da por hecho sin gate: `./init.sh --rapido` al cerrar cada tanda, `./init.sh`
> completo antes del PR.

## T0 — Lo que se HEREDA montado y NO se vuelve a crear (bloquea todo)

- [ ] Leer y dar por existentes, sin reimplementarlos: `PdfConverter` (`countPages`, `renderPages`),
      `AiReader`, `DocumentStorage`, `domain/limits.ts`, `domain/document-path.ts`,
      `domain/failure-kind.ts`, `domain/run-document-job.ts` y el cableado de `lib/composition`.
- **Hecho cuando:** existe una nota en `progress/impl_QC-110-recorte-de-imagenes-del-pdf.md` que
  lista esas piezas y declara que esta ficha **no toca** el contrato de `AiReader` ni el de
  `DocumentStorage` (R3, R13).

## Bloque 1 — Puertos y dominio (sin `sharp` todavía)

## T1 — Los dos puertos nuevos `[P]` · depende de T0

- [ ] `ports/image-cropper.ts` (`CropRegion` + `crop`) y `ports/crop-storage.ts` (`upload`, **una
      sola operación**).
- **Hecho cuando:** typecheck pasa, ninguno importa librería alguna, y un test afirma que
  `ports/document-storage.ts` conserva **exactamente** sus cuatro operaciones (R13).

## T2 — `domain/crop-region.ts`: esquema y ajuste al borde `[P]` · depende de T0

- [ ] Esquema zod de la región (0..1, ancho y alto > 0) y función de ajuste al borde.
- **Hecho cuando:** `tests/unit/documentos/crop-region.test.ts` cubre válidas, inválidas,
      desbordadas por cada lado y la que queda vacía tras ajustar (R4, R6, R7).

## T3 — `domain/crop-coordinates.ts`: sacar el JSON del texto `[P]` · depende de T2

- [ ] Quitar vallas, recortar de `{` a `}`, `JSON.parse`, validar con el esquema de T2.
- **Hecho cuando:** `crop-coordinates.test.ts` cubre texto con prosa alrededor, con valla de código,
      sin JSON, con JSON roto y con JSON que no encaja; todos los fallos dan **el mismo** código del
      catálogo cerrado y el motivo **no vuelca** el texto entero (R4, R5).

## T4 — `buildCropPath` en `domain/document-path.ts` `[P]` · depende de T0

- [ ] Añadir la construcción de `<empresa>/<id del archivo>/<página>-<n>.png` en el archivo que ya es
      el único dueño del formato de rutas.
- **Hecho cuando:** `crop-path.test.ts` afirma la forma exacta, que `<n>` empieza en 1 y numera
      dentro de su página, y que `isPathInCompany` es cierto para la empresa del archivo y falso para
      otra (R12).

## T5 — `domain/crop-prompt.ts` `[P]` · depende de T0

- [ ] Constante con el texto provisional pero **funcional**, cabecera declarando que es provisional y
      que afinarlo no es de esta ficha (sin citar ninguna ficha, `docs/conventions.md > Comentarios`).
- **Hecho cuando:** `crop-prompt.test.ts` afirma que el texto no está vacío ni en blanco y que la
      cabecera declara lo provisional (R18).

## Bloque 2 — La dependencia

## T6 — PARADA: propuesta de `sharp` · depende de la aprobación del spec (F1.4)

- [ ] Declarar `sharp` en `package.json` y escribir su fila en `docs/dependencias.md` con los cuatro
      checks **con los números del 2026-09-21** (`design.md > 8`), el archivo único que la consume y
      la alternativa descartada.
- **Hecho cuando:** `guard-dependencias-aprobadas.test.ts` pasa y la fila dice `aprobada` (R9).

## T7 — Adaptador `image-cropper-sharp.ts` · depende de T6, T1

- [ ] Único archivo del repo que importa `sharp`: `metadata()`, proporción → píxeles, recorte a los
      límites reales, mínimo de 1 píxel, errores envueltos diciendo qué falló.
- **Hecho cuando:** su test recorta un PNG minúsculo construido en el propio test (sin red),
      comprueba el redondeo, el recorte a los límites y el mensaje del fallo (R8).

## T8 — `serverExternalPackages` y su guardia · depende de T6

- [ ] `next.config.ts` pasa a `['@napi-rs/canvas', 'sharp']`; `canvas-no-empaquetado.test.ts` pasa a
      exigir **los dos**, con su control positivo, y su cabecera explica por qué son dos.
- **Hecho cuando:** el test falla si se quita cualquiera de los dos (probado a mano invirtiéndolo) y
      pasa con los dos (R10, R11).

## T9 — Bucket de recortes: configuración y adaptador `[P]` · depende de T1

- [ ] `crop-storage-config-env.ts` (`SUPABASE_CROPS_BUCKET` nueva; URL y credencial reutilizadas,
      leídas **en la invocación**) y `crop-storage-supabase.ts` con `@supabase/storage-js`.
- **Hecho cuando:** `crop-storage-config.test.ts` afirma que importar el adaptador sin invocarlo no
      falla y que la variable ausente da un error que la **nombra** sin filtrar ningún valor (R14).

## Bloque 3 — El caso de uso y el enganche

## T10 — `domain/crop-catalog-images.ts` · depende de T2, T3, T4, T5, T1

- [ ] Los siete pasos de `design.md > 4`. Exportar el corredor de plazo ya existente en
      `read-pdf-with-ai.ts` en vez de reimplementarlo; ningún número nuevo fuera de `limits.ts`.
- **Hecho cuando:** `crop-catalog-images.test.ts` cubre: DPI y tope de páginas (R2), partes `image` y
      prompt (R3), texto malformado (R5), región desbordada que sí se recorta (R7), cero regiones
      (R16), y un recorte que lanza entre tres con los otros dos subidos y `skipped: 1` (R17).

## T11 — Enganche en `run-document-job.ts` · depende de T10

- [ ] Dependencia nueva en `RunDocumentJobDeps`, invocación **solo** con `batch.strategy ===
      'catalogo'` y **antes** del `finish`; si el recorte falla, la fila no cierra en «listo» y el PDF
      **no se borra**. Limpiar los comentarios de las líneas que toca, incluida la frase «Sin recorte
      de imagenes…» de la cabecera.
- **Hecho cuando:** `run-document-job.test.ts` afirma que con `formula` el doble **no se invoca**,
      que con `catalogo` sí, que cero recortes deja «listo» y que un fallo del recorte deja error sin
      borrar el PDF (R1, R16, R17).

## T12 — Barrel y composición · depende de T7, T9, T10, T11

- [ ] `index.ts` reexporta el caso de uso desde `./domain`; `lib/composition/index.ts` cablea los dos
      puertos nuevos, construye el caso de uso y se lo pasa a `runDocumentJob`, **sin invocar nada**
      al construir la fachada.
- **Hecho cuando:** `module-contract.test.ts` sigue verde, `guard-arquitectura-modulos.test.ts` pasa
      y construir `lib/composition` sigue sin leer ninguna variable de entorno (R21).

## Bloque 4 — Guardias, documentación y cierre

## T13 — Enmienda del bloque R12 de `qc111-alcance.test.ts` · depende de T11

- [ ] Reescribir ese bloque: la ausencia del recorte deja de ser cierta porque el paso ya existe —lo
      dejó dicho la propia QC-111—. **Se conserva** lo que sigue vivo: `db/schema.prisma` sin columna
      de salida del recorte. Nada más del archivo se toca.
- **Hecho cuando:** `qc111-alcance.test.ts` pasa en verde con el recorte montado y su cabecera explica
      la enmienda.

## T14 — Guardia de alcance propia `qc110-alcance.test.ts` · depende de T12

- [ ] Afirmaciones de ausencia, cada una con su control positivo: `sharp` en un solo archivo (R8);
      única dependencia nueva del diff y fila `aprobada` (R9); `db/` sin tocar y sin migración nueva
      (R15, R20); ningún símbolo de sesión en los archivos nuevos (R19); ningún `.spec.ts` nuevo bajo
      `e2e/` (R23); ningún test nuevo llama a `fetch(` ni importa `sharp` fuera del test del adaptador
      (R22).
- **Hecho cuando:** cada detector se prueba además con una entrada infractora inventada, y los casos
      que preguntan a git se saltan ruidosamente fuera de la rama de la ficha.

## T15 — `.env.example` y documentación `[P]` · depende de T9

- [ ] Bloque nuevo para `SUPABASE_CROPS_BUCKET`, declarada **vacía** y documentada, diciendo que la
      URL y la credencial se reutilizan y que el bucket es nuevo y propio.
- **Hecho cuando:** ningún secreto entra al repositorio y la variable queda nombrada donde se lee
      (R14).

## T16 — Trazabilidad · depende de todas las anteriores

- [ ] `progress/impl_QC-110-recorte-de-imagenes-del-pdf.md` con el mapa `R1..R23 -> test`, y las tres
      preguntas abiertas repetidas **como siguen: abiertas**.
- **Hecho cuando:** los 23 requisitos tienen al menos un test concreto (`CHECKPOINTS.md >
  Trazabilidad`).

## T17 — Gate completo · depende de T16

- [ ] `./init.sh` en verde: typecheck, lint, suite entera y todas las guardias.
- **Hecho cuando:** termina en verde y queda anotado en `progress/`.

### Orden corto

T0 → (T1, T2, T4, T5) → T3 → **F1.4** → T6 → (T7, T8, T9) → T10 → T11 → T12 → (T13, T14, T15) → T16
→ T17.
