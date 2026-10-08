# QC-215 — estados-de-acondicionamiento · requirements.md

> Zona: backend · Complejidad: — (la asigna el leader en F1.0) · depends_on: — · Rama: feature/QC-215-estados-de-acondicionamiento
>
> **Alcance.** El pedido gana dos estados entre `EN_EMPAQUE` y `ENTREGADO`: `POR_ACONDICIONAR` y
> `EN_ACONDICIONAMIENTO`. Terminar el empaque deja el pedido `POR_ACONDICIONAR`, ya no
> `ENTREGADO` (enmienda a QC-168). Esta ficha crea los estados, las transiciones de dominio
> (comenzar y terminar el acondicionamiento) y su reflejo en la vista «Todos».
>
> **Lo que NO entra.** El rol y su permiso (QC-216). La pestaña y el detalle (QC-217). La acción
> Acondicionar con equipo y el bloqueo de 5 s (QC-218). Los datos de lote (QC-219). El registro
> en el log de ejecución (QC-82).
>
> Sembrado por `/afinar-feature` el 2026-10-06. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

> Notación EARS (`docs/specs.md`). Cada requisito cita entre corchetes las filas de «Decisiones
> cerradas» que lo originan, numeradas en el orden de la tabla: **[D1]** flujo · **[D2]** producto
> terminado sin cambios · **[D3]** `finished_at` · **[D4]** no se cancela · **[D5]** quién toma el
> pedido · **[D6]** por permiso · **[D7]** nombres y sin migración de datos · **[D8]** «Todos» ·
> **[D9]** E2E · **[D10]** dependencia · **[D11]** encadenado con QC-202 · **[D12]** QC-215 crea
> `TERMINADO`. **[P1]** marca lo que quedó resuelto por D12: lo implementa esta feature.
>
> Vocabulario fijo:
>
> - «el permiso» = `acondicionamiento.modificar` (lo crea QC-216, `lib/modules/identity/domain/permissions.ts`).
> - «comenzar» / «terminar el acondicionamiento» = los dos casos de uso nuevos de esta ficha. No
>   tienen pantalla ni Server Action: los consume QC-218.
> - «quien acondiciona» = la persona que comenzó el acondicionamiento del pedido, guardada en el
>   pedido (`design.md > 1`).
> - «los estados de acondicionamiento» = `POR_ACONDICIONAR` y `EN_ACONDICIONAMIENTO`.

### Estados y transiciones

**R1.** El conjunto de estados de pedido DEBE contener `POR_ACONDICIONAR` y `EN_ACONDICIONAMIENTO`,
en ese orden, declarados detrás de todos los valores que el tipo tenía antes de esta feature, que
DEBEN conservar su orden. La lista de estados del dominio de `pedidos` DEBE coincidir con el enum del
esquema, valor a valor y en orden. [D1, D7]

**R2.** La lista de estados en el orden del flujo DEBE ser exactamente `PENDIENTE`, `EN_CURSO`,
`POR_EMPACAR`, `EN_EMPAQUE`, `POR_ACONDICIONAR`, `EN_ACONDICIONAMIENTO`, `TERMINADO`, `ENTREGADO`,
`CANCELADO`, `BLOQUEADO`. [D1, D11]

**R3.** La matriz de cambios de estado de un pedido DEBE permitir exactamente estos pares:

- `PENDIENTE` → `PENDIENTE`, `EN_CURSO`, `BLOQUEADO`;
- `EN_CURSO` → `EN_CURSO`, `POR_EMPACAR`;
- `POR_EMPACAR` → `EN_EMPAQUE`;
- `EN_EMPAQUE` → `POR_ACONDICIONAR`;
- `POR_ACONDICIONAR` → `EN_ACONDICIONAMIENTO`;
- `EN_ACONDICIONAMIENTO` → `TERMINADO`;
- `TERMINADO` → `ENTREGADO`;
- `BLOQUEADO` → `BLOQUEADO`, `PENDIENTE`;
- `ENTREGADO` y `CANCELADO` → ninguno.

Cualquier otro par entre los diez estados DEBE rechazarse con `invalid_transition`. En particular
dejan de ser legales `EN_EMPAQUE → ENTREGADO` y `EN_EMPAQUE → TERMINADO`, y no son legales
`POR_ACONDICIONAR → ENTREGADO`, `EN_ACONDICIONAMIENTO → ENTREGADO`, ni que un estado de
acondicionamiento se quede igual. [D1, D11]

**R4.** La transición genérica del catálogo de pedidos (la que usa Finalizar) DEBE rechazar con
`invalid_transition` los destinos `EN_EMPAQUE`, `POR_ACONDICIONAR`, `EN_ACONDICIONAMIENTO`,
`TERMINADO` y `ENTREGADO`, sin abrir transacción ni escribir. [D1, D11]

### Terminar el empaque (enmienda a QC-168)

**R5.** CUANDO el empacador que tiene un pedido `EN_EMPAQUE` lo termina con éxito, el sistema DEBE
dejarlo en `POR_ACONDICIONAR`, nunca en `ENTREGADO` ni en `TERMINADO`. En la misma operación DEBE
conservar `packedBy`, consumir los envases del reparto y dar entrada a un lote de producto terminado
por línea, igual que hoy. DEBE dejar `finishedAt` y quien acondiciona vacíos. [D1, D2, D3]

**R6.** SI Terminar el empaque falla (material insuficiente, receta inexistente, unidades
incompatibles, presentación sin contenido, pedido sin unidad, otro empacador o estado que no admite
Terminar), ENTONCES el pedido DEBE seguir en su estado previo, sin `finishedAt`, sin consumo de
envases y sin lotes de producto terminado, con el mismo error que hoy. [D2]

**R7.** CUANDO Terminar el empaque tiene éxito, la confirmación que pinta la pestaña «Por empacar»
DEBE decir «Pedido <número> empacado», y NO DEBE decir «entregado». *(Texto propuesto: se confirma
al aprobar el spec.)* [D1]

### Comenzar el acondicionamiento

**R8.** CUANDO un actor con el permiso comienza el acondicionamiento de un pedido vivo de su empresa
que está `POR_ACONDICIONAR`, el sistema DEBE, en una sola escritura:

- dejarlo `EN_ACONDICIONAMIENTO`;
- guardar al actor como quien acondiciona y como autor de la última modificación;
- conservar `packedBy`.

NO DEBE mover existencias, dar de alta lotes ni escribir `finishedAt`. [D1, D2, D5]

**R9.** SI el pedido ya está `EN_ACONDICIONAMIENTO` y quien acondiciona es el propio actor,
ENTONCES comenzar DEBE terminar con éxito sin escribir nada. SI quien acondiciona es otra persona,
ENTONCES DEBE rechazarse con `order_conditioning_taken`, sin escribir. [D5]

**R10.** CUANDO dos actores con el permiso comienzan a la vez el mismo pedido `POR_ACONDICIONAR`, el
sistema DEBE dejar exactamente a uno de ellos como quien acondiciona. El otro DEBE recibir
`order_conditioning_taken`. [D5]

**R11.** El sistema NO DEBE exigir que el actor sea responsable del pedido ni miembro de ningún
grupo para comenzar: cualquier actor con el permiso DEBE poder comenzar cualquier pedido
`POR_ACONDICIONAR` de su empresa. [D5]

### Terminar el acondicionamiento

**R12.** CUANDO quien acondiciona un pedido `EN_ACONDICIONAMIENTO` lo termina, el sistema DEBE, en
una sola escritura:

- dejarlo en `TERMINADO`, nunca en `ENTREGADO`;
- escribir `finishedAt` con el instante de la operación;
- conservar `packedBy` y quien acondiciona.

NO DEBE mover existencias ni dar de alta lotes. [D1, D2, D3, D11]

**R13.** SI un actor con el permiso intenta terminar un pedido `EN_ACONDICIONAMIENTO` que acondiciona
otra persona, ENTONCES el sistema DEBE rechazarlo con `order_conditioning_taken`. El pedido DEBE
quedar en su estado, sin `finishedAt`. [D5]

### Errores comunes y autorización

**R14.** SI el pedido no existe, está dado de baja o es de otra empresa, ENTONCES comenzar y
terminar DEBEN rechazar con `order_not_found`. SI está en un estado que la acción no admite,
ENTONCES DEBEN rechazar con `order_not_conditionable`:

- comenzar no admite ninguno distinto de `POR_ACONDICIONAR` y de su propio `EN_ACONDICIONAMIENTO`;
- terminar no admite ninguno distinto de `EN_ACONDICIONAMIENTO`.

En los dos casos, sin escribir. [D1]

**R15.** SI el actor es nulo o no tiene el permiso, ENTONCES comenzar y terminar DEBEN rechazar con
`unauthorized`, antes de validar la entrada y sin invocar ningún puerto. Vale en particular para un
actor con exactamente los permisos de semilla del `Administrador` o del `Empacador`. [D5, D6]

**R16.** SI la entrada de comenzar o de terminar no es exactamente `{ orderId: <uuid> }`, ENTONCES
el sistema DEBE rechazar con `invalid_input`, sin invocar ningún puerto. [D6]

**R17.** Ningún archivo de producción DEBE decidir el acondicionamiento por nombre de rol: la
guardia de autorización por permiso DEBE seguir en verde. El código del permiso DEBE aparecer
únicamente en el catálogo de permisos y en los dos casos de uso de esta feature. Así se relaja
QC-216 R17 abriendo esas dos rutas exactas. [D6]

### Los estados de acondicionamiento son cerrados

**R18.** SI se cancela un pedido en un estado de acondicionamiento, ENTONCES el sistema DEBE
rechazar con `not_cancellable`, sin modificar ninguna fila ni liberar nada. [D4]

**R19.** SI se borra un pedido en un estado de acondicionamiento, ENTONCES el sistema DEBE rechazar
con `not_deletable`. SI se edita, ENTONCES DEBE rechazar con `invalid_transition`. Vale para la
edición general y para la edición acotada de reparto y unidad. En los dos casos, sin modificar
ninguna fila. [D4]

**R20.** SI se intenta asignar responsables, quitar un grupo de trabajo o desasignar a un
responsable de un pedido en un estado de acondicionamiento, ENTONCES el sistema DEBE rechazar con
`order_produced_frozen`, sin escribir. La consulta de sus responsables DEBE seguir respondiendo. [D4]

**R21.** SI un Operador intenta leer, comenzar o finalizar la ejecución de un pedido en un estado de
acondicionamiento del que es responsable, ENTONCES el sistema DEBE rechazar con el mismo error que
hoy da con un pedido `EN_EMPAQUE`, sin cambiar el estado ni consumir material. [D4]

**R22.** MIENTRAS un pedido esté en un estado de acondicionamiento, el menú de fila de `/pedidos`
DEBE mostrar «Editar», «Cancelar» y «Eliminar» deshabilitados, NO DEBE mostrar la acción de reparto
y unidad, y DEBE mantener habilitada «Responsables». [D4]

**R23.** Lo que hoy no actúa sobre un pedido `EN_EMPAQUE` NO DEBE actuar sobre un pedido en un
estado de acondicionamiento:

- el proceso programado de caducidad de reservas;
- la revisión que desbloquea pedidos `BLOQUEADO`;
- «Mis asignados» y «Por empacar»;
- el detalle de empaque, que responde `order_not_found`;
- comenzar y terminar el empaque, que responden `order_not_packable`. [D1]

### Base de datos

**R24.** La base DEBE rechazar cualquier fila de `orders` en un estado de acondicionamiento que
tenga `deleted_at` no nulo, `packed_by` nulo o `finished_at` no nulo, aunque la escritura no pase
por la aplicación. [D3, D4]

**R25.** La base DEBE exigir quien acondiciona en `EN_ACONDICIONAMIENTO` y en `TERMINADO`, DEBE
prohibirlo en `PENDIENTE`, `EN_CURSO`, `POR_EMPACAR`, `EN_EMPAQUE`, `POR_ACONDICIONAR`, `CANCELADO`
y `BLOQUEADO`, y DEBE admitirlo con o sin valor en `ENTREGADO`. Quien acondiciona DEBE ser un
usuario de la misma empresa que el pedido. [D5, D7]

### Migración

**R26.** CUANDO se aplican las migraciones UP, el sistema DEBE añadir los estados nuevos sin
modificar ninguna fila de `orders`:

- todo pedido `ENTREGADO` DEBE seguir `ENTREGADO`, con el mismo `finished_at` y el mismo `packed_by`;
- todo pedido `EN_EMPAQUE` DEBE seguir `EN_EMPAQUE`;
- toda fila existente DEBE cumplir las restricciones nuevas.

Añadir los valores al enum DEBE ser idempotente. [D7]

**R27.** CUANDO se aplica `db:rollback` sobre las migraciones de esta feature, el sistema DEBE quitar
la columna de quien acondiciona y dejar las restricciones e índices de `orders` con su texto literal
de antes de esta feature. SI hay algún pedido en un estado añadido por esta feature, ENTONCES la
reversión DEBE abortar entera sin tocar ninguna fila. [D7]

### «Todos» y etiquetas

**R28.** La columna de estado de «Todos» DEBE pintar `POR_ACONDICIONAR` como «Por acondicionar» y
`EN_ACONDICIONAMIENTO` como «En acondicionamiento». Su filtro de estado DEBE:

- ofrecer las dos opciones entre «En empaque» y «Terminado»;
- aceptar los dos valores en el parámetro `status` de la URL;
- devolver, al filtrar por ellos, solo pedidos en esos estados, en el orden de la lista de trabajo.

Sin filtro, «Todos» DEBE incluir los pedidos en los dos estados. [D8]

**R29.** El badge de estado de `/pedidos` DEBE pintar los dos estados con los mismos textos de R28 y
`data-status` igual al valor. El filtro de estado de `/pedidos` DEBE ofrecerlos y aceptarlos en la
URL. [D8]

### `TERMINADO` en la cadena

**R30.** **[P1]** El conjunto de estados DEBE contener `TERMINADO`, y `TERMINADO` DEBE ser cerrado
como `ENTREGADO`:

- editar, cancelar y borrar rechazan con `invalid_transition`, `not_cancellable` y `not_deletable`;
- las escrituras de responsables rechazan con `order_produced_frozen`;
- la base rechaza un `TERMINADO` con `finished_at`, `packed_by` o quien acondiciona nulos, o con
  `deleted_at` no nulo;
- la base rechaza `finished_at` no nulo en cualquier estado distinto de `TERMINADO` y `ENTREGADO`;
- los `ENTREGADO` existentes, con o sin `finished_at` y `packed_by`, siguen siendo válidos.

[D3, D4, D11]

**R31.** **[P1]** CUANDO se lista «Terminados», el sistema DEBE devolver solo los pedidos vivos
`TERMINADO` de la empresa del actor, ordenados por `finishedAt` descendente y después por número
descendente. Los `ENTREGADO` NO DEBEN aparecer. MIENTRAS el actor no tenga
`asignaciones.ejecutar`, la lista DEBE limitarse a los que empacó él, con el filtro, el total y la
paginación resueltos en la consulta. [D3, D11]

**R32.** **[P1]** «Todos», el badge de `/pedidos` y los dos filtros de estado DEBEN pintar y ofrecer
`TERMINADO` como «Terminado». CUANDO el filtro de «Todos» sea exactamente `TERMINADO`, DEBE usar el
orden de terminados (el de R31) y pintar la columna de fecha de terminado. Con exactamente
`ENTREGADO`, DEBE seguir como hoy. [D8, D11]

**R33.** El sistema NO DEBE ofrecer ningún camino de aplicación que escriba `ENTREGADO`: ningún caso
de uso, Server Action, ruta ni control de UI. CUANDO la persistencia cambie un pedido `TERMINADO` a
`ENTREGADO` con su operación genérica de cambio de estado, DEBE conservar `finishedAt`, `packedBy`
y quien acondiciona. Esa operación NO DEBE escribir `finishedAt` con ningún destino: el único
código que lo escribe es terminar el acondicionamiento (R12). [D3, D11]

### Verificación y alcance

**R34.** El sistema DEBE probar R1–R33 con tests unitarios, de integración y guardias. Esta feature
NO DEBE añadir ningún spec nuevo de `e2e/`. Los specs E2E existentes que hoy afirman `ENTREGADO`, o
su aparición en «Terminados», tras Terminar el empaque DEBEN ajustarse a `POR_ACONDICIONAR` en esas
aserciones y en nada más. [D9]

**R35.** Esta feature NO DEBE añadir ninguna dependencia a `package.json`. [D10]

### Cobertura de la tabla de decisiones

| Decisión | Requisitos |
|---|---|
| D1 Flujo (enmendada por D11) | R1, R2, R3, R4, R5, R7, R8, R12, R14, R23 |
| D2 Producto terminado sin cambios | R5, R6, R8, R12 |
| D3 `finished_at` (enmendada por D11) | R5, R12, R24, R30, R31, R33 |
| D4 No se cancela | R18, R19, R20, R21, R22, R24, R30 |
| D5 Quién toma el pedido | R8, R9, R10, R11, R13, R15, R25 |
| D6 Por permiso | R15, R16, R17 |
| D7 Nombres y sin migración de datos | R1, R25, R26, R27 |
| D8 «Todos» | R28, R29, R32 |
| D9 E2E | R34 |
| D10 Dependencia | R35 |
| D11 Encadenado con QC-202 | R2, R3, R4, R12, R30, R31, R32, R33 |
| D12 QC-215 crea `TERMINADO` | R30, R31, R32, R33 |

## Preguntas abiertas

Ninguna. P1 (quién crea `TERMINADO`) se cerró el 2026-10-07: fila D12 de «Decisiones cerradas».

**Pendiente para el leader (no lo toca esta ficha):** `specs/QC-202-estado-terminado-tras-empaque/`
queda desfasado. Sus R2, R3, R5, R6, R11 y R24 asumen `EN_EMPAQUE → TERMINADO`, y con D12 esta
ficha absorbe `TERMINADO`. Toca cancelar QC-202 citando QC-215, o reducirla.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-10-06 | ¿Dónde va el acondicionamiento en el flujo? | **Etapa nueva antes de entregar:** PENDIENTE → EN_CURSO → POR_EMPACAR → EN_EMPAQUE → **POR_ACONDICIONAR** (el Empacador termina) → **EN_ACONDICIONAMIENTO** (el Administrador de acondicionamiento comienza) → ENTREGADO (el mismo termina). Enmienda QC-168. **Enmendada el 2026-10-07 por la fila D11 (QC-202):** el mismo termina → **TERMINADO**, y TERMINADO → ENTREGADO es la entrega al cliente |
| 2026-10-06 | ¿Cuándo entra el producto terminado? | **Sin cambios:** al terminar el empaque, un lote por línea (QC-170). El acondicionamiento no mueve existencia |
| 2026-10-06 | ¿Cuándo se escribe `finished_at`? | **Al entregar**, que ahora es el fin del acondicionamiento. «Terminados» de QC-145 sigue siendo la lista de entregados. Hereda QC-168. **Reabierta y enmendada el 2026-10-07 por la fila D11 (QC-202):** `finished_at` se escribe **al pasar a TERMINADO** (fin del acondicionamiento), y «Terminados» lista **TERMINADO** (QC-202 D5) |
| 2026-10-06 | ¿Se puede cancelar? | **No**, ni Por acondicionar ni En acondicionamiento, como Por empacar y En empaque. Hereda QC-168 |
| 2026-10-06 | ¿Quién toma el pedido? | **Cualquier Administrador de acondicionamiento de la empresa**, sin asignación. El primero que lo comienza se lo queda y **solo él** lo termina. Hereda la regla del empaque (QC-168) |
| 2026-10-06 | ¿Se autoriza por rol? | **Por permiso, nunca por nombre de rol** (QC-86/87). El permiso lo crea QC-216; esta ficha lo consume en el service |
| 2026-10-06 | ¿Nombres y datos existentes? | Estados en castellano y mayúsculas, como los existentes (`POR_ACONDICIONAR`, `EN_ACONDICIONAMIENTO`). **Sin migración de datos:** los ENTREGADO no cambian; los EN_EMPAQUE pasan a Por acondicionar al terminarse. Hereda QC-168 |
| 2026-10-06 | ¿Qué ve el Administrador? | «Todos» (QC-145) muestra los estados nuevos y los incluye en su filtro |
| 2026-10-06 | ¿E2E? | **Diferida a QC-217/QC-218**, que tienen la pantalla. Aquí, tests de integración de las transiciones y de la autorización en el service |
| 2026-10-06 | ¿Dependencia nueva? | **Ninguna librería.** Cambia el enum de estados, por migración |
| 2026-10-07 | ¿Cómo convive con QC-202 (`estado-terminado-tras-empaque`, `TERMINADO`)? | **Se encadenan** (salida (b) de `docs/specs.md > Antes de especificar`): PENDIENTE → EN_CURSO → POR_EMPACAR → EN_EMPAQUE → POR_ACONDICIONAR → EN_ACONDICIONAMIENTO → **TERMINADO** → ENTREGADO. Terminar el acondicionamiento lleva a TERMINADO, no a ENTREGADO; `finished_at` se escribe al pasar a TERMINADO; «Terminados» lista TERMINADO (QC-202 D5); ENTREGADO conserva su sentido de entrega al cliente (QC-156). Enmienda las filas del flujo y de `finished_at`. Quién crea TERMINADO **no está decidido**: `## Preguntas abiertas` P1 (cerrada por la fila siguiente) |
| 2026-10-07 | P1: ¿Quién crea `TERMINADO`? | **(A) QC-215 crea `TERMINADO`** (valor del enum, estado cerrado, `CHECK`, «Terminados» = TERMINADO, etiqueta y filtro: R30–R33). QC-215 no depende de QC-202, que queda absorbida (se cancela o se reduce, cita QC-202) |
