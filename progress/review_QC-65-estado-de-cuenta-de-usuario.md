# QC-65 — estado-de-cuenta-de-usuario · review

> Rama feature/QC-65-estado-de-cuenta-de-usuario · worktree .worktrees/QC-65-estado-de-cuenta-de-usuario/ · revisado el 2026-09-08.
> Contra specs/QC-65-.../{requirements,design,tasks}.md, progress/impl_QC-65-....md, docs/architecture.md,
> docs/conventions.md, docs/verification.md y CHECKPOINTS.md.
> El ./init.sh completo lo corre el leader en paralelo; aqui se corrio lo necesario para verificar cada hallazgo.

## Veredicto

**OK** — 0 bloqueantes (mayores), 5 menores.

---

## Checklist de CHECKPOINTS.md

### Especificacion
- [x] requirements.md con EARS numerados R1..R21, mas Alcance, «Lo que NO entra» y la tabla de decisiones cerradas.
- [x] design.md con seis alternativas descartadas y su porque (§6, A..F).
- [~] tasks.md: T1..T7, T9..T11, T13..T16 marcadas [x]. **T8, T12 y T18 sin marcar** — son los cierres de tanda con
      ./init.sh --rapido y el ./init.sh completo, que por el reparto del gate son del leader. Ver menor 1.

### Trazabilidad
- [x] Los 21 requisitos tienen test. **Verificado abriendo cada test, no leyendo el mapa.** Detalle abajo.
- [x] El mapa R<n> -> test esta en la bitacora, con archivo y titulo de caso.

### Calidad de codigo (corrido por el reviewer)
- [x] pnpm typecheck — sin una linea de error.
- [x] pnpm lint — sin una linea de error.
- [x] vitest run tests/unit/identity — 34 archivos, **496 pasados**.
- [x] vitest run tests/integration/identity — 4 archivos, **85 pasados**.
- [x] vitest run tests/guards — 21 archivos, **194 pasados**.
- [x] vitest run tests/unit/proveedores/module-contract.test.ts — 9 pasados, **sin tocar el archivo** (es el que el
      escalar protege, design.md > 1.3).
- [x] E2E: ninguno nuevo, y el design justifica por que (la ficha no cambia el comportamiento del login). Los
      existentes los corrio el implementer (8 pasados, 4 chromium + 4 webkit).
- [n/a] UI multiplataforma: el diff no toca app/, components/ ni hooks/.
- [x] Dependencias: package.json y pnpm-lock.yaml **sin una sola linea** en el diff (R21). Ninguna utilidad a mano
      que ya resuelva una libreria del stack.

### Datos y seguridad
- [x] Aislamiento por empresa: **no se anade ningun modelo** a db/schema.prisma, solo tres columnas a users, que es
      una de las tres tablas exentas (docs/architecture.md > Dominio n.o 1) y que ademas ya tiene company_id desde
      QC-47. No hay consulta de operacion nueva, asi que no hay filtro por empresa que exigir. R15 comprueba ademas
      contra Postgres real que las tres unicidades **siguen** midiendose por empresa.
- [x] RLS: la migracion **no menciona** ROW LEVEL SECURITY en ninguna linea ejecutable, y el predicado
      touchesForbiddenGround lo vigila con sus cuatro sensibilidades. users sigue con ENABLE + FORCE desde QC-4.
- [x] Acceso a datos solo por Prisma; nada de cliente Supabase.
- [x] Migracion versionada y reversible, con su down.sql y el DROP TYPE el ultimo.
- [x] Sin secretos hardcodeados. Sin webhooks.

### Modulos hexagonales
- [x] domain/account-status.ts es dominio puro: no importa framework, Prisma, shared ni adaptadores. El puerto solo
      importa el tipo del dominio.
- [x] El contrato lib/modules/identity/index.ts reexporta los tres simbolos; nadie importa por ruta profunda.
- [x] Ningun adaptador driving nuevo. Ningun use server reexportado.
- [x] model User conserva su /// @module identity, afirmado por el test del esquema.

---

## Trazabilidad R1..R21 — verificada abriendo el test, no el mapa

Leccion de QC-45: **mapeado no es verificado**. Cada fila se comprobo leyendo el caso y midiendo si mide lo que el
requisito dice. Abreviaturas como en la bitacora: [S] esquema, [M] migracion, [A] alcance, [C] constraints de
integracion, [SU] seed unitario, [SI] seed de integracion.

| R | Verificado | Como |
|---|---|---|
| R1 | si | [S] accountStatus es el enum y **no** opcional (isOptional === false) + [C] recorre los cuatro valores del dominio contra la base y rechaza el quinto. |
| R2 | si | [C] INSERT **crudo** con CAST('suspendido' AS "UserAccountStatus") -> SQLSTATE 22P02 literal, y el findFirst posterior confirma que la fila **no quedo**. Es garantia de la base, como pide el requisito. |
| R3 | si | [S] y [M] **importan** USER_ACCOUNT_STATUSES de @/lib/modules/identity y comparan con igualdad ORDENADA contra el enum del esquema y contra el CREATE TYPE. Los cuatro literales no se escriben a mano en ninguno de los dos. Mutaciones en memoria: quinto valor, valor quitado, grafia en mayusculas, reorden, CREATE TYPE borrado — todas caen. |
| R4 | si | [S] y [M] afirman @map/columna en snake_case con /^[a-z_]+$/ y los valores con /^[a-z]+$/. |
| R5 | si | [S] statusDefaultIsTheInitialStatus (el default sale de INITIAL_USER_ACCOUNT_STATUS, con dos mutaciones que caen) + [C] alta que **no menciona** ninguna de las tres columnas -> pending. |
| R6 | si (estatico) | [M] backfillSetsEveryRowActive: hay UPDATE users SET account_status, **sin WHERE**, con valor active, y backfillComesAfterAddColumn. Cuatro mutaciones caen (WHERE deleted_at IS NULL, valor pending, backfill borrado, backfill adelantado). Ver menor 2. |
| R7 | si | [SU] con dobles: createInitialAdmin recibe accountStatus === SEED_ADMIN_ACCOUNT_STATUS, !== INITIAL_USER_ACCOUNT_STATUS, una sola llamada, y accountStatusChangedBy **no** viaja. [SI] contra Postgres real: tras sembrar, el admin vivo esta en active con autor NULL. **Comprobado por el reviewer mutando**: con SEED_ADMIN_ACCOUNT_STATUS = inactive el caso cae. |
| R8 | si | [S] accountStatusChangedAt obligatorio, @db.Timestamptz(6), @default(now()), y **no** @updatedAt + [C] instante relleno en el alta. |
| R9 | si | [C] el instante cae en la ventana del alta y es **exactamente** createdAt (esta segunda, sin holgura) + [M] DEFAULT CURRENT_TIMESTAMP en el ADD COLUMN, que es la mitad «al migrar». |
| R10 | si | [S] accountStatusChangedBy opcional, @db.Uuid, sin @default + [C] alta sin autor -> NULL + [SI] el admin del seed con autor NULL. |
| R11 | si | [C] INSERT crudo con un uuid inventado -> 23503, la fila no queda; y el camino feliz con un autor real entra (esa mitad es lo que impide el verde por la razon equivocada). [M] la FK con RESTRICT y tres mutaciones que caen. |
| R12 | si | [C] DELETE fisico del autor -> 23503, el autor sigue vivo, el rastro sigue apuntandolo, y el borrado **logico** del autor si se puede. Mide el fisico, que es lo que dice el requisito. |
| R13 | si | [C] dos cambios seguidos dejan **una** fila con el ultimo rastro y nada del primero + [S] declaresStatusHistory con dos mutaciones (tabla de historial y columna previousAccountStatus) que caen + [M] el UP no crea ninguna tabla. |
| R14 | si | [C] recorre **los dieciseis pares ordenados** derivados de la lista del dominio, no una muestra, y afirma paresProbados.length === 4**2 mas el par blocked->active dicho aparte. Un CHECK de transicion cae aqui. |
| R15 | si | [C] tres rechazos 23505 (correo, username, documento) con la primera cuenta en inactive y la segunda naciendo pending — el caso afirma explicitamente que los dos estados **difieren**, que es lo que lo hace concluyente —, mas el mismo trio libre en otra empresa. |
| R16 | si | [C] tres mitades: cambiar estado no toca deleted_at; la baja logica no mueve estado, instante ni autor; y sobre una fila ya de baja el estado se sigue moviendo sin levantar la baja + [M] ni el UP ni el DOWN nombran deleted_at en linea ejecutable. |
| R17 | si | [M] dropStatements(upSource) vacio (aditiva), tablesTouched(upSource) === [users], downDropsTypeLast, downDropsAllThreeColumns, el DOWN no crea nada. Todas con mutacion que cae. Ver menor 2 sobre el rollback real. |
| R18 | si | [A] verify-credentials.ts y account-lock.ts no mencionan el estado —con ancla positiva para que un archivo vacio no pase en verde— y **el diff no los toca**. Confirmado a mano: git status no los lista. |
| R19 | si | [A] igualdad CERRADA de los cinco archivos de produccion que nombran el estado, sobre un barrido de todo lib/, app/, components/, hooks/ y middleware.ts (con expect(archivos.length).toBeGreaterThan(100) como ancla del barrido) + los cinco caminos sensibles dichos por su nombre + [S]/[M] ningun indice sobre account_status. **Comprobado por el reviewer mutando**: un lib/shared/tmp-rev-qc65.ts que nombra accountStatus pone el caso en rojo. Archivo borrado despues. |
| R20 | si | [A] el diff no toca app/, components/, hooks/, middleware.ts ni ningun adapters/driving/. Confirmado a mano contra git status y git diff --stat origin/dev. |
| R21 | si | [A] el diff no toca package.json ni pnpm-lock.yaml. Confirmado a mano: no aparecen ni en git status ni en el --stat. |

Sin hueco. Ninguna fila de la tabla de decisiones cerradas se queda sin R<n>.

---

## Fronteras que la ficha no podia cruzar — todas respetadas

Verificado sobre git status --short y git diff --stat origin/dev, no sobre la bitacora:

- verify-credentials.ts, account-lock.ts, failed_login_attempts, lock_level, locked_until (QC-78): **intactos**. No
  aparecen en el diff y la migracion no los nombra en linea ejecutable.
- deleted_at, los tres indices unicos de users, el RLS, middleware.ts, la sesion y la UI: **intactos**. El diff no
  contiene un solo archivo de app/, components/ o hooks/.
- «Nadie lee el estado»: el unico camino que lo escribe es el del seed (puerto -> caso de uso -> adaptador Prisma).
  No hay find/where por accountStatus en produccion, y solo hay un user.create en todo lib/: el del seed.
- Cero dependencias nuevas.
- tests/unit/proveedores/module-contract.test.ts **no se toco** y sigue verde (9 pasados).
- scripts/seed.ts **no se toco**: diff vacio.

---

## Los cinco puntos que el implementer marco — que compro y que no

**1. Rojos ajenos y preexistentes: LOS COMPRO.** tests/unit/navegacion/private-layout-menu.test.tsx falla aqui con
2 de 8 casos (el getByTestId del disparador del menu de usuario). No lo acepte de palabra: el diff de esta rama
**no contiene un solo archivo de app/, components/ ni hooks/**, y el test renderiza el layout privado y su menu de
logout — piezas que esta ficha no toca ni por asomo. La causa vive en el arbol principal
(components/private/logout-menu-item.tsx borrado y logout-button.tsx nuevo, trabajo de otra ficha), no aqui. Los
tres flaky los corri yo en solitario: catalog-line-sheet + supplier-page + login-form-uncontrolled-warning ->
**54 pasados**, exactamente el numero de la bitacora. Ninguno de los cuatro es de QC-65.

**2. Las dos guardias ajenas retensadas: LAS COMPRO, una a una.**
- credential-policy-contract.test.ts: el censo sigue siendo expect(...).toEqual([...].sort()). Se **insertaron**
  tres entradas; **no se quito ninguna**, y failedLoginAttempts, lockLevel y lockedUntil siguen en la lista. No
  aparece un cuarto campo de relacion, coherente con el escalar.
- identity-schema.test.ts: bloque nuevo ACCOUNT_STATUS_FIELDS al estilo de LOCKOUT_FIELDS, y **una sola linea**
  anadida dentro del mismo toEqual. BUSINESS_FIELDS, LOCKOUT_FIELDS, SEED_FIELDS y sus toHaveLength sin tocar.
- **Ningun toEqual paso a toContain** en ninguno de los dos: comprobado sobre el diff linea a linea. Las dos siguen
  siendo igualdades exactas, o sea siguen mordiendo.

**3. DELETE crudo en R12 y la cota temporal de R9: LOS COMPRO.**
- El DELETE crudo es correcto y esta bien argumentado: tx.user.delete devolveria el P2003 de Prisma y el caso
  dejaria de afirmar sobre el SQLSTATE, que es literalmente el criterio de tasks.md > T13. Ademas el archivo ya
  usaba SQL crudo para las escrituras que se espera que fallen, asi que no inventa un patron.
- La holgura de 60 s **no debilita** el caso: lo que de verdad lo cierra es
  accountStatusChangedAt.getTime() === createdAt.getTime(), que va sin holgura ninguna. La ventana con tolerancia
  es un cinturon extra, no la afirmacion principal, y evita un rojo intermitente si algun dia lo rellenara el reloj
  del servidor.

**4. El literal active del backfill vigilado contra SEED_ADMIN_ACCOUNT_STATUS: LO COMPRO, con reserva.** Funciona
y es falsable —lo verifique: con la constante en inactive cae «actualiza TODAS las filas, sin WHERE»—, y hacerlo
por cuenta propia habria sido cambiar el contrato. Pero acopla dos conceptos que el spec mantiene separados: «el
estado del admin del seed» y «el estado de las filas preexistentes». Ver menor 3.

**5. La deuda de QC-47 sobre el backfill bajo FORCE RLS: LA COMPRO, y la subrayo.** La cita esta donde el
implementer dice (progress/impl_QC-47-....md > La comprobacion de RLS (T5)) y la decision heredada —no envolver en
NO FORCE/FORCE— es la misma que tomo QC-47, no una salida inventada: eso es exactamente lo que pedia T3. El
agravante que el propio implementer anota es real y no estaba en QC-47: alli un SET NOT NULL posterior habria
delatado un backfill que afecta a cero filas; **aqui la columna nace NOT NULL DEFAULT y no hay nada que delate el
fallo silencioso**. Ver menor 5.

---

## Comprobacion que pidio el humano al aprobar el spec

**El seed de QC-6 escribe active explicito (R7): CUMPLE.** Cadena verificada de punta a punta:
domain/seed-initial-access.ts pasa SEED_ADMIN_ACCOUNT_STATUS -> el puerto lo declara **obligatorio**
(accountStatus: UserAccountStatus, no opcional, asi que no hay puerta de atras) -> el adaptador lo escribe como una
columna mas del **mismo user.create**, en la misma sentencia y transaccion que roleId y companyId.
accountStatusChangedBy no se escribe (NULL = el sistema). Lo cierran dos tests, uno con dobles y otro contra
Postgres real, y **el mutante confirma que caen**. Una instalacion nueva no se cierra sobre si misma cuando llegue
QC-78.

---

## Hallazgos

### menor 1 — T8, T12 y T18 sin marcar en tasks.md
CHECKPOINTS.md > Especificacion pide todas las tasks [x]. Las tres que faltan son cierres de gate (./init.sh
--rapido x2 y ./init.sh completo) que por el reparto de AGENTS.md corre el leader, no el implementer. **No es del
implementer**: se cierran cuando el leader tenga el gate en verde. Se anota para que no se olviden antes de pasar
la ficha a done.

### menor 2 — R6 y la reversibilidad de R17 solo tienen automatizado el nivel estatico
Los dos se verifican con predicados sobre el TEXTO del migration.sql y del down.sql, bien construidos y falsables.
La comprobacion contra Postgres real —dos filas preexistentes (una con deleted_at) que quedan active, y el snapshot
antes/despues del db:rollback sin una sola diferencia— la hizo el implementer **a mano** y esta escrita en la
bitacora, pero **no la reproduce la suite**. Es el limite conocido del repo (no se aplica una migracion dentro de un
test de integracion sin montar base efimera) y el design lo asumio; se anota como deuda, no como bloqueo.

### menor 3 — el backfill se vigila contra la constante del seed, que es otro concepto
backfillSetsEveryRowActive exige valor === SEED_ADMIN_ACCOUNT_STATUS. Hoy los dos valen active y el test es
correcto y falsable. Pero si manana alguien cambiara SEED_ADMIN_ACCOUNT_STATUS, el test exigiria editar una
migracion **ya aplicada**, que es justo lo que no se puede hacer. La salida limpia es una constante propia para «el
estado de las filas preexistentes»; el implementer hizo bien en no inventarla por su cuenta (seria cambio de
contrato). Decision del leader para QC-66/QC-78.

### menor 4 — la guardia de alcance se pondra roja en dev limpio despues del merge
tests/unit/identity/account-status-scope.test.ts calcula lo tocado como git diff --name-only dev...HEAD union git
status --porcelain, y luego afirma expect(tocados.length).toBeGreaterThan(0) en cuatro casos. Una vez mergeada la
ficha, sobre dev con el arbol limpio ese conjunto es **vacio** y esos casos caen. No es invento de esta ficha: es
exactamente el patron de tests/unit/configuracion-ui/data-table-intacta.test.ts (QC-45), que hoy pasa en el arbol
principal solo porque ese arbol esta sucio. Deuda heredada y de repo, no fallo de QC-65, pero conviene que el
leader lo sepa **antes** del merge: son dos guardias con la misma bomba de relojeria.

### menor 5 — deuda de RLS heredada, con un agravante nuevo
El backfill corre en local porque el rol de DIRECT_URL es postgres, superusuario con BYPASSRLS: pasa por la razon
equivocada. Con un dueno NO superusuario sobre una tabla con ENABLE+FORCE y cero policies, el UPDATE **afecta a
cero filas y no falla**. QC-47 lo midio y decidio no mitigar; QC-65 hereda la decision tal cual, que es lo correcto
segun T3. El agravante: aqui no hay ningun SET NOT NULL posterior que delate el fallo, asi que un despliegue fuera
de local podria dejar a **todos** los usuarios existentes en pending sin que nada proteste — y solo se notaria
cuando QC-78 corte el login. Decision del leader antes del primer despliegue no local; no bloquea esta ficha.

---

## Lo que se corrio para escribir esta review

    pnpm typecheck                                                sin errores
    pnpm lint                                                     sin errores
    vitest tests/unit/identity                                    34 archivos / 496 pasados
    vitest tests/integration/identity                              4 archivos /  85 pasados
    vitest tests/guards                                           21 archivos / 194 pasados
    vitest tests/unit/proveedores/module-contract.test.ts          9 pasados (sin tocar el archivo)
    vitest tests/unit/navegacion/private-layout-menu.test.tsx      2 fallidos / 6 pasados (rojo ajeno)
    vitest los tres flaky, en solitario                           54 pasados
    mutacion SEED_ADMIN_ACCOUNT_STATUS -> inactive                caen [SU] y [M]; restaurado
    mutacion lib/shared/tmp-rev-qc65.ts que lee accountStatus     cae [A] (R19); archivo borrado

El arbol quedo como estaba: git status identico al de antes de la revision.
