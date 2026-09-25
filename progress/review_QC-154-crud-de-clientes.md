# Review — QC-154 `crud-de-clientes`

> Reviewer, 2026-09-24. Rama `feature/QC-154-crud-de-clientes`, HEAD `7657b74a`, al dia con `origin/dev`.
> Spec: `specs/QC-154-crud-de-clientes/` (R1–R47, nota F1.4). Bitacora: `progress/impl_QC-154-crud-de-clientes.md`.

## Veredicto: **RECHAZADO**

Hay 3 hallazgos BLOQUEANTES y 11 menores. El codigo de negocio es solido: la autorizacion va en el service, el aislamiento por empresa, la migracion y la enmienda al catalogo estan bien. Lo que bloquea es esto:

- las citas de ficha y requisito en los comentarios de produccion;
- el rojo intermitente que `scope.test.ts` mete en el gate de todas las sesiones;
- dos clausulas de salida (R22 y R47) cubiertas solo por tests tautologicos.

## Que ejecute yo (no me fie solo de la bitacora)

```
pnpm exec vitest run --project node  tests/unit/clientes/{authorization,customer-actions,customer-input,
  customer-service,customer-text,list-customers}.test.ts tests/unit/clientes/schema
  tests/unit/errores/catalogo.test.ts tests/unit/identity/session-once-per-request-actions.test.ts
  tests/guards/guard-{ambito-empresa-clientes,contrato-listados,autorizacion-por-permiso,
  permisos-no-administrables,identificador-de-request,arquitectura-modulos,catalogo-de-errores}.test.ts
-> exit 0 · Test Files 18 passed (18) · Tests 328 passed (328)
```

- **No corri** `tests/unit/clientes/scope.test.ts`. El leader corre el gate completo **en este mismo worktree** a la vez. Ese archivo escribe y borra archivos en el arbol real, y correrlo en paralelo es justo lo que provoca el ENOENT del hallazgo B2. La bitacora da 21/21 en solitario.
- No corri la integracion (los `.int.test.ts`) ni `./init.sh`, por instruccion: los cubre el gate completo del leader. **El veredicto no depende de ese resultado.** Si el gate sale verde, los tres bloqueantes siguen en pie.

## Checklist

| # | Punto | Estado |
| --- | --- | --- |
| 1 | Trazabilidad R1–R47 -> test que muerde | **NO** — R22 y R47 (clausula de salida), ver B3. El resto si, con los desfases de nombre de m8 |
| 1a | Fila R32 corregida | **SI, confirmado.** `tasks.md` cita solo `tests/unit/clientes/customer-actions.test.ts` › `R32 — las mutaciones reciben FormData y las consultas argumentos tipados`. Existe, y su punto 3 comprueba que no hay `app/api/clientes` ni `app/api/customers` y que no hay `fetch(`. Coincide con `design.md > 13` |
| 2 | Tasks `[x]` | **NO** — falta T16 (cierre, gate completo). La cierra el leader (m9) |
| 3 | CHECKPOINTS | Ver abajo |
| 4 | Verificacion ejecutable | Parcial y en verde (arriba). El gate completo, en manos del leader |
| 5 | Calidad y seguridad | Sin tabla nueva (la RLS de `customers` es de QC-153 y no se toca). Sin webhooks. Sin secretos. Capas separadas. **Comentarios: NO** (B1) |
| 6 | Multiplataforma | No aplica: no toca UI (no hay nada bajo `app/`, `components/` ni `hooks/`) |
| 7 | Dependencias | SI: `package.json` intacto. `zod` y Prisma ya registrados. `String.normalize` es del estandar |
| 8 | Aislamiento por empresa | SI. No hay modelo nuevo (`Customer` ya lleva `companyId`). Todo `where` compone `customerCompanyScope(scope)` al mismo nivel que `deletedAt: null`. `count` y `findMany` comparten objeto. Las escrituras usan `updateMany` con el ambito en el `where`. Rechazo cruzado probado: `R10` (repository int) y `R11` (x2). Lo vigila la guardia `guard-ambito-empresa-clientes` |
| 9 | Comentarios en lineas anadidas | **NO** (B1) |

### CHECKPOINTS.md, punto por punto

- **Especificacion.** Estan requirements (EARS numerados), design (alternativas A1-bis a A8 descartadas) y tasks. Tasks todas `[x]`: **no** (falta T16).
- **Trazabilidad.** Mapa en la bitacora: si. Cada R con test que muerde: **no** (B3).
- **Calidad.** Typecheck, lint y `pnpm test`: los resuelve el gate del leader. La bitacora da typecheck limpio y lint con 0 errores (7 warnings preexistentes ajenos). E2E: no aplica en esta ficha (decision 7: el de permisos va en QC-155). Multiplataforma y dependencias: no aplican.
- **Datos y seguridad.**
  - Columna de empresa y filtro con test de cruce: si.
  - Permiso validado en el SERVICE con test: si. `requirePermission` es la primera linea de los cinco casos de uso (`clientes.modificar` para alta, edicion y baja; `clientes.consultar` para ficha y listado). `authorization.test.ts` usa dobles que **explotan** si se les llama. Cubre ausente/null/undefined, conjunto vacio, permiso contrario (R4), basura sin permiso -> `unauthorized` (R5) y los tres roles de `SEED_ROLE_PERMISSIONS` (R8).
  - RLS: sin tabla nueva.
  - Solo Prisma: si.
  - Migracion con `down.sql`: si, y el ciclo real migrate -> rollback -> migrate esta pegado en la bitacora (T21).
  - Secretos y webhooks: no aplica.
- **Hexagonal.** Dominio y puertos solo importan `zod`, `./` y los barrels de `identity` y `errores`. Solo se importa el contrato de otros modulos. La action pide la fachada a `lib/composition`. `index.ts` reexporta solo de `./domain`, sin `'use server'`. No se consulta ningun modelo ajeno. La logica vive en `domain/`: la action no decide (y hay test que lo comprueba).
- **Permisos.** Las mutaciones usan Server Actions y no hay route handler. Paginas y componentes: no aplica.
- **Configuracion.** Nada hardcodeado que cambie entre entornos.
- **Verificacion final.** `./init.sh`: lo corre el leader. Este review: RECHAZADO. `history.md` y desmontaje del worktree: los hace el leader al cerrar.

### Lo que se pidio mirar en especial

- **Autorizacion en el service:** correcta, ver arriba.
- **Id de otra empresa:** `updateMany`/`findFirst` con el ambito devuelven `count 0`/`null`, que el caso de uso traduce a `CustomerNotFoundError`. La integracion (R10) relee la fila ajena, y el unit (R23) prueba la traduccion.
- **Id sin forma de uuid:** `isCustomerId` va despues del permiso y antes del puerto en get, update y delete. `R23` afirma `not.toHaveBeenCalled()` sobre los tres metodos.
- **Busqueda sin acentos:** hay una sola normalizacion (`domain/customer-text.ts`). La usan el alta y la edicion (tres formas emparejadas, R42) y el adaptador, para las palabras de la busqueda y el filtro de ciudad. El adaptador **no** renormaliza al escribir.
- **La migracion `20260924190000_customers_search_normalized`, escrita a mano:**
  - Pasos: `CREATE EXTENSION IF NOT EXISTS pg_trgm`, las tres columnas anulables, el `UPDATE` de relleno con la pareja de `translate` **literal** de `20260904160000_list_query_indexes`, `SET NOT NULL` y tres GIN `gin_trgm_ops` con `WHERE "deleted_at" IS NULL`.
  - No hay ningun `DROP` en el UP.
  - El `down.sql` va en orden inverso, sin `DROP EXTENSION`.
  - Es el mecanismo del precedente (columna `*_normalized` escrita por la aplicacion, relleno con `translate`, GIN parcial). No inventa nada.
  - La marca de tiempo es posterior a la ultima de `origin/dev` (`20260924180000`).
- **`customer_not_found`:** anadido al final de `ERROR_CODES` y en la cabecera («Duodecima enmienda, el 2026-09-24», sin citar ficha). Tiene clave y el texto aprobado en F1.4. El censo pasa de 54 a 55. El diff de `lib/modules/errores/` es solo eso.
- **Guardias (design § 12):** solo **amplian**. `clientes` entra en `BUSINESS_MODULES` de `guard-autorizacion-por-permiso` y de `guard-permisos-no-administrables`, y en `MODULOS_DE_NEGOCIO` de `guard-identificador-de-request`, junto con la migracion en su lista cerrada. `guard-contrato-listados` pasa de seis a siete modulos (el texto «seis/siete» se actualiza). `ACCIONES` gana `listCustomersAction` y `aislamiento.json` tres entradas. No se quito ningun caso ni ningun aserto.
- **`scope.test.ts` (design § 11):** relaja exactamente lo declarado y nada mas: la lista cerrada de archivos sustituye a «vacio salvo .gitkeep», `'use server'` se acota fuera de `adapters/driving/`, el literal de permiso se admite en `domain/**` y `driving/` queda en exactamente `customer-actions.ts`. Los casos R28 y R29 de QC-153 siguen intactos. El **problema de este archivo es otro** (B2).
- **Base compartida:** la bitacora documenta `QuimiCloude_QC154` con el entorno sobrescrito, y T21 corrio contra ella.

---

## Hallazgos

### B1 — BLOQUEANTE · Comentarios de produccion que citan fichas, requisitos y `design.md` en lineas anadidas

La regla esta en `docs/conventions.md > Comentarios` y en el punto 9 del reviewer. `tasks.md` tambien lo avisaba («Los comentarios de produccion no citan fichas ni requisitos»). `git diff dev...HEAD -U0 -- lib db` da **unas 70 lineas anadidas** con `R<n>`, `QC-<n>`, `P3`/`P5`, `T11`/`T12` o `design.md`. Todas son archivos nuevos o bloques nuevos de esta rama:

- `db/migrations/20260924190000_customers_search_normalized/migration.sql`: la linea 1 cita `QC-154 (F1.4)` y la linea 4 `design.md > 17.2`.
- `.../down.sql`: la linea 1 cita `(QC-154, F1.4)`.
- `lib/composition/index.ts` (bloque nuevo): `// clientes (T11)` en los imports y en el separador, `QC-57 (R6)`, y «(T11, `design.md > 10`) ... Server Action de T12».
- `lib/modules/clientes/adapters/driven/persistence/customer-prisma.ts`: `design.md > 8`, R9, R13, R21, R22, R23, R42, R20, R24, R29, `P3`, R47, `design.md > 17.3`, R30, R41, R11, R31 y R26-R31.
- `.../persistence/company-scope.ts`: R12.
- `.../driving/customer-actions.ts`: `design.md > 9`, R7 y R32.
- `lib/modules/clientes/domain/`:
  - `create-customer.ts`: R9, R13, R42, R2, R3, R5.
  - `update-customer.ts`: R20, R21, R23, R42, P5, R10.
  - `delete-customer.ts`: R21, R23, R24, R25, P5.
  - `get-customer.ts`: R22, R23, P5.
  - `list-customers.ts`: R27 y R26-R31.
  - `customer-input.ts`: R20.
  - `customer-queryable.ts`: R28, R27, R47.
  - `customer-text.ts`: R42 y `QC-42`.
  - `customer-view.ts`: R42, R22, R47.
- `lib/modules/clientes/ports/customer-repository.ts`: `design.md > 8`, R25, R19, R10, R23.
- `lib/modules/clientes/ports/list-query-log.ts`: `QC-57 T7`, R6, `design.md > 8` y «decision cerrada 13». La guardia de listados **no** compara este archivo: la copia de `list-query.ts` no es excusa aqui.
- `lib/modules/clientes/index.ts`: `design.md > 5`.

**Que falta:** quitar las citas de esas lineas y dejar solo el porque que el codigo no muestra, corto. Va en un commit propio `chore(QC-154): limpia comentarios de ...`, solo comentarios. Queda fuera `domain/list-query.ts` (ver m1).

### B2 — BLOQUEANTE · `tests/unit/clientes/scope.test.ts` crea y borra archivos en el arbol real y mete un rojo intermitente en el gate de todos

**El hecho.** Cinco casos escriben con `writeFileSync` dentro del repo y borran en `finally`:

| Linea | Fabricado | Origen |
| --- | --- | --- |
| 233 | `lib/modules/clientes/__sensibilidad_literal__.ts` | QC-153, el bloque que esta rama modifica |
| 245 | `lib/modules/clientes/domain/__sensibilidad_literal__.ts` | nuevo |
| 374 | `lib/modules/clientes/domain/__sensibilidad_paginacion__.ts` | nuevo |
| 482 | `app/__sensibilidad_clientes__/page.tsx`, que ademas **crea un directorio en `app/`** | nuevo |
| 523 | `lib/modules/clientes/domain/__sensibilidad_pedidos__.ts` | nuevo |

El proyecto `node` de vitest corre archivos en paralelo: solo `integration` lleva `fileParallelism: false`, en `vitest.config.mts`. Cualquier guardia que lista `lib/modules/**` o `app/**` con `readdirSync` y despues lee puede encontrarse el fabricado listado y ya borrado (ENOENT) o, peor, a medio vivir.

**Ya ha pasado.** La bitacora lo reproduce dos veces: `guard-permisos-no-administrables` en T9-T12, y `guard-catalogo-de-errores` en una de tres corridas de T15. Las dos fallaron sobre el fabricado de la linea 233. Tambien pueden caer las guardias de arquitectura y de autorizacion, `guard-identificador-de-request`, las cinco `guard-ambito-empresa-*` y cualquier otra que barra esas raices.

**Por que bloquea.**

- Tras el merge, el gate de **todas** las sesiones cambia de color segun el orden de los workers.
- `tests/baseline-rojos.json` no puede absorberlo: el rojo cae en guardias ajenas y al azar.
- `vitest.config.mts` lo dice con otras palabras: «un gate que cambia de color segun el orden no informa de nada».
- Esta rama pasa de 1 fabricado a 5 y multiplica la exposicion por cinco.
- Una interrupcion (Ctrl-C o un worker muerto) deja basura en `lib/` o en `app/` que un `git add -A` se lleva.
- **Nada lo exige.** `design.md > 11` pide un segundo fabricado «dentro de `domain/`», pero no dice que sea en el arbol real. T4 y T15 piden reglas que «fallan con un fabricado (**comprobado y revertido**)», que es una mutacion manual, no un test permanente. El precedente del repo es `mkdtempSync`: `guard-sesiones-cortadas`, `tests/unit/test-database/nombres-y-huella` y el propio `scope.test.ts` en su caso de carpetas (lineas 95-105).

**Arreglo minimo.** Todo cabe en `tests/unit/clientes/scope.test.ts` y no toca ninguna guardia:

1. Parametrizar cada detector por raiz, con la real por defecto:
   - `fuentesDeProduccion(raiz = repoRoot)` y `detectarLiteralesDePermiso(raiz = repoRoot)`. `permisoPermitidoEn` ya trabaja con rutas relativas, asi que no cambia.
   - `hallazgosDePaginacion(dir = moduloDir)`.
   - `coincidenciasEnApp(appDir = join(repoRoot, "app"))`.
   - `hallazgosDeAcoplamiento(modDir = moduloDir, pedidosDir = PEDIDOS_DIR)`.
2. En los cinco casos de sensibilidad (lineas 230-253, 373-382, 480-491 y 522-531):
   - crear `const raiz = mkdtempSync(join(tmpdir(), "qc154-scope-"))`;
   - escribir el fabricado en `raiz/lib/modules/clientes/...` o en `raiz/app/__sensibilidad_clientes__/page.tsx`;
   - llamar al **mismo** detector con esa raiz;
   - hacer `rmSync(raiz, { recursive: true, force: true })` en `finally`.

   El caso simetrico de `domain/` sigue probando la relajacion con el mismo predicado.
3. Anadir un caso barato que afirme que ningun `writeFileSync` o `mkdirSync` del archivo apunta dentro de `repoRoot`. Es opcional, pero sella la regresion.

Se descarta la alternativa de volver tolerantes a ENOENT las guardias que recorren el arbol. Obliga a tocar unas diez guardias ajenas y enmascara ENOENT legitimos. Y no cura el otro riesgo: una guardia puede **leer** el fabricado mientras existe. Por ejemplo, `__sensibilidad_pedidos__.ts` importa `@/lib/modules/pedidos` desde `clientes/domain`, a la vista de cualquier barrido de imports. El ENOENT es el sintoma. La causa es escribir en el arbol real.

### B3 — BLOQUEANTE · La clausula de salida de R22 y R47 solo la cubren tests que prueban su propio doble

- **R22** («NO DEBE devolver ni la empresa ni la marca de baja»). La trazabilidad cita solo `customer-service.test.ts` › `R22 — ...`. Ese test configura `findAliveById: vi.fn(async () => VISTA)` y comprueba las claves de `VISTA`, que es el propio doble.
- **R47** («NO DEBE devolver ninguna forma normalizada en la ficha ni en el listado»). `customer-service.test.ts` › `R47 — ni la ficha ni el listado devuelven formas normalizadas` hace lo mismo, y su mitad del listado llama directamente a `repo.listAlive` **del doble**. El test de integracion `R47 — filtrar por bogota...` solo mira ids.

Si `customer-prisma.ts` devolviera la fila de Prisma con `companyId`, `deletedAt` o `*Normalized` en el `select` (`return row`, que TypeScript acepta porque el tipo es mas ancho y no es un literal), **ningun test se pondria rojo**. `docs/verification.md > Regla del reviewer`: un test que no verifica el requisito que dice cubrir es bloqueante.

**Que falta:** en `tests/integration/clientes/customer-repository.int.test.ts`, un caso que afirme el conjunto **exacto** de claves del resultado real:
- de `findAliveCustomerById`;
- y de cada item de `listAliveCustomers`.

Son las 11 claves: `id`, los seis datos, los dos instantes y los dos autores. Ninguna de `companyId`, `deletedAt` o `*Normalized`. Despues hay que citarlo en las filas R22 y R47 de `tasks.md` y del mapa de la bitacora.

### Menores

- **m1 · menor.** `domain/list-query.ts` arrastra citas (`QC-57 T1`, R1-R32, `design.md > ...`, «decision cerrada 13», QC-4, QC-20, QC-55) porque `guard-contrato-listados` exige copia caracter a caracter de las siete. `design.md > 6.1` lo declara. Aqui no se puede limpiar sin tocar las siete copias. Pide ficha de board.
- **m2 · menor.** `adapters/driven/persistence/list-query-sql.ts` exporta `textCondition` y `TextCondition`, que ya **nadie usa**: desde F1.4 el filtro de ciudad va contra `cityNormalized`. Ademas su cabecera dice «Se copian SOLO las dos funciones que este modulo usa (`textCondition`, ...)». Es codigo muerto y un motivo falso. Hay que borrarlos y corregir la frase.
- **m3 · menor.** `tests/unit/clientes/schema/customers-search-migration.test.ts` › «la cabecera ... no cita ninguna ficha ni requisito» solo busca `\bR\d+\b` y «decision cerrada». Por eso pasa en verde con `QC-154` y `design.md` en la cabecera. Hay que anadir `QC-\d+` y `design\.md` al arreglar B1.
- **m4 · menor.** `customer-service.test.ts` › `R25 — no existe ninguna operacion de restaurar...` mira las claves del doble `makeCustomers()`, no las del puerto. La propiedad si la sostiene `guard-ambito-empresa-clientes` (`metodosEsperados: 5`). Hay que citar la guardia o probar sobre el puerto real.
- **m5 · menor.** R10 (integracion) lee `updatedAt` de la fila ajena pero no lo afirma. `design.md > 13` pedia `updated_at`, `updated_by` y `deleted_at`.
- **m6 · menor.** R37:
  - el caso «el censo de campos dispara con un campo fabricado de mas» es vacuo: no llama a `camposDe`, rehace el mapeo en linea;
  - nada comprueba «ningun otro cambio de esquema» en otros modelos ni «ninguna otra migracion» de la rama. Lo verifique a mano en el diff: una sola migracion nueva, y `schema.prisma` solo toca `Customer`.
- **m7 · menor.** R40: `hallazgosDeAcoplamiento` solo busca el especificador `@/lib/modules/<x>`. Un `orders` o un `customers` en SQL crudo, o un `prisma.customer` dentro de `pedidos`, no lo pondria rojo. R40 dice «nombrar el modulo, el modelo ni su tabla». No verifique si otra guardia cierra el caso del modelo.
- **m8 · menor.** Nombres de la tabla de trazabilidad de `tasks.md` desfasados respecto de los reales:
  - R12: la tabla dice «toda funcion de persistencia...», pero los casos se llaman `<archivo>: toda funcion que toca la base...`;
  - R37, R38 (`no hay nada` frente a `nada`) y R43-R46 (casos estaticos con otro nombre);
  - el mapa de la bitacora pone `R43 — ...` con puntos suspensivos;
  - los casos cambiados de R26 conservan `R26 (QC-153)` sin anadir el R de QC-154, que `design.md > 11` pedia.

  El contenido existe. Solo hay que sincronizar nombres.
- **m9 · menor.** T16 esta sin marcar. Depende del `./init.sh` completo del leader, y hasta entonces no se cumple el checkpoint «todas las tasks `[x]`».
- **m10 · menor.** La primera linea de `customer-input.ts`, `customer-queryable.ts`, `customer-text.ts`, `customer-view.ts`, `list-query-sql.ts` y `list-query-log.ts` es un comentario con la propia ruta del archivo. Repite lo evidente.
- **m11 · menor.** R4 menciona «un actor sin conjunto de permisos». `authorization.test.ts` prueba `null`, `undefined` y `[]`, pero no un actor con `permissions` ausente. No lo verifique contra `assertPermission`.

## Para volver a revision

1. B1: limpiar las citas en su propio commit `chore`, y con ello el m3.
2. B2: poner los fabricados de `scope.test.ts` en `mkdtempSync` con los detectores parametrizados por raiz. Incluye el fabricado heredado de QC-153 en la linea 233.
3. B3: afirmar las claves exactas de la salida real del adaptador en `customer-repository.int.test.ts`, y actualizar las filas R22 y R47.
4. Despues, `./init.sh` completo en verde y T16 marcada. Los menores m2, m4, m5 y m8 son baratos y conviene hacerlos en la misma vuelta.
