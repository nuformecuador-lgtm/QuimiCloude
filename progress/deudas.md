# Deudas y cosas abiertas del proyecto

> Se consulta por grep, no se lee entera al arrancar. Una deuda por bloque.
> Depurada el 2026-10-06 desde `progress/archivo/current-2026-10-06.md > Deudas y cosas abiertas`
> (texto original completo ahí, por grep). `(¿vigente?)` = no se pudo confirmar al migrar.

## Entorno local y worktrees

### D1 — `wt.sh done` desregistra antes de borrar y deja carpetas huérfanas
- **Origen:** QC-23 (2026-09-13) y repetido al menos diez veces (QC-102, QC-81, QC-106, QC-88, QC-63, QC-50, QC-91, QC-103, QC-59, QC-108, QC-127, y en octubre QC-138, QC-150, QC-160, QC-168, QC-170, QC-194, QC-211…).
- **Qué falta:** en Windows, con `node_modules` en uso, el borrado falla después de desregistrar; git ya no lo conoce y ningún `wt.sh` lo reintenta. Arreglo: borrar primero y desregistrar solo si el borrado tuvo éxito; distinguir «no registrado» de «en uso»; ofrecer barrer huérfanos bajo `.worktrees/` cuando la rama ya está integrada. Hoy no existe «quién barre por defecto».
- **Estado al migrar:** el 2026-10-06 `.worktrees/` solo contiene `arnes-v2`: las carpetas huérfanas listadas ya se barrieron. Pueden quedar ramas locales `feature/*` ya mergeadas.
- **Dueño:** ficha **QC-128** (`wt-borra-antes-de-desregistrar`, pending).

### D2 — Bases `QuimiCloude_QC*` por feature sin borrar (¿vigente?)
- **Origen:** cierres desde 2026-09-15 (26 contadas entonces).
- **Qué falta:** borrar con `pnpm run db:test clean` (o a mano) las que sobran. Anotadas como pendientes: `QC81`, `QC138`, `QC140`, `QC142`, `QC145`, `QC147`, `QC150`, `QC155`, `QC159`, `QC160`, `QC168`, `QC170`, `QC195`, `QC209`, `QC211`, `QC213` (y restaurar `.env` desde `.env.bak-QuimiCloude` en los worktrees que lo cambiaron). Además, QC-141 dejó como deuda local **sanear la base compartida `QuimiCloude`**, con script entregado al humano.
- **Dueño:** humano (Postgres local).

### D3 — Preparación de un worktree recién montado sin documentar (¿vigente?)
- **Origen:** QC-56 / QC-68 (2026-09-15/17).
- **Qué falta:** `docs/worktrees.md` no documenta `pnpm install --frozen-lockfile`, `prisma generate`, `next typegen` (sin él `pnpm typecheck` falla con `TS2304: Cannot find name 'LayoutProps'`, que parece error de código) ni la base propia. La receta buena de base vacía es la plantilla de QC-77 (`pnpm run db:test template`, `tests/helpers/test-database.ts`); la vieja (`migrar → db:seed → resolve --rolled-back → migrar`) está rota desde QC-23. La Postgres local está compartida: `db:migrate:create` pide un `reset` destructivo; **no ejecutarlo** (crear la carpeta a mano y `migrate deploy`).
- **Dueño:** `/afinar-regla`.

### D4 — Dos E2E a la vez en la máquina se pisan: puerto 3117 y misma base
- **Origen:** QC-146 / QC-147 (2026-09-22).
- **Qué falta:** `playwright.config.ts` fija `E2E_PORT = 3117` y `reuseExistingServer: false`, y los worktrees comparten base. Hasta aislar puerto y base por worktree, **una sola E2E a la vez**.
- **Dueño:** sin ficha.

### D5 — Tres sesiones en paralelo saturan la máquina y el gate deja de informar
- **Origen:** QC-103 (2026-09-17).
- **Qué falta:** dos corridas del gate sobre el mismo código dieron rojos distintos (41 procesos `node`, ~15 `chrome.exe`). `docs/verification.md > Los flakes de saturación` describe la firma, pero **nada coordina** los gates entre sesiones (turno, aviso, serializar). Sin investigar: si esos `chrome.exe` son navegadores de Playwright sin cerrar (fuga).
- **Dueño:** `/afinar-regla`.

## Gate, baseline y guardias

### D6 — Flakes de saturación: la regla 5 no converge repitiendo
- **Origen:** QC-103, QC-110 (PR #105 abierto sin gate verde por decisión humana, 2026-09-22), QC-141.
- **Qué falta:** la suite completa tumba un archivo distinto por corrida bajo carga: `user-table.test.tsx` (27/27 aislado), `credential-setup.int.test.ts` (15/15 aislado), `product-page.test.tsx` (timeout 20 s; hoy además está en el baseline por otro caso). «Gate completo verde antes de cada PR» no se puede cumplir repitiendo. **No meter flakes en el baseline** (apaga sus casos sanos). Si un flake se repite: subir `testTimeout` del archivo o aligerar su setup.
- **Dueño:** fichas **QC-126** (`flake-tabla-de-usuarios-navegacion-jsdom`) y **QC-143** (`flake-credential-setup-bajo-carga`), pending.

### D7 — El baseline de rojos va por archivo, no por caso
- **Origen:** QC-194 (2026-10-04).
- **Qué falta:** un rojo nuevo en `tests/unit/recetas/scope.test.ts` quedó escondido porque el archivo ya estaba en `tests/baseline-rojos.json` por otro caso. Mientras sea por archivo, una rama puede romper un caso nuevo de un archivo listado sin que el gate lo vea.
- **Dueño:** `/afinar-regla` (baseline por caso).

### D8 — Guardias de alcance escritas como absolutos muerden a quien viene detrás
- **Origen:** QC-111 (2026-09-18), QC-106, QC-92, QC-33.
- **Qué falta:** guardias de fichas cerradas que afirman «el repo no tiene X» (o comparan `package.json` entero / un número a mano contra `origin/dev`) se rompen con cambios aprobados: `qc75-convenciones`, `unidades-convenciones`, `pedidos-convenciones` (ningún Route Handler en `app/`), `identity-schema`, `guard-identificador-de-request` (`DEPENDENCIAS_ESPERADAS`), `recetas/scope` (barría `tests/` entero por el texto `@supabase/storage-js`). Y las guardias de rango (`origin/dev...HEAD`, `merge-base`) fallan sobre `dev`, donde el rango está vacío. Por decidir: comparar contra el merge-base de la propia rama, congelar las guardias de fichas cerradas, saltar ruidosamente cuando el rango no existe, y quién paga la reescritura.
- **Dueño:** ficha **QC-99** (`guardias-censo-rompen-features-posteriores`, pending).

### D9 — Guardia ciega con CRLF en los `module-contract` de `tests/unit/`
- **Origen:** QC-111 (2026-09-19).
- **Qué falta:** `leerFuente` (p. ej. `tests/unit/pedidos/module-contract.test.ts:96`) despoja comentarios con `/\/\/.*$/` sin normalizar `\r\n` antes; con una copia de trabajo en CRLF el comentario sobrevive y la guardia lo lee como código. Lo mismo que se hizo con las cinco de `tests/guards/` (`progress/fix-guardias-crlf.md`): normalizar `\r\n?` a `\n` como primer paso, con test de regresión. Solo la protege hoy `.gitattributes eol=lf`. Comprobado vigente el 2026-10-06.
- **Dueño:** sin ficha; cabe junto a QC-134.

### D10 — R2 de QC-129 quedó sin guardia (la fachada de documentos afirmaba sobre el entorno)
- **Origen:** QC-111 / QC-127 (2026-09-19).
- **Qué falta:** `tests/unit/composition/documentos-facade.test.ts` afirmaba `toBeUndefined()` sobre `CATALOG_PROMPT`/`FORMULA_PROMPT`/Gemini, inalcanzable porque Vitest recarga `.env` (que `.env.example` manda declarar). **Retirado el 2026-09-21 por decisión humana**: el rojo murió, pero **R2 de QC-129 («construir la fachada no lee las variables de Gemini») queda sin guardia**. Salida limpia: controlar el entorno dentro del caso (`vi.stubEnv` o borrar y restaurar en `afterEach`, como `strategy-prompt-env.test.ts`). **No** meter el archivo en el baseline.
- **Dueño:** ficha **QC-134** (`fachada-documentos-afirma-sobre-el-entorno`, pending).

### D11 — `./init.sh --rapido` no ve censos que viven en `tests/unit/` ni cambios `.prisma`/`.sql`
- **Origen:** QC-92 (2026-09-18).
- **Qué falta:** `scripts/test-rapido.mjs` filtra el diff a `.ts|.tsx|.js|.jsx|.mjs|.cjs` (comprobado vigente el 2026-10-06), los censos que leen archivos como texto no entran por grafo de imports, y solo `tests/guards/` se corre siempre. `inventario-schema.test.ts` estuvo rojo tres tandas con `--rapido` verde. El gate completo sí lo caza.
- **Dueño:** `/afinar-regla` (o mover esos censos a `tests/guards/`).

### D12 — Los censos que muerden por el diff no están inventariados
- **Origen:** QC-68 (2026-09-17).
- **Qué falta:** tests que afirman sobre `git diff --name-only origin/dev...HEAD` (p. ej. `recipe-route-contract`, `guard-identificador-de-request`) solo saltan después de commitear. Nadie mantiene la lista: un censo de censos, o que `--rapido` los corra siempre como las guardias.
- **Dueño:** `/afinar-regla`.

### D13 — El validador de `feature_list.json` ciega el gate entero (¿vigente?)
- **Origen:** QC-106 (2026-09-16).
- **Qué falta:** `init.sh` aborta con exit 1 si el validador falla, antes de typecheck, lint y tests: una regla de proceso incumplida apaga la verificación técnica. Debería gritar y dejar correr el resto. (`scripts/validate-features.mjs` está en cambio en esta misma rama v2.)
- **Dueño:** `/afinar-regla` / arnés v2.

### D14 — El mensaje del cupo da el total global, no el conteo por zona
- **Origen:** QC-23 (2026-09-13).
- **Qué falta:** `validate-features.mjs` imprime `regla de cupo por zona respetada (in_progress=N)` con N global; tranquiliza sin permitir comprobar el reparto por zona. Arreglo de una línea.
- **Dueño:** `/afinar-regla` / arnés v2.

### D15 — El gate completo no corre el E2E
- **Origen:** anotado en `docs/verification.md` e `init.sh:45-47`; reverificado en QC-91 (2026-09-17).
- **Qué falta:** «gate completo verde» no incluye los recorridos críticos; los E2E se corren a mano (`CHECKPOINTS.md` los exige para movimientos de inventario).
- **Dueño:** `docs/verification.md`.

## E2E y tests

### D16 — E2E de `dev` con rojos que no son de ninguna ficha (¿vigente?)
- **Origen:** QC-146 (2026-09-22) y QC-195 (2026-10-04).
- **Qué falta:** el 2026-09-22, sobre `origin/dev` (`bc902800`), chromium, un worker, fallaban 11: `cierre-de-sesiones`, `documentos` R20, `errores` R33, `inventario` R26 y QC-90 R32, `permisos` (Operador aterriza en asignación), `presentaciones` R36, `proveedores` R51, `session` (dos casos), `usuarios` R4/R42. El 2026-10-04, tres más de `dev` (`527a9902` movió las acciones al menú de 3 puntos): `pedidos-busqueda`, `pedidos-responsables`, `pedidos-terminados`. Hace falta ficha en el board.
- **Dueño:** sin ficha.

### D17 — Los E2E crean presentaciones sin unidad desde QC-80 (¿vigente?)
- **Origen:** QC-93 / QC-56 (2026-09-15).
- **Qué falta:** `choosePresentation` de `e2e/proveedores.spec.ts` (y el mismo patrón en `e2e/inventario.spec.ts`) rellena solo el nombre; la unidad es obligatoria desde `af96771`, el panel no se cierra y R51 de proveedores queda rojo en los dos motores. Probablemente es uno de los rojos de D16.
- **Dueño:** sin ficha.

### D18 — Posible fallo latente en `e2e/aislamiento-inventario.spec.ts`
- **Origen:** QC-60 (2026-09-16).
- **Qué falta:** cambiar el id del recurso solo por DOM no llega al servidor (el diálogo lo restaura antes del envío), así que el test puede afirmar un rechazo que nunca se intentó. En pedidos se arregló reponiendo el id justo antes de enviar. Comprobarlo haciendo fallar el test a propósito.
- **Dueño:** sin ficha (era de QC-49, `done`).

### D19 — Un E2E de inventario acabó una vez en la pantalla de login
- **Origen:** QC-121 (2026-09-19).
- **Qué falta:** no reproducido. Si vuelve: capturar con `--trace on` y mirar si la navegación terminó en `/login`. El reviewer de QC-121 lo aceptó con la condición de anotarlo aquí.
- **Dueño:** vigilar.

### D20 — Reconocimiento de duplicados por nombre de índice en otros adaptadores
- **Origen:** QC-60 (2026-09-16).
- **Qué falta:** con `INSERT` crudo Prisma devuelve el `23505` como `P2010` sin el nombre del índice; QC-60 lo corrigió por SQLSTATE. Barrer el resto de adaptadores; lo primero, `lib/modules/inventario/adapters/driven/persistence/presentation-prisma.ts:123` (al menos el comentario dice que reconoce por nombre de índice).
- **Dueño:** sin ficha.

## Producto

### D21 — El catálogo del panel de responsables se queda en 25 personas
- **Origen:** QC-102 (2026-09-13).
- **Qué falta:** el catálogo se pide con `pageSize: MAX_PAGE_SIZE` (25) y el buscador filtra lo ya traído: en empresas con más de 25 personas no todas son asignables. Patrón a copiar: `recipe-picker` de QC-35 (busca en servidor). **La ficha no se ha creado: espera decisión humana.**
- **Dueño:** humano (decidir ficha).

### D22 — Conexiones extra al pool dentro de una transacción (QC-195, m7)
- **Origen:** review de QC-195 (2026-10-04).
- **Qué falta:** las lecturas de costo de «Reparto y unidad» y de Terminar piden conexiones extra al pool mientras la transacción tiene la suya. Sin acción; vigilar si el pool se agota con carga.
- **Dueño:** vigilar.

### D23 — QC-180 no está en `feature_list.json` (¿vigente?)
- **Origen:** cierre de QC-174 (2026-10-02).
- **Qué falta:** QC-174 dejó abierta QC-180 (tres rojos de `897a4f91` en el baseline), pero la key no aparece en `feature_list.json` el 2026-10-06. Comprobar en el board e importarla.
- **Dueño:** leader (F0).

## Pendientes humanos de fichas cerradas
Rescatados de *Evaluaciones* y *Features en curso* del archivo: no estaban en *Deudas*, pero se habrían perdido al congelarlo.

### D24 — Verificación en dispositivo real pendiente (¿vigente?)
- **Origen:** QC-140 (T14, revisión en iPhone y Android reales, 2026-09-24) y QC-158 (R37 en móvil real, 2026-09-24).
- **Qué falta:** la pasada del humano en dispositivo. (QC-114 es la ficha propia de la tabla compartida en iPhone.)
- **Dueño:** humano.

### D25 — Prompts y bucket pendientes de desplegar (¿vigente?)
- **Origen:** QC-171 (T8, 2026-10-01) y QC-211 (T15, 2026-10-05/06).
- **Qué falta:** QC-171: poner el bucket de recortes en público antes de desplegar. QC-211: cargar el añadido de `design.md > 6.2` en `FORMULA_PROMPT`, local y Vercel.
- **Dueño:** humano.

### D26 — QC-209: re-medir la importación de 2.000 filas contra el pooler (¿vigente?)
- **Origen:** cierre de QC-209 (2026-10-06, PR #151).
- **Qué falta:** la medición contra el pooler de Supabase.
- **Dueño:** humano.

### D27 — Tests de integración de grupos sin correr por falta de `SEED_MAESTRO_*` en `.env` (¿vigente?)
- **Origen:** columna «Miembros» de grupos, cambio ad hoc del 2026-10-02.
- **Qué falta:** `work-group-crud.int.test.ts` y `work-group-membership.int.test.ts` no corrieron contra Postgres real porque la base local no tenía `SEED_MAESTRO_USERNAME/PASSWORD/EMAIL` (solo confirmadas en Vercel, condición del PR de QC-161).
- **Dueño:** humano (`.env` local).

### D28 — Clave React repetida en `step-reader.tsx` (¿vigente?)
- **Origen:** visto en QC-141 (2026-09-23), viene de `e195b3b7`.
- **Qué falta:** `components/shared/step-reader/step-reader.tsx:275-277` (líneas de entonces). Comprobar y arreglar.
- **Dueño:** sin ficha.

## Arnés

### D29 — Columnas del board distintas de las de `docs/jira.md`
- **Origen:** F0 del 2026-09-18.
- **Qué falta:** `docs/jira.md` documenta Backlog / Spec en revisión / En curso / Hecho / Cancelado; el board real responde Por hacer / En curso / En revisión / Finalizado / Cancelado (transiciones 11/21/31/41/2). Un importador que compare por nombre marca todo divergente. Comprobado vigente en el doc el 2026-10-06.
- **Dueño:** `/afinar-regla` (arnés v2 §5).

### D30 — Mínimo iOS 16+ sin escribir en la regla multiplataforma
- **Origen:** acotación de QC-114 (2026-09-18).
- **Qué falta:** escribirlo en `docs/architecture.md > Regla: multiplataforma` (no aparece el 2026-10-06).
- **Dueño:** `/afinar-regla`.

### D31 — ¿Modelo más barato para el trabajo mecánico?
- **Origen:** QC-106 (2026-09-16).
- **Qué falta:** decidir si los trabajos mecánicos deben ir por defecto en un modelo más barato (QC-106 gastó más de un millón de tokens de Opus). Hoy los siete agentes heredan el de la sesión (`AGENTS.md > Modelos`, arnés v2); un override puntual se anota en `progress/features/<key>.md > Modelos`. Medir antes: rondas de review por feature.
- **Dueño:** humano (decisión), vía `/afinar-regla`.

### D32 — Divergencia entre la copia del arnés y la plantilla (¿vigente?)
- **Origen:** `/afinar-regla` sobre comentarios (2026-09-17).
- **Qué falta:** `harnessConfig/` (entonces en la raíz) iba por delante: `docs/orquestacion.md`, la regla «si un subagente falla, el leader NO hace su trabajo», soporte de opencode. Solo se portó la sección de comentarios. Nada avisa de la divergencia. `harnessConfig/` ya no está en la raíz el 2026-10-06; el arnés v2 (con `harness_config/` aparte) debería absorberlo.
- **Dueño:** arnés v2.

### D33 — `catalog-line.int.test.ts` R32 en rojo en `dev`
- **Origen:** primer `./init.sh --completo` del arnés v2 (2026-10-06), sobre `origin/dev` 1a1db86e.
- **Qué falta:** el caso R32 espera `PrismaClientKnownRequestError` y recibe `ValidationError`. O el test se adapta a la validación previa, o la validación sobra. Entró al baseline con motivo; al arreglarlo, se borra la entrada.
- **Dueño:** sin asignar. Llegó con los merges de QC-209/QC-213, sin CI que lo viera.

### D34 — `credential-setup.int.test.ts` R11 intermitente en CI (resuelta)
- **Origen:** primeras corridas de `gate-completo` en GitHub Actions (2026-10-06/07). Falló en 2 de 5.
- **Qué falta:** en el runner de 2 vCPU las dos emisiones concurrentes a veces no llegan a encolarse tras el bloqueo (`waitForLockWaiters`). Alargar la espera no lo arregla (con 20 s choca con el `testTimeout`): hay que entender por qué no se encolan (pool de conexiones, orden de arranque, `pg_stat_activity`) y hacer el test determinista. Mientras tanto está en `tests/baseline-rojos.json`; al arreglarlo, se borra la entrada.
- **Estado:** resuelta el 2026-10-07 en `chore/ci-velocidad-y-d34`. Causa: orden de arranque —las emisiones se lanzaban sin esperar a que el `FOR UPDATE` del bloqueo estuviera tomado; si una llegaba antes, ganaba sin esperar y no quedaba nada encolado—. Ahora se lanzan solo con el bloqueo tomado (y se afirma que atrapó 1 fila). Entrada borrada del baseline. Detalle: `progress/fix-d34-credential-setup.md`.
- **Dueño:** sin asignar.
