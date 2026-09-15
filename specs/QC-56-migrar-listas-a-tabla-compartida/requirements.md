# QC-56 — migrar-listas-a-tabla-compartida · requirements.md

> **Zona** `frontend` · **Complejidad** `medium` · **depends_on** QC-55, QC-52, QC-57 (las tres
> hechas) · **Rama** `feature/QC-56-migrar-listas-a-tabla-compartida`
>
> **Alcance.** Las listas de **recetas** (`/produccion/formulas`) y de **proveedores**
> (`/proveedores`) montan la **tabla compartida** de QC-55 y borran su tabla, su barra y su esqueleto
> propios. Las dos **se igualan a productos**: ganan **orden por cabecera**, **busqueda** y **filtro
> por rango de fecha de creacion**, lo que ya declaran `RECIPE_QUERYABLE` y `SUPPLIER_QUERYABLE`.
> Cada gesto navega y el servidor recalcula; nada se filtra en el navegador.
>
> **Medido en disco el 2026-09-15.** Productos **ya** esta migrado (`749d850`, 2026-09-07) y el
> catalogo de proveedor tambien (enmienda de QC-44). `recipe-table.tsx` y `supplier-table.tsx` siguen
> con tabla propia, aunque el mensaje de `749d850` y la enmienda de QC-44 (l.96) dicen que recetas ya
> la usaba: **es falso**.
>
> **Lo que NO entra.**
> - **Productos** y el **catalogo de proveedor**: ya estan migrados.
> - **Volver a la pagina 1 al buscar, ordenar o filtrar**: es **QC-97, punto 4**, porque afecta a las
>   siete listas. Hoy solo el cambio de tamano vuelve a la 1 (`data-table-params.ts:56`).
> - **La prueba en iPhone real** (T13 de QC-55): pasa a **QC-114**.
> - **La tabla de ingredientes del pedido** (`order-ingredients-table.tsx`): no es un listado.
> - **El foco del filtro con dos tablas en la misma pagina** (deuda de QC-55): aqui no aplica, cada
>   pantalla monta una sola tabla.
>
> *Sembrado por `/afinar-feature` el 2026-09-15. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijo el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aqui es `## Requisitos (EARS)`.*

## Requisitos (EARS)

> **Glosario mínimo.** **Las dos listas**: la lista de recetas, servida en la URL de la constante de
> ruta de fórmulas, y la lista de proveedores, servida en la URL de la constante de ruta de
> proveedores. No incluye el catálogo de un proveedor ni ninguna otra pantalla. **Tabla compartida**:
> el componente de QC-55, consumido por su contrato público. **Lista blanca**: lo que el módulo de
> cada lista declara ordenable, filtrable y buscable (`RECIPE_QUERYABLE`, `SUPPLIER_QUERYABLE`, QC-57).
> **Gesto de lista**: cambiar de página, de tamaño de página, de orden, de término de búsqueda o de
> rango de fecha de creación. **Operación de listado**: la Server Action de listado del módulo de
> cada lista.
>
> Cada requisito cita entre corchetes la fila de `## Decisiones cerradas` de la que sale (D1 = primera
> fila, D11 = última) y, cuando conserva o invierte un requisito de otra ficha, cuál.

### Montaje

**R1** — Cada una de las dos listas DEBE presentarse con la tabla compartida, consumida por su
contrato público, y NO DEBE declarar tabla, barra de paginación ni selector de tamaño de página
propios. *[D1; Alcance]*

**R2** — La lista de recetas DEBE presentar las columnas imagen, nombre, descripción, número de
pasos, fecha de creación, fecha de actualización y acciones; la de proveedores, nombre, teléfono,
correo electrónico, fecha de creación, fecha de actualización y acciones. *[D2; conserva QC-26 R8 y
R18, QC-44 R14]*

**R3** — Ninguna de las dos listas DEBE mostrar el identificador técnico de la fila, los
identificadores de quien la creó o modificó, ni —en proveedores— la forma normalizada del nombre.
*[D2; conserva QC-26 R9, QC-44 R12]*

**R4** — Cada fila de la lista de proveedores DEBE ofrecer la navegación a la página de detalle de
ese proveedor, construida con el helper de ruta de detalle. *[D2; conserva QC-44 R3, R15]*

**R5** — La celda de imagen de la lista de recetas DEBE usar la dirección de imagen que entrega la
operación de listado tal cual y, SI la receta no tiene imagen, ENTONCES DEBE presentar un marcador
identificable sin emitir una imagen con dirección vacía. *[D2; conserva QC-26 R18]*

### Orden, búsqueda y filtro (se igualan a productos)

**R6** — CUANDO el usuario active la cabecera de la columna de nombre, de fecha de creación o de
fecha de actualización —o elija un orden ascendente o descendente en el menú de esa columna—, el
sistema DEBE volver a pedir la lista al servidor con ese campo y esa dirección, y la cabecera DEBE
exponer el orden vigente de forma accesible. *[D2; invierte QC-26 R14 y QC-44 R11]*

**R7** — Ninguna columna cuyo campo no esté en la lista ordenable de su lista blanca —imagen,
descripción, número de pasos, teléfono, correo electrónico y acciones— DEBE ofrecer control de
orden. *[D2]*

**R8** — CUANDO el usuario escriba un término en el campo de búsqueda de una de las dos listas, el
sistema DEBE volver a pedir esa lista al servidor con ese término, y CUANDO lo vacíe, DEBE volver a
pedirla sin búsqueda. *[D2; invierte QC-26 R14 y QC-44 R11]*

**R9** — CUANDO el usuario fije, cambie o limpie el rango de fecha de creación —a mano o con un
atajo—, el sistema DEBE volver a pedir la lista al servidor con ese rango, o sin él. Ninguna otra
columna de las dos listas DEBE ofrecer filtro. *[D2]*

**R10** — Ningún gesto de lista DEBE ordenar, filtrar, buscar ni recortar en el navegador las filas
ya recibidas: las filas presentadas DEBEN ser exactamente las que devolvió la última invocación de
la operación de listado, y en su mismo orden. *[D2: lo que protegían QC-26 R14 y QC-44 R11 sigue
en pie]*

**R11** — Los campos que cada lista acepta como orden, filtro y búsqueda DEBEN derivarse de la
lista blanca publicada por su módulo; ningún archivo de las dos listas DEBE mantener una copia
escrita a mano de esos campos. *[D2]*

**R12** — El estado de cada lista —página, tamaño, orden, término de búsqueda y rango de fecha de
creación— DEBE viajar en la URL, de modo que CUANDO se cargue una URL de la lista con esos
parámetros, el sistema DEBE pedir y presentar la lista con ellos. *[D2]*

**R13** — SI los parámetros de lista recibidos son inválidos —página no entera o menor que uno,
tamaño fuera de las opciones, orden sobre un campo no ordenable o con dirección desconocida, fecha
inexistente o término formado solo por espacios—, ENTONCES el sistema DEBE descartar o acotar cada
uno por separado y presentar la lista, y NO DEBE fallar ni mostrar un error. *[D2; amplía QC-26 R13
y QC-44 R10]*

**R14** — MIENTRAS un gesto de lista esté en vuelo, el sistema DEBE señalar de forma identificable
que la lista se está recalculando, y el campo de búsqueda y el de filtro NO DEBEN desmontarse ni
perder el foco ni el texto que se está escribiendo. *[D2: patrón de productos del 2026-09-07; D5]*

### Datos y estados

**R15** — La pantalla de cada lista DEBE obtener sus filas en el servidor con **una sola**
invocación de la operación de listado por render, y entregarlas a la tabla por props; ningún
componente de cliente de las dos listas DEBE invocar la operación de listado. *[D5; conserva QC-26
R10]*

**R16** — MIENTRAS la operación de listado no haya fallado y no devuelva ninguna fila, el sistema
DEBE presentar un estado vacío identificable, en lugar de una tabla sin filas, que ofrezca la
acción de crear: navegar a la página de alta en recetas, abrir el panel de alta en proveedores.
*[D5; conserva QC-26 R15, R20 y QC-44 R16]*

**R17** — SI la página pedida queda sin filas por ser mayor que el total, ENTONCES el estado vacío
DEBE ofrecer además volver a la primera página, conservando el tamaño, el orden, la búsqueda y el
rango vigentes. *[D5; D2]*

**R18** — MIENTRAS la lista se esté obteniendo por primera vez, el sistema DEBE presentar un
indicador de carga identificable en lugar de las filas. *[D5; conserva QC-26 R16, QC-44 R17]*

**R19** — SI la operación de listado responde con error, ENTONCES el sistema DEBE presentar un
estado de error identificable que NO DEBE confundirse con el vacío ni mostrar ningún dato de la
lista, que ofrezca reintentar y que, SI el error es inesperado, conserve el identificador de la
petición. *[D5; conserva QC-26 R17, QC-44 R18, QC-71 R17]*

**R20** — Los estados vacío, cargando y error de las dos listas DEBE presentarlos la tabla
compartida, y DEBEN ser mutuamente excluyentes y distinguibles por `data-testid` o rol. *[D5]*
> Ver `design.md > 0`, hallazgo H1: esta mitad de D5 choca con la implementación de referencia de
> D2 y con R19. No se resuelve aquí.

### Acciones, paginación y plataforma

**R21** — Cada fila DEBE ofrecer sus acciones —en recetas, editar (navega a su página) y borrar; en
proveedores, editar y dar de baja— en una columna propia de la tabla que el usuario NO DEBE poder
fijar, con cada control siempre visible, sin depender de pasar el puntero por encima, y con un área
táctil de al menos 44×44 px. *[D4; conserva QC-26 R50 y QC-44 R48]*

**R22** — Cada lista DEBE ofrecer un selector de tamaño de página con exactamente dos opciones,
iguales al tamaño por defecto y al tope de las constantes de paginación compartidas (10 y 25), y
DEBE usar el primero cuando no se indique ninguno. CUANDO el usuario cambie el tamaño, el sistema
DEBE volver a pedir la lista desde la primera página. *[D6; conserva QC-26 R11, QC-44 R8]*

**R23** — CUANDO existan más filas de las que caben en una página, cada lista DEBE permitir avanzar
y retroceder de página e indicar la página actual y el total de páginas, y NO DEBE ofrecer avanzar
más allá de la última ni retroceder antes de la primera. *[D6; conserva QC-26 R12, QC-44 R9]*

**R24** — MIENTRAS el ancho disponible no alcance para todas las columnas, cada lista DEBE resolver
el desbordamiento con scroll horizontal contenido en la propia tabla, sin scroll horizontal del
documento, y con los controles de acción, orden, búsqueda y filtro alcanzables y operables por
tacto y por teclado. La feature NO DEBE declarar ninguna excepción de escritorio. *[D7; conserva
QC-26 R19 y QC-44 R13]*

### Pruebas, dependencias y alcance

**R25** — Los tests de esta feature DEBEN localizar los elementos por rol ARIA, `data-testid` o
constantes exportadas, y NO DEBEN afirmar sobre literales de copy. *[D8]*

**R26** — Los specs E2E existentes de recetas y de proveedores DEBEN ampliarse, sin crear un spec
nuevo, con un recorrido que en Chromium y en WebKit busque por el nombre de filas creadas por el
propio spec y las encuentre, y ordene por nombre y compruebe el orden relativo de esas mismas filas.
*[D9; D3]*

**R27** — La feature NO DEBE añadir ninguna dependencia a `package.json`. *[D10]*

**R28** — La feature NO DEBE modificar la lógica, la validación ni las listas blancas de las
operaciones de listado, ni el esquema de datos. *[D11]*

**R29** — La lista cerrada de pantallas autorizadas a consumir la tabla compartida, y la de specs
E2E que la referencian, DEBEN ampliarse con lo que esta feature estrena, y NO DEBEN aflojarse: una
pantalla o spec no declarados DEBEN seguir poniendo la guardia en rojo. *[D1]*

**R30** — Tras la migración, NO DEBE quedar en las rutas de las dos listas ningún componente propio
de tabla, de barra de paginación ni de esqueleto de lista. *[Alcance]*
> Ver `design.md > 0`, hallazgo H3: productos, la referencia de D2, conservó su esqueleto.

### Cobertura de las decisiones cerradas

| Decisión | Requisitos |
|---|---|
| D1 — Recetas y proveedores; reabre la enmienda de QC-44 | R1, R29 |
| D2 — Se igualan a productos; invierte QC-26 R14 y QC-44 R11 | R2–R14, R17 |
| D3 — iPhone real a QC-114; E2E en Chromium y WebKit | R26 |
| D4 — Columna de acciones normal, `pinnable: false`, 44×44 | R21 |
| D5 — La pantalla trae datos por props; la tabla pinta los tres estados | R14–R20 |
| D6 — Tamaño 10 y 25 de `lib/shared/pagination` | R22, R23 |
| D7 — Multiplataforma sin excepción; scroll contenido | R24 |
| D8 — Asserts por rol, `data-testid` y constantes | R25 |
| D9 — Se amplían los dos E2E, sin archivo nuevo | R26 |
| D10 — Ninguna dependencia nueva | R27 |
| D11 — `frontend` / `medium`; el backend ya lo soporta | R28 |

## Preguntas abiertas

1. **¿Y si una columna no cabe?** `DataTableColumn` sigue sin ancho (`data-table-types.ts:63-75`) y
   todas caen en el ancho por defecto de la libreria. Si alguna columna de recetas o proveedores no
   cabe, arreglarlo **toca el componente compartido**, que QC-45 y las pantallas siguientes no
   tocaron nunca. `spec_author` lo **mide** y, si hace falta tocarlo, **lo declara en `design.md`**
   para aprobarlo en F1.4. No lo decide por su cuenta.

   > **Medido por `spec_author` el 2026-09-15** (detalle en `design.md > 6`): **no hace falta tocar
   > el componente compartido** para cumplir las decisiones. La única columna que se desborda de
   > verdad es la **descripción de receta** (hasta 500 caracteres, sin salto de línea), y el
   > desbordamiento queda contenido en la tabla, igual que hoy. Si se quiere acotar su ancho, se
   > puede hacer dentro de la celda, sin tocar el componente: es la pregunta 2.

2. **¿Se acota el ancho de la descripción de receta?** *(añadida por `spec_author` el 2026-09-15)*
   Hoy y después de migrar, una descripción de 500 caracteres ocupa una sola línea y ensancha la
   tabla hasta dejar las acciones muy lejos a la derecha. Se puede recortar con puntos suspensivos
   dentro de la propia celda, pero eso **esconde texto** al usuario, y es decisión de producto. Sin
   respuesta, el spec la deja como está hoy: sin recortar.

3. **¿Qué dice el vacío cuando hay una búsqueda o un filtro activos?** *(añadida por `spec_author`
   el 2026-09-15)* R16 describe el vacío del catálogo con la acción de crear. Con una búsqueda que no
   encuentra nada, ese mismo estado diría «todavía no hay recetas», que es falso. Productos tiene
   hoy ese defecto y además **desmonta la caja de búsqueda** al pintar el vacío fuera de la tabla
   (`product-list-section.tsx:51-63`), así que el usuario no puede corregir el término sin editar la
   URL. Está atado al hallazgo H1 de `design.md > 0`. Sin respuesta, R16 no distingue los dos casos.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decision |
|---|---|---|
| 2026-09-15 | ¿Que listas entran? | **Recetas y proveedores.** Productos ya esta migrado. **Reabre la enmienda de QC-44 del 2026-09-07**, que decia «la lista de PROVEEDORES no cambia» |
| 2026-09-15 | ¿Ganan capacidades o es migracion pura? | **Se igualan a productos**: orden por `name`, `createdAt` y `updatedAt`, busqueda y filtro por rango de `createdAt`, exactamente lo de `RECIPE_QUERYABLE` y `SUPPLIER_QUERYABLE` (QC-57). Nada en el navegador. **Invierte R14 de QC-26 y R11 de QC-44** (para la lista de proveedores), igual que `749d850` invirtio R13 de QC-22: lo que protegian, no filtrar dentro de la pagina ya descargada, sigue en pie |
| 2026-09-15 | ¿La prueba en iPhone real sigue bloqueando esta ficha? | **No, va a ficha propia: QC-114**, que cubre todas las pantallas que montan la tabla y esta bloqueada por esta. Esta ficha corre su E2E en Chromium y WebKit |
| 2026-09-15 | Columna de acciones | **Columna normal, `pinnable: false`, botones siempre visibles y de 44×44.** Heredado de **QC-45** |
| 2026-09-15 | ¿Quien trae los datos y quien pinta vacio, carga y error? | **La pantalla trae los datos y los pasa por props; la tabla pinta los tres estados**, y el error no se muestra como vacio. Heredado de **QC-55** |
| 2026-09-15 | Tamano de pagina | **10 y 25**, de `lib/shared/pagination`. Heredado de **QC-22** |
| 2026-09-15 | Multiplataforma | **Sin excepcion de escritorio**; scroll contenido en la tabla. Heredado de **QC-22** |
| 2026-09-15 | Asserts de los tests | **Roles ARIA, `data-testid` y constantes; nunca textos.** Heredado de **QC-22** |
| 2026-09-15 | ¿E2E? | **Si: se amplian `e2e/recetas.spec.ts` y `e2e/proveedores.spec.ts`** con busqueda y orden, sin archivo nuevo. **QC-55 lo difirio aqui** |
| 2026-09-15 | ¿Dependencia nueva? | **Ninguna.** La tabla y sus primitivas ya estan montadas |
| 2026-09-15 | ¿Zona y complejidad? | **`frontend` / `medium`.** El backend ya soporta todo; son dos pantallas y dos requisitos invertidos |
