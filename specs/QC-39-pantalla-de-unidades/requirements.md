# QC-39 — pantalla-de-unidades · requirements.md

> **Zona** `frontend` · **Complejidad** `medium` · **depends_on** QC-38 · **Rama**
> `feature/QC-39-pantalla-de-unidades`
>
> **Alcance.** El catálogo de unidades de medida en **`configuracion/unidades`**, añadiendo su ítem
> a la sección **Configuración** que **QC-45 ya creó**: la lista con búsqueda y orden por nombre, el
> alta y la edición en panel lateral, y el borrado con confirmación. Las tres operaciones de
> escritura **ya existen** como Server Actions de QC-38. **Esta ficha amplía además lo que devuelve
> la consulta** —la unidad de la que deriva, el factor y si es de sistema—, que hoy no viaja y sin
> lo cual la lista no puede pintar lo que se le pide.
>
> **Lo que NO entra.** Los casos de uso de escritura → **QC-38**, ya construidos: esta ficha los
> consume y no los reescribe. El esquema, la equivalencia y el ámbito por empresa → **QC-76**. La
> sección Configuración y el mecanismo de menú por permisos → **QC-45** y **QC-75**. Migrar las
> listas de productos y recetas a la tabla compartida → **QC-56**. Estrenar la **conversión** entre
> unidades en inventario, recetas o pedidos → **la ficha que se lo plantee**: aquí la unidad sigue
> siendo anotativa y la equivalencia solo se **muestra**.
>
> *Sembrado por `/afinar-feature` el 2026-09-08. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.*

## Requisitos (EARS)

> **Glosario mínimo.** **Pantalla de unidades**: la página que esta ficha crea, servida en la URL
> que declara su constante de ruta. **Layout privado**: el armazón de QC-11 (sidebar + cabecera +
> `<main>` + `<Toaster />`) que envuelve todo `app/(private)/`; se hereda montado. **Sección
> Configuración**: la sección de la navegación privada que QC-45 ya creó y que hoy tiene un solo
> ítem; se hereda creada. **Tabla compartida**: `components/shared/data-table`, la de QC-55,
> consumida por su barrel público. **Panel lateral**: el `sheet` donde ocurren el alta y la
> edición. **Operaciones de escritura**: las tres Server Actions que QC-38 ya expone
> (`createUnitAction`, `updateUnitAction`, `deleteUnitAction`). **Operación de consulta**: la
> Server Action de lectura del catálogo (`listUnitsAction`), que esta ficha amplía. **Vista de
> unidad**: lo que la operación de consulta devuelve por cada unidad, hoy identificador, nombre y
> símbolo. **Unidad base**: la que no deriva de ninguna otra. **Unidad derivada**: la que declara
> una unidad de la que deriva y un factor. **Equivalencia**: la pareja «unidad de la que deriva» +
> «factor». **Unidad de sistema**: la que no pertenece a ninguna empresa. **Parámetros de lista**:
> página, tamaño de página, orden y término de búsqueda.

### Contrato de lectura del módulo (lo único que sale de `app/`)

**R1** — La vista de unidad DEBE incluir, además de identificador, nombre y símbolo: **el
identificador de la unidad de la que deriva**, **el factor** y **si la unidad es de sistema**.
El factor DEBE viajar como **texto decimal** y NUNCA como número de coma flotante. MIENTRAS la
unidad sea base, la unidad de la que deriva y el factor DEBEN venir **ambos ausentes**; MIENTRAS
sea derivada, DEBEN venir **los dos**.

**R2** — El ámbito DEBE viajar **derivado**, como «es de sistema» o su equivalente booleano. El
sistema NO DEBE exponer a la interfaz el identificador de empresa de una unidad, ni ningún dato
que permita distinguir a qué empresa pertenece.

**R3** — La ampliación de R1 DEBE quedar **contenida en el listado**. El sistema NO DEBE cambiar
el tipo ni la proyección con los que otros módulos resuelven identificadores conocidos de unidad
(`UnitCatalog.findRefs`), y NO DEBE añadir, quitar ni modificar ningún caso de uso, puerto de
escritura, esquema de entrada, error de dominio, comprobación de permiso ni migración del módulo
`unidades`.

**R4** — Los consumidores que hoy piden el catálogo completo —el selector de unidad del formulario
de recetas y el del detalle de proveedor— DEBEN seguir compilando **sin cambios** y DEBEN seguir
recibiendo el catálogo completo, sin tener que estrechar ninguna unión de tipos ni descartar
campos.

**R5** — La operación de consulta DEBE aceptar los parámetros de lista. CUANDO se la invoque con
página o tamaño de página, DEBE devolver una página con su total y su total de páginas; MIENTRAS
se la invoque sin ningún parámetro, DEBE devolver el catálogo completo, exactamente como hoy.
Aceptar parámetros NO DEBE requerir lógica nueva de consulta: la validación, el saneado, el orden,
la búsqueda, el acotado y el ámbito por empresa ya existen y NO DEBEN reescribirse.

**R6** — El sistema NO DEBE ampliar la lista blanca de consulta del catálogo: NO DEBE declarar
ningún filtro, ni añadir un campo ordenable, ni cambiar el orden por defecto, ni el desempate
estable, ni el tope del tamaño de página, ni el conjunto devuelto —las unidades de la empresa del
actor más las de sistema, nunca las de otra empresa—.

### Ubicación, ruta y navegación

**R7** — El sistema DEBE exponer la pantalla de unidades en la URL que declara su constante de
ruta, dentro del grupo de rutas privadas, de modo que se renderice **envuelta por el layout
privado existente** y sin declarar armazón propio: NO DEBE declarar un `main`, ni una barra
lateral, ni una cabecera, ni una región de avisos propias.

**R8** — La URL de la pantalla DEBE estar declarada en **una sola** constante exportada, y todo
consumidor —el ítem de navegación, la lista de prefijos privados y cualquier destino de navegación
de la propia pantalla— DEBE derivarse de esa misma constante. Ningún archivo de producto DEBE
incrustar la URL como literal.

**R9** — El sistema DEBE añadir a la sección Configuración **exactamente un** ítem nuevo, el de
unidades, apuntando a la constante de R8. NO DEBE crear una segunda sección Configuración, NO DEBE
renombrarla, NO DEBE alterar ni reordenar el ítem de presentaciones que ya vive en ella, y NO DEBE
modificar el mecanismo de filtrado del menú por permisos ni el componente de navegación.

**R10** — El ítem de unidades DEBE declarar un permiso que esté **entre los que exige la pantalla**
(R11), derivado de la misma fuente y no repetido como literal. MIENTRAS la sesión no incluya ese
permiso, el sistema NO DEBE emitir el ítem en el HTML servido —ni etiqueta, ni destino, ni
identificador de test—; MIENTRAS lo incluya, DEBE emitirlo. La decisión DEBE tomarse **en el
servidor** a partir de los datos de sesión que el layout privado ya obtiene, sin añadir ninguna
consulta y sin ocultar nada con estilos.

**R11** — El sistema DEBE mantener una comprobación que falle SI algún rol sembrado recibe
**exactamente uno** de los dos permisos `unidades.consultar` y `unidades.modificar`, porque ese rol
vería el enlace del ítem (R10) y recibiría 404 al pulsarlo (R12).

### Protección y autorización

**R12** — La pantalla DEBE exigir **los dos** permisos, `unidades.consultar` y
`unidades.modificar`, **antes** de resolver sus parámetros de lista y antes de renderizar nada. SI
la petición no tiene sesión válida, ENTONCES el sistema DEBE redirigirla al login. SI la sesión es
válida pero le falta **cualquiera** de los dos, ENTONCES el sistema DEBE responder **404**,
indistinguible de una ruta que no existe —sin nombrar el módulo, el permiso ni la existencia de la
pantalla—, renderizado **dentro del layout privado**, y NO DEBE redirigir a otra pantalla ni
presentar ningún dato del catálogo. MIENTRAS la sesión incluya los dos, DEBE permitir el acceso.

**R13** — La URL de la pantalla DEBE quedar cubierta por la lista declarada de prefijos de ruta
privada, de modo que una petición sin sesión válida sea rechazada antes de renderizarla. Esa
cobertura garantiza **sesión, no autorización**, y NO DEBE tomarse como el control que decide quién
puede ver la pantalla, que es R12. Ambas garantías DEBEN existir a la vez; ninguna sustituye a la
otra.

**R14** — La pantalla NO DEBE tomar ninguna decisión de autorización sobre los datos ni repetir la
que ya toman las operaciones del módulo: toda lectura y toda escritura DEBEN pasar por esas
operaciones. SI una operación responde con un error de autorización, ENTONCES el sistema DEBE
presentar ese error y NO DEBE mostrar ningún dato del catálogo.

### Lista de unidades

**R15** — La lista DEBE presentarse con la **tabla de datos compartida** consumida por su barrel
público. El sistema NO DEBE declarar una tabla propia, ni una barra de paginación propia, ni copiar
el esqueleto de lista de ninguna otra pantalla.

**R16** — La tabla DEBE presentar exactamente **cuatro columnas**: nombre, símbolo, equivalencia y
las acciones de fila. NO DEBE presentar una columna de ámbito, ni el identificador técnico, ni el
identificador de la unidad de la que deriva, ni el factor suelto, ni las marcas de tiempo, ni
ningún dato de autoría.

**R17** — La columna de equivalencia DEBE presentar una **frase ya armada** con la forma «1
\<unidad\> = \<factor\> \<unidad de la que deriva\>». MIENTRAS la unidad sea base, DEBE presentar
un guion. El factor DEBE presentarse como texto decimal **sin ceros de relleno a la derecha**, y
cada unidad DEBE nombrarse por su símbolo o, SI no tiene símbolo, por su nombre. SI la unidad de la
que deriva no se puede resolver, ENTONCES la celda DEBE presentar un marcador neutro y NO DEBE
fallar ni dejar la fila sin pintar.

**R18** — La pantalla DEBE ofrecer búsqueda **solo por nombre**, normalizado —sin acentos y sin
distinguir mayúsculas—. CUANDO el usuario cambie el término, el sistema DEBE volver a pedir la
lista al servidor **sobre el conjunto entero** y NO DEBE filtrar en el cliente sobre la página
visible. El buscador NO DEBE ofrecerse como búsqueda por símbolo ni encontrar unidades por él.

**R19** — Las columnas de nombre, símbolo y —si se presentara— fecha de creación DEBEN poder
ordenarse ascendente y descendente; **ninguna otra columna DEBE ser ordenable**, y en particular
NO DEBEN serlo la de equivalencia ni la de acciones. CUANDO el usuario cambie el orden, el sistema
DEBE volver a pedir la lista al servidor con ese orden y NO DEBE reordenar en el cliente.

**R20** — La pantalla NO DEBE ofrecer ningún filtro sobre la lista.

**R21** — La pantalla DEBE ofrecer un selector de tamaño de página con exactamente dos opciones,
10 y 25, y DEBE usar 10 cuando no se indique ninguno. CUANDO el usuario cambie el tamaño, el
sistema DEBE recargar la lista con el nuevo tamaño.

**R22** — CUANDO existan más unidades de las que caben en una página, el sistema DEBE permitir
avanzar y retroceder de página e indicar la página actual y el total de páginas.

**R23** — SI los parámetros de lista recibidos son inválidos, están fuera de rango, exceden el tope
soportado o nombran un campo que el catálogo no admite, ENTONCES el sistema DEBE acotarlos a
valores válidos y presentar la lista, y NO DEBE fallar ni mostrar un error.

**R24** — MIENTRAS la consulta no devuelva ninguna unidad, el sistema DEBE presentar un estado
vacío identificable de **«la búsqueda no encontró nada»**, y NO DEBE ofrecer «crear la primera».
SI había término de búsqueda, ENTONCES el estado vacío DEBE ofrecer limpiarlo; SI la página pedida
era mayor que el total, ENTONCES DEBE ofrecer volver a la primera página.

**R25** — MIENTRAS la lista se está obteniendo, el sistema DEBE presentar un indicador de carga
identificable en lugar de la tabla.

**R26** — SI la operación de consulta responde con error, ENTONCES el sistema DEBE presentar un
estado de error identificable con el mensaje devuelto y una acción para reintentar, y NO DEBE
presentar una tabla vacía como si el catálogo estuviera vacío.

**R27** — MIENTRAS el ancho disponible no alcance para las cuatro columnas —la de equivalencia es
la que más pide—, el sistema DEBE resolver el desbordamiento con **scroll horizontal contenido en
la propia tabla**, sin provocar scroll horizontal del documento, y las acciones de fila DEBEN
seguir siendo alcanzables.

### Acciones de fila

**R28** — MIENTRAS la unidad **no** sea de sistema, su fila DEBE ofrecer las acciones de **editar**
y **borrar**, ambas presentes en el DOM y visibles desde el primer render, cada una con nombre
accesible que identifique la unidad sobre la que actúa.

**R29** — MIENTRAS la unidad sea de sistema, la celda de acciones de su fila DEBE quedar **vacía**:
el sistema NO DEBE emitir botones, ni botones deshabilitados, ni etiqueta, ni distintivo junto al
nombre, ni explicación alguna de por qué esa fila no ofrece acciones.

**R30** — Ocultar esas acciones es comodidad de la interfaz y NO es el control: la pantalla NO DEBE
repetir la comprobación de «unidad de sistema». SI una operación de escritura se rechazara por ese
motivo, ENTONCES el sistema DEBE presentar el error devuelto igual que cualquier otro (R37, R42).

**R31** — La columna de acciones DEBE declararse con el contrato de columnas que la tabla
compartida ya publica, como columna normal no fijable. El sistema NO DEBE añadir a la tabla
compartida ninguna propiedad ni mecanismo nuevo para pintar acciones de fila, y NO DEBE modificar
los archivos de `components/shared/data-table/`.

### Alta y edición

**R32** — CUANDO el usuario active la acción de crear o la de editar una unidad, el sistema DEBE
abrir el formulario en un **panel lateral** sobre la lista, NO DEBE navegar a otra URL de pantalla
completa y NO DEBE usar un diálogo modal centrado. CUANDO el panel se cierre —por guardado o por
cancelación—, el sistema DEBE devolver al usuario a la lista **con los mismos parámetros de lista**
que tenía antes de abrirlo.

**R33** — El formulario DEBE capturar **exactamente cuatro** campos: nombre, símbolo, unidad de la
que deriva y factor. NO DEBE capturar ningún otro campo, y en particular NO DEBE capturar la
empresa ni el ámbito.

**R34** — El formulario DEBE distinguir **campo ausente** de **campo vacío** al enviar: MIENTRAS el
usuario no declare símbolo, el envío NO DEBE incluir la clave del símbolo; MIENTRAS el usuario no
declare unidad de la que deriva, el envío NO DEBE incluir **ninguna** de las dos claves de la
equivalencia. El sistema NO DEBE enviar nunca una cadena vacía en esas tres claves.

**R35** — CUANDO el usuario abra el formulario de edición de una unidad, el sistema DEBE
precargarlo con los **cuatro** valores actuales de esa unidad y enviar el **reemplazo completo** de
los cuatro mediante la operación de edición, nunca un envío parcial.

**R36** — El selector de «unidad de la que deriva» DEBE ofrecer **solo unidades base** del ámbito
visible, DEBE ofrecer también la opción de **no derivar de ninguna**, y NO DEBE ofrecer unidades
derivadas ni la propia unidad que se está editando. El sistema NO DEBE validar por su cuenta la
derivación: DEBE ofrecerla bien y dejar que el error de dominio mande.

**R37** — SI el guardado se rechaza, ENTONCES el sistema DEBE decidir qué pintar por el **código**
estable del error y nunca por su texto; DEBE presentar el error **en línea junto al campo** cuando
el código identifique uno —nombre duplicado junto al nombre, símbolo duplicado junto al símbolo,
derivación inválida junto al selector de la unidad de la que deriva— y en una región de error del
formulario cuando no lo identifique; y NO DEBE cerrar el panel ni perder lo escrito.

**R38** — CUANDO una operación de alta, edición o borrado termine con éxito, el sistema DEBE cerrar
el panel o el diálogo abierto, notificar el éxito mediante un aviso emergente (toast) y actualizar
la lista para que refleje el cambio sin que el usuario tenga que recargar la pantalla y sin perder
los parámetros de lista vigentes.

**R39** — El sistema DEBE emitir sus avisos emergentes sobre la región que el layout privado ya
monta, y NO DEBE montar una segunda región de avisos: en la zona privada DEBE seguir habiendo
exactamente una.

### Borrado

**R40** — CUANDO el usuario active el borrado de una unidad, el sistema DEBE pedir confirmación en
un diálogo que **nombre esa unidad** y advierta que la acción no se puede deshacer. MIENTRAS el
usuario no confirme, el sistema NO DEBE invocar la operación de borrado; CUANDO confirme, DEBE
invocarla y aplicar R38.

**R41** — SI la operación de borrado se rechaza porque la unidad está en uso —la usa un producto o
una línea de receta, **o bien otra unidad deriva de ella**—, ENTONCES el sistema DEBE presentar ese
error **dentro del diálogo de confirmación**, DEBE mantener el diálogo abierto y NO DEBE retirar la
fila de la lista.

**R42** — SI la operación de borrado se rechaza por cualquier otro código de error, ENTONCES el
sistema DEBE presentarlo también dentro del diálogo, distinguiéndolo por su código y nunca por su
texto, y NO DEBE retirar la fila.

### Estructura, convenciones y plataforma

**R43** — Los componentes propios de la pantalla DEBEN vivir en la carpeta `components/` de la ruta
y exponerse por su barrel `index.ts`; la página NO DEBE importarlos por ruta profunda ni dejarlos
sueltos junto a `page.tsx`.

**R44** — Toda mutación y toda lectura del catálogo DEBEN realizarse mediante las Server Actions ya
publicadas por el módulo; el sistema NO DEBE llamar a rutas API propias con `fetch`, y NO DEBE
abrir `lib/modules/unidades/` para nada que no sea consumir su contrato público, sus adaptadores
driving y la ampliación que autorizan R1 a R6.

**R45** — Las primitivas de interfaz que la pantalla necesite DEBEN provenir de la librería de
componentes por su CLI; el sistema NO DEBE escribir a mano ni editar archivos de `components/ui/`,
y NO DEBE añadir ninguna dependencia a `package.json`.

**R46** — Los componentes de cliente de la pantalla DEBEN recibir por props los datos de sesión y
los datos de catálogo que muestran; NO DEBEN importar el punto de composición, ni el cliente de
base de datos, ni obtener esos datos por su cuenta.

**R47** — El sistema NO DEBE re-crear ni duplicar el layout privado, la barra lateral, la región de
avisos, las primitivas ya instaladas, la tabla compartida, la sección Configuración, el filtrado
del menú por permisos, el corte por permiso de página ni las utilidades de test: los hereda. Los
únicos archivos ajenos que esta feature puede modificar son los que declaran la ruta y su prefijo
privado (R8, R13), el que declara la navegación privada (R9, R10) y los del módulo `unidades` que
R1 a R6 acotan. Cualquier test heredado de lista CERRADA cuyo punto de extensión por diseño sea
darse de alta en él DEBE **tensarse** —subir el ancla o la lista exacta—, nunca relajarse.

**R48** — La pantalla DEBE ser utilizable en viewport angosto y en viewport ancho: NO DEBE usar
`100vh` como alto de pantalla, NO DEBE depender de `:hover` como única vía para descubrir o activar
una acción, sus controles táctiles DEBEN medir al menos 44×44 px y sus campos de formulario DEBEN
tener un tamaño de fuente de al menos 16 px. NO DEBE declararse ninguna excepción de escritorio.

**R49** — Los tests de la pantalla DEBEN identificar controles, estados y destinos por rol ARIA,
`data-testid` o constantes exportadas, y NO DEBEN afirmar sobre literales de copy.

**R50** — El sistema DEBE quedar cubierto por una prueba de extremo a extremo que recorra login →
la pantalla → alta de una unidad **derivada** → verla en la lista **con su equivalencia armada**, y
por otra que compruebe que una sesión válida **sin los permisos de unidades** no llega a la
pantalla: recibe 404 dentro del layout privado y no ve la tabla (R12).

## Preguntas abiertas

Ninguna.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
| --- | --- | --- |
| 2026-09-08 | ¿Dónde vive la pantalla? | **`configuracion/unidades`**, como ítem de la sección **Configuración**. Cerrado al acotar **QC-76** y confirmado al acotar **QC-45** |
| 2026-09-08 | ¿Quién crea la sección Configuración? | **QC-45, y ya está hecha.** Esta ficha **solo añade su ítem** a una sección que existe. La corrección se escribió en este mismo issue el 2026-09-07 |
| 2026-09-08 | La lista tiene que mostrar la equivalencia y saber si la unidad es de sistema, pero el catálogo devuelve hoy solo nombre y símbolo. ¿Quién amplía la lectura? | **Esta ficha.** `UnitRef` es hoy `id`, `name` y `symbol`, y `UNIT_SELECT` proyecta exactamente esos tres: ni `baseUnitId`, ni `factor`, ni `companyId`. Se amplían la proyección y el tipo de lectura. **Cumple el encargo que QC-38 dejó escrito** en `unit-actions.ts`: «quien abre la puerta al contrato aquí es QC-39» |
| 2026-09-08 | ¿Eso convierte la ficha en `fullstack` y hay que partirla en dos? | **No: sigue siendo `frontend`.** Es proyección y tipo de lectura, no lógica de negocio nueva —el caso de uso, el repositorio y la autorización ya existen—. Partirla dejaría la pantalla bloqueada otra vez el día después de desbloquearse. Anotado en el issue para que no sea una sorpresa en la revisión |
| 2026-09-08 | ¿Qué permiso corta la pantalla? | **Los dos: `unidades.consultar` y `unidades.modificar`**, y el ítem del menú declara lo mismo que la página. La lista exige `consultar` en el service (`list-units.ts`) y las tres acciones exigen `modificar`. **QC-74 decidió que `modificar` NO implica `consultar`**: cortar solo por `modificar` dejaría a alguien con ese permiso viendo el enlace y recibiendo un fallo al cargar la lista. Hoy solo el Administrador tiene ambos, así que la garantía de QC-32 y QC-38 —«solo el Administrador consulta unidades»— se mantiene. **No se crea ningún permiso nuevo** ni se toca el catálogo de QC-74 |
| 2026-09-08 | ¿Búsqueda, orden y paginación? | **Sí, las tres**, como la pantalla hermana de presentaciones. Obliga a **abrir el parámetro de `listUnitsAction`**, que hoy no acepta ninguno. El soporte ya está hecho: `UNIT_QUERYABLE` y `sanitizeListQuery` vienen de **QC-57** |
| 2026-09-08 | ¿Por dónde busca el buscador? | **Solo por nombre**, normalizado —sin acentos ni distinguir mayúsculas—. **No busca por símbolo**: el adaptador compara contra `nameNormalized` y nada más. Derivado del código, no de una preferencia |
| 2026-09-08 | ¿Por qué campos se ordena? | **Nombre, símbolo y fecha de creación**, que es lo que `UNIT_QUERYABLE.sortable` ya declara. **No se ordena por equivalencia**, que no está ahí. El desempate estable por identificador ya lo pone el adaptador |
| 2026-09-08 | ¿Filtros? | **Ninguno.** `UNIT_QUERYABLE.filterable` está vacío **a propósito**, y su propio comentario lo dice: es la lista blanca declarando que aquí no se filtra |
| 2026-09-08 | ¿Qué columnas tiene la lista? | **Nombre, Símbolo, Equivalencia y las acciones de fila.** **Sin columna de Ámbito**: que una unidad sea de sistema o de la empresa es **manejo interno** y no se le muestra al usuario. Esto **corrige** lo que la ficha del board pedía el 2026-09-07 |
| 2026-09-08 | ¿Cómo se pinta la equivalencia? | **Como frase ya armada**: «1 kg = 1000 gr», que es el ejemplo literal del board. Una unidad **base** muestra un guion. El factor viaja y se pinta como **texto decimal, nunca `number`** —así lo declara `UnitConversion`—, y su significado es «cuántas unidades de la apuntada caben en una de ésta» |
| 2026-09-08 | ¿Qué ve el usuario en la fila de una unidad de sistema? | **La celda de acciones vacía, y nada más.** No se ofrece lo que el service rechaza, y no se explica por qué: sin etiqueta, sin botones apagados y sin distintivo junto al nombre. La distinción queda implícita, que es lo coherente con tratarla como manejo interno |
| 2026-09-08 | ¿Se puede editar o borrar una unidad de sistema? | **No**, y la pantalla **no repite la decisión**: la rechaza el service, con su test, desde **QC-38** y **QC-76**. Ocultar los botones es comodidad de la interfaz, no el control |
| 2026-09-08 | Alta y edición: ¿modal o página? | **Panel lateral (`sheet` de shadcn/ui)**, heredado de **QC-45** y **QC-22**: al guardar se vuelve a la lista sin perder la página, la búsqueda ni el orden en los que estabas |
| 2026-09-08 | ¿Qué campos tiene el formulario? | **Los cuatro**: nombre, símbolo, de qué unidad deriva y factor. La edición es **reemplazo completo** de los cuatro, heredado de **QC-38**: con envío parcial no se distingue «no lo toques» de «bórralo», y aquí hay dos campos que se pueden vaciar |
| 2026-09-08 | ¿Qué ofrece el selector de «deriva de»? | **Solo unidades base.** La derivación es de **un solo nivel** y el service rechaza apuntar a una derivada o a sí misma (**QC-38**, **QC-76**). La pantalla no vuelve a validarlo: lo ofrece bien y deja que el error de dominio mande |
| 2026-09-08 | Aviso de éxito y de error | **Toast para el éxito, error en línea junto al campo**, heredado de **QC-45** y **QC-22**. El `<Toaster />` lo monta el layout privado desde **QC-11**: aquí no se vuelve a montar |
| 2026-09-08 | Borrado | **Con diálogo de confirmación nombrando la unidad**, heredado de **QC-45** y **QC-22** |
| 2026-09-08 | ¿Y si la unidad está en uso? | **Se rechaza y el error se pinta en el diálogo.** El borrado es **físico** y lo bloquea `ON DELETE RESTRICT`: ni si la usa un producto o una línea de receta, **ni si otra unidad deriva de ella** (**QC-32 D10**, **QC-76**, **QC-38**) |
| 2026-09-08 | ¿Cómo se distinguen los errores? | Por su **`code` estable**, nunca por el texto. Es lo que ya hace `unit-actions.ts` (`docs/conventions.md > Manejo de errores`) |
| 2026-09-08 | Estado vacío | Es el de **«la búsqueda no encontró nada»**, y **no** ofrece «crea la primera»: con las unidades de sistema siempre presentes, la lista nunca sale vacía de verdad. Se aparta aquí de **QC-45** con motivo |
| 2026-09-08 | Estados de la lista | **Vacío, cargando y error**, los tres, con el reparto de **QC-45**: la sección pide los datos, los componentes los pintan |
| 2026-09-08 | Tamaño de página | **Selector de 10 y 25**, heredado de **QC-45** y **QC-22** |
| 2026-09-08 | ¿La lista usa la tabla compartida? | **Sí**, la de **QC-55**, por su barrel público y sin tocar ni un archivo suyo. Las acciones de fila van como **columna normal con `pinnable: false`**: **QC-45 resolvió la pregunta abierta 4 de QC-55** y esta ficha **hereda la respuesta sin volver a decidirla** |
| 2026-09-08 | Protección de la ruta | **Dos controles distintos, y ninguno sustituye al otro**: `PRIVATE_ROUTE_PREFIXES` cubre la ruta —eso garantiza **sesión**, en el borde, y su guardia pone el gate en rojo si una pantalla privada se queda sin prefijo—, y la página exige el **permiso** con `requirePagePermission(...)` **antes de leer datos**. Quien tiene sesión pero no permiso recibe **404 dentro del layout privado** (**QC-75**, **QC-45**) |
| 2026-09-08 | ¿Dónde vive la constante de ruta? | **En un solo sitio, reutilizada** por el ítem del menú, la lista de prefijos y cualquier destino de la propia pantalla. Nunca un literal (**QC-11 R13**, **QC-45 R2**) |
| 2026-09-08 | Route group y componentes | **`app/(private)/`**, y los componentes en `<ruta>/components/` con barrel `index.ts`, importados por el barrel y nunca por ruta profunda (**QC-12**, **QC-45**) |
| 2026-09-08 | Mutaciones | **Server Actions**, las tres que **QC-38** ya expone. Prohibido `fetch` a una ruta del propio origen (**QC-11**, `docs/architecture.md > Server Actions vs Route Handlers`) |
| 2026-09-08 | ¿Dónde se valida la autorización? | **En el service**, que es donde ya está: los casos de uso de **QC-38** exigen el permiso con su test. La pantalla **no la repite ni la sustituye** (**QC-20 D2**, `docs/checkpoints-proyecto.md > Permisos`) |
| 2026-09-08 | Datos de sesión | **Por props**, nunca fetcheados por el componente privado (**QC-11**, `docs/checkpoints-proyecto.md > Permisos`) |
| 2026-09-08 | Librería de componentes | **shadcn/ui por CLI.** Ningún primitivo se escribe ni se edita a mano en `components/ui/` (**QC-11**). Si hiciera falta una librería de verdad, el `frontend_dev` **para y la propone**; no la instala (regla 7 de `CLAUDE.md`) |
| 2026-09-08 | Asserts de los tests | Sobre **roles ARIA, `data-testid` y constantes exportadas**; **nunca** sobre literales de copy (**QC-11**, **QC-22**, **QC-45**) |
| 2026-09-08 | Multiplataforma | Se valida contra angosto y ancho con `tests/helpers/viewport.ts`. **Ninguna excepción de escritorio.** El desbordamiento se resuelve con scroll horizontal **contenido en la tabla**, nunca del `body`. La columna de equivalencia entra en esa cuenta: es la que más ancho pide |
| 2026-09-08 | ¿E2E? | **Sí, ligera**: login → la pantalla → crear una unidad **derivada** → verla en la lista **con su equivalencia armada**, más el **rechazo de quien no tiene el permiso**. `CHECKPOINTS.md` lo pide cuando hay permisos, Playwright ya está montado, y **cierra el diferimiento que QC-38 dejó apuntando a esta ficha** |
| 2026-09-08 | Base heredada | **shadcn/ui, Vitest, Playwright, layout privado, sidebar, `<Toaster />`, la tabla compartida de QC-55, la sección Configuración de QC-45 y el menú por permisos de QC-75 están montados y NO se re-crean.** La T0 de `specs/11-*/tasks.md` existe justo por esto |
| 2026-09-08 | Librería nueva | **Ninguna.** Todo lo que hace falta está aprobado y montado |
