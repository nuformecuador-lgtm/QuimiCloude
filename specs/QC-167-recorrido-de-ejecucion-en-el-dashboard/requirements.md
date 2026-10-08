# QC-167 — recorrido-de-ejecucion-en-el-dashboard · requirements.md

> **Zona** `fullstack` · **Complejidad** `medium` · **depends_on** `QC-82` ·
> **Rama** `feature/QC-167-recorrido-de-ejecucion-en-el-dashboard` (nace de la rama de QC-82)
>
> ## Alcance
>
> El Administrador consulta en el dashboard el registro de ejecución que guarda QC-82. Ve una
> **lista paginada** de pedidos ejecutados, incluidos los que siguen en curso, y puede filtrarla
> por pedido, persona, fechas y cancelados. Cada pedido abre su **recorrido** en una página propia:
> las anotaciones en orden, el tiempo entre una y la siguiente, la duración total y las vueltas
> atrás marcadas.
>
> ## Lo que NO entra
>
> - Escribir el registro → **QC-82**.
> - Purgarlo pasados X días → **QC-124**.
> - Un permiso nuevo o abrir la vista a otro rol: sin ficha, se decidirá si llega a hacer falta.
> - Exportar (CSV/PDF) o mostrar gráficos: sin ficha.
> - Guardar lo que el operario marcó dentro de cada paso: sigue fuera, como fijaron QC-63 y QC-82.
>
> _Sembrado por `/afinar-feature` el 2026-10-07. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`._

## Requisitos (EARS)

> **Cómo se citan las decisiones.** `[D<n>]` es la fila **n-ésima** de `## Decisiones cerradas (no
> reabrir)`, contando desde arriba y sin reordenar: `D1` «¿Qué se muestra?» … `D10` «¿Costura del
> dashboard?». `[P<n>]` es una pregunta de `## Preguntas abiertas`.
>
> **Vocabulario.** «El registro» es `order_execution_entries` (QC-82). «Anotación» es una fila suya.
> «Pedido ejecutado» es un pedido de la empresa con **al menos una** anotación. «Recorrido» son las
> anotaciones de un pedido en orden. «Tramo» es el tiempo entre una anotación y la siguiente.
> «Anotaciones de ejecución» son arrancar, retomar, avanzar, retroceder, cancelar y finalizar;
> «anotaciones de empaque», comenzar y terminar empaque. «Número visible» es el que produce
> `formatOrderNumber` del contrato de `pedidos` (`2026-0000001`). «La lista» es la del área de
> contenido de `/dashboard`; «el detalle», la página del recorrido de un pedido.
>
> **Lo marcado con ⚑** está escrito con la propuesta de `design.md > 9` y espera el visto bueno del
> humano en F1.3. Si la cambia, se reescribe ese requisito y nada más.

### La lista

**R1.** CUANDO quien tiene `dashboard.consultar` abre el dashboard, el sistema DEBE mostrar en el
área de contenido una lista de los pedidos ejecutados de su empresa, **incluidos los que siguen en
curso**. Un pedido sin ninguna anotación **NO DEBE** aparecer. `[D1] [D6]`

**R2.** Cada fila DEBE mostrar: el número visible del pedido, su estado actual, las personas que
tienen alguna anotación en él, el instante de la primera y de la última anotación, la duración de la
ejecución, la duración del empaque, el número de vueltas atrás y un enlace a su recorrido. `[D1] [D2]`

**R3.** MIENTRAS el pedido está `EN_CURSO`, su fila DEBE marcarlo **«En curso»** y la duración de la
ejecución DEBE mostrarse **abierta**: contada hasta el instante de la consulta y señalada como
abierta. MIENTRAS está `EN_EMPAQUE`, lo mismo vale para la duración del empaque. `[D2] [D6]`

**R4.** ⚑ La lista DEBE ordenarse por número de pedido **descendente** (año y, dentro del año,
secuencia), con un orden total y estable entre páginas. `[D1]`

**R5.** La lista DEBE paginarse **en el servidor**, con la tabla compartida, a **10 o 25** filas por
página y 10 por defecto. SI la URL trae un tamaño distinto de esos dos o una página que no es un
entero mayor o igual que 1, ENTONCES el sistema DEBE usar el valor por defecto **sin error**. `[D4]`

### Los filtros

**R6.** CUANDO se filtra por pedido con un número visible, la lista DEBE mostrar **solo** ese pedido,
si es un pedido ejecutado de la empresa. La comparación DEBE admitir la secuencia con o sin ceros a
la izquierda (`2026-42` y `2026-0000042` son el mismo pedido) y DEBE ignorar los espacios de los
extremos. SI el texto no tiene la forma de un número visible, ENTONCES la lista DEBE quedar **vacía**:
el filtro **NO DEBE** ignorarse. `[D3] [P2]`

**R7.** CUANDO se filtra por persona, la lista DEBE mostrar solo los pedidos con al menos una
anotación **de esa persona**. Las opciones del filtro DEBEN ser las personas de la empresa que
tienen alguna anotación en el registro —**incluidas las dadas de baja o desactivadas**—, por su
nombre mostrable. `[D3]`

**R8.** CUANDO se filtra por rango de fechas, la lista DEBE mostrar solo los pedidos con al menos una
anotación cuyo instante cae dentro del rango, medido por **días en UTC con los dos extremos
inclusivos**. Un extremo vacío **NO DEBE** acotar por ese lado. `[D3]`

**R9.** CUANDO se activa «solo cancelados», la lista DEBE mostrar solo los pedidos cuyo **estado
actual es `CANCELADO`**, se cancelaran desde la pantalla de ejecución o desde la de pedidos. `[D3]`

**R10.** Los filtros activos DEBEN combinarse todos a la vez: una fila sale solo si cumple cada uno.
`[D3]`

**R11.** El pedido, la persona, el rango de fechas, «solo cancelados», la página y el tamaño DEBEN
vivir en la **URL**: recargar, compartir el enlace, cambiar de página o de tamaño y volver del
detalle DEBEN conservarlos. CUANDO cambia cualquier filtro, la lista DEBE volver a la página 1.
`[D3] [D7]`

### El recorrido

**R12.** CUANDO se activa el enlace de una fila, el sistema DEBE abrir el recorrido de ese pedido en
una **página propia bajo `/dashboard`** cuya URL identifica el pedido y se puede compartir: abrirla en
otra sesión con el mismo permiso y la misma empresa DEBE mostrar el mismo recorrido. `[D7]`

**R13.** El detalle DEBE mostrar el número visible y el estado actual del pedido y **todas** sus
anotaciones en orden cronológico —desempatando dos del mismo instante de forma estable—, cada una con
su acción en español, su instante, la persona que la hizo, la posición del paso cuando la tiene y el
motivo cuando es cancelar. `[D1]`

**R14.** Cada anotación salvo la última DEBE mostrar el **tramo** hasta la siguiente. `[D2]`

**R15.** ⚑ El detalle DEBE mostrar la **duración de la ejecución** y la **duración del empaque por
separado**, y la fila de la lista DEBE mostrar las mismas dos cifras:
- la ejecución va de la primera anotación de ejecución a la de finalizar o cancelar; el empaque, de
  comenzar empaque a terminar empaque; cada una se mide de **reloj**, de su primera a su última
  anotación, pausas incluidas `[P1]`;
- el tiempo entre finalizar y comenzar empaque **NO DEBE** sumarse a ninguna de las dos;
- SI falta la anotación de cierre y el pedido sigue `EN_CURSO` (o `EN_EMPAQUE`, para el empaque),
  ENTONCES esa duración DEBE ser abierta (R3);
- SI falta la anotación de cierre y el pedido ya no está en ese estado, ENTONCES esa duración DEBE
  cerrarse en la última anotación de esa parte y mostrarse marcada **«sin cierre anotado»**;
- SI no hay ninguna anotación de empaque, ENTONCES la duración del empaque DEBE mostrarse como
  **«sin empaque»**, no como cero. `[D2] [D6]`

**R16.** Cada anotación de **retroceder** DEBE quedar marcada visualmente en el recorrido, y su
número DEBE mostrarse en el detalle y en la fila con **la misma cifra**. `[D2]`

**R17.** CUANDO se vuelve del detalle a la lista, el sistema DEBE mostrar la lista con **los mismos
filtros, página y tamaño** con los que se abrió el detalle. SI el detalle se abrió sin ellos (por
ejemplo, con un enlace compartido sin parámetros), ENTONCES DEBE volver a la lista por defecto. `[D3]
[D7]`

**R18.** SI el pedido pedido en el detalle no existe, es de otra empresa, ⚑ está dado de baja `[P3]` o
no tiene ninguna anotación, ENTONCES el sistema DEBE responder **404**, con la misma respuesta en
los cuatro casos. `[D7] [D8]`

### Autorización

**R19.** La lista, las opciones de persona y el recorrido DEBEN leerse con **casos de uso del módulo
`asignaciones`** cuya **primera línea** exige `dashboard.consultar`, antes de validar la entrada y
antes de tocar ninguna dependencia. SI el actor está ausente, no trae permisos, los trae vacíos o no
trae ese código, ENTONCES el caso de uso DEBE rechazar con su error de autorización **sin haber
llamado a ninguna dependencia**. `[D5]`

**R20.** Las dos páginas —la del dashboard y la del detalle— DEBEN exigir `dashboard.consultar` antes
de leer ningún dato; SI la sesión no lo trae, ENTONCES DEBEN responder **404** sin nombrar el módulo
ni mencionar permisos. `[D5] [D9]`

**R21.** La feature **NO DEBE** añadir ningún permiso al catálogo ni cambiar los permisos que el seed
asigna a ningún rol. `[D5]`

**R22.** La feature **NO DEBE** escribir en el registro ni en ninguna otra tabla: todo lo que añade es
lectura. `[D1]`

### Aislamiento por empresa

**R23.** Toda lectura de la feature —registro, pedidos y personas— DEBE filtrar por la empresa del
actor, y la empresa **NUNCA** DEBE salir de la entrada. Un pedido o una persona de otra empresa
**NO DEBE** aparecer en la lista ni entre las opciones de persona; SI la URL trae el identificador de
una persona de otra empresa, ENTONCES la lista DEBE quedar vacía; y su recorrido DEBE responder 404
(R18). `[D8]`

**R24.** El registro DEBE consultarlo **solo** el módulo `asignaciones`; el número y el estado del
pedido DEBEN obtenerse por el **contrato público de `pedidos`**, y el nombre de las personas por el de
`identity`. `[D8]`

### La costura del dashboard

**R25.** El área de contenido del dashboard DEJA de estar vacía: DEBE contener la lista de R1 **y nada
más**. El test negativo de QC-12 R3 («el área se renderiza vacía») DEBE **enmendarse con nota
fechada** para afirmar eso, y las demás garantías de la pantalla —un único encabezado de primer
nivel, ningún landmark nuevo, `page.tsx` sin consultas propias fuera de lo permitido, nada de `100vh`—
**NO DEBEN aflojarse**. `[D10]`

### Plataforma y dependencias

**R26.** Todo control nuevo —los filtros, el interruptor de «solo cancelados», el enlace de cada fila
y el de volver— DEBE tener un objetivo táctil de al menos **44×44 px**, letra de al menos **16 px** en
los campos de texto, **NO DEBE** depender de `:hover` y DEBE ser operable por teclado.
*(`docs/architecture.md > Componentes > Regla: multiplataforma`, sin fila propia en la tabla.)*

**R27.** La feature **NO DEBE** añadir ninguna dependencia a `package.json` ni ninguna migración a
`db/`. *(`docs/architecture.md > Dependencias de terceros`; `progress/features/QC-167.md >
Evaluación`: «sin tablas nuevas».)*

### Verificación de extremo a extremo

**R28.** El sistema DEBE tener un E2E en el que el Administrador abre el dashboard con pedidos
ejecutados sembrados, **filtra** la lista por persona y por pedido, **abre un recorrido**, ve sus
anotaciones en orden con la vuelta atrás marcada y, al volver, encuentra la lista con los mismos
filtros. `[D9] [D3] [D7]`

**R29.** El sistema DEBE tener un E2E en el que un usuario de **otro rol** (Operador) recibe **404**
en `/dashboard` y en la URL del recorrido de un pedido de su propia empresa. `[D9] [D5]`

### Cobertura de las decisiones

| Decisión | Requisitos |
|---|---|
| D1 — lista de pedidos ejecutados y, al abrir uno, su recorrido | R1, R2, R4, R12, R13, R22 |
| D2 — tramos, duración total (empaque aparte), vueltas atrás | R2, R3, R14, R15, R16 |
| D3 — filtros en la URL, sobreviven a paginar y volver | R6, R7, R8, R9, R10, R11, R17, R28 |
| D4 — paginación en servidor, 10/25, tabla compartida | R5 |
| D5 — `dashboard.consultar`, sin permiso nuevo, en el service y con test | R19, R20, R21, R29 |
| D6 — en curso marcados, duración abierta | R1, R3, R15 |
| D7 — página propia bajo `/dashboard`, URL compartible, volver conserva filtros | R11, R12, R17, R18, R28 |
| D8 — todas las consultas por la empresa de la sesión | R18, R23, R24 |
| D9 — E2E: el Administrador filtra y abre; otro rol 404 | R20, R28, R29 |
| D10 — la costura se rellena y su test negativo se enmienda | R25 |

## Preguntas abiertas

- Cómo se cuenta la duración total si un pedido se retomó tras una pausa larga: tiempo de reloj
  de la primera a la última anotación, o la suma de los tramos. Lo propone el spec_author en el
  design y lo aprueba el humano en F1.3.
  - **P1 — PROPUESTA, pendiente de aprobación (F1.3).** Tiempo de **reloj** de la primera a la
    última anotación de cada parte (ejecución y empaque por separado), pausas incluidas. Las tres
    opciones, y por qué la suma de tramos no distingue una pausa de una recarga, en `design.md > 5`.
    Requisito afectado: R15.
- Con qué se busca un pedido en el filtro: el identificador visible que usa hoy la pantalla de
  pedidos. Lo comprueba el spec_author en el código, sin inventarlo.
  - **P2 — RESPONDIDA en el código.** El identificador visible es el **número de pedido**
    `AAAA-NNNNNNN`, que compone `formatOrderNumber` (`lib/modules/pedidos/domain/order-number.ts:18`)
    y pinta la columna «Nº de pedido» de la pantalla de pedidos
    (`app/(private)/pedidos/components/order-columns.tsx:182-190`). **Ojo:** la búsqueda `q` de esa
    pantalla **no** busca por número, busca por nombre de receta (`list-orders.ts:156-159`); el
    filtro de esta ficha busca por número, que es lo que dice la pregunta. Coincidencia **exacta**
    del número, con la secuencia con o sin ceros (R6). Si el humano quiere coincidencia parcial
    (`2026-00` → todos los de 2026), es un cambio de R6; ver `design.md > 9`.
- **P3 — Abierta, la abre el spec el 2026-10-07.** ¿Un pedido **dado de baja** con anotaciones sale
  en la lista y abre su recorrido? Puede pasar: un pedido `EN_CURSO` se puede borrar
  (`lib/modules/pedidos/domain/delete-order.ts:24` solo impide borrar `ENTREGADO`, `CANCELADO`,
  `POR_EMPACAR` y `EN_EMPAQUE`) y su registro se queda. **Propuesta: no sale y su detalle es 404**
  (R18), igual que la pantalla de pedidos no enseña los borrados y porque el contrato de `pedidos`
  que se reutiliza solo lee pedidos vivos. Si el humano quiere verlos, es un método de `pedidos`
  que incluya borrados y una marca «dado de baja» en la fila.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-10-07 | ¿Qué se muestra? | Lista de pedidos ejecutados y, al abrir uno, su recorrido paso a paso |
| 2026-10-07 | ¿Qué cálculos? | Tiempo entre anotaciones, duración total (el empaque aparte) y vueltas atrás marcadas y contadas |
| 2026-10-07 | ¿Filtros? | Pedido, persona, rango de fechas y solo cancelados. Viven en la URL y sobreviven a la paginación y a volver del detalle (heredado de QC-102) |
| 2026-10-07 | ¿Paginación? | En el servidor, 10/25 por página, con la tabla compartida (heredado de QC-55/QC-88) |
| 2026-10-07 | ¿Quién lo ve? | `dashboard.consultar`, que hoy solo tiene el Administrador. Sin permiso nuevo. Se valida en el service y lleva su test |
| 2026-10-07 | ¿Pedidos en curso? | Salen en la lista marcados «en curso», con la duración abierta |
| 2026-10-07 | ¿Dónde vive el detalle? | Página propia bajo `/dashboard`, con URL compartible; volver conserva los filtros |
| 2026-10-07 | ¿Aislamiento? | Todas las consultas filtran por la empresa de la sesión (heredado de QC-82 y QC-102) |
| 2026-10-07 | ¿E2E? | Sí: el Administrador filtra y abre un recorrido; otro rol recibe 404 |
| 2026-10-07 | ¿Costura del dashboard? | La costura vacía de `dashboard-content.tsx` (QC-75) se rellena aquí, y su test negativo se enmienda |
