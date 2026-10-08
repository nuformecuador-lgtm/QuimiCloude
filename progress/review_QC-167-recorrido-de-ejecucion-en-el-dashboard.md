# QC-167 — recorrido-de-ejecucion-en-el-dashboard · review (F2.2)

- **Revisado:** `git diff origin/dev...HEAD` en HEAD `20d09563`. Solo los cambios de QC-167; el
  merge de dev queda fuera.
- **Fecha:** 2026-10-08.
- **Grafo:** no se usó. Este worktree no está indexado, así que todo salió de Grep/Read y del diff.

## Verificación ejecutable (corrida por el reviewer)

| Qué | Resultado |
|---|---|
| `pnpm run typecheck` | sin errores |
| `pnpm exec eslint <los .ts/.tsx añadidos o modificados por el diff>` | exit 0, sin avisos |
| `pnpm exec vitest run guard` | `Test Files 55 passed (55)`, `Tests 741 passed \| 11 skipped (752)` |
| vitest dirigido: los 20 archivos unit/ui de la feature y los censos enmendados (lista abajo) | `19 passed \| 1 failed (20)`, `509 passed \| 1 failed (510)` |
| `.int` nuevos: `execution-log-read`, `order-catalog-including-deleted` | `Test Files 2 passed (2)`, `Tests 17 passed (17)`, en base efímera |
| CI run 37804883269 | `estatico` success; los tres shards de vitest y el e2e seguían `in_progress` al escribir esto |

- **El único rojo** es «'/pedidos' se sirve con el permiso» de
  `tests/unit/navegacion/pantallas-exigen-permiso.test.tsx`. Está en `tests/baseline-rojos.json`
  (deuda ajena, `loadFormCatalogs`) y **no es hallazgo**.
- **Archivos del vitest dirigido:**
  - asignaciones: `execution-trace`, `list-execution-traces`, `get-execution-trace`,
    `execution-trace-actions`, `execution-log-prisma`, `execution-log-repository`;
  - pedidos: `order-number-contains`, `list-summaries-including-deleted`, `module-contract`, `scope`;
  - composición: `asignaciones-facade`;
  - dashboard: `tests/unit/dashboard/*`, `dashboard-page`, `dashboard-route-contract`,
    `tests/ui/dashboard/*`;
  - identity y navegación: `session-once-per-request-actions`, `permissions`,
    `pantallas-exigen-permiso`.
- **No se corrieron** `./init.sh`, la suite completa ni el E2E: los corre CI, por decisión del
  humano.

## Checklist

### Proceso del reviewer
- [x] **1. Trazabilidad.** De R1 a R29, cada requisito mapea a tests que existen y que afirman lo
  que pide. Se abrieron los casos de R2, R3, R12, R15–R20, R23, R25, R28 y R29. R21 y R27 son
  requisitos negativos:
  - R21 lo cubre `identity/permissions.test.ts`, con igualdad exacta del catálogo y de cada rol (en
    verde). La rama no toca `identity`, `db/` ni el seed.
  - R27: el diff no toca `package.json`, `pnpm-lock.yaml`, `db/` ni `prisma/` (comprobado en el
    `--stat`), y `guard-dependencias-aprobadas` está en verde.
- [x] **2. Tasks.** Las 16 de `tasks.md` están `[x]`; ninguna queda `[ ]`.
- [x] **3. Checkpoints.** El recorrido punto por punto está más abajo.
- [x] **4. Verificación ejecutable:** la tabla de arriba.
- [x] **5. Calidad y seguridad.**
  - Sin tablas nuevas, así que no hace falta RLS nueva.
  - Sin secretos ni contexto hardcodeado; sin webhooks.
  - Capas separadas: los casos de uso están en `domain/`. La acción solo resuelve el actor, pone
    `now` y traduce el error.
- [x] **6. Multiplataforma.**
  - Controles nuevos a 44×44: interruptor, enlace de fila y «Volver» llevan `min-h-11 min-w-11`.
  - Inputs de la tabla compartida a 16 px. Sin `100vh`. Sin `hover:` como única vía.
  - «Dado de baja» y «Vuelta atrás» van como texto visible.
  - `dashboard-route-contract` vigila ahora también la sección, la tabla y el detalle.
- [x] **7. Dependencias.** Ninguna nueva. `date-fns` e `Intl.DurationFormat` se descartan con su
  motivo en `design.md > 8`.
- [x] **8. Aislamiento por empresa.**
  - Sin modelo nuevo.
  - Cada lectura nueva recibe `companyId` como primer parámetro y lo lleva en el `where`:
    - el registro, con `companyId` directo;
    - `pedidos`, con `orderCompanyScope` como primer término del `AND`;
    - `identity`, con `findRefsIncludingDeletedInCompany`.
  - El acceso cruzado tiene tests: `.int` con R23 en `execution-log-read` y en
    `order-catalog-including-deleted`, y el E2E «R18 R23».
- [x] **9. Comentarios.** Un grep de `QC-<n>`, `R<n>`, `design.md` y «decisión cerrada» sobre las
  líneas `+` de `app/` y `lib/` sale vacío. Los comentarios que dejaron de ser ciertos («vacía a
  propósito») se reescribieron sin citar fichas.

### CHECKPOINTS.md
- [x] Existe `requirements.md`, con requisitos EARS de R1 a R29.
- [x] `design.md` trae alternativas descartadas con su porqué (A1–A8).
- [x] `tasks.md`: todo marcado.
- [x] `design.md` abre con `## Lo que ya existe`, con contenido y con términos buscados. El diff no
  re-crea nada de esa lista:
  - `listAliveSummariesByIds` y `OrderSummaryOrdering` siguen intactos;
  - el mapa inverso del enum se deriva del de ida, con un test que lo exige;
  - `requirePermission`, errores, `DataTable` y `ResponsibleAvatars` se reutilizan.
- [x] Equipo: assignee y rama del candado. El tablero de `progress/features/QC-167.md` muestra
  `in_progress` y responsable.
- [x] Cada `R<n>` mapea a un test concreto.
- [x] `progress/impl_…md` tiene el mapa R→test, por tanda y consolidado.
- [x] Typecheck sin errores.
- [x] Lint sin errores.
- [ ] `gate-completo` en verde: **pendiente**, el run 37804883269 está en curso. Es condición de
  merge, no de esta review.
- [x] Flujo crítico (permisos) con E2E: `e2e/recorrido-ejecucion.spec.ts` (R28, R29, R18/R23 y la
  baja). La salida local está en la bitácora: `8 passed`, chromium y webkit.
- [x] Sin dependencias nuevas.
- [x] Sin secretos. Sin webhooks.
- [x] Nada que cambie entre entornos queda hardcodeado.
- [ ] `./init.sh` en verde: **no aplica en local** (decisión del humano: el gate es CI). Lo cubre
  `gate-completo`.
- [x] `progress/review_…md` con veredicto: este archivo.
- [ ] `progress/features/QC-167.md > Cierre` y desmontar el worktree: toca al cerrar la feature, no
  a la review.

### docs/checkpoints-proyecto.md
- [x] Typecheck y lint, los dos en verde.
- [x] E2E de Playwright.
- [x] Regla multiplataforma cumplida, sin excepción declarada.
- [x] Sin tabla nueva, así que no aplican la columna de empresa ni RLS/FORCE. Las consultas nuevas
  filtran por empresa y el rechazo cruzado tiene test.
- [x] El permiso se valida en el caso de uso, en su primera línea, con test: R19 recorre actor
  `null`, `undefined`, sin permisos, `[]` y catálogo sin `dashboard.consultar`, sin llamar a
  ningún puerto.
- [x] Datos solo por adaptadores `driven` Prisma, sin cliente de Supabase.
- [x] Sin migraciones.
- [x] Módulos hexagonales:
  - `domain/` y `ports/` importan solo `zod` y barriles (`@/lib/modules/pedidos`, `identity`);
  - de otros módulos, solo el contrato;
  - el driving pide todo a `composition`;
  - `lib/shared/routes.ts` sigue siendo hoja;
  - el `'use server'` no sale del barril;
  - `asignaciones` no consulta `orders`: lo pregunta al contrato de `pedidos` (A1 descartada).
- [x] La lógica está en `domain/`: filtros, rango UTC, duración, agrupado y 404 unificado.
- [x] Las páginas validan el permiso en servidor (`requirePagePermission`) antes de leer. Los
  componentes reciben datos por props. Sin mutaciones.

## Decisiones del implementer (juicio explícito)

1. **R3 «en curso»: ACEPTADA.**
   - R3 y D6 piden «marcado en curso» mientras el pedido está activo. Toda fila activa, sea
     `EN_CURSO`, `POR_EMPACAR` o `EN_EMPAQUE`, lleva el texto visible «(en curso)» en la duración,
     porque `open` sale si y solo si el pedido está activo. Además, `EN_CURSO` se lee «En curso» en
     el estado.
   - Es el diseño aprobado (`design.md > 4.3`). Que «open» corresponde a esos tres estados lo
     prueba `execution-trace.test.ts`, «R3: %s es open».
   - Ver menor M1: queda la ambigüedad de un dado de baja `EN_CURSO`.
2. **El detalle importa del barril del dashboard: ACEPTADA.**
   - Ninguna regla de `docs/architecture.md` lo prohíbe. La que existe prohíbe saltarse el barril
     por ruta profunda, y aquí se usa el barril.
   - Es la ruta hija de la misma feature y comparte presentación. Copiarla sería peor.
   - Promover a `components/shared/` pide «dos features», y aquí hay una sola. El design lo declaró
     como riesgo y como salida (`lib/shared/ui/`).
3. **Excepción en `pedidos/module-contract` y `scope` para `execution-trace-format.ts`: ACEPTADA,
   con menor M2.**
   - Está nombrada por archivo y fechada.
   - En `module-contract`, el archivo excluido sigue obligado a importar *solo*
     `@/lib/modules/pedidos`. En `scope`, `consumosPorDentroDelModulo` le sigue prohibiendo el
     interior del módulo.
   - Ninguna aserción previa se quita.
4. **`ExecutionTraceDetail` como nombre: ACEPTADA.** `ExecutionTrace` ya es el tipo de retorno de
   `buildExecutionTrace`, así que reutilizarlo choca. El cambio de nombre es inocuo.
5. **Pedido sin anotaciones que sale de la página pero sigue contando en `total`: ACEPTADA.**
   - Solo pasa en una carrera con la purga (QC-124) entre dos lecturas.
   - Recalcular `total` exigiría otra consulta, y una página corta de vez en cuando es inocua.
   - Está documentado en la bitácora.
6. **Valores por defecto que el spec no fija: ACEPTADOS todos.**
   - Página de 10: lo fija R5 («10 por defecto»).
   - Solo fechas `YYYY-MM-DD` reales, coherentes en parser y zod: es más estricto y nunca da error
     en la URL, porque el parser descarta.
   - Personas por nombre, con desempate por id: compatible con R7 («por su nombre mostrable»).
   - «—» con nombre accesible «Sin dato» para la persona ausente: no rompe R13.
   - Selección múltiple en la que solo vale la última: limitación del `select` compartido, que no
     se toca, y el caso de uso acepta una persona. Ver menor M3.
7. **Enmiendas de censos y guardias: ACEPTADAS.** Cada una conserva las aserciones previas y lleva
   nota fechada:
   - `asignaciones-facade`: igualdad exacta, de 18 a 20, nota 2026-10-08;
   - `guard-identificador-de-request`: alta en `E2E_ESPERADOS` con su motivo, nota 2026-10-08;
   - `guard-pantallas-exigen-permiso`: de veinte a veintiuna, «TENSADA el 2026-10-08»;
   - `guard-ambito-empresa-pedidos`: fila nueva con regex exacta del cableado;
   - `execution-log-prisma` y `execution-log-repository`: la lista exacta de operaciones crece solo
     con lecturas, y el test anti-modificación sigue intacto (notas 2026-10-07);
   - costura del dashboard: `area.children` = 1 y es la sección. El texto del área es el de la
     sección y ningún rol de contenido queda fuera de ella. Se mantienen el `h1` único y los
     landmarks. R6, R7 y R8 siguen sobre `page.tsx` y `dashboard-content.tsx`. Notas 2026-10-08.

## Hallazgos

Sin bloqueantes.

- **M1 (menor).** Un pedido dado de baja en `EN_CURSO` aparece con el estado «En curso», junto a
  «Dado de baja» y «(sin cierre anotado)».
  - Es literalmente correcto: R2 pide el estado actual, y la duración no queda abierta, como exige
    R3.
  - Pero «En curso» coincide con la marca de R3. Si el humano quiere una marca de actividad
    inequívoca, sería otra etiqueta o un distintivo aparte.
  - Además, el test de UI de R3 solo monta una fila `EN_CURSO`. No hay ninguna fila activa
    `POR_EMPACAR` que pruebe que el sufijo es la marca. Lo cubren, cada uno por su lado,
    `execution-trace-format.test.ts` y el «R3: %s es open» del dominio.
- **M2 (menor).** La excepción de `module-contract`/`scope` se podía evitar.
  `execution-trace-format.ts` puede tipar su mapa con `ExecutionTraceRow['status']` del barril de
  `asignaciones`, que ya importa. Así el dashboard no importaría `pedidos` y ninguna guardia ajena
  necesitaría excepción. No bloquea: la excepción es estrecha y está anclada.
- **M3 (menor).** El filtro de persona permite marcar varias, pero solo cuenta la última. Al
  navegar, la tabla vuelve a pintar una sola marcada, así que no hay incoherencia visible
  persistente. Aun así, la interacción sugiere una selección múltiple que no existe.
- **M4 (menor).** `design.md > 4.3` dice que el tercer mapa `OrderStatus → texto` «queda anotado
  como deuda». No aparece en `progress/deudas.md` ni en la ficha. Hay que anotarlo en
  `progress/features/QC-167.md > Cierre` (deudas que deja) o en `progress/deudas.md`.
- **M5 (menor).** El título del `describe` de `asignaciones-facade` dice «VEINTE operaciones».
  Coincide con la cuenta real, pero el texto viejo («DIECISEIS») ya estaba desfasado antes de esta
  rama. Solo se apunta.

## Veredicto

**OK.**

Condición de merge, ajena a esta review: `gate-completo` del run 37804883269 (o posterior) en verde.
