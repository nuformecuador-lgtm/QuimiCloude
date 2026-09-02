# Bitácora (append-only)

> Una entrada por feature completada. No se edita lo ya escrito; solo se añade.

<!-- Formato:
## AAAA-MM-DD — <feature>
- Qué se construyó (1-2 líneas).
- Requisitos cubiertos: R1..Rn.
- Decisiones relevantes o deuda dejada.
-->

## 2026-08-06 — 1-modelo-usuarios-y-roles

- Esquema de identidad: `users`, `roles` y `document_types` (catálogo, `CC` sembrado),
  con un rol obligatorio por usuario y `ON DELETE RESTRICT` en ambas FKs. Migración
  up/down, cliente Prisma, tooling de tests y RLS `ENABLE`+`FORCE` en las tres tablas.
- Requisitos cubiertos: R1–R24, todos con test ejecutado. PR #1, merge commit `e4f3919`.
- Decisiones: unicidad case-insensitive vía índices únicos **funcionales** (`lower(...)`)
  y **parciales** (`WHERE deleted_at IS NULL`), escritos a mano en `migration.sql` porque
  Prisma no los modela — hay guardia de drift. Borrado lógico que **libera** los valores
  únicos. `roles` sin `deleted_at` a propósito. `password_hash` como columna desnuda: el
  hashing es la feature 2.
- Decisión humana: `db:rollback` hace `DELETE` de la fila de `_prisma_migrations` en vez
  de `prisma migrate resolve --rolled-back`, que solo admite migraciones fallidas
  (`P3012`). Se acepta perder el rastro histórico. Ajustada la viñeta 4 de
  `docs/architecture.md`, único cambio fuera del alcance.
- Deuda que hereda: verificar **antes del primer deploy** que el rol de Prisma en Supabase
  tenga BYPASSRLS (con `FORCE` y cero policies, si no lo tiene toda query devuelve vacío);
  Prisma fijado a `^6` porque la 7 rompe `datasource.url` (`P1012`).

## 2026-08-06 — 7-pantalla-de-login

- Maquetación de `/login` en `app/(public)/login/`: `<form action>` + Server Action, con
  `useActionState` para el resultado y `useFormStatus` para el pending. Componentes de
  shadcn/ui y `sonner` para el toast. Error genérico de credenciales por toast, errores de
  validación por campo inline; el usuario se rehidrata tras un error y la contraseña se
  limpia. Trae además la infraestructura que no existía: Vitest + Testing Library, zod y
  shadcn/ui inicializado.
- Requisitos cubiertos: R1–R23, todos con test verificado uno a uno por el reviewer contra
  los tests reales, no contra el mapa de la bitácora. PR #2, merge commit `9ac5a5c`.
- Es maquetación, no autenticación: sin DB, sin hashing, sin cookie. `lib/services/login-stub.ts`
  es el **único** archivo que la feature 10 sustituye; el contrato de `loginAction` (nombre,
  ruta, firma, nombres de campo, forma del estado) queda congelado para conectar la auth
  real sin tocar UI.
- Decisiones humanas: error de credenciales por **toast** y no `Alert` inline (se aparta de
  la descripción de la feature, que pedía el error «junto al formulario»; el hueco de
  accesibilidad quedó documentado y acotado, con el toast anunciado por región live); ruta
  bajo `app/(public)/`; Vitest dentro del alcance de esta feature; enlace
  «¿Olvidaste tu contraseña?» maquetado.
- **Convención nueva que nace aquí**: componentes de ruta en `<ruta>/components/` con barrel
  `index.ts`, import desde el barrel y nunca por ruta profunda. Escrita en
  `docs/architecture.md > Componentes`, añadida a los anti-patrones que el reviewer rechaza
  y a `.claude/agents/frontend_dev.md`. Sincronizada con `harnessConfig/`.
- **Colisión con la feature 1, y la lección que deja**: ambas corrieron en paralelo y cada
  una montó Vitest por su cuenta. La validación de conflicto de `AGENTS.md > Paralelismo`
  solo compara features de la **misma zona**, y estas eran `backend` y `frontend`, así que
  nada las comparó. Git tampoco avisó: `vitest.config.mts` vs `vitest.config.ts` y
  `test-rapido.ts` vs `test-rapido.mjs` son archivos distintos y se auto-mergean en
  silencio. Resuelto con una sola config con dos `projects` (node / jsdom) repartidos por
  convención, y un solo `test:rapido` (el que invoca vitest sin shell, porque `cmd.exe`
  parte las rutas con paréntesis como `app/(public)`). **Pendiente para el arnés**: detectar
  en F1.0 el choque de infraestructura compartida aunque las zonas difieran.
- La guardia `guard-password-never-plaintext` de la feature 1 marcaba el login en rojo con 5
  hallazgos, ninguno de los cuales almacenaba nada. Se **afinó, no se relajó**: heurístico
  por forma del identificador y allowlist acotada **por ruta de archivo**, con tests nuevos
  que impiden que la allowlist se convierta en un agujero.
- Deuda que hereda: falta **revisión visual** de `/` y `/login` (nadie las ha abierto en un
  navegador; `shadcn init` reescribió `globals.css`); shadcn genera ahora sobre **Base UI, no
  Radix**, y `docs/architecture.md` aún dice Radix; el enlace `/recuperar-contrasena` da 404
  y ninguna feature del backlog lo cubre; los specs de las features **8 y 9 se escribieron
  antes** de la convención de `components/` y hay que revisarlos antes de su fase 2.

## 2026-09-01 — 5-hash-y-verificacion-de-contrasena

- Módulo util con dos funciones sobre **bcrypt** (`bcryptjs`, 10 rondas):
  `createPasswordHash` y `verifyPasswordHash` en `lib/utils/password-hash.ts`. Sin service,
  sin interfaz, sin cambio de esquema: `users.password_hash` de la feature 1 sirve tal cual.
  Requisitos R1–R10, todos con test ejecutado. PR #7, merge commit `697cca7`.
- **La feature se hizo dos veces.** La primera implementación era scrypt de `node:crypto` a
  mano y llegó a estar completa y revisada; el humano la paró en el PR por
  sobre-ingeniería y ordenó rehacerla con bcrypt. La segunda sustituye a la primera entera:
  módulo de 196 → **37** líneas, tests de ~750 → **326**, spec de 856 → **379**, requisitos
  de 18 → **10**.
- **Por qué era desproporcionada, que es la lección reutilizable**: casi toda la complejidad
  de la versión scrypt existía para reconstruir a mano lo que una librería de hashing ya
  trae hecho — formato de almacenamiento (`parseStoredHash`, `fromBase64Url`), sal por hash,
  validación de parámetros de coste (`areUsableCostParams`, `isPowerOfTwo`, ocho constantes
  de rango, techo de memoria) y comparación en tiempo constante. Ninguna de esas piezas
  respondía a un requisito del producto: respondían a la decisión de usar una primitiva
  cruda. **Elegir la primitiva y no la librería fue la decisión que generó el 80% del
  código.**
- Lo que salió y **no debe volver**: formato PHC propio, parámetros de coste configurables,
  techo de memoria, medición de coste, rotación de algoritmo y pepper.
- Lo que **sí** sobrevivió, y por qué no era sobre-ingeniería: `verifyPasswordHash` **falla
  cerrado** (hash vacío, mal formado o corrupto → `false` sin lanzar, porque
  `bcrypt.compare` sí lanza y eso daría dos salidas distinguibles en el login), el **tope de
  72 bytes UTF-8** que lanza en vez de dejar que bcrypt trunque en silencio, y la guardia
  estática del módulo recortada a lo que sigue aplicando.
- Decisiones humanas: **bcrypt** y no argon2id (dependencia más ligera, asumiendo el límite
  de 72 bytes); coste **10 rondas**; **sin pepper** (decisión heredada de la primera versión,
  sigue en pie); **máximo de 64 caracteres** en el schema zod del login como cara visible del
  límite de bcrypt.
- **Desviación de nombre, resuelta según la regla**: `tasks.md > T4` pedía
  `PASSWORD_MAX_LENGTH`, que pone en rojo `guard-password-never-plaintext`. Se adaptó el
  nombre a `CREDENTIAL_MAX_LENGTH` y la guardia quedó intacta; el reviewer verificó que las
  tres salidas alternativas (relajar sufijos, ensanchar la allowlist, cambiar solo el spec)
  eran peores.
- El reviewer **rechazó en primera vuelta** por un bloqueante documental: las nueve tasks
  sin marcar en `tasks.md`, que `CHECKPOINTS.md > Especificacion` exige. Corregido junto con
  la divergencia spec↔código del nombre de la constante y los encabezados que aún decían
  «Feature 2».
- Gate completo verde: 13 suites, 121 tests. Hizo falta `prisma generate` en el worktree: el
  `pnpm install` lo dejó sin cliente y una suite de integración caía por eso, no por el
  cambio. **Deuda del arnés**: `scripts/wt.sh new` no copia `.env` ni genera el cliente de
  Prisma, y ya son dos features que tropiezan con lo mismo.
- Deuda que hereda: el tope de 64 **no** está como `maxLength` en el input del formulario
  (zona de frontend), así que hoy el error solo aparece al enviar; fuga de temporización
  menor (un hash que no casa el formato devuelve `false` inmediato frente a ~10² ms de uno
  válido), a resolver en la feature 7 (login); `bcryptjs` sin fila en registro de
  dependencias; y `CREDENTIAL_MAX_LENGTH` es más ancho que lo que restringe —solo acota la
  contraseña, `username` no tiene máximo—, `SECRET_MAX_LENGTH` sería más preciso.

## QC-11 — layout-privado-con-sidebar (2026-09-01)

- Cerrada con el PR #6 (merge `02883f8` en `dev`). Épica `QC-16 Plataforma`.
- Maquetación del armazón privado: sidebar con tres regiones, colapso en modo icono y
  responsive, pie con menú de usuario. Los datos de sesión entran por props y el cierre de
  sesión es un disparador vacío: la costura real la hace QC-13.
- Deudas que sobreviven al cierre y siguen en `current.md`: el modo icono no muestra iconos
  (`NavItem` no tiene campo de icono, y el hueco es del spec, no de la implementación); los 5
  ítems de navegación son placeholder con rutas que dan 404; la zona privada se queda sin
  `<Toaster />` por decisión humana; y `design.md > 5.5` contiene una afirmación falsa sobre
  que el `SidebarProvider` lee la cookie `sidebar_state` al montar — no la lee nunca.
- Su worktree quedó retenido por árbol sucio; ver `current.md > Deudas`.

## QC-15 — arquitectura-hexagonal-y-modulos (2026-09-01)

- Cerrada con el PR #8 (merge `f79ba5d` en `dev`, sin squash). Épica `QC-16 Plataforma`.
  17 commits, 90 archivos, +7856/−314.
- Reestructuración a módulos hexagonales **sin cambio de comportamiento**: de carpetas por
  rol técnico (`lib/services/`, `lib/actions/`, `lib/types/`) a `lib/modules/<modulo>/` con
  `domain/`, `ports/` y `adapters/{driven,driving}/`, punto único de composición en
  `lib/composition/` y núcleo compartido en `lib/shared/`.
- **La prueba de que no se rompió nada**: los mismos 20 archivos de test verdes de antes,
  cada uno con idéntico número de tests (contado con `--reporter=json`), y ninguna aserción
  cambiada en el diff. De 170 a 220 tests; los 50 nuevos son de la guardia.
- Las cuatro decisiones estructurales, con su porqué, en
  `specs/QC-15-arquitectura-hexagonal-y-modulos/design.md > 1`. La que más condiciona: la
  raíz es `lib/modules/`, **no** un `src/`, porque un `src/` obligaría a tocar `SCANNED_DIRS`
  de `guard-password-never-plaintext`, que si nadie lo actualiza se queda verde barriendo nada.

### La lección: la guardia costó tres rondas, la reestructuración ninguna

El `reviewer` **rechazó la guardia dos veces**, las dos por el mismo defecto — el que hace que
una guardia pase siempre sin mirar nada:

- **Ronda 1 (mayor).** Cinco bloques comparaban el especificador del import **como texto**,
  exigiendo el prefijo `@/`. Cualquier import **relativo** los atravesaba. Con tres
  violaciones reales metidas a la vez, daba 39/39 verde.
- **Ronda 2 (menor subido a bloqueante por el leader).** Quedaba una última comparación de
  cadena en la comprobación del contrato: `'./domain/../../../shared/routes'` reexportaba
  desde fuera del dominio y pasaba en verde.

Las dos las encontró **ejecutando**, no leyendo: introdujo la violación, miró el resultado y
revirtió. Es el mismo defecto que ya había mordido en este repo con `SCANNED_DIRS`. De ahí
salen las dos reglas que quedan escritas para la siguiente guardia que alguien escriba:
**resolver el destino a una ruta real antes de aplicar la regla**, y **afirmar que el barrido
no está vacío** en todo bloque que itera archivos.

Sin eso, la feature se habría mergeado con su garantía principal desactivada y nadie se
habría enterado hasta que alguien escribiera un import relativo — que es lo natural dentro de
un mismo módulo.

### Efectos colaterales que salieron por el camino

- `.claude/agents/backend_dev.md` mandaba crear `lib/services/`, `lib/repositories/` y
  `lib/interfaces/`: las tres carpetas que la guardia nueva prohíbe. El próximo `backend_dev`
  habría seguido su prompt y puesto el gate en rojo sin entender por qué. Corregido junto con
  `CHECKPOINTS.md`, que es contra lo que revisa el `reviewer`.
- `bcryptjs` entró en `docs/dependencias.md` como `heredada`. No era una dependencia nueva:
  el registro se escribió antes de que QC-5 mergeara bcryptjs y el hueco apareció al unir las
  ramas. Se resolvió con la fila en vez de baselinizar el rojo, que dejaría deuda permanente
  por un problema de contabilidad.
- La guardia **no** comprueba que la lógica de negocio esté en `domain/` y no en la Server
  Action. Un caso de uso que sólo delega pasa en verde y está mal. Queda en `CHECKPOINTS.md`
  para el revisor humano.

### Deuda que hereda

Tres preguntas abiertas del spec, ninguna bloqueante: el idioma de los nombres de módulo
(hoy conviven `identity` e `inventario`), si un módulo puede leer modelos ajenos dentro de un
`include` de Prisma o debe pedirlos al contrato (se eligió lo estricto, a revisar en QC-14), y
dónde vivirán los componentes propios de un módulo cuando aparezca el primer caso.

## QC-14 — modelo-producto (2026-09-02)

Primera tabla de dominio químico del ERP y primera feature de la épica **QC-18 Inventario**.
Solo el modelo de datos: sin pantalla y sin API. PR #10, merge `abdef6b`.

Dos tablas y su relación obligatoria: `presentations` como catálogo propio (para que crezca
sin migrar lo ya guardado) y `products` con nombre, existencia, presentación, unidad, costo,
compra mínima, tiempo de entrega y cantidad de alerta. FK `products.presentation_id` con
`ON DELETE RESTRICT`, cuatro `CHECK` de no negatividad, `cost` como `numeric(14,4)` exacto,
RLS activado y forzado en ambas, borrado lógico en `products` y `/// @module inventario` en
los dos modelos. `migration.sql` con su `down.sql`, ejercitado de verdad.

**Los 24 requisitos (R1–R24) tienen test ejecutado.** El `reviewer` los abrió uno por uno y
repitió por su cuenta el ciclo `apply → rollback → apply` con snapshot completo del esquema:
tras el rollback, cero apariciones de `products`/`presentations`; tras reaplicar, snapshot
idéntico. Veredicto APROBADO, cero hallazgos mayores.

### La lección: el conflicto no era de contenido, era de fin de línea

El PR llegó al merge en `CONFLICTING` con `progress/current.md` chocando **entero**, de la
línea 1 a la última. La causa no era que dos ramas hubieran escrito lo mismo: el commit de
siembra `5708bc3` reescribió el archivo de LF a CRLF, así que **cada línea difería del
ancestro** y git no pudo alinear nada. Debajo del ruido había una pérdida real que el
conflicto tapaba: esa reescritura había **borrado tres deudas abiertas** que `dev` no solo
conservaba sino que había ampliado con las diez de QC-7.

Se resolvió normalizando las tres versiones a LF, mergeando ahí —donde el choque se reduce a
**una sola tajada**— y devolviendo el resultado a CRLF. El mismo procedimiento hizo falta
**tres veces seguidas** en la misma sesión: al mergear `dev` en la rama, al mergear `dev` en
`dev` local, y al recuperar el `git stash` del trabajo en vuelo. Es la señal de que esto no
es un accidente sino una trampa estructural: **falta un `.gitattributes`**.

### Dos cosas que descubrió el camino, no el spec

- **QC-14 usó su propia base de datos.** La compartida tenía aplicada la migración de QC-7,
  que no estaba en `dev` ni en la rama, así que Prisma veía drift y pedía resetear el esquema
  público — lo que habría destruido el trabajo en vuelo de QC-7. Se creó `QuimiCloude_QC14`
  en el Postgres local, con el `.env` git-ignorado del worktree apuntando ahí. La base de QC-7
  no se tocó. **Una base por worktree debería ser la norma cuando corren dos features backend
  en paralelo.**
- **`./init.sh` completo no corría desde dentro del worktree** — y dejó de fallar solo al
  integrar `dev`. `scripts/validate-features.mjs` busca `.worktrees/<slug>/specs/` relativo al
  cwd, y toda feature en vuelo cuyo spec no estuviera aún en `dev` (aquí QC-7) se veía como
  spec faltante. Al mergear `dev` el spec de QC-7 entró en la rama y el gate pasó en verde.
  El agujero sigue ahí para la siguiente feature que corra sola.

### Deuda que hereda

- El test de R10 prohíbe cualquier `enum` en **todo** `db/schema.prisma`, no solo en el módulo
  `inventario`: el día que otro módulo declare un enum legítimo pondrá en rojo un test de QC-14.
- **`delivery_time` va sin `CHECK`**, aunque las otras cuatro columnas numéricas sí lo llevan:
  hoy un plazo de entrega negativo entra en la base. Es una línea de migración cuando alguien
  lo quiera cerrar.
- **El nombre de una presentación no es único** y es el más caro de revertir de los cinco
  cierres: añadir el índice después exige limpiar duplicados primero. Revisar en QC-20 si el
  catálogo se llena a mano.
- Cosmética menor del `reviewer`: una aserción tautológica en R2 (cuyo fondo sí cubre el
  requisito), un comentario desalineado en R11 y dos desajustes de numeración entre
  `design.md` y `tasks.md`.

## QC-7 — login-usuario-y-contrasena (2026-09-02)

Login real de punta a punta: verificación de credenciales contra Postgres, política de bloqueo
de cuenta con escalada y cookie de sesión firmada. PR #9, merge `10f9a07`. Los 31 requisitos
(R1–R31) con test ejecutado, incluido E2E en navegador real con Playwright.

**La complejidad real fue `high`, no la que traía la ficha.** Llegó sin complejidad asignada y
lo que se estimó como "verificar credenciales y emitir cookie" (`medium`) cambió de escala
cuando el humano respondió la pregunta abierta 2 con una política concreta de bloqueo: eso
arrastró persistencia, migración con su `down.sql`, un puerto y un adaptador de escritura más,
y una tanda entera de tests, a una feature que no tenía ninguna. El bloqueo entró como
**alcance añadido**, no estaba en la description original. Se decidió dejarlo dentro y no
sacarlo a ficha propia: es el mismo camino de código, y la respuesta uniforme en contenido y en
tiempo hay que diseñarla **una vez** — retrofitear uniformidad sobre un login ya mergeado es
exactamente como se cuelan los oráculos.

### La lección: tres rondas, dos bloqueantes, y los dos aparecieron ejecutando

El `reviewer` rechazó dos veces antes de aprobar. Ninguno de los dos bloqueantes era visible
leyendo el código:

- **M-A1 — el registro del intento fallido no era atómico.** Cerrado con compare-and-set y
  hasta 10 reintentos con relectura.
- **M-B1 — el CAS sufría un ABA y borraba bloqueos activos.** El predicado comparaba los
  enteros por igualdad y el bloqueo también: el par `(failed_login_attempts, lock_level)` con
  valor `(0,1)` es **a la vez** bloqueo fresco y bloqueo caducado, así que un intento con
  estado obsoleto **desbloqueaba una cuenta bloqueada** — un atacante podía sacarse a sí mismo
  del bloqueo. Cerrado comparando el bloqueo por **rango** (`locked_until IS NULL OR <= now`),
  con test discriminante.

Lo más caro no fue el defecto sino su tapadera: `design.md > 5.7` **declaraba el caso imposible
con una premisa falsa**. Mientras esa frase estuviera escrita, nadie iba a buscar ahí. Se borró
de los dos sitios donde vivía y se sustituyó por el escenario real, con constancia de que se
descubrió ejecutando. **Quien toque ese `where` en QC-8 o QC-9 tiene que leer esa sección
antes.**

En las tres rondas el implementer respondió **midiendo en vez de argumentando** — incluido
quitarse el `OR` a sí mismo para ver caer el test.

### Deuda que hereda

- **El logout de QC-8 borrará la cookie, pero no revoca nada.** La sesión es un token firmado
  sin estado: un valor ya firmado que alguien hubiera copiado sigue siendo válido hasta su
  `exp` (8 h). Riesgo acotado y reversible — migrar a sesiones opacas toca **solo**
  `session-cookie.ts` y el lector de QC-8; el dominio y los puertos no se enteran.
- **Bloqueo POR CUENTA, sin límite por IP.** Cualquiera puede dejar fuera a un usuario conocido
  hasta 60 minutos con 5 intentos fallidos. DoS dirigido **asumido explícitamente por el humano**
  (D12): ERP de un solo tenant, usuarios conocidos, sin registro público. El límite por IP se
  ofreció y se descartó: sobre Vercel la IP llega por `x-forwarded-for`, falsificable, y daría
  una sensación de protección que no es real.
- **Un usuario bloqueado no sabe que lo está.** El mensaje es el genérico, sin excepción: un
  "cuenta bloqueada" delataría que el nombre de usuario existe. Coste real para el usuario
  legítimo. **Revisar cuando exista la recuperación de contraseña** (deuda de QC-10): avisar por
  correo al dueño de la cuenta es el canal que no filtra nada a terceros.
- **El nivel de escalada no decae con el tiempo**, solo baja con un login exitoso. Una ventana
  de buen comportamiento exigiría una cuarta columna y una regla más que testear, para acotar
  algo que ya está acotado en 60 minutos.
- **Bajo contención extrema puede perderse un intento sin contar.** Si los 10 reintentos del CAS
  pierden la carrera, ese intento no suma. No es una pérdida del bloqueo: el contador es
  monótono y el bloqueo acaba disparándose igual.
- **Un test de QC-4 afirma sobre el estado GLOBAL de la tabla.** `identity-constraints.int.test.ts`
  usa `expect(await tx.user.count()).toBe(0)`. Al aparecer el segundo archivo de integración se
  volvió una carrera; **contenido** serializando `tests/integration/` en `vitest.config.mts`, no
  reparado. El arreglo de fondo —acotar la aserción a sus propias filas— es de QC-4. La
  serialización vale **dentro de una corrida**: dos procesos de vitest a la vez contra la misma
  base siguen chocando. Es también lo que hizo que un E2E interrumpido dejara basura y pusiera 9
  tests en rojo.
- **El `.env` del repo no tiene `DIRECT_URL`**, que `db/schema.prisma` declara; sin ella
  `prisma migrate` falla con `P1012`. `.env.example` sí la documenta: el incompleto es el `.env`
  real. Candidato a que lo cubra `scripts/wt.sh new`.

## QC-6 — seed-roles-y-usuario-inicial (2026-09-02)

El seed que deja la base utilizable desde cero: catálogo de roles (`Administrador`, `Operador`),
usuario inicial Administrador con credenciales del entorno, y una migración aditiva para la marca
`must_change_credential`. Encadenado al despliegue (`build` = `migrate deploy && seed && next build`).
PR #11, merge `683e6ce`. Los 21 requisitos (R1–R21) con test ejecutado; 377 tests / 35 archivos en
verde. Sin E2E, diferido con motivo: el seed no tiene interfaz.

**La idempotencia no es un `upsert`, y eso condicionó todo el diseño.** Las tres unicidades de
`users` son índices funcionales (`lower(...)`) y parciales (`WHERE deleted_at IS NULL`) escritos a
mano en la migración de QC-4; Prisma no los modela, así que `user.upsert` no tiene un `where` único
al que agarrarse. El algoritmo **lee qué falta y crea exactamente eso**, sin reescribir nada: en un
entorno que ya tiene admin vivo ni siquiera lee las `SEED_ADMIN_*`.

### La lección: dos bloqueantes, y el gate rápido no podía ver ninguno de los dos

- **B-1 — `pnpm test` en rojo por un centinela ajeno.** Añadir `mustChangeCredential` al modelo
  `User` tumbó `identity-schema.test.ts`, que afirma la lista completa de columnas. Se coló porque
  **el gate rápido selecciona por grafo de imports y ese test lee `db/schema.prisma` como TEXTO**:
  ningún cambio de esquema lo relaciona. Es el agujero exacto que describe `CLAUDE.md > regla 5`, y
  la razón por la que el gate completo antes del PR no es negociable.
- **B-2 — desviación NO declarada: los pasos 4 y 5 no corrían en transacción.** `design.md > 5.2`
  la llamaba innegociable y en el código no había ninguna `$transaction`. La bitácora afirmaba "sin
  dejar nada creado a medias (R13)" apoyándose en un test que demuestra otra cosa: allí el fallo
  ocurre **antes** de escribir (falta la variable), el único camino que el código sí protegía. Se
  cerró envolviendo desde la composición —el dominio no conoce la transacción— con un test que
  fuerza el fallo del alta y afirma que los roles no quedan.

Las otras dos desviaciones del diseño **sí** estaban declaradas y el reviewer las sostuvo: ampliar
el input de `createInitialAdmin` con los seis marcadores personales (era la única forma de que R7
se cumpliera en `domain/` y no dentro del adaptador) e importar el repositorio ya cableado desde el
adaptador driven (pasar `prisma` desde `lib/composition` habría puesto la guardia de módulos en
rojo). Lo que no vale es que una desviación desaparezca en silencio.

De paso se arregló el test ajeno de QC-4 que afirmaba sobre el estado **global** de la tabla
(`user.count() === 0`), deuda anotada al cerrar QC-7 y que un seed —cuyo trabajo es literalmente
dejar filas— iba a tumbar sí o sí. Las 9 aserciones se acotaron por `roleId` (o por `documentNumber`
donde no había rol útil): mismos SQLSTATE, mismos valores esperados, ningún `skip`.

### Deuda que hereda

- **El hasheo bcrypt corre dentro de la transacción** (m-9). Consecuencia aceptada de B-2: el
  `build` mantiene una transacción abierta durante el hash, solo en un entorno nuevo. Sacarlo
  obligaría a partir el caso de uso del dominio.
- **Residuo ante muerte dura del proceso** (m-8): si se mata vitest entre el commit y el `finally`,
  queda un rol `qc6-tx-commit-<uuid>` huérfano. Inocuo y verificado; un `afterAll` que barra
  `name LIKE 'qc6-tx-%'` lo cerraría en tres líneas.
- **Dos tests escriben en la base compartida** en vez de aislarse en transacción, porque
  `tx.$transaction` es `undefined` y el no-anidamiento se verificó ejecutándolo. Se limpian en
  `finally`.
- **El `.env` real del repo estaba incompleto** —le faltaban `DIRECT_URL`, `SESSION_SECRET` y las
  tres `SEED_ADMIN_*`, todas documentadas en `.env.example`—. Completado el 2026-09-02 al correr el
  seed por primera vez a mano. Sigue siendo candidato a que lo cubra `scripts/wt.sh new`.
- **El cliente Prisma generado se desincroniza del esquema y nadie lo detecta hasta la ejecución**:
  tras esta migración, `db:seed` fallaba con `Unknown argument mustChangeCredential` hasta correr
  `prisma generate`. En Windows ese `generate` además choca con `EPERM` si hay un `next dev` vivo
  sujetando `query_engine-windows.dll.node`.
- **`wt.sh done` no cierra en Windows cuando el worktree tiene `node_modules` de pnpm**: `git
  worktree remove` desregistra pero deja el árbol en disco por rutas largas, y el segundo intento
  responde `is not a working tree`. Hubo que rematar con `rmdir /s /q` y `git worktree prune`.

## QC-12 — dashboard-en-blanco (2026-09-02)

PR [#12](https://github.com/nuformecuador-lgtm/QuimiCloude/pull/12), merge `b154fa9`. Épica QC-16
Plataforma, `zone: frontend`, `complexity: low`. Ciclo completo en una sola sesión: evaluación →
spec → aprobación humana → implementación → review → gate → PR → merge.

12 requisitos EARS (R1–R12), los 12 con su test. 14 tests propios; `./init.sh` completo en verde
antes del PR: **37 archivos, 391 tests**. Ninguna dependencia nueva.

### Lo que la hace distinta de las anteriores

**Es la primera feature puramente aditiva del repo.** `git diff --name-status` contra el
merge-base devuelve **9 archivos, todos `A`**: ni un `M`, ni un `D`. No toca una línea de QC-11 ni
de QC-15, y `package.json`, `pnpm-lock.yaml`, `components.json` y `docs/dependencias.md` quedan
fuera del diff. Era el riesgo declarado de la ficha —heredar el layout privado ya montado en vez
de re-crearlo— y el `reviewer` lo verificó ejecutando el diff, no leyendo la bitácora.

**El `<main>` que no se escribió.** `SidebarInset` de QC-11 ya es el `<main>` de la zona privada, y
R5 de QC-11 exige que haya **uno solo**. La página no declara el suyo. Anidar dos habría roto un
requisito de la feature anterior sin que ningún test de QC-12 se pusiera rojo: lo habría cazado el
test de QC-11, y solo porque existía.

**Se resistió la tentación de rellenarla.** Un dashboard vacío invita a meter tarjetas, métricas o
contenido de ejemplo. El `design.md` lo descartó explícitamente antes de implementar, y
`dashboard-content.tsx` acabó siendo un `div` vacío sin props ni hijos. Eso es lo que pedía la
ficha.

### Decisión humana que acotó el alcance

**QC-12 crea la ruta pero NO reconecta el ítem «Dashboard» del sidebar**, que sigue dando 404. Se
preguntó al humano el 2026-09-02 y decidió que lo haga QC-13, la que conecta la navegación con la
sesión real. Sin esa pregunta, el spec habría tocado un archivo de QC-11 y la feature habría dejado
de ser aditiva.

### Deuda que hereda

- **Sin E2E**, diferido con motivo a QC-13: no hay sesión real ni flujo navegable que visitar.
- **`/dashboard` responde 200 a cualquiera.** La zona «privada» lo es de nombre hasta QC-13.
- **La verificación visual con emulación de dispositivo no la hizo nadie con ojos.** No hay
  navegador con emulación en este entorno; lo verificado es el HTML servido y jsdom a 375 y 1280 px,
  más guardias de que no hay alto de viewport fijo ni `:hover` ni controles. El `reviewer` lo dio
  por **aceptable con nota**, no por excepción: queda como verificación humana pendiente.
- **`vitest related` no engancha las guardias que leen las fuentes del disco** en vez de importarlas,
  así que `./init.sh --rapido` puede saltárselas. Afecta también a `login-action.test.ts` y
  `logout-action.test.ts`, o sea que es del arnés y no de esta feature. El gate completo sí las
  corre. Salida sugerida: nombrarlas `guard-…` o moverlas a `tests/guards/`. Entra por
  `/afinar-regla`.
- **`app/page.tsx` sigue siendo la plantilla de `create-next-app`.** La raíz `/` del ERP es la
  página de bienvenida de Next.js y **ninguna ficha del backlog lo cubre**. Es la pregunta abierta
  que dejó el spec; candidata a ficha nueva.
- **`wt.sh done` volvió a fallar en Windows** exactamente como quedó documentado al cerrar QC-6:
  desregistró el worktree pero dejó el árbol en disco, y el segundo intento respondió `is not a
  working tree`. Se remató con `rm -rf` + `git worktree prune`, con conocimiento de que lo único sin
  versionar eran `node_modules`, `.env` y `tsconfig.tsbuildinfo`. **Es la segunda vez el mismo día**:
  ya no es una anécdota, es el comportamiento por defecto de ese script en esta máquina.

## QC-19 — politica-de-contrasenas (2026-09-02)

La regla de aceptación (≥8, mayúscula, minúscula, número, símbolo) más el diccionario de
contraseñas filtradas, aplicada **en todo punto donde alguien fija o cambia una contraseña**. El
rechazo dice qué requisito faltó y nunca la credencial; quien ya tenga guardada una que no cumple
sigue entrando. PR #14, merge `11664e1`. Los 24 requisitos (R1–R24) con test ejecutado. Reviewer
APROBADO sin bloqueantes, 7 menores, los 7 cerrados. Gate completo tras integrar QC-8: 46 archivos,
478 tests.

### La lección: el diseño dio por hecho el estado de la rama, y se equivocó

`design.md > 7` asumía que QC-6 no estaba en la rama. **Sí estaba**, y eso dejaba
`seed-initial-access.ts` hasheando sin evaluar la política: R18 y R19 en falso justo en el único
punto del repo que hoy fija una contraseña. La respuesta no fue exentar al seed de la guardia —eso
vaciaba R18 donde más cuenta— sino meter `checkCredentialPolicy` como dependencia **obligatoria**
del caso de uso, evaluada **antes** del hash. Coste: 25 sitios de llamada en tests de QC-6
recibieron la dependencia; el reviewer verificó línea a línea que **ninguna aserción existente
cambió**.

El reviewer también comprobó que la guardia nueva **muerde**, en vez de darla por buena porque
estaba verde: con el contenido real del archivo da `[]`; con ese mismo contenido sin la referencia
a la política, da `["passwordHasher.hash("]`. Y el implementer cerró después el hueco que quedaba
—`import { hash } from 'bcryptjs'` con llamada sin receptor— **por el import, no por la llamada**:
no se puede llamar a esa función sin importarla, y detectar un `hash(` pelado habría vuelto la
guardia frágil. La allowlist no creció.

Medido, no estimado: el diccionario son 49 233 entradas y ~1,63 MiB de `Set` en el proceso de
servidor, nunca en el bundle del cliente. Cierra el riesgo de tamaño que el diseño dejaba anotado.

### La otra lección: dos sesiones de leader sobre el mismo repo

El PR llegó `CONFLICTING` porque `origin/dev` avanzó 24 commits con el merge de QC-8 mientras esta
feature estaba en revisión. De los tres choques, **el peligroso fue el que git no marcó**:
auto-mergeó `feature_list.json` dejando **QC-23 duplicada**, porque las dos sesiones importaron la
misma ficha del board en posiciones distintas del array. Los dos registros eran byte a byte
idénticos, así que no se perdió nada, pero el archivo quedaba inválido y **lo cazó `./init.sh`, no
el merge**. Los otros dos —`lib/composition/index.ts` y este archivo— eran uniones mecánicas.

Antes de eso, tres commits de contabilidad se llevaron por delante trabajo de la otra sesión, y un
`sed -i` volteó `progress/current.md` entero de CRLF a LF convirtiendo 8 líneas de cambio en un
diff de 1982 — la deuda que QC-14 ya había dejado escrita y que sigue sin `.gitattributes` detrás.

### Deuda que hereda

- **`pnpm run build` corre el seed**, así que en un entorno nuevo una `SEED_ADMIN_PASSWORD` que no
  cumpla la política **aborta el arranque del despliegue**. Consecuencia querida de R18 y prevista
  en `design.md > 7.2`, pero hay que leerla antes de cargar las variables en Vercel.
- **La guardia no comprueba el ORDEN de las llamadas**: verifica que la política se referencia
  antes de hashear, no que se evalúe primero en tiempo de ejecución.
- **`wt.sh done` sigue sin cerrar en Windows** cuando el worktree tiene `node_modules` de pnpm.
  Van dos features seguidas (QC-6 y QC-19) rematadas a mano con `rmdir /s /q` + `git worktree
  prune`. Ya no es una anécdota: es el comportamiento por defecto del script en esta máquina.
