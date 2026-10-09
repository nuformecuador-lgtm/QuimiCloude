# QC-219 — datos-de-lote-en-acondicionamiento · requirements.md

> Zona: fullstack · Complejidad: — (la asigna el leader en F1.0) · depends_on: QC-218 · Rama: feature/QC-219-datos-de-lote-en-acondicionamiento
>
> **Alcance.** En el detalle de un pedido en acondicionamiento, por cada línea de presentación
> (cada una es un lote de producto terminado, QC-170), se escriben el **lote**, la **fecha de
> vencimiento** y el **día de producción**. El lote sustituye al automático en el inventario.
> Terminar exige los tres datos en todas las líneas. Se pueden corregir después de entregado.
>
> **Lo que NO entra.** Reservar o consumir por vencimiento (QC-196). El lote real que usa el
> operador (QC-197). Avisos por vencer.
>
> Sembrado por `/afinar-feature` el 2026-10-06. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

> Notación EARS (`docs/specs.md`). Cada requisito cita entre corchetes las filas de «Decisiones
> cerradas» que lo originan, numeradas en el orden de la tabla:
>
> - **[D1]** el lote reemplaza al automático · **[D2]** uno por línea · **[D3]** único en la
>   empresa · **[D4]** qué fechas valen;
> - **[D5]** el vencimiento va en el lote · **[D6]** solo después de Comenzar y solo quien comenzó
>   · **[D7]** obligatorios para terminar · **[D8]** corrección después de entregado;
> - **[D9]** autorización en el service · **[D10]** avanza la pregunta abierta del dominio ·
>   **[D11]** E2E · **[D12]** dependencia;
> - **[D13]** pestaña «Entregados» para corregir un `ENTREGADO` · **[D14]** el día de producción va
>   en el lote · **[D15]** sin migración de datos y casos sin lote · **[D16]** «hoy» en UTC.
>
> Contexto mergeado que esta ficha da por hecho (QC-170, QC-215, QC-217 y QC-218, en `dev`):
>
> - Terminar el empaque da de alta **un lote de producto terminado por línea del reparto**, con
>   un lote automático (correlativo de QC-81) y sin vencimiento. Su asiento `production` guarda la
>   línea, y la base admite **uno solo por línea** (QC-170 R17, R21).
> - La cadena es `POR_ACONDICIONAR → EN_ACONDICIONAMIENTO → TERMINADO → ENTREGADO`. Comenzar guarda
>   a quien acondiciona. Terminar, con confirmación, deja `TERMINADO` y solo lo hace quien acondiciona
>   (QC-215 R12, QC-218 R26–R29).
> - En los estados de acondicionamiento el reparto no se edita: `order_presentation_line_not_editable`
>   (QC-215 D13).
> - «Terminados» del acondicionador lista solo `TERMINADO` acondicionados por él. Su detalle da 404
>   en `ENTREGADO` (QC-217 R11, R17, D9).
>
> Vocabulario fijo:
>
> - «el permiso» = `acondicionamiento.modificar` (QC-216). «El acondicionador» = un actor con el
>   permiso.
> - «quien acondiciona» = la persona guardada en el pedido al comenzar (QC-215). Es también quien
>   lo terminó (QC-218 R29).
> - «el detalle» = la pantalla `/asignacion/acondicionamiento/<id>` (QC-217).
> - «línea» = una línea del reparto del pedido. «El lote de la línea» = el lote de producto terminado
>   cuyo asiento `production` es de esa línea.
> - «los datos de lote» de una línea = lote, vencimiento y día de producción.
> - «línea con datos» = una línea cuyo lote ya tiene vencimiento y día de producción, escritos
>   por esta vía. Los tres datos se guardan siempre juntos, así que el lote también quedó escrito.
> - «hoy» = la fecha civil del servidor en UTC, el mismo criterio que la fecha de compra de QC-81
>   (`create-product.ts`) **[D16]**.
> - «pedido corregible» = un pedido vivo de la empresa del actor, en `EN_ACONDICIONAMIENTO` o
>   `TERMINADO` o `ENTREGADO` (D13), cuyo quien acondiciona es el actor.

### La sección «Datos de lote» del detalle

**R1.** MIENTRAS quien acondiciona vea el detalle de su pedido en `EN_ACONDICIONAMIENTO` o
`TERMINADO`, la pantalla DEBE mostrar la sección «Datos de lote». La sección tiene un bloque por
línea, en orden de alta, y cada bloque muestra:

- la línea, escrita como en el reparto (`<envases> × <envase o presentación>`);
- los campos «Lote», «Vencimiento» y «Día de producción»;
- un único botón «Guardar datos de lote» para toda la sección.

[D2, D6, D8]

**R2.** En una línea con datos, los tres campos DEBEN venir rellenos con lo guardado. En una línea
sin datos, los tres DEBEN venir vacíos, y el bloque DEBE decir «Lote provisional: <lote
automático>.». *(N1 del `design.md > 6`.)* [D1]

**R3.** La pantalla NO DEBE mostrar la sección «Datos de lote», ni ningún campo de datos de lote,
MIENTRAS:

- el pedido esté `POR_ACONDICIONAR`;
- o lo acondicione otra persona.

*(Enmienda QC-218 R3: el detalle de un `TERMINADO` ofrece ahora este formulario a quien lo
acondicionó.)* [D6]

**R4.** MIENTRAS alguna línea del pedido no tenga datos:

- «Terminar» DEBE estar deshabilitado;
- la pantalla DEBE decir «Faltan los datos de lote de 1 línea.» o «Faltan los datos de lote de <k>
  líneas.», con k > 1.

CUANDO todas las líneas tienen datos, «Terminar» DEBE habilitarse con su espera de QC-218 R10. [D7]

**R5.** Los campos de la sección DEBEN cumplir la regla multiplataforma:

- texto de al menos 16 px;
- objetivo táctil de al menos 44×44 px;
- las dos fechas, con el selector de fecha nativo del navegador;
- etiqueta asociada a cada campo.

SI guardar falla, ENTONCES la sección DEBE:

- mostrar el mensaje del catálogo de errores en una región `role="alert"`;
- marcar con `aria-invalid` el bloque de la línea culpable, cuando el error la identifica;
- conservar lo escrito.

[D4, D9]

### Guardar los datos de lote

**R6.** CUANDO quien acondiciona guarda los datos de lote de una o más líneas de un pedido
corregible, el sistema DEBE escribir, en una sola transacción, en el lote de cada línea enviada:

- el lote, que sustituye al que tenía;
- el vencimiento;
- el día de producción.

NO DEBE cambiar del lote: la existencia, el coste unitario, la fecha de compra, la presentación, el
producto, el contenido del envase ni ningún asiento. Las líneas no enviadas NO DEBEN cambiar.
[D1, D2, D5, D6, D8]

**R7.** SI la entrada de guardar no es exactamente `{ orderId, lines }`, ENTONCES el sistema DEBE
rechazar con `invalid_input` sin invocar ningún puerto. La forma válida es:

- `orderId`, un uuid;
- `lines`, una lista no vacía de `{ batchId, lot, expiryDate, productionDate }`, sin `batchId`
  repetidos;
- `lot`, con las reglas del lote tecleado de QC-81: se recorta, entre 1 y 60 caracteres, y uno de
  solo dígitos, hasta 59;
- `expiryDate` y `productionDate`, con forma `AAAA-MM-DD` y días que existen en el calendario.

Ningún dato de una línea enviada puede venir vacío: un dato guardado no se borra, solo se
sustituye. [D4, D9]

**R8.** SI el vencimiento de alguna línea enviada no es posterior a hoy, ENTONCES el sistema DEBE
rechazar con `batch_expiry_not_future` (código nuevo) sin escribir ninguna línea. [D4, D16]

**R9.** SI el día de producción de alguna línea enviada es posterior a hoy, ENTONCES el sistema
DEBE rechazar con `batch_production_date_future` (código nuevo) sin escribir ninguna línea. [D4, D16]

**R10.** El sistema DEBE rechazar con `batch_duplicate_lot` (el código de QC-81), sin escribir
ninguna línea e identificando la primera línea culpable, SI:

- dos líneas de la misma entrada llevan el mismo lote;
- o el lote de una línea ya es el de otro lote de la empresa, sea del tipo que sea y venga del
  pedido que venga.

La comparación DEBE ser exacta y distinguir mayúsculas, como el índice de QC-81. NO DEBE ser
choque:

- escribir en un lote el valor que ya tiene;
- un lote igual de otra empresa.

[D3]

**R11.** CUANDO dos guardados simultáneos escriben el mismo lote en dos lotes distintos de la
empresa, exactamente uno DEBE guardarse. El otro DEBE recibir `batch_duplicate_lot` sin que se
escriba ninguna de sus líneas. [D3]

**R12.** SI algún `batchId` no es el lote de una línea de ese pedido, ENTONCES el sistema DEBE
rechazar con `batch_not_found` sin escribir ninguna línea. Vale para un lote:

- que no existe;
- de otra empresa;
- de otro pedido;
- que no entró por producción.

[D2, D9]

**R13.** SI el actor es nulo o no tiene el permiso, ENTONCES guardar DEBE rechazar con
`unauthorized`, antes de validar la entrada y sin invocar ningún puerto. [D9]

**R14.** Guardar DEBE decidir los errores del pedido antes de mirar las líneas, y sin escribir nada:

- pedido inexistente, dado de baja o de otra empresa → `order_not_found`;
- `TERMINADO` o `ENTREGADO` con otra persona, o nadie, como quien acondiciona → `order_not_found`,
  como el detalle (QC-217 R17);
- `EN_ACONDICIONAMIENTO` con otra persona como quien acondiciona → `order_conditioning_taken`;
- cualquier otro estado, `POR_ACONDICIONAR` incluido → `order_not_conditionable`.

[D6, D9, D13]

### Terminar exige los datos

**R15.** SI quien acondiciona confirma Terminar y alguna línea del pedido no tiene datos, ENTONCES el
sistema DEBE rechazar con `conditioning_batch_data_missing` (código nuevo). El pedido DEBE seguir
`EN_ACONDICIONAMIENTO`, sin `finishedAt` y con su equipo, y el modal DEBE mostrar el mensaje
(QC-218 R28). *(Enmienda QC-218 R27 y QC-215 R12: Terminar gana una precondición.)* [D7]

**R16.** Terminar DEBE comprobar en este orden, y la primera que falle decide el error:

1. el permiso (`unauthorized`);
2. la entrada (`invalid_input`);
3. el pedido (`order_not_found`, `order_not_conditionable`, `order_conditioning_taken`, como hoy);
4. los datos de lote (`conditioning_batch_data_missing`).

Un acondicionador que no es quien acondiciona DEBE seguir recibiendo `order_conditioning_taken`,
falten o no los datos. [D7, D9]

**R17.** Para R4 y R15, una línea cuyo lote no existe cuenta como línea sin datos. Un pedido sin
líneas no tiene ninguna línea sin datos. [D7, D15]

### Corregir después de terminar

**R18.** MIENTRAS el pedido esté `TERMINADO`, quien lo acondicionó DEBE poder corregir sus datos de
lote con las reglas de R6–R14. Corregir NO DEBE cambiar el estado, `finishedAt` ni el equipo del
pedido. [D8]

**R19.** CUANDO se corrige el lote de una línea, el lote del inventario DEBE seguir siendo el mismo
registro. Sus asientos, su existencia y lo apartado o entregado de él DEBEN seguir apuntándole, y
solo cambia su código. [D1, D8]

**R20.** MIENTRAS el acondicionador tenga el permiso,
`/asignacion` DEBE ofrecerle una tercera pestaña, «Entregados», detrás de «Terminados». La pestaña
DEBE listar los pedidos vivos de su empresa en `ENTREGADO` que acondicionó él:

- con las mismas columnas, el mismo orden y el mismo enlace al detalle que «Terminados»;
- con el vacío «Todavía no se ha entregado ningún pedido que acondicionaste.».

*(Enmienda QC-217 R1, R2 y R5: tres pestañas en vez de dos.)* [D8, D13]

**R21.** CUANDO el acondicionador abre el detalle de un pedido `ENTREGADO` que
acondicionó él, la pantalla DEBE:

- mostrar lo de QC-217 R15 y la sección «Datos de lote» de R1, editable;
- no ofrecer «Acondicionar» ni «Terminar»;
- ofrecer el enlace «Volver a «Entregados»».

Un `ENTREGADO` que acondicionó otra persona, o nadie, DEBE seguir dando 404. *(Enmienda QC-217
R17.)* [D8, D13]

### Inventario

**R22.** CUANDO se guardan los datos de lote, el panel de lotes del producto terminado en
`/inventario` DEBE mostrar el lote nuevo. Mostrará también un campo «Vencimiento» con la fecha
guardada. El campo «Vencimiento» DEBE pintarse en todo lote que tenga vencimiento, y solo en esos:
un lote sin vencimiento se pinta como hoy. [D5, D10, D11]

**R23.** El día de producción DEBE guardarse en el lote del inventario, no en la línea del pedido.
*(`design.md > 1`.)* [D5, D14]

### Base de datos

**R24.** CUANDO se aplican las migraciones UP, el sistema DEBE:

- añadir al lote el día de producción, anulable;
- no modificar ninguna fila existente: todo lote queda sin día de producción.

La base DEBE rechazar un lote con día de producción y sin vencimiento. CUANDO se aplica
`db:rollback` sobre la migración de esta feature, el día de producción y esa restricción DEBEN
desaparecer, y la base DEBE quedar como antes de ella. [D5, D14]

**R25.** Esta feature NO DEBE migrar datos de pedidos. Un pedido que ya estaba
`EN_ACONDICIONAMIENTO` cuando entra la regla DEBE necesitar los datos para terminar (R15). Uno que
ya estaba `TERMINADO` o `ENTREGADO` DEBE quedar sin datos y sin cambios hasta que alguien los
corrija. [D7, D8, D15]

### Autorización y guardias

**R26.** Ningún archivo de producción DEBE decidir los datos de lote por nombre de rol: la guardia de
autorización por permiso DEBE seguir en verde. El código del permiso DEBE aparecer, además de en
las rutas de QC-217 R21 y QC-218 R31, solo en:

- el caso de uso de guardar;
- el de listar «Entregados».

*(Relaja QC-217 R21 y QC-218 R31.)* [D9, D13]

**R27.** Las guardias del inventario DEBEN admitir el nuevo camino de escritura de lotes, por su
nombre exacto, y DEBEN probar que ese camino no escribe la existencia. Son la del libro de
inventario (QC-92 R28) y la de alcance de QC-91 (QC-92 R26). Ambas DEBEN seguir rojas ante
cualquier otra escritura de lote nueva. *(Enmienda QC-92 R26 y R28, y QC-81 R32: el contrato de
`inventario` ofrece ahora una escritura de datos de lote, solo para lotes que entraron por
producción.)* [D1, D5]

### Verificación y alcance

**R28.** El E2E DEBE recorrer, con los roles reales del seed, un pedido `EN_ACONDICIONAMIENTO` del
acondicionador 1 con dos líneas y sus dos lotes de producción:

- el detalle muestra «Datos de lote» con dos bloques, «Terminar» deshabilitado y «Faltan los datos
  de lote de 2 líneas.»;
- guardar con un vencimiento de hoy se rechaza con el mensaje de `batch_expiry_not_future`;
- guardar con un día de producción de mañana se rechaza con el de `batch_production_date_future`;
- guardar con un lote que ya existe en la empresa se rechaza con el de `batch_duplicate_lot`;
- tras cada rechazo, el pedido sigue sin datos;
- guarda datos válidos en las dos líneas, «Terminar» se habilita, confirma y aterriza en «Por
  acondicionar» con el aviso;
- el Administrador sembrado abre en `/inventario` los lotes del producto terminado y ve el lote
  escrito y su vencimiento.

[D3, D4, D5, D7, D11, D16]

**R29.** Los E2E existentes de QC-217 (`e2e/acondicionamiento.spec.ts`) y QC-218
(`e2e/acondicionar-con-equipo.spec.ts`) NO DEBEN cambiar ninguna aserción, salvo una: el conteo de pestañas
de `/asignacion` en `e2e/acondicionamiento.spec.ts` pasa de 2 a 3 y comprueba «Entregados» en tercera
posición, consecuencia directa de R20 (enmienda aprobada por el humano el 2026-10-09). El pedido de
QC-218 no tiene reparto, así que R17 deja terminarlo. [D11, D13, D15]

**R30.** El sistema DEBE probar R1–R27 con tests unitarios, de integración y guardias. Esta feature
NO DEBE añadir ninguna dependencia a `package.json`. [D11, D12]

### Cobertura de la tabla de decisiones

| Decisión | Requisitos |
|---|---|
| D1 El lote reemplaza al automático | R2, R6, R19, R27 |
| D2 Uno por línea | R1, R6, R12 |
| D3 Único en la empresa | R10, R11, R28 |
| D4 Qué fechas valen, en el servidor | R5, R7, R8, R9, R28 |
| D5 El vencimiento va en el lote | R6, R22, R23, R24, R27, R28 |
| D6 Solo después de Comenzar, solo quien comenzó | R1, R3, R6, R14 |
| D7 Obligatorios para terminar (enmienda QC-218) | R4, R15, R16, R17, R25, R28 |
| D8 Se corrigen después de entregado | R1, R6, R18, R19, R20, R21, R25 |
| D9 Autorización en el service | R5, R7, R12, R13, R14, R16, R26 |
| D10 Avanza la pregunta abierta del dominio | R22 |
| D11 E2E | R22, R28, R29, R30 |
| D12 Dependencia | R30 |
| D13 Pestaña «Entregados» (enmienda D8 y QC-217 D9) | R14, R20, R21, R26 |
| D14 El día de producción va en el lote | R23, R24 |
| D15 Sin migración de datos; casos sin lote | R17, R25, R29 |
| D16 «Hoy» en UTC | R8, R9, R28 |

## Preguntas abiertas

Ninguna. P1–P4 se cerraron el 2026-10-09: son las filas D13–D16 de «Decisiones cerradas».

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-10-06 | ¿Qué es el lote que escribe el acondicionador? | **Reemplaza el lote automático** del producto terminado creado al terminar el empaque (QC-150/QC-170). Pasa a ser el lote real del inventario |
| 2026-10-06 | ¿Uno por pedido o uno por presentación? | **Uno por línea de presentación.** Ejemplo: 100 L de crema dan CR-2610-A para la botella 1 L y CR-2610-B para la de 200 ml. Cada línea lleva su lote, su vencimiento y su día de producción |
| 2026-10-06 | ¿El lote es único? | **Sí, único dentro de la empresa**, como todo lote. Dos empresas pueden repetirlo. Hereda QC-81 |
| 2026-10-06 | ¿Qué fechas valen? | **Vencimiento posterior a hoy. Día de producción hoy o antes.** Se validan en el servidor |
| 2026-10-06 | ¿Dónde se guarda el vencimiento? | En el lote del inventario (`expiry_date`) |
| 2026-10-06 | ¿Cuándo se escriben? | **Solo después de Comenzar**, y solo los escribe **quien comenzó** |
| 2026-10-06 | ¿Son obligatorios? | **Para terminar.** Terminar se bloquea mientras falte cualquier dato en cualquier línea. Enmienda QC-218 |
| 2026-10-06 | ¿Se corrigen después de entregado? | **Sí, por quien lo terminó**, desde su «Terminados» (QC-217). Aplican las mismas validaciones |
| 2026-10-06 | ¿Se autoriza en el servidor? | **Sí, en el service:** permiso de acondicionamiento (QC-216), pedido de la empresa y quien escribe es quien comenzó |
| 2026-10-06 | ¿Pregunta abierta del dominio? | **Avanza sin cerrar** la de lote y vencimiento (`docs/architecture.md > Preguntas abiertas del dominio`, punto 2): el vencimiento gana su primer escritor. Sigue abierto su consumo (QC-196) |
| 2026-10-06 | ¿E2E? | **Sí:** sin datos no termina; con datos termina y el lote del inventario muestra el código y el vencimiento; un vencimiento de hoy o un día de producción de mañana se rechazan; un lote repetido en la empresa se rechaza |
| 2026-10-06 | ¿Dependencia nueva? | **Ninguna.** |
| 2026-10-09 | D13 (P1): ¿Cómo se corrige el lote de un pedido `ENTREGADO`? | **(b) Pestaña «Entregados»** en `/asignacion`, detrás de «Terminados», con los `ENTREGADO` que acondicionó él. Abre el mismo detalle, con solo «Datos de lote» editable. **Enmienda la fila «¿Se corrigen después de entregado?»** (decía «desde su Terminados») y **QC-217 D9** (con R1, R2, R5 y R17): «Terminados» sigue listando solo `TERMINADO` |
| 2026-10-09 | D14 (P2): ¿Dónde vive el día de producción? | En el lote del inventario: **`product_batches.production_date`**, `DATE` anulable, con un `CHECK` que no admite día de producción sin vencimiento |
| 2026-10-09 | D15 (P3): ¿Qué pasa con los pedidos que ya estaban en acondicionamiento, y con los casos sin lote? | **Sin migración de datos.** Un `EN_ACONDICIONAMIENTO` necesita los datos para terminar. Un `TERMINADO` o `ENTREGADO` se queda sin datos hasta que alguien los corrija. Un pedido sin líneas termina sin pedir nada. Una línea sin lote de producción cuenta como «sin datos» y bloquea Terminar |
| 2026-10-09 | D16 (P4): ¿Qué es «hoy»? | **La fecha civil en UTC**, heredada de la fecha de compra de QC-81. La zona horaria de la empresa no se abre en esta ficha. El E2E calcula «hoy» y «mañana» en UTC |