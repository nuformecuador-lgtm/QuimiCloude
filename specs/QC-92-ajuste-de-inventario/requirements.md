# QC-92 — ajuste-de-inventario · requirements.md

> **Zona** `fullstack` · **Complejidad** `high` · **depends_on** `QC-91` ·
> **Rama** `feature/QC-92-ajuste-de-inventario`
>
> ## Alcance
>
> Corregir la existencia de un **lote** registrando un **movimiento** que suma o resta, en vez de
> sobrescribir un número a ciegas. Nace una tabla de movimientos de inventario —que hoy **no
> existe**— y el alta de lote pasa a asentar también en ella. El producto gana un panel que
> **lista sus lotes** —hoy no hay ninguna pantalla que los muestre— y que despliega el historial
> de cada uno.
>
> ## Lo que NO entra
>
> - **Consumo por lote** —qué lote sale al despachar— y **aviso de lotes por vencer**: las dos
>   siguen abiertas en `docs/architecture.md > Preguntas abiertas del dominio`, 2. **Sin ficha y a
>   propósito**: no se diseñan a ciegas.
> - **Pantalla propia de ajustes** con búsqueda e histórico global: no se construye.
> - **Convertir entre unidades** → **QC-63**, único consumidor de la conversión de QC-76.
> - **La unidad como identidad del ítem** (y el retorno de `products.stock` como columna) →
>   **QC-121**.
>
> _Sembrado por `/afinar-feature` el 2026-09-17. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`._

## Requisitos (EARS)

> **Cómo leer las citas.** Cada requisito cita entre corchetes la fila de `## Decisiones cerradas`
> que lo origina, numeradas **por orden de la tabla**: `[D1]` es «¿Sobre qué se ajusta?» y `[D16]`
> «¿Librería?». Son **16 filas**, contadas sobre la tabla de abajo. Las decisiones que no nacen de
> una fila —aislamiento por empresa, migración reversible, catálogo de errores— citan el documento
> del arnés que las impone.

### El ajuste: qué corrige y sobre qué

**R1.** CUANDO se confirma un ajuste de existencia, el sistema DEBE aplicarlo **a un único lote
identificado**, y NO DEBE modificar la existencia de ningún otro lote, ni repartir la corrección
entre lotes, ni escribir ninguna existencia en el producto `[D1]` `[D11]`.

**R2.** El sistema DEBE recibir el ajuste como una **cantidad entera con signo** —lo que suma o lo
que resta—, y NO DEBE aceptar el nuevo total del lote como entrada `[D1]` `[D14]`.

**R3.** SI la cantidad del ajuste es **cero**, no es un entero, o falta, ENTONCES el sistema DEBE
rechazar la operación antes de tocar el repositorio y NO DEBE escribir ni el asiento ni la
existencia `[D14]`.

**R4.** SI el ajuste dejaría la existencia del lote **por debajo de cero**, ENTONCES el sistema DEBE
rechazarlo y NO DEBE quedar escrito ni el asiento ni el cambio de existencia `[D10]`.

**R5.** El sistema DEBE dejar **intacto** el `CHECK (stock >= 0)` de `product_batches`: ninguna
migración de esta ficha DEBE alterarlo, eliminarlo ni recrearlo con otra condición, y la base DEBE
seguir rechazando por su cuenta un `stock` negativo escrito por cualquier vía `[D10]`.

**R6.** CUANDO un ajuste es válido, el sistema DEBE, **en una sola transacción**, actualizar
`product_batches.stock` del lote y escribir **exactamente un** asiento en `inventory_movements`; y
SI cualquiera de las dos escrituras falla, ENTONCES NO DEBE quedar ninguna de las dos `[D2]` `[D3]`
`[D12]`.

**R7.** El sistema DEBE seguir leyendo **toda** existencia de `product_batches.stock`, y NO DEBE
derivar, calcular ni corregir ninguna existencia sumando `inventory_movements` `[D3]`.

### El motivo

**R8.** CUANDO se registra un **ajuste**, el sistema DEBE exigir un **motivo** del conjunto cerrado
—merma, rotura, conteo físico, error de carga—; SI el motivo falta o no pertenece al conjunto,
ENTONCES DEBE rechazar la operación sin escribir nada `[D5]`.

**R9.** El sistema DEBE declarar ese conjunto en **una sola definición**, y añadirle un valor NO
DEBE requerir migración alguna ni modificar ninguna fila ya persistida: los asientos escritos con
los motivos anteriores DEBEN seguir leyéndose y agrupándose igual `[D5]`.

**R10.** El sistema NO DEBE exigir ni escribir motivo en el asiento del **alta de lote**; MIENTRAS
el asiento sea de alta, su motivo DEBE quedar ausente `[D4]` `[D5]`.

### El libro

**R11.** El sistema DEBE registrar cada movimiento en `inventory_movements` —tabla nueva— con, como
mínimo: **qué lote**, **cuánto sumó o restó** (entero con signo), **de qué clase es el asiento**
(alta o ajuste), **el motivo** (ausente en el alta), **quién** lo hizo, **cuándo** y **de qué
empresa** es `[D2]` `[D4]`.

**R12.** CUANDO el alta escribe un lote —tanto al crear el producto como al añadir un lote a un
producto que ya existe—, el sistema DEBE escribir su asiento en la **misma transacción** que el
lote, con la existencia inicial como cantidad y sin motivo; y SI el asiento falla, ENTONCES el lote
tampoco DEBE quedar escrito `[D4]`.

**R13.** El sistema NO DEBE registrar consumo de lote ni añadir ningún camino que lo consuma: el
libro cubre alta y ajuste y nada más `[D4]` `[D11]`.

**R14.** El sistema NO DEBE escribir asientos retroactivos: ninguna migración ni proceso de esta
ficha DEBE crear asientos para lotes existentes antes de ella `[D9]`.

**R15.** El sistema NO DEBE modificar ni borrar un asiento ya escrito: `inventory_movements` solo
admite altas, y ni la aplicación ni ninguna migración de esta ficha DEBEN ofrecer una vía de
`UPDATE` o `DELETE` sobre él `[D14]`.

**R16.** El sistema NO DEBE borrar ningún lote ni añadir marca de borrado a `product_batches`, y
DEBE nombrar en **inglés** y `snake_case` toda tabla, columna y restricción nueva `[D14]`.

### Empresa y permiso

**R17.** `inventory_movements` DEBE nacer con su **columna de empresa** obligatoria, su clave
foránea a `companies`, su índice, y con RLS **activada y forzada** sin policies, siguiendo el molde
ya construido para `product_batches` (QC-49) y `recipes` (QC-50)
(`docs/architecture.md > Dominio` n.º 1, `CHECKPOINTS.md > Datos y seguridad`).

**R18.** Toda lectura y toda escritura del libro DEBE filtrar por la empresa del actor, tomada de la
sesión del servidor y **nunca** de la entrada; y CUANDO se pide ajustar o listar el historial de un
lote de **otra** empresa, el sistema DEBE responder como si el lote no existiera, sin distinguirlo
de uno inexistente (`docs/architecture.md > Acceso a datos y autorizacion`).

**R19.** SI la empresa de un asiento no coincide con la del lote al que apunta, ENTONCES la **base**
DEBE rechazar la escritura, con el mismo mecanismo con que `product_batches_check_company` rechaza
hoy el lote cuya empresa no coincide con la de su producto.

**R20.** El sistema DEBE validar el permiso **`inventario.modificar` en el service**, como primera
línea del caso de uso —antes de validar la entrada y antes de tocar el repositorio—; y SI el actor
no lo trae —el Operador, que solo tiene `inventario.consultar`—, ENTONCES DEBE rechazar con el error
de autorización y NO DEBE escribir ni leer nada `[D6]`.

**R21.** El sistema DEBE exigir **`inventario.consultar`** para listar los lotes de un producto y su
historial; MIENTRAS el actor solo tenga `inventario.consultar`, DEBE poder ver el panel y el
historial y NO DEBE poder ajustar `[D6]` `[D7]` `[D8]`.

### La pantalla

**R22.** CUANDO se abre un producto desde el listado de inventario, el sistema DEBE ofrecer un panel
que **lista sus lotes**, cada uno con su número de lote, su cantidad y su fecha de compra `[D7]`.

**R23.** CUANDO se despliega un lote del panel, el sistema DEBE mostrar sus movimientos con
**motivo, autor y fecha**, del más reciente al más antiguo `[D8]`.

**R24.** SI un lote no tiene ningún asiento —porque es anterior a esta ficha—, ENTONCES el historial
DEBE decirlo con un texto propio que lo explique, y NO DEBE presentarse como una lista vacía
indistinguible de un fallo de carga `[D8]` `[D9]`.

**R25.** El panel, el despliegue del historial y el formulario del ajuste DEBEN cumplir la regla
multiplataforma: alto de pantalla con `dvh`, ningún `:hover` como única vía de activación, objetivos
táctiles de al menos 44x44 px y `font-size` de al menos 16 px en los campos de entrada
(`docs/architecture.md > Componentes > Regla: multiplataforma`).

### Las guardias

**R26.** El sistema DEBE **ajustar** la guardia R21 de QC-91
(`tests/unit/inventario/qc91-alcance.test.ts`) con una **nota fechada** que diga qué ficha la
cambió y por qué: tras el ajuste DEBE seguir prohibiendo `delete`, `deleteMany`, `upsert` y el
`DELETE`/`UPDATE` crudo sobre `product_batches`, y DEBE admitir `productBatch.update(...)`
**solo** en la función nombrada que aplica el ajuste `[D13]`.

**R27.** La guardia ajustada de R26 DEBE probarse **por mutación**, sobre fuentes fabricadas: DEBE
quedar demostrado que sigue dando rojo ante un `update` escrito fuera de la función admitida y ante
un borrado o un SQL crudo, y que da verde ante el ajuste legítimo `[D13]`.

**R28.** DEBE existir una **guardia** que se ponga roja si algún camino de escritura de
`product_batches` bajo `lib/` cambia una existencia **sin** escribir su asiento en la misma
transacción; y esa guardia DEBE afirmar el censo **en positivo** —la lista nombrada de caminos de
escritura—, no la ausencia de un patrón `[D12]`.

**R29.** DEBE existir una comprobación de **cuadre** que verifique, para todo lote creado a partir
de esta feature, que su existencia es igual a la suma de sus asientos; y esa comprobación DEBE
declarar **por escrito y de forma permanente** la excepción de los lotes anteriores a esta ficha,
que no tienen asiento y nunca lo tendrán `[D9]` `[D12]`.

**R30.** El sistema DEBE dejar escrito, junto a la excepción de R29, que el cuadre **no cubre** los
lotes anteriores y que lo que los cubre es la guardia de R28: la excepción NO DEBE quedar como una
línea de configuración sin razón `[D9]` `[D12]`.

### Migración, errores, dependencias y E2E

**R31.** La migración que crea `inventory_movements` DEBE traer su **`down.sql`**, que revierte
exactamente lo que hace el `migration.sql`, y `pnpm run db:rollback` DEBE dejar `_prisma_migrations`
coherente (`docs/architecture.md > Migraciones up/down`).

**R32.** SI el ajuste necesita códigos de error que el catálogo cerrado no tiene, ENTONCES DEBEN
declararse como **enmienda** escrita y fechada en `lib/modules/errores/domain/error-codes.ts` —como
hizo la sexta enmienda con `batch_duplicate_lot`—, y NO DEBEN añadirse sin la aprobación humana de
la puerta F1.4.

**R33.** El sistema NO DEBE añadir ninguna dependencia nueva a `package.json` `[D16]`.

**R34.** DEBE existir un test **E2E (Playwright)** que recorra el ajuste extremo a extremo —abrir el
panel de lotes, ajustar con motivo, ver el asiento en el historial—; y como `init.sh` **no** corre
Playwright, el spec y las tasks DEBEN dejar escrito que ese E2E **se corre a mano** y que el gate en
verde no lo acredita `[D15]`.

## Preguntas abiertas

**Ninguna.** Las cinco que la ficha traía escritas —sobre qué se ajusta, el motivo, el permiso, si
era tabla nueva, y el negativo con los lotes consumidos— se cerraron el 2026-09-17 y están abajo.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-09-17 | ¿Sobre qué se ajusta? | **Sobre un lote concreto**, no sobre el producto. El error se cargó en un lote y se corrige ahí. Evita inventar una **regla de reparto entre lotes**, que es la pregunta 2 del dominio y sigue abierta: decidirla aquí sería decidir para todo el ERP |
| 2026-09-17 | ¿Queda historial? | **Sí: tabla nueva `inventory_movements`**, con qué lote, cuánto sumó o restó, quién y cuándo |
| 2026-09-17 | ¿El lote se modifica? | **Sí.** `product_batches.stock` **sigue siendo el número de verdad**; el movimiento es el historial que explica cómo llegó ahí. La existencia se lee de **un solo sitio** y el `CHECK (stock >= 0)` sigue protegiendo de verdad. Se descartó dejar el lote inmutable y derivar la existencia de lote + movimientos: habría dejado la existencia repartida en dos sitios y el CHECK sin poder garantizar el total |
| 2026-09-17 | ¿Qué registra el libro? | **Todo movimiento de inventario, incluida el alta de lote**: el alta de **QC-90** gana su asiento. **El consumo NO**: no existe todavía y no se diseña a ciegas. Se eligió a sabiendas de que cuesta más que registrar solo ajustes |
| 2026-09-17 | ¿Motivo? | **Obligatorio en los ajustes**, de un **conjunto cerrado que crece sin migrar** lo ya guardado —merma, rotura, conteo físico, error de carga—. Mecanismo **heredado del tipo de documento de la feature 4** (su R10: añadir un valor no obliga a tocar ninguna fila ya persistida). Se descartó el texto libre porque el historial dejaría de poder agruparse. **El asiento de alta no lleva motivo** |
| 2026-09-17 | ¿Permiso? | **`inventario.modificar`. Sin permiso nuevo.** El Administrador lo tiene y el Operador **no** —solo `inventario.consultar`—. Validado **en el service**, con su test (`docs/architecture.md > Acceso a datos y autorizacion`, `CHECKPOINTS.md`) |
| 2026-09-17 | ¿Dónde se ajusta? | **En el listado de inventario**: el producto abre un **panel con sus lotes** —número, cantidad, fecha de compra— y cada uno se corrige ahí. Resuelve de paso que hoy **no hay forma de ver los lotes de un producto**, que es lo que hace falta para poder elegir cuál está mal |
| 2026-09-17 | ¿Se ve el historial? | **Sí**: el lote despliega sus movimientos con **motivo, autor y fecha**. Si nadie puede verlo, el libro existe solo para la base de datos |
| 2026-09-17 | ¿Los lotes ya existentes entran al libro? | **No. El libro empieza hoy**, sin asientos retroactivos. **Consecuencia aceptada y que hay que ESCRIBIR, no descubrir**: la comprobación de que el libro cuadra con el `stock` necesita una **excepción permanente** para los lotes anteriores a esta feature |
| 2026-09-17 | ¿Puede quedar en negativo? | **No.** Heredado: el `CHECK (stock >= 0)` de `product_batches`, que existe desde que nació la tabla, es la **garantía dura** y no se toca |
| 2026-09-17 | ¿Y los lotes ya consumidos? | **No existen.** Nada consume lotes todavía —es la mitad abierta de la pregunta 2 del dominio—, así que no hay caso que resolver |
| 2026-09-17 | Riesgo declarado del diseño | **El libro y el `stock` pueden divergir** si algún camino de escritura olvida su asiento. Se cierra con una **guardia que lo vigile**: es **requisito de esta ficha**, no deuda para después |
| 2026-09-17 | La guardia R21 de QC-91 | **Hay que ajustarla, y deliberadamente.** Hoy `tests/unit/inventario/qc91-alcance.test.ts` afirma que `product-prisma.ts` **nunca** hace `productBatch.update(...)` —solo `create`—, y esta ficha lo necesita. **No se toca en silencio**: se ajusta con nota fechada y se prueba por mutación, como se hizo con la guardia de `recetas-ui` en QC-91 |
| 2026-09-17 | Enteros, borrado, idioma | Heredados: existencia **entera** (QC-14); **borrado lógico** e **identificadores en inglés** (feature 4). **Esta ficha no borra lotes** |
| 2026-09-17 | ¿Hace falta E2E? | **Sí**: es movimiento de inventario (`CHECKPOINTS.md`). **Aviso: `init.sh` NO corre Playwright** —deuda conocida, `docs/verification.md`—, así que el E2E se corre **a mano** y no basta con el gate en verde |
| 2026-09-17 | ¿Librería? | **Ninguna nueva** |
