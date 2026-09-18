# QC-114 — tabla-compartida-en-iphone-real · bitácora de implementación

> **Esta feature no se puede terminar hoy, y eso es correcto.** No hay código de producción que
> escribir: es una verificación manual que ejecuta **una persona con un iPhone físico**. Las tasks
> T5 y T6 son `🧍 [SOLO HUMANO]` y quedan `[ ]`. T3, T4, T7 y T9 quedan bloqueadas por dependencias
> que no están en `docs/`, `specs/` ni el código (regla 6).

Fecha de esta tanda: 2026-09-18 · Rama `feature/QC-114-tabla-compartida-en-iphone-real`
· Worktree `.worktrees/QC-114-tabla-compartida-en-iphone-real`

## Tasks cerradas

| Task | Estado | Nota |
|---|---|---|
| T1 [AGENTE] — plantilla del registro | **[x]** | `docs/verificacion-ios/QC-114.md` creado con las nueve filas y las 27 casillas A/B/C **vacías** |
| T2 [AGENTE] — mapa de trazabilidad | **[x]** | El mapa R1–R18 está en el registro (sección «Mapa `R<n>` -> evidencia») y en este archivo |
| T3 [AGENTE] — siembra de datos | `[ ]` | **Bloqueada** por la pregunta abierta 4 |
| T4 [AGENTE] — PR con preview vivo | `[ ]` | **Bloqueada**: exige gate completo + PR, fase F2.4 |
| T5 🧍 — pasada en el iPhone | `[ ]` | **Sólo humano.** Ningún agente la ejecuta ni la marca |
| T6 🧍 — cabecera y capturas | `[ ]` | **Sólo humano.** Depende de T5 |
| T7 [AGENTE] — ficha por hallazgo | `[ ]` | Depende de T6 |
| T8 [AGENTE] — guardia de alcance sobre el diff | `[ ]` | Guardia **ejecutada** hoy (ver abajo); la task depende de T6, así que se reejecuta al cierre |
| T9 [AGENTE] — gate completo y cierre | `[ ]` | Depende de T7 y T8 |

## Archivos creados / modificados

| Archivo | Acción |
|---|---|
| `docs/verificacion-ios/QC-114.md` | **creado** — plantilla del registro de evidencia (T1) + mapa de trazabilidad (T2) |
| `specs/QC-114-tabla-compartida-en-iphone-real/tasks.md` | modificado — T1 y T2 marcadas `[x]` |
| `progress/impl_QC-114-tabla-compartida-en-iphone-real.md` | **creado** — este archivo |

No se tocó `components/shared/data-table/**`, ninguna de las nueve pantallas, `package.json`,
`tests/**` ni ningún archivo de `app/` o `lib/`. No hubo delegación en `frontend_dev` ni en
`backend_dev`: no hay UI ni backend en esta tanda, sólo documentación (R18).

## Mapa `R<n>` -> evidencia

Aquí el «test» de la regla 4 de `CLAUDE.md` es una **casilla del registro**, no un archivo de
Vitest: no hay código que ejercitar (`design.md > 6`). Todas las casillas viven en
`docs/verificacion-ios/QC-114.md`.

| Requisito | Se verifica contra | ¿Verificable hoy? |
|---|---|---|
| R1 | El registro tiene **nueve** filas y sus rutas coinciden una a una con `design.md > 2` | **Sí — cumplido** |
| R2 | Cabecera: una sola fecha y una sola URL de preview para las nueve filas | Estructura lista; valor en T6 |
| R3 | Las nueve rutas están todas en `carpetasAutorizadas`; la nota de R14 | **Sí — cumplido** (verificado contra `tests/unit/shared/data-table-alcance.test.ts` y `lib/shared/routes.ts`) |
| R4 | Campo «Preview»: URL del PR de esta rama | Campo creado; valor en T4 |
| R5 | Campos «Dispositivo» e «iOS» de la cabecera; versión >= 16 | Campos creados; valor en T6 |
| R6 | Columna «Evidencia / ficha»: toda fila «no concluyente» lleva motivo | En T5/T6 |
| R7 | Columna A: `no concluyente` con motivo si no había columna fijable | En T5 |
| R8 | Columna **A** de las nueve filas | En T5 |
| R9 | Columna **B** de las nueve filas | En T5 |
| R10 | Columna **C** de las nueve filas | En T5 |
| R11 | Las 27 casillas A/B/C rellenas; ninguna vacía ni «igual que arriba» | En T5 |
| R12 | El archivo existe, está en el diff del PR y su cabecera está completa | Archivo existe y está en el diff; cabecera en T6 |
| R13 | Toda casilla `rojo` con enlace a captura o vídeo | En T6 |
| R14 | Sección «Alcance de esta verificación»: Android sin comprobar | **Sí — cumplido** |
| R15 | Sección «Mapa `R<n>` -> evidencia» del propio registro | **Sí — cumplido** |
| R16 | Toda casilla `rojo` con clave de ficha nueva; sección «Hallazgos» | Sección creada; contenido en T7 |
| R17 | El PR se cierra con rojos registrados sin cambios de producción | En T9 |
| R18 | `git diff --name-only origin/dev...HEAD` sólo lista rutas permitidas | Guardia ejecutada hoy — **ver discrepancia abajo** |

## Guardia de alcance sobre el diff (criterio de T8, ejecutada hoy)

Salida real de `git diff --name-only origin/dev...HEAD`:

    feature_list.json
    specs/QC-114-tabla-compartida-en-iphone-real/design.md
    specs/QC-114-tabla-compartida-en-iphone-real/requirements.md
    specs/QC-114-tabla-compartida-en-iphone-real/tasks.md

más `docs/verificacion-ios/QC-114.md` y este archivo, añadidos en el commit de esta tanda.

Lo que R18 prohíbe **se cumple**: el diff no toca `components/shared/data-table/**`, ninguna de las
nueve pantallas de R1, `package.json` ni `tests/**`. No hay código de producción, ni tests nuevos,
ni dependencias nuevas.

**Discrepancia con la letra de R18**: el diff lista `feature_list.json`, que **no** está en la
lista blanca de R18. No es un cambio de esta tanda: viene del commit `da78282`
(`chore(QC-114): F2.0 — spec aprobado, in_progress`), que es el paso de proceso del arnés. **No se
corrige desde aquí**: el spec está aprobado y el implementer no lo reescribe. Queda anotado para
que el leader decida si R18 debe admitir `feature_list.json` —lo toca toda feature por proceso— o
si el bookkeeping va por otra vía.

T8 queda `[ ]` porque su dependencia declarada es T6, que no se ha ejecutado; la guardia habrá de
reejecutarse sobre el diff final.

## Verificación ejecutada

Esta tanda toca **sólo Markdown**: no hay archivos de test ni de TypeScript modificados, así que no
procede `pnpm exec vitest related --run`. Se corrieron typecheck y lint igualmente. **No se corrió
la suite completa ni el E2E**: `AGENTS.md > Regla del gate`. El gate (`./init.sh`) lo corre el
leader.

**El E2E no aplica a esta feature** y no debe añadirse: `design.md > 5` descarta de forma razonada
ampliar Playwright en WebKit de escritorio (no hay inercia táctil, el compositor promueve capas de
otra manera y jsdom no tiene layout). Un verde ahí sería un falso verde.

## Lo que queda pendiente, y por qué

1. **T3 — siembra de datos.** Bloqueada por la **pregunta abierta 4** de `requirements.md`: no se
   sabe contra qué base apunta el preview de Vercel, si `pnpm db:seed` puede correrse contra ella
   ni quién tiene ese acceso. Es un dato que sólo tiene el humano. **No se rellena con supuestos**
   (regla 6).
2. **T4 — PR con preview vivo.** Exige `./init.sh` **completo** en verde antes del PR (regla 5), y
   hoy el gate sale rojo por deuda ajena (`faltan specs para features sdd en vuelo: QC-82`, spec en
   rama sin mergear). Además el PR es la fase F2.4, que no corresponde a esta tanda. Sin PR no hay
   URL de preview, así que ese campo del registro queda en blanco.
3. **T5 — la pasada en el iPhone.** `🧍 [SOLO HUMANO]`. Requiere un iPhone **físico** con iOS >= 16
   y Safari de iOS. **Ningún agente puede ejecutarla ni darla por hecha**: jsdom no tiene layout y
   WebKit de escritorio no reproduce el `sticky` en scroll anidado con inercia táctil. Además está
   bloqueada por la **pregunta abierta 3** —con qué cuenta o cuentas se entra al preview: la
   navegación filtra por permiso y no consta una sola cuenta que vea las nueve vistas— y por T3 y
   T4.
4. **T6 — cabecera y capturas.** `🧍 [SOLO HUMANO]`, misma persona y misma pasada. Depende de T5.
5. **T7 — ficha por hallazgo.** Depende de T6: no hay veredictos que convertir en fichas.
6. **T8 — guardia de alcance.** La comprobación está hecha y documentada arriba; la task se cierra
   al reejecutarla sobre el diff final, tras T6.
7. **T9 — gate completo y cierre.** Depende de T7 y T8, y del gate en verde.

**Las 27 casillas A/B/C están vacías a propósito.** Rellenarlas sin que nadie haya observado nada
sería mentir en el registro: exactamente el agujero que esta ficha existe para tapar.
