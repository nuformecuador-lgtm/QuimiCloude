# QC-106 — endpoint-de-carga-de-pdf · tasks.md

> `[P]` = paralelizable con las otras `[P]` de su misma tanda. Cada task declara **los archivos que
> toca** y su criterio de «hecho». Ninguna task se da por hecha sin `./init.sh --rapido` en verde; la
> feature no se cierra sin `./init.sh` completo (`docs/verification.md`). **El gate lo corre el
> leader**, no el implementer (`AGENTS.md > Regla del gate`).
>
> **Cinco cosas que esta ficha NO hace, y que son criterio de rechazo si aparecen:**
> **(a)** ningún archivo bajo `app/**` ni `components/**` (R34 — la pantalla es QC-107);
> **(b)** ningún Route Handler ni nada bajo `app/api/**` (R29 — eso lo estrena QC-111);
> **(c)** ningún cambio en `db/schema.prisma` ni migración ni `down.sql` (R14);
> **(d)** ninguna entrada nueva en `lib/modules/errores/domain/error-codes.ts` (R33) ni en
> `lib/modules/identity/domain/permissions.ts` (R4);
> **(e)** ningún E2E nuevo (R34).
> Si una task acaba pidiendo cualquiera de las cinco, **se para y se anota**: es señal de que algo se
> diseñó mal.
>
> **Ninguna dependencia entra sin T0.** `unpdf` y `@napi-rs/canvas` están **propuestas**
> (`design.md > 8`), no aprobadas: nadie toca `package.json` antes de la respuesta humana (R24).
>
> **Comentarios del código**: explican **el porqué**, y **no citan fichas, requisitos ni
> `design.md`**. Los identificadores `R<n>` van **solo en los nombres de los tests**, que es donde el
> reviewer los busca para el mapa de trazabilidad. (En QC-81 hacerlo al revés costó una pasada
> completa de limpieza.)

## Tanda 0 — las dos puertas que no se pueden saltar

- [x] **T0 — Cerrar la puerta F1.4: dependencia y permiso.**
      Archivos: ninguno todavía.
      Dos respuestas humanas, las dos en la aprobación del spec:
      1. **`unpdf` + `@napi-rs/canvas`** con los cuatro checks de `design.md > 8`. Sin «sí», **T8 no
         se empieza** y la conversión a imagen no existe.
      2. **Cuál permiso ya existente se exige** (`design.md > 4`; se propone `proveedores.modificar`).
      Se anota además si el leader escribe la enmienda a `docs/dependencias.md:32`
      (`design.md > 6.4`) y si `documentos` entra en `BUSINESS_MODULES` de
      `guard-autorizacion-por-permiso.test.ts` aquí o en ficha propia (`design.md > 12`).
      **Hecho:** las dos respuestas están escritas en
      `progress/impl_QC-106-endpoint-de-carga-de-pdf.md`. Sin la 2, T1 no se cierra; sin la 1, T8 no
      se abre.

## Tanda 1 — el esqueleto del módulo y sus piezas puras

- [x] **T1 — El módulo `documentos` nace: contrato, actor y errores.** Depende de **T0.2**.
      Archivos: `lib/modules/documentos/index.ts`, `.../domain/actor.ts`, `.../domain/errors.ts`,
      `tests/unit/documentos/authorization.test.ts`,
      `tests/unit/documentos/module-contract.test.ts`.
      `Actor = { id, companyId, permissions }` y `requirePermission` delegando en `assertPermission`
      del **barrel** de `identity` (nunca ruta profunda), copiando
      `lib/modules/asignaciones/domain/actor.ts`. `DocumentosError` abstracta con `UnauthorizedError`
      (`unauthorized`) y `ValidationError` (`invalid_input`): **dos clases, cero códigos nuevos**.
      `index.ts` reexporta **solo** de `./domain`.
      **Hecho:** tests de (a) actor sin el permiso ⇒ `UnauthorizedError` y **cero** llamadas a
      cualquier puerto; (b) actor ausente, sin `permissions`, con lista vacía o con un valor que no
      es lista ⇒ el mismo rechazo; (c) el código exigido **está** en el conjunto del Administrador y
      **no** en el del Operador, leído de `SEED_ROLE_PERMISSIONS` del contrato de `identity`, no
      escrito a mano; (d) el barrel no reexporta nada de `ports/` ni de `adapters/` ni arrastra
      `'use server'`. `tests/guards/guard-arquitectura-modulos.test.ts` y
      `guard-rol-administrador-unico.test.ts` en verde.
      Cubre **R1, R2, R3, R4, R5, R27, R33**.

- [x] **T2 [P] — Las constantes únicas, la firma del PDF y la ruta de empresa.** Depende de T1.
      Archivos: `lib/modules/documentos/domain/limits.ts`, `.../domain/pdf-content.ts`,
      `.../domain/document-path.ts`, `tests/unit/documentos/limits-and-path.test.ts`.
      `MAX_FILES_PER_BATCH`, `MAX_PDF_PAGES`, `PAGE_RENDER_DPI`, `UPLOAD_LINK_TTL_SECONDS` y
      `MAX_PDF_BYTES` **cada uno declarado una sola vez**, con el docblock de `MAX_PDF_BYTES`
      diciendo que ese número tiene que coincidir con el `fileSizeLimit` del bucket y que **el código
      no lo hace cumplir**. `isPdfContent(bytes)` mira la **firma** del archivo. `buildDocumentPath`
      e `isPathInCompany` comparan **segmento completo**, no `startsWith` pelado.
      **Hecho:** tests de (a) `%PDF-1.7…` ⇒ válido; un PNG, un texto plano y un archivo vacío ⇒
      inválidos, **aunque se llamen `.pdf`**; (b) `empresa-A2/x.pdf` **no** pasa como ruta de
      `empresa-A`; (c) la ruta construida empieza por la empresa y termina en `.pdf`; (d) los cinco
      valores aparecen **una sola vez** en el módulo (búsqueda en el árbol del módulo).
      Cubre **R12 (mitad pura), R17, R20**.

- [x] **T3 [P] — El esquema de entrada de la tanda.** Depende de T1 y T2.
      Archivos: `lib/modules/documentos/domain/upload-input.ts`,
      `tests/unit/documentos/upload-input.test.ts`.
      `strictObject` con `files` de 1 a `MAX_FILES_PER_BATCH`, `fileName` recortado y acotado, y
      `contentType` literal `'application/pdf'` —con el docblock diciendo que eso es **comodidad, no
      garantía**: quien miente lo para el bucket—.
      **Hecho:** tests de 0 archivos, 10 archivos, 11 archivos, campo desconocido, nombre vacío y
      `contentType` ajeno. Cubre el lado entrada de **R8, R9, R16**.

## Tanda 2 — puertos y casos de uso

- [x] **T4 — Los dos puertos.** Depende de T2.
      Archivos: `lib/modules/documentos/ports/document-storage.ts`, `.../ports/pdf-converter.ts`.
      Las firmas de `design.md > 3.1` y `> 3.2`. **Sin operación de borrado** en
      `DocumentStorage`: el borrado del PDF temporal es de QC-111 y no debe ser expresable desde
      aquí. `countPages` **aparte** de `renderPages`, para poder rechazar por páginas sin renderizar.
      **Hecho:** `pnpm run typecheck` en verde; ni `ports/` ni `domain/` importan
      `@supabase/storage-js`, `unpdf`, `next/*`, `@prisma/client`, `lib/shared/**` ni
      `lib/composition` (lo verifica la guardia de arquitectura). Cubre el lado contrato de **R21,
      R28**.

- [ ] **T5 — El caso de uso de la emisión de enlaces.** Depende de T1, T3 y T4.
      Archivos: `lib/modules/documentos/domain/issue-upload-links.ts`,
      `tests/unit/documentos/issue-upload-links.test.ts`.
      Orden fijo e **irreversible**: permiso → zod → construcción de rutas con `actor.companyId` →
      `createSignedUpload(path, UPLOAD_LINK_TTL_SECONDS)` por archivo. La salida son **rutas y
      enlaces**: ninguna conversión, ninguna URL de lectura, ninguna escritura.
      **Hecho:** tests con un doble del puerto que **registra sus llamadas**: (a) actor sin permiso ⇒
      rechazo y **cero** llamadas al puerto; (b) 11 archivos ⇒ `invalid_input` y **cero** enlaces
      firmados, ni siquiera los diez primeros; (c) tanda vacía ⇒ `invalid_input`; (d) camino feliz de
      3 archivos ⇒ 3 entradas, cada una con su ruta bajo el prefijo de **la empresa del actor** y
      `expiresAt` = emisión + 15 min, con el reloj inyectado; (e) la ruta nunca sale de la entrada:
      con dos actores de empresas distintas y la misma entrada, las rutas caen en prefijos distintos;
      (f) la salida **no** contiene ninguna URL completa de lectura.
      Cubre **R6, R7, R8, R9, R10, R12, R13, R14, R15, R16**.

- [ ] **T6 — El caso de uso de la conversión.** Depende de T1, T2 y T4.
      Archivos: `lib/modules/documentos/domain/convert-pdf.ts`,
      `tests/unit/documentos/convert-pdf.test.ts`.
      Los cuatro pasos de `design.md > 7`, y el resultado por archivo como **discriminado**
      `{ ok: true … } | { ok: false, reason }` en vez de una excepción que suba: es lo que permite que
      un archivo roto no tumbe los otros nueve. Nada de `catch` vacíos; el fallo se registra con
      **qué operación** y **sobre qué ruta**.
      **Hecho:** tests con un doble del convertidor: (a) bytes que no son PDF ⇒ rechazo **antes** de
      llamar a `countPages`; (b) 51 páginas ⇒ rechazo con **cero** llamadas a `renderPages`; (c) 50
      páginas ⇒ se renderiza; (d) el doble lanza al convertir el 2.º de 3 ⇒ el resultado trae un
      fallo en el 2.º y **éxito en el 1.º y el 3.º**; (e) el texto se extrae aunque el render falle
      (par opcional ausente simulado) y el error de imagen **nombra la causa**.
      Cubre **R17, R19, R21, R23, R25** y el lado dominio de **R22**.

## Tanda 3 — adaptadores driven (el único sitio que conoce a los terceros)

- [ ] **T7 — Adaptador de Storage y su configuración perezosa.** Depende de T4.
      Archivos: `lib/modules/documentos/adapters/driven/config/document-storage-config-env.ts`,
      `.../adapters/driven/storage/document-storage-supabase.ts`, `.env.example` (bloque **nuevo al
      final**), `tests/unit/documentos/storage-config.test.ts`.
      Calcado de `lib/modules/recetas/adapters/driven/config/storage-config-env.ts`: los nombres de
      variable viven **solo** como literales de un arreglo, el error los **nombra** sin filtrar
      ningún valor, y la configuración se lee **en cada llamada**, nunca en el top-level.
      `SUPABASE_DOCUMENTS_BUCKET` es la única variable nueva; la URL y la credencial se reutilizan.
      **Hecho:** (a) **importar** el adaptador con las tres variables vacías **no lanza**; (b) invocar
      sin configuración lanza nombrando las que faltan, sin valores; (c) `.env.example` declara la
      variable **vacía** y documentada, y el archivo sigue sin ningún secreto; (d) este adaptador es
      el **segundo y último** archivo del repo que importa `@supabase/storage-js`, comprobado por
      barrido del árbol de producción.
      Cubre **R11 (lado bucket), R26, R32** y el lado adaptador de **R31**.

- [ ] **T8 — Adaptador de conversión con `unpdf`.** Depende de **T0.1** y de T4.
      Archivos: `lib/modules/documentos/adapters/driven/pdf/pdf-converter-unpdf.ts`, `package.json`
      y `pnpm-lock.yaml` (**solo** si T0.1 salió «sí»), `docs/dependencias.md` (dos filas nuevas, las
      escribe el leader en F1.4), `tests/unit/documentos/pdf-converter.test.ts`.
      **Único** archivo del repo que importa `unpdf`. `renderPages` pasa `PAGE_RENDER_DPI` y devuelve
      **PNG** por página; `extractText` **no** depende del par nativo, y si el par falta el error lo
      dice con esas palabras.
      **Hecho:** typecheck y lint en verde; el módulo sigue sin que `domain/` ni `ports/` vean la
      librería; ningún test hace red; `tests/guards/guard-dependencias-aprobadas.test.ts` en verde
      **con las dos filas ya escritas** (si faltan, el gate cae: es la guardia haciendo su trabajo).
      Cubre **R22, R24** y el lado adaptador de **R25**.

## Tanda 4 — borde y cableado

- [ ] **T9 [P] — La Server Action.** Depende de T5.
      Archivos: `lib/modules/documentos/adapters/driving/document-upload-actions.ts`,
      `tests/unit/documentos/document-upload-actions.test.ts`.
      `'use server'`, el actor construido con las dos caras de la sesión de
      `identity` vía `@/lib/composition`, validación con el **mismo** esquema del contrato antes de
      invocar el caso de uso, y traducción con `createErrorStateTranslator` de
      `@/lib/modules/errores`. **Ningún** Route Handler y **nada** bajo `app/api/**`.
      **Hecho:** tests de (a) entrada inválida ⇒ `ErrorState` con `invalid_input` y el doble del caso
      de uso **no se llama**; (b) sin sesión ⇒ `unauthorized`; (c) camino feliz ⇒ `status:'success'`
      con las rutas; (d) el archivo **no** se reexporta desde el barrel del módulo.
      Cubre **R16 (borde), R29**.

- [ ] **T10 — Cableado en el punto de composición.** Depende de T5, T6, T7 y T8.
      Archivos: `lib/composition/index.ts` (**bloque nuevo al final**; sus imports, al final del
      bloque de imports: no se reordena ni se reformatea nada de lo existente).
      Se atan los dos puertos a sus adaptadores y se exporta la fachada `documentos`. **Ninguna
      función se invoca aquí**, solo se referencia: construir la fachada no debe leer ni una variable
      de entorno ni tocar la red. El actor **no** se resuelve aquí.
      **Hecho:** `tests/unit/composition/*` y la guardia de arquitectura en verde; importar
      `@/lib/composition` con las variables del Storage vacías sigue funcionando.
      Cubre **R28** y el cierre de **R31**.

## Tanda 5 — límites de la ficha y cierre

- [x] **T11 [P] — La guardia de alcance de esta ficha.** Depende de nada.
      Archivos: `tests/unit/documentos/qc106-alcance.test.ts` (nuevo; patrón de
      `tests/unit/inventario/qc81-alcance.test.ts`).
      Afirma contra el **diff de la rama** frente al merge-base con `origin/dev`: cero archivos bajo
      `app/**`, `components/**` y `e2e/**`; cero archivos bajo `db/**`; y por lectura de código:
      `error-codes.ts` y `permissions.ts` **idénticos** a los de `dev`, y ningún archivo nuevo bajo
      `app/api/`. Si T0.1 salió «no», afirma además que `package.json` está intacto.
      **Hecho:** el test en verde y **rojo si alguien toca la pantalla, la base, los errores o los
      permisos**. Cubre **R14, R29, R30, R33, R34**.

- [ ] **T12 [P] — El contrato del módulo, congelado.** Depende de T1..T6.
      Archivos: `tests/unit/documentos/module-contract.test.ts` (se amplía el de T1).
      El barrel exporta exactamente lo previsto —tipos, errores, constantes, esquemas y las dos
      factories— y **nada** de `ports/` ni de `adapters/`; su cierre transitivo de imports no
      contiene `'use server'`, `@prisma/client`, `next/*`, `@supabase/storage-js` ni `unpdf`.
      **Hecho:** el test en verde y rojo si alguien cuelga un adaptador del barrel. Cubre **R27,
      R28**.

- [ ] **T13 — Trazabilidad y gate.** Depende de **todas**.
      Archivos: `progress/impl_QC-106-endpoint-de-carga-de-pdf.md`.
      El mapa `R1..R34 → test` completo, sin ningún requisito huérfano. Se escriben además: las dos
      respuestas de T0; la enmienda a `docs/dependencias.md:32` tal como quedó; la nota del **E2E
      diferido a QC-107** con su motivo (excepción consciente a `CHECKPOINTS.md > Calidad de codigo`);
      y el estado de la **pregunta abierta 3** —`@napi-rs/canvas` en Vercel— tal como lo dejó
      `design.md > 9`: **desconocido**, con destinatario QC-111. Se pega la salida real de `./init.sh`
      completo.
      **Hecho:** gate completo en verde, ningún archivo rojo fuera de `tests/baseline-rojos.json`.

## Mapa requisito → task (para que ninguno se quede sin dueño)

| R | Task que lo cubre |
|---|---|
| R1, R2, R3, R4, R5 | T1 |
| R6, R7 | T5 |
| R8, R9 | T3 (esquema), T5 (rechazo sin firmar nada) |
| R10 | T5 (caducidad), T2 (constante única) |
| R11 | T7 |
| R12 | T2 (comparación de prefijo), T5 (rutas del actor) |
| R13, R14, R15 | T5, y T11 para el «cero archivos en `db/**`» |
| R16 | T3, T9 |
| R17 | T2, T6 |
| R18 | T2 (la constante y su docblock: el código **no** lo hace cumplir) — límite de entorno, `design.md > 6.3` |
| R19 | T6 |
| R20 | T2 |
| R21 | T4, T6 |
| R22 | T6 (dominio), T8 (PNG a 150 DPI de verdad) |
| R23 | T6 |
| R24 | T0, T8 |
| R25 | T6, T8 |
| R26 | T7 |
| R27 | T1, T12 |
| R28 | T4, T10, T12 |
| R29 | T9, T11 |
| R30 | T11 |
| R31 | T7, T10, y el hecho de que **ningún** test de T5/T6 use red |
| R32 | T7 |
| R33 | T1, T11 |
| R34 | T11, T13 (la nota del E2E diferido) |

**R18 no tiene test que lo demuestre contra el bucket, y se dice en vez de disimularlo**: el límite
lo hace cumplir el servicio de Storage y **no hay ni un script ni una migración que cree buckets en
este repositorio** (pregunta abierta 1). Lo que la suite sí verifica es que el valor viva en una sola
constante y que el código **no** intente aplicarlo por su cuenta.
