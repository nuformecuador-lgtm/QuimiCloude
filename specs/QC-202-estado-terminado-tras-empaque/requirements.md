# QC-202-estado-terminado-tras-empaque — requirements

> Origen: tarjeta QC-202 y decisiones del humano del 2026-10-04, transmitidas por el leader.
> Base: rama de QC-201 (PR #144, sin mergear): ya existen `asignaciones.ejecutar` y el filtro
> `packedBy` de «Terminados».

## Alcance

**Problema.** Hoy «Terminar» el empaque deja el pedido en `ENTREGADO`. Pero terminar de empacar no
es entregar al cliente: la entrega es otro momento, que llevará su propia ficha (ligada a QC-156).
Hace falta un estado que diga «empacado y con producto terminado en inventario, aún sin entregar».

**Dentro.**
- Estado nuevo `TERMINADO`, al final del enum `OrderStatus`.
- Terminar el empaque pasa a `EN_EMPAQUE -> TERMINADO`, con los mismos efectos que hoy tiene hacia
  `ENTREGADO`.
- Matriz de transiciones: `EN_EMPAQUE -> TERMINADO -> ENTREGADO`, sin nada que dispare la segunda.
- `TERMINADO` es cerrado: no se edita, no se cancela, no se borra (aplicación y base).
- «Terminados» de `/asignacion` lista solo `TERMINADO`.
- Etiqueta «Terminado», badge y opción de filtro en `/pedidos` y en «Todos».
- Migración que solo añade el valor al enum, y otra que ajusta las restricciones y el índice que
  nombran el estado.

**Fuera.**
- Cualquier acción, botón, Server Action o caso de uso que lleve un pedido de `TERMINADO` a
  `ENTREGADO` (ficha aparte, ligada a QC-156).
- Mover a `TERMINADO` los pedidos que ya están en `ENTREGADO` (D4).
- El aviso que ve el Operador al Finalizar (`assigned-order-delivered-notice.tsx`, «Pedido N
  entregado» cuando el pedido pasa a `POR_EMPACAR`): ya era inexacto antes de esta ficha y no
  cambia con ella.
- Limpieza de comentarios desfasados en archivos cuya lógica no cambia (ver `design.md > 2`).

## Decisiones cerradas (no reabrir)

| # | Decisión | Fuente | Cubierta por |
|---|----------|--------|--------------|
| D1 | Estado nuevo `TERMINADO` en `OrderStatus`. Terminar el empaque pasa a `EN_EMPAQUE -> TERMINADO`, con los mismos efectos que hoy hacia `ENTREGADO`: consumir envases, dar entrada al producto terminado y guardar `finishedAt`. | Humano, 2026-10-04 | R1, R3, R4, R24 |
| D2 | `ENTREGADO` se mantiene. En `ALLOWED`, `EN_EMPAQUE` solo va a `TERMINADO` y `TERMINADO` solo va a `ENTREGADO`. Esa transición queda permitida pero sin ninguna acción, botón ni caso de uso que la dispare. | Humano, 2026-10-04 | R2, R5, R6 |
| D3 | `TERMINADO` es cerrado como `ENTREGADO`: no se edita, no se cancela, no se borra. Se extienden a `TERMINADO` las reglas de aplicación y los `CHECK` que hoy citan `ENTREGADO`, donde corresponda. | Humano, 2026-10-04 | R7, R8, R9, R10, R11, R12, R13, R14 |
| D4 | Los pedidos que hoy están en `ENTREGADO` se quedan en `ENTREGADO`. Sin migración de datos. La migración solo añade el valor al enum, al final, como con `BLOQUEADO`. | Humano, 2026-10-04 | R1, R15, R16 |
| D5 | La pestaña «Terminados» de `/asignacion` muestra solo `TERMINADO`. | Humano, 2026-10-04 | R17, R18, R19, R20 |
| D6 | Etiqueta «Terminado» y badge en `/pedidos` y en «Todos», y opción en los filtros de estado. | Humano, 2026-10-04 | R21, R22, R23 |

## Requisitos (EARS)

### Modelo de estados

- **R1.** El conjunto de estados de pedido DEBE contener `TERMINADO` como último valor declarado,
  detrás de `BLOQUEADO`, con los siete valores anteriores en su mismo orden. La lista de estados
  del dominio de `pedidos` DEBE coincidir con el enum del esquema, valor a valor y en orden.
- **R2.** El sistema DEBE permitir, como cambio de estado de un pedido, exactamente estos pares:
  - `PENDIENTE` → `PENDIENTE`, `EN_CURSO`, `BLOQUEADO`;
  - `EN_CURSO` → `EN_CURSO`, `POR_EMPACAR`;
  - `POR_EMPACAR` → `EN_EMPAQUE`;
  - `EN_EMPAQUE` → `TERMINADO`;
  - `TERMINADO` → `ENTREGADO`;
  - `BLOQUEADO` → `BLOQUEADO`, `PENDIENTE`;
  - `ENTREGADO` y `CANCELADO` → ninguno.

  Cualquier otro de los 64 pares DEBE rechazarse con `invalid_transition`.
  En particular, `EN_EMPAQUE -> ENTREGADO` deja de ser legal.

### Terminar el empaque

- **R3.** CUANDO el empacador que tiene un pedido `EN_EMPAQUE` lo termina con éxito, el sistema
  DEBE dejarlo en `TERMINADO`, y nunca en `ENTREGADO`. En la misma operación DEBE: escribir
  `finishedAt` con el instante de la operación, conservar `packedBy`, consumir los envases del
  reparto y dar entrada a los lotes de producto terminado, igual que hoy.
- **R4.** SI Terminar falla (material insuficiente, receta inexistente, unidades incompatibles,
  presentación sin contenido, pedido sin unidad, otro empacador o estado que no admite Terminar),
  ENTONCES el pedido DEBE seguir en su estado previo, sin `finishedAt`, sin consumo de envases y
  sin lotes de producto terminado. Es decir, el comportamiento de error de hoy, sin cambios.

### `TERMINADO -> ENTREGADO` sin disparador

- **R5.** El sistema NO DEBE ofrecer ningún camino de aplicación que escriba el estado
  `ENTREGADO`:
  - ningún caso de uso, Server Action, ruta ni control de UI;
  - la transición genérica del catálogo de pedidos (la que usa Finalizar) DEBE rechazar como
    destino `EN_EMPAQUE`, `TERMINADO` y `ENTREGADO` con `invalid_transition`, sin abrir
    transacción ni escribir;
  - el único código de `lib/**` que escribe `status: 'TERMINADO'` DEBE ser la escritura de
    Terminar el empaque.
- **R6.** CUANDO la persistencia de pedidos cambie un pedido `TERMINADO` a `ENTREGADO` con su
  operación genérica de cambio de estado, el sistema DEBE conservar el `finishedAt` y el
  `packedBy` que tenía. Esa operación de cambio de estado DEBE escribir `finishedAt` solo cuando
  el destino es `TERMINADO`.

### `TERMINADO` es cerrado

- **R7.** SI se edita un pedido `TERMINADO`, ENTONCES el sistema DEBE rechazar con
  `invalid_transition` sin modificar ninguna fila. Vale para la edición general y para la edición
  acotada de reparto y unidad.
- **R8.** SI se cancela un pedido `TERMINADO`, ENTONCES el sistema DEBE rechazar con
  `not_cancellable` sin modificar ninguna fila ni liberar nada.
- **R9.** SI se borra un pedido `TERMINADO`, ENTONCES el sistema DEBE rechazar con
  `not_deletable` sin modificar ninguna fila.
- **R10.** La base DEBE rechazar cualquier escritura que deje un pedido `TERMINADO` con
  `deleted_at` no nulo, aunque no pase por la aplicación.
- **R11.** La base DEBE rechazar cualquier fila de `orders` que cumpla alguna de estas
  condiciones:
  - `finished_at` no nulo en un estado distinto de `TERMINADO` o `ENTREGADO`;
  - `TERMINADO` con `finished_at` nulo;
  - `TERMINADO` con `packed_by` nulo.

  Las filas `ENTREGADO` existentes, con o sin `finished_at` y con o sin `packed_by`, DEBEN seguir
  siendo válidas.
- **R12.** SI se intenta asignar responsables, quitar un grupo de trabajo o desasignar a un
  responsable de un pedido `TERMINADO`, ENTONCES el sistema DEBE rechazar con
  `order_produced_frozen` sin escribir. La consulta de sus responsables DEBE seguir respondiendo.
- **R13.** SI un Operador intenta leer, comenzar o finalizar la ejecución de un pedido
  `TERMINADO` del que es responsable, ENTONCES el sistema DEBE rechazar sin cambiar el estado ni
  consumir material, con estos errores:
  - leer: `order_not_found`, como hoy un `ENTREGADO`;
  - comenzar y finalizar: `order_produced_frozen`, el de R12, como hoy `POR_EMPACAR` y
    `EN_EMPAQUE`.
- **R14.** MIENTRAS un pedido esté `TERMINADO`, el menú de fila de `/pedidos` DEBE mostrar
  «Editar», «Cancelar» y «Eliminar» deshabilitados, NO DEBE mostrar la acción de reparto y unidad,
  y DEBE mantener habilitada «Responsables». El panel de responsables NO DEBE montar controles de
  escritura.

### Migración (D4)

- **R15.** CUANDO se apliquen las migraciones UP, el sistema DEBE añadir `TERMINADO` al tipo sin
  modificar ninguna fila de `orders`:
  - todo pedido `ENTREGADO` DEBE seguir `ENTREGADO`, con el mismo `finished_at` y el mismo
    `packed_by`;
  - la migración que añade el valor DEBE contener únicamente ese `ADD VALUE` y DEBE ser
    idempotente.
- **R16.** CUANDO se aplique `db:rollback` sobre las dos migraciones de esta ficha, el sistema
  DEBE dejar las restricciones e índices con el texto literal de antes de esta ficha.
  SI existe algún pedido `TERMINADO`, ENTONCES la reversión del valor del enum DEBE abortar entera
  sin tocar ninguna fila, igual que la de `BLOQUEADO`.

### «Terminados» (D5)

- **R17.** CUANDO se liste «Terminados», el sistema DEBE devolver solo los pedidos vivos
  `TERMINADO` de la empresa del actor. Los `ENTREGADO` NO DEBEN aparecer, ni siquiera los que
  empacó el propio actor. DEBEN ordenarse por `finishedAt` descendente, y después por número
  descendente.
- **R18.** MIENTRAS el actor no tenga `asignaciones.ejecutar`, «Terminados» DEBE devolver solo los
  `TERMINADO` cuyo `packedBy` sea el propio actor, con el filtro, el total y la paginación
  resueltos en la consulta. Es el comportamiento de QC-201 R20, aplicado ahora a `TERMINADO`.
  MIENTRAS el actor sí tenga `asignaciones.ejecutar`, DEBE devolver todos los `TERMINADO` de la
  empresa.
- **R19.** CUANDO en «Todos» el filtro de estado sea exactamente `TERMINADO`, el sistema DEBE:
  - usar el orden de terminados (el de R17);
  - pintar la columna de fecha de terminado en la tabla y en su esqueleto de carga.
- **R20.** *(Provisional, pendiente de P2.)* CUANDO en «Todos» el filtro de estado sea
  exactamente `ENTREGADO`, el sistema DEBE seguir usando el orden de terminados y pintando la
  columna de fecha, como hoy. Con cualquier otra combinación de estados, incluida
  `TERMINADO` + `ENTREGADO`, DEBE usar el orden de la lista de trabajo y NO DEBE pintar la columna
  de fecha.

### Etiquetas y filtros (D6)

- **R21.** El badge de estado de `/pedidos` DEBE pintar un pedido `TERMINADO` con el texto
  «Terminado» y `data-status="TERMINADO"`. El texto DEBE ser distinto del de `ENTREGADO`
  («Entregado»), que no cambia.
- **R22.** La columna de estado de «Todos» DEBE pintar un pedido `TERMINADO` como «Terminado».
- **R23.** Los filtros de estado de `/pedidos` y de «Todos» DEBEN ofrecer la opción «Terminado»
  entre «En empaque» y «Entregado», y DEBEN aceptar `TERMINADO` en el parámetro `status` de la
  URL. Filtrar por ella DEBE devolver solo pedidos `TERMINADO`.
- **R24.** CUANDO Terminar el empaque tenga éxito, la confirmación que pinta la pestaña «Por
  empacar» DEBE decir «Pedido <número> terminado», y no «entregado».

### Otros consumidores del estado

- **R25.** Los procesos que hoy no actúan sobre pedidos `ENTREGADO` NO DEBEN actuar sobre pedidos
  `TERMINADO`:
  - el proceso programado de caducidad de reservas;
  - la revisión que desbloquea pedidos `BLOQUEADO`;
  - «Mis asignados»;
  - «Por empacar».

  Un pedido `TERMINADO` DEBE mostrar la cobertura «Sin apartar» en `/pedidos`.

## Preguntas abiertas

- **P1. El Empacador deja de ver sus pedidos antiguos en «Terminados».** Con D4 y D5, los pedidos
  que un Empacador terminó antes del despliegue siguen en `ENTREGADO`. Por R17 y R18 desaparecen
  de su pestaña «Terminados»: son los que tienen `packedBy`, porque los anteriores al empaque ya
  no le aparecían por QC-201 R20. Como no tiene `pedidos.consultar`, no los ve en ninguna otra
  vista. El spec lo trata como **efecto aceptado** porque es la lectura literal de D4 y D5, pero
  el humano no lo ha confirmado. Si no se acepta, las salidas son:
  - (a) que «Terminados» incluya también `ENTREGADO`, lo que contradice D5;
  - (b) migrar a `TERMINADO` los `ENTREGADO` con `packed_by`, lo que contradice D4.
- **P2. Consumidores de `finishedAt` y de «pedido terminado» fuera de «Terminados».** Revisados:
  - **Dashboard:** no lee estados de pedido. No cambia.
  - **Reportes:** no hay ningún módulo de reportes que lea pedidos (`documentos` no los toca). No
    cambia.
  - **`pedidos.consultar`** (`/pedidos` y «Todos»): ven todos los estados. `TERMINADO` entra en
    los filtros y en la etiqueta (R21-R23).
  - **Proceso programado de reservas:** solo mira `PENDIENTE` (R25). No cambia.
  - **Lo que queda por decidir:** el filtro exacto de «Todos» que activa el orden de terminados
    y la columna de fecha. El spec propone **los dos, por separado**: exactamente `TERMINADO`
    (R19, nuevo) y exactamente `ENTREGADO` (R20, como hoy). Así los `ENTREGADO` antiguos no
    pierden su fecha en pantalla. Pendiente de confirmar. Si el humano prefiere solo `TERMINADO`,
    R20 pasa a «exactamente `ENTREGADO` usa el orden de la lista de trabajo y sin columna de
    fecha». En ese caso, el índice parcial de terminados de `ENTREGADO` queda sin uso (ver
    `design.md > 1.3`).
