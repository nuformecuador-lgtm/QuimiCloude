# QC-48 — tenant-en-la-sesion · tasks.md

> Orden de ejecución. `[P]` = paralelizable con la task marcada igual dentro del mismo bloque.
> Cada task dice **qué archivos toca** y **cuándo está hecha**. Nada se da por hecho sin gate
> (`./init.sh --rapido` por tanda, `./init.sh` completo antes del PR).
>
> **No hay migración en esta feature** (R24): si alguna task acaba tocando `db/schema.prisma` o
> `db/migrations/**`, es que el diseño se rompió — parar y avisar.

## Bloque 1 — El contenido firmado

- [x] **T1 `[P]` — La empresa entra en el esquema del contenido firmado.**
      Archivos: `lib/modules/identity/domain/session-claims.ts`,
      `tests/unit/identity/session-claims.test.ts`.
      `SESSION_CLAIMS_SCHEMA` gana `cid: z.string().uuid()`; `SessionClaims` gana
      `readonly companyId: string`; `parseSessionClaims` traduce `cid -> companyId` igual que ya
      traduce `role -> roleName`.
      **Hecho cuando:** hay tests verdes que afirman `null` para un JSON sin `cid`, con `cid: ''`,
      con `cid` numérico y con `cid` que no tiene forma de UUID; y `companyId` poblado en el caso
      válido. Cubre R6, R9. Sin cambios en `role`, `sub`, `iat` ni `exp` (R23).

- [x] **T2 `[P]` — El ticket lleva empresa.**
      Archivos: `lib/modules/identity/domain/session.ts`, `tests/unit/identity/session.test.ts`.
      `SessionTicket` gana `readonly companyId: string`; la firma pasa a
      `createSessionTicket(userId, roleName, companyId, now = new Date())`, obligatorio y sin valor
      por defecto.
      **Hecho cuando:** `pnpm run typecheck` señala los sitios de llamada pendientes (esperado, se
      arreglan en T5) y el test afirma que el ticket propaga `companyId` sin tocarlo. Cubre R5.

- [x] **T3 — `v3`, sin compatibilidad. Depende de T1 y T2.**
      Archivos: `lib/modules/identity/adapters/driven/session/session-token.ts`,
      `tests/unit/identity/session-token.test.ts`, `tests/unit/identity/session-cookie.test.ts`.
      `SESSION_VALUE_VERSION = 'v3'`; `SessionPayload` gana `cid`; `buildSessionValue` lo escribe
      desde `ticket.companyId`. Actualizar el comentario de cabecera del archivo citando QC-48 al
      lado de QC-9. **No se añade ninguna rama de lectura de `v2`.**
      **Hecho cuando:** un valor `v2` con firma correcta y sin caducar se resuelve como `null`
      **sin** que se llame a la verificación de firma ni se lea el secreto; ida y vuelta
      `build → verify` conserva `companyId`; sigue verde la afirmación byte a byte contra
      `node:crypto`. Cubre R6, R7, R8.

## Bloque 2 — El login

- [x] **T4 — El puerto de credenciales trae la empresa y su estado.**
      Archivos: `lib/modules/identity/ports/user-credentials-reader.ts`,
      `lib/modules/identity/adapters/driven/persistence/user-credentials-prisma.ts`.
      `AuthenticatableUser` gana `companyId: string` y `companyDeletedAt: Date | null`; el
      `$queryRaw` gana `JOIN companies c ON c.id = u.company_id` y las dos columnas
      (`design.md > 3.2`). Sigue siendo `$queryRaw` (índice funcional parcial) y sigue sin salir
      de la base ni correo, ni documento, ni teléfono.
      **Hecho cuando:** el test de integración afirma que un usuario devuelve su `companyId` y
      `companyDeletedAt: null`, y que un usuario de una empresa dada de baja devuelve
      `companyDeletedAt` no nulo (la fila **sí** se devuelve: el corte es del dominio). Cubre R2.

- [x] **T5 — El corte y la emisión, en el dominio. Depende de T2 y T4.**
      Archivos: `lib/modules/identity/domain/verify-credentials.ts`,
      `tests/unit/identity/verify-credentials.test.ts`.
      En el camino de éxito, tras la única verificación de hash y tras `isLocked`: si
      `companyDeletedAt !== null` → `return REJECTED` **sin escribir nada**; si no,
      `attempts.set(...)` y `startSession(createSessionTicket(id, roleName, companyId, now))`.
      **Hecho cuando:** hay tests que afirman (a) el ticket emitido lleva el `companyId` que vino
      de la base y jamás uno de la entrada; (b) empresa no viva ⇒ mismo objeto `REJECTED` que una
      contraseña incorrecta, `startSession` no llamado, `attempts.set` **ni** `compareAndSet`
      llamados; (c) el hasher se invoca **exactamente una vez** también en ese camino; (d) una
      contraseña incorrecta sobre empresa no viva **sí** registra el fallo. Cubre R1, R3, R4, R5.

## Bloque 3 — El lector de sesión

- [ ] **T6 `[P]` — El lector de usuario trae empresa y su estado.**
      Archivos: `lib/modules/identity/ports/session-user-reader.ts`,
      `lib/modules/identity/adapters/driven/persistence/session-user-prisma.ts`.
      `SessionUserRecord` gana `companyId` y `companyDeletedAt`; el `select` gana `companyId: true`
      y `company: { select: { deletedAt: true } }`, en la **misma** llamada (`design.md > 4.1`).
      **Hecho cuando:** el test de integración afirma los dos campos y que **no hay una segunda
      consulta** (una sola llamada a `findFirst`). Cubre R13.

- [ ] **T7 — La cadena de cortes, en un solo sitio. Depende de T1 y T6.**
      Archivos nuevos: `lib/modules/identity/domain/session-context.ts`,
      `lib/modules/identity/domain/resolve-session.ts`,
      `tests/unit/identity/resolve-session.test.ts`.
      Archivo tocado: `lib/modules/identity/domain/resolve-session-user.ts`, reducido a proyección
      (`resolveSession(...)?.user`) **conservando su firma pública**.
      Cortes 4 y 5 al final de la cadena, separados, en el orden de `design.md > 4.2`.
      **Hecho cuando:** tests verdes para (a) `companyId` firmado ≠ el de la ficha ⇒ `null`;
      (b) `companyDeletedAt` no nulo ⇒ `null`; (c) sin cookie / caducada ⇒ `null` **sin** llamar a
      `findActiveById`; (d) caso feliz ⇒ `user` y `context` coherentes, con `context.companyId`
      igual al **leído de la base**; (e) los tests de QC-8 de `resolve-session-user` siguen verdes
      **sin tocar su guion**. Cubre R14, R15, R16, R17, R19, R20, R21.

- [ ] **T8 — Exponerlo al servidor. Depende de T7.**
      Archivos: `lib/modules/identity/ports/session-provider.ts`,
      `lib/modules/identity/index.ts`, `lib/composition/index.ts`,
      `tests/unit/composition/identity-facade.test.ts`.
      `SessionProvider` gana `getSessionContext()`; el barrel reexporta el tipo `SessionContext` y
      `createResolveSession`; la composición cablea **una sola** instancia de `createResolveSession`
      para las dos salidas.
      **Hecho cuando:** `identity.getSessionContext()` existe, devuelve `null` sin sesión y
      `{ userId, companyId, roleName }` con ella; el objeto expuesto **no** trae permisos ni
      capacidades; el barrel sigue importable sin arrastrar Prisma ni `next/*`
      (`guard-arquitectura-modulos` y `guard-contrato-publico` verdes). Cubre R18, R22.

## Bloque 4 — El borde y la no-regresión

- [x] **T9 — Tests del portero. Depende de T3.**
      Archivos: `tests/unit/identity/route-guard-middleware.test.ts`. **Sin cambios en
      `route-guard-middleware.ts` ni en `middleware.ts`** (`design.md > 7`): si hace falta tocar
      alguno, parar — el diseño falló.
      **Hecho cuando:** hay tests que afirman (a) cookie `v3` firmada y vigente **sin `cid`** en una
      ruta privada ⇒ redirección al login con `next=` la ruta pedida; (b) `cid` mal formado ⇒ lo
      mismo; (c) dos sesiones idénticas salvo por su `companyId` ⇒ **misma** decisión para la misma
      ruta; (d) el rol sigue decidiendo igual que en QC-9. Cubre R10, R12, R23.

- [ ] **T10 `[P]` — Guardias y límites, sin código nuevo.**
      Archivos: ninguno de producción; se corren y se comprueban
      `tests/guards/guard-middleware-edge.test.ts`, `guard-arquitectura-modulos.test.ts`,
      `guard-firma-sesion-unica`, `guard-dependencias-aprobadas.test.ts`,
      `tests/unit/middleware-root-contract.test.ts` y `tests/unit/schema/*`.
      **Hecho cuando:** todas verdes sin modificar ninguna regla, `db/schema.prisma` y
      `db/migrations/**` intactos, `package.json` intacto y `docs/dependencias.md` sin fila nueva.
      Cubre R11, R24, R28.

- [ ] **T11 `[P]` — Comprobar que nada de negocio se filtró por empresa.**
      Archivos: ninguno; se corren las suites de `inventario`, `recetas`, `unidades`, `proveedores`
      y `pedidos`.
      **Hecho cuando:** verdes **sin tocar su guion**, y una revisión del diff confirma que no se
      añadió ningún filtro por empresa, ninguna pantalla y ninguna ruta nueva. Cubre R25, R26.

## Bloque 5 — E2E y cierre

- [x] **T12 — Extender el E2E de login. Depende de T5.**
      Archivos: `e2e/login.spec.ts` (**se extiende, no se crea uno nuevo** — decisión cerrada 9).
      Un `test(...)` más en el `describe` existente: fixture con una segunda empresa `deletedAt`
      puesto (su nombre no choca: `companies_name_unique` es parcial) y un usuario dentro; login
      con credenciales **correctas**.
      **Hecho cuando:** el test afirma que la URL sigue siendo `/login`, que aparece
      `GENERIC_CREDENTIALS_ERROR` y que **no** hay cookie de sesión; el `afterAll` borra en orden
      usuarios → rol → empresas (FK `RESTRICT`); los dos tests que ya existían siguen verdes sin
      tocar su guion. Cubre R3, R27.

- [ ] **T13 — Trazabilidad. Depende de T1-T12.**
      Archivos: `progress/impl_QC-48-tenant-en-la-sesion.md`.
      **Hecho cuando:** contiene el mapa `R1..R28 -> test concreto` (archivo + nombre del `test`),
      sin ningún hueco. `CHECKPOINTS.md > Trazabilidad` lo exige y el reviewer rechaza si falta uno.

- [ ] **T14 — Gate completo. Depende de T13.**
      **Hecho cuando:** `./init.sh` termina en verde (typecheck, lint, unit, integración, guardias
      y E2E) y queda anotado en `progress/`. Antes del PR, sin excepción (regla 5 de `CLAUDE.md`).

## Nota de despliegue (no es una task de código)

Al mergear esto, **todas las sesiones vivas caen** (decisión cerrada 7, `design.md > 11` riesgo 1).
Quien esté dentro aparece en el login en su siguiente navegación. Va anotado aquí para que no
sorprenda a quien despliegue.
