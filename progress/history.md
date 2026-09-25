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

## QC-24 — modelo-recetas (2026-09-02)

PR [#15](https://github.com/nuformecuador-lgtm/QuimiCloude/pull/15), merge `81e3ffc`. Épica
**QC-27 Recetas** —creada el mismo día por decisión humana, separándola de Inventario—,
`zone: backend`, `complexity: high`. 33 requisitos EARS, los 33 con su test. `./init.sh` completo
en verde antes del PR: **51 archivos, 551 tests**.

### Lo que la hace distinta

**Es el primer módulo hexagonal creado desde cero.** `identity` e `inventario` los produjo la
migración de QC-15; aquí se funda uno, con su dominio, sus puertos, sus adaptadores y su barrel.

**Y obligó a que `inventario` publicara un contrato que no existía.** Su barrel era literalmente
`export {}`. Una línea de receta apunta a un producto y QC-15 prohíbe consultar el modelo ajeno,
así que nace `lib/modules/inventario/domain/product-catalog.ts` con `ProductId`, `ProductRef`
(`id`, `name`, `unit` — deliberadamente sin costo ni existencia) y la interfaz `ProductCatalog`,
reexportados **como tipos**. La interfaz vive en el dominio de `inventario` y no en
`recetas/ports/` con un argumento que decidió el `spec_author`: implementarla exige ejecutar
`prisma.product`, y eso solo puede hacerlo un adaptador driven del módulo dueño. La
implementación y el cableado quedan para QC-25, y `lib/composition/index.ts` **no se toca** — hay
una task que lo verifica.

**Tres FK cruzan de módulo y ninguna guardia lo detectaría.** `product_id`, `created_by` y
`updated_by` van como **escalares sin `@relation`**, con la FK a mano en el `migration.sql`. Con
`@relation` el gate pasaría en verde igual y cualquiera cruzaría la frontera con un `include`.

**Las FK de auditoría en `RESTRICT`, no `SET NULL`.** `created_by`/`updated_by` son anulables y
`NULL` significa «no la creó una persona» (una importación, un seed), no «se perdió el dato». Con
`SET NULL`, borrar un usuario convertiría sus recetas en lo primero. Lo detectó el `spec_author`
al incorporar la decisión humana del autor anulable; nadie se lo había pedido.

### El rechazo, y lo que destapó

El `reviewer` **rechazó dos veces** antes del OK, las dos por rojo real, y las tres rondas las
resolvió **midiendo por mutación** —replicando los predicados y rompiéndolos a propósito— en vez
de leer la bitácora.

Lo que destapó es un patrón, no un bug: **cinco aserciones en QC-14 y QC-19 afirmaban el censo
global del repo** («exactamente N modelos», «exactamente estas 4 migraciones», «el barrel es
literalmente `export {};`»). Se rompen en cuanto llega cualquier feature que añada algo, y
**`./init.sh --rapido` no las corre** porque leen las fuentes del disco y `vitest related` no las
engancha: el rojo aparece tarde, en el gate completo de quien llega después, y parece culpa suya.
Las cinco se **acotaron, ninguna se borró**, y el reviewer confirmó que quedaron **más estrictas**
—contar por `/// @module`, vigilar lo que el barrel reexporta— con dos huecos estrechos anotados.
Hubo un sexto fallo escondido: un barrido leía el esquema **con los comentarios dentro** y lo
rompía un comentario de QC-24 que dice que una línea de receta «no es un hecho histórico».

### El falso rojo, y la lección de método

El leader afirmó que `origin/dev` estaba roto porque el validador daba «faltan specs para features
sdd en vuelo: QC-29», y **avisó a las cuatro sesiones locales antes de verificarlo en la fuente**.
Era falso: `tieneSpec()` busca el spec en **tres** sitios y el tercero es `.worktrees/<slug>/specs/`,
deliberadamente, para que una feature en vuelo no dé rojo. Desde la raíz pasa; desde dentro de un
worktree esa tercera búsqueda desaparece. **El rojo lo fabricaba el cwd.** Se retractó ante las
cuatro sesiones y nadie llegó a commitear nada, pero una sesión estuvo a punto de tocar la rama de
otra por un diagnóstico sin verificar. La lección: leer la fuente **antes** del aviso, no después.

Debajo sí hay un problema real, reproducido por dos sesiones (QC-24 y QC-21): **el gate previo al
PR se corre desde el worktree por diseño** (F2.4 valida tu rama, no el árbol de `dev`), y es justo
desde donde el validador miente. Con dos features en vuelo —lo normal, con tope de 2 por zona—
cada worktree ve como faltante el spec de la otra.

### Deuda que hereda

- **`WT_DIR` del validador se resuelve contra el cwd**, no contra el worktree principal. `wt.sh` ya
  aprendió esa lección y tiene el comentario que lo explica; `validate-features.mjs` no la heredó.
  Candidato a `/afinar-regla`, encargado por el humano.
- **Tests que afirman el censo global de un recurso compartido.** Cinco casos aquí, más los
  precedentes de QC-6 y QC-7 que aportó otra sesión. Misma regla pendiente.
- **QC-20 toca los mismos dos archivos** (`db/schema.prisma` y `inventario-schema.test.ts`) y
  también estrechó ese test por su cuenta. El segundo en mergear tiene conflicto de contenido real:
  **hay que quedarse con la unión**, no resolver a favor de una versión.
- **`wt.sh done` volvió a fallar en Windows**, tercera vez el mismo día. Rematado con `rm -rf` +
  `git worktree prune`.
- El **MCP de `atlassian` se cayó** a media feature: dos llamadas abortaron por timeout y el
  comentario de F1.3 y la transición de F2.0 se escribieron a posteriori, recogidos en el
  comentario de cierre. El disco estuvo al día en todo momento — el ciclo no depende de Jira.

## 2026-09-02 — QC-29-tema-claro-oscuro

Sustituye la paleta acromática de `shadcn init` por la del diseño aprobado —base agua
(`#cceae8` → `#539091`) con acento naranja— definida en `:root` y `.dark` sobre los mismos
tokens y en oklch, y añade la elección de modo: claro, oscuro y seguir al sistema, con el
sistema por defecto. La barra lateral pasa a panel flotante con degradado tenue. PR #16,
merge `afd9054`.

- **Requisitos cubiertos:** R1–R29, los 29 con evidencia ejecutada. 10 decisiones, 20 tareas.
- **Gate:** 60 archivos / 591 tests en verde; E2E 8/8 en chromium y webkit en frío.
- **Reviewer:** aprobado en segunda ronda, 0 mayores y 6 menores.

### La feature nació de un diseño, no del board

Es la primera del repo en ese orden: el humano aprobó un canvas de diseño y **después** pidió la
feature. El issue se creó en Jira antes de tocar el JSON, para no invertir el orden que exige
`docs/jira.md`, y los tokens del canvas se convirtieron a oklch con la transformación sRGB→OKLab
y se sembraron en `specs/QC-29-tema-claro-oscuro/design-input-tokens.md` **antes** de lanzar al
`spec_author`, para que no inventara colores.

### La aprobación con cambios reabrió la fase 1

El `spec_author` propuso `next-themes` y la dejó como fila `excepcion` porque falla el check de
frescura (18 meses sin publicar). El humano la rechazó. Eso invalidaba D9, el anti-parpadeo y
varios requisitos, así que **la ficha volvió a F1.2 en vez de arrancar el implementer**: un spec
que asume una librería descartada implementa otra cosa. La revisión conservó la numeración de los
27 requisitos que sobrevivían y añadió R28 (nada entra en `package.json`) y R29 (la cookie de tema
es preferencia de UI, no dato de sesión).

Al perder la librería, el anti-parpadeo pasó de configuración a diseño propio — y salió ganando:
el script vive como constante de texto y **se puede ejecutar en un test**, cosa que con la
librería no se podía.

### El E2E encontró un fallo real de producto, y por poco no se corre

`e2e/theme.spec.ts` se escribió pero quedó sin ejecutar (T12). El reviewer lo marcó como el único
hallazgo mayor: «escrito no es corrido». Al correrlo: **3 de 8 en rojo**. Uno era del test —la
sonda miraba el primerísimo frame y con HTML en streaming puede haber un frame sobre un documento
sin nada pintado—, pero el otro **era producto**: `useThemeState` solo reaccionaba al evento
`change` de `matchMedia` y **nunca re-sincronizaba el DOM al montar**, así que un cambio de
`prefers-color-scheme` ocurrido entre el script inline y la hidratación se perdía hasta recargar.

Habría llegado a producción con 591 tests unitarios en verde. Es el caso de libro de por qué la
regla 5 distingue «compila» de «funciona».

Las mordidas midieron que las dos piezas sostienen peso: sin el listener cae chromium, sin la
re-sincronización de montaje cae webkit — allí el efecto pasivo corre ~15 ms después de aparecer
la fibra.

### Dos verdes falsos que no eran de la feature

- **`test:rapido` premió un olvido.** El implementer no commiteó, y el modo rápido calcula qué
  correr desde el diff **entre commits** contra `origin/dev`. Diff vacío → «no toca código con
  tests» → verde en 3 segundos sin ejercitar una línea. Se detectó porque el mensaje no cuadraba
  con 18 tareas de implementación.
- **`playwright ... | tail` devolvió `exit 0` con tres tests rojos.** El código de salida era del
  `tail`. Si eso ocurre dentro de un script encadenado, el gate canta verde con la suite roja.

### Deuda que hereda

- **Tres puentes de specs ajenos** entraron en `dev` con el PR #16 (QC-24, QC-9, QC-21) para que
  el validador no bloqueara el gate. QC-24 y QC-9 ya los sustituyó la versión buena de sus
  sesiones; **la semilla corta de QC-21 sigue siendo la única versión en `dev`** y, si su PR
  resuelve el `add/add` a favor de `dev`, se pierde su spec. Avisado a la sesión que la lleva.
- **Puentear la semilla en vez del estado final es el error a no repetir:** el puente de QC-9 tenía
  47 líneas contra 189 de la versión real. La lección la aportó otra sesión: copia el estado final
  del worktree, sale gratis y no genera conflicto.
- La **re-sincronización de montaje no tiene test unitario**: hoy su única red es la temporización
  de webkit en el E2E. Menor del reviewer, candidato a ficha.
- `design.md` describe mal dónde acaba el `<script>`: **React 19 lo iza de `<body>` al `<head>`**.
- **Cuatro preguntas abiertas** sin resolver: los `--chart-*` sin consumidor, el ancho móvil de
  288 px que no se puede cambiar sin editar `components/ui/`, la persistencia local al navegador,
  y si el login quiere control propio de tema — esa la recoge QC-30.
- **`wt.sh done` falló otra vez en Windows** (cuarta el mismo día): desregistró el worktree pero
  dejó el árbol; rematado con `rm -rf` + `git worktree prune`.

## QC-21 — ayuda-visual-de-contrasena (2026-09-02)

El componente reutilizable que muestra los requisitos de una contraseña nueva y cuáles se van
cumpliendo mientras se escribe, pintado a partir del catálogo `CREDENTIAL_RULES` que exporta QC-19
y **sin redeclarar ninguna regla**. PR #17, merge `3775102`. Los 22 requisitos (R1–R22) con test
ejecutado; `./init.sh` completo en verde: 63 archivos, 626 tests, 78 guardias. Seis archivos
nuevos, cero modificados de producción ajena. Sin dependencias nuevas.

**La ficha nació sin sitio donde vivir, y eso lo descubrió la acotación, no el spec.** Hoy ninguna
pantalla del producto fija o cambia una contraseña: el login solo verifica. Tirando de ese hilo
apareció algo peor — `must_change_credential` lo escribe el seed de QC-6 y **no lo lee nadie**, así
que el usuario inicial nace obligado a cambiar su contraseña y no tiene por dónde. Decisión humana:
construir el componente igual y crear **QC-36 (cambiar-mi-contrasena)** como su primer consumidor.
La columna muerta pasó a tener ficha.

### La lección: dos bloqueantes, y ninguno era un fallo de código

- **B1 — un test que habría roto el gate de las features siguientes.** El centinela de R19
  afirmaba sobre el diff de git *de la rama que lo ejecutara*. En cuanto esta rama se fusionara,
  toda rama posterior que tocara `app/`, `db/` o `lib/` habría fallado **por archivos ajenos**. El
  ancla añadida para compensar era una **tautología** —comparaba rutas de `components/shared/`
  contra `app/`— y el comentario le atribuía una garantía que no daba. Cerrado borrando la
  invocación a `git` entera: R19 se verifica sobre el **contenido** de los tres artefactos.
  Es el cuarto incidente del mismo patrón: QC-6, QC-7, QC-14/QC-19 y este.
- **B2 — un requisito insatisfactible en un spec aprobado.** R5 exigía que con el campo vacío se
  mostraran *las seis* reglas incumplidas. Son **cinco**: `max_length` está cumplida con la cadena
  vacía. El implementer tenía tres salidas malas a mano —inventar el estado en el componente,
  tocar QC-19, o reescribir el requisito por su cuenta— y **no tomó ninguna**: lo subió como
  pregunta abierta y el humano aprobó la redacción corregida.

### Un test que se sabe fuerte porque se midió

Al cerrar m-5 el implementer verificó su propia mordida y descubrió que **la obvia no era
discriminante**: invertir la derivación en el componente pone rojos también a los dos tests
espejo, porque llaman a la función pura directamente y no a través de `deriveState`. La que separa
es alterar el criterio **en el dominio**: ahí los espejos siguen verdes —comparan el componente
contra el mismo criterio equivocado— y solo el mapa literal muerde. El reviewer lo reprodujo: 3
rojos con la mordida fácil, 1 rojo y 12 verdes con la buena. Los espejos que quedan llevan escrito
**qué clase de fallo no atrapan**.

El implementer además **rechazó dos veces sugerencias del reviewer** con razón: afirmar que
`components/shared/` contiene exactamente tres archivos era un censo de recurso compartido, y
QC-29 estaba escribiendo `theme-provider.tsx` en esa misma carpeta — habría puesto rojo el gate de
la otra sesión. El reviewer aceptó la corrección.

### Cuatro sesiones sobre el mismo repo, y lo que costó

- **El `add/add` del spec.** La versión SEMILLA de `requirements.md` (57 líneas) llegó a `dev` por
  el PR #16, porque el gate de esa sesión salía rojo sin ella. Al sincronizar apareció el conflicto
  y se resolvió a favor de la rama: al revés habría perdido 120 líneas **y reintroducido el
  requisito insatisfactible de B2**. Se supo porque esa sesión avisó, no porque el conflicto lo
  dijera.
- **El falso rojo del validador**, que bloqueó tres veces a cuatro sesiones: `WT_DIR = '.worktrees'`
  (`scripts/validate-features.mjs:18`) se resuelve contra el cwd, así que **desde dentro de un
  worktree** —que es donde el arnés manda correr el gate previo al PR— no encuentra los specs que
  viven en otros worktrees. `scripts/wt.sh` ya resuelve contra el worktree principal y explica por
  qué; el validador no heredó esa lección. Una sesión estuvo a punto de commitear el spec de una
  tercera a `dev` para "arreglarlo".
- **`docs/jira.md` dice «Manda Jira»**, no que gane el disco. Esta sesión afirmó lo contrario
  fiándose de una frase de `progress/current.md` escrita por otra sesión, que era correcta en su
  contexto y se generalizó mal. Mismo modo de fallo que el `design.md` de QC-7: mientras la frase
  esté escrita, nadie va a mirar la fuente.
- **`feature_list.json` envejece en minutos** con cuatro sesiones vivas: cuatro mutaciones bajo los
  pies en una sola tanda. Un casi-choque en QC-20 se evitó porque la ficha decía `spec_ready`
  mientras el board decía *En curso* y la rama tenía 28 commits. **F0 no es solo del arranque de
  sesión**, y eso es el mejor candidato a regla que dejó el día.
- **El fin de línea fabricó tres conflictos falsos**, uno de ellos de 2269 líneas que al normalizar
  las tres versiones se quedó en **cero**. Sigue sin haber `.gitattributes`.

### Deuda que hereda

- **El input mide 32px** frente a los 44x44 recomendados como objetivo táctil. Excepción declarada
  en `design.md > 6` con su pregunta abierta; el alcance es de QC-29/QC-30. **Cerrar antes de que
  QC-36 lo ponga delante de una persona.**
- **`guard-password-never-plaintext` no barre `components/`** y, además, **no ve `readonly
  nombre?:`**: su regex exige los dos puntos pegados al identificador y el `?` los separa — justo
  la forma que usan todas las props de esta feature. Documentado de forma **ejecutable** con un
  centinela local; ampliar la guardia es `/afinar-regla`.
- **Nadie ve este componente hasta QC-36.**
- Importar del archivo de la guardia **duplica la ejecución de sus 6 tests**, así que infla el
  recuento: de +35 sobre el baseline, 29 son nuevos de verdad.

## QC-20 — crud-de-productos (2026-09-02)

Los casos de uso del catálogo sobre el modelo de QC-14: alta, consulta paginada, edición y borrado
de productos y de presentaciones, autorización en el service, validación de borde con zod, dos
columnas de auditoría con su migración, el util de paginación y las nueve Server Actions que
consumirá QC-22. PR #19, merge `1be1021`.

**Los 37 requisitos tienen test, y ninguno se dio por hecho leyendo código: 40 mutaciones
verificadas.** `reviewer` en dos rondas — RECHAZADO (1 mayor, 10 menores) y APROBADO (0 mayores).

### La lección: los tests que vigilan alcance son invisibles para `related`, y caducan solos

Esta feature rompió los tests de alcance de **tres** features anteriores, y siempre por la misma
razón: QC-14 afirmaba que el módulo `inventario` no tiene `domain/` ni contrato, QC-19 enumeraba
las cuatro migraciones que existían el día que se escribió, y QC-24 daba por hecho que `inventario`
publica solo tipos. **Las tres afirmaciones eran ciertas cuando se escribieron y ninguna podía
sobrevivir a la feature siguiente.**

Peor: `vitest related` **no los selecciona nunca**, porque leen el árbol de archivos y no importan
nada. Uno de ellos llevó **rojo desde el primer grupo de tasks y pasó por debajo de dos gates
rápidos en verde**. Se descubrió por casualidad, al exigirle a una task que corriera `tests/unit/`
y `tests/ui/` enteros en vez de solo lo relacionado.

El criterio con el que se resolvieron los tres: **una feature no puede cumplir la afirmación de
alcance de otra**, así que se retira exactamente la cláusula que caducó —ni una más—, se documenta
qué afirmaba y adónde pasa lo que seguía vigilado, y se comprueba que la versión heredada **puede
ponerse roja**.

### Tres afirmaciones falsas en el propio `design.md`, las tres encontradas buscándolas

Una decía que se mantenía una comprobación previa de duplicados que el puerto no permite hacer;
otra describía un entorno con el stub de sesión de QC-7 cuando QC-7 y QC-8 llevaban horas `done`; y
la tercera —la que bloqueó el PR— repetía la primera en la **sección normativa**, en el doc-comment
del puerto y en `db/schema.prisma`. Esa era la peor: el doc-comment del puerto es lo primero que van
a leer QC-22 y QC-25, y les decía que faltaba implementar algo imposible.

**Un documento que afirma algo falso es peor que uno incompleto**, porque manda al siguiente a
buscar donde no hay nada. Es el mismo patrón que costó una ronda entera de revisión en QC-7.

### Cinco tests que no podían fallar

Aparecieron cinco en la sesión, todos encontrados **ejecutando o mutando, ninguno leyendo**: uno
que construía el dato con el mismo error que el código, otro donde el propio test fijaba el
resultado que decía observar, una aserción que miraba el nombre del archivo en vez de la ruta
completa, un barrido que encontraba una cadena prohibida **dentro de un comentario**, y un
`it.each` de tres casos donde el valor nunca influía.

La respuesta estructural está en R20 y R21: en vez de mutar a mano y confiar, quedan **dos tests
permanentes** que tiran el índice único y la FK dentro de una transacción con `ROLLBACK` y afirman
que la operación prohibida pasa a ser posible. Una mutación manual demuestra que el test servía
hoy; un test permanente **impide que se vuelva verde por construcción mañana**.

### Tres decisiones por encima del spec

1. **`ON DELETE RESTRICT` en las FK de auditoría.** El spec no fijaba la acción. La razón principal
   es una propiedad del dato: con `SET NULL`, un `NULL` sobrevenido sería **indistinguible de un
   `NULL` histórico** —las filas anteriores a la migración nacen sin autor porque la columna es
   anulable a propósito—, así que la atribución se perdería sin rastro y sin ser auditable. La
   convención del repo (las otras tres FK ya usaban `Restrict`) es el argumento secundario: la
   convención puede cambiar, la propiedad del dato no.
2. **Estrechar los tests de alcance de QC-14 y QC-19**, con el criterio de arriba.
3. **Reformular una aserción de QC-24, acordada con esa sesión**: de «todo export del contrato es
   `export type`» a «todo import del barrel de `inventario` desde fuera de `lib/composition/` debe
   ser `import type`». La vieja retrataba un estado transitorio; la nueva expresa la garantía real
   y sobrevive a que `inventario` publique superficie. Se verificó que la guardia hexagonal **no**
   cubría eso —permite importar el barrel ajeno en runtime— antes de tocarla.

### Coordinación entre sesiones: lo que costó y lo que ahorró

La feature convivió con hasta **cuatro sesiones de leader** sobre el mismo repo. El balance es
medible: cuando dos acotaron el mismo test **sin hablarlo**, acabó en conflicto de contenido con
una incompatibilidad real debajo; cuando se habló antes, **salió un test mejor que el de
cualquiera de las dos**, por tres mensajes.

Dos incidentes concretos: una sesión estuvo a punto de arrancar la fase 2 de esta feature en
paralelo porque leyó «worktree limpio + 72 minutos sin commits» como feature huérfana —era el
implementer esperando al leader—; y otra entró a resolver los conflictos del PR **sin esperar
respuesta** al aviso, y su `git merge --abort` dejó un commit con **un solo padre y sin los
archivos de la rama ajena**, con un mensaje que describía un merge que no había ocurrido. Se
detectó con `git merge-base --is-ancestor origin/dev HEAD`.

De ahí salen dos reglas que van a `/afinar-regla`: **avisar antes de tocar un test de alcance ajeno
o de escribir en un módulo ajeno**, y **anotar en `progress/current.md > Conflictos pendientes` qué
ficha lleva cada sesión** — esa sección existía desde el principio y nadie la había usado para eso.

### Deudas que hereda

- **`scripts/db-rollback.ts` no encadena y puede revertir la migración equivocada.** Elige por el
  último directorio del disco y **nunca consulta `_prisma_migrations`**. Dos ejecuciones revierten
  la misma; sale con éxito cuando no ha revertido nada; y si en disco hay una migración posterior
  **aún no aplicada** —situación que se dio durante horas—, ejecuta **su** `down.sql` contra una
  base donde nunca se aplicó. **Es la deuda que puede destruir datos.**
- **Los puertos no aceptan `TransactionClient`**, así que los tests que ejercitan el adaptador usan
  fixtures reales con borrado en `finally` en vez de `SAVEPOINT` + `ROLLBACK`. Arreglarlo cambia la
  firma de nueve métodos.
- **La composición de dos `down.sql` no está verificada** — no por dejadez, sino porque la
  herramienta no lo permite.
- El estado generado (cliente de Prisma, tipos de Next) y el esquema de la base **quedan por detrás
  tras cada merge**, y el síntoma siempre señala a la feature ajena que introdujo el cambio.

## QC-9 — proteccion-de-rutas-privadas (2026-09-02)

PR [#21](https://github.com/nuformecuador-lgtm/QuimiCloude/pull/21), merge `864eeb7`. Épica QC-17,
`zone: backend`, `complexity: high`. **30 requisitos EARS**, los 30 con test. `./init.sh` completo
en verde antes del PR: **89 archivos, 957 tests**; E2E en **chromium y webkit**.

### Por qué era `high`, y no por tamaño

El middleware corre en el **runtime del borde**, donde `node:crypto` no existe — y la sesión de
QC-8 se firmaba justo con eso. Las dos salidas fáciles eran malas: no validar la firma en el borde
(dejar pasar cookies caducadas o falsificadas hasta la página), o escribir un **segundo HMAC**, que
es exactamente lo que prohíbe R5 de QC-8. Se eligió la tercera: **migrar la firma a WebCrypto**
(`crypto.subtle`), que existe en los dos entornos, manteniendo **una sola implementación**.

**La salida es idéntica byte a byte** a la anterior —mismo algoritmo, misma clave, mismo mensaje,
misma codificación sin relleno—, y hay un test que lo afirma contra `node:crypto` directamente. Ese
detalle es lo que permitió tocar código de una feature mergeada con red: `session-cookie.test.ts`
recalcula la firma por su cuenta, así que siguió siendo un **oráculo** de la implementación vieja
contra la nueva. Nada de `Buffer` en el codec: `btoa`/`atob`, porque `Buffer` no es API del borde.

### La decisión humana que se giró a mitad

El rol pasa a viajar **dentro** del token para que el middleware compruebe permisos sin base de
datos. Eso cambia el formato, así que **D3 —«el formato no cambia»— quedó derogada el mismo día**,
y se conservó **tachada y con el motivo del giro escrito**: no había sesiones vivas, así que su
único argumento dejó de existir. Un token `v1` se rechaza **sin llegar a verificar su firma**.

Con dos límites escritos, no disimulados: el token va **firmado, no cifrado** —cualquiera puede
leer su payload, nadie puede falsificarlo, y por eso no viaja nada más que `sub`, `iat`, `exp` y
`role`—; y el rol firmado es **una foto** que envejece hasta la caducidad, con test de
caracterización que **QC-23 pondrá rojo** al implementar la revocación.

### Lo que destapó, que valía más que la feature

**Dos guardias de seguridad estaban ciegas.** `guard-firma-sesion-unica` y
`guard-arquitectura-modulos` quitaban los comentarios **de bloque antes que los de línea**: un `//`
que contuviera `app/**` abría un bloque falso y se tragaba los imports siguientes. Sobre el
`middleware.ts` real, `stripComments` devolvía literalmente `"\n\n\n\n\n\n\nexport const config
= {...}"` — la guardia **pasaba en verde sin haber mirado nada**. No lo introdujo QC-9; estaba
desde antes y afectaba a la evidencia de tres requisitos. Reproducido por el reviewer revirtiendo
el orden (caen 3 tests), arreglado y con regresión anclada sobre el archivo real.

**Y su E2E encontró que `dev` llevaba rota la zona privada entera.** `PRIVATE_NAV_ITEMS` metía
componentes de `lucide-react` en datos que cruzan a un Client Component, así que toda ruta privada
devolvía 500 — introducido por el PR #18. Mientras tanto dos ramas daban 794 y 642 tests en verde,
y los dos números eran ciertos: **el gate no corre E2E**, `login.spec.ts` pasa en verde con esos
500 en el log porque espera por **ruta** y no por contenido, y **en jsdom no existe la frontera
servidor/cliente**, así que ningún test unitario podía verlo. Lo arregló la sesión dueña del
sidebar; su defensa —`guard-nav-serializable`, que afirma sobre **el dato** y no sobre el render—
es el patrón a copiar.

### Coordinación entre sesiones

Se trabajó con **cuatro sesiones en paralelo**. De ahí salieron dos lecciones caras: **avisar no es
coordinar si no esperas la respuesta** —este leader entró en el worktree de QC-20 tras avisar y sin
esperar, y tuvo que abortar—, y **un falso diagnóstico anunciado antes de verificarlo casi provoca
un commit indebido**: se afirmó que `dev` estaba roto por un spec faltante cuando el rojo lo
fabricaba el `cwd` del validador. Se retractó ante las cuatro sesiones y nadie llegó a actuar.

### Deuda que hereda

- **Next 16.3 deprecó `middleware.ts`** en favor de `proxy`. Funciona hoy; no se cambió porque el
  spec congelado ordenaba `middleware.ts`. **Ficha propia.**
- **El E2E de R24 no distingue «el `next` funcionó» de «cayó al dashboard por defecto»**, porque
  hoy el dashboard es a la vez destino y fallback. Quien discrimina es `login-form.test.tsx`.
  Cuando exista la pantalla de productos, ese recorrido debe pedir **esa** ruta.
- **Un cambio de rol tarda hasta 8 h en surtir efecto.** Decidido aquí, implementado en **QC-23**.
- **Tras un merge, el estado generado del worktree y el esquema de la base quedan por detrás**, y
  el síntoma **apunta siempre a la feature ajena**: aquí, un `typecheck` rojo señalando a
  `product-prisma.test.ts` de QC-20 y cinco archivos de integración en rojo, los dos por cliente de
  Prisma y migración sin aplicar. Ninguno era un defecto.
- **`wt.sh done` falló otra vez en Windows.** Van cuatro veces el mismo día.


## QC-32 — modelo-unidades (cerrada el 2026-09-03, PR #22, merge `0b7aacc`)

Primera feature de la épica **QC-37 — Catálogos**. Crea el catálogo de unidades de medida como
**módulo hexagonal propio `unidades`** —no como parte de `inventario`— y reapunta a él la unidad
del producto y la de la línea de receta, que hasta hoy eran texto libre. Con eso **se cierra la
pregunta abierta n.º 1 del dominio**, que QC-14 había dejado como texto libre el 2026-09-01
asumiendo a conciencia el coste de normalizar después. Desbloquea **QC-33** y **QC-38**.

Gate final: **94 archivos, 1020 tests**. Reviewer **APROBADO con 0 mayores** tras rechazar en la
primera ronda.

### Tres rondas, y la tercera borró el trabajo de la segunda

- **Ronda 1 — RECHAZADO por un bloqueante real.** R25 y R26 estaban mapeados a tests que probaban
  una **copia** del adaptador driven del seed, no el de producción: tres mutaciones sobre
  producción dejaban los 1025 tests en verde. Es el mismo fallo que hundió la primera ronda de
  QC-30 y la razón por la que el reviewer muerde cada requisito en vez de contar tests verdes.
- **Ronda 2 — cerrada pero nunca firmada.** Se pasó el adaptador a fábrica
  `createUnitSeedRepository(db)`, con el patrón de `createInitialAccessRepository` de `identity`,
  y seis mutaciones lo verificaron en rojo. **Doce intentos de reviewer murieron por errores de
  servidor de la API** (un 500 y once 529) y esa firma no llegó nunca.
- **Ronda 3 — el humano borró el problema en vez de arreglarlo.** Decidió que, no existiendo
  ningún dato de unidades en el sistema, el aparato del seed sobraba: las **cuatro** unidades
  básicas (`mililitro/ml`, `litro/l`, `gramo/gr`, `kilogramo/kg`) las inserta **la propia
  migración**. Eso **disolvió MAYOR-1 eliminando su objeto** y adelgazó la feature en 7 archivos
  —caso de uso, `STARTER_UNITS`, puerto, adaptador Prisma y tres de test—, más el cableado en
  `lib/composition` y la llamada en `scripts/seed.ts`.

### Lo que hay que recordar de aquí

- **Un aparato hexagonal completo para insertar cuatro filas era el defecto, no el bloqueante que
  contenía.** El reviewer encontró un fallo real dentro de una estructura que no debía existir. La
  pregunta «¿esto necesita puerto y adaptador?» sale más barata antes del spec que después de dos
  rondas de revisión.
- **Meter el normalizado a mano en el SQL duplica la normalización**, y el riesgo era que el test
  comparase el SQL consigo mismo. El reviewer **mutó `normalizeUnitName` misma** y cayeron dos
  casos: R26 ata **los dos extremos** del duplicado. Ese es el listón para cualquier valor
  derivado que se escriba a mano en una migración.
- **Una guardia cuyo sujeto desaparece es la forma más silenciosa de quedarse sin guardia.** Al
  borrar el adaptador driven, la lista exacta de archivos que consultan `units` en
  `module-contract.test.ts` quedó **vacía**. Pasó de «exactamente un sitio» a «ninguno» —más
  estricto— y se verificó metiendo un `prisma.unit.findMany` en un archivo real.
- **`tests/` fuera del barrido de fronteras es legítimo**: R15/R16 hablan de módulos y un fixture
  no lo es. Extenderlo volvería el requisito **incomprobable** contra base real, porque
  `recipe_lines.unit_id` es `NOT NULL` con FK y los tests tienen que crear su unidad.
- **La corrida larga del gate rompe el stream de los subagentes.** Volvió a pasar dos veces: el
  implementer murió las dos en `./init.sh`. En cuanto el leader se lo quitó de encima —que es lo
  que `AGENTS.md` ya mandaba— el mismo agente terminó sin incidencias.
- **El estado en disco salvó la sesión.** Con quince caídas de API, el encargo pendiente escrito
  en `progress/current.md` permitió reanudar sin reconstruir nada y sin perder una línea.

### Deuda que deja

- **menor-6, el único con cobertura real:** ninguna aserción automática comprueba las cuatro filas
  **en la base**; la evidencia es el log de la tarea. `unidades-constraints.int.test.ts` ya corre
  contra Postgres y un caso acotado costaría poco.
- **menor-7 y menor-8:** deriva de documentación — la tabla de trazabilidad de `tasks.md` (R16 y
  R19) y el mapa `R<n> → test` del parte citan artefactos borrados.
- **menor-9:** la mitad negativa de R26 se apoya en una lista de nombres literales. **Para QC-38.**
- **Preguntas abiertas que siguen abiertas:** si el símbolo debe ser único cuando existe (n.º 1) y
  si presentación y unidad convergen algún día (n.º 3). La n.º 2 se cerró por los hechos —la base
  estaba vacía— y la n.º 4 la cerró el humano en la ronda 3.
- **Montar un worktree no deja el árbol compilable:** además del `.env` hacen falta `pnpm install`
  y `pnpm exec next typegen`, o `app/layout.tsx` no compila por `LayoutProps`, que vive en
  `.next/types` (git-ignorado), **y el gate sale rojo por algo ajeno**. `docs/worktrees.md` no lo
  dice. Candidato a `/afinar-regla`.


## QC-25 — crud-de-recetas (2026-09-03)

PR [#23](https://github.com/nuformecuador-lgtm/QuimiCloude/pull/23), merge `1001ec1`. Épica QC-27,
`zone: backend`, `complexity: high`. **50 requisitos vigentes con test** —R15 derogado y tachado—,
19 tasks, **27 decisiones cerradas**. `./init.sh` completo verde antes del PR: **108 archivos,
1118 tests**. `reviewer` en **dos rondas**: RECHAZADO con 2 mayores → APROBADO con 0.

### El hallazgo que justifica la revisión entera

`findProductRefs` filtraba con `deletedAt: null`, y esa cláusula era **el único sitio del repo**
donde vivía la regla «el catálogo solo devuelve productos vivos», de la que cuelga la mitad
prohibitiva de R46. **Se podía borrar y la suite entera seguía verde.** Y el `describe` se llamaba
«findRefs devuelve solo los productos vivos» mientras su único caso probaba la lista vacía: un
nombre que promete una garantía que el cuerpo no comprueba. El propio implementer había dejado
escrito en un comentario que la cobertura real la daba el test de integración; se fue a mirar y no
estaba. **Es el segundo caso de este patrón en el repo** —el primero fue QC-30, donde se podía
borrar el modo oscuro entero con la suite verde—, así que ya no es anécdota: es el fallo que esta
revisión existe para cazar.

En la **ronda 2** el reviewer ejecutó **12 mutaciones por su cuenta**, sin creerse ningún reporte:
**11 murieron**, cada una revertida dejando el árbol idéntico. La superviviente se dejó escrita
como deuda en vez de taparse.

### QC-32 llegó a mitad de la implementación

`QC-32 — modelo-unidades` se mergeó en `dev` **mientras QC-25 se implementaba** y cambió la unidad
de la línea de texto libre a FK. La decisión cerrada de la mañana **había anticipado por escrito
esa sustitución exacta** —«cuando QC-32 llegue, la validación “unidad vacía” se sustituye por “la
unidad existe en el catálogo”»—; lo que no anticipó es que ocurriera el mismo día. R15 quedó
**derogado y tachado con su motivo**, sustituido por **R50**, igual que se hizo con la D3 de QC-9.

Y dejó una lección de proceso: **R50 recorrió requirements → tasks → código saltándose el diseño**,
que es lo que prohíbe la regla 2. El código salió correcto, pero `design.md` quedó contradiciendo
al código y fue el segundo hallazgo mayor. Un cambio de alcance a mitad de implementación **tiene
que pasar por los tres artefactos**, no por dos.

### Cinco cortes 529 y lo que enseñaron

El `implementer` murió **cinco veces seguidas** con `529 Overloaded` antes de escribir una línea, y
las cinco perdieron el 100 % del trabajo. Se probó esperar, reanudar el mismo subagente y lanzar
uno nuevo con contexto limpio: los tres fallaron igual —o sea que **no era la transcripción
acumulada**—. Se resolvió lanzándolo con **Sonnet**, con el override y su razón escritos como manda
`AGENTS.md > Modelos`, y compensando con una revisión más dura, que es exactamente la que encontró
los dos mayores.

**Lo aprovechable, y es material de `/afinar-regla`:** `AGENTS.md` ya documentaba cinco subagentes
muertos en corridas largas de verificación, pero solo sacó de ahí una regla sobre el gate. Faltaba
decir que **un subagente escribe en disco a medida que avanza** —marca cada task en cuanto cierra y
commitea al cerrar cada grupo—. Con eso un corte cuesta la tanda en curso; sin eso costó todo,
cinco veces. Es la regla 3 aplicada al subagente y no solo al chat. En cuanto se le dijo, la tanda
siguiente sobrevivió y dejó seis commits.

### Dos bugs reales que los dobles no veían

Los dos aparecieron solo al correr integración contra Postgres de verdad:

- `sqlStateOf` no reconocía `PrismaClientUnknownRequestError` —la clase que esta versión de Prisma
  lanza cuando revienta un `CHECK` dentro de un `create` anidado—, así que la traducción a
  `ValidationError` **fallaba en silencio**.
- Cualquier `P2002` se traducía a «ya existe una receta con ese nombre», incluido el del índice de
  `recipe_lines`.

### La base de datos compartida bloqueó la feature

Varios worktrees compartían **una sola base física**, y la sesión hermana aplicó ahí migraciones de
QC-32 y QC-42 que renombraron columnas: 24 de 38 casos de integración caían por columna inexistente,
incluidos casos de QC-24 que ya estaban verdes. Se resolvió dando a QC-25 **base propia**
(`QuimiCloude_QC25`, borrada al cerrar), replicando lo que ya se hizo con `QuimiCloude_QC20`.
**Es la segunda vez que se arregla a mano y no hay nada en `wt.sh new` ni en `docs/worktrees.md`
que lo automatice.** El implementer hizo lo correcto: paró y escaló en vez de improvisar.

### Decisiones con consecuencia, aceptadas con los ojos abiertos

- **Bucket público**: la imagen de una fórmula es visible para quien tenga el enlace, sin sesión, y
  **no se revierte** cambiando el bucket después. Se mitigó guardando **la ruta** y no la URL, así
  que migrar a privado no obligaría a reescribir filas.
- **Al borrar una receta su imagen sobrevive**; solo se borra al reemplazarla o quitarla. Genera
  huérfanos que hoy no limpia nadie.
- **Solo `@supabase/storage-js`**, no `supabase-js` entero: sin cliente de datos en el repo, el
  anti-patrón que prohíbe `CHECKPOINTS.md` es **estructuralmente imposible** en vez de una
  prohibición que alguien tenga que recordar. Mismo criterio que QC-19 con el diccionario.


## QC-30 — rediseno-login (2026-09-02, cerrada el 2026-09-03)

PR [#20](https://github.com/nuformecuador-lgtm/QuimiCloude/pull/20), mergeado el 2026-09-02 a las
22:55Z. Épica QC-17, `zone: frontend`, `complexity: medium`. **26 requisitos**, 11 tareas. Gate
completo verde: 65 archivos, 663 tests.

> **Este resumen NO lo escribe la sesión que la implementó.** Esa sesión (labs-4b) mergeó el PR y
> nunca corrió F2.5 ni F2.6: la ficha se quedó `in_progress` y la tarjeta en *En curso* durante un
> día entero. Lo cierra otra sesión el 2026-09-03, por decisión humana, con lo que consta en
> `progress/current.md` — igual que se hizo con **QC-8** el 2026-09-02, que se había quedado
> `pending` tras mergearse y **bloqueaba a QC-20** por `depends_on`. Es la **segunda vez** que pasa
> lo mismo: una feature que se mergea y cuya ficha nadie cierra hace mentir al board, y con la
> regla nueva de «una feature por zona y épica» además bloquea a las demás de su pareja. Material
> de `/afinar-regla`: el cierre debería dispararlo el merge, no la memoria de quien mergea.

Lo que dejó escrito su sesión, y que vale la pena conservar: **dos rondas de revisión**. La primera
**rechazó por un bloqueante real** —R9 sin un test que mordiera: se podía **borrar el modo oscuro
entero** y recortar la sombra con la suite en verde—; la segunda aprobó con 0 hallazgos, repitiendo
cada mutación. Las correcciones fueron **cero cambios de producción**: solo crecieron los tests, de
20 a 26.

Ese hallazgo es el **primero** de un patrón que se repitió en **QC-25** el día siguiente, donde se
podía borrar el `deleted_at IS NULL` del catálogo de productos con la suite verde. Dos casos en dos
días: un test que nombra una garantía y no la comprueba no es una anécdota, es el fallo que la
revisión existe para cazar, y por eso desde QC-25 el encargo del `reviewer` pide **repetir las
mutaciones a mano** en vez de creerse el reporte de quien las corrigió.

## QC-42 — modelo-proveedores (2026-09-03)

PR [#25](https://github.com/nuformecuador-lgtm/QuimiCloude/pull/25), merge `d532662`. Épica QC-41,
`zone: backend`, `complexity: medium`. **36 requisitos EARS, los 36 con test que muerde.**
`./init.sh` completo en verde con `dev` integrado: **113 archivos, 1201 tests**. Primera feature de
la épica Proveedores; el CRUD es QC-43 y la pantalla QC-44.

### Cuatro subagentes muertos por 5xx, y lo que enseñó

Tres implementers cayeron seguidos —**500, 529, 529**— en Opus, ninguno por fallo del trabajo. El
primero murió con el esqueleto escrito **y sin commitear**: esquema, migración y armazón del módulo
colgando del árbol, sin una sola tarea marcada y sin bitácora. Se commiteó como `b60236f`, etiquetado
`wip` y **explícitamente SIN AUDITAR**, para que un worktree perdido no se llevara el trabajo.

La cuarta corrida salió en **Sonnet 5 por decisión explícita del humano** —desvío consciente del
«todos heredan el modelo de la sesión» de `AGENTS.md`, con motivo escrito y fecha— pasando también
`model: sonnet` a los `backend_dev`. Terminó las 15 tareas. **Dos lecciones que sí generalizan:**
encargar **una o dos tareas por subagente** en vez de la feature entera, y **commitear al cerrar cada
bloque**: los tres que murieron llevaban la feature completa en el cuerpo y no habían commiteado nada.

### La ronda 2 de review existió por desconfianza, y acertó

La ronda 1 (Sonnet) aprobó con **0 hallazgos**. Eso **no tiene precedente en este repo** —QC-20 y
QC-30 fueron RECHAZADAS en su ronda 1 por un bloqueante real—, así que se lanzó una **ronda 2
independiente en Opus**, con el encargo explícito de no partir del veredicto ajeno, leer el review
previo **al final** y no inventar un menor para justificarse.

Encontró uno real: el test de integración de R16 **no podía fallar**. Su comentario de nueve líneas
afirmaba que el rechazo de un plazo fraccionario lo producía el tipo `INTEGER` de la columna; una
sonda contra Postgres lo desmintió —una columna `NUMERIC(14,4)` devuelve **el mismo `42804`**—. Lo
que el test verificaba era que un parámetro de **texto** no liga contra una columna numérica, nada
sobre si la columna es entera. Y **ningún test leía el tipo real de `delivery_time`**, a diferencia
de `cost` y `min_purchase`. Corregido en `3f091d4`: comentario reescrito y test nuevo que lee
`information_schema`, verificado por mutación (`INTEGER`→`DECIMAL` lo pone rojo).

**El patrón a copiar:** cuando un review vuelve demasiado limpio, la segunda ronda se pide
**independiente y en otro modelo**, con el territorio ya pisado marcado para que busque en otra parte.

### La base compartida entre worktrees, otra vez

El gate cayó rojo con **4 archivos de integración de `inventario` y `recetas`** en rojo, ninguno de
QC-42. Causa verificada consultando `information_schema`, no supuesta: **todos los worktrees comparten
la base física `QuimiCloude`**, y la sesión de QC-32 ya le había aplicado `products.unit_id` y la tabla
`units` **sin que QC-32 estuviera en `origin/dev`**. El cliente de Prisma de la rama pedía `unit`.

Se aplicó lo que QC-14 y QC-20 ya habían escrito: **una base por worktree** (`QuimiCloude_QC42`, con
el `.env` git-ignorado apuntando ahí). **La norma estaba escrita desde QC-14 y nadie la automatizó**,
así que cada feature backend en paralelo la vuelve a descubrir y a pagar. Sigue sin automatizar.

### El choque con QC-32 no era teórico, solo estaba aplazado

`design.md > 10` y T13 lo anticiparon. La primera vez que se corrió T13 el merge fue **no-op** —QC-32
vivía solo en otro worktree, no en `origin/dev`— y eso **dio una falsa sensación de seguridad**. Al
volver del gate, QC-32 **y** QC-25 ya estaban mergeadas y el conflicto apareció entero.

Resultó **aditivo por los dos lados** —`Supplier` y `SupplierCatalogLine` contra `Unit`— y se resolvió
como T13 prescribía: conservar ambos bloques con sus comentarios `/// OJO`. El paso de `products.unit`
a `unit_id` entró por automerge intacto, porque **QC-42 no toca `products`** (decisión cerrada 2).
Después, T10 repetido sobre base **recreada desde cero** con la cadena completa en orden: la migración
de QC-32 es de las 12:14 y la de QC-42 de las 13:14.

Y tras el merge, el rojo de siempre: `typecheck` fallando por `@supabase/storage-js`, dependencia que
**QC-25** añadió. El `package.json` llegó con el merge, los `node_modules` no. Un `pnpm install`.
**Van cinco veces que el estado generado por detrás de un merge apunta a la feature ajena.**

### Deuda que hereda

- **Ocho preguntas abiertas**, cerradas a conciencia sin rellenar (regla 6). Las dos que se encarecen
  con datos cargados: **el costo del catálogo no guarda historial** —al subir un precio el anterior se
  pierde y no hay dato del que reconstruirlo, mismo problema que las versiones de fórmula de QC-24— y
  **la línea no registra quién la editó**, heredado de `recipe_lines`, pero allí editar una línea es
  editar la receta y aquí subir un costo no modifica nada del proveedor.
- **El `CHECK` de contacto alcanza a los proveedores dados de baja**: no se pueden vaciar sus datos de
  contacto sin violarlo. Relevante el día que haya que purgar datos personales.
- **Nada concilia el costo del producto con el del catálogo** si difieren. Sin dueño hasta que exista
  la feature de compras.
- **Queda la base `QuimiCloude_QC42`** por borrar, y el gate reporta **7 worktrees** además del
  principal.

---

## QC-22 — pantalla-de-productos (frontend · épica QC-18 Inventario) — cerrada el 2026-09-03

Mergeada por el humano en el **PR #24** (merge `d8e59eb` en `dev`). Worktree desmontado, rama
borrada y **base propia `QuimiCloude_QC22` eliminada**. **32 requisitos (R1–R32), 20 tareas,
33 commits.** Gate completo en verde —97 archivos, 1077 tests— y **E2E ejecutado y verde en
Chromium y WebKit**: login → `/inventario` → alta de un producto con una presentación creada
desde el propio selector → aparece en la lista, más el rechazo de quien no es Administrador.
`reviewer`: **APROBADO, 0 mayores, 4 menores**, verificando la trazabilidad por mutación real y
no leyendo la bitácora.

**Estrena la primera regla ruta→rol del repo.** QC-9 dejó `ROUTE_ROLE_RULES` vacía a propósito
con el encargo escrito de que la trajera justo esta pantalla. La regla **no sustituye** a la
autorización: los nueve casos de uso de `inventario` siguen llamando a `requireAdmin` como
primera línea.

### Lo que esta feature enseña, y no es sobre productos

**1. Acotar antes de especificar se pagó solo.** `/afinar-feature` cerró 22 decisiones con el
humano **antes** de que `spec_author` escribiera, y de ahí salió **QC-45** llevándose la mitad
del alcance original (listar, editar y borrar presentaciones). El spec se escribió una sola vez.

**2. Cinco decisiones de features ya cerradas hubo que superarlas, y ninguna se borró.** QC-11
(×2), QC-20 (×2) y una corrección de arquitectura. Todas invertidas o acotadas **con la fecha y
el motivo dentro del propio test**. El caso más instructivo es el cuarto: el centinela de QC-20
prohibía *todo* import de valor de su barrel fuera de `lib/composition`, pero **la cabecera de
ese mismo barrel decía que un componente de cliente debía poder importarlo, «QC-22 lo hará»**.
QC-20 se contradecía consigo mismo; se resolvió a favor de lo que el barrel prometía, acotando
el centinela a lo que su propio comentario dice defender: las nueve factorías de caso de uso.

**3. El implementer monolítico no sobrevive.** Murió **dos veces** con `529 Overloaded`: la
primera a mitad, la segunda **en su primera petición al reanudarlo**, sin avanzar nada.
`AGENTS.md > Regla del gate` ya decía que las corridas largas rompen el stream; lo que no decía
es que **reponer un transcript de ~150k tokens es igual de frágil**. Lo que funcionó: tirar el
transcript y repartir las 20 tareas en **bloques pequeños** con agentes nuevos que leen solo las
secciones del spec que sus tareas referencian. Seis tandas, ninguna caída más.

**4. Tres features en paralelo compartían UNA base de datos, y dos dejaron `dev` roto.** El gate
de esta feature falló en 4 archivos de integración que **no eran suyos**: la base compartida
tenía aplicadas `units_catalog` (QC-32) y `suppliers_and_supplier_catalog_lines` (QC-42), que
solo existían en sus ramas. Se verificó consultando `_prisma_migrations`, y corriendo los mismos
tests en `dev` sin un solo cambio de QC-22 — igual de rojos. Se resolvió creando
`QuimiCloude_QC22`, como ya se había hecho con QC-20 y se había dejado de hacer. **La regla de
paralelismo valida conflicto de archivos, no de base**, y la base es estado compartido más
frágil que cualquier archivo.

**5. La premisa de una decisión cerrada puede caerse en vuelo.** Una decisión aceptaba a
conciencia el retrabajo de capturar la unidad como texto libre «hasta que llegue QC-32». QC-32
**se mergeó mientras esta feature seguía abierta** y convirtió la unidad en clave foránea, así
que `ProductView.unit` dejó de existir. Se quitó el campo —único camino construible: listar el
catálogo es QC-38, aún `pending`—, **R23 quedó sin objeto y su test se invirtió en vez de
borrarse**.

**6. Un menor del reviewer que merecía arreglarse, y se arregló.** La guardia de R31 medía **por
archivo**: bastaba una aparición de `min-h-11` en cualquier parte para dar por buenos todos los
controles, y el reviewer demostró que se podían quitar los targets táctiles de un campo entero
con la suite verde. Ahora recorre **cada etiqueta de apertura**, resuelve las constantes locales,
opera sobre etiquetas multilínea y vigila **17 controles en 7 archivos**, con autocomprobación
para no poder quedarse muda en vez de roja. Es el mismo fallo que rechazó a QC-30 y reapareció en
QC-25: **tercer caso en tres días**.

### Lo que deja abierto

- **T16 sin hacer, y no lo cierra el merge**: la verificación manual en navegador con **iOS
  real**. WebKit de escritorio no es Safari de iOS, así que el scroll horizontal anidado de la
  tabla (R9) y los targets táctiles (R31) siguen sin comprobarse en dispositivo. Declarado como
  pendiente en el spec, **no como verificado**.
- **Una entrada ajena en `tests/baseline-rojos.json`** (guardia de dependencias, por la fila de
  `@supabase/storage-js` que añadió QC-25). QC-25 ya está mergeada: **conviene comprobar si esa
  entrada ya puede retirarse.**
- **QC-45** nació al acotar esta ficha y está desbloqueada.
- Dos guardias de fuente más anchas que su requisito, y el centinela de alcance que **pondrá en
  rojo a QC-45 por construcción** — que se lea como premisa caída, no como guardia que estorba.

## QC-33 — modelo-pedidos (cerrada el 2026-09-03, PR #26, merge `73c2fb6`)

Primera ficha de la épica **QC-31 — Pedidos**. Crea `Order` como **módulo hexagonal propio
`pedidos`**, que conoce la receta por el contrato público de `recetas` y la unidad por el de
`unidades`, nunca por sus tablas. **42 requisitos** y **29 decisiones cerradas**. Gate del leader:
120 de 121 archivos verdes, **1336 tests**. Reviewer **APROBADO con 0 mayores** y once mutaciones,
todas revertidas y sin escribir una fila en la base. Desbloquea **QC-34**.

Acotada con `/afinar-feature` en dos tandas, más una tercera vuelta al revisar en F1.4. **Ningún
rechazo**: el spec pasó a la primera, a diferencia de QC-32.

### Lo que hay que recordar

- **Un enum nuevo invalida las afirmaciones de alcance de todo el repo.** QC-4, QC-14 y QC-24
  habían escrito cada uno un test que decía que en **todo** el esquema no existe ningún enum,
  porque entonces la regla era «los conjuntos cerrados van como tabla». El humano decidió enum
  para QC-33 y esas cuatro afirmaciones pasaron a ser falsas de golpe, más dos que contaban tipos
  y FK contra la base. **Los tests no estaban mal: se quedaron viejos.**
- **El gate rápido no ve esos tests, y por eso el completo antes del PR no es ceremonia.** El
  implementer reportó **1** rojo y el gate completo destapó **6**, de los que **5 eran suyos**.
  `vitest related` no los relaciona porque no los une el árbol de archivos sino una afirmación
  sobre el repositorio entero. Es el mismo agujero que ya costó caro en **QC-20**. El leader los
  atribuyó corriéndolos contra `dev` limpio antes de devolverlos, no por deducción.
- **Acotar no es aflojar, y se mide.** El diff de la corrección son 308 inserciones y **9**
  borrados, y lo borrado son exactamente las cuatro líneas de alcance global. `unidades-constraints`
  mantuvo su `toEqual` y **sumó** `orders_unit_id_fkey`; `recetas-constraints` filtró por sujeto
  propio **sin lista negra** de `OrderStatus`/`OrderPriority`, que habría atado `recetas` a
  `pedidos` — la dependencia que la arquitectura prohíbe.
- **Una garantía puede caber en la base solo si se escribe de una forma concreta.** El `CHECK` que
  ata el año del correlativo a `created_at` en UTC usa `timezone(text, timestamptz)` porque es
  `IMMUTABLE`; `EXTRACT(YEAR FROM created_at)` a secas es `STABLE` y **Postgres la rechaza dentro
  de un `CHECK`**. La garantía existía; la primera forma de escribirla no.
- **Un test con una fecha literal es una bomba de relojería.** Los de integración calculan el año
  con `new Date().getUTCFullYear()`: escribir `2026` habría puesto la suite roja sola el 1 de enero.
- **El precio se guarda unitario y el total no se guarda**, para que no pueda contradecir a sus
  factores. Y el índice único del correlativo es **total, no parcial** —al revés que QC-24—, que es
  lo que impide reutilizar un número tras el borrado lógico.
- **Un spec honesto dice lo que no puede cerrar.** La asignación de la posición del correlativo es
  una escritura, y en una ficha de modelo no hay ninguna: se subió a **QC-34** con las tres
  estrategias comparadas y ninguna elegida, en vez de fingir que estaba resuelta.

### Deuda que deja

- **La base compartida tiene una fila residual que rompe el gate de todas las sesiones.** Un
  producto `FeldesQuack` bloquea el `DELETE FROM users` de `identity-seed.int.test.ts` con `23503`
  (8 casos rojos, **también en `dev`**). Decisión del humano: **no se borra, no se arregla el helper
  y NO se mete al baseline** — el baseline es para deuda de código, y enmascarar esto ocultaría
  para siempre un test que volverá a pasar solo. **La causa de fondo sigue viva**:
  `resetIdentityToEmptyState` borra usuarios sin limpiar antes las tablas que los referencian, así
  que cualquier feature con una FK a `users` puede repetirlo — y QC-33 acaba de añadir dos.
  Candidato a ficha propia.
- **Tres menores del review**, ninguno bloqueante: el cierre transitivo del barrel en
  `module-contract.test.ts` se detiene en la frontera de módulo (hoy lo tapa un regex, no el
  cierre); el filtro por etiqueta de `recetas-constraints` usa símbolos de una y dos letras, con
  riesgo de falso positivo pero nunca de falso verde; y una nota de bitácora ya corregida.
- **Dos preguntas abiertas, las dos a propósito:** quién asigna la posición del correlativo y qué
  pasa con dos altas simultáneas (**QC-34**; si no se resuelve allí, una de las dos fallará con un
  `23505` sin traducir), y si algún día se exporta a un contable externo.

## QC-13 — guardia-de-sesion-en-navegacion (2026-09-03)

PR [#27](https://github.com/nuformecuador-lgtm/QuimiCloude/pull/27), merge `045074c`. Épica QC-17,
`zone: frontend`, `complexity: low`. **16 requisitos EARS, los 16 con test que muerde.** 1349 tests
con 1341 en verde; **E2E verde en Chromium y WebKit**. Reviewer **APROBADO, 0 mayores**.

### La ficha mentía, y eso fue el hallazgo principal

Su `description` prometía «conectar la maquetación con la sesión real»: validar la cookie en cada
navegación, redirigir en los dos sentidos, que el formulario autentique, que el layout muestre al
usuario y que el logout funcione. **Se escribió antes de que existiera QC-9, que se llevó casi
todo.** Verificado en el código y no en los documentos: `login-form.tsx` ya llamaba a
`loginAction`, `layout.tsx` ya hacía `identity.getSessionUser()`, `nav-user.tsx` ya montaba
`logoutAction`. **Y el E2E que QC-12 le difirió explícitamente ya existía** —`session.spec.ts`,
R24 de QC-9—: esa deuda se cerró **por constatación**.

`/afinar-feature` corrigió **cuatro campos del board antes de sembrar**: `description` reescrita,
`zone` de `fullstack` a `frontend` (sin partición), `complexity` de `medium` a `low`, y `QC-22`
añadida a `depends_on`. El alcance real quedó en tres cosas: quitar cuatro ítems muertos del menú,
mover un test a fixture propia, y que el E2E del retorno pida `/inventario`.

**La lección general: una ficha vieja no describe el repo de hoy.** Antes de especificar, se
verifica contra el código lo que la tarjeta afirma que falta.

### El choque con QC-26, evitado en la validación de F1.0

QC-13 iba a borrar los **cinco** ítems de relleno. Uno de ellos, «Fórmulas», **lo está reclamando
QC-26** para el catálogo de recetas: su R5 dice que «NO DEBE seguir presentando la etiqueta
Fórmulas». Las dos features se destruían entre sí.

**Solo se ve entrando a leer el spec de la otra**, porque el de QC-26 vivía en su worktree y no en
`dev`. Es la comprobación que `AGENTS.md > Paralelismo` asigna al **leader** y que el validador no
automatiza — y es la primera vez que se cobra su valor. El alcance bajó a **cuatro** ítems y
`FORMULAS_ROUTE` quedó marcada como intocable en los tres archivos del spec.

### El gate del leader encontró lo que los subagentes no podían ver

`tests/unit/sidebar-ajuste.test.tsx` afirmaba que **algún ítem del menú real declara contador**.
Era cierto solo porque «Notificaciones» —placeholder de QC-11— era el único con `badge`. Vive en un
archivo **fuera del alcance de la ficha**, así que `vitest related` no lo alcanzaba y ningún
subagente lo iba a ver. Se retiró esa aserción conservando la que prueba lo que el test dice
probar, con fixture propia. **Es exactamente el reparto que `AGENTS.md > Regla del gate` describe.**

### El rol del E2E: de dependencia silenciosa a fallo ruidoso

Para aterrizar en `/inventario` hace falta el rol `Administrador` (regla ruta-rol de QC-22), pero
el fixture creaba un **rol efímero propio**, así que el middleware lo rebotaba al dashboard y el
E2E caía en los dos navegadores. Decisión del humano: **lo efímero que importa es el usuario, no el
rol**. El fixture pasa a **leer** el `Administrador` del seed y a **fallar con un mensaje claro si
no existe**, pidiendo correr el seed de QC-6. El `afterAll` ya no toca la tabla `roles` en ningún
caso. Cierra en la práctica la pregunta abierta 2.

### Lo que destapó fuera de la feature

- **`dev` local y `origin/dev` llevaban divergidos 11↔10 commits**, y ninguna rama podía sincronizar
  limpio. Se reconciliaron como **unión** sin descartar notas de ninguna sesión: `history.md`
  conflictaba **entero** por finales de línea —la deuda del `.gitattributes` que falta—, y de
  `current.md` se trajeron tres secciones de Evaluaciones que solo tenía el remoto.
- **El worktree principal quedó en la rama `fix-ux`, no en `dev`**, y varias sesiones commitearon
  ahí creyendo que era `dev`. `CLAUDE.md` dice que el principal se queda en `dev` y que nadie hace
  `checkout` en él. Sigue así al cerrar esta ficha.

### Deuda que hereda

- **QC-26 y esta ficha escriben las dos en `private-nav.ts` y `app-sidebar.test.tsx`.** Aquí el
  merge salió limpio porque QC-26 aún no estaba en `dev`; **el conflicto sigue pendiente para
  quien mergee después**.
- **`./init.sh` no llegó a `== init OK ==`** por dos causas ajenas, declaradas en el PR: la
  asimetría del validador desde un worktree secundario, y los 8 rojos del seed por el producto
  residual de QC-22 que el humano decidió no tocar.
- **La raíz `/` sigue siendo la plantilla de `create-next-app`**, pública. Fuera de esta ficha por
  decisión explícita del humano, a la espera de una pantalla de inicio de verdad **que todavía no
  tiene tarjeta**.
- **El menú quedó con tres entradas** —Dashboard, Inventario y Producción con un solo hijo—, y
  nadie ha decidido si una sección de un elemento se justifica.

---

## QC-43 — crud-de-proveedores (backend · épica QC-41 Proveedores) — cerrada el 2026-09-03

Mergeada por el humano en el **PR #28** (merge `760e3eb` en `dev`). Worktree desmontado, rama
borrada y **base propia `QuimiCloude_QC43` eliminada**. **48 requisitos (R1–R48), 21 tareas,
33 commits.** `reviewer`: **APROBADO, 0 mayores, 5 menores**, tras aplicar **catorce mutaciones
propias** sin fiarse de la bitácora. Llena los puertos y adaptadores que QC-42 dejó vacíos con
`.gitkeep`.

### Lo que esta feature enseña

**1. El acotado previo volvió a pagarse, y esta vez cambió el alcance dos veces antes de escribir
una línea.** `/afinar-feature` cerró 16 decisiones. Dos rompían la ficha del board: los permisos
pasaron de «usuarios con sesión iniciada» a **solo Administrador**, y aparecieron **tres cambios de
esquema** sobre QC-42. Las dos se escribieron en el issue **antes** de sembrar.

**2. Prisma propuso borrar todas las claves foráneas entre módulos.** `migrate dev --create-only`
generó **diez `DROP CONSTRAINT`** sobre cinco tablas de tres features ya mergeadas. Nadie los
pidió: la causa es que esas FK son **escalares sin `@relation`**, convención deliberada del repo
para que un módulo no arrastre el modelo de otro, así que Prisma no las ve en el schema y las lee
como sobras. Aplicarlas habría dejado la base **sin integridad referencial entre módulos y con los
tests en verde**, porque comprueban el camino feliz, no que la restricción exista. **Se salvó
porque un agente leyó el SQL línea a línea** y lo dejó vigilado con dos tests. Eso es criterio
individual, no arnés: está anotado como deuda.

**3. Un `CHECK` que evalúa a `NULL` se cumple.** La restricción de contacto necesita
`COALESCE(btrim(...), '') <> ''`: sin el `COALESCE`, `btrim(NULL) <> ''` da `NULL` y la restricción
**deja pasar justo la fila que existe para bloquear**. Un test que solo probara el caso feliz no lo
vería nunca. Tiene su test de sensibilidad.

**4. El nombre del rol `Administrador` ya tenía dueño, y llevaba dos features duplicado.**
`identity` exporta `ROLE_ADMINISTRADOR` desde `domain/roles.ts`, cuyo comentario dice que es para
«cualquier otro archivo que necesite nombrar uno de ellos». Aun así **`inventario` y `recetas`
redeclararon cada uno el suyo** con el mismo literal. Tres constantes para lo mismo. QC-43 usa la
buena; unificar las otras dos es ficha propia, propuesta. De paso: si esto se hubiera visto por la
mañana, la regla ruta→rol de QC-22 no habría importado el barrel de `inventario` y **una de las dos
guardias que hicieron parar aquella feature no habría saltado**.

**5. Un agente se negó a extender una regla aprobada, con razón.** El humano decidió rechazar el
alta de líneas para un proveedor dado de baja. Al preguntarle si valía también para editar y
borrar, el agente extendió **editar** y **excluyó borrar**, argumentando que un borrado no crea
nada invisible —**quita** una fila que ya nadie puede ver ni editar— y que rechazarlo dejaría esas
líneas atrapadas para siempre, porque la tabla no tiene borrado lógico donde marcarlas. **Fijó la
exclusión con un test**, y el `reviewer` verificó que extenderla al borrado lo pone rojo.

**6. Repartir en bloques desde el principio funcionó.** Cinco tandas de tres a seis tareas, cada
una leyendo solo las secciones del spec que sus tareas referencian. **Ninguna caída por `529`**,
frente a las dos de QC-22 con un implementer monolítico. Pero tuvo un coste que conviene recordar:
**una tanda dejó rojos dos tests de integración de QC-42 y no lo vio**, porque corrió `tests/unit` y
guardias pero no `tests/integration/`. Lo cazó la tanda siguiente. **Al partir en bloques, un
bloque puede dejar rojo lo que otro no mira.**

**7. Una guardia que medía el vehículo y no el efecto — tercera vez en tres días.** T19 probó quince
mutaciones; catorce enrojecieron y **una no**: una ruta bajo `app/api/` que consumiera la fachada de
`lib/composition` se le escapaba al test de alcance, que buscaba el **import del módulo** en vez de
su **consumo**. Mismo patrón que la guardia de QC-22 que medía por archivo y no por control.

**8. El ciclo de la migración se comprobó contra la base, no leyendo el SQL.** Censo de columnas,
restricciones con su definición, índices, RLS y `_prisma_migrations` en tres momentos: el estado
tras el rollback es **idéntico línea por línea** al previo, con las dos restricciones de QC-42 de
vuelta con su definición literal.

### Lo que deja abierto

- **El gate no pudo completarse en el PR, y no por esta feature**: el validador corta con «faltan
  specs para features sdd en vuelo: QC-26», porque `dev` marca esa ficha `spec_ready` y su spec no
  está en `dev` ni en ninguna rama remota. Se corrió a mano lo mismo que el gate —typecheck, lint y
  **1411 tests en 130 archivos**, todos verdes, ya con `dev` mergeado— y se dijo así en el PR, sin
  fingir un gate verde.
- **QC-44** (pantalla de proveedores) queda desbloqueada, y trae el E2E que esta ficha difirió con
  motivo.
- **QC-52** nació de una decisión posterior del humano: el producto deja de guardar costo, mínimo de
  compra y tiempo de entrega, que ya viven en la línea del catálogo. **Cierra la pregunta abierta 3
  de QC-42** —hoy conviven dos costos que nadie concilia— y arrastra la pantalla de QC-22.
- **Cuatro preguntas abiertas**, ninguna bloqueante: dónde vive a largo plazo el nombre del rol, en
  qué se mide el mínimo de compra (la unidad es opcional desde QC-32), quién concilia los dos costos
  —que QC-52 responde— y que **el alta de línea no es atómica**, declarado con el motivo de por qué
  hacerlo atómico costaría perder la traducción del error de duplicado.


## QC-26 — pantalla-de-recetas (2026-09-03)

PR [#29](https://github.com/nuformecuador-lgtm/QuimiCloude/pull/29), merge `4c4ee11`. Épica QC-27,
`zone: frontend`, `complexity: high`. **54 requisitos con test**, 30 tasks, **21 decisiones
cerradas**. Gate completo verde tras sincronizar con `dev`: **139 archivos, 1529 tests**, E2E en
Chromium y WebKit. `reviewer` en **dos rondas**: RECHAZADO con 3 mayores y 6 menores → APROBADO con
0, tras **15 mutaciones ejecutadas por el propio reviewer**. Cierra la épica Recetas: QC-24 el
modelo, QC-25 el CRUD, QC-26 la pantalla.

### Lo que la acotación encontró y que nadie había visto

**El selector de unidad no tenía de dónde leer.** QC-32 creó la tabla `units` y sembró cuatro filas,
pero las operaciones eran de QC-38, que ni se ha acotado: sin resolverlo, **ninguna línea de receta
se podía guardar** y la pantalla entera quedaba muerta. Se decidió que esta ficha añadiera **la
lectura, y solo la lectura**, con el precedente de QC-22, que se trajo el alta de presentaciones por
el mismo motivo. Es la segunda vez que una pantalla descubre que su backend está incompleto **al
acotarla**, no al implementarla — que es cuando sale barato.

**Y la URL no se inventó.** El sidebar ya tenía «Fórmulas» (`/produccion/formulas`) a 404 desde
QC-11: una receta química *es* su fórmula, así que la pantalla ocupa ese ítem y su etiqueta pasa a
«Recetas». `FORMULAS_ROUTE` se mudó a `lib/shared/routes.ts` porque el middleware y la regla ruta→rol
la necesitan y **no pueden depender de la navegación**, igual que hizo QC-22 con `INVENTORY_ROUTE`.

### Los tres mayores, y uno era del leader

**MAYOR 1 — el gate no era reproducible, y eso es peor que un rojo.** El leader reportó 1366 tests en
verde; el reviewer corrió la suite **cuatro veces sobre árbol limpio y las cuatro dieron 1364/1366**.
Dos tests —los únicos que cubren R30 y media R31— expiraban a los 5000 ms bajo la carga de la suite:
tardaban 1,7 y 1,9 s en aislado, un **margen de 2,7x** que no aguanta la paralelización. Se arregló
atacando la causa (`userEvent.setup({ delay: null })`, que quita la espera artificial sin alterar la
secuencia de eventos ni desactivar la comprobación de `pointer-events`) y no subiendo el límite a
secas: **los tiempos bajaron de verdad**, 1732→679 ms y 1855→753 ms. Nada entró en
`baseline-rojos.json`. El reviewer lo verificó leyendo la fuente del paquete **y** por mutación.

**MAYOR 2 — el leader metió seis archivos de otra sesión en la rama.** Un `git add -A` en el worktree
principal —que estaba en la rama `fix-ux` con trabajo sin commitear de la sesión hermana— arrastró
`button.tsx`, `sheet.tsx`, `app-sidebar.tsx`, `logout-menu-item.tsx` y dos de
`inventario/components/`, violando R48 y R51. **Y tuvo una segunda vida peor**: al sincronizar con
`dev`, git **auto-resolvió en silencio** cinco de esos archivos a favor de la reversión, revirtiendo
sin marcar conflicto el trabajo que ya había llegado por `fix-ux`. No hubo aviso y ninguna guardia lo
habría cazado —para git era un cambio legítimo—; solo apareció comparando el diff completo contra
`dev`. **La regla que sale de aquí:** cuando una rama revierte algo que no es suyo, el merge
siguiente se mira **contra `dev`**, no contando conflictos.

**MAYOR 3 — el único código de acceso a datos de la ficha no tenía test.** Se podían borrar
`take: limit` **y** `orderBy` de `unit-prisma.ts` a la vez con la suite entera en verde. Se cubrió
con integración contra Postgres real, y en la ronda de cierre se **endureció**: con tres filas
sembradas el caso del orden cazaba la mutación **5 de cada 6 veces** —Postgres puede devolverlas
ordenadas por azar—; con **ocho filas sembradas en orden inverso**, seis de seis. Un test que muerde
cinco de cada seis veces no es una garantía, es una probabilidad.

### El hallazgo de entorno que reinterpreta a QC-25

**El `.env` de un worktree no lo lee el runner de tests.** `init.sh` solo comprueba que exista; lo
que decide a qué base pegan los de integración es **la variable del entorno del proceso**. El primer
gate de esta ficha dio **12 archivos en rojo** por correr contra la base compartida de otra sesión. Y
obliga a matizar lo que se escribió en QC-25: dar base propia al worktree cambió el archivo, pero el
gate siguió pegando contra la compartida — lo que salvó aquella corrida fue que para entonces ya
tenía aplicada la migración de unidades. La conclusión sigue siendo correcta (un worktree necesita
base propia), pero **el mecanismo estaba a medias**.

### Seis tests ajenos tocados, y ninguno relajado

Cuatro los retensó el implementer al implementar —afirmaban «esta ficha no trae la pantalla, es de
QC-26»— y dos más aparecieron al sincronizar con `dev`. El de QC-43 medía las claves de su fachada
haciendo `slice` **hasta el final del archivo**, así que en la práctica afirmaba sobre lo que viniera
detrás; se acotó a su propio objeto literal, **rechazando la salida fácil** de reordenar
`lib/composition/index.ts` para que volviera a ser el último, que solo habría trasladado la trampa a
la feature siguiente. Y un test de QC-13 se **borró** con nota: afirmaba que el ítem se llamaba
«Fórmulas», o sea, literalmente que QC-26 no había llegado. Van **seis** features rotas por esta
familia de tests.

### Dos afirmaciones falsas que se corrigieron en vez de sobrevivir

El leader dijo haber verificado los cuatro checks de `dnd-kit` **sin haberlos corrido**; al correrlos
**fallaba el check 2** (sin publicar desde 2024-12-05), así que la librería entró como **`excepcion`**
—no como `aprobada`— con su check fallido, su porqué y su condición escritos, y con
`@atlaskit/pragmatic-drag-and-drop` identificada como salida si algún día rompe. Y el implementer
documentó un falso verde de `vitest` con dos filtros que **el reviewer comprobó que no existe**: la
explicación de aquella mutación verde era la simple, que el test no existía. Las dos quedan escritas
como lo que fueron.

### Lo que queda abierto

**T25 no está hecha y ningún agente puede cerrarla**: la verificación manual en un móvil real —375 px,
arrastrar un paso con el dedo, que ningún input haga zoom al enfocar—. Hay guardias de fuente y
asserts de viewport, pero, como lo dejó escrito el implementer, *una guardia no es un dedo sobre un
cristal*.


## QC-26 — pantalla-de-recetas (2026-09-03)

PR [#29](https://github.com/nuformecuador-lgtm/QuimiCloude/pull/29), merge `4c4ee11`. Épica QC-27,
`zone: frontend`, `complexity: high`. **54 requisitos con test**, 30 tasks, **21 decisiones
cerradas**. Gate completo verde tras sincronizar con `dev`: **139 archivos, 1529 tests**, E2E en
Chromium y WebKit. `reviewer` en **dos rondas**: RECHAZADO con 3 mayores y 6 menores → APROBADO con
0, tras **15 mutaciones ejecutadas por el propio reviewer**. Cierra la épica Recetas: QC-24 el
modelo, QC-25 el CRUD, QC-26 la pantalla.

### Lo que la acotación encontró y que nadie había visto

**El selector de unidad no tenía de dónde leer.** QC-32 creó la tabla `units` y sembró cuatro filas,
pero las operaciones eran de QC-38, que ni se ha acotado: sin resolverlo, **ninguna línea de receta
se podía guardar** y la pantalla entera quedaba muerta. Se decidió que esta ficha añadiera **la
lectura, y solo la lectura**, con el precedente de QC-22, que se trajo el alta de presentaciones por
el mismo motivo. Es la segunda vez que una pantalla descubre que su backend está incompleto **al
acotarla**, no al implementarla — que es cuando sale barato.

**Y la URL no se inventó.** El sidebar ya tenía «Fórmulas» (`/produccion/formulas`) a 404 desde
QC-11: una receta química *es* su fórmula, así que la pantalla ocupa ese ítem y su etiqueta pasa a
«Recetas». `FORMULAS_ROUTE` se mudó a `lib/shared/routes.ts` porque el middleware y la regla ruta→rol
la necesitan y **no pueden depender de la navegación**, igual que hizo QC-22 con `INVENTORY_ROUTE`.

### Los tres mayores, y uno era del leader

**MAYOR 1 — el gate no era reproducible, y eso es peor que un rojo.** El leader reportó 1366 tests en
verde; el reviewer corrió la suite **cuatro veces sobre árbol limpio y las cuatro dieron 1364/1366**.
Dos tests —los únicos que cubren R30 y media R31— expiraban a los 5000 ms bajo la carga de la suite:
tardaban 1,7 y 1,9 s en aislado, un **margen de 2,7x** que no aguanta la paralelización. Se arregló
atacando la causa (`userEvent.setup({ delay: null })`, que quita la espera artificial sin alterar la
secuencia de eventos ni desactivar la comprobación de `pointer-events`) y no subiendo el límite a
secas: **los tiempos bajaron de verdad**, 1732→679 ms y 1855→753 ms. Nada entró en
`baseline-rojos.json`. El reviewer lo verificó leyendo la fuente del paquete **y** por mutación.

**MAYOR 2 — el leader metió seis archivos de otra sesión en la rama.** Un `git add -A` en el worktree
principal —que estaba en la rama `fix-ux` con trabajo sin commitear de la sesión hermana— arrastró
`button.tsx`, `sheet.tsx`, `app-sidebar.tsx`, `logout-menu-item.tsx` y dos de
`inventario/components/`, violando R48 y R51. **Y tuvo una segunda vida peor**: al sincronizar con
`dev`, git **auto-resolvió en silencio** cinco de esos archivos a favor de la reversión, revirtiendo
sin marcar conflicto el trabajo que ya había llegado por `fix-ux`. No hubo aviso y ninguna guardia lo
habría cazado —para git era un cambio legítimo—; solo apareció comparando el diff completo contra
`dev`. **La regla que sale de aquí:** cuando una rama revierte algo que no es suyo, el merge
siguiente se mira **contra `dev`**, no contando conflictos.

**MAYOR 3 — el único código de acceso a datos de la ficha no tenía test.** Se podían borrar
`take: limit` **y** `orderBy` de `unit-prisma.ts` a la vez con la suite entera en verde. Se cubrió
con integración contra Postgres real, y en la ronda de cierre se **endureció**: con tres filas
sembradas el caso del orden cazaba la mutación **5 de cada 6 veces** —Postgres puede devolverlas
ordenadas por azar—; con **ocho filas sembradas en orden inverso**, seis de seis. Un test que muerde
cinco de cada seis veces no es una garantía, es una probabilidad.

### El hallazgo de entorno que reinterpreta a QC-25

**El `.env` de un worktree no lo lee el runner de tests.** `init.sh` solo comprueba que exista; lo
que decide a qué base pegan los de integración es **la variable del entorno del proceso**. El primer
gate de esta ficha dio **12 archivos en rojo** por correr contra la base compartida de otra sesión. Y
obliga a matizar lo que se escribió en QC-25: dar base propia al worktree cambió el archivo, pero el
gate siguió pegando contra la compartida — lo que salvó aquella corrida fue que para entonces ya
tenía aplicada la migración de unidades. La conclusión sigue siendo correcta (un worktree necesita
base propia), pero **el mecanismo estaba a medias**.

### Seis tests ajenos tocados, y ninguno relajado

Cuatro los retensó el implementer al implementar —afirmaban «esta ficha no trae la pantalla, es de
QC-26»— y dos más aparecieron al sincronizar con `dev`. El de QC-43 medía las claves de su fachada
haciendo `slice` **hasta el final del archivo**, así que en la práctica afirmaba sobre lo que viniera
detrás; se acotó a su propio objeto literal, **rechazando la salida fácil** de reordenar
`lib/composition/index.ts` para que volviera a ser el último, que solo habría trasladado la trampa a
la feature siguiente. Y un test de QC-13 se **borró** con nota: afirmaba que el ítem se llamaba
«Fórmulas», o sea, literalmente que QC-26 no había llegado. Van **seis** features rotas por esta
familia de tests.

### Dos afirmaciones falsas que se corrigieron en vez de sobrevivir

El leader dijo haber verificado los cuatro checks de `dnd-kit` **sin haberlos corrido**; al correrlos
**fallaba el check 2** (sin publicar desde 2024-12-05), así que la librería entró como **`excepcion`**
—no como `aprobada`— con su check fallido, su porqué y su condición escritos, y con
`@atlaskit/pragmatic-drag-and-drop` identificada como salida si algún día rompe. Y el implementer
documentó un falso verde de `vitest` con dos filtros que **el reviewer comprobó que no existe**: la
explicación de aquella mutación verde era la simple, que el test no existía. Las dos quedan escritas
como lo que fueron.

### Lo que queda abierto

**T25 no está hecha y ningún agente puede cerrarla**: la verificación manual en un móvil real —375 px,
arrastrar un paso con el dedo, que ningún input haga zoom al enfocar—. Hay guardias de fuente y
asserts de viewport, pero, como lo dejó escrito el implementer, *una guardia no es un dedo sobre un
cristal*.

---

## QC-52 — separar-producto-de-catalogo-de-proveedor (2026-09-04, PR #32, merge `855fae6`)

Fullstack, `high`, épica **Inventario**. Separa **lo que la cosa es** de **cómo la vende cada
proveedor**: el producto pierde `cost`, `min_purchase` y `delivery_time`, y la línea de catálogo
pierde `product_id` y gana `name`, `name_normalized`, `presentation_id`, `unit_id`, `image_path` y
`deleted_at`. Las dos tablas quedan **independientes, sin ningún vínculo ni siquiera opcional**, con
la consecuencia aceptada a conciencia de que el sistema **no podrá comparar precios entre
proveedores**. Una sola migración con su `down.sql`. Arrastra QC-20, QC-22 y buena parte de QC-43.

**34 requisitos con test**, `reviewer` en una ronda con **0 mayores y 6 menores**, y `./init.sh`
completo en 1572/1573 con el único rojo en el baseline.

### La ficha llegó acotada, y se notó

`/afinar-feature` la sembró el día anterior con el Alcance y **16 decisiones cerradas** por el humano
**antes** del spec. `spec_author` solo escribió los requisitos, y el ciclo entero necesitó **una sola
ronda de review**. Es el contraste con las tres primeras features del repo, que necesitaron una o dos
revisiones completas del spec por preguntas que nadie había cerrado.

### El drift que iba camuflado

`products.image_path` existía en la base desde `20260903200000_product_image_path` y **no estaba
declarada en el modelo Prisma**. O sea que `prisma migrate dev` habría propuesto un `DROP COLUMN
"image_path"` **mezclado entre los tres `DROP COLUMN` legítimos** de esta misma migración, donde se
lee como parte del trabajo. Lo encontró `spec_author` al diseñar, no el implementer al ejecutar. Se
cerró declarando la columna en el modelo, sin una sola sentencia SQL.

### Tres diagnósticos del implementer que no sobrevivieron a verificarlos

1. Reportó que `identity-seed.int.test.ts` **bloqueaba el gate** y proponía o limpiar la base de
   desarrollo o **meterlo en `baseline-rojos.json`**, que es aflojar el gate. Ninguna de las dos hacía
   falta: `dev` había avanzado mientras implementaba y ya traía `b2ffa09`, que reescribe el reset del
   seed leyendo del catálogo de Postgres las tablas que dependen de `users`. Se comprobó corriendo el
   mismo archivo en los dos worktrees contra la misma base: 10/10 en uno, 8/10 en el otro. **La cura
   ya estaba escrita; faltaba mergear.** Su diagnóstico de la causa sí era correcto.
2. Avisó de que sin `set -a && . ./.env && set +a` el gate pegaría contra la base compartida —nota
   que este mismo archivo llevaba escrita— y luego **la midió en vez de repetirla**: el cliente Prisma
   generado lee el `.env` al importarse y `prisma.config.ts` llama a `process.loadEnvFile()`. Sonda
   forzada a fallar: `Received: "QuimiCloude_QC52"` sin sourcear nada. **La nota del arnés estaba
   desactualizada.**
3. El conflicto de 686 líneas de `presentation-uniqueness.int.test.ts` al mergear `origin/dev`
   **no era semántico**: el diff real de QC-52 sobre ese archivo es **una línea**. Lo provocó un
   subagente que reescribió el archivo en CRLF.

### La sesión rompió a la de al lado

Aplicar la migración a la base de desarrollo **compartida** reventó los tests de integración de la
sesión paralela de **QC-34** con un `P2022` en `orders`. Ellos se defendieron creándose base propia y
dejaron un aviso cruzado escrito. QC-52 hizo lo mismo después (`QuimiCloude_QC52`, ya borrada). Es la
**cuarta** vez que el drift de base entre worktrees bloquea una feature.

Y en el otro sentido: las dos sesiones paralelas **pisaron dos commits de estado de esta**, dejando
QC-52 de vuelta en `pending` con el implementer ya cerrado. Se restauró tocando solo sus entradas.

### CRLF: 497 líneas de diff donde el cambio real son 19

Un subagente convirtió **15 archivos** a CRLF. `product-actions.ts` marcaba 497 líneas cambiadas
cuando el cambio real son 19, y `product-page.test.tsx` 2191 cuando son 95. Se normalizó a LF antes
del PR para que no se lo comieran QC-34 y QC-55 al mergear. **El repo sigue sin `.gitattributes`.**

### Lo que queda abierto

- **T13 aceptada como está, con el agujero anotado.** Prisma 6.19.3 **no puebla** `meta.field_name`
  ni `meta.constraint` en un `P2003` —llega `constraint: null` y `on the (not available)`—, así que
  decidir por él es indecidible, y el precedente que el diseño manda copiar
  (`classifyForeignKeyViolation` de `product-prisma.ts`) **ya estaba muerto por lo mismo**. El
  clasificador queda escrito como pide el diseño y el test afirma **lo que de verdad ocurre**. Se
  descartaron mover de versión de Prisma (regla 7) y el pre-`SELECT` de existencia. Consecuencia: el
  `P2003` de `presentation_id`/`unit_id` **escapa sin código de dominio estable**, hoy inalcanzable
  desde la interfaz porque QC-44 no existe.
- **El E2E de inventario llevaba roto en `dev` por dos motivos independientes** —`product-field-cost`,
  un `data-testid` que el formulario ya no renderiza, y el `required` de `qtyAlert` que introdujo
  `b4822de` sin que el spec lo rellenara— y **ningún gate lo dijo, porque `./init.sh` no corre
  Playwright**. Los dos arreglados aquí.
- **La entrada de `recipe-route-contract.test.ts` en `baseline-rojos.json` documenta un motivo que ya
  no es el que ocurre.** Dice que en `dev` falla por el rango `origin/dev...HEAD` vacío; en las ramas
  de feature falla porque la guardia R44 de QC-26 muerde a **cualquier** rama que toque `db/`. La cura
  que el propio baseline propone —auto-saltarse cuando el rango está vacío— **no arregla este caso**.

Las tres últimas son deuda de arnés y candidatas a `/afinar-regla`, no a una ficha de producto.

## 2026-09-04 — QC-55-tabla-de-datos-compartida

- Componente de tabla en `components/shared/`: pinta filas a partir de la configuración de
  columnas que recibe por props, con barra de filtros (texto, rango numérico, selección y rango
  de fechas con atajos), barra de paginación, orden por cabecera y pineo de columnas que decide
  el usuario y se recuerda en `localStorage`. **No trae los datos**: emite los parámetros nuevos
  por `onChange` y quien lo usa decide.
- Requisitos cubiertos: **R1–R36**, todos con test. Gate completo en verde: 152 archivos,
  1704 tests. PR #33, merge commit `c2f61ec`.
- **Se acotó con `/afinar-feature` antes del spec y eso cambió el board tres veces**: la ficha no
  existía —se creó QC-55 y QC-56 el mismo día—, la acotación creó **QC-57** (el backend que honre
  orden y filtros, la «ficha de backend nueva» que QC-22 pidió el 2026-09-03 y QC-26 repitió), y
  QC-55 pasó a `complexity: high`. Las 23 decisiones cerradas están en su `requirements.md`.
- **Dos dependencias aprobadas con los cuatro checks corridos**: `@tanstack/react-table` 9.2.4 y
  `react-day-picker` 10.0.1. **`rsuite` se descartó pese a pasar los cuatro** —14 dependencias,
  incluida `rsuite-table`, y un sistema de tema propio—; queda anotado que el rechazo fue por
  coste y no por check fallado, por si se reabre. **`cn` NO se aprueba** (falla el check 3): el
  CLI de shadcn lo emite hoy como entrada directa y el especificador se normalizó a
  `@/lib/utils`, edición ratificada por el humano.
- **Dos excepciones declaradas, no desvíos**: `shared/` sin consumidor todavía (contra la regla de
  sobre-ingeniería; los dos consumidores están identificados en QC-56), y **sin E2E**, diferido
  con motivo porque ninguna pantalla monta el componente.
- **Lo que costó, y es la lección de esta feature.** El `reviewer` RECHAZÓ en primera ronda por un
  bug real que el test estaba escrito para no ver: los atajos de fecha restaban meses y años con
  `setMonth`/`setFullYear`, que desbordan, así que **el día 31 de cualquier mes «último mes» no
  cubría el mes anterior** (31-may daba `2026-05-01`). Su test **reimplementaba la fórmula bajo
  prueba** y solo probaba el 15 de junio —mitad de mes, año no bisiesto—, el único caso que pasaba
  por casualidad. Un test que recalcula lo que verifica no es una red, es un espejo. El arreglo
  llegó con once esperados escritos a mano y un barrido de propiedades, y el `reviewer`
  **reprodujo la mutación por su cuenta** antes de aprobar.
- **El diseño estaba incompleto y el código tenía razón**: `design.md > 4` mandaba activar dos
  capacidades de TanStack, pero en v9 `getStart()` —el mecanismo con el que `design.md > 5` manda
  calcular el offset del pineo— lo aporta `columnSizingFeature`, no `columnPinningFeature`.
  Verificado contra el paquete instalado. Se corrigieron `design.md` y la fila de
  `docs/dependencias.md`.
- **Deuda trasladada a QC-56, por escrito y no en silencio**: la **T13** —comprobar el `sticky`
  anidado en Safari de iOS— no se pudo hacer aquí porque ninguna pantalla monta el componente y
  fabricar una de prueba era lo que la decisión 11 rechazó. Allí es **exigible y bloqueante**, y
  la decisión 17 no se levanta. Con ella van: `DataTableColumn` sin ancho (todas las columnas
  caen en 150 px), `focusColumnFilter` sin acotar por `tableId`, y **cómo se declara una columna
  de acciones de fila, que sigue sin decidirse y sin lo cual la migración de productos no se
  puede completar**.
- **Queda vivo**: QC-57 sin acotar. Hasta que exista, el orden, los filtros y la búsqueda se
  emiten y **nadie los honra**.

## 2026-09-04 — QC-34-crud-de-pedidos

**PR [#34], merge `4c98fe1`.** `backend`, `high`, épica **QC-31 — Pedidos**. Spec en
`specs/QC-34-crud-de-pedidos/`. Worktree desmontado, rama borrada y **base propia
`QuimiCloude_QC34` eliminada**.

Los cinco casos de uso de pedidos sobre el modelo de QC-33 —alta, consulta paginada, edición,
cancelación y borrado— y **una migración**, porque la acotación con el humano añadió un cuarto
estado. **58 requisitos con test**, cero dependencias nuevas.

### La acotación creció la ficha, y es lo que decidió todo lo demás

`/afinar-feature` cerró **25 decisiones** antes de que `spec_author` escribiera una línea. Tres
salieron de lo que QC-33 había dejado escrito para aquí —permisos (solo Administrador en las cinco
operaciones), transiciones (solo hacia delante, `ENTREGADO` final) y quién calcula el correlativo
(**secuencia de la base por año**, que cierra su pregunta abierta 2)—, pero **la que cambió la
ficha la trajo el humano**: un cuarto estado `CANCELADO` con motivo obligatorio. Eso convirtió una
ficha de casos de uso en una ficha con migración: `ALTER TYPE ... ADD VALUE`, columna nueva, y el
`CHECK` de borrado de QC-33 ampliado para que tampoco se borre un cancelado. Es exactamente el coste
que QC-33 asumió a conciencia al elegir enum en vez de tabla.

De paso, la acotación **cazó una contradicción del board**: la ficha pedía que el alta recibiera una
«fecha de solicitud» que QC-33 ya había decidido que no existe —es `created_at`—. Se reescribió la
`description` del issue **antes** de sembrar, y también la de **QC-35**, que seguía pidiendo ese
campo en su formulario.

### El bloqueante del reviewer: una copia no vigila a su original

El `reviewer` **RECHAZÓ** en primera ronda, y tenía razón. `order-prisma.ts` —382 líneas, el único
dueño de Prisma del módulo— **no lo ejecutaba ningún test**: los de integración corrían *una copia a
mano* de su SQL dentro de una transacción revertida, y los unitarios usaban dobles del puerto.
Consecuencia concreta: **R35 se quedaba sin un solo test que lo verificara** —ni el defecto de 10, ni
el tope de 25, ni que `buildPage` reciba el `limit` acotado y no el `pageSize` pedido, que es el
error que deja un `totalPages` mentiroso—. Lo que cerró el argumento no fue la teoría sino el
precedente: **`recipe-crud.int` y `supplier-crud.int` importan y llaman su adaptador real**. Se
arregló copiando ese patrón, y la segunda ronda cerró con **cero mayores y nueve mutaciones
muertas**.

### Dos falsos verdes por mutaciones mal construidas

El menor **M7** era que el predicado de R4 solo cazaba `'Administrador'` con comilla simple: con
comillas dobles el test salía verde. Al cerrarlo apareció la segunda mitad —si `identity` renombrara
el rol, el barrido vigilaría un nombre inexistente y quedaría **verde por vacuidad**—, así que el
patrón pasó a derivarse del valor de `ROLE_ADMINISTRADOR` y a admitir las tres formas de escribir una
cadena en TypeScript. Y **dos veces en esta ficha** una mutación mal construida dio un verde que no
significaba nada (el literal puesto en prosa, sin comillas, que el regex no cazaría ni con el
descuento de comentarios roto). La lección quedó en la bitácora: **una mutación que no mata hay que
comprobar que estaba bien construida antes de concluir que el test cubre**.

### El drift de base, por tercera vez

La base compartida volvió a bloquear una feature: la sesión paralela de QC-52 aplicó su migración y
los tests de integración de QC-34 empezaron a fallar con un `P2022` en cualquier lectura de `orders`.
Se resolvió como en QC-20, QC-25 y QC-26 —**base propia `QuimiCloude_QC34`**—, y **con base limpia el
rojo de `identity-seed` desapareció**: era de los datos hechos a mano en la compartida, no un defecto.
Sigue sin haber nada en `wt.sh new` que automatice esto, y `wt.sh done` sigue sin saber que existe una
base que borrar.

### El flake que sí entró al baseline

`tests/unit/inventario/product-page.test.tsx` (de QC-22) falla de forma intermitente bajo carga y pasa
en aislado: las teclas llegan intercaladas al campo controlado. Verificado rojo en `dev` (`c0c16af`)
**antes** de esta rama. Decisión del humano: **al baseline con motivo y fecha, declarado en el PR, y
ficha propia — QC-58**, cuyo alcance incluye retirarlo del baseline. Es el primer uso real del
mecanismo desde que existe.

### Lo que queda abierto

- **Cinco preguntas abiertas** en el spec, ninguna bloqueante. Las dos que más pueden afectar a
  **QC-35**: si la consulta devuelve el total calculado —que arrastraría una dependencia decimal— y
  si la edición es reemplazo completo.
- **Sin ficha, y deliberado:** qué hacer cuando un pedido entregado no debió salir. No hay
  devoluciones y crear la ficha obligaría a inventar un módulo que nadie pidió.
- **Límite conocido:** el `down.sql` se vigila por **texto** en la suite; el ciclo
  `migrate → rollback → migrate` y la guardia que aborta ante un pedido `CANCELADO` se ejercitaron a
  mano —por el implementer y por el reviewer, con resultado correcto—, pero nada en `pnpm test` los
  ejecuta.
- **`dev` se movió dos veces durante la ficha** (PR #32 de QC-52 y #33 de QC-55) y hubo que
  sincronizar dos veces. El único conflicto en las dos fue `tests/baseline-rojos.json`, y la
  resolución correcta no era elegir versión sino **unir**: el archivo llevaba vacío hasta ayer y cada
  rama le añadía entradas distintas.

## QC-62 — pasos-de-receta-enriquecidos (cerrada el 2026-09-04, PR #36, merge `aa4d551`)

El contenido de un paso de receta dejó de ser una cadena y pasó a ser un **documento de estructura
cerrada** —párrafo, negrilla, cursiva y lista de verificación—, validado en el borde con `zod` y
`.strict()` en cada objeto, para que las claves desconocidas se rechacen en vez de descartarse en
silencio. El campo `type` (`'texto' | 'checklist'`) **desapareció**: era derivable del propio
contenido. El tope pasó de 1.000 caracteres a `MAX_STEP_ELEMENTS = 30`, publicado como **una sola
constante** del contrato. Sin tocar `db/schema.prisma`: los pasos ya vivían como un documento JSON
en una columna desde QC-24.

- **Nació en esta sesión.** No existía en el board: `/afinar-feature` paró por su guarda del paso 0,
  se creó la tarjeta y después se acotó. **12 decisiones cerradas antes del spec**, y se notó — el
  reviewer cerró con **0 mayores** en una sola ronda.
- **Partida en dos por F1.0** al evaluar como `fullstack`: QC-62 se quedó el contrato y nació
  **QC-64 — editor-y-lectura-de-pasos** (`frontend`), que esta ficha desbloquea. Las decisiones se
  repartieron 8/10 sin perder ninguna. **QC-63 — ejecutar-receta-operador** quedó bloqueada por
  QC-64.
- **Migración destructiva y aprobada:** `20260904181500_recipe_steps_reset` **borró** los pasos de
  las recetas existentes en vez de convertirlos. Irreversible, y decidido así al acotar.
- **El hallazgo que más cerca estuvo de costar caro:** esa migración compartía **marca de tiempo
  exacta** con una foránea (`20260904160000_list_query_indexes`). Prisma las distingue por nombre,
  pero el orden entre dos que empatan queda al azar — y ésta borra datos. Lo detectó el implementer
  al consultar `_prisma_migrations`, no ninguna guardia. **Nada en el repo vigila los empates de
  timestamp entre migraciones.**
- **Una premisa del leader que resultó falsa, y bien tumbada:** se diagnosticaron 9 rojos de
  integración como «fixtures viejas de QC-52» y se encargó arreglarlas. El implementer **se negó con
  medidas**: el modelo `Product` de la rama ni siquiera declara `nameNormalized`, así que el arreglo
  era inaplicable; la causa real es que la base compartida tiene aplicada una migración que ninguna
  rama tiene. Quinta vez que ese drift bloquea una feature.
- **Deuda que deja en `dev`:** el formulario escribe los pasos por un **puente de texto plano** hasta
  que QC-64 traiga el editor. Y las dos guardias gemelas de alcance de `recetas` ya no dicen lo
  mismo: una se actualizó y la otra sigue tapada por `baseline-rojos.json` con un motivo escrito que
  ya no es el que ocurre.

---

## QC-57 — orden-y-filtro-en-listados (cerrada el 2026-09-06, PR #38, merge `738d9a9`)

`zone: backend`, `complexity: high`. Un contrato único de consulta —orden, filtros, búsqueda y
paginación— aplicado a los **siete listados** del producto. Cada módulo declara su **lista blanca**
de campos consultables en `domain/list-query.ts`; lo que no está declarado se poda en el dominio y
**queda en el log** en vez de desaparecer en silencio. Búsqueda por subcadena con `pg_trgm` e
índices GIN (vía A, cerrada por decisión), `NULLS LAST` siempre explícito y `dateRange` en UTC con
extremos inclusivos. 126 archivos, +11.356/−504. Único cambio de esquema: la columna
`Product.nameNormalized` y sus 35 índices, con `down.sql` reversible y sin un solo `DROP` en la
subida.

- **R1–R35 con test real, cero sin cubrir.** 21 tasks, las 21 en `[x]`.
- **Necesitó dos rondas de review, y ninguna fue por el contrato.** La ficha en sí pasó a la
  primera; lo que la tumbó fue **el cierre**: F2.3 estaba sin hacer contra `origin/dev` (se había
  mergeado `dev` **local**, que iba por detrás) y la rama arrastraba **14 archivos commiteados con
  los finales de línea cambiados a CRLF**, que inflaban el diff con ~5.900 líneas fantasma.
- **La lección del incidente de CRLF, que el implementer dejó escrita:** comparó contra `HEAD`,
  que ya *era* el commit roto, en vez de contra la rama base — y así **propagó** la conversión en
  vez de arreglarla. La guardia de equivalencia nunca falló: normaliza `\r\n` antes de comparar.
- **Hallazgo que merece ficha propia (N2):** el `switch` del adaptador es una **segunda lista
  blanca implícita** y nada la confronta con la declarada. Hoy coinciden las siete (auditadas una a
  una), así que no hay bug; pero el día que se añada un campo a una lista blanca y se olvide la rama
  del adaptador, el filtro desaparece **sin fallar y sin log**, porque el log solo registra lo que
  podó el dominio. Es el modo de fallo de la decisión cerrada 7 entrando por el otro lado.
- **Deuda que deja en `dev`:** doce funciones `export` sin consumidor fuera de su archivo (N1) y
  una fecha ilegible en `dateRange` que se descarta sin rastro (N3, anotado para QC-56). Y el aviso
  operativo de que `products.name_normalized` es `NOT NULL` sin default en la base compartida:
  cualquier rama sin el modelo se lleva un `23502` al crear un producto. El `SET DEFAULT ''` está
  **rechazado por escrito** — cambiaría un fallo ruidoso por filas invisibles a la búsqueda.

## QC-47 — modelo-empresa-y-membresias (cerrada el 2026-09-06, PR #37, merge `45bdf18`)

`zone: backend`, `complexity: high`. El modelo de empresa y la pertenencia del usuario a ella:
`users.company_id` obligatoria, un rol por usuario, `users.role_id` intacta. Reviewer en **OK con
0 bloqueantes y 6 menores**, sobre 29 requisitos `R1`–`R29` y 24 tasks, las 24 en `[x]`.

- **El nombre miente y ya se corrigió en los docs:** no hay tabla de pertenencias. El spec se
  **reacotó** a una empresa por usuario y el modelo de muchos a muchos de la primera vuelta quedó
  descartado sin dejar residuo (comprobado por el reviewer).
- **Corrió contra base propia `QuimiCloude_QC47`**, con el `.env` del worktree apuntando ahí, para
  no pelearse con el drift de la base compartida.
- **Su informe de review estuvo a punto de perderse.** Se quedó **sin commitear** dentro del
  worktree —no entró en el PR ni llegó a `dev`— y lo habría borrado el `wt.sh done`. Se rescató a
  mano al cerrar la ficha. F2.4 dio el PR por bueno sin comprobar que el árbol estuviera limpio.
- **Desbloquea la cadena de multiempresa:** QC-48 (`tenant-en-la-sesion`) y QC-61, y tras QC-48 las
  cinco de aislamiento por empresa (QC-49, QC-50, QC-51, QC-59, QC-60).

## QC-44 — pantalla-de-proveedores (cerrada el 2026-09-04, PR #35, merge `f966a7b`)

`zone: frontend`, `complexity: high`. La pantalla de proveedores dentro del layout privado: lista
paginada, detalle por proveedor con su catálogo, y el alta, edición y borrado de líneas de catálogo
en panel lateral. 64 archivos, +10.664/−39 en 26 commits. **Cero cambios en `db/`, cero
dependencias nuevas** (`package.json` y `pnpm-lock.yaml` con diff vacío contra `origin/dev`, y una
guardia que lo comprueba por dos vías).

- **R1–R52 con test que los ejerce de verdad, y el reviewer los abrió uno a uno** en vez de fiarse
  del mapa de la bitácora. 20 tasks (T0–T19), las 20 en `[x]`.
- **Una sola ronda de review: OK, 0 mayores, 6 menores.** Ninguno pedía tocar código para cerrar.
- **E2E real en dos motores.** `e2e/proveedores.spec.ts` cubre R51 (camino del Administrador, con
  comprobación en Postgres de que la línea existe) y R52 (rechazo del Operador, que acaba en el
  dashboard y no en el login), verde en Chromium **y WebKit**, corrido por el propio reviewer.
- **Promovió `PresentationSelect` a `components/shared/`** por decisión humana, y la mudanza se
  verificó contra regresión: 678 tests de `tests/guards`, `tests/unit/inventario`,
  `tests/unit/identity` y `app-sidebar` siguen verdes. Pero **el componente promovido se quedó sin
  tests propios en su nueva ubicación** (menor 4): toda su cobertura sigue colgando de
  `tests/unit/inventario/`, así que el día que esa ruta se reorganice, la cobertura del componente
  que también usa proveedores se va con ella sin que nada avise.

**Deuda que deja en `dev`, toda anotada por el reviewer:**

- **Un test cuyo título dice lo contrario que su assert** (menor 1): «las unidades se piden UNA sola
  vez en el servidor y bajan por props» afirma `toHaveBeenCalledTimes(2)`. El comportamiento es
  correcto y R46 se cumple, pero el detalle **pide el catálogo de unidades dos veces por render**
  —`page.tsx:64` y `catalog-directories.ts:84`— y es evitable pasando a `buildCatalogDirectories`
  las unidades ya cargadas.
- **`catalog-line-sheet.test.tsx` depende del reloj de la máquina** (menor 2): teclea siete campos
  con `userEvent` y agota los 5000 ms por defecto bajo carga; con `--testTimeout=30000` pasan los
  20. Es exactamente lo que describe **QC-58 (`timeout-tests-ui-bajo-carga`)**, que sigue `pending`.
- **Dos `supplier-route-contract.test.ts` con el mismo nombre en dos carpetas distintas**
  (`tests/unit/proveedores/` y `tests/unit/proveedores-ui/`) y contenido distinto (menor 3). Está
  declarado en la bitácora como desviación 7, no silenciado, pero invita a editar el que no era.
- **`EMPTY_CELL` y `UNRESOLVED_CELL` son el mismo glifo** (menor 5): el código documenta con cuidado
  que «no hay dato» y «no se pudo resolver el nombre» son cosas distintas y pinta las dos como una
  raya. Cosmético — R22 se cumple y el uuid nunca aparece.
- **R29 y R30 se contradicen en el propio `requirements.md`** (menor 6): R29 lista la ruta de imagen
  entre los siete campos a capturar y R30 prohíbe pedir ninguna imagen. La implementación resolvió
  por R30 y lo dejó escrito como ausencia decidida. Deuda de redacción del spec, no de código.

**Anotación de proceso:** esta entrada se escribió el 2026-09-07, tres días después del merge. La
feature estaba cerrada y con el worktree ya desmontado, pero `progress/current.md` seguía
diciendo `in_progress` y F2.6 estaba sin hacer. La fila del board manda, pero el que la mueve es el
leader: cerrar el PR no cierra la ficha.

---

## QC-48 — tenant-en-la-sesion (cerrada el 2026-09-07, PR #39, merge `f0163dc`)

`zone: backend`, `complexity: medium`. La empresa de la persona se resuelve al autenticarse
leyendo su propia ficha (`users.company_id`, obligatoria desde QC-47), viaja **firmada** en la
cookie como ya viajaba el rol, y se valida en cada petición contra la base. El formato del
contenido firmado sube a **`v3` sin compatibilidad hacia atrás**. `R1`–`R28` con test real, 14
tasks, reviewer **APROBADO con 0 bloqueantes y 5 menores**. Suite completa al cerrar: **206/206
archivos, 2438 tests, cero rojos**.

- **Ciclo completo en un día**, de `pending` a merge: acotada con `/afinar-feature`, spec, código,
  review y gate. Es la primera ficha del repo que hace el recorrido entero en una sesión.
- **Lo que define esta ficha es dónde NO puso las cosas.** El middleware terminó con **diff
  vacío**: el corte del borde lo hace el esquema `zod` del contenido firmado, así que sigue
  decidiendo sin tocar la base — que es el diseño de QC-9 y además lo único viable en runtime
  Edge. Y `SessionUser` no se descongeló: la empresa viaja en un tipo nuevo, `SessionContext`.
- **Cero consultas nuevas por petición, pero un `JOIN` más.** `companyId` ya venía en la fila que
  la sesión leía; `company.deletedAt` obliga a un `JOIN` a `companies` —por clave primaria, en la
  ruta más caliente— y se resuelve en la misma llamada a `findFirst`, igual que ya se hacía con
  `role.name`. El coste está escrito en el propio adaptador para que nadie lo descubra de
  sorpresa.
- **Tres cortes con su sitio razonado**, no puestos donde cayeran: el de «empresa dada de baja» en
  el login va **después** del hash (cortar antes sería un oráculo de tiempo), **después** del
  fallo de contraseña (si no, dar de baja una empresa desactivaría el contador de bloqueo) y
  **antes** de escribir nada (no se registra fallo por una decisión administrativa que la persona
  no puede arreglar).
- **La empresa del `SessionContext` sale de la BASE, no de la cookie.** Tras el corte que las
  compara los dos valores son iguales por construcción, así que la elección no cambia el valor:
  cambia de quién es la culpa el día que dejen de serlo.
- **Deuda que deja en `dev`:** pedir usuario y contexto en la misma petición cuesta dos lecturas
  (aceptado por escrito, con la salida ya diseñada); `design.md > 10` cita dos rutas de test con
  nombres viejos; y sigue abierta la heredada de QC-47 — cómo elige empresa el login el día que
  exista una segunda, ahora que el nombre de usuario solo es único dentro de la empresa.
- **Al desplegar caen todas las sesiones vivas**, consecuencia aceptada del `v3` sin
  compatibilidad.
- **Hallazgo ajeno que destapó y NO arregló:** algún test crea tipos de documento que **sobreviven
  a su propia transacción** y ensucian la base compartida; tumbó `identity-constraints.int.test.ts`
  en la primera corrida del gate. Se borraron las tres filas huérfanas, pero la causa sigue viva y
  volverá. Merece ficha propia — es el sexto incidente de la familia «base compartida».

## QC-64 — editor-y-lectura-de-pasos (cerrada el 2026-09-07, PR #40, merge `ba40721`)

`zone: frontend`, `complexity: high`. El editor enriquecido de pasos de receta y su lectura paso a
paso, contra el contrato cerrado que dejó QC-62. 29 archivos, +5.615/−155. Reviewer **OK en la
vuelta 2**, tras **RECHAZAR** la primera con un bloqueante.

- **El bloqueante fue un E2E, y la forma en que se detectó es la lección.** `recetas-pasos.spec.ts`
  fallaba **5 de 5 veces** en Chromium **corrido en aislado**, y pasaba cuando los dos proyectos
  corrían a la vez. WebKit en aislado pasaba. Un test que solo es verde acompañado no es un test
  verde: las teclas (`ArrowRight`, `Enter`) no llegaban al área editable y la negrilla nunca se
  apagaba, así que todo el paso salía en negrita y el localizador resolvía a dos elementos.
- **La vuelta 2 se cerró con salida real, no con la palabra del implementer**: el reviewer
  reprodujo el E2E 3 veces en Chromium, 2 en WebKit y 1 con los dos proyectos, más los 154 tests
  de `recetas-ui`, las guardias, `lint` y `typecheck`. Cero hallazgos nuevos.
- **Desbloquea QC-63** (`ejecutar-receta-operador`), que esperaba por ella.

## QC-35 — pantalla-de-pedidos (cerrada el 2026-09-07, PR #41, merge `415834c`)

`zone: frontend`, `complexity: high`. La pantalla de pedidos completa —lista, alta y edición en
panel lateral, cancelación con motivo y borrado— y **el estreno de la tabla de datos compartida de
QC-55**, que llevaba desde el 2026-09-04 mergeada sin ningún consumidor. 58 archivos, +10.309/−94.
17/17 tasks, 49/49 requisitos trazados a test, reviewer **OK en la vuelta 2** tras **RECHAZAR** la
primera con dos mayores.

- **Los dos mayores eran del arnés, no del producto.** M1: seis tests en rojo porque los centinelas
  de alcance seguían afirmando «ninguna pantalla consume la tabla compartida», que era justo lo que
  esta ficha venía a dejar de ser cierto. Se invirtieron cuatro, y la inversión **no aflojó nada**:
  dicen «pedidos es su ÚNICO consumidor», con un caso aparte que mantiene cerradas inventario y
  producción —migrarlas sigue siendo QC-56—. M2: el gate completo se había dado por verde sin
  correrlo.
- **La inversión se validó falsificándola, no leyéndola.** El reviewer reprodujo **9 mutaciones**
  restaurando el árbol tras cada una, y las nueve dieron rojo: entre ellas las dos que el
  coordinador puso como condición —que inventario o producción importen la tabla—. Los tres
  centinelas invertidos ganaron además aserciones anti-vacío (`consumidores > 0`), que es lo que
  impide que un centinela invertido se muera en silencio el día que su bucle no encuentre nada.
- **Cero dependencias nuevas**, comprobado contra la base de la rama: lo que aparece en el rango
  (`package.json`, `pnpm-lock.yaml`, primitivas de `components/ui/`) llegó del re-merge con `dev`,
  de QC-64 y QC-48.
- **Nació sin buscador y sin columna de total a propósito** (decisión humana del 2026-09-06), en vez
  de nacer con una caja que no hace nada: las dos cosas son **QC-68** (backend), y enchufarlas en la
  pantalla es una ficha de frontend posterior que **esta ficha no creó**.
- **Deuda que deja en `dev`:** el menor `m2` del reviewer sigue abierto —`recetas/module-contract`
  es más estricto que su criterio, yerra del lado seguro—; P2 y P3 de QC-55 se arrastran (P2
  comprobada formalmente: ninguna columna emite ancho, así que no se propone la tercera prop); P4 y
  P5 de su `requirements.md` —devolución de un pedido entregado y exportación al contable— siguen
  sin decidir y no se rellenaron con supuestos.
- **Al cerrar apareció trabajo sin commitear en el worktree:** las 112 líneas de la segunda ronda
  del reviewer vivían solo en el árbol de trabajo y **no entraron en el PR**. La guarda 3 de
  `wt.sh` las retuvo en vez de borrarlas; se trajeron a `dev` en `805de89` y solo entonces se
  desmontó. Es exactamente el caso para el que existe la guarda.

## 2026-09-07 — QC-54-unificar-constante-rol-administrador

- Una sola definición de «es Administrador» en el repo. El literal `'Administrador'`, que estaba
  declarado cuatro veces (`ROLE_ADMINISTRADOR` en `identity/domain/roles.ts` más un
  `ADMIN_ROLE_NAME` propio en inventario, recetas y unidades), queda solo en `identity`; los ~20
  consumidores lo importan de su barrel. Y los **cinco `requireAdmin` copiados** (inventario,
  recetas, unidades, pedidos, proveedores) pasan a delegar en una única implementación.
- Requisitos cubiertos: R1–R17, los 17 con test. PR #42, merge commit `fa116cd`.
- `reviewer` **APROBADO en una sola ronda**: 0 bloqueantes, 5 menores. Verificó los 17 abriendo
  los tests en vez de fiarse del mapa de la bitácora, y probó la guardia nueva con **dos
  mutaciones propias** (un literal en `middleware.ts` y un archivo nuevo en `identity/domain/`):
  salió roja citando las dos rutas, lo que además demuestra que la exención de
  `seed-initial-access.ts` es por archivo y no cubre la carpeta.
- Decisión que hizo posible el cambio sin tocar comportamiento: **`requireAdmin` parametrizado por
  el error**. `identity` publica la implementación genérica, que recibe una fábrica `onDenied`, y
  cada módulo la envuelve con su propio `UnauthorizedError`. Un error compartido no podía extender
  cinco clases base a la vez y habría caído fuera de los siete `catch` que hacen
  `instanceof <Modulo>Error`.
- Entra `tests/guards/guard-rol-administrador-unico.test.ts`: rojo si el literal se declara fuera
  de `identity/domain/roles.ts`. Es la mitad que impide que la deuda vuelva — cuatro módulos
  declararon el suyo teniendo uno bueno delante.
- Deuda que hereda, toda `menor` y ninguna del núcleo: la reincidencia **por alias**
  (`export { ROLE_ADMINISTRADOR as ADMIN_ROLE_NAME }`) pasaría los tres filtros y no la cubre
  nadie; R17 (los comentarios describen el estado nuevo) se verificó a mano porque la guardia
  descuenta comentarios a propósito; siguen dos archivos silenciados enteros por
  `baseline-rojos.json`, deuda anterior a esta ficha; y sin E2E, diferido con motivo por el humano
  ANTES del spec (es un refactor sin comportamiento observable nuevo). Nota de arnés que dejó el
  reviewer: sin `DATABASE_URL` en el shell del worktree caen 27 integraciones, y
  `docs/worktrees.md` no lo menciona.
- **Desbloquea QC-74** (`modelo-de-permisos`), acotada y sembrada el mismo día: los permisos por
  módulo sustituyen esa única `requireAdmin` por `requirePermission`.

## 2026-09-07 — QC-74-modelo-de-permisos

- «Quién puede» deja de responderse con una sola pregunta —¿es Administrador?— repetida en cinco
  módulos. Entra un catálogo cerrado de **diez permisos** con la forma `<modulo>.<accion>`
  (`inventario.consultar`, `inventario.modificar`…), persistido en dos tablas nuevas
  (`permissions`, `role_permissions`) y sembrado; los cinco servicios exigen el permiso concreto
  antes del repositorio, donde ya autorizaban.
- Requisitos cubiertos: R1–R24, los 24 con test. PR #43, merge commit `95b9b51`. 129 archivos,
  +5917/−908.
- `reviewer` **APROBADO en una sola ronda**: 0 mayores, 6 menores. Probó la trazabilidad
  **rompiendo el código: 11 mutaciones**, todas rojas donde debían y verdes en el caso simétrico,
  y verificó una a una las cinco declaraciones del implementer en vez de fiarse de la bitácora.
- Va **encima de QC-54, no en su lugar**, y por eso el `depends_on`: `assertAdminRole` —ya única
  gracias a aquélla— pasa a `assertPermission(actor, code, onDenied)` conservando el patrón de
  fábrica de error. Cada módulo sigue lanzando su `UnauthorizedError`, así que los siete
  adaptadores driving lo siguen atrapando con `instanceof <Modulo>Error`: era el riesgo
  estructural de la ficha, cinco módulos a un `instanceof` de una regresión silenciosa.
- Sin comodín: el Administrador tiene los diez permisos escritos uno a uno. **Modificar no implica
  consultar** —hacen falta los dos y el seed los da juntos—, decisión del humano para que no haya
  reglas invisibles. El Operador nace solo con `inventario.consultar`.
- Entran **tres guardias**: rojo si un permiso declarado no está asignado a ningún rol, si un
  servicio sigue autorizando por nombre de rol, y si aparece una vía de aplicación para
  administrar el catálogo. La tercera la añadió el implementer fuera de `tasks.md` porque R5 se
  quedaba sin test propio, y la declaró como desviación.
- **La migración generada traía 17 `DROP CONSTRAINT` y 9 `DROP INDEX` por drift histórico**,
  borrados a mano siguiendo el precedente de QC-47. Sin eso habría desmontado media base. El
  reviewer leyó el `migration.sql` final entero para confirmarlo.
- Deuda que hereda: **las guardias son ciegas a comentarios de línea con finales CRLF**
  (`/\/\/.*$/` sin flag `m`) — heredada del precedente de QC-54 y presente en **cuatro**
  guardias; hoy no muerde porque el árbol está en LF, pero con `core.autocrlf=true` se ponen rojas
  por documentación. Y `docs/architecture.md > Dominio` sigue diciendo que las tablas exentas de
  columna de empresa son tres cuando ya son cinco. Las dos son `/afinar-regla`. Sin E2E, diferido
  a QC-75 por decisión del humano ANTES del spec: aquí no hay pantalla que abrir.
- **El gate abortó dos veces sin llegar a mirar una línea de código**, las dos por el
  `feature_list.json` de la rama: nació de `origin/dev`, que no conocía el board importado ese día
  —faltaba la ficha QC-74 entera y daba por `in_progress` cuatro features ya mergeadas—. Se
  corrigió trayendo la copia del board tal como estaba en disco (`e5b0949`), no parcheando filas.
  A la tercera, `== init OK ==`: 233 archivos, 2822 tests, «sin rojos nuevos».
- `wt.sh done` **volvió a fallar en Windows** —desregistró el worktree y dejó el árbol en disco—,
  rematado con `rm -rf` + `git worktree prune`. Van **siete** veces y sigue sin ficha.
- **Desbloquea QC-75** (`menu-y-rutas-por-permiso`): el menú filtrado, el 404 por ruta, el destino
  del login y el E2E que esta ficha difirió.

## QC-76 — equivalencia-y-ambito-de-unidades (cerrada el 2026-09-08, PR #45, merge `5ee52fe`)

Zona `backend`, `complexity: high`. El catálogo de unidades de QC-32 gana la **equivalencia**
—de qué unidad deriva cada una y por qué factor— y el **ámbito por empresa**; el módulo publica
la conversión en su contrato y el listado que ya existía pasa a devolver las de la empresa **más**
las de sistema. 38 requisitos EARS, 33 decisiones cerradas, cero preguntas abiertas.

- **Se especificó sin descubrir nada escribiendo.** `/afinar-feature` había sembrado el
  `requirements.md` con el alcance y 30 decisiones cerradas ANTES del spec, así que `spec_author`
  solo escribió los EARS, el `design.md` y el `tasks.md`. Las tres decisiones que faltaban las
  cerró el humano en el hilo, sin reabrir ninguna de las anteriores: **truncar a 12 decimales**
  cuando la división de la conversión no termina (nunca hacia arriba, en una constante con
  nombre); autorizar por el permiso **`unidades.consultar`** y no por el `ADMIN_ROLE_NAME` que
  retiró QC-54; y dejar **`findRefs` sin filtro de empresa**, única excepción a R18, con destino
  QC-50.
- **«De sistema» es exactamente «sin `company_id`»**: no se creó el campo `system` que pedía la
  petición original. Dos campos que dicen casi lo mismo acaban contradiciéndose.
- **El reviewer rechazó en la ronda 1, y tenía razón**: el índice único de símbolo (R15) dejaba
  **11 archivos de test de otros módulos en rojo determinista** —65 choques de
  `Unique constraint failed on the fields: (symbol)`—, porque **doce fixtures** de `inventario`,
  `recetas`, `pedidos` y `proveedores` sembraban unidades de sistema con símbolo fijo `'kg'`/`'ut'`.
  Era el mismo problema que el implementer ya había resuelto para los tres fixtures de dentro de
  `unidades`; se quedaron los doce de fuera. Se arregló de raíz —símbolo derivado del marcador
  irrepetible— y el reviewer verificó **con el diff, no de palabra**, que no se tocó ni un aserto:
  cero líneas con `expect(` eliminadas o modificadas, solo 3 añadidas. Ronda 2: **APROBADO, 0
  mayores**, con 3 mutaciones al código de producción, las tres cazadas.
- **La lección de método, y es de los dos**: quedó oculto porque el implementer corrió solo
  `tests/unit/unidades` y `tests/integration/unidades`, y el leader se quedó en `--rapido`, que no
  selecciona los tests de integración de otros módulos. El «38 de 38 en verde» era cierto para
  `unidades` y se leyó como «la feature no rompió nada», que era justo lo que nadie había
  comprobado. Una feature que añade una restricción a una tabla compartida se verifica con
  `tests/integration` **entero**, no con lo suyo.
- **La base de desarrollo bloqueó la mitad del trabajo.** Arrastraba una unidad residual de un test
  cuyo símbolo `kg` duplicaba el de `kilogramo` y hacía fallar el índice nuevo con `23505`. Se
  verificaron **cero referencias** desde `products`, `recipe_lines` y `supplier_catalog_lines`
  antes de tocarla, y el humano eligió borrarla frente a anularle el símbolo. Después, el UP, el
  DOWN y el re-UP se ejercitaron **de verdad** (`db:rollback` + `db:migrate`), no en transacción
  deshecha.
- **El gate volvió a abortar en el paso 3 sin mirar código, y esta vez se arregló la causa.** El
  validador resolvía `specs/` y `.worktrees/*/specs` contra el directorio actual, y desde dentro
  de un worktree `.worktrees/` no existe: cualquier otra feature en vuelo daba «faltan specs»
  con sus specs sanos a un directorio de distancia. **Bloqueaba el F2.4 de todas las features a la
  vez.** Van tres veces —dos en QC-74, anotadas como «sigue sin resolverse»—. Entró por
  `/afinar-regla` como `chore(arnes)` `05d47f5`: resolución contra la raíz del repo, fallo si no
  la encuentra, y guardia que muerde.
- **El informe del reviewer apareció sobrescrito** por una versión «APROBADO, cero mayores» que no
  era suya y que se llevó por delante tres menores. Se detectó porque el implementer no lo pudo
  leer, y el reviewer lo reescribió entero con un aviso de integridad. No cambió el trabajo: el
  bloqueante ya se había reproducido de forma independiente.
- **El implementer murió una vez por corte de stream** (watchdog a los 600s sin emitir), con dos
  commits ya en la rama. Se reanudó sin perder nada. Es la misma causa que documenta
  `AGENTS.md > Regla del gate`: esperas largas en primer plano.
- Cierre: `./init.sh` **completo** desde el worktree en verde —exit 0, `== init OK ==`, 236/237
  archivos, **2919 tests**, único rojo en el baseline—. El gate avisa además de que **4 archivos
  del baseline ya pasan** y tocaría limpiarlos: queda como deuda, no es de esta ficha.
- Menores vivos: **R37** se cierra por inspección sin test directo, y `docs/architecture.md >
  Dominio` sigue listando «unidades (QC-51)», ficha cancelada al acotar ésta.
- **Desbloquea QC-38** (`crud-de-unidades`: alta, edición y borrado encima de esto), y tras ella
  QC-39.

## QC-75 — menu-y-rutas-por-permiso (cerrada el 2026-09-08, PR #44, merge `bc343cf`)

- La zona privada deja de enseñar lo que no se puede usar. El menú lateral se arma **en el
  servidor** filtrando `PRIVATE_NAV_ITEMS` por `<modulo>.consultar` de quien entra (grupo sin hijos
  visibles desaparece entero); las **ocho** páginas privadas cortan con
  `requirePagePermission(...)` **antes de leer datos**, y quien no tiene permiso recibe **404**, no
  un redirigido. El 404 se pinta en `app/(private)/not-found.tsx`, **dentro** del layout privado:
  menú vacío pero con cerrar sesión alcanzable, así que nadie queda encerrado. El login deja de
  llevar siempre al dashboard: va a la primera pantalla visible de esa persona.
- Del middleware sale la lista de reglas ruta-a-rol: queda solo con lo que puede comprobar sin base
  —firma, caducidad y empresa—. **Una sola verdad sobre quién entra a qué, y vive donde sí se lee la
  base.** El coste aceptado: la petición sin permiso llega al servidor, sobre la lectura de sesión
  que el layout ya hacía en cada render (R19 la fija en **una sola** por render).
- Requisitos cubiertos: **R1–R22**, los 22 con test verificado abriendo el archivo, no contra el
  mapa. 16/16 tasks. `reviewer` **APROBADO en una sola ronda**: 0 mayores, 3 menores, con **siete
  mutaciones** al código de producción, las siete cazadas. `./init.sh` completo en verde antes del
  PR. 66 archivos, +5081 / −967.
- **Un bug real que destapó el E2E, no el diseño**: `login/page.tsx` fabricaba `DASHBOARD_ROUTE`
  como respaldo y `LoginForm` lo traía como valor por defecto, así que el campo oculto `next`
  viajaba con `/dashboard` en **todo** login sin `?next=` y ganaba dentro de `loginAction` — R11
  quedaba muerto en el navegador aunque el unitario pasara. Arreglado con cadena vacía en ambos
  puntos, y la red de regresión se puso en **las dos capas** (`login-action` con el `next` presente
  pero vacío, `login-form` con el campo oculto vacío). QC-9 R8/R9 no se debilitó.
- **Relajación acotada del centinela de QC-12**: `dashboard-route-contract` tenía prohibido a
  `page.tsx` tocar composition, y ahora debe importar el helper del corte. Se descuenta **solo** ese
  import, con regexp anclada a línea completa cuya ruta sale de las mismas constantes que el caso
  positivo, y la lista entera de prohibidos se aplica a lo que queda. Cerrada por los dos lados: hay
  caso que se pone rojo si el import desaparece, para que la excepción no quede verde por vacuidad.
- Guardias nuevas que impiden la reincidencia: `guard-nav-permisos-declarados` (todo enlace del menú
  declara un permiso **del catálogo**, sin comodín), `guard-pantallas-exigen-permiso` (una página
  privada nueva sin corte pone el gate rojo con nombre de archivo) y `qc75-convenciones`, que además
  afirma contra el merge-base que la ficha **no tocó** esquema, migraciones, seed, el dominio de los
  cinco módulos ni `package.json`. Sin backend propio y sin librería nueva.
- **El E2E de permisos que `CHECKPOINTS.md` exigía ya existe**: `e2e/permisos.spec.ts` — el Operador
  entra, aterriza en inventario, ve el menú recortado y recibe 404 al pedir `/pedidos` por URL.
- Menores vivos, ninguno bloqueante: **M1**, que el layout nunca llame a `notFound()` lo sostienen
  hoy los comentarios y el E2E, y una línea en `qc75-convenciones` lo cazaría en `--rapido` en vez
  de en el test más caro; **M2**, operativo: `permisos.spec.ts` depende del seed de QC-6/QC-74 para
  el rol `Operador`, así que fuera del worktree la base tiene que estar sembrada (falla con mensaje
  explícito); **M3**, `CHECKPOINTS.md > Permisos` sigue diciendo «vía `cookies()`», mecanismo que la
  página ya no toca y que el propio centinela le **prohíbe** nombrar — prosa desfasada, no de esta
  ficha.
- **Cierra la deuda provisional de QC-45**: el item de Configuración que se ocultaba a mano al no
  Administrador queda sustituido por el menú filtrado por permisos en el servidor.
- **Cerrada el 2026-09-08**: PR #44 mergeado (merge del board a *Finalizado* y comentario con la URL en el issue). Worktree ya desmontado; la ficha pasa a `done` en `feature_list.json`.


## QC-45 — pantalla-de-presentaciones (cerrada el 2026-09-08, PR #46, merge `fb144c8`)

- El catálogo de presentaciones deja de vivir solo dentro del selector de productos y tiene pantalla
  propia en **`/configuracion/presentaciones`**: lista paginada con búsqueda y orden por nombre, alta
  y edición en un **panel lateral único** de un solo campo, y borrado con `alert-dialog` que nombra la
  presentación. Server Component que lee `searchParams` y despacha a los estados de carga / vacío /
  error. **Nace además la sección CONFIGURACIÓN de la navegación privada**, que no existía, y lo hace
  con **un solo ítem** —no se añadió Unidades apuntando a un 404, que era repetir la deuda de QC-11—.
- **Monta la tabla compartida de QC-55, no una tercera copia del esqueleto de productos**, y de paso
  **resuelve la pregunta abierta 4 de QC-55**: la columna de acciones de fila se declara como columna
  normal (`pinnable: false`), con los botones siempre visibles y `min-h-11 min-w-11`. **QC-56 hereda
  esa respuesta.** Ni un archivo de `components/shared/data-table/` fue tocado, y hay guardia que lo
  afirma.
- Requisitos cubiertos: **R1–R36**, los 36 con test mapeado y **los 36 ejecutados**. `reviewer`
  **APROBADO** en las dos rondas que revisó (0 mayores; 7 menores en la ronda 1, 8 en la ronda 2).
  Tres rondas de implementación: `30e9e2b` (la pantalla), `a342465` (corte por permiso + menú),
  `4cabc05` (el spec deja de describir el mecanismo que QC-75 borró). 40 archivos, +6719 / −355.
- **La ficha se implementó mientras QC-75 le cambiaba el suelo debajo.** Nació con un ítem de menú
  que se ocultaba a mano al no Administrador —provisional a propósito— y con una fila en
  `route-role-rules.ts`; QC-75 borró ese mecanismo entero. La ronda 2 la readaptó: la página corta con
  `requirePagePermission(...)` y quien no puede pasar recibe **404**, no un redirigido.
- **Excepción declarada a QC-75 R5, y escrita donde se busca** (`design.md > 3.2`): el ítem declara
  **`inventario.modificar`** en vez de `<módulo>.consultar`, porque `inventario.consultar` lo tiene
  también el Operador y el enlace sería visible con 404 detrás —justo lo que QC-75 evitaba—. Queda
  dicho que el caso normal sigue siendo `<módulo>.consultar` y que **QC-39 debe usar
  `unidades.consultar`** salvo que caiga en el mismo aprieto.
- **Sólo dos archivos de producción heredados modificados** (`lib/shared/routes.ts` y
  `lib/composition/route-role-rules.ts`, este último +6 líneas y 0 borradas a propósito, para que el
  merge con QC-75 fuese limpio) y **siete tests heredados de lista cerrada ampliados** en vez de
  silenciados — la excepción de `inventario/scope.test.ts` se dejó **más estrecha** que las dos que ya
  existían. R33 se reescribió con la cifra real después de que el reviewer contase seis.
- E2E en `e2e/presentaciones.spec.ts`, **verde en Chromium y WebKit** (`4 passed (47.5s)`, 0 rojos,
  `afterAll` sin dejar filas huérfanas): el Administrador entra, crea y filtra; quien no tiene permiso
  recibe 404 y no ve ni un dato. Navega **siempre por URL** a propósito, y el motivo está en la
  cabecera del spec.
- **Deuda viva, y no la puede cerrar un agente: T10**, la comprobación manual del scroll contenido en
  la tabla en un **WebKit real**. El E2E corrió en WebKit y pasó, pero eso no es lo que T10 pide.
- **El gate completo nunca llegó a correr antes del PR** —`tests/integration/` estaba rojo por la
  migración de QC-76 sobre la base compartida—, así que la ficha se mergeó con `--rapido`. Se corrió
  **en el cierre**, desde el worktree: typecheck ✓, lint ✓, las siete validaciones del arnés ✓,
  **3145 tests verdes de 3177**. **Ninguno de los 23 rojos es de esta ficha**: 17 son el flake de
  carga que el baseline ya documenta (`catalog-line-sheet`, `supplier-page`); 2 son **ese mismo
  flake sin entrada propia** (`identity-facade`, `login-form-uncontrolled-warning`), medido —los dos
  pasan **9/9 corridos aislados**—; y los 4 restantes son el **artefacto de correr el gate sobre una
  rama ya mergeada**: las auto-comprobaciones de `configuracion-convenciones`, `data-table-intacta`,
  `module-contract` y `recipe-route-contract` exigen que `dev...HEAD` devuelva archivos, y con la
  rama dentro de `dev` ese rango es **vacío**. Es la guardia impidiendo un verde por vacuidad, que es
  justo para lo que se escribió, no una regresión.
- **El árbol principal no pudo correr el gate**: `prisma generate` falla con `EPERM` porque otro
  proceso tiene tomado `query_engine-windows.dll.node`, así que su cliente sigue sin los campos que
  QC-76 añadió a `Unit` y el typecheck cae con 41 errores en `lib/modules/unidades` y
  `tests/integration/unidades`. **Es cliente desactualizado, no código roto** — el mismo typecheck
  pasa limpio en el worktree, cuyo cliente sí se regeneró.

## QC-38 — crud-de-unidades (cerrada el 2026-09-08, PR #47, merge `516e9c0`)

Zona `backend`, `complexity: medium`. El catálogo de unidades deja de ser intocable: entran el
**alta, la edición y el borrado** con su superficie de Server Actions, encima del modelo de QC-76 y
autorizando **por permiso** con el de QC-74. 36 requisitos EARS, 24 decisiones cerradas.

- **Es la ficha que abrió la sesión y no se pudo arrancar.** Estaba bloqueada por `depends_on`, y
  QC-76 se hizo para desbloquearla; las dos cerraron el mismo día.
- **Se creó `unidades.modificar`, y eso enmienda QC-74.** Su R2 decía «ni uno más ni uno menos» y
  su R4 justificaba dejar `unidades` sin escritura con «no tiene escritura» — premisa que deja de
  ser cierta justo por esta ficha. El catálogo pasa a **once**, sembrado al Administrador **junto
  con** `unidades.consultar` (modificar no implica consultar), y **la enmienda está escrita en el
  código**, en la cabecera del catálogo, no solo en el spec. La guardia de QC-74 sigue mordiendo
  reanclada en once: borrar la entrada tumba **17 casos**. Descartado reutilizar `consultar` para
  escribir, que habría roto la separación que QC-74 construyó en los otros cuatro módulos.
- **El defecto que solo la integración podía ver.** El `design.md` mandaba traducir el `P2002` de
  Prisma leyendo el **nombre del índice** en `meta.target`; contra Postgres real eso trae las
  **columnas**, así que los `Set` no hacían match nunca y **R11 y R12 habrían llegado rotos a
  producción**. Ningún test con dobles podía desmentirlo —el doble confirma la suposición falsa—.
  Lo cazó el implementer contra la base real, lo corrigió por columna con el precedente de QC-25
  (`recipe-prisma.ts`) **sin tocar un solo test**, y el reviewer lo confirmó revirtiéndolo: la
  integración se puso roja exactamente en R11 y R12. El spec quedó corregido (`f10a20e`) y esos dos
  requisitos se verifican ahora **obligatoriamente en integración**.
- **La lección de QC-76 se aplicó de entrada y funcionó.** Aquí lo compartido era `PERMISSIONS`, y
  pasar de diez a once ponía en rojo **seis archivos de test ajenos**. Se actualizaron **en la misma
  tanda** que el cambio, y el reviewer verificó **con el diff** que solo cambiaron conteo y texto:
  ningún `expect` borrado, ningún `toEqual` degradado a `toContain`, ningún caso saltado. Cero
  rondas de rechazo, frente a la de QC-76.
- **Reviewer APROBADO a la primera**: 0 mayores, 5 menores, los 36 requisitos verificados uno a uno
  y **8 mutaciones al código de producción, las 8 mordieron**.
- **Dos agujeros del gate arreglados desde aquí**, por `/afinar-regla` y entrando por esta rama
  porque `dev` local iba 26 commits por detrás: `init.sh` no cargaba el `.env` —el veredicto del
  gate dependía del shell que lo lanzara: 23 archivos en rojo desde uno limpio, 1 con el `.env`
  cargado, y el rojo se leía como fallo de código porque Prisma dice «Validation Error»— y el
  centinela de QC-75 exigía que el diff trajera su propio `private-nav.ts`, con lo que **ponía en
  rojo el gate completo de todas las demás ramas**. Los dos con su porqué escrito.
- **Deuda ajena descubierta y NO arreglada aquí**: `tests/unit/navegacion/private-layout-menu.test.tsx`
  está en rojo determinista porque `ab28f97` —un cambio de UI hecho a mano en `dev`— movió el
  disparador del menú de usuario que esperan los tests de QC-75 y QC-45. Entró al baseline con esa
  trazabilidad. **Necesita ficha**: o el cambio de UI actualiza el test, o el test se adapta.
- **El flake de saturación no era una puerta cerrada, era intermitente.** Se midió: tres corridas
  completas dieron conjuntos distintos de rojos, una de ellas **cero**. La lectura primera —«ninguna
  feature puede enseñar hoy un gate verde»— era demasiado categórica. Lo arregla QC-58, en vuelo.
- Cierre: `./init.sh` completo en verde tras el merge de `dev` —265 archivos, `sin rojos nuevos`—,
  con el único conflicto del merge resuelto conservando el spec escrito frente a la copia sembrada
  que alguien había commiteado en `dev`.
- El gate avisa de que **6 de las 7 entradas del baseline ya pasan**: el fichero describe un pasado
  que ya no existe y toca limpiarlo cuando QC-58 cierre.
- **Desbloquea QC-39** (`pantalla-de-unidades`), que hereda además el menor m1: un `id` malformado
  escapa como `P2023` en vez de `NotFoundError` — sin impacto de seguridad y hoy inalcanzable
  porque no hay pantalla.

## QC-65 — estado-de-cuenta-de-usuario (cerrada el 2026-09-08, PR #48, merge `c640c7a`)

- **Qué se construyó.** Una cuenta de usuario gana **estado** —`active`, `pending`, `inactive`,
  `blocked`— y el **rastro de su último cambio**: `account_status`, `account_status_changed_at`
  (obligatorio, `timestamptz`, `DEFAULT now()`, **sin** `@updatedAt`) y `account_status_changed_by`
  (opcional, FK a `users` con `RESTRICT`; vacío significa «lo hizo el sistema»). Enum
  `UserAccountStatus` en Postgres, dominio puro en
  `lib/modules/identity/domain/account-status.ts`, reexportado por el contrato del módulo, y
  migración aditiva con su `down.sql` (el `DROP TYPE` el último). **Una cuenta nueva nace
  `pending`; las filas preexistentes quedan `active`** por backfill, incluido el admin del seed de
  QC-6, que tiene que seguir entrando.
- **Requisitos cubiertos: R1–R21**, los 21 con test y **verificados abriendo el caso, no leyendo el
  mapa** — la lección de QC-45 aplicada de entrada. `reviewer` **APROBADO a la primera**: 0 mayores,
  5 menores, con mutaciones propias (`SEED_ADMIN_ACCOUNT_STATUS -> inactive` cae en dos frentes; un
  archivo temporal que leyera `accountStatus` fuera del módulo cae por R19). `./init.sh` completo en
  verde: **3378 tests, 2 rojos y los dos en el baseline**.
- **Nadie lee todavía el estado.** La ficha solo persiste; que el estado mande en el acceso es
  **QC-78**, los casos de uso que lo cambian **QC-66** y la pantalla **QC-67**. No se tocó
  `lock_level` ni `locked_until`.

### Dos guardias ajenas que mordían fuera de su sitio, arregladas aquí (`835de6d`)

- **La guardia de alcance de QC-38** ponía en rojo a **cualquier rama que tocara `db/`**, tuviera o
  no que ver con unidades — el mismo patrón que el baseline ya documenta para la R44 de QC-26. Se
  aplicó **la cura que ya existía en el repo** (`7cd478b`, «el centinela de QC-75 solo muerde en su
  rama») en vez de inventar una tercera forma: constante `ARCHIVO_CENTRAL`, `esLaRamaDeQC38` y
  `ctx.skip(...)` con mensaje que dice que **ese caso no ha comprobado nada**. Fuera de su rama:
  **mudo, nunca verde**. El centinela es `unidades/adapters/driving/unit-actions.ts` porque la propia
  guardia de QC-38 lo nombra (R27, R31): un rename lo rompe ruidosamente en vez de dejarlo mudo.
- **`pedidos-schema.test.ts` afirmaba sobre la lista GLOBAL de enums del esquema**, así que
  `UserAccountStatus` la rompió — y la habría roto el siguiente enum legítimo de cualquier módulo.
  **No se añadió a una lista**: se acotó el sujeto. Un enum es de pedidos si algún campo de un modelo
  con `/// @module pedidos` lo declara como tipo, derivado del esquema real. No queda lista que
  mantener, y `OrderStatus`/`OrderPriority` siguen con igualdad **ordenada**.
- Las dos se demostraron **corriendo, no razonando**: la de QC-38 vuelve a ponerse roja con un commit
  temporal que toca su centinela; la de pedidos muerde con tres mutaciones del esquema, las tres
  revertidas y `db/schema.prisma` byte a byte igual.

### Deuda que deja, con nombre y dueño

- **La bomba de relojería de las guardias de alcance (menor 4).**
  `tests/unit/identity/account-status-scope.test.ts` mide lo tocado como `git diff dev...HEAD` ∪
  `git status --porcelain` y exige `length > 0`: **sobre `dev` limpio y ya mergeada, ese conjunto es
  vacío y cuatro casos caen**. No es invento de esta ficha —
  `configuracion-ui/data-table-intacta.test.ts` (QC-45) tiene la misma bomba y hoy pasa solo porque
  el árbol principal está sucio. **Son dos guardias con el mismo defecto y toca ficha de arnés.**
- **RLS y el backfill (menor 5), con agravante.** El `UPDATE` del backfill corre en local porque el
  rol de `DIRECT_URL` es superusuario con `BYPASSRLS`: **pasa por la razón equivocada**. Con un dueño
  no superusuario sobre una tabla `ENABLE`+`FORCE` sin policies, afecta a **cero filas y no falla**, y
  aquí **no hay `SET NOT NULL` posterior que delate el fallo**: un despliegue fuera de local podría
  dejar a todos los usuarios en `pending` sin que nada proteste, y solo se notaría cuando **QC-78**
  corte el login. QC-47 midió esto y decidió no mitigar; QC-65 hereda la decisión. **Decisión del
  humano antes del primer despliegue no local.**
- **R6 y la reversibilidad de R17 solo están automatizadas al nivel estático** (predicados sobre el
  texto del `migration.sql` y del `down.sql`). La comprobación contra Postgres real la hizo el
  implementer **a mano** y está escrita; la suite no la reproduce. Es el límite conocido del repo
  —no se aplica una migración dentro de un test de integración sin base efímera— y el design lo asumió.
- **El backfill se vigila contra `SEED_ADMIN_ACCOUNT_STATUS` (menor 3)**, que es otro concepto. Hoy
  los dos valen `active` y el test es correcto y falsable, pero cambiar esa constante mañana exigiría
  editar una migración **ya aplicada**. La salida limpia es una constante propia para «el estado de
  las filas preexistentes»; **decisión para QC-66/QC-78**.
- **Defecto preexistente de QC-38, encontrado de paso y NO tocado a propósito**:
  `archivosCambiadosDesdeDev()` de `unidades-convenciones.test.ts` hace `linea.trim()` y luego
  `linea.slice(3)` sobre `git status --porcelain`, así que `" M ruta"` acaba como `"ta"`. La parte
  «morder antes de commitear» de R32/R34 **no ve las modificaciones de archivos ya rastreados**.
- **Séptima vez que `wt.sh done` falla en Windows**: desregistró el worktree pero dejó el árbol en
  disco por las rutas largas de `pnpm`. Rematado con `rm -rf` + `git worktree prune`. Sigue sin ficha.
- **Desbloquea QC-66** (`crud-de-usuarios`) y **QC-78** (`estado-de-cuenta-en-el-acceso`). La zona
  `backend` queda con QC-83 sola en `in_progress`.

## QC-58 — timeout-tests-ui-bajo-carga (cerrada el 2026-09-08, PR #49, merge `d26d09e`)

- Los tests de UI fallaban de forma intermitente con la máquina cargada sin que nada del producto
  estuviera roto. Entran las dos curas: **`testTimeout: 15_000`** dentro del bloque `test` de cada
  uno de los tres proyectos de Vitest —nunca en la raíz: es opción por proyecto y confiar en la
  herencia sale **verde si te equivocas**— y **una sola forma de teclear**, `setupUser()` sobre
  `userEvent.setup({ delay: null })`, con los 33 archivos migrados y guardia que impide reincidir.
  **Cero líneas de producción**: el diff no toca `app/`, `lib/`, `components/`, `db/` ni middleware.
- Requisitos cubiertos: **R1–R18**, todos con test o evidencia nombrada. 17/17 tasks.
  `reviewer` en **dos rondas**: rechazó la primera con 1 mayor real, aprobó la segunda con 0 mayores
  y 6 menores de redacción.
- **La lección de método, que es lo más valioso que deja**: quitar el retardo entre teclas destapó
  **tres familias de fallo distintas**, y las tres se anunciaron con **un solo caso rojo** mientras
  el barrido encontraba mucho más — `pointer-events: none` en popups de Base UI (**22 sitios en 14
  archivos**, diez verdes por la misma casualidad); el uso de la **API directa** de `user-event`,
  que no hereda `delay: null` (5 sitios, más **32** que llegaron de `dev` en el merge); y
  **aserciones fuera de la espera que las cubre** (5 `waitFor`, con 8 sitios descartados con
  argumento). Ante un flake, el primer síntoma nunca es el alcance.
- **`--rapido` no prueba nada contra un flake de saturación**, y aquí está medido:
  `catalog-line-sheet.test.tsx` estaba en su grafo y salía **verde**; solo falló con la batería
  entera saturando la máquina, y aun así 2 de 3 veces.
- **El mayor del reviewer era real y merece recordarse**: R6 —«nadie teclea por su cuenta»— se
  cumplía solo en la mitad que la guardia miraba, porque la API directa no lleva `userEvent.setup(`
  en el texto. La guardia se amplió y se probó con mutaciones propias del reviewer, incluida la del
  **import renombrado** (`import ue from ...; ue.click(...)`) y un **control negativo** que confirma
  que no castiga los `import type`.
- Dos requisitos reformulados, los dos conservando por escrito la redacción anterior y el motivo:
  **R9** (dos tests pasaban por accidente, gracias a un `setTimeout(0)` que nadie había pedido;
  decisión humana: esperar explícitamente la precondición) y **R13** (pedía cinco corridas «sin
  aviso de *por limpiar*», condición que **solo se puede cumplir desde `dev`** — en rama esas
  entradas pasan, y borrarlas dejaría `dev` en rojo).
- Verificación: **cinco `./init.sh` completos seguidos, las cinco `exit 0`**, 3346 casos, con la
  salida literal del comparador de cada una (R14) y marcas de tiempo que demuestran la secuencia.
  Se descartaron **tres tandas** anteriores y se anota por qué: una roja, una que la ronda 2
  invalidó al cambiar el árbol, y una en la que **las corridas se solaparon** y por tanto no eran
  «seguidas».
- Baseline de rojos: de cinco entradas a tres. Retiradas las tres de esta causa (R10), sumada la
  que `dev` añadió (`private-layout-menu`, legítima y por otra causa) y **retirada una cuarta**,
  `order-sheet`, cuyo propio motivo pedía «RETIRAR esta entrada en el mismo cambio que arregle
  QC-58». Va más allá de la letra de R10; el reviewer la juzgó justificada y dijo que **endurece**
  el gate.
- **Deuda que hereda, declarada y no escondida**: la tercera familia de fallo **se queda sin
  guardia** —un `waitFor` con aserciones detrás no se distingue de uno legítimo sin una lista de
  excepciones nombradas—, y quedan 8 sitios sin cubrir con argumento escrito.
- **Cuatro deudas de arnés que destapó y que no le tocaban**, todas candidatas a `/afinar-regla`:
  el worktree se monta **sin `.env` ni base propia** y `wt.sh new` no los crea, así que la
  integración no corre y `--rapido` da un verde engañoso; **tras un merge con `origin/dev` la base
  propia puede quedar obsoleta** (pasó: 10 archivos de integración en rojo por `column 'existe'
  does not exist`), o sea que la sincronización debería terminar en `db:migrate` + `db:seed` y no
  en `git merge`; **una tanda de gate matada por el sistema deja sus hijos vivos** —14 procesos
  `node` y el bucle `bash` que los lanzaba siguieron corriendo gates sin dueño, comiéndose la RAM
  que mataba la tanda siguiente y corrompiendo el archivo de evidencia—; y sigue faltando
  **`.gitattributes`**, que aquí mordió dos veces con commits de 7.287 inserciones donde el cambio
  real eran 160.
- Nota de rescate: la ficha llegó a esta sesión **con 41 archivos sin commitear** en su worktree,
  huérfanos de una sesión anterior que murió. Se commitearon antes de tocar nada.

## QC-83 — modelo-de-grupos-de-trabajo (cerrada el 2026-09-10, PR #50, merge `9d20152`)

- El modelo de los grupos de trabajo y nada más: `work_groups`, la N:M `work_group_members`, su
  migración con `down.sql`, y dos funciones puras de dominio (`normalizeKey`, `work-group-name`).
  Vive en el módulo `identity` porque un grupo es un conjunto de personas. **Sin service, sin
  Server Action, sin pantalla**: el CRUD es QC-84, la pantalla QC-85 y la asignación de pedidos
  QC-86, que consumen esta tabla y no la definen.
- Requisitos cubiertos: **R1–R28**, los 28 con test concreto y **verificados abriendo el test, no
  la tabla**. 12/12 tasks. `reviewer` **APROBADO en una sola ronda** (0 mayores, 4 menores) tras
  aplicar y revertir **18 mutaciones** propias.
- **La decisión que sostiene la ficha: la coherencia de empresa la impone Postgres, no la
  aplicación.** Dos claves foráneas **compuestas** —`(company_id, group_id)` y
  `(company_id, user_id)`— hacen imposible que una pertenencia cruce empresas. El reviewer lo
  demostró en negativo: al romperlas caen **exactamente los seis tests** que las protegen y ninguno
  más. Se descartó el trigger (design 9.1) argumentando contra el precedente
  `units_check_derivation`.
- `deleted_at` es del **grupo**, no de la pertenencia: sacar a alguien de un grupo lo borra de
  verdad y no deja rastro. El nombre es único por empresa **entre los vivos**, así que el nombre de
  un grupo dado de baja se puede reutilizar.
- `down.sql` **verificado contra Postgres real**, no creído: `db:rollback` + snapshot +
  `db:migrate` + snapshot deja el esquema idéntico y **cero filas perdidas**.
- El refactor `normalizeCompanyName` → `normalizeKey` es de **comportamiento nulo**, y lo sostiene
  un test de QC-47 que no cambió. `normalizeKey` **no sale por el barrel**, con test que lo afirma.
- Verificación: `./init.sh` **completo en `== init OK ==`** (273 archivos, 3451 tests; el único
  rojo, en el baseline). RLS `ENABLE`+`FORCE` en las dos tablas, comprobado en `pg_class`. Cero
  dependencias nuevas: el diff sobre `package.json` y `pnpm-lock.yaml` está **vacío**.
- **Desbloquea QC-84, QC-85 y QC-86**, y con ellas destraba la cadena que dejó bloqueada QC-63
  (`ejecutar-receta-operador`), que depende de QC-88.

**Cuatro deudas que deja escritas, ninguna de su código:**

- **El gate no mira dos guardias que esta ficha acaba de retensar.** `recipe-route-contract.test.ts`
  y `recetas/module-contract.test.ts` están en `baseline-rojos.json` por una razón estructural que
  su propia nota llama «coste aceptado», y eso **apaga el archivo entero**, incluida la guardia de
  QC-34 que QC-83 endureció. Higiene ajena, pero con filo. **Candidata a `/afinar-regla`.**
- **Seis archivos del baseline ya pasan** y el comparador lo avisa: `product-page.test.tsx`,
  `order-sheet.test.tsx`, `catalog-line-sheet.test.tsx`, `supplier-page.test.tsx` y los dos de
  arriba.
- **`product-crud.int.test.ts` cayó en la PRIMERA corrida de la suite completa y no está en el
  baseline.** Es flake de carga y no regresión —pasa aislado 7/7, `tests/integration` entera pasa
  dos veces, y la segunda corrida completa sale exit 0—, y **entró al baseline el 2026-09-10 por decisión
  humana**, con motivo y `desde`, en vez de dejar que la corrida buena tapara la mala. Es la primera
  entrada de clase «flake de saturación» que sobrevive a QC-58, y la más cara: apaga para el
  comparador los 6 casos de CRUD de inventario contra Postgres real. **Se retira en cuanto la suite
  completa pase tres veces seguidas con el archivo dentro.**
- **R27 es el único requisito cuya evidencia es un `git diff` a mano.** Nada afirma «cero archivos
  bajo `app/`» de forma ejecutable. Es el mismo criterio que aceptó QC-47 en su R28, así que el
  reviewer no lo elevó; conviene saberlo antes de citar este mapa como precedente.

**Octava vez que `wt.sh done` falla en Windows**: desregistró el worktree pero dejó el árbol en
disco por las rutas largas de `pnpm` (`fatal: ... is not a working tree`). Rematado con `rm -rf` +
`git worktree prune`. Van ocho y **sigue sin ficha de arnés**.

## 2026-09-09 — QC-39-pantalla-de-unidades

- El catálogo de unidades de medida deja de ser administrable solo por migración: pantalla
  propia en `/configuracion/unidades`, segundo ítem de la sección Configuración que creó
  QC-45. Lista con búsqueda por nombre, orden y paginación de 10/25 sobre la tabla
  compartida de QC-55 (quinta pantalla en montarla, sin tocar un solo archivo suyo), alta y
  edición en panel lateral, y borrado con diálogo de confirmación. La equivalencia se pinta
  como frase armada («1 kg = 1000 gr») y las unidades base muestran un guion.
- Requisitos cubiertos: R1–R50, los 50 con test y verificados por el `reviewer` abriendo los
  archivos, no contra el mapa de esta bitácora. PR #51, merge commit `2f98b8f`.
  `reviewer` **APROBADO en una ronda** (0 mayores, 8 menores, tres atendidos en la rama).
  `./init.sh` completo en `== init OK ==` (287 archivos, 3615 tests, único rojo en el
  baseline) y E2E `e2e/unidades.spec.ts` con 4 passed en **Chromium y WebKit**, lo que cierra
  el diferimiento que QC-38 dejó apuntando aquí.
- Decisiones: **no hay columna de ámbito** —que una unidad sea de sistema o de la empresa es
  manejo interno—; lo único visible es que una unidad de sistema no trae botones de editar ni
  borrar. `UnitView` es un **tipo nuevo que extiende `UnitRef`**, no un ensanchamiento:
  ensanchar habría arrastrado `UnitCatalog.findRefs` y el módulo de recetas, que quedan
  intactos. `listUnitsAction` gana **sobrecargas** para aceptar la consulta, de modo que
  recetas y proveedores compilan sin cambios. `companyId` entra al `select` pero **no sale
  hacia el cliente**: el ámbito viaja derivado como «es de sistema».
- Tests ajenos tocados, todos **tensando**: `data-table-alcance` sube de `>3` a `>4`
  consumidores, `recipe-route-contract` gana la constante de ruta manteniendo la igualdad
  exacta, y dos anclas de QC-38 en `unidades-convenciones` quedan más exigentes. Además dos
  centinelas de alcance ajenos (`qc75-convenciones` y `account-status-scope`) se acotaron
  endureciendo su **precondición**, sin tocar un solo aserto.
- Deuda que deja, y no es de esta ficha cerrarla:
  - **T13 sin hacer y ningún agente puede hacerla**: mirar con los ojos el scroll contenido
    de la tabla en un WebKit real. La cobertura en jsdom y la corrida E2E en WebKit no
    sustituyen esa comprobación.
  - **Ningún test compara el catálogo de permisos del código con el de la base.** R11 estaba
    verde contra `SEED_ROLE_PERMISSIONS` mientras la base real no tenía `unidades.modificar`,
    y eso produjo un **404 real** a un Administrador que sí veía el enlace. Merece ficha propia.
  - Los dos centinelas acotados quedan **permanentemente inertes** en sus casos de cambio:
    tercer episodio de esta clase (QC-38 lo sufrió, QC-75 lo documentó, QC-39 acotó dos).
    Pide **regla del arnés**, no parche por ficha.
  - El gate avisa de **2 entradas del baseline que ya pasan**, y borrarlas hoy rompería el
    gate: fallan solo al correr desde `dev`, con el rango vacío.
- Estado de la base compartida: durante la verificación hubo que **sembrar**
  (`unidades.modificar` no existía desde el merge de QC-38) y **aplicar la migración
  `user_account_status`** de QC-65, que estaba mergeada sin aplicar. Ninguna era de esta ficha;
  quedan hechas.
- **Octava vez que `wt.sh done` falla en Windows**: desregistró el worktree pero dejó el árbol
  en disco por las rutas largas de `pnpm`, y `rm -rf`/`Remove-Item` tampoco pudieron con él.
  Rematado con un **espejo `robocopy /MIR` desde un directorio vacío** y luego borrado, que sí
  vacía rutas de más de 260 caracteres. Sigue sin ficha, y ahora hay remedio conocido.

## QC-70 — errores-centralizados (cerrada el 2026-09-10, PR #52, merge `192842a`)

- Catálogo único y **cerrado** de 25 códigos de error con un mensaje cada uno, una sola
  implementación del traductor, y los cinco módulos (inventario, pedidos, proveedores,
  recetas, unidades) migrados a tomar de ahí código y mensaje. Los códigos se abrieron
  **por caso concreto** —`not_found` significaba cinco cosas distintas—, y por eso la zona
  fue `fullstack`: las siete pantallas que comparaban contra el código genérico se
  actualizaron a la vez. Guardia ejecutable que da rojo si un módulo declara errores fuera
  del catálogo.
- Requisitos cubiertos: R1–R33, todos con test. 16 tasks. `reviewer` **APROBADO** en una
  ronda (0 mayores, 6 menores). `./init.sh` completo en `== init OK ==`: 296 archivos de
  test, 3777 casos, 18 skips, **0 rojos**.

### El riesgo declarado se cumplió, y exactamente donde la ficha dijo

La ficha traía anotado por adelantado el choque con **QC-39**: renombra `duplicate_name` y
`not_found` de unidades, y como los archivos no existían en `dev`, «el merge sale limpio y
falla EN PANTALLA, no en el gate». Ocurrió tal cual. `unit-form.tsx` repartía los errores
por campo con `Record<string, …>` indexado por `duplicate_name`, renombrado aquí a
`unit_duplicate_name`: el typecheck seguía verde y el mensaje «ya existe una unidad con ese
nombre» se caía de junto al campo a la región genérica. **Un tipo abierto convirtió un
renombrado en un fallo silencioso de UI.** Corregido al patrón `Partial<Record<ErrorCode,
…>>` que la pantalla hermana ya usaba, con lo que ahora rompe la compilación.

La lección general, que vale más que el arreglo: **la defensa contra un renombrado no es la
disciplina, es el tipo cerrado**. En la segunda ronda de sincronización el barrido completo
de `app/` y `components/` no encontró ningún caso más —los 17 `Record<string, …>` que
existen no indexan códigos, y los 18 literales están todos con `: ErrorCode` o `satisfies
ErrorCode`—, y la razón es estructural: al tipar el `code` de los siete adaptadores driving,
el compilador cubre esos caminos. Se vio el efecto **invertido**: un caso entrado en `dev`
(`order-form.test.tsx:664`) devolvía el genérico `not_found`, que ya no existe; en `dev`
compilaba porque allí `code` era `string`, aquí fue error de tipos. Es para lo que se hizo.

### Hicieron falta dos rondas de F2.3, y eso es dato

`dev` se movió por debajo entre la primera sincronización y el push: la primera reconcilió
unidades (choque con QC-39, PR #51), la segunda inventario y pedidos (5 conflictos nuevos
de `419f01e`, `df259e7`, `5544a81`, `78a96f3`). Con `dev` recibiendo merges a este ritmo, una
rama larga paga la sincronización más de una vez; el PR #52 estuvo en `CONFLICTING` con el
gate ya verde.

### Deuda que deja, con nombre y dueño

- **El PR absorbió dos arreglos de typecheck que no son de esta ficha.** `419f01e` añadió
  `stock` a `ProductRef` y `productStock` a `RecipeLineView` sin actualizar dos dobles de
  `recetas`; no dieron conflicto —ninguna rama tocaba esos archivos— y reventaron el
  typecheck. Se arreglaron porque bloqueaban, pero **viajan dentro de QC-70 sin ser de
  QC-70**, y había cambios sin commitear sobre esos mismos archivos en el árbol principal.
- **Se retiró un caso de test de R32.** `dev` quitó el selector de presentación del
  formulario de producto, así que el caso no se podía conservar. Se verificó antes de
  borrarlo que `presentation-select.tsx` sigue vivo en proveedores y que su caso
  equivalente existe en `catalog-line-sheet.test.tsx`: no se pierde cobertura. **Es el
  único punto de juicio real de la tanda.**
- **Cinco entradas de `baseline-rojos.json` ya pasan**, cuatro gracias a esta rama. Nadie
  tocó el archivo. Limpiarlo es decisión aparte.
- **El flake de saturación de QC-58 volvió a aparecer**: 4 rojos de UI en una corrida
  intermedia, 0 en la siguiente, 57/57 aislados en 46 s. No se baselineó porque esa clase
  de decisión la tomó el humano la vez anterior.
- **Séptima y octava guardia de alcance con el mismo defecto de diseño.** Dos guardias de
  QC-39, con QC-39 ya en `dev`, acusaban a QC-70 de hacer justo lo que su spec le manda.
  Se les aplicó el precedente ya sentado para QC-75/QC-65/QC-38 (centinela de rama de dos
  señales y skip ruidoso fuera de ella). Van **siete** parcheadas una por una: el patrón
  —una guardia que muerde a cualquier rama que toque su zona, no solo a la suya— es
  material de `/afinar-regla`, no de una ficha más.
- **Octava vez que `wt.sh done` falla en Windows**: desregistró el worktree pero dejó el
  árbol en disco por las rutas largas de `pnpm`. Rematado con `rm -rf` + `git worktree
  prune`, tras verificar que la punta de la rama era ancestro de `origin/dev`. Sigue sin
  ficha.
- **La base del worktree tenía sin aplicar la migración `product_batches`**: 12 suites de
  integración caían con `Null constraint violation on (presentation_id)` hasta un
  `prisma migrate deploy`. Es la quinta vez que el drift de base entre worktrees bloquea
  una feature.

**Desbloquea QC-71** (`identificador-de-request`), que dependía de esta: QC-70 dejó el hueco
en la forma del error genérico y QC-71 lo rellena.

## QC-78 — estado-de-cuenta-en-el-acceso (cerrada el 2026-09-10, PR #53, merge `752dc58`)

- El estado que QC-65 persiste **manda de verdad**: solo `active` entra al login, y quien ya está
  dentro sale en la siguiente pantalla que abra. **Sin columnas, sin enum, sin migración y sin
  dependencias** (R26, R27): cambia *quién escribe y quién lee* `account_status`,
  `failed_login_attempts`, `lock_level` y `locked_until`, que ya existían.
- Requisitos cubiertos: **R1–R30**, todos con test. `reviewer` **APROBADO** (0 mayores, 7 menores)
  con **9 mutaciones** aplicadas y revertidas.

**Nació con 28 requisitos y cerró con 30, y esa es su historia.** El E2E de R28 (b) —el test
titular, el que comprueba que quien pierde la cuenta sale— destapó un **bucle de redirecciones**:
`Load cannot follow more than 20 redirections`. La cookie sigue viva y firmada, el borde no puede
consultar la base (QC-9 R4, QC-75 R18) y devolvía a la zona privada, mientras el layout —que sí
consulta— devolvía al login. **Quien se quedaba sin cuenta no acababa en el login: acababa en un
error del navegador.**

**El defecto era MÁS VIEJO que la ficha, y eso es lo más valioso que deja.** En `resolve-session.ts`
el corte de QC-78 es el **sexto** de una lista donde ya estaban el de baja lógica (**QC-8 R11**) y
el de empresa no viva (**QC-48 R15**). Los tres hacen `return null` y salen por el mismo `redirect`,
así que **los tres lo producían desde que existen**. Nadie lo había visto porque **ningún E2E abría
sesión y mataba la ficha después**. QC-78 no lo introdujo: lo hizo alcanzable por el único camino
que existía para cubrirlo, y lo arregla para los tres.

R29 y R30 se añadieron a mitad de F2.1 con aprobación humana. La salida elegida —**marca opaca** en
la redirección, y la regla 3 del borde no dispara con ella— es la única que **no reabre ninguna
decisión cerrada**: no borra la cookie, no consulta la base en el borde, no añade consultas (R21) y
no depende de QC-23 (R22). Se descartaron las otras tres por escrito, cada una con el requisito
contra el que chocaba. Un hallazgo del `spec_author` salvó la ampliación: `require-page-permission.ts`
**también** hace `redirect(LOGIN_ROUTE)`, así que arreglar solo el layout habría dejado el bucle
vivo por esa puerta con el E2E en verde.

**Las decisiones de seguridad, heredadas y no reinventadas:** el estado se evalúa **después** del
hash (R2), porque cortar antes sería un oráculo de tiempo (QC-7 R29); los tres estados no-`active`
devuelven **la misma instancia** del rechazo genérico (R3); `pending` e `inactive` **no escriben
nada** (R5, R6), a diferencia **deliberada** del corte por empresa de QC-48; y ninguna escritura
puede dejar `blocked` con `locked_until` vacío (R15), que significaría «bloqueada por una persona» y
no caducaría jamás.

**Verificación:** `./init.sh` completo en `== init OK ==` con **299/299 archivos, 3885 tests y CERO
rojos**; `e2e/session.spec.ts` **6 passed en Chromium y WebKit**, corrido **después** del merge con
`dev` a propósito —la medición anterior era sobre código que el merge no tocó, pero «no lo tocó» es
un argumento y no una corrida—.

**El hallazgo de arnés que deja, y que ya no es teórico:**

- **El primer `./init.sh` completo dio `== init OK ==` y era FALSO VERDE.** El único rojo estaba en
  el baseline, pero **el caso que caía no era el que esa entrada documenta**: era `QC-64 R12`, la
  guardia que impide que `lib/shared/routes.ts` gane constantes, **rota por T20 de esta misma
  ficha**. Listar un archivo en `baseline-rojos.json` **lo apaga entero**, así que una regresión
  introducida ese mismo día se declaró verde. La nota del baseline ya anunciaba el coste y el cierre
  de QC-83 lo dejó como ficha pendiente; **ahora hay un caso medido**. Arreglada sin relajar la
  aserción —sigue siendo igualdad exacta— y con la mordida demostrada por el leader (constante
  ficticia → rojo → revertida → 25/25). Ese archivo llevaba apagado desde el 2026-09-04.
  **Ficha de arnés: el comparador debería poder ignorar CASOS, no archivos.**
- **Es también la prueba de por qué el gate completo lo corre el leader**: un subagente habría leído
  «sin rojos nuevos, todos en el baseline» y habría abierto el PR.

**Dos cosas más que quedan dichas:**

- **R30 (b) prometía más de lo que el código cumple** y se acotó el texto por decisión humana. La
  marca **puede** acabar en el destino de vuelta si el propio usuario se escribe la URL; es inerte
  **solo porque nadie la lee fuera de la regla del login**. Quedó escrito como **condición de
  seguridad**: quien conecte alguna vez la marca a un aviso visible abre un vector de terceros por
  enlace y tiene que volver al requisito primero.
- **T16 no se marcó.** Pedía `--rapido` por tanda y el leader corrió el gate **completo** dos veces:
  cubre más, pero no es lo que la task decía.

**El implementer murió por límite de sesión** tras commitear la guardia y antes de documentarla; el
árbol quedó limpio y el leader escribió esa entrada y demostró la mordida. **Novena vez que `wt.sh
done` falla en Windows** —desregistra el worktree y deja el árbol por las rutas largas de `pnpm`—,
rematado con `rm -rf` + `git worktree prune`. Van nueve y **sigue sin ficha**.

## QC-66 — crud-de-usuarios (cerrada el 2026-09-11, PR #56, merge `35acbdd`)

**Zona `backend`, `complexity: medium`, 49 requisitos EARS, todos con test.** Crear, consultar,
editar, listar, borrar lógicamente y mover el estado de una cuenta entre sus cuatro valores. La
pantalla va aparte (QC-67).

**La ficha que no da acceso a nadie, a propósito.** La contraseña la genera el sistema al azar, se
guarda transformada y **no se muestra ni se devuelve en ninguna respuesta**: quien entra es quien la
establece por el enlace de QC-79. El usuario nace `pending` y con la marca de cambiarla al primer
acceso. Es una consecuencia aceptada por escrito al acotar, no un olvido de diseño.

**Lo que trajo además del CRUD:** dos permisos nuevos —`usuarios.consultar` y `usuarios.modificar`—
que llevan el catálogo cerrado de once a trece, con su migración y su seed al rol Administrador; el
borrado lógico con `deleted_at`, que libera correo, usuario y documento para otra persona de la misma
empresa; y el listado **abierto de nacimiento** —paginado 10/25, búsqueda, filtro por estado y orden—
para que la pantalla no tenga que reabrir la firma después.

**Dos guardas que son de negocio y no de validación:** el administrador no puede cambiar su propio
estado ni su propio rol ni borrarse, y ninguna operación puede dejar a la empresa sin al menos un
administrador en `active`. Y el actor **no se ve a sí mismo**: ni en el listado ni pidiendo su ficha
por identificador.

**El `reviewer` rechazó en primera ronda y aprobó en segunda.** MAYOR-1 se cerró **verificado con
sondas, no por lectura**: rango sin resolver → 6 rojos; rama ajena o diff vacío → 5 `skipped` con el
motivo impreso; rama propia → 16 en verde. Once de los dieciséis casos muerden para siempre. R46 se
queda sin guardia de contenido en `dev` **a conciencia**: una ahí bloquearía a QC-67.

**La deuda que deja, y es una decisión humana, no un pendiente técnico.** Cuando un administrador
mueve una cuenta de `blocked` a `active`, **no se limpia `locked_until`**, así que el desbloqueo
manual no surte efecto: la cuenta se vuelve a bloquear sola. Lo vieron por separado el `implementer`
y el `reviewer` (**MAYOR-2**). No lo introduce este código y **QC-66 no puede repararlo sin violar su
propia R45**, que es spec aprobado; QC-78 ya publicó el mecanismo (`clearedLockState()`) que nadie
llama. Queda anotado en `progress/current.md > Deudas` con las tres salidas posibles, y **QC-67 no
debería ofrecer «desbloquear» hasta que se decida**.

**Verificación:** `./init.sh` completo en `== init OK ==` — **310 archivos, 4135 tests, cero rojos**.
Sincronizada dos veces con `dev` (QC-70 y QC-78 dentro): 55 archivos, +13650/−549. `identity` entró
al catálogo único de errores de QC-70 y `NotFoundError` pasó a `UserNotFoundError` en el camino.

**Menor que se recoge quien toque ese archivo:** `birth-date.ts` estaba contado pero no vigilado por
las listas de contenido; se arregló en `5137f62`.

## QC-90 — alta-del-primer-lote (cerrada el 2026-09-11, PR #54, merge `13fc41c`)

**Zona `fullstack`, `complexity: medium`, 32 requisitos EARS, 15 tasks, todos los requisitos con
test.** El alta de un producto crea además su primer lote en `product_batches` con lo que se escribe
en el mismo panel: presentación (obligatoria), costo, lote y fecha de expiración. Si el nombre
corresponde a un producto que ya existe, **no se crea otro producto: se le agrega el lote**.

**No se partió en backend + frontend pese a ser `fullstack`** (F1.0 lo pide). El front ya estaba
construido y verificado —sin commitear— y lo que le quedaba era que los cinco campos viajaran y
alinear el costo a `> 0`; partirlo habría dejado una ficha de front de dos líneas esperando a la
otra. Mismo criterio que QC-70.

**Las decisiones que cambian el comportamiento, todas cerradas al acotar:** basta con uno de los dos
costos —si solo viene el total, el unitario se deriva como `total / existencia` a 4 decimales, con
`BigInt` y sin dependencia nueva—; con existencia 0 o vacía y solo costo total **el alta se rechaza**
pidiendo existencia ≥ 1, porque no hay unitario posible y la columna es `NOT NULL` con `CHECK > 0`;
el alta **siempre** crea lote, aunque lote y vencimiento sean opcionales; y la existencia se escribe
en el lote **y sigue escribiéndose en el producto**, transitoriamente, hasta QC-91.

**La consecuencia aceptada a conciencia:** mientras QC-91 no exista, agregar un lote a un producto
que ya existe **no cambia la existencia de ese producto**.

**El `reviewer` rechazó en primera ronda por un objetivo táctil de 24×24 px** en
`presentation-select.tsx`, y la decisión humana fue **cumplir la regla en vez de declarar la
excepción** — la salida más cara de las dos: se arregló también `ProductField`, que estaba **exento
por alcance**, y en los dos casos crece el `<button>` de verdad (`min-h-11 min-w-11` con `shrink-0`),
no un pseudo-elemento ni un margen negativo. Con tests que muerden.

**Verificación:** `./init.sh` completo en verde tras sincronizar con `dev` —que traía QC-78 entera,
47 archivos—: **306 archivos, 3973 tests, 0 rojos**. E2E (R32) en **Chromium y WebKit**, y comprueba
el costo derivado **contra la base, no contra la pantalla**. Sin dependencias nuevas, sin columnas,
sin migración.

**Lo que queda abierto y esta ficha no cierra:** las tres preguntas del `requirements.md` —moneda del
costo, trazabilidad por lote a medias (se *guardan* lote y vencimiento, pero **nada los consume**) y
qué pasa con el lote de un producto borrado—; la carrera del alta de un nombre nuevo, que es el
comportamiento de hoy y pide índice único, o sea migración, o sea **QC-81**; y el aislamiento por
empresa, que es **QC-49**.

**Ficha nacida de la revisión: QC-93** — tres casos E2E de permisos cuya premisa derogó QC-75; uno
rojo confirmado, dos por comprobar. No enrojecen `./init.sh`, que no corre Playwright.

**Dos cosas del cierre que valen como hallazgo de arnés:**

- **La guarda 3 de `wt.sh done` salvó trabajo real.** Al desmontar, el worktree estaba sucio: la
  **segunda ronda completa del `reviewer`** (+124 líneas de
  `progress/review_QC-90-alta-del-primer-lote.md`) vivía solo ahí y **nunca entró al PR**. Se rescató
  al árbol principal antes de borrar nada. Es exactamente el caso de los 133 archivos que documenta
  `docs/worktrees.md`, esta vez con la guarda puesta.
- **Décima vez que `wt.sh done` falla en Windows** —desregistra el worktree y deja el árbol en disco
  por las rutas largas de `pnpm`—, en las dos fichas de este cierre. Rematado con `rm -rf`. Van diez
  y **sigue sin ficha**.

## QC-71 — identificador-de-request (cerrada el 2026-09-11, PR #55, merge `398dfd6`)

Cada petición lleva un identificador propio, generado en el middleware, que viaja hasta la capa
que atrapa los errores y se escribe **solo cuando hay error**. El error inesperado —el genérico de
QC-70— lo lleva de vuelta al navegador, para que quien reporta un fallo pueda decir cuál buscar.
El mensaje sigue siendo neutro y el detalle interno sigue sin salir.

21 requisitos EARS, 11 tasks, 91 archivos (+6615 / -774). Sin dependencia nueva:
`crypto.randomUUID()` es global en los dos runtimes.

Gate `./init.sh` completo en verde antes del merge: 323/323 archivos, 4336 tests, cero rojos.

### El PR estuvo en conflicto sin que hubiera nada que resolver

El PR #55 figuró `CONFLICTING` en `product-form.tsx` y `lib/composition/index.ts`. No era trabajo
pendiente: la **rama publicada** iba 29 commits detrás de `dev`, mientras que la local ya traía el
merge con `origin/dev` (`6226490`) y daba 0 atrás. Los conflictos vivían solo en GitHub, contra un
estado de la rama que en disco ya no existía. Se arreglaron **empujando**, sin editar una línea.

**Lo aprovechable:** al ver `CONFLICTING` en un PR, comparar primero la rama PUBLICADA con la base
(`git rev-list --left-right --count origin/<rama>...origin/dev`) antes de abrir ningún archivo. Si
la local está 0 atrás, no hay conflicto que resolver — hay un push que falta.

### La base compartida estaba atrasada respecto de `dev`, y el gate fue quien lo dijo

El gate cayó con dos rojos de integración de identity. No eran de esta ficha: a la base
`QuimiCloude` le faltaba `20260910120000_user_permissions_catalog`, la migración del catálogo de
permisos de QC-66, ya mergeada en `dev` por el PR #56. El propio test lo decía con todas las
letras. Aplicada con `migrate deploy` —de datos, idempotente, con `down.sql`—; los dos a verde.

**No era un parche para este PR:** cualquiera que corriera integración contra `dev` se comía el
mismo rojo. **Y la causa de fondo sigue abierta:** el worktree de QC-71 apuntaba a la base
**compartida** `QuimiCloude`, no a una propia como hizo QC-90 con `QuimiCloude_QC90`. Ninguno de
los otros worktrees tiene `.env` siquiera. `docs/worktrees.md` **no dice nada** sobre la base por
feature: la convención existe en la práctica y no está escrita. Material de `/afinar-regla`.

### Un flake, descartado con evidencia en vez de con baseline

`tests/unit/inventario/product-page.test.tsx` cayó en una corrida completa. **No se dio por bueno a
la ligera, porque esta ficha SÍ toca ese archivo**: se comprobó que el caso que cae es de un error
**catalogado** (`unauthorized`) —la mitad que QC-71 deja intacta, ya que el identificador solo viaja
en el inesperado—, que la ficha solo **suma** casos ahí (128 líneas, cero borrados), que el fallo
fue **expiración de `waitFor`** y no aserción fallida, y que pasa aislado 42/42. La tercera corrida
salió limpia. Es el flake de saturación de QC-58.

**No se añadió al baseline**, y la decisión es deliberada: una caída única no es deuda persistente,
y listarlo apagaría el archivo entero —sus 42 casos— para el comparador.

### Deuda que deja, con nombre y dueño

- **El gate avisa que 5 archivos del baseline ya pasan** y toca limpiarlos:
  `tests/integration/inventario/product-crud.int.test.ts`, los dos de recetas
  (`recipe-route-contract`, `module-contract`) y los dos de unidades (`modulo-intacto`,
  `unidades-convenciones`). Sin ficha todavía.
- **Undécima vez que `wt.sh done` falla en Windows**: desregistró el worktree y dejó el árbol en
  disco. Rematado con `rm -rf` tras verificar que la rama estaba íntegra en `origin/dev` y sin
  commits sin publicar. Van once y **sigue sin ficha**.
- **`docs/jira.md` miente sobre el nombre de la columna**: dice *Hecho* para `done`, y el board real
  usa **Finalizado** (transición `41`). Corregir el documento o la columna, pero que coincidan.

## QC-94 — consulta-de-roles: CERRADA el 2026-09-11 (PR #57, merge `5e84433`)

**Nació el mismo día en que se cerró**, al acotar QC-67 con `/afinar-feature`: el formulario de usuarios
exige un `roleId` UUID desde QC-66 y **no había ninguna forma de saber qué roles existen** ni qué
identificador tiene cada uno — el módulo solo exportaba los nombres del seed. La pantalla habría
llegado al `spec_author` con un selector imposible de pintar.

**R1–R21, todos con test.** Consulta de solo lectura que devuelve `id` y `name` ordenados por nombre
**en la base**, autorizada en el service como primera línea con `usuarios.consultar` **o**
`usuarios.modificar` —QC-74 decidió que uno no implica al otro, y las dos mitades de la pantalla
necesitan el selector—. Sin migración, sin dependencia y sin permiso nuevo: el catálogo sigue en trece.
`reviewer` **APROBADO en primera ronda**, 0 mayores y 4 menores. `./init.sh` completo sobre el árbol ya
sincronizado: **329 archivos, 4423 verdes, 0 rojos nuevos**.

**El catálogo de roles es GLOBAL, y la acotación lo descubrió a tiempo.** La primera redacción de la
ficha —escrita el mismo día— decía «los roles de la empresa de la sesión», y `db/schema.prisma` lo
desmiente: `Role` no tiene columna de empresa y su `name` es único en toda la tabla. El board se
corrigió **antes** de sembrar el spec, que es el orden que `docs/jira.md` exige.

**Tres cosas que dejó dichas y que valen para la próxima ficha:**

1. **Cero conflictos de merge no es cero trabajo.** El merge de `dev` entró limpio, pero QC-71 había
   cambiado la firma de `createErrorStateTranslator` y migrado los **ocho** adaptadores driving que
   existían entonces; `role-actions.ts` nació después y en paralelo, así que era el **noveno** y no
   estaba en esa lista. Lo cazó el `typecheck` en F2.3, no el merge. Ningún merge ve un desajuste
   semántico, y por eso F2.3 es un paso propio y no un trámite.
2. **Una sola base local para todos los worktrees es un punto de fricción entre sesiones.** 61 tests de
   integración de `proveedores`, `unidades`, `recetas` e `inventario` salieron rojos por
   `20260911120000_presentation_unit`, migración de la rama **QC-80** de otra sesión **que no está en
   `dev`** y que quita `products.unit_id`. No era la base atrasada —el primer diagnóstico, falso— sino
   **adelantada con trabajo ajeno**. Se resolvió dándole a esta feature su propia base
   `QuimiCloude_QC94`; revertir la compartida habría roto a la sesión de QC-80. Es exactamente lo que
   **QC-77** existe para arreglar de raíz, y sigue en `pending`.
3. **Un worktree nuevo no está listo para el gate.** Le faltan `node_modules`, el cliente de Prisma y
   los tipos de ruta de Next, y `init.sh` solo instala si no hay `node_modules`. Además, un
   `./init.sh --rapido | tail` devuelve el código de salida del `tail`: el primer «verde» de esta
   sesión fue falso por eso.

## QC-80 — unidad-desde-la-presentacion (2026-09-11)

`fullstack`, `medium`. PR **#58** mergeado en `dev` (merge `f783e06`). 28 requisitos EARS, 15 tasks,
`./init.sh` completo en verde antes del PR: **4498 tests, 0 rojos**. Worktree desmontado y base local
propia `QuimiCloude_QC80` eliminada.

`presentations` gana `unit_id` **NOT NULL** con FK a `units` y `products` pierde la suya. El selector de
unidad de la línea de receta deja de leer la del producto: se acota por la presentación del **lote más
reciente**. El backfill deja las presentaciones existentes en **kilogramo** y no borra ninguna fila.

**Cinco cosas que dejó dichas y que valen para la próxima ficha:**

1. **Una `description` de hace tres días puede estar mintiendo.** La ficha decía que el producto hereda
   la presentación «de la suya», y **QC-90 la había mudado a `product_batches`** dos días antes. La
   acotación lo detectó y el board se corrigió **antes** de sembrar el spec. Una ficha escrita antes que
   otra que ya se mergeó no es una ficha vigente: es una hipótesis.
2. **Una pregunta abierta se cierra con datos, no con criterio.** «¿Con qué unidad se rellenan las 114
   presentaciones?» sonaba a decisión de negocio cara. Consultada la base: **113 eran residuo de tests**
   sin ningún lote que las referenciara y la única real era «Bolsa 5 KG». La decisión se volvió trivial.
3. **Pasar aislado NO es prueba de inocencia.** `product-page.test.tsx` pasaba 44/44 solo y fallaba 8
   casos en lote, dos corridas seguidas. Se dio por flake de saturación —mal— hasta que se corrió el
   proyecto `ui` **en `dev` sin la rama**: 73/73 en verde. Ahí quedó demostrado que el rojo era propio.
   La comparación contra `dev` es la que decide, no la repetición.
4. **QC-58 arregló medio problema y nadie lo vio durante nueve días.** Subió `testTimeout` de 5 s a 15 s,
   pero **`findBy*` y `waitFor` no miran `testTimeout`**: miran `asyncUtilTimeout`, que seguía en su
   defecto de **1000 ms**. La firma engañaba —`Unable to find an element` con los 15 s del test
   intactos—: quien se rendía era la consulta, no el test. Fijado en 5 s, por debajo de los 15 s del
   test a propósito, para que el fallo lo reporte la consulta diciendo qué buscaba. El agujero sigue en
   `dev`, latente: allí no se ve porque el proyecto `ui` corre más rápido y no llega al límite.
5. **El ruido de fin de línea puede ser el 86 % de un PR.** 53 archivos se guardaron en CRLF sobre un
   repo en LF: el diff eran 22.759/20.563 líneas y el cambio real 3.264/1.068. Además enmascaró un
   conflicto: `presentation-form.tsx` salía como conflicto de archivo entero, y solo al normalizarlo
   aparecieron los dos reales que escondía.

**Un camino de alta que ningún test veía.** `components/shared/presentation-select.tsx` —el alta
embebida que usan proveedores y producto— llamaba al esquema sin unidad y no llegaba nunca a la Server
Action. Era un incumplimiento real de R11 que el `tasks.md` no preveía, y lo destapó la implementación,
no la revisión.

## QC-86 — modelo-de-asignacion-de-pedidos: CERRADA el 2026-09-11 (PR #59, merge `30c06c7`)

Acotada, especificada, implementada, revisada y mergeada **en el mismo día**. Entra el módulo nuevo
`asignaciones` con la tabla `OrderAssignment` —FK compuestas por empresa, `CHECK` y RLS—, su
migración con `down.sql` **verificada aplicando, revirtiendo y reaplicando tres veces con diff
vacío**, y los dos permisos en el catálogo y en el seed: `asignaciones.consultar` (con el que nace
el Operador) y `asignaciones.modificar`. El catálogo pasa de **13 a 15** permisos y el seed de **14
a 17** asignaciones. 37 requisitos EARS, los 37 con test. `reviewer` **APROBADO a la primera**: 0
mayores, 5 menores, 22 mutaciones probadas.

**Lo que NO entra, a propósito**: ningún caso de uso, service, Server Action ni pantalla. El corte
de autorización es de **QC-87** y **QC-88**, y un test lo vigila **en negativo** para que nadie lo
adelante por accidente. Mismo límite con el que se cerraron QC-47 y QC-83.

**Desbloquea QC-88** del todo y **QC-87** a medias (le falta además QC-84). Con QC-88 se destraba
**QC-63**, que es la ficha que originó las seis.

### Las tres lecciones, que valen más que la feature

**1. El universo de la familia «tests que miden la rama contra git» no es «listas blancas»: son los
18 tests que consultan git, y hay que barrerlos todos.** Se tocaron **diez** tests ajenos en tres
familias. Dos no estaban en el `tasks.md`: `guard-nav-permisos-declarados` (afirma el **tamaño** del
catálogo, y el spec listó cinco archivos de esa clase cuando eran seis) e `inventario-schema` (afirma
el **vacío** sobre `db/migrations/`, y por eso el grep de `origin/dev...` no lo trajo — usa
`merge-base`). **En los diez el criterio fue subir el número o nombrar la excepción, nunca relajar la
aserción**; donde hizo falta una excepción, se añadió además una aserción con una carpeta intrusa
sintética que demuestra que el filtro no se la traga.

**2. La base propia evita el drift entrante, pero HAY QUE MIGRARLA DESPUÉS DE CADA MERGE.** La base
`QuimiCloude_QC86` nos salvó del drift que sí bloqueó a QC-94 —cuyos rojos de integración no eran
«la base atrasada» sino una migración de **QC-80**, rama ajena sin mergear, aplicada sobre la base
compartida—. Pero tras el segundo merge el gate cayó con **13 archivos de integración** y `The column
'existe' does not exist`: faltaba aplicar `20260911120000_presentation_unit`. **`AGENTS.md > F2.3` no
tiene ese paso**: habla de resolver conflictos y pushear, no de poner la base al día. Es ficha de
arnés.

**3. El flake de `product-page.test.tsx` NO era saturación, y el baseline se usó mal.** El leader lo
metió al baseline el 2026-09-11 por decisión humana, con la evidencia de que caía en `dev` limpio y
con un número distinto de casos en cada corrida. **QC-80 encontró la causa real y la entrada se
retiró en el mismo día**: `QC-58` subió `testTimeout` a 15 s, pero `findBy*` y `waitFor` no lo miran
—miran `asyncUtilTimeout`, que seguía en **1000 ms**—. El elemento sí se renderizaba; quien se rendía
era la consulta. Con el plazo arreglado el archivo pasa **44/44** y la corrida del proyecto `ui` es
**casi el doble de rápida**. La lección no es «el baseline está mal», es que **una firma de
expiración bajo carga puede ser un hueco del arnés, y conviene buscar la causa antes de declarar
deuda ajena**.

### Dos decisiones del humano que quedaron escritas con su precio

- **Doble origen: gana el primero.** Si la misma persona llega suelta y dentro de un grupo, el pedido
  guarda **un solo origen**. El precio está en la tabla: el pedido no sabrá que también venía de otro
  grupo, y quitar ese grupo se la lleva. Se eligió a sabiendas frente a guardar todos los orígenes.
- **La coherencia de empresa no alcanza al pedido.** `orders` **no tiene `company_id`** —el
  multi-empresa es la épica **QC-46**—, así que la guarda que QC-83 puso en la BASE aquí solo cierra
  **persona ↔ grupo ↔ fila**. Escrito como límite, no descubierto implementando.

### Deuda que deja, con nombre y dueño

- **Dos preguntas abiertas, las dos de QC-87**: si volver a aplicar un grupo refresca la lista de
  responsables, y qué estados de pedido admiten asignación.
- **Un comentario del `migration.sql` dice «los CUATRO INSERT» y hay tres sentencias.** No se corrige
  porque editar el SQL de una migración aplicada invalida su checksum; lo arregla la ficha que vuelva
  a tocar ese archivo, si la hay.
- **Dos migraciones comparten el sello `20260911120000`** (`order_assignments` y `presentation_unit`).
  **Medido, no razonado**: Prisma ordena por el nombre completo de la carpeta, así que desempata el
  sufijo; se aplicaron desde cero sobre una base vacía y las dos entran, en ese orden, y son
  disjuntas. Feo, inocuo.
- **Décima vez que `wt.sh done` falla en Windows**: desregistró el worktree pero dejó el árbol en
  disco. Rematado con el remedio que sí funciona —espejar un directorio vacío con `robocopy /MIR` y
  borrar—. Sigue sin ficha de arnés.
- **`progress/current.md` se lo llevó por delante otra sesión** mientras corría el gate: la fila de
  QC-86 y su entrada en *Evaluaciones* desaparecieron y hubo que reescribirlas. Con tres o cuatro
  sesiones de leader concurrentes, **quien reescriba el archivo entero pisa a las demás**. Ficha de
  arnés; `feature_list.json` no lo sufre porque ahí se edita quirúrgicamente.

## QC-67 — pantalla-de-usuarios: CERRADA el 2026-09-11 (PR #60, merge `46fc293`)

La pantalla de administración de usuarios en `configuracion/usuarios`, sobre la tabla compartida:
listado con búsqueda, filtro por estado y orden; alta y edición en panel lateral; borrado con
confirmación; y el cambio de estado de cuenta entre sus cuatro valores. **Sin backend propio**:
consume las seis Server Actions de QC-66 y la consulta de roles de QC-94.

**R1–R42 con test, 45 tasks, `reviewer` APROBADO sin bloqueantes**, gate completo certificado por el
leader (353 archivos, ~4880 tests, 0 rojos). Sin dependencia, sin migración y sin permiso nuevo. Los
**dos cortes de permiso** quedan operativos y no se sustituyen: `usuarios.consultar` para entrar,
`usuarios.modificar` para que aparezcan las acciones de escritura; la UI **oculta, no autoriza**. La
**E2E que QC-66 difirió aquí con motivo** queda cerrada.

De los 6 menores del `reviewer`: uno se arregló aquí —un aserto condicionado que un renombrado habría
apagado en silencio, y se demostró que muerde con una sonda revertida—, cuatro salieron a **QC-97** y
el quinto sigue como deuda anotada.

**La ficha nació el mismo día que se cerró**, y su acotación destapó dos fichas antes de escribir una
línea de código: **QC-94** (la consulta de roles que faltaba, hecha y mergeada el mismo día) y **QC-95**
(el desbloqueo que limpia el contador). Acotar antes de especificar se pagó solo.

**Cuatro cosas que costaron tiempo y no se repiten gratis:**

1. **Dos sincronizaciones con `dev`, ninguna con conflictos de texto, las dos con trabajo real.** La
   primera destapó que los centinelas de la ficha comparaban contra un **SHA congelado** y acusaban a
   QC-67 de abrir `db/` con lo que traía el merge; se arregló **contra qué se compara** (`merge-base`)
   sin tocar **qué se exige**. La segunda verificó el significado de tres listas cerradas y descubrió
   que un ancla que yo daba por subida **no debía subir**: QC-86 no añadió enlace de menú, su octavo
   `testId` era un grupo. Verificar contra la fuente, incluso cuando la suposición viene del leader.
2. **El leader se equivocó y el implementer lo corrigió midiendo.** Un gate con `transform` de 473 s
   frente a los 51 s de `dev` me hizo sospechar del grafo de imports de la ficha. Era **carga de
   máquina**: seis gates suyos entre 44 s y 132 s, su página transformando en 647 ms frente a los
   710 ms del precedente, y la imposibilidad estructural de que 74 líneas en tres archivos hoja afecten
   a `lib/composition`, que no importa nada de `app/`. **No tocó nada** mientras la causa no estuvo
   clara: ni el timeout ajeno, ni el baseline. Meter en el baseline algo que **no falla en `dev`**
   habría sido registrar una mentira.
3. **Un `git init` accidental en `C:UsersCristian`** (hoy 12:41, cero commits) puso en rojo
   `guard-validador-ve-worktrees-hermanos`: el validador resuelve la raíz desde el directorio actual y
   creía que el proyecto era el directorio personal. Borrado con permiso; la guardia volvió a verde
   **sola**. Riesgo mayor que la guardia: un `git add -A` desde ahí habría indexado el perfil entero.
4. **La base compartida, otra vez.** La feature nació con base propia `QuimiCloude_QC67` desde el
   arranque, y por eso fue la única del día que no perdió un gate por trabajo ajeno.

## QC-84 — crud-de-grupos-de-trabajo: CERRADA el 2026-09-12 (PR #62, merge `ebf97df`)

Los **siete casos de uso** de un grupo de trabajo en `identity` —crear, listar, ver miembros,
renombrar, meter, sacar y dar de baja—, con la autorización en el service y el listado de miembros
paginado. **54 requisitos, los 54 con test.** `reviewer` **APROBADO a la primera**: 0 bloqueantes,
0 mayores, 5 menores, 6 mutaciones probadas. `./init.sh` completo en `== init OK ==` **a la
primera**, que no había pasado en las dos fichas anteriores.

**Lo que NO entra, y es un límite medido, no un olvido**: ninguna migración, ningún cambio de
`db/schema.prisma` y **ningún permiso nuevo**. El modelo es de QC-83 y el catálogo se queda en
**quince** entradas.

### Las dos decisiones del humano que fueron contra la recomendación, y su precio

Las dos se tomaron sabiendo el coste, escrito en la tabla **antes** de implementar:

- **Se reusan `usuarios.*` en vez de crear `grupos.*`.** Ahorra dos permisos y no hay tests del
  número exacto que retensar. **Precio**: nadie puede gestionar turnos sin poder dar de alta y de
  baja usuarios.
- **El listado de miembros muestra solo cuentas `active`.** **Precio, y es el reporte de «esto está
  roto» más probable de la ficha**: un usuario recién creado nace `pending` (QC-66 dec. 7) y **no
  aparece en sus grupos** hasta que entra por primera vez y cambia la contraseña; una cuenta
  bloqueada media hora desaparece del grupo y vuelve sola. Ambos con test que **cae al mutar**.

La paginación de miembros la cerró el humano **al aprobar el spec** (F1.4): entró como decisión 18
y como **R51–R54**, al final y **sin renumerar nada** (precedente de QC-33). Se pagina **en el caso
de uso, después del filtro**, para que el total no mienta y la regla del estado efectivo viva en un
solo sitio.

### La lección: un centinela que mide el rango bien puede seguir midiendo a quién no debe

- El catálogo de unidades de medida deja de ser administrable solo por migración: pantalla
  propia en `/configuracion/unidades`, segundo ítem de la sección Configuración que creó
  QC-45. Lista con búsqueda por nombre, orden y paginación de 10/25 sobre la tabla
  compartida de QC-55 (quinta pantalla en montarla, sin tocar un solo archivo suyo), alta y
  edición en panel lateral, y borrado con diálogo de confirmación. La equivalencia se pinta
  como frase armada («1 kg = 1000 gr») y las unidades base muestran un guion.
- Requisitos cubiertos: R1–R50, los 50 con test y verificados por el `reviewer` abriendo los
  archivos, no contra el mapa de esta bitácora. PR #51, merge commit `2f98b8f`.
  `reviewer` **APROBADO en una ronda** (0 mayores, 8 menores, tres atendidos en la rama).
  `./init.sh` completo en `== init OK ==` (287 archivos, 3615 tests, único rojo en el
  baseline) y E2E `e2e/unidades.spec.ts` con 4 passed en **Chromium y WebKit**, lo que cierra
  el diferimiento que QC-38 dejó apuntando aquí.
- Decisiones: **no hay columna de ámbito** —que una unidad sea de sistema o de la empresa es
  manejo interno—; lo único visible es que una unidad de sistema no trae botones de editar ni
  borrar. `UnitView` es un **tipo nuevo que extiende `UnitRef`**, no un ensanchamiento:
  ensanchar habría arrastrado `UnitCatalog.findRefs` y el módulo de recetas, que quedan
  intactos. `listUnitsAction` gana **sobrecargas** para aceptar la consulta, de modo que
  recetas y proveedores compilan sin cambios. `companyId` entra al `select` pero **no sale
  hacia el cliente**: el ámbito viaja derivado como «es de sistema».
- Tests ajenos tocados, todos **tensando**: `data-table-alcance` sube de `>3` a `>4`
  consumidores, `recipe-route-contract` gana la constante de ruta manteniendo la igualdad
  exacta, y dos anclas de QC-38 en `unidades-convenciones` quedan más exigentes. Además dos
  centinelas de alcance ajenos (`qc75-convenciones` y `account-status-scope`) se acotaron
  endureciendo su **precondición**, sin tocar un solo aserto.
- Deuda que deja, y no es de esta ficha cerrarla:
  - **T13 sin hacer y ningún agente puede hacerla**: mirar con los ojos el scroll contenido
    de la tabla en un WebKit real. La cobertura en jsdom y la corrida E2E en WebKit no
    sustituyen esa comprobación.
  - **Ningún test compara el catálogo de permisos del código con el de la base.** R11 estaba
    verde contra `SEED_ROLE_PERMISSIONS` mientras la base real no tenía `unidades.modificar`,
    y eso produjo un **404 real** a un Administrador que sí veía el enlace. Merece ficha propia.
  - Los dos centinelas acotados quedan **permanentemente inertes** en sus casos de cambio:
    tercer episodio de esta clase (QC-38 lo sufrió, QC-75 lo documentó, QC-39 acotó dos).
    Pide **regla del arnés**, no parche por ficha.
  - El gate avisa de **2 entradas del baseline que ya pasan**, y borrarlas hoy rompería el
    gate: fallan solo al correr desde `dev`, con el rango vacío.
- Estado de la base compartida: durante la verificación hubo que **sembrar**
  (`unidades.modificar` no existía desde el merge de QC-38) y **aplicar la migración
  `user_account_status`** de QC-65, que estaba mergeada sin aplicar. Ninguna era de esta ficha;
  quedan hechas.
- **Octava vez que `wt.sh done` falla en Windows**: desregistró el worktree pero dejó el árbol
  en disco por las rutas largas de `pnpm`, y `rm -rf`/`Remove-Item` tampoco pudieron con él.
  Rematado con un **espejo `robocopy /MIR` desde un directorio vacío** y luego borrado, que sí
  vacía rutas de más de 260 caracteres. Sigue sin ficha, y ahora hay remedio conocido.

## QC-67 — pantalla-de-usuarios (implementación) · 2026-09-11

- Zona `frontend`, en su worktree `.worktrees/QC-67-pantalla-de-usuarios`. Las **45 tasks**
  cerradas en cinco tandas, cada una comiteada y verificada antes de abrir la siguiente.
  Bitácora: `progress/impl_QC-67-pantalla-de-usuarios.md`.
- **No construye backend**, y no hizo falta: las seis Server Actions de QC-66 y `listRolesAction`
  de QC-94 se consumieron **por su ruta exacta**, nunca desde el barrel del módulo. Cero
  dependencias nuevas, cero migraciones, cero primitivas de shadcn instaladas, y ni una línea de
  `lib/modules/identity/**`, `db/**` ni `package.json` — atado por test, con anti-vacuidad.
- Los **42 requisitos** quedan mapeados a test real; el E2E pasa en Chromium y WebKit.
- **Diez listas CERRADAS heredadas hubo que tensarlas**, nunca relajarlas: en todas sube el ancla
  **y** se nombra la entrada nueva. Tres viven fuera de la carpeta de la feature
  (`guard-identificador-de-request`, `data-table-alcance`, `account-status-scope`).
- Lecciones que deja escritas, y que no son de esta ficha cerrar:
  - **Las tandas no ven lo que ve el gate completo.** Un ancla de `data-table-alcance` llevaba
    roja **desde el bloque 2** sin que nadie se enterase, porque los subagentes solo corren
    `configuracion-ui` y `guards`. La cazó `./init.sh` entero. Es el argumento vivo de la regla 5:
    el gate rápido cierra una tanda, no una feature.
  - **Un test romo es un falso positivo esperando.** `usuarios-viewport` daba rojo por un `100vh`
    que no era nuestro: la variable de medida `--available-height` que siembra el posicionador de
    **Base UI** y que `select.tsx` consume como techo. Se afinó el detector a declaraciones de
    altura reales **con siete casos anti-vacuidad**; se tensó en precisión, no se aflojó en
    severidad.
  - **`tests/unit/inventario/product-page.test.tsx` volvió a caer por saturación**, dos corridas
    seguidas y **en líneas distintas**, pasando aislado 42/42 y con la tercera corrida limpia. Es
    el flake de QC-58 otra vez. **No se tocó el baseline**: apagar un archivo ajeno entero es
    decisión humana explícita. Queda para decidir.
  - El gate avisa de **5 entradas del baseline que ya pasan**. Deuda previa y ajena; sin tocar.
  - Un `'use server'` no exporta constantes y no puede entrar en el cierre transitivo del
    contrato. Las dos trampas estaban avisadas y **no volvieron a cobrarse**.

Dos centinelas de **QC-67**, recién mergeada, se pusieron rojos en esta rama. Uno **acusaba a QC-84
de abrir `identity`** listando sus quince archivos. Su commit `1a9e2c4` había arreglado el **rango**
—`merge-base` en vez de un SHA congelado— y **quedó pendiente el sujeto**: no comprobaba de quién es
la rama. Su centinela hermano, `account-status-scope`, lleva la regla escrita en la cabecera:
*«aplicarlas a otra rama no mide nada, solo pone en rojo trabajo legítimo ajeno»*.

Se arreglaron **desde esta rama, en commit propio (`c631118`)**, por decisión humana: señal de rama
**conjuntiva** copiando la forma del hermano —`page.tsx` **más** la carpeta `specs/QC-67-*`, que es
lo que discrimina de verdad porque cada ficha trae la suya—, `skipped` **con motivo** cuando no es
su rama. **141 inserciones y 2 supresiones, las dos de la línea del `import`**: ni una lista
cerrada, ni una igualdad, ni un `expect` tocados. Probado **en las dos mitades**: en esta rama los 6
casos quedan `skipped` y los otros 22 siguen vigilando; **simulando ser la rama de QC-67** vuelven a
morder ante una violación real. De los dos síntomas, **solo uno lo destapó QC-84**: las anclas de
no-vacuidad fallaban igual en `dev`.

### Deuda que deja, con nombre y dueño

- **Decisión de producto pendiente, no defecto**: un nombre de solo signos (`"!!!"`) normaliza a
  **cadena vacía**, así que «!!!» y «¿¿¿» colisionan y el operador leerá «ya existe» sobre dos
  nombres que en pantalla se ven distintos. **El código cumple R12**, que define «mismo nombre» como
  «coincide una vez normalizado». Las salidas: exigir al menos una letra o dígito (regla nueva), o
  que **QC-85** lo explique en el mensaje.
- **El baseline tiene cinco archivos que YA PASAN**, y el gate lo avisa en cada corrida. Entre ellos
  `product-crud.int.test.ts`, cuya propia entrada manda retirarla «en cuanto la suite completa pase
  tres veces seguidas con el archivo dentro» — y ya van varias entre QC-86 y QC-84. Cada archivo
  listado está **apagado entero** para el comparador. **Ficha de arnés que se paga en intereses.**
- **Undécima vez que `wt.sh done` falla en Windows**: desregistró el worktree y dejó el árbol en
  disco. Rematado otra vez con `robocopy /MIR`. Sigue sin ficha.

## QC-79 — alta-sin-contrasena-y-enlace: CERRADA el 2026-09-12 (PR #61, merge `2c3520c`)

El alta de usuario deja de pedir contraseña: el administrador crea la cuenta en `pending`, el
sistema emite una credencial inicial de un solo uso y manda por correo un enlace a una página
pública donde la persona establece su contraseña; al establecerla la cuenta pasa a `active` y el
enlace deja de servir. **R1–R41, los 41 con test verificado en disco.** Migración nueva con su
`down.sql`, RLS `ENABLE`+`FORCE` sin policies sobre la tabla de credenciales, y **una dependencia
nueva aprobada por el humano** —el envío de correo— con su fila en `docs/dependencias.md` y toda
la integración encerrada en un solo archivo.

- **La revisión F2.2 aprobó sin bloqueantes**, y no por creerse la bitácora: el reviewer corrió
  él mismo los dos que `init.sh` **no** cubre —el ciclo real `db:rollback` → `db:migrate`, con la
  integración re-corrida después (180/180), y el E2E de establecer-contraseña, verde en Chromium
  **y** WebKit—. La bitácora no reportaba ninguno de los dos como ejecutado.
- **Las tres preguntas abiertas de la ficha se cerraron en `/afinar-feature`** antes de sembrar el
  spec; la que trajo dependencia nueva pasó por la puerta de la regla 7.
- **Ocho menores, ninguno bloqueante**, entre ellos `T24` cerrada en `[~]`, una cita de
  `design.md > 11.3` que apoya en un requisito de QC-70 que no dice eso, y
  `InitialCredentialFactory` sin consumidor (código muerto tolerado).
- Deja hijas en Backlog: **QC-96** (recuperar contraseña olvidada), **QC-98** (aviso y reenvío del
  enlace en la pantalla) y **QC-89** (restablecer la contraseña de otro), las tres ya desbloqueadas.

## QC-49 — aislamiento-por-empresa-en-inventario: CERRADA el 2026-09-12 (PR #63, merge `a9b38a8`)

El inventario pasa a ser de cada empresa. `products`, `presentations` y `product_batches` ganan
`company_id` **NOT NULL** con FK a `companies` (`RESTRICT`/`CASCADE`), backfill resuelto por
`name_normalized` —nunca por identificador— con `RAISE EXCEPTION` ante cualquier caso ambiguo y
comprobación de `ROW_COUNT` por tabla. El lote lleva **columna propia**, no heredada de su
producto: esa es la decisión que desbloquea QC-81. **32 requisitos con test.**

- **Rechazada en primera pasada con tres bloqueantes, y los tres se cerraron**: una cuarta lista
  cerrada que dejaba el gate en rojo con un rojo propio; la **asimetría de R13** —una garantía de
  seguridad sobrevendida—, cerrada por las dos mitades, guardia nueva **por función** más la
  corrección del requisito y de `design.md > 4.2` y `> 9 B`; y un `down.sql` que contradecía a su
  propio UP sobre la reversibilidad. El reviewer **repitió la mutación él mismo** y confirmó que
  la guardia nueva muerde donde la vieja no llegaba.
- **F2.3 destapó un conflicto que valía leer**: `data-table-alcance.test.ts`, donde QC-49 y QC-67
  habían ampliado **la misma lista cerrada el mismo día**, cada una creyéndose la sexta entrada.
  Se conservaron las dos y el ancla pasó de cinco a siete. El merge destapó además que
  `recipe-route-contract` no protegía nada hasta su primer commit (rango git vacío).
- Gate completo en verde antes del PR: **5217 tests, 0 rojos**, E2E aparte en Chromium y WebKit.
- **Desbloquea QC-81** (lote y fecha de compra), que ya puede exigir unicidad de `lote` por empresa.

### Limpieza de worktrees de este cierre (2026-09-12)

`wt.sh done` volvió a fallar en Windows con las dos —**duodécima y decimotercera vez**—: desregistra
el worktree y deja el árbol en disco (`fatal: … is not a working tree`, node_modules en uso). Se
remató a mano. De paso se barrieron **tres directorios huérfanos anteriores** que arrastraban el
mismo fallo y cuyas ramas ya estaban mergeadas: QC-67, QC-76 y QC-94. `.worktrees/` queda con los
dos vivos y nada más: QC-23 y QC-85. **La ficha de arnés para `wt.sh` en Windows sigue sin existir.**

## QC-85 — pantalla-de-grupos-de-trabajo: CERRADA el 2026-09-12 (PR #64, merge `5188c71`)

La **pestaña «Grupos»** dentro de `/configuracion/usuarios`: crear, renombrar, meter y sacar
personas y borrar con confirmación, con los miembros en el **panel lateral** y su buscador. **43
requisitos, los 43 con test**, más el **E2E completo del recorrido** — el que QC-84 había diferido
aquí. `reviewer` **APROBADO con condiciones** (2 mayores, 4 menores, 8 mutaciones probadas); las dos
condiciones eran commitear y fusionar, y quedaron cumplidas.

**Sin backend, y medido**: `lib/modules/**`, `db/**`, `lib/composition/**` y `package.json` con
**diff vacío**. El menú no ganó ningún ítem. La tabla **no muestra conteo de miembros** —eso es
**QC-100**—, con un test que afirma que ninguna celda pinta un dígito.

### La acotación destapó que la ficha pedía algo imposible

El board pedía que «cada grupo muestre cuántas personas tiene». **`WorkGroupRow` tiene exactamente
`id` y `name`, con un test que congela esas claves**, así que ningún número era alcanzable desde el
frontend. El conteo salió del alcance, **nació QC-100** y el board se corrigió **antes** de sembrar.
Es el tercer caso del mismo patrón, después de QC-63 y QC-80: **la ficha escrita sobre un supuesto
que el código desmiente**.

### La dependencia que se coló por la puerta de atrás

`shadcn add tabs` genera el componente **y añade `cn@0.3.0`** a `package.json` y al lock. No es un
typosquat —es oficial, MIT—, pero `lib/utils.ts` **ya es exactamente `twMerge(clsx(inputs))`** y
**21 de las 23 primitivas** importan `cn` desde `@/lib/utils`: la dependencia era **redundante**, no
una capacidad que faltara. El `implementer` **paró antes de instalar nada** y dejó el árbol limpio
—lock revertido, `node_modules` reinstalado desde el original, el archivo generado fuera del repo—.
Por **decisión humana**: se conserva el archivo de la CLI con **una sola línea cambiada** y **no
entra ninguna dependencia**, más una guardia anti-reincidencia. Es la regla 7 funcionando: la
dependencia se vio, se midió y la decidió una persona.

### Cuatro centinelas tensados, y dos hallazgos que valen más que la feature

Ninguno era un fallo del producto: **los cuatro medían mal**.

1. **Medir «lo que aporta la rama» partido en dos mitades es frágil.** Cuatro casos exigían
   «nada en el diff» por un lado y «esto sin seguimiento» por otro, y **se pusieron rojos sin que
   cambiara un byte**: un archivo pasó de *sin seguimiento* a *en el diff* al commitear. Ahora miden
   **lo aportado** (diff + sin seguimiento) contra una sola lista cerrada, lo que además **cierra un
   agujero simétrico**: antes, modificar una primitiva existente y no commitearla se colaba por la
   rendija entre los dos casos.
2. **El último SHA congelado del repo dejó de ser teórico.** `unidades-convenciones.test.ts` estaba
   verde y se decidió no tocarlo. **El merge lo puso rojo**: `resend`, que QC-79 metió en `dev`, hizo
   que la guardia dijera que «la feature de unidades toca el manifiesto» **sin que QC-39 hubiera
   abierto un solo intocable**. Curado con merge-base y precondición de rama. **Ya no queda ningún
   SHA congelado en uso en el repo.**

### Dos cosas que se hicieron mal y conviene no repetir

- **Un `./init.sh --rapido` en verde que no probó nada.** Con el trabajo **sin commitear**, `HEAD`
  *era* la merge-base: el rango salía vacío, el gate imprimió «nada que relacionar» y corrió **solo
  las guardias**. El leader lo dio por bueno. Lo cazó el `reviewer`. **Un gate rápido sobre una rama
  sin commits no es una verificación**, y conviene que el propio script lo grite.
- **Dos corridas del gate completo muertas por falta de memoria** —4,4 GB libres de 23,8 con 16
  procesos de node de las sesiones paralelas—. Salió a la tercera **bajando Vitest a 2 hilos**.
  Material de ficha de arnés: el gate largo debería limitar su concurrencia solo.

### Deuda que deja, con nombre y dueño

- **El texto de R35 contradice a R30.** El `reviewer` dictaminó que **el código es correcto** —el
  panel permanece abierto— y que **lo que hay que enmendar es el requisito**. Decide el humano.
- **`pnpm e2e` completo está rojo por 23 fallos ajenos**, con causa medida: en una base **limpia** el
  rol **Operador no tiene `dashboard.consultar`**, aterriza en `/inventario` y revienta el
  `waitForURL` de todo spec que espere el dashboard con un fixture no-Administrador. En el repo
  principal pasan **porque su base arrastra estado acumulado**. **La suite E2E no sobrevive a una
  base limpia**, y se ha visto solo porque estas fichas empezaron a usar base propia.
- **El baseline ya tiene OCHO archivos que pasan**, cuatro de ellos curados en esta misma ficha.
  Cada uno está apagado entero para el comparador.
- **Duodécima vez que `wt.sh done` falla en Windows**, y esta vez peor: el árbol quedó **vaciado
  pero con el directorio retenido** por un proceso, así que `wt.sh` falló por `.git` inexistente y
  hubo que desregistrar a mano. El directorio vacío sigue en `.worktrees/`. La rama se borró en local
  y en `origin`.

## QC-77 — aislamiento-de-la-base-en-tests-de-integracion: CERRADA el 2026-09-13 (PR #65, merge `12d254f`)

Cada corrida de `tests/integration/**` arranca ahora sobre **su propia base desechable**, creada
desde una plantilla ya migrada y sembrada y **borrada al terminar pase lo que pase** —incluido
Ctrl-C, donde el borrado por señal es **síncrono a propósito**: Vitest hace
`setTimeout(() => process.exit(), 1)` en su handler y un `await` no llega a ejecutarse—. Entra
además el guardián que aborta si la corrida no apunta a su base efímera, la CLI `db:test`
(`status`, `list` y un barrido con cinco guardas), el aviso amarillo cuando la base de desarrollo
tiene migraciones pendientes, y el censo de aislamiento con su guardia para los tests nuevos.
**31 requisitos, los 31 con test que vuelve a correr. Ninguna dependencia nueva.**

### El daño que arregla, medido antes de empezar

El gate completo sobre `dev` daba **22 archivos de integración en rojo** fuera del baseline. La
causa de los 22 era **una sola**: la base compartida, cuatro migraciones atrasada. Migrada, queda-
ban **2**, y los dos eran estado de datos —38 tipos de documento `DOCxxxxxxxx` de corridas viejas,
y el reset de `identity-seed` que ya no podía borrar empresas porque QC-49 colgó el inventario de
`companies` con `ON DELETE RESTRICT`—. Sobre base limpia, esos dos daban **61/61 verde**. Ese
experimento —hacer la base limpia a mano y medir— es lo que convirtió la ficha de sospecha en
encargo, y la receta que salió de él está ahora escrita en `design.md`.

### Rechazada en primera revisión, y por el motivo correcto

El `implementer` entregó **12 requisitos con test automático y 19 con «medición pegada»**, y fue
él quien marcó la distinción en su mapa. El `reviewer` la convirtió en el criterio del rechazo:
**una medición cuenta solo si romper el requisito pone el gate en rojo por sí solo.** Cuatro
bloqueantes, todos de trazabilidad y ninguno funcional — entre ellos el guardián que protege la
base de desarrollo y el barrido que ejecuta `DROP DATABASE`, los dos sin test. Segunda vuelta: **38
casos nuevos**, y aprobado con 31 de 31.

Destapó de paso que **nada estaba commiteado**: con el diff vacío, `--rapido` seleccionaba **cero**
tests relacionados. No era cosmético.

### Tres cosas que valen más que la feature

- **El `spec_author` no se creyó el brief del leader y acertó.** Se le dijo «18 de 41 archivos usan
  el patrón de rollback». Fue a comprobarlo: el `grep` obvio devuelve **19**, porque
  `work-group-crud` usa el patrón para un sondeo suelto y committea el resto. El recuento era
  correcto; **lo falso era el método**. Por eso la guardia es un censo explícito y no un grep.
- **El `reviewer` repitió las mutaciones él mismo**, y una salió **verde**: mover la guarda que
  protege la base de desarrollo detrás de otras dos es **equivalente**, la base sigue retenida. Leer
  ese verde como correcto —y no como un test que no muerde— es la parte difícil de hacer bien.
- **Un subagente editó un archivo fuera de su carril** para poder mutar y probar que su test mordía,
  y **lo declaró** avisando que no podía descartar haber revertido un cambio ajeno. Se verificó en
  disco: no se perdió nada. El riesgo fue real y lo causó el reparto de archivos del `implementer`.

### Dos sesiones arreglando el mismo centinela el mismo día

El gate salió rojo por **un archivo que no era de esta ficha**: el centinela de alcance de QC-85,
**rojo ya en `dev`** desde `97c96c2` —verificado corriéndolo allí— porque sus anclas de no-vacuidad
no tienen nada que medir fuera de su rama. Es la **tercera aparición** de esta especie en el repo.
Se arregló desde esta rama por decisión humana (`b4a3983`)… y resultó que **la otra sesión lo había
arreglado a la vez en `dev`** (`5f687c2`, 88 inserciones contra 30). El conflicto se resolvió
tomando **entera la versión de `dev`**, tras verificar que pasa y que cubre más: el archivo queda
idéntico al suyo, sin una tercera variante conviviendo. La misma colisión que ya tuvieron QC-49 y
QC-67, ahora entre dos sesiones en vez de entre dos fichas.

### Deuda que deja, con nombre y dueño

- **8 entradas del baseline ya pasan** y el gate lo avisa en cada corrida; varias caen justamente
  porque esta ficha quita el residuo. Entre ellas `product-crud.int.test.ts`, cuya propia entrada
  mandaba retirarla «en cuanto la suite pase tres veces seguidas con el archivo dentro». **Retirarlas
  es trabajo aparte y sigue sin ficha.**
- **R10** (dos worktrees corriendo a la vez) queda cubierto **por partes**: probarlo de punta a punta
  exigía ensuciar la base de desarrollo, o sea provocar el bug para demostrar el arreglo.
- **La relajación de «el catálogo arranca solo con CC»** que entró por `dev` ya no hace falta: con
  base efímera el invariante vuelve a ser comprobable. **La retira QC-87**, por decisión humana, para
  que dos sesiones no se pisen en el mismo archivo.
- **La suite E2E completa no sobrevive a una base limpia**: 23 fallos, porque el rol Operador no
  tiene `dashboard.consultar` y aterriza en `/inventario`, reventando el `waitForURL` de todo spec
  que espere el dashboard con un fixture no-Administrador. Medido por la sesión de QC-85. **No es de
  QC-77 ni de QC-87, y no tiene ficha.**
- **`wt.sh done` volvió a fallar en Windows**, y el patrón del centinela que mide a quién no debe
  sigue **sin un sitio donde esté escrito una sola vez**. Los dos son candidatos a ficha del arnés.

---

## QC-87 — asignar-responsables-a-un-pedido (mitad backend) · 2026-09-13

**PR #67**, mergeada en `dev` (`f1b3414`). `complexity: medium`, zona `backend`. Ciclo SDD completo:
spec aprobado el 2026-09-12, 15 tareas, R1–R51, review con **0 hallazgos mayores** y `./init.sh`
completo en verde antes del PR (428 archivos, 6095 tests, 0 rojos nuevos).

Entra el módulo `asignaciones`: cuatro casos de uso —asignar, desasignar a una persona, quitar un
grupo del pedido y listar responsables—, el puerto, su adaptador Prisma, tres Server Actions y el
cableado. La asignación **se congela**: al elegir un grupo, el pedido guarda las personas que ese
grupo tenía **en ese momento**, con su origen y el nombre del grupo, así que mover a alguien de
grupo mañana no le quita un pedido que ya estaba ejecutando.

### La ficha esperó por un motivo, y el motivo caducó

Llegó a F2.0 aprobada y **no arrancó**: `backend` tenía tres `in_progress` con tope de dos, y sobre
todo **QC-77 estaba reescribiendo el aislamiento de la base bajo los tests de integración**, que es
exactamente donde QC-87 iba a escribir los suyos. La espera no fue burocracia: al mergear QC-77, esta
ficha escribió sobre la forma nueva en vez de sobre algo que se movía, y de paso **retiró la
relajación del invariante «el catálogo arranca solo con CC»** que la base compartida había obligado a
aceptar. Esa retirada estaba escrita en el historial de QC-77 con nombre y dueño, y se cumplió.

### El hallazgo que justifica el criterio de mutación

Durante la implementación se coló a HEAD un `deleteOne` con el `where` **sin `userId`**: desasignar a
*una* persona habría borrado a **todos** los responsables del pedido. No lo encontró una revisión de
código: lo cazaron los tests de integración de T14, y quedó corregido en `52fc99b`. Entró por un
`git add` de ruta amplia mientras un subagente mutaba archivos — **lección operativa: no hacer
`git add lib/` con subagentes trabajando**.

Además, **R38 estaba documentado pero no implementado**: el desempate por `userId` vivía en el
comentario del comparador y no en el código, así que el orden no era total y dos homónimas salían
según el orden de llegada de las filas. Y el **centinela de QC-86 no vigilaba nada** en los
comentarios `//`: su `stripComments` usaba `/\/\/.*$/`, y sin bandera `m` —y con `.` sin casar `\r`—
en un repo con CRLF no borraba ningún comentario de línea.

### Deuda que deja, con nombre y dueño

- **Un pedido de otra empresa es distinguible por el `code` del rechazo**: `findAliveOrderTargetById`
  busca sin `companyId` porque **`orders` no tiene `company_id` todavía**. Declarado por escrito en
  `design.md > 0` **antes** de implementar y diferido a **QC-46**. No es un descubrimiento tardío.
- **Los 8 archivos del baseline que ya pasan** siguen sin ficha y sin retirar. El aviso del gate va
  por su tercera ficha consecutiva.
- **`wt.sh done` volvió a fallar en Windows**, por segunda vez seguida: desregistró el worktree pero
  dejó `node_modules` sin borrar. Se limpió a mano más `git worktree prune`. Ya era candidato a ficha
  del arnés; ahora tiene dos ocurrencias medidas.

**QC-102** (la mitad de pantalla) queda **desbloqueada**.

## QC-23 — registro-de-sesiones · CERRADA el 2026-09-13 (PR #66, merge `5f021c7`)

Las sesiones se revocan de verdad, no solo se retira la cookie. `complexity: high`, zona `backend`,
51 requisitos EARS y 24 tasks. Review en `progress/review_QC-23-registro-de-sesiones.md`; bitácora
en `progress/impl_QC-23-registro-de-sesiones.md`.

### Lo que entrega, y por qué son DOS mecanismos y no uno

- **Un sello por usuario**, `users.sessions_valid_from`: toda sesión emitida antes o en ese instante
  deja de valer. Cubre los cortes masivos —baja, bloqueo, cambio de rol, cambio de contraseña,
  cierre total— y **cuesta cero consultas**: sale del `findFirst` de `users` que ya se hacía.
- **Una tabla de sesiones CERRADAS**, `revoked_sessions`, para el cierre individual, que el sello no
  sabe distinguir. Es una **lista negra, no un censo**: no se guardan las sesiones abiertas y el
  login no escribe ninguna fila. Ausencia significa «válida».

El token sube a `v4` y estrena `sid`, que es lo que permite señalar una sesión concreta.

### Tres decisiones que conviene no volver a discutir

1. **No se guardan las sesiones abiertas** (alternativa 3 del `design.md`): obligaría a escribir en
   cada login y a leer N filas por petición, justo lo que QC-28 viene a quitar, y regalaría la lista
   de dispositivos, que está fuera de alcance por la decisión 12.
2. **La comprobación NO va en el middleware** (alternativa 7): el borde no es la frontera de
   seguridad ni consulta la base, y `guard-middleware-edge.test.ts` se pondría roja en cuanto el
   cierre de imports tocara un repositorio. Los dos cortes son pasos 7 y 8 de `resolve-session.ts`.
3. **El sello se trunca al segundo y la comparación es `<=`, no `<`.** Como `iat` viaja en segundos,
   el `<` estricto dejaría sobrevivir una sesión ajena emitida en el mismo segundo del corte. El
   precio es que la sesión reemitida dura un segundo más de ocho horas. Se paga.

### El hallazgo que vale más que la feature: el gate daba VERDE con la integración caída

`./init.sh` cantó `== init OK ==` con el proyecto de integración **abortado en el arranque y cero
tests corridos**. El veredicto salía solo del JSON de rojos, y un proyecto que no arranca no escribe
rojos: era invisible. La causa era la receta de plantilla de QC-77, que sembraba con el esquema a
medias —QC-23 es la **primera ficha que añade una COLUMNA** después del corte de la migración de
QC-49, y `@default(now())` lo rellena Prisma del lado del cliente—.

Arreglado desde aquí por decisión humana, y el gate gana **dos garantías** para que no pueda volver
a mentir así: (1) los tres proyectos —`ui`, `node`, `integration`— tienen que aparecer en el informe
o es rojo, diciendo cuál falta; (2) si el proceso sale distinto de cero y el informe no trae ningún
archivo rojo que lo explique, algo falló **fuera** de los tests y el gate falla. Probado por
mutación: devolviendo el seed al punto intermedio, vuelve a romperse con el mismo error.

### Rechazada en primera revisión, y por el motivo correcto

El `reviewer` la rechazó con 1 hallazgo mayor que **no rompía ningún `R<n>` de esta ficha**: rompía
la promesa que le hace a **QC-89 y QC-96**. El arreglo fue una constante y un caso de test, sin
tocar producción. Aprobada en segunda ronda, sin mayores.

### Dos conflictos con QC-87, y los dos eran aditivos

QC-87 se mergeó en `dev` (PR #67) entre la apertura del #66 y su merge, y dejó el PR en
`CONFLICTING`. Conflictaron `lib/modules/identity/index.ts` y
`tests/unit/identity/account-status-scope.test.ts`: **las dos ramas añadían un bloque al final del
mismo ancla**. Se resolvió conservando ambos lados íntegros, comentarios incluidos. `dev` no traía
migraciones, verificado en `db/migrations/` —28 contra 29, la extra es la suya—.

Gate final tras el merge: `== init OK ==`, exit 0 — **439 archivos, 6266 verdes, 66 saltados, cero
rojos**. Integración: 54 archivos, 709 verdes.

### Deuda que deja, con nombre y dueño

- **La E2E queda diferida a QC-53** (R50), declarada como requisito: esta ficha no añade pantalla,
  ruta ni botón. Deuda con destinatario, no exención.
- **El botón del administrador no existe hasta QC-101** (R51): la operación queda implementada y
  probada, sin ninguna vía de invocación desde la interfaz.
- **La purga es perezosa y por persona**, así que quien cierra una sesión y no vuelve a cerrar
  ninguna deja su fila caducada indefinidamente. No crece, no afecta a la corrección y no degrada la
  consulta —va por índice único—, pero **no está entre las siete consecuencias declaradas del
  `design.md`**. Destinatario natural: QC-28, que vuelve a tocar esta ruta.
- **`pending` no corta (R36)**: mover una cuenta `active` → `pending` → `active` dentro de las 8 h
  **revive** sus cookies. Consecuencia directa de la decisión 1, escrita para que nadie la descubra
  de sorpresa.
- **Una caída de la base se ve como un cierre de sesión** (§ 4.2): precio de que la revocación no se
  pueda saltar provocando un fallo.
- **Los 8 rojos del baseline pasan todos** y nadie los ha limpiado. Material de QC-99.

## QC-56 — migrar-listas-a-tabla-compartida (2026-09-15/16)

`frontend`, `medium`. PR **#74** mergeado en `dev` (merge `dc73f14`). **R1–R33** y **19 tasks**, con
`./init.sh` completo en verde antes del PR: **466 archivos, 6721 pasados, 78 saltados, 0 rojos nuevos**.

- **Qué entra**: las listas de **recetas** y **proveedores** montan la tabla compartida de QC-55 y
  **se igualan a productos**: orden por cabecera, búsqueda y filtro por rango de fecha de creación,
  contra las listas blancas que QC-57 ya publicaba. Cada gesto navega y el servidor recalcula.
  **Invierte** QC-26 R14 y QC-44 R11, como `749d850` invirtió QC-22 R13.
- **La acotación encontró la ficha medio derogada**: productos **ya estaba migrado** desde `749d850`
  (2026-09-07, fuera del flujo de fichas) y **dos documentos afirmaban que recetas también** —el
  mensaje de ese commit y la enmienda de QC-44—, lo cual era falso. El alcance pasó a recetas +
  proveedores, reabriendo la enmienda que dejaba la lista de proveedores como estaba.
- **Cuatro decisiones del humano en F1.4**, contra lo que decía la semilla: vacío, error y esqueleto
  **fuera** de la tabla (como productos, no como QC-55); una línea en el barrel para publicar
  `SUPPLIER_QUERYABLE`; la **descripción de receta sale de la lista**; y un estado propio de «sin
  resultados» con «limpiar». **D16, al aprobar**: «sin resultados» es la **única** excepción y lo
  pinta la tabla con cero filas, porque la caja de búsqueda vive dentro de `<DataTable>` y no debe
  desmontarse. **`components/shared/data-table/` no se tocó**, y hay test que lo afirma.
- **La prueba en iPhone real salió a ficha propia: QC-114**, ahora desbloqueada. La T13 de QC-55
  llevaba pendiente desde el 2026-09-04 y ya afectaba a siete pantallas, no solo a esta.
- **Review**: RECHAZADA en la primera vuelta (3 mayores) y APROBADA en la segunda (0 mayores nuevos,
  2 menores). **M2** era un test que se habría puesto rojo al cerrar la feature —sumaba el árbol de
  trabajo y exigía que fuera de rutas y tests solo cambiara el barrel—; ahora mira solo el rango
  commiteado y las raíces de producto. **M3** añadió el test automático de R25.
- **M1 lo decidió el humano: NO bloquea.** La regla de comentarios que invocaba **no está en
  `origin/dev`**, solo sin commitear en el árbol principal. Queda como deuda con m5, m6 y m7.
- **F2.3 con QC-93 dentro**: `dev` avanzó 36 commits durante la review y el merge trajo 3 conflictos
  (los dos E2E y `data-table-alcance`). Se resolvieron conservando ambos lados, y los E2E nuevos
  pasaron a `loginAndLand`, porque QC-93 borró `login()` y su guardia lo prohíbe. **Ese merge curó
  los rojos R6 y R52** del Operador.

### Lo que deja anotado y no tiene ficha todavía

1. **R51 sigue rojo, heredado de QC-80**: `choosePresentation` de `e2e/proveedores.spec.ts` —y el
   mismo patrón en `e2e/inventario.spec.ts`— crea la presentación **sin unidad**, obligatoria desde
   `af96771`, así que el panel no se cierra. Es la «ficha nueva» que ya proponía la bitácora de QC-93.
2. **La receta de base vacía de `progress/current.md` estaba rota** desde QC-23: `db:seed` necesita
   `users.sessions_valid_from`, de una migración posterior a la de QC-49, que nunca llega a aplicarse.
   La que funciona es la plantilla de QC-77 (`pnpm run db:test template`), y `docs/worktrees.md` no
   documenta nada de esto —ni `pnpm install`, ni `prisma generate`, ni `next typegen`—.
3. **n1**: la guardia de R25 cubre *localizar* por copy, no *afirmar* sobre copy.

## QC-81 — lote-y-fecha-de-compra · CERRADA el 2026-09-16 (PR #75, merge `6175700`)

- Cada entrada de mercancía (`product_batches`) registra **lote** y **fecha de compra**, los dos
  obligatorios. El lote es único por empresa —índice `(company_id, lot)` en la base, no una
  comprobación en el código—, y si nadie lo escribe lo genera el backend continuando desde el más
  alto de esa empresa. La fecha admite hoy o antes, nunca futura; ausente, queda hoy. Migración con
  relleno por orden de creación, que se detiene entera si encuentra duplicados previos.
- **Requisitos cubiertos: R1–R37**, verificados uno a uno por el reviewer. La pantalla **no entra**
  (R28): es QC-103. Sin dependencias nuevas.
- **La concurrencia, que era el corazón de la ficha**: el número sale de `max(lot)` dentro de la
  misma transacción que inserta, con `pg_advisory_xact_lock` por empresa **como sentencia anterior**
  al SELECT —en `READ COMMITTED`, pedirlo dentro del cálculo leería un máximo viejo—. El test de dos
  altas simultáneas **da rojo si se quita el lock**, comprobado por el implementer y por el reviewer.
- **Decisiones humanas**: `batch_duplicate_lot` como sexta enmienda al catálogo cerrado de errores;
  excepción acotada a R29 para tocar **solo** la siembra de `e2e/aislamiento-inventario.spec.ts`;
  **D13/R34–R36**, un lote tecleado de solo dígitos no llega a 60 caracteres para que el generado
  quepa; y **D14/R37**, que arregla aquí una carrera **heredada de QC-90** —el borrado lógico de un
  producto podía colarse entre la comprobación de «vivo» y el alta de su lote— con
  `FOR NO KEY UPDATE` sobre la fila del producto antes del lock del correlativo.
- **La regla nueva de comentarios de `docs/conventions.md` se aplicó entera**: 34 commits `chore`
  limpian los comentarios de los 32 archivos de la rama sin tocar código (4.776 → 1.242 líneas de
  comentario, 1.240 → 3 citas). Las tres que quedan son las que exigen sus tests, exceptuadas por el
  humano. Tres vueltas de revisión: la segunda rechazó por esos comentarios y la tercera por R37
  fuera del mapa de trazabilidad.
- **Verificación, dicha como fue**: E2E verde en Chromium y WebKit; gate completo de **469 archivos
  y 6718 tests verdes** con **un rojo ajeno** (`credential-setup.int.test.ts`, de QC-79, idéntico a
  `dev` y **15/15 repetido solo**: falla por su propia guarda de concurrencia bajo carga). El PR se
  mergeó con esa corrida, así que **T12 quedó sin marcar**.
- **El gate que se lanzó tras la resincronización final no vale, y el error fue del leader**: seguía
  corriendo cuando se ejecutó `wt.sh done`, que desregistró el worktree en mitad de la corrida. Sin
  `.git`, toda la integración —que deriva de git el nombre de su base efímera— y algunas pruebas de
  UI cayeron a la vez: **32 archivos en rojo que no son una regresión, sino una corrida invalidada**.
  La lección es de secuencia, no de código: **no se desmonta un worktree con el gate en marcha**.
- **Deuda que hereda QC-103**: pintar la fecha, mostrar el lote generado y un test de UI que afirme
  el mensaje de R34 en el campo del lote.
- **Deuda de arnés encontrada de paso**: la receta para montar una base propia
  (`docs/verification.md`, `specs/QC-77-…/design.md > 3`) **no corre hoy** —`db:seed` muere con
  `The column 'existe' does not exist`—; la base de esta ficha se montó copiando la plantilla de
  integración. Y `merge-tree` entra en el flujo: que el tramo nuevo de `dev` no toque el área de la
  ficha **no basta** para saltarse la sincronización —el PR salió CONFLICTING por un test de
  contrato ajeno que la limpieza de comentarios había rozado—.

## QC-104 — sesion-una-sola-vez-por-peticion (2026-09-16)

`backend`, `medium`. PR **#76** mergeado en `dev` (merge `d02571b`). **19 requisitos** (R1–R16,
R20–R22) y **11 tasks**, con `./init.sh` completo en verde antes del PR: **474 archivos, 6865
pasados, 87 saltados, 0 rojos nuevos**.

- **Qué entra**: dentro de una misma petición la sesión se resuelve **una sola vez**, en pantallas y
  en Server Actions. `React.cache` para el render y `AsyncLocalStorage` (`node:async_hooks`, que no
  es dependencia npm) para las acciones, con el helper en `lib/shared/request-scope.ts`. El dominio
  y las dos proyecciones de QC-48 no cambian, y **`components/shared/data-table/` ni se toca**.
- **Medido, no supuesto** (R16, sobre base propia `QuimiCloude_QC104`, control en reposo 0):
  `/configuracion/usuarios` **7 → 1**, `/pedidos` **6 → 1**, `/configuracion/unidades` **7 → 1**,
  guardado **9 → 2**. **La ficha subestimaba el problema**: hablaba de «tres lecturas por página».
- **La acotación quitó lo que no se sostenía.** La ficha nació para «dejar la medición que QC-28 no
  tiene»; al preguntarlo, el humano respondió que el objetivo es evitar llamadas innecesarias, **no
  medir**, y salieron R17–R19, T9 y el script de tiempos. **Consecuencia que queda escrita: QC-28
  sigue sin condición que la desbloquee.**
- **El hallazgo del ciclo, en tres capas.** El `reviewer` encontró un **noveno `currentActor` sin
  envolver** (`session-actions.ts`, de QC-101) que **entró con la propia sincronización de la rama**,
  después de la auditoría. Al arreglarlo apareció que el test que debía cazarlo **contaba las filas
  de su propia lista** y seguía verde con nueve en disco; se cambió para que recorriera el árbol. Y
  ese recorrido **llevaba dentro otra lista de módulos escrita a mano** y no bajaba a subcarpetas.
  Las tres capas cerradas, cada una probada por mutación.
- **Cinco trampas del instrumento**, todas documentadas en `progress/medicion_QC-104-…md` porque cada
  una había producido antes una tabla creíble y falsa: el contador publica con retraso (piso de 12 s),
  `APIRequestContext` no manda la cookie `Secure` y servía el login con 200, el fixture nace muerto
  sin `sessionsValidFrom` en el pasado, un `goto` repetido lo sirve el router sin tocar el servidor,
  y `networkidle` no vale con streaming de RSC.

### Lo que deja anotado y no tiene ficha todavía

1. **La pregunta abierta 2 sigue viva**: una acción que revalida y el repintado que provoca cuentan
   como **dos** ámbitos (R4 provisional), y los 2 del guardado son justo eso. Si se decide que sean
   una sola petición, baja a 1.
2. **La nota de T11 en `docs/architecture.md` no es exigible**: hacerlo pediría una guardia nueva.
3. **El entorno denegó dos veces** la vía de conteo por configuración de Postgres (`ALTER SYSTEM`).
   El subagente **no la rodeó** y se resolvió con base aislada; queda dicho por si vuelve a estorbar.

## QC-60 — aislamiento-por-empresa-en-pedidos · CERRADA el 2026-09-16 (PR #77, merge `c93d916`)

`backend`, `medium`. **R1–R35** y **20 tasks**, con `./init.sh` completo en verde antes del PR:
**482/482 archivos, 7000 tests verdes, 87 saltados, 0 rojos**. Review **aprobada en segunda vuelta,
sin mayores**.

- **Qué entra**: `orders` gana `company_id` obligatorio; toda lectura y escritura de `pedidos` se
  limita a la empresa de la sesión, en un único punto de consulta y validado en el service, y el
  acceso a un pedido ajeno se rechaza **aunque se conozca el id**. El correlativo pasa a contarse
  **por empresa** —lock de aviso por `(empresa, año)` como sentencia anterior, `max()+1` dentro del
  `INSERT`, único `(company_id, order_year, order_sequence)`— y **no se renumera nada**: los 3
  pedidos vivos conservan 37, 44 y 77 y el siguiente fue el 78. La FK de `order_assignments` hacia
  el pedido pasa a ser **compuesta**. El `down.sql` aborta entero si revertir perdería datos. E2E en
  Chromium y WebKit.
- **La acotación corrigió la ficha**: decía «los pedidos **y sus líneas**» —no existe tabla de
  líneas— y que un pedido referencia producto o unidad —referencia una **receta**—. La
  `description` del board se reescribió antes de sembrar.
- **R15 era un bug real, y un test en verde lo tapaba.** Con `INSERT` crudo, Prisma devuelve el
  duplicado como `P2010` **sin el nombre del índice**, y el código lo buscaba por ese nombre: el
  reintento era **código muerto** y el unit test pasaba porque fabricaba un error que sí lo traía.
  Reproducido contra Postgres 16 antes de decidir. Ahora se reconoce **por SQLSTATE `23505`**, como
  ya exigía el repo, y el test de integración nuevo **se comprobó rojo con el código anterior**.
- **R22 chocaba con una decisión aprobada**: se copió de QC-49 («rechazar el campo desconocido») y
  QC-35bis había fijado que el alta de pedidos **descarta**. Ganó QC-35bis por decisión humana; la
  garantía que importa —la empresa de la entrada nunca se escribe— sigue con test.
- **El reviewer rechazó una vez por comentarios, y el fallo de fondo fue del leader**: la regla de no
  citar fichas en producción **no está escrita en `docs/`**, solo la describe QC-115, y el leader la
  metió en los encargos como si lo estuviera. El humano la acotó a las líneas de esta rama; las citas
  preexistentes esperan a QC-115.
- **Tres cosas que el gate rápido no ve y el completo sí**: una lista cerrada de índices de QC-57
  sin tensar, el conflicto semántico con **QC-104** mergeada en paralelo (`order-actions.ts` a
  `runInRequestScope`) y, en la base compartida, el checksum de la migración desincronizado tras
  editar sus comentarios —SQL ejecutable idéntico, `migrate status` al día—.
- **Coste de máquina**: dos corridas del gate **murieron por falta de memoria** con otra sesión
  corriendo su gate a la vez, y una tercera dio un rojo de saturación que pasa corrido solo. La
  buena se lanzó esperando a que no hubiera procesos de test ajenos.

### Lo que deja anotado

- **Hasta QC-50** un pedido puede apuntar a una receta de otra empresa: las recetas aún no tienen
  empresa. Declarado en el spec, sin fecha de cierre.
- **Se acaban los huecos por transacción abortada** en la numeración, que QC-33 R42 / QC-34 D27
  habían aceptado como coste.
- En *Deudas* de `current.md`: el posible falso verde de `e2e/aislamiento-inventario.spec.ts`
  (QC-49) y el barrido pendiente de adaptadores que reconozcan duplicados por nombre de índice, con
  `presentation-prisma.ts:123` como primer sitio a mirar.

## QC-106 — endpoint-de-carga-de-pdf · CERRADA el 2026-09-16 (PR #78, merge `8033f7a`)

`backend`, `high`. **R1–R34** y **14 tasks**, con `./init.sh` completo en verde antes del PR:
**493 archivos, 7165 tests verdes, 87 saltados**; los 2 rojos restantes son del baseline y los
causan las dos dependencias aprobadas. Review **rechazada en primera vuelta** con 1 bloqueante, y
cerrada. Primera ficha de la épica **QC-105 «Documentos e IA»**: desbloquea QC-107, QC-108, QC-109
y QC-111.

- **Qué entra**: módulo **nuevo `documentos`** que emite enlaces de subida firmados para hasta 10
  PDFs por tanda contra un **bucket privado propio**, y publica **detrás de un puerto** las dos
  conversiones —PDF a PNG de sus páginas y PDF a texto—, que consumirá QC-111. **Sin tabla, sin
  migración, sin `app/api/`, sin códigos de error nuevos y sin permisos nuevos.**
- **La acotación evitó construir sobre una premisa falsa.** La ficha pedía un «bucket privado de
  Supabase Storage» dando por hecho que se apoyaba en lo de QC-25 — y QC-25 había **descartado a
  conciencia** el bucket privado con enlace firmado («era la recomendación técnica y el humano la
  descartó») y montado uno **público**. Se preguntó en vez de suponerlo: nace bucket privado nuevo y
  **QC-25 D5 no se toca**.
- **«Endpoint» no existía como camino en este repo**: `app/api/` no existe, todo entra por Server
  Actions, y el límite por defecto de éstas es **1 MB** con `next.config.ts` vacío. Diez PDFs no
  caben. De ahí la subida **directa del navegador** con enlace firmado, que es la decisión que dio
  forma a toda la ficha.
- **Una decisión cerrada resultó IMPOSIBLE, y se enmendó con D19.** `createSignedUploadUrl` **no
  acepta plazo**: Supabase emite esos enlaces con **2 horas fijas** —verificado en los tipos del
  paquete instalado y en su documentación—. Los 15 minutos rigen en los de **lectura**. **R10 se
  reescribió** para que el código no prometa lo que no puede cumplir, y el puerto **perdió el
  parámetro** del plazo en la subida: un contrato que pide algo que nadie puede honrar es una
  mentira en el tipo.
- **El hallazgo que vale más que la feature: B1, que ningún test veía.** La mitad de **lectura** de
  R12 no estaba implementada —la comprobación de empresa no tenía **ni un llamante en producción**
  mientras `lib/composition` ya cableaba `createSignedReadUrl` y `download` a pelo—. Todo estaba en
  verde porque **no hay caso de uso de lectura todavía**: la factura la habría pagado **QC-111**,
  pudiendo descargar PDFs de cualquier empresa. Es exactamente el agujero que un gate verde no ve y
  para lo que existe la fase de review.
- **El aislamiento por empresa sin tabla**: la ruta empieza por la empresa y el servidor solo firma
  dentro de ese prefijo; el rechazo es idéntico **exista o no** el archivo.
- **Sin ampliar el catálogo cerrado de permisos**: se exige `proveedores.modificar`, que ya existe y
  que en el sembrado solo tiene el Administrador, validado en el service. No se compara el nombre
  del rol, prohibido desde QC-74.
- **Dependencias**: `unpdf` (MIT, cero dependencias propias) más `@napi-rs/canvas` como par
  **opcional**, con los cuatro checks verificados **el día de la aprobación** —no heredados, que es
  lo que caducó en QC-28—. **`mupdf` descartada a sabiendas** por `AGPL-3.0`. Se **enmendó** la fila
  de `@supabase/storage-js`, que afirmaba que la consume un solo archivo.
- **El cupo se levantó por decisión humana** y el coste fue mayor del anunciado: con 3 `in_progress`
  en `backend`, el validador **aborta el gate entero** antes de typecheck, lint y tests. Durante esa
  ventana **nada se verificó con el gate** —se usó verificación dirigida— hasta que QC-60 y QC-104
  mergearon y el cupo bajó solo.
- **El límite semanal de Opus mató al `implementer` a media escritura de su bitácora.** El daño fue
  casi nulo porque el código y sus tests ya estaban commiteados. Se relanzó **en Sonnet** —que
  `AGENTS.md` permite «en la llamada concreta»— y cerró el trabajo pendiente en 65k tokens.
- **Dos desviaciones del reparto de roles, las dos declaradas en su commit**: el leader resolvió el
  conflicto del merge y acotó una guardia ajena, porque el implementer estaba caído.

### Lo que deja anotado

- **El bucket privado y sus límites se crean A MANO en la consola de Supabase**: no hay ni un script
  ni una migración que cree buckets en el repo, así que el gate **no puede comprobarlos**. El de
  QC-25 se creó igual.
- **Si `@napi-rs/canvas` corre en el runtime de Vercel quedó como DESCONOCIDO**, no como sí: es un
  binario nativo y no se pudo verificar. **No bloquea** —la conversión a texto no lo necesita— y lo
  cierra quien lo consuma.
- **E2E diferido a QC-107** y **render real a QC-111**, las dos con destinatario.
- **`documentos` NO entró en `BUSINESS_MODULES`** de `guard-autorizacion-por-permiso.test.ts`, así
  que esa guardia **no vigila** el módulo nuevo: hoy no cazaría una autorización por nombre de rol
  ahí. Queda propuesto como ficha propia.
- En *Deudas* de `current.md`, cinco cosas del arnés que esta ficha destapó: el validador que ciega
  el gate, tres guardias que se rompen solo por instalar una dependencia aprobada, una guardia que
  afirmaba algo global protegiendo un alcance local, la herencia de modelo que costó más de un
  millón de tokens de Opus, y la regla de «no citar fichas en comentarios» que **no está escrita en
  ningún documento** pero rechaza trabajo.

## QC-103 — lote-y-fecha-de-compra-en-el-alta (cerrada el 2026-09-17)

**PR #80**, merge `433bad2`. Zona `fullstack`, `complexity: medium`. Épica *Inventario*.

La pantalla que **QC-81 dejó fuera a propósito** para no cruzar de zona: el alta de producto gana el
campo de **fecha de compra** del primer lote y **nombra el lote asignado** en el aviso de éxito.
Hereda el **E2E que QC-81 difirió expresamente** hasta aquí, que `CHECKPOINTS.md` exige por ser un
movimiento de inventario.

**Resultado**: R1-R17, 12 tasks, trazabilidad **17/17**. `./init.sh` completo verde sobre el árbol
final (495 archivos, 7191 passed, 0 rojos). Sin dependencias nuevas y sin migración.

**La ficha cambió de tamaño al acotarla**, y ese fue su acierto: nació `frontend` y salió
`fullstack`, porque se verificó en disco que «mostrar el lote asignado» **no era alcanzable desde la
pantalla** —`createProduct` devolvía solo `{ id }`—. Después, en F1.2, se atrapó en vuelo que el
spec decía devolver el **identificador** del lote cuando lo que hay que mostrar es el **valor**:
corregido antes de que `design.md` se escribiera encima.

**Enmienda D10 a R3** (aprobada el 2026-09-17): la obligatoriedad de la fecha de compra se cumple
**solo en la superficie del panel**, no en el esquema —`purchaseDate` es `.nullish()` y la ausencia
se resuelve como «hoy» en el servidor—. Se aceptó a conciencia, por escrito, en vez de resolverse
en silencio dentro de un test, que es como la primera review la encontró.

**Tres vueltas de review, y lo que justifican**: la 2ª encontró **un comentario de producción que
afirmaba lo contrario de lo que hace el código** —que el esquema rechaza la fecha ausente— y que
sobre esa premisa falsa justificaba una decisión de diseño. Se borró. La 3ª aprobó, y el propio
reviewer **retiró un hallazgo suyo** (m5) al comprobarse que los reexportes que daba por muertos
tenían cuatro importadores reales.

**Consolidación**: nace `lib/shared/ui/date-civil.ts` con la única definición de
`formatDateLocalISO`/`parseDateLocalISO`, antes duplicadas. Vive ahí porque es lo único que la regla
de dependencias deja importar desde `components/**`; **no toca el barrel de `data-table`**.

**Lección del arnés, ya cerrada**: el bloqueante B3 lo fundó `docs/conventions.md > Comentarios`,
que ese día vivía **solo en `dev` local sin pushear**. Al empujar `dev` se descubrió que estaba
además **33 commits por detrás** del remoto. Se integró y se empujó (`551a33a`).

Menores declarados que no bloquearon: una cita de ficha en el nombre de un `describe` y una
importación por ruta profunda superviviente en un test.

## QC-88 — listado-de-pedidos-asignados (CERRADA el 2026-09-17, PR #79, merge `b342375`)

**Qué entró**: la pantalla del Operador en `/asignacion`, compuesta desde `asignaciones`, con
`pedidos` aportando solo una lectura de catálogo en lote. **5 consultas constantes por página**, sin
JOIN y sin crecer con filas, responsables ni tamaño de página. `responsible-avatars.tsx` se promovió
a `components/shared/`.

**Resultado**: R1-R40, 18 tasks, trazabilidad **40/40** verificada caso a caso por el reviewer
(veredicto OK, sin bloqueantes). `./init.sh` completo verde sobre el árbol final: **503 archivos,
7289 passed, 0 rojos**. Sin dependencias nuevas, sin tabla, columna ni migración.

**El hueco que más peligro tenía, y cómo se cerró**: reutilizar el caso de uso de responsables de
QC-102 habría dejado la columna **vacía en silencio** para el Operador, porque ese caso de uso exige
`pedidos.consultar` y el Operador no lo tiene. Se reutilizó **el método del puerto**, no el caso de
uso. La autorización quedó como primera línea del cuerpo, antes de validar la entrada y antes de
tocar ningún `deps`, con tests que lo afirman sobre los cinco dobles.

**La ficha cambió el aterrizaje del Operador**, así que puso rojos a propósito varios censos
congelados de otras fichas. Las seis guardias afectadas se **tensaron, nunca se aflojaron**: cada
excepción es por nombre o archivo exacto, con una mutación que demuestra que sigue mordiendo.

**Dos interrupciones que no fueron fallos técnicos**: se agotó la cuota semanal de Opus con trabajo
sin commitear (lo rescató el leader), y la implementación estuvo **12 tasks bloqueada por QC-60**
hasta su merge, que trajo 132 commits y dos migraciones por delante.

**Lección del arnés, la misma que QC-103 y por fin cerrada de raíz**: la limpieza de comentarios
(871 líneas borradas, 217 reescritas sin cita) **no se hizo cuando el reviewer la señaló**, porque
se verificó que la regla no estaba en ninguna rama remota — y era cierto. El diagnóstico de fondo
era el equivocado: la regla **existía, pero vivía solo en la plantilla**. Apareció en la rama al
re-sincronizar con `dev` para resolver el conflicto del PR, y ahí se limpió, en commits solo de
comentarios. Coste de haberlo sabido tarde: un gate completo de más.

**Conflicto de `current.md`, tercera vez**: se resolvió **fusionando los dos lados**, no tomando
uno. Cada lado traía estado que el otro no tenía. La decisión de fondo —que el estado vivo deje de
ser un archivo único que todas las ramas tocan— sigue pendiente en *Deudas*.

**Límite declarado, no escondido**: el E2E del recorrido del Operador existe, pasa typecheck/lint y
sigue el patrón de los E2E verdes del repo, pero **nunca se ejecutó contra Playwright** por drift de
la Postgres local, ajeno a esta rama.

## QC-50 — aislamiento-por-empresa-en-recetas (cerrada el 2026-09-17, PR #81, merge `63befce`)

Cierra el hueco que QC-60 dejó declarado: un pedido podía apuntar a una receta de otra empresa.
`recipes` gana `company_id` y los cinco casos de uso, los cinco métodos del puerto y los catálogos
de productos y unidades pasan a leer y escribir acotados. `recipe_lines` **no** gana columna, a
propósito: cae con su receta. **29/29 tasks, 33/33 requisitos con test, sin dependencias nuevas.**

**El hallazgo que justificó la ronda de acotación**: el único índice de nombre de recetas es
**PARCIAL** (`WHERE deleted_at IS NULL`) y el de presentaciones que QC-49 usó de molde era
**TOTAL**. Copiarlo habría hecho que borrar una receta **no liberara su nombre**, sin un solo test
en rojo. Queda afirmado en tres sitios independientes, los tres comprobados falsables.

**El spec nombraba seis listas cerradas y eran trece.** Las siete que aparecieron al verificar se
tensaron a mano; ninguna se relajó. Tres comparan el diff contra `origin/dev` y **solo muerden
después del commit**, que es como emboscaron al gate de QC-60.

**`SIN_AMBITO_POR_DECISION_APROBADA` murió**: no se dejó vacía, se borró la maquinaria entera por
ser código muerto. Antes había una puerta cerrada; ahora no hay puerta.

**Una enmienda al spec, aprobada por el humano**: R31 pedía probar por E2E un **borrado** cruzado,
que no es ejercitable —el diálogo toma el id del cierre de React y no hay nodo del DOM que
reescribir, a diferencia de QC-49 y QC-60—. Se sustituye por abrir la **URL del detalle** de una
receta ajena, **indistinguible de un id inexistente**: mismo mensaje, mismo enlace. Eso es lo que
prueba que no hay oráculo de existencia. El borrado cruzado queda cerrado en service e integración.
La review la rechazó por esto y **fue su único bloqueante, documental**: la decisión se había
escrito en `design.md` y `tasks.md` y se olvidó en `requirements.md`.

**Lo que más enseña, y no estaba previsto**: al sincronizar con QC-88 el merge **no dio conflicto
textual en producción pero dejó el código sin compilar**. QC-88 estrenó un llamante de
`findRefsIncludingDeleted` mientras esta rama le añadía el ámbito; sin el cambio de firma habría
entrado resolviendo nombres de recetas **sin acotar por empresa y sin un test en rojo**. El test que
cubría esa llamada existía y **miraba solo el primer argumento**: se tensó para exigir los dos.
Además, las dos ramas añadieron **cada una su decimocuarta entrada** a la lista cerrada de specs E2E
que referencian `data-table`; la resolución correcta eran **quince**.

**Verificación**: gate completo verde dos veces (la última, 512 archivos / 7418 tests / 0 rojos),
corrido con la máquina en reposo. E2E verde en Chromium y WebKit. El `down.sql` **se ejecuta
entero** en una transacción con ROLLBACK comparando dos retratos de esquema, en vez de afirmarse
leyendo el archivo: era el eslabón más débil y lo cerró la review.

## QC-63 — ejecutar-receta-operador (CERRADA el 2026-09-17, PR #82, merge `6754a46`)

**Qué entró**: la pantalla con la que el Operador ejecuta la receta del pedido que tiene asignado,
en `/asignacion/<id>`. Cierra la épica que QC-83…QC-88 venían construyendo. Tres casos de uso nuevos
en `asignaciones`, primer consumidor de la conversión entre unidades de QC-76, y `StepReader` de
QC-64 montado por props sin tocar una línea.

**Resultado**: R1-R31, 24 tasks, `./init.sh` completo verde (519 archivos, **7495 passed**, 0 rojos
nuevos) y **los cuatro E2E ejecutados contra Chromium real**, con los estados leídos de la base.
Sin dependencias, tabla, columna ni migración.

**El Operador no gana ningún permiso, y esa fue la decisión de fondo.** La semilla de 2026-09-08
cortaba la pantalla con `asignaciones.consultar` **y** `asignaciones.modificar`, pero el Operador
nace sin el segundo: tal cual estaba escrito, se habría quedado fuera de su propia pantalla. Y el
único camino que movía un pedido exigía `pedidos.modificar`. Se cerró con un caso de uso propio que
**pregunta al contrato de `pedidos`** si la transición es legal, en vez de reimplementar la matriz.

**Lo que la reacotación salvó**: la ficha llevaba nueve días acotada y sus tres dependencias
cerraron el mismo día que se retomó. Reacotarla contra el disco —en vez de sembrar encima— destapó
esa contradicción del permiso y el bloqueo de «pedido ya tomado» que QC-88 había remitido aquí: como
abrir la pantalla pone el pedido `EN_CURSO`, **el Operador que recargara se encontraba su propio
trabajo bloqueado**. Se permitió la reentrada y la guardia de QC-88 se enmendó tensándola.

**El hallazgo que justifica la fase de revisión entera**: la primera vuelta **rechazó** al descubrir
que la confirmación de «pedido entregado» era **código muerto** —la acción termina siempre en
`redirect()`, que lanza, así que nunca devolvía el estado de éxito— y que **su test solo pasaba
porque doblaba la acción con un valor que la acción real no emite**. Era la única fila de la
trazabilidad que camuflaba una ausencia como test positivo, y el E2E del leader pasaba por al lado.
La segunda vuelta aprobó tras **cinco mutaciones propias, las cinco rojas**.

**Dos decisiones humanas**: el factor de escala sale **degradado** —se verificó que la receta no
guarda su rendimiento, y de ahí **nace QC-120**— y el aviso de entrega se muestra **en la lista al
volver**, porque la forma que describía el diseño era inalcanzable.

**Ocho censos cerrados de otras fichas crecieron, ninguno aflojado**: todos por nombre exacto, con
nota fechada y probados por mutación. **Una guardia se retiró** —`guard-conversion-sin-consumidores`—
porque su propia cabecera prescribía la retirada en la ficha que estrenara la conversión; commit
propio, y su conducta sigue cubierta por otros dos tests.

**Tres lecciones del arnés**: el `spec_author` corrió **sin Bash** y entregó el spec sin commitear,
que tuvo que verificar y commitear el leader; el worktree se montó **sin `.env`**, lo que mató la
integración con un error que no nombra su causa; y el leader **rompió el `requirements.md`** al
cerrar una pregunta abierta —su corte enganchó un fragmento de texto en vez del encabezado y
reinyectó los 31 requisitos—, reparado en `3f75b9b`.

**Deuda declarada**: seis hallazgos menores, ninguno bloqueante —el más vivo, que el número del
aviso no se relee del pedido, así que es falsificable escribiendo el parámetro a mano, sin XSS ni
fuga entre empresas—. Y dos rojos de `ciclo-de-vida-de-la-base.int.test.ts` **descartados como flake
de máquina y NO metidos al baseline**: la rama no toca ese archivo y en aislamiento pasan los cinco.

## QC-91 — existencia-por-lote (cerrada el 2026-09-17)

**PR #83**, merge `b579707`. Zona `fullstack`, `complexity: high`. Épica *Inventario*.

`products.stock` desaparece: la existencia pasa a ser la **suma de los lotes**, calculada al
consultar y **una por unidad** («10 kg · 20 L»), sin conversión. Toca inventario, recetas y pedidos.

**Resultado**: R1-R23, 13 tasks, trazabilidad **23/23** verificada abriendo cada `archivo:línea`.
`./init.sh` completo verde sobre la rama sincronizada (521 archivos, 7553 passed, 0 rojos). Trae el
**E2E que QC-81 difirió expresamente** aquí: 14 passed en chromium y webkit. Sin dependencias nuevas.

**La lección de la ficha son las guardias de censo.** Tropezó **tres veces** con el patrón que el
board tiene fichado como **QC-99** —una guardia que afirma un estado que la ficha siguiente está
autorizada a cambiar— y las tres se resolvieron sin propagarlo: la de `recetas-ui` se **acotó a su
propia rama** (`dfe1a9a`, precedente `8bf3dd5`), probada por mutación y reproducida por el reviewer;
de la de QC-81 se **borró el caso derogado** (`67363de`) en vez de invertirlo, porque invertirlo
habría creado la misma trampa a QC-121; y **el censo que `tasks.md` pedía para T10 no se escribió**,
por el mismo motivo. Esa última fue una desviación del spec, firmada por el implementer y validada
por el reviewer midiendo que no dejaba agujero: lo que el censo habría cubierto de más ya lo cierra
el typecheck.

**Una decisión de producto nació a mitad y NO se metió aquí**: «el nombre se puede duplicar, pero si
las unidades no concuerdan es otro ítem», que devolverá `products.stock` como columna calculada.
Salió **QC-121**, bloqueada por esta. Se partió en dos en vez de reabrir tres decisiones con 9 de 13
tasks hechas, y lo construido se reutiliza entero: cuando las unidades no puedan mezclarse,
`sumStockByUnit` devolverá siempre un solo valor.

**F2.3 fue el paso caro**: 104 commits de `dev` (QC-50 y QC-63). Dos conflictos, ninguno ambiguo, y
**cuatro roturas que git no marcó** —dobles con la forma vieja de `ProductRef`, algunos en un módulo
llegado de `dev` que nunca vio el cambio—. El mapa de trazabilidad se re-midió tras el merge: seis
`archivo:línea` se habían desplazado y habrían mandado a la review a líneas equivocadas.

**Un rojo de gate diagnosticado y descartado**: `product-batch-lot.int.test.ts` murió con
`Transaction API error: Unable to start a transaction in the given time` —pool agotado, no
aserción—; aislado pasó 3/3 y en la repetición del gate pasó. Saturación, con otras dos sesiones
trabajando en la misma máquina.

## QC-59 — aislamiento-por-empresa-en-proveedores (cerrada el 2026-09-17, PR #84, merge `b8e3d5e`)

**Cierra el arco multiempresa**: proveedores era el último módulo sin acotar —inventario QC-49,
unidades QC-76, pedidos QC-60, recetas QC-50— y con él **se desbloquea QC-61**. La viñeta de deuda
de `docs/architecture.md` que los enumeraba **se borró entera**, no se dejó vacía.
**38/38 tasks, 39/39 requisitos con test, sin dependencias nuevas.**

**La decisión de fondo, y es la que la distingue de sus tres hermanas**: QC-52 había cortado a
propósito el puerto de `proveedores` hacia `inventario`, así que la frontera de la presentación
**la pone la base**, con dos claves foráneas compuestas —`(empresa, presentación)` y
`(empresa, proveedor)`— en vez de una consulta. Cero acoplamiento nuevo, verificado por grep.
Eso obliga a que **la línea gane columna de empresa**, apartándose de QC-50: lejos de traer el
riesgo que allí se evitaba —dos datos que se contradicen—, la segunda clave **lo elimina**.
Cuesta **dos índices únicos redundantes** `(company_id, id)`, uno en una tabla de `inventario`;
sin ellos Postgres rechaza la FK con `42830`, comprobado quitándolos en una transacción.

**La unidad no se puede cerrar por ahí** —una FK compuesta no sabe decir «la de sistema o la mía»—,
así que se valida en el service consumiendo un catálogo que **ya llegó acotado** desde QC-50.

**La trampa heredada volvió a estar ahí**: `suppliers_name_unique` es **PARCIAL**, como el de
recetas. Afirmado desde tres ángulos independientes y los tres comprobados falsables.

**Ninguna lista se aflojó en 23 anclajes.** El spec anticipaba catorce; siete no estaban previstos
y **dos ni siquiera existían como listas cerradas** —eran `toContain` sueltos— y quedaron como
censos `toEqual`. Una sola aserción eliminada en todo el diff, sustituida por otra más estricta.

**Una enmienda al diseño, ratificada por el humano**: `dev` había dado a las otras tres migraciones
de empresa una salida temprana sobre base vacía (`38252c5`) y esta se quedó fuera **por accidente
de calendario**. Sin ella, sobre una base vacía la migración abortaba: **ningún test de integración
corría y no se podía levantar un entorno nuevo**. Se añadió el mismo `RETURN` verbatim, se
enmendaron `design.md > 7.2` y `> 7.3` con nota fechada, y **se escribió el test que faltaba** —el
hueco que la review señaló—: la guardia de empresa unívoca sigue abortando en cuanto hay una fila.

**Lo que más enseña, y no es del código**: el gate completo cazó una lista cerrada que **cinco
tandas y 22 anclajes no vieron**, porque su valor correcto **solo era conocible después del merge**
—el E2E no existía cuando se tensaron las listas, y `dev` movió el número por su cuenta—. Y dos
subagentes se plantaron con razón: uno **se negó a seguir T15** porque habría aflojado una lista, y
otro **revirtió sus propias citas de ficha** antes de commitear.

**Verificación**: gate completo verde (530 archivos, 7769 tests, 0 rojos) con la máquina en reposo.
E2E verde en Chromium y WebKit —el diálogo de borrado **sí** era ejercitable, y la sustitución del
id se repite en la fase de **captura** del `submit`, porque React reescribe el `defaultValue` y sin
eso el verde sería falso—. Review aprobada con **0 bloqueantes**.

## QC-108 — lectura-de-pdf-con-gemini (cerrada el 2026-09-18, PR #87, merge `1a95e9a`)

**Primera integración con una IA del repo**, y la que desbloquea la épica *Documentos e IA*: de
QC-108 colgaban en cadena QC-109, QC-111, QC-110 y QC-107. Lee un PDF con Gemini Flash detrás de un
puerto, con prompt personalizado y dos modos —el PDF tal cual o sus páginas ya convertidas a
imagen—, **reutilizando el `PdfConverter` que QC-106 dejó montado**. Devuelve el texto tal cual lo
escribió la IA. **14/14 tasks, 27/27 requisitos con test, una dependencia nueva aprobada.**

**Es una capacidad interna a propósito**: sin pantalla, sin ruta y sin Server Action. La invocará
por dentro el trabajo de la cola de QC-111. De ahí que el E2E quede diferido con motivo —no añade
recorrido navegable— y que el permiso lo siga cortando quien sube el PDF, donde QC-106 ya lo valida.

**Las seis decisiones se cerraron ANTES del spec** con `/afinar-feature`, y la ficha lo pedía por
escrito: plazo de 60 s sin reintentos aquí —son de QC-111, y dos capas reintentando multiplican el
gasto en silencio—; código nuevo `ai_unavailable`; retorno en texto plano; una sola clave del
despliegue; capacidad interna; y **el nombre del modelo en una variable de entorno obligatoria, sin
respaldo en el código**, porque un id escrito a mano deja de existir sin avisar.

**El bloqueante que enseña, y lo encontró el reviewer**: un fallo de NUESTRO convertidor salía
etiquetado como corte del proveedor. `conDiagnostico` relanzaba `Error` plano, así que un PDF
corrupto acababa con `code: 'ai_unavailable'` —y un comentario de producción afirmaba lo contrario—.
Tocaba **R10** de frente: la pantalla de QC-107 habría culpado a Google de un bug propio. Se arregló
en la causa, repartiendo el `code` por operación, **sin añadir ningún código nuevo**. El reviewer no
se fió de los tests: **mutó el código** y comprobó que los tres casos nuevos caen.

**El segundo bloqueante lo causó el leader**, y queda escrito para que no se repita: su encargo
mandaba escribir la enmienda «con el mismo formato que la sexta (QC-81)», y esa línea cita la ficha.
`docs/conventions.md > Comentarios` prohíbe citar fichas en producción **y además** dice «nunca se
imita el estilo de alrededor», que es exactamente la regla que evita este contagio. Peor: un test
nuevo clavaba las citas con dos `toContain`, convirtiendo la infracción en obligación.

**El punto ciego se cerró donde nació**: el reviewer encontró que el `code` del tope de páginas no
lo fijaba ningún test —cambió su constructor y 19 archivos siguieron verdes—, la misma forma del
agujero que dejó pasar el bloqueante 1. Se cerró con mutación de por medio antes del PR.

**Límite confirmado leyendo la API real, no supuesto**: el docblock de `abortSignal`
(`genai.d.ts:5900-5905`) dice que abortar es **solo-cliente**, no cancela en el servicio y **la
llamada se cobra igual**. Por eso el plazo de 60 s lo impone el dominio con `Promise.race` y un
`TimeoutRunner` inyectable, y el de la librería va **además**, no en lugar de. El `design.md` lo
había declarado DESCONOCIDO por escrito —se escribió sin red y sin `node_modules`— y se cerró
cuando el paquete estuvo en disco, con cita de archivo y línea.

**Dependencia**: `@google/genai` 2.23.0, cuatro checks limpios, **aislada en un solo archivo** detrás
del puerto `AiReader`. La guardia de dependencias es **bidireccional**: una fila sin paquete
instalado es un fantasma que deja el gate rojo igual que un paquete sin fila, así que fila e
instalación aterrizan juntas.

**El conflicto con QC-68 se resolvió midiendo, no prometiendo.** `design.md > 7` solo ofrecía
esperar, dejar el cableado fuera o mergear a mano, porque razonaba **sobre el archivo**. El leader
cruzó los dos diffs: QC-68 mete 2 líneas en el bloque de `recetas` (`:182`, `:882`) y QC-108 escribe
al final del bloque `documentos` (`:1083-1155`). **Sin solape de hunks**, así que se siguió entero.
El resultado fue `13 0` en `git diff --numstat`: trece añadidas, cero borradas.

**Tres rojos, tres especies distintas, y conviene no confundirlas.** `product-page` y
`ciclo-de-vida-de-la-base` fueron **falsos, por carga** —868 s y 489 s frente a ~300 s, verdes en
aislamiento— y **ninguno entró al baseline**. Los censos de dependencias de QC-75 y de unidades son
**ajenos y conocidos**, ya en el baseline desde que `resend` los rompió en QC-79; se amplió el motivo
de la entrada de QC-75 para nombrar el segundo caso. Y `order-form` era **real y ajeno, nacido ese
mismo día**: el PR #85 cambió la pantalla a dos decimales, adaptó los casos vecinos y se dejó uno
esperando `-0.201`. Se arregló aquí por decisión del humano, en commit propio y declarado en el PR,
en vez de mandarlo al baseline —que habría apagado los 33 casos del archivo—.

**Un conflicto de merge que no era de código**: GitHub marcó el PR `CONFLICTING` y el único archivo
en disputa era `progress/current.md`, chocando **entero** porque un lado estaba en CRLF y el otro en
LF. Se resolvió normalizando los tres lados y rehaciendo el merge a tres bandas; quedó un solo
conflicto real, puramente aditivo, y se conservaron las dos filas.

**Verificación**: gate completo verde (`== init OK ==`), **7880 tests pasan**, 2 rojos y los dos en
el baseline. Dos vueltas de reviewer: rechazo con 2 bloqueantes, aprobación en la segunda.

**Deuda declarada, con dueño**: R24 no queda limpio —cuatro helpers privados en español copiados de
`convert-pdf.ts`, ya en `dev`; renombrar solo aquí dejaría el módulo hablando dos idiomas—; el E2E
va a QC-107; y tres cabeceras que el reviewer mantiene que no pasan la regla de longitud.

## QC-68 — busqueda-y-total-en-el-listado-de-pedidos (cerrada el 2026-09-18, PR #86, merge `e68a66a`)

El listado de pedidos busca por nombre de receta. `orders` no tiene columna de nombre, así que el
término se traduce a ids de receta **antes** de tocar el repositorio y esa lista acota el `where`:
sin JOIN y con consultas constantes —3 por página sin búsqueda, 4 con ella—, tenga la página 1 fila
o 25. Se descartó denormalizar el nombre en `orders`. La búsqueda encuentra también los pedidos de
recetas dadas de baja, porque la lista ya muestra ese nombre; de ahí el índice GIN de trigramas
**sin `WHERE`** (el de QC-57 es parcial y no servía).

**La ficha se partió al escribir el spec**: afirmaba que la consulta devuelve cantidad y precio por
separado, y el `spec_author` verificó que `orders` tiene un solo decimal —el precio lo borró
QC-35bis—. El total no tenía con qué multiplicarse. Por decisión del humano nació **QC-123** con el
precio, **QC-122** con la caja de búsqueda en pantalla y su E2E de importes.

**El hallazgo de la ficha: el censo diecinueve era una guardia de seguridad.** Los dieciocho
anteriores eran comentarios y conteos que afirmaban que pedidos no busca. El diecinueve fue
`tests/unit/pedidos/company-isolation-service.test.ts` (QC-60 R16), que exige `{ companyId }` como
**último argumento** de los seis métodos del puerto y que el `recipeIds` nuevo desplazaba. Además
`order-repository.ts` lo documenta por escrito y una segunda guardia lo vigila. Se cerró
**reordenando la firma a `listAlive(query, recipeIds, scope)`** —enmienda fechada al spec, aprobada
por el humano— en vez de tensar la guardia: las dos quedaron intactas. Se descartaron
explícitamente «tensar el aserto» y «excepción acotada», por aflojar una guardia ajena.

**Dos requisitos estaban mal dados por cubiertos, y esa es la lección transferible.** R6 se
demostraba **«por partes»**: tres tests cubrían cada uno un trozo del enunciado, el mapa no dejaba
ninguna casilla vacía y **nadie ejercitaba el requisito entero**. R13 se mapeaba a una comprobación
a mano, que no es un test. Los dos ganaron casos propios. El caso de R6 sobre el pedido borrado deja
la receta **viva a propósito**, que es lo que lo distingue de R4 y lo que hace que pruebe la
conjunción; el del pedido ajeno comprueba que la fila **existe** antes de afirmar el cero.

**El conteo de índices del spec estaba caducado**: pedía 34→35 y en disco eran 33→34, porque cayeron
dos índices con QC-91 y QC-35bis. Se contó en disco en vez de copiar la cifra.

**Dos menores de la review eran el mismo defecto que la ficha perseguía, cometido dentro de ella**:
el docblock de `listAlive` seguía diciendo «un solo parámetro» —desmentido por las cuatro líneas que
la propia rama le añadió debajo— y una frase repetida en cuatro sitios prometía que el test de
integración demuestra el número de consultas SQL, cuando **ese test no existe**. Se quitó la frase
en vez de inventar el test. De ahí la regla que quedó escrita: **añadir prosa a un bloque obliga a
releer el bloque entero**, y una nota que promete un test debe nombrarlo con archivo y caso.

**Verificación**: gate rápido verde al cierre (173 archivos, 2746 tests). El gate completo pasó por
dos rojos ajenos, ninguno de la rama y los dos con ficha propia en vez de baseline —listarlos habría
apagado 60 casos—: **QC-126** (intermitente de jsdom en la tabla de usuarios, `Not implemented:
navigation to another Document`, que **no** es la especie de QC-58 y podría ser un defecto real) y
**QC-127** (el caso que el PR #85 dejó sin actualizar), que **murió sola** al sincronizar, arreglada
en QC-108.

**Tres deudas del arnés, para `/afinar-regla`**: (1) la cautela sobre no correr integración estaba
**generalizada de más** y frenó la ficha toda la jornada —lo inseguro en paralelo es
`db:migrate:create`, no el runner, que corre contra una copia efímera en segundos—; (2)
«demostrado por partes» debería contar como **pendiente** para el reviewer; (3) la bitácora de una
ficha puede quedar **partida entre el árbol principal y su worktree**, y aquí chocó en tres merges
seguidos.

## QC-125 — espera-minima-por-paso (cerrada el 2026-09-18, PR #88, merge `530fedf1`)

Cada paso de la ejecucion de receta del operario exige **5 s** antes de dejar avanzar, con cuenta
regresiva visible y el boton deshabilitado mientras corre. **R1–R22 y T1–T8**, todos mapeados.
Solo en la pantalla de ejecucion: el lector de pasos es compartido con la vista previa del
formulario de recetas, y ahi **no** hay espera.

**No hubo `/afinar-feature`, y estuvo bien no haberlo**: el humano cerro por escrito las cuatro
decisiones —comenzar es abrir la pantalla, siempre 5 s aunque se vuelva con Anterior, finalizar
tambien espera, y la espera se **suma** al bloqueo de elementos marcados de QC-64— dentro de la
propia `description` antes de crear la ficha. La acotacion existe para que no falte eso, no para
repetirlo.

**Absorbio trabajo que existia sin ficha**: `CountdownTimer` (`components/shared/countdown-timer.tsx`)
estaba construido en `feat/cronometro-shared`, una rama sin tarjeta, y entro aqui cherry-pickeado
(`42396946`). Es la forma barata de cerrar ese hueco: el codigo huerfano se adopta en la ficha que
lo necesita en vez de quedarse esperando una propia.

**El test de una ficha anterior se puso rojo por hacer justo lo que esta pedia.** El caso «R18 — el
asistente heredado no aparece en el diff» de QC-63 prohibia tocar `components/shared/step-reader/**`
entero. Se tenso a **lista cerrada** con solo `step-reader.tsx` (T1), ratificado por el humano al
aprobar el spec. La leccion es de la especie de las guardias: una guardia escrita por glob ancho
caduca en cuanto alguien tiene un motivo legitimo para entrar; la que nombra archivos sobrevive.

**Una vuelta de reviewer RECHAZADA, y por el hallazgo correcto.** H1: a R8 le faltaba el caso de
pulsar Anterior **mientras corre** la cuenta del paso 2, que es el unico que atrapa el mutante de
guardar el indice cumplido en un **escalar** en vez de por paso. Se anadio en `2ec1e6b7` y el
reviewer lo verifico rojo/verde. Segunda vuelta OK (`65b0f83b`).

**Verificacion, con su agujero dicho por escrito**: E2E **8/8 verde** en Chromium y WebKit tras
instalar los navegadores con autorizacion humana —cerro H3, que el reviewer habia dejado abierto
justamente por no poder correrlo—. Pero **el PR se abrio con el gate completo en ROJO, por
autorizacion expresa del humano**: `validate-features` cortaba por QC-68 y QC-92, `in_progress` en
`dev` sin su `specs/`, ajenos a esta rama. Los pasos del gate corridos a mano por el reviewer salen
verdes. **La suite completa no se corrio sobre esta rama**, y eso queda dicho aqui en vez de
figurar como verde.

**Deuda del arnes que esto deja a la vista**: `validate-features` bloquea el gate de una rama por el
estado de fichas ajenas en `dev`. Es la tercera vez que una feature paga el peaje de otra. Candidata
a `/afinar-regla`.

## QC-61 — guardia-empresa-en-esquema (cerrada el 2026-09-18, PR #90, merge `05a0615`)

Una guardia que lee `db/schema.prisma` y se pone roja si una tabla de negocio nace sin columna de
empresa. **R1–R16 y T1–T9**, cada requisito mapeado a un `it` concreto. Sin migracion, sin tabla
nueva, sin E2E (no pedido, D7) y **sin una sola dependencia**: `git diff origin/dev -- package.json
pnpm-lock.yaml` da 0 lineas.

**La ficha estaba vieja y medirla fue la mitad del trabajo.** Daba por exentas `users`, `roles` y
`document_types`, pero **`users` ya llevaba empresa** desde hacia fichas. En disco habia **ocho**
modelos sin `companyId` —`document_types`, `roles`, `permissions`, `role_permissions`, `companies`,
`credential_setup_tokens`, `revoked_sessions` y `recipe_lines`— y **ninguno pendiente de aislar**:
`recipe_lines` **hereda** la empresa de su cabecera por decision de QC-50, y `units` la lleva
anulable a proposito por QC-76. O sea que la lista de «pendientes, que solo encoge» que la ficha
pedia **habria nacido vacia**, y faltaba una tercera clase que nadie habia nombrado: **las hijas que
heredan**. Todo esto salio de contar en el esquema antes de escribir el spec, no de creerle a la
description.

**La lista vivia copiada en cuatro sitios y tres estaban desincronizados.** Al aprobar, el humano
eligio A, B y C: corregir tambien `CHECKPOINTS.md` y `.claude/agents/reviewer.md` —que repetian la
lista vieja—, **que la guardia tambien de rojo cuando a `EXENTAS` le SOBRA una entrada** (eso entro
como **R16**, y es lo que impide que la lista se pudra en la direccion contraria), y atar el bullet
de `docs/architecture.md` al gate para que R14 fuera testeable. Los dos documentos derivados ya no
enumeran: **remiten a `architecture.md > Dominio` y a la guardia**. Una lista copiada en cuatro
sitios se desincroniza; una copiada en uno y referida en tres, no.

**Review aprobada a la primera: 0 bloqueantes, 0 mayores, 5 menores.** La guardia muerde en todas
sus ramas —**11 mutaciones locales, 11 rojos**, restauradas—. De los cinco menores, dos son limites
del lector declarados y no verdes falsos (`@map(name: "…")` de Prisma, que falla **hacia el rojo**;
y un campo de relacion llamado literalmente `company_id`), uno es un **defecto del mapa, no del
codigo** —el `it` de R12 no contiene el rojo que promete: lo ponen R1:187, R10 y R16— y el quinto es
entorno.

**Verificacion, con lo que no salio verde dicho por escrito**: `test:guardias` **45/45 archivos,
555 passed / 9 skipped**, exit 0. El `./init.sh` completo **NO** paso, y el PR se abrio asi por
decision humana, con las tres causas separadas y ninguna de la rama: `validate-features` cortando
por el spec de QC-92 (otra maquina), **11 de integracion por Postgres 18.6 local** contra el 17 que
se busca (lo arreglo el PR #89) y `user-table.test.tsx` intermitente, verde 3/3 a solas. El reviewer
lo midio en vez de suponerlo: los 36 archivos rojos fuera del baseline son **identicos por diff** a
los del padre sin los commits de la rama, que no toca ni un archivo de produccion.

**Dos cosas para el que venga.** La primera corrida de `test:guardias` dio **tres rojos por timeout**
en guardias que recorren el arbol, verdes a solas y en la segunda corrida: flakiness de E/S de
OneDrive, y conviene recordarlo antes de creerle a un `--rapido` rojo. La segunda: `29145768` pasa
QC-59 a `done` **dentro de la rama de QC-61**. Es estado del arnes, no de la feature; va en commit
propio y estaba justificado, pero es la costura por la que `feature_list.json` choca en cada merge.


### Segunda redaccion, de la otra sesion (conservada al reconciliar el 2026-09-18)

> Las dos sesiones resumieron QC-61 por separado y **no dicen lo mismo**: esta aporta el nombre
> del archivo de la guardia, el rastro de `localStorage` / `--no-experimental-webstorage` y la
> relacion con QC-126 y QC-91, que la de arriba no trae. Se conservan las dos en vez de elegir.

**Qué quedó**: `tests/guards/guard-empresa-en-esquema.test.ts` lee `db/schema.prisma` como texto y da
rojo si un modelo no declara `company_id` y su tabla no está en la lista cerrada de **ocho exentas**
(`document_types`, `roles`, `permissions`, `role_permissions`, `companies`, `credential_setup_tokens`,
`revoked_sessions`, `recipe_lines`). Basta con que la columna exista. También da rojo si a la lista le
**sobra** una entrada y si el bullet de `docs/architecture.md` no dice lo mismo. La lista vieja se
corrigió en `architecture.md`, `CHECKPOINTS.md` y `.claude/agents/reviewer.md`.
**La ficha llegó vieja** (escrita el 2026-09-04, antes del arco multiempresa): daba como exenta a
`users`, que ya lleva empresa, y pedía una lista de «pendientes de aislar» que habría nacido vacía.
Se midió en disco y se corrigió el board **antes** de sembrar. El leader contó «siete» modelos sin
empresa donde había **ocho**: el mismo tipo de error de conteo que en QC-106, QC-91 y QC-59.
**Verificación**: guardia 15/15, también sobre el `dev` ya mergeado; review aprobada con 0/0/5 y 19
mutaciones que dieron rojo donde tocaba. El gate completo **no salió verde** y el PR lo declaró, por
decisión humana: el validador por el spec de QC-92 (en otra máquina), 11 de integración por la base
local en **Postgres 18.6** y un intermitente de `user-table.test.tsx` (ya tiene ficha: QC-126).
**Lo que destapó, fuera de la ficha**: 24 archivos de UI en rojo por el `localStorage` nativo de
Node 26, arreglado en el PR #89 (`--no-experimental-webstorage` en el proyecto `ui`), y la decisión
humana de que **Postgres 17 es la versión objetivo**, escrita en `docs/verification.md`. Queda que
el humano monte un Postgres 17 local.
## QC-92 — ajuste-de-inventario (cerrada el 2026-09-18, PR #91, merge `f91ea75`)

Corregir la existencia de un **lote** registrando un **movimiento** que suma o resta, en vez de
sobrescribir un numero a ciegas. Nace `inventory_movements`, el alta de lote pasa a asentar tambien,
y el producto gana un panel que lista sus lotes con el historial de cada uno. **20 tasks**, R1-R37,
trazabilidad **34/34**, E2E **6/6** en Chromium y WebKit.

**EL CENSO ACHICO LA FICHA ANTES DE EMPEZAR**: en produccion habia **exactamente DOS** escrituras de
`product_batches`, las dos `create` y las dos en `product-prisma.ts`. Ni un `update` ni SQL crudo.
Por eso fueron 18 tasks y no cuarenta.

**El review RECHAZO en la primera vuelta, y su bloqueante era real**: faltaba el **rechazo cruzado
por empresa contra Postgres** para los tres metodos nuevos. El camino de **escritura**
`update({ where: { id, companyId } })` no tenia prueba contra la base: si ese filtro no estuviera, un
ajuste habria escrito en el lote de otra empresa. Se cerro con **seis casos A/B** con control
positivo, y el reviewer los valido **mutando la produccion**, no el test.

**LA LECCION QUE HAY QUE LLEVARSE, y esta medida**: la ficha **habia predicho ese agujero y no lo
persiguio**. La bitacora de la tanda 3 escribio que «quien lo demuestra de verdad es el test de
integracion de T15», y T15 cuadra el libro **con una sola empresa**. Nadie volvio sobre ello, y el
mapa de trazabilidad presentaba cinco casos de unidad **como si zanjaran R18** —con Prisma mockeado,
que prueba que el codigo pasa la empresa, no que Postgres la honre—. Por eso el agujero sobrevivio a
T17. **Una prediccion correcta que no se persigue vale lo mismo que no haberla hecho.**

**OCHO archivos de guardia heredados tocados**, cada uno con aprobacion humana, nota fechada y prueba
por mutacion; el reviewer los revisó **como bloque** y verifico que **ningun detector se toco**:

- La prohibicion de listar lotes (**QC-81 R32** y **QC-90 R30**) se **DEROGA**, no se acota por rama:
  R30 decia en su propio mensaje que listar lotes «NO tiene ficha: si hace falta, se pide una», y
  QC-92 es esa ficha. Acotar por rama habria dejado la guardia roja otra vez al mergear y habria
  escrito una afirmacion falsa en el archivo. **Editar y borrar siguen prohibidos**, probado por
  mutacion.
- La guardia de la ruta (**QC-22**) se **RETENSA**: la premisa seguia en pie —la pantalla no debe
  decidir autorizacion— pero **preguntar si se pinta un control no es decidir autorizacion**, y el
  repo ya lo habia distinguido en `order-list-section.tsx`. Ademas **gana marca positiva**: borrar el
  `requirePermission` de la primera linea del caso de uso **la pone roja**; antes no. El repo queda
  mejor protegido que `dev`.
- Aparte, **dos altas de censo** (`E2E_ESPERADOS` y la lista de specs de catalogo), que **NO son
  enmiendas**: solo registran el E2E nuevo en listas cuyo punto de extension documentado es darse de
  alta. Diff puramente aditivo.

**ENMIENDA A D5, pedida por el humano ya con el PR abierto**: `kind` pasa a
`enum InventoryMovementKind { opening, adjustment }` y `reason` gana un **CHECK** con los cuatro
motivos. **No es compatible con D5 y se escribio como enmienda**: D5 eligio constante + zod + `TEXT`
para que el catalogo creciera **sin migrar**, y con el CHECK anadir un motivo **cuesta migracion**.
**R9 se reescribio**, porque afirmaba «NO DEBE requerir migracion alguna». El enum lleva **solo** los
dos valores que existen: `consumption` habria dado la falsa impresion de que el consumo por lote esta
resuelto, y sigue siendo **pregunta abierta del dominio sin ficha**.

**La lista de motivos quedo en DOS sitios, asi que se cerro con guardia**:
`guard-motivos-de-ajuste.test.ts` exige **igualdad exacta** entre el CHECK de la migracion en disco y
`MOVEMENT_REASONS`. Va en `tests/guards/` **a proposito** —se demostro que ahi corre y en
`tests/unit/` no habria corrido—. De paso se caza **una tercera copia a mano** de la lista en el test
de integracion, con un comentario que **prometia** sincronia y nada que la comprobara: con un quinto
motivo habria seguido probando cuatro y diciendo verde.

**Verificacion**: suite completa **558 archivos, 8126 passed, 0 fallos**; E2E re-corrido contra la
base ya migrada, **3/3 Chromium y 3/3 WebKit**, con la base recreada entre motores. **`./init.sh`
NO llego a correr los tests**: cae antes en `validate-features` por `QC-82`, que esta `spec_ready`
**sin spec en disco tambien en `dev`** —medido corriendo el validador con el `feature_list.json` de
`dev`—. No es de esta rama.

**Tres deudas quedan vivas y con ficha**: **QC-127** (el rojo de `dev` por el PR #85 cruzado con R14
de QC-91, que aparecio al sincronizar), **QC-126** (el flake de jsdom, medido tres veces) y **QC-99**
(la familia de censos, que mordio a esta ficha ocho veces). **Sin ficha todavia**: que
`./init.sh --rapido` **no pueda ver** un censo que vive en `tests/unit/` y lee `.prisma` como texto
—tres tandas cerraron «en verde» con rojo dentro—, y la **contradiccion R26 ↔ `conventions`**: uno
exige que la nota diga que ficha cambio la guardia, el otro prohibe citar la ficha.

**Para el que venga**: `guard-identificador-de-request.test.ts` lleva **dos listas cerradas
independientes** y esta ficha **las rompio las dos**, en momentos distintos y por motivos que no
tienen nada que ver entre si ni con el identificador de peticion. Choco **cuatro veces** al mergear.
Es el mejor ejemplar vivo de lo que QC-99 persigue.

## QC-109 — procesamiento-de-pdf-por-estrategia (cerrada el 2026-09-18, PR #92, merge `a2d6fa6`)

Procesa un PDF según una estrategia de un enum cerrado: `catalogo` lo lee **como imagen**, `formula`
**como texto**. Cada una aporta su prompt y las dos llaman a la lectura con IA que QC-108 dejó
publicada; devuelve el texto tal cual y registra un resumen. **R1–R17 y T0–T11**, todos mapeados.

**Es la raíz de una cadena, y por eso se eligió.** El humano pidió arrancar **QC-107** y estaba
bloqueada: depende de QC-111, que depende de ésta. Se le ofrecieron tres salidas —solo Fase 1 de
QC-107, atacar la raíz, o levantar la dependencia y recortar alcance— y eligió la raíz. Orden que
queda: **QC-109 → QC-111 → QC-107**.

**LA FICHA SE CONTRADECÍA CON EL CÓDIGO, y salió al acotar, antes de escribir una línea.** Mandaba
crear los archivos de prompt «con el CONTENIDO VACIO», pero QC-108 había cerrado que un prompt en
blanco se rechaza sin llamar al proveedor, y su `ai-read-input.ts:19` lo hace cumplir con
`z.string().trim().min(1)`: **las dos estrategias nacían incapaces de ejecutarse**. Se resolvió con
texto provisional que sí funciona, y los definitivos nacieron como **QC-129** — trabajo que hasta
entonces no tenía dueño, porque «el texto se escribe más adelante» no era de nadie.

**Los prompts van en `.json` y eso disuelve un roce en vez de excepcionarlo.** El diseño proponía
`.ts`, que era la opción que el humano había descartado al acotar; el motivo técnico del
`spec_author` era correcto —el repo no tiene `?raw` ni loader— pero no lo dijo, lo presentó como si
cumpliera la decisión. La salida que nadie había mirado: `resolveJsonModule` ya estaba activo. Efecto
secundario: la marca de provisional deja de ser un comentario que cita una ficha —prohibido por
`docs/conventions.md`— y pasa a ser un **campo de datos**, así que la excepción sobra.

**Una enmienda al spec, aprobada en F2.1**: la entrada con **estrategia inválida** pasa a registrarse,
con el modo vacío. Antes se iba sin dejar rastro y no había ningún modo que poner sin inventarlo. El
motivo pesa más que el caso: **QC-111 leerá la estrategia de la base de datos**, así que un valor
inválido puede llegar de verdad en ejecución y no solo por un error que TypeScript frene en el borde.

**Trampa evitada**: «leer como texto» **no** es `PdfConverter.extractText`. Ese método existe en el
puerto pero `readPdfWithAi` no lo usa. El mapeo (`catalogo`→`images`, `formula`→`pdf`) se verificó en
el código, no por el nombre.

**Verificación**: review con **0 bloqueantes y 6 menores**, con la trazabilidad comprobada uno a uno
y **tres mutaciones propias del reviewer** —invertir el mapa, meter `trim()` al texto, suprimir el
registro del rechazo— que dieron 3, 3 y 2 rojos. Ningún requisito quedó «demostrado por partes», que
era el encargo heredado de QC-68. Tres menores se cerraron **sin tocar una línea de producción** y
uno era del leader.

**T11 se cerró declarando una salvedad, no maquillándola**: `./init.sh` completo **no llegó a mirar
la rama** porque `validate-features.mjs` corta en su bloque 0 con `faltan specs para features sdd en
vuelo: QC-82` —deuda de otra sesión—, y eso ocurre **antes de typecheck**. Se corrió a mano lo que el
gate no alcanzó: typecheck y lint limpios y **152 archivos / 2373 tests en verde**. Excepción a la
regla 5 autorizada por el humano con las tres salidas a la vista, y declarada en el PR.

**Deuda del arnés que dejó esta ficha**: el commit de F1.0 se quedó **sin empujar** en el árbol
principal, así que la fila de la ficha no existía en su worktree y hubo que crearla allí; al cerrar,
el árbol principal tenía **cinco commits locales sin empujar**, tres de ellos cierres de otras fichas.
Y al reconciliar, `history.md` traía **dos redacciones distintas de QC-61** escritas por dos sesiones:
**se conservaron las dos**, porque no decían lo mismo.

## QC-129 — textos-definitivos-de-los-prompts (CERRADA el 2026-09-18, PR #93)

**Qué entregó.** Los textos de prompt **salen del repositorio**: puerto `documentos/ports/strategy-prompt.ts`
y adaptador `adapters/driven/config/strategy-prompt-env.ts`, calcado de `ai-config-env.ts`, que lee
`CATALOG_PROMPT` o `FORMULA_PROMPT` **dentro de la invocación** —nunca al importar, que es lo que permite
que la suite entera siga corriendo sin variables configuradas—. Una variable por estrategia, **sin texto
de repuesto ni valor por defecto**: si falta, el procesamiento falla nombrándola y no llama a Gemini. Los
tres archivos de `domain/prompts/` se borraron con su `PROMPT_BY_STRATEGY`, y `.env.example` ganó las dos
variables **vacías**.

**Derogó parte de una ficha ya `done`, y con permiso.** `[D6]`, `[D15]` y R4 de **QC-109** decían que los
textos viven dentro del módulo y entran en tiempo de compilación. Por eso esta ficha actualizó
`tests/unit/documentos/qc109-alcance.test.ts` —R4 derogado en su primera mitad, R6 borrado, `ARCHIVOS_NUEVOS`
de 7 a **6**— y añadió una **nota fechada** al `requirements.md` de QC-109 con **28 adiciones y 0 supresiones**.
Las guardias vivas de QC-109 (R11, R13, R14, R15, R16, R17) quedaron intactas. Precedente: la T3 de QC-81.

**Se cierra con 6 de sus 21 requisitos SIN verificar, y está escrito.** R10–R14 y R17 no se mapean a Vitest
sino a una fila firmada del registro humano, porque `[D5]` prohíbe que un test llame a Gemini. Esa firma
**hoy no se puede producir**: sus criterios de hecho exigen disparar una lectura real, y la pantalla (QC-107)
y la cola (QC-111) no existen todavía. Por eso T10 y T11 salieron a **QC-131**, bloqueada por las dos.

**El board cambió antes del spec.** `/afinar-feature` cerró **13 decisiones** y subió la ficha de `medium` a
**`high`**: dejó de ser «escribir dos textos» al descubrirse que tocaba el contrato de otra ficha. Dos
preguntas siguen **abiertas** y nadie las rellenó: quién pone las variables en *preview* —sin ellas ese
entorno no procesa nada— y cómo llega el texto al desarrollo local y a la suite.

**Verificación.** `./init.sh` completo: `== init OK ==`, 562 archivos, 8176 pasados, 107 saltados, cero rojos,
sin rojos nuevos sobre el baseline. `reviewer`: aprobado, 0 mayores y 5 menores —los 3 reales cerrados; de
los otros dos, uno lo exige el propio spec y el otro es deuda ajena—. **Ninguna dependencia nueva.**

**Dos cosas que esta ficha destapó y no eran suyas.** (1) El gate llevaba días muriendo en el validador con
«faltan specs para features sdd en vuelo: QC-82», y el diagnóstico no era el que decía la etiqueta: el spec
de QC-82 **sí existe** en su rama; lo que faltaba era **su worktree**, que es donde el validador lo busca
mientras la feature está en vuelo. Montarlo devolvió el gate a verde para todo el repo, incluida la sesión
de QC-111. (2) El gate avisa de **8 archivos del baseline de rojos que ya pasan** y siguen sin podar.

**Deuda del arnés que dejó esta ficha.** Al desmontar, `wt.sh done` **desregistró el worktree y no borró los
archivos** —«is not a working tree» y después el aviso de archivo en uso—: es la **novena** vez que ocurre el
mismo patrón, y ya tiene ficha propia (**QC-128**, `wt-borra-antes-de-desregistrar`). Se limpió a mano y
`git worktree prune` quedó en verde.

## QC-127 — decimales-caso-r14-sin-actualizar (CERRADA el 2026-09-19, PR #95)

**Qué entregó, y qué NO.** El diff de producción es **vacío**: la ficha entera vive en `tests/`. El caso
**R14** de `tests/unit/pedidos-ui/order-form.test.tsx` recuperó el patrón completo de sus tres vecinos
—igualdad **exacta** del texto pintado y el `title` con el valor **exacto** `'-0.201'`—. Hasta esta rama
**ningún test del repositorio afirmaba que el cálculo de ese caso da `-0.201`**: la afirmación vieja
(`toHaveTextContent('-0.2')`) casaba por **subcadena** y pasaba en verde también con `-0.204`.

**Nació con la premisa derogada, y eso se descubrió antes de trabajar.** La ficha decía que `dev` estaba en
rojo desde el PR #85; ya no: lo arregló `bd6e504e` **fuera del ciclo de la ficha**. El board se corrigió en
`description` **y** en `summary` —que decía literalmente «y dev esta rojo»— antes de seguir. La ficha no se
canceló porque quedaba trabajo real: el arreglo había aplicado **medio patrón** y el censo seguía sin hacerse.

**La decisión de producto quedó ratificada, no heredada.** Un faltante de `-0.001` se pinta «0», **sin
signo**, y el único resalte que queda es `text-destructive`. **La pantalla no se toca**, el resalte se decide
con el valor **exacto** y nunca con el pintado, y la consecuencia se acepta a sabiendas: en teléfono o impreso
no hay `title`, así que ahí el único aviso es el color. Se evaluó pintar `<0.01` y se descartó. **Corrección
al propio leader**, que la acotación dejó por escrito: él había dicho que la decisión «entró por inercia» y
**no era exacto** —el PR #85 la razonó en un comentario fechado dentro del test—; lo que faltaba era
ratificarla.

**El censo de las seis pantallas del PR #85**, archivo por archivo y con fila de constancia. Un hallazgo del
mismo tipo, corregido aquí (**R17**, enmienda que añadió T12 y que el reviewer avaló): la celda de mínimo de
compra pintaba `'0.1005'` como `'0.1'` y nada afirmaba que conserva el exacto. **Un hallazgo de otro tipo NO
se arregló**, por diseño: `order-columns.tsx:201` pinta `0.1255` como `0.13` sin `title`, toca `app/` y R5 lo
prohíbe aquí → **QC-133**.

**Ninguna guardia automática, y el motivo tiene ficha.** R12 lo prohíbe citando **QC-99**: las guardias de
censo rompieron **tres guardias ajenas** al cerrar QC-79. `tests/guards` cerró con **41** archivos, los mismos
que `dev`. Tampoco `tests/baseline-rojos.json` (R15), ni `e2e/` (R14), ni `package.json` (R16).

**La mordida está demostrada, no supuesta.** Con el cálculo roto a propósito, la afirmación **vieja pasaba en
verde** y la **nueva cae**. El `reviewer` lo **reprodujo por su cuenta** y coincidió; rechazó con **2
bloqueantes y 3 menores**, cerrados en `043ee12f` —uno de ellos, B2, se cerró **justificando por escrito** en
el censo por qué una ocurrencia no cuenta (afirma la precondición, antes del `user.type`), que era una de las
dos salidas que el reviewer admitía—.

**Verificación.** `./init.sh` completo: **562 archivos, 8176 pasados, 107 saltados, cero rojos**. Sin E2E, con
motivo escrito: no hay recorrido ni pantalla nueva. **Ninguna dependencia nueva.**

**Lo que esta ficha destapó y no era suyo.** El primer gate completo cayó con **un rojo ajeno**,
`tests/unit/composition/documentos-facade.test.ts` (de QC-129). La causa **se midió antes de tocar nada**, y
las tres corridas importan porque «será el `.env`» es una hipótesis, no un diagnóstico: (1) reproduce
**aislado**, así que no es contaminación de otro archivo del mismo worker; (2) con `CATALOG_PROMPT=SENTINELA`
en el shell **sigue recibiendo cadena vacía**, o sea que el valor lo reinyecta **Vitest desde `.env`** después
del `delete` previo al import; (3) **ningún código de producción asigna** esa variable. **El fallo es del
test**, que afirma una precondición de entorno (`toBeUndefined()`) en vez de controlarla —su hermano
`strategy-prompt-env.test.ts` la pone, la borra y la restaura, y por eso está verde—. **Al humano se le
advirtió que rellenar las variables no pondría verde el caso** y decidió **quitar las dos líneas vacías del
`.env`**; hecho con copia previa y `diff` comprobado. **No** se dio de alta en el baseline (R15 lo prohíbe
aquí) ni se arregló el test ajeno dentro de esta rama → **QC-134**.

**Deuda que deja.** El `.env` del **árbol principal sigue con las dos líneas**, así que ahí el rojo sigue vivo
hasta que entre QC-134. Y el gate volvió a avisar de los **8 archivos del baseline que ya pasan** y siguen sin
podar.

## 2026-09-19 — QC-123-el-total-del-pedido-decidir-donde-vive-el-precio

- El pedido gana `orders.ingredients_cost DECIMAL(14,4)` NULL: el **coste de los ingredientes**
  que consume su receta, leído de los lotes de inventario con existencia. **No es un precio de
  venta** — no existe ninguno en el ERP. Se calcula en el servidor, viaja como cadena decimal, se
  guarda en el pedido y se recalcula en cada edición con los lotes de ese día. La ficha solo
  **lee** lotes: no descuenta ni reserva existencia.
- Requisitos cubiertos: **R1–R23** del spec más **R24–R26** de la enmienda humana = **26
  declarados / 26 mapeados**, cada uno a un test que existe y cuyo cuerpo prueba el requisito.
  PR **#96**, merge `63d15088`.
- **La premisa de la ficha cambió entera antes de escribir una línea.** Nació como «decidir dónde
  vive el precio» con cinco preguntas abiertas; `/afinar-feature` las cerró y descubrió que no hay
  precio de venta en ninguna parte. `complexity` subió de `medium` a `high`, el board se corrigió
  antes de sembrar, y de ahí nacieron **QC-130** (una presentación no sabe que «bidón» son 20 L) y
  la recuperación de la columna del importe en **QC-122**. **Deroga** el punto 4 de
  `docs/architecture.md > Preguntas abiertas del dominio`, que describía columnas que QC-35bis
  borró el 2026-09-07.
- **Decisiones de diseño**: NO nace puerto `pedidos -> inventario` — `inventario` amplía su
  contrato ya publicado con `findCostingBatches`. El cálculo vive en `pedidos/domain/order-cost.ts`,
  **puro y probable sin base**, con enteros escalados y **sin dependencia nueva**. La migración no
  lleva `UPDATE`: los pedidos anteriores se quedan sin importe y **nunca** se rellenan con 0, que
  sería un dato falso indistinguible de un pedido gratis.
- **Las tres decisiones que el spec dejó abiertas las cerró el humano ANTES del implementer**, y se
  devolvieron al `spec_author` como enmienda en vez de dejar que las inventara el código: el
  **desbordamiento** de `Decimal(14,4)` deja el importe en blanco —lo que enmienda `[D5]` de cuatro
  casos a **cinco**—; el **desempate de lote** compara como número si ambos son sólo dígitos y como
  texto si no, sin tocar QC-81; y se convierte **la cantidad y el coste unitario** a la unidad de la
  línea de receta. `pedidos` **recupera la dependencia de `unidades`** que QC-35bis le quitó:
  retroceso consciente, con motivo escrito en `[D6]`.
- **Dos vueltas de `reviewer`.** La primera rechazó por **dos líneas de comentario** que citaban
  ficha o requisito (`docs/conventions.md > Comentarios`), cerradas en `015593c6`. La segunda
  aprobó sobre `015593c6` sin fiarse del barrido ajeno: repitió el suyo sobre todo lo añadido en
  `lib/`, `app/`, `db/`, `components/` y `scripts/`, con patrón validado contra una línea de
  control.
- **Verificación**: `./init.sh` completo verde sobre la rama ya sincronizada con `dev` —
  **566 archivos, 8238 tests, 0 rojos**. Ninguna dependencia nueva.
- **Lo que este cierre destapó, y es la lección que conviene no perder.** El primer gate completo
  salió **rojo con un rojo propio que el gate rápido no podía ver**:
  `tests/unit/unidades/module-contract.test.ts` lee `product-catalog.ts` **con `fs`** y prohíbe que
  aparezca `unitId`, y la ficha había metido ahí el tipo `CostingBatch`. `vitest run guard` no la
  recoge (vive fuera de `tests/guards`) y `vitest related` no la relaciona (no importa el archivo,
  lo lee). Es exactamente el agujero que la regla 5 describe al exigir el gate completo antes de
  cada PR. Se arregló **sin tocar la guardia** (`314e687e`), con el precedente del propio módulo:
  `CostingBatch` se mudó a `domain/costing-batch.ts`, como ya vivía `ProductStockByUnit`.
  **Candidato a `/afinar-regla`.**
- **Deuda que deja, y NO es de esta ficha.** (a) Ocho archivos de `tests/baseline-rojos.json` ya
  pasan y siguen sin podar — ninguno de `pedidos`, `inventario` ni `recetas`; va en ficha propia
  porque meterlo aquí ensancharía el diff. (b) Una guardia de `tests/unit/pedidos-ui/` lee
  `git status --porcelain` **sin filtrar por ficha**, así que con el árbol sucio toma cambios ajenos
  como propios y da un rojo falso — **segundo candidato a `/afinar-regla`**. (c) Menores del primer
  informe, ninguno bloqueante: `INTERNAL_SCALE` duplica `CONVERSION_SCALE` sin que nada avise si
  divergen; `design.md > 10.1` promete en indicativo un diagnóstico al log que el código no hace.
- **El cierre en disco se hizo el 2026-09-21, dos días después del merge.** El PR #96 se mergeó el
  2026-09-19 y nadie cerró la ficha: `feature_list.json` siguió en `in_progress`, la tarjeta en
  *En curso* y el worktree montado. Se detectó al retomarla. El barrido de comprobación —93 PRs
  mergeados contra las 30 fichas no cerradas, por rama y por clave— confirmó que **era la única**.

## 2026-09-21 — QC-111-procesamiento-de-pdf-en-cola

- Cada tanda de PDFs (hasta 10) se encola en **Upstash QStash**, que entrega cada trabajo al
  **primer Route Handler del repo** (`app/api/documentos/trabajos/route.ts`, `runtime = 'nodejs'`),
  y ese trabajo ejecuta la conversión y la estrategia de QC-109. Cada archivo lleva su propio
  estado —en cola, procesando, listo, error con su motivo— y la ficha expone su consulta, que
  pintará QC-107.
- Requisitos cubiertos: **R1–R27, 27 mapeados**, comprobados uno a uno abriendo cada test.
  PR **#97**, merge `f97b594a`.
- **Dos tablas nuevas**, `document_batches` y `document_files`, con `company_id`, **RLS activada y
  forzada** en las dos, FK compuesta contra la empresa y su `down.sql`.
- **Idempotencia por candado de fila**: un solo `UPDATE ... WHERE status='queued' ... RETURNING`
  reclama el trabajo; dos entregas concurrentes se serializan en Postgres y la segunda no hace
  nada. Test de integración real con dos conexiones (`attempts === 1`).
- **La firma se valida antes de cualquier efecto**, y los fallos se clasifican reintentable /
  definitivo con un `Record` tipado que no compila si un código del catálogo queda sin clasificar.
  El código HTTP va invertido a propósito: un fallo **definitivo responde 200** para que la cola no
  reintente, y solo el reintentable pide 5xx.
- **Una dependencia nueva, `@upstash/qstash`**, con los cuatro checks de salud y su fila en
  `docs/dependencias.md`. `@upstash/redis` no entra.
- **Verificación**: `./init.sh` completo verde sobre la rama sincronizada — **576/576 archivos,
  8289 tests, 0 rojos**. Sin E2E, deliberado: R27 lo difiere a QC-107 porque un E2E real exigiría
  URL pública y cuenta, y el gate deja de correr sin red.
- **Aflojó cinco guardias de alcance ajenas, y ninguna encontró un defecto**: las cinco afirmaban
  «el repo no tiene X» cuando esta ficha tenía permiso explícito para añadir X —la dependencia
  aprobada y el primer Route Handler—. En `pedidos-convenciones` se **borra** la afirmación
  absoluta sobre todo `app/` y se conserva la acotada, con un caso nuevo que demuestra que el
  detector sigue mordiendo. El baseline pierde dos entradas y conserva seis.
- **Deuda declarada con encargo de ficha**: las guardias de alcance escritas como absolutos;
  `tests/unit/pedidos/module-contract.test.ts` ciego con CRLF; y la guardia de QC-129, que afirma
  que `CATALOG_PROMPT` no existe cuando `.env.example` la trae y el procedimiento de montar un
  worktree es copiar ese archivo —el camino documentado produce el rojo—.
- **Lo que quedó abierto al cerrar, y no es un defecto de la ficha sino un presupuesto que el spec
  nunca puso.** Revisado al mergear: el trabajo corre **síncrono dentro de la petición** —el Route
  Handler espera a `runDocumentJob` entero—, así que el techo lo pone `maxDuration` de Vercel,
  **300 s por defecto**, y no QStash, que aguanta 15 min en el plan Free. El PR **no fija
  `maxDuration` ni el `timeout` del publish**. Con `catalogo` y 50 páginas —el tope exacto de
  `MAX_PDF_PAGES`— el paso caro es rasterizar a 150 DPI, y **el timeout de 60 s de la IA no lo
  cubre**: `buildImageParts` corre *antes* del `runWithTimeout`. Si la función muere a mitad, la
  fila se queda en `processing`, **los reintentos de QStash no sirven** —`claim` exige
  `status='queued'`— y solo la cierra `expireStale` a los 900 s, que además no es un cron sino una
  llamada perezosa desde `getBatchStatus`. Tres fichas propias: subir `maxDuration`, acotar la
  rasterización y hacer re-reclamable la fila colgada.
- **El nombre de la cabecera del message id sigue sin verificar**: el SDK nunca la lee —comprobado,
  `message-id` no aparece en el paquete—, así que se implementó con `upstash-message-id` en una
  sola constante, sin rellenar con un supuesto. Si fuera otro, la ruta responde 400 siempre y no se
  procesa ni un PDF, sin que ningún test lo note. **El servidor dev local de QStash (`QSTASH_DEV=true`)
  lo responde sin desplegar.**

## 2026-09-21 — QC-136-canvas-no-empaquetable-rompe-el-build

- `next build` sobre `dev` salía con **exit 1** y la aplicación no se podía desplegar.
  `serverExternalPackages: ['@napi-rs/canvas']` en `next.config.ts` lo deja en **exit 0**. Medido
  el mismo día, mismo árbol y misma máquina, cambiando solo esa línea. PR **#101**.
- **La causa era una línea de configuración que faltaba desde QC-106.** `next.config.ts` seguía
  tal cual lo generó `create-next-app`, vacío. `@napi-rs/canvas` no es JavaScript: es un envoltorio
  sobre un binario compilado que su `js-binding.js` elige por plataforma **en ejecución**.
  Turbopack no puede darle un *module id* a un `.node`, así que el build ni terminaba.
- **Lo que no bastaba, y conviene no perderlo:** el adaptador **ya** lo cargaba con
  `await import()`. Un especificador literal sigue siendo analizable estáticamente, así que el
  bundler lo mete en el grafo igual. La carga diferida ayuda en **ejecución**, no en
  **compilación**.
- **Guardia:** `tests/unit/documentos/canvas-no-empaquetado.test.ts`, 3 casos con control positivo,
  sobre la **configuración** y no sobre el build —correr `next build` en un test de unidad lo
  volvería de minutos—.
- **Verificación:** `next build` exit 0 y `./init.sh` completo verde (582/582 archivos, 8354
  tests). Ninguna dependencia nueva.
- **Derogó** lo que QC-106 declaró como riesgo acotado: no era un fallo de ejecución capturable por
  la rama de R16, es que no compilaba.
- **Riesgo de QC-106 que además queda muy reducido:** el lockfile declara
  `@napi-rs/canvas-linux-x64-gnu` y `-musl`, así que el entorno de Vercel tendrá su binario.
- **El orden del merge dejó un cabo suelto y conviene recordarlo.** El PR #100 se mergeó contra la
  rama del #99 cuando esa ya estaba en `dev`, así que su commit existía pero no llegaba. Se
  detectó comprobando `dev` antes de arrancar otra ficha, y se rehizo como PR #101. **Encadenar un
  PR sobre otro solo funciona si el padre se mergea antes de que el hijo esté listo.**

## 2026-09-22 — QC-144-rol-empacador

- **Qué:** tercer rol de semilla, **Empacador**: la misma lógica y la misma pantalla `/asignacion`
  que el Operador, **sin inventario**. Nace el permiso `terminados.consultar` (ver todos los pedidos
  terminados de la empresa), que tienen el Empacador y el Administrador; el Operador no cambia. Nadie
  lo exige todavía: lo consume **QC-145**.
- **PR #107**, merge `ec8bce2e`. Spec R1–R27, T1–T16. Review aprobado a la primera (0 mayores, 7
  menores en `progress/review_QC-144-rol-empacador.md`). `./init.sh` completo verde tras sincronizar
  (613/613). Sin E2E: diferido a QC-145 (D8).
- **Catálogo 15 → 16** (cuarta enmienda a QC-74). Migración de datos `20260922120000_packer_role`,
  idempotente y sin DDL; su `down` falla entera si hay usuarios Empacador, para no inventar a qué rol
  pasarlos.
- **La acotación costó tres vueltas** y conviene recordar por qué: el humano pidió varias veces «lo
  mismo que el Operador, pero ve más», y eso **no se puede sin un permiso nuevo**, porque el repo no
  autoriza por nombre de rol. Explicarlo con la tabla quién-ve-qué lo cerró.
- **Enmienda del spec aprobada a mitad de F2.1 (D10):** el spec pedía citar la ficha en comentarios
  y `docs/conventions.md` lo prohíbe; mandó la convención. Y nació R27: la guardia de permisos no
  administrables vigila ahora también escrituras en `roles` (Prisma y SQL crudo).
- **La migración se escribió a mano**: Prisma no la generaba por drift de checksum en cuatro
  migraciones `*_company_scope` de la base local. Deuda local, ajena al repo.
- **Baseline de rojos podado a cero**: las 6 entradas que quedaban ya pasaban.

## 2026-09-23 — QC-147-cantidades-de-receta-en-porcentaje

- **Qué:** las líneas de receta pasan de cantidad + unidad (gr/ml) a **porcentaje de hasta 2
  decimales que suma exactamente 100,00 %**. Consumo de un pedido = cantidad del pedido × %, en la
  unidad del insumo (sin densidad). Aplica al costo de ingredientes, a la tabla de ingredientes de
  Pedidos y a la pantalla del Operario («10,00 % · 20 l»); se retira el factor de escala de QC-63.
- **PR #108**, merge `9003bf70`. Spec R1–R26, D1–D16, T1–T12. Review: 0 mayores, 11 menores (10
  cerrados, el 9 justificado). E2E de recetas 16/16 en Chromium y WebKit. `./init.sh` completo verde.
- **Nació del chat** y se creó en el board el mismo día; **QC-120 (rendimiento) quedó cancelada**
  porque una receta en porcentaje vale para cualquier cantidad.
- **Lección de base de datos:** la primera tanda migró la base COMPARTIDA de `.env` (`QuimiCloude`) por
  indicación del leader, y el `down.sql` no devuelve las líneas borradas. Se revirtió y la ficha siguió
  en `QuimiCloude_QC147`. **Toda migración de una ficha va contra su base propia.**
- **Enmiendas de contratos ajenos**, con motivo en el test: `unidades/module-contract` (`ProductRef`
  admite `unitId`) y los dos contratos de diff de recetas (QC-147 como ampliación nombrada).
- **Queda para el humano:** el símbolo del litro es «l» en el catálogo y «L» en el spec; y el menor 9
  del reviewer (comentarios de `unidades` que citan fichas) pide una ficha de limpieza.

## 2026-09-23 — QC-146-presentacion-del-pedido

- **Qué:** cada pedido declara su **presentación** (del catálogo de la empresa), obligatoria al crear y
  editar; los viejos quedan «sin presentación». Solo informa: no cambia cantidad, importe ni inventario.
- **PR #109**, merge `0093acf9`. Llevada por otra sesión: el detalle (review rechazado por 2 mayores y
  corregido, hotfixes de `bc902800` en `dev`, cupo `fullstack` subido a 3 con `/afinar-regla`) está en
  su informe y en el PR. Cerrada en disco por el leader de QC-147.
- **Desbloquea QC-145**, que muestra la presentación en «Terminados».

## 2026-09-23 — QC-132-cantidad-del-pedido-sin-title-exacto

- **Qué:** la cantidad redondeada a dos decimales gana su valor exacto en el `title` (`exactDecimalTitle`) en
  tres sitios: columna Cantidad de `/pedidos`, y cantidad del pedido y de cada línea en `/asignacion/[id]`
  (la línea convertida lleva el valor convertido completo, R12). Sin `title` si lo pintado ya es exacto.
- **PR #110**, merge `b7e64eb9`. Spec R1–R12, T1–T10, acotada con `/afinar-feature` (alcance crecido de 1 a 3
  sitios). Review aprobado, 0 mayores y 3 menores (dos de aserciones de tests, arreglados en `66f72cb5`).
- **QC-133 cancelada**: describía el mismo defecto. **QC-114 aparcada a `pending` por el humano** para liberar
  cupo `frontend`; F2.1 había arrancado antes por excepción humana al cupo.
- **Gate completo ROJO AJENO**: 3 archivos de inventario rotos por `cd7f07a6` (subido directo a `dev` sin PR,
  con `package-lock.json` y `.board_snapshot.json`). PR abierto con la evidencia por decisión humana; el
  arreglo va en `fix/rojos-de-cd7f07a6`, PR aparte.
- **Misma sesión: QC-130 cancelada** al acotarla: QC-121 y QC-147 ya cerraron la premisa (unidades sin base
  común en el coste del pedido).

## 2026-09-23 — QC-145-pedidos-terminados-en-asignacion

- **Qué:** `/asignacion` reparte vistas por permiso. El Operador ve «Mis asignados»; el Empacador
  (`terminados.consultar`) suma «Terminados»; el Administrador (`pedidos.consultar`) ve solo «Todos»,
  filtrable por estado. Nace `orders.finished_at`, escrita en la misma operación del Finalizar;
  «Terminados» se ordena por ella con los «sin fecha» al final. La edición en Pedidos deja de mover
  el estado (solo la planta), y quien tiene `pedidos.consultar` ya no puede ser responsable.
- **PR #112**, merge `51f2d101`. Spec R1–R37, D1–D18, T1–T17, tres vueltas de spec para cerrar sus
  preguntas. Review: rechazado por 1 mayor (comentarios que citaban requisitos), aprobado en la
  segunda con 1 menor abierto. E2E con los tres roles 8/8 en Chromium y WebKit. `./init.sh` completo
  verde (640/640) antes de abrir el PR.
- **Base propia desde el primer paso** (`QuimiCloude_QC145`): la lección de QC-147 se aplicó.
- **Cierra también QC-121** en disco: mergeada en el PR #102 y nunca cerrada, seguía ocupando el cupo
  `fullstack` y habría dejado `dev` en rojo. Le faltan su resumen aquí y desmontar su worktree.
- **Rojo de dev al baseline:** `guard-arquitectura-modulos` por `a01c90cb` (import profundo en
  `product-actions.ts`). Sigue rojo en `dev` al cerrar.
- **Corrige un test mal planteado de QC-147** que comparaba su migración con la ÚLTIMA del repo y se
  rompía con cualquier migración posterior.
- **La máquina se quedó sin memoria dos veces** y cortó gates en segundo plano. Un gate a la vez y sin
  servidores ni E2E de otras sesiones en paralelo.
- **Queda abierto:** el menor m4 (constantes muertas en `order-form.tsx` que exige
  `guard-pantalla-pedidos-se-amplia`); el flake de `user-table` ya tiene ficha (QC-126); el commit
  `c16d8172` quedó sin Co-Authored-By.

## 2026-09-23 — QC-107-componente-de-carga-de-archivos

- **Qué:** componente de subida de PDFs, varios a la vez (hasta 10 por tanda), con el modo de conversión
  por prop y el estado de cada archivo (en cola, procesando, listo, error con motivo) leído de la cola de
  QC-111. Incluye su recorrido E2E y arregla los dos defectos que ese E2E destapó.
- **PR #103**, merge `be5c75c0`, mergeado el 2026-09-22. Bitácora y review en
  `progress/impl_QC-107-componente-de-carga-de-archivos.md` y `progress/review_QC-107-componente-de-carga-de-archivos.md`.
- **Cierre tardío:** el PR se mergeó el 2026-09-22 y la ficha siguió `in_progress` hasta el 2026-09-23,
  ocupando cupo de `frontend`. La cerró el leader de QC-145 al verificar el merge.

## 2026-09-23 — QC-122-busqueda-y-total-en-la-pantalla-de-pedidos

- **Qué:** `/pedidos` gana la **caja de búsqueda por nombre de receta** (consulta de QC-68). El término vive en
  `?q=` (paginación, panel lateral, recarga y Atrás); lista anterior atenuada mientras carga; «sin
  coincidencias» dentro de la tabla con «Limpiar la búsqueda»; **R27**: la caja se sincroniza con la URL al
  pulsar Atrás entre dos términos, arreglado en `order-table.tsx` sin tocar `components/shared`.
- **PR #113**, merge `57527a0b`. Spec R1–R27 (R17–R24 y R25 b retirados), T1–T7. E2E 5/5 en Chromium y WebKit.
- **Cambio de alcance en F1.4:** el importe no va en el listado; es una cotización en el formulario → nace
  **QC-151**. Review: vuelta 1 rechazada (B1 Limpiar+Atrás, B2 test de R12, B3 WebKit), vuelta 2 OK.
- **Rojo ajeno del gate** (`guard-arquitectura-modulos`, de `a01c90cb` subido directo a `dev`): arreglado en
  el **PR #114** (`a63c6640`). **Queda**: proveedores e inventario tienen el mismo fallo de la caja con
  Atrás (sin ficha); `pnpm run e2e -- <archivo>` no filtra en Git Bash (hay que usar `pnpm exec playwright
  test`), mejora al arnés pendiente de `/afinar-regla`.

## 2026-09-23 — QC-151-cotizacion-del-coste-en-el-pedido

- **Qué:** el formulario de pedido (alta y edición) muestra una **cotización del coste de ingredientes** en vivo
  (`$ 1,234,567.50`, valor exacto en el `title`), con un caso de uso nuevo de solo lectura que reutiliza
  `resolveIngredientsCost` (QC-123) bajo `pedidos.modificar`. Se recotiza 500 ms tras la última tecla y al cambiar
  la receta; al guardar se recalcula. **R23**: arreglo de `recipe-picker.tsx` (elegir otra receta retiraba la
  elección), ampliación aprobada por el humano.
- **PR #115**, merge `6ec67aab`. Spec R1–R23, T1–T8. Nació al acotar QC-122 (el importe no va en el listado).
- Review: vuelta 1 rechazada (comentarios de producción citando la ficha), vuelta 2 OK. Dos merges con `dev`
  (QC-145; QC-122 + #114). **Excepción humana al paralelismo**: arrancó solapando con QC-141 en
  `lib/composition/index.ts`, `lib/modules/pedidos/index.ts` y `order-form.tsx`: **QC-141 resolverá el conflicto al
  mergear**.

## 2026-09-22 — QC-110-recorte-de-imagenes-del-pdf (cerrada en disco el 2026-09-23)

- **Qué:** dentro del trabajo de la cola, Gemini devuelve las coordenadas de las imágenes de cada página y
  otra librería las recorta y las sube a un bucket propio de Supabase Storage (QC-110).
- **PR #105**, merge `efd8f06d` el 2026-09-22. El detalle (spec, review y gate) está en su spec, en su bitácora
  y en el PR.
- **Cierre tardío:** el PR se mergeó el 2026-09-22 pero la ficha seguía `in_progress` y la tarjeta *En curso*.
  El leader lo detectó y lo cerró el 2026-09-23, sin volver a verificar nada.

## 2026-09-24 — QC-140-catalogo-visual-de-proveedores

- **Qué:** `/proveedores` deja la tabla de QC-44 y pasa a ser un catálogo visual: cada proveedor es
  una fila con el carrusel de sus productos, cargado de 5 en 5 al hacer scroll y con «cargar más» por
  fila. Filtro por proveedor o producto (con producto, el carrusel muestra solo lo que coincide),
  proveedor sin líneas visible con aviso, fallo incremental con Reintentar, orden alfabético. Editar
  y borrar proveedor se mudan a la cabecera de `/proveedores/<id>`.
- **PR #118**, merge `a738d81f`. Spec R1–R41, D1–D20, T0–T15. Review: rechazado por 2 mayores (letra
  de 14 px en los filtros desde 768 px; tests del panel y del diálogo perdidos al borrar la lista),
  aprobado en la segunda. Dependencia nueva aprobada: `react-intersection-observer` (checks
  verificados por el leader con `npm view`; el spec los tenía de memoria y uno era falso).
- **El «Guardar» tapado en Android lo causaba la rama**: un nombre largo sin espacios desbordaba en
  horizontal y Chromium móvil agrandaba el viewport. Se comprobó contra `origin/dev` antes de decidir.
- **Tercera ficha seguida rota por un test de alcance que compara con `origin/dev`** (QC-145 y clientes
  por dependencias, QC-147 por timestamp). Se corrigieron comparando el merge de su propia ficha. La
  clase entera es **QC-99**, que conviene subir de prioridad.
- **Deuda:** T14 (dispositivos reales), R51 de `proveedores.spec.ts` rojo heredado de `dev`
  (`682d3e3b`), y los menores de la segunda revisión (tres aserciones sin sucesor en los tests
  recuperados, citas en comentarios de tests).

## 2026-09-24 — QC-153-modelo-de-clientes

- **Qué:** tabla `customers` (nombres, apellidos y ciudad obligatorios; teléfono, correo, dirección opcionales;
  duplicados permitidos; borrado lógico; `company_id` con unicidad `(company_id, id)`; RLS) y enmienda al
  catálogo de permisos: `clientes.consultar`/`clientes.modificar`, solo Administrador (16→18, seed 20→22).
  Módulo `clientes` solo con armazón. Primera ficha de la épica nueva **QC-152 Clientes**.
- **PR #117**, merge `cf99cc2b`. Spec R1–R29. Review OK. Gate completo verde (674/9418).
- **Decisiones humanas sobre tests ajenos:** el guardián de modelos de QC-145 se fija a su propio merge (PR
  #112) en vez del merge-base de cada rama; `pedidos-schema` deroga solo la prohibición del modelo `Customer`
  (la de que `Order` no tenga cliente sigue hasta QC-156). **Desbloquea QC-154.**

## 2026-09-24 — QC-158-catalogo-desde-pdf

- **Qué:** lo que la IA lee de un PDF de catálogo se convierte en líneas del catálogo del proveedor tras una
  revisión en `/proveedores/[id]/importar/[documentoId]`: producto existente solo actualiza `cost`, presentación
  nueva se crea (unidad elegida por el revisor, exige `inventario.modificar`), imagen recortada por página y orden,
  campos nuevos `material` y `measurements`. Primera ficha que interpreta la salida de la IA; enmienda R10 de
  QC-129. R29: editar una línea ya no borra su imagen.
- **PR #119**, merge `6962dac9`. Spec R1–R38. Review: vuelta 1 rechazada (B1, R28 «mostrar» sin test), vuelta 2 OK.
  El E2E de QC-107 (`documentos.spec.ts`), rojo en dev desde QC-110, vuelve a verde.
- **Incidencia:** el `implementer` se cortó ~15 h sin entregar informe; se detectó al preguntar el humano y se
  reanudó sin pérdida. **Lección:** comprobar el último commit antes de estimar.
- **Quedan:** imagen en pantalla con URL firmada → **QC-140** (encargo en su issue); R37 en móvil real (humano);
  prompt de catálogo en Vercel y firma → **QC-131** (humano).

## 2026-09-24 — QC-142-permiso-propio-de-documentos

- **Qué:** `documentos` deja de pedir prestado `proveedores.modificar`: nacen `documentos.consultar` y `documentos.modificar`, solo para el Administrador; la migración hace heredar `documentos.modificar` a todo rol con `proveedores.modificar`. Los tres casos de uso de subida exigen el permiso nuevo; las lecturas siguen sin permiso.
- **PR #120**, merge `5d3e90d9`. Spec R1–R21, D1–D8. Review: rechazado por 1 mayor (el test anti-total no veía aserciones multilínea ni un `/*` dentro de un string), aprobado en la segunda. Gate completo verde (688/688).
- **Ningún test fija ya el total del catálogo de permisos**, y un test nuevo lo impide: QC-161 y QC-168 también lo amplían.
- **Para arrancarla se subió el cupo de `backend` a 3** con `/afinar-regla` (`cdfc6bb`).
- **Quinto test de alcance que compara contra la rama y rompe fichas ajenas** (QC-140 R29, QC-158 R36a): corregidos. La clase entera es **QC-99**.
- **Deuda:** el recorrido E2E de subida de PDFs sigue en rojo, heredado de `dev`.

## 2026-09-25 — QC-160-boton-de-subida-de-pdf

- **Qué:** la subida de PDFs de QC-107 deja de estar siempre a la vista: un botón «Subir PDFs» la abre en una
  ventana (diálogo) con el estado por archivo dentro. En `/proveedores/[id]` (estrategia catálogo) y, montaje nuevo,
  en el listado `/produccion/formulas` (estrategia fórmula). El botón solo lo ve quien tiene `documentos.modificar` (QC-142).
- **PR #122**, merge `685845f2`. Spec R1–R22. Review: vuelta 1 rechazada (M1 caso del manifiesto en el test de
  convenciones; M2 E2E sin WebKit), vuelta 2 OK. Gate completo 715/715; E2E de documentos 3/3 en Chromium y WebKit.
- **Decisión:** el arreglo de `catalog-import-isolation` (rojo en dev por el choque QC-158 × QC-142) se revirtió de
  esta rama y se dejó a **QC-169**; sigue en el baseline de rojos hasta entonces.
