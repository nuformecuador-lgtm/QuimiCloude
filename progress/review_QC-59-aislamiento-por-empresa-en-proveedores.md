# QC-59 — aislamiento-por-empresa-en-proveedores · review

> Reviewer, paso F2.2. Worktree `.worktrees/QC-59-aislamiento-por-empresa-en-proveedores`,
> tip `7436321`, árbol limpio. Diff medido contra `origin/dev...HEAD` (60 archivos).
> El gate completo lo corrió el leader en verde (530 archivos, 7764 tests, 0 rojos); aquí no se
> repite. Lo que sigue está verificado leyendo el diff y el código, no la bitácora.

## Checklist

### Especificación
- [x] `requirements.md` con R1-R39 en EARS, y las 19 decisiones cerradas citadas sin reabrir.
- [x] `design.md` con alternativas descartadas y su porqué (2.3 alternativa D, 11 alternativa I).
- [ ] **`tasks.md` con todas las tasks `[x]`** - `T37` (gate completo) sigue en `[ ]`. Hallazgo 1.

### Trazabilidad
- [x] R1-R39 mapeados. Recorridos uno a uno; ninguno queda sin test que lo afirme.
- [x] El mapa `R<n> -> test` está en `progress/impl_...md` (tanda 5, los 39).
- [~] **R36 tiene dos mitades y solo una es ejecutable.** Hallazgo 3.

### Calidad y seguridad
- [x] RLS `ENABLE` + `FORCE` en `suppliers` y `supplier_catalog_lines` (UP pasos 0 y 8), y
      `presentations`/`companies` vuelven al régimen que tenían. Afirmado contra `pg_class` en
      `proveedores-constraints.int.test.ts:1637-1650`.
- [x] Permisos validados en el service, primera línea, antes de zod y de tocar puerto
      (`authorization.test.ts`, con dobles explosivos).
- [x] Sin secretos, sin hardcode de contexto: la empresa sale de `getSessionContext()` y nunca
      de la entrada del llamante.
- [x] Capas separadas: `domain/` y `ports/` sin framework; ningún driving instancia su driven.
- [x] Migración nueva con su `down.sql`; ninguna migración ya aplicada se edita.

### Multiplataforma
- n/a - el diff no toca `app/` ni `components/`. Solo `e2e/` (test).

### Dependencias
- [x] `package.json` y `pnpm-lock.yaml` **no aparecen en el diff**. R39 se cumple por ausencia.
      Ninguna utilidad a mano que duplique una librería del stack.

### Aislamiento por empresa
- [x] Ningún modelo nuevo; las dos tablas de operación ganan su `company_id` `NOT NULL` con FK.
- [x] Toda consulta y escritura de los dos adaptadores driven compone el ámbito: verificado
      línea a línea sobre `supplier-prisma.ts` (5 operaciones + `buildSupplierWhere`) y
      `supplier-catalog-line-prisma.ts` (6, **incluida `isSupplierAlive`**). No hay una sola
      llamada a Prisma sin ámbito.
- [x] Test del rechazo cruzado en los tres niveles: `company-isolation-service.test.ts` (unit),
      `company-scope-queries.int.test.ts` (integración) y `e2e/aislamiento-proveedores.spec.ts`.

## Los seis puntos de atención

### 1. Trazabilidad R1-R39 — verificada uno a uno

Los 33 requisitos con test nombrado `R<n>` viven en los siete archivos nuevos; los seis restantes
—R6, R17, R20, R22, R36, R39— están en `catalog-line-fk.test.ts:110`, `scope.test.ts:419/469`,
`scope.test.ts:114-167`, `supplier-actions.test.ts:418` + `session-once-per-request-actions.test.ts`,
`module-contract.test.ts:381` y `guard-dependencias-aprobadas.test.ts`. Ninguno es un test vacío y
todos son falsables. R4 tiene los **tres** caminos (`INSERT` y los dos `UPDATE`), R5 su control
positivo, R11 cada causa **más dos controles anti-placebo**, R10 el `down.sql` ejecutado entero con
un tercer control que demuestra que la comparación de retratos no es placebo.

### 2. Decisión 3 de QC-52 — INTACTA, comprobado

- Cero imports de `@/lib/modules/inventario` en `lib/modules/proveedores/**`.
- Cero `prisma.product*` y cero consultas a tablas de inventario en el módulo.
- Cero puertos nuevos: `ports/` sigue con tres archivos, ninguno hacia inventario.
- Las únicas apariciones de la palabra «inventario» en el módulo son comentarios que explican por
  qué la costura **no** existe, todos preexistentes.
- `MARCAS_DE_INVENTARIO` se **retensó**, no se relajó: la negativa pasa de la palabra suelta
  `findRefs` al receptor real (`products|productCatalog`) y entra una marca **positiva** nueva
  (`RECEPTOR_DE_FIND_REFS = units`, único admitido). Su falsabilidad se ejecutó y salió roja por
  las dos mitades, y con un receptor que la negativa no conoce (`catalog`) sigue cayendo por la
  positiva: la positiva no es redundante.
- La frontera de la presentación la pone la FK compuesta, sin un solo `SELECT`.

### 3. Las dos FK compuestas y sus claves candidatas — cierran en la base

`suppliers_company_id_id_key` y `presentations_company_id_id_key` (`UNIQUE (company_id, id)`,
**totales**, R3) como destino de `supplier_catalog_lines_company_id_supplier_id_fkey`
(CASCADE/CASCADE) y `..._company_id_presentation_id_fkey` (RESTRICT/CASCADE). Las dos FK simples se
conservan. La necesidad de las candidatas está **demostrada**, no supuesta: sin ellas la FK
compuesta falla `42830`.

Los tres caminos de R4 están cerrados y probados contra Postgres: `INSERT`, `UPDATE` de la empresa
de la línea y `UPDATE` del proveedor a uno de otra empresa, los tres `23503` nombrando la FK
compuesta. La presentación ajena se rechaza en la base y la propia se acepta.

El caso de la **empresa inexistente** no puede nombrar una restricción exacta —viola las tres a la
vez y cuál salta lo decide el catálogo— y se dejó como **conjunto cerrado de tres nombres** con el
porqué escrito. Correcto: no afloja nada (la lista no existía) y los dos casos deterministas sí
nombran su FK exacta.

### 4. El índice del nombre sigue PARCIAL, y los tres ángulos son de verdad independientes

`suppliers_company_name_unique ON (company_id, name_normalized) WHERE deleted_at IS NULL`.

- **Ángulo 1, texto**: `suppliers-company-scope-migration.test.ts`, evaluado sobre el archivo real
  (verdadero) y sobre una copia **en memoria** sin el `WHERE` (falso), con un
  `not.toBe(original)` para que una mutación que no se aplicara no pasara por buena.
- **Ángulo 2, catálogo**: `list-query-indexes.int.test.ts:371-385`, predicado **literal**
  `WHERE (deleted_at IS NULL)` leído de `pg_indexes`, más el recorte en memoria del `def` real que
  prueba que la aserción mide el predicado y no las columnas.
- **Ángulo 3, comportamiento**: `company-scope.int.test.ts:826`, «dar de baja libera el nombre»,
  que **no lee `pg_indexes` ni el texto del SQL** y lo dice en un comentario. Comprobado: el
  archivo no toca el catálogo en ese caso.

No se solapan: uno lee el disco, otro el catálogo de Postgres, el tercero escribe filas. Cada uno se
pone rojo el solo si el `WHERE` desaparece.

### 5. Ninguna lista aflojada — barrido mecánico sobre el diff

- **Cero** `toEqual` degradados a `toContain`. Los únicos `toEqual` que desaparecen del diff son
  los dos de `clavesDelTipoDeps`, que vuelven como `toEqual` de **tres** elementos (entra `units`),
  y el censo de E2E de la tabla compartida, que vuelve como `toEqual` de **diecisiete**.
- **Cero** `it.skip`, `describe.skip` o `todo` añadidos.
- **Cero** listas de excepciones nuevas; `guard-ambito-empresa-proveedores.test.ts:636` afirma
  explícitamente que no existe ninguna, con tres nombres de lista vetados y un anti-placebo.
- **Una sola aserción eliminada**, y la bitácora dice la verdad: la que afirmaba que `Supplier` no
  tiene ningún `@@unique` se sustituye por un censo `toEqual` exacto de los `@@unique` del modelo
  (uno: la clave candidata) **más** las dos aserciones explícitas de que ninguno es de nombre ni de
  nombre normalizado. Es estrictamente más estricto. La gemela de `SupplierCatalogLine` queda
  intacta, que es la prueba en el gate de R17.
- Las reparaciones mecánicas de integración **tensan**: el `count` de control pasa de
  «vivos» a «vivos de esta empresa».
- Los censos que no existían como lista cerrada (columnas de `suppliers`, índices de las dos
  tablas) se crearon **cerrados**, no se dejaron en `toContain`.

### 6. Regla de comentarios — la reversión de la tanda 2 quedó bien hecha

Censo por archivo de las citas (`QC-<n>`, `R<n>`, `design.md`, «decisión cerrada») en **todos** los
archivos de producción del diff, antes contra después: **ningún archivo gana una sola cita**. El
único que cambia es `supplier-prisma.ts`, y cambia **a la baja** (pierde dos). Las citas que
aparecen en líneas `+` del diff son texto preexistente arrastrado por el reflujo de párrafos,
verificado con `--word-diff`: el texto **nuevo** de los docblocks —el párrafo del `scope`
obligatorio en los dos puertos, el docblock entero de `company-scope.ts`, los dos archivos nuevos—
no cita nada. Ver hallazgo 6.

## Lo declarado por el implementer, verificado

**El `RETURN` temprano de `migration.sql` y `down.sql`** (añadido en el commit de merge `af2fc32`,
no en la tanda 1). Juzgado técnicamente:

- La guardia sigue **intacta en cuanto hay una fila que repartir**: `existing_rows` suma las dos
  tablas y el `RETURN` solo dispara con las dos a cero; con una sola fila se resuelve la empresa y
  el `RAISE EXCEPTION` aborta igual si es ambigua o no existe. Y cero proveedores con alguna línea
  es imposible (la FK de la línea al proveedor lo impide).
- **R7 se sostiene**: su primera mitad cuantifica sobre «todas las filas ya existentes» y con cero
  filas es vacuamente cierta; no hay reparto que proteger.
- **R11 se sostiene**: sus dos antecedentes —fila de otra empresa, dos nombres vivos repetidos— son
  falsos con cero filas, así que no hay obligación de abortar.
- Pero contradice la **letra de `design.md > 7.2`**, que dice hoy que el paso 2 **sí** aborta si no
  puede resolver la empresa. Ver hallazgo 2.

**R36, mitad declarativa** — verificada por barrido, sin guardia. Ver hallazgo 3.

**T34 mal redactada** — la producción llama al caso de uso con actor `null` y rechaza en
`requirePermission`. Lo que exige el requisito es R22 («rechazar sin escribir nada»), y eso **sí**
se cumple y **sí** está probado: `supplier-actions.test.ts:418` recorre las **nueve** actions por
las **tres** formas de sesión incompleta, afirma que el actor que baja es `null`, que el
identificador de empresa de sesión **no viaja en ninguna posición del argumento** y que el estado
es `unauthorized`; la mitad «sin tocar ningún puerto» está en `authorization.test.ts` con dobles
explosivos. **No es un agujero**; lo que hay que corregir es la redacción de la task. Hallazgo 4.

**`design.md > 8.3` y el `data-code` que no existe** — correcto y, de hecho, más fuerte: el E2E lee
`data-code` como atributo (que es `null`) y lo mete dentro del `toEqual` del desenlace completo
contra el de un UUID inexistente. Si algún día aparece, la comparación lo cubre sola. Aceptado.

**T35 sin puerto de almacenamiento** — comprobado: `ports/` tiene tres archivos y ninguno es de
imágenes; `imagePath` es texto. El censo cerrado más cero `createSignedUrl` es la única forma
comprobable de afirmarlo. Aceptado.

**Las dos falsabilidades no ejecutadas in situ** — la cobertura basta, y no por indulgencia:

- **T14, ángulo 1**: la aserción es una **función pura del texto** del archivo. Evaluarla sobre una
  copia mutada en memoria es *exactamente equivalente* a mutar el archivo; no queda nada por
  probar. Y el ángulo de comportamiento contra Postgres **sí** se ejecutó (índice recreado sin
  `WHERE` dentro de la transacción, `23505`).
- **T30, la mutación de `supplierCompanyScope`**: la falsabilidad de **T33 sí se ejecutó** sobre
  producción real (quitado el `scope` de `findAliveSupplierById`, la guardia cae por dos vías,
  sonda revertida), y T33 vigila exactamente lo que la sonda de T30 habría vigilado. Además el
  archivo tiene falsabilidad cruzada por construcción: «A ve sus tres y ninguno de B» y «B ve sus
  dos y ninguno de A» no pueden estar las dos verdes si el ámbito se ignorase. **No es un hueco.**

## Hallazgos

1. **`menor` — `tasks.md` T37 sigue en `[ ]`.** `CHECKPOINTS.md > Especificacion` exige todas las
   tasks `[x]`. El gate completo lo corrió el leader en verde; falta reflejarlo en disco **antes
   del PR**. Es lo único que impide marcar ese checkpoint.

2. **`menor` con condición — el `RETURN` temprano contradice la letra de `design.md > 7.2`.**
   Técnicamente es sano —la guardia de empresa unívoca queda intacta en cuanto hay una fila, y R7 y
   R11 se sostienen porque con cero filas sus antecedentes son vacuos— y copia verbatim el
   precedente que `dev` aplicó a las otras tres migraciones de empresa en `38252c5`. Pero
   `design.md > 7.2` dice hoy lo contrario y **ninguna suite cubre la rama nueva**. **Antes del
   PR**: ratificación humana explícita y enmienda de `7.2` —y de `7.3` para el DOWN— que la
   recoja. No bloquea porque el cambio no relaja ninguna garantía sobre dato real; bloquearía si se
   mergease dejando el diseño diciendo lo contrario del SQL.

3. **`menor` — R36, mitad declarativa sin guardia.** «No debe quedar ninguna anotación que siga
   afirmando que el hueco existe» se verificó por barrido dos veces (la cadena «hasta QC-50» no
   aparece en ningún archivo vivo) y **se declaró en vez de taparse con un test inventado**, que es
   la conducta correcta. Se **acepta declarado**: la mitad estructural —la que puede regresar
   sola— sí tiene test, y verificada además a mano (cero lecturas de esas dos tablas fuera del
   módulo, en todo `lib/` y `app/`). Recomiendo ficha para una guardia, no rehacer nada aquí.

4. **`menor` — `tasks.md` T34 mal redactada.** Pide que la action «no llame al caso de uso»; la
   producción llama con actor `null` y falla cerrado en `requirePermission`. El test afirma lo que
   pasa de verdad y es más completo que lo pedido. Hay precedente (QC-49, QC-50). **Enmendar la
   redacción de T34**, no el código ni el test.

5. **`menor` — erratas del spec: dos anotadas, una no.** T15 (la baja habría aflojado la lista,
   resuelta hacia el lado que tensa) y T17 («depende de T22» era T31) están anotadas **en
   `tasks.md`**. La de **T21** —punteros de línea desplazados y un `suppliers_name_unique` que
   nunca estuvo en ese censo, porque el censo de índices no existía como lista cerrada— vive **solo
   en la bitácora**. Anotar T21 en `tasks.md` con el mismo formato que T15 antes del PR. Con eso,
   las anotaciones bastan: ninguna de las tres cambia el alcance ni una decisión cerrada.

6. **`menor` — citas de requisito en líneas de producción que el diff reflujó.** Por la letra de
   `docs/conventions.md > Comentarios` una línea *modificada* que cita `R<n>` es hallazgo. Aquí el
   fondo está bien: **no entró ni una cita nueva** —el censo por archivo solo baja— y la ampliación
   que la primera pasada de la tanda 2 introdujo quedó **bien revertida**, comprobado archivo por
   archivo. Los dos archivos nuevos no citan nada. No se pide tocar nada: reescribir esos docblocks
   sería la limpieza en masa que `design.md > 13` prohíbe. Queda anotado para la ficha de limpieza
   por módulo.

**Bloqueantes: 0.**

## Veredicto

**OK — aprobado con menores.** Seis hallazgos, todos `menor`, ninguno bloqueante. Antes del PR
quedan tres gestos de disco y uno de aprobación: marcar `T37`, anotar la errata de `T21` y la
redacción de `T34` en `tasks.md`, y **obtener la ratificación humana del `RETURN` temprano con la
enmienda de `design.md > 7.2` y `7.3`** (hallazgo 2). Nada de eso vuelve al implementer como
código.
