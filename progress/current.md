# Sesión activa

> Estado vivo de lo que se está trabajando **ahora**. El leader lo mantiene al día.
> Al cerrar una feature se limpia de aquí y se resume en `history.md`.
>
> Este archivo arranca vacío: son solo los encabezados que el leader espera encontrar.
> No lo dejes crecer como bitácora — el historial completo vive en los PRs,
> en `progress/impl_*.md` / `review_*.md` y en `progress/history.md`.

## Features en curso

| id | feature | zone | status | branch | quién la tiene |
|---|---|---|---|---|---|
| 11 | layout-privado-con-sidebar | frontend | spec_ready | `feature/11-layout-privado-con-sidebar` | **desbloqueada**: la 7 ya está en `dev`. Revisar el spec por la convención `components/` antes de la fase 2 |

Worktrees: `.worktrees/11-layout-privado-con-sidebar`

La feature **5 — hash-y-verificacion-de-contrasena** se cerró el 2026-09-01 (PR #7, merge
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

## Conflictos pendientes

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
