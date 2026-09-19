# QC-123 — el-total-del-pedido-decidir-donde-vive-el-precio · review

> **SEGUNDA VUELTA.** Revisor: `reviewer`. Fecha 2026-09-19. Rama `feature/QC-123-...`,
> tip `015593c6`. Worktree `.worktrees/QC-123-el-total-del-pedido-decidir-donde-vive-el-precio`.
> Diff de la feature: `git diff origin/dev...HEAD` (tres puntos; el de dos puntos arrastra
> QC-109/QC-129, que ya estan en `dev` y NO son de esta ficha).
> Diff de esta vuelta: `git diff 80d18e37..HEAD` (7 archivos).
> La primera vuelta (2026-09-18, tip `80d18e37`) cerro en **RECHAZADO** por dos comentarios de
> produccion con cita de ficha/requisito. Este documento conserva lo que sigue siendo cierto de
> aquella revision y marca lo que cambia.

## Veredicto (segunda vuelta)

**OK.** Los dos bloqueantes estan cerrados y no aparece ninguno nuevo. El fondo de la feature ya
estaba aprobado en la primera vuelta —26/26 requisitos mapeados y verificados leyendo el cuerpo de
cada test, sin dependencias nuevas, aislamiento por empresa con test de acceso cruzado— y esta
vuelta **no lo toca**: es un cambio de comentarios, de un nombre de caso y de documentacion.

## Lo verificado en esta vuelta

### 1. Los dos bloqueantes, cerrados

- **BLOQUEANTE 1 (cerrado).** `lib/modules/pedidos/domain/update-order.ts:14-16`. Fuera la cita
  `QC-35bis`. El docblock **no se quedo vacio ni en una perogrullada**: dice por que existen esas
  dos dependencias —cada escritura recalcula el coste de los ingredientes, y para eso hace falta
  leer los lotes y convertir entre la unidad de la receta y la del lote—, que es informacion que el
  tipo no da. Es motivo, no descripcion.
- **BLOQUEANTE 2 (cerrado).** `lib/modules/pedidos/ports/order-repository.ts:101`. Fuera la cita
  `R20`; el resto del bloque, intacto.

### 2. Barrido propio de citas en produccion — limpio

Hecho por mi, no confiado a la bitacora: sobre **todas** las lineas que la rama anade o modifica en
`lib/`, `app/`, `db/`, `components/` y `scripts/`
(`git diff origin/dev...HEAD -U0 -- lib app db components scripts`), buscando `QC-<n>`, `R<n>`,
`design.md` y «decision cerrada». **Cero coincidencias.** El patron se valido contra una linea de
control para descartar un falso verde. Repasadas ademas a ojo las ~45 lineas de comentario que la
rama anade en produccion: ninguna cita.

El docblock de `createUpdateOrder` (`update-order.ts:26`, que si cita `R20`, `QC-25`, `QC-43`) es
**preexistente y la rama no lo toca**: no es hallazgo, va en la limpieza por modulo.

### 3. El arreglo del menor 2 — el nombre ya cumple lo que su cuerpo hace

Leido el cuerpo, no el rotulo, porque es el defecto que esta ficha ya demostro tener dos veces:

- `tests/unit/pedidos/order-cost.test.ts:234`, «los cuatro caminos sin importe del calculo devuelven
  exactamente la misma salida (R9)»: el cuerpo construye **exactamente cuatro** resultados
  —existencia insuficiente, unidad incompatible, receta sin lineas y desbordamiento— y los compara
  contra `[null, null, null, null]`. Nombre y cuerpo coinciden.
- «un producto sin lotes deja el pedido sin importe» **existe como caso propio**
  (`order-cost.test.ts:383`) y su cuerpo lo prueba: linea de `PRODUCT_A` con lotes solo de
  `PRODUCT_B`, `expect(resultado).toBeNull()`. No se perdio cobertura al sacarlo del caso de R9.
- El test de integracion que cita la fila de R9 **existe y se llama asi**:
  `tests/integration/pedidos/order-ingredients-cost.int.test.ts:388`, «un pedido anterior a la
  columna sigue sin importe (R8, R13)». Su cuerpo pone `ingredients_cost` a NULL por SQL crudo, lee
  ficha y listado, comprueba que siguen en `null` y que la lectura no reescribio nada.
- **R9 queda cubierto entero**: los cuatro caminos que la funcion pura puede producir, mas el
  quinto —pedido anterior a la columna, que es un estado de la fila y no un camino del calculo—,
  en integracion.
- El mapa de `specs/.../tasks.md` (fila R9) y el de `progress/impl_QC-123.md` dicen **lo mismo**,
  palabra por palabra, y los nombres coinciden con los tests reales.
- Alineados tambien la docstring de `lib/modules/pedidos/domain/order-cost.ts:186-189` y el
  fragmento de `design.md > 2`.

### 4. La vuelta no cambio comportamiento — confirmado por diff

`git diff 80d18e37..HEAD` toca 7 archivos y **ni una sola linea ejecutable de produccion**:
`order-cost.ts`, `update-order.ts` y `order-repository.ts` solo en docstrings; `tasks.md`,
`design.md`, `progress/impl_QC-123.md` y `progress/review_QC-123.md` como documentacion; y
`order-cost.test.ts` solo en el nombre de un caso y en retirar de ese caso la comparacion que ya
tiene caso propio.

### 5. Gate

`./init.sh --rapido` verde sobre este tip segun el implementer (typecheck y lint verdes, 203/203
archivos, 3100 tests pasados con 6 skipped, 47/47 guardias con 588 tests). No lo repito porque el
delta es documental, pero **si corri yo** `npx vitest run tests/unit/pedidos/order-cost.test.ts`
sobre `015593c6`: **22/22 verdes**. En la primera vuelta corri el rapido completo yo mismo sobre
`80d18e37` y salio verde.

---

## Checklist (consolidado)

### Especificacion
- [x] `requirements.md` con `R1`-`R26` en EARS, cada uno citando su `[D<n>]`.
- [x] `design.md` con seis alternativas descartadas y su porque (`> 8`).
- [ ] `tasks.md` con **todas** las tasks `[x]`: **T11 sigue sin marcar**. Ver menor 1: lo cierra el
      leader con el gate completo y el PR. **No es bloqueante.**

### Trazabilidad
- [x] Los 26 `R<n>` mapean a un test que **existe**, se **llama** como dice el mapa y cuyo **cuerpo
      prueba el requisito**. Verificados uno a uno en la primera vuelta leyendo el cuerpo, no el
      nombre: R1 `order-view.test.ts:136` + `order-cost.test.ts:57`; R2 `:71`; R3 `:84`, `:101` +
      `product-catalog-costing.test.ts:68`; R4 `:118`; R5 `:138`; R6 `:155`; R7 `:169`; R8 `:181`,
      `:193`, `:205`, `:211` + `int:388`; R9 `:234` + `int:388`; R10 `create-order.test.ts:273` +
      `int:301`; R11 `update-order.test.ts:286` + `int:323`; R12 `list-orders.test.ts:620` +
      `int:357`; R13 `orders-ingredients-cost-migration.test.ts:99` + `int:388`;
      R14 `order-service.test.ts:321` + `int:446`; R15 `list-assigned-orders.test.ts:374`,
      `get-assigned-order-execution.test.ts:276`, `permissions.test.ts:193`;
      R16 `pedidos-schema.test.ts:680`; R17 `list-orders.test.ts:654`;
      R18 `order-columns.test.tsx:322`; R19 `:265`; R20 `pedidos-schema.test.ts:660` +
      `orders-ingredients-cost-migration.test.ts:131`; R21 `int:427`; R22 `int:470` +
      `product-catalog-costing.test.ts:89`; R23 `create-order.test.ts:320`,
      `update-order.test.ts:353`; R24 `:280` + `create-order.test.ts:340` + `int:504`;
      R25 `:293`, `:310`; R26 `:327`, `:341`.
- [x] **Sin desalineaciones rotulo/cuerpo pendientes.** La unica que quedaba (menor 2) se corrigio
      en `015593c6` y esta verificada arriba, punto 3.
- [x] `tasks.md` y `progress/impl_QC-123.md` dicen lo mismo en la fila de R9.

### Calidad de codigo
- [x] Gate rapido verde (punto 5).
- [x] El `./init.sh` completo antes del PR queda declarado para el leader.
- [ ] E2E para flujo con importes (`CHECKPOINTS.md:19-20`): no hay. Cubierto por la decision cerrada
      `[D15]`, con motivo escrito y ficha destino QC-122. **No es hallazgo.**
- [x] Multiplataforma: **no aplica**; la ficha no anade ni toca ningun componente.
- [x] **Ninguna dependencia nueva**: `package.json`, `pnpm-lock.yaml` y `docs/dependencias.md` no
      aparecen en el diff. `design.md > 2.1` justifica la aritmetica con `BigInt`.

### Datos y seguridad
- [x] No nace tabla: una columna opcional en `orders`, que ya tiene `company_id` y RLS.
- [x] Aislamiento por empresa en la consulta nueva (`findAliveBatchesWithStock` compone
      `batchCompanyScope`), con test de acceso cruzado rechazado y control positivo (`int:427`).
- [x] Permisos validados en el service y con test (R23, R14).
- [x] Migracion versionada con su `down.sql`.
- [x] Sin secretos, sin webhooks.

### Modulos hexagonales
- [x] No nace puerto `pedidos -> inventario`: `inventario` amplia su `ProductCatalog` publicado.
- [x] Sin rutas profundas; 47/47 guardias verdes.
- [x] La logica de negocio vive en `domain/order-cost.ts`.

### Comentarios (`docs/conventions.md > Comentarios`)
- [x] **Ninguna cita de ficha/requisito en lineas de produccion que la rama escribe** (barrido
      propio, punto 2). Los dos bloqueantes de la primera vuelta, cerrados.

---

## Hallazgos

### BLOQUEANTE 1 (CERRADO en `015593c6`) - cita `QC-35bis` en `update-order.ts`
Resuelto conservando el motivo. Punto 1.

### BLOQUEANTE 2 (CERRADO en `015593c6`) - cita `R20` en `order-repository.ts`
Resuelto. Punto 1.

### menor 1 - `T11` sin marcar en `tasks.md`
`## T11 - Cierre` es la unica sin `[x]`. Coherente con la bitacora: se marca cuando el leader cierre
con `./init.sh` completo y abra el PR. **No cuenta como bloqueante.**

### menor 2 (CERRADO) - el rotulo del caso de R9
Corregido y verificado (punto 3).

### menor 3 - `INTERNAL_SCALE` duplica `CONVERSION_SCALE` y nada avisa si divergen
Sigue en pie. `order-cost.ts:28` declara `INTERNAL_SCALE = 12`; el valor vive en
`unidades/domain/convert-quantity.ts:34` y el barrel no lo exporta. Puede romperse en silencio y el
codigo no lo advierte; el dano acotado es perdida de precision por debajo del redondeo final a
cuatro decimales, por eso es menor. La salida correcta es una ficha que exporte la constante por el
barrel y anada el test de igualdad.

### menor 4 - el motivo del importe en blanco no va a ningun log
Sigue en pie. No incumple ningun `R<n>`; lo que chirria es la frase en indicativo de
`design.md > 10.1`.

### menor 5 - el test de R22 en unidad es debil
Sigue en pie. `product-catalog-costing.test.ts:89` prueba por regex sobre un objeto construido en el
propio test; la garantia real la da `int:470`.

### menor 6 (nuevo) - «los cuatro caminos» es taxonomia de negocio, no de codigo
`order-cost.ts:186` y el caso `order-cost.test.ts:234` hablan de «los cuatro caminos/casos». Son los
cuatro **casos de negocio** de R8, y como tal es correcto y coincide con el cuerpo del test. En el
codigo hay algun `return null` mas, defensivo (`parseDecimal` que falla, `unitId` ausente del mapa),
no alcanzable desde los casos de uso porque zod valida las entradas. No pido cambiar nada: queda
anotado para que nadie lea «cuatro» como exhaustividad de ramas del codigo.

---

## Lo verificado en la primera vuelta y que sigue valiendo

- **Las dos guardias cerradas sin cambiar su criterio** (`959a54f7`, `aff9e441`):
  `guard-ambito-empresa-inventario` se **respeta**, no se esquiva —la propia guardia admite el
  camino usado, y el patron es preexistente del mismo archivo (`findProductRefs`, QC-50)—. Los dos
  censos se actualizaron con motivo redactado, no con comodin.
- **`pedidos` recupera `unidades`, pero NO la unidad del pedido**: `Order` solo gana
  `ingredientsCost`; `NewOrder`, `OrderRow` y `OrderView` no ganan ningun campo de unidad. Lo que
  vuelve es la dependencia `UnitCatalog`, consecuencia directa de `[D6]`.
- **La guarda de desbordamiento esta en el dominio, antes de escribir**, y no hay `catch` del
  `22003` en el adaptador. El pedido se crea igual aunque el importe no quepa.
- **Nunca 0 ni parcial**; **desempate de lote** como `[D18]`; **se convierte cantidad Y coste
  unitario** como `[D19]`; **se recalcula al escribir y no al leer** (vigilado por tipo y por
  Proxy); **solo se LEEN lotes** (`int:470` compara fotos de `product_batches` e
  `inventory_movements` antes y despues).

## Para el leader

1. `./init.sh` **completo** sobre la rama y marcar `T11 [x]` en `tasks.md` (menor 1).
2. Abrir el PR.
3. Menores 3, 4, 5 y 6 no bloquean esta ficha; el 3 y el 4 merecen ficha de seguimiento (exportar
   `CONVERSION_SCALE` por el barrel con su test de igualdad; alinear `design.md > 10.1` con lo que
   el codigo hace).
