# QC-155 — pantalla-de-clientes · requirements.md

> **Zona** frontend · **Complejidad** — (la asigna el leader en F1.0) · **depends_on** QC-154 · **Rama** feature/QC-155-pantalla-de-clientes
>
> **Alcance.** La ruta `/clientes`: listado con la tabla compartida (búsqueda, paginación y orden,
> QC-55), panel de alta y edición, baja con confirmación, y la entrada del menú lateral, **visible solo
> con `clientes.consultar`**. E2E: el Administrador ve y administra; un rol sin permiso no ve ni el
> menú ni la ruta.
>
> **Lo que NO entra.** El modelo (**QC-153**) y el CRUD (**QC-154**, bloquea esta). El enlace pedido ↔
> cliente (**QC-156**).
>
> Sembrado por `/afinar-feature` el 2026-09-23. El bloque de Alcance y la tabla de «Decisiones cerradas»
> los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los reescribe: su
> trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

> **Glosario mínimo.** **Pantalla de clientes**: la página que crea esta ficha, servida en la URL que
> declara su constante de ruta. **Layout privado**: el armazón de QC-11 (barra lateral, cabecera,
> `<main>` y `<Toaster />`) que envuelve todo `app/(private)/`. Se hereda montado. **Tabla
> compartida**: `components/shared/data-table` (QC-55), consumida por su barrel público. **Panel
> lateral**: el `sheet` donde ocurren el alta y la edición. **Operaciones de clientes**: las cinco
> Server Actions de QC-154 en `lib/modules/clientes/adapters/driving/customer-actions.ts`
> (`listCustomersAction`, `getCustomerAction`, `createCustomerAction`, `updateCustomerAction`,
> `deleteCustomerAction`). **Los seis datos**: nombres, apellidos, ciudad, teléfono, correo y dirección
> (decisión 1). **Lista blanca**: `CUSTOMER_QUERYABLE`, publicada por el contrato de `clientes`.
> **Parámetros de lista**: página, tamaño de página, orden, filtros y término de búsqueda. **Roles del
> seed**: los conjuntos de `SEED_ROLE_PERMISSIONS` de `identity`.

### Ruta, navegación y protección

**R1** — El sistema DEBE exponer la pantalla de clientes en la URL que declara **una sola** constante
exportada de `lib/shared/routes.ts`, dentro del grupo de rutas privadas, de modo que se renderice
**envuelta por el layout privado existente** y sin declarar armazón propio: NO DEBE declarar `main`,
barra lateral, cabecera ni región de avisos propias. Todo consumidor (el ítem de navegación, la lista
de prefijos privados y cualquier destino de navegación de la propia pantalla) DEBE derivarse de esa
constante, y ningún archivo de producto DEBE incrustar la URL como literal.

**R2** — La URL de la pantalla DEBE quedar cubierta por la lista declarada de prefijos de ruta privada,
de modo que una petición sin sesión válida sea rechazada antes de renderizarla. Esa cobertura
garantiza **sesión, no autorización**, y NO DEBE tomarse como el control de R3. Ambas garantías DEBEN
existir a la vez.

**R3** — La pantalla DEBE exigir **`clientes.consultar`** antes de resolver sus parámetros de lista y
antes de leer o renderizar nada. SI la petición no tiene sesión válida, ENTONCES el sistema DEBE
redirigirla al login. SI la sesión es válida pero le falta ese permiso, ENTONCES el sistema DEBE
responder **404**, renderizado dentro del layout privado e indistinguible de una ruta que no existe
(sin nombrar el módulo, el permiso ni la existencia de la pantalla), y NO DEBE presentar ningún dato de
clientes. MIENTRAS la sesión incluya el permiso, DEBE permitir el acceso.

**R4** — La navegación privada DEBE incluir **exactamente un** ítem nuevo de nivel superior, el de
clientes, cuyo destino sea la constante de R1 y cuyo permiso declarado sea **`clientes.consultar`**,
el mismo código que exige la página en R3. MIENTRAS la sesión no incluya ese permiso, el sistema NO
DEBE emitir el ítem en el HTML servido: ni etiqueta, ni destino, ni identificador de test. MIENTRAS lo
incluya, DEBE emitirlo. La decisión DEBE tomarse en el servidor con los datos de sesión que el layout
privado ya obtiene, sin añadir ninguna consulta y sin ocultar nada con estilos. El sistema NO DEBE
modificar el mecanismo de filtrado del menú, NO DEBE mover, renombrar ni reordenar ningún ítem
existente y NO DEBE cambiar el aterrizaje tras el login de ningún rol del seed.

**R5** — MIENTRAS la sesión **no** incluya `clientes.modificar`, el sistema NO DEBE ofrecer ninguna
acción de escritura (alta, edición ni baja): ni disparador, ni botón deshabilitado, ni panel, ni
diálogo, ni formulario en el árbol servido. MIENTRAS lo incluya, DEBE ofrecer las tres. Ocultarlas es
comodidad de la interfaz y **no es el control**: la pantalla NO DEBE repetir ni sustituir la
autorización, que la ejercen los casos de uso de `clientes` (QC-154 R2, R3).

**R6** — CUANDO la sesión trae exactamente los permisos que el seed asigna al **Administrador**, el
sistema DEBE emitir el ítem del menú, permitir la pantalla y ofrecer las tres escrituras. CUANDO trae
exactamente los del **Operador** o los del **Empacador**, NO DEBE emitir el ítem y la pantalla DEBE
responder 404 (R3).

**R7** — SI cualquier operación de clientes responde con un error de autorización, ENTONCES el sistema
DEBE presentar ese error y NO DEBE presentar ningún dato de clientes como si la operación hubiera
prosperado.

**R8** — Los componentes de cliente de la pantalla DEBEN recibir **por props** la decisión de R5 y los
datos de clientes que muestran. NO DEBEN importar el punto de composición ni el cliente de base de
datos, NO DEBEN leer la sesión y NO DEBEN obtener datos por su cuenta, salvo las invocaciones de
Server Action que autoriza R34.

### Listado

**R9** — La lista DEBE presentarse con la **tabla compartida**, consumida por su barrel público. El
sistema NO DEBE declarar una tabla ni una barra de paginación propias y NO DEBE modificar ningún
archivo de `components/shared/data-table/`.

**R10** — La tabla DEBE presentar exactamente estas columnas de datos: nombres, apellidos, ciudad,
teléfono, correo, dirección, fecha de alta y fecha de última modificación, más la columna de acciones
de fila. NO DEBE presentar el identificador técnico, la empresa, los autores de la creación o de la
modificación, la marca de baja ni las formas normalizadas. Tampoco NIT, documento ni persona de
contacto, que el cliente no tiene. *(Posición por defecto sobre qué columnas se ven: P2.)*

**R11** — SI el teléfono, el correo o la dirección de un cliente no tienen valor, ENTONCES la celda DEBE
presentar un marcador de ausencia identificable y NO DEBE presentar los textos `null` ni `undefined`.

**R12** — La pantalla DEBE ofrecer una caja de búsqueda. CUANDO el usuario cambie el término, el
sistema DEBE volver a pedir la lista **al servidor**, sobre el conjunto entero y desde la primera
página, enviando el término tal como se escribió. NO DEBE filtrar, normalizar ni recortar resultados
en el cliente. Qué casa con qué (sin mayúsculas, sin acentos, por palabras en nombres, apellidos o
ciudad) lo decide el módulo (QC-154 R41), no la pantalla.

**R13** — La pantalla DEBE ofrecer exactamente dos filtros, derivados de la lista blanca y no escritos
a mano: **ciudad** (texto) y **fecha de alta** (rango de fechas). NO DEBE ofrecer ningún otro. CUANDO
el usuario cambie un filtro, el sistema DEBE volver a pedir la lista al servidor desde la primera
página.

**R14** — Las columnas ordenables DEBEN ser exactamente las que declara la lista blanca (nombres,
apellidos, ciudad, fecha de alta y fecha de última modificación), **leídas de ella**. Ninguna otra
columna DEBE ser ordenable. CUANDO el usuario cambie el orden, el sistema DEBE volver a pedir la lista
al servidor con ese orden y NO DEBE reordenar en el cliente. CUANDO no haya orden elegido, la pantalla
NO DEBE enviar ninguno y DEBE presentar la lista en el orden en que la devuelve el módulo (apellidos y
después nombres, QC-154 R29).

**R15** — La pantalla DEBE ofrecer un selector de tamaño de página con exactamente dos opciones, 10 y
25, y DEBE usar 10 cuando no se indique ninguno. CUANDO haya más clientes de los que caben en una
página, el sistema DEBE permitir avanzar y retroceder e indicar la página actual y el total de
páginas.

**R16** — SI los parámetros de lista recibidos son inválidos, están fuera de rango, exceden el tope o
nombran un campo, una dirección de orden o un filtro que la lista blanca no admite, ENTONCES el
sistema DEBE acotarlos a valores válidos y presentar la lista. NO DEBE fallar ni mostrar un error.

**R17** — El estado de la lista (página, tamaño, orden, filtros y término) DEBE vivir en la URL, de modo
que recargar, compartir el enlace, abrir y cerrar el panel lateral o volver con «Atrás» desde otra
pantalla presente la misma lista con los mismos parámetros.

**R18** — CUANDO la URL cambie el término de búsqueda sin que el cambio venga de la propia caja (por
ejemplo, buscar A, luego B y pulsar «Atrás» sin salir de la pantalla), la caja DEBE mostrar el término
de la URL. MIENTRAS el usuario escribe y la lista se está recalculando, la caja DEBE seguir montada,
con el foco y con el texto que se está escribiendo.

**R19** — MIENTRAS la empresa no tenga ningún cliente vivo y no haya término ni filtro activos, el
sistema DEBE presentar un estado vacío identificable propio de clientes en lugar de una tabla sin
filas. Ese estado DEBE ofrecer la acción de dar de alta el primer cliente solo cuando R5 la permite.

**R20** — SI la consulta devuelve cero clientes con un término o un filtro activos, ENTONCES el sistema
DEBE presentar un estado **«sin coincidencias»** identificable y distinto del de R19, con la caja de
búsqueda montada y una acción para limpiar término y filtros. SI la página pedida es mayor que el
total, ENTONCES DEBE ofrecer volver a la primera página.

**R21** — MIENTRAS la lista se obtiene por primera vez, el sistema DEBE presentar un indicador de carga
identificable en lugar de la tabla. MIENTRAS una navegación de la propia lista está en vuelo, DEBE
presentar una señal de carga identificable **sin desmontar** la tabla ni la caja de búsqueda.

**R22** — SI la operación de listado responde con error, ENTONCES el sistema DEBE presentar un estado
de error identificable, con el mensaje devuelto y una acción para reintentar, y NO DEBE presentar una
tabla vacía como si no hubiera clientes.

**R23** — MIENTRAS el ancho disponible no alcance para todas las columnas, el sistema DEBE resolver el
desbordamiento con **scroll horizontal contenido en la propia tabla**, sin scroll horizontal del
documento, y las acciones de fila DEBEN seguir siendo alcanzables.

### Alta y edición

**R24** — CUANDO el usuario active la acción de crear o la de editar un cliente, el sistema DEBE abrir el
formulario en un **panel lateral** sobre la lista. NO DEBE navegar a otra URL de pantalla completa y
NO DEBE usar un diálogo modal centrado. CUANDO el panel se cierre, por guardado o por cancelación, el
sistema DEBE devolver al usuario a la lista con los mismos parámetros de lista que tenía antes.

**R25** — El formulario DEBE capturar **exactamente los seis datos**: nombres, apellidos y ciudad,
señalados como obligatorios, y teléfono, correo y dirección, señalados como opcionales. NO DEBE
capturar ningún otro campo, en particular empresa, autores, fechas, NIT, documento ni persona de
contacto.

**R26** — El formulario DEBE validar antes de enviar con el esquema que publica el contrato de
`clientes`, sin reescribir sus reglas: los largos máximos (nombres 80, apellidos 80, ciudad 80,
teléfono 40, correo 160, dirección 200) y la obligatoriedad son los del esquema. SI un obligatorio
está vacío o solo con espacios, o un dato supera su largo, ENTONCES el sistema DEBE presentar el error
junto a ese campo y NO DEBE invocar la operación. El sistema NO DEBE imponer ningún formato al correo
ni al teléfono (QC-154 R17): los controles NO DEBEN rechazar, ni por validación del navegador ni por
patrón, un texto que respete el largo.

**R27** — CUANDO el usuario abra la edición de un cliente, el sistema DEBE precargar el formulario con
los seis valores actuales de ese cliente y DEBE enviar el **reemplazo completo** de los seis mediante
la operación de edición. Un opcional vaciado DEBE enviarse vacío para que quede sin valor.

**R28** — SI un guardado se rechaza, ENTONCES el sistema DEBE decidir qué pintar por el **código
estable** del error y nunca por su texto: junto al campo cuando el error identifique uno, y en una
región de error del formulario cuando no (incluido «cliente no encontrado» al editar uno que ya no
existe). NO DEBE cerrar el panel ni perder lo escrito.

**R29** — El sistema DEBE permitir dar de alta y guardar un cliente cuyos seis datos coincidan con los
de otro cliente existente. NO DEBE advertir, bloquear ni pedir confirmación por duplicado.

**R30** — CUANDO un alta, una edición o una baja terminen con éxito, el sistema DEBE cerrar el panel o
el diálogo abierto, notificar el éxito con un aviso emergente y actualizar la lista sin que el usuario
recargue y sin perder los parámetros de lista vigentes. El sistema DEBE emitir sus avisos sobre la
región que el layout privado ya monta y NO DEBE montar una segunda.

### Baja

**R31** — CUANDO el usuario active la baja de un cliente, el sistema DEBE pedir confirmación en un
diálogo que **nombre al cliente** (nombres y apellidos) y advierta que la acción no se puede deshacer.
MIENTRAS el usuario no confirme, NO DEBE invocar la operación de baja. CUANDO confirme, DEBE invocarla
y aplicar R30.

**R32** — SI la baja se rechaza, por cualquier código, ENTONCES el sistema DEBE presentar el error
**dentro del diálogo**, distinguiéndolo por su código, DEBE mantener el diálogo abierto y NO DEBE
retirar la fila de la lista.

**R33** — El sistema NO DEBE ofrecer ver, filtrar, contar ni restaurar clientes dados de baja: un
cliente dado de baja desaparece de la pantalla.

### Estructura, límites y plataforma

**R34** — Toda lectura y toda escritura DEBEN hacerse con las operaciones de clientes, importadas **por
su ruta exacta** y nunca desde el contrato público del módulo. El sistema NO DEBE llamar con `fetch`
a rutas API propias ni crear ninguna. El estado inicial de los formularios DEBE construirlo esta
pantalla.

**R35** — El sistema NO DEBE modificar `lib/modules/**`, `lib/composition/**` ni `db/**`, NO DEBE añadir
ninguna migración y NO DEBE añadir ninguna dependencia a `package.json`. Las primitivas de interfaz
DEBEN venir de la librería de componentes por su CLI, sin escribir ni editar a mano `components/ui/`.
Los únicos archivos de producto ajenos a la ruta que puede modificar son los que declaran la ruta y su
prefijo (R1, R2), la navegación privada y su mapa de iconos (R4).

**R36** — Los componentes propios de la pantalla DEBEN vivir en `components/` de su ruta y exponerse por
su barrel `index.ts`. La página NO DEBE importarlos por ruta profunda.

**R37** — El sistema NO DEBE re-crear ni duplicar el layout privado, la barra lateral, la región de
avisos, la tabla compartida, el filtrado del menú, el corte por permiso de página, las primitivas
instaladas ni las utilidades de test. Todo test heredado de lista **cerrada** cuyo punto de extensión
sea darse de alta en él DEBE **tensarse**, nunca relajarse. Las únicas aserciones heredadas que esta
ficha puede sustituir son las que QC-153 y QC-154 escribieron para afirmar «todavía no hay pantalla ni
E2E de clientes» (`tests/unit/clientes/scope.test.ts`). Se sustituyen por su versión acotada, que
sigue en rojo ante cualquier archivo fuera de lo que esta ficha crea.

**R38** — La pantalla NO DEBE nombrar pedidos ni ofrecer ningún vínculo, columna, filtro o acción entre
un cliente y un pedido.

**R39** — La pantalla DEBE ser utilizable en viewport angosto y ancho, sin excepción de escritorio. NO
DEBE usar `100vh` como alto, NO DEBE depender de `:hover` como única vía para una acción, sus controles
táctiles DEBEN medir al menos 44×44 px y sus campos DEBEN tener al menos 16 px de fuente.

**R40** — Los tests de la pantalla DEBEN localizar controles, estados y destinos por rol ARIA,
`data-testid` o constantes exportadas, y NO DEBEN afirmar sobre literales de copy.

### Verificación de extremo a extremo

**R41** — El sistema DEBE quedar cubierto por una prueba de extremo a extremo en la que una sesión con
los permisos del **Administrador** del seed: ve el ítem de clientes en el menú; llega a la pantalla y
ve la lista; da de alta un cliente y lo ve en la lista; lo encuentra con la caja de búsqueda; lo
edita y ve el dato cambiado; y lo da de baja confirmando, tras lo cual deja de verlo.

**R42** — El sistema DEBE quedar cubierto por una prueba de extremo a extremo en la que una sesión con
los permisos del **Operador** del seed no ve el ítem de clientes en el menú, y al pedir la URL de la
pantalla recibe 404 dentro del layout privado, sin título, tabla, estado vacío ni disparador de alta
de clientes.

### Cobertura de las decisiones cerradas

Cada fila de `## Decisiones cerradas (no reabrir)`, en el orden en que está escrita, con el requisito
que la hace testeable en **esta** ficha.

| # | Decisión cerrada | Requisito(s) |
| --- | --- | --- |
| 1 | Nombres y apellidos separados y obligatorios, ciudad obligatoria; teléfono, correo y dirección opcionales; sin NIT ni persona de contacto | R10, R11, R25, R26, R27 |
| 2 | Nada es único: se admiten duplicados | R29 |
| 3 | `clientes.consultar` (ver) y `clientes.modificar` (alta, edición, baja), solo del Administrador; autorización en el service | R3, R4, R5, R6, R7, R8 |
| 4 | Borrado lógico con auditoría; identificadores en inglés; aislamiento por empresa | R31, R32, R33 (baja lógica sin restauración); R10 (ni empresa ni autores ni marca de baja en pantalla); R19 (vacío = la empresa del actor sin clientes). Identificadores y aislamiento se prueban en QC-153/154; esta ficha no crea ninguno (R35) |
| 5 | Tres fichas como Proveedores: QC-153 modelo, QC-154 CRUD, QC-155 pantalla | R1, R9, R34, R35 |
| 6 | Pedido ↔ cliente no entra (QC-156) | R38 |
| 7 | E2E en la pantalla, por tocar permisos | R41, R42 |
| QC-153 F1.4 / QC-154 R16–R17 | Largos 80/80/80/40/160/200, sin formato de correo ni teléfono | R26 |
| QC-154 F1.4 (P2, P3) | Búsqueda sin acentos y por palabras; orden por defecto apellidos → nombres; filtros ciudad y fecha de alta | R12, R13, R14 |
| — (regla 7 de `CLAUDE.md`) | Ninguna librería nueva | R35 |

Requisitos que no salen de una fila de la tabla, y de dónde salen: **R2**, **R9**, **R15**–**R17**,
**R19**–**R24**, **R28**, **R30**, **R36**, **R37**, **R39**, **R40** son la base heredada de toda
pantalla de lista (QC-44, QC-55, QC-67, QC-75), y **R18** es la sincronización de la caja con la URL
que resolvió QC-122 en pedidos (su tabla de decisiones dejó escrito que las demás pantallas seguían
con el fallo).

## Preguntas abiertas

**Ninguna.** Las tres que hubo están resueltas: la 1 por QC-153/QC-154 y la 2 y la 3 por el humano
al aprobar el spec (ver `## Nota de aprobación (2026-09-25)` al final). Se conservan abajo como
historia.

1. **Largo máximo de cada campo y validación de formato del correo y del teléfono.** No se preguntó; el
   precedente es proveedores (`Supplier`: `phone` y `email` opcionales). `spec_author` lo toma de ahí
   y lo dice, o lo lleva a F1.4 si el precedente no lo cierra.

   > **Nota 2026-09-25 (spec_author, F1.2): cerrada por QC-153 y QC-154.** La F1.4 de QC-153 fijó los
   > largos (nombres 80, apellidos 80, ciudad 80, teléfono 40, correo 160, dirección 200) y **ningún**
   > formato de correo ni de teléfono, y QC-154 los aplica en el esquema (`customer-input.ts`, R16 y
   > R17 de QC-154). Esta pantalla no los decide: los **consume** del contrato (R26). La pregunta no
   > se reescribe; queda respondida.

2. **Sección e icono del ítem del menú.** *Añadida por `spec_author` en F1.2.* La tabla fija que el
   ítem existe y que exige `clientes.consultar`, pero no **dónde** va ni con qué icono. **Posición por
   defecto escrita, no decidida** (`design.md > 2.3`): sección **«Cadena»**, junto a Proveedores (el
   cliente es el otro extremo de la cadena de suministro), declarado **al final** de
   `PRIVATE_NAV_ITEMS` para no cambiar el aterrizaje de ningún rol. Icono **nuevo** `contact` (`Contact`
   de `lucide-react`, que ya está instalado), porque `users` ya lo usa Usuarios en «Operación». La
   alternativa es «Operación», junto a Pedidos, pensando en QC-156. Cambiarlo es una línea y su test:
   no bloquea la implementación.

3. **Qué columnas se ven.** *Añadida por `spec_author` en F1.2.* **Posición por defecto escrita, no
   decidida** (R10): los seis datos, dirección incluida, más la fecha de alta y la de última
   modificación, sin autores (precedente QC-44: se muestran ids y no nombres, así que no se muestran).
   La alternativa es quitar la dirección de la tabla (es el campo más largo) y dejarla solo en el
   formulario. No bloquea.

Si durante la implementación aparece cualquier otra ambigüedad, el implementer **para y la reporta al
leader**; no la rellena con supuestos.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-09-23 | ¿Qué datos tiene un cliente? | **Nombres** y **apellidos** en columnas separadas (obligatorios), **ciudad** (obligatoria); **teléfono**, **correo** y **dirección** opcionales. Sin NIT y sin persona de contacto: el cliente es una persona. |
| 2026-09-23 | ¿Qué no se puede repetir? | **Nada**: se admiten clientes duplicados (sin índice único de negocio). |
| 2026-09-23 | ¿Quién puede? | Permisos nuevos `clientes.consultar` (ver) y `clientes.modificar` (alta, edición, baja), **solo del Administrador** en el seed. Enmienda al catálogo cerrado de permisos (precedente: **QC-144**). La autorización se valida en el service (`docs/architecture.md`). |
| 2026-09-23 | Borrado, identificadores, empresa | **Borrado lógico** con auditoría `created_by`/`updated_by` y fechas; **identificadores en inglés**; **aislamiento por empresa desde el primer día** con `company_id` y FK compuesta (heredados de **QC-4**, **QC-42/QC-43** y **QC-59**). |
| 2026-09-23 | ¿Cómo se reparte el módulo? | Tres fichas como Proveedores (QC-42/43/44): **QC-153** modelo, **QC-154** CRUD, **QC-155** pantalla, en la épica nueva **QC-152 Clientes**. |
| 2026-09-23 | ¿Pedido ↔ cliente? | **No entra** en el módulo base: ficha aparte **QC-156** (bloqueada por QC-154). |
| 2026-09-23 | ¿E2E? | **Sí**, en la pantalla (**QC-155**), por tocar permisos (`CHECKPOINTS.md`). El modelo y el CRUD se verifican con tests unitarios y de integración. |

## Nota de aprobación (2026-09-25)

El humano **aprobó el spec** el 2026-09-25 y aceptó las dos posiciones por defecto tal como estaban
escritas. Ningún requisito cambia ni se renumera.

| Fecha | Pregunta | Decisión | Requisito(s) |
|---|---|---|---|
| 2026-09-25 | ¿Sección e icono del ítem del menú? (P2) | Sección **«Cadena»**, junto a Proveedores, declarado **al final** de `PRIVATE_NAV_ITEMS` (no cambia el aterrizaje de ningún rol), con el icono **nuevo `contact`** (`Contact` de `lucide-react`, ya instalado). | R4, R6 |
| 2026-09-25 | ¿Qué columnas se ven? (P3) | **Todas**: los seis datos, **dirección incluida**, más la fecha de alta y la de última modificación. **Sin autores.** | R10, R11 |
