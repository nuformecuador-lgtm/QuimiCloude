# review QC-121 — unidad-como-identidad-del-item

> Revisado el 2026-09-21 sobre `feature/QC-121-unidad-como-identidad-del-item` contra
> `origin/dev` (HEAD `2181d3a8`, 92 archivos, +5578/-751). El gate completo (T13) lo corre el
> leader en paralelo: **no se relanzo aqui** por orden explicita. Lo que si se corrio, acotado por
> archivo, esta en «Verificacion ejecutable».

## Veredicto

**RECHAZADO** — 2 bloqueantes. Los dos son de coste bajo y ninguno toca el diseno: uno es
limpieza de comentarios en tres archivos de produccion, el otro es un caso de test que perdio lo
que probaba. El resto de la feature esta bien construida y bien verificada.

## Checklist

### Especificacion
- [x] `requirements.md` con EARS numerados R1-R35 (28 + enmienda R29-R34 + R35 del 2026-09-19).
- [x] `design.md` con alternativas descartadas y su porque (8, dos de ellas de la enmienda).
- [ ] `tasks.md` con **todas** las tasks `[x]`: **T13 sigue sin marcar** (es del leader, en curso).

### Trazabilidad
- [x] `progress/impl_...md` trae el mapa R1-R35 -> test.
- [~] Cada `R<n>` mapea a un test concreto que existe y prueba lo que dice: **34 de 35 verificados
  uno a uno**. Falla **R8** en su clausula «vencidos incluidos» (ver BLOQUEANTE 2). R18 y R35
  quedan con una clausula sin caso propio (menor 1).

### Calidad de codigo
- [~] `typecheck` / `lint`: no se relanzaron aqui (el leader los corre dentro del gate completo);
  la bitacora los declara exit 0 tras cada task.
- [x] Tests acotados corridos por el reviewer: 213 + 44 + 39 + 117 pasados, 0 rojos (detalle abajo).
- [x] Flujo critico (movimientos de inventario) con E2E: R26 en `e2e/inventario.spec.ts` y R34 en
  `e2e/ajuste-de-inventario.spec.ts`, verdes el 2026-09-21 (3 corridas, una con `.next` borrado).
- [x] Multiplataforma: el diff de `app/` no anade `100vh`, `h-screen`, `:hover` como unica via,
  target tactil nuevo ni `font-size` < 16px; el disparador del panel conserva `TOUCH_TARGET`.
  Solo texto nuevo en celdas y opciones que ya existian, como anticipa `design.md > 10`.
- [x] Dependencias: `package.json` y `pnpm-lock.yaml` **no aparecen en el diff** (R28);
  `guard-dependencias-aprobadas` verde.

### Datos y seguridad
- [x] Ningun modelo nuevo en `db/schema.prisma` (`Product` gana dos columnas);
  `guard-empresa-en-esquema` verde.
- [x] Cada consulta nueva lleva empresa: `findAliveIdByNameInPresentationUnit`
  (`presentationCompanyScope` + `productCompanyScope`), `recalculateProductStock`
  (`batchCompanyScope` + `company_id` en el `UPDATE` crudo), el `SELECT ... FOR NO KEY UPDATE` del
  ajuste (`companyScopeColumns`). Rechazo cruzado probado: `product-stock.int` > «un lote de otra
  empresa devuelve null y no cambia el stock de ninguno de los dos productos».
  `guard-ambito-empresa-inventario` verde.
- [x] Permisos en el **service** y sin permiso nuevo (R24): `authorization.test.ts` (7 escrituras /
  5 lecturas), `create-product.test.ts`, `presentation-service.test.ts`.
- [x] RLS: no hay tabla nueva; la migracion abre y cierra el parentesis `NO FORCE`/`FORCE` sobre
  las tres tablas y no crea policies. Test unitario del SQL lo afirma.
- [x] Migracion versionada y reversible: `20260918130000_product_unit_and_stored_stock` con su
  `down.sql`, aplicada -> `db:rollback` -> aplicada por el implementer (T3); el test del SQL afirma
  que cada objeto del up tiene su reversion y que el down no nombra `inventory_movements` ni su
  enum (R33).
- [x] Sin secretos, sin cliente de Supabase, todo por Prisma.

### Modulos hexagonales
- [x] `product-display-name.ts` es dominio puro sin imports; las pantallas lo consumen por el
  barrel `@/lib/modules/inventario`.
- [x] `recalculateProductStock` no se exporta y no escribe `product_batches`:
  `guard-libro-de-inventario` sigue viendo exactamente los tres caminos con su asiento (verde).
- [x] `composition` cablea el metodo renombrado; ningun `driving` instancia su `driven`.

### Verificacion ejecutable (corrida por el reviewer, 2026-09-21)
- `vitest --project node`: `qc121-alcance`, `product-stock`, `product-display-name`,
  `product-unit-and-stored-stock-migration` -> **44/44**.
- `vitest --project node`: `qc91-alcance`, `product-route-contract`, `unidades/module-contract`,
  `inventario-schema`, `create-product`, `product-batch-lot-retry`, `adjust-batch-stock-prisma`,
  `errores/catalogo` -> **213/213**.
- `vitest --project ui`: `product-batches-sheet`, `recipe-line-unit-group`, `presentation-sheet`
  -> **39/39**.
- Guardias: `guard-empresa-en-esquema`, `guard-ambito-empresa-inventario`,
  `guard-libro-de-inventario`, `guard-catalogo-de-errores`, `guard-dependencias-aprobadas`,
  `guard-aislamiento-integracion`, `guard-identificador-de-request` -> **117/117**.
- **No** se corrio integracion ni el gate completo: comparten la base local con la corrida de T13
  del leader y contarian filas a la vez.

## Hallazgos

### BLOQUEANTE 1 — comentarios de produccion nuevos que citan requisitos

`docs/conventions.md > Comentarios` prohibe sin excepciones citar `QC-<n>`, `R<n>`, `design.md` o
«decision cerrada» en comentarios de produccion, y obliga a limpiar los comentarios **de las
lineas que la rama toca**. El diff anade o modifica **7 lineas** de comentario con cita en tres
archivos de produccion:

| Archivo:linea | Linea |
|---|---|
| `app/(private)/produccion/formulas/components/product-picker.tsx:98` | «...la linea se puede escribir igual (R23)...» (linea reescrita: la cita venia de antes y se arrastro) |
| `.../product-picker.tsx:102` | «...(R18), y ademas la entrega intacta en `onSelect`.» |
| `.../product-picker.tsx:124` | `/** «nombre · unidad» de una opcion, o solo el nombre sin unidad (R18). */` (linea **nueva**) |
| `.../product-picker.tsx:144` | `/** Catalogo de unidades, para pintar «nombre · unidad» en cada opcion (R18). */` (linea **nueva**) |
| `.../recipe-lines-field.tsx:61` | «...opcion («nombre · unidad», R18), con el catalogo...» (linea **nueva**) |
| `.../recipe-lines-field.tsx:67` | «...por ese motivo (R23): el selector se...» |
| `.../unit-group.ts:73` | «...es exactamente lo que R23 pide...» |

El resto de la rama si hizo la limpieza bien (`product-repository.ts`, `product-input.ts`,
`product-queryable.ts`, `product-form.tsx`, `product-columns.tsx`, `schema.prisma` perdieron sus
citas). Los comentarios **preexistentes** que el diff no toca —y en estos tres archivos hay
muchos— **no** son hallazgo. **Que falta**: quitar la cita de esas 7 lineas (el porque se dice sin
el numero, o se calla si el codigo ya lo dice). Hasta QC-115 esto solo lo ve el reviewer.

### BLOQUEANTE 2 — R8 pierde la clausula «vencidos incluidos»: el test que la probaba quedo tautologico

R8 exige que la existencia guardada sea «la suma de las existencias de **todos** sus lotes,
**vencidos incluidos**». En `origin/dev`, quien lo probaba era
`tests/integration/inventario/list-query-products.int.test.ts` > «un lote vencido sigue sumando a
la existencia (R4)»: sembraba un lote vencido y otro vigente y comprobaba que la agregacion —que
leia los lotes— daba 15.

T6 lo reescribio asi: el producto se siembra con `stock: 15` **directamente en la columna** y se
insertan los dos lotes a mano, sin pasar por `recalculateProductStock`; la asercion final es
`expect(pagina.items[0]?.stock).toBe(15)`. Es decir, **el caso ya no depende de los lotes**:
pasaria igual si el recalculo excluyera los vencidos, o si no hubiera lotes en absoluto. El titulo
(«un lote vencido sigue sumando a la existencia guardada») afirma algo que el cuerpo no comprueba.

Comprobado ademas que **ningun otro test** cubre el hueco: los tres lotes de
`product-stock.int.test.ts` van con `expiryDate: null` (`:155`), igual que el doble de
`product-batch-lot-retry.test.ts` (`:68`), y `grep expiryDate` sobre el resto de integracion no da
ningun caso que mire `products.stock`.

La nota de la bitacora («se arreglo dando al producto la unidad de su presentacion, **para no
perder lo que prueba**») no es exacta: lo que probaba se perdio al sustituir la suma por una
columna sembrada. **Que falta**: un caso que ejercite el camino real —un alta con `expiryDate`
pasado mas otra vigente sobre el mismo producto, y `products.stock` = suma de las dos— en
`product-stock.int.test.ts` (o devolver a la de `list-query-products` una asercion que dependa de
los lotes). Es un caso, no un rediseno.

### menores

1. **R18/R35, la clausula del simbolo sin test.** «...con el simbolo de la unidad o, **si la unidad
   no tiene simbolo, su nombre**» no tiene ningun caso: todos los tests del listado, del panel y
   del selector usan unidades **con** simbolo. Una implementacion que ignorara el nombre pasaria.
   Afecta tambien al `unitLabel` **nuevo** de `product-picker.tsx:118-122`, cuya rama `?? unit.name`
   no la ejecuta nadie. No lo elevo a bloqueante porque el nucleo de R18 si esta probado y la rama
   es un `??` heredado de codigo anterior igual de intocado; se cierra con una unidad `symbol: null`
   en cualquiera de los tres tests.
2. **Comentario con el motivo equivocado** (`docs/conventions.md`: «un comentario con la razon
   equivocada es peor que ninguno»): `lib/modules/inventario/domain/product-input.ts:25-26` dice
   que «`products.unit_id` la fija **el propio disparador** al escribir el lote». No es asi: la
   escribe `createWithFirstBatch` leyendo la presentacion; el disparador solo **rechaza** lo que no
   cuadra. La misma frase se repite en `tests/unit/inventario/product-input.test.ts:191-192`.
3. **`tasks.md` T13 conserva una frase desfasada**: «T15 cuenta como hecha si el humano respondio
   "no" a la pregunta abierta 2». El humano respondio «si» el 2026-09-18 y T15 esta hecha.
4. **El `aria-label` del disparador del panel lleva «nombre · unidad»** y R35 solo habla del
   titulo. No es alcance de mas: lo pide literalmente **T15** en `tasks.md`, que el humano aprobo, y
   ademas es lo correcto en accesibilidad (el nombre accesible coincide con lo que se ve). Queda
   dicho para que nadie lo lea como una invencion del implementer.
5. **Comentarios obsoletos en tests** que el diff dejo atras: `recipe-form.test.tsx:853` sigue
   explicando `latestBatchUnitId`, campo que ya no existe.
6. **`pickerLabel` en `recipe-line-unit-group.test.tsx:78-82` reimplementa la regla de produccion**
   (`symbol ?? name`) para localizar la opcion. Usa el `productDisplayName` real, asi que el
   separador si esta atado, pero la etiqueta de unidad se calcula dos veces y un cambio coordinado
   no lo veria nadie.
7. **`tests/guards/guard-identificador-de-request.test.ts`** gana la entrada de la migracion nueva
   (lista cerrada, correcto y en el commit de T3), pero la bitacora no lo menciona entre los tests
   tocados.

## Los puntos que el leader pidio expresamente

1. **Rojos aceptados como ajenos: confirmado, ninguno es de esta rama.**
   - Los 17 `expected '23001' to be '23503'` y los 2 «9 vs 10» de `company-scope` (proveedores y
     recetas) son **las dos filas de la tabla de `docs/verification.md`** (lineas 92-93), medidas
     contra Postgres 18.6 el 2026-09-18, antes de esta rama. Ninguno de esos dos archivos de
     `company-scope` esta en el diff.
   - Los 3 de `tests/integration/unidades/unit-write.int.test.ts` > R24: **el archivo no esta en el
     diff**, y leidos sus tres casos, ninguno pasa por `products.unit_id`: bloquean el borrado de
     una unidad por una **presentacion**, por una **linea de receta** y por ser **base de otra**.
     La FK nueva (`products_unit_id_fkey`) no participa —los productos de ese fixture no llevan
     unidad—, asi que la causa es la misma traduccion de `23001` que Prisma no reconoce.
   - Aviso del arnes que **no** aplica aqui: ninguno de esos archivos esta en
     `tests/baseline-rojos.json` (si lo esta `recipe-route-contract.test.ts`, ver punto 4).
2. **T6, el tercer rojo: NO sigue probando lo que decia.** Es el BLOQUEANTE 2. Los otros dos
   (partidos en dos productos) estan bien reescritos: el de la unidad y el de la existencia por
   unidad ahora afirman dos filas con su `unitId` y su `stock`, que es exactamente lo que la ficha
   cambio.
3. **T7 / `recipe-line-unit-group.test.tsx`: aceptado.** Revisado linea a linea: solo cambia el
   helper `elegirIngrediente`, que ahora recibe el producto y localiza la opcion por «nombre ·
   unidad». Las once aserciones de las tres reglas del grupo de unidades son identicas, y
   `unit-group.ts` solo cambio un comentario. Que el test tuviera que cambiar era inevitable: T7
   cambia el texto de la opcion, que es como el test la encuentra. La task decia «sin cambios de
   logica» y eso se cumplio; lo que falto fue anticiparlo en el plan (nota menor 6 aparte).
4. **Tests arreglados fuera de su task: aceptados los cuatro.** `qc91-alcance`,
   `unidades/module-contract` y el centinela de `product-route-contract` estaban **previstos** en
   `design.md > 12.2` y se cambiaron con su argumento escrito, sin borrar detectores (los de
   `qc91 R21` siguen verdes y los corri: 213/213).
   `recipe-route-contract` **no** estaba previsto, y la desviacion esta bien resuelta: la constante
   `MIGRACION_QC121` sigue el patron de sus cinco hermanas, el comentario no cita la ficha y el
   archivo pasa aislado. Un apunte para el leader: ese archivo esta en `tests/baseline-rojos.json`
   desde 2026-09-04 por esa misma guardia de diff, asi que el arreglo **no cambia nada en el gate**
   —el comparador lo ignora entero—; se justifica igual por dejar la rama honesta, y la salida
   limpia (que el caso mire el diff de su propia rama) sigue siendo deuda del arnes, no de QC-121.
5. **R35: bien redactado y bien mapeado.** Usa «DONDE ... DEBE», cita `[D8]` y la fila de decision
   del 2026-09-18, y delega la regla del simbolo en R18 en vez de duplicarla. Su test existe
   (`product-batches-sheet.test.tsx` > «el panel se titula "nombre · unidad" (T15)», 3 casos) y lo
   corri: verde. Lo unico incompleto es la clausula del simbolo, que es de R18 y esta en menor 1.
   Que el requisito se escribiera **despues** del codigo es una inversion del orden SDD, pero fue
   orden explicita del humano, esta fechada y dicha en el propio R35 y en `tasks.md`: no lo trato
   como hallazgo.
6. **Observaciones del spec_author**: la de «unidad sin simbolo» es menor 1; la del `aria-label`,
   menor 4 (no es alcance de mas); la frase desfasada de T13, menor 3.
7. **Limpieza del E2E (`b1462880`): se acepta arreglarlo aqui.** El hueco viene de `origin/dev`,
   pero **muerde por culpa de esta rama**: el E2E nuevo de R26 da de alta tres lotes por pantalla y
   desde QC-92 cada alta deja su asiento con FK `RESTRICT`. Sin el arreglo, la feature no puede
   demostrar R26, que es requisito suyo. Ademas va en su propio commit, solo de test, con el mismo
   patron que `e2e/ajuste-de-inventario.spec.ts`, y `aislamiento-inventario.spec.ts` se comprobo que
   no tiene el hueco (fabrica lotes con Prisma, sin asientos). Nada de esto toca produccion.
8. **El sintoma de la pantalla de login: no bloquea, pero no se cierra en silencio.** Una
   aparicion, tres corridas posteriores verdes —una con `.next` borrado a proposito para reproducir
   el arranque en frio—, sin traza del servidor y con el `error-context.md` sobrescrito: no hay
   material para atribuirle causa, y fabricarla seria inventar (regla 6). Ademas R26 tiene respaldo
   determinista en integracion (`product-stock.int` > «el mismo nombre en kg y en L crea DOS
   productos»), asi que el requisito no depende solo de esa corrida. **Condicion**: que quede
   anotado en `progress/current.md > Deudas y cosas abiertas` —no solo en la bitacora, que se
   archiva con la ficha— con el paso siguiente que ya propone el implementer (`--trace on` si
   vuelve).

## Que falta para el OK

1. Quitar las citas de requisito de las 7 lineas de comentario del BLOQUEANTE 1.
2. Un caso que pruebe de verdad que un lote vencido suma en `products.stock` (BLOQUEANTE 2), y
   corregir la nota de la bitacora que dice que no se perdio nada.
3. Recomendado en la misma vuelta (menores 1, 2 y 3): la unidad sin simbolo, el comentario que
   atribuye al disparador lo que hace el adaptador, y la frase de T13.
4. T13 verde y marcada, y `progress/current.md` con la deuda del punto 8.
