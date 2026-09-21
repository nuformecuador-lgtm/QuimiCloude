# QC-107 — componente-de-carga-de-archivos · bitácora de implementación

> Fase F2. Escrita por el `implementer`, que coordinó a `frontend_dev` (T1–T11) y a `backend_dev`
> (T13–T14). **T12 sigue bloqueada; T15 está escrita y completa pero en ROJO por un defecto de
> producción ajeno a esta ficha; T17 es del leader.** Nada aquí se autoaprueba:
> decide el reviewer.

## Estado de las tasks

| Task | Estado | Quién |
| --- | --- | --- |
| T1–T8 — componente, subida, filas, sondeo y sus tests | cerradas | `frontend_dev` |
| T9 — montaje en proveedores | cerrada | `frontend_dev` |
| T10–T11 — asertos por ausencia y multiplataforma | cerradas | `frontend_dev` |
| T12 — montaje en fórmulas | **BLOQUEADA**, no se toca | — |
| T13–T14 — dobles del E2E y su guardia | cerradas | `backend_dev` |
| T15 — el E2E navegable | **escrita y completa**, pero **en rojo**: ver el hallazgo | `frontend_dev` |
| T16 — esta bitácora | cerrada | `implementer` |
| T18 — R23, la tanda desconocida | cerrada | `frontend_dev` |
| T17 — gate completo antes del PR | **sin marcar**, es del leader | — |

## Archivos creados

Producción — el componente:

- `components/shared/document-upload/index.ts`
- `components/shared/document-upload/document-upload.tsx`
- `components/shared/document-upload/document-upload-row.tsx`
- `components/shared/document-upload/use-batch-status.ts`
- `components/shared/document-upload/upload-file.ts`
- `components/shared/document-upload/labels.ts`

Producción — los dobles del recorrido E2E y su bifurcación:

- `lib/modules/documentos/adapters/driven/storage/document-storage-memory.ts`
- `lib/modules/documentos/adapters/driven/queue/processing-queue-inline.ts`
- `lib/modules/documentos/adapters/driven/ai/ai-reader-canned.ts`
- `lib/modules/documentos/adapters/driven/config/e2e-doubles-env.ts`

Tests:

- `tests/unit/documentos-ui/` — `helpers.ts`, `document-upload-strategy.test.tsx`,
  `document-upload-selection.test.tsx`, `document-upload-flow.test.tsx`,
  `document-upload-rows.test.tsx`, `document-upload-errors.test.tsx`,
  `use-batch-status.test.tsx`, `supplier-detail-upload.test.tsx`,
  `document-upload-convenciones.test.ts`, `document-upload-a11y-tactil.test.tsx`
- `tests/guards/guard-dobles-e2e.test.ts`

## Archivos modificados

- `app/(private)/proveedores/[id]/page.tsx` — dos líneas: el import y el montaje en modo catálogo
  debajo del catálogo del proveedor. **Ningún corte de permiso nuevo.**
- `lib/composition/index.ts` — la bifurcación por entorno de los tres puertos, consultada **en cada
  llamada**. `runDocumentJob` sale a un `const` para que la cola en línea lo reciba por parámetro:
  sin eso, un adaptador driven tendría que importar la composición, que es la flecha prohibida. El
  censo cerrado de claves de la fachada **no cambia**.
- `.env.example` — la variable de los dobles, vacía y documentada.
- `playwright.config.ts` — sólo `webServer.env`.
- `tests/unit/composition/documentos-facade.test.ts` — dos casos nuevos de la bifurcación.
- `tests/unit/documentos/limits-and-path.test.ts` — un `10` literal que el doble introdujo y que
  esa guardia prohíbe repetir fuera de `limits.ts`.
- Tres archivos de `tests/unit/proveedores-ui/` — **sólo** los dos `vi.mock` de las acciones de
  `documentos`, que la página arrastra desde T9. Ningún aserto cambió de exigencia.

## Mapa `R<n> → test`

Todos los caminos son relativos a `tests/unit/`, salvo la guardia.

| Req | Test | Caso |
| --- | --- | --- |
| R1 | `documentos-ui/document-upload-selection.test.tsx` | `la seleccion admite hasta el tope de archivos que publica el modulo (R1)` · `una seleccion por encima del tope se rechaza entera y no llama a ninguna accion (R1)` |
| R2 | `documentos-ui/document-upload-selection.test.tsx` | `la seleccion se restringe a PDF (R2)` |
| R3 | `documentos-ui/document-upload-strategy.test.tsx` | `el componente exige la estrategia de toda la tanda por prop (R3)` |
| R4 | `documentos-ui/document-upload-flow.test.tsx` | `pide los enlaces de subida con la accion del modulo importada por su ruta exacta (R4)` |
| R5 | `documentos-ui/document-upload-flow.test.tsx` | `los bytes del PDF viajan al enlace firmado y no a ninguna Server Action (R5)` |
| R6 | `documentos-ui/document-upload-flow.test.tsx` · `documentos-ui/document-upload-rows.test.tsx` | `un archivo cuya subida falla queda senalado y no se encola (R6)` · `si no sube ningun archivo no se encola nada (R6)` · `mientras el archivo sube, la fila no muestra ningun estado del modulo (R6)` |
| R7 | `documentos-ui/document-upload-flow.test.tsx` | `encola la tanda con las rutas devueltas y la estrategia de la prop (R7)` |
| R8 | `documentos-ui/use-batch-status.test.tsx` | `sondea el estado de la tanda hasta que todos los archivos terminan (R8)` · `deja de sondear en cuanto ningun archivo sigue en cola ni procesando (R8)` · `no lanza una consulta nueva mientras la anterior sigue en vuelo (R8)` · `deja de sondear al desmontarse (R8)` |
| R9 | `documentos-ui/document-upload-convenciones.test.ts` | `no anade ninguna dependencia: el sondeo se resuelve con la plataforma (R9)` |
| R10 | `documentos-ui/use-batch-status.test.tsx` | `no declara ningun plazo propio para dar por fallido un archivo (R10)` |
| R11 | `documentos-ui/document-upload-rows.test.tsx` | `la fila pinta solo los cuatro estados que publica el modulo (R11)` |
| R12 | `documentos-ui/document-upload-errors.test.tsx` | `el texto de un archivo en error se elige por su code y no por su mensaje (R12)` · `un error de la consulta detiene el sondeo y se muestra por su code (R12)` |
| R13 | `documentos-ui/document-upload-rows.test.tsx` | `un archivo listo no muestra el texto extraido (R13)` |
| R14 | `documentos-ui/document-upload-errors.test.tsx` · `documentos-ui/supplier-detail-upload.test.tsx` | `el componente no comprueba ningun permiso y muestra el error de autorizacion como cualquier otro (R14)` · `el montaje no anade ningun corte de permiso propio a la pantalla (R14, R17)` |
| R15 | `documentos-ui/document-upload-convenciones.test.ts` | `no abre ninguna suscripcion de tiempo real ni incorpora el cliente de Supabase (R15)` |
| R16 | `documentos-ui/document-upload-convenciones.test.ts` | `no emite ningun aviso ni notificacion cuando una tanda termina (R16)` |
| R17 | `documentos-ui/supplier-detail-upload.test.tsx` | `la pantalla de detalle de proveedor monta el componente en modo catalogo (R17)` |
| R18 | **BLOQUEADO** — cubierto **en negativo** en `documentos-ui/document-upload-convenciones.test.ts` | `ninguna pantalla de formulas monta el componente y no aparece ningun permiso nuevo (R18)` |
| R19 | `documentos-ui/document-upload-convenciones.test.ts` | `no anade ninguna ruta, constante de ruta ni item de menu propios de documentos (R19)` |
| R20 | `composition/documentos-facade.test.ts`, `tests/guards/guard-dobles-e2e.test.ts` y **`e2e/documentos.spec.ts`** | `sin la variable de entorno, la composicion elige los adaptadores reales (R20)` · `con la variable, la composicion elige los dobles (R20)` · los cinco casos de la guardia · `sube tres PDFs y ve cambiar el estado de cada uno hasta terminar (R20)`. **El caso E2E existe y recorre todo, pero termina en ROJO** por el defecto de producción del final. |
| R21 | `documentos-ui/document-upload-a11y-tactil.test.tsx` | `la subida se puede activar sin hover y con objetivos tactiles de 44px (R21)` · `ninguna parte del componente mide la pantalla con 100vh (R21)` |
| R22 | `documentos-ui/document-upload-convenciones.test.ts` | `el tope y los tipos se importan del contrato del modulo y no se reescriben (R22)` |
| R23 | `documentos-ui/document-upload-errors.test.tsx` y `documentos-ui/use-batch-status.test.tsx` | `una tanda desconocida detiene el sondeo (R23)` (uno en el componente, otro en el hook) · `el mensaje de tanda desconocida no distingue si no existe o es de otra empresa (R23)` |

**R18, dicho entero.** Su montaje está bloqueado por la pregunta abierta 1 —subir exige
`proveedores.modificar`, y quien trabaja recetas necesitaría ese permiso ajeno—. Hoy lo cubre el
caso **en negativo**, y se comprobó que **muerde** por sus dos vías: montar el componente en la
pantalla de fórmulas lo pone rojo, y añadir un permiso al catálogo cerrado también. No se inventó
ningún permiso, no se prestó el de proveedores y no se tocó la pantalla de fórmulas.

**R20, dicho entero.** El recorrido navegable **ya existe** y ejercita login, pantalla, selección de
tres PDFs, subida real desde el navegador al enlace firmado, encolado y sondeo vivo contra Postgres,
en Chromium y en WebKit. **Termina en rojo en su último aserto** —el estado final es `error` y no
`done`— por un defecto de producción que esta ficha no introdujo y que no le toca arreglar. **R20 no
se puede dar por cerrado hasta que ese defecto se corrija.**

## Salida real de los tests

Gate rápido sobre los 28 archivos del diff contra `origin/dev`:

```
-> pnpm run typecheck
✓ typecheck paso
-> pnpm run lint
✓ lint paso
-> pnpm run test:rapido

[test:rapido] tests relacionados con 28 archivo(s) del diff vs origin/dev

 Test Files  1 failed | 159 passed (160)
      Tests  1 failed | 2366 passed | 1 skipped (2368)
   Duration  188.18s
```

El **único** rojo, y no es de esta rama:

```
FAIL |node| tests/unit/composition/documentos-facade.test.ts
  > R22, R26, R2 de QC-129 — construir la fachada con GEMINI_API_KEY, GEMINI_MODEL,
    CATALOG_PROMPT y FORMULA_PROMPT ausentes no lanza
  AssertionError: expected 'AQ.Ab8RN6...' to be undefined
  tests/unit/composition/documentos-facade.test.ts:86
    expect(process.env.GEMINI_API_KEY).toBeUndefined();
```

**Comprobado, no supuesto.** Se volcó la versión de `origin/dev` de ese mismo archivo a un nombre
temporal y se corrió sola: **falla igual** (`Tests 1 failed | 2 passed`), con el archivo intacto y
sin una línea de esta rama. La causa es de entorno: el `.env` local de esta máquina lleva una clave
de IA real que vuelve a `process.env` después del borrado del `vi.hoisted`. Los dos casos nuevos de
la bifurcación, en ese mismo archivo, pasan.

**Ese archivo NO está en `tests/baseline-rojos.json`**, así que por la letra de
`docs/verification.md` cuenta como bloqueante. No se apaga por cuenta del implementer: queda para
el leader decidir si entra en esa lista o si se arregla.

Corridas de apoyo, verdes:

```
pnpm exec vitest --run tests/unit/documentos-ui    -> Test Files 9 passed (9) · Tests 31 passed (31)
pnpm exec vitest --run tests/unit/proveedores-ui   -> Tests 202 passed | 4 skipped (206)
```

La guardia nueva se comprobó que **muerde** por sus dos motivos, con un fixture sobre el árbol real
para cada uno: activar la variable en un archivo versionado distinto de la configuración de
Playwright, y elegir un doble sin consultarla.

## Lo que NO se cerró y por qué

1. **T12 / R18 — montaje en fórmulas.** Bloqueada por la pregunta abierta 1. No se tocó.

2. **T15 / R20 — el E2E está escrito y recorre todo, pero acaba en ROJO. No es suyo el fallo.**
   El hueco de `design.md > 8` que lo bloqueaba se resolvió por decisión del humano: `CATALOG_PROMPT`
   y `FORMULA_PROMPT` se declaran con **texto ficticio** en el `webServer.env` de
   `playwright.config.ts`, con el motivo escrito allí —la IA está doblada, así que ese texto no se
   usa jamás; sólo evita que leer el prompt lance antes de llegar al adaptador—. Se descartó doblar
   el puerto del prompt y se descartó enmendar el diseño.

   Con eso, el recorrido llega entero hasta el último aserto **en los dos navegadores**: login,
   detalle de proveedor por `supplierDetailRoute`, tres PDFs elegidos, tres filas con su nombre
   exacto, los tres `PUT` al enlace firmado interceptados, encolado real y sondeo vivo leyendo de
   Postgres. **Falla sólo el estado final**: `error` en vez de `done`.

3. **El defecto que lo tumba, y es de PRODUCCIÓN.** `countPages` entrega el `Uint8Array` a pdf.js
   sin copiarlo (`adapters/driven/pdf/pdf-converter-unpdf.ts`, `getDocumentProxy(pdf)`), y pdf.js
   **transfiere el `ArrayBuffer`**, que queda *detached* y deja el arreglo del llamante en
   `length === 0`. `domain/process-pdf-by-strategy.ts` cuenta las páginas sobre `input.bytes` y
   **después** pasa **ese mismo** arreglo a la lectura con IA, cuyo esquema exige `bytes.length > 0`
   (`domain/ai-read-input.ts`). Resultado: todo archivo acaba en `error` con `invalid_input`.

   **Verificado leyendo el código, no sólo creído**: el conteo está en la línea 116 y la lectura en
   la 122 del mismo archivo, sobre la misma variable, y ninguna de las tres funciones del adaptador
   copia antes de entregar. Reproducido además fuera de Playwright: `antes: 346 detached? false` →
   `despues de countPages: 0 detached? true`, y sobre una copia fresca las dos funciones responden
   bien.

   **Alcance: no depende de los dobles y no es cosa del E2E.** Afecta a las dos estrategias —quien
   detacha es el conteo, que es común— y en producción `runDocumentJob` descarga una vez y pasa ese
   mismo arreglo. El E2E no destapó un problema del E2E: destapó uno real, que es justo lo que un
   recorrido de extremo a extremo aporta.

   **No se arregla aquí.** Tocar `adapters/driven/pdf/` o `domain/` no lo autoriza ninguna task de
   esta ficha, que además dice explícitamente que si algo parece necesitarlo **se para y se
   pregunta**. Queda para el humano decidir quién lo corrige y en qué ficha. La salida más limpia
   —dicha, no aplicada— es que el adaptador entregue una copia a pdf.js en sus tres funciones, de
   modo que el puerto cumpla lo que el dominio ya supone: «no consumo lo que me das».

4. **T17 — el gate completo y el PR.** Son del leader. No se abrió ningún PR.

## Decisiones que conviene que el reviewer mire

- Los nombres de los casos van **sin acentos**, como el resto de `tests/` del repo; `tasks.md` los
  cita con tilde. El `R<n>`, que es lo que hace la trazabilidad, está intacto en todos.
- Un error de fila sin código de error cae en `errorMessage(UNEXPECTED_ERROR_CODE)`. El tipo lo
  permite y el spec no lo fija; se eligió eso antes que escribir un literal de mensaje a mano.
- El caso de la tanda desconocida se etiquetó `(R8)` y no encajaba limpio en ningún requisito. El
  spec se enmendó con **R23** y T18 lo reetiquetó: el caso del hook y los dos del componente citan
  ya `(R23)`. **No cambió ninguna línea de producción.**
- El disparador de selección es un `<label>` con `buttonVariants`, no un `<Button asChild>`: la
  primitiva de este repo es de Base UI y no acepta `asChild`.
- Entró un cuarto archivo no listado en T13, `adapters/driven/config/e2e-doubles-env.ts`, porque
  `lib/composition/index.ts` no lee `process.env` ni una sola vez en todo el repo y meter uno ahí
  habría roto esa convención.
