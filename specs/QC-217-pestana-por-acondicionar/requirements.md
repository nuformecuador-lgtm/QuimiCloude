# QC-217 — pestana-por-acondicionar · requirements.md

> Zona: fullstack · Complejidad: — (la asigna el leader en F1.0) · depends_on: QC-215, QC-216 · Rama: feature/QC-217-pestana-por-acondicionar
>
> **Alcance.** Dentro de `/asignacion`, quien tiene el permiso de acondicionamiento (QC-216) ve
> dos vistas. «Por acondicionar» lista los pedidos POR_ACONDICIONAR y EN_ACONDICIONAMIENTO de su
> empresa. «Terminados» lista solo los que acondicionó él. Cada fila abre la pantalla de detalle
> del pedido para el acondicionador, en solo lectura.
>
> **Lo que NO entra.** La acción Acondicionar, el equipo y el bloqueo de 5 s (QC-218). Los datos
> de lote (QC-219). Los estados (QC-215) y el rol (QC-216).
>
> Sembrado por `/afinar-feature` el 2026-10-06. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

> Notación EARS (`docs/specs.md`). Cada requisito cita entre corchetes las filas de «Decisiones
> cerradas» que lo originan, numeradas en el orden de la tabla:
>
> - **[D1]** dónde trabaja · **[D2]** columnas · **[D3]** los ya entregados (enmendada por D9) ·
>   **[D4]** otras pestañas;
> - **[D5]** la fila abre el detalle · **[D6]** quién ve la pestaña · **[D7]** E2E · **[D8]**
>   dependencia;
> - **[D9]** estados de «Terminados» · **[D10]** columnas de «Terminados» · **[D11]** qué es
>   «envases» · **[D12]** URL, ruta y textos.
>
> Contexto mergeado que esta ficha da por hecho (QC-215, QC-216, en `dev`):
>
> - cadena `EN_EMPAQUE → POR_ACONDICIONAR → EN_ACONDICIONAMIENTO → TERMINADO → ENTREGADO`; terminar el
>   acondicionamiento deja `TERMINADO` con `finishedAt` (QC-215 R12, D11);
> - el pedido guarda quién lo acondiciona (QC-215 R8, columna `orders.conditioned_by`).
>
> Vocabulario fijo:
>
> - «el permiso» = `acondicionamiento.modificar` (QC-216).
> - «el acondicionador» = un actor con el permiso. «Los roles sin el permiso» = los conjuntos de
>   permisos de semilla de `Administrador`, `Operador` y `Empacador`.
> - «quien acondiciona» = la persona guardada en el pedido al comenzar el acondicionamiento.
> - «Por acondicionar» = la pestaña de trabajo de esta ficha, vista `por_acondicionar`.
> - «Terminados del acondicionador» = su segunda pestaña, rotulada «Terminados», vista
>   `acondicionados`.
> - «El Terminados del Empacador» = la vista que ya existe (QC-201, QC-215 R31), que no cambia.
> - «el detalle» = la pantalla `/asignacion/acondicionamiento/<id>`.
> - «el reparto» = las líneas de presentación del pedido en orden de alta, cada una escrita
>   «<envases> × <envase>», como en el ejemplo del humano «12 × 500 g / 4 × 1 kg».

### Vistas de `/asignacion`

**R1.** CUANDO se resuelven las vistas de `/asignacion` para un portador de permisos que tiene el
permiso, el resultado DEBE incluir `por_acondicionar` y `acondicionados`, en ese orden y detrás de
las vistas que ya le correspondían por sus otros permisos. La decisión DEBE depender solo del
permiso, nunca del nombre del rol. [D1, D6, D12]

**R2.** CUANDO se resuelven las vistas con exactamente los permisos de semilla del Administrador de
acondicionamiento, el resultado DEBE ser exactamente `por_acondicionar` y `acondicionados`, en ese
orden: NO DEBE incluir «Mis asignados», «Por empacar», «Todos» ni el Terminados del Empacador. La
vista por defecto de ese usuario DEBE ser «Por acondicionar». *(Enmienda QC-216 R16.)* [D1, D4]

**R3.** SI el portador no tiene el permiso, ENTONCES sus vistas NO DEBEN incluir ninguna de las dos
de esta ficha. Con los permisos de semilla de cada uno de los roles sin el permiso, el resultado
DEBE ser exactamente el de antes de esta feature. [D6]

**R4.** SI la dirección pide `?vista=por_acondicionar` o `?vista=acondicionados` y el usuario no
tiene el permiso, ENTONCES `/asignacion` DEBE pintar su vista por defecto, sin error, sin la pestaña
pedida y sin ningún dato de esas listas. [D6, D12]

**R5.** MIENTRAS el usuario de `/asignacion` tenga el permiso, la página DEBE pintar las pestañas
«Por acondicionar» y «Terminados», con la vigente marcada y un objetivo táctil de al menos 44×44
px. Cada pestaña DEBE ser un enlace que lleva a su vista. [D1, D3, D12]

### «Por acondicionar»

**R6.** CUANDO un actor con el permiso lista «Por acondicionar», el sistema DEBE devolver todos los
pedidos vivos de su empresa en `POR_ACONDICIONAR` o `EN_ACONDICIONAMIENTO`, sin filtrar por
asignación ni por quién acondiciona. El orden DEBE ser el de la lista de trabajo (el de «Por
empacar»). El total y la paginación DEBEN resolverse en la consulta. NO DEBE devolver pedidos de
otra empresa, dados de baja ni en otro estado. [D1]

**R7.** Cada fila de «Por acondicionar» DEBE traer:

- el número de pedido formateado;
- el nombre de la receta, vacío si la receta ya no se encuentra;
- el reparto, con todas sus líneas; vacío si el pedido no tiene reparto;
- el estado;
- el nombre de quien acondiciona, vacío en `POR_ACONDICIONAR`. Se resuelve también cuando esa
  persona está dada de baja.

[D2, D11]

**R8.** La pestaña «Por acondicionar» DEBE pintar la lista con la tabla compartida, con exactamente
cinco columnas en este orden: «Nº de pedido», «Receta», «Envases», «Estado» y «Quién acondiciona».

- La columna «Envases» DEBE mostrar todas las líneas del reparto, separadas por « / » y en orden de
  alta (p. ej. «12 × 500 g / 4 × 1 kg»), no un total. Un pedido sin reparto DEBE decir «Sin
  presentación».
- La columna de estado DEBE pintar «Por acondicionar» y «En acondicionamiento», con `data-status`
  igual al valor.
- Cualquier otro dato ausente DEBE pintarse con la marca «—».

[D2, D11]

**R9.** SI «Por acondicionar» no tiene pedidos, ENTONCES la pestaña DEBE decir «No hay pedidos por
acondicionar en tu empresa.». SI se pide una página posterior a la última, ENTONCES DEBE decir
«Esta página ya no tiene pedidos.» con un enlace a la primera página. [D1, D12]

**R10.** CUANDO el usuario cambia de página o de tamaño de página en cualquiera de las dos
pestañas, la dirección resultante DEBE conservar la vista vigente. [D1, D3]

### «Terminados del acondicionador»

**R11.** CUANDO un actor con el permiso lista «Terminados del acondicionador», el sistema DEBE
devolver solo los pedidos vivos de su empresa en `TERMINADO` cuyo quien acondiciona es el propio
actor. El orden DEBE ser el de terminados: `finishedAt` descendente y después número descendente.
El filtro, el total y la paginación DEBEN resolverse en la consulta. NO DEBE devolver un pedido
`ENTREGADO` (aunque lo acondicionara él), uno que acondicionó otra persona ni uno sin quien
acondiciona. [D3, D9]

**R12.** La pestaña «Terminados» del acondicionador DEBE pintar la lista con la tabla compartida y
con exactamente las columnas del Terminados del Empacador, con los mismos rótulos, el mismo orden y
el mismo contenido de celda: «Nº de pedido» (fijada a la izquierda), «Receta», «Cantidad»,
«Presentación», «Fecha de terminado» y «Responsables». La única diferencia DEBE ser que el número es
un enlace al detalle (R14). SI la lista está vacía, ENTONCES DEBE decir «Todavía no has terminado
ningún acondicionamiento.». [D2, D3, D10, D12]

**R13.** El listado de «Terminados del acondicionador» NO DEBE exigir `terminados.consultar` ni
`pedidos.consultar`. El Terminados del Empacador NO DEBE cambiar en nada: permiso, estados, filtro,
columnas y número sin enlace. [D3, D6, D10]

### El detalle

**R14.** En las dos pestañas, el número de pedido de cada fila DEBE ser un enlace al detalle de ese
pedido, `/asignacion/acondicionamiento/<id>`, con un objetivo táctil de al menos 44×44 px.
[D5, D12]

**R15.** CUANDO un actor con el permiso abre el detalle de un pedido vivo de su empresa, la
pantalla DEBE mostrar número, receta, cantidad con su unidad, el reparto con todas sus líneas,
estado y quién acondiciona. Los valores DEBEN ser los mismos que los de su fila. Vale para:

- un pedido en `POR_ACONDICIONAR` o `EN_ACONDICIONAMIENTO`, lo acondicione quien lo acondicione;
- un pedido en `TERMINADO` que acondicionó el propio actor.

[D5, D9, D11]

**R16.** El detalle NO DEBE ofrecer ningún control que cambie el pedido: ni botón, ni formulario, ni
invocación de una Server Action. DEBE ofrecer un enlace de vuelta:

- «Volver a «Por acondicionar»» si el pedido está en `POR_ACONDICIONAR` o `EN_ACONDICIONAMIENTO`;
- «Volver a «Terminados»» si está en `TERMINADO`.

Cuando hay quien acondiciona, DEBE decir «Lo acondiciona <nombre>.». [D5, D12]

**R17.** El detalle DEBE responder con el 404 de la zona privada, el mismo en todos los casos y sin
revelar cuál fue, SI el pedido:

- no existe, está dado de baja o es de otra empresa;
- está en un estado distinto de los de R15, `ENTREGADO` incluido;
- está en `TERMINADO` con otra persona, o nadie, como quien acondiciona.

[D5, D6, D9]

**R18.** SI quien pide el detalle no tiene el permiso, ENTONCES la página DEBE responder con el 404
de la zona privada antes de leer ningún pedido. Vale en particular para los roles sin el permiso.
[D6]

### Autorización en el service

**R19.** SI el actor es nulo o no tiene el permiso, ENTONCES los tres casos de uso de esta ficha
(listar «Por acondicionar», listar «Terminados del acondicionador» y leer el detalle) DEBEN
rechazar con `unauthorized`, antes de validar la entrada y sin invocar ningún puerto. Vale en
particular para un actor con exactamente los permisos de semilla de cada rol sin el permiso. [D6]

**R20.** SI la entrada de un listado no es exactamente `{ page, pageSize? }` con enteros positivos,
o la del detalle no es exactamente `{ orderId: <uuid> }`, ENTONCES el caso de uso DEBE rechazar con
`invalid_input`, sin invocar ningún puerto. [D6]

**R21.** Ningún archivo de producción DEBE decidir las vistas, los listados ni el detalle por
nombre de rol: la guardia de autorización por permiso DEBE seguir en verde. El código del permiso
DEBE aparecer únicamente en:

- el catálogo de permisos;
- los dos casos de uso de QC-215 y los tres de esta ficha;
- el predicado que decide las vistas;
- la página del detalle.

*(Relaja QC-215 R17 y QC-216 R17 abriendo esas rutas exactas.)* [D6]

### Verificación y alcance

**R22.** El E2E DEBE recorrer, con el rol Administrador de acondicionamiento real del seed:

- el login aterriza en `/asignacion` con exactamente las pestañas «Por acondicionar» y «Terminados»;
- «Por acondicionar» muestra un pedido `POR_ACONDICIONAR` de su empresa, con su reparto completo en
  «Envases», y uno `EN_ACONDICIONAMIENTO` que acondiciona otra persona, con su nombre;
- el número abre el detalle, que muestra el número y el estado y ningún botón;
- «Terminados» muestra el pedido `TERMINADO` que acondicionó él, y no muestra el `TERMINADO` que
  acondicionó otro ni un `ENTREGADO` que acondicionó él;
- el número del suyo abre el detalle.

[D1, D3, D4, D5, D7, D9, D11]

**R23.** El E2E DEBE comprobar, con los roles reales del seed `Operador`, `Empacador` y
`Administrador`, que en `/asignacion` no aparece la pestaña «Por acondicionar», tampoco pidiendo su
vista por la dirección, y que el detalle de un pedido `POR_ACONDICIONAR` de su empresa responde 404.
Recoge el E2E diferido por QC-216 (R27, D6). [D6, D7]

**R24.** El sistema DEBE probar R1–R21 con tests unitarios, de integración y guardias. Esta feature
NO DEBE añadir ninguna dependencia a `package.json` ni modificar `db/schema.prisma` ni
`db/migrations/`. [D7, D8]

### Cobertura de la tabla de decisiones

| Decisión | Requisitos |
|---|---|
| D1 Dónde trabaja | R1, R2, R5, R6, R9, R10, R22 |
| D2 Columnas | R7, R8, R12 |
| D3 Los ya entregados, en «Terminados» (enmendada por D9) | R5, R10, R11, R12, R13, R22 |
| D4 Ninguna otra pestaña | R2, R22 |
| D5 La fila abre el detalle, solo lectura | R14, R15, R16, R17, R22 |
| D6 Quién ve la pestaña, en el service | R1, R3, R4, R13, R17, R18, R19, R20, R21, R23 |
| D7 E2E | R22, R23, R24 |
| D8 Dependencia | R24 |
| D9 «Terminados» = solo `TERMINADO` acondicionados por él | R11, R15, R17, R22 |
| D10 Columnas de «Terminados» = las del Empacador | R12, R13 |
| D11 «Envases» = el reparto por línea | R7, R8, R15, R22 |
| D12 URL, ruta y textos | R1, R4, R5, R9, R12, R14, R16 |

## Preguntas abiertas

P1, P2 y P3 se cerraron el 2026-10-08: filas D9, D10 y D11 de «Decisiones cerradas».

**Pendiente para QC-219 (no lo resuelve esta ficha).** Por D9, un pedido `ENTREGADO` deja de salir
en «Terminados» del acondicionador, y su detalle responde 404 (R17). Corregir los datos de lote de un
pedido ya `ENTREGADO` («se corrigen después de entregado», QC-219) necesita otra vía de acceso. Hoy
ninguna vía de la aplicación escribe `ENTREGADO` (QC-215 R33), así que no pasa todavía.

**Aviso para el leader.** La decisión sembrada de QC-218 («al confirmar, el pedido pasa a
ENTREGADO») es anterior a QC-215 D11 y hay que contrastarla en su F1.2. R2 de esta ficha enmienda
QC-216 R16.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-10-06 | ¿Dónde trabaja el acondicionador? | Pestaña **«Por acondicionar»** en `/asignacion`, como «Por empacar» (QC-168). Sin asignación: todos los pedidos POR_ACONDICIONAR y EN_ACONDICIONAMIENTO de su empresa |
| 2026-10-06 | ¿Qué columnas? | Número, receta, envases, estado y quién acondiciona. Con la tabla compartida (QC-55) |
| 2026-10-06 | ¿Ve los ya entregados? | **Sí, solo los que acondicionó él**, en «Terminados», como el Empacador (QC-201). Sirve para reabrir el detalle y corregir sus datos de lote (QC-219). **Enmendada el 2026-10-08 por la fila D9:** «Terminados» lista solo `TERMINADO`; un `ENTREGADO` deja de salir |
| 2026-10-06 | ¿Qué otras pestañas ve? | **Ninguna más:** ni «Mis asignados» ni «Por empacar» |
| 2026-10-06 | ¿Qué hace la fila? | Abre la **pantalla de detalle** del pedido para el acondicionador. En esta ficha es solo lectura: las acciones llegan en QC-218 y los datos de lote en QC-219 |
| 2026-10-06 | ¿Quién ve la pestaña? | Solo quien tiene el permiso de acondicionamiento. El Administrador no: supervisa desde «Todos» (QC-145). Se autoriza **en el service**, por permiso |
| 2026-10-06 | ¿E2E? | **Sí.** El acondicionador ve la pestaña y entra al detalle; Operador, Empacador y Administrador no ven «Por acondicionar». Recoge la E2E diferida desde QC-216 |
| 2026-10-06 | ¿Dependencia nueva? | **Ninguna.** |
| 2026-10-08 | P1: ¿Qué estados lista «Terminados» del acondicionador? (tras QC-215 D11) | **(a) Solo `TERMINADO` acondicionados por él.** Un pedido `ENTREGADO` deja de salir. Enmienda la fila «¿Ve los ya entregados?». Queda pendiente para QC-219 que corregir datos de lote de un `ENTREGADO` necesita otra vía de acceso |
| 2026-10-08 | P2: ¿Qué columnas tiene «Terminados» del acondicionador? | **(b) Las mismas que el «Terminados» del Empacador (QC-201)**, tal como están hoy en `dev` |
| 2026-10-08 | P3: ¿Qué es «envases» en la columna? | **(b) El reparto por línea** (p. ej. «12 × 500 g / 4 × 1 kg»), no el total. Se aplica a la columna «Envases» de «Por acondicionar»; «Terminados» no la tiene, porque sus columnas son las del Empacador |
| 2026-10-08 | Propuestas N1–N3 del `design.md > 10` | **Aprobadas con el spec:** URL `?vista=por_acondicionar` y `?vista=acondicionados` (rótulo «Terminados»), ruta del detalle `/asignacion/acondicionamiento/[id]` y textos de vacío, de vuelta y de quién acondiciona |
