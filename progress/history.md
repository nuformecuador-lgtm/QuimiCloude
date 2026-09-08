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
