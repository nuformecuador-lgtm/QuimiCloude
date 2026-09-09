# QC-83 — modelo-de-grupos-de-trabajo · bitacora de implementacion

> Zona `backend` · ficha de **modelo**. Sin UI, sin service, sin Server Action y sin pantalla:
> R27 lo fija como limite y QC-84/QC-85 recogen el testigo. `frontend_dev` no se llamo ni una vez.
>
> Worktree `.worktrees/QC-83-modelo-de-grupos-de-trabajo`, base propia `QuimiCloude_QC83`.
> **12 tasks de 12 cerradas.** Commits: `97d369e` (tanda A), `9d0b008` (tanda B) y el de la tanda C.

## Lo que hay que mirar primero

1. **La coherencia de empresa la garantiza la BASE.** Las dos FK de `work_group_members` son
   COMPUESTAS y llevan `company_id` dentro. Verificado leyendo `pg_constraint` de Postgres real:
   `FOREIGN KEY (user_id, company_id) REFERENCES users(id, company_id)` y
   `FOREIGN KEY (work_group_id, company_id) REFERENCES work_groups(id, company_id)`. Ni trigger,
   ni comprobacion en el caso de uso. Y esta demostrado en negativo: con las FK simplificadas a
   simples en una base clonada, los 4 casos de R14 y los 2 de R15 se ponen rojos, y solo esos.
2. **Se retensaron DOS guardias ajenas** (ver la seccion de guardias). Ninguna se relajo.
3. **10 E2E rojos, preexistentes en `dev` y ajenos a esta ficha** (ver la seccion de R27). Es lo
   unico que no queda verde, no lo causa QC-83 y va a seguir ahi despues del merge.

## Archivos

**Nuevos**

- `lib/modules/identity/domain/normalize-key.ts` — normalizador interno, NO exportado por el barrel
- `lib/modules/identity/domain/work-group-name.ts` — `normalizeWorkGroupName`
- `db/migrations/20260908210000_work_groups_and_members/migration.sql`
- `db/migrations/20260908210000_work_groups_and_members/down.sql`
- `tests/unit/identity/work-group-name.test.ts` — 8 casos
- `tests/unit/identity/schema/work-groups-migration.test.ts` — 33 casos
- `tests/integration/identity/work-groups-constraints.int.test.ts` — 24 casos

**Modificados**

- `db/schema.prisma` — `WorkGroup`, `WorkGroupMember`, `Company.workGroups`, y en `User` **una sola
  linea**: el `@@unique([id, companyId], map: "users_id_company_id_key")`. Ninguna columna de `User`
  cambia. Tres bloques `/// OJO` (riesgos 2, 3 y 4 del design).
- `lib/modules/identity/domain/company-name.ts` — refactor de comportamiento nulo: delega en
  `normalizeKey`
- `lib/modules/identity/index.ts` — publica `normalizeWorkGroupName`
- `tests/unit/identity/schema/identity-schema.test.ts` — retensado
- `tests/unit/recetas-ui/recipe-route-contract.test.ts` — retensado

**Sin tocar, y es un requisito con nombre (R23, R27):** `app/`, `components/`, `middleware.ts`,
`lib/composition/`, `scripts/seed.ts`, `e2e/`, `package.json`, `pnpm-lock.yaml`.

`tests/unit/identity/company-name.test.ts` **no cambio ni una linea**: `git diff --stat` sobre el
archivo sale vacio. El refactor de `normalizeCompanyName` a `normalizeKey` es neutro, y ese test es
justo la prueba que el design pedia.

## Mapa de trazabilidad R1..R28

Abreviaturas: **ESQ** = `tests/unit/identity/schema/work-groups-migration.test.ts`;
**INT** = `tests/integration/identity/work-groups-constraints.int.test.ts`;
**NOM** = `tests/unit/identity/work-group-name.test.ts`.

| R | Test (archivo · titulo) |
| --- | --- |
| R1 | INT · `dos grupos creados sin id reciben uuid distintos generados por la base`; ESQ · `el grupo nace con id uuid generado por la base y su marca de baja vacia` |
| R2 | INT · `rechaza el grupo sin nombre` (`23502`, columna `name`); ESQ · `el nombre del grupo es TEXT obligatorio y sin tope de longitud` |
| R3 | NOM · los 8 casos de acentos, mayusculas, espacios y signos, mas `el contrato del modulo publica la funcion con nombre y NO el normalizador interno` |
| R4 | INT · `rechaza un segundo grupo vivo con el mismo nombre normalizado en la misma empresa` (`23505` contra `work_groups_name_unique`); ESQ · `quitarle el lower(...) lo tumba` y `WorkGroup no declara ningun @@unique ni @unique del nombre` |
| R5 | INT · `acepta el mismo nombre normalizado en otra empresa`; ESQ · `quitarle la empresa lo tumba` |
| R6 | INT · `acepta reutilizar el nombre de un grupo dado de baja`; ESQ · `quitarle el WHERE lo tumba` |
| R7 | INT · `el grupo nace con la marca de baja vacia`; ESQ · `el grupo nace con id uuid generado por la base y su marca de baja vacia` |
| R8 | INT · `rechaza el grupo sin empresa` (`23502`); ESQ · `la empresa del grupo es obligatoria en la propia base` |
| R9 | INT · `rechaza el grupo cuya empresa no existe` (`23503` contra `work_groups_company_id_fkey`) |
| R10 | INT · `rechaza borrar una empresa con un grupo vivo` y `rechaza borrar una empresa con un grupo dado de baja` (`23503`, las dos mitades) |
| R11 | INT · `las dos tablas registran cuando se creo la fila y cuando se modifico`; ESQ · `las dos tablas nuevas registran cuando se creo la fila y cuando se modifico` |
| R12 | ESQ · `nombra en ingles y en snake_case todo lo que crea` y `la guardia de idioma cae con un identificador en espanol, con acentos o en camelCase` |
| R13 | INT · `rechaza la pertenencia sin work_group_id / sin user_id / sin company_id` (`23502`, las tres); ESQ · `las tres columnas de referencia de la pertenencia son obligatorias` |
| R14 | INT · los 4 casos de la fila cruzada (`23503` contra una de las dos FK compuestas), incluido el que rechaza AL MODIFICAR; ESQ · `las dos claves foraneas de la pertenencia llevan company_id en los dos lados` y `simplificarlas a dos FK simples las tumba` |
| R15 | INT · `rechaza cambiar de empresa a una persona que esta en un grupo` y `rechaza cambiar de empresa a un grupo que tiene personas dentro` (`23503` en los dos sentidos, mas cero filas desincronizadas) |
| R16 | INT · `rechaza meter dos veces a la misma persona en el mismo grupo` (`23505` contra `work_group_members_pkey`); ESQ · `la misma persona no puede estar dos veces en el mismo grupo` |
| R17 | INT · `acepta una persona en dos grupos y un grupo con dos personas` |
| R18 | INT · `sacar a una persona elimina la fila y no queda rastro` (`count = 0` y `information_schema.columns` con exactamente 5 columnas); ESQ · `la pertenencia no declara ninguna marca de baja logica` (SQL) y `WorkGroupMember no declara deletedAt` (esquema) |
| R19 | INT · `sacar a la ultima persona deja el grupo vivo e intacto` (fila entera comparada) y `un grupo sin miembros existe` |
| R20 | INT · `conserva las pertenencias de una persona dada de baja, inactiva o bloqueada` |
| R21 | INT · `conserva las pertenencias de un grupo dado de baja` |
| R22 | ESQ · `WorkGroup y WorkGroupMember declaran su dueno`; `tests/guards/guard-arquitectura-modulos.test.ts` |
| R23 | ESQ · `no ejecuta DDL sobre ninguna tabla de otro modulo` y `solo toca users para crear el indice unico que habilita la FK compuesta`; `tests/unit/identity/schema/identity-schema.test.ts` · `companyId lleva su indice y NO lleva unicidad (R12)` (retensado) |
| R24 | ESQ · `las dos quedan con ENABLE y con FORCE` y `los ALTER de RLS son el ultimo bloque del archivo`; `tests/guards/guard-rls-force.test.ts` |
| R25 | ESQ · `la pertenencia cae antes que el grupo, y ningun DROP TABLE lleva CASCADE`, `toca users en una sola linea, la del indice que anadio el UP` y `no deja RLS ni indices residuales`; mas el **snapshot real** de `users` (abajo) |
| R26 | ESQ · `no escribe, no modifica y no borra ninguna fila (down)` y `no menciona companies ni pgcrypto en ninguna linea ejecutable`; y en el UP, `no escribe ni una fila` |
| R27 | `git diff --name-status origin/dev...HEAD`: cero archivos bajo `app/`, `components/`, `middleware.ts`, `lib/composition/`, `scripts/seed.ts` y `e2e/`, asi que **ningun `test(...)` de E2E cambio de contenido**. Ver la salvedad de abajo |
| R28 | `git diff origin/dev...HEAD -- package.json pnpm-lock.yaml` **vacio**; `tests/guards/guard-dependencias-aprobadas.test.ts` en verde |

Los 28 requisitos tienen test nombrado. **Ninguno queda suelto.** El unico con salvedad es R27, y
no es que le falte test: es que la mitad de su enunciado —los E2E existentes siguen pasando—
arrastra 10 rojos que ya estaban en `dev` antes de esta rama.

## R27 — la salvedad honesta de los E2E

`pnpm exec playwright test` sobre este worktree: **40 pasados, 10 fallidos, 6.6 min**. Son 11 specs
(`inventario` 6, `login` 7, `login-skin` 7, `pedidos` 6, `permisos` 5, `presentaciones` 6,
`proveedores` 6, `recetas` 6, `recetas-pasos` 5, `session` 5, `theme` 5), ejecutados en chromium y
en webkit, de ahi que cada caso rojo aparezca dos veces.

Los 10 rojos **no los causa QC-83** y estaban ya en `dev` (`c640c7a`):

1. `permisos.spec.ts:197` (x2 navegadores) espera `getByTestId('private-user-trigger')`, pero
   `components/private/nav-user.tsx` dice en su propia cabecera que ese menu **ya no existe** y que
   con el desaparecio ese `data-testid`. El E2E no se actualizo cuando se quito el menu.
2. `inventario.spec.ts:306`, `pedidos.spec.ts:443`, `proveedores.spec.ts:463` y
   `recetas.spec.ts:377` (x2 navegadores) fallan en su helper `login`, que espera `DASHBOARD_ROUTE`
   mientras el Operador **aterriza en `/inventario`**, que es el comportamiento vigente de `dev`
   (`waiting for navigation ... navigated to http://localhost:3117/inventario`).

Los dos casos son E2E que se quedaron atras respecto a la app, no regresiones. Que no son de esta
ficha se ve en el diff: QC-83 no toca ni una linea de `app/`, `components/` ni `e2e/`, y una
migracion no puede quitar un `data-testid` ni cambiar una redireccion.

**No se toco ninguno**: cambiarlos habria violado R27, que exige que su guion no cambie. Queda
anotado para que el humano decida si abre ficha.

## R25 — el rollback, verificado contra Postgres real

`pnpm run db:migrate`, snapshot de `users`, `pnpm run db:rollback`, snapshot otra vez.

Los dos ficheros salen **byte a byte identicos**, mismo md5 `08b9f5391de28f7916ccae0b28e92ad7`:
22 columnas, 8 indices, 5 restricciones propias, 11 restricciones que apuntan a `users`, y RLS
`relrowsecurity: true, relforcerowsecurity: true`. `users_id_company_id_key` aparece con el UP y
desaparece con el DOWN sin dejar residuo. Tras el rollback no quedaba ninguna de las dos tablas
nuevas y `_prisma_migrations` no tenia la fila. Despues se **reaplico** el UP, asi que la migracion
esta aplicada, revertida y reaplicada al menos una vez sobre la base del worktree (T12).

## Guardias ajenas retensadas — para el reviewer, una a una

Ninguna se relajo: cero `toEqual` convertidos en `toContain`, cero listas de permitidos ampliadas
sin nombrar lo que entra.

1. **`tests/unit/identity/schema/identity-schema.test.ts`** (QC-47), caso
   `companyId lleva su indice y NO lleva unicidad (R12)`. Negaba un patron —ningun `@@unique` podia
   nombrar `companyId`— y R23 anade uno aprobado explicitamente por el humano. Pasa a **enumerar la
   lista entera** de los `@@unique` de `User` que nombran la empresa, exigiendo exactamente
   `[id, companyId], map: "users_id_company_id_key"`. Vigila **mas** que antes: ahora cae tambien un
   `@@unique` con otro `map`, con otras columnas o duplicado, cosas que el `not.toMatch` no
   distinguia. La intencion original —que `companyId` no sea unico por si solo y la relacion no se
   vuelva 1-1— sigue cubierta por el `not.toMatch(/@unique/)` sobre la columna, que ya estaba.
   Comprobado mutando: con un `@@unique([companyId, email], ...)` el caso se pone rojo.

2. **`tests/unit/recetas-ui/recipe-route-contract.test.ts`** (QC-34), caso
   `la feature no toca lib/modules/recetas ni db/`. Mide sobre `git diff origin/dev...HEAD`, o sea
   sobre la rama que corre el gate y no sobre la de QC-34, asi que con QC-34 ya mergeada muerde a
   **cualquier** rama que toque `db/` con permiso del humano. El archivo documenta su propio
   protocolo de mantenimiento —nombrar una a una cada migracion legitima posterior, como ya hicieron
   QC-47 y QC-74 en el mismo archivo— y es lo que se siguio: constante `MIGRACION_QC83` con los dos
   archivos de la migracion y su filtro, con el comentario del porque en el mismo estilo y tono.
   Comprobado que **sigue mordiendo**: con un archivo de `db/` no nombrado en ninguna lista, el caso
   vuelve a rojo.

## Verificacion ejecutada (lo que corri yo; el gate completo es del leader)

```
pnpm run typecheck   -> tsc --noEmit, sin errores
pnpm run lint        -> eslint, sin hallazgos

pnpm run test:guardias
     -> Test Files  24 passed (24) · Tests  227 passed | 4 skipped (231) · 4.30s

pnpm exec vitest run tests/unit/identity tests/integration/identity \
     tests/unit/recetas-ui/recipe-route-contract.test.ts tests/unit/recetas/module-contract.test.ts
     -> Test Files  43 passed (43) · Tests  676 passed (676) · 23.16s

pnpm exec playwright test
     -> 40 passed, 10 failed (6.6m) — los 10 preexistentes en dev, ver R27
```

**No se corrio `./init.sh`, ni `./init.sh --rapido`, ni `pnpm test` a secas**: es del leader
(`AGENTS.md > Regla del gate`).

Nota de entorno: el worktree venia **sin `node_modules`**. Se corrio
`pnpm install --frozen-lockfile` (lockfile intacto, `git diff` vacio), `prisma migrate deploy` y
`prisma generate` contra la base propia `QuimiCloude_QC83`. Nunca se apunto a `QuimiCloude` a secas
y no se toco el `.env`.

## Lo que queda fuera, a proposito

Ningun service, caso de uso, ruta, pantalla, Server Action, route handler ni regla de permisos
(R27). El alta, la edicion, el borrado y la lectura de grupos son **QC-84**; la pantalla, **QC-85**;
asignar un pedido a un grupo, **QC-86**. El filtrado de personas de baja, inactivas o bloqueadas al
leer es de **QC-84**: la base las conserva a proposito (R20) para que reactivar una cuenta devuelva
a esa persona a sus grupos sin ninguna escritura adicional.
