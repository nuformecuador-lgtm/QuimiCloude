# QC-50 — aislamiento-por-empresa-en-recetas · informe de revisión (F2.2)

> Escrito por el **reviewer**. Rama `feature/QC-50-aislamiento-por-empresa-en-recetas`,
> worktree `.worktrees/QC-50-aislamiento-por-empresa-en-recetas/`, HEAD `06f5a78`, árbol limpio.
> Base de comparación: `origin/dev` (`git diff origin/dev...HEAD`, 87 archivos).
> Fecha: 2026-09-17.

## Veredicto

**RECHAZADO — 1 bloqueante** (documental: `R31` de `requirements.md` quedó sin enmendar y su
cláusula del **borrado** no la verifica ningún test E2E). El resto de la ficha es de una calidad
muy alta: el código **no** necesita rework, y el bloqueante se cierra con una enmienda de `R31`
firmada por el humano, igual que la que ya recibieron `design.md > 8.2` y `T20`.

## Checklist

### Especificación
- [x] `requirements.md` con EARS numerados `R1`-`R33`.
- [x] `design.md` con alternativas descartadas y su porqué (seccion 10, y seccion 2.2 alternativa D).
- [ ] `tasks.md` con **todas** las tasks `[x]` — **T28 (`./init.sh` completo) sigue `[ ]`**. Es del
      leader por diseño; no es un hallazgo contra el implementer, pero la ficha no cierra sin ella.

### Trazabilidad
- [x] `progress/impl_<feature>.md` contiene el mapa `R<n> -> test` (33 filas).
- [~] Cada `R<n>` mapea a un test concreto que **afirma lo que dice**: verificado uno a uno.
      **32 de 33 completos; `R31` parcial** (ver BLOQUEANTE-1).

### Calidad de código (ejecutado por mí, no copiado de la bitácora)
- [x] `pnpm run typecheck` -> **verde, cero errores**.
- [x] `npx vitest run tests/guards` -> **38 archivos, 439 pasan, 5 skip**. Incluye
      `guard-ambito-empresa-recetas`, `guard-ambito-empresa-inventario` (ya **sin** excepciones),
      `guard-rls-force`, `guard-dependencias-aprobadas`, `guard-identificador-de-request`,
      `guard-arquitectura-modulos`, `guard-aislamiento-integracion`.
- [x] Lote dirigido de 24 archivos unit (los nuevos y los de listas cerradas) -> **312 pasan**.
- [x] Los 3 archivos que la bitácora reporta como rojo AJENO
      (`inventario/product-page.test.tsx`, `proveedores-ui/supplier-page.test.tsx`,
      `recetas-ui/recipe-page.test.tsx`) -> **139/139 verdes en aislamiento** y **ninguno está en el
      diff**. La afirmación del implementer se sostiene: no son de esta ficha.
- [ ] Suite completa e integración: **no las corrí** (instrucción explícita del leader; el gate
      completo es suyo). La bitácora reporta 63/63 archivos y 822/822 tests de integración.
- [x] E2E: la feature toca aislamiento entre clientes -> `e2e/aislamiento-recetas.spec.ts` existe y
      es sustantivo (asserts sobre el HTML servido, no solo DOM).
- [x] UI: **el diff no toca `app/` ni ningún componente**. La regla multiplataforma no aplica.
- [x] Dependencias: `package.json` y `pnpm-lock.yaml` **no están en el diff**. `R33` cubierto.

### Datos y seguridad
- [x] El único modelo nuevo/modificado de `db/schema.prisma` es `Recipe`, que **gana**
      `companyId String @map("company_id") @db.Uuid`. `RecipeLine` se queda sin columna **a
      propósito** y eso está afirmado como test (`EXPECTED_RECIPE_LINE_FIELDS` intacta,
      `TABLAS_FUERA_DE_ALCANCE` sin excepción nueva, e `information_schema` en integración).
- [x] Toda consulta de operación filtra por la empresa de quien pide, y hay test de rechazo
      cruzado en los tres niveles (guardia estática, service con dobles, integración real).
- [x] RLS `ENABLE` + `FORCE` en `recipes` y `recipe_lines`, sin policies; el paréntesis
      `NO FORCE`/`FORCE` del UP y del DOWN está escrito y afirmado.
- [x] Migración nueva con su `down.sql`; ningún `INSERT` ni `DELETE` en ninguno de los dos.
- [x] Sin secretos: las credenciales del E2E se generan por corrida y viven solo en la base de test.
- [x] Sin webhooks. Sin cliente de Supabase colado: el acceso pasa por Prisma.

### Módulos hexagonales
- [x] `domain/recipe-scope.ts` no importa nada. `company-scope.ts` (adaptador) es el único sitio
      nuevo que toca `Prisma`, y la lista cerrada de dueños de `@prisma/client` se **retensó**
      nombrándolo, no ensanchando el patrón.
- [x] Las costuras entre módulos reciben `companyId: string`, no el tipo de ámbito ajeno: no hay
      acoplamiento nuevo por ruta profunda.
- [x] `guard-arquitectura-modulos` en verde.

## Los cuatro puntos de atención que pedía el leader

### 1. Trazabilidad R1-R33, uno a uno
Recorrida entera contra el mapa de la bitácora. **Todos los tests citados existen, afirman lo que
dicen y son falsables.** Lo que comprobé de más, por muestreo profundo:
- **R7** trae **control anti-placebo**: ejecuta el bloque de guardias con la 2 **y** la 3
  desactivadas por mutación en memoria y demuestra que sin ellas el dato pasa.
- **R16 / R17 / R21 / R23 / R28** traen **controles positivos** con el mismo almacén: no son tests
  que pasarían igual con el puerto roto.
- **R28** usa dobles **explosivos** (los puertos lanzan si se les llama), que es lo que prueba de
  verdad «antes de tocar ningún puerto».
- **R22** reescribió el bloque de `product-catalog.test.ts` para afirmar contra el objeto que
  devuelve `productCompanyScope(...)`, no contra una copia escrita a mano.
- **R26** son dos archivos **nuevos** (desviación 4), con control positivo y con el caso «no cambiar
  la receta ni siquiera pregunta al catálogo».
- Único hueco: **R31** (ver BLOQUEANTE-1).

### 2. El índice único PARCIAL: las tres afirmaciones siguen ahí y siguen mordiendo
**Confirmado.** Las tres son independientes y ninguna es decorativa:
- `tests/unit/recetas/schema/recipes-company-scope-migration.test.ts:575` — predicado sobre el
  texto del SQL con **cuatro** mutaciones (sin el WHERE, con el global vivo, empresa en la cola,
  orden invertido); antes de exigir el rojo verifica que la mutación encontró su texto. Lo corrí:
  verde.
- `tests/integration/inventario/list-query-indexes.int.test.ts:320` — contra `pg_indexes`,
  exigiendo el predicado `WHERE (deleted_at IS NULL)` como aserción propia y separada de las
  columnas, más que `recipes_name_unique` ya no exista.
- `tests/integration/recetas/company-scope.int.test.ts:400` — el comportamiento: el borrado lógico
  **libera** el nombre para su empresa.

Y el `down.sql` restaura el global **también parcial**, con su propia mutación de falsabilidad.

### 3. La excepción que muere: tensa, no relaja
**Confirmado, y es la mejor parte de la ficha.** `SIN_AMBITO_POR_DECISION_APROBADA`, la rama que la
comprobaba y su párrafo justificativo están **borrados**; el mensaje de error de la guardia se
reescribió para decir que el módulo no tiene ninguna excepción. Comprobado que no queda escapatoria:
- `findProductRefs` ahora exige la empresa y la lleva a `productCompanyScope` a través de
  `findAliveProducts(ids, scope: InventoryScope)`, que es la función que toca `prisma.`: la guardia
  la ve y le exige el parámetro **y** el consumo.
- Ningún archivo del repo sigue anunciando que esa costura está sin ámbito (`company-scope.ts` de
  inventario, `unit-prisma.ts:144` y el docblock del adaptador: los tres reescritos, ninguno
  mintiendo).
- `tests/guards/guard-ambito-empresa-recetas.test.ts` nace **sin** lista de excepciones. Tiene un
  `continue` por nombre para `replaceAliveRecipe`, pero está **compensado**: un describe propio
  exige `recipeCompanyScope(scope)` dentro del `tx.recipe.updateMany`, el orden
  updateMany -> `count === 0` -> `return not_found` **antes** del primer `tx.recipeLine.`, y que las
  líneas no lleven ámbito propio. Más un anti-placebo del troceador. No es un agujero.

### 4. Las 13 listas cerradas: ninguna relajada
**Confirmado.** Revisé el diff de las 13. Ningún `toEqual` se convirtió en `toContain`, no nació
ninguna lista de excepciones y las tres altas «por diff» (11, 12, 13) nombran los archivos uno a
uno. La lista 9 se **retensó** (de un dueño de `@prisma/client` a dos, nombrados). La lista 10 pasó
a exigir **dos** argumentos, el segundo `ADMIN.companyId`. La 8 añade `Recipe` y deja `RecipeLine`
vetada. El único cambio que afloja un predicado es el de la desviación 2, juzgado abajo.

## Hallazgos

### BLOQUEANTE-1 — R31 de requirements.md quedó sin enmendar, y su cláusula del borrado no la verifica nada
`requirements.md` R31 sigue exigiendo, literalmente:

> «un intento de **borrar** una receta de la empresa B **conociendo su identificador** se rechaza
> con un mensaje de error a la vista»

`e2e/aislamiento-recetas.spec.ts` **no intenta ningún borrado**: navega a
`/produccion/formulas/<id de B>` y compara el estado con el de un id inexistente. La enmienda del
2026-09-16 se escribió en `design.md > 8.2` y en T20 de `tasks.md`, pero **no** en
`requirements.md`, así que el requisito que el reviewer valida sigue pidiendo algo que ningún test
hace. La bitácora afirma «ningún punto del spec sigue afirmando que se sustituye el identificador
por DOM»: cierto, pero el punto que quedó vivo no es el del DOM, es el del **verbo borrar**.

Qué **sí** está cubierto, para que quede claro el tamaño real del agujero:
- el borrado cruzado se rechaza en el service (`tests/unit/recetas/company-isolation-service.test.ts`,
  los cinco casos de uso, error de receta inexistente y nunca `UnauthorizedError`);
- y en integración contra Postgres (`softDeleteAlive` de una receta de B desde A devuelve
  `not_found` y no le marca `deleted_at`, con control positivo desde B).

Lo que falta es **solo** el E2E del verbo borrar, y es **impracticable** sin añadir un campo oculto
a `delete-recipe-dialog.tsx`, que `design.md > 14` prohíbe: el diálogo toma `recipe.id` del cierre
de React, no del DOM. El análisis del implementer sobre eso es correcto, lo verifiqué en el código.

**Qué falta para cumplirlo:** enmendar R31 en `requirements.md` con la misma decisión humana
fechada que ya llevan `design.md > 8.2` y T20, sustituyendo la cláusula del borrado por la del
enlace al detalle y dejando dicho que el rechazo del borrado cruzado se cierra en service e
integración. Es trabajo de `spec_author` más la puerta humana, **no del implementer**: no hay que
tocar ni una línea de código ni de test. Con esa enmienda, este informe pasa a OK.

### menor-1 — Tres líneas de comentario modificadas en producción arrastran citas de ficha
`docs/conventions.md > Comentarios` (y `design.md > 13`) prohíben citar `QC-<n>`, `R<n>` o
`design.md` en el código que la ficha escriba o modifique. En **líneas que el diff modifica** quedan
tres citas:
- `lib/modules/recetas/adapters/driven/persistence/recipe-prisma.ts` — «(R7, R36 de QC-26)»;
- `lib/modules/recetas/domain/actor.ts` — «QC-74 (R18) retiro el nombre del rol»;
- `lib/modules/recetas/adapters/driving/recipe-actions.ts` — «El actor que exige R1/D17».

**No lo trato como bloqueante**, y el motivo es concreto: las tres citas son **preexistentes y
verbatim**; el diff no autoría ni una cita nueva. Las líneas se tocaron porque esta feature las
dejaba **mintiendo** (el actor gana empresa, el where gana ámbito, `currentActor` gana la segunda
cara de la sesión), que es exactamente lo que `design.md > 13` manda corregir, y borrar las citas de
paso habría sido «limpieza de comentarios mezclada con cambios de código», que la propia regla
califica de menor. Verificado con grep estricto sobre **todas** las líneas añadidas de `lib/` y
`db/`: esas son las únicas coincidencias del diff entero. Los archivos **nuevos**
(`recipe-scope.ts`, `company-scope.ts`, `migration.sql`, `down.sql`) y `schema.prisma` están
**limpios**. Dejo constancia para la limpieza por módulo de QC-115.

### menor-2 — Etiqueta de requisito equivocada en el caso nuevo de list-query-indexes.int.test.ts
El caso se llama «...es POR EMPRESA y PARCIAL, y el global ya no esta **(QC-50 R20)**» y el
comentario de `PRE_EXISTING_INDEXES` dice «(R20, decision cerrada)». En esta ficha R20 es la
conciliación de **líneas**; la unicidad por empresa es R10 y el indexado es R9. El test es correcto
y muerde; lo que está mal es la etiqueta, y la trazabilidad de esta ficha vive en los nombres de los
tests, así que conviene corregir R20 -> R9, R10.

### menor-3 — R6 (el esquema queda exactamente como estaba) se afirma sobre el TEXTO del down.sql, no ejecutándolo
`company-scope.int.test.ts` ejecuta contra Postgres **solo el bloque de guardias** del `down.sql`;
la restauración del índice global parcial, el `DROP CONSTRAINT`, el `DROP COLUMN` y el
`ENABLE`+`FORCE` se afirman leyendo el archivo (`recipes-company-scope-migration.test.ts:775`, con
dos mutaciones de falsabilidad). El «esquema idéntico verificado contra `pg_indexes` e
`information_schema`» que pide el criterio de hecho de T3 lo cubre la corrida **manual** que reporta
la bitácora, no un test. Dado que el DDL es transaccional y el archivo ya tiene el andamiaje para
ejecutar SQL del disco dentro de una transacción con ROLLBACK, ejecutar el `down.sql` entero y
comparar los dos retratos era alcanzable. No bloquea (R6 tiene tests y son falsables), pero es el
eslabón más débil de la ficha.

### menor-4 — La guardia 3 del down.sql es inalcanzable con datos reales (desviación 5, la juzgo correcta)
Verificado leyendo el SQL: la guardia 2 aborta ante **cualquier** fila con
`company_id <> target_company_id`, y dos recetas vivas de empresas distintas implican por
construcción al menos una de esas filas, así que la guardia 3 nunca habla. El implementer lo
**declara**, lo prueba aislándola con una mutación en memoria **y ejecutándola de verdad** contra la
base, y no toca el `down.sql`. Es la decisión correcta: en un `down.sql` una guardia redundante es
cinturón y tirantes, no infraestructura preparada por si acaso. Queda como observación.

## Las 6 desviaciones declaradas, juzgadas una a una

1. **T20 bloqueada, resuelta por la URL del detalle.** El análisis técnico es **correcto**
   (`delete-recipe-dialog.tsx:58` pasa `recipe.id` desde el cierre de React; los diálogos de QC-49
   y QC-60 sí llevan campo oculto). La solución **cierra además la escritura**, porque
   `EditarRecetaPage` es el único sitio que monta `RecipeForm` precargado, y el E2E compara el
   mensaje y el href contra los del id inexistente, que es lo que descarta el oráculo de
   existencia. **Aceptada como técnica**; lo que no acepto es que `requirements.md` se quedara
   atrás -> BLOQUEANTE-1.
2. **Falso positivo de `scope.test.ts` (substring -> forma de import).** Es, literalmente, un
   predicado **más laxo**. Lo acepto: la comprobación hermana de `@supabase/storage-js` siempre
   exigió forma de import, y lo que el requisito prohíbe es que el adaptador **se ejecute** en un
   test del módulo, cosa que solo produce un import o require real. Validado por el leader el
   2026-09-16 y con el rojo comprobado creando un import de verdad. **Aceptada.**
3. **Matiz de R13 (sin consultar el repositorio).** Correcto: las actions llaman al caso de uso con
   actor nulo y es `requirePermission` quien rechaza en la primera línea. Sigue el precedente ya
   aprobado de `product-actions.test.ts` (QC-49 R12), y la garantía dura la cierra
   `authorization.test.ts` con puertos que explotan si se les llama. **Aceptada.**
4. **`create-order.test.ts` y `update-order.test.ts` son nuevos, no ampliaciones.** Verificado: no
   existían en `origin/dev` y los casos de `createOrder`/`updateOrder` vivían en
   `order-service.test.ts`, que solo se tocó para **tensar** la aserción de la costura. **Aceptada.**
5. **Dependencia lógica entre las guardias 2 y 3 del `down.sql`.** Verificada y correcta. Ver
   menor-4. **Aceptada.**
6. **T13 sin edición de `lib/composition/index.ts`.** Verificado: el archivo no está en el diff y
   `typecheck` pasa en verde en todo el repo, que es exactamente el criterio de hecho de la task.
   **Aceptada.**

## Nota para el gate completo del leader

Los 5 rojos de `tests/guards tests/unit` que la bitácora reporta como ajenos **no son de QC-50**:
lo confirmé por las tres vías (no están en el diff, 139/139 verdes en aislamiento sobre esos tres
archivos, y dos de ellos son casos de calendario sensibles a la fecha). No se metió nada a
`tests/baseline-rojos.json` ni se marcó nada como skip, que es lo correcto. Si `./init.sh` los
vuelve a poner rojos, merecen su propia ficha de flakiness, no un parche aquí.

**Pendiente de cierre, además del bloqueante:** T28 (`./init.sh` completo) sigue `[ ]` en
`tasks.md`; es del leader.
