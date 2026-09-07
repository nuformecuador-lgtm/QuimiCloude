# QC-47 — modelo-empresa-y-membresias · bitacora de implementacion

> **Reescrita de cero el 2026-09-04.** La version anterior de este archivo describia la PRIMERA
> VUELTA de la ficha: un modelo de muchos a muchos con tabla `memberships` y el rol mudado alli.
> El humano reacoto la ficha y ese modelo esta descartado entero. No se le ha anadido un apendice
> a la bitacora vieja porque quedaria mintiendo sobre lo que hay en la rama.
>
> El slug dice «membresias» y ya no hay membresias: se conserva a proposito (`requirements.md`).

## Que se construyo

Una tabla `companies` y **una columna nueva en `users`: `company_id`**, obligatoria, con FK
`RESTRICT`. Un usuario pertenece a **una sola** empresa y tiene **un solo** rol.
**`users.role_id` no se toco**: sigue exactamente donde estaba. Y el correo, el nombre de usuario
y el documento pasan a ser unicos **dentro de la empresa**, lo que obligo a rehacer los tres
indices unicos de QC-4.

## Tandas y commits

| Commit | Que |
| --- | --- |
| `bb6f65b` | **Tanda A** — fuera el modelo de muchos a muchos. Membership desaparece, `role_id` vuelve byte a byte, los 19 fixtures y las guardias se revierten a `dev` con `git checkout` |
| `8ae8f21` | **Merge de `dev`** (12 commits, trajo QC-62). Hecho a mitad de camino a proposito, no al final |
| `979b0b5` | **Tanda B** — `companies`, `users.company_id`, migracion reescrita en su sitio + carpeta renombrada, los tres unicos rehechos, `down.sql` y el test de esquema |
| `d1c7455` | **Tanda C** — el seed crea la empresa inicial y mete dentro al administrador |
| `fb5f269` | **Tanda D** — los 15 fixtures ajenos ganan su empresa; 4 guardias retensadas |
| `451f543` | **Tanda D** — la unicidad dentro de la empresa, medida contra Postgres real |
| `8bdaae1` | **Fix** — la empresa efimera de 9 fixtures nacia con nombre literal (ver «Lo que salio mal») |

## La comprobacion de RLS (T5) — pregunta abierta 3, cerrada

**La pregunta:** `users` quedo desde QC-4 con `ENABLE` + `FORCE ROW LEVEL SECURITY` y **cero
policies**. El backfill de esta ficha necesita **escribir** ahi, cosa que ninguna migracion
posterior a QC-4 habia hecho. `FORCE` alcanza tambien al dueno de la tabla.

**Medido contra `QuimiCloude_QC47` con la cadena `DIRECT_URL` que usa Prisma Migrate:**

```
OK | quien soy         | current_user=postgres  is_superuser=on
OK | atributos del rol | rolsuper=true  rolbypassrls=true
OK | rls forzada       | relrowsecurity=true  relforcerowsecurity=true
OK | policies en users | 0
-- ensayo del backfill real, en transaccion que acaba en ROLLBACK --
OK | ADD COLUMN + UPDATE ... SET | rows=1
OK | SELECT tras el UPDATE       | escritos=1
OK | SET NOT NULL                | (sin error)
```

**Respuesta: si pasa — pero pasa por la razon equivocada, y eso importa mas que el si.** El rol
local es superusuario **con BYPASSRLS**, y un superusuario salta la RLS pase lo que pase,
`FORCE` incluido. La medicion demuestra que el backfill corre **aqui**, no que la RLS lo deje
pasar.

Asi que se midio tambien el caso que el superusuario oculta: misma configuracion
(`ENABLE`+`FORCE`, cero policies) sobre una tabla cuyo **dueno NO es superusuario**:

```
OK | >>> UPDATE como duenyo NO superusuario <<< | (sin error, 0 filas afectadas)
OK | >>> SELECT como duenyo NO superusuario <<< | visibles=0
```

**El UPDATE no falla: afecta a cero filas y se calla.** Es el modo de fallo peor.

**Decision tomada, y por que no se improviso otra.** El backfill se escribe **tal cual** dice
`design.md > 3.2`, **sin** envolverlo en NO FORCE / FORCE. T5 dice «si no pasa, se aplica la
salida del riesgo 2; no se elige a ciegas» — y paso. Elegir la salida igualmente seria aplicar
una mitigacion que la medicion no pide. El riesgo residual queda **acotado**: el paso 6 del UP es
`SET NOT NULL`, que sobre una base con usuarios y un backfill sin efecto revienta con `23502`.
Es decir, **un despliegue con dueno no superusuario rompe ruidosamente en vez de callarse**.
Queda anotado para la ficha que despliegue fuera de local; **el leader decide** si quiere la
mitigacion preventiva.

## Archivos creados y modificados

**Esquema y migracion**
- `db/schema.prisma` — `model Company` (con `users User[]`); `User` gana `companyId` + su
  `@@index`; `Role` recupera `users User[]`; `roleId` intacto
- `db/migrations/20260904180600_companies_and_user_company/migration.sql` — **renombrada** desde
  la carpeta vieja con `git mv`, y reescrita entera
- `db/migrations/20260904180600_companies_and_user_company/down.sql` — reescrito entero

**Dominio y adaptadores de `identity`**
- `lib/modules/identity/domain/companies.ts` — `INITIAL_COMPANY_NAME` (conservado de la 1.a vuelta)
- `lib/modules/identity/domain/company-name.ts` — `normalizeCompanyName` (conservado)
- `lib/modules/identity/index.ts` — contrato publico (conservado)
- `lib/modules/identity/ports/initial-access-repository.ts` — el puerto gana la empresa
- `lib/modules/identity/domain/seed-initial-access.ts` — resuelve la empresa dentro de `needsAdmin`
- `lib/modules/identity/adapters/driven/persistence/initial-access-repository-prisma.ts`
- `.../user-credentials-prisma.ts` y `.../session-user-prisma.ts` — **revertidos a `dev`**
- `scripts/seed.ts` — **no se toco** (ver «Decisiones que el leader tiene que mirar», punto 1)

**Tests propios**
- `tests/unit/identity/schema/companies-migration.test.ts` (reescrito), `.../identity-schema.test.ts`
- `tests/unit/identity/company-name.test.ts` (conservado intacto)
- `tests/unit/identity/seed/seed-initial-access.test.ts`
- `tests/integration/identity/{identity-constraints,login,session-user,identity-seed}.int.test.ts`

**Fixtures ajenos que ganan `companyId` (15)**
- `e2e/{login,session,inventario,recetas,proveedores}.spec.ts`
- `tests/integration/inventario/product-crud`, `recetas/{recetas-constraints,recipe-crud}`,
  `pedidos/{order-crud,order-repository,order-sequence,pedidos-constraints}`,
  `proveedores/{catalog-line,supplier-crud,proveedores-constraints}`

**Guardias ajenas retensadas (4)** — ver la nota dedicada mas abajo
- `tests/unit/identity/credential-policy-contract.test.ts`
- `tests/unit/proveedores/module-contract.test.ts`, `tests/unit/proveedores/scope.test.ts`
- `tests/unit/recetas-ui/recipe-route-contract.test.ts`

## Mapa de trazabilidad R<n> -> test

Los 29 requisitos, cada uno con archivo y titulo de test. Sin hueco.

| R | Que exige | Test |
| --- | --- | --- |
| **R1** | id propio, no correlativo, generado por la base | `identity-constraints` › *el id de la empresa lo genera la base y no es correlativo* · `identity-schema` › *Company declara id uuid generado por la base, nombre, normalizado y sus tres fechas* |
| **R2** | nombre obligatorio en la base, sin limite de longitud | `identity-constraints` › *rechaza una empresa sin nombre y no limita la longitud del nombre* |
| **R3** | nombre normalizado en columna propia, definicion unica | `unit/identity/company-name` (8 casos) · `companies-migration` › *el literal de la empresa sale de la UNICA definicion, y el test cae si divergen* |
| **R4** | segunda empresa viva con el mismo nombre -> rechazada por indice | `identity-constraints` › *rechaza una segunda empresa con el mismo nombre en otras mayusculas y con acentos* · `identity-schema` › *la unicidad del nombre de empresa NO esta en el esquema, y es deliberado* |
| **R5** | empresa de baja libera su nombre | `identity-constraints` › *el nombre de una empresa dada de baja se puede reutilizar* |
| **R6** | `deleted_at` nace vacia y nadie la escribe | `companies-migration` › *la empresa nace con deleted_at, con sus marcas de tiempo y sin varchar(n)* |
| **R7** | `created_at`/`updated_at` y el segundo cambia | `identity-constraints` › *created_at y updated_at de la empresa se rellenan solos y updated_at cambia al modificar* |
| **R8** | identificadores en ingles y snake_case | `companies-migration` › *la empresa nace con deleted_at...* + *la columna de empresa entra anulable, se endurece y queda con FK RESTRICT e indice* |
| **R9** | referencia a exactamente una empresa, obligatoria en la base | `identity-schema` › *companyId es obligatorio, uuid y mapea a company_id (R9)* · `identity-constraints` › *rechaza un usuario sin empresa o con una empresa inexistente* |
| **R10** | empresa inexistente -> rechazada por la base | `identity-constraints` › *rechaza un usuario sin empresa o con una empresa inexistente* · `identity-schema` › *la relacion User-Company va con @relation y ON DELETE RESTRICT* |
| **R11** | borrar empresa con usuarios -> rechazado (vivos **y** de baja) | `identity-constraints` › *rechaza borrar una empresa con un usuario vivo dentro* + *rechaza borrar una empresa cuyo unico usuario esta dado de baja* + *permite borrar una empresa sin ningun usuario* |
| **R12** | ninguna tabla ni modelo de pertenencia multiple | `identity-schema` › *nadie puede estar en dos empresas: no hay modelo intermedio (R12)* + *companyId lleva su indice y NO lleva unicidad* · `companies-migration` › *crea UNA sola tabla, y es la empresa: no hay tabla intermedia* |
| **R13** | el rol se conserva en la fila del usuario, sin tocar | `identity-schema` › *roleId es obligatorio y FK a Role* + *la relacion User-Role declara onDelete Restrict* + *roleId no tiene restriccion de unicidad* · `companies-migration` › *ni el UP ni el DOWN nombran la FK ni el indice del rol* · `identity-constraints` › *el usuario se crea con su rol y su empresa como columnas propias de su fila* |
| **R14** | el rol se resuelve de esa columna, sin lectura adicional | `login` › *el rol del login sale de users.role_id y cambia con el, sin una segunda lectura* · `session-user` › *el rol cambiado entre dos lecturas devuelve el nuevo* · `seed-initial-access` › *needsAdmin sale de countLiveUsersWithRole(Administrador), leido de users.role_id* |
| **R15** | ni roles ni tipos de documento ganan empresa | `identity-schema` › *roles y tipos de documento NO ganan columna de empresa (R15)* · `identity-constraints` › *dos usuarios de empresas distintas comparten el mismo rol del mismo catalogo* |
| **R16** | correo unico **dentro** de la empresa | `identity-constraints` › *rechaza el mismo correo en la misma empresa y lo acepta en otra* · `companies-migration` › *los tres se borran y se recrean con company_id como primera columna* |
| **R17** | usuario unico **dentro** de la empresa | `identity-constraints` › *rechaza el mismo nombre de usuario en la misma empresa y lo acepta en otra* |
| **R18** | documento unico **dentro** de la empresa | `identity-constraints` › *rechaza el mismo documento en la misma empresa y lo acepta en otra* |
| **R19** | ninguna unicidad global, y solo entre vivos | `companies-migration` › *conservan el lower(...) y el WHERE deleted_at IS NULL que QC-4 les dio (R19)* · `identity-constraints` › *dar de baja a un usuario libera su correo, su username y su documento dentro de su empresa* |
| **R20** | el seed deja empresa + semilla en la misma transaccion | `seed-initial-access` › *sobre una base vacia crea la empresa inicial y el administrador DENTRO de ella, en la misma llamada* · `identity-seed` › *la primera corrida deja la empresa inicial con el usuario semilla dentro; la segunda no crea una segunda empresa* |
| **R21** | el nombre sale de una unica constante, no del entorno | `companies-migration` › *el literal de la empresa sale de la UNICA definicion, y el test cae si divergen* · `company-name` › *la empresa inicial normaliza a quimicloud, que es lo que persistira el backfill* |
| **R22** | el seed es idempotente | `seed-initial-access` › *si la empresa inicial ya existe la reutiliza por nombre normalizado y NO crea una segunda* + *sobre una base que ya tiene acceso inicial no toca companies NI PARA LEER* · `identity-seed` › *la primera corrida ... la segunda no crea una segunda empresa* |
| **R23** | la migracion mete a todos y no toca el rol de nadie | `companies-migration` › *mete a TODOS los usuarios, incluidos los dados de baja (R23)* + *no menciona la columna del rol fuera de los comentarios (R13, R23)* + *no crea ninguna empresa si no hay ningun usuario (R20)* |
| **R24** | RLS activada **y** forzada en la tabla nueva | `companies-migration` › *companies queda con RLS activada Y forzada* · `identity-constraints` › *companies tiene ROW LEVEL SECURITY activada y forzada* |
| **R25** | revertir devuelve el esquema exacto, indices incluidos | `companies-migration` › *devuelve los tres indices unicos al TEXTO LITERAL de QC-4 (R25)* + *quita el indice, la FK y la columna de empresa, en ese orden* + *borra la empresa la ultima y no toca pgcrypto*. **Ademas, medido:** ciclo migrate -> rollback con diff de snapshots VACIO |
| **R26** | si revertir perdiera un dato, la reversion aborta | `companies-migration` › *empieza por la guardia de R26, antes de tocar el esquema*. **Ademas, medido** contra Postgres real: la guardia se disparo con dos empresas que comparten `ada` |
| **R27** | `identity` es el modulo propietario | `identity-schema` › *Company es del modulo identity (R27)* · `companies-migration` › *Company declara /// @module identity (R27)* · guardia `tests/guards/guard-arquitectura-modulos` |
| **R28** | ni ruta ni pantalla nueva; los E2E pasan sin cambiar de guion | **Medido:** los 5 E2E en chromium+webkit, 18/18. Y el diff de los 5 specs tiene **0** lineas con `test(`, `expect(`, `getByRole`, `getByLabel`, `page.goto` o `toHaveURL` |
| **R29** | ninguna dependencia nueva | `git diff origin/dev -- package.json pnpm-lock.yaml` **vacio**. Guardia `credential-policy-contract` › *esta feature no anade migraciones ni columnas* |

## Salida real de los tests

Sobre `QuimiCloude_QC47` reiniciada desde cero (DROP SCHEMA + `db:migrate` + `db:seed`), para que
el verde no dependa de residuo de corridas anteriores:

```
$ pnpm run typecheck
tsc --noEmit                (sin salida, verde)

$ pnpm run lint
eslint                      (sin salida, verde)

$ pnpm test
 Test Files  186 passed (186)
      Tests  2161 passed (2161)
   Duration  81.41s

$ pnpm exec playwright test e2e/login.spec.ts e2e/session.spec.ts e2e/inventario.spec.ts \
                            e2e/recetas.spec.ts e2e/proveedores.spec.ts
  18 passed (2.1m)          (chromium + webkit)
```

Ciclo de la migracion, verificado contra Postgres real y no leido:

```
$ pnpm run db:migrate
Applying migration `20260904180600_companies_and_user_company`
Applying migration `20260904181500_recipe_steps_reset`
All migrations have been successfully applied.

$ pnpm run db:rollback   &&   diff -u snapshot-antes.json snapshot-despues.json
=== DIFF VACIO: el esquema revertido es IDENTICO al de antes (R25) ===

# guardia del DOWN, con dos empresas que comparten `ada`:
R26 OK — la reversion aborta: QC-47: hay 3 clave(s) de usuario (correo, nombre de usuario o
documento) repetidas entre usuarios vivos de empresas distintas. La reversion se detiene...
```

El snapshot compara columnas con su `ordinal_position`, indices con su `indexdef`, restricciones
con su `pg_get_constraintdef` y la lista de tablas.

Prueba de que el test de R16-R18 **vale algo** (se recrearon los tres indices en su forma global
de QC-4 sobre la base y se volvio a correr):

```
 × rechaza el mismo correo en la misma empresa y lo acepta en otra
 × rechaza el mismo nombre de usuario en la misma empresa y lo acepta en otra
 × rechaza el mismo documento en la misma empresa y lo acepta en otra
      Tests  3 failed | 66 passed (69)
```

Los tres fallan por la mitad «y lo acepta en otra». Restaurada la forma nueva: 69/69.

Y cada asercion del test de esquema se demostro **mutando el archivo vigilado**, no leyendola:
devolver un indice del UP a la forma global, recrear el del DOWN con `company_id`, quitar el
`WHERE deleted_at IS NULL`, cambiar el literal de la empresa, mover el backfill detras del RLS o
detras del `SET NOT NULL`, meter un `DROP COLUMN role_id`, quitar el FORCE y cambiar el
`/// @module`. Cada mutacion tumbo el caso que le tocaba.

## Nota de T20 — las cuatro guardias ajenas, una a una

Tocar la guardia de otra feature merece un segundo par de ojos. **Correccion sobre lo que se creyo
a mitad de camino:** las cuatro estaban **verdes en `dev`**; las caidas las provoco esta feature,
no venian heredadas. Comprobado: los 4 archivos son identicos a `dev`.

1. **`identity/credential-policy-contract`** — el censo de campos de `User` sigue siendo
   **igualdad exacta**; solo se anaden `companyId` y `company`. **`roleId` y `role` siguen en la
   lista**, asi que si alguien volviera a mover el rol, el caso cae. No se aflojo.
2. **`proveedores/module-contract`** — `relationTargets('User')` pasa de `[DocumentType, Role]` a
   `[Company, DocumentType, Role]`. Sigue siendo `toEqual` del conjunto entero, no un `toContain`,
   y los dos `not.toContain` quedan intactos.
3. **`proveedores/scope`** — **no se anadio ninguna migracion a la lista permitida** (sigue
   teniendo tres entradas). El rojo era un **falso positivo**: el censo buscaba `suppliers` en el
   texto **crudo** del SQL y solo lo encontraba en **dos comentarios** que explican por que esta
   migracion NO le hace DDL. Ahora se quitan los comentarios antes de buscar. Es **mas precisa**,
   no mas floja: un solo ALTER real sobre esas tablas la sigue poniendo roja (verificado
   ejecutando el predicado aislado sobre QC-42 y sobre un ALTER de mentira).
4. **`recetas-ui/recipe-route-contract`** — una constante nueva `MIGRACION_QC47` con los **dos
   archivos nombrados uno a uno**; cualquier otro archivo de `db/` sigue poniendo el caso rojo.
   Misma tecnica que el «RETENSADO 2026-09-04 (QC-34)» que el propio archivo ya documenta.
   **Deuda anotada:** esta guardia mide `origin/dev...HEAD`, y desde que QC-34 esta en `dev` ese
   rango ya no mide su rama sino la que corra el gate — **va a volver a caer en la siguiente
   feature que toque `db/`**. Merece ficha propia.

## Lo que salio mal, y por que no lo vio nadie antes

**La empresa efimera de 9 fixtures nacia con un nombre literal.** `Empresa $marker` —sin llaves—
no interpola: los nueve fixtures pedian la MISMA empresa literal, y como `companies_name_unique`
es **global**, la segunda llamada del mismo helper moria con `23505`. En `proveedores-constraints`
la variable ademas no era la del ambito (`marca` en vez de `marker`).

**Por que se escapo, que es lo interesante:** el typecheck **pasa** —un `$` suelto en una
plantilla es texto valido— y a los agentes que escribieron esos fixtures se les prohibio correr la
suite de integracion para que no se pelearan por la base con el agente que corria en paralelo. La
decision de paralelizar fue correcta para la velocidad y **creo exactamente este agujero**. Lo
destapo el gate completo a la primera: 10 rojos. Coste: un commit de arreglo.

**Segunda leccion, del mismo tipo:** dos rojos posteriores (*el catalogo arranca solo con CC* y el
E2E de proveedores) **no eran de la feature**: eran **residuo en la base** de las corridas rotas
—10 `document_types`, 10 `roles` y 10 `presentations` huerfanos—. El E2E de proveedores elige una
presentacion reutilizable de la base, y las huerfanas no llevan el marcador `_e2e_`, asi que las
daba por buenas. Se reinicio la base entera y quedo todo verde. **Un verde sobre una base sucia no
vale**, y tampoco vale un rojo: los dos afirman sobre estado que nadie escribio a proposito.

## Decisiones que el leader tiene que mirar

1. **`tasks.md > T14` se contradice con `design.md > 5.3`.** T14 exige que el diff de
   `scripts/seed.ts` frente a `dev` sea **vacio**; el design conserva `SeedOutcome.createdCompany`
   alimentando su linea de resumen, que es justo un cambio en ese archivo. **Mando el design** y
   `scripts/seed.ts` conserva su unico cambio (la linea de resumen). El propio T14 lo confirma al
   pedir `companies=1`, que sin `createdCompany` no se puede informar.
2. **`pnpm run db:rollback` ya no puede revertir la migracion de esta ficha.**
   `scripts/db-rollback.ts > findLastMigration()` ordena los **nombres de carpeta del sistema de
   archivos** y coge el ultimo, sin mirar nunca `_prisma_migrations`. Como el merge de `dev` trajo
   `20260904181500_recipe_steps_reset`, que ordena **despues** de la nuestra, el comando revierte
   siempre esa —incluso ya revertida, avisando y siguiendo—. Es un agujero real del arnes, no de
   esta feature. Para verificar T10 hubo que apartar temporalmente esa carpeta.
3. **La mitigacion preventiva de RLS.** Ver la seccion de T5: la medicion no la pide y no se
   aplico, pero el modo de fallo con dueno no superusuario es silencioso a nivel de UPDATE.
4. **Desviacion aprobada por el implementer:** en los **10 fixtures de integracion** la empresa
   efimera se crea **dentro del helper transaccional**, no en un `beforeAll` de modulo como dice
   `design.md > 6`. Siete de esos helpers corren dentro de una transaccion que acaba en ROLLBACK,
   y un `beforeAll` obligaria a **comitear una fila real** en archivos cuyo diseno entero es que
   nada sobreviva al test. Los **5 E2E si** siguen el patron literal `beforeAll`/`afterAll`.
5. **La palabra «pertenencia».** El barrido de T7/T21 exige cero aciertos de
   `membership|pertenencia`, pero la ficha del board se llama «Modelo de empresa y pertenencia
   del usuario»: la palabra es vocabulario legitimo del modelo NUEVO. Se reescribieron los 3 usos
   que quedaban (un comentario y dos titulos) para que el barrido de un cero literal y ningun
   lector futuro tenga que adivinar si es residuo o vocabulario.

## Lo que NO entra, y sigue sin entrar

La empresa **no viaja en la sesion** ni se valida en el middleware: es **QC-48**, que hereda
ademas la pregunta abierta 1 —como sabe el login de que empresa eres cuando el nombre de usuario
solo es unico dentro de la empresa—. Separar los datos ya guardados es QC-49/50/51/59/60, y la
guardia de esquema QC-61. No hay CRUD de empresas, ni pantalla, ni selector: no tienen ficha.

**Contrapartida tecnica anotada para QC-48:** `users_username_unique` es ahora
`(company_id, lower(username))`, y el `WHERE lower(username) = ...` del login **ya no puede usarlo
como busqueda por igualdad** —en el mejor caso Postgres recorre el indice en vez de hacer un seek—.
Sobre una unica empresa y decenas de filas es irrelevante y **no se optimiza aqui**; el dia que el
login sepa de que empresa eres, el WHERE gana `company_id` y vuelve a ser un seek.
