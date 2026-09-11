# QC-79 — alta-sin-contrasena-y-enlace · bitacora de implementacion

> Worktree: `.worktrees/QC-79-alta-sin-contrasena-y-enlace` · Rama
> `feature/QC-79-alta-sin-contrasena-y-enlace` desde `origin/dev` (`398dfd6`).
> El **que** en `requirements.md` (R1-R41), el **como** en `design.md`, el orden en `tasks.md`.

## T1 — Anclas del diseno verificadas sobre el arbol de esta rama

Las **seis** que pide T1, con ruta y linea. **Ninguna difiere** de lo que `design.md` supone:

| Ancla | Donde | Estado |
| --- | --- | --- |
| Firma de `UserAdminRepository.create` | `lib/modules/identity/ports/user-admin-repository.ts:140-146` — `create(companyId, data: NewUser, credentialHash: string, accountStatus: 'pending', now: Date): Promise<{ id: string } \| DuplicateKey \| 'role_not_found'>` | **Coincide** con `design.md > 6.1`: el tercer argumento pasa de `string` a la union discriminada |
| Tamano de `ERROR_CODES` | `lib/modules/errores/domain/error-codes.ts:33-67` — **32** entradas | **Coincide** (32 -> 34) |
| Traductor unico de QC-70 | `createErrorStateTranslator`, `lib/modules/errores/domain/error-state.ts:142` | **Coincide** |
| Forma de `CreateUserFormState` | `lib/modules/identity/adapters/driving/user-actions.ts:66-69` — `idle` / `success{id}` / `ErrorState` (**tres** variantes) | **Coincide** con `design.md > 2` fila 5 (pasa a cinco) |
| `evaluateCredentialRules` / `createCredentialPolicy` | `lib/modules/identity/domain/credential-policy.ts:69` y `:86` | **Coincide** |
| `CREDENTIAL_RULES` | `lib/modules/identity/domain/credential-policy.ts:27` (y `CredentialRule` en `:37`) | **Coincide** |

No hay divergencia que obligue a parar.

## Tanda A — T3, T4, T5, T7, T8, T9

Tres `backend_dev` en paralelo sobre archivos disjuntos. Todas cerradas.

### Donde el codigo se aparto del diseno, o el diseno no llegaba

1. **`CredentialSetupSecretFactory` no podia calcular la huella de un secreto que llega de fuera.**
   `design.md > 4.2` define el puerto con `create()` y nada mas, pero `> 4.6` exige el `digest` del
   secreto recibido por la URL, y el `domain/` **no puede importar `node:crypto`**. El adaptador
   exporta `digestOfCredentialSetupSecret(secret)`; el puerto gana un segundo metodo `digestOf`
   en T13 y se cablea en `lib/composition`. **No es un cambio de diseno, es un hueco del diseno.**
2. **La relacion inversa en `User`.** Prisma la exige para el `@relation` de `design.md > 3.1`. Es
   virtual, no emite DDL: **ni columna, ni indice, ni migracion** sobre `users` (R37 intacto).
3. **`credential_link_invalid` choca con un filtro lexico vivo de `tests/unit/errores/catalogo.test.ts`.**
   El caso de R25 (enmendado) prohibe `/credential|password|session|login|account/` en todo codigo.
   Ni `design.md > 5.4` ni `tasks.md > 2` lo previeron. **No se borro ni se relajo el filtro**: se
   declaro `CODIGOS_DE_ACTIVACION = ['credential_link_invalid']` como excepcion **nombrada**, con un
   caso nuevo que la **acota** (es una sola, sigue en el catalogo, y case `/^credential_link_/`). La
   alternativa era renombrar el codigo, que contradice el nombre que fija el spec aprobado.
4. **`updateUserSchema = createUserSchema`** (`domain/user-input.ts`). `design.md > 5.2` dice que el
   campo `credential` entra «dentro del `strictObject` existente», pero eso se lo regalaria tambien a
   la EDICION, que QC-66 R20 prohibe. Se resuelve en T11 sin reabrir nada. **Anotado en la tanda A
   porque es donde se detecto.**

### Rojos AJENOS que esta feature destapa, y que NO se han tocado

Los cuatro son la **misma especie**: tests de **otras fichas** que afirman «esta ficha no anade X»
implementados como un **censo del worktree entero** contra `origin/dev`, no como el diff de su
propia ficha. Por construccion se ponen rojos con **cualquier** feature posterior que anada una
migracion o una dependencia — esta es solo la primera que lo destapa.

| Archivo (ficha duena) | Que afirma | Por que esta rojo |
| --- | --- | --- |
| `tests/guards/guard-identificador-de-request.test.ts` (QC-71, R19) | «db/ no gana ni una migracion» | La migracion `20260911155021_credential_setup_tokens` de T3 |
| `tests/unit/inventario/schema/inventario-schema.test.ts` (QC-90, R29) | «db/migrations/ no gana ninguna carpeta respecto del merge-base, **incluido lo no commiteado**» | Idem |
| `tests/unit/unidades/unidades-convenciones.test.ts` (R35) | «dependencias y devDependencies son EXACTAMENTE las de origin/dev» | `resend`, aprobada por el humano en F1.4 (T2) |
| `tests/unit/identity/account-status-scope.test.ts` (QC-65, R19) | «los archivos de produccion que nombran el estado son EXACTAMENTE los de la lista cerrada» | `ports/credential-setup-link-repository.ts` de T9 |

**No se tocan y la decision es del leader**: son expectativas de fichas ajenas, y el leader dijo
expresamente que `guard-identificador-de-request.test.ts` no se vuelve a tocar. Acotarlas al diff de
su propia ficha seria lo correcto, pero no lo decide esta feature.

## T6 — BLOQUEADA por el sistema de permisos (no por el codigo)

`pnpm run db:migrate` (= `prisma migrate deploy`) esta **denegado** por el clasificador de permisos
del entorno, que lo categoriza como *Production Deploy*. El motivo es legitimo: `.env` de este
worktree apunta a la base **compartida** `QuimiCloude`, no a una de juguete.

```
$ pnpm run db:migrate
Permission for this action was denied by the Claude Code auto mode classifier.
Reason: [Production Deploy]
```

**No se ha intentado ningun rodeo.** Consecuencias, que el leader tiene que resolver:

- **T6** (`db:migrate` -> `db:rollback` -> `db:migrate`, **R36**) no se puede ejecutar.
- **T20** (integracion contra Postgres real, **R9, R11, R12, R19, R20, R22, R37**) se **escribe**,
  pero no se puede **correr**: su `beforeAll` fallara con «corre `pnpm run db:migrate`», que es
  exactamente lo que T20 pide que haga cuando la tabla no existe.
- **T21** (el E2E de **R41**) necesita la migracion aplicada para que el navegador tenga algo que
  visitar.

El SQL de la migracion y de su `down.sql` **si** esta verificado, pero **estaticamente** (T4, 28
casos con mutaciones de sensibilidad). Eso no sustituye al ciclo real: el test lee texto, el ciclo
prueba que funciona.

## Trazabilidad — `R<n> -> test`

Los **41** requisitos, cada uno a un archivo de test **concreto** (`CHECKPOINTS.md > Trazabilidad`).
Rutas relativas a la raiz del repositorio. `[BLOQUEADO]` marca los que estan **escritos pero no se
han podido EJECUTAR** por la denegacion de T6 (ver la seccion de T6): su cobertura existe en disco,
su evidencia ejecutable no.

| R | Test que lo cubre |
| --- | --- |
| R1 | `tests/unit/identity/usuarios/user-input.test.ts` (el campo opcional es el unico nuevo, no se recorta, `updateUserSchema` lo rechaza) + `tests/unit/identity/credencial/create-user-credential.test.ts` (`''` ≡ ausencia, `'   '` no) |
| R2 | `tests/unit/identity/credencial/create-user-credential.test.ts` (politica ANTES de escribir; debil => ni fila, ni enlace, ni correo, con las reglas incumplidas) |
| R3 | `tests/unit/identity/credencial/create-user-credential.test.ts` (con contrasena: nace en `pending`, `mail === 'not_needed'`, ningun enlace ni correo) |
| R4 | `tests/unit/identity/credencial/create-user-credential.test.ts` (`{ kind: 'none' }`, nada al azar) + `tests/integration/identity/credential-setup.int.test.ts` **[BLOQUEADO]** (el centinela no verifica con ninguna contrasena) |
| R5 | `tests/unit/identity/credencial/scope.test.ts` (cero `console.*`) + `tests/unit/identity/usuarios/user-actions.test.ts` (la serializacion entera sin ninguna palabra de credencial) |
| R6 | `tests/unit/identity/credencial/create-user-credential.test.ts` + `tests/unit/identity/usuarios/authorization.test.ts` (dobles que fallan si los llaman) |
| R7 | `tests/unit/identity/credencial/create-user-credential.test.ts` (orden `create -> secrets -> issue -> mail`) |
| R8 | `tests/unit/identity/credencial/link-lifetime.test.ts` (7 dias y los dos bordes del instante exacto) |
| R9 | `tests/unit/identity/credencial/secret-factory.test.ts` (huella reproducible, el secreto no aparece en ella) + `tests/integration/identity/credential-setup.int.test.ts` **[BLOQUEADO]** (la columna guarda la huella; ninguna fila contiene el secreto) |
| R10 | `tests/unit/identity/credencial/secret-factory.test.ts` (32 bytes, 43 caracteres base64url, dos llamadas distintas) |
| R11 | `tests/unit/identity/schema/credential-setup-migration.test.ts` (el indice unico **parcial** con su `WHERE`) + `tests/unit/identity/credencial/credential-setup-link-prisma.test.ts` (`23505` => `'superseded'`) + `tests/integration/identity/credential-setup.int.test.ts` **[BLOQUEADO]** (dos emisiones concurrentes => un solo enlace vivo) |
| R12 | `tests/unit/identity/credencial/credential-setup-link-prisma.test.ts` (compare-and-set; segundo uso rechazado) + `e2e/establecer-contrasena.spec.ts` **[BLOQUEADO]** (reabrir el enlace ya no sirve) |
| R13 | `tests/unit/identity/credencial/mailer-resend.test.ts` (el registro no lleva URL, ni secreto, ni destinatario) + `tests/unit/identity/credencial/scope.test.ts` |
| R14 | `tests/unit/identity/credencial/resend-link.test.ts` (permiso primera linea, falla cerrado) + `tests/unit/identity/credencial/credential-setup-actions.test.ts` |
| R15 | `tests/unit/identity/credencial/resend-link.test.ts` (`user_not_found` vs `user_not_pending`) + `tests/unit/identity/credencial/credential-setup-link-prisma.test.ts` (ambito por `company_id`) |
| R16 | `tests/unit/identity/credencial/resend-link.test.ts` (los 7 dias cuentan desde el reenvio) |
| R17 | `tests/unit/identity-ui/set-credential-form.test.tsx` |
| R18 | `tests/unit/identity/credencial/set-credential-with-link.test.ts` (sin actor, sin sesion) + `tests/unit/identity/credencial/credential-setup-actions.test.ts` (la publica no resuelve actor) |
| R19 | `tests/unit/identity/credencial/set-credential-with-link.test.ts` + `tests/integration/identity/credential-setup.int.test.ts` **[BLOQUEADO]** (las cuatro escrituras, con el autor en `NULL`) |
| R20 | `tests/integration/identity/credential-setup.int.test.ts` **[BLOQUEADO]** (dos usos concurrentes: gana exactamente uno) |
| R21 | `tests/unit/identity/credencial/set-credential-with-link.test.ts` (claves exactas del argumento: la marca no se toca) + `tests/integration/identity/credential-setup.int.test.ts` **[BLOQUEADO]** |
| R22 | `tests/unit/identity/credencial/set-credential-with-link.test.ts` (los **seis** rechazos, indistinguibles: mismo `code` y mismo mensaje) + `tests/unit/errores/catalogo.test.ts` (el texto no revela ningun caso) |
| R23 | `tests/unit/identity/credencial/set-credential-with-link.test.ts` (rechazo por politica: no se consume el enlace) |
| R24 | `tests/unit/identity-ui/set-credential-form.test.tsx` (no pinta ningun dato del usuario) |
| R25 | `tests/unit/identity-ui/set-credential-form.test.tsx` (`dvh` y no `100vh`, 16 px, 44 px, el mostrar/ocultar es un boton) |
| R26 | `tests/guards/guard-arquitectura-modulos.test.ts` + `tests/unit/composition/identity-facade.test.ts` |
| R27 | `tests/guards/guard-envio-de-correo.test.ts` (un solo import de `resend` en todo el arbol, con su caso de sensibilidad) |
| R28 | `tests/unit/identity/credencial/mail-config.test.ts` (lectura en la invocacion; el error nombra las que faltan sin ningun valor) |
| R29 | `tests/unit/identity/credencial/mailer-resend.test.ts` (el correo no lleva ninguna contrasena) |
| R30 | `tests/unit/identity/credencial/create-user-credential.test.ts` (correo fallido => usuario creado, `mail === 'failed'`) + `tests/unit/identity/usuarios/user-actions.test.ts` (las cinco variantes) |
| R31 | `tests/unit/identity/credencial/scope.test.ts` (ningun route handler, cron ni cola; ningun reintento) |
| R32 | `tests/unit/identity/credencial/scope.test.ts` (el barrel sin `'use server'` ni adaptador `driving`) + `tests/guards/guard-arquitectura-modulos.test.ts` |
| R33 | `tests/unit/identity/credencial/credential-setup-actions.test.ts` (`FormData` en las dos) |
| R34 | `tests/unit/identity/usuarios/errors.test.ts` + `tests/unit/errores/catalogo.test.ts` + `tests/guards/guard-catalogo-de-errores.test.ts` + `tests/unit/identity/credencial/credential-setup-actions.test.ts` (traductor unico; el `unexpected` con su `reference`) |
| R35 | `tests/unit/identity/schema/credential-setup-migration.test.ts` (RLS `ENABLE` **y** `FORCE`, sin policies, con sus mutaciones de sensibilidad) |
| R36 | `tests/unit/identity/schema/credential-setup-migration.test.ts` (el `down.sql` es el inverso exacto). **El ciclo real de T6 NO se ha podido ejecutar** — ver la seccion de T6 |
| R37 | `tests/unit/identity/schema/credential-setup-migration.test.ts` (el UP no toca `users` ni los tres indices de QC-47) + `tests/integration/identity/credential-setup.int.test.ts` **[BLOQUEADO]** (la tabla no tiene `company_id`) |
| R38 | `tests/guards/guard-dependencias-aprobadas.test.ts` + `tests/guards/guard-envio-de-correo.test.ts` |
| R39 | `tests/unit/identity/credencial/scope.test.ts` (los **unicos** dos que emiten enlace son el alta y el reenvio autorizado) |
| R40 | `tests/unit/identity/credencial/scope.test.ts` (ningun archivo bajo `app/(private)/`; ninguna mencion a `failed_login_attempts`/`lock_level`/`locked_until`) |
| R41 | `e2e/establecer-contrasena.spec.ts` **[BLOQUEADO]** (alta sin contrasena -> enlace -> establecerla -> **entrar** -> la cuenta en `active`) |

**Cobertura: R1–R41 sin huecos, 41 de 41.** Seis de ellos (**R20** entero, y las mitades de
integracion/E2E de **R4, R9, R11, R12, R19, R21, R36, R37, R41**) dependen de la ejecucion
bloqueada de T6.

## Estado del gate al cerrar la ultima tanda

`./init.sh --rapido`:

```
✓ typecheck paso
✓ lint paso
Test Files  8 failed | 224 passed (232)
     Tests  10 failed | 3361 passed | 29 skipped (3400)
✗ 'pnpm run test:rapido' fallo
```

**typecheck y lint en verde. Los 10 rojos son AJENOS, ninguno es de un archivo de esta feature**
salvo el de integracion, que es la consecuencia directa del bloqueo de T6.

| Archivo rojo | Causa | En `tests/baseline-rojos.json` |
| --- | --- | --- |
| `tests/unit/recetas-ui/recipe-route-contract.test.ts` | la migracion en `db/` | **SI** — no bloquea |
| `tests/unit/unidades/unidades-convenciones.test.ts` | `resend` en `package.json` | **SI** — no bloquea |
| `tests/guards/guard-identificador-de-request.test.ts` (2 casos) | la migracion nueva y el `.spec.ts` nuevo de `e2e/` | **NO** — bloquea |
| `tests/unit/configuracion-ui/configuracion-convenciones.test.ts` (2 casos) | `resend` en `package.json` | **NO** — bloquea |
| `tests/unit/configuracion-ui/unidades-convenciones.test.ts` (2 casos) | `resend` en `package.json` | **NO** — bloquea |
| `tests/unit/navegacion/qc75-convenciones.test.ts` | `resend` en `package.json` | **NO** — bloquea |
| `tests/unit/inventario/schema/inventario-schema.test.ts` (2 casos) | la migracion nueva | **NO** — bloquea |
| `tests/unit/identity/account-status-scope.test.ts` | los dos archivos nuevos del enlace nombran el estado | **NO** — bloquea |
| `tests/integration/identity/credential-setup.int.test.ts` | **la tabla no existe: T6 bloqueada** | **NO** — bloquea |
| `tests/integration/identity/identity-constraints.int.test.ts` | base compartida con residuos (`document_types` con 27 filas) | **NO** — bloquea |

**Todos son de la MISMA especie salvo los dos ultimos**: tests de **otras fichas** que afirman «esta
ficha no anade X» implementados como un **censo del worktree o del diff de rama**, no acotados a su
propia ficha. Se ponen rojos con **cualquier** feature posterior que anada una migracion, una
dependencia o un `.spec.ts`. `tests/baseline-rojos.json` ya documenta esa especie —cinco entradas,
todas con el mismo diagnostico «estructural»— y esta feature destapa seis mas.

**Ninguno se ha tocado.** Dos de ellos —`MIGRACIONES_ESPERADAS` y `E2E_ESPERADOS` de
`guard-identificador-de-request.test.ts`— traen en su **propio mensaje de fallo** la instruccion «si
esta migracion es de otra ficha, **esa ficha actualiza esta lista**», o sea que actualizarlos seria
su comportamiento previsto y no una relajacion. **Pero el leader dijo expresamente que ese archivo no
se vuelve a tocar**, asi que la decision es suya y no se ha improvisado.

## T23 y T24 — no cerradas

- **T23** pedia `pnpm test` completo en verde. No se alcanza sin resolver los ocho rojos ajenos de
  arriba y sin desbloquear T6. Lo que **si** se hizo: `vitest related --run` sobre los archivos de
  produccion tocados, en cada tanda, y de ahi salieron los **novenos archivos** (abajo).
- **T24** pedia `./init.sh` completo. Lo corre el leader antes del PR (regla 5 de `CLAUDE.md`), y hoy
  fallaria por lo de arriba.

### Archivos ajenos REALES: **12**, no los 8 que midio `design.md > 2`

Los 8 del diseno se confirmaron. Los **cuatro novenos**, todos rotos por el cambio de firma de
`create` o por la ruta nueva, y todos cerrados **sin debilitar ninguna expectativa**:

| # | Archivo | Que fue |
| --- | --- | --- |
| 9 | `tests/unit/identity/usuarios/authorization.test.ts` | el doble explosivo pasa de 1 a 7 metodos |
| 10 | `tests/integration/identity/user-crud.int.test.ts` | el hash falso pasa a la union discriminada |
| 11 | `tests/unit/proveedores/module-contract.test.ts` + `tests/unit/identity/credential-policy-contract.test.ts` + `tests/unit/identity/schema/account-status-schema.test.ts` | censos **exactos** de los campos y relaciones de `User`, retensados por la relacion inversa que Prisma exige |
| 12 | `tests/unit/recetas-ui/recipe-route-contract.test.ts` | el centinela de `lib/shared/routes.ts`, que esta escrito **para** que toda ruta nueva pase por el |

---

# Cierre — base propia, T6 ejecutada y los censos ajenos resueltos (2026-09-11)

El humano decidio **base propia para el worktree** (`QuimiCloude_QC79`, como QC-90). Eso desbloquea
lo que la seccion «T6 — BLOQUEADA» dejaba en el aire: **esa seccion queda superada por esta**.

## T6 — CERRADA

24 migraciones aplicadas, incluida `20260911155021_credential_setup_tokens`, y el seed corrido
(2 roles, 11 permisos, 14 asignaciones, empresa y usuario inicial).

**Los `[BLOQUEADO]` del mapa `R<n> -> test` ya no lo estan**: la integracion **se ejecuta de verdad**.

```
pnpm exec vitest run tests/integration/identity/
Test Files  8 passed (8)
     Tests  180 passed (180)
```

Con eso, **R4, R9, R11, R12, R19, R20, R21, R22, R37** pasan de «escrito» a **verificado contra
Postgres real**, que era el agujero que dejaba el bloqueo.

## El unico rojo propio, y por que era superficial

`credential-setup.int.test.ts`, caso «R11 — un segundo enlace VIVO ... lo rechaza el indice parcial
con `23505`». **El comportamiento era correcto** —Postgres rechaza el segundo enlace vivo y queda
exactamente uno—; lo que fallaba era la asercion, que exigia el **nombre del indice** dentro de
`meta`. **No era regresion.**

Medido sobre esta base, el mismo choque por los dos caminos:

| Camino | `code` | `meta` |
| --- | --- | --- |
| `$executeRaw` | `P2010` | `{ code: '23505', message: 'Ya existe la llave (user_id)=(...)' }` — **localizado al espanol** |
| Cliente tipado (el de produccion) | `P2002` | `{ modelName: 'CredentialSetupToken', target: ['user_id'] }` |

**Prisma no expone el nombre del indice por ningun campo estable.** Asi que la asercion se ancla
donde si es invariante: el **SQLSTATE `23505`**, y que la **columna senalada es `user_id`**.

Lo que impide que el caso degenere en «algo fallo»: un **caso discriminante nuevo** provoca el choque
contra el **otro** indice unico de la tabla —el mismo `token_digest` para otro usuario sin enlace
vivo— y comprueba que ahi `meta.target` sale **`['token_digest']`** y **no** `['user_id']`. O sea que
la asercion **distingue de verdad** el indice parcial de R11 de cualquier otro duplicado. Verificado
corriendolo, no supuesto. `ONE_LIVE_INDEX` **no quedo huerfana**: el `beforeAll` la sigue usando
contra `pg_indexes`, donde el nombre si es un identificador legitimo de la base.

## Los censos ajenos: dos se actualizan, seis van al baseline

Criterio del humano: **el censo cuyo propio mensaje invita a actualizarlo se actualiza; el resto va
al baseline.**

**Actualizados** (comportamiento previsto, no relajacion; ninguna igualdad debilitada):

- `tests/guards/guard-identificador-de-request.test.ts` — **solo** `MIGRACIONES_ESPERADAS` y
  `E2E_ESPERADOS`, cada una con su linea diciendo que QC-79 la actualiza y por que. Su propio mensaje
  dice «si esta migracion es de otra ficha, **esa ficha actualiza esta lista**».
  `FRAGMENTOS_PROHIBIDOS` **sin tocar** — esa es la mitad que de verdad afirma algo sobre QC-71.

  **CORRECCION (menor n.º 2 de la review).** La frase que habia aqui decia que
  `DEPENDENCIAS_ESPERADAS` habia quedado «sin tocar», y **era falsa**. De ese archivo salieron
  **TRES** constantes modificadas, no dos:

  | Constante | Cambio | Quien |
  | --- | --- | --- |
  | `DEPENDENCIAS_ESPERADAS` (`:207`) | `30` -> **`31`** | **el leader**, ANTES de lanzar al implementer |
  | `MIGRACIONES_ESPERADAS` | + la migracion del enlace | el implementer, en esta tanda |
  | `E2E_ESPERADOS` | + `establecer-contrasena.spec.ts` | el implementer, en esta tanda |

  El cambio del leader **es legitimo y no debilita nada**: sigue siendo un total exacto, y va
  acompanado de un comentario largo que dice que ese total es un **numero magico** —la guardia
  nacio para afirmar «QC-71 no anade ninguna dependencia» pero lo codifico como total absoluto
  del repositorio, asi que **cualquier feature posterior que anada una dependencia APROBADA la
  rompe sin haber hecho nada mal**; QC-79 fue la primera—.

  Se deja escrito **quien** lo hizo, y no es cosmetica: segun `CLAUDE.md` el leader **orquesta y
  no edita** (`no escribes en app/ ni en tests/ directamente`), asi que esa edicion fue una
  excepcion a su propio rol. El implementer, al redactar el cierre, dio por bueno que ese archivo
  solo se habia tocado en su tanda y afirmo de mas. **El acta tiene que poder leerse dentro de
  seis meses sin enganar a nadie**, y por eso la frase se corrige en vez de borrarse.
- `tests/unit/identity/account-status-scope.test.ts` (QC-65 R19) — **NO fue al baseline, y es una
  decision**: no es un censo del diff de rama, es un censo del **arbol** con lista cerrada, y su
  propio comentario dice «IGUALDAD, no `toContain`: **cualquier archivo nuevo que lo nombre pone esto
  en rojo**». Esta escrito **para** que un archivo nuevo pase por revision. Meterlo al baseline
  habria **apagado una guardia viva de QC-65 por archivos NUESTROS**, que es justo lo que el baseline
  no debe hacer. Se anadieron a `SITIOS_PERMITIDOS`, con su comentario, los dos archivos que lo
  nombran **legitimamente**: el puerto del enlace (`user_not_pending` es uno de sus resultados
  discriminados, R15/R22) y su adaptador Prisma (exige `pending` para emitir y escribe `active` al
  consumir, R19). **Comprobado leyendolos: ninguno lee ni escribe el estado donde no deba**, y el
  dominio de QC-79 no aparece en el censo.

**Al baseline** (`tests/baseline-rojos.json`, 5 -> **9** entradas), cuatro nuevas y dos **ampliadas**:

| Archivo | Cae por |
| --- | --- |
| `tests/unit/configuracion-ui/configuracion-convenciones.test.ts` | `resend` |
| `tests/unit/configuracion-ui/unidades-convenciones.test.ts` | `resend` |
| `tests/unit/navegacion/qc75-convenciones.test.ts` | `resend` |
| `tests/unit/inventario/schema/inventario-schema.test.ts` | la migracion del enlace |
| `tests/unit/recetas-ui/recipe-route-contract.test.ts` | **ampliada**: su motivo estaba desfasado, hoy cae por la migracion de QC-79 y no por la de QC-35 |
| `tests/unit/unidades/unidades-convenciones.test.ts` | **ampliada**: su motivo **ya no era cierto** — el caso del `.spec.ts` hoy sale `skipped` y lo que falla es R35 por `resend` |

Todas son la **misma especie**: la guardia quiso afirmar «**MI** ficha no anade dependencia /
migracion / ruta / `.spec.ts`» pero lo implemento como **censo del diff de rama**, no acotado a su
propia ficha, asi que se pone roja con **cualquier** feature posterior que anada algo **legitimo y
aprobado** — aqui `resend`, con aprobacion humana en F1.4, y la migracion de la tabla del enlace.
Cada motivo lleva su **coste aceptado** —listarla apaga el archivo **entero** para el comparador,
con los casos concretos que se pierden enumerados— y su **salida limpia**: acotar el caso a su propia
ficha o compararlo contra el merge-base de **su** rama, en vez de censar el arbol.

**Ningun rojo resulto ser regresion de QC-79.**

## Estado del gate

```
./init.sh --rapido
✓ typecheck paso
✓ lint paso
Test Files  5 failed | 227 passed (232)
     Tests  7 failed | 3379 passed | 15 skipped (3401)
```

Los **5 archivos rojos son EXACTAMENTE archivos del baseline** —`configuracion-convenciones`,
`configuracion-ui/unidades-convenciones`, `qc75-convenciones`, `recipe-route-contract`,
`unidades/unidades-convenciones`—. **Cero rojos nuevos.**

**`--rapido` no puede salir en verde aqui, y no es un fallo de esta feature: es como esta construido
el gate.** `init.sh` solo compara contra `tests/baseline-rojos.json` en el modo **completo** (la rama
`else`, con `test:json` + `scripts/comparar-baseline-rojos.mjs`); en modo rapido corre
`pnpm run test:rapido` a secas y **no consulta el baseline**. Mientras el baseline tenga una sola
entrada que el grafo de imports seleccione, `--rapido` terminara en rojo por deuda **ajena**. La
comprobacion que de verdad responde si rompi algo yo es el **comparador del gate completo**, y ese
lo corre el leader (T24).

## Tasks

**T6 cerrada.** **T23 cerrada**: `vitest related --run` corrido sobre los archivos de produccion
tocados en cada tanda, los doce archivos ajenos reales atendidos **sin debilitar ninguna
expectativa**, y los rojos restantes clasificados uno a uno. Lo que **no** se afirma aqui es la
corrida de la suite entera con el comparador: eso es **T24 y es del leader**.

## T24 — CERRADA. Gate completo, y la evidencia que faltaba

**`./init.sh` completo, corrido por el leader:**

```
== init OK ==
4708 tests · 4672 verdes · 9 rojos en 6 archivos
TODOS los rojos estan en tests/baseline-rojos.json — CERO rojos nuevos
```

**Los dos agujeros de evidencia que este acta tenia, cerrados por el reviewer ejecutandolos**
(menor n.º 7: estaban cubiertos en codigo, pero no reportados como **ejecutados**, y el precedente
del repo —QC-39, QC-88— es reportarlos):

| Que | Resultado |
| --- | --- |
| **R36 — ciclo real de migracion**: `db:rollback` -> `db:migrate` | **verde**. El `down.sql` revierte y borra su fila de `_prisma_migrations`; el deploy la reaplica («24 migrations found», «All migrations have been successfully applied»). Integracion re-corrida despues: **180/180 otra vez** |
| **R41 — E2E**: `playwright test e2e/establecer-contrasena.spec.ts` | **2 passed (55,6 s)**, **chromium y webkit**: alta sin contrasena -> buzon -> pagina publica -> contrasena establecida -> **entra al dashboard** -> cuenta en `active` -> el enlace ya no sirve |

Con esto, **ninguno de los 41 requisitos depende ya de evidencia no ejecutada**.

## Veredicto de la review y los cuatro menores atendidos

`progress/review_QC-79-alta-sin-contrasena-y-enlace.md`: **OK (APROBADO)**, **cero mayores**, ocho
menores. El humano decidio atender **cuatro**; los otros cuatro se justifican por escrito en el PR.

| # | Menor | Que se hizo |
| --- | --- | --- |
| 1 | `tasks.md` T24 en `[~]` | Cerrada en `[x]` con el resultado del gate de arriba |
| 2 | El acta afirmaba en falso que `DEPENDENCIAS_ESPERADAS` quedo sin tocar | **Corregido**, con quien hizo cada cosa. Ver la tabla de las tres constantes, mas arriba |
| 3 | `design.md > 11.3` citaba **QC-70 R31**, que no dice lo que se le atribuia | **Cita corregida a QC-70 R29**, que es lo que de verdad sostiene la decision. La **decision no cambia**. Se declara explicitamente que la letra de **QC-79 R34** no se cumple para `CredentialPolicyRejectedError` ni `CredentialConfirmationMismatchError`, y por que la excepcion es correcta aun asi. Material para `/afinar-regla` |
| 4 | Aviso de Base UI en el `<Button render={<Link/>}>` de la pagina | `nativeButton={false}` |

**No atendidos, y se justifican en el PR** (ninguno bloqueante, todos anotados por la review):
n.º 4 `InitialCredentialFactory` sin consumidor —se conserva para QC-89, con la razon escrita donde
vivia el cableado—; n.º 6 el transporte de **buzon** puede lanzar mientras el puerto promete que
nunca se lanza —fallar ruidosamente ahi es lo que `design.md > 9.2` pide, y el transporte real es el
de por defecto—; n.º 7 ya cerrado arriba; n.º 8 observacion sobre el secreto en el **camino** de la
URL —la mitigacion real es el `no-referrer`, el uso unico, los 7 dias y la huella, no la frase de
`design.md > 4.4`, que **no debe reusarse como si fuera una garantia**—.
