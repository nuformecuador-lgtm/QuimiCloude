# review — QC-158 catalogo-desde-pdf

Reviewer, 2026-09-24. Rama `feature/QC-158-catalogo-desde-pdf`, revisada en `982fee41` (dev ya
mergeada: `dev` es ancestro de HEAD). Spec: `specs/QC-158-catalogo-desde-pdf/` (R1–R38, D1–D9,
F1–F7). Bitácora: `progress/impl_QC-158-catalogo-desde-pdf.md`.

## Veredicto: **RECHAZADO**: 1 bloqueante, 12 menores

El bloqueante es de trazabilidad y se arregla con un test (ver B1). El resto de la feature está
bien construido. Autorización, aislamiento, migración, contrato JSON y las siete decisiones de F1.4
se cumplen y tienen test que falla si se rompen.

## Lo que corrí yo

| Comando | Resultado |
|---|---|
| `pnpm run typecheck` | limpio |
| `pnpm run lint` | 0 errores, 7 warnings (5 `_args` en `confirm-catalog-import.test.ts`, 2 ajenos) |
| vitest de `tests/unit/documentos/`, `tests/unit/documentos-ui/`, `tests/unit/proveedores/`, `tests/unit/proveedores-ui/`, `tests/guards/`, `data-table-alcance`, `session-once-per-request-actions`, `quote-order-cost` | **160 files passed, 1821 passed, 39 skipped** |
| vitest de integración: `catalog-import-isolation`, `catalog-import-upsert`, `material-measurements-migration`, `presentation-catalog-by-name`, `catalog-line` | **5 files, 34 passed** (base efímera `qct_qc158_*` de plantilla) |
| `qc158-alcance.test.ts --reporter=verbose` | 10/10 **ejecutados** en la rama (ninguno saltado) |
| Consulta de solo lectura a la base compartida `QuimiCloude` (`_prisma_migrations` e `information_schema.columns`) | **sin** la migración y **sin** las columnas `material`/`measurements`: la base compartida no se tocó. El `.env` del worktree apunta a `QuimiCloude_QC158`. |

No corrí `./init.sh` ni ningún E2E. El leader corre el gate completo en paralelo y un E2E mío
chocaría por el puerto 3117. La bitácora declara `catalogo-desde-pdf.spec.ts` y `documentos.spec.ts`
en verde en Chromium y WebKit. **El veredicto OK queda condicionado a que el gate del leader los
confirme.**

## Checklist

### 1. Trazabilidad (R1–R38 → test que muerde)
- [x] R1, R2: `document-upload-review-link.test.tsx`, `catalog-pdf-upload.test.tsx`, E2E pulsa «Revisar».
- [x] R3: `preview-catalog-import.test.ts` (cuatro casos, mismo `invalid_input`); `readFileForReview` filtra por `companyId` en archivo **y** tanda.
- [x] R4: `preview-catalog-import.test.ts`, `catalog-import-upsert.int.test.ts` (otra empresa, dado de baja), `catalog-import-page.test.tsx`.
- [x] R5, R6, R7, R35: `catalog-extraction.test.ts` (tolerancia, rechazo, pureza, costo numérico = vacío), `json-in-text.test.ts`.
- [x] R8–R12: `preview-catalog-import.test.ts` (dobles de escritura que lanzan), `classify-catalog-import.test.ts` (5 clases, 12.5 = 12.5000), `catalog-import-review.test.tsx`.
- [x] R13, R14, R17, R18, R20, R26: `confirm-catalog-import.test.ts`, `crop-path.test.ts` (`isCropPathOf`).
- [x] R15, R16, R21, R22: `catalog-import-upsert.int.test.ts` (solo cost/updated_by/updated_at; mismo costo no escribe; fallo en fila 3 de 5; concurrencia), `catalog-import-isolation.int.test.ts`.
- [x] R19: `suggest-unit.test.ts` (0/1/2 coincidencias) + preselección en `catalog-import-review.test.tsx`.
- [x] R23, R24: `catalog-import-review.test.tsx` + E2E. R25: `crop-pairing.test.ts` (huecos 1-1/1-3, conteo desigual ⇒ sin imagen).
- [x] R27: `catalog-line-input.test.ts`, `material-measurements-migration.int.test.ts` (CHECKs reales).
- [ ] **R28: la mitad «mostrar» no tiene test que la verifique. Es B1.**
- [x] R29: `catalog-line-form.test.tsx` (la imagen oculta viaja con el valor de la línea; material y medidas también), `supplier-actions.test.ts`.
- [x] R30: `schema/material-measurements-migration.test.ts` (down exacto, IF EXISTS, orden); migrate → rollback → migrate sobre `QuimiCloude_QC158` en la bitácora.
- [x] R31, R33: `catalog-import-authorization.test.ts` (4 actores denegados sin tocar ningún puerto; con permiso se lee el archivo **antes** que nada; R33 rechaza antes de crear ni escribir; sin presentación nueva no se exige).
- [x] R32: `catalog-import-page.test.tsx` (404 sin cualquiera de los dos permisos, antes de leer) + `guard-pantallas-exigen-permiso` (13 → 14).
- [x] R34: `catalog-import-isolation.int.test.ts` (archivo, proveedor, unidad y recorte de otra empresa u otro archivo), `presentation-catalog-by-name.int.test.ts`.
- [x] R36: `qc158-alcance.test.ts` (nada bajo `borradores-de-prompts/`, `CATALOG_PROMPT` solo en su adaptador, textos del doble = JSON puro, sin dependencias).
- [x] R37: `catalog-import-review.test.tsx` (clases de 44 px y 16 px, sin `hover:`) + E2E en WebKit.
- [~] R38: el E2E existe en Chromium y WebKit, sin red. Ver m1: la parte «en pantalla» se queda corta.

### 2. Tasks
- [x] T0–T17 marcadas `[x]` en `tasks.md`.

### 3. CHECKPOINTS.md
- [x] Especificación: los tres archivos existen; `design.md > 11` trae 4 alternativas descartadas.
- [~] Trazabilidad: el mapa R→test está en la bitácora. Falla para R28 (B1).
- [x] typecheck y lint sin errores. Unit e integración de la feature en verde (corridos por mí).
- [x] E2E presente para flujo crítico (importes, permisos). El resultado lo confirma el gate del leader.
- [x] Multiplataforma: `min-h-11 min-w-11` en controles, `text-base` en inputs y selects, sin `100vh` ni `hover:`. La UI usa primitivos ya aprobados (Select, Dialog, Checkbox).
- [x] Sin dependencias nuevas (`package.json`/`pnpm-lock.yaml` sin cambios; `qc158-alcance` R36d).
- [x] Sin tabla nueva: `guard-empresa-en-esquema` no cambia; `supplier_catalog_lines` ya tiene empresa, RLS y FORCE.
- [x] Permisos en el **service** con test: `proveedores.modificar` como primera línea en vista previa, confirmación, `findCatalogLinesByIdentity` e `importCatalogLines`. `inventario.modificar` antes de crear presentación.
- [x] Acceso a datos solo por Prisma. Supabase solo para Storage (recortes), en su adaptador, dentro de la lista cerrada de `storage-config.test.ts` (3 → 4).
- [x] Migración versionada con `down.sql` exacto. Rollback probado en base propia. La base compartida no se tocó (verificado arriba).
- [x] Sin secretos ni hardcode de entorno (config de bucket leída en cada llamada). Sin webhooks nuevos.
- [x] Hexagonal: `documentos` orquesta y consume proveedores, inventario, unidades e identity solo por barrel. `proveedores` sigue sin importar `inventario`. El cableado solo está en `lib/composition`. El `use server` no se reexporta.
- [x] Lógica en `domain/`; las Server Actions solo validan la forma, resuelven el actor y traducen errores.
- [ ] Verificación final (`./init.sh`, `history.md`, desmontar el worktree): la hace el leader después de esta revisión.

### 4–9. Resto del mandato
- [x] Aislamiento por empresa: cada consulta nueva filtra por la empresa del actor y hay test de acceso cruzado (R34).
- [x] Comentarios: el barrido de líneas añadidas en `lib app components db` no encuentra QC-, R<n>, design.md ni «decisión cerrada». Las citas R<n> que aparecen están en nombres y mensajes de tests, donde están permitidas. Hay menores de estilo (m2, m3).

## Las siete decisiones de F1.4

| Decisión | Cumple | Dónde |
|---|---|---|
| F1: el revisor elige la unidad y no se crean unidades | sí | `suggestUnitId` preselecciona solo con coincidencia única. La confirmación valida la unidad con `units.findRefs` (visible para la empresa) y rechaza sin ella. No hay ninguna ruta que cree unidades. |
| F2: diámetro y alto en mm o cm, boca como texto | sí | `measurementsSchema` (enum mm/cm, valor = patrón del costo, boca ≤ 40). Sin conversión. Las tres vacías ⇒ null. |
| F3: emparejar por página y orden, con corrección | sí | `pairCropsWithLines`: solo si el nº de filas de la página = nº de recortes, ordenados por n. El revisor quita o elige cualquier recorte del archivo. |
| F4: contrato de 8 datos + page, parser tolerante, costo numérico = vacío | sí | `catalog-extraction.ts`. La nota fechada en `specs/QC-129…/requirements.md` enmienda R10 sin reescribirlo. |
| F5: pantalla `/proveedores/[id]/importar/[documentoId]` | sí | `supplierCatalogImportRoute` en `lib/shared/routes.ts`, derivada de `supplierDetailRoute`. |
| F6: crear presentación exige también `inventario.modificar` | sí | `assertPermission` antes de cualquier `createPresentation`. Además `inventario.createPresentation` lo vuelve a exigir dentro. |
| F7: producto existente ⇒ SOLO cost | sí | `ON CONFLICT … DO UPDATE SET cost, updated_by, updated_at WHERE cost IS DISTINCT FROM`. Probado contra Postgres. |

## Los tres puntos que señaló el implementer

1. **`guard-convenciones-showcase.test.ts` (caso R29 de QC-140): legítimo, no relaja nada.** El
   caso mide «el diff de *esta rama* contra origin/dev no añade nada bajo `db/`». Esa es una
   restricción del alcance de QC-140, no una regla del repositorio. Una vez mergeada QC-140, el
   caso se pondría rojo en **cualquier** rama que traiga una migración legítima. Limitarlo a
   `feature/QC-140-*` con `ctx.skip` ruidoso sigue el patrón ya establecido de las guardias de
   alcance por rama (qc106…qc111, qc81, guard-qc102, guard-pantalla-pedidos-se-amplia). En la rama
   de QC-140 mide exactamente lo mismo que antes. El skip afecta también a D20, que tiene la misma
   naturaleza. Queda como m9 solo para que conste en el PR.
2. **La acción valida la entrada antes que la sesión: aceptable, pero desvía de `design.md > 6.2`
   sin nota.** R31 se refiere al *service*, y ahí el permiso va primero, con test. En el borde, un
   anónimo con entrada rota recibe `invalid_input` en vez de `unauthorized`. Eso no filtra nada: el
   esquema es público y no se lee ningún dato. Hay precedente (recipe-actions, order-actions). Es
   m4: falta dejarlo escrito en `design.md`.
3. **Motivos por fila de R18/R20 los nombra la pantalla y el servidor devuelve `invalid_input`
   genérico: aceptable.** R20 habla de «el sistema», que según el propio requirements incluye la
   pantalla. La UI prevalida y nombra las filas: incompleta o duplicada, identidad repetida tras
   corregir, presentación nueva sin unidad. Además deshabilita «Confirmar» (test en
   `catalog-import-review.test.tsx`). Si el servidor rechaza igualmente, por un cambio concurrente,
   la pantalla vuelve a pedir la vista previa, que marca las filas por clase. Los motivos que solo
   ve el servidor (imagen ajena, unidad no visible) solo se alcanzan manipulando la petición. No
   cambiar el contrato de errores fue lo correcto: el implementer no tenía aprobación para hacerlo.
   Es m5: conviene una nota en `design.md` que lo declare.

## Hallazgos

### BLOQUEANTE

**B1: R28 «la pantalla del catálogo DEBE mostrar el material y las medidas de cada línea» no
tiene ningún test que lo verifique.**
- `tests/unit/proveedores-ui/supplier-detail-page.test.tsx` («presenta las columnas de negocio…»)
  solo afirma que existen las columnas `material` y `measurements` y sus cabeceras. El fixture
  `linea()` lleva `material: null, measurements: null`, así que ninguna celda se pinta con dato.
- `formatMeasurements` (`app/(private)/proveedores/[id]/components/catalog-columns.tsx`) es lógica
  nueva con formato fijado en `design.md > 6.4` («Ø 7.5 cm · alto 12 cm · boca 28/410»). **Ningún
  test la ejercita**: grep de `Ø`, `data-table-cell-material` o `data-table-cell-measurements` en
  `tests/` y `e2e/` da vacío.
- Los tests de `catalog-line-form.test.tsx` cubren «escribir» y la precarga del panel de edición,
  no el listado del catálogo.
- El E2E comprueba material y medidas **solo en la base**, no en pantalla (ver m1).

**Qué falta:** un test que pinte el catálogo con una línea que tenga `material` y `measurements`
(con y sin cada medida) y afirme el texto de `data-table-cell-material` y
`data-table-cell-measurements`, incluido el «sin dato» cuando son null. Lo ideal es añadir además
esa misma afirmación en el paso 11 de `e2e/catalogo-desde-pdf.spec.ts` sobre `newRow`, lo que
cierra también m1.

### menores

- **m1 (R38).** El E2E afirma en pantalla solo el costo de las dos filas y que la línea nueva
  existe. El material, las medidas, la imagen y la presentación creada solo se comprueban en la
  base. El requisito pide «en la base y en la pantalla del catálogo».
- **m2 (comentarios, línea añadida con motivo falso).** `lib/composition/index.ts`, comentario de
  `cropCatalog`: «todavia no lo usa ningun caso de uso construido en este archivo». Es falso:
  `catalogImportDeps.crops = cropCatalog` unas líneas más abajo. Hay que quitarlo, y quitar
  también el `export` si nadie más lo importa.
- **m3 (comentarios, bloques largos que narran pasos).** Cabeceras de 13–24 líneas que describen
  «qué hace, en qué orden», justo lo que `docs/conventions.md > Comentarios` pide no comentar:
  `confirm-catalog-import.ts`, `preview-catalog-import.ts`, `catalog-import-input.ts`,
  `supplier-catalog-import-prisma.ts` (upsertCatalogLinesByIdentity), `import-catalog-lines.ts`
  (bloque y comentario en línea que se repiten), `catalog-import-actions.ts`.
- **m4.** La Server Action valida la forma antes de resolver la sesión, al revés que
  `design.md > 6.2`. Es aceptable (ver punto 2), pero falta una nota fechada en `design.md`.
- **m5.** El motivo por fila de R18/R20 vive solo en la pantalla y el servidor responde genérico.
  Es aceptable (ver punto 3), pero falta una nota fechada en `design.md` que lo declare.
- **m6.** En el E2E, la afirmación de que el material de la línea «cambia» es null (etiqueta
  «R15: el material no lo toca…») no puede fallar nunca: la línea sembrada y el texto de guion para
  esa fila traen los dos `material: null`. R15 queda cubierto de verdad por
  `catalog-import-upsert.int.test.ts`. Para que la afirmación del E2E sirva, hay que sembrar un
  material distinto o quitarla.
- **m7.** `catalog-import-page.test.tsx`, caso R4: el nombre dice «sin pedir la vista previa», pero
  la página la pide en paralelo (Promise.all) y el test no lo afirma. Hay que corregir el nombre o
  la aserción.
- **m8.** `new-presentation-units.tsx`: todas las opciones de un grupo comparten `data-testid`
  (`new-presentation-unit-option-<key>`) y el E2E usa `.first()`. Lo anotó el implementer.
- **m9.** Cambio en un test de otra ficha (`guard-convenciones-showcase.test.ts`). Es legítimo
  (punto 1), pero conviene nombrarlo en la descripción del PR.
- **m10 (a11y).** `catalog-import-row.tsx > RowField`: en modo solo lectura, el Label con htmlFor
  apunta a un id que no existe (se pinta un `<p>` sin él).
- **m11.** `catalog-import-review.tsx > reclassify`: las respuestas se aplican por índice sin
  secuenciar. Si se disparan dos reclasificaciones seguidas, una respuesta vieja puede pisar a una
  nueva. El servidor reclasifica al confirmar (R14), así que no afecta a lo que se escribe, solo a
  lo que se muestra.
- **m12 (R37).** Falta la pasada manual en un iPhone o Android real. `design.md > 15` solo exige
  WebKit y está hecho, así que es informativo.

## Qué necesita el implementer para pasar a OK
1. B1: el test de celdas de material y medidas del catálogo (y, preferiblemente, la afirmación en
   pantalla en el E2E, que cierra m1).
2. Recomendado en la misma vuelta: m2 (el comentario falso) y las notas de m4 y m5 en `design.md`.
3. El gate completo del leader en verde, E2E incluidos.

---

# Vuelta 2 (2026-09-24, HEAD `9eb7d7e3`)

## Veredicto: **OK**: 0 bloqueantes, 3 menores abiertos (no bloquean)

El OK queda condicionado, como en la vuelta 1, a que el gate completo del leader (`./init.sh`, E2E
incluidos) termine en verde. En esta vuelta no corrí ni la suite ni los E2E, para no chocar en el
puerto 3117.

**Lo que corrí:** `vitest run` de `catalog-columns`, `catalog-import-review`, `catalog-import-page`
y `supplier-detail-page`: **4 files, 72 passed**. Revisé el diff `3f0520e3..9eb7d7e3` entero (9
commits).

## Cierre de cada hallazgo, comprobado contra el código

| Hallazgo | Estado | Comprobación |
|---|---|---|
| **B1** (R28, mostrar) | **cerrado** | `tests/unit/proveedores-ui/catalog-columns.test.tsx` monta `DataTable` con `buildCatalogColumns` real y afirma el texto de `data-table-cell-material` y `data-table-cell-measurements`: formato completo, ceros de relleno (`7.5000` → `7.5`), sin redondeo (`7.5550` → `7.555`), cada medida sola y «sin dato». **Falla si se rompe:** sin `trimDecimal`, «Ø 7.5000 cm» no contiene «Ø 7.5 cm»; si redondeara, «7.56» no contiene «7.555»; si la celda no se pintara, falla `findByTestId`/`EMPTY_CELL`. |
| Decisión humana (2): medidas sin ceros | cumple | `catalog-columns.tsx` usa `trimDecimal` (`parseDecimal` + `formatDecimal`, no redondea; `lib/shared/ui/decimal-display.ts` sin tocar). Nota en `design.md > 16`. |
| **m1** (R38 en pantalla) | cerrado dentro de la decisión humana (1) | El E2E afirma en la pantalla del catálogo el material, las medidas (texto exacto), la presentación y el costo de la línea nueva, y el material y el costo de la «cambia». La imagen se comprueba solo en la base, según la decisión humana documentada en `design.md > 16` (pintarla con URL firmada es de QC-140). |
| **m2** (comentario falso) | cerrado | Comentario quitado; `cropCatalog` deja de exportarse y nadie más lo importaba (grep vacío). |
| **m3** (bloques largos) | cerrado | Commit `220a95f0` solo toca comentarios, más el `export` de m2: las cabeceras pasan a 3–5 líneas de porqué, sin pasos numerados. El barrido de citas en las líneas añadidas de `lib app components db` sigue vacío. |
| **m4**, **m5** | cerrados | Notas fechadas en `design.md > 16`. |
| **m6** (R15 en el E2E) | cerrado, **ahora puede fallar** | La línea viva se siembra con `material: 'vidrio'` y el guion trae `null` para esa fila. Si el `DO UPDATE` pisara `material`, la base quedaría en `null` y fallaría `toBe(existingMaterial)`. Además se comprueba en pantalla. |
| **m7** | cerrado | Nombre corregido y ahora se afirma `previewCatalogImportActionMock` llamado una vez (el `Promise.all`). |
| **m8** | cerrado | `data-testid` por unidad (`…-option-<key>-<unitId>`). El E2E elige la unidad sembrada y afirma `newPresentation.unitId === unit`, que antes era un simple `not.toBeNull()`. |
| **m9** | pasa a la descripción del PR | Sin cambio de código, correcto. |
| **m10** (a11y) | cerrado | En solo lectura, `<span id>` + `aria-labelledby`. Test `toHaveAccessibleName('Material')`. |
| **m11** (respuestas fuera de orden) | cerrado | `reclassifySeqRef` descarta cualquier respuesta que no sea la última. El test resuelve la segunda antes que la primera y comprueba que la vieja no pisa. |
| **m12** (móvil real) | abierto, del humano | Informativo; `design.md > 15` solo exige WebKit. |

## Menores abiertos
- **m12**: la pasada manual en un iPhone o Android real sigue pendiente (humano).
- **m13 (nuevo).** En `catalog-columns.test.tsx`, los tres casos «con solo el diámetro / el alto /
  la boca… *únicamente* esa medida» usan `toHaveTextContent`, que busca subcadena: no fallarían si la
  celda pintara además otras partes. El caso del formato completo sí fija la cadena entera.
  Endurecerlo con `{ normalizeWhitespace }` + regex anclada `^…$`, o con `toHaveTextContent` sobre
  el texto exacto vía `textContent === …`.
- **m14 (nuevo).** La decisión humana (1), que R38 compruebe la imagen solo en la base, está
  fechada en `design.md > 16`, pero no en la tabla de decisiones de `requirements.md`, que es donde
  este repo registra lo que acota un requisito. Conviene una nota fechada allí, sin reescribir R38,
  para que quien lea R38 no crea que el E2E incumple.
