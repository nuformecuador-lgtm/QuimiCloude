# QC-25 — crud-de-recetas · requirements.md

> **Zona:** `backend` · **Complejidad:** `high` · **depends_on:** `QC-24`, `QC-20`, `QC-8` ·
> **Rama:** `feature/QC-25-crud-de-recetas`
>
> **Alcance.** Los casos de uso del catálogo de recetas, sobre el modelo que crea QC-24: alta,
> consulta paginada, detalle, edición y borrado, con las líneas de producto conciliadas junto
> con la receta que las contiene. Incluye la autorización en el service, la validación de borde
> con zod, la **subida de la imagen a Supabase Storage detrás de un puerto**, las variables de
> entorno declaradas y vacías en `.env.example` y documentadas, y las Server Actions que
> consumirá QC-26. Reutiliza el util de paginación que extrajo QC-20; no lo duplica.
>
> **Lo que NO entra.** La pantalla: **QC-26 — Pantalla de recetas**. La migración de la unidad
> de línea de texto libre a catálogo: **QC-32 — Modelo de unidades**, que ya está acotada
> contando con que aquí sigue siendo texto. Tampoco entran el historial de versiones de fórmula,
> el rendimiento o producto resultante de una receta, la limpieza de archivos huérfanos del
> bucket, ni restaurar una receta borrada — los tres primeros son preguntas abiertas sin ficha,
> el último es decisión cerrada.
>
> Sembrado por `/afinar-feature` el 2026-09-03. El bloque de Alcance y la tabla de
> «Decisiones cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los
> reabre y no los reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

Notación EARS (`docs/specs.md`). **«El sistema»** aquí es el módulo **`recetas`** —sus casos de
uso, sus puertos y sus adaptadores driven y driving—, el adaptador de `inventario` que implementa
el contrato `ProductCatalog` y el cableado de `lib/composition`. **El modelo de datos ya existe y
no se re-especifica**: lo aportó **QC-24** (`db/schema.prisma` › `Recipe` y `RecipeLine`, con su
migración, su índice único parcial, sus `CHECK`, su RLS y `normalizeRecipeName`); aquí solo se
consume. El util de paginación tampoco se re-especifica: es `lib/shared/pagination.ts`, de
**QC-20**.

Los **cinco casos de uso** a los que se refieren los requisitos de autorización son: **crear**,
**listar**, **ver el detalle**, **editar** y **borrar** una receta.

### Autorización y actor

**R1.** El sistema DEBE recibir el actor —su identificador y su rol— **como parámetro de entrada**
de cada uno de los cinco casos de uso, y NO DEBE leer la sesión, la cookie ni ninguna cabecera por
su cuenta desde el dominio.

**R2.** SI el rol del actor no es `Administrador`, ENTONCES cualquiera de los cinco casos de uso
DEBE rechazar la operación con un error de autorización, y NO DEBE realizar ninguna lectura ni
ninguna escritura en el repositorio, en el catálogo de productos ni en el almacenamiento de
imágenes. Esto incluye **listar** y **ver el detalle**: el Operador tampoco consulta.

**R3.** SI la operación llega sin actor, o con un actor cuyo rol es nulo, vacío o desconocido,
ENTONCES el sistema DEBE rechazarla igual que en R2 (falla cerrado), y NO DEBE tratar la ausencia
de rol como permiso.

**R4.** El sistema DEBE conservar `ROW LEVEL SECURITY` habilitado **y forzado** en `recipes` y
`recipe_lines`, y NO DEBE crear ninguna policy que pretenda sustituir la comprobación de R2.

### Receta — alta y edición

**R5.** CUANDO un actor con rol `Administrador` da de alta una receta con datos válidos, el
sistema DEBE persistirla **junto con todas sus líneas de producto** y DEBE devolver su
identificador.

**R6.** CUANDO se da de alta una receta, el sistema DEBE registrar al actor como autor de la
creación **y** como autor de la última modificación; y CUANDO se edita o se borra una receta, DEBE
registrar al actor como autor de la última modificación, sin alterar el autor de la creación.

**R7.** SI el nombre de una receta está vacío o se compone solo de espacios, ENTONCES el sistema
DEBE rechazar la operación; CUANDO el nombre es válido, DEBE recortar los espacios de sus extremos
**antes** de guardarlo; y SI el nombre supera **120** caracteres o la descripción supera **500**,
ENTONCES DEBE rechazar la operación. Ninguno de los dos límites DEBE imponerse cambiando el tipo
de una columna.

**R8.** CUANDO se persiste una receta, el sistema DEBE guardar su **nombre normalizado** junto al
nombre original y DEBE mantener los dos sincronizados en toda escritura, usando **la única
definición de normalización** que publica el contrato del módulo `recetas`; y SI el nombre
normalizado coincide con el de **otra receta viva**, ENTONCES DEBE rechazar la operación con un
error de duplicado y no DEBE crear ni modificar ninguna fila.

**R9.** SI el nombre de una receta queda **vacío después de normalizarlo** —porque no contiene
ningún carácter alfanumérico—, ENTONCES el sistema DEBE rechazarlo como **nombre inválido**, y NO
DEBE dejar que llegue al índice único y se anuncie al usuario como duplicado.

**R10.** El sistema DEBE apoyar la unicidad de R8 en el **índice único de la base de datos**, de
modo que dos altas simultáneas con el mismo nombre normalizado acaben con **una sola** receta
creada y la otra rechazada con el mismo error de duplicado.

### Líneas de producto

**R11.** CUANDO se edita una receta, el sistema DEBE recibir **la lista final completa** de sus
líneas y DEBE conciliar por sí mismo cuáles se crean, cuáles se actualizan y cuáles desaparecen;
NO DEBE exponer ninguna operación de alta, edición o borrado de una línea por separado.

**R12.** CUANDO una línea desaparece de la lista final, el sistema DEBE **eliminar su fila por
completo**, y NO DEBE marcarla como borrada ni conservarla.

**R13.** SI cualquier parte de una edición falla —la receta o cualquiera de sus líneas—, ENTONCES
el sistema NO DEBE dejar la receta parcialmente conciliada: o se aplican todos los cambios o no se
aplica ninguno.

**R14.** SI la cantidad de una línea es cero, negativa o ausente, o su unidad de medida está vacía
o es solo espacios, ENTONCES el sistema DEBE rechazar la operación **antes de llegar al
repositorio**.

**R15.** ~~El sistema DEBE aceptar la unidad de la línea como **texto libre**, y NO DEBE
restringirla a ningún catálogo de unidades ni derivarla de la unidad del producto.~~
**DEROGADO el 2026-09-03 por decisión humana**, y sustituido por **R50**: QC-32 se mergeó en `dev`
mientras esta feature se implementaba, y en `dev` la columna ya no es `unit` sino `unit_id`. La
decisión cerrada que fijaba el texto libre **anticipó por escrito esta sustitución exacta** —«cuando
QC-32 llegue, la validación “unidad vacía” de aquí se sustituye por “la unidad existe en el
catálogo”»—; lo que no anticipó es que ocurriera el mismo día. Se conserva tachado y con el motivo,
como se hizo con la D3 de **QC-9**, en vez de borrarlo: un requisito que se deroga cuenta algo que
uno reescrito calla.

**R50.** El sistema DEBE tomar la unidad de la línea como **una referencia al catálogo del módulo
`unidades`**, y SI una línea apunta a una unidad que **no existe** en ese catálogo, ENTONCES DEBE
rechazar la operación y NO DEBE crear ni modificar ninguna fila; la comprobación DEBE hacerse **a
través del contrato público de `unidades`** (`@/lib/modules/unidades`), nunca contra su tabla, su
modelo de Prisma ni su repositorio. La unidad sigue siendo **obligatoria** —eso no lo cambia QC-32,
que solo cambió la forma— y sigue **sin derivarse** de la unidad del producto y **sin conversión**
entre unidades.

**R16.** SI la lista de líneas contiene dos o más líneas que apuntan al **mismo producto**,
ENTONCES el sistema DEBE rechazar la operación y no DEBE crear ni modificar ninguna fila.

**R17.** SI una línea apunta a un producto que **no existe**, ENTONCES el sistema DEBE rechazar la
operación; y DEBE comprobar la existencia del producto **a través del contrato público
`@/lib/modules/inventario`**, sin consultar el modelo ni la tabla del producto con el cliente
Prisma y sin importar por ruta profunda el dominio, los puertos ni los adaptadores de
`inventario`.

**R18.** MIENTRAS un producto usado por una receta esté **borrado lógicamente**, el sistema DEBE
conservar la línea que lo referencia y DEBE devolverla en el detalle de la receta.

> Los dos requisitos que siguen cierran la pregunta abierta 7 y están numerados **a continuación de
> R44** para no renumerar nada de lo ya escrito.

**R45.** MIENTRAS una línea **ya forme parte** de la receta, el sistema DEBE admitir que la edición
la reenvíe aunque su producto esté **borrado lógicamente**, y NO DEBE exigir para ella que el
producto siga vivo: editar una receta NO DEBE obligar a quitar antes los productos dados de baja.

**R46.** SI la lista final incluye una línea cuyo producto **no estaba ya en la receta** y que no
existe o está borrado lógicamente, ENTONCES el sistema DEBE rechazar la operación; y CUANDO se da
de alta una receta, DEBE tratar **todas** sus líneas como nuevas a este efecto.

### Pasos

**R19.** SI los pasos recibidos no son una lista de textos, o alguno de esos textos está vacío o
es solo espacios, ENTONCES el sistema DEBE rechazar la operación; y SI no se indican pasos,
ENTONCES DEBE persistir una **lista vacía**.

**R20.** SI la lista de pasos tiene más de **50** elementos, o alguno de ellos supera **1.000**
caracteres, ENTONCES el sistema DEBE rechazar la operación en la **validación de aplicación**, y
NO DEBE imponer ese límite cambiando el tipo de la columna, que sigue guardando el documento JSON
tal cual.

### Imagen y almacenamiento

**R21.** El sistema DEBE aceptar el alta y la edición de una receta **sin imagen**, y NO DEBE
rechazar ninguna operación por la ausencia de imagen.

**R22.** El sistema DEBE resolver la subida y el borrado del archivo **detrás de un puerto del
módulo `recetas`**, implementado por un adaptador driven; el caso de uso NO DEBE conocer el
servicio de almacenamiento concreto, y el dominio del módulo NO DEBE importar su librería de
cliente.

**R23.** SI el archivo recibido pesa más de **5 MB**, o su **contenido** no corresponde a JPEG,
PNG o WebP, ENTONCES el sistema DEBE rechazar la operación; la comprobación del formato DEBE
hacerse sobre el contenido del archivo y NO DEBE bastar con su extensión ni con el tipo declarado
por el cliente —un PDF, un SVG o un HEIC renombrados a `.jpg` DEBEN rechazarse igual—.

**R24.** CUANDO se guarda una imagen, el sistema DEBE persistir en la receta **la ruta del archivo
dentro del bucket**, y NO DEBE persistir la URL completa; CUANDO se lee una receta, DEBE componer
la URL juntando esa ruta con la dirección del almacenamiento tomada de la configuración.

**R25.** La URL que el sistema compone al leer DEBE ser una URL pública, sin firma ni caducidad, y
el sistema NO DEBE generar enlaces firmados ni temporales.

**R26.** CUANDO se reemplaza la imagen de una receta viva, el sistema DEBE borrar del
almacenamiento el archivo anterior una vez que la nueva ruta queda persistida.

**R27.** CUANDO se borra una receta, el sistema NO DEBE borrar su archivo del almacenamiento y
DEBE conservar la ruta en la fila.

**R28.** El sistema DEBE resolver la dirección del almacenamiento, el nombre del bucket y la
credencial de subida **por configuración**, DEBE declarar esas variables —**vacías**— en
`.env.example` con su documentación, y NO DEBE incluir ninguno de esos valores escrito en el
código.

> Los tres requisitos que siguen cierran las preguntas abiertas 5 y 6, y están numerados **a
> continuación de R44** para no renumerar nada de lo ya escrito.

**R47.** CUANDO la edición indica explícitamente que la receta se queda **sin imagen**, el sistema
DEBE dejarla sin ruta de imagen **y DEBE borrar del almacenamiento el archivo que tenía**; y NO
DEBE confundir ese caso con el de una edición que no menciona la imagen, que DEBE conservarla
intacta.

**R48.** El sistema DEBE resolver los **dos** borrados de almacenamiento —el del reemplazo (R26) y
el de quitar la imagen (R47)— con **la misma operación del mismo puerto**, implementada una sola
vez en el mismo adaptador, y NO DEBE contener ninguna segunda implementación del borrado.

**R49.** SI el borrado de un archivo en el almacenamiento falla, ENTONCES el sistema NO DEBE hacer
fallar ni revertir la edición ya persistida, y DEBE reportar ese fallo con su contexto —qué
operación y sobre qué ruta—; NO DEBE descartarlo en un `catch` vacío ni en silencio.

### Consulta, listado, detalle y borrado

**R29.** CUANDO se consulta la lista de recetas, el sistema DEBE devolver como máximo tantos
elementos como indique el tamaño de página solicitado, junto con el número total de recetas que
cumplen la consulta.

**R30.** SI la consulta no indica tamaño de página, ENTONCES el sistema DEBE usar **10** elementos
por página; SI pide un tamaño mayor que **25**, ENTONCES DEBE devolver como máximo 25 y NO DEBE
ejecutar una consulta sin límite superior; y SI el número o el tamaño de página no son enteros
mayores o iguales a 1, ENTONCES DEBE rechazar la consulta sin leer del repositorio.

**R31.** El sistema DEBE resolver el cálculo de la paginación con el **util ya existente de
`lib/shared/`**, y el módulo `recetas` NO DEBE contener ninguna aritmética propia de
desplazamiento, límite ni total de páginas.

**R32.** El sistema DEBE ordenar la lista por **nombre ascendente**, y ese orden DEBE ser estable:
mientras el conjunto no cambie, ninguna receta DEBE aparecer en dos páginas ni omitirse de todas.

**R33.** El sistema NO DEBE incluir las líneas de producto en los elementos de la **lista**, y
DEBE incluirlas —con su producto, su cantidad y su unidad— en el **detalle** de una receta.

**R34.** El sistema DEBE devolver el autor de creación y el de última modificación como
**identificadores**, sin resolver ningún nombre; y DEBE devolver la receta con normalidad cuando
alguno de esos autores esté **ausente**, sin tratarlo como error.

**R35.** CUANDO se borra una receta, el sistema DEBE conservar su fila completa y marcar el
instante del borrado, y NO DEBE eliminarla físicamente.

**R36.** El sistema DEBE excluir las recetas borradas de **toda** consulta —lista y detalle—, y NO
DEBE ofrecer ninguna operación de restauración ni de listado de borradas.

**R37.** SI el detalle, la edición o el borrado apuntan a una receta que no existe o que ya está
borrada, ENTONCES el sistema DEBE responder con un error de «no encontrado» y no DEBE crear ni
modificar ninguna fila.

### Borde, módulo, dependencia y alcance

**R38.** El sistema DEBE validar con un esquema toda entrada externa de los cinco casos de uso en
el borde, y NO DEBE dejar que ningún dato sin validar ni tipar cruce hacia el dominio.

**R39.** El sistema DEBE exponer las mutaciones de recetas como **Server Actions** en
`adapters/driving/` del módulo `recetas`, y NO DEBE crear ningún route handler para ellas.

**R40.** El sistema DEBE alojar los casos de uso en `lib/modules/recetas/domain/`, con los accesos
a datos y al almacenamiento detrás de puertos implementados en `adapters/driven/` y cableados
**solo** en `lib/composition/`; el dominio NO DEBE importar framework, Prisma, `lib/shared/` ni el
punto de composición, y el contrato `lib/modules/recetas/index.ts` NO DEBE reexportar nada que no
sea de `./domain`.

**R41.** El sistema NO DEBE añadir, renombrar ni eliminar ninguna columna, índice o restricción de
`recipes` ni de `recipe_lines` —consume el esquema de QC-24 tal cual—, y DEBE referirse a esas
columnas por sus nombres **en inglés**, sin introducir ningún alias en español.

**R42.** La única dependencia de terceros que esta feature DEBE incorporar es
**`@supabase/storage-js`**, con su fila en `docs/dependencias.md`; el sistema NO DEBE incorporar
`@supabase/supabase-js` ni ningún cliente de datos de Supabase, y NO DEBE leer ni escribir ningún
dato de negocio por una vía que no sea el repositorio Prisma.

**R43.** La verificación de esta feature DEBE poder ejecutarse **sin red y sin bucket**: ningún
test DEBE realizar una llamada real al servicio de almacenamiento ni depender de que sus variables
de entorno tengan valor.

**R44.** El sistema NO DEBE incluir en esta feature ninguna pantalla, página ni componente de
interfaz —van a **QC-26**—; por lo tanto esta feature no aporta ningún flujo navegable que un test
E2E pueda visitar, y su verificación es unitaria y de integración.

### Cobertura de las decisiones cerradas

Cada fila de `## Decisiones cerradas (no reabrir)`, en el orden en que está escrita, con el
requisito que la hace testeable. Ninguna queda sin `R<n>`. Las filas **24, 25 y 26** son las tres
de la **segunda tabla** —las que cerró el humano en F1.4 respondiendo a las preguntas 5, 6 y 7—, y
sus requisitos (**R45–R49**) están numerados al final para no renumerar nada, aunque vivan en la
sección temática que les toca.

| # | Decisión cerrada | Requisito(s) |
| --- | --- | --- |
| 1 | Solo Administrador, también para consultar, validado en el service | R2, R3 |
| 2 | Borrado lógico de la receta y sin restaurar | R35, R36 |
| 3 | Al borrar la receta, su archivo sobrevive | R27 |
| 4 | Al reemplazar la imagen viva, se borra la anterior | R26 |
| 5 | Bucket público, URL sin firmar | R25 |
| 6 | En la columna va la ruta, no la URL; la URL se compone al leer | R24 |
| 7 | Hasta 5 MB y solo JPEG/PNG/WebP, validado por contenido | R23 |
| 8 | Guardar sin imagen nunca falla | R21 |
| 9 | Librería nueva: solo `@supabase/storage-js` | R42 |
| 10 | La subida vive detrás de un puerto, con doble en los tests | R22, R43 |
| 11 | Storage configurado: variables declaradas y vacías, sin secretos | R28 |
| 12 | Paginada, 10 por defecto, tope 25, reutilizando el util de QC-20 | R29, R30, R31 |
| 13 | Sin desempate: `name ASC` ya es orden total | R32 |
| 14 | El listado no trae líneas; el detalle sí | R33 |
| 15 | Solo los ids de los autores, y el autor vacío es válido | R34 |
| 16 | La lista final completa y el servidor concilia; quitar borra de verdad | R11, R12 |
| 17 | Lo que se rechaza antes de guardar | R7, R8, R9, R14, R16, R17, R19 |
| 18 | Topes de los pasos: 50 y 1.000, en la aplicación | R20 |
| 19 | La unidad de la línea sigue siendo texto libre | R15 |
| 20 | Se puede borrar un producto que una receta usa; la línea se conserva | R18 |
| 21 | Módulo `recetas`, Server Action, zod en el borde, contrato de `inventario`, DB en inglés | R17, R38, R39, R40, R41 |
| 22 | El actor y su rol entran por parámetro (QC-8 los resuelve) | R1 |
| 23 | E2E diferido con motivo | R44 |
| 24 | Se puede quitar la imagen sin poner otra, y ese archivo **sí** se borra; un solo adaptador para los dos caminos | R47, R48 |
| 25 | Si falla el borrado del archivo, la edición no falla y el fallo se reporta con contexto | R49 |
| 26 | Al editar se admite la línea que ya estaba aunque su producto esté de baja; añadir uno de baja sigue prohibido | R45, R46 |

Requisitos que no salen de una fila de la tabla, y de dónde salen: **R4** de
`docs/architecture.md > Acceso a datos y autorizacion` (RLS forzada de QC-24, defensa en
profundidad que esta ficha no debe romper); **R5**, **R6** y **R37** del propio alcance —el camino
feliz del alta con sus líneas, la auditoría que QC-24 dejó escrita para esta ficha y el caso de la
receta inexistente—; **R10** de la garantía real de unicidad, que es el índice único parcial de
QC-24 y no una comprobación previa; **R13** del alcance («las líneas conciliadas **junto con** la
receta que las contiene»); **R44** además del alcance, que manda la pantalla a QC-26.

## Preguntas abiertas

No se rellenan con supuestos (regla 6 de `CLAUDE.md`). Ninguna bloquea el CRUD.

1. **¿Una receta produce algo?** Rendimiento, producto resultante, merma. Es pregunta de negocio
   y **no tiene ficha**. Si la respuesta llega, no es una columna: cambia el modelo (**QC-24**),
   no solo el CRUD.
2. **¿Hará falta historial de versiones de fórmula?** Heredada de **QC-24**, sigue abierta. El
   problema de retrofitearlo no es la tabla: para cuando alguien lo pida, las versiones
   anteriores ya se perdieron y no hay dato del que reconstruirlas.
3. **Los archivos huérfanos del bucket no los limpia nadie.** Consecuencia asumida de la decisión
   de que el archivo sobrevive al borrado de la receta, y no hay ficha de limpieza en el backlog.
   El día que moleste es ficha propia; hoy el bucket está vacío.
4. **La precisión `decimal(14,4)` de la cantidad.** Heredada de **QC-24**, sigue abierta: si una
   fórmula real necesita microgramos de un catalizador, se queda corta, y ampliarla con recetas
   ya cargadas obliga a migrar.

### Añadidas por `spec_author` en F1.2 — CERRADAS el 2026-09-03

Tres huecos que las decisiones cerradas no cubrían. **Ninguna reabría nada**: eran casos que no se
preguntaron. **El humano las cerró el mismo día en F1.4** y sus decisiones son las **tres últimas
filas** de `## Decisiones cerradas (no reabrir)`; ahí está lo que vale. Se quedan escritas aquí
—con el enunciado que tenían— porque el enunciado explica por qué hacía falta preguntarlas, y la
7 documenta un choque real entre dos requisitos. **La 5 se cerró contra la posición por defecto
del `design.md`**, que hay que corregir en consecuencia (`design.md > 13.1`).

5. **¿Se puede quitar la imagen de una receta sin poner otra?** D8 dice que la imagen es opcional
   y D4 dice qué pasa al **reemplazarla**, pero nadie dijo si una receta que ya tiene imagen puede
   volver a quedarse sin ninguna. Y si puede, hay que decir además si ese archivo se borra del
   bucket —sería un segundo borrado de Storage, y D4 dice que el reemplazo es el **único**—.
6. **Si el borrado del archivo anterior falla, ¿falla la edición?** D4 ordena borrar la imagen
   anterior al reemplazarla, pero el borrado en el bucket es una segunda operación que puede
   fallar sola, con la fila ya guardada apuntando a la nueva ruta. Deshacer la edición por un
   archivo que ya no referencia nadie parece peor que dejar un huérfano más (pregunta abierta 3),
   pero es decisión del humano, no del diseño.
7. **Al editar una receta cuya línea apunta a un producto ya borrado lógicamente, ¿se puede
   guardar?** D20 y R18 garantizan que la receta **conserva** esa línea, y R17 exige que el
   producto exista para poder guardarlo; el contrato `ProductCatalog` de `inventario` solo
   devuelve productos **vivos**, así que una edición que reenvíe esa misma línea chocaría con R17
   por un producto que la receta ya tenía. O se admite la línea preexistente, o editar una receta
   obliga a quitar antes el producto dado de baja.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
| --- | --- | --- |
| 2026-09-03 | ¿Quién puede hacer qué? | **Solo Administrador**, y para todo: consultar, crear, editar y borrar. El Operador **ni siquiera consulta**. Se valida en el **service** con su test — una policy de RLS no cuenta como implementado (`docs/architecture.md > Acceso a datos y autorizacion`). Heredado de **QC-20 D2**, y ya lo anticipaba **QC-24 D18** |
| 2026-09-03 | ¿Qué significa borrar una receta? | **Lógico y sin restaurar**: se marca `deleted_at` y toda consulta la excluye. Sin papelera y sin operación de restaurar. Heredado de **QC-4**, **QC-20 D5** y **QC-24** |
| 2026-09-03 | Al borrar la receta, ¿se borra su imagen del Storage? | **No: el archivo sobrevive.** La fila sigue existiendo con su dirección, y borrar el archivo dejaría un registro vivo apuntando a nada — irreversible. Genera huérfanos a conciencia (pregunta abierta 3) |
| 2026-09-03 | Al reemplazar la imagen de una receta viva, ¿se borra la anterior? | **Sí.** Ya no la referencia nadie, y si no el bucket crece solo. ~~Es el **único** borrado de Storage de esta ficha~~ — **esa última frase quedó derogada el mismo día** por la fila «¿Se puede quitar la imagen sin poner otra?»: son **dos** los caminos que borran en Storage, y los dos comparten el mismo adaptador para que no haya dos sitios donde borrar el archivo equivocado |
| 2026-09-03 | ¿El bucket es público o privado? | **Público.** QC-26 pone la URL en un `<img>` y no pide nada más. **La consecuencia se acepta con los ojos abiertos:** la imagen de una fórmula queda visible para cualquiera que tenga el enlace, sin sesión, y eso **no se revierte** cambiando el bucket después, porque las URLs ya circularon. Se descartó el bucket privado con enlace firmado y temporal, que era la recomendación |
| 2026-09-03 | ¿Qué se guarda en la columna de la imagen? | **La ruta dentro del bucket** (`recetas/<uuid>.jpg`), no la URL completa. La URL se compone al leer, juntando la dirección del proyecto —que ya es variable de entorno— con esa ruta. Cambiar de proyecto o de bucket no obliga a migrar ninguna fila |
| 2026-09-03 | Límites de la imagen | **Hasta 5 MB**, y **solo JPEG, PNG o WebP**. Se valida por el **contenido** del archivo, no solo por su extensión. Se rechazan PDF, SVG y HEIC |
| 2026-09-03 | ¿Guardar una receta sin imagen falla? | **Nunca.** La imagen es opcional, como fijó **QC-24**, y esta ficha no lo endurece |
| 2026-09-03 | Librería nueva (regla 7 de `CLAUDE.md`) | **`@supabase/storage-js`, y solo ese sub-paquete.** No entra `@supabase/supabase-js`: sin cliente de datos en el repo, el anti-patrón que prohíbe `docs/checkpoints-proyecto.md > Datos y seguridad` —leer o escribir datos de negocio con Supabase en vez de por Prisma— es **estructuralmente imposible**, no una promesa que alguien tenga que recordar. Mismo criterio con el que **QC-19** instaló solo el diccionario y no `zxcvbn` entero. **Los cuatro checks PASAN**, verificados contra el registro de npm el 2026-09-03: sin `deprecated`; publicado el **2026-09-02**; **25.309.308** descargas semanales; licencia **MIT**. Aprobada por el humano al acotar; su fila en `docs/dependencias.md` la añade el leader en **F1.4** |
| 2026-09-03 | ¿Dónde vive la subida? | **Detrás de un puerto del módulo `recetas`**, con su adaptador driven. El caso de uso no conoce Supabase. Un doble en los tests hace que la suite no necesite red ni bucket |
| 2026-09-03 | Configuración del Storage | Esta ficha **la deja utilizable**: las variables que necesita, **declaradas y vacías** en `.env.example` y documentadas. Ningún secreto hardcodeado (`CHECKPOINTS.md > Configuracion`) |
| 2026-09-03 | Forma de la consulta | **Paginada, 10 por página por defecto, tope superior 25**, orden `name ASC`. **Reutiliza** el util de paginación de `lib/shared/` que extrajo **QC-20 D16/D22**; duplicarlo sería exactamente el error que ese util existe para evitar |
| 2026-09-03 | ¿Hace falta desempate en el orden? | **No, y no por olvido.** El nombre de la receta **sí es único** (**QC-24**), así que `name ASC` ya es un orden total y la paginación es estable sin él. Se aparta de **QC-20 D20**, donde el desempate por `id` era obligatorio precisamente porque el nombre del producto no es único |
| 2026-09-03 | ¿El listado trae las líneas de producto? | **No.** El listado devuelve la receta sin líneas; **el detalle de una receta sí las trae**. Diez recetas de veinte ingredientes son doscientas filas para pintar una tabla que no las muestra |
| 2026-09-03 | ¿El listado devuelve el nombre del autor? | **No: solo los ids** de `created_by` y `updated_by`. Resolver el nombre es del contrato público de `identity` y es alcance de **QC-26**. Heredado de **QC-20 D21**. Y un autor vacío significa **«no la creó una persona»**, no un dato perdido (**QC-24**) |
| 2026-09-03 | ¿Cómo llegan los productos al editar? | **La lista final completa, y el servidor concilia** qué línea es nueva, cuál cambió y cuál desapareció. No hay operaciones sueltas por línea: la línea no existe separada de su receta. Quitar un producto **borra la línea de verdad**, sin `deleted_at` (**QC-24 D5**) |
| 2026-09-03 | ¿Qué se rechaza antes de guardar? | Nombre vacío o solo espacios (se recortan los extremos antes de guardar); nombre de más de **120**; descripción de más de **500**; nombre repetido comparado **normalizado** (sin acentos, sin caracteres especiales, sin distinguir mayúsculas); **nombre que al normalizar queda vacío** —un `«---»` no puede llegar al índice único y anunciarse al usuario como «ya existe», heredado de **QC-20 D22**—; cantidad negativa o cero; unidad vacía; producto repetido dentro de la misma receta; producto inexistente; y unos pasos que no sean una lista de textos o que traigan algún texto vacío |
| 2026-09-03 | Topes de los pasos | **Hasta 50 pasos, 1.000 caracteres cada uno.** Es validación de aplicación: la columna sigue guardando el documento JSON tal cual (**QC-24 D10**). El tope no lo alcanza ninguna receta real, pero impide que alguien mande un documento de megabytes a una columna sin límite |
| 2026-09-03 | La unidad de la línea, ¿sigue siendo texto libre? | ~~**Sí, aquí sí.** No se adelanta el catálogo: **QC-32** ya está acotada para migrar `products.unit` y la unidad de la línea a FK, y **su ficha cuenta explícitamente con que esta las deja como texto**. Cuando QC-32 llegue, la validación «unidad vacía» de aquí se sustituye por «la unidad existe en el catálogo»~~ — **DEROGADA el 2026-09-03, el mismo día**: ver la fila «QC-32 llegó antes de tiempo» al final de esta tabla. La sustitución que esta decisión dejó escrita es exactamente la que hubo que aplicar |
| 2026-09-03 | ¿Se puede borrar un producto que alguna receta usa? | **Sí, sigue permitido**, y la receta conserva su línea. El borrado de producto es lógico (**QC-20 D5**), así que la fila sigue existiendo y la línea sigue apuntando al mismo producto (**QC-24**) |
| 2026-09-03 | Módulo, capas y borde | Módulo **`recetas`**. Mutaciones por **Server Action** en `adapters/driving/`, no Route Handler (`docs/architecture.md > Server Actions vs Route Handlers`). Validación de entrada con **zod** en el borde (`docs/conventions.md`). El producto se conoce **por el contrato público de `inventario`** (`@/lib/modules/inventario`), nunca por su tabla, su modelo de Prisma ni su repositorio (**QC-24 D1**, **QC-15**). Identificadores de la DB en **inglés** (**QC-4**) |
| 2026-09-03 | ¿De dónde sale el usuario en sesión? | De **QC-8 — sesión actual**, que ya es bloqueante de esta ficha. El *service* recibe el actor y su rol **por parámetro**; quien lo resuelve es el adaptador driving. Heredado de **QC-20 D17** |
| 2026-09-03 | E2E | **Diferido con motivo**: esta ficha no tiene pantalla, así que no hay flujo navegable que visitar. Lo decide **QC-26**. Mismo criterio que **QC-20 D4** y **QC-24** |

Las **tres últimas** las cerró el humano el mismo día, en F1.4, respondiendo a las preguntas 5, 6 y 7
que abrió `spec_author`. Valen exactamente igual que las anteriores: no se reabren. Las preguntas
correspondientes se dan por cerradas y bajan aquí.

| Fecha | Pregunta | Decisión |
| --- | --- | --- |
| 2026-09-03 | ¿Se puede quitar la imagen de una receta sin poner otra? (pregunta 5) | **Sí, y ese archivo SÍ se borra del bucket.** Se aparta de la posición por defecto del `design.md`, que proponía conservarlo. Consecuencia asumida: hay **dos** caminos que borran en Storage —reemplazar y quitar—, así que **los dos pasan por el mismo adaptador y comparten sus tests**; lo que se descartó es tener dos implementaciones del borrado, no tener dos caminos |
| 2026-09-03 | Si falla el borrado del archivo anterior al reemplazar, ¿falla la edición? (pregunta 6) | **No: la edición NO falla.** La receta ya está guardada y correcta; deshacerla por un archivo que ya no referencia nadie cambiaría un huérfano barato por una edición perdida cara. El fallo **se registra con contexto** y nunca se traga en un `catch` vacío (`docs/conventions.md`). Aplica igual al borrado de la pregunta 5 |
| 2026-09-03 | **QC-32 llegó antes de tiempo: ¿QC-25 se adapta o se cierra como está?** | **Se adapta en esta misma ficha.** QC-32 se mergeó en `dev` **mientras QC-25 se implementaba**, y allí `recipe_lines.unit` ya es `unit_id`, un UUID obligatorio con FK al catálogo del módulo `unidades`. La unidad de la línea pasa a ser **una referencia al catálogo**, validada por el **contrato público** `@/lib/modules/unidades` — nunca contra su tabla—, y la validación «unidad vacía» se sustituye por «la unidad existe en el catálogo» (**R50**, que deroga R15). QC-25 pasa a ser el **primer consumidor** de ese contrato, así que implementa y cablea el adaptador de `UnitCatalog` **dentro de `unidades`**, exactamente como ya hizo con `ProductCatalog` dentro de `inventario`. Se descartó cerrar QC-25 con el texto libre y dejar la adaptación a una ficha nueva: **el PR no compilaría contra `dev`**, así que esa ficha no sería una mejora futura sino un bloqueante inmediato. Lo que **no** cambia: la unidad sigue obligatoria, sigue sin derivarse de la del producto y sigue sin haber conversión |
| 2026-09-03 | Al editar una receta con una línea de un producto ya dado de baja, ¿se puede guardar? (pregunta 7) | **Sí: se admite la línea que ya estaba.** La existencia del producto se exige **solo para los que no estaban ya en la receta**, así que sigue siendo imposible **añadir** un producto inexistente o de baja, pero editar la descripción no obliga a mutilar la fórmula. Resuelve el choque real entre **R17** (el producto debe existir) y **R18** (la receta conserva la línea del producto de baja), que `ProductCatalog` provocaba al devolver solo productos vivos. Lo contrario habría convertido dar de baja un producto en una limpieza en cadena de todas las recetas que lo usan |

## Enmienda 2026-10-08 — pantallas autorizadas fuera de fórmulas (QC-180)

Nota bajo **R44**; no reescribe nada de lo anterior. La lista cerrada de pantallas que pueden
mencionar recetas fuera de la carpeta de fórmulas (`PANTALLA_DE_EJECUCION` en
`tests/unit/recetas/scope.test.ts`) se amplía con `app/(private)/pedidos/page.tsx`. El alta de
pedidos carga la primera página del catálogo de recetas para el selector (**QC-35 R31**); `897a4f91`
movió esa lectura de `OrderListSection` a la página. Se nombra el archivo exacto: cualquier otra
segunda pantalla de recetas sigue prohibida. Detalle en
[`specs/QC-180-rojos-heredados-de-alta-de-grupos/`](../QC-180-rojos-heredados-de-alta-de-grupos/).
