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
