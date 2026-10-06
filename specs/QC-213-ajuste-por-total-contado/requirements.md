# QC-213 — ajuste-por-total-contado · requirements.md

> Zona: fullstack · Complejidad: high · depends_on: — · Rama: feature/QC-213-ajuste-por-total-contado
>
> **Alcance.** El diálogo de ajuste de un lote pide el total contado, no una cantidad con signo.
> Muestra la existencia registrada y la diferencia resultante (aumento o disminución) antes de
> guardar, y ofrece solo los motivos válidos para ese sentido. El servidor recalcula la diferencia
> con el lote bloqueado, rechaza si la existencia cambió desde que se abrió el diálogo, y el
> historial del lote muestra la existencia anterior y el total contado de cada ajuste.
>
> **Lo que NO entra.** Ajustar varios lotes a la vez o tomas de inventario completas. Cambiar las
> reglas de apartado de pedidos (QC-141). Ajustes desde la importación de Excel (QC-209).
>
> Sembrado por `/afinar-feature` el 2026-10-06. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

Términos. **Existencia registrada**: la existencia del lote que la pantalla muestra al abrir el
diálogo. **Existencia vista**: la que el usuario tenía delante al confirmar; viaja con la operación.
**Total contado**: lo que el usuario escribe. **Diferencia**: total contado menos existencia; es un
**aumento** si es positiva y una **disminución** si es negativa.

### Diálogo de ajuste

- **R1** [D1] CUANDO el usuario abre el diálogo de ajuste de un lote, el sistema DEBE mostrar la
  existencia registrada del lote y un único campo numérico para el total contado, sin ningún campo
  para una cantidad con signo.
- **R2** [D1] MIENTRAS el total contado escrito sea un decimal válido distinto de la existencia
  registrada, el diálogo DEBE mostrar la diferencia como «Aumento de X» o «Disminución de X», donde
  X es el valor absoluto de la diferencia.
- **R3** [D1, D3] SI el usuario confirma con un total contado igual a la existencia registrada,
  ENTONCES el diálogo DEBE mostrar un aviso de que no hay diferencia y NO DEBE enviar la operación.
- **R4** [D2] MIENTRAS la diferencia sea un aumento, el selector de motivo DEBE ofrecer solo
  `conteo_fisico` y `error_de_carga`; MIENTRAS sea una disminución, DEBE ofrecer los cuatro motivos.
- **R5** [D2] MIENTRAS el total contado esté vacío, no sea un decimal válido o sea igual a la
  existencia registrada, el selector de motivo DEBE estar deshabilitado.
- **R6** [D2] CUANDO cambia el sentido de la diferencia y el motivo elegido no es válido para el
  sentido nuevo, el diálogo DEBE dejar el motivo sin elegir.
- **R7** [D3] DONDE el lote sea de un envase con presentación fija, SI el usuario confirma un total
  contado que no es un número entero, ENTONCES el diálogo DEBE mostrar el aviso de envases enteros y
  NO DEBE enviar la operación.
- **R8** [D4] CUANDO el usuario confirma un ajuste válido, el diálogo DEBE enviar exactamente cuatro
  datos: el lote, el total contado, la existencia vista y el motivo; NO DEBE enviar ninguna
  diferencia ni cantidad con signo.
- **R9** [D6] CUANDO el servidor acepta un ajuste que deja el lote por debajo de lo apartado por
  pedidos, el diálogo DEBE seguir abierto y mostrar el aviso de lote sobre-reservado.
- **R10** [D5] CUANDO el diálogo recibe el rechazo por existencia cambiada, DEBE mostrar el mensaje
  del rechazo, sustituir la existencia registrada por la existencia actual recibida, recalcular la
  diferencia con el total ya escrito, aplicar R4 y R6 al sentido recalculado, y seguir abierto sin
  reenviar nada hasta que el usuario confirme de nuevo.
- **R11** [D5] CUANDO el usuario confirma de nuevo tras un rechazo por existencia cambiada, el
  diálogo DEBE enviar como existencia vista la existencia actual recibida en ese rechazo.

### Servidor

- **R12** [D4] CUANDO el servidor recibe un ajuste, DEBE calcular la diferencia como el total contado
  menos la existencia del lote leída con el lote bloqueado, y asentar exactamente esa diferencia como
  cantidad del movimiento.
- **R13** [D5] SI la existencia del lote leída con el lote bloqueado no es igual, como decimal, a la
  existencia vista, ENTONCES el servidor NO DEBE modificar el lote, NO DEBE escribir ningún asiento y
  DEBE responder `batch_stock_changed` junto con la existencia actual del lote.
- **R14** [D5] CUANDO dos ajustes del mismo lote se confirman a la vez con la misma existencia vista,
  el servidor DEBE aplicar exactamente uno y responder `batch_stock_changed` al otro.
- **R15** [D2] SI el motivo no está entre los permitidos para el sentido de la diferencia, ENTONCES
  el servidor DEBE responder `adjustment_reason_not_allowed` sin modificar el lote ni escribir asiento.
- **R16** [D3] SI el total contado es igual a la existencia vista, ENTONCES el servidor DEBE
  responder `invalid_input` sin modificar el lote ni escribir asiento.
- **R17** [D3] SI la diferencia es un aumento y el lote es de un producto terminado, ENTONCES el
  servidor DEBE responder `action_not_allowed` sin modificar el lote ni escribir asiento.
- **R18** [D3] SI el lote es de un envase con presentación fija y el total contado no es un número
  entero, ENTONCES el servidor DEBE responder `invalid_input` sin modificar el lote ni escribir asiento.
- **R19** [D3] SI el total contado o la existencia vista no es un decimal no negativo con hasta diez
  enteros y cuatro decimales, ENTONCES el servidor DEBE responder `invalid_input` sin modificar el
  lote ni escribir asiento; y SI aun así una escritura fuera a dejar la existencia del lote por debajo
  de cero, la base DEBE rechazarla y el servidor DEBE responder `batch_stock_negative`.
- **R20** [D6] CUANDO el servidor aplica un ajuste que deja la existencia del lote por debajo de lo
  apartado, DEBE aceptarlo y devolver la existencia nueva, lo apartado y la marca de sobre-reserva.
- **R21** [D9] SI el actor no tiene el permiso `inventario.modificar`, ENTONCES el servidor DEBE
  responder `unauthorized` antes de validar la entrada y antes de leer o escribir nada; y el control
  de ajuste NO DEBE existir en el DOM para ese actor.
- **R22** [D9] SI el lote no existe o pertenece a otra empresa, ENTONCES el servidor DEBE responder
  `batch_not_found` en los dos casos, sin modificar nada.
- **R23** [D4] CUANDO el servidor aplica un ajuste que es un aumento, DEBE avisar del aumento de
  existencia a quien escucha esos avisos; CUANDO aplica una disminución o rechaza el ajuste, NO DEBE
  avisar.

### Asiento e historial

- **R24** [D7] CUANDO el servidor aplica un ajuste, el asiento DEBE guardar además la existencia
  anterior (la leída con el lote bloqueado) y el total contado, y DEBE cumplirse que total contado =
  existencia anterior + cantidad del asiento.
- **R25** [D7] Los asientos que no son de ajuste DEBEN tener vacíos la existencia anterior y el total
  contado, y en ningún asiento DEBE estar uno de los dos sin el otro.
- **R26** [D7] CUANDO el usuario abre el historial de un lote, el sistema DEBE mostrar, en cada
  ajuste que los tenga guardados, la existencia anterior y el total contado junto a la cantidad.
- **R27** [D7] SI un ajuste del historial no tiene guardados la existencia anterior ni el total
  contado, ENTONCES el historial DEBE mostrarlo como hasta ahora (cantidad con signo, motivo, autor y
  fecha) y NO DEBE mostrar esos dos campos ni ningún valor sustituto.

### Contrato, verificación y dependencias

- **R28** [D2, D8] El sistema DEBE decidir el sentido de la diferencia y los motivos permitidos con la
  misma función pura en la pantalla y en el servidor.
- **R29** [D10] El sistema DEBE tener un E2E que, contra el navegador y Postgres reales, cubra un
  ajuste por aumento, uno por disminución y el rechazo por existencia cambiada seguido de la
  reconfirmación.
- **R30** [D11] La feature NO DEBE añadir ninguna dependencia a `package.json`.

## Preguntas abiertas

- ~~Cómo muestra el historial los ajustes anteriores a esta ficha, que no tienen existencia anterior
  ni total contado guardados.~~ **Propuesta en `design.md > 6` y fijada en R27, pendiente de
  aprobación humana:** se muestran como hoy, sin esos dos campos, y la migración no los rellena hacia
  atrás.

## Decisiones cerradas

| # | Decisión | Origen |
|---|---|---|
| D1 | Se escribe el total contado, no la diferencia, en todos los motivos. La pantalla muestra la existencia registrada y la diferencia (aumento o disminución) antes de guardar. | Humano, 2026-10-06 (tarjeta) |
| D2 | Motivos por sentido: un aumento admite solo `conteo_fisico` y `error_de_carga`; una disminución admite los cuatro. Se valida en pantalla y en el servidor. | Humano, 2026-10-06 (tarjeta) |
| D3 | Se mantienen las reglas actuales: diferencia cero rechazada, producto terminado solo disminuye, envase con presentación fija en envases enteros, existencia final negativa rechazada. | Heredado del código actual (`adjust-batch-stock.ts`, `product-prisma.ts`) |
| D4 | Contrato: la Server Action recibe `batchId`, el total contado, la existencia que el usuario vio y el motivo. El servidor calcula la diferencia con el lote bloqueado y valida el motivo con ese sentido. La pantalla nunca es la fuente de la diferencia. | Humano, 2026-10-06 |
| D5 | Concurrencia: si la existencia al guardar no coincide con la vista, no se guarda nada. Se devuelve un error propio con la existencia actual; el diálogo muestra la diferencia recalculada y el usuario confirma de nuevo. | Humano, 2026-10-06 |
| D6 | Un total por debajo de lo apartado por pedidos se acepta y la pantalla avisa que el lote queda sobre-reservado, como hoy. | Heredado QC-141 · Humano, 2026-10-06 |
| D7 | El asiento de ajuste guarda además la existencia anterior y el total contado, y el historial del lote los muestra. Requiere migración: columnas anulables, con valor solo en los ajustes. | Humano, 2026-10-06 |
| D8 | Contrato de servicios primero. `design.md` define las interfaces (entrada, salida, errores, firmas de la Server Action y del caso de uso). Una task T0 las publica con stubs y fixtures para que `frontend_dev` y `backend_dev` trabajen en paralelo. La integración real va en una task final con E2E. | Humano, 2026-10-06 (precedente QC-209 D10) |
| D9 | Permiso `inventario.modificar`, validado en el caso de uso. Un lote ajeno y uno inexistente dan el mismo error. | Heredado del código actual |
| D10 | E2E obligatorio: es un movimiento de inventario (`CHECKPOINTS.md`). Cubre el aumento, la disminución y el rechazo por existencia cambiada. | Heredado `CHECKPOINTS.md` |
| D11 | Sin dependencias nuevas. | Humano, 2026-10-06 |
