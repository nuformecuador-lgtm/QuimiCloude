# QC-156 — pedido-con-cliente · requirements.md

> **Zona** fullstack · **Complejidad** — (la asigna el leader en F1.0) · **depends_on** QC-154 · **Rama** feature/QC-156-pedido-con-cliente
>
> **Alcance.** El pedido guarda un **cliente opcional** del módulo `clientes`. Columna nueva en
> `orders` (nullable, FK compuesta `(company_id, customer_id)`), selector de cliente en el
> formulario de pedido, columna «Cliente» en el listado de `/pedidos`, **filtro por cliente** en ese
> listado (autocomplete, reutiliza `components/shared/async-autocomplete.tsx`) y **cambio o
> retirada del cliente en cualquier estado** del pedido. E2E del flujo.
>
> **Lo que NO entra.** Mostrar el cliente en Asignación, Empaque o Terminados (decisión: no se
> muestra; sin ficha). Buscar por cliente desde la caja de texto: la caja sigue buscando solo por
> receta (QC-68/QC-122). Cualquier cambio en el módulo `clientes` (QC-153/154/155): `clientes`
> sigue sin nombrar `pedidos`.
>
> Sembrado por `/afinar-feature` el 2026-10-06. El bloque de Alcance y la tabla de «Decisiones cerradas»
> los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los reescribe: su
> trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

Notación EARS (`docs/specs.md`). **«El sistema»** es aquí: el módulo **`pedidos`** (casos de uso,
puertos y adaptadores), el **servicio de lectura de clientes** que `clientes` publica por su contrato
para que `pedidos` lo consuma (P5, cerrada), su cableado en `lib/composition/index.ts`, la migración de
esta ficha y la pantalla **`/pedidos`**. El modelo `Customer` y el CRUD de clientes ya existen
(QC-153, QC-154, QC-155) y **no se re-especifican**.

Términos usados abajo:

- **Cliente vivo**: cliente de la empresa del actor sin marca de baja.
- **Cambio de cliente**: la operación **dedicada** que elige, cambia o quita el cliente de un pedido
  existente sin pasar por el formulario general de edición. Es la única vía en estados cerrados.
- **Los siete estados**: `PENDIENTE`, `EN_CURSO`, `BLOQUEADO`, `POR_EMPACAR`, `EN_EMPAQUE`,
  `ENTREGADO`, `CANCELADO`.
- **Nombre del cliente**: «Nombres Apellidos» del cliente, sin ningún otro dato (P4, cerrada).
- **Filtro «sin cliente»**: el valor del filtro «Cliente» que pide los pedidos que no tienen
  cliente (P2, cerrada). No es un cliente: no viene del catálogo de clientes.
- **Igual al guardado** (para R13), dato por dato, comparando la edición con el pedido guardado:
  - **receta**: la receta efectiva indicada (la versión si se indica una, la original si no) es la
    guardada;
  - **cantidad**: el mismo valor numérico, sin importar los ceros de la parte decimal (`10` es
    igual a `10.0000`);
  - **prioridad** y **unidad**: idénticas. Un pedido guardado sin unidad nunca es igual;
  - **reparto**: las mismas líneas, en cualquier orden, con el mismo número de líneas. Una línea
    con envase es igual si tiene el mismo envase y el mismo número de envases; una línea antigua
    sin envase, si tiene la misma presentación y el mismo número de envases.

  El permiso de guardar el pedido bloqueado si el material no alcanza no es un dato del pedido y
  no cuenta.

### Modelo y migración

**R1.** El sistema DEBE permitir que un pedido guarde **como máximo un** cliente y DEBE aceptar
pedidos **sin** cliente, nuevos o existentes, sin exigir ningún valor.

**R2.** CUANDO se aplica la migración de esta ficha sobre una base que ya tiene pedidos, el sistema
DEBE dejarlos todos **sin cliente** y NO DEBE modificar ninguna otra columna de esas filas.

**R3.** El sistema DEBE impedir **en la base** que un pedido apunte a un cliente que no existe o que
pertenece a una empresa distinta de la del pedido. Un pedido sin cliente DEBE seguir siendo válido.

**R4.** CUANDO se revierte la migración de esta ficha, el esquema DEBE quedar **exactamente** en el
estado previo: sin la columna de cliente en `orders`, sin su índice ni su restricción, y con
`customers` y el resto de `orders` intactos.

**R5.** El modelo `Order` DEBE declarar **una sola** referencia a cliente —la de esta ficha— y NO DEBE
declarar ninguna otra columna de cliente, destinatario o comprador. El esquema NO DEBE declarar ningún
modelo de cliente distinto de `Customer`.

### Autorización y actor

**R6.** SI el actor no tiene `pedidos.modificar`, ENTONCES el sistema DEBE rechazar con el error de
autorización estas cuatro operaciones: indicar un cliente en el alta o en la edición, el cambio de
cliente, y listar clientes para el selector del formulario o del cambio. Y NO DEBE leer ni escribir
nada por ningún puerto.

**R7.** SI el actor no tiene `pedidos.consultar`, ENTONCES el sistema DEBE rechazar con el error de
autorización estas operaciones: el listado de pedidos (con o sin filtro por cliente), la ficha del
pedido, listar clientes para el filtro y resolver el cliente de un filtro. Y NO DEBE leer nada por
ningún puerto.

**R8.** El sistema NO DEBE exigir `clientes.consultar` ni `clientes.modificar` para ninguna
operación de esta ficha. CUANDO el actor tiene el permiso de `pedidos` que R6 o R7 piden y **ningún**
permiso de `clientes`, la operación DEBE autorizarse.

**R9.** El sistema DEBE recibir el actor —identificador, empresa y permisos— como parámetro de cada
caso de uso de esta ficha, y NO DEBE tomar la empresa de la entrada. CUANDO una Server Action de
esta ficha se ejecuta, DEBE leer la sesión **una sola vez** por invocación y NO DEBE repetir la
comprobación de permiso.

### Escritura del cliente

**R10.** CUANDO un actor autorizado da de alta un pedido indicando un cliente vivo de su empresa, el
sistema DEBE guardar esa referencia en el pedido. CUANDO no indica cliente, o lo indica vacío, DEBE
guardar el pedido sin cliente.

**R11.** SI el alta, la edición o el cambio de cliente indican un cliente que no existe, que tiene
marca de baja, que pertenece a otra empresa o cuyo identificador no tiene forma de uuid, ENTONCES el
sistema DEBE rechazar la operación con `customer_not_found` y NO DEBE escribir ninguna fila. En el
último caso (identificador sin forma de uuid) NO DEBE consultar el catálogo de clientes. Excepción:
R12.

**R12.** CUANDO una edición o un cambio de cliente indican **el mismo** cliente que el pedido ya
tiene, el sistema DEBE aceptarlo aunque ese cliente tenga marca de baja.

**R13.** CUANDO se edita un pedido por el formulario general, el sistema DEBE tratar el cliente como
parte del **reemplazo completo** de los datos del pedido: SI el cliente no llega o llega vacío,
ENTONCES el pedido DEBE quedar sin cliente. CUANDO esa edición indica un cliente **distinto** del
guardado y la receta, la cantidad, la prioridad, la unidad y el reparto son **iguales al guardado**,
el sistema DEBE guardar **solo** el cliente con las garantías de R15: NO DEBE recalcular el coste,
NO DEBE crear, cambiar ni liberar ninguna reserva, NO DEBE mover el estado y NO DEBE consultar los
catálogos de recetas, inventario ni unidades. CUANDO la edición cambia cualquiera de esos otros
datos, o no cambia ningún dato, el sistema DEBE comportarse como antes de esta ficha (reemplazo
completo, con recálculo de coste y de reservas). La regla de estados de la edición general sigue
aplicando en los dos casos. *(Cierra P6.)*

**R14.** CUANDO un actor con `pedidos.modificar` hace un cambio de cliente sobre un pedido vivo de
su empresa, el sistema DEBE aceptarlo en **cualquiera de los siete estados**, incluidos `ENTREGADO` y
`CANCELADO`. La regla de transiciones de la edición general NO DEBE aplicarse a esta operación.

**R15.** CUANDO un cambio de cliente se acepta, el sistema DEBE modificar **solo** tres datos del
pedido: la referencia al cliente, el autor de la última modificación y el instante de la última
modificación. NO DEBE modificar ningún otro dato del pedido: estado, motivo de cancelación, receta,
cantidad, prioridad, unidad, reparto, coste de ingredientes y de envases, instante de reserva,
instante de terminado ni empacador. Tampoco DEBE crear, cambiar ni liberar ninguna reserva ni ningún
movimiento de inventario, ni tocar los responsables asignados.

**R16.** CUANDO un cambio de cliente quita el cliente de un pedido, el sistema DEBE dejar el pedido
sin cliente con las mismas garantías de R14 y R15.

**R17.** CUANDO un cambio de cliente modifica la referencia, el sistema DEBE hacer tres cosas:
registrar al actor como autor de la última modificación, registrar el instante de la última
modificación y dejar intactos el autor y el instante de creación. CUANDO el cambio indica el mismo
cliente que el pedido ya tiene, NO DEBE escribir nada. *(Cierra P1.)*

**R18.** SI el cambio de cliente apunta a un pedido que no existe, que tiene marca de baja o que es
de otra empresa, ENTONCES el sistema DEBE responder `order_not_found` y NO DEBE escribir nada. Aparte
del cliente, NO DEBE dar efecto a ninguna otra clave de la entrada del cambio de cliente.

### Lectura

**R19.** CUANDO se lista pedidos o se consulta la ficha de un pedido, cada pedido DEBE traer su
cliente como **identificador, nombre del cliente y marca de baja**, o la ausencia de cliente. El
sistema NO DEBE devolver en ninguna salida de `pedidos` el teléfono, el correo, la dirección ni la
ciudad del cliente.

**R20.** MIENTRAS el cliente de un pedido tenga marca de baja, el sistema DEBE seguir devolviendo su
nombre con la marca de baja, y la pantalla DEBE mostrarlo seguido de «(eliminado)».

**R21.** El sistema DEBE resolver los clientes de una página del listado con **una sola** consulta
al servicio de clientes por página, con los identificadores sin repetir. SI ningún pedido de la
página tiene cliente, ENTONCES NO DEBE hacer esa consulta.

**R22.** El sistema NO DEBE añadir el cliente a lo que `pedidos` publica a otros módulos (el
catálogo de pedidos que usan Asignación, Empaque y Terminados). Ninguna pantalla de esas tres DEBE
mostrar el cliente.

### Filtro y búsqueda

**R23.** CUANDO el listado trae un filtro por cliente, el sistema DEBE devolver solo los pedidos de
la empresa del actor cuyo cliente sea uno de los indicados. CUANDO trae el filtro «sin cliente», DEBE
devolver solo los pedidos de la empresa del actor que no tienen cliente. CUANDO trae los dos, DEBE
devolver la **unión** de ambos conjuntos. El total DEBE contar solo los pedidos devueltos. El filtro
DEBE combinarse con los de estado, prioridad y fecha y con la búsqueda por receta, y aplicarse en la
base **antes** de paginar.

**R24.** SI el filtro por cliente trae un valor sin forma de uuid, o el filtro «sin cliente» trae un
valor distinto del único que admite, ENTONCES el sistema DEBE omitir ese valor sin fallar y registrar
solo el nombre del campo omitido. SI a uno de los dos filtros no le queda ningún valor, ENTONCES DEBE
tratarlo como ausencia de ese filtro.

**R25.** La caja de búsqueda del listado NO DEBE buscar por cliente: un término que coincide solo con
el nombre de un cliente NO DEBE devolver pedidos por esa coincidencia.

**R26.** El sistema NO DEBE declarar el cliente como campo ordenable del listado de pedidos. Una
petición de orden por cliente DEBE omitirse como cualquier campo no declarado. *(Cierra P3.)*

**R27.** CUANDO se piden clientes para el **filtro**, el sistema DEBE devolver clientes de la empresa
del actor, **incluidos los que tienen marca de baja** (identificados como tales), paginados —**10**
por defecto, **25** como máximo— en orden de apellidos, nombres e identificador. Con término de
búsqueda, DEBE devolver solo aquellos en que cada palabra del término aparece en sus nombres,
apellidos o ciudad, sin distinguir acentos ni mayúsculas. La opción «Sin cliente» de R34 NO DEBE
salir de esta consulta. *(Cierra P2.)*

**R28.** CUANDO se piden clientes para el **selector del formulario o del cambio de cliente**, el
sistema DEBE devolver **solo clientes vivos** de la empresa del actor, con la misma paginación, orden
y búsqueda de R27.

**R29.** CUANDO la pantalla abre con un filtro por cliente en la dirección, DEBE mostrar el nombre de
ese cliente en el control del filtro. SI el identificador no corresponde a ningún cliente de la
empresa del actor, ENTONCES DEBE descartar el filtro y mostrar la lista sin él. CUANDO la pantalla
abre con el filtro «sin cliente» en la dirección, DEBE mostrar «Sin cliente» en el control y NO DEBE
consultar el catálogo de clientes para ello.

### Pantalla `/pedidos`

**R30.** La lista de pedidos DEBE mostrar una columna «Cliente» con el nombre del cliente de cada
pedido. Un pedido sin cliente DEBE mostrar el marcador de ausencia de la pantalla. La columna NO
DEBE ofrecer orden ni filtro propio en su cabecera.

**R31.** El formulario de alta y de edición del pedido DEBE ofrecer un campo «Cliente» **opcional**,
con autocompletado sobre el componente compartido `components/shared/async-autocomplete.tsx`. En la
edición DEBE venir precargado con el cliente actual, y DEBE poder quedar vacío.

**R32.** MIENTRAS el actor tenga `pedidos.modificar`, el menú de acciones de cada fila DEBE ofrecer
la acción «Cliente» en **los siete estados**. Esa acción DEBE abrir un diálogo que permita elegir,
cambiar o quitar el cliente. SI el actor no tiene `pedidos.modificar`, ENTONCES la acción NO DEBE
pintarse.

**R33.** CUANDO un cambio de cliente desde el diálogo termina con éxito, la pantalla DEBE hacer
tres cosas: cerrar el diálogo, avisar con un aviso emergente (toast) y refrescar la lista
conservando página, tamaño, orden y filtros. CUANDO termina con error, DEBE mostrar el mensaje del
catálogo de errores para ese código y dejar el diálogo abierto.

**R34.** La pantalla DEBE ofrecer un filtro «Cliente» **aparte** de la caja de búsqueda, con
autocompletado sobre el mismo componente compartido. Su valor DEBE vivir en la dirección de la
página, de modo que recargar o compartir el enlace lo conserve. Elegir o limpiar el cliente DEBE
volver a la primera página y conservar los demás filtros, el orden y la búsqueda. El filtro DEBE
ofrecer la opción «Sin cliente» **antes** de los clientes, en la primera página de opciones, cuando
no hay término de búsqueda o cuando cada palabra del término aparece en «Sin cliente» sin distinguir
acentos ni mayúsculas. Elegirla DEBE mostrar solo los pedidos sin cliente (R23). El control DEBE
tener **un solo** valor a la vez: elegir un cliente sustituye «Sin cliente», y al revés.

**R35.** Los controles nuevos de esta ficha DEBEN medir al menos 44×44 px de objetivo táctil y NO
DEBEN depender de `:hover` para descubrirse ni para usarse.

### Fronteras del módulo

**R36.** Ningún archivo de `lib/modules/clientes/` DEBE nombrar el módulo `pedidos`, su modelo ni su
tabla. `lib/modules/pedidos/` DEBE importar de `clientes` **solo** por su contrato
(`@/lib/modules/clientes`), y ningún archivo de `pedidos` DEBE consultar el modelo de cliente ni
nombrar la tabla `customers`. Ningún archivo de `app/` fuera de `app/(private)/clientes/` DEBE nombrar
la ruta, la tabla ni los permisos de clientes.

**R37.** El contrato de `clientes` DEBE publicar un servicio de lectura que exponga de cada cliente
**solo** identificador, nombres, apellidos y marca de baja. Las cinco operaciones de `clientes`, sus
permisos y su pantalla NO DEBEN cambiar de comportamiento. *(Cierra P5 y P4: sin ciudad.)*

**R38.** El sistema DEBE señalar «cliente no encontrado» con el código ya existente
`customer_not_found`. NO DEBE añadir ni renombrar ningún código del catálogo cerrado de errores, ni
ningún permiso del catálogo cerrado de permisos.

**R39.** El sistema NO DEBE incorporar ninguna dependencia de terceros nueva.

### Extremo a extremo

**R40.** El sistema DEBE tener una prueba E2E del flujo que demuestre cuatro cosas:
**(a)** crear un pedido con cliente y ver su nombre en la columna «Cliente»;
**(b)** filtrar la lista por ese cliente y ver solo sus pedidos;
**(c)** cambiar el cliente de un pedido en `ENTREGADO` o `CANCELADO` sin que cambie su estado;
**(d)** un usuario con `pedidos.consultar` y sin `pedidos.modificar` no ve la acción «Cliente», y el
servidor le rechaza el cambio si lo intenta.

### Cobertura de las decisiones cerradas

Cada fila de `## Decisiones cerradas (no reabrir)`, en el orden en que está escrita, con el
requisito que la hace testeable (regla 4 de `CLAUDE.md`). Las filas 10 a 13 son las preguntas que el
humano cerró en F1.4 (2026-10-06).

| # | Decisión cerrada | Requisito(s) |
| --- | --- | --- |
| 1 | Opcional siempre; los existentes sin cliente; columna nullable | R1, R2, R10, R13, R16 |
| 2 | Se ve en el listado y en el formulario; no en Asignación, Empaque ni Terminados | R19, R22, R30, R31 |
| 3 | Filtro aparte con autocomplete que reutiliza `async-autocomplete`; la caja de búsqueda no cambia | R23, R24, R25, R27, R29, R34 |
| 4 | Solo permisos de pedidos; sin `clientes.*`; autorización en el service | R6, R7, R8, R9, R28, R32 |
| 5 | Cambio en cualquier estado; no toca estado, reservas, coste ni responsables | R14, R15, R16, R32, R33 |
| 6 | Cliente eliminado: el pedido conserva la referencia y muestra «(eliminado)»; el selector no ofrece eliminados | R11, R12, R20, R28 |
| 7 | Inglés, FK compuesta a `customers_company_id_id_key`, aislamiento por empresa, `pedidos` → `clientes` por `index.ts` y nunca al revés, guardia `pedidos-schema.test.ts:229` retirada | R3, R4, R5, R9, R11, R23, R36, R37 |
| 8 | E2E: crear con cliente, filtrar, cambiar en pedido cerrado, rol sin `pedidos.modificar` | R40 |
| 9 | Ninguna librería | R39 |
| 10 | P2: el filtro ofrece «Sin cliente» y los clientes eliminados marcados | R23, R24, R27, R29, R34 |
| 11 | P4: «Nombres Apellidos», sin ciudad | R19, R37 |
| 12 | P5: servicio de lectura aditivo `CustomerCatalog` en `clientes` | R36, R37 |
| 13 | P6 (b): en estados abiertos, si la edición solo cambia el cliente, se guarda solo el cliente | R13, R15 |

Requisitos que no salen de una fila de la tabla, y de dónde salen:

- **R17**: cierra P1.
- **R18** y **R38**: códigos de error con el precedente de QC-154 R23 y R34.
- **R21**: una consulta por página, como QC-34 R45 con las recetas.
- **R26**: cierra P3.
- **R35**: regla multiplataforma de `docs/architecture.md`, que QC-35 aplica como R45.

## Preguntas abiertas

Ninguna.

- **P1** (rastro de quién cambió el cliente) y **P3** (orden por «Cliente») se cerraron con
  precedente en F1.2: **R17** y **R26**. Su razonamiento sigue abajo.
- **P2, P4, P5 y P6** las cerró el humano en F1.4 el 2026-10-06: filas 10 a 13 de la tabla de
  cobertura y las cuatro últimas filas de `## Decisiones cerradas (no reabrir)`. El texto con que se
  plantearon está en el commit `3f961993`.

- **P1. Rastro de quién cambió el cliente en un pedido ya cerrado.** Basta `updated_by` /
   `updated_at`: no hay historial por campo en `pedidos`, la auditoría reforzada de
   `docs/architecture.md > Dominio` n.º 3 no aplica porque cambiar el cliente no mueve existencias
   ni dinero (R15), y una tabla de historial sería infraestructura no pedida. Si el humano quiere
   historial, es otra ficha.

- **P3. Orden por la columna «Cliente».** No ordenable: `ORDER_QUERYABLE` solo declara columnas
  propias de `orders`, y «Receta», «Cobertura» y «Responsables» tampoco ordenan por un dato de otro
  módulo (`app/(private)/pedidos/components/order-columns.tsx:260` y `:277`).

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-10-06 | ¿Es obligatorio? ¿Y los pedidos existentes? | **Opcional siempre**, en pedidos nuevos y viejos. Los existentes quedan sin cliente; no se rellenan. Columna nullable. |
| 2026-10-06 | ¿Dónde se ve? | Columna «Cliente» en el listado de `/pedidos` y campo en el formulario. **No** se ve en Asignación, Empaque ni Terminados. |
| 2026-10-06 | ¿Cómo se busca por cliente? | **Filtro aparte** «Cliente» en el listado, con autocomplete que **reutiliza el componente existente** (`async-autocomplete`). La caja de búsqueda no cambia. |
| 2026-10-06 | ¿Quién puede? | **Solo permisos de pedidos**: `pedidos.modificar` para elegir, cambiar o quitar el cliente (incluye listar clientes en el selector); `pedidos.consultar` para verlo y filtrar. No se exige `clientes.consultar`. Autorización en el service. |
| 2026-10-06 | ¿Hasta cuándo se cambia? | **En cualquier estado**, incluidos `ENTREGADO` y `CANCELADO`. La regla de estados de la edición normal no aplica a este campo. Cambiar el cliente no toca estado, reservas, coste ni responsables. |
| 2026-10-06 | ¿Y si se elimina el cliente? | Se permite (QC-154 no cambia). El pedido **conserva** la referencia y muestra el nombre con «(eliminado)». El selector del formulario no ofrece eliminados. |
| 2026-10-06 | Fronteras y modelo | Heredado: identificadores en inglés (QC-4), FK compuesta a `customers_company_id_id_key` (QC-153), aislamiento por empresa (QC-59). `pedidos` importa de `clientes` por su `index.ts`; nunca al revés (QC-154 R40). La guardia `pedidos-schema.test.ts:229` («vigente hasta QC-156») se retira. |
| 2026-10-06 | ¿E2E? | **Sí**, por permisos y por exponer datos personales de clientes: crear un pedido con cliente, filtrar por cliente, cambiar el cliente en un pedido cerrado, y un rol sin `pedidos.modificar` no puede cambiarlo. |
| 2026-10-06 | ¿Librería? | No hace falta. |
| 2026-10-06 | P2: ¿el filtro ofrece «Sin cliente»? ¿Y clientes eliminados? | **Sí a las dos.** El filtro «Cliente» ofrece la opción «Sin cliente» (pedidos sin cliente) y también los clientes eliminados, marcados como tales. |
| 2026-10-06 | P4: ¿cómo se nombra al cliente y cómo se distinguen homónimos? | **«Nombres Apellidos», sin ciudad.** Se mantiene la posición por defecto: ningún otro dato. |
| 2026-10-06 | P5: ¿puede `clientes` publicar un servicio de lectura para `pedidos`? | **Aprobado** el servicio de lectura aditivo `CustomerCatalog` en `clientes` (R37), tal como está: no cambia el comportamiento de `clientes`. |
| 2026-10-06 | P6: ¿editar solo el cliente por el formulario general recalcula el coste? | **Alternativa (b).** En estados abiertos, si la edición general solo cambia el cliente (el resto de datos igual al guardado), no se recalcula el coste ni se resincronizan las reservas: se guarda solo el cliente. Si cambia cualquier otro dato, comportamiento de siempre. |
