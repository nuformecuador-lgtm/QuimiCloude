# QC-48 — tenant-en-la-sesion · bitacora de implementacion

> Zona `backend` · rama `feature/QC-48-tenant-en-la-sesion` · worktree
> `.worktrees/QC-48-tenant-en-la-sesion` · base de comparacion `738d9a9` (merge-base con
> `origin/dev`).
>
> Spec aprobado por el humano el 2026-09-07. **Ninguna decision cerrada se reabrio** y el
> `design.md` se cumplio tal cual: no hubo que parar por nada.

## Que se construyo

La empresa de la persona se resuelve **al autenticarse, leyendo su propia ficha**, y viaja
**firmada** dentro de la cookie igual que ya viajaba el rol. El formato sube a `v3` **sin
compatibilidad**. El middleware **no cambia ni una linea**: el corte del borde lo hace el esquema
del contenido firmado. Y la comprobacion real —que la empresa sigue siendo suya y sigue viva— va
en el lector de sesion, que ya leia esa misma fila: **cero consultas nuevas por peticion**.

**No hay migracion, ni tabla, ni columna, ni dependencia nueva.** QC-47 ya dejo `users.company_id`
obligatoria y `companies.deleted_at`; esta ficha es lectura pura sobre ese modelo.

## Tandas y commits

| Commit | Tasks | Que |
| --- | --- | --- |
| `42bb038` | T1-T3 | El contenido firmado sube a `v3` y gana `cid`. Sin rama de lectura de `v2` |
| `daac8aa` | T9 | Tests del portero. **Cero cambios** en `middleware.ts` y `route-guard-middleware.ts` |
| `727b27c` | T4-T5 | El login trae la empresa por `JOIN` y corta si no esta viva, en el dominio |
| `3103e07` | T12 | E2E extendido (no duplicado): empresa dada de baja no entra |
| `c0c51e7` | T6-T8 | Una sola cadena de cortes, dos proyecciones; `getSessionContext` cableado |

## Archivos

**Produccion tocada (11).** `domain/session-claims.ts` · `domain/session.ts` ·
`adapters/driven/session/session-token.ts` · `ports/user-credentials-reader.ts` ·
`adapters/driven/persistence/user-credentials-prisma.ts` · `domain/verify-credentials.ts` ·
`ports/session-user-reader.ts` · `adapters/driven/persistence/session-user-prisma.ts` ·
`ports/session-provider.ts` · `lib/modules/identity/index.ts` · `lib/composition/index.ts`.

**Produccion nueva (2).** `domain/session-context.ts` · `domain/resolve-session.ts`.

**Tests (11).** `session-claims` · `session-ticket` · `session-token` · `session-cookie` ·
`verify-credentials` · `resolve-session` **(nuevo)** · `resolve-session-user` ·
`route-guard-middleware` · `composition/identity-facade` **(nuevo)** · los dos de integracion de
`identity` · `e2e/login.spec.ts`.

**Intactos y comprobados como tales:** `db/schema.prisma`, `db/migrations/**`, `package.json`,
`pnpm-lock.yaml`, `docs/dependencias.md`, `middleware.ts`,
`adapters/driving/route-guard-middleware.ts`, `domain/session-user.ts`, y **todo** `app/`,
`components/` y los modulos de negocio.

## Mapa de trazabilidad `R1`-`R28` -> test

Sin huecos: los 28 tienen un test concreto, con archivo y nombre.

| R | Que exige | Archivo | `test(...)` |
| --- | --- | --- | --- |
| R1 | La empresa se lee de la ficha, no de la entrada | `tests/unit/identity/verify-credentials.test.ts` | `el ticket emitido lleva la empresa leida de la base, no una recibida del cliente` |
| R2 | Misma consulta, sin una adicional | `tests/integration/identity/login.int.test.ts` | `una sola lectura trae la empresa del usuario y su estado de baja` |
| R3 | Empresa no viva: ni sesion, ni escritura, mismo rechazo | `tests/unit/identity/verify-credentials.test.ts` | `una empresa dada de baja devuelve el mismo objeto de rechazo que una contrasena incorrecta` + `una empresa dada de baja no escribe nada ni emite sesion` |
| R4 | Exactamente una verificacion de hash tambien ahi | `tests/unit/identity/verify-credentials.test.ts` | `el camino de la empresa dada de baja verifica el hash una vez, igual que los otros` |
| R5 | Sin empresa no se emite, y no se supone ninguna | `tests/unit/identity/verify-credentials.test.ts` · `session-ticket.test.ts` | `si la base devuelve otra empresa, el ticket lleva esa otra` · `el ticket propaga el companyId que se le pasa, sin tocarlo` |
| R6 | Firma **solo** el identificador | `tests/unit/identity/session-token.test.ts` · `session-cookie.test.ts` | `del ticket no se firma nada de la empresa que no sea su identificador` · `el valor va firmado con HMAC y solo lleva sub/iat/exp/role/cid` |
| R7 | Una sola version vigente, distinta de la anterior | `tests/unit/identity/session-token.test.ts` | `reconoce la version vigente y descarta cualquier otra, v1 y v2 incluidas` |
| R8 | `v2` fuera sin firma y sin leer el secreto | `tests/unit/identity/session-token.test.ts` · `session-cookie.test.ts` | `un v2 con firma correcta y exp futuro resuelve null` + `y rechaza el v2 SIN verificar la firma: no se llama a crypto.subtle.sign` + `el v2 se rechaza igual con un secreto que no es el suyo: el secreto no llega a usarse` · `un v2 impecable resuelve null, y sin leer el secreto` |
| R9 | `cid` ausente/vacio/no texto/sin forma de UUID -> sin sesion | `tests/unit/identity/session-claims.test.ts` | `un cid ausente, vacio, que no es texto o sin forma de UUID devuelve null` |
| R10 | Sin empresa bien formada, ruta privada -> login con `next=` | `tests/unit/identity/route-guard-middleware.test.ts` | `redirige al login con la ruta pedida cuando el contenido firmado no lleva empresa (R10)` + `redirige al login cuando la empresa firmada esta mal formada (R10)` |
| R11 | El borde no consulta la base ni arrastra Prisma | `tests/guards/guard-middleware-edge.test.ts` · `route-guard-middleware.test.ts` | guardia completa · `no importa la composicion Node ni ningun repositorio: el borde no consulta la base (R4)` |
| R12 | La decision de ruta no depende del **valor** de la empresa | `tests/unit/identity/route-guard-middleware.test.ts` | `toma la MISMA decision para dos sesiones identicas salvo por su empresa (R12)` |
| R13 | Compara contra la ficha ya leida, sin consulta adicional | `tests/integration/identity/session-user.int.test.ts` | `trae empresa y estado sin una segunda consulta` (espia `findFirst`, `toHaveBeenCalledTimes(1)`) |
| R14 | Empresa firmada distinta de la de la ficha -> sin sesion | `tests/unit/identity/resolve-session.test.ts` | `con companyId firmado distinto al de la ficha resuelve null` |
| R15 | Empresa de la ficha no viva -> sin sesion | `tests/unit/identity/resolve-session.test.ts` | `con companyDeletedAt no nulo resuelve null` + `con empresa muerta que si casa con la firmada resuelve null igual` |
| R16 | Mismo camino de salida, sin pantalla ni ruta nueva | `tests/unit/identity/resolve-session.test.ts` | `sin registro de usuario activo resuelve null` (los cortes nuevos salen por ese mismo `null`; cero diff en `app/`) |
| R17 | Los cortes nuevos van **detras** de los que ya existian | `tests/unit/identity/resolve-session.test.ts` | `sin claims resuelve null sin llamar a findActiveById` + `con sesion caducada resuelve null sin llamar a findActiveById` |
| R18 | Se puede preguntar la empresa desde el servidor | `tests/unit/composition/identity-facade.test.ts` | `la fachada expone getSessionContext junto a getSessionUser` + `con sesion devuelve userId, companyId y roleName` |
| R19 | Sin sesion, ausencia de empresa, en los mismos casos | `tests/unit/composition/identity-facade.test.ts` | `sin sesion devuelve null` + `la empresa muerta deja sin sesion tambien a getSessionUser: una sola cadena` |
| R20 | Lo expuesto es lo **leido de la base**, no lo firmado | `tests/unit/identity/resolve-session.test.ts` | `expone el companyId y el rol leidos de la base, no los firmados` |
| R21 | Una sola cadena: no hay dos definiciones de «hay sesion» | `tests/unit/identity/resolve-session.test.ts` · `identity-facade.test.ts` | `con sesion valida compone user y context coherentes` · `la empresa muerta deja sin sesion tambien a getSessionUser: una sola cadena` |
| R22 | Solo empresa, usuario y rol; ni permisos ni capacidades | `tests/unit/identity/resolve-session.test.ts` · `identity-facade.test.ts` | `el contexto lleva userId, companyId y roleName y nada mas` · `lo expuesto no trae permisos ni capacidades` |
| R23 | El rol se resuelve exactamente como antes | `tests/unit/identity/route-guard-middleware.test.ts` · `session-claims.test.ts` | `sigue decidiendo por el rol firmado exactamente como antes de esta feature (R23)` · `un JSON valido con role produce claims con roleName` |
| R24 | Ni tabla, ni columna, ni indice, ni migracion | `tests/unit/identity/schema/identity-schema.test.ts` + `schema/companies-migration.test.ts` | verdes sin tocarlas; `git diff 738d9a9 -- db` **vacio** |
| R25 | Ninguna consulta de negocio filtrada, ninguna pantalla | suites de `inventario`, `recetas`, `unidades`, `proveedores`, `pedidos` | 97 archivos / 1168 tests verdes **sin tocar su guion**; diff **vacio** en `app`, `components` y los cinco modulos |
| R26 | Ningun alta de usuario ni regla de herencia de empresa (es QC-66) | `tests/unit/identity/seed/seed-initial-access.test.ts` | verde sin tocarse: el unico camino que crea usuarios sigue siendo el seed, y no gano ninguna regla de empresa |
| R27 | El E2E de login se **extiende**, no se duplica | `e2e/login.spec.ts` | `con la empresa dada de baja no entra pese a tener las credenciales correctas`, junto a los dos que ya existian, intactos |
| R28 | Ninguna dependencia nueva | `tests/guards/guard-dependencias-aprobadas.test.ts` | verde; `package.json`, `pnpm-lock.yaml` y `docs/dependencias.md` sin una linea de diff |

## Salida real de lo que se corrio

Solo lo que corresponde al implementer: **nadie corrio la suite completa** (`AGENTS.md > Regla del
gate`). `./init.sh` es del leader y **queda pendiente** (ver «Lo que queda»).

```
pnpm exec vitest run guard tests/unit/middleware-root-contract.test.ts tests/unit/identity/schema
  Test Files  20 passed (20)
       Tests  239 passed | 4 skipped (243)          <- T10

pnpm exec vitest run tests/unit/identity tests/unit/composition
  Test Files  30 passed (30)
       Tests  415 passed (415)

pnpm exec vitest run tests/unit/inventario tests/unit/recetas tests/unit/recetas-ui \
                     tests/unit/unidades tests/unit/proveedores tests/unit/proveedores-ui \
                     tests/unit/pedidos
  Test Files  97 passed (97)
       Tests  1168 passed | 4 skipped (1172)        <- T11

pnpm lint
  (sin salida: limpio)

pnpm typecheck
  app/layout.tsx(43,56): error TS2304: Cannot find name 'LayoutProps'.
  tests/integration/inventario/list-query-indexes.int.test.ts(77,5): TS2322 ... falta 'companyId'
  tests/integration/pedidos/list-query-orders.int.test.ts(131,7):   TS2322 ... falta 'companyId'
```

**Los tres rojos de `typecheck` son heredados, no de esta feature.** Medido, no supuesto: esos tres
archivos tienen **cero diff** contra `738d9a9`, y `pnpm typecheck` sobre el propio `738d9a9` da
**exactamente 3 errores**. Los dos de integracion son fallout de QC-47 (`users.company_id` se hizo
obligatoria y esos `prisma.user.create` no la pasan) y el de `app/layout.tsx` son los tipos
generados de Next, que no existen sin un `next build`. **No se tocaron ni se diagnosticaron**: son
material del leader.

## Lo que NO se pudo verificar aqui

**Los tests de integracion y el E2E estan escritos pero no vistos en verde en este worktree**: no
tiene `.env`, asi que todo lo que toca base muere con `Environment variable not found:
DATABASE_URL`. Afecta a `login.int.test.ts` (R2), `session-user.int.test.ts` (R13) y
`e2e/login.spec.ts` (R3, R27). **Tienen que correr en el gate completo del leader**, que es
justamente donde hay base.

## Decisiones de implementacion

1. **`createResolveSessionUser` deja de usarse en `lib/composition`.** `design.md > 6` exige **una
   sola** instancia de `createResolveSession` para las dos salidas, y eso es lo que se cableo. La
   funcion **conserva su firma publica exacta** y su sitio en el barrel, que es lo que
   `design.md > 4.2` pedia proteger: los tests de QC-8 siguen verdes sin tocar su guion.
2. **El origen de `companyId` (R20) se demuestra por el campo hermano.** Tras el corte 4 el
   firmado y el de la base son iguales *por construccion*, asi que ningun test puede distinguirlos
   por ese campo. Se distingue por el **rol**: el fixture firma un rol distinto al de la ficha y se
   afirma que lo expuesto es el de la ficha. Queda anotado en el propio test.
3. **`SessionContext.roleName` es `string`**, no `string | null`: sale de `SessionUserRecord`, que
   viene del `JOIN` obligatorio a `roles`. `SessionUser` **no se toco** (sigue congelado, §5).
4. **`toBe` y no `toEqual`** para afirmar que la empresa muerta devuelve el **mismo objeto**
   `REJECTED`: `toEqual` probaria equivalencia, no identidad, y el requisito es identidad.
5. **El helper del E2E gano un parametro opcional** (`targetCompanyId`, por defecto la empresa
   viva) en vez de duplicarse. Las dos llamadas que ya existian no cambian ni una letra.
6. **`tasks.md` citaba `tests/unit/identity/session.test.ts`**, que no existe: el archivo real es
   `session-ticket.test.ts`. Se uso el que existe en vez de crear uno nuevo.
7. **Finales de linea.** Auditados **contra `738d9a9`, no contra `HEAD`** —comparar contra `HEAD`
   fue el error que propago la conversion en QC-57—, archivo por archivo y contando bytes `CR`.
   Resultado: **ningun archivo cambio de final de linea**. El repo es LF salvo
   `session-cookie.test.ts`, que es CRLF en origen y se dejo CRLF. Unica excepcion, anotada por
   honestidad: `session-ticket.test.ts` tenia **3** lineas CRLF sueltas sobre 43 y quedo entero en
   LF — 3 lineas, no una conversion masiva.

## Riesgo de despliegue (no es una task)

**Al mergear esto, todas las sesiones vivas caen** (decision cerrada 7, `design.md > 11` riesgo 1).
Quien este dentro aparece en el login en su siguiente navegacion. Es el precio aceptado por escrito
de no mantener dos formatos de cookie.

Y, del riesgo 4: la comprobacion de empresa viva es **por peticion**, asi que **dar de baja una
empresa echa a todo el mundo al instante**, no al cabo de 8 h. Conviene que lo sepa la ficha que
construya la baja de empresas.

## Lo que queda

**T14 (gate completo) esta SIN marcar a proposito.** Pide `./init.sh`, y `AGENTS.md > Regla del
gate` dice que eso lo corre **el leader**, no el implementer. Es tambien lo unico que puede poner
en verde los tests de integracion y el E2E de esta ficha, porque necesita base de datos.

Despues de esto va el `reviewer`. **F2.3 (sincronizar con `dev`) y F2.4 (abrir el PR) no se
hicieron**: el orden lo lleva el leader.
