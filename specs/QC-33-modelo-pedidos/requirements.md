# QC-33 — modelo-pedidos · requirements.md

> **Zona:** `backend` · **Complejidad:** `medium` · **depends_on:** `QC-32`, `QC-24` ·
> **Rama:** `feature/QC-33-modelo-pedidos`
>
> **Alcance.** Persistir el pedido como **módulo hexagonal propio `pedidos`**: la tabla `Order`
> con su número correlativo por año, su receta, su cantidad, su precio **unitario**, su unidad
> del catálogo, su prioridad, su estado, su autoría y su borrado lógico. Migración con su
> `down.sql` y los tests. El módulo conoce la receta por el contrato público de `recetas`
> (`@/lib/modules/recetas`) y la unidad por el de `unidades` (`@/lib/modules/unidades`), nunca
> por sus tablas ni sus repositorios. Es la primera feature de la épica **QC-31 — Pedidos**.
>
> **Lo que NO entra.** El alta, la consulta, la edición y el borrado de pedidos: **QC-34**. Su
> pantalla: **QC-35**. Qué transiciones entre estados son válidas: **QC-34**. El cliente o
> destinatario del pedido: **no entra y no genera ficha**, por decisión explícita del humano
> (ver decisión 8). Facturación e impuestos: no existen en este ERP (ver decisión 23).
>
> Sembrado por `/afinar-feature` el 2026-09-03. El bloque de Alcance y la tabla de
> «Decisiones cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los
> reabre y no los reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

Notación EARS (`docs/specs.md`). **«El sistema»** aquí es la **capa de persistencia** de
QuimiCloude —el esquema Prisma (`db/schema.prisma`) más la base Postgres con la migración de esta
feature aplicada— **más el armazón del módulo `pedidos`** y las **fronteras** que ese módulo tiene
con `recetas`, con `unidades` y con `identity`. No hay caso de uso, ni service, ni pantalla
(decisiones cerradas de permisos y de E2E), así que ningún requisito habla de quién llama ni desde
dónde: cuando un requisito dice «rechazar», quiere decir que lo rechaza **la propia base**, no una
validación de aplicación que llegará en QC-34.

### Estructura del pedido

**R1.** El sistema DEBE persistir, para cada pedido, un identificador propio, estable y no derivado
de sus datos de negocio, más su **receta**, su **cantidad**, su **unidad**, su **precio unitario**,
su **prioridad** y su **estado**.

**R2.** El sistema DEBE modelar el pedido como **una sola fila**: NO DEBE crear ninguna entidad,
tabla ni columna de «línea de pedido» ni de «ítem», y NO DEBE permitir que un pedido apunte a más
de una receta.

**R3.** El sistema NO DEBE persistir en el pedido ningún cliente, destinatario ni referencia a la
persona a la que se vende, y NO DEBE crear ningún catálogo de clientes.

**R4.** El sistema NO DEBE crear ninguna columna de fecha de solicitud distinta de la marca de
creación de la fila: la fecha de solicitud **es** la de creación.

**R5.** El sistema NO DEBE modificar el modelo de receta de **QC-24** para cumplir ninguno de estos
requisitos, y en particular NO DEBE añadirle ninguna columna de precio.

### Cantidad, precio y total

**R6.** El sistema DEBE almacenar la cantidad del pedido como número **decimal exacto** de 14
dígitos de precisión y 4 decimales, DEBE devolver sin pérdida cualquier valor con hasta 4
decimales, y NO DEBE usar ninguna representación de coma flotante binaria (`float`, `double`,
`real`).

**R7.** SI se intenta persistir un pedido cuya cantidad sea cero, negativa o ausente, ENTONCES el
sistema DEBE rechazar la operación **en la propia base de datos** y no crear ni modificar ninguna
fila.

**R8.** El sistema DEBE almacenar el precio del pedido como número **decimal exacto** de 14 dígitos
de precisión y 4 decimales, obligatorio, y ese precio DEBE ser el de **una** unidad —no el del
pedido entero—; NO DEBE usar coma flotante binaria.

**R9.** SI se intenta persistir un pedido cuyo precio unitario sea negativo o ausente, ENTONCES el
sistema DEBE rechazar la operación **en la propia base de datos**; y DEBE aceptar el precio **cero**.

**R10.** El sistema NO DEBE persistir el total del pedido: NO DEBE crear ninguna columna —normal,
generada ni derivada— que guarde el producto de la cantidad por el precio unitario, ni ningún
subtotal equivalente.

**R11.** El sistema NO DEBE persistir ningún impuesto, descuento, dato de facturación ni documento
tributario asociado al pedido.

### La unidad y la receta

**R12.** El sistema DEBE expresar la unidad del pedido como **referencia al catálogo de unidades**
(QC-32) y DEBE **exigirla**: SI se intenta persistir un pedido sin unidad, o con una referencia de
unidad que no corresponde a ninguna unidad existente, ENTONCES DEBE rechazar la operación **en la
propia base de datos**.

**R13.** SI se intenta eliminar una unidad referenciada por al menos un pedido, ENTONCES el sistema
DEBE rechazar el borrado y conservar la unidad y el pedido intactos.

**R14.** El sistema DEBE expresar la receta del pedido como **referencia a la receta** (QC-24) y
DEBE **exigirla**: SI se intenta persistir un pedido sin receta, o con una referencia de receta que
no corresponde a ninguna receta existente, ENTONCES DEBE rechazar la operación **en la propia base
de datos**.

**R15.** MIENTRAS la receta de un pedido esté borrada lógicamente, el sistema DEBE conservar el
pedido apuntando a esa misma receta, sin modificarlo y sin borrarlo; y SI se intenta eliminar
**físicamente** una receta referenciada por algún pedido, ENTONCES DEBE rechazar el borrado.

### Estado y prioridad

**R16.** El sistema DEBE declarar el estado y la prioridad del pedido como **dos conjuntos cerrados
del propio esquema** (tipos enumerados), con exactamente los valores `PENDIENTE`, `EN_CURSO`,
`ENTREGADO` para el estado y `BAJA`, `MEDIA`, `ALTA`, `CRITICA` para la prioridad, **en ese orden de
declaración** —que es el orden de menor a mayor prioridad—; y SI se intenta persistir cualquier
otro valor, ENTONCES DEBE rechazar la operación **en la propia base de datos**.

**R17.** El estado DEBE ser obligatorio, y CUANDO se persiste un pedido sin indicar estado, el
sistema DEBE registrarlo como `PENDIENTE`.

**R18.** CUANDO se persiste un pedido sin indicar prioridad, el sistema DEBE registrarla como
`BAJA`, y NO DEBE dejar la prioridad como ausencia de valor.

**R19.** El sistema NO DEBE restringir qué cambios de estado son válidos: cualquier estado de la
enumeración DEBE poder sustituir a cualquier otro, salvo lo que impone R30. Las transiciones
válidas son de **QC-34**.

### El número correlativo

**R20.** El sistema DEBE asignar a cada pedido un número correlativo obligatorio formado por el
**año** y una **posición dentro de ese año**, y SI se intenta persistir un pedido sin año, sin
posición o con una posición que no sea un entero positivo, ENTONCES DEBE rechazar la operación **en
la propia base de datos**.

**R21.** SI se intenta persistir un segundo pedido con el mismo año y la misma posición que otro
pedido ya existente, ENTONCES el sistema DEBE rechazar la operación **en la propia base de datos**
—contra un índice único, no contra una comprobación previa al vuelo— y no crear ni modificar
ninguna fila.

**R22.** MIENTRAS un pedido esté borrado lógicamente, el sistema DEBE seguir rechazando cualquier
otro pedido del **mismo año** con su misma posición: la unicidad del correlativo NO DEBE ser
parcial ni depender de la marca de borrado (se aparta a propósito del índice parcial de **QC-24
R9**).

**R23.** El sistema DEBE permitir que dos pedidos de **años distintos** tengan la misma posición,
de modo que la numeración se reinicie cada año.

**R24.** El sistema NO DEBE persistir el número visible ya formateado (`2026-0001`), y DEBE exponer
**una única definición** de ese formato, publicada por el contrato del módulo `pedidos`, de modo que
cualquier consumidor futuro lo componga igual a partir del año y la posición.

### Auditoría, borrado y marcas de tiempo

**R25.** El sistema DEBE registrar, para cada pedido, qué usuario lo creó y qué usuario lo modificó
por última vez **cuando ese usuario exista**, y SI se intenta registrar como autor un usuario
inexistente, ENTONCES DEBE rechazar la operación **en la propia base de datos**.

**R26.** El sistema DEBE aceptar un pedido **sin autor de creación y sin autor de última
modificación**, DEBE conservar esa ausencia como ausencia de valor y NO DEBE rechazar la operación
por ello: la ausencia significa «no lo creó una persona» —una importación, una siembra—, no «se
perdió el dato».

**R27.** CUANDO se borra un pedido, el sistema DEBE conservar su fila completa y registrar el
instante del borrado, sin eliminar ninguno de sus datos ni liberar su número correlativo.

**R28.** El sistema DEBE registrar, para cada pedido, el instante de creación y el instante de la
última modificación, y DEBE actualizar el segundo cada vez que la fila cambia.

**R29.** SI se intenta marcar como borrado un pedido cuyo estado sea `ENTREGADO`, o poner en
`ENTREGADO` un pedido ya borrado, ENTONCES el sistema DEBE rechazar la operación **en la propia base
de datos**, con la condición `deleted_at IS NULL OR status <> 'ENTREGADO'` escrita como restricción
de la tabla y no solo como validación de aplicación.

**R30.** El sistema DEBE aceptar el borrado lógico de un pedido en cualquier estado distinto de
`ENTREGADO`.

### Frontera de módulo

**R31.** El sistema DEBE declarar `pedidos` como módulo propietario del modelo de esta feature, y
ningún módulo distinto de `pedidos` DEBE consultarlo con el cliente Prisma.

**R32.** El módulo `pedidos` NO DEBE consultar con el cliente Prisma el modelo de receta, el de
unidad ni el de usuario, NO DEBE importar el dominio, los puertos ni los adaptadores de `recetas`,
`unidades` o `identity` por ruta profunda, y todo lo que sepa de una receta o de una unidad DEBE
llegarle por los contratos públicos `@/lib/modules/recetas` y `@/lib/modules/unidades`, que DEBEN
publicarlo.

**R33.** El sistema DEBE declarar las cuatro referencias del pedido —la receta, la unidad y los dos
autores— como **campos escalares sin relación de Prisma**, de modo que ninguna consulta del cliente
Prisma pueda atravesar desde un pedido hasta una receta, una unidad o un usuario; y DEBE mantener
aun así las cuatro restricciones de clave foránea **reales en la base de datos**.

**R34.** El módulo `pedidos` DEBE nacer con la forma hexagonal del repositorio: un contrato público
(`index.ts`) que solo reexporta símbolos de su propio `domain/`, las carpetas `domain/`, `ports/` y
`adapters/` como únicas carpetas del módulo, y ningún `'use server'` alcanzable desde ese contrato.

**R35.** El dominio de `pedidos` DEBE exponer los valores del estado y de la prioridad **sin
importar el cliente Prisma**, y esos valores DEBEN coincidir exactamente —los mismos, sin sobrar ni
faltar ninguno, y en el mismo orden— con los declarados en el esquema.

### Esquema, seguridad y migración

**R36.** El sistema DEBE nombrar en **inglés** la tabla, las columnas, los índices, las
restricciones y los tipos que cree esta feature. Los **valores** de los dos conjuntos cerrados son
términos de negocio fijados por el humano y van en castellano (R16): la regla del idioma alcanza a
los identificadores, no a los datos.

**R37.** El sistema DEBE tener `ROW LEVEL SECURITY` activado **y forzado**
(`FORCE ROW LEVEL SECURITY`) en la tabla que crea esta feature.

**R38.** CUANDO se revierte la migración de esta feature, el sistema DEBE quedar exactamente en el
estado de esquema previo a aplicarla, sin dejar tabla, columna, índice, restricción **ni tipo
enumerado** residual, y sin tocar ninguna tabla de `identity`, `inventario`, `recetas` ni
`unidades`.

### Límite de alcance

**R39.** El sistema NO DEBE incluir en esta feature ninguna operación de alta, consulta, edición o
borrado de pedidos, ni ninguna regla de permisos ni de transición de estados, ni adaptador driving,
ruta, Server Action o pantalla que las exponga; por lo tanto esta feature no aporta ningún flujo
navegable que un test E2E pueda visitar.

**R40.** El sistema NO DEBE incorporar ninguna dependencia de terceros nueva para cumplir los
requisitos anteriores.

### Cobertura de las decisiones cerradas

Cada fila de `## Decisiones cerradas (no reabrir)`, en el orden en que está escrita, con el
requisito que la hace testeable. Ninguna queda sin `R<n>`.

| # | Decisión cerrada | Requisito(s) |
| --- | --- | --- |
| 1 | Un pedido es **una sola línea**, sin cabecera ni ítems | R1, R2 |
| 2 | La receta **no** gana columna de precio; QC-24 no se toca | R5, R8 |
| 3 | Módulo propio `pedidos`; receta y unidad por contrato público | R31, R32, R34 |
| 4 | Dos **enums de Prisma** con sus valores exactos y su orden de declaración | R16, R35 |
| 5 | El precio es **unitario**; el total no se guarda | R8, R10 |
| 6 | Precio `decimal(14,4)`, obligatorio y nunca negativo, por `CHECK` | R8, R9 |
| 7 | Cantidad `decimal(14,4)`, obligatoria y `> 0`, por `CHECK` | R6, R7 |
| 8 | No hay cliente ni destinatario, y no se crea catálogo | R3 |
| 9 | Correlativo por año, único, creciente y no reutilizado | R20, R21, R22, R23, R24, R27 |
| 10 | Sin columna de fecha de solicitud: es `created_at` | R4, R28 |
| 11 | Unidad **obligatoria**, FK al catálogo con `ON DELETE RESTRICT` | R12, R13 |
| 12 | Estado obligatorio, `PENDIENTE` por defecto | R16, R17 |
| 13 | Prioridad opcional en la entrada, `BAJA` por defecto | R18 |
| 14 | Un pedido `ENTREGADO` no se puede borrar (`CHECK` en la base) | R29, R30 |
| 15 | Las transiciones de estado son de QC-34 | R19, R39 |
| 16 | Si la receta se da de baja, el pedido conserva su referencia | R14, R15 |
| 17 | Auditoría: FK real a `users`, escalares **sin `@relation`** | R25, R33 |
| 18 | El autor puede quedar vacío (`created_by`/`updated_by` anulables) | R26 (y R25, que ya solo exige registrarlo cuando existe) |
| 19 | Borrado lógico con las tres marcas de tiempo | R27, R28 |
| 20 | Identificadores de la base en inglés | R36 |
| 21 | RLS activada y forzada | R37 |
| 22 | Migración con `down.sql` que revierte al esquema exacto anterior | R38 |
| 23 | El ERP no factura ni liquida impuestos; el total es derivado | R6, R8, R10, R11 |
| 24 | Los permisos no se deciden aquí | R39 |
| 25 | E2E diferido con motivo | R39 |
| 26 | Ninguna librería nueva | R40 |

## Preguntas abiertas

No se rellenan con supuestos (regla 6 de `CLAUDE.md`).

1. **¿El sistema exporta alguna vez a un contable externo?** La decisión 23 cerró que el ERP no
   factura ni liquida impuestos y que los totales se calculan internamente sin guardarse, pero
   no se evaluó si algún día hay que entregar esos datos a una contabilidad de fuera. No afecta
   al esquema de esta ficha: se anota porque es el fleco que queda de la pregunta abierta n.º 4
   del dominio.

**Añadidas por `spec_author` el 2026-09-03 (F1.2).** Ninguna bloquea el esquema, ninguna se
rellena con un supuesto sin decirlo, y las cuatro tienen su posición por defecto escrita. Las tres
primeras salen de la misma grieta: **la decisión 9 fija la garantía del correlativo, pero la
garantía completa no cabe en el esquema** (`design.md > 5`).

2. **¿Quién asigna la posición del correlativo, y qué pasa con dos altas simultáneas?** Esta ficha
   garantiza en la base que el número **no se duplica** (índice único, R21) y que **no se reutiliza**
   (índice **no** parcial, R22). Lo que no puede garantizar un esquema es **quién calcula la
   siguiente posición**: eso es una escritura, y no hay ninguna en esta ficha. Posición por defecto
   escrita en `design.md > 5.3`: lo hace **QC-34**, y ahí hay que decidir la estrategia (leer el
   máximo del año y reintentar ante `23505`, o serializar con un bloqueo). **No se da por cerrada
   aquí**: si QC-34 no la resuelve, dos altas simultáneas del mismo año fallarán una de las dos con
   un error de índice único que nadie tradujo.
3. **¿Se acepta que el correlativo tenga huecos?** La decisión 9 dice «único, creciente y no
   reutilizado dentro del año», y eso lo cumple el esquema. No dice **sin huecos**, que es otra
   cosa: un alta que empieza y falla puede consumir una posición según qué estrategia elija QC-34.
   Un correlativo sin huecos es un requisito bastante más caro (obliga a serializar las altas) y a
   veces es una exigencia contable. Posición por defecto: **se aceptan huecos**.
4. **¿Qué zona horaria decide el año de un pedido, y el año guardado tiene que coincidir con el de
   `created_at`?** Un pedido creado el 31 de diciembre a las 20:00 en Ecuador ya es del año
   siguiente en UTC. Esta ficha guarda el año como **columna propia** (R20) y **no** añade ninguna
   restricción que lo ate a `created_at`, así que hoy nada impide que un pedido de 2027 lleve el año
   2026. El porqué y la alternativa evaluada están en `design.md > 5.2`. Es barato de cerrar
   mientras no haya pedidos cargados y caro después, igual que todo lo demás de esta épica.
5. **El formato `2026-0001` tiene cuatro dígitos: son 9.999 pedidos al año.** El límite no está en
   la columna —la posición es un entero (R20)—, sino en el **formato** que publica el contrato
   (R24). Si algún año se pasa de 9.999, el número visible deja de tener ancho fijo y deja de
   ordenar alfabéticamente. Posición por defecto: **cuatro dígitos**, como escribió el humano, y el
   formato no trunca ni falla, solo crece.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
| --- | --- | --- |
| 2026-09-02 | ¿Un pedido es una línea o una cabecera con ítems? | **Una sola línea**: receta, cantidad, precio y unidad. No hay tabla de líneas ni cabecera |
| 2026-09-02 | ¿La receta gana columna de precio? | **No.** El precio de venta se escribe a mano en el pedido, así que **QC-24 no se toca** por esto |
| 2026-09-03 | ¿Pedidos es un módulo propio? | **Módulo propio `pedidos`**, hexagonal como `identity`, `inventario`, `recetas` y `unidades` (**QC-15**). Conoce la receta por `@/lib/modules/recetas` y la unidad por `@/lib/modules/unidades`, **nunca** por sus tablas, sus modelos de Prisma ni sus repositorios |
| 2026-09-03 | Forma técnica de los dos conjuntos cerrados (prioridad y estado) | **Enum de Prisma**: `OrderStatus` (PENDIENTE, EN_CURSO, ENTREGADO) y `OrderPriority` (BAJA, MEDIA, ALTA, CRITICA). **Se aparta a propósito de `DocumentType` (QC-4)**, que resolvió el mismo problema con tabla porque el conjunto debía crecer sin migrar. Aquí el humano asume a conciencia que **añadir un valor será una migración del tipo en Postgres**. El orden de la prioridad es el de declaración del enum |
| 2026-09-03 | ¿El precio es unitario o total? | **Unitario**: lo que cuesta **una** unidad. El total del pedido se obtiene multiplicando por la cantidad y **no se guarda**, para que no pueda contradecir a sus factores |
| 2026-09-03 | Tipo y precisión del precio | **`decimal(14,4)`, obligatorio y nunca negativo**, garantizado por `CHECK` en la base. Nunca `float` (`docs/architecture.md > Dominio` n.º 4). Heredado de **QC-14**, que lo fijó igual para el costo del producto |
| 2026-09-03 | Tipo y precisión de la cantidad | **`decimal(14,4)`, obligatoria y siempre `> 0`** (ni negativa ni cero), garantizado por `CHECK`. Heredado de **QC-24** |
| 2026-09-03 | ¿El pedido registra a quién se le vende? | **No, y es deliberado.** No hay cliente ni destinatario. No existe catálogo de clientes ni ficha que lo cree, y **no se crea ninguna**. Coste asumido y anotado: añadirlo después obliga a decidir qué cliente llevaban los pedidos ya cargados |
| 2026-09-03 | ¿El pedido lleva un número visible? | **Sí: correlativo automático que asigna el sistema**, único y creciente. **Se reinicia cada año** (`2026-0001`, `2027-0001`), así que el año forma parte de su identidad. Dentro de un mismo año **no se reutiliza** aunque el pedido se borre — el borrado es lógico y la fila sigue existiendo |
| 2026-09-03 | ¿Hay columna de fecha de solicitud? | **No se crea.** La pone el sistema y no se edita, o sea que es exactamente `created_at`. Una segunda columna con el mismo dato solo puede divergir. **Cambia lo que decía la ficha del board**, corregido antes de sembrar |
| 2026-09-03 | ¿La unidad del pedido es obligatoria? | **Sí.** FK al catálogo de **QC-32** con `ON DELETE RESTRICT`. Sin unidad, una cantidad y un precio unitario no se pueden interpretar ni sumar. Se aparta de **QC-14** (unidad opcional en el producto) y sigue a **QC-24** (obligatoria en la línea de receta) |
| 2026-09-03 | Estado inicial del pedido | **`PENDIENTE` por defecto.** El estado es obligatorio |
| 2026-09-03 | Prioridad por defecto | **`BAJA`.** La prioridad es opcional: no indicarla significa baja |
| 2026-09-03 | ¿Se puede borrar un pedido entregado? | **No.** Se garantiza con **`CHECK` en la base** —`deleted_at IS NULL OR status <> 'ENTREGADO'`— y no solo con una validación de aplicación en QC-34. Misma filosofía que **QC-20 D16**: sin garantía en la base no es una garantía real |
| 2026-09-03 | ¿Qué transiciones de estado son válidas? | **No entran aquí.** Van a **QC-34**, junto con el resto de reglas de aplicación |
| 2026-09-03 | ¿Qué pasa si se da de baja la receta de un pedido? | **El pedido conserva su referencia** y sigue apuntando a la misma receta. El borrado de receta es lógico (**QC-24**), así que la fila sigue existiendo. Mismo criterio que **QC-20 D5** para el producto |
| 2026-09-03 | Auditoría: quién creó y quién modificó | **`created_by` y `updated_by`, FK real a `users` pero declaradas como escalares SIN `@relation` de Prisma**, con la FK escrita a mano en el `migration.sql`. Heredado de **QC-24**, que a su vez lo hereda de **QC-20 D8**: es lo que impide que el ORM atraviese de `pedidos` a `users` con un `include`, y la guardia de módulos no lo detectaría porque no es un import |
| 2026-09-03 | ¿Puede existir un pedido sin autor? | **Sí: `created_by` y `updated_by` son anulables.** Algo que no es una persona —una importación masiva, un seed— tiene que poder crear pedidos. Un autor vacío significa «no lo creó una persona», no «se perdió el dato». Heredado de **QC-24** |
| 2026-09-03 | Borrado y marcas de tiempo | **Borrado lógico**, con `created_at` / `updated_at` / `deleted_at`. Heredado de **QC-4** y reforzado por `docs/architecture.md > Dominio` n.º 3 |
| 2026-09-03 | Idioma de los identificadores de la DB | **Inglés** (tablas, columnas, índices, restricciones). Heredado de **QC-4** |
| 2026-09-03 | RLS | **Activada y forzada** (`FORCE ROW LEVEL SECURITY`). Heredado de **QC-4 R19**. No sustituye a la autorización en el service (`docs/architecture.md > Acceso a datos y autorizacion`) |
| 2026-09-03 | Migración | `migration.sql` (UP) más `down.sql` (DOWN) obligatorio, y revertirla deja el esquema exactamente como estaba. Heredado de **QC-4 R20** |
| 2026-09-03 | Facturación e impuestos (pregunta abierta n.º 4 del dominio) | **El ERP no factura ni liquida impuestos.** El dinero **sí** entra al modelo, con `decimal(14,4)` y nunca `float`, y los cálculos —el total del pedido— son **internos y derivados**, no columnas. **Cierra la pregunta abierta n.º 4**, que llevaba abierta desde el inicio del proyecto; queda el fleco de si algún día se exporta a un contable externo (pregunta abierta 1) |
| 2026-09-03 | Permisos | **Aquí no se deciden**: no hay service en esta ficha. Los fija **QC-34**, con su test (`CHECKPOINTS.md > Permisos`) |
| 2026-09-03 | E2E | **Diferido con motivo**: no hay pantalla ni flujo navegable, es esquema y migración. Lo decide **QC-35**. Mismo criterio que QC-14, QC-24 y QC-32 |
| 2026-09-03 | Librería nueva | **Ninguna.** Es esquema Prisma, migración y el armazón del módulo. Regla 7 de `CLAUDE.md` sin propuesta que abrir |
