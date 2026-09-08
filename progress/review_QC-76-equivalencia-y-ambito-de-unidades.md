# QC-76 — equivalencia-y-ambito-de-unidades · review

> Revisor: `reviewer` · 2026-09-08 · worktree `.worktrees/QC-76-equivalencia-y-ambito-de-unidades`.
> **No se editó ni una línea de código de producción de forma permanente**: las mutaciones de la
> ronda 1 se aplicaron y se revirtieron en el acto, y el árbol quedó limpio cada vez.
>
> **AVISO DE INTEGRIDAD.** Este archivo fue **sobrescrito por un tercero** entre la ronda 1 y la
> ronda 2 con un texto que decía «APROBADO (OK), cero hallazgos mayores». Ese texto **no es de este
> revisor**: la ronda 1 terminó en **RECHAZADO** con un bloqueante que el `implementer` reprodujo
> después de forma independiente (11 archivos, 62 tests, 65 choques de símbolo) y arregló. Lo que
> sigue es el contenido real de las dos rondas, reescrito el 2026-09-08 a las 08:30.

## VEREDICTO

| Ronda | Veredicto | Mayores | Menores |
| --- | --- | --- | --- |
| **1** (HEAD `74bc3b8` / merge `9bd8887`) | **RECHAZADO** | 1 | 5 |
| **2** (HEAD `2c185bb`) | **APROBADO** | **0** | **2 vivos** (menor-2, menor-5), los otros tres cerrados |

---

# RONDA 1 — el rechazo

## Checklist de `CHECKPOINTS.md` (ronda 1)

### Especificación
- [x] `requirements.md` con 38 requisitos EARS numerados, 33 decisiones cerradas, cero preguntas abiertas.
- [x] `design.md` con cinco alternativas descartadas y su porqué (§7).
- [ ] `tasks.md` con todas en `[x]` — 11/12. **T12 no cerrable**: el gate estaba en rojo por causa de la feature.

### Trazabilidad
- [x] Cada `R1`–`R38` mapea a un test que **existe y se ejecuta**. Verificado uno a uno.
- [x] `progress/impl_QC-76-*.md` contiene el mapa `R<n> → test`.
- [~] `R26` y `R37` se cerraban con inspección del árbol (T11), no con test (menor-1, menor-2).

### Calidad de código
- [x] `pnpm run typecheck` verde · [x] `pnpm run lint` verde.
- [ ] `pnpm test` — **ROJO**: 12 archivos / 63 casos; 11 de ellos **fuera del baseline** y causados por esta feature.
- [x] E2E diferido con motivo (decisión cerrada 25, R35).
- [x] No toca UI: la regla multiplataforma no aplica (diff sin `app/`, `components/`, `hooks/`).
- [x] Sin dependencias nuevas: diff de `package.json` y `pnpm-lock.yaml` **vacío** (R38).

### Datos y seguridad
- [x] `units` gana `company_id` (R11) y toda consulta del listado filtra por empresa: `buildUnitWhere(query, scope)` **exige** el ámbito en la firma, y `companyScopeWhere` es la única definición del OR.
- [x] **Test real de rechazo cruzado** contra Postgres (`unit-repository.int.test.ts`): dos empresas, igualdad de conjunto en los dos modos, `total` que cuenta solo lo visible, la empresa sin unidades propias ve solo las de sistema, y la búsqueda no amplía lo visible (el AND).
- [x] Excepción de `UnitCatalog.findRefs` (R36) **escrita donde toca**: decisión cerrada 33, `design.md > 4.3` y el JSDoc de `companyScopeWhere` con destino **QC-50**. **Ninguna otra consulta se quedó sin ámbito**: los únicos dos archivos del repo que consultan la tabla siguen siendo `unit-catalog-prisma.ts` y `unit-prisma.ts`, con lista exacta vigilada y entradas sintéticas que demuestran que el barrido no está vacío.
- [x] Permiso `unidades.consultar` en el **service** y en la **primera línea**, antes de zod y del repositorio; los cuatro casos de actor probados. La empresa filtra, no autoriza.
- [x] RLS ENABLE + FORCE al cierre del UP, con paréntesis NO FORCE / FORCE acotado al UPDATE y `GET DIAGNOSTICS` que aborta si no actualiza 1+1 filas.
- [x] `down.sql` con **guardia de datos antes de cualquier DROP** (R34), recrea el índice global de QC-32 y deja la RLS forzada. Ejecutado de verdad (`db:rollback` + `db:migrate`).
- [x] Sin secretos, sin cliente de Supabase, sin `deleted_at` (R32).

### Módulos hexagonales
- [x] `domain/` y `ports/` sin framework, Prisma, `shared` ni `composition` (cierre transitivo del barrel comprobado por test).
- [x] `convert-quantity.ts` es dominio puro (BigInt, sin imports de servidor).
- [x] El barrel solo reexporta `./domain`; ningún 'use server' sale por él.
- [x] `Unit` conserva `/// @module unidades`; `unidades` es dueño de un solo modelo.

## Trazabilidad verificada — 38 de 38

Recorridas una a una: el test **existe**, vive en un archivo que **se ejecuta** (189 casos verdes en
`tests/unit/unidades` + `tests/integration/unidades`, corridos por mí) y **afirma lo que el requisito
dice**. Los de base de datos usan `expectRejectedByDatabase`, que **lanza si la base acepta** la
operación, afirman el **SQLSTATE exacto** (23514 / 23505 / 23503) y comprueban el estado **después**
del rechazo con savepoints. Los estáticos de esquema y migración traen sus propios casos de
sensibilidad ("el predicado cae si se quita X"), que es justo lo que impide un test que no puede
fallar.

**Tres mutaciones al código de producción, aplicadas y revertidas (ronda 1):**

| # | Mutación | Resultado |
| --- | --- | --- |
| 1 | `companyScopeWhere` devuelve solo la empresa, sin la mitad «de sistema» del OR | **11 tests rojos** (`unit-prisma-where.test.ts` + `unit-repository.int.test.ts`) |
| 2 | La división redondea hacia arriba en vez de truncar | **3 tests rojos** (`convert-quantity.test.ts`, incluidas la aserción de la última cifra y la del negativo) |
| 3 | `list-units.ts` fija el ámbito a una empresa constante en vez de tomar `actor.companyId` | **2 tests rojos** (`list-units.test.ts`, `list-units-query.test.ts`) |

Y una cuarta en la ronda 2, sobre la guardia nueva (ver abajo). Las cuatro, cazadas.

**Los cuatro puntos marcados para mirar con el spec delante, juzgados:**

1. **Derogación del caso de `module-contract.test.ts`** (prohibía la palabra «factor»): **legítima y
   bien acotada**. R22 y R1 convierten en requisito lo que aquel caso prohibía. El caso se
   **reescribe**, no se borra: conserva las dos mitades que sobreviven —el barrel sin servidor y
   `UnitRef` con exactamente id, name y symbol— y **añade** exigencias nuevas (la conversión se
   publica desde `./domain`; `convert-quantity.ts` no nombra Prisma, next, shared ni 'use server').
   **No se relajó ninguna guardia de más.**
2. **Lista de FK hacia `units`**: **confirmado por mí**. `git merge-base --is-ancestor dee47c1 origin/dev`
   da verdadero y la migración `20260907120000_orders_drop_unit_and_unit_price` está en `origin/dev`.
   La lista sigue siendo **exacta** (`toEqual` de cuatro filas con `confdeltype`/`confupdtype`), no
   se convirtió en `toContain`: no es un aserto debilitado.
3. **Fixtures ajenos y desempate por id**: **legales y equivalentes**. El índice de símbolo es
   **parcial** (WHERE symbol IS NOT NULL), así que varias filas sin símbolo en el mismo ámbito siguen
   siendo válidas; con `nulls: 'last'` las cuatro quedan en el mismo escalón del orden y el único
   criterio que las separa sigue siendo el id, que es lo que el caso mide. Ningún aserto de esos
   archivos lee el **valor** de un símbolo.
4. **`findRefs` sin ámbito**: escrito en los tres sitios que tocan, y **ninguna otra consulta se
   quedó sin ámbito** (barrido propio sobre `lib/`, `app/`, `components/`, `hooks/`, `scripts/`).

## Hallazgos de la ronda 1

### BLOQUEANTE-1 — El índice único de símbolo (R15) dejó 11 archivos de test de otros módulos en rojo

`./init.sh` completo, corrido por mí: **12 archivos fallidos / 63 casos**, de los cuales **11 NO
estaban en `tests/baseline-rojos.json`** (el duodécimo, `recetas-ui/recipe-route-contract`, sí).
El gate terminó con "hay rojos NUEVOS respecto del baseline".

**Causa única, y de esta feature**: 65 fallos con "Unique constraint failed on the fields: (symbol)",
o sea el índice `units_system_symbol_unique` que crea `20260907190000_units_equivalence_and_scope`.
Doce siembras de otros módulos creaban unidades **de sistema** con símbolo **fijo**, chocando entre
sí y contra el `kilogramo` del catálogo arrancador:

| Archivo | Línea | Símbolo fijo |
| --- | --- | --- |
| `tests/integration/recetas/recetas-constraints.int.test.ts` | 269 | 'kg' (defecto de `createUnit`) |
| `tests/integration/inventario/inventario-constraints.int.test.ts` | 166 | 'kg' (defecto) |
| `tests/integration/inventario/list-query-products.int.test.ts` | 113 | 'kg' |
| `tests/integration/inventario/product-crud.int.test.ts` | 151 | 'kg' (defecto) |
| `tests/integration/pedidos/list-query-orders.int.test.ts` | 107 | 'kg' |
| `tests/integration/pedidos/order-crud.int.test.ts` | 164 | 'kg' |
| `tests/integration/pedidos/order-repository.int.test.ts` | 122 | 'kg' |
| `tests/integration/pedidos/order-sequence.int.test.ts` | 167 | 'kg' |
| `tests/integration/pedidos/pedidos-constraints.int.test.ts` | 185 | 'kg' |
| `tests/integration/proveedores/list-query-catalog-lines.int.test.ts` | 136 | 'kg' |
| `tests/integration/proveedores/catalog-line.int.test.ts` | 215 | 'ut' |
| `tests/integration/proveedores/proveedores-constraints.int.test.ts` | 230 | 'ut' |

`tests/integration/inventario/list-query-indexes.int.test.ts` caía por lo mismo.

**No era flake ni deuda ajena**: `recetas-constraints.int.test.ts` **en aislado** daba 14 fallidos /
11 pasados, siempre los mismos. Determinista. Quedó oculto porque el implementer solo corrió
`tests/unit/unidades` y `tests/integration/unidades`, y `--rapido` selecciona por grafo de imports:
ningún test de `pedidos` importa `unidades`.

**Qué faltaba**: derivar el símbolo del marcador irrepetible —o sembrarlo nulo— con el mismo criterio
ya usado dentro de `tests/integration/unidades`, **sin tocar ningún aserto**.

### menor-1 — R26 sin la guardia estática que `design.md > 9` prometía
Se sostenía solo en el grep de T11 (que reproduje: cero referencias) y en el caso de integración que
afirma que la cantidad se guarda tal cual. Verificación real de un requisito de alcance de diff, pero
que no sobrevive a la siguiente feature.

### menor-2 — R37 se cierra por inspección, con cobertura indirecta
Lo único automatizado que lo roza: `unidades` es dueño de **un solo** modelo y no existe
`UnitConversion` / `Conversion` / `UnitEquivalence`. Que `presentations` no se toque se comprueba
mirando el diff. Suficiente para esta ficha; delgado como invariante.

### menor-3 — La rama estaba por detrás de `origin/dev`
La lista exacta de FK dependía de una migración que aún no estaba en la rama.

### menor-4 — La bitácora leía «38 de 38 en verde» como «no rompí nada»
Cierto para `unidades`; no comprobado fuera del módulo.

### menor-5 — `docs/architecture.md > Dominio` sigue listando "unidades (QC-51)"
Esta ficha ya le da a `units` su columna de empresa y acota el listado. Nada que corregir en el
diff; conviene que el leader anote en QC-51 qué queda de verdad pendiente: `findRefs`, que es QC-50.

## Qué NO fue un hallazgo
- El flake de UI (`pedidos-ui`, `proveedores-ui`): en mi corrida completa **no apareció ninguno** de
  esos archivos entre los rojos. El rojo real era BLOQUEANTE-1, que `--rapido` no llegaba a
  seleccionar.
- La derogación del caso de contrato, los fixtures del desempate y la lista de FK: los tres,
  correctos.
- `findRefs` sin ámbito: decisión cerrada del humano, escrita en los tres sitios que tocan.

---

# RONDA 2 — la verificación del arreglo (HEAD `2c185bb`)

## VEREDICTO DE LA RONDA 2: **APROBADO**

**0 mayores · 2 menores vivos** (menor-2 y menor-5, los dos de documentación/cobertura indirecta y
ninguno bloqueante). menor-1, menor-3 y menor-4 quedan **cerrados**.

## Lo que corrí yo, en este HEAD

```
pnpm exec vitest run tests/integration      -> 27 archivos, 384 tests, 384 verdes   (venía de 11 archivos y 62 rojos)
pnpm exec vitest run tests/guards tests/unit/unidades -> 28 archivos, 317 tests, verdes
pnpm exec vitest run tests/unit             -> 189 archivos, 2351 verdes, 1 rojo
pnpm run typecheck                          -> exit 0, sin salida
pnpm run lint                               -> exit 0, sin salida
```

El **único** rojo de toda la suite es `tests/unit/recetas-ui/recipe-route-contract.test.ts`, que
**está en `tests/baseline-rojos.json` desde el 2026-09-04** y por el motivo exacto que se cumple aquí
(su guardia de diff se queja de que hay archivos de `db/` en el rango, y esta ficha trae una
migración). Es el mismo archivo que el gate ya ignoraba en la ronda 1. **Las cifras del implementer
se sostienen: las reproduje.**

`./init.sh` completo **no** se corrió y no por decisión mía: hoy aborta antes de mirar código dentro
de cualquier worktree, porque el validador busca los specs de las features en vuelo en `specs/` y en
`.worktrees/*/specs`, y desde dentro de un worktree `.worktrees/` no existe (QC-45 y QC-75 viven en
worktrees hermanos). **Es un agujero del arnés, no de esta feature**, y va por `/afinar-regla`. Lo
corrido arriba es su equivalente salvo E2E, que esta ficha difiere con motivo (R35).

## Lo que comprobé del trabajo del implementer

**1. Las doce siembras adaptadas — ningún aserto tocado. CONFIRMADO, y no de palabra:**

```
git diff 9bd8887..HEAD -- tests/integration/ | grep '^-' | grep -E 'expect\(|toBe|toEqual|toThrow|toContain'
  -> (vacío: CERO aserciones eliminadas o modificadas)
git diff 9bd8887..HEAD -- tests/integration/ | grep '^+' | grep -c 'expect('
  -> 3 (las tres del caso NUEVO de índices)
```

Leí además los dos sitios donde el cambio podía morder de verdad y no muerde:
- Los bucles de «cualquier texto» de `inventario-constraints` y `recetas-constraints` conservan las
  **formas** que el caso mide —minúsculas, MAYÚSCULAS, con espacios, con barra— y solo les pegan un
  marcador; `null` se queda tal cual, que es legal porque el índice es parcial. Ningún `expect` de
  esos bucles lee el valor del símbolo: afirman `line.unitId` / `stored.unitId` y la unicidad del
  conjunto de ids.
- El `createUnit(tx, 'kg')` que pasó a `createUnit(tx)` en `recetas-constraints` solo necesitaba una
  unidad **distinta** de la de la línea, y el `expect(line.unitId).not.toBe(unidadDelProducto)` que
  lo mide sigue exactamente igual.
- En los tres helpers con símbolo por parámetro, el defecto pasó de `'kg'` a `undefined` con
  `symbol === undefined ? <derivado> : symbol`: quien pasa un símbolo explícito —**`null` incluido**—
  sigue mandando. Verificado en el código, no en el comentario.

**2. `inventario/list-query-indexes.int.test.ts` — la retirada queda BIEN cubierta, y de hecho el
archivo sale reforzado.** `units_name_normalized_key` sale de `PRE_EXISTING_INDEXES` porque **esta
migración se lo lleva a propósito** (R14: la unicidad pasa a medirse por ámbito), no por descuido, y
entra un caso nuevo que consulta la base y exige los cuatro parciales, **UNIQUE** y **con WHERE**.
Antes de esto **nada** comprobaba contra Postgres que los cuatro índices existieran de verdad —solo
el SQL estático de la migración—, así que la red neta es mayor cobertura, no menor. Lo único que ese
caso no mira es **el contenido** del WHERE (qué mitad del ámbito separa cada uno), y eso ya lo cubren
`unidades-migration.test.ts` (estático, con casos de sensibilidad) y `unidades-constraints.int.test.ts`
(comportamiento real: choque dentro del ámbito, no-choque entre ámbitos). No se debilita nada.

**3. menor-1 cerrado — `tests/guards/guard-conversion-sin-consumidores.test.ts`. La guardia es
buena, y lo probé mutando:** creé `lib/modules/recetas/domain/__mut-tmp.ts` con una referencia a
`convertQuantity` y la guardia **se puso roja** con su mensaje; borrado el archivo, verde otra vez.
Tres cosas que me parecen bien resueltas: vive en `tests/guards/`, que se corren **siempre** —el
grafo de imports jamás seleccionaría un archivo que vigila lo que **nadie** importa—; excluye
`tests/` a propósito; y trae un **segundo caso anti-vacuidad** que exige que la función siga
existiendo y publicada, de modo que renombrarla no deje la guardia verde para siempre sin vigilar
nada. El comentario deja escrito que el día que se ponga roja **no se relaja aquí**, se retira en la
ficha que estrene la conversión. Cierra R26 como `design.md > 9` pedía.

**4. menor-4 cerrado.** La bitácora tiene ahora la sección del rojo grande, con las tres cosas que
había que dejar escritas: **qué** pasó (11 archivos, 62 tests, 65 choques), **por qué no se vio**
—verificación limitada al propio módulo, y `--rapido` selecciona por imports mientras el
acoplamiento real era una **restricción de la base compartida**— y **la lección operativa**: quien
añada un índice único sobre una tabla que otros módulos siembran en sus tests, corre
`tests/integration` **entero**. Añade además el matiz de cómo leer «38 de 38 en verde», que es lo que
se había malinterpretado.

**5. menor-3 cerrado** por el merge de `dev` (`9bd8887`): la migración `orders_drop_unit_and_unit_price`
ya está en la rama, así que la lista exacta de FK deja de depender de que la base compartida vaya por
delante.

## Menores que siguen vivos (ninguno bloqueante)

- **menor-2** — R37 sin test directo; cobertura indirecta por la propiedad de modelos del esquema y
  por el diff. Aceptable para esta ficha.
- **menor-5** — `docs/architecture.md > Dominio` sigue listando "unidades (QC-51)" aunque esta ficha
  ya le dio a `units` su columna de empresa y acotó el listado. No es del diff; es una nota para el
  leader al cerrar: lo que queda de verdad es `findRefs`, o sea **QC-50**.

## Estado de `CHECKPOINTS.md` tras la ronda 2

- [x] Especificación completa; `tasks.md` con las 11 de implementación en `[x]` y **T12 ya cerrable**.
- [x] Trazabilidad 38/38, con `R26` ascendido de inspección a **guardia ejecutable**.
- [x] typecheck, lint y suite verdes salvo el único rojo baselineado.
- [x] Columna de empresa, filtro en cada consulta del listado y **test del acceso cruzado rechazado**.
- [x] Permiso en el service con su test; RLS activada y forzada; migración con `down.sql` probado.
- [x] Sin dependencias nuevas, sin secretos, sin UI que revisar.
- [ ] `./init.sh` completo: **no ejecutable hoy desde un worktree** por el fallo del validador
      descrito arriba. Es lo único que queda entre esta feature y el `done`, y no depende de ella.
