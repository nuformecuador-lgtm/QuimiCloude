# QC-34 — crud-de-pedidos · requirements.md

> **Zona:** `backend` · **Complejidad:** `high` · **depends_on:** `QC-33`, `QC-8` ·
> **Rama:** `feature/QC-34-crud-de-pedidos`
>
> **Alcance.** Los casos de uso de pedidos sobre el modelo que dejó **QC-33**: alta, consulta
> paginada, edición, **cancelación** y borrado, con su superficie de servidor (Server Actions) y
> sin pantalla. Entra además **una migración**, porque la acotación añadió un cuarto estado
> —`CANCELADO`— con su motivo, y cambió la restricción de borrado que QC-33 escribió en la base.
> Es la ficha que decide los permisos, las transiciones de estado y quién calcula el número
> correlativo: las tres cosas que QC-33 dejó escritas para aquí.
>
> **Lo que NO entra.** La pantalla y todo lo visual, que es **QC-35**. Las **devoluciones**: un
> pedido entregado no se deshace, y hoy no existe ficha que lo resuelva (pregunta abierta 1). El
> modelo de recetas y el de unidades no se tocan más allá de lo que sus **contratos públicos**
> deban publicar para que esta ficha lea nombres. La caché de sesión es **QC-28** y el registro de
> sesiones **QC-23**: aquí la sesión se consume tal como está hoy.
>
> Sembrado por `/afinar-feature` el 2026-09-04. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

Notación EARS (`docs/specs.md`). **«El sistema»** aquí es el módulo **`pedidos`** —sus casos de uso,
sus puertos y sus adaptadores—, la **migración** de esta ficha, y lo que el contrato público de
`recetas` tenga que publicar para que esta ficha lea nombres. **El modelo no se re-especifica**: lo
aportó **QC-33** (`db/schema.prisma`, `db/migrations/20260903191204_orders/`) y sus **R1–R42** siguen
vigentes tal cual salvo lo que esta ficha cambia expresamente, que es **solo** lo de R48–R50: el
cuarto valor del tipo de estado, la columna del motivo y el `CHECK` de borrado.

Los **seis casos de uso** a los que se refieren los requisitos de autorización son: **crear**,
**consultar la ficha**, **listar**, **editar**, **cancelar** y **borrar** un pedido. La decisión
cerrada habla de «cinco operaciones» porque cuenta consultar una sola vez; aquí la ficha y el
listado se cuentan por separado, como en **QC-43**, porque son dos casos de uso y llevan dos tests.

### Autorización y actor

**R1.** El sistema DEBE recibir el actor —su identificador y su rol— **como parámetro de entrada** de
cada uno de los seis casos de uso, y ningún archivo de `lib/modules/pedidos/domain/**` ni de
`lib/modules/pedidos/ports/**` DEBE leer la sesión, una cookie ni una cabecera por su cuenta.

**R2.** SI el rol del actor no es `Administrador`, ENTONCES cualquiera de los seis casos de uso DEBE
rechazar la operación con un error de autorización y NO DEBE realizar ninguna lectura ni ninguna
escritura por ningún puerto —ni el repositorio de pedidos, ni el catálogo de recetas, ni el de
unidades—. Esto incluye **consultar y listar**: el Operador tampoco lee.

**R3.** SI la operación llega sin actor, o con un actor cuyo rol es nulo, vacío o desconocido,
ENTONCES el sistema DEBE rechazarla igual que en R2 (falla cerrado) y NO DEBE tratar la ausencia de
rol como permiso.

**R4.** El sistema DEBE tomar el nombre del rol `Administrador` de **una sola constante importada** y
NO DEBE incrustar el literal `'Administrador'` en ningún archivo de `lib/modules/pedidos/**`.

**R5.** CUANDO un adaptador driving de esta feature ejecuta un caso de uso, DEBE obtener el actor de
`identity.getSessionUser()` a través de `@/lib/composition`, y NO DEBE resolver la sesión por su
cuenta, ni repetir la comprobación de rol, ni aplicar ninguna otra regla de negocio.

**R6.** CUANDO se crea un pedido, el sistema DEBE registrar como autor de la creación **y** de la
última modificación al actor **de la sesión en curso**; y CUANDO se edita, se cancela o se borra,
DEBE registrar al actor como autor de la última modificación **sin alterar** el de la creación. En
ningún caso DEBE tomar ninguno de los dos autores de la entrada recibida.

**R7.** El sistema DEBE conservar `ROW LEVEL SECURITY` habilitado **y forzado** en `orders` después
de la migración de esta feature, y NO DEBE crear ninguna policy que pretenda sustituir la
comprobación de R2.

### Alta y número correlativo

**R8.** CUANDO un actor con rol `Administrador` da de alta un pedido con datos válidos, el sistema
DEBE persistirlo y DEBE devolver su identificador junto con su número correlativo.

**R9.** CUANDO se da de alta un pedido, el sistema DEBE registrarlo en estado `PENDIENTE` y, SI la
entrada no indica prioridad, ENTONCES DEBE registrarla como `BAJA`; y NO DEBE aceptar desde la
entrada el estado, el motivo de cancelación, el número correlativo, la fecha de creación, ninguna
fecha de solicitud ni ninguno de los dos autores.

**R10.** CUANDO se da de alta un pedido, el sistema DEBE asignarle un número correlativo cuyo **año**
sea el año **en UTC** del mismo instante que persiste como fecha de creación de la fila, de modo que
la restricción de base de **QC-33 R41** se satisfaga siempre y nunca rechace un alta legítima.

**R11.** El sistema DEBE obtener la **posición** del correlativo de una **secuencia de la base de
datos propia de ese año**, de modo que dos altas simultáneas del mismo año obtengan posiciones
distintas, ninguna de las dos espere a la otra y ninguna sea rechazada por el índice único de
**QC-33 R21**.

**R12.** CUANDO se da de alta el **primer** pedido de un año para el que todavía no existe secuencia,
el sistema DEBE crearla, arrancarla en **1** y completar el alta **sin intervención manual y sin
fallar**; y SI dos altas simultáneas son las dos la primera de ese año, ENTONCES DEBE completar las
dos, con posiciones distintas.

**R13.** El sistema NO DEBE reutilizar una posición consumida por un alta que no llegó a guardarse, y
DEBE aceptar que las posiciones de un año no sean consecutivas (**QC-33 R42**).

**R14.** El sistema DEBE componer el número visible del pedido con la **única definición** que
publica el contrato de `pedidos` (**QC-33 R24**), y NO DEBE persistirlo ni escribir un segundo
formateo propio.

### Qué se rechaza antes de guardar

**R15.** SI la receta del pedido está ausente, no existe o está dada de baja, ENTONCES el sistema
DEBE rechazar la operación **antes de llegar al repositorio** y sin crear ni modificar ninguna fila;
y DEBE comprobarlo a través del **contrato público** `@/lib/modules/recetas`, sin consultar el modelo
`Recipe` ni la tabla `recipes` con el cliente Prisma y sin importar `recetas` por ruta profunda. La
excepción es R25.

**R16.** SI la unidad del pedido está ausente o no existe, ENTONCES el sistema DEBE rechazar la
operación **antes de llegar al repositorio**, comprobándolo a través del contrato público
`@/lib/modules/unidades` y con las mismas prohibiciones de R15.

**R17.** SI la cantidad está ausente, es cero o es negativa, ENTONCES el sistema DEBE rechazar la
operación en la **validación de aplicación**, antes del repositorio.

**R18.** SI el precio unitario está ausente o es negativo, ENTONCES el sistema DEBE rechazar la
operación en la **validación de aplicación**; y DEBE aceptar el precio **cero** (**QC-33 R9**).

**R19.** SI la prioridad o el estado recibidos no pertenecen a su conjunto cerrado, ENTONCES el
sistema DEBE rechazar la operación en el **borde**, antes del caso de uso, y NO DEBE dejar que el
valor llegue al repositorio.

### Edición y transiciones de estado

**R20.** MIENTRAS un pedido esté en `PENDIENTE` o en `EN_CURSO`, el sistema DEBE permitir corregir
**el conjunto completo** de sus datos de negocio —receta, cantidad, precio unitario, unidad,
prioridad y estado— en una sola operación de edición, y NO DEBE ofrecer edición parcial campo a
campo.

**R21.** MIENTRAS un pedido esté en `ENTREGADO` o en `CANCELADO`, el sistema DEBE rechazar **toda**
edición —incluida la que solo cambie la prioridad— y NO DEBE modificar ninguna fila.

**R22.** El sistema DEBE admitir exactamente estos cambios de estado en la edición:
`PENDIENTE → EN_CURSO`, `EN_CURSO → ENTREGADO`, `PENDIENTE → ENTREGADO` y dejar el estado como está;
y SI se pide cualquier otro —un retroceso, o salir de `ENTREGADO` o de `CANCELADO`—, ENTONCES DEBE
rechazar la operación sin modificar ninguna fila.

**R23.** El sistema NO DEBE llevar la restricción de R22 a la base de datos: la base DEBE seguir
aceptando cualquier estado en lugar de cualquier otro (**QC-33 R19**), y la restricción DEBE vivir en
la **aplicación**, con su propio test.

**R24.** El sistema NO DEBE permitir que la edición escriba el estado `CANCELADO` ni ningún motivo de
cancelación: SI la entrada de edición los trae, ENTONCES DEBE rechazarla en el **borde** y NO DEBE
llegar al repositorio.

**R25.** CUANDO se edita un pedido **sin cambiar su receta**, el sistema DEBE aceptar la operación
aunque esa receta esté dada de baja; y SI la edición **cambia** la receta, ENTONCES DEBE exigir que
la nueva exista y no esté dada de baja, igual que en el alta (R15).

### Cancelación

**R26.** El sistema DEBE ofrecer la cancelación como **caso de uso propio**, que DEBE ser el **único**
camino capaz de escribir el estado `CANCELADO` y el motivo.

**R27.** SI la cancelación llega sin motivo, con un motivo vacío o solo de espacios, o con un motivo
de más de **500** caracteres una vez recortado, ENTONCES el sistema DEBE rechazarla en la
**validación de aplicación** y NO DEBE modificar ninguna fila; el límite DEBE vivir en la validación
de aplicación y NO DEBE imponerse cambiando el tipo de la columna.

**R28.** CUANDO se cancela un pedido en `PENDIENTE` o en `EN_CURSO` con un motivo válido, el sistema
DEBE registrar el estado `CANCELADO` y ese motivo; y SI el pedido está en `ENTREGADO` o ya está en
`CANCELADO`, ENTONCES DEBE rechazar la operación sin modificar ninguna fila.

**R29.** MIENTRAS un pedido esté cancelado, el sistema DEBE conservar su motivo íntegro —NO DEBE
vaciarlo, sustituirlo ni permitir editarlo— y DEBE devolverlo en la ficha y en el listado.

**R30.** El sistema DEBE garantizar **en la propia base de datos** que un pedido tiene motivo de
cancelación **si y solo si** su estado es `CANCELADO`, de modo que una escritura que no pase por la
validación de aplicación tampoco pueda dejar un motivo sin cancelación ni una cancelación sin motivo.

### Borrado

**R31.** CUANDO se borra un pedido, el sistema DEBE conservar su fila completa y su número
correlativo y DEBE registrar el instante del borrado; y NO DEBE ofrecer ninguna operación de
restauración ni ningún listado de pedidos borrados.

**R32.** SI se intenta borrar un pedido en `ENTREGADO` o en `CANCELADO`, ENTONCES el sistema DEBE
rechazarlo **en la validación de aplicación** y **además** en la **propia base de datos**, con la
restricción de **QC-33 R29** ampliada para excluir también `CANCELADO`.

**R33.** SI la consulta, la edición, la cancelación o el borrado apuntan a un pedido que no existe o
que ya está borrado, ENTONCES el sistema DEBE responder con un error de «no encontrado» y NO DEBE
crear ni modificar ninguna fila.

### Consulta

**R34.** CUANDO se consulta la lista de pedidos, el sistema DEBE devolver como máximo tantos
elementos como indique el tamaño de página efectivo, junto con el número total de pedidos que
cumplen la consulta.

**R35.** SI la consulta no indica tamaño de página, ENTONCES el sistema DEBE usar **10**; y SI pide
un tamaño mayor que **25**, ENTONCES DEBE devolver como máximo 25 elementos y NO DEBE ejecutar una
consulta sin límite superior.

**R36.** SI el número de página o el tamaño de página recibidos no son enteros mayores o iguales a 1,
ENTONCES el sistema DEBE rechazar la consulta y NO DEBE leer del repositorio.

**R37.** El sistema DEBE resolver la aritmética de paginación con el util de `lib/shared/pagination`
y NO DEBE reimplementarla dentro del módulo `pedidos`.

**R38.** El sistema DEBE admitir en el listado un filtro por **estado** y un filtro por **prioridad**,
los dos opcionales y combinables entre sí; y CUANDO no se indica ninguno, DEBE devolver todos los
pedidos que las demás reglas dejen ver.

**R39.** El sistema NO DEBE ofrecer en el listado ninguna búsqueda por texto ni ningún filtro por
número correlativo.

**R40.** El sistema NO DEBE devolver pedidos borrados en ninguna consulta —listado ni ficha—, y SÍ
DEBE devolver los pedidos cancelados en las dos.

**R41.** El sistema DEBE ordenar el listado por **prioridad descendente** —según el orden de
declaración del conjunto cerrado que fijó **QC-33 R16**—, dentro de cada prioridad por **antigüedad
ascendente**, y DEBE desempatar por el **número correlativo** (año y posición), de modo que el orden
sea total y ningún pedido aparezca en dos páginas ni se omita de todas mientras el conjunto no
cambie.

**R42.** CUANDO se consulta la ficha de un pedido vivo, el sistema DEBE devolver su identificador, su
número correlativo, su receta, su cantidad, su unidad, su precio unitario, su prioridad, su estado,
sus dos autores, sus marcas de tiempo y —cuando esté cancelado— su motivo.

**R43.** El sistema DEBE devolver, en la ficha y en cada fila del listado, el **nombre de la receta**
y el **nombre de la unidad**, resueltos por los contratos públicos `@/lib/modules/recetas` y
`@/lib/modules/unidades`; y NO DEBE obtenerlos consultando sus tablas, sus modelos de Prisma ni sus
repositorios (**QC-33 R32**).

**R44.** MIENTRAS la receta de un pedido esté dada de baja, el sistema DEBE devolver igualmente su
nombre; y para ello el contrato público de `recetas` DEBE publicar una consulta **por
identificadores que incluya las recetas dadas de baja**, distinguible de la que solo devuelve las
vivas que exige R15.

**R45.** CUANDO se resuelve una página del listado, el sistema DEBE pedir los nombres con **una sola
consulta a cada contrato** —una a `recetas` y una a `unidades`—, con todos los identificadores de la
página a la vez, y el número de consultas NO DEBE crecer con el número de filas devueltas.

**R46.** El sistema DEBE devolver los dos autores del pedido como **identificadores**, y NO DEBE
resolver sus nombres en esta feature.

**R47.** El sistema NO DEBE persistir el total del pedido ni añadir ninguna columna —normal, generada
ni derivada— que lo guarde (**QC-33 R10**).

### Migración y esquema

**R48.** La migración de esta feature DEBE limitarse a: añadir el valor `CANCELADO` al tipo enumerado
del estado, añadir la columna del motivo de cancelación con su restricción de R30, ampliar la
restricción de borrado de R32 y crear el aparato de secuencias de R11/R12; y NO DEBE añadir, quitar
ni modificar ninguna otra columna, índice o restricción de `orders`, ni tocar ninguna otra tabla.

**R49.** CUANDO se revierte la migración de esta feature, el esquema DEBE quedar **exactamente** en
el estado que dejó QC-33 —sin la columna del motivo, con la restricción de borrado en su forma
anterior, con el tipo enumerado **sin** el valor `CANCELADO` y sin ninguna secuencia ni función
residual de R11/R12—; y como Postgres no sabe quitar un valor de un tipo enumerado, la reversión DEBE
**recrear el tipo** en vez de intentar eliminarle el valor.

**R50.** SI al revertir la migración existe algún pedido en estado `CANCELADO`, ENTONCES la reversión
DEBE fallar con un mensaje explícito y NO DEBE modificar ni convertir ninguna fila.

**R51.** El sistema DEBE nombrar en **inglés** toda columna, restricción, secuencia y función que
cree esta feature; el valor nuevo del conjunto cerrado va en **castellano** porque es un término de
negocio fijado por el humano (**QC-33 R36**).

### Módulo, borde y alcance

**R52.** El sistema DEBE alojar los seis casos de uso en `lib/modules/pedidos/domain/`, los accesos a
datos detrás de puertos de `lib/modules/pedidos/ports/` implementados en
`lib/modules/pedidos/adapters/driven/`, y DEBE cablear puerto e implementación **solo** en
`lib/composition/`; el contrato `lib/modules/pedidos/index.ts` NO DEBE reexportar nada que no sea de
`./domain`, en particular ningún adaptador driving ni nada con `'use server'`; y NO DEBE quedar
ningún `.gitkeep` en una carpeta que ya tenga archivos reales.

**R53.** El módulo `pedidos` NO DEBE consultar con el cliente Prisma el modelo de receta, el de
unidad ni el de usuario, y ningún módulo distinto de `pedidos` DEBE consultar `orders` (**QC-33 R31,
R32**).

**R54.** El sistema DEBE exponer sus operaciones como **Server Actions** en
`lib/modules/pedidos/adapters/driving/`, recibiendo `FormData` en crear, editar, cancelar y borrar, y
argumentos ya tipados en consultar y listar; y NO DEBE crear ningún route handler ni llamar por
`fetch` a ninguna ruta API propia.

**R55.** El sistema DEBE validar con un esquema toda entrada externa de los seis casos de uso en el
borde, y NO DEBE dejar que ningún dato sin validar ni tipar cruce hacia el dominio.

**R56.** El sistema DEBE señalar cada fallo con una clase de error de dominio que lleve un `code`
estable, y el adaptador driving DEBE traducirlo a `{ status: 'error', code, message }` usando ese
`code` —**nunca** el texto del mensaje—; y NO DEBE existir ningún `catch` que descarte un error sin
manejarlo ni propagarlo con contexto.

**R57.** El sistema NO DEBE incluir en esta feature ninguna pantalla, página, componente de interfaz
ni ruta bajo `app/` —van a **QC-35**—; por lo tanto esta feature no aporta ningún flujo navegable que
un test E2E pueda visitar, y su verificación es **unitaria y de integración**.

**R58.** El sistema NO DEBE incorporar ninguna dependencia de terceros nueva para cumplir los
requisitos anteriores.

### Cobertura de las decisiones cerradas

Cada fila de `## Decisiones cerradas (no reabrir)`, en el orden en que está escrita, con los
requisitos que la hacen testeable. Ninguna queda sin `R<n>`.

| # | Decisión cerrada | Requisito(s) |
| --- | --- | --- |
| 1 | Solo Administrador en las cinco operaciones, validado en la primera línea del caso de uso | R1, R2, R3, R4 |
| 2 | El alta no recibe fecha de solicitud: es `created_at` | R9, R10 |
| 3 | Cuarto estado `CANCELADO`, valor nuevo del tipo enumerado (trae migración) | R28, R48, R49 |
| 4 | Motivo en columna propia, obligatorio al cancelar, prohibido sin cancelar, tope 500 en `zod` | R27, R29, R30 |
| 5 | Transiciones solo hacia delante; `ENTREGADO` y `CANCELADO` son finales | R22, R23 |
| 6 | Se cancela desde `PENDIENTE` y desde `EN_CURSO`, nunca desde `ENTREGADO` ni desde cancelado | R28 |
| 7 | Cancelar es caso de uso propio y el único camino que escribe `CANCELADO` | R24, R26 |
| 8 | `PENDIENTE`/`EN_CURSO` se corrigen enteros; `ENTREGADO`/`CANCELADO` no admiten ninguna edición | R20, R21 |
| 9 | Ni `ENTREGADO` ni `CANCELADO` se borran; el `CHECK` de QC-33 R29 se amplía en la base; borrado lógico sin restaurar | R31, R32 |
| 10 | El correlativo lo entrega una secuencia de la base por año; se aceptan huecos | R11, R12, R13 |
| 11 | Consulta paginada, 10 por defecto y tope 25, reutilizando `lib/shared/pagination` | R34, R35, R36, R37 |
| 12 | Filtros por estado y prioridad, opcionales y combinables; sin texto; borrados no, cancelados sí | R38, R39, R40 |
| 13 | Orden por prioridad descendente, antigüedad ascendente y desempate por el correlativo | R41 |
| 14 | La consulta devuelve también los nombres de receta y unidad, por contrato público; los autores siguen siendo ids | R43, R45, R46 |
| 15 | La receta dada de baja devuelve su nombre igual; `recetas` publica una consulta por ids que las incluye | R44 |
| 16 | Se edita un pedido con receta dada de baja; la vigencia se exige solo cuando la receta cambia | R25 |
| 17 | Lista de lo que se rechaza antes de guardar | R15, R16, R17, R18, R19, R21, R22, R24, R27, R32 |
| 18 | Actor y autores de `identity.getSessionUser()` vía `@/lib/composition`, nunca de la entrada | R1, R5, R6 |
| 19 | Server Actions con `FormData` en las mutaciones y argumentos tipados en las consultas; `zod` en el borde | R54, R55 |
| 20 | Errores con `code` estable, sin `catch` vacíos | R56 |
| 21 | Módulo `pedidos`: se llenan `ports/` y `adapters/`, cableado exclusivo de `lib/composition`, receta y unidad solo por contrato | R43, R52, R53 |
| 22 | Migración única con `down.sql` que revierte al esquema exacto, **recreando el tipo** | R48, R49, R50 |
| 23 | Identificadores en inglés, RLS ya activada y forzada que no sustituye al service, total sin persistir | R2, R7, R47, R51 |
| 24 | E2E diferido con motivo a QC-35, declarado aquí | R57 |
| 25 | Ninguna dependencia nueva | R58 |

Requisitos que no salen de una fila de la tabla, y de dónde salen: **R8** y **R42** del propio
alcance (los caminos felices del alta y de la ficha); **R9** de la decisión 2 leída entera —si la
fecha la pone el sistema, tampoco la ponen el estado ni el correlativo— y del enunciado del board;
**R10** de **QC-33 R41**, que esta ficha tiene que satisfacer al escribir; **R14** de **QC-33 R24**;
**R33** del precedente **QC-43 R24**; **R51** de **QC-33 R36**.

## Preguntas abiertas

No se rellenan con supuestos (regla 6 de `CLAUDE.md`).

1. **¿Qué se hace cuando un pedido entregado no debió salir?** La acotación cerró que de
   `ENTREGADO` no se sale: no se cancela, no se edita y no se borra. Eso deja sin resolver el caso
   real de una devolución o de un despacho registrado por error. **No hay ficha para ello y no se
   crea ninguna aquí**: crearla obligaría a inventar el alcance de un módulo de devoluciones que
   nadie ha pedido. La salida disponible hoy es crear otro pedido, y no compensa la fila
   equivocada.
2. **¿El sistema exporta alguna vez a un contable externo?** Heredada de **QC-33** (su pregunta
   abierta 1) y sigue igual de abierta: el ERP no factura ni liquida impuestos y los totales se
   calculan sin guardarse, pero nunca se evaluó si hay que entregar esos datos a una contabilidad
   de fuera. No afecta a esta ficha; se arrastra para que no se pierda.

**Añadidas por `spec_author` el 2026-09-04 (F1.2).** Ninguna bloquea la implementación, ninguna se
rellena con un supuesto sin decirlo, y las tres tienen su posición por defecto escrita.

3. **¿La consulta devuelve el total del pedido (cantidad × precio unitario)?** La decisión 23 cierra
   que el total **no se persiste** (R47), pero no dice si la lectura lo entrega ya calculado o si
   cada consumidor lo multiplica. **Posición por defecto escrita, no decidida** (`design.md > 7.3`):
   **no se devuelve**; la ficha y el listado entregan cantidad y precio y **QC-35** decide qué pinta.
   El motivo de no adelantarlo: multiplicar dos decimales de 14 dígitos **no se puede hacer con
   `number`** (`docs/architecture.md > Anti-patrones`), así que devolverlo obligaría a decidir hoy
   con qué aritmética —y `decimal.js` sería **dependencia nueva** que hay que proponer y que un
   humano aprueba (regla 7 de `CLAUDE.md`, y ya quedó anotado en `QC-33 design.md > 10`)—. Si el
   humano quiere el total en la salida, se cierra al aprobar el spec y nace un requisito nuevo.
4. **¿Qué pasa con la secuencia del año si se importan o restauran pedidos de un año que ya tiene
   filas cargadas por otra vía?** La secuencia de R11/R12 arranca en 1 la primera vez que se pide un
   número de ese año. SI alguien cargó pedidos de ese año **sin pasar por el caso de uso** —una
   importación, una restauración parcial, un `seed`—, la secuencia no lo sabe y las primeras altas
   chocarían contra el índice único de **QC-33 R21** hasta rebasar el máximo existente. **Posición
   por defecto escrita, no decidida** (`design.md > 4.4`): **esta ficha no crea ninguna herramienta
   de importación** y quien cargue filas a mano es responsable de ajustar la secuencia con `setval`;
   el diseño lo deja documentado en la cabecera de la migración. **No hay hoy ninguna importación de
   pedidos en el repo**, así que el caso es hipotético — pero se anota porque el día que exista, se
   descubriría en producción.
5. **¿La edición es reemplazo completo o admite cambiar solo un campo?** La decisión 8 dice **qué**
   se puede corregir mientras el pedido no es final, pero no la **forma** de la operación. **Posición
   por defecto escrita, no decidida** (`design.md > 7.2`, y la escribe **R20**): **reemplazo
   completo**, como **QC-25** y **QC-43**, para no tener que distinguir «campo ausente» de «campo
   puesto a nulo» ni reevaluar la transición de estado contra un estado a medio llegar. La
   consecuencia que conviene mirar: subir la prioridad de un pedido —la operación más frecuente que
   va a tener **QC-35**— obliga a reenviar receta, cantidad, precio y unidad. Si el humano prefiere
   una operación pequeña y propia para la prioridad, es un caso de uso más y R20 cambia.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
| --- | --- | --- |
| 2026-09-04 | ¿Quién puede consultar, crear, editar, cancelar y borrar pedidos? | **Solo Administrador, en las cinco operaciones.** El Operador ni siquiera consulta. Se valida **en el service, primera línea del caso de uso** (`docs/architecture.md > Acceso a datos y autorizacion`) y `CHECKPOINTS.md` exige su test: una policy de RLS no cuenta como implementado. Heredado de **QC-20 D2**, **QC-25** y **QC-43**, y lo anticipaba **QC-33** («los permisos los fija QC-34»). Consecuencia: la pantalla de **QC-35** tampoco la ve el Operador |
| 2026-09-04 | ¿El alta recibe una fecha de solicitud? | **No, y la ficha del board decía lo contrario.** La fecha de solicitud **es** `created_at`: la pone el sistema y no se edita. Heredado de **QC-33** (su decisión 10 y **R4**), que ya cerró que una segunda columna con el mismo dato solo puede divergir. La `description` del issue QC-34 **se reescribió antes de sembrar esto** |
| 2026-09-04 | ¿Hay un estado de cancelación? | **Sí: cuarto estado `CANCELADO`**, valor nuevo del tipo enumerado `OrderStatus`. **Esto trae migración**, y es exactamente el coste que **QC-33** asumió a conciencia al elegir enum en vez de tabla («añadir un valor será una migración del tipo») |
| 2026-09-04 | El motivo de la cancelación | **Columna nueva en el pedido, obligatoria al cancelar.** Cancelar sin motivo se rechaza, y **escribir motivo sin cancelar también**: el motivo solo existe en un pedido cancelado. Se **conserva** —no se limpia ni se pierde— y no se puede editar después, porque de `CANCELADO` no se sale. Tope de **500** caracteres en la **validación de aplicación** con `zod`, no en la columna (heredado de **QC-43** y de **QC-42 D15**) |
| 2026-09-04 | ¿Qué transiciones de estado son válidas? | **Solo hacia delante:** `PENDIENTE → EN_CURSO`, `EN_CURSO → ENTREGADO` y `PENDIENTE → ENTREGADO` (se despachó sin pasar por producción). **No se retrocede.** `ENTREGADO` y `CANCELADO` son **finales**. Cierra lo que **QC-33 R19** dejó explícitamente para esta ficha: la base no restringe nada, la restricción es de aplicación y lleva su test |
| 2026-09-04 | ¿Desde dónde se cancela? | **Desde `PENDIENTE` y desde `EN_CURSO`**, nunca desde `ENTREGADO` —eso sería una devolución, que no existe (pregunta abierta 1)— ni desde un pedido ya cancelado. Si el cliente rectifica después de entregado, se crea un pedido nuevo |
| 2026-09-04 | ¿Cancelar es edición o caso de uso propio? | **Caso de uso propio**, y el **único** camino que escribe `CANCELADO`. La edición normal **no puede cancelar**. Así el «motivo obligatorio» se garantiza en un solo sitio, y la operación tiene nombre propio para el permiso, para su test y para **QC-35** |
| 2026-09-04 | ¿Qué se puede editar de un pedido que ya avanzó? | Mientras está `PENDIENTE` o `EN_CURSO` se corrige **todo**: receta, cantidad, precio, unidad, prioridad y estado (dentro de las transiciones válidas). Un pedido **`ENTREGADO` o `CANCELADO` no admite ninguna edición**, ni siquiera la prioridad: es el registro de lo que pasó. Lo de `CANCELADO` se sigue de que es final, igual que `ENTREGADO` |
| 2026-09-04 | ¿Qué pedidos se pueden borrar? | **Ni `ENTREGADO` ni `CANCELADO`.** Se cancela para dejar constancia, así que borrarlo después la borraría de las consultas. **Cambia la restricción que escribió QC-33** (`deleted_at IS NULL OR status <> 'ENTREGADO'`, su **R29**), que pasa a excluir también `CANCELADO`, **en la base y no solo en la aplicación** — misma filosofía que **QC-20 D16**. Va en la misma migración de esta ficha. El borrado sigue siendo **lógico y sin restaurar** (**QC-4**, **QC-20 D5**, **QC-25**) |
| 2026-09-04 | ¿Quién calcula el número correlativo, y qué pasa con dos altas simultáneas? | **Una secuencia de la base por año.** La base entrega el siguiente número, así que dos altas simultáneas no compiten y ninguna falla con un error de índice único que nadie tradujo. **Cierra la pregunta abierta 2 de QC-33**, que subía aquí explícitamente. Se descartó leer el máximo del año y reintentar (carrera real bajo concurrencia) y serializar con bloqueo (convierte cada alta en una cola). **Se aceptan huecos**, ya decidido el 2026-09-03 (**QC-33 R42**): el número de un alta que se cae se pierde y nadie lo reutiliza |
| 2026-09-04 | Forma de la consulta | **Paginada, 10 por página por defecto y tope 25**, **reutilizando** `lib/shared/pagination` (**QC-20 D15/D16/D21**, ya reutilizado por **QC-25** y **QC-43**). Duplicar ese cálculo sería justo el error que el util existe para evitar |
| 2026-09-04 | ¿Hay filtros en la consulta? | **Sí: por estado y por prioridad**, opcionales y combinables. Sin filtro salen todos. **Sin búsqueda por texto** y sin filtro por número: lo que se busca de un pedido es su número, y eso llega mejor como filtro exacto el día que haga falta. **Los borrados no salen nunca; los cancelados sí** —para eso tienen estado propio en vez de desaparecer |
| 2026-09-04 | Orden por defecto del listado | **Por prioridad descendente** (`CRITICA` primero, siguiendo el orden de declaración del enum que fijó **QC-33 R16**) y, dentro de cada prioridad, **por antigüedad ascendente**. **Desempate por el correlativo** (año y posición), que es único y hace el orden total y la paginación estable. Se aparta del `name ASC` de **QC-20** y **QC-25** a propósito: un pedido no tiene nombre y lo que importa es a qué atender antes. Consecuencia asumida: la lista **cambia de forma cuando alguien sube una prioridad** |
| 2026-09-04 | ¿La consulta devuelve ids o nombres de la receta y la unidad? | **También los nombres**, resueltos por los **contratos públicos** `@/lib/modules/recetas` y `@/lib/modules/unidades` —nunca por sus tablas (**QC-33 R32**)—. Se aparta de **QC-20 D21** y **QC-25**, que devuelven solo ids y dejan resolver al front. Coste aceptado: una lectura extra por página. Lo que **no** cambia: los autores siguen llegando como **ids**, y resolverlos es de **QC-35** |
| 2026-09-04 | ¿Y si la receta del pedido está dada de baja? | **Se devuelve su nombre igual.** Un pedido conserva su referencia aunque la receta se dé de baja (**QC-33 R15**), así que la fila tiene que seguir diciendo qué se pidió. Obliga a que el contrato de `recetas` publique una **consulta por ids que incluya las dadas de baja** — trabajo **dentro de `recetas`**, exactamente como **QC-25** hizo con `ProductCatalog` y con `UnitCatalog` |
| 2026-09-04 | ¿Se puede editar un pedido cuya receta está dada de baja? | **Sí: se admite la receta que el pedido ya tenía.** La existencia y vigencia de la receta se exige **solo cuando cambia**, así que sigue siendo imposible **poner** una receta inexistente o de baja, pero corregir la cantidad de un pedido viejo no obliga a cambiarle la fórmula. Heredado literal de **QC-25** (su pregunta 7), que resolvió el mismo choque con los productos |
| 2026-09-04 | ¿Qué se rechaza antes de guardar? | Receta ausente, inexistente o dada de baja (salvo la que ya estaba, fila anterior); unidad ausente o inexistente; cantidad ausente, negativa o cero; precio ausente o negativo —**cero sí vale**, **QC-33 R9**—; prioridad o estado fuera de su conjunto cerrado; una transición de estado no permitida; cancelar sin motivo; motivo sin cancelar; y editar o borrar un pedido `ENTREGADO` o `CANCELADO` |
| 2026-09-04 | ¿De dónde salen el autor y el usuario en sesión? | De **`identity.getSessionUser()` vía `@/lib/composition`** (**QC-20 D17**, **QC-43**). `created_by` y `updated_by` se toman **de la sesión y nunca de la entrada**; el service recibe el actor y su rol **por parámetro** y **ningún caso de uso lee cookie, cabecera ni sesión por su cuenta** |
| 2026-09-04 | Mutaciones y consultas | **Server Actions** en `adapters/driving/`, no Route Handlers (`docs/architecture.md > Server Actions vs Route Handlers`). `create`/`update`/`cancel`/`delete` reciben `FormData` porque salen de un formulario; `get`/`list` reciben argumentos ya tipados. **Prohibido `fetch` a API routes propias.** Validación de entrada con **zod** en el borde (`docs/conventions.md`). Heredado de **QC-20** y **QC-43** |
| 2026-09-04 | Errores | Clases de error de dominio traducidas por la Server Action a `{ status: 'error', code, message }` con el **`code` estable de la clase, nunca el texto**, como `inventario`, `recetas` e `identity`. Nada de `catch` vacíos (`docs/conventions.md`) |
| 2026-09-04 | Módulo y frontera | Módulo **`pedidos`**, que **QC-33** dejó con `domain/` poblado y `ports/` y `adapters/` vacíos con `.gitkeep`: **se llenan aquí** y los `.gitkeep` se borran al poner el primer archivo real. El cableado puerto→implementación es **exclusivo de `lib/composition`**. La receta y la unidad se conocen **solo** por sus contratos públicos, nunca por sus tablas, modelos de Prisma ni repositorios (**QC-33 R31-R34**, **QC-15**) |
| 2026-09-04 | Migración | Una sola migración con su **`down.sql`** obligatorio (**QC-4 R20**, **QC-42 D19**), que revierte al esquema exacto anterior y que el gate verifica. **Ojo:** Postgres **no sabe quitar un valor de un tipo enumerado**, así que el `down.sql` tiene que **recrear el tipo** —y no basta con un `ALTER TYPE ... DROP VALUE`, que no existe. Es la parte cara de la decisión del cuarto estado y se asume sabiéndolo |
| 2026-09-04 | Idioma, RLS y total | Identificadores de la base en **inglés**, valores del enum en castellano (**QC-33 R36**). **RLS ya está activada y forzada** en `orders` por QC-33 y **no sustituye** a la autorización del service. El **total sigue sin guardarse** (**QC-33 R10**): esta ficha no lo persiste ni añade columna para él |
| 2026-09-04 | E2E | **Diferido con motivo, a QC-35**: esta ficha es backend puro y no aporta ningún flujo navegable que Playwright pueda visitar. **El diferimiento se declara aquí, no al final.** Mismo criterio que **QC-20 D4**, **QC-24**, **QC-25**, **QC-33** y **QC-43** |
| 2026-09-04 | Dependencias nuevas | **Ninguna.** Si el diseño creyera necesitar una librería, el `backend_dev` **para y la propone**; no la instala (regla 7 de `CLAUDE.md`, y `tests/guards/guard-dependencias-aprobadas.test.ts` lo pondría en rojo) |
