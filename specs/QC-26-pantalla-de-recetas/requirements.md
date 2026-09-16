# QC-26 — pantalla-de-recetas · requirements.md

> **Zona** `frontend` · **Complejidad** `high` · **depends_on** `QC-25` ·
> **Rama** `feature/QC-26-pantalla-de-recetas`
>
> **Alcance.** La pantalla del catálogo de recetas en **`/produccion/formulas`**, dentro del
> layout privado: la lista paginada, el alta y la edición **en página propia** —con sus líneas de
> producto, sus pasos ordenables y su imagen— y el borrado con confirmación. Solo la ve el
> Administrador, y esta ficha declara la **segunda regla ruta→rol del repo**. Las cinco
> operaciones de receta ya existen y las expone QC-25 como Server Actions. Incluye, **como
> excepción explícita a que esta ficha sea solo capa visual**, la única operación de solo lectura
> que falta en el módulo `unidades` para poder poblar el selector de unidad.
>
> **Lo que NO entra.** Crear, editar y borrar unidades: **QC-38 — CRUD de unidades**. Búsqueda y
> orden configurable: el backend no los soporta y meterlos sería reabrir QC-25, que ya está
> `done`; **no tienen ficha y esta acotación no la crea**. El nombre de quien creó o modificó una
> receta: el backend guarda ids, no nombres (QC-25). Y nada más de backend: esta ficha no abre
> `lib/modules/recetas/` salvo para consumir su contrato público.
>
> Sembrado por `/afinar-feature` el 2026-09-03. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

> **Glosario mínimo.** **Pantalla de recetas**: la lista del catálogo, servida en la URL que
> declara la constante de ruta de recetas. **Páginas de formulario**: las dos subrutas de alta y
> de edición que fija la decisión «página propia». **Layout privado**: el armazón de QC-11
> (sidebar + cabecera + `<main>`), que se hereda montado y ya incluye la región de avisos que
> montó QC-22. **Operaciones de receta**: las cinco Server Actions que QC-25 ya expone
> (`listRecipesAction`, `getRecipeAction`, `createRecipeAction`, `updateRecipeAction`,
> `deleteRecipeAction`). **Operación de productos**: `listProductsAction`, de QC-20.
> **Operación de unidades**: la única que esta ficha añade (decisión del 2026-09-03), de **solo
> lectura**. **Columnas de negocio**: los campos del resumen de receta salvo el identificador
> técnico y los ids de autoría, que la decisión del 2026-09-03 deja fuera.
>
> Los requisitos que hablan de **límites, formatos y esquemas** se refieren siempre a los que
> publica el contrato público del módulo consumido: esta ficha **no declara ninguna regla de
> negocio propia** y no re-especifica el backend de QC-25.

### Ubicación, rutas y protección

**R1** — El sistema DEBE exponer la lista del catálogo de recetas en la URL que declara la
constante de ruta de recetas, dentro del grupo de rutas privadas, de modo que se renderice
**envuelta por el layout privado existente** y sin declarar ningún armazón propio (no DEBE
declarar un `main` propio).

**R2** — El sistema DEBE ofrecer el alta y la edición **en páginas propias** que cuelgan de esa
misma URL como subrutas, y la de edición DEBE llevar en su URL el identificador de la receta que
se está editando, de modo que recargar el enlace o abrirlo en otra pestaña presente esa misma
receta en edición.

**R3** — La URL de la pantalla DEBE estar declarada en **una sola** constante exportada desde el
módulo de rutas compartidas —no desde el de navegación—, y todos sus consumidores —el ítem de la
barra lateral, la lista de prefijos privados, la regla ruta→rol y cualquier destino de navegación
de las tres pantallas— DEBEN derivarse de esa misma constante. El módulo de navegación DEBE seguir
exportando ese símbolo **por reexport de compatibilidad**, y NO DEBE volver a declararlo. Ningún
archivo de producción DEBE incrustar la URL como literal.

**R4** — Las tres pantallas DEBEN quedar cubiertas por la lista declarada de prefijos de ruta
privada, de modo que una petición sin sesión válida sea redirigida al login antes de renderizar
cualquiera de ellas.

**R5** — El ítem de la barra lateral que apunta a esa constante DEBE dejar de comportarse como
placeholder —DEBE resolver a una pantalla existente— y DEBE presentar la etiqueta del catálogo de
recetas, declarada como **constante exportada única** que comparten el ítem de navegación y el
encabezado de la pantalla; NO DEBE seguir presentando la etiqueta «Fórmulas».

**R6** — El sistema DEBE declarar una regla ruta→rol que restrinja la pantalla **y sus dos
subrutas de formulario** al rol Administrador. MIENTRAS la sesión tenga un rol distinto de
Administrador, el sistema DEBE redirigirla fuera sin renderizar el contenido; MIENTRAS tenga el
rol Administrador, DEBE permitir el acceso.

**R7** — Las tres pantallas NO DEBEN tomar ninguna decisión de autorización sobre los datos ni
repetir la que ya toman las operaciones del backend: toda lectura y toda escritura DEBEN pasar por
esas operaciones. SI una operación responde con un error de autorización, ENTONCES el sistema DEBE
presentar ese error y NO DEBE mostrar datos del catálogo.

### Lista de recetas

**R8** — La pantalla DEBE presentar las recetas en una lista paginada con las columnas de negocio
que entrega la operación de listado: nombre, descripción, número de pasos, imagen, fecha de
creación y fecha de actualización.

> **ENMIENDA DEL 2026-09-15 (QC-56, decisión humana).** La lista de recetas **monta la tabla
> compartida** (`components/shared/data-table`) en lugar de su tabla y su barra de paginación
> propias. Con ella:
>
> - **La descripción SALE de la lista**: la lista deja de presentar esa columna y la descripción se
>   ve al abrir la receta. La razón es que una descripción de hasta 500 caracteres ocupa una sola
>   línea y ensancha la tabla (QC-56, pregunta 2, cerrada con la decisión D14).
> - **Lo demás que R8 protegía sigue en pie**: la lista sigue paginada y sigue presentando nombre,
>   número de pasos, imagen, fecha de creación y fecha de actualización.
> - **Cambia de dueño**: las columnas exactas las fija ahora **QC-56 R2** —imagen, nombre, número
>   de pasos, fecha de creación, fecha de actualización y acciones—, y **QC-56 R7** afirma que las
>   que no están en la lista blanca (imagen, número de pasos y acciones) no ofrecen control de
>   orden. La celda de imagen sigue bajo R18, que conserva **QC-56 R5**.

**R9** — La lista NO DEBE mostrar el identificador de la receta ni el identificador o el nombre de
quien la creó o la modificó.

**R10** — La lista NO DEBE presentar las líneas de producto de cada receta y NO DEBE invocar la
operación de detalle para obtenerlas: pintar una página de la lista DEBE costar **una sola**
invocación de la operación de listado. En consecuencia, la lista NO DEBE presentar ninguna marca,
icono ni aviso que señale que una receta tiene líneas con el producto dado de baja: esa señal existe
**solo en el formulario** (R53, R54), y pintarla en la lista exigiría o un campo nuevo en el listado
del backend —feature ajena y ya `done`— o una consulta de detalle por fila, que es justo lo que este
requisito prohíbe.

**R11** — La pantalla DEBE ofrecer un selector de tamaño de página con exactamente dos opciones,
10 y 25, y DEBE usar 10 cuando no se indique ninguno. CUANDO el usuario cambie el tamaño de
página, el sistema DEBE recargar la lista con el nuevo tamaño.

**R12** — CUANDO existan más recetas de las que caben en una página, el sistema DEBE permitir
avanzar y retroceder de página e indicar la página actual y el total de páginas.

**R13** — SI los parámetros de paginación recibidos son inválidos, están fuera de rango o exceden
el tope soportado, ENTONCES el sistema DEBE acotarlos a valores válidos y presentar la lista, y NO
DEBE fallar ni mostrar un error.

**R14** — La pantalla NO DEBE ofrecer búsqueda de recetas ni control de ordenación configurable.

> **ENMIENDA DEL 2026-09-15 (QC-56, decisión humana).** Con la tabla compartida (ver la enmienda de
> R8):
>
> - **R14 se INVIERTE**: la pantalla **sí** ofrece orden por cabecera sobre `name`, `createdAt` y
>   `updatedAt`, búsqueda y filtro por rango de `createdAt`, exactamente lo que declara
>   `RECIPE_QUERYABLE` (QC-57). La lista se iguala así a productos, como `749d850` invirtió R13 de
>   QC-22. Todo se calcula en el servidor: cada gesto **navega** y la lista se vuelve a pedir con
>   esos parámetros, que viajan en la URL.
> - **Lo que R14 protegía sigue en pie y afirmado**: nada se ordena, filtra, busca ni recorta en el
>   navegador sobre la página ya descargada; las filas presentadas son exactamente las que devolvió
>   la operación de listado, y en su mismo orden.
> - **Cambia de dueño**: el orden es **QC-56 R6** (y R7 para las columnas que no ordenan), la
>   búsqueda **QC-56 R8**, el filtro de fecha **QC-56 R9**, y la protección de no calcular en el
>   navegador **QC-56 R10**. R13 de esta ficha se amplía al contrato de lista completo en QC-56 R13.

**R15** — MIENTRAS el catálogo no tenga ninguna receta, el sistema DEBE presentar un estado vacío
identificable que ofrezca la acción de crear la primera receta, en lugar de una lista sin filas.

**R16** — MIENTRAS la lista se está obteniendo, el sistema DEBE presentar un indicador de carga
identificable en lugar de la lista.

**R17** — SI la operación de listado responde con error, ENTONCES el sistema DEBE presentar un
estado de error identificable con el mensaje devuelto y una acción para reintentar, y NO DEBE
presentar una lista vacía como si el catálogo estuviera vacío.

**R18** — MIENTRAS una receta tenga imagen, el sistema DEBE presentarla usando **la dirección que
entrega la propia operación de consulta**, y NO DEBE componerla, derivarla de la ruta del archivo
ni construirla con ninguna dirección escrita en el código; MIENTRAS una receta no tenga imagen,
DEBE presentar un marcador y NO DEBE solicitar ninguna dirección vacía.

**R19** — MIENTRAS el ancho disponible no alcance para todas las columnas, el sistema DEBE resolver
el desbordamiento con **scroll horizontal contenido en la propia lista**, sin provocar scroll
horizontal del documento, y los controles de acción de cada fila DEBEN seguir siendo alcanzables.

### Alta y edición en página propia

**R20** — CUANDO el usuario active la acción de crear o la de editar una receta, el sistema DEBE
**navegar a la página de formulario correspondiente**, y NO DEBE abrir el formulario en un panel
lateral ni en un diálogo modal. CUANDO el formulario termine —por guardado o por cancelación—, el
sistema DEBE devolver al usuario a la lista.

**R21** — CUANDO se abra la página de edición de una receta, el sistema DEBE precargarla con los
valores actuales que entrega la operación de detalle —datos, líneas, pasos e imagen—, y DEBE
conservar y reenviar sin alterar las líneas cuyo producto ya no está disponible, sin obligar al
usuario a quitarlas. SI la receta no existe o está borrada, ENTONCES DEBE presentar un estado de
«no encontrada» identificable en lugar de un formulario vacío.

**R22** — CUANDO se guarde una edición, el sistema DEBE enviar **la lista final completa** de
líneas y de pasos en una sola invocación de la operación de edición, y NO DEBE invocar ninguna
operación por línea ni por paso: quitar una línea en la interfaz DEBE traducirse en que esa línea
no viaje en la lista enviada.

**R23** — SI el guardado se rechaza por validación o por cualquier otro error de la operación,
ENTONCES el sistema DEBE presentar el error **en línea** —junto al campo o a la línea cuando el
error identifique uno, y en una región de error del formulario cuando no—, DEBE permanecer en la
página de formulario y NO DEBE perder lo que el usuario había escrito.

**R24** — CUANDO una operación de alta, edición o borrado termine con éxito, el sistema DEBE llevar
al usuario a la lista, notificar el éxito mediante un aviso emergente (toast) y presentar la lista
ya actualizada, sin que el usuario tenga que recargar la pantalla.

**R25** — El sistema NO DEBE montar ninguna región de avisos emergentes propia: DEBE usar la única
que el layout privado ya monta, de modo que la zona privada siga teniendo **exactamente una**.

**R26** — El sistema DEBE validar la entrada antes de enviarla usando **los esquemas que publica el
contrato público del módulo de recetas**, y NO DEBE declarar reglas propias de longitud, de
cantidad máxima de pasos, de formato de cantidad ni de nombre duplicado.

### Líneas de producto

**R27** — El formulario DEBE permitir añadir y quitar líneas de producto, cada una con su producto,
su cantidad y su unidad, y DEBE permitir guardar una receta **sin ninguna línea**.

**R28** — El selector de producto DEBE permitir alcanzar cualquier producto existente aunque haya
más de los que caben en una consulta, pasando de página **dentro del propio selector** y pidiendo
al backend el mayor tamaño de página que soporta; NO DEBE filtrar ni buscar en el cliente sobre los
productos ya descargados.

> **Enmienda del 2026-09-07 (decisión humana).** Lo que R28 exige —alcanzar cualquier producto sin
> filtrar en cliente, con el mayor tamaño de página— NO cambia. Cambia CÓMO se pasa de página
> dentro del selector: ya no son los controles «Anterior»/«Siguiente» con su indicador, sino la
> **carga por scroll**, que anexa la página siguiente al llegar al final de la lista. El selector
> pasó a componerse con `components/ui/autocomplete.tsx` (primitivos de `@base-ui/react`, sin
> dependencia nueva) y el hook `hooks/use-async-paginated-options.ts`. Los `data-testid` `-prev`,
> `-next` y `-page-indicator` desaparecieron; el test de R28 y los dos helpers de E2E se
> reescribieron con el gesto nuevo.

**R29** — La cantidad de cada línea DEBE viajar a la operación como **cadena decimal** tal como la
capturó el formulario, y el sistema NO DEBE convertirla a número de coma flotante en ningún punto
del camino, ni siquiera de forma intermedia a través de un control que la reconvierta.

**R30** — La unidad de cada línea DEBE elegirse de entre las que entrega la operación de unidades y
DEBE viajar como **el identificador** de esa unidad; NO DEBE capturarse como texto libre. MIENTRAS
una unidad no declare símbolo, el selector DEBE presentar su nombre.

**R31** — El sistema NO DEBE permitir enviar una receta con dos líneas que apunten al mismo
producto ni con una cantidad que el esquema del contrato rechace: ENTONCES DEBE presentar el error
junto a la línea afectada y NO DEBE invocar la operación.

### Pasos

**R32** — El formulario DEBE permitir añadir, editar y quitar pasos conservando su orden, y DEBE
enviar la lista de pasos **en el orden en que se muestran**.

**R33** — El sistema DEBE permitir reordenar los pasos **arrastrándolos y soltándolos**.

**R34** — El sistema DEBE ofrecer un **equivalente por teclado** de esa reordenación: alcanzable
con el tabulador, operable sin ratón y con el mismo resultado que el arrastre, anunciando el cambio
de posición a la tecnología de asistencia. NO DEBE existir ninguna reordenación que solo el ratón
pueda ejecutar.

### Imagen

**R35** — CUANDO se guarda una edición, el sistema DEBE distinguir **tres** estados de la imagen y
NO DEBE colapsarlos: SI el usuario no tocó el campo, ENTONCES la operación DEBE recibir la imagen
**omitida**; SI eligió un archivo, ENTONCES DEBE recibir **ese archivo**; SI activó quitar la
imagen, ENTONCES DEBE recibir el valor **nulo explícito**.

**R36** — CUANDO se guarda un alta, el campo de imagen solo DEBE tener dos estados —ausente o
archivo nuevo—, y el sistema NO DEBE enviar el valor nulo explícito en el alta.

**R37** — CUANDO el usuario elija un archivo de imagen, el sistema DEBE presentar su vista previa
antes de enviarlo; MIENTRAS la operación de guardado esté en curso, DEBE presentar un estado de
envío identificable y DEBE impedir que se dispare un segundo envío.

**R38** — SI el archivo elegido supera el tamaño máximo o su formato no es de los aceptados —los
que publica el contrato público del módulo de recetas—, ENTONCES el sistema DEBE rechazarlo
**antes** de invocar la operación y DEBE presentar el error junto al campo de imagen.

### Borrado

**R39** — CUANDO el usuario active el borrado de una receta, el sistema DEBE pedir confirmación en
un diálogo que **nombre la receta** y advierta que la acción no se puede deshacer. MIENTRAS el
usuario no confirme, el sistema NO DEBE invocar la operación de borrado; CUANDO confirme, DEBE
invocarla y aplicar R24.

### Lectura del catálogo de unidades

**R40** — El sistema DEBE publicar **una** operación de solo lectura que devuelva las unidades del
catálogo con su identificador, su nombre y su símbolo, ordenadas de forma estable, y DEBE aplicar
un **límite superior declarado** al número de filas que pide al repositorio, sin ejecutar ninguna
consulta sin cota.

**R41** — Esa operación DEBE recibir el actor —su identificador y su rol— **como parámetro**,
resuelto por su adaptador driving y nunca leído desde el dominio; y SI llega sin actor, con rol
nulo, vacío, desconocido o distinto de Administrador, ENTONCES DEBE rechazarla **sin leer del
repositorio** (falla cerrado).

**R42** — El caso de uso de esa operación DEBE vivir en el dominio del módulo de unidades, con el
acceso a datos detrás de un puerto implementado en su adaptador driven y cableado **solo** en el
punto de composición; el dominio NO DEBE importar framework, Prisma, `lib/shared/` ni el punto de
composición, y el contrato público del módulo NO DEBE reexportar la Server Action.

**R43** — La pantalla DEBE obtener las unidades **únicamente** a través de esa operación publicada,
y NO DEBE consultar la tabla de unidades, importar el módulo por ruta profunda ni instanciar su
adaptador.

**R44** — Esta feature NO DEBE añadir, modificar ni eliminar ninguna operación de creación, edición
o borrado de unidades —son de QC-38—, NO DEBE modificar ningún archivo del módulo de recetas y NO
DEBE añadir, cambiar ni eliminar ninguna columna, índice ni migración de la base de datos.

### Dependencias, estructura y plataforma

**R45** — La única dependencia de terceros que esta feature DEBE incorporar es la librería de
arrastre aprobada por el humano el 2026-09-03, cuya fila del registro DEBE indicar **qué check
falló y por qué se aceptó**; el sistema NO DEBE incorporar ninguna otra entrada nueva en el
manifiesto de dependencias.

**R46** — Los componentes propios de cada ruta DEBEN vivir en la carpeta `components/` de esa ruta
y exponerse por su barrel; las páginas NO DEBEN importarlos por ruta profunda ni dejarlos sueltos
junto al archivo de página.

**R47** — Toda mutación DEBE realizarse mediante Server Actions ya publicadas por los módulos; el
sistema NO DEBE llamar a rutas API propias con `fetch` para leer ni para mutar.

**R48** — Las primitivas de interfaz que las pantallas necesiten DEBEN provenir de la librería de
componentes por su CLI; el sistema NO DEBE escribir a mano ni editar archivos de `components/ui/`.

**R49** — Los componentes de cliente DEBEN recibir por props los datos de sesión y los datos que
muestran; NO DEBEN importar el punto de composición, ni el cliente de base de datos, ni obtener
esos datos por su cuenta.

**R50** — Las tres pantallas DEBEN ser utilizables en viewport angosto y en viewport ancho: NO
DEBEN usar `100vh` como alto de pantalla, NO DEBEN depender de `:hover` como única vía para
descubrir o activar una acción, sus controles táctiles DEBEN medir al menos 44×44 px y sus campos
de formulario DEBEN tener un tamaño de fuente de al menos 16 px. No se DEBE declarar ninguna
excepción de escritorio.

**R51** — El sistema NO DEBE re-crear ni duplicar el layout privado, la barra lateral, la
navegación privada, la región de avisos, las primitivas ya instaladas ni las utilidades de test:
los hereda. Los únicos archivos heredados que esta feature puede modificar son los que exigen R3
(constante de ruta y su reexport), R4 (prefijos privados), R5 (ítem de navegación), R6 (reglas
ruta→rol) y R42 (cableado del punto de composición).

### Verificación de extremo a extremo

**R52** — El sistema DEBE quedar cubierto por una verificación de extremo a extremo que recorra
entrar con sesión de Administrador, llegar a la pantalla, dar de alta una receta con al menos una
línea de producto y un paso, y comprobar que aparece en la lista; **y** que un usuario con rol
distinto de Administrador no llega a verla. Esa verificación NO DEBE incluir la subida de una
imagen ni depender de que el almacenamiento externo esté disponible.

### Líneas con el producto dado de baja

Pertenecen al bloque de «Líneas de producto» (R27-R31); se numeran a continuación de R52 porque
salen de una decisión cerrada más tarde y **renumerar rompería la trazabilidad ya escrita**. La
prohibición complementaria —que la lista **no** lleve marca— vive en R10, ampliado.

**R53** — MIENTRAS el formulario presente una línea cuya operación de detalle no entregue nombre de
producto —el producto está dado de baja—, el sistema DEBE señalar **esa línea y solo esa** con un
marcador identificable por `data-testid` en su celda de producto, y NO DEBE señalar las líneas cuyo
producto sí está disponible. El marcador NO DEBE deshabilitar la línea, quitarla ni impedir el
guardado: R21 sigue mandando y la línea se reenvía intacta.

**R54** — MIENTRAS el formulario contenga **una o más** líneas con el producto dado de baja, el
sistema DEBE presentar, **al pie del bloque de líneas**, un aviso identificable por `data-testid`
que indique **cuántas** líneas están en esa situación; CUANDO el usuario quite o sustituya una de
esas líneas, el aviso DEBE reflejar el nuevo número, y CUANDO no quede ninguna, el aviso NO DEBE
estar presente. MIENTRAS ninguna línea esté en esa situación, el aviso NO DEBE estar presente.
Ni el marcador ni el aviso DEBEN identificarse por su texto: los tests afirman sobre `data-testid`
y sobre el número, nunca sobre el copy.

### Cobertura de las decisiones cerradas

Cada fila de `## Decisiones cerradas (no reabrir)`, en el orden en que está escrita, con los
requisitos que la hacen testeable. Ninguna queda sin `R<n>`.

| # | Decisión cerrada | Requisito(s) |
| --- | --- | --- |
| 1 | URL `/produccion/formulas`, etiqueta «Recetas» | R1, R3, R5 |
| 2 | La constante de ruta se muda a `routes.ts` con reexport, y entra en los prefijos privados | R3, R4 |
| 3 | Alta y edición en página propia, con la receta en la URL | R2, R20 |
| 4 | Se añade **solo** la lectura del catálogo de unidades | R30, R40, R41, R42, R43, R44 |
| 5 | Selector de producto paginado; nada de filtrar en el cliente | R28 |
| 6 | Pasos reordenables por arrastre, con equivalente por teclado obligatorio | R33, R34 |
| 7 | `dnd-kit` entra como **excepción** aprobada, con su check fallado escrito | R45 |
| 8 | E2E del camino completo y del rechazo por rol, sin subida de imagen | R52 |
| 9 | Protección de la ruta: prefijo privado + regla ruta→rol | R4, R6 |
| 10 | La autorización sobre los datos la aporta el service, no la ruta | R7 |
| 11 | Tamaño de página 10 y 25 | R11, R13 |
| 12 | Borrado con confirmación nombrando la receta, irreversible para el usuario | R39 |
| 13 | Toast de éxito, error en línea, y el `<Toaster />` **ya montado** no se duplica | R23, R24, R25 |
| 14 | No se muestra quién creó o modificó | R9 |
| 15 | Lo heredado del backend y no re-decidido | R10 (listado sin líneas), R21 (el detalle sí), R22 (lista final completa), R18 (la URL se compone al leer), R35 (quitar borra el archivo), R30 (unidad por referencia), R29 (cantidad como cadena) |
| 16 | Route group, componentes con barrel, mutaciones por Server Action, shadcn por CLI | R1, R46, R47, R48 |
| 17 | Sesión por props, rutas en constantes, asserts sobre roles/testid/constantes | R3, R49 |
| 18 | Multiplataforma sin excepción, con el arrastre y el scroll como puntos calientes | R19, R34, R50 |
| 19 | Base heredada: no se re-crea | R51 |
| 20 | La lectura del catálogo de unidades es **solo de Administrador** (pregunta 4) | R41 |
| 21 | Marcador en la celda **más** aviso al pie del bloque de líneas, **solo en el formulario**; la lista no lleva marca (pregunta 5) | R53 (marcador), R54 (aviso), R10 (la lista no lo lleva) |

Requisitos que no salen de una fila de la tabla, y de dónde salen: **R8**, **R12**, **R15**,
**R16**, **R17**, **R27** y **R32** del propio Alcance —la lista paginada, sus tres estados, las
líneas y los pasos del formulario—; **R14** de «Lo que NO entra» (búsqueda y orden configurable);
**R26** y **R31** de `docs/architecture.md > Dependencias de terceros` y de la regla de no
reimplementar lo que el contrato ya publica; **R36** del esquema de alta que QC-25 dejó con dos
estados; **R37** de la descripción de la ficha en el board («el estado de subida de la imagen y su
vista previa»); **R38** de los límites que QC-25 publica en su contrato.

## Preguntas abiertas

No se rellenan con supuestos (regla 6 de `CLAUDE.md`). Ninguna bloquea la pantalla.

1. **¿«Fórmulas» y «Recetas» acabarán siendo cosas distintas?** Hoy se decide que son lo mismo y
   esta pantalla ocupa el ítem del sidebar. Si algún día la fórmula pasa a ser *la versión
   concreta con la que se produjo un lote*, esta pantalla tendrá que ceder ese ítem. **Hoy no hay
   ficha de lotes que lo obligue**, y el ítem «Lotes» del sidebar sigue siendo placeholder.
2. **La búsqueda seguirá faltando mientras el backend no la soporte.** Ni recetas ni productos se
   pueden buscar: solo paginar. Con catálogos pequeños el selector paginado funciona; con cientos
   de productos se vuelve incómodo. Es **la misma deuda que dejó QC-22** y sigue sin ficha.
3. **`dnd-kit` no se publica desde diciembre de 2024.** Entra como excepción aprobada (ver la
   tabla), pero el riesgo que el check 2 vigila es real: es una librería que toca eventos de
   puntero y accesibilidad, y una versión de React que rompa algo la encontraría sin mantenedor
   activo. Si eso pasa, la salida ya está identificada:
   `@atlaskit/pragmatic-drag-and-drop`, que hoy pasa los cuatro checks.

### Añadidas por `spec_author` en F1.2 — CERRADAS por el humano el 2026-09-03

Dos huecos que las decisiones cerradas no cubrían. **Ninguna reabría nada**: eran casos que no se
preguntaron. **El humano las cerró el 2026-09-03 en F1.4** y sus decisiones son las **dos últimas
filas** de `## Decisiones cerradas (no reabrir)`; ahí está lo que vale. Se conservan aquí con su
enunciado porque explican por qué había que preguntarlas — y la 5 documenta un límite del backend
que condicionó la respuesta.

4. **¿Quién puede leer el catálogo de unidades?** La decisión del 2026-09-03 añade la lectura, pero
   no dice qué rol la puede invocar, y una Server Action es invocable directamente aunque la regla
   ruta→rol proteja la pantalla. **R41 la cierra por el lado seguro** —solo Administrador, igual que
   las cinco operaciones de recetas (QC-25 D1) y que las nueve de inventario (QC-20 D2)—, que es lo
   único que no puede romper esta ficha: la pantalla ya es solo de Administrador. **Ensanchar
   después es barato; una fuga no se deshace.** Si QC-38 o una pantalla de Operador necesitan leer
   unidades con otro rol, es esa ficha la que lo decide y R41 se relaja entonces, no ahora.
5. **¿Cómo se presenta la línea cuyo producto está dado de baja?** QC-25 (R18, R45) garantiza que la
   receta conserva esa línea y que la edición la puede reenviar, y el detalle devuelve su nombre de
   producto **vacío**. R21 exige conservarla y reenviarla intacta —eso sí es derivable—, pero **qué
   se le enseña al usuario en esa celda** no lo fijaba ninguna decisión. **Cerrada**: marcador en la
   celda (**R53**) más aviso al pie del bloque de líneas (**R54**), los dos por `data-testid` y sin
   depender del copy; y la lista **no** lleva marca (**R10**, ampliado), porque el listado de QC-25
   no devuelve las líneas.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
| --- | --- | --- |
| 2026-09-03 | URL de la pantalla | **`/produccion/formulas`**, el ítem placeholder que QC-11 dejó apuntando a 404 (D2). Deja de ser placeholder, y **su etiqueta pasa de «Fórmulas» a «Recetas»**: una receta de un producto químico *es* su fórmula, y el board llamó **Recetas** a la épica, así que el menú habla el mismo idioma que el resto del sistema. **No se inventa una URL nueva**, exactamente como hizo **QC-22** con `/inventario` |
| 2026-09-03 | ¿Dónde vive la constante de ruta? | **En un solo sitio y reutilizada.** `FORMULAS_ROUTE` vive hoy en `lib/shared/navigation/private-nav.ts` como placeholder; al volverse real la necesitan **el middleware y la regla ruta→rol**, que **no pueden depender de la navegación** —arrastra etiquetas, iconos y agrupación de UI—. Se mueve a `lib/shared/routes.ts` **con reexport de compatibilidad**, que es literalmente lo que QC-22 hizo con `INVENTORY_ROUTE` y dejó escrito allí. Y hay que añadirla a `PRIVATE_ROUTE_PREFIXES` |
| 2026-09-03 | Alta y edición: ¿panel lateral o página? | **Página propia**, y se aparta de **QC-22** (que usó un `sheet`) **por tamaño, no por gusto**: el formulario tiene cuatro bloques —datos, líneas de producto, pasos e imagen— más un reordenable por arrastre, y eso en una columna estrecha es incómodo en escritorio e inusable en móvil. Además la URL pasa a identificar qué receta se está editando, así que el enlace se puede compartir |
| 2026-09-03 | El selector de unidad no tiene de dónde leer | **Esta ficha añade la lectura del catálogo de unidades, y SOLO la lectura.** QC-32 creó la tabla `units` y sembró cuatro filas (mililitro, litro, gramo, kilogramo) pero **no expuso ninguna forma de consultarlas**, y sin eso **ninguna línea de receta se puede guardar**: la pantalla entera quedaría muerta. Es backend dentro de una ficha `frontend`, **a conciencia y con precedente**: QC-22 se trajo el alta de presentaciones por el mismo motivo. **Crear, editar y borrar unidades sigue siendo de QC-38** y no se toca |
| 2026-09-03 | ¿Cómo se elige el producto de una línea? | **Selector paginado, con las páginas que el backend ya da** (25 por página, que es el tope de `MAX_PAGE_SIZE`), pudiendo pasar de página dentro del propio desplegable. **Se descartó filtrar en el cliente**: solo encontraría lo ya descargado, de modo que un producto de la página 4 no aparecería ni escribiendo su nombre exacto — es la mentira que **QC-22 rechazó por escrito** |
| 2026-09-03 | ¿Cómo se reordenan los pasos? | **Arrastrando y soltando**, con **equivalente por teclado obligatorio**. No es opcional: arrastrar no es alcanzable sin ratón, y la regla multiplataforma de `docs/architecture.md` prohíbe que algo dependa solo del mouse. Se descartó «arrastrar ahora, teclado después», que habría dejado la pantalla inutilizable sin ratón y una deuda de accesibilidad sin ficha |
| 2026-09-03 | Librería nueva (regla 7 de `CLAUDE.md`) | **`dnd-kit` entra como `excepcion`, NO como `aprobada`.** **Falla el check 2 — release en los últimos 12 meses**: `@dnd-kit/core` publicó por última vez el **2024-12-05** (21 meses) y `@dnd-kit/utilities` el **2023-11-06** (34 meses). **Pasa los otros tres**: sin `deprecated`, licencia **MIT**, **24.862.894** descargas semanales. Se ofreció **`@atlaskit/pragmatic-drag-and-drop`**, que **sí pasa los cuatro** (Apache-2.0, publicada el 2026-08-29, 1.343.967 descargas/semana), y el humano prefirió dnd-kit por su API de listas ordenables. **Aprobado explícitamente el 2026-09-03**; su fila en `docs/dependencias.md` **debe decir qué check falló y por qué se aceptó**, sin lo cual la fila no vale |
| 2026-09-03 | ¿E2E? | **Sí, el camino completo**: login → la pantalla → alta con una línea de producto y un paso → la receta aparece en la lista, **más el rechazo de un no-Administrador**. **Sin la subida de imagen**: exigiría un bucket real y red, y el gate corre sin red a propósito — convertiría el E2E en una prueba de infraestructura ajena. Cierra el diferimiento que **QC-25** dejó apuntando aquí |
| 2026-09-03 | Protección de la ruta | **Entra en esta ficha**, con su regla ruta→rol y su test. Es la **segunda** del repo, tras la que declaró QC-22. El guard `tests/guards/guard-rutas-privadas-cubiertas.test.ts` **pone el gate en rojo** si aparece una pantalla bajo `app/(private)/` sin prefijo que la cubra, así que no es opcional |
| 2026-09-03 | Autorización sobre los datos | **No la aporta la regla ruta→rol**, y esto ya lo advirtió QC-9 (R29): que una regla deje pasar no autoriza nada. Los cinco casos de uso de `recetas` ya llaman a `requireAdmin` como primera línea (QC-25). La pantalla **no repite la decisión ni la sustituye** |
| 2026-09-03 | Tamaño de página | **Selector de 10 y 25**, heredado de **QC-22**. Sin trabajo de backend: en `recetas` el defecto es 10, el tope 25, y el util de paginación **acota** por encima en vez de rechazar |
| 2026-09-03 | Borrado | **Con diálogo de confirmación nombrando la receta.** En la base es lógico (`deletedAt`), pero **el backend no expone forma de restaurar**: para el usuario es irreversible y se trata como tal. Heredado de **QC-22** |
| 2026-09-03 | Aviso de éxito y de error | **Toast para el éxito, error en línea junto al campo.** El `<Toaster />` **ya lo montó QC-22** en el layout privado, así que aquí **solo se usa**: no se monta otro |
| 2026-09-03 | ¿Se muestra quién creó o modificó la receta? | **No.** QC-25 devuelve **ids**, no nombres, y resolverlos exigiría consultar el contrato de `identity` — trabajo que la ficha no pide. Heredado de **QC-22**, misma decisión y mismo motivo |
| 2026-09-03 | Lo que se hereda del backend y no se re-decide | El **listado no trae las líneas** y el detalle sí; la edición manda **la lista final completa** y el servidor concilia; la imagen se guarda como **ruta** y la URL pública se compone al leer; **quitar la imagen borra el archivo** y el fallo de ese borrado **no revierte** la edición; la unidad es **referencia al catálogo**, no texto libre; la cantidad viaja **como cadena decimal**, nunca como número de coma flotante |
| 2026-09-03 | Route group, componentes, mutaciones y shadcn | **Heredado sin reabrir**: `app/(private)/` (QC-11 D1); componentes de ruta en `<ruta>/components/` con barrel `index.ts` (QC-12); mutaciones por **Server Action**, nunca `fetch` a API propia (QC-11); primitivas de **shadcn/ui por CLI**, ninguna escrita a mano en `components/ui/` — y si hiciera falta otra **librería**, el `frontend_dev` **para y la propone** (regla 7) |
| 2026-09-03 | Sesión, rutas y asserts | **Datos de sesión por props**, nunca fetcheados por el componente privado (`CHECKPOINTS.md > Permisos`). Rutas siempre en **constantes exportadas**, nunca literales (QC-11 R13). Los tests afirman sobre **roles ARIA, `data-testid` y constantes**, nunca sobre literales de copy |
| 2026-09-03 | Multiplataforma | Se valida en **angosto y ancho** con el helper `tests/helpers/viewport.ts` de QC-11, y **no se declara ninguna excepción de escritorio**. Aplica con fuerza a dos sitios de esta ficha: el **arrastre de pasos**, que necesita su equivalente por teclado, y cualquier **scroll horizontal**, que va contenido en su tabla y **nunca en el `body`** |
| 2026-09-03 | Base heredada | **shadcn/ui, Vitest, Playwright, el layout privado y el sidebar están montados y no se re-crean.** El choque entre las features 4 y 10 ya ocurrió una vez en este repo; la T0 de `specs/11-*/tasks.md` existe para que no se repita |
| 2026-09-03 | ¿Quién puede invocar la lectura del catálogo de unidades? (pregunta 4) | **Solo Administrador**, confirmando el lado seguro que ya había tomado el spec. El motivo pesa más que la simetría: **una Server Action es invocable directamente aunque la regla ruta→rol proteja la pantalla**, así que el rol se comprueba en la operación, no en la ruta. Es coherente con las cinco operaciones de recetas (QC-25) y las nueve de inventario (QC-20). **Ensanchar después es barato; una fuga no se deshace**: si QC-38 o una pantalla de Operador necesitan leer unidades con otro rol, lo decide esa ficha |
| 2026-09-03 | ¿Cómo se presenta la línea cuyo producto está dado de baja? (pregunta 5) | **Marcador identificable en la celda MÁS un aviso al pie del bloque de líneas**, y **solo en el formulario**: la lista del catálogo NO lleva marca. Se consideró marcarla también en la lista y **se descartó por una razón concreta, no por gusto**: el listado de QC-25 **no devuelve las líneas** por decisión propia, así que la marca exigiría un campo nuevo en una feature ya `done` o 25 consultas de detalle por página —que romperían R10—. El aviso vive donde el usuario puede actuar: editando. El marcador y el aviso se identifican por `data-testid`, **sin depender del copy** |
