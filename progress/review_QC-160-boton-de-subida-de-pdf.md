# QC-160 — boton-de-subida-de-pdf · review (F2.2)

> Reviewer, 2026-09-24. Rama `feature/QC-160-boton-de-subida-de-pdf` en `8d5cdfa4` (con `origin/dev`
> `9ce363e5` mergeado). Diff medido con `git diff origin/dev...HEAD`. No he tocado código.

## Qué corrí yo

- `pnpm run typecheck`: sin errores.
- `pnpm exec eslint` sobre los `.ts`/`.tsx` del diff: sin salida (0 problemas).
- Vitest, archivos concretos: `tests/unit/documentos-ui/` (12 archivos), `can-upload-documents`,
  `module-contract`, `proveedores-ui/catalog-pdf-upload`, `navegacion/pantallas-exigen-permiso`,
  `recetas-ui/recipe-page` y `guards/guard-dependencias-aprobadas`: **18/18 archivos, 177/177 casos**.
- `adjust-batch-dialog`, `recipe-form`, `recipe-form-payload`, `supplier-detail-page`: verdes.
  `session-once-per-request-render` expiró su `beforeAll` de 60 s (import del grafo) mientras corría
  el `./init.sh` del leader (16 procesos node). **Solo, 7/7 verde en 45 s.** Es carga: ese archivo no
  importa ninguna de las dos páginas tocadas. No es hallazgo.
- **No** corrí `./init.sh` ni el E2E, por instrucción del leader.

## Checklist

| # | Punto | Estado |
|---|---|---|
| 1 | Trazabilidad R1-R22 → test | Pasa. Todos los R tienen un caso que afirma algo real (tabla abajo). R15 queda a medias hasta WebKit (M2). |
| 2 | Tasks `[x]` | **No pasa.** T8 tiene abierta la casilla de `./init.sh` completo, y T7 está marcada sin cumplir su «Hecho cuando» (M2). |
| 3 | CHECKPOINTS | Ver abajo. Pendientes: `./init.sh` verde, entrada en `history.md` y desmontar el worktree, que son de cierre. |
| 4 | Verificación ejecutable | typecheck, lint y los unit de la feature en verde, corridos por mí. Gate completo: lo corre el leader. |
| 5 | Calidad y seguridad | Pasa. Sin tablas, sin RLS que añadir, sin webhooks, sin secretos. El permiso sigue en el service (QC-106/QC-111). La página solo decide qué se pinta. |
| 6 | Multiplataforma | Pasa en código: botón y «Cerrar» con `min-h-11 min-w-11` (el `h-8` de `Button` lo vence `min-height`), `max-h-[85dvh]` y no `vh`, sin `:hover`, sin inputs de texto nuevos, cerrar integrado de 28 px y en inglés desactivado. Falta comprobar `position: fixed` + scroll interior en WebKit (M2). |
| 7 | Dependencias | Pasa. `package.json`, `pnpm-lock.yaml` y `docs/dependencias.md` sin diff. El diálogo es `components/ui/dialog.tsx`. |
| 8 | Aislamiento por empresa | No aplica: sin modelos nuevos ni consultas de operación nuevas. |
| 9 | Comentarios | Producción limpia: ninguna línea añadida en `app/`, `lib/` o `components/` cita ficha, R, D, `design.md` ni «decisión cerrada». En tests sí (m1). |
| — | Baseline | `tests/baseline-rojos.json` sin diff; ninguno de los archivos tocados figura en él. |

### Puntos que pidió el leader

- **Opción A.** `page.tsx` monta `{canUpload ? <CatalogPdfUpload supplierId=… /> : null}` entre
  `SupplierDetailHeader` y el `<Suspense>` del catálogo. `CatalogPdfUpload` renderiza
  `DocumentUploadDialog strategy="catalogo" reviewHrefFor={…}`, y el diálogo pasa `reviewHrefFor` a
  `DocumentUpload` sin tocarlo. «Revisar» lo cubren dos tests. Uno es `catalog-pdf-upload.test.tsx` ›
  ««Revisar» sigue disponible dentro de la ventana, en una fila lista (R22)», que abre la ventana y
  afirma el enlace visible y el `href`. El otro es `document-upload-dialog.test.tsx` › «con
  reviewHrefFor…». La enmienda de `catalog-pdf-upload.test.tsx` lleva su motivo escrito encima de
  `elegirYSubir` y no pasa por la baseline. **Pasa.**
- **Permiso.** Las dos páginas llaman a `canUploadDocuments(await identity.getSessionUser())` después
  de `requirePagePermission(...)`. `canUploadDocuments` delega en `assertPermission` con
  `DOCUMENT_UPLOAD_PERMISSION`, la misma constante que exige `requirePermission` en los casos de uso.
  El literal `'documentos.modificar'` aparece una sola vez en `lib/modules/documentos`, y un test lo
  vigila. Ningún componente de cliente recibe permisos: `CatalogPdfUpload` solo recibe `supplierId`
  y `DocumentUploadDialog` solo `strategy` y `reviewHrefFor`. La guardia prohíbe
  `permission|permiso|roleName` en la carpeta. El caso R11 de proveedores usa `roleName:
  'Administrador'` sin `documentos.modificar`, lo que demuestra que no se decide por el rol. **Pasa.**
- **`keepMounted` (D8).** Leí `node_modules/@base-ui/react/dialog/portal/DialogPortal.mjs` (1.7.0):
  `const { keepMounted = false } = props`. Así que `keepMounted={undefined}` equivale a no pasarlo,
  y quien no usa la prop no cambia. Backdrop y popup llevan `hidden: !mounted`, y el portal montado y
  cerrado no tapa la página. `adjust-batch-dialog` y `recipe-form` siguen verdes. **Pasa.**
- **QC-107 intacto.** `git diff origin/dev` vacío sobre `document-upload.tsx`,
  `document-upload-row.tsx`, `upload-file.ts` y `use-batch-status.ts`, y sobre los tests de
  componente de QC-107 (`-flow`, `-rows`, `-selection`, `-errors`, `-strategy`, `-a11y-tactil`,
  `use-batch-status`, además de `-review-link`). **Pasa.**
- **Accesibilidad y posiciones.** El texto es «Subir PDFs» (`OPEN_LABEL`) y tiene test. El título
  accesible se afirma con `getByRole('dialog', { name: 'Subir PDFs' })`. En proveedores, la posición
  se comprueba con `compareDocumentPosition`: después de `supplier-detail` y antes de
  `catalog-list`. En fórmulas, el botón comparte padre con `recipe-create-open`. **Pasa.**
- **Mutación de T1.** Ver m2: cumple el propósito, no la letra. No bloquea.

## Trazabilidad verificada

| R | Test (leído, no solo listado) |
|---|---|
| R1 | `document-upload-dialog.test.tsx` (popup `not.toBeVisible`, botón visible); `supplier-detail-upload` y `formulas-upload` (subida oculta antes de pulsar) |
| R2 | `document-upload-dialog.test.tsx`: `role="dialog"` con nombre y `document-upload` dentro |
| R3, R4 | `document-upload-dialog.test.tsx`: `document-upload-close` y Escape ocultan, y el foco vuelve a `document-upload-open` |
| R5 | `supplier-detail-upload.test.tsx`: encola `strategy: 'catalogo'` |
| R6 | `formulas-upload.test.tsx`: encola `{ strategy: 'formula', paths }` |
| R7 | `supplier-detail-upload.test.tsx` (proveedor inexistente); `document-upload-convenciones.test.ts` (montajes exactos `formulas/page.tsx` + `catalog-pdf-upload.tsx`; en fórmulas solo el listado) |
| R8 | `document-upload-dialog.test.tsx`: `accept="application/pdf"` y rechazo de `MAX_FILES_PER_BATCH + 1` sin llamar a la acción |
| R9 | Diff vacío en los cuatro archivos y en los tests de QC-107, que pasan |
| R10 | `supplier-detail-upload` y `formulas-upload` (ver m4) |
| R11 | `supplier-detail-upload` (`proveedores.consultar` + `proveedores.modificar`) y `formulas-upload` (`recetas.*` + `documentos.consultar`): ni botón ni subida en el DOM |
| R12 | `can-upload-documents.test.ts` (8 casos); `document-upload-convenciones.test.ts` › bloque R12, con detectores sintéticos |
| R13 | `document-upload-dialog.test.tsx`: `data-code="unauthorized"` y `enqueueBatchAction` sin llamar |
| R14 | `pantallas-exigen-permiso.test.tsx`, sin cambios y verde; además, el orden en las dos páginas (`requirePagePermission` primero) |
| R15 | `document-upload-dialog.test.tsx` (clases). La parte iOS depende del E2E en WebKit (M2) |
| R16-R19 | `e2e/documentos.spec.ts`, tres casos; Chromium 3/3 según la bitácora; contador de `PUT` en los tres |
| R20 | `document-upload-convenciones.test.ts` (import de `@base-ui/react` prohibido en la carpeta; manifiesto, ver M1) y `guard-dependencias-aprobadas` |
| R21 | `document-upload-dialog.test.tsx`: cerrar y reabrir con la tanda en `processing`, sin confirmación, y el sondeo sigue (ver m3) |
| R22 | Texto, posición en las dos pantallas, y «Revisar» dentro de la ventana |

## Hallazgos

### Mayores (bloqueantes)

- **M1 — El centinela de dependencias compara con `origin/dev` y castiga a toda rama posterior.**
  `tests/unit/documentos-ui/document-upload-convenciones.test.ts`, caso «el manifiesto no gana
  ninguna dependencia respecto de origin/dev» (`git show origin/dev:package.json` por
  `execFileSync`). Mientras la rama no está mergeada, se cumple. Pero el test se queda en la suite
  para siempre, y **la primera ficha que añada una dependencia aprobada se pondrá roja aquí**, porque
  su `origin/dev` todavía no tiene esa dependencia. Además, sin la ref `origin/dev` (clon superficial)
  lanza un error sin explicar qué pasa. El repo ya lo corrigió el mismo día en `7cd534e8` («El de
  clientes comparaba package.json con origin/dev y mordia a cualquier rama posterior con una
  dependencia aprobada»; patrón en `tests/unit/clientes/scope.test.ts:249-275`). El implementer
  siguió `design.md > 9.2` al pie de la letra, así que el arreglo necesita **una nota fechada en el
  design** (decide el leader). Hay dos opciones. **(a)** Quitar este caso: R20 queda cubierto por
  `guard-dependencias-aprobadas`, por el caso del import de `@base-ui/react` y por la comprobación de
  `git diff --stat` de T8. **(b)** Después del merge, cambiarlo al patrón «merge de entrada frente a
  su primer padre», con un error explícito si falta el commit. La (b) no se puede hacer antes de que
  exista el merge, así que en esta rama solo cabe la (a), o la (a) más una ficha de seguimiento.

- **M2 — T7 está marcada `[x]` sin cumplir su «Hecho cuando», y la verificación iOS de R15 no se ha
  hecho.** T7 exige `pnpm run e2e -- documentos` verde en **Chromium y WebKit**. Solo se corrió
  Chromium (3/3). `docs/architecture.md > Regla: multiplataforma` pide comprobar en iOS
  `position: fixed` y el scroll anidado antes de darlos por buenos. `design.md > 10` delega eso en el
  E2E de WebKit, y el mapa de R15 lo cita. El E2E de WebKit (con la base propia y sin otro E2E en la
  máquina) tiene que salir verde. Si no, el leader deja escrita la decisión de no correrlo, con su
  motivo, en `tasks.md > T7` y en la bitácora, y T7 se desmarca hasta entonces. Esto no pide cambios
  de código. Aparte, `./init.sh` completo (T8) sigue abierto y es del leader.

### Menores

- **m1 — Citas de ficha y requisito en comentarios de test tocados por la rama.** Según
  `docs/conventions.md > Comentarios`, en tests rige la misma regla y `R<n>` va solo en el nombre
  del caso. Líneas añadidas o reescritas en `e2e/documentos.spec.ts`: cabecera «(QC-107 y QC-160,
  R16-R19)», «recorrido del proveedor (R16)» y «recorrido de formulas (R17)». En
  `document-upload-convenciones.test.ts`, el docblock reescrito de `PANTALLA_CON_MONTAJE` («el montaje
  de esta ficha») y el nombre del bloque «esta ficha no reescribe…» hablan de «esta ficha», que en
  una suite permanente no remite a nada. Menor, como en QC-142 (m3).
- **m2 — La mutación de T1 no la detecta el caso `true`.** El «Hecho cuando» de T1 pide que cambiar
  la constante ponga rojo el caso `true`. Pero `design.md > 9.1` manda que ese caso use la constante,
  y así no se puede poner rojo nunca: el spec se contradice. Aun así, la mutación siempre se detecta:
  cambiar el valor de la constante hace desaparecer el literal del permiso de subida y pone rojo el
  caso del conteo. Si el valor nuevo es uno de los códigos que el test espera en falso, cae además
  ese caso. Y el E2E del Administrador (R16/R17) caería con cualquier valor. Mi valoración: **cumple
  el propósito del «Hecho cuando», no su letra.** Basta con anotarlo en la bitácora como desviación
  aceptada. Otra opción es añadir un caso verdadero con el literal escrito en el test, que no rompe
  el conteo porque este solo mira `lib/modules/documentos`.
- **m3 — R21 prueba uno de los dos escenarios del design y no afirma que la ventana llegue a
  cerrarse.** `design.md > 9.1` pide «con archivos elegidos **y** con una tanda en `processing`… con
  su fase y estado». El test solo cubre `processing`: faltan el caso con archivos elegidos antes de
  subir y la afirmación de `data-phase`. Tampoco comprueba que tras `document-upload-close` el popup
  quede `not.toBeVisible()`, ni que tras reabrir esté visible. Con `keepMounted`, las filas siguen en
  el DOM aunque estén ocultas, así que las afirmaciones de texto pasarían aunque la ventana no se
  abriera. La mutación que importa (quitar `keepMounted`) sí la detecta.
- **m4 — R10 no se prueba con el conjunto mínimo.** Los dos casos «con permiso» usan `PERMISSIONS`
  entero, cuando `design.md > 9.1` pide `recetas.consultar` + `documentos.modificar` (y en proveedores
  `proveedores.consultar` + `documentos.modificar`). Tal como está, una mutación que exigiera un
  permiso de más para pintar el botón no se detectaría.
- **m5 — `interceptSignedUploads` no espera a `page.route`.** En `e2e/documentos.spec.ts` la llamada
  es `void page.route(...)`, y antes se hacía `await`. Registrar la ruta queda en carrera con la
  navegación, aunque en la práctica el `PUT` llega mucho después, y un rechazo de `page.route` se
  pierde sin aviso. Conviene que la función sea `async` y que se haga `await`.
- **m6 — El caso R18 pierde la referencia a QC-142 que pedía el design.** `design.md > 9.3` pide que
  el nombre del caso lleve `R18` y conserve la referencia a QC-142 R20. El nombre acaba en «(R18
  permiso propio)». Las bitácoras de QC-107 y QC-142 citan los nombres viejos de los dos casos
  renombrados. Son historia y no hay que reescribirlas, pero el mapa de QC-142 R20 ya no encuentra su
  caso por el nombre.

## Veredicto

**RECHAZADO** — 2 mayores (M1, M2) y 6 menores.

Para pasar a OK:
1. **M1.** Nota fechada en `design.md > 9.2` con la decisión del leader, y el caso del manifiesto
   quitado de `document-upload-convenciones.test.ts` (opción a), o con la ficha de seguimiento para
   (b) anotada.
2. **M2.** E2E de documentos verde en WebKit, o la decisión escrita de no correrlo. Además, `./init.sh`
   completo en verde y la casilla de T8 marcada.

Las menores no bloquean. Recomiendo en la misma vuelta m1 (limpiar citas en líneas ya tocadas), m3 y
m5, que son baratas.
