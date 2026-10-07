# QC-47 — modelo-empresa-y-membresias · review (SEGUNDA VUELTA)

> Revisado el 2026-09-04 sobre el worktree
> `.worktrees/QC-47-modelo-empresa-y-membresias`, rama
> `feature/QC-47-modelo-empresa-y-membresias`, HEAD `42e6df7`, base propia `QuimiCloude_QC47`.
>
> Se revisa el spec REACOTADO: una empresa por usuario (`users.company_id` obligatoria), un rol
> por usuario, `users.role_id` intacta, sin tabla de pertenencias. El modelo de muchos a muchos
> de la primera vuelta esta descartado y no queda residuo (comprobado).

## Veredicto

**OK** — 0 bloqueantes, 6 menores.

---

## Checklist

### Especificacion
- [x] `requirements.md` con 29 requisitos EARS `R1`-`R29` y la tabla de cobertura de las 17
      decisiones cerradas.
- [x] `design.md` con alternativas descartadas y su porque: 9.1 (segunda migracion aditiva),
      9.2 (`memberships` con unico parcial), 9.3 (PK compuesta), 9.4 (unicidad global de
      correo/usuario), 9.5 (rama nueva desde cero). Cinco, no una.
- [x] `tasks.md` con 24 tasks, las 24 marcadas `[x]`; cero `[ ]`.

### Trazabilidad
- [x] Los 29 `R<n>` mapean a un test nombrado en la bitacora.
- [x] Abiertos los tests, no solo el mapa. El mapa no miente en ningun punto revisado.
- [x] `progress/impl_QC-47-modelo-empresa-y-membresias.md` contiene el mapa `R<n> -> test`.

### Las 17 decisiones cerradas
- [x] 1 UUID aleatorio generado por la base: DDL `"id" UUID NOT NULL DEFAULT gen_random_uuid()`.
- [x] 2 nombre unico sin mayusculas ni acentos: `companies_name_unique` sobre
      `lower(name_normalized)`, medido en la base.
- [x] 3 unico PARCIAL (`WHERE deleted_at IS NULL`): la baja libera el nombre. Verificado contra
      `pg_indexes`.
- [x] 4 `users.company_id` obligatoria (`null=NO` en `information_schema`) y FK
      `users_company_id_fkey ... ON DELETE RESTRICT`, medido en `pg_constraint`. Sin tabla de
      pertenencias: `information_schema.tables` no tiene `memberships`.
- [x] 5 `users.role_id` intacta: `uuid`, `null=NO`, posicion ordinal 11 (la de QC-4),
      `users_role_id_fkey ON UPDATE CASCADE ON DELETE RESTRICT` y `users_role_id_idx`.
      `user-credentials-prisma.ts` y `session-user-prisma.ts` no aparecen en el diff contra
      `dev`: son byte a byte los de antes.
- [x] 6 los tres unicos de QC-4 rehechos con `company_id` como columna lider (medido).
- [x] 7 `deleted_at` nace con la tabla y ninguna operacion la escribe.
- [x] 8 `roles` y `document_types` sin columna de empresa (test `identity-schema` R15).
- [x] 9 literal `QuimiCloud` en una unica constante
      (`lib/modules/identity/domain/companies.ts`), usada por el seed; el backfill la duplica en
      SQL y el test compara las dos importando la constante real.
- [x] 10 la migracion crea la empresa inicial y mete dentro a los usuarios ya cargados sin tocar
      ningun rol. Ejecutado de verdad.
- [x] 11 identificadores en ingles y `snake_case`.
- [x] 12 `created_at` / `updated_at` en `companies`.
- [x] 13 RLS: `relrowsecurity=true relforcerowsecurity=true` en `companies` (medido).
- [x] 14 `down.sql` que revierte al esquema exacto. Medido.
- [x] 15 sin E2E nuevo; los 5 existentes verdes. Corridos por el reviewer: 18/18.
- [x] 16 `/// @module identity` en `Company`.
- [x] 17 ninguna libreria nueva: el diff de `package.json` y `pnpm-lock.yaml` esta vacio.

### Verificacion ejecutable (corrida por el reviewer, no leida)
- [x] `pnpm test`: 186 archivos, 2161 tests, 0 fallos (67 s), corrido despues de mi ciclo de
      migracion sobre la base.
- [x] `pnpm exec playwright test` de los 5 specs: 18 passed (chromium + webkit, 1.2 min).
- [x] `./init.sh` completo: ya verificado por el leader, 0 rojos.

### Calidad y seguridad
- [x] RLS activada y forzada en la tabla nueva (`companies`), al final del UP.
- [x] Sin secretos hardcodeados. El nombre de la empresa inicial no es un secreto y es correcto
      que sea constante del dominio y no variable de entorno (R21).
- [x] Capas separadas: dominio puro (`company-name.ts`, `companies.ts`,
      `seed-initial-access.ts`), puerto ampliado, un solo adaptador Prisma. Ni `app/`, ni ruta,
      ni Server Action (R28).
- [x] Frontera de modulo: buscar `prisma.company|db.company|tx.company` en
      `lib/ app/ components/ scripts/` devuelve solo
      `lib/modules/identity/adapters/driven/persistence/initial-access-repository-prisma.ts`.
- [x] Sin webhooks en esta ficha.

### Multiplataforma
- [x] No aplica: la feature no toca UI. Cero archivos en `app/`, `components/` o `hooks/`.

### Dependencias
- [x] `package.json` y `pnpm-lock.yaml` no estan en el diff. `normalizeCompanyName` no es una
      utilidad que una libreria del stack ya resuelva: es clave de negocio del repo, gemela
      declarada de `normalizeUnitName` y `normalizeSupplierName` (design 7).

### Aislamiento por empresa (docs/architecture.md > Dominio n.1)
- [x] El unico modelo nuevo es `Company`, que ES la empresa: no le corresponde columna de
      empresa. `users` esta en la lista corta de exentas con `roles` y `document_types`.
- [x] QC-47 no aisla consultas y no le toca: inventario QC-49, recetas QC-50, unidades QC-51,
      proveedores QC-59, pedidos QC-60, guardia QC-61. No se marca por eso.

---

## Lo que verifique yo, y como

### 1. Los tres indices unicos, contra la base real
`pg_indexes` sobre `QuimiCloude_QC47`:

```
users_email_unique    ON users (company_id, lower(email))                        WHERE (deleted_at IS NULL)
users_username_unique ON users (company_id, lower(username))                     WHERE (deleted_at IS NULL)
users_document_unique ON users (company_id, document_type_code, document_number) WHERE (deleted_at IS NULL)
```

Las tres propiedades que nadie ve desaparecer estan: `company_id` lider, el `lower(...)` y el
`WHERE` parcial.

Y el `down.sql` los devuelve al texto byte a byte de QC-4. Comparado con `cat -A` contra
`db/migrations/20260806122638_users_and_roles/migration.sql` lineas 75-77: identicos, incluido
el espaciado interior de cada sentencia.

### 2. Mutacion reproducida (el implementer decia haberlo probado; lo probe yo)
Recree `users_email_unique` en su forma global de QC-4 directamente sobre la base y volvi a
correr el caso:

```
x rechaza el mismo correo en la misma empresa y lo acepta en otra
  Unique constraint failed on the fields: (lower(email))
  ...identity-constraints.int.test.ts:1398   <- la mitad "y lo acepta en OTRA empresa"
```

El test cae por la mitad correcta. Restaurada la forma nueva: 39/39 verde. El test vale algo; no
es un test que pasaria igual sin la migracion.

### 3. Ciclo migrate -> rollback, ejecutado
Snapshot del esquema (tablas, columnas con `ordinal_position`, `indexdef`,
`pg_get_constraintdef` y RLS) antes, `down.sql`, snapshot, `migration.sql`, snapshot.

- Tras el DOWN: no queda `companies`, no queda `users.company_id`, no quedan
  `users_company_id_idx` ni `users_company_id_fkey`, y los tres unicos vuelven a su forma global.
  `role_id`, `users_role_id_fkey` y `users_role_id_idx` intactos en todo momento.
- Tras volver a aplicar el UP: el `diff` de los dos snapshots tiene UNA sola linea:
  `users.company_id pos=19` pasa a `pos=20`. Es exactamente el limite que el propio `down.sql`
  declara en su cabecera (un DROP COLUMN + ADD COLUMN no devuelve una tabla a su orden ordinal
  original) y no afecta al DOWN, que es lo que R25 exige. Honestidad declarada de antemano, no
  hallazgo.
- El backfill (R23) se ejecuto de verdad: `empresas=1` (QuimiCloud / quimicloud),
  `usuarios=1 sin_empresa=0`, `usuarios_sin_rol=0`.

### 4. La guardia del DOWN (R26), disparada
Inserte una segunda empresa y un usuario vivo que duplica correo, usuario y documento del de la
instalacion, y corri el `down.sql` en una transaccion:

```
ERROR: QC-47: hay 3 clave(s) de usuario (correo, nombre de usuario o documento) repetidas
       entre usuarios vivos de empresas distintas. La reversion se detiene: ...
```

La reversion queda entera sin aplicar y no se borro ni renombro ninguna fila. Estado tras el
ROLLBACK: `empresas=1`, `usuarios=1`. Es R26 tal cual esta escrito.

### 5. La RLS: el riesgo residual esta bien acotado. NO es bloqueante.
Confirmo las dos mediciones del implementer y anado la que faltaba.

- El rol local es `postgres`, con `rolsuper=true` y `rolbypassrls=true`; `users` esta en
  ENABLE + FORCE con 0 policies. Es decir: el backfill pasa aqui porque el rol salta la RLS, no
  porque la RLS lo permita. La lectura del implementer es correcta y la anoto bien.
- Reproduje el caso que el superusuario oculta: tabla ENABLE + FORCE, cero policies, dueno NO
  superusuario, midiendo COMO ese dueno:

```
UPDATE ... SET company_id = ... WHERE company_id IS NULL;   -> UPDATE 0      (sin error)
SELECT count(*) ...                                          -> 0
ALTER TABLE ... ALTER COLUMN company_id SET NOT NULL;        -> ERROR
```

  Capturado el SQLSTATE dentro de un bloque DO: SQLSTATE=23502, literalmente
  "la columna company_id ... contiene valores null".

Conclusion. La afirmacion del implementer es cierta y esta bien argumentada. El UPDATE falla en
silencio, si, pero el SET NOT NULL del paso 6 es DDL del dueno, NO pasa por la RLS, y ve la
tabla fisica entera. Ademas Prisma corre el `migration.sql` en UNA sola transaccion, asi que un
despliegue con dueno no superusuario no puede commitear una base con `company_id` vacia:
revienta con 23502 y deja la migracion sin aplicar y sin marcar. Da igual incluso que el
`SELECT count(*) INTO usuarios` vea 0 y el bloque salga por el RETURN temprano: la tabla fisica
sigue teniendo filas con NULL y el SET NOT NULL revienta igual.

Por eso NO procede la mitigacion preventiva NO FORCE / FORCE alrededor del UPDATE: aplicarla
seria abrir un agujero de RLS en la tabla mas sensible del sistema para cubrir un modo de fallo
que ya es ruidoso y atomico. La decision del implementer de escribir el backfill tal cual es la
correcta. Se mantiene la anotacion para la ficha que despliegue fuera de local.

### 6. Trabajo fuera de alcance: los 19 fixtures ajenos y las 4 guardias
- Los 5 E2E: filtrar el diff de `e2e/` por `test(`, `expect(`, `getByRole`, `getByLabel`,
  `page.goto` y `toHaveURL` devuelve CERO lineas. Solo entran: el import de
  `normalizeCompanyName`, la empresa efimera del worker en el `beforeAll`, el `companyId` en el
  `user.create`, el barrido de huerfanas y el borrado en el `afterAll` DETRAS de los usuarios
  (por el RESTRICT). Ni una asercion, ni un selector, ni un guion.
- Los 14 de integracion: normalizados los fines de linea (ver menor 2), el diff real de los 10
  ajenos es de 13 a 20 lineas cada uno y no contiene ni una sola linea con `it(`, `test(`,
  `expect(`, `toBe`, `toEqual`, `toThrow` ni `rejects`. Verificado con
  `git diff --ignore-cr-at-eol`: salida vacia.
- Las 4 guardias ajenas, ninguna perdio mordida:
  1. `tests/unit/identity/credential-policy-contract.test.ts:247` — el censo de campos de `User`
     sigue siendo igualdad exacta; solo suma `companyId` y `company`. `roleId` y `role` SIGUEN en
     la lista, asi que si alguien volviera a mover el rol el caso cae. Es justo lo que R13 pide.
  2. `tests/unit/proveedores/module-contract.test.ts:572,584` — `relationTargets('User')` pasa de
     `[DocumentType, Role]` a `[Company, DocumentType, Role]`, sigue siendo `toEqual` del
     conjunto entero (no `toContain`), y los dos `not.toContain` de Supplier quedan intactos.
  3. `tests/unit/proveedores/scope.test.ts:415` — NO se anadio ninguna migracion a la lista
     permitida (sigue en tres). Lo que cambio es que el censo quita los comentarios antes de
     buscar `suppliers`. Es mas preciso, no mas flojo: un ALTER real sobre esas tablas la sigue
     poniendo roja. Correcto: un comentario no es DDL.
  4. `tests/unit/recetas-ui/recipe-route-contract.test.ts:552` — se nombran los DOS archivos de
     la migracion de QC-47, uno a uno. `db/schema.prisma` ya estaba permitido por
     `MIGRACION_QC34`, asi que la lista no se ensancha por ahi. Cualquier otro archivo de `db/`
     sigue poniendo el caso rojo.
- El renombrado de la carpeta de migracion (`..._companies_and_memberships` pasa a
  `..._companies_and_user_company`) esta hecho con `git mv` y las tres guardias que nombran rutas
  de `db/` estan al dia. La condicion que sostiene reescribir la migracion en su sitio, que la
  rama no este mergeada, la comprobe: `20260904180600_companies_and_user_company` no existe ni en
  `dev` ni en `main`.
- Residuo del modelo viejo: buscar `membership|memberships|pertenencia` en
  `lib/ app/ components/ scripts/ db/ tests/ e2e/ hooks/` da CERO aciertos. Y en la base,
  `information_schema.tables` no tiene `memberships`.

### 7. La desviacion que el implementer aprobo por su cuenta: es CORRECTA
La empresa efimera se crea dentro del helper transaccional en los 10 fixtures de integracion, y
no en un `beforeAll` como decia el design 6. Mi lectura:

- Es correcta, y ademas es la unica opcion sensata. Siete de esos helpers corren dentro de una
  transaccion que acaba en ROLLBACK. Un `beforeAll` tendria que COMMITEAR la empresa (una fila
  real que sobrevive al test) en archivos cuyo diseno entero es que nada sobreviva. Peor: esa
  fila commiteada quedaria colgando si el proceso muere, y `companies_name_unique` es GLOBAL,
  asi que la basura acumulada empieza a colisionar. El patron literal del design habria sido
  peor que la desviacion.
- No esconde nada. Lo comprobe uno a uno. Los 5 que COMMITEAN
  (`inventario/product-crud:181/215`, `proveedores/supplier-crud:155/188`,
  `proveedores/catalog-line:152/185`, `recetas/recipe-crud:135/168`,
  `pedidos/order-repository:143/175`) borran la empresa explicitamente y DESPUES del usuario,
  que es el orden que exige el RESTRICT. Los 5 que REVIERTEN (`pedidos/order-crud:186`,
  `pedidos/order-sequence:189`, `pedidos/pedidos-constraints:213`,
  `recetas/recetas-constraints:175`, `proveedores/proveedores-constraints:186`) la crean dentro
  de la transaccion y no necesitan limpieza. Ninguno se queda a medias.
- El coste que si tiene, y es aceptable: se crea una empresa por LLAMADA al helper en vez de una
  por archivo. Sobre `companies` no hay presion de ningun tipo y la limpieza esta cubierta.
- Los 5 E2E si siguen el patron literal beforeAll/afterAll, que es donde tiene sentido.

Veredicto sobre el punto 7: aprobada. La desviacion mejora el diseno original y esta bien
documentada en la bitacora, punto 4 de las decisiones que el leader tiene que mirar.

---

## Hallazgos

### BLOQUEANTE
Ninguno.

### menor 1 — docs/architecture.md sigue describiendo el modelo que el humano descarto
`docs/architecture.md:19` dice: "Lo que une las dos mitades es la MEMBRESIA: a que empresas
pertenece cada usuario, y con que rol EN CADA UNA". Y `docs/architecture.md:37` habla de
"permisos por empresa mas alla del rol DE LA MEMBRESIA".

Es exactamente el modelo de muchos a muchos que el humano descarto y que QC-47 acaba de
desmontar. El documento de arquitectura, que es la definicion de "buen trabajo" del repo,
contradice hoy el modelo entregado: quien lo lea dentro de seis meses construira `memberships`.

No es culpa del implementer y no es su archivo: el barrido de T7/T21 se acota a
`lib/ app/ components/ scripts/ db/ tests/ e2e/` a proposito, y `docs/` no entra. Es del leader,
y conviene arreglarlo antes de cerrar la ficha o al abrir QC-48. No bloqueo porque esta fuera
del alcance declarado de QC-47 y no afecta a nada ejecutable.

### menor 2 — 9 archivos de test ajenos cambiaron de fin de linea (LF a CRLF)
El repo no tiene `.gitattributes` y `core.autocrlf` esta en false. Los blobs commiteados de
estos archivos pasaron de LF a CRLF:

- `tests/integration/pedidos/order-crud.int.test.ts`
- `tests/integration/pedidos/order-sequence.int.test.ts`
- `tests/integration/pedidos/pedidos-constraints.int.test.ts`
- `tests/integration/recetas/recetas-constraints.int.test.ts`
- `tests/integration/recetas/recipe-crud.int.test.ts`
- `tests/integration/proveedores/catalog-line.int.test.ts`
- `tests/integration/proveedores/supplier-crud.int.test.ts`
- `tests/integration/inventario/product-crud.int.test.ts`
- `tests/integration/identity/login.int.test.ts`

Efecto: el diff de `order-crud.int.test.ts` figura como 814/801 lineas cuando el cambio real es
de 13. El de `pedidos-constraints` como 1246/1233 cuando son 13.

Contenido verificado identico con `--ignore-cr-at-eol`, asi que no cambia nada ejecutable. Pero
rompe la premisa que el design 6 pone como criterio de "hecho" (que el diff de un fixture ajeno
se pueda leer de un vistazo), inutiliza `git blame` sobre esos archivos y va a provocar
conflictos con cualquier rama que los toque. Recomendacion para el leader: renormalizar antes
del PR, o anadir un `.gitattributes` con `text=auto eol=lf` en ficha propia.

### menor 3 — pnpm run db:rollback no puede revertir esta migracion
`scripts/db-rollback.ts:64-81` (`findLastMigration`) ordena los NOMBRES DE CARPETA del sistema
de archivos y coge el ultimo, sin mirar nunca `_prisma_migrations`. Como `dev` trajo
`20260904181500_recipe_steps_reset`, que ordena DESPUES, el comando revierte siempre esa.
`docs/checkpoints-proyecto.md > Datos y seguridad` pide que db:rollback revierta y deje `_prisma_migrations`
coherente, y para QC-47 eso solo se cumple aplicando el `down.sql` a mano.

Es un agujero del ARNES, no de esta feature: le pasa a cualquier migracion que no sea la ultima
por nombre. Esta correctamente reportado por el implementer en la bitacora, y el `down.sql` en
si es impecable, porque lo aplique y funciona. Merece ficha propia. No bloqueo.

### menor 4 — carrera de limpieza de huerfanas en 3 de los 5 E2E
`e2e/inventario.spec.ts:188`, `e2e/recetas.spec.ts:224` y `e2e/proveedores.spec.ts:283` borran
las empresas huerfanas con `createdAt < orphanCutoff`, pero sus usuarios con EL MISMO corte. Si
una corrida muerta dejo una empresa que cruza el corte unos segundos antes que sus usuarios, el
`company.deleteMany` choca con el RESTRICT y el `beforeAll` muere.

`e2e/login.spec.ts:137-158` y `e2e/session.spec.ts` SI resuelven el caso: deciden primero cuales
se condenan y arrastran a sus usuarios aunque sean recientes. Los otros tres no heredaron ese
patron. Ventana estrecha y solo produce flakiness de fixture, nunca un falso verde.

### menor 5 — tasks.md T14 sigue contradiciendo al design 5.3 en disco
T14 exige que el diff de `scripts/seed.ts` frente a `dev` sea VACIO; el design conserva
`SeedOutcome.createdCompany` alimentando la linea de resumen, que es un cambio en ese archivo.
El implementer resolvio bien, porque manda el design, y lo dejo escrito; pero el `tasks.md`
queda marcado con equis sobre un enunciado que el codigo no cumple. Cosmetico, aunque el proximo
que lea el spec tropieza con lo mismo.

### menor 6 — orden de imports en un fixture ajeno
`tests/integration/recetas/recipe-crud.int.test.ts:39` coloca el import de
`@/lib/modules/identity` DETRAS de `@/lib/modules/recetas/...`. El resto del repo agrupa
alfabeticamente. `eslint` no lo detecta, porque no hay regla de orden de imports activa, asi que
pasa el gate. Puramente estetico.

---

## Lo que NO es hallazgo

- `users.company_id` pasa de `ordinal_position` 19 a 20 si se aplica el ciclo DOWN + UP dos
  veces. Esta declarado de antemano en la cabecera del `down.sql` y en el design 3.3 como limite
  conocido de "exacto", y no afecta al DOWN, que es lo que R25 exige. Es honestidad, no deuda.
- El login ya no puede usar `users_username_unique` como seek, porque `company_id` es la columna
  lider. Esta anotado en el design 5.1 y en la bitacora como contrapartida tecnica heredada por
  QC-48. Sobre una empresa y decenas de filas es irrelevante. Correcto no optimizarlo aqui.
- La pregunta abierta 1, como sabe el login de que empresa eres, queda abierta a proposito y con
  sus salidas anotadas. La hereda QC-48. No bloquea porque hoy no hay forma de crear una segunda
  empresa.

---

## Veredicto final

**OK.** Cero bloqueantes. Los 29 requisitos tienen test y los tests valen algo: reproduje la
mutacion del indice y el caso cayo, ejecute el ciclo migrate/rollback contra Postgres real,
dispare la guardia de R26, medi la RLS con dueno no superusuario y corri yo mismo los 2161 tests
y los 18 E2E. El trabajo fuera de alcance esta acotado y declarado: en los 19 fixtures ajenos no
cambio ni una asercion y ninguna de las 4 guardias perdio mordida. La desviacion del beforeAll
esta bien resuelta y bien argumentada.

Los 6 menores no impiden cerrar la feature. El menor 1, `docs/architecture.md` describiendo el
modelo descartado, es el unico que conviene atender ANTES de abrir QC-48, porque es la fuente de
la que salio el malentendido de la primera vuelta.
