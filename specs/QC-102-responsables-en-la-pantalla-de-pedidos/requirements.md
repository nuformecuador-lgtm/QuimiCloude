# QC-102 — responsables-en-la-pantalla-de-pedidos · requirements.md

> **Zona** `fullstack` — **creció de `frontend` al acotar** · **Complejidad** `high` ·
> **depends_on** QC-87 (hecho) · **Rama** `feature/QC-102-responsables-en-la-pantalla-de-pedidos`
>
> **Alcance.** Ver y gestionar los responsables de un pedido desde la pantalla de pedidos. El
> **listado** muestra por fila hasta **tres iniciales y un `+N`**; el **detalle y el panel** los
> muestran **todos**, agrupados por su origen y con **el nombre del grupo** cuando la asignación
> vino de uno. El panel permite marcar personas sueltas, aplicar grupos, quitar a una persona y
> **quitar un grupo entero**. Añade la **única pieza de backend que falta**: una consulta de
> responsables **para varios pedidos a la vez**.
>
> **Lo que NO entra.** Los cuatro casos de uso de asignar y desasignar → **QC-87** (hecho), que
> esta ficha **consume**. El modelo → **QC-86** (hecho). El listado del Operador → **QC-88**.
>
> *Sembrado por `/afinar-feature` el 2026-09-13. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.*

## Requisitos (EARS)

Notación EARS (`docs/specs.md`). **«El sistema»** aquí son dos cosas y conviene separarlas desde la
primera línea:

- la **única pieza de backend** que esta ficha añade —una consulta de responsables **para varios
  pedidos a la vez** en el módulo `asignaciones`, con su puerto, su adaptador driven y su adaptador
  driving— **R1–R15**;
- la **pantalla de pedidos** de QC-35 —listado, panel dentro del `order-sheet` y acciones de fila—,
  que **consume** los cuatro casos de uso de QC-87 y **no los reimplementa** — **R16–R36**;
- más el **E2E del recorrido completo** (**R37, R38**) y los **límites** (**R39–R41**).

**Cuatro avisos de lectura.**

(a) **Los cuatro casos de uso de QC-87 no se tocan.** Asignar, desasignar, quitar un grupo y
consultar los responsables de **un** pedido ya existen, están probados y se consumen por su **ruta
exacta** (`lib/modules/asignaciones/adapters/driving/order-assignment-actions.ts`). **R40** es el
requisito de frontera que lo hace verificable: ninguna regla de QC-87 —estados que admiten
asignación, «solo cuentas `active`», «reaplicar añade a los que faltan», congelado— se vuelve a
escribir en la pantalla como si fuera suya.

(b) **La autorización de escritura sigue viviendo en el service.** La pantalla **anticipa** lo que
el caso de uso permite (R28, R29), y anticipar no es autorizar: quitar el botón no protege nada, lo
protege `requirePermission(actor, 'asignaciones.modificar')` en la primera línea de los tres casos
de uso de QC-87 (`docs/architecture.md > Acceso a datos y autorizacion`).

(c) **R4 y R5 son el corazón de la decisión cerrada 5**, y están escritos como dos requisitos
distintos porque se rompen de dos maneras distintas: uno cuenta **consultas** y el otro prohíbe
**navegar una relación**. Un `join` pasaría R4 en verde; una consulta por fila pasaría R5.

(d) **R19, R20, R27, R31, R34, R35, R36 y R41 no salen de una fila de la tabla**: salen del código
en disco y de `docs/architecture.md`. Su origen está escrito en la nota bajo la tabla de cobertura,
para que nadie los lea como alcance inventado.

### La consulta en lote (decisiones cerradas 4 y 5)

**R1.** CUANDO se consultan los responsables de **varios** pedidos a la vez, el sistema DEBE
devolver **una entrada por cada identificador pedido** —incluidos los que no tengan ningún
responsable—, y cada entrada DEBE llevar ese identificador de pedido y la lista de sus responsables.

**R2.** El sistema DEBE exigir **`pedidos.consultar`** en la **primera línea** de la consulta en
lote, comprobando pertenencia exacta del código al conjunto del actor, **antes** de validar la
entrada y **antes** de tocar ningún puerto; DEBE recibir el actor **por parámetro**; y NO DEBE
aceptar `asignaciones.consultar` ni `asignaciones.modificar` como sustituto.

**R3.** La consulta en lote DEBE tomar la empresa **del actor** y devolver únicamente asignaciones
de esa empresa; y NO DEBE revelar ninguna asignación de otra empresa ni su existencia.

**R4.** El sistema DEBE resolver una página entera con un **número de consultas constante** —
independiente del número de pedidos de la página—, y NO DEBE emitir una consulta por pedido ni por
responsable. El test DEBE demostrarlo **contando invocaciones** de los puertos, no solo comprobando
el resultado.

**R5.** El sistema NO DEBE obtener los responsables navegando ninguna relación entre `orders` y
`order_assignments`, ni declarar `@relation` alguna entre ellas: la composición se hace **en
memoria**, con los identificadores ya leídos, igual que hoy se compone `recipeName` en el listado de
pedidos.

**R6.** Dentro de cada pedido, la consulta en lote DEBE devolver los responsables en el **mismo
orden determinista y estable** que la consulta de un solo pedido —por nombre mostrable, con
desempate por identificador de la persona—, de modo que dos lecturas seguidas devuelvan la misma
secuencia.

**R7.** SI un identificador pedido no corresponde a un pedido vivo de la empresa del actor
—no existe, está dado de baja o es de otra empresa—, ENTONCES el sistema DEBE devolver su entrada
**vacía**, NO DEBE rechazar la consulta entera y NO DEBE distinguir en la salida esos tres casos.

**R8.** SI la lista de identificadores llega vacía, ENTONCES el sistema DEBE devolver un resultado
vacío **sin tocar ningún puerto** y sin lanzar ningún error.

**R9.** El sistema DEBE validar la entrada de la consulta en lote con un esquema declarado en su
dominio, y SI la entrada es inválida —algún identificador que no sea un uuid, o más identificadores
que el tope declarado en ese mismo dominio—, ENTONCES DEBE rechazarla con `invalid_input` **sin
tocar ningún puerto**; los identificadores repetidos DEBEN consultarse **una sola vez**.

**R10.** La consulta en lote DEBE devolver el mismo resultado en los **cuatro** estados del pedido,
y NO DEBE rechazarse ni omitir entradas por estar un pedido `ENTREGADO` o `CANCELADO`.

**R11.** Cada responsable devuelto DEBE llevar **exactamente** identificador, nombre mostrable y
origen —las tres claves de `OrderResponsible`— y NO DEBE llevar correo, documento, estado de cuenta
ni ninguna marca de baja; y MIENTRAS una persona responsable esté dada de baja, inactiva o
bloqueada, DEBE seguir apareciendo con su nombre mostrable.

**R12.** CUANDO el origen de una fila sea un grupo, el sistema DEBE devolver la **referencia** al
grupo y el **nombre congelado en la fila**, y NO DEBE consultar el nombre **actual** del grupo ni
derivar la lista de la pertenencia vigente a ningún grupo.

**R13.** El sistema DEBE exponer la consulta en lote como **Server Action con argumentos ya
tipados** —nunca `FormData`—, DEBE traducir sus errores **por su `code` estable** y NO DEBE
comprobar ningún permiso en esa capa.

**R14.** El módulo `pedidos` NO DEBE importar `asignaciones` —ni por su contrato público ni por
ruta profunda—, de modo que no exista ciclo `pedidos → asignaciones`; y ningún módulo distinto de
`asignaciones` DEBE consultar `order_assignments` con el cliente Prisma.

**R15.** Esta feature NO DEBE modificar `db/schema.prisma` ni añadir, cambiar o revertir ninguna
migración —el diff de `db/**` DEBE ser **vacío**—, y NO DEBE añadir, quitar ni renombrar ningún
permiso: el catálogo cerrado DEBE seguir teniendo **quince** entradas.

### El listado (decisiones cerradas 4, 8, 10 y 11)

**R16.** El listado de pedidos DEBE mostrar, en cada fila y en una **columna propia**, los
responsables de ese pedido.

**R17.** SI un pedido tiene más de **tres** responsables, ENTONCES la fila DEBE mostrar **tres**
iniciales y un indicador **`+N`** con el número de los que no caben, y el `+N` DEBE ofrecer un
tooltip que liste **por nombre** a los que faltan.

**R18.** La columna de responsables DEBE ocupar **el mismo ancho en todas las filas**, y NO DEBE
crecer ni encoger según cuántos responsables tenga el pedido.

**R19.** SI un pedido no tiene ningún responsable, ENTONCES su celda DEBE pintar el **marcador de
ausencia** de esta pantalla y NO DEBE quedar vacía ni mostrar identificadores técnicos.

**R20.** SI la consulta en lote falla, ENTONCES el listado DEBE seguir pintándose con sus pedidos y
con la columna de responsables **sin resolver**, y NO DEBE sustituir la lista entera por el estado
de error: el estado de error, el vacío y el esqueleto siguen siendo **los de la lista de pedidos**.

**R21.** El sistema DEBE representar a cada responsable como un **círculo con sus iniciales**
derivadas de su nombre mostrable con la utilidad de iniciales ya existente, con **tooltip y nombre
accesible** con el nombre completo; y NO DEBE mostrar ninguna imagen ni pedir ningún dato que no
esté en las tres claves de `OrderResponsible`.

**R22.** El **esqueleto** del listado DEBE declarar tantas columnas como la tabla, incluida la
nueva, de modo que la carga no cambie el número de columnas al resolverse.

### El panel dentro del `order-sheet` (decisiones cerradas 1, 2, 3, 6, 7, 8 y 9)

**R23.** El sistema DEBE mostrar y gestionar los responsables en una **sección dentro del panel
lateral de pedido que ya existe** (`order-sheet`), y NO DEBE crear un panel nuevo, una ruta nueva ni
una pantalla aparte.

**R24.** El sistema DEBE ofrecer en las acciones de la fila una entrada propia **«Responsables»**
que abra ese mismo panel **en esa sección**, de modo que ver quién prepara un pedido NO DEBE exigir
abrir el formulario de edición.

**R25.** MIENTRAS el panel esté abierto, el sistema DEBE mostrar a **todos** los responsables **sin
límite**, **agrupados por su origen**, y CUANDO el origen sea un grupo DEBE mostrar **el nombre del
grupo** junto a sus personas.

**R26.** CUANDO se abre el panel, el sistema NO DEBE emitir ninguna consulta de responsables: DEBE
pintar los que la fila del listado ya trajo.

**R27.** El panel DEBE recibir por **props**, desde el Server Component de la sección, el catálogo
de personas y el de grupos que ofrece para asignar; y su componente de cliente NO DEBE pedirlos por
su cuenta ni importar `lib/composition`.

**R28.** MIENTRAS el actor **no** tenga `asignaciones.modificar`, el panel DEBE mostrarse **en solo
lectura** —iniciales, nombres y nombre de grupo— y NO DEBE montar buscador de personas, selector de
grupos ni ninguna acción de quitar; y esa ocultación NO DEBE ser la única barrera: el caso de uso
DEBE seguir rechazando la operación.

**R29.** MIENTRAS el pedido esté **`ENTREGADO`** o **`CANCELADO`**, el sistema NO DEBE montar los
controles de asignar ni los de quitar, y NO DEBE mostrar ninguna frase que explique su ausencia.

**R30.** CUANDO se pide quitar un grupo entero desde su acción propia, el sistema DEBE invocar la
operación de quitar grupo de QC-87 con **ese** identificador de grupo y ese pedido, y NO DEBE
emitir una desasignación por cada persona del grupo.

**R31.** CUANDO se pide quitar a una persona, el sistema DEBE invocar la operación de desasignar de
QC-87 con **exactamente esa** persona y ese pedido.

**R32.** CUANDO se confirma una asignación, el sistema DEBE enviar en **una sola** operación las
personas marcadas y los grupos elegidos, mediante la Server Action de QC-87 con **`FormData`** y sus
campos en inglés.

**R33.** CUANDO una operación termina con éxito, el sistema DEBE avisar con un **toast** —en la
región que ya monta el layout privado, sin montar otra— diciendo **cuántas personas se añadieron**
en el caso de asignar, y DEBE refrescar con **`router.refresh()`**; NO DEBE usar `revalidatePath` ni
navegar a otra URL, de modo que página, tamaño, orden y filtros del listado se conserven.

**R34.** SI una operación devuelve error, ENTONCES el sistema DEBE mostrarlo **dentro del panel**
sin cerrarlo y sin perder lo ya marcado, traduciéndolo **por su `code`** y nunca por el texto del
mensaje.

**R35.** La interfaz que esta feature añade DEBE cumplir la regla multiplataforma: objetivos
táctiles de al menos 44x44 px, `font-size` de al menos 16 px en los campos de entrada, y **ninguna
información accesible solo por `:hover`** — en particular, la lista completa de responsables DEBE
poder alcanzarse abriendo el panel (R24), no solo por el tooltip del `+N`.

**R36.** Los componentes de la pantalla DEBEN vivir bajo `app/(private)/pedidos/components/` y
exportarse por el **barrel** `index.ts` de la ruta, y la página NO DEBE importarlos por ruta
profunda.

### El E2E (decisión cerrada 12)

**R37.** El sistema DEBE tener un test E2E que recorra el camino completo: abrir un pedido, **marcar
una persona**, **aplicar un grupo**, **sacar a alguien** y comprobar que **el listado** muestra los
avatares y el **nombre del grupo**.

**R38.** Los E2E existentes DEBEN seguir pasando **sin cambios en su guion** —lo que ejercita cada
`test(...)`, sus selectores y sus aserciones—.

### Límites (decisiones cerradas 10 y 12)

**R39.** Esta feature NO DEBE incorporar ninguna dependencia de terceros nueva ni añadir ninguna
primitiva con la CLI de shadcn: reutiliza la utilidad de iniciales, `components/ui/avatar.tsx` y
`components/ui/tooltip.tsx`, que ya están en disco.

**R40.** Esta feature NO DEBE reimplementar ni duplicar ninguna de las reglas de QC-87 —estados que
admiten asignación, «solo cuentas `active`», «reaplicar añade a los que faltan», congelado de
personas y de nombre de grupo—: las consume a través de sus Server Actions, importadas por su **ruta
exacta** y nunca desde el barrel del módulo.

**R41.** Esta feature NO DEBE rehacer la pantalla de pedidos de QC-35, la tabla de datos compartida
(QC-55) ni el orden y el filtro (QC-57): se les **añade** la columna, la sección y la acción de
fila.

### Cobertura de las decisiones cerradas

Cada fila de `## Decisiones cerradas (no reabrir)`, en el orden en que está escrita, con los
requisitos que la hacen testeable. Ninguna queda sin `R<n>`.

| # | Decisión cerrada | Requisito(s) |
| --- | --- | --- |
| 1 | Sección dentro del `order-sheet` que ya existe, más entrada propia «Responsables» en las acciones de la fila | R23, R24 |
| 2 | Sin `asignaciones.modificar`: el panel, en solo lectura | R28 |
| 3 | En `ENTREGADO` o `CANCELADO`, los controles no aparecen y sin frase que lo explique | R29 |
| 4 | El listado **sí** pinta responsables (el motivo de que la ficha sea `fullstack`) | R16, R1 |
| 5 | Una consulta **en lote** por página; ni un join ni una consulta por fila | R1, R4, R5, R14 |
| 6 | No hace falta join a grupos: `workGroupName` viaja congelado en la fila | R12, R25 |
| 7 | El panel no vuelve a consultar al abrirse; el refresco es `router.refresh()`, sin `revalidatePath` | R26, R33 |
| 8 | Tres iniciales y un `+N` con tooltip por nombre; la columna no crece; en el panel salen todos | R17, R18, R25 |
| 9 | Se puede quitar un grupo entero, agrupando por origen, además de persona a persona | R25, R30, R31 |
| 10 | Un avatar es un círculo con iniciales y tooltip, sin foto; `getInitials`, `avatar.tsx` y `tooltip.tsx` ya existen | R21, R39 |
| 11 | Se hereda de disco: trío vacío / error / esqueleto por lista, y toast de `sonner` con cuántas se añadieron | R19, R20, R22, R33 |
| 12 | Se hereda de QC-87 y no se reabre: estados, `active`, reaplicar, quién ve y quién asigna, congelado, Server Actions con `FormData`, `code` estable, inglés, ninguna librería nueva | R2, R3, R11, R13, R32, R39, R40 |
| 13 | Hace falta E2E del recorrido completo, **incluido el listado** | R37, R38 |

Requisitos que **no** salen de una fila de la tabla, y de dónde salen: **R6, R7, R8, R9, R10** de la
forma que QC-87 dio a la consulta de un solo pedido (R13, R38, R40, R42) aplicada al lote, más
`docs/architecture.md > Dominio` n.º 1 para la empresa; **R15** de QC-87 R48/R49, que esta ficha
hereda porque tampoco toca esquema ni permisos; **R19** del marcador de ausencia que ya usan las
celdas de receta y motivo de cancelación en `order-columns.tsx` (QC-35 R9, R11); **R20** de
`loadFormCatalogs` en `order-list-section.tsx`, que ya degrada un catálogo caído sin tumbar la
lista; **R27** de `docs/architecture.md > Componentes` (los componentes privados reciben datos por
props); **R31** de QC-87 R29/R31 (se desasigna exactamente una persona por invocación); **R34** de
QC-70 y QC-87 R43 (traducir por `code`); **R35** de `docs/architecture.md > Componentes > Regla:
multiplataforma`; **R36** de `docs/architecture.md > Componentes > Regla: componentes de ruta en
components/ con barrel index.ts`; **R41** del Alcance («la pantalla de pedidos no se rehace»).

## Preguntas abiertas

Ninguna.

**Nota para `design.md`, que NO es decisión de acotación:** `asignaciones` **ya depende de
`pedidos`** (consume `OrderCatalog`, QC-87), así que la consulta en lote **no puede crear un ciclo
`pedidos → asignaciones`**. Dónde se compone —en la página o en un caso de uso— lo decide el
diseño, no esta acotación.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
| --- | --- | --- |
| 2026-09-13 | ¿Dónde viven los responsables dentro de la pantalla? | **Sección dentro del `order-sheet` que ya existe** —no se monta un panel nuevo—, más una **entrada propia «Responsables»** en las acciones de la fila que abre ese mismo panel en esa sección. **Motivo**: sin la segunda puerta, ver quién prepara un pedido obligaría a abrir el formulario de **edición**, que quien solo consulta no puede guardar |
| 2026-09-13 | ¿Qué ve quien puede ver pedidos pero NO tiene `asignaciones.modificar`? | **El panel, en solo lectura**: iniciales, nombres y nombre de grupo, **sin** buscador, **sin** selector y **sin** quitar. Ver quién prepara un pedido basta con `pedidos.consultar` (QC-87 dec. 5), así que negarle el panel entero le escondería algo a lo que tiene derecho. El corte real lo sigue ejerciendo el caso de uso |
| 2026-09-13 | ¿Y en un pedido `ENTREGADO` o `CANCELADO`? | **Los controles de asignar no aparecen, y sin frase que lo explique.** **Consecuencia escrita, aceptada por el humano**: la misma fila **sí** explica por qué no se puede editar, cancelar ni eliminar (`FINAL_ORDER_REASON`, constante visible y exportada de QC-35), así que la pantalla explicará una cosa y callará la otra a dos centímetros |
| 2026-09-13 | ¿El listado pinta responsables? | **Sí.** Es el motivo de que la ficha **deje de ser `frontend` y pase a `fullstack`**: se verificó en disco que el listado **no tiene de dónde sacarlos** —`OrderView` tiene catorce campos y ninguno de asignación, y el módulo `pedidos` no tiene **ni una** referencia a `orderAssignment`— |
| 2026-09-13 | ¿Cómo llega el dato al listado? | **Una consulta EN LOTE por página.** Se añade a `asignaciones` una consulta de responsables para **varios** pedidos y se **compone**, exactamente como hoy se compone `recipeName` en `list-orders.ts`: la página de pedidos primero, los nombres de golpe después. **NI UN JOIN** —lo prohíben **R53** y **QC-33 R31/R32**, y QC-33 dejó las FK como **escalares sin `@relation`** justamente para que no haya relación que navegar ni por descuido— **NI UNA CONSULTA POR FILA**, que con 20 filas serían 20 por render en la pantalla más transitada |
| 2026-09-13 | ¿Hace falta un join a grupos para el nombre del grupo? | **No.** **QC-86 congeló `workGroupName` dentro de la fila de asignación**: el nombre ya viaja con el dato, y por eso además sobrevive a un renombrado posterior |
| 2026-09-13 | ¿El panel vuelve a consultar al abrirse? | **No**: la fila del listado ya trae sus responsables, así que abrir el panel **no cuesta ninguna consulta**. El refresco tras asignar es **`router.refresh()`**, sin `revalidatePath`. Heredado de QC-38/QC-45/QC-67, verificado en disco |
| 2026-09-13 | ¿Qué se ve si no caben en la fila? | **Tres iniciales y un `+N`**, cuyo tooltip lista **por nombre** a los que faltan. La columna no crece ni encoge según el pedido. En el **detalle y el panel no hay límite**: salen todos |
| 2026-09-13 | ¿La pantalla ofrece quitar un grupo entero? | **Sí**, agrupando a los responsables **por su origen**, con acción propia por grupo, **además** de quitar persona a persona. Sin esto, el caso de uso que **QC-87 ya construyó y probó** (R32–R34) se quedaría **sin puerta** y deshacer un grupo de ocho serían ocho acciones |
| 2026-09-13 | ¿Qué es un «avatar» aquí, exactamente? | Un **círculo con las iniciales** (`John Doe` → `JD`) y **tooltip con el nombre**. **Sin foto, y no es una preferencia**: `OrderResponsible` tiene **tres claves** —`userId`, `displayName`, `origin`— y ninguna imagen. **`getInitials`, `avatar.tsx` y `tooltip.tsx` ya existen en disco**: no se invoca la CLI de shadcn ni entra dependencia alguna |
| 2026-09-13 | Lo que se hereda de disco y no se decide otra vez | El trío **vacío / error / skeleton** por lista (QC-45/QC-67/QC-85), y el **toast de `sonner`** —ya en uso en `order-sheet.tsx`— para decir **cuántas personas se añadieron**, que es lo que QC-87 dec. 2 dejó pedido |
| 2026-09-13 | Lo que se hereda de QC-87 y **no se reabre** | Los **estados que admiten asignación** (solo `PENDIENTE` y `EN_CURSO`); **reaplicar un grupo añade** a los que faltan y no toca a los que ya estaban; **solo cuentas `active`**; **quién ve y quién asigna**; el **congelado** de personas y nombre; **Server Actions con `FormData`**, errores por **`code` estable** e identificadores en **inglés**; y **ninguna librería nueva**. Las doce decisiones completas viven en `specs/QC-87-asignar-responsables-a-un-pedido/requirements.md` |
| 2026-09-13 | ¿Hace falta E2E? | **Sí, y ya estaba acordado**: QC-87 dec. 11 definió el recorrido —abrir un pedido, marcar una persona, aplicar un grupo, sacar a alguien y comprobar que **el listado** muestra los avatares y el nombre del grupo— **incluyendo el listado**. Dejar el listado fuera del alcance habría roto un E2E ya pactado |
