# QC-83 — modelo-de-grupos-de-trabajo · review

> Revision de F2.2 sobre el worktree `.worktrees/QC-83-modelo-de-grupos-de-trabajo`, base propia
> `QuimiCloude_QC83`. Commits revisados: `97d369e`, `9d0b008`, `f0ba094` (rango
> `origin/dev...HEAD`, merge-base `c640c7a`).
>
> **VEREDICTO: OK.** Cero hallazgos mayores. Cuatro menores, ninguno de codigo de la ficha; dos
> de ellos son accion del **leader** antes del PR.

---

## Checklist de CHECKPOINTS.md

### Especificacion
- [x] `requirements.md` con R1–R28 en EARS y la tabla de 17 decisiones cerradas.
- [x] `design.md` con alternativas descartadas y su porque (9.1–9.5; el trigger de 9.1 es una
      alternativa seria y esta argumentada contra el precedente `units_check_derivation`).
- [x] `tasks.md` con **12 de 12** tasks marcadas `[x]` (T1–T12).

### Trazabilidad
- [x] Cada `R<n>` mapea a un test concreto. **Verificado abriendo los tests, no la tabla.**
- [x] `progress/impl_QC-83-...md` contiene el mapa `R1..R28 -> test`.

### Calidad de codigo
- [x] `pnpm run typecheck` — limpio (`tsc --noEmit`, sin errores).
- [x] `pnpm run lint` — limpio.
- [x] `pnpm run test:json` + `scripts/comparar-baseline-rojos.mjs` — **sin rojos nuevos** en la
      segunda corrida (ver menor 2 para la primera).
- [x] E2E de flujo critico: **no aplica** (decision cerrada 16; ficha de modelo, sin flujo).
- [x] UI multiplataforma: **no aplica**. El diff no toca `app/`, `components/` ni un solo `.tsx`.
- [x] Dependencias: **ninguna anadida**. El diff sobre `package.json` y `pnpm-lock.yaml` esta
      **vacio**; `guard-dependencias-aprobadas` en verde.

### Datos y seguridad
- [x] **Columna de empresa en las dos tablas nuevas.** `work_groups.company_id` y
      `work_group_members.company_id`, las dos NOT NULL, verificadas en Postgres real.
- [x] **Test del rechazo cruzado**: 4 casos de R14 + 2 de R15 contra Postgres real, y demostrados
      en negativo (mutacion M1).
- [x] «Toda consulta suya filtra por la empresa de quien pide»: **no hay ninguna consulta** en esta
      ficha (R27, sin service ni caso de uso). Queda como carga de QC-84, escrito en design.md 5.
- [x] Permisos en el service: **no aplica**, la ficha no introduce ningun permiso.
- [x] RLS ENABLE **y** FORCE en las dos tablas nuevas. Verificado en `pg_class`: `work_groups
      (t,t)` y `work_group_members (t,t)`.
- [x] Acceso a datos solo por Prisma; ni una linea de cliente Supabase.
- [x] Migracion con `down.sql`; `db:rollback` revierte y deja `_prisma_migrations` coherente.
      **Verificado por mi contra Postgres real.**
- [x] Ningun secreto hardcodeado. Los archivos nuevos son SQL DDL y dos funciones puras.
- [x] Webhooks: no aplica.

### Modulos hexagonales
- [x] `domain/` puro: `normalize-key.ts` y `work-group-name.ts` no importan framework, BD,
      `shared` ni adaptadores.
- [x] `normalizeKey` **no** sale por el barrel, y hay un test que lo afirma.
- [x] Los dos modelos nuevos declaran `/// @module identity`; `guard-arquitectura-modulos` los
      descubre solo y cae si se quita (mutacion M12).
- [x] Sin `lib/services/`, `lib/repositories/`, `lib/interfaces/`; nada nuevo en la raiz de `lib/`.

### Permisos / Configuracion
- [x] No aplica: sin pantalla, sin Server Action, sin ruta.
- [x] Nada dependiente de entorno hardcodeado.

### Verificacion final
- [ ] **`./init.sh` completo NO termina en verde**, y no por el codigo: aborta en el paso 3
      (`feature_list.json invalido: falta QC-83`). Ver menor 1. Con ese paso salvado, el resto
      del gate pasa (ver menor 2).
- [x] Este archivo existe con veredicto OK.
- [ ] Entrada en `progress/history.md` y desmontaje del worktree: son de F2.3.

---

## Trazabilidad, comprobada una a una

Abri los tres archivos de test y comprobe que cada asercion afirma lo que el requisito dice.
**No hay ningun R<n> apuntando a un test vacio ni a un test que compruebe otra cosa.**

| R | Cubierto por | Como lo verifique |
| --- | --- | --- |
| R1 | INT `el id del grupo lo genera la base...` (regex uuid v4, dos distintos, nunca se pasa `id`) + ESQ `DEFAULT gen_random_uuid()` | leido |
| R2 | INT `rechaza un grupo sin nombre` → 23502 y **`column = 'name'`** + ESQ TEXT sin tope, con dos mutaciones internas propias | leido |
| R3 | NOM, 8 casos (acentos, caja, signos, trim, digitos, vacia, idempotencia) + contrato del barrel | **mutado** (M8, M9) |
| R4 | INT 23505 contra `work_groups_name_unique`, incluido el caso «el llamante no normalizo la caja» + ESQ | **mutado** (M2) |
| R5 | INT mismo nombre en otra empresa aceptado + ESQ (indice compuesto con `company_id`) | **mutado** (M2) |
| R6 | INT nombre de un grupo de baja reutilizable, y un tercero vivo sigue chocando + ESQ | **mutado** (M2) |
| R7 | INT/ESQ `deleted_at` anulable, nace vacia, nadie la escribe | leido |
| R8 | INT 23502 + ESQ `"company_id" UUID NOT NULL` con mutacion interna | leido |
| R9 | INT 23503 contra `work_groups_company_id_fkey` | leido |
| R10 | INT las **dos** mitades: empresa con grupo vivo y empresa cuyo unico grupo esta de baja | leido |
| R11 | INT `updated_at` cambia al modificar + ESQ las 4 columnas en las 2 tablas | leido |
| R12 | ESQ vocabulario ingles/snake_case, con su propio caso de sensibilidad | **mutado** (M6) |
| R13 | INT 23502 en las tres columnas + ESQ | leido |
| **R14** | INT **4 casos** (cruzado con la empresa del grupo, con la de la persona, con una tercera, y **AL MODIFICAR**), cada uno afirmando el SQLSTATE **y la restriccion concreta**, mas `count = 0` despues | **mutado en la BASE (M1)** |
| **R15** | INT mover de empresa a la persona y al grupo poblado → 23503 en los dos sentidos, mas cero filas desincronizadas | **mutado en la BASE (M1)** |
| R16 | INT 23505 contra `work_group_members_pkey` + ESQ | leido |
| R17 | INT persona en dos grupos y grupo con dos personas | leido |
| R18 | INT borrado **fisico** + `information_schema.columns` con **exactamente 5 columnas** + ESQ en SQL y en esquema | **mutado** (M4, M5) |
| R19 | INT compara la **fila entera** del grupo antes y despues, con un `sleep(20)` de por medio para que `updated_at` delatara cualquier escritura | leido |
| R20 | INT `inactive`, `blocked` y `deleted_at`, los tres, y la reactivacion sin escritura extra | leido |
| R21 | INT baja del grupo, filas de pertenencia identicas | leido |
| R22 | ESQ `/// @module identity` en los dos + `guard-arquitectura-modulos` | **mutado** (M12) |
| R23 | ESQ «no ejecuta DDL sobre otra tabla» y «solo toca users para el indice unico» + `identity-schema.test.ts` retensado | **mutado** (M10, M15, M16) |
| R24 | ESQ ENABLE+FORCE y «los ALTER son el ultimo bloque» + `guard-rls-force` | **mutado** (M3, M7) |
| R25 | ESQ (orden del DOWN, sin CASCADE, `users` en una sola linea) + **mi propio rollback contra Postgres real** | **mutado** (M11, M14) |
| R26 | ESQ «no escribe, no modifica y no borra ninguna fila» | **mutado** (M13) |
| R27 | `git diff --name-only origin/dev...HEAD`: **cero** archivos bajo `app/`, `components/`, `e2e/`, `middleware.ts`, `lib/composition/`, `scripts/`. Verificado por mi sobre el rango real | ver menor 4 |
| R28 | Diff vacio sobre `package.json` y `pnpm-lock.yaml` + `guard-dependencias-aprobadas` | leido |

---

## Los cinco puntos que habia que mirar con lupa

### 1. La coherencia de empresa la garantiza la BASE (R14, R15, R16) — CONFIRMADO

`pg_constraint` de `QuimiCloude_QC83`, leido por mi:

```
work_group_members_user_id_fkey        FOREIGN KEY (user_id, company_id)
                                       REFERENCES users(id, company_id) ON UPDATE CASCADE ON DELETE RESTRICT
work_group_members_work_group_id_fkey  FOREIGN KEY (work_group_id, company_id)
                                       REFERENCES work_groups(id, company_id) ON UPDATE CASCADE ON DELETE CASCADE
work_group_members_pkey                PRIMARY KEY (work_group_id, user_id)
```

Son FK **compuestas**, en la base, no una comprobacion al vuelo en TypeScript: la ficha no tiene
codigo de aplicacion, asi que no hay ningun `if` de empresa en ninguna parte. La restriccion unica
`users_id_company_id_key` existe como indice unico real sobre `users(id, company_id)`, que es lo
que Postgres exige para que la FK compuesta apunte ahi.

La ampliacion de alcance sobre `users` (R23, design.md 1.3) esta aprobada por el humano en F1.4 y
**no la cuento como hallazgo**. Lo que si comprobe es que es *solo* eso: el diff del modelo `User`
en `db/schema.prisma` es **una linea**, el `@@unique`. Ninguna columna, ningun indice, ninguna FK,
ninguna RLS de `users` cambia.

`prisma migrate diff` schema→BD: la unica deriva nueva son **esas dos FK compuestas**, que es
exactamente la deriva documentada y aceptada en design.md 2.2 y en el `/// OJO` del modelo.
`users_id_company_id_key` y `work_groups_id_company_id_key` **no** son deriva: estan declaradas en
Prisma, asi que el riesgo 5 del design esta mitigado de verdad.

### 2. El deleted_at es del GRUPO, no de la pertenencia (R18–R21) — CONFIRMADO

`information_schema.columns` sobre `work_group_members` en la base real devuelve exactamente
`company_id, created_at, updated_at, user_id, work_group_id`. **Cinco columnas, ninguna de baja
logica.** `work_groups` si tiene `deleted_at`, anulable y vacia. El test de integracion afirma esa
lista de cinco columnas dentro del propio caso de R18, asi que no es una promesa del comentario.

No se colo ninguna marca de baja en la pertenencia: ni en el SQL, ni en el esquema, ni en la base.

### 3. El down.sql revierte al esquema exacto anterior — CONFIRMADO POR MI, NO CREIDO

No me fie del md5 de la bitacora: rehice la medicion entera contra `QuimiCloude_QC83`.

1. Snapshot completo **con** la migracion aplicada: columnas de todas las tablas, todos los
   indices, todas las restricciones con su `pg_get_constraintdef`, `relrowsecurity` y
   `relforcerowsecurity` de cada tabla, y `count(*)` de `users` y `companies` (325 lineas).
2. `pnpm run db:rollback`.
3. Mismo snapshot.

**El diff entre los dos contiene EXACTAMENTE los objetos de QC-83 y nada mas:** las 12 columnas de
las dos tablas, sus 6 indices, sus 5 restricciones, las 2 filas de RLS, y
`IDX|users|users_id_company_id_key`. **Ninguna linea de `users` ni de `companies` fuera de esa.**
Los `count(*)` de `users` y `companies` **no cambian**: el DOWN no perdio ni una fila (R26).

Snapshot especifico de `users` (22 columnas, indices, restricciones propias, restricciones que
apuntan a ella y su RLS): la unica diferencia antes/despues es la desaparicion de
`users_id_company_id_key` y de la FK entrante de `work_group_members`. `users` queda con su
**definicion literal** anterior (R25).

`_prisma_migrations` queda sin la fila (count = 0). Despues reaplique el UP y el snapshot completo
salio **identico** al del paso 1. La afirmacion de la bitacora es cierta.

### 4. El refactor normalizeCompanyName → normalizeKey es de comportamiento nulo — CONFIRMADO

`git diff origin/dev...HEAD -- tests/unit/identity/company-name.test.ts` esta **vacio**: ese
archivo de QC-47 no cambio ni una linea, que era la condicion de design.md 4 y del criterio de
«hecho» de T1.

Y no es neutralidad de palabra: **mute `normalizeKey`** quitando `.normalize('NFD')` y, por
separado, `.toLowerCase()`. En los dos casos el test de QC-47 **se pone rojo** (2 y 5 casos
respectivamente), a la vez que el de QC-83. El test heredado sigue clavando el comportamiento del
cuerpo compartido y detectaria cualquier deriva futura.

Dato colateral, no un hallazgo: quitar el paso `.replace(/\p{Diacritic}/gu, '')` **no** rompe
ningun test, porque `normalize('NFD')` mas `[^a-z0-9]` ya elimina las marcas combinantes. Ese paso
es redundante desde QC-47; el refactor lo hereda tal cual, que es justo lo que se le pedia.

### 5. Las dos guardias ajenas modificadas — RETENSADAS, NO RELAJADAS

**`tests/unit/identity/schema/identity-schema.test.ts` (QC-47)**, caso `companyId lleva su indice
y NO lleva unicidad (R12)`. Pasa de negar un patron (`not.toMatch(/@@unique\([^)]*companyId/)`) a
**enumerar la lista entera** y exigir `toEqual(['[id, companyId], map: "users_id_company_id_key"'])`.
Comprobado mutando, dos veces:
- anadir `@@unique([companyId, email], map: "users_company_email_key")` → **rojo**;
- cambiar el `map` del `@@unique` aprobado por otro nombre → **rojo**.

La segunda mutacion es la prueba de que vigila **mas** que antes: el `not.toMatch` anterior no
distinguia nombres de restriccion. La intencion original —que `companyId` no sea unico por si
solo— sigue viva en el `not.toMatch(/@unique/)` sobre la columna, que no se toco.

**`tests/unit/recetas-ui/recipe-route-contract.test.ts` (QC-34)**, caso `la feature no toca
lib/modules/recetas ni db/`. El cambio es una constante `MIGRACION_QC83` con **dos rutas
literales** y un `.filter(!MIGRACION_QC83.includes(ruta))` anadido a la cadena. No hay comodin, no
hay prefijo, no hay `startsWith`: el conjunto de exclusion crece en exactamente esos dos archivos y
en ningun otro. Es el mismo protocolo que el propio archivo documenta y que ya siguieron QC-47 y
QC-74. `db/schema.prisma` ya estaba permitido desde QC-34; no lo abre QC-83.

*Nota de metodo:* intente mutarlo anadiendo un archivo de `db/` no nombrado, pero la guardia mide
`git diff origin/dev...HEAD`, un rango de **commits**, y yo no commiteo siendo reviewer; la
mutacion no era valida y la revert. La verificacion quedo por lectura del filtro, que es
demostrable por construccion. Si verifique que el rango **no esta vacio** en esta rama (devuelve
los 16 archivos de QC-83), o sea que el caso esta evaluando de verdad y no pasando en silencio.

---

## Los dos rojos conocidos: confirmados ajenos

- **Los 10 E2E.** `git diff --name-only origin/dev...HEAD -- app components e2e middleware.ts
  lib/composition scripts package.json pnpm-lock.yaml` sale **vacio**. QC-83 no toca ni una linea
  de nada de eso, y una migracion no puede quitar un `data-testid` ni cambiar una redireccion.
  Confirmado ademas en el codigo: `private-user-trigger` solo aparece en `components/` dentro de un
  comentario de `nav-user.tsx` que dice que el menu **ya no existe**, mientras `e2e/permisos.spec.ts`
  lo sigue buscando. Deuda de `dev`. **No lo cuento como hallazgo de esta ficha.**
- **El flake de timeouts de UI.** Misma clase que la documentada en `tests/baseline-rojos.json`
  (QC-58). Esta ficha no tiene UI. **No es hallazgo suyo.**

---

## Hallazgos

### Mayores

**Ninguno.**

### Menores

**Menor 1 — `./init.sh` completo no llega a correr: falta la ficha QC-83 en `feature_list.json`.
Accion del LEADER, no del implementer.**
El gate aborta en el paso 3 con `feature_list.json invalido:
specs/QC-83-modelo-de-grupos-de-trabajo/ no tiene ficha en feature_list.json: falta QC-83.` El
`feature_list.json` de esta rama —y el de `origin/dev` (`d26d09e`), comprobado— no tiene entrada
para QC-83: la importacion del board (paso F0) se quedo en el worktree principal. `CLAUDE.md`
asigna `feature_list.json` al leader y `AGENTS.md` le asigna el gate, asi que **no es defecto del
implementer**, pero **bloquea el PR** hasta que la ficha entre en la rama. Corrido el resto del
gate a mano, todo lo demas pasa.

**Menor 2 — un rojo nuevo fuera del baseline en la PRIMERA corrida de la suite completa:
`tests/integration/inventario/product-crud.int.test.ts`. Es flake de carga, no regresion de QC-83.**
Evidencia: (a) el archivo pasa **aislado** en 5 s (7/7); (b) `tests/integration` entera pasa **dos
veces seguidas**, 433/433, con el test de QC-83 dentro; (c) el mensaje es el mismo
`STACK_TRACE_ERROR` de expiracion que arrastran los `.tsx` del baseline, y la propia nota del
baseline ya documenta que el flake **no es exclusivo de UI** (`identity-facade.test.ts` no monta UI
y tambien expiraba a los 5 s); (d) **segunda corrida de la suite completa: `sin rojos nuevos
(1 rojos, todos en el baseline de 7)`, exit 0**. Aun asi es un archivo que no esta en el baseline y
que la suite completa puede tumbar: el leader decide si lo anade con motivo y fecha (es material de
QC-58) o si le basta con la corrida verde.

**Menor 3 — el comparador avisa de 6 archivos del baseline que ya pasan.**
`product-page.test.tsx`, `order-sheet.test.tsx`, `catalog-line-sheet.test.tsx`,
`supplier-page.test.tsx`, `recipe-route-contract.test.ts` y `recetas/module-contract.test.ts`.
Higiene ajena a esta ficha, pero con un filo: los dos ultimos estan en el baseline por una razon
estructural que su propia nota llama «coste aceptado» y que **apaga el archivo entero para el
gate**, incluida la guardia de QC-34 que QC-83 acaba de retensar. O sea que esa guardia,
retensada correctamente, **el gate no la mira**. No es de QC-83 arreglarlo; se anota para que no se
pierda.

**Menor 4 — R27 es el unico requisito cuya evidencia es un `git diff` a mano y no una asercion
ejecutable.**
La mitad de `db/` y `recetas` si esta mecanizada (`recipe-route-contract.test.ts`), pero nada
afirma «cero archivos bajo `app/`». Comprobe el rango yo mismo y el hecho es cierto hoy; el matiz
es que no queda una guardia que lo sostenga manana. Es el mismo criterio que acepto QC-47 en su
R28, asi que no lo elevo, pero conviene saberlo antes de que alguien cite este mapa como
precedente.

---

## Mutaciones aplicadas (18) — todas revertidas

`git status --short` en el worktree quedo **vacio** al terminar, y la base `QuimiCloude_QC83` quedo
con la migracion **aplicada** y sus dos FK compuestas restauradas y re-verificadas en
`pg_constraint`.

| # | Mutacion | Esperado | Real |
| --- | --- | --- | --- |
| M1 | **En la BASE**: DROP de las dos FK compuestas y recreacion como FK **simples** | rojo en R14 y R15 y **solo** ahi | **6 rojos: los 4 de R14 y los 2 de R15.** Ni uno mas |
| M2 | `migration.sql`: quitar el `WHERE deleted_at IS NULL` del indice del nombre | rojo | 4 rojos |
| M3 | `migration.sql`: borrar las lineas `FORCE ROW LEVEL SECURITY` | rojo | 1 rojo en ESQ **y** 1 en `guard-rls-force` |
| M4 | `migration.sql`: anadir `deleted_at` a `work_group_members` | rojo | 3 rojos |
| M5 | `db/schema.prisma`: anadir `deletedAt` a `WorkGroupMember` | rojo | 1 rojo |
| M6 | `migration.sql`: renombrar `work_group_members_user_id_idx` a `indice_de_usuario` | rojo | 1 rojo (guardia de idioma, R12) |
| M7 | `migration.sql`: subir el bloque de RLS antes de las FK | rojo | 1 rojo |
| M8 | `normalize-key.ts`: quitar el paso `normalize NFD` | rojo en NOM **y** en el test intacto de QC-47 | 2 rojos, uno en cada archivo |
| M9 | `normalize-key.ts`: quitar el paso `toLowerCase` | rojo en los dos | 11 rojos, 5 de ellos en el test intacto de QC-47 |
| M10 | `migration.sql`: anadir un `ALTER TABLE orders ADD COLUMN` | rojo (R23) | 2 rojos |
| M11 | `down.sql`: borrar el `DROP INDEX users_id_company_id_key` | rojo (R25) | 2 rojos |
| M12 | `db/schema.prisma`: quitar el `/// @module identity` de `WorkGroupMember` | rojo (R22) | 2 rojos: ESQ y `guard-arquitectura-modulos` |
| M13 | `down.sql`: anadir un `DELETE FROM users` | rojo (R26) | 3 rojos |
| M14 | `down.sql`: invertir el orden de los DROP TABLE y ponerles CASCADE | rojo | 1 rojo |
| M15 | `db/schema.prisma`: anadir un `@@unique([companyId, email])` a `User` | rojo (guardia retensada de QC-47) | 1 rojo |
| M16 | `db/schema.prisma`: cambiar el `map` del `@@unique` aprobado | rojo (prueba de que vigila **mas**) | 1 rojo |
| M17 | `db/schema.prisma`: anadir un `@@unique([companyId, nameNormalized])` a `WorkGroup` | rojo (riesgo 3) | 1 rojo |
| M18 | `migration.sql`: anadir un `ALTER TABLE users ADD COLUMN` | rojo (R23) | 2 rojos |

Mutaciones que **no** rompieron nada, y por que no es un hueco:
- quitar el `trim` de `normalizeKey`: el filtro final de caracteres ya elimina los espacios, asi
  que el comportamiento es identico. **Mutacion equivalente**, no cobertura ausente.
- quitar el paso que borra los diacriticos: la descomposicion NFD mas el filtro final ya se llevan
  la marca combinante. Tambien equivalente, y heredado tal cual de QC-47.
- anadir un archivo de `db/` no nombrado para provocar la guardia de QC-34: **mutacion invalida**,
  porque la guardia mide un rango de commits y el reviewer no commitea. Revertida.

---

## Verificacion ejecutada por mi

```
pg_constraint / pg_indexes / pg_class sobre QuimiCloude_QC83  -> las 2 FK COMPUESTAS, los 3
                                                                 indices unicos y RLS (t,t) x2
vitest run tests/unit/identity tests/integration/identity      -> 41 archivos, 646 tests, verde
vitest run tests/integration  (x2)                             -> 29 archivos, 433 tests, verde
pnpm run typecheck                                             -> limpio
pnpm run lint                                                  -> limpio
pnpm run test:json (suite completa, x2)                        -> 2.a corrida: sin rojos nuevos
node scripts/comparar-baseline-rojos.mjs                        -> EXIT=0
prisma migrate diff schema -> BD                               -> unica deriva nueva: las 2 FK
                                                                 compuestas documentadas
db:rollback + snapshot + db:migrate + snapshot                 -> DOWN exacto, UP reaplicado
                                                                 identico, 0 filas perdidas
./init.sh (completo)                                           -> ABORTA en el paso 3 (menor 1)
```

---

## Veredicto

**OK.** Cero hallazgos mayores. La ficha hace lo que dice: la coherencia de empresa la impone
Postgres con dos claves foraneas compuestas —demostrado rompiendolas y viendo caer exactamente los
seis tests que las protegen y ninguno mas—, la pertenencia se borra de verdad y no guarda rastro,
el `down.sql` deja el esquema exactamente como estaba sin tocar una sola fila preexistente, el
refactor del normalizador es neutro y lo sostiene un test de QC-47 que no cambio, y las dos
guardias ajenas vigilan mas que antes.

Los cuatro menores son deuda de orquestacion y de `dev`, no de este trabajo. **Menor 1 hay que
resolverlo antes del PR**, porque tal como esta la rama `./init.sh` no llega ni a correr los tests.
