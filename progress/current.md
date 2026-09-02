# Sesión activa

> Estado vivo de lo que se está trabajando **ahora**. El leader lo mantiene al día.
> Al cerrar una feature se limpia de aquí y se resume en `history.md`.
>
> Este archivo arranca vacío: son solo los encabezados que el leader espera encontrar.
> No lo dejes crecer como bitácora — el historial completo vive en los PRs,
> en `progress/impl_*.md` / `review_*.md` y en `progress/history.md`.

## Features en curso

| key | feature | épica | zone | status | branch | quién la tiene |
|---|---|---|---|---|---|---|
| QC-20 | crud-de-productos | QC-18 Inventario | backend | **spec_ready** | `feature/QC-20-crud-de-productos` | **SPEC APROBADO por el humano el 2026-09-02** («aprobado»). Tercera sesión de leader. **F2.0 no se ejecuta**: `depends_on` incluye QC-8, que está `pending` y sin spec, y `AGENTS.md` dice que una feature con `depends_on` no arranca hasta que su dependencia esté `done`. Por eso la ficha se queda en `spec_ready` y **la tarjeta NO se mueve a *En curso***: moverla dejaría board y disco divergentes por una fase que no ha empezado (mismo criterio que se aplicó a QC-14 el 2026-09-01). Arranca cuando QC-8 cierre. Acotada, sembrada y especificada el 2026-09-02: **23 decisiones cerradas + 37 requisitos EARS**, congelados en `21d6695` (las 5 preguntas que abrió el diseño las cerró el humano tras F1.2 y entraron como D19–D23; una cambió la posición del diseño: el tope de página pasó de 100 a 25). Sin preguntas abiertas. Tarjeta en *En revisión*. Fase 2 **bloqueada por QC-8**, que está `pending` y sin spec |
| QC-19 | politica-de-contrasenas | QC-17 Identidad y acceso | backend | **in_progress (F2.1)** | `feature/QC-19-politica-de-contrasenas` | **F2.0 ejecutado el 2026-09-02**, cuarta sesión de leader: sus dos dependencias (QC-6, QC-7) están `done` y la zona `backend` quedó a **0** al cerrar QC-6, así que toma el primer slot. Tarjeta movida a *En curso*. Worktree resincronizado (`git merge dev` limpio, 29 commits detrás, ahora a 0), `.env` copiado, `pnpm install`, `prisma generate`, `next typegen` e `init.sh --rapido` en verde (65 guardias). **Dependencia instalada**: `@zxcvbn-ts/language-common` 4.1.3 en `03412f8` — la versión exacta que el leader verificó en los cuatro checks. `implementer` lanzado. **SPEC APROBADO por el humano el 2026-09-02** («aprueba 19»), y con él **la dependencia**: su fila ya está `aprobada` en `docs/dependencias.md`. Las dos preguntas abiertas que quedaban eran sobre esa librería y las cierra la aprobación: la ficha queda **sin preguntas abiertas**. Congelado en `f09e06b`. **F2.0 no se ejecuta y la tarjeta NO se mueve a *En curso***: espera a QC-6, mismo criterio que QC-14 y QC-20. Spec escrito el 2026-09-02 y congelado antes en `4fb8294`: 24 requisitos EARS, todos trazados; tarjeta en *En revisión*. **Aprobar el spec aprueba también una dependencia nueva** — `@zxcvbn-ts/language-common` (solo el diccionario, sin `@zxcvbn-ts/core`). El `spec_author` dejó los cuatro checks como DESCONOCIDO por no tener red; **los verificó el leader el 2026-09-02 y pasan los cuatro** (sin `deprecated`; 4.1.3 del 2026-07-16; 1.260.688 descargas/semana; MIT), anotados en `design.md > 5.2`. Al aprobar hay que añadir su fila a `docs/dependencias.md`. Quedan 2 preguntas abiertas, las dos sobre esa dependencia. **Solo fase 1**: la fase 2 espera a QC-6, que está `in_progress` en otra sesión. Escribir el spec ahora **no consume slot** (queda en `spec_ready`) y la deja lista para arrancar el día que QC-6 cierre. Ya venía sembrada por `/afinar-feature` el 2026-09-01 |

La feature **QC-12 — dashboard-en-blanco** se cerró el 2026-09-02 (PR #12, merge `b154fa9`):
resumen en `progress/history.md`. Ciclo completo en una sesión y **la primera feature puramente
aditiva del repo** — 9 archivos, todos `A`, sin tocar QC-11 ni QC-15. Su worktree **no se pudo
desmontar con `wt.sh done`** (el mismo fallo de Windows que quedó documentado al cerrar QC-6, esta
vez el mismo día): se desregistró pero dejó el árbol en disco, y se remató a mano con `rm -rf` +
`git worktree prune`, sabiendo que lo único sin versionar eran `node_modules`, `.env` y
`tsconfig.tsbuildinfo`. Rama local borrada.

Worktrees: `.worktrees/11-layout-privado-con-sidebar` (retenido, ver deudas) y
`.worktrees/fix-login-field-control-uncontrolled` (SAFE, desmontable). Los de QC-15 y QC-14 se
desmontaron limpios. El `.worktrees/QC-7-login-usuario-y-contrasena` lo montó la
**segunda sesión de leader** (`.env`, `pnpm install`, `prisma generate` y `next typegen`
hechos a mano). Queda además una carpeta huérfana `.worktrees/1-modelo-usuarios-y-roles/`
sin worktree registrado detrás, anotada en deudas.

La feature **QC-6 — seed-roles-y-usuario-inicial** se cerró el 2026-09-02 (PR #11, merge
`683e6ce`): resumen en `progress/history.md`, worktree desmontado y rama borrada. El
`git worktree remove` de `wt.sh done` **falló a medias en Windows** —desregistró el worktree
pero no pudo borrar `node_modules` por rutas largas de pnpm—; se cerró con `rmdir /s /q` +
`git worktree prune`. Su cierre **desbloquea a QC-19**, que estaba en `spec_ready` esperando
precisamente a esta ficha y ahora tiene el slot de `backend` libre.

La feature **QC-7 — login-usuario-y-contrasena** se cerró el 2026-09-02 (PR #9, merge
`10f9a07`): la ficha estaba todavía como `in_progress` en `feature_list.json` aunque el PR ya
estaba mergeado en `dev`; se pasa a `done` aquí. Falta desmontar su worktree y mover la
tarjeta a *Hecho* en el board.

La feature **QC-14 — modelo-producto** se cerró el 2026-09-02 (PR #10, merge
`abdef6b`): resumen en `progress/history.md`, worktree desmontado. El PR llegó en
`CONFLICTING` con `progress/current.md` chocando entero — era **fin de línea**, no contenido,
y tapaba el borrado accidental de tres deudas abiertas. Ver la lección en el historial.

La feature **QC-15 — arquitectura-hexagonal-y-modulos** se cerró el 2026-09-01 (PR #8, merge
`f79ba5d`): resumen en `progress/history.md`, worktree desmontado y rama local borrada. El
`reviewer` rechazó la guardia **dos veces** por bypass demostrado; la lección está en el
historial y en `harnessConfig/hexagonal/tests/guards/README.md`.

La feature **QC-11 — layout-privado-con-sidebar** se cerró el 2026-09-01 (PR #6, merge
`02883f8`): resumen en `progress/history.md`. Su worktree **no se pudo desmontar**, ver deudas.

La feature **QC-5 — hash-y-verificacion-de-contrasena** se cerró el 2026-09-01 (PR #7, merge
`697cca7`): resumen en `progress/history.md`, worktree desmontado. Se hizo **dos veces** —
la primera con scrypt a mano, parada en el PR por sobre-ingeniería y rehecha con bcrypt.

La feature **7 — pantalla-de-login** se cerró el 2026-08-06 (PR #2, merge `9ac5a5c`):
resumen en `progress/history.md`, worktree desmontado y rama local borrada.

**QC-7 — login-usuario-y-contrasena: la complejidad real fue `high`, no la que trae el board.**
La ficha llego **sin complejidad asignada**. Lo que se estimo como "verificar credenciales y
emitir cookie" (`medium`) paso a `high` el 2026-09-01, cuando el humano respondio la pregunta
abierta 2 con una politica concreta de bloqueo de cuenta: eso arrastro **persistencia,
migracion con su `down.sql`, un puerto y un adaptador de escritura mas, y una tanda entera de
tests** a una feature que no tenia ninguna. El bloqueo entro como **alcance anadido**, no
estaba en la description original. Se decidio dejarlo dentro de QC-7 y no sacarlo a ficha
propia (razonamiento en `specs/QC-7-.../design.md > 11`): es el mismo camino de codigo, y la
respuesta uniforme en contenido y en tiempo hay que disenarla **una vez** — retrofitear
uniformidad sobre un login ya mergeado es exactamente como se cuelan los oraculos.

## Evaluaciones

Una entrada por feature evaluada (paso F1.0 de `AGENTS.md`): qué `zone` y
`complexity` se le asignaron y por qué, y si hubo partición de una `fullstack`.

### QC-24 — modelo-recetas (acotada el 2026-09-02)

- El alcance y las **18 decisiones cerradas** viven en `specs/QC-24-modelo-recetas/requirements.md`
  — esa es la fuente, aquí solo se enlaza. Quedan **2 preguntas abiertas**, las dos caras de cerrar
  después: si hará falta historial de versiones de fórmula, y si `decimal(14,4)` basta para una
  cantidad de receta (se hereda de `cost`, que es dinero).
- **La decisión que cambia el mapa: `recetas` es un módulo hexagonal propio**, no parte de
  `inventario`. La línea de receta conoce al producto por el contrato público de `inventario`,
  nunca por su tabla. Es coherente con que la épica se separase el mismo día.
- Board actualizado **antes** de sembrar: `complexity: medium → high` (ya no son dos tablas, es un
  módulo nuevo con su cableado) y `description` ampliada con las columnas de auditoría, que
  **las crea esta ficha** y no el CRUD — a diferencia de QC-14/QC-20, donde la auditoría se decidió
  cuando el modelo ya estaba mergeado.

### Épica nueva: QC-27 — Recetas (2026-09-02, decisión humana)

- Las tres fichas de recetas (**QC-24** modelo, **QC-25** CRUD, **QC-26** pantalla) nacieron
  colgadas de **QC-18 Inventario**. El humano decidió el 2026-09-02 que **recetas es una épica
  aparte**, y se creó **QC-27 — Recetas**, con las tres reasignadas por `parent` en el board y
  `epic` / `epic_name` actualizados en `feature_list.json`.
- **Es agrupación, no dependencia** (`docs/jira.md`): la épica no cambia el orden ni el cupo de
  paralelismo. Lo que sigue mandando es `depends_on`, y QC-24 sigue bloqueada por QC-14 igual que
  antes. La frontera es la misma del módulo hexagonal: Inventario responde «qué hay y cuánto»,
  Recetas responde «cómo se compone». Comparten la entidad producto, y esa costura se cruza por el
  contrato público del módulo, nunca por su tabla (**QC-15**).
- **De paso se corrigió una divergencia:** `feature_list.json` **no tenía QC-23** («Registro de
  sesiones y cierre en todos los dispositivos», épica QC-17, bloqueada por QC-8), creada en el
  board por la sesión que acotó QC-8. Se importó completa. Sin esto, el siguiente F0 la habría
  traído de golpe y nadie sabría de dónde salió.
- **Divergencia que NO se toca**, porque es de otra sesión: **QC-8 está *En curso* en el board y
  `pending` en el disco**. La sesión que la tiene montada en `.worktrees/QC-8-sesion-actual-y-logout`
  es quien debe pasarla a `in_progress`. Anotado aquí para que no se pierda.

### Feature 1 — modelo-usuarios-y-roles

- `zone: backend`. La description es toda persistencia ("persistir", tablas,
  unicidad, borrado de rol). No hay ninguna señal de UI. Sin partición.
- `complexity: medium`. No es una tabla sola: son dos entidades, una relación
  obligatoria 1:N con restricción de borrado, un tipo cerrado para el documento y
  tres restricciones de unicidad (usuario, correo, tipo+número). Toca schema,
  migración y tests.
- `branch: feature/1-modelo-usuarios-y-roles`, worktree montado desde `origin/dev`.
- Paralelismo: primera feature de la zona `backend`, 0 `in_progress`. Sin conflicto
  de archivos que validar.
- Bloqueo de infraestructura **resuelto (2026-08-06)**: el humano añadió `.env` con
  `DATABASE_URL`. Copiado también a `.worktrees/1-modelo-usuarios-y-roles/.env`
  porque los worktrees no lo heredan (`.env*` está en `.gitignore:38`).
- Respuestas del humano que cierran preguntas abiertas del spec: teléfono y fecha de
  nacimiento **obligatorios**; correo y usuario **case-insensitive** en unicidad y
  validación; `created_at` / `updated_at` / `deleted_at` (o sea, **borrado lógico**);
  identificadores de la DB **en inglés**. Spec aprobado el 2026-08-06.


### Feature 8 — layout-privado-con-sidebar

- `zone: frontend`. La description es toda UI ("maquetación", "barra lateral",
  "enlaces de navegación", "ocultar y mostrar"). Confirmada por el humano el
  2026-08-06 junto con 7 y 9 como maquetación sin dependencia de backend.
  `depends_on: null`. Sin partición.
- `complexity: medium`. No es una pantalla: es el armazón compartido (layout de
  route group + sidebar con tres regiones + estado responsive abierto/cerrado +
  la costura de props y del disparador de logout que consume la feature 10).
  Varios archivos y estado condicional.
- `branch: feature/8-layout-privado-con-sidebar`, worktree montado desde `origin/dev`.
- Paralelismo — **cupo OK, conflicto de archivos SÍ**. La zona `frontend` tiene 1
  feature `in_progress` (la 7), o sea que hay cupo para la segunda. Pero la
  validación de conflicto (`AGENTS.md > Paralelismo`) da intersección real con lo
  que la feature 7 está tocando, según `specs/7-pantalla-de-login/tasks.md`:
  `package.json` / `pnpm-lock.yaml` (T1, T2, T3, T3b, T4), `app/globals.css`
  (T2, lo reescribe `shadcn init`), `components.json` y `lib/utils.ts` (T2), y
  `components/ui/button.tsx` (T3). Además la 7 **todavía no ha aterrizado**: en
  `origin/dev` no existen ni shadcn/ui ni Vitest ni `components/ui/`, así que la 8
  no tiene sobre qué construir.
- Decisión: se avanza la **fase 1 (spec)**, que solo escribe en
  `specs/8-layout-privado-con-sidebar/` y no intersecta con nada. La **fase 2
  (implementación) queda bloqueada** hasta que la feature 7 pase a `done` y su
  base (shadcn/ui inicializado, Vitest, `components/ui/`) esté en `dev`. El spec
  debe tratar esa base como precondición heredada, no volver a crearla.
- Costura con la feature 10 (hereda el patrón de la 7): los datos del usuario de
  sesión entran **por props** y el cerrar sesión es un **disparador vacío**. El
  spec debe congelar ese contrato para que la 10 lo sustituya sin tocar UI.
- Respuestas del humano (2026-08-06) que cierran las 10 preguntas abiertas del spec,
  y **spec aprobado** con ellas incorporadas:
  1. Navegación con soporte de **ítem simple y ítem con submenú**; 5 ítems de ejemplo
     quemados (Dashboard, Inventario, Notificaciones + 2 con submenú). Son
     **placeholder**: sus rutas no existen y las sustituye la feature de cada módulo.
  2. El pie muestra **nombre y rol**.
  3. Avatar por **iniciales**.
  4. El pie es un **menú desplegable** (`dropdown-menu` de shadcn), no un botón suelto.
  5. **Los dos mecanismos de colapso**: modo icono en escritorio **y** ocultar/mostrar
     responsive en pantallas angostas.
  6. Marca: «QuimiCloude», versión corta **«QC»** para el modo icono.
  7. `displayName` llega **ya compuesto** por quien provee la sesión. La UI no compone
     nombre y apellidos.
  8. **Sin `<Toaster />`** en la zona privada por ahora.
  9. Route group **`app/(private)/`** (decisión humana; se aparta del `(dashboard)` de
     `docs/architecture.md`, y así queda registrado para el reviewer).
  10. **E2E diferido**: no hay zona privada que visitar todavía. Ver deudas.
- Las dos preguntas que quedaron vivas tras la primera ronda también las cerró el
  humano el 2026-08-06: el estado colapsado de la barra **sí se persiste** entre
  navegaciones (cookie `sidebar_state` del primitivo de shadcn; es **preferencia de
  UI, no sesión**, y por eso no contradice que la 8 no toque sesión ni BD), y el menú
  de usuario **no lleva entrada de perfil**: sólo el cierre de sesión. Con esto el
  spec queda **sin preguntas abiertas**.

### QC-14 — modelo-producto (antes «modelo-inventario»)

- **Acotada con `/afinar-feature` el 2026-09-01.** El alcance, las 17 decisiones cerradas y
  las 4 preguntas que quedan abiertas viven en
  `specs/QC-14-modelo-producto/requirements.md` — esa es la fuente, aquí solo se enlaza.
- El board se actualizó **antes** de sembrar (`docs/jira.md > Cuando el disco descubre que el
  board está desactualizado`): QC-14 cambió `summary` a «Modelo de producto», su
  `description` entera y el label `slug:modelo-producto`. `zone`, `complexity` y `depends_on`
  no cambiaron. Se creó **QC-20 — CRUD de productos** (épica QC-18, `zone:fullstack`,
  bloqueada por QC-14) para lo que esta ficha deja fuera.
- **`feature_list.json` todavía trae la versión vieja** (`name: modelo-inventario`,
  `spec_path: specs/QC-14-modelo-inventario`, y sin QC-20). No lo edita este comando: entra
  en el siguiente **F0** del leader, que reimporta el board. Hasta entonces el `spec_path` de
  la ficha y la carpeta real del spec no coinciden — el gate no se ve afectado porque QC-14
  está en `pending`.
- Lo de abajo es la evaluación original del 2026-08-06, cuando la ficha era
  «modelo-inventario». Se conserva por trazabilidad; donde contradiga a la acotación del
  2026-09-01, **manda el `requirements.md`**.

- **Arranque de fase 1 el 2026-09-01 (esta sesión).** `zone`, `complexity`, `branch` y las
  labels de Jira ya estaban puestas; `depends_on: QC-15` está `done`, así que la dependencia
  no bloquea. `feature_list.json` ya trae la versión nueva (`modelo-producto`), o sea que la
  desincronización que anotaba el punto de arriba **ya se resolvió** en el F0 de esta sesión.
- **Paralelismo — cupo NO, conflicto de archivos NO.** La zona `backend` tiene **2**
  `in_progress` (QC-6 y QC-7), o sea el cupo lleno: por la condición (a) de `AGENTS.md > F1.0`
  la selección automática habría salteado QC-14. Se avanza igualmente la **fase 1** por
  decisión humana explícita («comienza con qc-14»), y eso **no viola la regla 1 de
  `CLAUDE.md`**: escribir el spec deja la ficha en `spec_ready`, no en `in_progress`, así que
  no consume slot. Mismo precedente que la feature 8. La **fase 2 queda bloqueada** hasta que
  QC-6 o QC-7 pase a `done`.
- Conflicto de archivos con las dos `in_progress`: **ninguno**. QC-6 y QC-7 viven en
  `lib/modules/identity/**`, `lib/composition/` y el modelo `User`; QC-14 crea el módulo
  `inventario` y dos tablas nuevas. El único archivo compartido es `db/schema.prisma` (las
  tres añaden modelos o columnas, aditivo) y la carpeta de migraciones — el mismo riesgo de
  `_prisma_migrations` que ya está anotado para QC-6, y es razón de más para que la fase 2
  espere en vez de ser una tercera cadena de migración en vuelo.
- Worktree montado desde `origin/dev` y luego **`git merge dev`**, porque la siembra de
  `/afinar-feature` (`specs/QC-14-modelo-producto/requirements.md`) vive en el commit
  `5708bc3`, que está **solo en `dev` local y sin pushear**. Sin ese merge el `spec_author`
  no habría visto ni una de las 17 decisiones cerradas. `.env` copiado a mano (deuda de
  `wt.sh new`). **`pnpm install` / `prisma generate` / `next typegen` no se corrieron**: la
  fase 1 no ejecuta nada. Van al arrancar la fase 2.

- **Spec escrito el 2026-09-01** (24 requisitos R1–R24, todos mapeados a un test en
  `tasks.md > Trazabilidad`). Tres archivos de test nuevos —
  `tests/unit/inventario/schema/inventario-schema.test.ts`,
  `tests/unit/inventario/schema/inventario-migration.test.ts` y
  `tests/integration/inventario/inventario-constraints.int.test.ts` — más R20, R21 y R24, que los
  cierran guardias **ya existentes** y cubren la migración nueva sin tocarlas. Sin dependencias
  nuevas y sin E2E. Ficha en `spec_ready`, tarjeta en *En revisión*.
- **Contradicción entre decisiones cerradas, detectada por el `spec_author` y NO resuelta por él
  (bien hecho: es del humano).** La decisión 11 pide borrado lógico con `deleted_at` en las dos
  tablas «heredado de QC-4»; la 4 exige que una presentación con productos asignados no se pueda
  borrar. Si `presentations` lleva `deleted_at`, «borrar» pasa a ser un `UPDATE` y **ninguna FK
  puede bloquear un `UPDATE`**: la garantía de la 4 se evapora en silencio. QC-4 ya vivió este
  choque y lo resolvió dejando su catálogo (`roles`) **sin** `deleted_at` — está documentado en
  `db/schema.prisma` y en `specs/4-modelo-usuarios-y-roles/design.md > 2.2`. El diseño hereda esa
  salida y la deja como pregunta abierta. Los requisitos están redactados para no depender de la
  respuesta: R14 exige el rechazo del borrado sea cual sea el mecanismo, así que ninguna de las
  dos respuestas obliga a renumerar.
- **Cinco preguntas abiertas nuevas** que deja el diseño, todas en `design.md > 9` y ninguna
  bloqueante del modelo: si `min_purchase` es `NOT NULL DEFAULT 0` o anulable con defecto (la
  decisión 8 admite las dos lecturas); si `presentations` lleva `deleted_at` (la contradicción de
  arriba); si el nombre de una presentación es único (nadie lo decidió; el diseño **no** crea el
  índice, y añadirlo después exigirá limpiar duplicados); si `delivery_time` admite negativos (la
  decisión 7 enumera cuatro columnas y no lo incluye, así que se queda sin `CHECK` y un plazo
  negativo entraría); y si un `name` vacío es un nombre (sin `CHECK` de longitud, queda como
  validación de borde en QC-20, igual que hizo QC-4).

- **SPEC APROBADO por el humano el 2026-09-01** («sigue con 14», reafirmado tras plantearle
  las preguntas). Los tres archivos quedan congelados en el commit `c2a4f43`. La tarjeta **NO**
  se mueve a *En curso* todavía: eso es F2.0 y F2.0 está bloqueado (ver abajo), así que moverla
  dejaría board y disco divergentes por una fase que no ha empezado.
- **Las cinco preguntas abiertas se cierran adoptando la posición que el `design.md` ya tomó**,
  por decisión del leader ante la reafirmación del humano. Ninguna es invención: las cinco
  siguen el precedente documentado de QC-4, así que el `implementer` arranca sin ambigüedad y
  **no hay que editar el spec** — el diseño ya las implementa.
  1. **`presentations` NO lleva `deleted_at`.** Solo `created_at` / `updated_at`. Resuelve la
     contradicción 4-vs-11 a favor de la 4, que es la que expresa una garantía de la base: con
     `deleted_at`, «borrar» sería un `UPDATE` y la FK `ON DELETE RESTRICT` no podría impedir
     nada. Es literalmente lo que QC-4 decidió para su catálogo `roles`
     (`specs/4-modelo-usuarios-y-roles/design.md > 2.2`). `products` sí lleva las tres marcas.
     **La decisión 11 queda matizada, no derogada**: el borrado lógico aplica a las tablas de
     operación, no a los catálogos.
  2. **`min_purchase` es `INTEGER NOT NULL DEFAULT 0`.** «No indicar» vale 0, y nunca hay
     `NULL`: nadie pidió distinguir «sin dato» de «cero», y esa distinción se paga en cada
     consulta futura de QC-20 en adelante.
  3. **El nombre de una presentación NO es único.** Se mantiene la ausencia de índice que toma
     el diseño, por coherencia con la decisión 6 (el nombre del producto tampoco lo es) y
     porque nadie lo pidió. **Anotado como el más caro de revertir de los cinco**: añadir el
     índice después exige limpiar duplicados primero. Si el catálogo se llena a mano, revisar
     en QC-20.
  4. **`delivery_time` se queda SIN `CHECK`.** La decisión cerrada 7 enumera cuatro columnas y
     no lo incluye; añadirle la restricción sería ampliar una decisión del humano por cuenta
     propia. **Consecuencia asumida y anotada: hoy un plazo de entrega negativo entra en la
     base.** Es una línea de migración cuando alguien lo quiera cerrar.
  5. **Sin `CHECK` de nombre no vacío.** `''` es un nombre válido en la base; la validación de
     borde vive en la capa de aplicación, que es QC-20. Mismo criterio que QC-4.
- **F2.0 BLOQUEADO, y no por criterio sino por el gate.** `scripts/validate-features.mjs` cuenta
  las `in_progress` por zona y falla a partir de tres; `backend` ya tiene QC-6 y QC-7. Pasar
  QC-14 a `in_progress` pondría `./init.sh` en rojo, o sea que la regla 1 de `CLAUDE.md` aquí es
  mecánica, no interpretable. **Lo que libera el slot** es que QC-7 cierre, o que el humano
  devuelva QC-6 a `spec_ready`: QC-6 está parada en F2.1 desde que se aprobó su spec y **su
  implementer nunca se lanzó**, así que hoy ocupa un slot por contabilidad y no por trabajo en
  vuelo. Esa decisión es del humano y no la toma el leader.
- Worktree **preparado para fase 2 por adelantado** (`pnpm install`, `prisma generate`,
  `next typegen`), que es la deuda conocida de `wt.sh new` y la que hizo fallar el typecheck de
  QC-7 con `Cannot find name 'LayoutProps'`. Así el arranque de F2.1 no gasta la primera tanda
  en montar el entorno.

### Feature 11 — modelo-inventario

- Alta de backlog del 2026-08-06 a pedido del humano, y **alcance acotado por él en la
  misma sesión**: solo modelo, presentación como tabla propia y obligatoria, y
  `alertQuantity` solo se almacena (sin acciones).
- `zone: backend`. Tras el recorte no queda ninguna señal de UI: es "persistir",
  tablas y una relación. El ítem «Inventario» del sidebar de la feature 8 sigue siendo
  placeholder — **esta feature no lo resuelve**. Sin partición.
- `complexity: medium`. Misma forma que la feature 1 aunque más chica: dos entidades,
  relación 1:N obligatoria con restricción de borrado, schema + migración + tests.
  Encaja en "2-3 capas, múltiples archivos"; `low` es una tabla sola y aquí son dos.
- `branch: feature/11-modelo-inventario`. **Worktree todavía no montado**: la feature
  sigue en `pending` y no se ha lanzado la fase 1.
- Paralelismo: la zona `backend` tiene 1 `in_progress` (la 2), o sea cupo para una
  segunda. Conflicto de archivos **sin validar todavía** — no existe
  `specs/11-modelo-inventario/tasks.md`. Ojo con el precedente de la 7: `schema.prisma`
  y la carpeta de migraciones son infraestructura compartida y la feature 2 no las toca,
  pero la 3 sí lo hará.
- `depends_on: null`. No depende de usuarios ni de sesión: es un modelo independiente.
  No se ordena detrás de las 3–6 por dependencia, solo por prioridad del humano.
- Encargos para el spec, derivados del recorte: la presentación es **tabla**, no enum de
  Prisma ni `text` — el motivo es que crezca sin migración. `alertQuantity` es una
  columna y nada más: el spec **no** debe añadir campo calculado de "bajo de existencias",
  ni trigger, ni notificación; si aparece, es alcance inventado.
- Preguntas abiertas que hereda el spec (**no las rellenes con supuestos**): tipo y
  precisión de `quantity` y `alertQuantity` (¿entero o decimal? ¿se admite negativo?),
  obligatoriedad de cada campo, unicidad de `description` y del nombre de la
  presentación, y si aplica el borrado lógico + `created_at`/`updated_at`/`deleted_at`
  que el humano fijó en la feature 1. Los identificadores de la DB van **en inglés**,
  por la misma decisión.

### Feature 15 — arquitectura-hexagonal-y-modulos

- Alta de backlog del 2026-09-01 a pedido del humano: reestructurar a arquitectura
  hexagonal y desacoplar los modulos. Nacio en el board (`QC-15`) como manda
  `docs/jira.md`; `feature_list.json` se actualizo desde ahi.
- **Alcance decidido por el humano en la misma sesion: ahora y bloqueante.** Se hace con
  poco codigo escrito (schema de identidad, stub de login, pantalla de login) y todo el
  backlog posterior nace ya sobre la estructura nueva. Las dos alternativas que se
  ofrecieron —migracion incremental conviviendo dos estructuras, o piloto solo en
  `identity`— quedaron descartadas.
- `zone: fullstack`. Toca `lib/` entero (dominio, puertos, adaptadores, composicion) y
  tambien como las rutas de `app/` consumen esa capa. **Sin partir todavia**: la particion
  de `AGENTS.md > Particion de fullstack` se decide en F1.0, y aqui hay un argumento fuerte
  para **no** partirla — media reestructuracion mergeada deja el repo con dos estructuras
  conviviendo, que es justo lo que esta feature existe para evitar. Si en F1.0 se parte,
  que sea por capas secuenciales (primero el nucleo y su guardia, luego el reencable de
  `app/`), no por frontend/backend en paralelo.
- `complexity: high`. Es multi-feature por definicion: reorganiza el codigo de las features
  4, 5 y 10, reescribe `docs/architecture.md` (que es lo que el reviewer usa para juzgar) y
  deja una guardia de dependencias nueva.
- `depends_on: [5, 11]` (issue links "is blocked by" en el board). No arranca hasta cerrar
  las dos features en vuelo: mover sus archivos a media implementacion garantiza conflicto.
- **Bloquea a 6, 7, 8, 9, 12, 13 y 14**, con sus links creados en Jira. Ninguna de esas
  arranca antes que la 15; si alguna se adelanta, se escribe sobre la estructura vieja y
  hay que migrarla despues.
- Encargos para el spec, que salen de lo ya decidido en `docs/architecture.md` y no deben
  reinventarse: el dominio no importa Prisma ni Next; el cableado puerto→adaptador vive en
  **un solo** punto de composicion; entre modulos solo se consume el contrato publicado,
  nunca repositorio, modelo de Prisma ni tabla ajena; y la migracion de lo existente es
  **sin cambio de comportamiento** — los tests que hoy pasan siguen pasando, y eso es lo que
  demuestra que la reestructuracion no rompio nada.
- **Spec escrito el 2026-09-01** (21 requisitos R1–R21, todos con test en `tasks.md >
  Trazabilidad`). Las cuatro preguntas que heredaba quedan **cerradas con su porqué**:
  1. **Raíz en `lib/modules/<modulo>/`, no un `src/` nuevo.** Un `src/` obligaría a tocar
     `tsconfig.json`, `components.json`, `vitest.config.mts`, `eslint.config.mjs` y —el
     argumento que decide— `SCANNED_DIRS` de `guard-password-never-plaintext`, que se
     quedaría **verde barriendo nada**. A cambio, `lib/` queda acotada por regla a
     `modules/`, `shared/`, `composition/` y `utils.ts`.
  2. **Un solo `db/schema.prisma`.** El multiarchivo *sí* está soportado (verificado sobre
     la instalación real, prisma 6.19.3), y aun así se descarta: no parte la propiedad,
     rompe los tests y guardias que leen el esquema por ruta fija, y las FK cruzan módulos
     igual. La frontera llega a persistencia por convención `/// @module <modulo>` más la
     regla «solo el dueño consulta sus modelos».
  3. **La guardia es un test propio en `tests/guards/`, sin dependencia nueva.**
     `import/no-restricted-paths` sólo expresa 4 de las 15 reglas, y meter
     `eslint-plugin-boundaries` abriría la puerta de dependencias con los cuatro checks de
     salud **no verificables sin red** (regla 6).
  4. **`components/` y `hooks/` quedan fuera.** Sus rutas las fija `components.json` de
     shadcn, la UI compartida no pertenece a un módulo, y la convención de componentes de
     ruta con barrel queda intacta.
- **Preguntas abiertas que deja el spec** (no bloquean la aprobación): idioma de los nombres
  de módulo (`identity` frente a `inventario` — hoy están mezclados); si un módulo puede leer
  modelos ajenos dentro de un `include` de Prisma o debe pedirlos al contrato (se eligió lo
  estricto, a revisar en QC-14); y dónde vivirán los componentes propios de un módulo cuando
  aparezca el primer caso.
- **Fuera de alcance por ser cambio de comportamiento, y bien excluido:** hoy
  `verifyCredentials` devuelve siempre `{ ok: false }` y `getSessionUser` devuelve relleno
  fijo. Se migran **tal cual**; hacerlos funcionar es QC-7 y QC-8.
- La guardia ejecutable es parte del entregable, no un extra: sin ella la regla de
  direccion de dependencias vuelve a ser una linea en un `.md` que nadie hace cumplir.
  Tiene precedente en el repo (`tests/guards/`).
- Preguntas abiertas que hereda el spec (**no las rellenes con supuestos**): donde vive la
  raiz de los modulos (`lib/modules/` frente a un `src/` nuevo, que cambia `tsconfig` y
  todos los alias); si el schema de Prisma se parte por modulo o sigue siendo uno solo
  (`db/schema.prisma` es infraestructura compartida); que herramienta hace cumplir la
  guardia (regla de ESLint tipo `import/no-restricted-paths` frente a un test propio como
  los de `tests/guards/`); y si `components/` y `hooks/` entran en la modularizacion o se
  quedan como estan.

### QC-6 — seed-roles-y-usuario-inicial (2026-09-01)

- `zone: backend`. La description es persistencia pura: "la base arranque con", roles,
  usuario ya creado, "correrse mas de una vez sin duplicar". Cero senal de UI. **Sin
  particion**: no hay nada que un `frontend_dev` pueda tocar aqui.
- `complexity: medium`, no `low`. Parece un script suelto y no lo es, por tres razones que
  ya estan en el codigo:
  1. El usuario inicial necesita **diez columnas `NOT NULL`** (`first_names`, `last_names`,
     `birth_date`, `email`, `phone`, `document_type_code`, `document_number`, `username`,
     `password_hash`, `role_id`) mas la FK a `document_types`, cuyo unico valor hoy es `CC`.
  2. La contrasena debe entrar por el puerto `PasswordHasher`
     (`lib/modules/identity/ports/password-hasher.ts`), no llamando a bcrypt directo: la
     guardia `guard-password-never-plaintext` y la direccion de dependencias de QC-15 lo
     exigen.
  3. **La idempotencia no es un `upsert`.** Las tres unicidades de `users` son indices
     **funcionales (`lower(...)`) y parciales (`WHERE deleted_at IS NULL`)** escritos a mano
     en la migracion; Prisma no los modela, asi que `prisma.user.upsert` no tiene un
     `where` unico al que agarrarse. Roles si es un `upsert` por `name`. Ver el comentario
     del modelo `User` en `db/schema.prisma`.
- `branch: feature/QC-6-seed-roles-y-usuario-inicial`, worktree montado desde `origin/dev`.
- Paralelismo: zona `backend` con **0 features `in_progress`** registradas. Sin conflicto de
  archivos que validar. Salvedad: existe un worktree de QC-7 que este leader no monto (ver
  deudas); si QC-7 esta viva, seria la segunda de la zona y habria que comprobar
  interseccion — el seed toca `db/seed.ts` y el catalogo de roles, QC-7 toca
  `verifyCredentials` y el adaptador de sesion, asi que a priori no se cruzan.
- **Acotada con `/afinar-feature` el 2026-09-01.** Las decisiones cerradas y lo que queda
  abierto viven en `specs/QC-6-seed-roles-y-usuario-inicial/requirements.md`; no se copian
  aqui. La acotacion **cambio el alcance** y por eso se reescribio la `description` en el
  issue QC-6 antes de sembrar (paso 5): la ficha ahora incluye una **migracion aditiva** para
  la marca de "debe cambiar la contrasena" y el arranque automatico del seed tras cada
  despliegue. `zone`, `complexity` y `depends_on` no cambiaron.
- Preguntas que quedaron abiertas antes de la acotacion, ya respondidas ahi (se dejan por
  trazabilidad): *cuales* son "los roles base" y con que descripcion; que datos concretos lleva el
  usuario inicial y de donde salen su usuario y contrasena (¿variables de entorno? ¿valores
  fijos? ¿obliga a cambiarla al primer login?); que rol se le asigna; si el seed tambien
  siembra `document_types` (`CC`) o eso ya lo hizo la migracion de QC-4; y que significa
  exactamente "sin romper nada" en la segunda corrida — si un rol o el usuario fueron
  editados a mano despues del primer seed, ¿se respetan o se reescriben?


### QC-19 — politica-de-contrasenas (2026-09-01, ficha creada en esta sesión)

- Nació al acotar QC-6: la política de contraseñas salió de allí como pregunta abierta y se
  creó como **issue propio** (QC-19, épica `QC-17`), porque `/afinar-feature` solo acepta
  fichas que ya existen en el board.
- `zone: backend`, `complexity: medium`. **No se parte**: la ayuda visual mientras se escribe
  se separó a su propia ficha (**QC-21**), así que aquí no queda nada de UI.
- Acotada con `/afinar-feature` el mismo día. Decisiones cerradas en
  `specs/QC-19-politica-de-contrasenas/requirements.md`. La acotación reescribió su
  `description` en el board antes de sembrar.
- **Trae una dependencia nueva sin aprobar**: la lista de contraseñas filtradas viene de una
  librería, y eso es la regla 7 de `CLAUDE.md` — cuatro checks de salud, fila en
  `docs/dependencias.md` y aprobación humana **antes** de instalar. Si ninguna librería
  convence, la decisión se reabre.
- `depends_on: QC-6, QC-7`. Bloquea a QC-21.

### QC-21 — ayuda-visual-de-contrasena (2026-09-01, ficha creada en esta sesión)

- Salió de la acotación de QC-19: mostrar los requisitos marcándose a medida que se escribe
  la contraseña. Épica `QC-17`, bloqueada por QC-19. `zone`/`complexity` **sin evaluar**.

### QC-20 — crud-de-productos (2026-09-01, ficha del humano, importada en F0)

- Apareció en el board durante esta sesión; no la creó el leader. Épica `QC-18 Inventario`,
  `zone: fullstack` (label puesta en el board), bloqueada por QC-14. `complexity` sin evaluar.
- **Al ser `fullstack` habrá que partirla** en backend + frontend cuando le toque F1.0
  (`AGENTS.md > Partición de fullstack`).
- **Acotada con `/afinar-feature` el 2026-09-02.** El alcance y las 18 decisiones cerradas
  viven en `specs/QC-20-crud-de-productos/requirements.md` — esa es la fuente, aquí solo se
  enlaza. Sin preguntas abiertas. Se partió: QC-20 se queda con `zone: backend` y
  `complexity: high`; la pantalla nació como **QC-22 — Pantalla de productos**
  (`zone: frontend`, épica QC-18, bloqueada por QC-20, `pending` en Backlog y **sin sembrar**).
  Se añadió **QC-8 como bloqueante** de QC-20: el service necesita saber quién está en sesión.
  Board actualizado **antes** de sembrar (labels, `description`, los dos links y la ficha
  nueva) y `feature_list.json` reflejado en la misma corrida.

### QC-14 — el board la reescribió (2026-09-01)

- Dejó de ser `modelo-inventario` y ahora es **`modelo-producto`**: nuevo summary, nueva
  `slug:modelo-producto` y una `description` mucho más larga y concreta. En disco se
  actualizaron `name`, `description`, `branch` y `spec_path`; no había spec que renombrar.
- **Su nueva `description` cierra de hecho la pregunta abierta 1 del dominio** («unidades de
  medida»): dice que la unidad es texto libre opcional y que **no hay conversión entre
  unidades**. Queda pendiente trasladarlo a `docs/architecture.md > Preguntas abiertas del
  dominio`, pero es de la acotación de QC-14, no de esta sesión.


### QC-7 — login-usuario-y-contrasena (2026-09-01)

> Esta entrada se escribió, **otra sesión de leader la sobrescribió**, y se rehízo. Ver
> `
### QC-24 / QC-25 / QC-26 — recetas (fichas creadas, no acotadas)

- Creadas en el board el 2026-09-02 desde `/afinar-feature`, épica **QC-18 Inventario**,
  todas `pending` en *Backlog*. **No se sembró ningún `requirements.md`**: son fichas nuevas,
  y cada una se acota con su propia corrida del comando cuando le toque.
- **QC-24 modelo-recetas** — `zone: backend`, `complexity: medium`. Bloqueada por QC-14.
  Espejo de QC-14: solo esquema y migración.
- **QC-25 crud-de-recetas** — `zone: backend`, `complexity: high`. Bloqueada por QC-24, QC-20
  y QC-8. Es `high` porque además del CRUD trae la subida de imagen a Supabase Storage.
- **QC-26 pantalla-de-recetas** — `zone: frontend`, sin `complexity` (la asigna F1.0, igual
  que QC-22). Bloqueada por QC-25.
- **Dependencia nueva sin aprobar, anotada aquí para que no aparezca a mitad del spec:**
  QC-25 necesita un cliente de Supabase (`@supabase/supabase-js` o equivalente) que **no está
  en `package.json` ni en `docs/dependencias.md`**. Entra por la regla 7 de `CLAUDE.md`:
  cuatro checks de salud, fila en `docs/dependencias.md` y aprobación humana antes de instalar.
- Decisiones que el humano ya cerró al pedir las fichas, y que su acotación hereda sin
  reabrir: cantidad de línea **decimal exacto** (nunca `float`), unidad de línea **texto libre
  obligatorio y anotativo** (coherente con la pregunta 1 del dominio, cerrada en QC-14), **un
  producto no se repite** dentro de una receta, **nombre de receta único** normalizado sin
  acentos ni mayúsculas (precedente de las presentaciones en QC-20), borrar un producto usado
  **sí se permite** y la receta conserva la línea, **solo Administrador** validado en el
  service (precedente de QC-20), `image_url` **opcional** con subida a Storage, y `steps`
  como **lista ordenada de textos** en una columna `jsonb`.
- Quedan abiertas, sin rellenar con supuestos: si una receta produce algo (rendimiento /
  producto resultante); qué pasa con el archivo en Storage al borrar la receta; y los límites
  de la imagen (tamaño, tipos, bucket público o privado). Las tres las decide la acotación de
  QC-25, salvo la primera, que es de negocio y no tiene ficha.

## Conflictos pendientes > DOS SESIONES DE LEADER`.

- `zone: backend`. La description es toda servidor: verificar credenciales, responder sin
  revelar cuál falló, emitir cookie. La pantalla ya existe (QC-10, `done`). Sin partición.
- `complexity: medium` → **`high`** tras las decisiones humanas (label actualizada en el
  issue). Requisitos: 21 → **31**.
- Worktree desde `origin/dev`, con `.env`, `pnpm install`, `prisma generate` y **`next
  typegen`**. Sin ese último, `pnpm typecheck` falla con `Cannot find name 'LayoutProps'`.
  Es la deuda de `wt.sh new`, que ya tropieza en su tercera feature.

**Decisiones humanas del 2026-09-01** (respuestas a las preguntas abiertas del spec):

1. **Sesión de 8 h, sin «recordarme».**
2. **5 intentos fallidos bloquean la cuenta, con bloqueo temporal creciente** (1/5/15/60 min
   con tope). El bloqueo permanente se descartó **porque no hay pantalla de administración**
   en el repo ni en el backlog: dejaría al usuario fuera hasta tocar la base a mano. El riesgo
   de abuso —cualquiera deja fuera a otro con 5 fallos— **se asume explícitamente**: ERP de un
   solo tenant, usuarios conocidos, sin registro público. Se ofreció límite por IP y **se
   descartó**: más trabajo del pedido y falsificable en Vercel si no se configura bien.
3. **Playwright aprobado.** Los cuatro checks se corrieron contra el registro real, no de
   memoria: v1.62.1, no deprecada, publicada el 2026-09-01, Apache-2.0, 58.4M descargas/semana.
4. **El bloqueo se queda DENTRO de QC-7**, no sale a ficha aparte: el contador se lee y escribe
   dentro de `verifyCredentials` —el mismo camino de código—, la respuesta uniforme en
   contenido y en tiempo hay que diseñarla una sola vez para los tres caminos, y partirlo
   dejaría un login mergeado **sin ningún freno** mientras QC-8 y QC-9 construyen encima.
5. **QC-7 entra primero en fase 2, antes que QC-6.** Resuelve el conflicto entre las dos
   sesiones. Razón de fondo: QC-7 añade tres columnas a `User`, que es justo lo que el seed
   tiene que rellenar; al revés, QC-6 habría que rehacerlo.

**Aprendizaje del arnés, verificado:** `guard-dependencias-aprobadas` es **bidireccional**.
Añadir la fila de un paquete sin instalarlo da rojo igual que instalarlo sin fila. Se intentó
registrar Playwright por adelantado, salió rojo y se revirtió: la fila y la instalación van en
la misma task o no van.

**Columnas nuevas en `User`:** `failed_login_attempts` (`Int @default(0)`), `lock_level`
(`Int @default(0)`) y `locked_until` (`DateTime?`), con migración reversible y el
`/// @module identity` intacto.

**Sigue abierto y no bloquea**: auditoría de accesos; si `next/headers` puede vivir en
`adapters/driven/**` —hay que anotar esa fila en `docs/architecture.md`—; y la rotación del
`SESSION_SECRET`, que hoy es uno solo y rotarlo corta todas las sesiones.

**Riesgo que hereda el implementer:** `tests/unit/identity/login-action.test.ts` afirma hoy
literalmente «mientras no hay verificación real». Cuando la haya, ese test miente. Acotado en
la task T6b, no suelto.
## Conflictos pendientes

### ~~El gate completo está ROJO en `dev` por fixtures E2E de QC-7 sin limpiar~~ → **RESUELTO** (2026-09-01)

> **Cerrado el mismo día.** Al ir a limpiar los fixtures, la base compartida ya estaba sin
> ellos: **0 usuarios y 0 roles**. No la limpió esta sesión. Se comprobó que fue un borrado
> **acotado a las filas**, no un reset: la migración `20260901220609_user_login_lockout` de
> QC-7 sigue aplicada y `document_types` conserva su `CC`, así que **el trabajo de QC-7 está
> intacto**. Verificado: `tests/integration/identity` pasa **23/23** y `./init.sh` **completo**
> sale verde en `dev` (**220/220**, sin rojos nuevos).
>
> **Los dos defectos de fondo NO están resueltos y volverán**, así que lo de abajo se conserva:
> el E2E de QC-7 sigue sin limpiar lo que siembra (cada corrida vuelve a ensuciar la base), y
> los tests de integración de QC-4 siguen afirmando que la tabla está vacía — lo que **QC-6
> romperá por definición**, porque es un seed cuyo trabajo es dejar filas.
>
> La salida estructural ya tiene precedente en el repo: **una base por worktree**, que es lo
> que se hizo con `QuimiCloude_QC14` y lo que destrabó QC-14 en dos minutos.

### El gate completo está ROJO en `dev` por fixtures E2E de QC-7 sin limpiar (2026-09-01, histórico)

Descubierto al correr `./init.sh` completo desde la sesión de QC-14. **9 tests en rojo, todos
en `tests/integration/identity/identity-constraints.int.test.ts`**, y ninguno es de QC-14: esta
feature no ha tocado una sola línea de código.

**Causa raíz, verificada contra la base real:** la base de `dev` tiene **4 usuarios y 4 roles
con prefijo `qc7_e2e_`**, creados el 2026-09-02T00:19Z. Son fixtures del E2E de Playwright que
introdujo QC-7 y que **no se limpian al terminar**. Los tests de integración de QC-4 afirman
`expect(await tx.user.count()).toBe(0)` dentro de una transacción que luego revierten — con 4
filas ajenas ya sembradas, la aserción cae. `baseline-rojos.json` está **vacío a propósito**,
así que cualquier archivo rojo es bloqueante por diseño.

**No se borró nada.** Las filas son estado en vuelo de **otra sesión de leader** que está
implementando QC-7 ahora mismo; borrarlas a media corrida podría romperle el run. La limpieza
la decide el humano. Es un `DELETE` sobre las filas con prefijo `qc7_e2e_` (primero usuarios,
luego roles, por la FK).

**Pero la causa raíz no es la suciedad: son dos defectos de diseño que se cruzan.**

1. **El E2E de QC-7 no limpia lo que siembra.** Cada corrida deja cuatro usuarios y cuatro
   roles más. Es deuda de QC-7 y debe cerrarse **dentro de QC-7**, antes de su PR — si no, su
   propio `./init.sh` completo de F2.4 saldrá rojo por su propia mano.
2. **Los tests de integración de QC-4 asumen que la tabla está vacía.** Esa suposición es
   frágil y va a volver a romperse: **QC-6 es literalmente un seed cuyo trabajo es dejar filas**
   en `users` y `roles`. En cuanto QC-6 corra, estos mismos 9 tests caen otra vez. Hay que
   cambiar la aserción de «la tabla está vacía» a «no existe la fila que acabo de intentar
   insertar», que es lo que el test de verdad quiere demostrar.

Es exactamente el choque de base compartida que esta misma sección ya anticipaba para QC-6 y
QC-7, materializado — y una razón más para que QC-14 **no** sea una tercera cadena de
migraciones en vuelo contra la misma base.


### DOS SESIONES DE LEADER EN PARALELO SOBRE EL MISMO REPO (2026-09-01) — YA HUBO PÉRDIDA

**Actualización: dejó de ser hipotético.** La entrada de evaluación de QC-7 en
`## Evaluaciones` se escribió y **desapareció**, sobrescrita por la otra sesión al reescribir
este archivo. Se rehízo a mano. `feature_list.json` sí sobrevivió, pero por suerte: las dos
sesiones hacen read-modify-write sin cerrojo y la última escritura gana.

**Mitigación decidida el 2026-09-01: QC-7 entra primero en fase 2 y QC-6 espera.** Eso
elimina el choque de archivos (`lib/composition/index.ts`, `lib/modules/identity/`), pero
**no** el de `progress/current.md` ni el de `feature_list.json`, que siguen sin protección.

**Confirmado desde la sesión de QC-6 (2026-09-01, 17:2x).** El humano aprobó el spec de QC-6
y la ficha pasó a `in_progress` (F2.0), pero **el implementer NO se lanzó**: la validación de
conflicto de `AGENTS.md > Paralelismo` da intersección con QC-7, que ya está a medio
implementar (sus tasks marcadas `[x]` hasta la creación de su migración). Archivos que se
cruzan: `db/schema.prisma` (las dos añaden columnas al modelo `User`), `db/migrations/`,
`lib/modules/identity/index.ts`, `lib/composition/index.ts` y
`tests/unit/identity/schema/identity-migration.test.ts`.

**QC-6 queda parada en F2.1 y conserva su slot** de la zona `backend`: aprobada, con worktree
montado en `f79ba5d` y spec completo. Arranca en cuanto QC-7 pase a `done`.

Lo que más pesa no son las columnas —son aditivas y con nombres distintos, se mezclan solas—
sino que **la verificación central de QC-6 es correr el seed dos veces contra una base real**,
o sea aplicar migraciones, mientras QC-7 está ejercitando `db:migrate` y `db:rollback` contra
esa misma base. Dos cadenas de migración en vuelo comparten `_prisma_migrations`, y ahí el
historial miente en silencio: es exactamente el fallo que `docs/architecture.md > Migraciones
up/down` advierte que no apunta a su causa.


Una sesión evaluó y montó **QC-6**; otra, en paralelo y sin saberlo, evaluó y montó **QC-7**
y lanzó su `spec_author`. Las dos escriben en `feature_list.json` y en este archivo. No se ha
perdido nada todavía —la evaluación de QC-7 sobrevivió y los dos worktrees están registrados—
pero eso es suerte, no diseño: el arnés no tiene cerrojo y la última escritura gana.

**La fase 1 no corre peligro**: cada `spec_author` escribe solo en su `specs/<key>/`. El
choque llega en **fase 2**, y es previsible por archivo:

| Archivo | QC-6 (seed) | QC-7 (login) |
| --- | --- | --- |
| `lib/composition/index.ts` | probable | **seguro** (cablea el puerto nuevo) |
| `lib/modules/identity/domain/**` | probable | **seguro** (`verify-credentials` deja de ser stub) |
| `lib/modules/identity/ports/**` | posible | **seguro** (puerto hacia la persistencia) |
| `db/schema.prisma` | no | no |

Las dos son `zone: backend`, así que la regla de máx. 2 se cumple **por número** — y es justo
el caso que `AGENTS.md > Validación de conflicto` dice que hay que mirar aparte: cupo OK,
conflicto de archivos SÍ. **Decisión humana pendiente**: cuál de las dos entra primero en fase
2, o si una de las dos sesiones para.

Precedente que conviene recordar: las features 1 y 7 corrieron en paralelo, ambas montaron
Vitest desde cero, y git auto-mergeó en silencio dos configuraciones incompatibles. Aquí el
riesgo es el mismo con `lib/composition/index.ts`.


Conflictos de merge ambiguos que el implementer no resolvió solo y esperan
decisión humana (paso F2.3).

### ~~Feature 7 ← `dev` — infraestructura de tests duplicada~~ → **RESUELTO** (2026-08-06)

Al hacer `git merge origin/dev` en `feature/7-pantalla-de-login`, tras el merge del PR de
la feature 1. Resuelto con decisión humana y mergeado en el PR #2; gate completo verde
(89/89 tests, las dos suites conviviendo). Se conserva aquí como registro de la causa raíz.

Las features 1 y 7 corrieron en paralelo y **las dos montaron Vitest desde cero**, cada una
sin saber de la otra. Git solo marcó conflicto en `package.json` y `pnpm-lock.yaml`; el resto
son **archivos distintos que hacen lo mismo**, que git auto-mergea en silencio y dejan el
repo con dos configuraciones peleándose:

| Pieza | `dev` (feature 1) | `feature/7` | Choque |
| --- | --- | --- | --- |
| Config de Vitest | `vitest.config.mts`, `environment: 'node'`, `passWithNoTests` | `vitest.config.ts`, `environment: 'jsdom'`, `globals`, `setupFiles`, plugin de React | **Incompatible en una sola config.** Los tests de esquema/integración necesitan `node`; los de UI necesitan `jsdom`. Además dos archivos de config es ambigüedad de resolución. |
| `test:rapido` | `tsx scripts/test-rapido.ts` | `node scripts/test-rapido.mjs` | Dos scripts, mismo trabajo. El de la 7 evita el shell **a propósito**: las rutas con paréntesis (`app/(public)`) rompen en Windows. |
| `test:guardias` | `vitest run guard` | `vitest run guard --passWithNoTests` | Menor. |

`package.json` y `pnpm-lock.yaml`: el resto es **unión** de dependencias (Prisma/pg/tsx de la
1; shadcn/sonner/zod/jsdom/Testing Library de la 7), sin ambigüedad real.

**Resolución (decisión humana, 2026-08-06):** una sola `vitest.config.mts` con dos
`projects` — `node` para esquema/integración/guardias, `jsdom` para UI — repartidos **por
convención** (`*.test.tsx` y `tests/ui/**` van a jsdom) y no por lista de archivos, para que
un test nuevo caiga solo en el proyecto correcto. Se conserva el `test:rapido` de la feature
7 por el fix de Windows. `tests/unit/smoke.test.ts` → `tests/ui/smoke.test.ts`.

**Lección para el arnés — el paralelismo entre zonas no está cubierto.** La validación de
conflicto de `AGENTS.md > Paralelismo` solo compara features de la **misma** zona. Estas dos
eran `backend` y `frontend`, así que ningún paso las comparó — y ambas necesitaban montar la
misma infraestructura transversal (el runner de tests). Git tampoco ayudó: solo marcó
conflicto en `package.json` y el lockfile; `vitest.config.mts` vs `vitest.config.ts` y
`test-rapido.ts` vs `test-rapido.mjs` son **archivos distintos** y se auto-mergean en
silencio. Si dos features de zonas distintas van a tocar infraestructura compartida
(runner, config de build, `package.json`), hay que detectarlo en F1.0 aunque las zonas
difieran.

### Guardia `guard-password-never-plaintext` vs. feature 7 → **RESUELTO** (2026-08-06)

La guardia de la feature 1 (R11) marcaba en rojo el formulario de login: 5 hallazgos, tres
falsos positivos del heurístico (`FORGOT_PASSWORD_ROUTE`, `PASSWORD_ERROR_ID`,
`passwordError`) y dos de contraseña **en tránsito** (`password` en la action y en el schema
zod). Ninguno almacenaba nada. Decisión humana: **afinar, no reducir cobertura**. Se afinó el
heurístico por forma del identificador (último segmento en `route, path, url, href, id, ids,
error, errors, message, label, placeholder, field, input`; se dejaron fuera a propósito
`name, key, type, value, data, text`, que sí pueden ser columnas reales) y se acotó una
allowlist **por ruta de archivo** a exactamente `lib/actions/login.ts` y `lib/types/auth.ts`.
Tests nuevos impiden que esa allowlist se convierta en un agujero: el mismo identificador en
`db/`, `scripts/` o cualquier otro archivo de `lib/` sigue dando rojo.

## Deudas y cosas abiertas

Lo que condiciona trabajo futuro y no tiene ficha propia todavía.

- **[QC-19 — el despliegue en un entorno nuevo falla si la `SEED_ADMIN_*` no cumple la politica]**
  Consecuencia querida de R18 y prevista en `design.md > 7.2`, pero conviene leerla aqui **antes**
  de desplegar: desde esta ficha, el seed de instalacion evalua la politica antes de hashear, asi
  que una credencial de instalacion que no cumpla **aborta el arranque** (`pnpm run build` corre
  `prisma migrate deploy && tsx scripts/seed.ts`). El fallo es ruidoso y dice que reglas incumple
  —nunca la credencial—, que es justo lo que se queria; pero quien prepare un entorno nuevo tiene
  que fijar una `SEED_ADMIN_*` de 8 a 64 caracteres, con mayuscula, minuscula, digito y simbolo, y
  que no este entre las filtradas conocidas. La del entorno local ya cumple: verificado.
- **[QC-19 — `P4ssw0rd!` pasa la politica]** No hay des-leetificacion ni recorte de sufijos: una
  variante de una contrasena filtrada cuela aunque su forma base este en la lista
  (`design.md > 4` y `> 11`). Puntuar fuerza esta fuera del alcance de la ficha; si algun dia
  hace falta, es ficha nueva, no un parche al adaptador.
- **[QC-19 — la lista de filtradas envejece y nadie la refresca]** Las 49 233 entradas vienen de
  `@zxcvbn-ts/language-common@4.1.3` y solo se actualizan cuando se actualice la dependencia. No
  hay refresco automatico y esta ficha no lo trae.
- **[QC-19 — la guardia de R19 no comprueba el ORDEN de las llamadas]**
  `guard-politica-de-contrasenas` es un barrido de texto: ve que un archivo que hashea referencia
  tambien la politica, no que la llame **antes** ni que respete su resultado. Para el unico punto
  que hoy fija una contrasena —el seed— ese hueco esta tapado por un test de comportamiento
  (`seed-initial-access.test.ts`, "si la politica rechaza la credencial de instalacion, no se
  hashea ni se escribe nada"). **Todo punto nuevo que fije contrasenas necesita el suyo**: la
  guardia atrapa el olvido completo, no el orden.
- **[QC-19 — QC-21 hereda pintar los mensajes]** El modulo exporta `CREDENTIAL_RULES` (siete
  codigos estables, independientes del idioma) y `evaluateCredentialRules`, sincrona y usable en
  el navegador. QC-21 pinta los requisitos a partir de ese catalogo y **no vuelve a declarar las
  reglas**: una segunda copia es exactamente lo que la fila "la regla vive en el dominio" vino a
  impedir.
- **[QC-12 — E2E diferido a QC-13]** El dashboard no tiene prueba de extremo a extremo, y se
  difirió **con motivo escrito en el spec**: hoy no hay sesión real ni flujo navegable que
  visitar. Lo recoge QC-13, que es la que conecta la guardia de sesión.
- **[QC-12 — `/dashboard` existe y NO está protegida]** La ruta responde 200 a cualquiera. Es
  consecuencia esperada de que QC-13 esté `pending`, no un olvido: hasta entonces la zona
  «privada» lo es de nombre. Igual conviene tenerlo presente si algo se despliega antes.
- **[QC-12 — el ítem «Dashboard» del sidebar sigue dando 404]** Decisión humana del 2026-09-02:
  QC-12 crea la ruta pero **no** reconecta el ítem del menú; lo hace QC-13. O sea que la pantalla
  existe y el enlace del menú sigue roto hasta entonces.
- **[QC-12 — `app/page.tsx` sigue siendo la plantilla de `create-next-app`]** La raíz `/` del ERP
  es la página de bienvenida de Next.js. Nadie ha decidido si debe redirigir al dashboard o al
  login, y **ninguna ficha del backlog lo cubre**. Es la pregunta abierta que dejó el spec de
  QC-12; candidata a ficha nueva de una línea.
- **[arnés — `vitest related` no engancha las guardias que leen las fuentes del disco]** Un test
  que abre el archivo fuente en vez de importarlo no aparece en el grafo de `vitest related`, así
  que **`./init.sh --rapido` puede no correrlo** aunque el cambio lo afecte. Verificado en QC-12
  con `tests/unit/dashboard-route-contract.test.ts`, y es el mismo patrón que
  `tests/unit/identity/login-action.test.ts` y `logout-action.test.ts`. El gate completo sí las
  corre, así que no es un agujero de merge, pero sí del modo rápido. La salida que sugiere el
  reviewer: nombrarlas `guard-…` o moverlas a `tests/guards/`, que el modo rápido corre siempre.
  Entra por `/afinar-regla`.
- **[QC-12 — la verificación visual multiplataforma no la hizo nadie con ojos]** No hay navegador
  con emulación de dispositivo en este entorno. Lo verificado es el HTML servido y jsdom a 375 y
  1280 px, más las guardias de que no hay alto de viewport fijo, ni `:hover`, ni controles. El
  reviewer lo dio por **aceptable con nota**, no por excepción: queda como **verificación humana
  pendiente**.

- **El repo no tiene `.gitattributes` y eso fabrica conflictos falsos.** `core.autocrlf`
  está en `false` y los archivos conviven con fines de línea mezclados: `progress/current.md`
  está guardado en **CRLF** y `history.md`, `db/schema.prisma`, `package.json` y
  `feature_list.json` en **LF**. Cuando una rama reescribe un archivo entero cambiando el fin
  de línea, git no puede alinear ni una línea con el ancestro y el archivo choca **completo**,
  tapando el cambio real — y de paso puede colar un borrado accidental sin que nadie lo vea.
  Pasó tres veces al cerrar QC-14 (ver historial). Se resuelve con `* text=auto eol=lf` y una
  normalización única del árbol. **Entra por `/afinar-regla`**, no a mano.
- **`docs/jira.md` llama *Hecho* a la columna que en el board se llama *Finalizado*** (status
  id `10003`, transición `41`). Verificado el 2026-09-02 al cerrar QC-14. Es el mismo tipo de
  desajuste ya anotado para *Spec en revisión* / *En revisión*: el mapeo a `done` es correcto,
  pero el nombre literal no existe en el board.
- **`docs/jira.md` llama *Spec en revisión* a una columna que en el board se llama *En
  revisión*** (status id `10002`). Verificado el 2026-09-01 al mover QC-14. Es solo el nombre —
  el mapeo a `spec_ready` es correcto y no hay otra columna que se le parezca— pero un leader
  que busque la columna por su nombre literal no la encuentra. Corregir `docs/jira.md` o
  renombrar la columna.
- **Dos deudas de este archivo estaban desactualizadas y se corrigen aquí (2026-09-01).**
  `dev` local **no** está 52 commits por detrás de `origin/dev`: está **1 adelante, 0 atrás**
  (el commit de siembra `5708bc3`, sin pushear). El conflicto de contenido de
  `progress/current.md` se resolvió solo al mergear el PR #8. Y `lib/modules/` de QC-15 sí está
  en el árbol principal.
- **La siembra de `/afinar-feature` vive en un commit sin pushear.** `5708bc3` está solo en
  `dev` local: cualquier worktree montado desde `origin/dev` nace **sin** los `requirements.md`
  de QC-6, QC-14 y QC-19. Al montar el de QC-14 hubo que hacerle `git merge dev` encima; sin
  eso el `spec_author` no habría visto ninguna de las 17 decisiones cerradas. Se arregla
  pusheando `dev`, y mientras tanto es una trampa para la próxima feature sembrada.

- **[feature 4 — memoria y concurrencia en Vercel]** Con los parámetros vigentes cada verificación
  de contraseña reserva ~64 MiB y tarda ~750 ms en la máquina de referencia. No hay dato en `docs/`
  sobre el plan de Vercel ni sobre la memoria configurada de las funciones, así que el número de
  logins concurrentes por instancia está sin acotar. **Hay que confirmarlo antes de la feature 4.**
  Si la memoria resultara baja, la salida es bajar al conjunto equivalente `{ n: 32768, r: 8, p: 3 }`
  (`specs/2-.../design.md > 3.3`), no cambiar de algoritmo.
  (Pregunta abierta 3 de `specs/2-hash-y-verificacion-de-contrasena/requirements.md`.)
- **[feature 4 — rehash en el login]** El formato del hash permite detectar parámetros viejos, pero
  regenerar el valor es una **escritura** en `users`, fuera del alcance de la feature 2. Falta
  decidir si la feature 4 rehashea al vuelo en cada login exitoso o si la rotación es un script
  puntual. El formato soporta las dos; por eso el módulo **no exporta `needsRehash`**.
  (Pregunta abierta 4 de `specs/2-hash-y-verificacion-de-contrasena/requirements.md`.)
- **[arnés — worktrees sin artefactos generados]** Un worktree recién montado no puede pasar
  `pnpm typecheck`: le faltan `node_modules`, el cliente de Prisma y los tipos de Next. Hoy hay que
  correr a mano `pnpm install --frozen-lockfile`, `pnpm exec prisma generate` y `pnpm exec next
  typegen`. Candidato a que lo haga `scripts/wt.sh new`.
- **[QC-8 — el logout borra la cookie, no revoca el token]** La sesion es un token firmado sin
  estado, no una fila en una tabla: no hay revocacion. El logout de QC-8 borrara la cookie del
  navegador, pero un valor ya firmado que alguien hubiera copiado sigue siendo valido hasta su
  `exp` (8 h). Riesgo acotado y reversible: migrar a sesiones opacas toca **solo**
  `session-cookie.ts` y el lector de QC-8; el dominio y los puertos no se enteran.
  (`specs/QC-7-.../design.md > 6.2`.)
- **[QC-7 — bloqueo POR CUENTA, sin limite por IP]** Cualquiera puede dejar fuera a un usuario
  conocido hasta 60 minutos con 5 intentos fallidos. **Riesgo de DoS dirigido asumido
  explicitamente por el humano el 2026-09-01** (D12): ERP de un solo tenant, usuarios conocidos
  y sin registro publico. El limite por IP se ofrecio y se descarto: sobre Vercel la IP llega
  por `x-forwarded-for`, falsificable si el borde no esta bien configurado, y daria una
  sensacion de proteccion que no es real. (`design.md > 6.5`.)
- **[QC-7 — un usuario bloqueado no sabe que lo esta]** El mensaje es el generico, sin
  excepcion: un "cuenta bloqueada" delataria que el nombre de usuario existe. Coste real para
  el usuario legitimo, hasta 60 minutos sin entender por que. **Revisar cuando exista la
  recuperacion de contrasena** (hoy `FORGOT_PASSWORD_ROUTE` da 404, deuda de QC-10): avisar por
  correo al dueno de la cuenta es el canal que no filtra nada a terceros. (`design.md > 5.5`.)
- **[QC-7 — el nivel de escalada no decae con el tiempo]** Solo baja con un login exitoso. Una
  ventana de "buen comportamiento" (bajar un nivel tras 24 h sin fallos) exigiria una cuarta
  columna con la fecha del ultimo fallo y una regla mas que testear, para acotar algo que ya
  esta acotado en 60 minutos. Si el humano lo quiere, es una columna y una linea.
- **[QC-4 / arnes — un test de integracion afirma sobre el estado GLOBAL de la tabla]**
  `identity-constraints.int.test.ts` usa `expect(await tx.user.count()).toBe(0)` en tres
  puntos. Al aparecer el segundo archivo de integracion (QC-7) eso se convirtio en una carrera:
  ver `progress/impl_QC-7-login-usuario-y-contrasena.md > 6.2`. **Contenido** serializando
  `tests/integration/` en `vitest.config.mts`, no reparado: el arreglo de fondo es acotar esa
  asercion a sus propias filas, y es de QC-4. Ojo, la serializacion vale **dentro de una
  corrida**; dos procesos de vitest a la vez contra la misma base siguen chocando.
- **[arnes — el `.env` del repo no tiene `DIRECT_URL`]** `db/schema.prisma` la declara y sin
  ella `prisma migrate` falla con `P1012`. `.env.example` si la documenta: el incompleto es el
  `.env` real. Se anadio a mano en el worktree de QC-7 (base local en `localhost:5432`, o sea
  el mismo valor que `DATABASE_URL`). Candidato a que lo cubra `scripts/wt.sh new` junto con el
  resto de artefactos generados.
- **[QC-7 — el registro del fallo bajo contencion extrema puede perder un intento]** El contador
  se escribe con compare-and-set y hasta 10 reintentos con relectura (`design.md > 5.7`). Si los
  10 pierden la carrera, ese intento no se cuenta. **No es una perdida del bloqueo**: el contador
  es monotono y el bloqueo acaba disparandose igual; es un intento sin contar bajo contencion
  brutal. Se acepta frente a las alternativas —meter la tabla de escalada en SQL, o obligar al
  dominio a correr dentro de una transaccion— que estan descartadas y razonadas en `design.md > 5.7`.
- **[arnes — un E2E interrumpido deja basura que pone rojo el gate de otra feature]** Un
  `pnpm run e2e` cortado a medias (al reviewer se lo corto el disco lleno) dejo 4 usuarios y 4
  roles `qc7_e2e_*` huerfanos, y eso puso **9 tests rojos** en `identity-constraints.int.test.ts`,
  que afirma que la tabla `users` esta vacia. Mitigado en QC-7: el `afterAll` del E2E borra por
  prefijo y no por ids en memoria, cada borrado aislado, y hay barrido defensivo de huerfanos de
  mas de una hora al empezar. **La causa de fondo sigue siendo la misma que obligo a serializar
  la integracion**: un test de QC-4 que afirma sobre el estado global de la tabla.
- **[QC-7 — el CAS del login no puede pisar un bloqueo vigente, y el porque]** El predicado del
  compare-and-set compara los enteros por igualdad y el bloqueo por **rango**
  (`locked_until IS NULL OR <= now`). No es cosmetico: sin esa condicion, el par
  `(failed_login_attempts, lock_level)` sufre un **ABA** —`(0,1)` es a la vez bloqueo fresco y
  bloqueo caducado— y un intento con estado obsoleto **borraba un bloqueo activo**, o sea que un
  atacante bloqueado podia desbloquearse. Detectado por el reviewer ejecutandolo, cerrado con la
  condicion de rango y con test discriminante. **Quien toque ese `where` en QC-8 o QC-9 tiene que
  leer `design.md > 5.7` antes**: la version anterior de ese documento declaraba el caso imposible
  con una premisa falsa.

Cerradas, para que nadie las busque abiertas: la pregunta 3 de la feature 1 (columnas
`password_algorithm` / `password_updated_at`) se responde **NO** en `specs/2-.../design.md > 8`, y la
pregunta 5 (pepper) la cerró el humano el 2026-08-06 con un no (`design.md > 8.1`).
- ~~No hay `.env` ni `DATABASE_URL`~~ → **resuelto el 2026-08-06** por el humano.
  ~~Ni `.env.example`~~ → lo añadió la feature 1, con placeholders y sin credenciales.
  Sigue sin decidirse qué Postgres usa **CI**, solo el local. Y los worktrees nuevos
  necesitan que se les copie el `.env` a mano; `scripts/wt.sh new` no lo hace.
- **Worktree 1 a medio desmontar.** `./scripts/wt.sh done 1-modelo-usuarios-y-roles`
  falló: eliminó el registro de git y el `.git` del worktree, pero **no pudo borrar el
  directorio** `.worktrees/1-modelo-usuarios-y-roles/` («Device or resource busy» en
  dos intentos, algún proceso lo tiene abierto en Windows). No se forzó. Comprobado
  antes de rendirse que **todo su contenido está en `origin/dev`** salvo
  `tsconfig.tsbuildinfo`, que es un artefacto de build: no hay trabajo que perder.
  La rama local ya se borró. Queda borrar la carpeta a mano cuando se libere.
- **Antes del primer deploy** (heredado de la feature 1): verificar que el rol de
  Prisma en Supabase tenga BYPASSRLS. Con `FORCE` RLS y cero policies, si no lo tiene,
  toda query de la app devuelve vacío.
- **Feature 8 — fase 2 bloqueada por la 7.** La implementación de la 8 no arranca
  hasta que la feature 7 esté `done` y su base esté en `dev` (shadcn/ui inicializado,
  Vitest, `components/ui/`). El spec la trata como precondición heredada y su T0 falla
  ruidosamente si falta. Motivo completo en `## Evaluaciones > Feature 8`.
- **Feature 8 — E2E diferido** por decisión humana del 2026-08-06: la zona privada no
  tiene ninguna pantalla que visitar todavía (la primera es la feature 9). Hay que
  retomarlo cuando exista, en la 9 o en la 10.
- **Feature 8 — ítems de navegación de ejemplo.** Los 5 ítems quemados (Dashboard,
  Inventario, Notificaciones y dos con submenú) son **placeholder** con rutas que hoy
  dan 404. Cada feature de módulo debe sustituir el suyo; si el backlog crece sin que
  nadie los toque, quedan como enlaces rotos.
- **Feature 8 — el «modo icono» no muestra iconos.** El tipo `NavItem` no tiene campo de
  icono, ni en el spec aprobado, así que el modo colapsado deja el texto recortado en vez
  de iconos. La implementación es **conforme al spec**; el hueco es del spec. Decisión
  pendiente: añadir el campo y los iconos (cambia `NavItem`, la colección de ejemplo y los
  tests de R24-R27) o aceptar el recorte.
- **Feature 8 — la costura con la 10 son DOS archivos, no uno.** El design dice que
  `lib/services/session-stub.ts` es el único que la feature 10 reescribe; también tendrá
  que tocar `lib/actions/logout.ts` (el `redirect`), lo que romperá a propósito las
  guardias de R22/R35. Ninguno de los dos es UI, así que el criterio de «cero archivos de
  UI tocados» se mantiene — pero la 10 debe saberlo antes de empezar.
- **Feature 8 — atajo global Ctrl/Cmd+B.** El `SidebarProvider` lo trae de fábrica: ningún
  requisito lo pide y no tiene test. Queda anotado para que no aparezca luego como
  comportamiento fantasma. Desactivarlo exigiría editar `components/ui/`.
- **Feature 8 — `design.md > 5.5` contiene una afirmación falsa** ya corregida en la
  implementación: dice que el `SidebarProvider` lee la cookie `sidebar_state` al montar, y
  no la lee nunca (sólo la escribe). R28 se resolvió leyéndola en el layout de servidor.
  Si alguien vuelve al design a documentarse, leerá algo que no es cierto.
- **Feature 7 — shadcn ahora genera sobre Base UI, no Radix.** Al inicializar shadcn en
  este repo (2026-08-06) el CLI usó **Base UI** por defecto. Todo `components/ui/` que
  vino detrás (y el que generen las features 8 y 9) sale sobre esa base, no sobre Radix
  como asumía `docs/architecture.md`. No es un defecto, pero es la convención real del
  repo a partir de ahora: hay que actualizar `docs/architecture.md` o dejarlo escrito
  antes de que alguien genere componentes asumiendo Radix.
- **Feature 7 — `sonner` vs el `toast` nuevo de shadcn.** Se instaló `sonner` siguiendo el
  spec, pero el `toast` de shadcn ya no es el legacy deprecado que el `design.md` asumía:
  hoy es uno nuevo sobre Base UI y plenamente vigente. La decisión quedó tomada sobre una
  premisa desactualizada. Funciona y está testeado; revisar si se consolida `sonner` como
  el estándar del repo o se migra antes de que las features 8/9/10 lo repliquen.
- **Feature 7 — falta revisión visual humana.** `shadcn init` reescribió `app/globals.css`
  y dejó un `--font-sans` circular que rompía la tipografía; se corrigió, pero **nadie ha
  mirado `/` ni `/login` en el navegador**. Los tests no cubren aspecto. **Ya está mergeado
  en `dev` sin esa revisión**: sigue pendiente y ahora afecta a lo que construyan la 8 y la 9
  encima.
- **Feature 7 — enlace de recuperación de contraseña sin destino.** R22 maqueta el enlace
  apuntando a `/recuperar-contrasena`, que hoy da **404**. Ninguna feature del backlog
  cubre la recuperación: hay que darla de alta o el enlace queda roto en producción. El
  slug tampoco está confirmado por el humano.
- **Feature 7 — la firma del stub se quedará corta en la feature 10** (hallazgo menor M5
  del reviewer). `lib/services/login-stub.ts` es el único archivo que la 10 sustituye,
  pero su firma actual no contempla todo lo que la autenticación real necesitará. Revisar
  al especificar la 10.
- **Feature 7 — E2E del camino feliz diferido** a la feature 10, por default aprobado con
  el spec: hoy no hay `/dashboard` (feature 9) ni auth real al que llegar. Aquí solo se
  cubre el destino de la redirección.
- **Worktree huérfano: `.worktrees/1-modelo-usuarios-y-roles`.** Carpeta **vacía** que git ya
  no registra como worktree; `rm` falla con «Device or resource busy» (algún proceso de
  Windows la tiene tomada). No bloquea nada y no contiene trabajo. Se anota en vez de
  forzarla, como manda `AGENTS.md > F2.5`. Se borra sola al reiniciar o cerrando el proceso
  que la retiene. La de la feature 7 sí se pudo limpiar.
- **Convención nueva (2026-08-06): componentes de ruta en `components/` con barrel.**
  Cada ruta agrupa sus componentes propios bajo `<ruta>/components/` con un `index.ts` que
  los reexporta; `page.tsx` importa desde el barrel, nunca por ruta profunda, y en la raíz
  de la ruta solo quedan archivos del App Router. Escrita en
  `docs/architecture.md > Componentes`, añadida a los anti-patrones que el reviewer rechaza
  y a `.claude/agents/frontend_dev.md`. Sincronizada con `harnessConfig/`. Aplicada ya a
  `app/(public)/login/` en el PR #2.
  **Pendiente de arrastre:** los specs de las features **8 y 9 se escribieron antes** de
  esta regla, y la 8 ya está `spec_ready` con el spec aprobado. Sus `tasks.md` y `design.md`
  describen rutas de archivo que ya no cumplen la convención — hay que revisarlos antes de
  arrancar su fase 2, o el reviewer las rechazará por anti-patrón.
- **`dev` local divergió de `origin/dev` (2026-09-01).** El local tiene 1 commit sin pushear
  (`7914cd1`, «integrar Jira, guardias de dependencias y renumerar specs») y `origin/dev` tiene
  **35** que el local no tiene. `git merge --ff-only` aborta. No se forzó ni se commiteó nada:
  el árbol de trabajo tiene además cambios sin commitear del arnés (contrato `key`, épicas).
  **Decisión humana pendiente**: mergear `origin/dev` en el local resolviendo a mano, o
  rebasar ese commit. Mientras tanto no bloquea: el worktree de QC-15 se montó **desde
  `origin/dev`**, así que trabaja sobre la base correcta y completa.
- **Worktree `11-layout-privado-con-sidebar` retenido.** `wt.sh done` devolvió HOLD por árbol
  sucio: 3 renombrados staged de `specs/8-…` a `specs/11-…`. No se forzó, como manda
  `AGENTS.md > F2.5`. Ese renombrado ya está hecho en el worktree principal, así que lo de
  dentro es trabajo duplicado y no hay nada que perder; se puede descartar y desmontar, pero
  eso es descartar cambios y lo decide el humano.
- **QC-15 es `fullstack` y sigue SIN partir.** La partición de `AGENTS.md > Partición de
  fullstack` se evaluó y se decidió no aplicarla: media reestructuración mergeada deja el repo
  con dos estructuras conviviendo, que es justo lo que la feature existe para evitar. Queda
  registrado para que el `reviewer` no lo marque como incumplimiento.
- **`harnessConfig/` está en `.gitignore:12`, así que `harnessConfig/hexagonal/` NO viaja por
  git.** Descubierto el 2026-09-01 al copiar ahí la guardia. Vive solo en este disco. Si la
  intención es que la configuración hexagonal sea reutilizable en otro proyecto o por otra
  persona, hay que **decidir**: sacar `harnessConfig/` del `.gitignore`, versionar solo
  `harnessConfig/hexagonal/` con una excepción (`!/harnessConfig/hexagonal`), o moverla a un
  repo aparte. Mientras tanto, un `git clean -xdf` se la lleva por delante.
- **`dev` local está 52 commits por detrás de `origin/dev`.** El `git merge --ff-only` aborta
  por un solo archivo: `progress/current.md`, que tiene cambios sin commitear míos y del que
  `dev` añade 20 líneas de deudas de features anteriores. La divergencia de commits **ya se
  resolvió sola** (`7914cd1` llegó a `origin/dev` dentro del PR #8): queda solo el conflicto
  de contenido. No bloquea trabajo nuevo —los worktrees se montan desde `origin/dev`— pero
  conviene resolverlo antes de la siguiente feature.
- **Trabajo del arnés sin commitear en el worktree principal**, independiente de QC-15 y
  pendiente de su propio commit: el contrato `key` (identidad por issue key de Jira),
  las épicas (`epic` en `feature_list.json` + filtro `issuetype != Epic` en F0), y las
  guardias nuevas del validador. Conviven con ediciones tuyas en `CLAUDE.md`, `docs/specs.md`,
  `spec_author.md` y el comando nuevo `afinar-feature`, que **no toqué**.
- **`harnessConfig/hexagonal/` creada el 2026-09-01**, tras aprobarse el `design.md` de QC-15
  y derivada literalmente de él: contrato estructural (`docs/architecture-hexagonal.md`),
  fragmentos para `backend_dev` / `frontend_dev` / `reviewer`, y `plantilla-modulo/`. Es
  **aditiva y opcional**: no toca el flujo del arnés, solo dónde vive el código.
  **Falta la guardia**: `tests/guards/guard-arquitectura-modulos.test.ts` se copia ahí
  **cuando QC-15 cierre**, no antes — una guardia que nadie ha visto en rojo no está
  verificada. Mientras tanto, `hexagonal/tests/guards/README.md` documenta los cinco
  bloques que comprueba. **Pendiente**: hacer esa copia en F2.5.
- **Convención nueva (2026-09-01): el backlog se agrupa por épicas, y la épica es el módulo.**
  Tres épicas en el board — `QC-16` Plataforma, `QC-17` Identidad y acceso, `QC-18`
  Inventario — y las 12 features colgadas de la suya por el campo `parent`.
  `feature_list.json` lleva `epic` con el key de la épica. **Agrupa, no bloquea**: el orden
  lo siguen marcando `depends_on` y la regla de máx. 2 `in_progress` por zona, que se
  cuentan sobre features y nunca por épica.
  La frontera de cada épica es la misma que la del módulo hexagonal que crea `QC-15`, con
  una excepción consciente: **Plataforma no es un módulo de dominio**, es el armazón donde
  se montan los demás, y conviene que sea la única excepción o se convierte en el cajón de
  todo lo transversal. Por eso la pantalla de login (`QC-10`) está en Identidad y no en
  Plataforma aunque sea UI: es un adaptador del módulo de identidad.
  **El agujero que esto abría, ya cerrado:** F0 importaba con `project = QC` a secas y
  habría metido las tres épicas en `feature_list.json` como features fantasma. El filtro es
  ahora `project = QC AND issuetype != Epic` (`AGENTS.md > F0`), y el validador tiene una
  guardia que lo caza sin red: si el `epic` de una ficha apunta al `key` de otra ficha del
  mismo archivo, es que una épica se importó como feature.
- **Convención nueva (2026-09-01): la identidad de una feature es el `key` de Jira.**
  `feature_list.json` lleva ahora `key` (`QC-15`) como primer campo; el `id` numérico queda
  **solo como fallback** para una ficha que aún no tiene issue, y el validador exige que
  coincida con el número del key. `depends_on` se escribe con keys, y `branch`, `spec_path`
  y `.worktrees/` se derivan de `feature/<key>-<slug>`. Escrita en
  `docs/jira.md > El contrato de campos`, propagada a `AGENTS.md` (F0 y F1.0),
  `.claude/agents/leader.md` y `scripts/wt.sh`; sincronizada con `harnessConfig/`.
  **Pendiente de arrastre:** por decisión humana **no se renombró nada de lo que ya existía**,
  así que conviven dos convenciones en disco — `specs/4-…`, `specs/10-…`,
  `specs/11-…` y los worktrees `5-…` y `11-…` siguen con el nombre numérico, y solo
  lo nuevo nace como `QC-<n>-<slug>`. El validador acepta los dos prefijos a propósito; si
  algún día se quiere unificar, es una tanda de renombrados con sus ramas, no un parche de
  markdown.
- **`branch` y `spec_path` de tres fichas estaban apuntando a carpetas borradas.** Al
  reescribir el JSON se corrigieron contra lo que hay en disco: QC-4 → `specs/4-…`,
  QC-10 → `specs/10-…`, QC-11 → `specs/11-…` y `feature/11-layout-privado-con-sidebar`
  (el JSON decía `feature/8-…`, que es la rama vieja). Las ramas ya mergeadas de QC-4 y
  QC-10 se conservan con su nombre histórico: renombrarlas no arregla nada y rompe la
  trazabilidad del PR.
- **Feature 8 — la zona privada se queda sin toasts.** Decisión humana del 2026-08-06
  («no lo agregues por ahora»). Si una feature privada necesita notificaciones, ahí se
  decide dónde montar el `<Toaster />` — la 7 solo montó el de la zona pública.
- **Feature 5 — el tope de 64 caracteres no está en el input del formulario.** El máximo vive
  en el schema zod (`lib/types/auth.ts`), así que el usuario puede escribir 100 caracteres y
  solo recibe el error al enviar. Falta el `maxLength` en el `Input` de `/login`; es zona de
  `frontend_dev` y quedó fuera del alcance de una feature de backend.
- **Feature 5 — fuga de temporización en `verifyPasswordHash`.** Un `storedHash` que no casa
  el formato de bcrypt devuelve `false` de inmediato, frente a ~10² ms de uno válido: es un
  oráculo de enumeración de usuarios por canal lateral. **Se resuelve en la feature 7
  (login)**, no en el módulo — el arreglo es que el login gaste el mismo tiempo haya o no
  usuario, no que este helper mienta sobre el suyo.
- **Feature 5 — `CREDENTIAL_MAX_LENGTH` es más ancho que lo que restringe.** Solo acota la
  contraseña; `username` no tiene máximo. `SECRET_MAX_LENGTH` sería más preciso y esquiva
  igual la guardia `guard-password-never-plaintext`, que es lo que obligó a apartarse del
  `PASSWORD_MAX_LENGTH` que pedía el spec. Rename de 4 sitios, sin decidir.
- **Feature 5 — `bcryptjs` sin registro de dependencias.** `docs/dependencias.md` no existe
  en el repo, así que hoy no es exigible; si esa tabla se crea, `bcryptjs` necesita su fila.
- **`scripts/wt.sh new` deja el worktree a medio montar, y ya van dos features.** No copia
  `.env` (la 1 y la 2 lo hicieron a mano) y no genera el cliente de Prisma: en la feature 5 el
  `pnpm install` dejó `node_modules` sin `.prisma/client` y el gate completo cayó en una suite
  de integración por eso, no por el cambio. Se arregló con `pnpm exec prisma generate --schema
  db/schema.prisma`. Es trabajo del script, no del que monta el worktree.
- **Lección de la feature 5, para las que vienen: elegir la primitiva en vez de la librería
  fue lo que generó el 80% del código.** La primera versión implementaba scrypt de
  `node:crypto` a mano y llegó completa y revisada hasta el PR, donde el humano la paró.
  Casi todo lo que tenía —formato de almacenamiento, parseo, validación de parámetros de
  coste, comparación en tiempo constante— no respondía a ningún requisito del producto:
  reconstruía a mano lo que una librería de hashing ya trae hecho. Cuando un spec crezca a
  18 requisitos para una feature marcada `complexity: low`, esa desproporción es la señal.
- **QC-7 la lleva otra sesión en paralelo.** Al arrancar QC-6 apareció un worktree
  `.worktrees/QC-7-login-usuario-y-contrasena` que este leader no montó, con QC-7 marcada
  `pending`; una hora después la ficha ya estaba en `spec_ready` con `zone: backend` sin que
  este leader la tocara. **No es huérfano: hay otra sesión trabajándola.** Consecuencia para
  el cupo: cuando QC-7 pase a `in_progress`, la zona `backend` tendrá dos (con QC-6) y ahí se
  agota el máximo — QC-19 tendrá que esperar. Antes de lanzar el implementer de cualquiera de
  las dos hay que validar intersección de archivos: el seed toca el catálogo de roles y el
  arranque de la base, QC-7 toca `verifyCredentials` y el adaptador de sesión.
- **Carpeta huérfana de la numeración vieja.**
  `.worktrees/1-modelo-usuarios-y-roles/` no tiene worktree registrado detrás (`git worktree
  list` no la lista): es borrable a mano, pero no sin que un humano lo confirme.
- **`.worktrees/fix-login-field-control-uncontrolled` está SAFE y nadie lo desmonta.**
  `wt.sh list` lo da como mergeado en `origin/dev` y desmontable. No pertenece a ninguna
  feature del board, así que ningún paso F2.5 va a llegar a él: se queda hasta que alguien
  corra `./scripts/wt.sh clean --force`.
