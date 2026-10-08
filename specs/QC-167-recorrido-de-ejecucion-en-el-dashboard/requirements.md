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
> dashboard?», y las cuatro que el humano cerró al revisar el spec el 2026-10-07: `D11` «¿Cómo se
> cuenta la duración?», `D12` «¿Pedidos dados de baja?», `D13` «¿Orden de la lista?» y `D14`
> «¿Búsqueda por número?»; y las tres que cerró después ese mismo día: `D15` «¿Búsqueda sin
dígitos?», `D16` «¿«2026-42» encuentra «2026-0000042»?» y `D17` «¿Formato de duraciones largas?».
`[P<n>]` es una pregunta de `## Preguntas abiertas`. Donde D11 y D2
> difieren («el empaque aparte»), manda D11, que es posterior.
>
> **Vocabulario.** «El registro» es `order_execution_entries` (QC-82). «Anotación» es una fila suya.
> «Pedido ejecutado» es un pedido de la empresa con **al menos una** anotación, esté vivo o dado de
> baja. «Recorrido» son las anotaciones de un pedido en orden. «Tramo» es el tiempo entre una
> anotación y la siguiente. «Anotación de cierre» es **cancelar** o **terminar empaque**: las dos que
> dejan el pedido en un estado final. «Estado final» es `ENTREGADO` o `CANCELADO`, los dos que no
> tienen ninguna transición de salida (`lib/modules/pedidos/domain/order-transitions.ts:44-45`).
> «Pedido activo» es un pedido **no dado de baja** cuyo estado actual **no es final**; por las
> transiciones del código, un pedido con anotaciones activo está en la práctica en `EN_CURSO`,
> `POR_EMPACAR` o `EN_EMPAQUE`. «Dado de baja» es un pedido con borrado lógico. «Número visible» es
> el que produce `formatOrderNumber` del contrato de `pedidos` (`2026-0000001`). «La lista» es la
> del área de contenido de `/dashboard`; «el detalle», la página del recorrido de un pedido.

### La lista

**R1.** CUANDO quien tiene `dashboard.consultar` abre el dashboard, el sistema DEBE mostrar en el
área de contenido una lista de los pedidos ejecutados de su empresa, **incluidos los que siguen en
curso y los dados de baja**. Un pedido sin ninguna anotación **NO DEBE** aparecer. `[D1] [D6] [D12]`

**R2.** Cada fila DEBE mostrar: el número visible del pedido, su estado actual, las personas que
tienen alguna anotación en él, el instante de la primera y de la última anotación, **la duración**
(una sola cifra, R15), el número de vueltas atrás y un enlace a su recorrido. SI el pedido está dado
de baja, ENTONCES su fila DEBE llevar además la marca **«Dado de baja»**. `[D1] [D2] [D11] [D12]`

**R3.** MIENTRAS el pedido está activo, su fila DEBE marcarlo **«En curso»** y su duración DEBE
mostrarse **abierta**: contada desde la primera anotación hasta el instante de la consulta y
señalada como abierta. CUANDO el pedido deja de estar activo —llega a un estado final o se da de
baja—, la duración **NO DEBE** seguir abierta. `[D6] [D11]`

**R4.** La lista DEBE ordenarse por número de pedido **descendente** (año y, dentro del año,
secuencia), con un orden total y estable entre páginas. `[D1] [D13]`

**R5.** La lista DEBE paginarse **en el servidor**, con la tabla compartida, a **10 o 25** filas por
página y 10 por defecto. SI la URL trae un tamaño distinto de esos dos o una página que no es un
entero mayor o igual que 1, ENTONCES el sistema DEBE usar el valor por defecto **sin error**. `[D4]`

### Los filtros

**R6.** CUANDO se filtra por pedido con un texto, la lista DEBE mostrar **solo** los pedidos
ejecutados de la empresa cuyo **número visible contiene ese texto como subcadena**, tras quitar los
espacios de los extremos del texto. La comparación es carácter a carácter contra el número tal como
se ve (`AAAA-NNNNNNN`, con los ceros de relleno), sin normalizar nada más:
- `42` DEBE encontrar `2026-0000042`, `2026-0000142` y `2026-0004200`, y **NO DEBE** encontrar
  `2026-0000043`;
- `0000042` DEBE encontrar `2026-0000042` y `2025-0000042`, y **NO DEBE** encontrar `2026-0000142`;
- `2026-0000042` DEBE encontrar exactamente ese pedido; `2026-` DEBE encontrar todos los de 2026;
- `2026-42` **NO DEBE** encontrar `2026-0000042`, porque no es una subcadena de lo que se ve (sí
  encontraría `2026-4200000`) `[D16]`;
- `2026` DEBE encontrar los pedidos de 2026 **y** los de cualquier año cuya secuencia visible
  contenga `2026` (p. ej. `2025-0002026`).

SI el texto, ya sin espacios en los extremos, contiene algún carácter que no sea dígito ni guion
(`abc`, `42a`, `2026 42`), **o no contiene ningún dígito** (`-`, `--`), ENTONCES la lista DEBE
quedar **vacía, sin error**: el filtro **NO DEBE** ignorarse. SI el texto queda vacío, ENTONCES el
filtro DEBE tratarse como ausente. `[D3] [D14] [D15] [D16] [P2]`

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

**R13.** El detalle DEBE mostrar el número visible y el estado actual del pedido —con la marca
**«Dado de baja»** SI lo está— y **todas** sus anotaciones en orden cronológico —desempatando dos
del mismo instante de forma estable—, cada una con su acción en español, su instante, la persona que
la hizo, la posición del paso cuando la tiene y el motivo cuando es cancelar. `[D1] [D12]`

**R14.** Cada anotación salvo la última DEBE mostrar el **tramo** hasta la siguiente. `[D2]`

**R15.** El detalle y la fila de la lista DEBEN mostrar **una sola duración** por pedido, **la
misma cifra** en los dos sitios, medida de **reloj** desde la **primera** anotación del recorrido
hasta la **última**, sean de ejecución o de empaque. Las pausas, los `retomar` y el hueco entre
finalizar y comenzar empaque **DEBEN** quedar dentro; **NO DEBE** haber una cifra de ejecución y
otra de empaque. Además:
- MIENTRAS el pedido está activo, ENTONCES la duración DEBE ser **abierta** y contarse hasta el
  instante de la consulta, no hasta la última anotación (R3);
- SI el pedido no está activo y su última anotación es una anotación de cierre, ENTONCES la
  duración DEBE mostrarse **cerrada**;
- SI el pedido no está activo y su última anotación **no** es una anotación de cierre (p. ej. se
  canceló desde la pantalla de pedidos, o se dio de baja a mitad de la ejecución), ENTONCES la
  duración DEBE cerrarse en la última anotación y mostrarse marcada **«sin cierre anotado»**.
- Un pedido con una sola anotación que no está activo DEBE mostrar duración cero, con la marca que
  le toque por las dos reglas anteriores.
- **Formato:** una duración **menor de 24 h** DEBE mostrarse en horas, minutos y segundos
  (`1 h 05 min`, `12 min 30 s`, `45 s`, `0 s`); una de **24 h o más** DEBE mostrarse en días, horas
  y minutos con horas y minutos a dos cifras (`2 d 02 h 05 min`; exactamente 24 h es `1 d 00 h 00
  min`). `[D2] [D6] [D11] [D17]`

**R16.** Cada anotación de **retroceder** DEBE quedar marcada visualmente en el recorrido, y su
número DEBE mostrarse en el detalle y en la fila con **la misma cifra**. `[D2]`

**R17.** CUANDO se vuelve del detalle a la lista, el sistema DEBE mostrar la lista con **los mismos
filtros, página y tamaño** con los que se abrió el detalle. SI el detalle se abrió sin ellos (por
ejemplo, con un enlace compartido sin parámetros), ENTONCES DEBE volver a la lista por defecto. `[D3]
[D7]`

**R18.** SI el pedido pedido en el detalle no existe, es de otra empresa o no tiene ninguna
anotación, ENTONCES el sistema DEBE responder **404**, con la misma respuesta en los tres casos.
Un pedido **dado de baja** con anotaciones de la empresa **NO DEBE** responder 404: su recorrido DEBE
abrirse, con la marca de R13. `[D7] [D8] [D12]`

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

**R24.** El registro DEBE consultarlo **solo** el módulo `asignaciones`; el número, el estado y la
marca de baja del pedido, y el filtro por número de R6, DEBEN obtenerse por el **contrato público de
`pedidos`**, y el nombre de las personas por el de `identity`. `[D8] [D12] [D14]`

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
| D2 — tramos, duración total, vueltas atrás (lo del empaque aparte lo sustituye D11) | R2, R14, R15, R16 |
| D3 — filtros en la URL, sobreviven a paginar y volver | R6, R7, R8, R9, R10, R11, R17, R28 |
| D4 — paginación en servidor, 10/25, tabla compartida | R5 |
| D5 — `dashboard.consultar`, sin permiso nuevo, en el service y con test | R19, R20, R21, R29 |
| D6 — en curso marcados, duración abierta | R1, R3, R15 |
| D7 — página propia bajo `/dashboard`, URL compartible, volver conserva filtros | R11, R12, R17, R18, R28 |
| D8 — todas las consultas por la empresa de la sesión | R18, R23, R24 |
| D9 — E2E: el Administrador filtra y abre; otro rol 404 | R20, R28, R29 |
| D10 — la costura se rellena y su test negativo se enmienda | R25 |
| D11 — una sola duración de reloj, de la primera a la última anotación | R2, R3, R15 |
| D12 — los dados de baja salen marcados y abren su recorrido | R1, R2, R13, R18, R24 |
| D13 — orden por número de pedido descendente | R4 |
| D14 — búsqueda por parte del número visible | R6, R24 |
| D15 — la búsqueda exige al menos un dígito | R6 |
| D16 — «2026-42» no encuentra «2026-0000042» | R6 |
| D17 — duraciones de 24 h o más en días | R15 |

## Preguntas abiertas

- Cómo se cuenta la duración total si un pedido se retomó tras una pausa larga: tiempo de reloj
  de la primera a la última anotación, o la suma de los tramos. Lo propone el spec_author en el
  design y lo aprueba el humano en F1.3.
  - **P1 — CERRADA por el humano el 2026-10-07 (D11).** «Reloj, todo junto»: **una** duración por
    pedido, de la primera a la última anotación, ejecución y empaque juntos, pausas y hueco entre
    finalizar y comenzar empaque incluidos. Abierta mientras el pedido está activo; «sin cierre
    anotado» si no está activo y su última anotación no es de cierre. Requisitos: R2, R3, R15.
- Con qué se busca un pedido en el filtro: el identificador visible que usa hoy la pantalla de
  pedidos. Lo comprueba el spec_author en el código, sin inventarlo.
  - **P2 — RESPONDIDA en el código.** El identificador visible es el **número de pedido**
    `AAAA-NNNNNNN`, que compone `formatOrderNumber` (`lib/modules/pedidos/domain/order-number.ts:18`)
    y pinta la columna «Nº de pedido» de la pantalla de pedidos
    (`app/(private)/pedidos/components/order-columns.tsx:182-190`). **Ojo:** la búsqueda `q` de esa
    pantalla **no** busca por número, busca por nombre de receta (`list-orders.ts:156-159`); el
    filtro de esta ficha busca por número, que es lo que dice la pregunta. El humano eligió el
    2026-10-07 la coincidencia **por parte del número** (D14): subcadena sobre el número visible,
    con los ejemplos de R6.
- **P3 — CERRADA por el humano el 2026-10-07 (D12).** ¿Un pedido **dado de baja** con anotaciones
  sale en la lista y abre su recorrido? Puede pasar: un pedido `EN_CURSO` se puede borrar
  (`lib/modules/pedidos/domain/delete-order.ts:24` solo impide borrar `ENTREGADO`, `CANCELADO`,
  `POR_EMPACAR` y `EN_EMPAQUE`) y su registro se queda. **Decisión: «Aparece marcado».** Sale en la
  lista con la marca «Dado de baja» y su recorrido se abre; el 404 queda para inexistente, de otra
  empresa o sin anotaciones. Requisitos: R1, R2, R13, R18, R24.

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
| 2026-10-07 | ¿Cómo se cuenta la duración? | «Reloj, todo junto»: UNA duración por pedido, de la primera a la última anotación (ejecución y empaque juntos, pausas y hueco entre finalizar y comenzar empaque incluidos). Abierta mientras el pedido no ha llegado a un estado final; «sin cierre anotado» si quedó sin anotación final y ya no está activo. Sustituye «el empaque aparte» de «¿Qué cálculos?» |
| 2026-10-07 | ¿Pedidos dados de baja? | «Aparece marcado»: un pedido dado de baja con anotaciones sale en la lista con la marca «dado de baja» y su recorrido se puede abrir. El 404 queda para inexistente, de otra empresa o sin anotaciones. «Solo cancelados» sigue mirando el estado `CANCELADO` |
| 2026-10-07 | ¿Orden de la lista? | Número de pedido descendente |
| 2026-10-07 | ¿Búsqueda por número? | «Parte del número»: con «42» salen 2026-0000042, 2026-0000142…; texto sin dígitos ni guion, lista vacía sin error |
| 2026-10-07 | ¿Búsqueda sin dígitos? | El texto debe tener al menos un dígito. Sin dígitos (p. ej. «-» solo) la lista queda vacía, sin error |
| 2026-10-07 | ¿«2026-42» encuentra «2026-0000042»? | No, y se acepta así: la búsqueda es subcadena del número visible, sin normalizar ceros |
| 2026-10-07 | ¿Formato de duraciones largas? | A partir de 24 h, en días: «2 d 02 h 05 min». Por debajo, como estaba (horas, minutos, segundos) |
