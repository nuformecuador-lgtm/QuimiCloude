# QC-90 — alta-del-primer-lote · requirements.md

> **Zona:** `fullstack` · **Complejidad:** `medium` · **depends_on:** — ·
> **Rama:** `feature/QC-90-alta-del-primer-lote`
>
> **Alcance.** Al dar de alta un producto, el sistema crea **también su primer lote** en
> `product_batches` con lo que se escribe en el mismo panel: **presentación** (obligatoria),
> **costo** —unitario o total—, **lote** y **fecha de expiración**. Si el nombre elegido
> corresponde a un producto que **ya existe**, no se crea otro producto: se le **agrega el lote**,
> y el nombre, la existencia y la alerta que el panel muestre **no lo tocan**. Entra el camino
> completo: esquema de entrada, puerto, caso de uso, adaptador Prisma, Server Action y el
> formulario, que **ya está construido** y hoy no manda nada de esto al servidor.
>
> **Lo que NO entra.** El lote **correlativo autogenerado** y su unicidad **por empresa** →
> **QC-81**, que depende de `products.company_id` (**QC-49**). Que la existencia del producto pase
> a ser la **suma de sus lotes** —quitar `products.stock`, arreglar `recetas`, `pedidos` y el
> listado, y quitar el orden y el filtro por existencia— → **QC-91**, creada al acotar esta ficha y
> bloqueada por ella. **Corregir** una existencia mal cargada con un **ajuste de inventario** →
> **QC-92**, creada al acotar esta ficha y bloqueada por QC-91. **Listar, editar y borrar lotes** →
> **no existe ficha y no se crea aquí**: nace el día que alguien lo pida.
>
> Sembrado por `/afinar-feature` el 2026-09-10. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

> Notación EARS (`docs/specs.md`). **«El sistema»** aquí es el módulo **`inventario`** —su esquema
> de entrada del lote, su puerto, su caso de uso y su adaptador Prisma—, la **Server Action** del
> alta y el **panel de alta de producto** de `app/(private)/inventario/`.
>
> **La tabla `product_batches` YA EXISTE y no se re-especifica**: la creó la migración
> `20260909120000_product_batches` el 2026-09-09, con `presentation_id` obligatorio, `stock` NOT
> NULL con `CHECK >= 0`, `unit_cost` `DECIMAL(14,4)` NOT NULL con `CHECK > 0`, `lot` y
> `expiry_date` anulables, la autoría (`created_by`/`updated_by`) y RLS activado y forzado sin
> policies. **Esta ficha no añade ninguna columna ni ninguna migración.**
>
> **El formulario ya está construido** (2026-09-10, sin conexión al back): pinta los cinco campos
> con su ayuda, valida en el cliente la regla de los dos costos y conserva lo escrito tras un
> rechazo. Lo que le falta es que esos campos **viajen** y que el servidor los valide igual.

### El lote siempre se crea

**R1.** CUANDO se confirma el alta de producto, el sistema DEBE crear **exactamente un** lote en
`product_batches` asociado al producto resultante. No DEBE existir ningún camino del alta que
termine con producto y sin lote.

**R2.** El sistema DEBE exigir la **presentación** en el alta. SI la presentación falta o no es
un identificador con forma de uuid, ENTONCES el sistema DEBE rechazar el alta con el código
`invalid_input`, señalando el campo `presentationId`, y NO DEBE escribir ni el producto ni el lote.

**R3.** MIENTRAS la existencia escrita sea `0`, el sistema DEBE crear el lote igualmente, con
`stock` `0`. Una existencia de `0` no es motivo de rechazo por sí sola.

### El costo

**R4.** El sistema DEBE aceptar cada importe **únicamente como cadena decimal** de hasta 10
dígitos enteros y hasta 4 decimales, sin signo (la forma exacta de `decimal(14,4)`), y DEBE
rechazar con `invalid_input` cualquier otra forma. El sistema NO DEBE convertir ningún importe a
número de coma flotante en ningún punto del camino —formulario, Server Action, esquema, caso de
uso ni puerto—.

**R5.** El sistema DEBE rechazar con `invalid_input` todo importe cuyos dígitos sean **todos
cero** (`0`, `0.0`, `0.0000`), señalando el campo del importe recibido.

**R6.** SI el alta trae **costo unitario**, ENTONCES el sistema DEBE guardar el lote con ese costo
unitario tal cual, con sus 4 decimales.

**R7.** SI el alta trae **solo el costo total**, ENTONCES el sistema DEBE **derivar** el costo
unitario como `costo total / existencia`, redondeado a **4 decimales**, y guardar el lote con el
valor derivado. La derivación DEBE ser exacta: NO DEBE pasar por coma flotante.

**R8.** SI el alta trae solo el costo total y la existencia es `0` o está ausente, ENTONCES el
sistema DEBE rechazar el alta con `invalid_input` **señalando el campo de la existencia** —el
mensaje pide una existencia de 1 o más— y NO DEBE escribir nada.

**R9.** SI el costo unitario derivado en R7 redondea a `0.0000`, ENTONCES el sistema DEBE rechazar
el alta con `invalid_input` señalando el campo del costo total, y NO DEBE intentar la escritura.

**R10.** SI el alta trae los **dos** costos, ENTONCES el sistema DEBE guardar el **costo unitario**
recibido e **ignorar** el costo total, sin rechazar el alta y sin comprobar que uno concuerde con
el otro. (Ver pregunta abierta 4.)

**R11.** SI el alta no trae ninguno de los dos costos, ENTONCES el sistema DEBE rechazar el alta
con `invalid_input` señalando **los dos** campos de costo, y NO DEBE escribir nada.

### Lote, vencimiento y existencia

**R12.** El sistema DEBE tratar el **lote** y la **fecha de expiración** como opcionales: cuando
llegan vacíos o ausentes, el lote se crea con esas dos columnas en `NULL`.

**R13.** CUANDO el alta trae una fecha de expiración, el sistema DEBE guardar **la misma fecha
civil** que se escribió, sin corrimiento por zona horaria ni por hora del día.

**R14.** CUANDO el alta trae un lote, el sistema DEBE guardarlo tal cual tras recortar los espacios
de los extremos, y DEBE rechazar con `invalid_input` un lote de más de 60 caracteres una vez
recortado.

### Producto nuevo frente a producto que ya existe

**R15.** El sistema DEBE decidir si el producto ya existe **por el nombre normalizado** del alta
—con la única definición del módulo, `normalizeProductName`— consultando los productos **vivos**,
no por una restricción de la base ni por un identificador que envíe el navegador.

**R16.** CUANDO el nombre normalizado del alta **no** corresponde a ningún producto vivo, el
sistema DEBE crear el producto con el nombre, la existencia y la alerta escritos, y DEBE escribir
**esa misma existencia** también en el lote.

**R17.** CUANDO el nombre normalizado del alta corresponde a un producto **vivo**, el sistema DEBE
agregarle el lote a ese producto y NO DEBE crear otro producto.

**R18.** MIENTRAS se agrega un lote a un producto que ya existe, el sistema NO DEBE modificar
`name`, `stock`, `qty_alert` ni `unit_id` de ese producto: la existencia, el nombre y la alerta
escritos en el panel se ignoran, y la existencia del producto **queda como estaba**.

**R19.** SI el nombre normalizado del alta solo coincide con productos **borrados lógicamente**,
ENTONCES el sistema DEBE crear un producto nuevo: no revive el borrado ni le agrega el lote.

**R20.** SI más de un producto vivo comparte el nombre normalizado del alta, ENTONCES el sistema
DEBE elegir siempre el mismo —el de creación más antigua, desempatando por identificador
ascendente— y agregarle el lote a ese. (Ver pregunta abierta 5.)

### Escritura, autoría y autorización

**R21.** El sistema DEBE escribir el producto y su primer lote **en una sola transacción**: si
falla cualquiera de las dos escrituras, no DEBE quedar ninguna de las dos.

**R22.** CUANDO el sistema crea un lote, DEBE registrar en `created_by` y en `updated_by` el
identificador del **actor de la sesión**.

**R23.** SI el actor no está autenticado o no tiene el permiso `inventario.modificar`, ENTONCES el
sistema DEBE rechazar con `unauthorized` **antes** de validar la entrada y **antes** de tocar el
puerto de datos, sin escribir nada.

**R24.** El sistema DEBE revalidar en el **servidor**, con el **mismo esquema** que usa el
formulario, todos los campos del producto y del lote; una entrada con un campo desconocido DEBE
rechazarse con `invalid_input` en vez de ignorarse en silencio.

### Panel de alta

**R25.** CUANDO se confirma el alta desde el panel, el formulario DEBE hacer viajar al servidor la
presentación, el costo unitario, el costo total, el lote y la fecha de expiración escritos.

**R26.** MIENTRAS el panel esté en modo **edición**, el sistema NO DEBE pedir ni enviar ningún
campo de lote, y la edición NO DEBE crear ni modificar ningún lote.

**R27.** El panel DEBE rechazar un costo de `0` con el mismo criterio que el servidor (R5) y DEBE
pintar cada rechazo en **su** campo, incluida la existencia de R8.

**R28.** CUANDO el servidor rechaza el alta, el panel DEBE seguir abierto y conservar lo escrito en
los cinco campos del lote.

### Límites de esta ficha

**R29.** El sistema NO DEBE añadir ninguna columna ni ninguna migración: `product_batches` queda
tal como la dejó `20260909120000_product_batches`, con su RLS activado y forzado y sin policies.

**R30.** El sistema NO DEBE ofrecer ninguna operación de **listar**, **editar** ni **borrar**
lotes: el contrato público de `inventario` no expone ninguna de las tres.

**R31.** El listado de productos NO DEBE devolver presentación, así que al elegir un producto
existente en el autocomplete el selector de presentación queda **vacío** y se elige a mano.

**R32.** CUANDO un usuario con permiso completa el alta desde el navegador con presentación y
**solo costo total**, el sistema DEBE terminar con el producto y un lote cuyo costo unitario es el
**derivado** de R7, comprobado sobre el camino completo (navegador → Server Action → base).

## Preguntas abiertas

1. **Moneda del costo** (pregunta abierta n.º 5 del dominio, `docs/architecture.md`). Es el primer
   importe que `inventario` vuelve a guardar desde que QC-52 le quitó el costo al producto. QC-14 y
   QC-42 cerraron que la moneda es **implícita y no se guarda** porque el ERP era de un solo
   tenant, y esa premisa ya no vale. **No se rellena con un supuesto**: la cierra la primera ficha
   de aislamiento que toque importes.
2. **La trazabilidad por lote queda a medias** (pregunta abierta n.º 2 del dominio). Esta ficha
   **guarda** lote y fecha de vencimiento, pero **nada los consume todavía**: no hay pantalla que
   los liste, ni consumo que elija de qué lote sale lo que se despacha, ni aviso por vencimiento.
   La pregunta del dominio no se cierra aquí.
3. **Qué pasa con un lote cuyo producto se borra** (el borrado del producto es lógico y la FK es
   `RESTRICT`). No se toca en esta ficha porque el borrado lógico no dispara el `RESTRICT`, pero
   nadie decidió si un producto borrado debe ocultar sus lotes.

> Las dos siguientes las abre `spec_author` (F1.2): son huecos que la tabla de decisiones no
> cubre y que el spec **no puede dejar sin respuesta** sin volverse inimplementable. Cada una
> lleva ya su respuesta **propuesta** escrita como requisito, para que la puerta de aprobación
> (F1.4) sea un sí —o un cambio de una línea— y no una ronda entera.

4. **Vienen los dos costos a la vez.** El panel deja escribir el unitario **y** el total, y la
   tabla solo cerró qué pasa cuando viene uno. **Propuesta, escrita en R10**: prevalece el
   **unitario** —es la columna que se guarda— y el total se ignora, sin comparar uno con otro. La
   alternativa era rechazar cuando no concuerdan, y se descartó porque `total / existencia`
   redondea a 4 decimales: una discrepancia de un céntimo por redondeo sería un rechazo que el
   usuario no puede corregir.
5. **Dos productos vivos con el mismo nombre.** `products.name` **no es único** en la base, así
   que R15 puede encontrar más de un candidato. **Propuesta, escrita en R20**: se elige el más
   antiguo, con desempate por identificador, para que la elección sea siempre la misma. Rechazar
   el alta sería más seguro para el dato y dejaría al usuario sin salida desde el panel; que el
   navegador mande el identificador del producto elegido lo resolvería mejor, pero eso ya es
   trazabilidad de lote y la pregunta abierta 2 la mantiene sin cerrar.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-09-10 | ¿La presentación es obligatoria en el alta? | **Sí.** Es del **lote**, no del producto —se mudó el 2026-09-09—, así que solo se pide al dar de alta; la edición del producto no la muestra |
| 2026-09-10 | ¿Costo unitario o costo total? | **Uno de los dos, y basta con uno.** Si solo viene el total, el unitario se **deriva** como `total / existencia` a **4 decimales** |
| 2026-09-10 | Solo costo total y existencia 0 o vacía | **Se rechaza pidiendo existencia ≥ 1**, y el error se pinta en el campo de existencia: no hay costo unitario posible y la columna es NOT NULL |
| 2026-09-10 | ¿Un costo de 0 es válido? | **No.** La tabla tiene `CHECK (unit_cost > 0)` desde el 2026-09-09. **El front hoy acepta 0 y hay que alinearlo** |
| 2026-09-10 | Tipo y precisión del importe | **`decimal(14,4)`, nunca `float`**, y viaja a la operación como **cadena decimal**. Heredado de **QC-14**, **QC-24**, **QC-33** y **QC-26** |
| 2026-09-10 | ¿Lote y fecha de expiración son obligatorios? | **No**, los dos son opcionales. Las columnas ya son anulables |
| 2026-09-10 | ¿El alta puede crear un producto sin lote? | **No. El alta SIEMPRE crea lote**, aunque la existencia sea 0 —el `CHECK` del stock admite 0— |
| 2026-09-10 | Se elige un producto que ya existe en el autocomplete | **Se le agrega un lote**; no se crea otro producto. El nombre, la existencia y la alerta escritos en el panel **se ignoran**: editar el producto es otra acción |
| 2026-09-10 | Consecuencia aceptada de la anterior | Mientras **QC-91** no exista, agregar un lote a un producto que ya existe **NO cambia la existencia de ese producto** |
| 2026-09-10 | ¿Quién manda en la existencia? | **El lote.** `products.stock` se quita y la existencia pasa a ser la suma de los lotes — pero **eso es QC-91**. Aquí la existencia se escribe **en el lote Y también en el producto**, transitoriamente |
| 2026-09-10 | Autoría del lote | `created_by` = **actor de la sesión**. Es para lo que la migración del 2026-09-09 mudó esas columnas desde `products` |
| 2026-09-10 | Dónde se autoriza | **En el service**, con **`inventario.modificar`**, antes de zod y antes de tocar el puerto. Heredado de **QC-20** (`docs/architecture.md > Acceso a datos y autorizacion`) |
| 2026-09-10 | Idioma de los identificadores y borrado | Identificadores de base **en inglés**; el borrado del producto sigue siendo **lógico**. Heredado de la **feature 4** y **QC-14**. Esta ficha no borra lotes |
| 2026-09-10 | ¿Hace falta E2E? | **Sí.** `CHECKPOINTS.md` lo pide para movimientos de inventario e importes, y esto es las dos cosas: alta con presentación y costo total, y verificación de que el lote quedó con su **costo unitario derivado** |
