# QC-107 — componente-de-carga-de-archivos · tasks.md

Convención: los nombres de test citan `R<n>`, nunca `QC-nn` (`docs/conventions.md > Comentarios`;
en producción no se cita ni ficha ni requisito). «Hecho» en cada task exige typecheck + lint locales
sobre los archivos tocados y `./init.sh --rapido` al cerrar la tanda; el gate completo (`./init.sh`)
se corre una sola vez al final, antes del PR (regla 5 de `CLAUDE.md`).

**Ninguna task de esta ficha toca `lib/modules/documentos/domain/`, `ports/` ni las dos Server
Actions.** Si alguna parece necesitarlo, se para y se pregunta.

## Andamiaje del componente

- [x] **T1.** Crear `components/shared/document-upload/` con su `index.ts` y el esqueleto de
      `document-upload.tsx` (`'use client'`), con la prop `strategy: PdfStrategy` importada del
      barril del módulo y sin lógica todavía.
      **Hecho cuando**: `pnpm run typecheck` pasa y el test
      `el componente exige la estrategia de toda la tanda por prop (R3)` pasa en
      `tests/unit/documentos-ui/document-upload-strategy.test.tsx`.

- [x] **T2. [P]** `labels.ts`: los textos por estado de archivo (los cuatro de
      `DocumentFileStatus`) y la elección del texto de error **por `code`**, con `errorMessage` del
      barril de `errores`. Sin ningún literal de mensaje escrito a mano.
      **Hecho cuando**: `el texto de un archivo en error se elige por su code y no por su mensaje
      (R12)` pasa en `tests/unit/documentos-ui/document-upload-errors.test.tsx`.

- [x] **T3.** Depende de T1. Selección de archivos: `<input type="file" multiple
      accept="application/pdf">` con su disparador accesible, tope importado
      (`MAX_FILES_PER_BATCH`) y rechazo **entero** por encima del tope.
      **Hecho cuando**: pasan `la selección admite hasta el tope de archivos que publica el módulo
      (R1)`, `una selección por encima del tope se rechaza entera y no llama a ninguna acción (R1)`
      y `la selección se restringe a PDF (R2)` en
      `tests/unit/documentos-ui/document-upload-selection.test.tsx`.

## El camino de subida

- [x] **T4.** Depende de T3. `upload-file.ts`: el `PUT` del navegador al `uploadUrl` firmado, con su
      resultado por archivo. No conoce ninguna Server Action.
      **Hecho cuando**: `los bytes del PDF viajan al enlace firmado y no a ninguna Server Action
      (R5)` pasa en `tests/unit/documentos-ui/document-upload-flow.test.tsx`.

- [x] **T5.** Depende de T4. El flujo completo en `document-upload.tsx`: `issueUploadLinksAction`
      (ruta exacta) → subidas en paralelo → `enqueueBatchAction` (ruta exacta) con **las rutas que
      subieron bien** y la estrategia de la prop.
      **Hecho cuando**: pasan `pide los enlaces de subida con la acción del módulo importada por su
      ruta exacta (R4)`, `encola la tanda con las rutas devueltas y la estrategia de la prop (R7)`,
      `un archivo cuya subida falla queda señalado y no se encola (R6)` y `si no sube ningún archivo
      no se encola nada (R6)` en `tests/unit/documentos-ui/document-upload-flow.test.tsx`.

- [x] **T6.** Depende de T5. `document-upload-row.tsx`: la fila con la **fase del navegador** antes
      de que la tanda exista y, después, **exclusivamente** uno de los cuatro estados del módulo.
      **Hecho cuando**: pasan `la fila pinta solo los cuatro estados que publica el módulo (R11)`,
      `mientras el archivo sube, la fila no muestra ningún estado del módulo (R6)` y `un archivo
      listo no muestra el texto extraído (R13)` en
      `tests/unit/documentos-ui/document-upload-rows.test.tsx`.

## El sondeo

- [x] **T7.** Depende de T5. `use-batch-status.ts`: sondeo de `getBatchStatusAction` cada 2000 ms
      (`design.md > 4.1`), primera consulta inmediata, una sola en vuelo, parada al terminar todos
      los archivos, parada al desmontar, parada con error reanudable. **Sin dependencia nueva.**
      **Hecho cuando**: pasan, con temporizadores falsos, `sondea el estado de la tanda hasta que
      todos los archivos terminan (R8)`, `deja de sondear en cuanto ningún archivo sigue en cola ni
      procesando (R8)`, `no lanza una consulta nueva mientras la anterior sigue en vuelo (R8)`,
      `deja de sondear al desmontarse (R8)` y `no declara ningún plazo propio para dar por fallido un
      archivo (R10)` en `tests/unit/documentos-ui/use-batch-status.test.tsx`.

- [x] **T8.** Depende de T7. El error de la consulta: se muestra por su `code` y el sondeo se
      detiene con un control para reanudar; `data: null` se trata como tanda desconocida y también
      detiene el sondeo.
      **Hecho cuando**: pasan `un error de la consulta detiene el sondeo y se muestra por su code
      (R12)` y `el componente no comprueba ningún permiso y muestra el error de autorización como
      cualquier otro (R14)` en `tests/unit/documentos-ui/document-upload-errors.test.tsx`.

## Montaje

- [x] **T9.** Depende de T6, T8. Montar `<DocumentUpload strategy="catalogo" />` en
      `app/(private)/proveedores/[id]/page.tsx`, debajo de `CatalogListSection`, sin añadir ningún
      corte de permiso nuevo.
      **Hecho cuando**: `la pantalla de detalle de proveedor monta el componente en modo catálogo
      (R17)` pasa en `tests/unit/documentos-ui/supplier-detail-upload.test.tsx`.

- [x] **T10. [P]** `tests/unit/documentos-ui/document-upload-convenciones.test.ts`: los asertos
      «por ausencia», leyendo los archivos del componente y del repo —sin dependencia nueva (R9),
      sin suscripción de tiempo real ni cliente de Supabase (R15), sin aviso ni notificación (R16),
      sin ruta ni item de menú nuevos (R19), el tope y los tipos **importados** y no reescritos
      (R22), y **ninguna pantalla de fórmulas montando el componente ni permiso nuevo** (R18).
      **Hecho cuando**: los seis casos pasan citando su `R<n>`.

- [x] **T11. [P]** `tests/unit/documentos-ui/document-upload-a11y-tactil.test.tsx`: objetivos
      táctiles de 44×44 px, `font-size` ≥ 16 px en el control de entrada, activación sin `:hover` y
      ausencia de `100vh`, con el mismo patrón que `tests/unit/asignaciones-ui/a11y-tactil.test.tsx`.
      **Hecho cuando**: `la subida se puede activar sin hover y con objetivos táctiles de 44px (R21)`
      pasa.

- [ ] **T12. FUERA DE ALCANCE — la hace `QC-142`, no esta ficha.** Montar
      `<DocumentUpload strategy="formula" />` en la pantalla de fórmulas (R18).
      La pregunta abierta 1 **se cerró el 2026-09-21**: `documentos` tiene **permiso propio**, lo
      que es la cuarta enmienda al catálogo de QC-74 y exige migración y seed. Por eso el trabajo
      salió a **QC-142 — «Permiso propio de documentos y montaje de la subida en formulas»**
      (`zone: fullstack`, bloqueada por QC-107), y el montaje viaja con el permiso porque sin él esa
      pantalla no puede subir nada. **Aquí no se hace, y no se marca**: no se añade ningún permiso
      al catálogo y no se presta `proveedores.modificar`.
      **Hecho cuando**: lo cierra QC-142 con su test `la pantalla de fórmulas monta el componente en
      modo fórmula (R18)`. En esta ficha, R18 queda cubierto en positivo por el test de la prop
      (T1) y en negativo por el de convenciones (T10).

## E2E y cierre

- [x] **T13.** Depende de T9. Los tres dobles de `design.md > 8`:
      `document-storage-memory.ts`, `processing-queue-inline.ts` y `ai-reader-canned.ts` en
      `adapters/driven/**`, elegidos en `lib/composition` según `DOCUMENTS_E2E_DOUBLES` leída **en
      la invocación**, más su línea vacía y documentada en `.env.example` y
      `webServer.env` en `playwright.config.ts`.
      **Hecho cuando**: `tests/unit/composition/documentos-facade.test.ts` se amplía con `sin la
      variable de entorno, la composición elige los adaptadores reales (R20)` y `con la variable, la
      composición elige los dobles (R20)`, y los dos pasan.

- [x] **T14.** Depende de T13. `tests/guards/guard-dobles-e2e.test.ts`: roja si algún archivo
      versionado distinto de `playwright.config.ts` activa la variable, o si `lib/composition` elige
      un doble sin consultarla.
      **Hecho cuando**: la guardia pasa en verde **y** se comprueba que **muerde**, con un fixture
      por cada uno de los dos motivos de fallo (`docs/verification.md > Probar que muerde`).

- [x] **T15.** Depende de T13. `e2e/documentos.spec.ts`: login → detalle de proveedor → elegir tres
      PDFs → subir (con `page.route()` interceptando el `PUT` al enlace firmado) → ver tres filas →
      verlas llegar a «listo». Rutas desde `lib/shared/routes`, asertos sobre `data-testid` y roles,
      fixtures con prefijo propio y `afterAll` que limpia por nombre exacto.
      **Hecho cuando**: `sube tres PDFs y ve cambiar el estado de cada uno hasta terminar (R20)`
      pasa en **Chromium y WebKit**, con el servidor de Playwright y **sin red**.

- [x] **T16.** Depende de T1–T15 (salvo T12, bloqueada). Escribir
      `progress/impl_QC-107-componente-de-carga-de-archivos.md` con el mapa `R1..R22 → test`,
      dejando **R18 anotado como bloqueado** con su cobertura en negativo y la razón.
      **Hecho cuando**: cada `R<n>` aparece con al menos un test concreto, o —solo R18— con su
      bloqueo escrito.

- [x] **T18.** Depende de T8. Cubrir **R23** con su propio caso en
      `tests/unit/documentos-ui/document-upload-errors.test.tsx`: la consulta responde
      `{ status: 'success', data: null }` y el componente **detiene el sondeo** y dice que no hay
      tanda que seguir, **sin distinguir** «no existe» de «es de otra empresa». El comportamiento ya
      está implementado (hoy etiquetado `(R8)`): esta task **no cambia código de producción**, añade
      el caso y le pone su `R<n>` propio.
      **Hecho cuando**: pasan `el hook deja de sondear cuando la consulta responde que no hay tanda
      (R23)` en `use-batch-status.test.tsx` y `el componente avisa de tanda desconocida sin
      distinguir si no existe o es de otra empresa (R23)` en `document-upload-errors.test.tsx`
      —**dos nombres distintos, uno por capa**: el par idéntico que esta task pedía antes dejaba dos
      casos indistinguibles en la salida del gate—, el caso que hoy cita `(R8)`
      para este escenario queda reetiquetado a `(R23)`, y el mapa de
      `progress/impl_QC-107-componente-de-carga-de-archivos.md` (T16) recoge la fila `R23 → test`.

- [x] **T19. La ejecuta `backend_dev`.** Depende de T15 (es su hallazgo). Arreglar el búfer
      detachado de `design.md > 12`: en
      `lib/modules/documentos/adapters/driven/pdf/pdf-converter-unpdf.ts`, entregar **una copia** del
      arreglo a la librería en las **tres** funciones —`countPages`, `extractPdfText` y
      `renderPages`—, no solo en la que hoy rompe el recorrido. **No se toca `domain/` ni `ports/`**:
      la restricción es de la librería y vive donde la librería se importa.
      **Hecho cuando**: (a) pasan en `tests/unit/documentos/pdf-converter.test.ts` los casos `contar
      las páginas deja los bytes del PDF intactos (R24)`, `extraer el texto deja los bytes del PDF
      intactos (R24)` y `rasterizar deja los bytes del PDF intactos (R24)`; (b) pasa en
      `tests/unit/documentos/process-pdf-by-strategy.test.ts` el caso `la lectura con IA recibe los
      bytes completos después de contar las páginas (R24)`, **con el conversor real y en las dos
      estrategias**; y (c) **T15 pasa en Chromium y WebKit con las tres filas en «listo»**, que es
      exactamente lo que hoy no ocurre.

- [x] **T20. La ejecuta `backend_dev`.** Depende de T19 (el E2E solo llega hasta aquí con el búfer
      ya arreglado). Aplicar `design.md > 13`: declarar en `next.config.ts` el par nativo de
      rasterizado como **externo del servidor**, para que Next no lo empaquete y su binario se
      resuelva en ejecución. **No se toca `pdf-converter-unpdf.ts`**: `resolveRasterizer` y su
      mensaje siguen siendo correctos el día que el par falte de verdad.
      **Hecho cuando**: (a) pasa `la configuración declara el par nativo de rasterizado como externo
      del servidor (R25)` en `tests/unit/documentos/next-config-externos.test.ts`, afirmando sobre
      la **configuración resuelta** y no sobre el texto del archivo; (b) **T15 pasa en Chromium y
      WebKit con las tres filas en «listo»**; y (c) queda anotada en
      `progress/impl_QC-107-componente-de-carga-de-archivos.md` la **deuda que esto NO cierra**: si
      el binario sobrevive al runtime de Vercel sigue siendo **DESCONOCIDO** —pregunta abierta 3 de
      QC-106—, y solo un despliegue real puede responderlo.

- [ ] **T17.** Depende de T16. Correr `./init.sh` completo (no `--rapido`) antes de abrir el PR.
      **Hecho cuando**: termina en verde, incluidas las guardias de arquitectura y de dependencias,
      que deben pasar **sin ningún cambio en `docs/dependencias.md`** porque no entra ninguna
      dependencia nueva.
