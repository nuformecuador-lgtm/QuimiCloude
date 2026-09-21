# QC-107 — componente-de-carga-de-archivos · bitácora de implementación

> Fase F2. Escrita por el `implementer`, que coordinó a `frontend_dev` (T1–T11) y a `backend_dev`
> (T13–T14). **T12 y T15 quedan abiertas, y T17 es del leader.** Nada aquí se autoaprueba:
> decide el reviewer.

## Estado de las tasks

| Task | Estado | Quién |
| --- | --- | --- |
| T1–T8 — componente, subida, filas, sondeo y sus tests | cerradas | `frontend_dev` |
| T9 — montaje en proveedores | cerrada | `frontend_dev` |
| T10–T11 — asertos por ausencia y multiplataforma | cerradas | `frontend_dev` |
| T12 — montaje en fórmulas | **BLOQUEADA**, no se toca | — |
| T13–T14 — dobles del E2E y su guardia | cerradas | `backend_dev` |
| T15 — el E2E navegable | **ABIERTA**, parada por un hueco de `design.md > 8` | — |
| T16 — esta bitácora | cerrada | `implementer` |
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
| R20 | **PARCIAL** — `composition/documentos-facade.test.ts` y `tests/guards/guard-dobles-e2e.test.ts` | `sin la variable de entorno, la composicion elige los adaptadores reales (R20)` · `con la variable, la composicion elige los dobles (R20)` · los cinco casos de la guardia. **Falta el recorrido navegable de T15.** |
| R21 | `documentos-ui/document-upload-a11y-tactil.test.tsx` | `la subida se puede activar sin hover y con objetivos tactiles de 44px (R21)` · `ninguna parte del componente mide la pantalla con 100vh (R21)` |
| R22 | `documentos-ui/document-upload-convenciones.test.ts` | `el tope y los tipos se importan del contrato del modulo y no se reescriben (R22)` |
| R23 | `documentos-ui/document-upload-errors.test.tsx` y `documentos-ui/use-batch-status.test.tsx` | `una tanda desconocida detiene el sondeo (R23)` (uno en el componente, otro en el hook) · `el mensaje de tanda desconocida no distingue si no existe o es de otra empresa (R23)` |

**R18, dicho entero.** Su montaje está bloqueado por la pregunta abierta 1 —subir exige
`proveedores.modificar`, y quien trabaja recetas necesitaría ese permiso ajeno—. Hoy lo cubre el
caso **en negativo**, y se comprobó que **muerde** por sus dos vías: montar el componente en la
pantalla de fórmulas lo pone rojo, y añadir un permiso al catálogo cerrado también. No se inventó
ningún permiso, no se prestó el de proveedores y no se tocó la pantalla de fórmulas.

**R20, dicho entero.** La mitad de la composición está cubierta y verificada; el recorrido
navegable **no existe todavía** porque T15 está parada. **R20 no está cerrado.**

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

2. **T15 / R20 — el E2E. Parada, y pide decisión humana.** El motivo es un hueco de
   `design.md > 8`: dobla tres puertos —almacenamiento, cola e IA— pero el recorrido de `catalogo`
   pasa además por `readStrategyPromptFromEnv('catalogo')`, que **lanza** si falta su variable
   (`lib/modules/documentos/adapters/driven/config/strategy-prompt-env.ts`, verificado contra el
   código: «sin texto por defecto, de repuesto ni heredado de la otra estrategia»). Con el diseño
   tal como está escrito, los tres archivos del E2E acabarían en `error` y nunca en «listo», que es
   exactamente lo que R20 exige ver cambiar. **No se improvisó ninguna salida.** Opciones visibles,
   sin elegir ninguna: añadir esa variable a `webServer.env` junto a la que ya está ahí; doblar
   también el puerto del prompt como un cuarto adaptador; o enmendar `design.md > 8`.

3. **T17 — el gate completo y el PR.** Son del leader. No se abrió ningún PR.

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
