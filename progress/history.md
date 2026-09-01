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
