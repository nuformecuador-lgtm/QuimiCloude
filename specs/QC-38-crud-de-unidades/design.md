# QC-38 — crud-de-unidades · design.md

> Requisitos en `requirements.md` (R1–R36). Alcance y decisiones cerradas: los fijó el humano al
> acotar y **no se reabren aquí**. Este archivo dice **cómo**, no **qué**.
>
> **Sin preguntas abiertas.** Las dos que `spec_author` levantó al escribir los requisitos —el
> código del permiso de escritura y el símbolo vacío— **las cerró el humano el 2026-09-08** y son las
> dos últimas filas de la tabla de decisiones. Este archivo las trata como requisitos firmes.

## 1. Estado de partida (lo que ya hay en esta rama)

La rama nace de `origin/dev` con **QC-76 mergeado** (PR #45, `5ee52fe`), más QC-74 (permisos) y
QC-54. Lo que existe hoy en `lib/modules/unidades/`, leído en el worktree:

| Pieza | Archivo | Estado |
| --- | --- | --- |
| Contrato público | `index.ts` | Publica `normalizeUnitName`, tipos, `createListUnits`, `requirePermission`, `Actor`, `UnitScope`, errores, `convertQuantity`. **No publica ninguna Server Action.** |
| Actor + permiso | `domain/actor.ts` | `Actor = { id, companyId, permissions }`; `requirePermission` delega en `assertPermission` de `identity` con la fábrica de `UnauthorizedError` del módulo. |
| Errores | `domain/errors.ts` | `UnidadesError` (abstracta, `code` estable), `UnauthorizedError`, `ValidationError`, `IncompatibleUnitsError`. |
| Único caso de uso | `domain/list-units.ts` | `listUnits`, con permiso → zod → sanitize → log → repositorio, y `scope = { companyId: actor.companyId }`. |
| Puerto de lectura | `ports/unit-repository.ts` | `listAll(limit, query, scope)`, `listPage(query, scope)`. |
| Adaptador Prisma | `adapters/driven/persistence/unit-prisma.ts` | Exporta `companyScopeWhere(scope)` — **la única definición** de «de la empresa o de sistema» (QC-76 R18). |
| Única Server Action | `adapters/driving/unit-actions.ts` | `listUnitsAction()`; resuelve el actor con `getSessionUser()` + `getSessionContext()` y falla cerrado. |

Y en la base, ya aplicado por `db/migrations/20260907190000_units_equivalence_and_scope/`:

- columnas `company_id`, `unit_id`, `factor DECIMAL(14,4)`, las tres opcionales;
- `units_derivation_pair_check`, `units_factor_positive_check`, `units_no_self_derivation_check`;
- `units_company_id_fkey` y `units_unit_id_fkey`, las dos `ON DELETE RESTRICT ON UPDATE CASCADE`;
- **cuatro** índices únicos parciales: `units_company_name_unique`, `units_system_name_unique`,
  `units_company_symbol_unique`, `units_system_symbol_unique`;
- el disparador `units_check_derivation_trigger` (un solo nivel, ámbito del padre, y las dos
  lecturas inversas);
- `ENABLE` + `FORCE ROW LEVEL SECURITY`, sin policies.

**Consecuencia de diseño, y es la principal:** esta ficha **no toca la base** (R32). Todo lo que
necesita ya está. Lo que aporta son casos de uso, un puerto de escritura, un adaptador que traduce
los códigos de Prisma a resultados discriminados, tres Server Actions, y **un permiso**.

## 2. El permiso de escritura (R2, R3, R4, R5)

QC-74 dejó un catálogo cerrado de **diez** permisos en
`lib/modules/identity/domain/permissions.ts`, y `unidades` es uno de los dos módulos que sólo tiene
`consultar` «porque no tiene escritura» (su R4). Esta ficha **le da escritura**, así que la premisa
de aquella decisión deja de ser cierta y el catálogo gana una fila (decisión cerrada 23):

```ts
{
  code: 'unidades.modificar',
  module: 'unidades',
  action: 'modificar',
  description: 'Crear, editar y borrar unidades de medida.',
}
```

y `SEED_ROLE_PERMISSIONS[ROLE_ADMINISTRADOR]` gana `'unidades.modificar'` **junto a
`'unidades.consultar'`, que ya estaba**: QC-74 decidió que `modificar` **no implica** `consultar` y
que el seed los escribe **los dos, uno a uno** (su R8), así que aquí no se sustituye ni se deriva
nada —se suma el código nuevo a la lista—. El `Operador` **no** lo recibe (R4). Es todo:
`PermissionCode` es una unión derivada del array, así que
`requirePermission(actor, 'unidades.modificar')` compila sin tocar nada más, y el seed
(`seed-initial-access.ts`) deriva las filas que faltan de `PERMISSIONS` —no repite ni un código—,
así que es **idempotente** y la corrida siguiente crea la fila y su asignación sin migración (R5).

**Esto enmienda QC-74 R2** —«exactamente estos diez permisos, ni uno más ni uno menos»—, y queda
escrito con esas palabras y no disimulado. El motivo es que **QC-74 R4 dejó a `unidades` sin
escritura justificándolo con «no tiene escritura», y esta ficha es justamente la que se la da**: la
premisa de aquella decisión deja de ser cierta. Lo habilita además QC-76, que delegó el punto
explícitamente (su decisión cerrada 24: «si el permiso debe cambiar, lo decide QC-38»).

**Alternativa descartada:** reutilizar `unidades.consultar` también para escribir, y no tocar el
catálogo. Rompería la separación `consultar`/`modificar` que QC-74 construyó a propósito en los
otros cuatro módulos con escritura, y dejaría a cualquiera que hoy puede **ver** unidades pudiendo
**borrarlas**.

**Ripple, medido, no estimado.** Pasar de diez a once pone en rojo estos archivos, que no son de
esta feature:

- `tests/guards/guard-permisos-sembrados.test.ts` (`PERMISSIONS.length` = 10)
- `tests/guards/guard-nav-permisos-declarados.test.ts` (`CODIGOS_VALIDOS` = 10)
- `tests/unit/navegacion/qc75-convenciones.test.ts` (catálogo = 10)
- `tests/unit/identity/permissions.test.ts` («el Administrador tiene los diez permisos»)
- `tests/unit/identity/seed/seed-initial-access.test.ts` (diez permisos, once asignaciones)
- `tests/integration/identity/identity-seed.int.test.ts` (mismo conteo, contra base real)

Los seis se **actualizan** en la misma tanda (T2), no se «arreglan al final». Es la lección de
QC-76, aplicada al único sitio donde esta ficha toca algo compartido.

## 3. Modelo de datos

**Ninguna migración y ningún cambio en `db/schema.prisma`** (R32). Los dos límites de longitud
—nombre 60, símbolo 10— viven **sólo en zod** (decisiones cerradas 5 y 6): `units.name` y
`units.symbol` siguen siendo `TEXT` sin restricción, y no se les añade una.

Esto es deliberado y se dice aquí porque el aviso de QC-76 lo pide: **esta ficha NO introduce ni
endurece ninguna restricción sobre `units`**. Ninguna tabla que otros módulos siembren en sus tests
gana una condición nueva. La comprobación de que eso es cierto no se deja a la lectura del diff:
`tasks.md` (T10) exige correr **`tests/integration` entero**, no sólo `tests/integration/unidades`.

Lo que **sí** cambia de forma compartida es `PERMISSIONS`, y su ripple está en §2.

### 3.1 El factor, como cadena

`factor` es `DECIMAL(14,4)`. El dominio lo maneja como **`string`**, nunca como `number`:

- zod lo valida contra `^\d{1,10}(\.\d{1,4})?$` **y** `> 0` (R14). El patrón rechaza de entrada un
  quinto decimal, así que **nunca** se llega a truncar en silencio (QC-76 R3);
- el adaptador se lo pasa tal cual a Prisma, que acepta `string` para una columna `Decimal`;
- así el módulo no introduce coma flotante en ningún punto, que es lo que QC-76 R3 prohíbe. `0.5`
  entra y se guarda como `0.5000` (R14, factor menor que 1).

## 4. Errores nuevos (R30)

Se añaden a `domain/errors.ts`, todas derivando de `UnidadesError`, con `code` estable. El adaptador
driving ya las serializa sin cambios: su `error instanceof UnidadesError` las cubre todas.

| Clase | `code` | Cuándo |
| --- | --- | --- |
| `NotFoundError` | `not_found` | La unidad no existe, o es de **otra empresa** (R22, R26) |
| `SystemUnitError` | `system_unit` | Editar o borrar una unidad **de sistema** (R21, R25) |
| `DuplicateNameError` | `duplicate_name` | Choque contra `units_company_name_unique` (R11) |
| `DuplicateSymbolError` | `duplicate_symbol` | Choque contra `units_company_symbol_unique` (R12) |
| `InvalidDerivationError` | `invalid_derivation` | La base no existe, deriva a su vez, es ella misma, o es de otra empresa (R15, R16) |
| `UnitInUseError` | `unit_in_use` | `ON DELETE RESTRICT` al borrar (R24) |

`ValidationError` (`invalid_input`) ya existe y cubre R8, R9, R10, R13, R14 y R28.
`UnauthorizedError` (`unauthorized`) ya existe y cubre R3.

**«De otra empresa» se responde `not_found`, no `unauthorized`.** Distinguirlos le diría a un actor
de la empresa A que en la empresa B existe una unidad con ese id: un oráculo de existencia sobre
datos ajenos. `unauthorized` queda **sólo** para el permiso que falta (R3).

## 5. El puerto de escritura

Archivo nuevo `ports/unit-write-repository.ts`. **No** se amplía `UnitRepository`: ver §9,
alternativa A.

```ts
/** Lo mínimo que el service necesita saber de una fila para decidir. */
export type UnitOwnership = {
  readonly id: string;
  readonly companyId: string | null;   // null = de sistema
  readonly baseUnitId: string | null;  // null = unidad base
};

export type UnitWriteRow = {
  readonly name: string;
  readonly nameNormalized: string;
  readonly symbol: string | null;
  readonly baseUnitId: string | null;
  readonly factor: string | null;      // decimal como cadena (§3.1)
};

export type WriteOutcome = 'ok' | 'not_found' | 'duplicate_name' | 'duplicate_symbol';

export interface UnitWriteRepository {
  findOwnership(id: string): Promise<UnitOwnership | null>;
  hasDerivedUnits(id: string): Promise<boolean>;
  create(companyId: string, row: UnitWriteRow): Promise<
    { id: string } | 'duplicate_name' | 'duplicate_symbol'
  >;
  update(id: string, row: UnitWriteRow): Promise<WriteOutcome>;
  deleteById(id: string): Promise<'deleted' | 'not_found' | 'in_use'>;
}
```

`create` recibe `companyId` como **argumento propio y obligatorio**, fuera de `UnitWriteRow`: así
una llamada que se olvide de la empresa **no compila** (R7), en vez de crear una unidad de sistema
en silencio. Es el mismo truco que QC-76 usó con `scope` en el puerto de lectura.

Resultados **discriminados**, nunca excepciones de Prisma cruzando la frontera: mismo contrato que
`PresentationRepository` de `inventario`.

## 6. Los tres casos de uso

Archivos nuevos en `domain/`: `create-unit.ts`, `update-unit.ts`, `delete-unit.ts`, más
`unit-input.ts` (los dos esquemas zod). Fábricas `createCreateUnit(deps)`, etc., cableadas en
`lib/composition/index.ts`, igual que el resto del repo.

### 6.1 Alta — `createUnit(input, actor)`

1. `requirePermission(actor, 'unidades.modificar')` — **primera línea**, antes de zod y antes del
   puerto (R3).
2. `createUnitSchema.safeParse(input)` → `ValidationError` (R28). El esquema hace, en este orden:
   `trim` del nombre, largo 1..60, y **rechaza si `normalizeUnitName(name) === ''`** (R8, R9);
   símbolo **opcional** con largo ≤ 10 (R10) y **rechazado si viene vacío o solo con espacios**
   (R36: no se recorta a `null`, se rechaza); `baseUnitId`/`factor` con `superRefine` que exige
   **los dos o ninguno** (R13) y el factor `> 0` con la forma de §3.1 (R14).
3. **Equivalencia**, si viene `baseUnitId` (§6.4).
4. `nameNormalized = normalizeUnitName(name)` — la **única** definición, la que publica el contrato
   y la que escribió la columna (QC-32 R4).
5. `units.create(actor.companyId, row)` → `'duplicate_name'` → `DuplicateNameError`;
   `'duplicate_symbol'` → `DuplicateSymbolError` (R11, R12).
6. Devuelve `{ id }` (R6).

**No hay `SELECT` previo de unicidad, y es deliberado**: entre el `SELECT` y el `INSERT` cabe otra
transacción. La garantía es el índice único, y la traducción del choque es la que se prueba (R11).
Mismo razonamiento escrito que en `ports/presentation-repository.ts`.

### 6.2 Edición — `updateUnit(id, input, actor)`

1. `requirePermission(actor, 'unidades.modificar')`.
2. `updateUnitSchema.safeParse(input)` — **el mismo esquema que el alta** (R18): reemplazo completo
   de los cuatro campos, sin `.partial()` y sin ningún campo opcional que signifique «no lo toques»
   (R17). Un símbolo ausente **borra** el símbolo; `baseUnitId` y `factor` ausentes **dejan la
   unidad base**.
3. `findOwnership(id)`:
   - `null` → `NotFoundError` (R22);
   - `companyId === null` → `SystemUnitError` (R21). **Aquí, en el service, y con su test**: no lo
     impide ninguna restricción de la base y ninguna policy de RLS
     (`docs/architecture.md > Acceso a datos y autorizacion`);
   - `companyId !== actor.companyId` → `NotFoundError` (R22).
4. **Equivalencia** (§6.4), con la comprobación extra de auto-referencia (`baseUnitId === id`) y de
   «ya soy base de alguien» (`hasDerivedUnits(id)`), las dos → `InvalidDerivationError` (R15).
5. `units.update(id, row)` → `'not_found'` → `NotFoundError`; los dos `duplicate_*` → su error.
6. `companyId` **no viaja en `UnitWriteRow`** (R19): el `UPDATE` no puede tocar la columna porque el
   tipo no la lleva.

Cambiar `baseUnitId`/`factor` de una unidad ya referenciada por un producto o una línea de receta
**no requiere nada especial** (R20): esas tablas guardan `unit_id`, no una cantidad convertida, y
este `UPDATE` no las toca.

### 6.3 Borrado — `deleteUnit(id, actor)`

1. `requirePermission(actor, 'unidades.modificar')`. Sin zod: la entrada es un identificador.
2. `findOwnership(id)` → `null`/otra empresa → `NotFoundError` (R26); `companyId === null` →
   `SystemUnitError` (R25).
3. `units.deleteById(id)` → `'in_use'` → `UnitInUseError` (R24); `'not_found'` → `NotFoundError`.

**Físico, no lógico** (R23): `units` no tiene `deleted_at` **a propósito** —QC-76 R32 lo reafirma—
porque el borrado lógico es un `UPDATE` y ninguna FK reacciona a un `UPDATE`. Este caso de uso no
añade ninguna marca de vida ni ningún sustituto.

**Ninguna comprobación de uso al vuelo** (R24): no se cuenta cuántos productos usan la unidad antes
de borrar. Las tres FK que la protegen —`products_unit_id_fkey`, `recipe_lines_unit_id_fkey` y
`units_unit_id_fkey`, las tres `ON DELETE RESTRICT`— son la garantía real, y el adaptador traduce su
violación.

### 6.4 La equivalencia, validada en el service (R15, R16)

Con `baseUnitId` presente, el service hace `findOwnership(baseUnitId)` y rechaza con
`InvalidDerivationError` si:

| Caso | Condición |
| --- | --- |
| No existe | `parent === null` |
| Deriva a su vez (un solo nivel) | `parent.baseUnitId !== null` |
| Es ella misma (sólo en edición) | `parent.id === id` |
| Es de otra empresa | `parent.companyId !== null && parent.companyId !== actor.companyId` |

Se acepta el padre **de la propia empresa** (`companyId === actor.companyId`) y el **de sistema**
(`companyId === null`), que es literalmente la decisión cerrada 13.

**El disparador `units_check_derivation` se queda como defensa en profundidad**, no como el
mecanismo. Motivo: un `RAISE EXCEPTION` de plpgsql llega a Prisma como
`PrismaClientUnknownRequestError` y su **único** discriminante es el **texto** del mensaje —que en
esta máquina Postgres responde en español—, y `docs/conventions.md > Manejo de errores` prohíbe
expresamente discriminar por texto. Ver §9, alternativa B.

## 7. El adaptador Prisma

Archivo nuevo `adapters/driven/persistence/unit-write-prisma.ts`. **No se toca** `unit-prisma.ts`
(lectura, R33) ni `unit-catalog-prisma.ts` (`findRefs`, que QC-76 R36 dejó fuera de ámbito a
propósito, con destino QC-50).

- `create` → `prisma.unit.create({ data: { companyId, name, nameNormalized, symbol, baseUnitId, factor } })`.
- `update` → `prisma.unit.updateMany({ where: { id }, data })`, **`updateMany` y no `update`**, para
  distinguir «no existe» (`count === 0`) sin depender de `P2025`. Mismo criterio que
  `renamePresentation`.
- `deleteById` → `prisma.unit.deleteMany({ where: { id } })`, por lo mismo.
- `findOwnership` → `findUnique({ where: { id }, select: { id, companyId, baseUnitId } })`. **Sin**
  `companyScopeWhere`: la comparación de empresa la hace el **service**, porque necesita distinguir
  «de sistema» (→ `SystemUnitError`) de «de otra empresa» (→ `NotFoundError`), y un `where` que
  fundiera los dos casos devolvería `null` para ambos y perdería R21.
- `hasDerivedUnits` → `count({ where: { baseUnitId: id } }) > 0`.

### 7.1 Cómo se distingue el nombre duplicado del símbolo duplicado

Prisma expone `P2002` para toda violación de unicidad, y el índice concreto en
`error.meta.target`. `units` tiene **exactamente cuatro** índices únicos, los cuatro parciales y los
cuatro con nombre propio (§1), y el esquema Prisma no declara ninguno más —lo vigila
`tests/unit/unidades/schema/unidades-schema.test.ts`—:

| `meta.target` | Resultado del puerto |
| --- | --- |
| `units_company_name_unique`, `units_system_name_unique` | `'duplicate_name'` |
| `units_company_symbol_unique`, `units_system_symbol_unique` | `'duplicate_symbol'` |
| cualquier otro | **se relanza** |

Relanzar el caso desconocido, en vez de clasificarlo como duplicado de nombre, es deliberado: un
índice único nuevo que nadie mapeara aparecería como «ya existe ese nombre», que es mentira y no
deja rastro. Es el mismo criterio que `docs/conventions.md` aplica a los errores que no son de
dominio.

`P2003` (violación de FK) al borrar sólo puede venir de las tres `ON DELETE RESTRICT` que apuntan a
`units`, así que se traduce a `'in_use'` sin ambigüedad (R24).

## 8. Las Server Actions y el cableado

`adapters/driving/unit-actions.ts` **gana tres funciones y no se reescribe**: `listUnitsAction`,
`currentActor` y `toErrorState` se quedan tal cual. `currentActor()` ya resuelve las dos caras de la
sesión y **falla cerrado** (R29): sin `getSessionUser()` o sin `getSessionContext()` devuelve `null`
y `requirePermission` rechaza en la primera línea del caso de uso.

```ts
export type CreateUnitFormState =
  | { status: 'idle' } | { status: 'success'; id: string }
  | { status: 'error'; code: string; message: string };

export type UnitMutationFormState =
  | { status: 'idle' } | { status: 'success' }
  | { status: 'error'; code: string; message: string };

createUnitAction(prevState, formData): Promise<CreateUnitFormState>
updateUnitAction(id, prevState, formData): Promise<UnitMutationFormState>
deleteUnitAction(prevState, formData): Promise<UnitMutationFormState>
```

`FormData` porque son mutaciones de formulario (QC-22), exactamente la forma que consumirá QC-39.
Campos: `name`, `symbol`, `baseUnitId`, `factor`; y `id` como campo oculto en el borrado.

**Cómo se lee `FormData` sin chocar con R36.** Un campo que el formulario no envía y uno que envía
vacío llegan igual: cadena vacía. Como el símbolo vacío **se rechaza** (R36) pero el símbolo
**ausente es legal** (R10), la action distingue los dos con `formData.has('symbol')`, no con el
valor: si la clave **no está**, el candidato lleva `symbol: undefined` —«no lo declaro»—; si **está**,
va tal cual llegó, y el esquema decide. Lo mismo para `baseUnitId` y `factor`, donde «ausente»
significa unidad base (R17) y no entrada inválida.

**Ninguna de las tres se reexporta desde `index.ts`** (R31): el barrel tiene que poder importarse
desde un componente de cliente, y un `'use server'` en su cierre de imports lo rompería. El comentario
de cabecera de `index.ts` ya lo dice literalmente («Los adaptadores driving que traiga QC-38 NO pasan
por aquí»).

Cableado en `lib/composition/index.ts`, en el bloque `unidades` que ya existe:

```ts
const unitWriteRepository: UnitWriteRepository = { findOwnership, hasDerivedUnits, create, update, deleteById };

export const unidades = {
  listUnits: createListUnits({ units: unitRepository, log: unidadesListQueryLog }),
  createUnit: createCreateUnit({ units: unitWriteRepository }),
  updateUnit: createUpdateUnit({ units: unitWriteRepository }),
  deleteUnit: createDeleteUnit({ units: unitWriteRepository }),
} as const;
```

## 9. Alternativas descartadas

**A. Ampliar `UnitRepository` con los cinco métodos de escritura, en vez de un puerto nuevo.**
Descartada. `UnitRepository` es el puerto de **lectura del listado** y su firma está construida
alrededor de `UnitScope` —QC-76 lo puso ahí precisamente para que una lectura sin ámbito no
compile—. Meterle `create`/`update`/`deleteById` obligaría a cada doble de test del listado a
implementar cinco métodos que no usa, y mezclaría dos invariantes distintas en la misma interfaz:
«ninguna lectura sin ámbito» y «ninguna alta sin empresa». Dos puertos separados dejan cada regla en
su firma y no acoplan las suites. Coste: un archivo más y una constante más en `composition`.

**B. Delegar la validación de la equivalencia enteramente al disparador de la base.**
Descartada, y es la más tentadora: el disparador `units_check_derivation` **ya** implementa un solo
nivel, no-auto-referencia y ámbito del padre, con mensajes distinguibles y `ERRCODE = '23514'`. El
problema es la frontera con Prisma: un `RAISE EXCEPTION` de plpgsql no produce un `P2xxx` tipado,
sino un `PrismaClientUnknownRequestError` cuyo único contenido explotable es el **texto** del
mensaje; discriminar por texto está prohibido por `docs/conventions.md > Manejo de errores` y además
depende del idioma de Postgres, que en la máquina de desarrollo responde en español. Se validaría
«en el service» sólo de nombre. Además, la decisión cerrada 13 dice «validación de la equivalencia»
—no «restricción de la base»—, a diferencia de la unicidad, donde la propia tabla dice que la
garantía real es el índice. Se validan las cuatro condiciones en el service, con dos lecturas
baratas, y el disparador queda de red.

**C. Comprobar la unicidad con un `SELECT` previo antes de escribir.** Descartada por la propia
decisión cerrada 11: entre el `SELECT` y el `INSERT` cabe otra transacción, así que no cierra la
carrera y da falsa sensación de garantía. La comprobación previa se omite entera; el índice único
es el mecanismo y su traducción es lo que se prueba.

**D. Un `id` estable por empresa o un `upsert` para el alta.** Descartada: `upsert` convertiría un
choque de nombre en una edición silenciosa de la unidad ajena, que es exactamente lo contrario de
R11.

*(La edición parcial estilo PATCH y el `requireAdmin` por nombre de rol no se evalúan aquí: los
cerró el humano en las decisiones 8 y 2.)*

## 10. Dependencias de terceros

**Ninguna** (R35, regla 7 de `CLAUDE.md`). No hay librería que proponer y por tanto no hay cuatro
checks que ejecutar ni fila que añadir a `docs/dependencias.md`. Lo que hace esta ficha es: tres
casos de uso, validación con **zod** —ya aprobada y ya en uso en los otros módulos—, dos lecturas
por el puerto y la traducción de dos códigos de Prisma. Aritmética propia: ninguna, porque el
factor no se opera aquí (convertir es de QC-76 y ya está hecho).

## 11. Riesgos conocidos

1. **El catálogo de permisos es compartido** (§2). Es el único punto donde esta ficha toca algo de
   otro módulo, y ya se sabe qué seis archivos de test caen. Mitigación: se actualizan en la misma
   tanda (T3), y T12 corre el gate completo.
2. **`tests/integration` entero, no sólo `unidades`** (aviso de QC-76). Aunque esta ficha **no**
   añade ninguna restricción a `units` (R32, §3), el precedente manda: T10 lo verifica de forma
   explícita antes del PR.
3. **`meta.target` de Prisma** para índices creados a mano. Si en alguna versión dejara de traer el
   nombre del índice, la distinción nombre/símbolo del §7.1 caería al caso «se relanza» y el usuario
   vería un error genérico en vez de uno concreto —feo, pero **nunca** un mensaje falso—. Se cubre
   con un test de integración por cada uno de los dos choques, no con un test unitario del mapeo.
4. **El símbolo vacío llega por `FormData` como el ausente.** Es el único punto donde R36 y R10
   pueden confundirse, y por eso la distinción está escrita en §8 (`formData.has`) y tiene su propio
   caso de test en T9, además del del esquema en T5.

## 12. Mapa `R<n> → verificación`

| R | Verificación prevista | Archivo |
| --- | --- | --- |
| R1 | El módulo exporta tres casos de uso de escritura y ninguno de consulta nuevo | `tests/unit/unidades/module-contract.test.ts` |
| R2 | Los tres exigen `'unidades.modificar'`; ninguna comparación por nombre de rol en el módulo | `tests/unit/unidades/unit-write-permissions.test.ts` + guardia de convenciones |
| R3 | Actor `null`, sin `permissions`, con conjunto vacío y sin el código → `UnauthorizedError`, y el repositorio **no** se llama | `tests/unit/unidades/unit-write-permissions.test.ts` |
| R4 | `SEED_ROLE_PERMISSIONS`: el Administrador tiene `unidades.modificar` **y** `unidades.consultar`, escritos uno a uno; el Operador ninguno de los dos | `tests/unit/identity/permissions.test.ts` |
| R5 | El catálogo tiene **once** entradas, la nueva con su forma `<modulo>.<accion>`; el seed la crea y la segunda corrida no cambia ningún conteo | `tests/guards/guard-permisos-sembrados.test.ts`, `tests/integration/identity/identity-seed.int.test.ts` |
| R6 | Alta válida → una fila y su id | `tests/integration/unidades/unit-write.int.test.ts` |
| R7 | La fila creada lleva `company_id` del actor; `create` no acepta empresa por la entrada | `tests/unit/unidades/create-unit.test.ts` + integración |
| R8 | `''`, `'   '` y `'---'` → `ValidationError`; `'  kilo  '` se guarda como `'kilo'` | `tests/unit/unidades/create-unit.test.ts` |
| R9 | 60 acepta, 61 rechaza; el esquema Prisma no gana ninguna restricción de longitud | `tests/unit/unidades/create-unit.test.ts`, `tests/unit/unidades/schema/unidades-schema.test.ts` |
| R10 | Sin símbolo acepta; 10 acepta, 11 rechaza | `tests/unit/unidades/create-unit.test.ts` |
| R11 | Mismo nombre normalizado en la misma empresa → `DuplicateNameError`; en otra empresa y frente a una de sistema → se acepta | `tests/integration/unidades/unit-write.int.test.ts` |
| R12 | Mismo símbolo en la misma empresa → `DuplicateSymbolError`; dos sin símbolo conviven | `tests/integration/unidades/unit-write.int.test.ts` |
| R13 | Base sin factor y factor sin base → `ValidationError`; ninguno de los dos → acepta | `tests/unit/unidades/create-unit.test.ts` |
| R14 | `0`, `-1`, `abc`, `1.00001` → rechazo; `0.5` acepta y se guarda `0.5000` | `tests/unit/unidades/create-unit.test.ts` + integración |
| R15 | Base que a su vez deriva, auto-referencia y «ya soy base de alguien» → `InvalidDerivationError` | `tests/unit/unidades/update-unit.test.ts` |
| R16 | Base de otra empresa y base inexistente → `InvalidDerivationError`; base propia y de sistema → aceptan | `tests/unit/unidades/update-unit.test.ts` + integración |
| R17 | Edición sin símbolo lo borra; sin base ni factor deja la unidad base | `tests/unit/unidades/update-unit.test.ts` |
| R18 | La tabla de casos de R8–R16 se ejecuta también contra `updateUnit` | `tests/unit/unidades/update-unit.test.ts` |
| R19 | `UnitWriteRow` no lleva `companyId`; editar no cambia la empresa de la fila | `tests/integration/unidades/unit-write.int.test.ts` |
| R20 | Unidad referenciada por producto y por línea de receta: cambiar base y factor funciona y no altera esas filas | `tests/integration/unidades/unit-write.int.test.ts` |
| R21 | Editar una unidad sin `company_id` → `SystemUnitError`, y `update` del puerto **no** se llama | `tests/unit/unidades/update-unit.test.ts` |
| R22 | Editar id inexistente y unidad de otra empresa → `NotFoundError` | `tests/unit/unidades/update-unit.test.ts` |
| R23 | El borrado deja cero filas; `units` sigue sin `deleted_at` | `tests/integration/unidades/unit-write.int.test.ts`, `tests/unit/unidades/schema/unidades-schema.test.ts` |
| R24 | Borrar unidad usada por producto, por línea de receta y base de otra → `UnitInUseError`, y las filas siguen ahí; el caso de uso no hace ninguna consulta de uso previa | `tests/integration/unidades/unit-write.int.test.ts`, `tests/unit/unidades/delete-unit.test.ts` |
| R25 | Borrar una de sistema → `SystemUnitError` sin llamar a `deleteById` | `tests/unit/unidades/delete-unit.test.ts` |
| R26 | Borrar id inexistente y de otra empresa → `NotFoundError` | `tests/unit/unidades/delete-unit.test.ts` |
| R27 | Las tres viven en `adapters/driving/unit-actions.ts` con `'use server'`; no hay `route.ts` nuevo | `tests/unit/unidades/unidades-convenciones.test.ts` |
| R28 | Entrada con forma inválida → `ValidationError` y el puerto no se llama | `tests/unit/unidades/create-unit.test.ts` |
| R29 | Sin `getSessionUser` o sin `getSessionContext` → `unauthorized` y ningún acceso al repositorio; el dominio no importa `next/*` | `tests/unit/unidades/unit-actions.test.ts` |
| R30 | Cada error de dominio → `{ status:'error', code }` con su código; un `TypeError` se relanza | `tests/unit/unidades/unit-actions.test.ts` |
| R31 | `index.ts` no exporta ninguna action; su cierre de imports no contiene `'use server'` | `tests/unit/unidades/module-contract.test.ts` |
| R32 | `git diff` sin cambios en `db/schema.prisma` ni carpeta de migración nueva | `tests/unit/unidades/schema/unidades-migration.test.ts` |
| R33 | La firma, el orden por defecto, la búsqueda y la paginación de `listUnits` no cambian | `tests/unit/unidades/list-units.test.ts` (existente, sigue verde sin tocar) |
| R34 | No hay ruta, pantalla ni item de menú de unidades; ningún `.spec.ts` nuevo | `tests/unit/navegacion/qc75-convenciones.test.ts` |
| R35 | `package.json` sin dependencias nuevas | `tests/guards/guard-dependencias-aprobadas.test.ts` |
| R36 | `symbol: ''` y `symbol: '   '` → `ValidationError` en alta y en edición, y **no** se guardan como `null`; `symbol` ausente sigue aceptándose; por `FormData`, la clave ausente y la clave vacía dan resultados distintos | `tests/unit/unidades/unit-input.test.ts`, `tests/unit/unidades/update-unit.test.ts`, `tests/unit/unidades/unit-actions.test.ts` |
