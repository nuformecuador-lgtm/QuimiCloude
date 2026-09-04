# QC-57 — orden-y-filtro-en-listados · review

> Rama `feature/QC-57-orden-y-filtro-en-listados`, `HEAD` = `4ee8680`, merge-base con `origin/dev`
> = `82c1379`. Revisado el 2026-09-04 contra `requirements.md` (R1–R35 y las 22 decisiones
> cerradas), `design.md`, `tasks.md`, `CHECKPOINTS.md`, `docs/verification.md`,
> `docs/architecture.md`, `docs/conventions.md` y `progress/impl_QC-57-*.md`.
>
> Todo lo que aquí se afirma está **medido en este worktree**, no leído de la bitácora. El diff se
> analizó con **tres puntos** (`origin/dev...HEAD`, 124 archivos) y no con dos: la rama está
> desactualizada respecto de `origin/dev` y el diff de dos puntos mete 27 archivos de `dev` que no
> son de esta ficha.

## VEREDICTO: RECHAZADO

Dos bloqueantes, ninguno de contrato ni de trazabilidad. La ficha en sí —el contrato, las siete
listas blancas, la migración, los 243 tests— está bien hecha. Lo que la tumba es **el cierre**: la
rama no ha hecho F2.3 y arrastra 14 archivos commiteados con los finales de línea cambiados.

---

## Checklist de `CHECKPOINTS.md`

### Especificación
- [x] `requirements.md` con R1–R35 en EARS numerados.
- [x] `design.md` con alternativas descartadas y su porqué (2.2 módulo `listados`, 2.3
      `lib/shared/list-query.ts`, 4.2 índice funcional, 4.3 vía B).
- [x] `tasks.md` con **las 21 tasks marcadas `[x]`** (T0, T0.1, T1–T23). Verificado una a una.

### Trazabilidad
- [x] **Cada `R<n>` de R1 a R35 mapea a al menos un test real. `R<n>` sin test: CERO.**
- [x] `progress/impl_*.md` contiene el mapa `R1..R35 -> test`, y los tests que nombra existen.

### Calidad de código
- [x] `pnpm run typecheck` verde (medido).
- [x] `pnpm run lint` verde (medido).
- [ ] **`pnpm test` NO pasa**: 3 archivos en rojo, 1 fuera del baseline de esta rama. Ver B1.
- [x] E2E: la ficha no toca flujo crítico nuevo y R35 difiere la cobertura con motivo escrito.
      Verificado: `git diff --name-status origin/dev...HEAD -- e2e/` da **una `M` y ninguna `A`**.
- [x] UI: los 6 archivos de `app/` del diff son **comentarios y una aclaración de llamada**. Cero
      CSS, cero componentes nuevos. La regla multiplataforma no tiene materia aquí.
- [x] Dependencias: `package.json`, `pnpm-lock.yaml` y `docs/dependencias.md` **no cambian**.
      `guard-dependencias-aprobadas` verde. `pg_trgm` es infraestructura, no npm, y su aprobación
      humana está citada en la decisión cerrada 20 y en T0.1.

### Datos y seguridad
- [x] Ningún modelo nuevo en `db/schema.prisma`: el diff añade **una línea**, la columna
      `nameNormalized` en `Product`. El punto de aislamiento por empresa no tiene materia (y no
      puede tenerla: la columna de empresa la trae QC-47, aún `in_progress`).
- [x] Autorización **en el service**, con test: `requireAdmin` es la primera línea de los siete
      casos de uso, y los cinco módulos tienen el par de tests de R34 —Operador y actor ausente,
      con consulta válida **y** con campos no declarados— contando invocaciones del mock.
- [x] RLS intacta: `guard-rls-force` verde y la migración no toca ninguna política.
- [x] Migración versionada con su `down.sql`. Verificado a mano: `migration.sql` **no contiene un
      solo `DROP`** y `down.sql` revierte los 35 índices y la columna, sin `DROP EXTENSION`.
- [x] Sin secretos, sin hardcode de entorno, sin cliente de Supabase para datos de negocio.

### Módulos hexagonales
- [x] `guard-arquitectura-modulos` (56 casos) verde, y `guard-contrato-listados` (20) verde: los
      cinco `list-query.ts` **solo importan `zod`**.
- [x] Lógica en `domain/`, no en la Server Action.

### Verificación final
- [ ] **`./init.sh` NO termina en verde.** Ver B1.

---

## Los seis puntos con dictamen explícito

### 1 — El rojo de `catalog-line-sheet.test.tsx`: flake o regresión, y si había que tocar `vitest.config.mts`

**Reproducido. El diagnóstico del implementer es CORRECTO y su decisión de no tocar
`vitest.config.mts` también. Pero la salida que eligió —dejar el gate rojo— es la única de las tres
posibles que estaba mal.**

Lo medido en este worktree:

| Corrida | Resultado |
| --- | --- |
| `./init.sh` completo | 198 archivos, 2301 tests, 3 failed; rojo fuera de baseline: `catalog-line-sheet.test.tsx` |
| solo proyecto `ui` (36 archivos, 439 tests, sin integración) | 1 failed, mismo archivo |
| solo proyecto `ui`, segunda vez | 1 failed, mismo archivo |
| solo proyecto `ui` con `--testTimeout=20000` | **36 passed, VERDE** |

El error es `Test timed out in 5000ms` en dos `it` que escriben con `userEvent`, y el archivo tarda
53 s. **No es carga de QC-57**: el proyecto `ui` no ejecuta ni uno de los tests de integración de
esta ficha. Matiz sobre su evidencia: el rojo **no se me movió de archivo** en dos corridas, así que
ese argumento suyo no lo respaldo; los otros tres sí.

**Y hay una prueba que el implementer no buscó y que cierra el asunto: `origin/dev` YA TIENE ese
archivo en `tests/baseline-rojos.json`**, puesto por el humano el 2026-09-04 con el motivo «Mismo
flake de userEvent bajo carga que product-page.test.tsx, en la pantalla de proveedores». El baseline
de `dev` tiene **cinco** entradas; el de esta rama tiene **tres**, porque la rama se quedó atrás.
Además `dev` incorporó `docs/verification.md > Los flakes de saturación: qué son, y qué NO los
cura`, que fija la política: el arreglo de verdad —subir el `testTimeout` del proyecto de UI— **es
de código y tiene ficha propia**, y **hasta que entre, estos archivos viven en el baseline**. Esa
ficha es **QC-58**, reescrita en el board como `timeout-tests-ui-bajo-carga`, y su descripción
nombra proveedores como uno de los cuatro sitios donde aparece. `dev` deja además medido que bajar
los workers **no** lo cura.

**Dictamen.** Tocar `vitest.config.mts` habría sido **incorrecto**: el humano ya decidió que ese
cambio es de QC-58 y que el interino es el baseline. El implementer acertó al no aplicarlo y acertó
en el porqué (es el gate de todas las fichas en vuelo). Su error es otro: se planteó dos salidas
—tocar el config, o «meterlo al baseline, que es peor»— y **se le escapó la tercera, correcta y
gratis: hacer F2.3, mergear `origin/dev`, y la entrada del baseline llega sola**. Descartó el
baseline citando `docs/verification.md` sin ver que la versión de `dev` de ese mismo documento ya
prescribía exactamente eso para este archivo.

### 2 — Las dos guardias de alcance de QC-26/QC-34

**No basta con que estén baselineadas. Han quedado INVÁLIDAS y hay que decirlo — pero arreglarlas
no es de esta ficha.**

`tests/unit/recetas-ui/recipe-route-contract.test.ts` y `tests/unit/recetas/module-contract.test.ts`
afirman, sobre `git diff origin/dev...HEAD`, que ningún archivo de `lib/modules/recetas/` fuera de
tres rutas nombradas a mano puede estar en el diff. En esta rama fallan listando ocho archivos de
`recetas` que QC-57 toca **legítimamente y por spec** (recetas es uno de los siete listados de R2).

El problema no es el rojo, es la naturaleza de la afirmación: **no vigilan una propiedad del código,
vigilan el diff de una rama concreta ya mergeada**. Sobre `dev` no pueden estar verdes (rango
vacío) y sobre cualquier rama posterior que toque `recetas` tampoco: **no existe ninguna rama en la
que puedan volver a estar verdes**. Y su entrada en el baseline —cuyo `motivo` habla solo del rango
vacío, no de este caso— apaga el archivo **entero**, incluidas sus comprobaciones de contrato del
módulo, que sí serían válidas en cualquier rama. Una guardia que afirma algo falso y está silenciada
da cobertura imaginaria.

**Dictamen.** Para QC-57: **no bloqueante y no se toca** —son archivos de otras fichas y cambiarlos
altera el gate de terceros—. Para el leader: **hallazgo mayor a escalar**. La corrección es de una
línea de criterio —que el caso del diff se salte cuando el marcador de su propia feature no está en
el rango, o que se retire la guardia— y `docs/verification.md` ya la tiene apuntada como pendiente.
Debe ir en el PR y en `progress/current.md > Deudas`, no desaparecer con el merge.

### 3 — `products.name_normalized` NOT NULL sobre la base COMPARTIDA

**Gravedad real pero acotada, y de entorno, no de producto. NO hay mitigación que valga la pena
dentro del alcance: la que existe es peor que el problema.**

El riesgo no es teórico: hay **cuatro worktrees vivos** además de este (`QC-23`, `QC-35`, `QC-47`,
`fix-ui`), y **QC-47 (`modelo-empresa-y-membresias`) está `in_progress` y toca `db/schema.prisma`**.
Cualquiera que inserte un producto con un cliente Prisma generado antes de esta migración se lleva
un `23502`.

Ahora bien: es de desarrollo, no de producción —allí migración y código viajan juntos—; **falla
ruidosamente, y eso es lo correcto**; y la cura es `pnpm exec prisma generate`.

La mitigación obvia, `SET DEFAULT ''`, **hay que rechazarla explícitamente**: convertiría un
`23502` inmediato y evidente en filas con clave de búsqueda vacía que **nunca** aparecerían al
buscar. Cambiaría un fallo de entorno visible por un fallo de producto invisible, justo lo contrario
de lo que R19 persigue. Y el test estático ya afirma que la columna **no** lleva DEFAULT, a
propósito.

**Dictamen.** No bloqueante por sí solo, pero **exige un artefacto que hoy falta**: una entrada en
`progress/current.md > Deudas y cosas abiertas` avisando a los otros cuatro worktrees. Es del leader
al cerrar. Lo que no vale es que el aviso viva solo en un párrafo de la bitácora de una feature.

### 4 — `pageQuerySchema` huérfano

**Verificado. La decisión de no borrarlo es ACEPTABLE, pero es deuda con nombre, no un no-hallazgo.**

Grep confirmado: definido en cuatro `domain/page.ts`, reexportado por cuatro barrels, y **ningún
archivo de `lib/` ni de `app/` lo importa**. Solo lo ejercitan seis archivos de test.

A favor de dejarlo: retirar un símbolo público del barrel de cuatro módulos es un cambio de contrato
que ninguna task pide, y hacerlo «de paso» dentro de la ficha más grande del repo es el descuido que
el arnés intenta evitar. Además quedó **documentado en el propio `page.ts`**, no en silencio.
En contra: seis archivos de test siguen ejercitando código muerto, cobertura que se ve y no protege.

**Dictamen. Menor.** Se acepta el aplazamiento **con condición**: ficha en el board o entrada en
`progress/current.md > Deudas`. Cerrar QC-57 sin rastro de esto sí sería un agujero.

### 5 — El cambio de comportamiento en pedidos

**Está bien hecho, bien anotado, y no rompe ninguna decisión cerrada de QC-34. Pero la cita del
requisito es imprecisa.**

- **¿Lo exige R5?** *Literalmente no.* R5 habla de «un campo que **no está en la lista blanca**».
  `status` **sí** está en la lista blanca; lo que queda fuera del conjunto cerrado es el **valor**.
  R5 cubre campos, no valores.
- **¿Está mandatado por el spec?** **Sí, y por escrito**, pero en `design.md > 5`, nota 3: «`status`
  y `priority` son enums de Postgres; el `select` valida contra
  `ORDER_STATUS_VALUES`/`ORDER_PRIORITY_VALUES` y **un valor de fuera se ignora como campo no
  declarado (R5)**». El `design.md` está aprobado por el humano. La autoridad es esa nota.
- **¿Rompe QC-34?** **No.** Revisados R38–R41 y sus decisiones cerradas: exigen filtros opcionales y
  combinables (se cumple), que sin filtro salgan todos (se cumple), que los borrados no salgan y los
  cancelados sí (se cumple, con test de integración), y R39 prohíbe búsqueda por texto y filtro por
  correlativo —`ORDER_QUERYABLE.searchable = false` y `orderNumber` es solo **ordenable**, no
  filtrable—. **Ningún requisito ni decisión de QC-34 exige que un valor inválido lance.** Eso era
  un detalle de implementación de `listOrdersSchema`, no un compromiso.
- **¿Está anotado donde corresponde?** **Sí, en los tres sitios**: el comentario de
  `pruneClosedSelect` en `lib/modules/pedidos/domain/list-orders.ts`, la bitácora, y —lo que
  importa— **dentro del propio test**, `tests/unit/pedidos/list-orders.test.ts:356`, que verifica
  los tres casos de verdad: valor inválido solo (filtro vacío + log), lista **mixta** (conserva lo
  válido y anota) y que ningún valor inventado llega a la base.

**Dictamen.** Correcto. Único reparo, **menor**: la bitácora dice «lo exige R5» cuando lo exige
`design.md > 5`. Corregir la frase para que el siguiente no busque en R5 algo que no está.

### 6 — Los 243 tests nuevos: ¿verifican o son tautológicos?

**Verifican. No encontré ni un test que reimplemente lo que prueba. Y la guardia de equivalencia es
FUERTE.** (Nota: la fila de las cinco copias es la **13**, no la 12; la 12 es la página opcional de
unidades. Doy dictamen de las dos.)

Cuentas confirmadas por mí: **198 archivos y 2301 tests** contra 180/2058 de partida — **+18
archivos, +243 tests**, exactamente lo que dice la bitácora.

**`tests/guards/guard-contrato-listados.test.ts` (20 casos), pieza por pieza:**

1. **Bloque 1, equivalencia de comportamiento.** Somete los cinco esquemas a 5 entradas aceptadas y
   5 rechazadas y compara **contra un esperado ESCRITO a mano**, no contra el primer módulo. Es el
   detalle que la salva del fallo de QC-55: cinco copias igual de mal seguirían de acuerdo entre sí,
   y aquí no colarían.
2. **Bloque 2, equivalencia de TEXTO.** Compara los cinco fuentes **carácter a carácter** tras
   neutralizar solo el nombre del módulo. Esto es lo que hace la duplicación de verdad inmune: una
   divergencia que aún no cambia comportamiento —un tope movido, un comentario borrado— cae igual. Y
   tiene su **caso de mordida** (`SEARCH_MAX_LENGTH` de 120 a 200 tiene que dar distinto) **y su
   caso simétrico** (lo único que puede diferir, difiere, y sigue verde).
3. **Bloque 3, pureza.** No mira texto suelto: extrae **especificadores importados** con tres
   patrones, y se ejercita contra **un fuente sintético sucio** y contra **un comentario que nombra
   una ruta prohibida**, para probar que no se ciega ni se pasa de lista.

Único reparo, **menor**: `textoComparable` normaliza la forma `` modulo `<x>` `` con una expresión
global, así que una divergencia que ocurriera **solo** dentro de esa forma exacta se neutralizaría.
Rendija estrecha, y el bloque 1 la cubre por el otro lado.

**Muestreo del resto, buscando tautología:**

- `tests/unit/shared/listas-blancas-listados.test.ts` — **recorre las siete listas** y acumula
  hallazgos con el nombre del listado; no repite siete asertos. `toHaveLength(7)` delata un octavo
  listado sin lista blanca, y «pedidos es el único que no busca» se afirma como
  `toEqual(['pedidos'])`, no mirando solo pedidos.
- `tests/integration/inventario/list-query-products.int.test.ts` — 11 casos **contra Postgres real**.
  El de R10 siembra **cuatro homónimos con el mismo `stock`** y comprueba que los cuatro ids salen
  entre dos páginas **sin repetirse ni perderse** y en orden de id: sin el desempate falla. Los de
  `NULLS LAST` corren en **las dos direcciones** con datos sembrados. El de R18 busca «solucion» y
  encuentra «Solución Buffer pH 7». Nada de esto se pasa reimplementando una fórmula.
- `tests/unit/inventario/schema/list-query-indexes-migration.test.ts` (20 casos de texto sobre el
  SQL) **más** `tests/integration/inventario/list-query-indexes.int.test.ts` (12 casos contra
  `pg_indexes`, `pg_extension` e `information_schema`). El par cubre R21/R22/R23 por los dos lados:
  lo que el SQL **dice** y lo que la base **tiene**. Incluye «no crea ningún índice de más» y
  «`deleted_at` solo aparece como predicado, nunca como columna indexada».
- El **test en negativo** que `design.md > 12` exige —`deletedAt` como orden: responde, aplica el
  orden por defecto **y** el log recibe el campo— existe con ese nombre en los **cinco** módulos.

**Dictamen.** Los 243 tests son sustancia. La decisión 13 está protegida por la guardia, y la 12
(página opcional de unidades) por cinco casos que distinguen «sin parámetros», «consulta sin `page`
ni `pageSize`», «con `page`» y «con `pageSize` a solas».

---

## Hallazgos

### BLOQUEANTES

**B1 — `./init.sh` termina en ROJO, y la rama no ha hecho F2.3.**
Reproducido por mí: `Test Files 3 failed | 195 passed (198)`, `hay rojos NUEVOS respecto del
baseline`. `CHECKPOINTS.md > Verificación final` exige verde y no admite matices. El rojo **no es
regresión** (punto 1), pero la salida está a un merge de distancia: `origin/dev` ya tiene
`catalog-line-sheet.test.tsx` en `tests/baseline-rojos.json`.
**Y no es un trámite.** `dev` avanzó con la migración `20260904181500_recipe_steps_reset` y con
cambios en `lib/modules/recetas/domain/recipe-input.ts`, `recipe-view.ts`,
`app/(private)/produccion/formulas/components/recipe-steps-field.tsx`, `recipe-form-state.ts` y
`e2e/recetas.spec.ts` — **todos ellos archivos que esta rama también reescribió**. El merge tiene
conflicto probable en recetas y en el E2E.
**Para cerrar:** mergear `origin/dev`, resolver los conflictos de recetas, y volver a correr
`./init.sh` completo hasta verde. Sin eso el gate de esta feature no ha respondido su pregunta.

**B2 — 14 archivos commiteados con los finales de línea invertidos (LF -> CRLF).**
El repo es LF: no hay `.gitattributes`, `core.autocrlf=false`, y los blobs de `origin/dev` **y los
del merge-base `82c1379`** son LF. Esta rama los commiteó en CRLF (commit `1575190`), así que git
los ve reescritos enteros. Coste medido comparando `--numstat` normal contra `--ignore-cr-at-eol`:

| Archivo | Diff que se ve | Cambio REAL |
| --- | --- | --- |
| `tests/unit/unidades/module-contract.test.ts` | 1376 | 16/4 |
| `tests/unit/proveedores/module-contract.test.ts` | 1184 | 17/3 |
| `tests/integration/inventario/product-crud.int.test.ts` | 1128 | 19/5 |
| `lib/composition/index.ts` | 930 | 55/7 |
| `tests/unit/inventario/authorization.test.ts` | 605 | 26/3 |

Los otros nueve: `lib/modules/inventario/index.ts`, `.../domain/page.ts`,
`.../ports/product-repository.ts`, `.../ports/presentation-repository.ts`,
`.../adapters/driven/persistence/{list-query-sql.ts, product-prisma.ts, presentation-prisma.ts}`,
`tests/unit/inventario/product-service.test.ts` y `presentation-service.test.ts`.

Es **el mismo incidente que la bitácora dice haber corregido, pero al revés**:
`impl_QC-57 > Incidente de finales de línea` sostiene que una edición convirtió CRLF->LF y que se
«restauró CRLF», y afirma que «tras restaurar CRLF el cambio real de ese archivo son 7 líneas» y que
«ningún otro archivo quedó afectado». Las dos afirmaciones son falsas: la dirección correcta era la
contraria, y hay 14 archivos, no uno.
Bloquea por tres motivos, y el tercero es el que pesa: (a) unas 4.700 líneas fantasma hacen que **el
diff de esos 14 archivos no sea revisable** sin `--ignore-cr-at-eol`, y ahí dentro están
`lib/composition/index.ts` y los dos adaptadores de inventario, que es donde vive el riesgo; (b) la
bitácora, que es evidencia según `docs/verification.md`, afirma algo comprobablemente falso; (c) **el
siguiente paso obligatorio es B1, un merge con `dev` que ya pinta conflictivo** — meterle 14
archivos con finales de línea distintos garantiza conflictos espurios en archivos que nadie tocó de
verdad.
**Para cerrar:** reconvertir los 14 a LF, comprobar con `git diff origin/dev...HEAD --numstat` que
el conteo baja al cambio real, y **corregir el párrafo de la bitácora**, que hoy desinforma.

### Menores

- **m1 — La guardia de QC-26/QC-34 quedó inválida.** Punto 2. No se toca aquí; **tiene que salir en
  el PR y en `progress/current.md > Deudas`**, con la corrección propuesta.
- **m2 — Falta el aviso a los otros cuatro worktrees** sobre `products.name_normalized NOT NULL` en
  la base compartida. Punto 3. Va en `progress/current.md`, no solo en la bitácora de la ficha.
- **m3 — `pageQuerySchema` huérfano** en cuatro barrels y seis tests. Punto 4. Ficha propia o
  entrada en Deudas.
- **m4 — La bitácora atribuye a R5 la poda de valores de los conjuntos cerrados de pedidos**; la
  exige `design.md > 5`, nota 3. Punto 5. Corregir la frase.
- **m5 — Nombre de test engañoso.** `tests/unit/inventario/list-query.test.ts:98`, «corta una
  busqueda absurdamente larga», **rechaza**, no corta: 121 caracteres dan `success: false`. El
  aserto es honesto; el nombre no. `docs/conventions.md > Tests` pide que el nombre describa el
  comportamiento.
- **m6 — Efecto colateral de m5, sin cubrir por ningún requisito:** una búsqueda de más de 120
  caracteres **tumba la consulta** con `invalid_input`, en tensión con el espíritu de que una lista
  no se caiga por lo que traiga la consulta. Es coherente con `z.strictObject` (validación de forma)
  y el implementer ya dejó anotada esa distinción; se anota por si QC-56 la encuentra.
- **m7 — Rendija en `textoComparable`** de la guardia de equivalencia. Punto 6.
- **m8 — `feature_list.json` de la rama está desactualizado**: no lista QC-57 como `in_progress`. Se
  arregla solo con B1.

---

## Lo que NO es hallazgo, para que no se relitigue

- **La migración escrita a mano y sin un solo `DROP CONSTRAINT`**: verificado en el `migration.sql`.
  La mina de `design.md > 10.3` está desarmada, y es el acierto técnico de la ficha.
- **`pg_trgm` con `CREATE EXTENSION IF NOT EXISTS` y `down.sql` que no la borra**: correcto y
  documentado en `design.md > 10.4` y en la cabecera del propio `down.sql`.
- **La segunda migración `recipe_steps_reset` del diff de dos puntos**: es de `dev`. Consecuencia de
  B1, no hallazgo aparte.
- **Las tres decisiones cerradas tardías**: las tres están aplicadas y **contradicen al `design.md`
  donde toca**, como manda la precedencia. Verificado: vía A con GIN de trigramas y búsqueda por
  subcadena; `dateRange` en UTC con `gte`/`lt` del día siguiente —mejor que `<=` por la precisión de
  microsegundo de `timestamptz`, y comentado en el código—; y `nulls: 'last'` **explícito en las dos
  direcciones** sobre `stock`, `qtyAlert`, `minPurchase` y `deliveryTime`, con test en `asc` y en
  `desc`.
- **R11**: comprobado contra `origin/dev` que el orden por defecto de cada adaptador se conserva —el
  catálogo de proveedor sigue en `createdAt asc` y no pasó a `name asc`—.
- **R21**: recorridas las siete listas blancas contra los 35 índices; todo campo ordenable o
  buscable tiene índice, contando los seis que ya existían y `presentations_name_idx` como el que
  sirve el orden por `presentationName` de productos.
