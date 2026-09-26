# QC-168 — estado-por-empacar · requirements.md

> **Zona:** `fullstack` · **Complejidad:** `high` · **depends_on:** QC-150 ·
> **Rama:** `feature/QC-168-estado-por-empacar`
>
> **Alcance.** El pedido gana dos estados entre EN_CURSO y ENTREGADO: **POR_EMPACAR** y
> **EN_EMPAQUE**. El Finalizar del Operario deja el pedido Por empacar; el Empacador lo **comienza**
> (En empaque, a su nombre) y lo **termina** (Entregado), desde una pestaña **«Por empacar»** de
> `/asignacion`.
>
> **Lo que NO entra.** Registrar el empaque en el log de ejecución → **QC-82**, que va después de
> esta ficha y la tiene como bloqueante. Que el Administrador empaque. Asignar empacadores.
>
> Sembrado por `/afinar-feature` el 2026-09-24. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

> Notación EARS (`docs/specs.md`). Cada requisito cita entre corchetes la fila de «Decisiones
> cerradas» que lo origina, numeradas en el orden de la tabla: **[D1]** flujo · **[D2]** qué pedidos
> toma el Empacador · **[D3]** cuándo se mueve el inventario · **[D4]** cuándo se escribe
> `finished_at` · **[D5]** cancelar · **[D6]** permiso · **[D7]** dónde trabaja el Empacador ·
> **[D8]** registro del empaque · **[D9]** orden QC-150 → QC-168 → QC-82 · **[D10]** nombres y datos
> existentes · **[D11]** qué ve el Administrador · **[D12]** E2E · **[D13]** dependencia o tabla nueva.
>
> ⚑ = requisito escrito con la **posición por defecto** de una pregunta abierta de este archivo;
> se confirma o se corrige en F1.4.
>
> «Empacador» en un requisito significa **un actor con el permiso `empaque.modificar`**, nunca un
> nombre de rol. «Operario» significa un responsable asignado al pedido con `asignaciones.consultar`.
> «Catálogo previo» es el catálogo de permisos que haya en `dev` al implementar, antes de esta ficha:
> hoy en `dev` (7e1087af) tiene **20** entradas, no 16 —D6 se escribió con la cifra de QC-144—, y
> QC-161 también lo amplía, así que el recuento absoluto no se fija aquí [D6].

### A. Los estados

**R1.** El conjunto de estados del pedido DEBE contener, además de `PENDIENTE`, `EN_CURSO`,
`ENTREGADO` y `CANCELADO`, exactamente dos valores nuevos: `POR_EMPACAR` y `EN_EMPAQUE`, con esos
identificadores literales. [D1] [D10]

**R2.** ⚑ (P5) Las únicas transiciones de estado DEBEN ser `PENDIENTE → EN_CURSO`,
`EN_CURSO → POR_EMPACAR`, `POR_EMPACAR → EN_EMPAQUE`, `EN_EMPAQUE → ENTREGADO` y la cancelación
desde `PENDIENTE` o `EN_CURSO`. Ningún estado distinto de `EN_EMPAQUE` DEBE poder pasar a `ENTREGADO`,
y `EN_EMPAQUE` y `ENTREGADO` solo DEBEN alcanzarse por las acciones de empaque de la sección C.
[D1]

**R3.** CUANDO se aplique la migración de esta ficha, el sistema NO DEBE cambiar el estado, la fecha
de terminado ni ningún otro dato de ningún pedido existente. [D10]

**R4.** CUANDO se finalice un pedido que ya estaba `EN_CURSO` antes de la migración, el sistema DEBE
dejarlo `POR_EMPACAR` exactamente como a uno creado después. [D10]

### B. El Finalizar del Operario

**R5.** CUANDO un Operario activa **Finalizar** en `/asignacion/[id]` sobre un pedido `EN_CURSO`, el
sistema DEBE dejar el pedido en `POR_EMPACAR`, y NO en `ENTREGADO`. [D1]

**R6.** CUANDO un pedido pase a `POR_EMPACAR` por el Finalizar, el sistema DEBE, en la misma
operación que el cambio de estado, consumir su material con las reglas de consumo vigentes
(QC-141) y dar de alta su lote de producto terminado con las reglas vigentes (QC-150). [D3]

**R7.** SI falla cualquier parte del Finalizar —`insufficient_material`, `recipe_without_lines`,
`presentation_without_content`, `no_whole_package`, `recipe_not_found` o cualquier otro error—,
ENTONCES el sistema NO DEBE dejar escrito ni el estado `POR_EMPACAR`, ni ningún consumo, ni ninguna
parte del producto terminado. [D3]

**R8.** CUANDO un pedido pase a `POR_EMPACAR`, el sistema NO DEBE escribir su fecha de terminado, y
MIENTRAS esté `POR_EMPACAR` o `EN_EMPAQUE` la base DEBE rechazar cualquier escritura que le ponga
fecha de terminado. [D4]

**R9.** CUANDO el Finalizar termine bien, el sistema DEBE devolver al Operario a `/asignacion` con una
confirmación visible que diga el número del pedido, que queda **por empacar**, cuántos envases enteros
entraron y el nombre del producto terminado que los recibió. [D1] [D3]

**R10.** SI se activa Finalizar sobre un pedido `POR_EMPACAR`, `EN_EMPAQUE` o `ENTREGADO` —incluido
un segundo envío del mismo Finalizar, o dos a la vez—, ENTONCES el sistema DEBE rechazarlo sin
cambiar el estado, sin consumir material y sin dar de alta ningún lote de producto terminado. [D3]

**R11.** ⚑ (P1) SI un Operario abre `/asignacion/[id]` de un pedido `POR_EMPACAR` o `EN_EMPAQUE`,
ENTONCES el sistema NO DEBE cambiar su estado y DEBE responder con el error propio de ese estado, sin
escribir nada. [D1]

**R12.** MIENTRAS un pedido esté `POR_EMPACAR` o `EN_EMPAQUE`, la lista «Mis asignados» NO DEBE
incluirlo. [D1]

### C. El empaque

**R13.** Los casos de uso de empaque —listar «Por empacar», abrir un pedido de empaque, Comenzar y
Terminar— DEBEN exigir `empaque.modificar` como primer paso, antes de validar la entrada y antes de
tocar ninguna dependencia; SI el actor está ausente, no trae permisos o no trae ese código, ENTONCES
DEBEN rechazar con el error de autorización del módulo sin haber llamado a ninguna dependencia. [D6]

**R14.** CUANDO un Empacador pide la lista «Por empacar», el sistema DEBE devolver todos los pedidos
vivos de su empresa en `POR_EMPACAR` o `EN_EMPAQUE`, sin filtrar por asignación, y cada fila DEBE
traer número, receta, presentación, envases enteros, estado y quién empaca (vacío en `POR_EMPACAR`).
[D2] [D7]

**R15.** La lista «Por empacar» NO DEBE devolver pedidos de otra empresa, dados de baja ni en ningún
otro estado. [D2] [D7]

**R16.** ⚑ (P6) La lista «Por empacar» DEBE ordenarse como la lista de trabajo existente: prioridad
de mayor a menor, después antigüedad y después número, paginada con los mismos tamaños de página.
[D7]

**R17.** CUANDO un Empacador abre una fila de «Por empacar», el sistema DEBE mostrar una pantalla con
los datos de R14 y DEBE ofrecer **Comenzar** si el pedido está `POR_EMPACAR`, **Terminar** si está
`EN_EMPAQUE` a su nombre, y ninguno de los dos —mostrando quién empaca— si está `EN_EMPAQUE` a nombre
de otro. [D2] [D7]

**R18.** CUANDO un Empacador activa Comenzar sobre un pedido `POR_EMPACAR`, el sistema DEBE dejarlo
`EN_EMPAQUE` con ese actor como quien empaca, en una sola escritura. [D1] [D2]

**R19.** CUANDO dos Empacadores activan Comenzar a la vez sobre el mismo pedido, el sistema DEBE
dejar exactamente a uno como quien empaca, y el otro DEBE recibir `order_packing_taken` sin que se
escriba nada a su nombre. [D2]

**R20.** SI se activa Comenzar sobre un pedido `EN_EMPAQUE` a nombre de otro, ENTONCES el sistema DEBE
rechazarlo con `order_packing_taken` sin escribir nada; y SI está `EN_EMPAQUE` a nombre del propio
actor, ENTONCES DEBE responder con éxito sin escribir nada. [D2]

**R21.** CUANDO quien empaca activa Terminar sobre su pedido `EN_EMPAQUE`, el sistema DEBE dejarlo
`ENTREGADO` y guardar como fecha de terminado el instante de esa operación, en la misma escritura; SI
esa escritura falla, ENTONCES NO DEBE quedar ni el estado ni la fecha. [D1] [D4]

**R22.** SI activa Terminar alguien que no es quien empaca el pedido, ENTONCES el sistema DEBE
rechazarlo con `order_packing_taken` sin escribir nada. [D2]

**R23.** SI se activa Comenzar o Terminar sobre un pedido cuyo estado no es el que la acción requiere
—Terminar sobre `POR_EMPACAR`, o cualquiera de las dos sobre `PENDIENTE`, `EN_CURSO`, `ENTREGADO` o
`CANCELADO`—, ENTONCES el sistema DEBE rechazarlo con `order_not_packable` sin escribir nada. [D1] [D2]

**R24.** SI el pedido de una acción de empaque no existe, está dado de baja o es de otra empresa,
ENTONCES el sistema DEBE responder igual que ante un pedido inexistente, sin escribir nada. [D2]

**R25.** Comenzar y Terminar NO DEBEN consumir, apartar ni liberar material, ni dar de alta ningún
lote, ni escribir ningún asiento de inventario. [D3]

**R26.** CUANDO Terminar va bien, el sistema DEBE devolver al Empacador a la pestaña «Por empacar» con
una confirmación visible del número del pedido entregado. [D7]

**R27.** CUANDO un pedido queda `ENTREGADO` por Terminar, DEBE aparecer en «Terminados» con esa fecha
de terminado sin ninguna otra acción, y MIENTRAS esté `POR_EMPACAR` o `EN_EMPAQUE` NO DEBE aparecer en
«Terminados». [D4]

**R28.** SI una escritura, venga de donde venga, deja un pedido `EN_EMPAQUE` sin quién empaca, o deja
quién empaca en un pedido `PENDIENTE`, `EN_CURSO`, `POR_EMPACAR` o `CANCELADO`, o pone como quien
empaca a un usuario de otra empresa, ENTONCES la base DEBE rechazarla. [D2]

### D. Cancelar, editar y borrar

**R29.** SI se intenta cancelar un pedido `POR_EMPACAR` o `EN_EMPAQUE`, por cualquier camino,
ENTONCES el sistema DEBE rechazarlo con `not_cancellable` sin cambiar el pedido ni el inventario.
[D5]

**R30.** El proceso diario de caducidad NO DEBE cancelar ni liberar un pedido `POR_EMPACAR` o
`EN_EMPAQUE`. [D5]

**R31.** CUANDO se cancele un pedido `PENDIENTE` o `EN_CURSO`, el sistema DEBE seguir haciéndolo por
el único camino existente y liberando su material, sin ningún cambio de comportamiento. [D5]

**R32.** ⚑ (P2) SI se intenta editar un pedido `POR_EMPACAR` o `EN_EMPAQUE` desde Pedidos, ENTONCES
el sistema DEBE rechazarlo con `invalid_transition` sin escribir nada ni tocar lo apartado; y SI se
intenta borrarlo, ENTONCES DEBE rechazarlo con `not_deletable`, y la base DEBE rechazar además
cualquier borrado lógico de un pedido en esos estados. [D5]

**R33.** ⚑ (P1) SI se intenta asignar o quitar responsables de un pedido `POR_EMPACAR` o
`EN_EMPAQUE`, ENTONCES el sistema DEBE rechazarlo con el error propio de ese estado sin escribir
nada; la consulta de responsables DEBE seguir funcionando en esos estados. [D1]

### E. El permiso

**R34.** El catálogo de permisos DEBE contener `empaque.modificar`, con módulo `empaque`, acción
`modificar` y la descripción «Comenzar y terminar el empaque de los pedidos de la empresa.». [D6]

**R35.** El catálogo de permisos DEBE contener exactamente los códigos del catálogo previo más
`empaque.modificar`; esta ficha NO DEBE añadir, quitar ni renombrar ningún otro permiso, y ningún
test DEBE fijar el total del catálogo con un número. [D6]

**R36.** El seed DEBE asignar al Empacador exactamente `asignaciones.consultar`,
`terminados.consultar` y `empaque.modificar`; NO DEBE asignar `empaque.modificar` al Administrador
ni al Operador, y las asignaciones de esos dos roles NO DEBEN cambiar. [D6]

**R37.** CUANDO se aplica la migración de esta ficha sobre una base sembrada, el sistema DEBE crear
el permiso y solo la asignación `Empacador → empaque.modificar`; SI ya existen, ENTONCES NO DEBE
fallar ni duplicar ni reescribir filas; y CUANDO se revierte, DEBE retirar ese permiso y su
asignación sin tocar ninguna otra fila. [D6]

**R38.** Ningún archivo de producción de esta ficha DEBE autorizar por nombre de rol: la guardia
ejecutable de autorización por permiso DEBE seguir en verde. [D6]

### F. Pantallas

**R39.** MIENTRAS el usuario tenga `empaque.modificar`, `/asignacion` DEBE ofrecerle la pestaña
«Por empacar»; SI no lo tiene, ENTONCES NO DEBE ofrecérsela, y pedirla por la dirección DEBE caer en
su vista por defecto sin revelar que existe. [D6] [D7]

**R40.** La pantalla de un pedido de empaque DEBE exigir `empaque.modificar` en el servidor antes de
leer datos; sin él DEBE responder 404 como el resto de la zona privada. [D6] [D7]

**R41.** La vista «Todos» de `/asignacion` DEBE mostrar los estados `POR_EMPACAR` y `EN_EMPAQUE` con
las etiquetas «Por empacar» y «En empaque» y DEBE ofrecerlos en su filtro de estado. [D11]

**R42.** La pantalla de Pedidos DEBE mostrar esos dos estados con las mismas etiquetas y DEBE
presentar sus acciones de editar, cancelar y borrar como no disponibles, con el motivo visible. [D5]
[D11]

**R43.** La pestaña «Por empacar» y la pantalla de empaque DEBEN cumplir la regla multiplataforma:
objetivos táctiles de al menos 44×44 px, sin `100vh` y sin depender de `:hover`. [D7]

### G. Límites, migración y verificación

**R44.** Esta ficha NO DEBE escribir en el registro de ejecución ni crear su tabla: anotar «comenzar
empaque» y «terminar empaque» es de QC-82. [D8] [D9]

**R45.** Esta ficha NO DEBE modificar `specs/QC-82-registro-de-ejecucion-de-receta/`; lo que QC-82
tiene que enmendar queda listado en `design.md > 9`. [D9]

**R46.** Esta ficha NO DEBE añadir dependencias a `package.json` ni tablas nuevas; los únicos cambios
de esquema DEBEN ser los dos valores del enum de estados, la columna de quién empaca con sus
restricciones (ver F1.4-1 en `design.md`) y la ampliación del CHECK de borrado. [D13]

**R47.** CUANDO se revierte la migración de esquema, el sistema DEBE dejar el esquema como estaba; SI
algún pedido está `POR_EMPACAR` o `EN_EMPAQUE`, ENTONCES la reversión DEBE fallar entera sin cambiar
nada. [D10] [D13]

**R48.** El sistema DEBE tener un test E2E que recorra: el Operario finaliza un pedido y queda «Por
empacar»; el Operario no ve la pestaña «Por empacar»; un pedido Por empacar no se puede cancelar
desde Pedidos; un Empacador lo comienza y lo termina, y el pedido aparece en «Terminados». [D12]

## Preguntas abiertas

> Todas tienen posición por defecto (los requisitos ⚑) para que el spec sea implementable; se
> confirman o corrigen en F1.4.

- **P1. Responsables y pantalla del Operario en `POR_EMPACAR`/`EN_EMPAQUE`.** ¿Se congelan los
  responsables (asignar/quitar) como en `ENTREGADO`? *Defecto:* sí, con un error nuevo
  `order_produced_frozen` («Un pedido ya producido conserva sus responsables tal como estaban.»), y
  el mismo error al abrir `/asignacion/[id]` (R11, R33). Alternativa: admitir cambios.
- **P2. Editar y borrar desde Pedidos.** Las decisiones solo cierran cancelar. *Defecto:* ni se
  editan ni se borran (R32): editar re-apartaría material ya consumido y borrar ocultaría un lote de
  producto terminado ya dado de alta.
- **P5. Finalizar desde `PENDIENTE`.** Hoy la matriz de `pedidos` admite `PENDIENTE → ENTREGADO`.
  *Defecto:* se retira y solo `EN_CURSO → POR_EMPACAR`, al pie de D1 (abrir la pantalla ya pasa el
  pedido a `EN_CURSO`). Alternativa: mantener `PENDIENTE → POR_EMPACAR`.
- **P6. Orden de la lista y lugar de la pestaña.** *Defecto:* orden de la lista de trabajo (R16) y
  pestaña **al final** («Mis asignados», «Terminados», «Por empacar»), sin cambiar la vista por
  defecto del Empacador. Alternativa: «Por empacar» primera y por defecto para quien tenga el
  permiso (cambia el aterrizaje que prueba el E2E de QC-145).

(P3 y P4 del borrador se resolvieron sin humano: el código del permiso lo fija `spec_author` por
D6 —`empaque.modificar`—, y la cifra «16 → 17» se sustituye por «catálogo previo + 1», R35.)

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-09-24 | ¿Cuál es el flujo? | PENDIENTE → EN_CURSO → **POR_EMPACAR** (el Operario finaliza la producción) → **EN_EMPAQUE** (el Empacador comienza) → ENTREGADO (el Empacador termina). Hoy el Finalizar deja ENTREGADO (QC-63): eso cambia |
| 2026-09-24 | ¿Qué pedidos toma el Empacador? | **Cualquier pedido Por empacar de su empresa, sin asignación.** El primero que lo comienza se lo queda y **solo él** puede terminarlo |
| 2026-09-24 | ¿Cuándo se mueve el inventario? | **Al terminar la producción** (paso a Por empacar): en esa misma operación se consume el material (QC-141) y entra el lote de producto terminado (QC-150) |
| 2026-09-24 | ¿Cuándo se escribe `finished_at`? | **Al entregar** (fin del empaque). «Terminados» de QC-145 sigue siendo la lista de entregados |
| 2026-09-24 | ¿Se puede cancelar? | **No**, ni Por empacar ni En empaque: el material ya se consumió. Un problema se corrige con un ajuste de inventario (QC-92). Hasta EN_CURSO se sigue cancelando por el camino único (QC-34/QC-141) |
| 2026-09-24 | ¿Qué permiso lo habilita? | **Un permiso nuevo de empaque, solo para el Empacador.** Se autoriza por permiso, nunca por nombre de rol (QC-86/87). El catálogo pasa de **16 a 17**, por migración y seed (QC-74). El código lo fija `spec_author` con la forma `<modulo>.<accion>`. El Administrador **no** lo recibe: supervisa desde «Todos» (QC-145) |
| 2026-09-24 | ¿Dónde trabaja el Empacador? | Pestaña **«Por empacar»** en `/asignacion`: los pedidos Por empacar y En empaque de su empresa, con número, receta, presentación, envases, estado y quién empaca. Cada fila abre una pantalla sencilla con el pedido y los botones **Comenzar** y **Terminar** |
| 2026-09-24 | ¿Se registra el empaque? | **Sí, pero lo añade QC-82**, con las acciones «comenzar empaque» y «terminar empaque». Esta ficha no toca el registro |
| 2026-09-24 | ¿En qué orden van? | **QC-150 → QC-168 → QC-82.** Las tres tocan el Finalizar; QC-82 ajusta su spec a estos estados antes de implementar |
| 2026-09-24 | ¿Nombres y datos existentes? | Estados en castellano y mayúsculas, como los existentes (`POR_EMPACAR`, `EN_EMPAQUE`). **Sin migración de datos:** los EN_CURSO pasan a Por empacar al finalizarse; los ENTREGADO no cambian |
| 2026-09-24 | ¿Qué ve el Administrador? | «Todos» (QC-145) muestra los estados nuevos y los incluye en su filtro |
| 2026-09-24 | ¿E2E? | **Sí**: el Operario finaliza → Por empacar; el Empacador comienza y termina; el Operario no ve «Por empacar»; un pedido Por empacar no se puede cancelar |
| 2026-09-24 | ¿Dependencia o tabla nueva? | **Ninguna librería.** Cambian el enum de estados y el catálogo de permisos, por migración |
