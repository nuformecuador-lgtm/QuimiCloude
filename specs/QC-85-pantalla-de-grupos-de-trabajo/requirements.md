# QC-85 — pantalla-de-grupos-de-trabajo · requirements.md

> **Zona** `frontend` · **Complejidad** _la asigna el leader en F1.0_ · **depends_on** QC-84, QC-67 ·
> **Rama** `feature/QC-85-pantalla-de-grupos-de-trabajo`
>
> **Alcance.** La **pestaña «Grupos»** dentro de la pantalla de usuarios
> (`/configuracion/usuarios`): ver los grupos de la empresa, crear uno, cambiarle el nombre, meter y
> sacar personas, y borrarlo con confirmación. Los miembros se gestionan en el **panel lateral**, con
> buscador para añadir y acción para sacar. **Consume los siete casos de uso de QC-84 y no escribe
> backend.**
>
> **Lo que NO entra.** El modelo → **QC-83**. Los casos de uso → **QC-84**. Asignar trabajo a un
> grupo → **QC-87**, desde pedidos. **El conteo de miembros por grupo → QC-100**: el listado de
> QC-84 no lo devuelve y añadirlo es backend. Y **ningún caso de uso, service ni Server Action
> nuevos**: si esta ficha necesita tocar `lib/modules/`, algo se entendió mal.
>
> *Sembrado por `/afinar-feature` el 2026-09-12. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.*

## Requisitos (EARS)

> **Glosario mínimo.** **Pantalla de usuarios**: la página que QC-67 creó en la URL que declara
> `USERS_ROUTE`; se hereda montada y esta ficha **no crea ninguna otra**. **Pestaña de personas**:
> el contenido que esa pantalla ya tiene hoy (listado de usuarios, panel lateral, diálogos).
> **Pestaña de grupos**: el contenido que esta ficha añade. **Conmutador de pestañas**: el control
> que alterna entre las dos. **Layout privado**: el armazón de QC-11 (sidebar + cabecera + `<main>`
> + `<Toaster />`); se hereda montado. **Tabla compartida**: `components/shared/data-table`, la de
> QC-55, consumida por su barrel público. **Panel lateral**: el `sheet` del patrón de QC-45/QC-67.
> **Operaciones de grupos**: las **siete** Server Actions de QC-84
> (`createWorkGroupAction`, `renameWorkGroupAction`, `deleteWorkGroupAction`,
> `addWorkGroupMemberAction`, `removeWorkGroupMemberAction`, `listWorkGroupsAction`,
> `listWorkGroupMembersAction`). **Consulta de personas**: `listUsersAction`, la Server Action de
> lectura de usuarios que QC-66 ya publicó. **Fila de grupo**: lo que el listado de grupos devuelve
> por cada grupo (`WorkGroupRow`: identificador y nombre, y nada más). **Fila de miembro**: lo que
> la lista de miembros devuelve por cada persona (`WorkGroupMemberRow`: identificador y nombre
> mostrable, y nada más). **Parámetros de lista**: página, tamaño de página, orden, filtros y
> término de búsqueda. **Código estable**: el `code` del error de dominio que el adaptador driving
> de QC-84 traduce a `{ status, code, message }`. **Actor**: la persona cuya sesión sirve la
> petición.

> **Tres avisos de lectura.**
>
> (a) **«El sistema» es la pantalla, nunca el módulo.** Esta ficha no escribe backend: **R36 lo
> fija como límite**, igual que QC-84 hizo con su R48. Ningún requisito de aquí obliga a cambiar
> una línea de `lib/modules/`.
>
> (b) **Lo que la pestaña de grupos NO muestra es tan requisito como lo que muestra.** R12 (ningún
> conteo de miembros → QC-100) y R31 (ningún dato de credencial ni estado de cuenta del miembro)
> están escritos para que nadie los «arregle» pidiendo un dato que el contrato no devuelve.
>
> (c) **R21 es validación de entrada de la pantalla, no una regla nueva de dominio.** El nombre de
> solo signos se ataja **mientras se escribe**; el backend de QC-84 sigue exactamente como está.

### Ubicación, pestañas y dirección

**R1** — La pantalla de usuarios DEBE presentar un conmutador de **exactamente dos** pestañas
—personas y grupos— y DEBE presentar el contenido de **una sola** de ellas a la vez. La pestaña
vigente DEBE quedar reflejada en la **dirección** mediante un parámetro de consulta declarado como
**una sola constante exportada**, y los dos valores admitidos DEBEN derivarse de constantes
exportadas y nunca de literales escritos a mano en cada consumidor.

**R2** — SI la dirección no indica pestaña, o indica un valor que no es ninguno de los dos
admitidos, ENTONCES el sistema DEBE presentar la pestaña de **personas** y NO DEBE fallar, NO DEBE
mostrar un error y NO DEBE quedarse sin contenido.

**R3** — CUANDO el usuario active una pestaña, el sistema DEBE reflejar el cambio en la dirección
sin recargar la pantalla; y MIENTRAS la dirección indique la pestaña de grupos, recargarla o
abrirla desde un enlace DEBE presentar la pestaña de **grupos**, nunca la de personas. El destino
de esa navegación DEBE derivarse de la constante de ruta de la pantalla, y ningún archivo de
producto DEBE incrustar la URL como literal.

**R4** — El sistema NO DEBE crear ninguna ruta, segmento ni página nueva bajo `app/`, y NO DEBE
añadir, quitar ni reordenar ninguna entrada de la lista declarada de prefijos de ruta privada: la
pestaña de grupos DEBE vivir dentro de la ruta que la pantalla de usuarios ya ocupa.

**R5** — El sistema NO DEBE añadir, quitar, renombrar ni reordenar ningún ítem del menú privado, NO
DEBE declarar ningún icono, etiqueta ni permiso de navegación nuevos y NO DEBE modificar el
mecanismo de filtrado del menú por permisos ni el componente de navegación. Las guardias de
navegación existentes DEBEN seguir pasando **sin excepciones nombradas ni listas relajadas**.

**R6** — MIENTRAS la pestaña vigente sea la de personas, el sistema DEBE presentar ese contenido
**con el mismo comportamiento que ya tenía** —listado, búsqueda, filtro, orden, paginación, panel
lateral y diálogos—, y NO DEBE cambiar el significado de sus parámetros de lista ni exigir que la
dirección nombre la pestaña por defecto para que funcione.

**R7** — Los parámetros de lista de cada pestaña DEBEN ser independientes: CUANDO el usuario cambie
de pestaña, el sistema NO DEBE aplicar a la lista de destino la página, el orden, el filtro ni el
término de búsqueda que gobernaban la lista de origen.

### Protección y autorización

**R8** — El acceso a la pantalla DEBE seguir exigiendo **`usuarios.consultar`** y DEBE seguir
siendo **un solo corte**, el que ya existe: la pestaña de grupos NO DEBE añadir ningún corte
propio, NO DEBE exigir ningún permiso adicional y NO DEBE declarar ningún código de permiso nuevo.

**R9** — MIENTRAS la sesión **no** incluya `usuarios.modificar`, el sistema NO DEBE ofrecer ninguna
acción de escritura sobre grupos —crear, renombrar, meter una persona, sacarla ni borrar—: ni
disparador, ni botón deshabilitado, ni panel, ni diálogo, ni formulario en el árbol servido.
MIENTRAS la sesión lo incluya, DEBE ofrecer las cinco. Ocultarlas es comodidad de la interfaz y
**NO es el control**: la pantalla NO DEBE repetir ni sustituir la autorización, que la ejerce el
caso de uso del módulo.

**R10** — Los componentes de cliente de la pestaña de grupos DEBEN recibir **por props** los datos
de sesión —incluida la decisión de R9— y los datos que muestran; NO DEBEN importar el punto de
composición, ni el cliente de base de datos, ni leer la sesión por su cuenta.

**R11** — SI cualquier operación de grupos responde con un error de autorización, ENTONCES el
sistema DEBE presentar ese error y NO DEBE presentar ningún dato de grupos ni de miembros como si
la operación hubiera prosperado.

### Listado de grupos

**R12** — La lista de grupos DEBE presentarse con la **tabla compartida** consumida por su barrel
público, y DEBE presentar **exactamente una columna de datos, el nombre del grupo**, más la columna
de acciones de fila. El sistema NO DEBE declarar una tabla propia, NO DEBE declarar una barra de
paginación propia, NO DEBE copiar el esqueleto de lista de ninguna otra pantalla, NO DEBE modificar
los archivos de `components/shared/data-table/` y **NO DEBE presentar ningún número de miembros
—ni visibles, ni total— ni ningún campo que la fila de grupo no traiga**, en particular el
identificador técnico, el nombre normalizado, la empresa ni la marca de baja.

**R13** — La pestaña de grupos DEBE ofrecer un selector de tamaño de página con exactamente dos
opciones, **10 y 25**, y DEBE usar 10 cuando no se indique ninguno. CUANDO existan más grupos de
los que caben en una página, el sistema DEBE permitir avanzar y retroceder de página e indicar la
página actual y el total de páginas.

**R14** — La pestaña de grupos DEBE ofrecer **búsqueda** por el nombre del grupo. CUANDO el usuario
cambie el término, el sistema DEBE volver a pedir la lista al servidor **sobre el conjunto entero**
y NO DEBE filtrar en el cliente sobre la página visible.

**R15** — Las columnas ordenables DEBEN ser exactamente las que declara la **lista blanca de
consulta de grupos** del módulo, **leída de ella** y no reescrita; ninguna otra columna DEBE ser
ordenable. CUANDO el usuario cambie el orden, el sistema DEBE volver a pedir la lista al servidor
con ese orden y NO DEBE reordenar en el cliente.

**R16** — El sistema NO DEBE ampliar ninguna de las dos listas blancas de consulta de grupos: NO
DEBE declarar ningún campo consultable nuevo, NO DEBE ofrecer ningún filtro, NO DEBE cambiar el
orden por defecto, el desempate estable, el tope de tamaño de página ni el conjunto devuelto.

**R17** — SI los parámetros de lista recibidos son inválidos, están fuera de rango, exceden el tope
soportado o nombran un campo que el módulo no admite, ENTONCES el sistema DEBE acotarlos a valores
válidos y presentar la lista, y NO DEBE fallar ni mostrar un error.

**R18** — MIENTRAS la consulta de grupos no devuelva ningún grupo, el sistema DEBE presentar un
estado vacío identificable. SI había término de búsqueda activo, ENTONCES el estado vacío DEBE
ofrecer limpiarlo; SI la página pedida era mayor que el total, ENTONCES DEBE ofrecer volver a la
primera página.

**R19** — MIENTRAS la lista de grupos se está obteniendo, el sistema DEBE presentar un indicador de
carga identificable en lugar de la tabla. SI la consulta de grupos responde con error, ENTONCES el
sistema DEBE presentar un estado de error identificable con el mensaje devuelto y una acción para
reintentar, y NO DEBE presentar una tabla vacía como si no hubiera grupos.

### Crear y renombrar un grupo

**R20** — CUANDO el usuario active la acción de crear un grupo o la de abrir un grupo existente, el
sistema DEBE presentar el nombre en un **panel lateral** sobre la lista, NO DEBE navegar a otra URL
de pantalla completa y NO DEBE usar un diálogo modal centrado. CUANDO el panel se cierre —por
guardado o por cancelación—, el sistema DEBE devolver al usuario a la lista **con los mismos
parámetros de lista y en la misma pestaña** que tenía antes de abrirlo.

**R21** — MIENTRAS el nombre escrito no contenga **al menos una letra o un número**, el sistema
DEBE indicarlo **mientras se escribe** —sin esperar al envío— y NO DEBE invocar ninguna operación
de creación ni de renombrado. Esa comprobación DEBE derivarse de la **única definición de «mismo
nombre de grupo»** que publica el contrato del módulo, y NO DEBE escribirse como una segunda
expresión propia de la pantalla.

**R22** — El formulario DEBE capturar **exactamente un campo**, el nombre, y DEBE validarlo con el
**mismo esquema de entrada** que publica el contrato del módulo —recorte de espacios, no vacío y
tope de longitud—, sin copiarlo ni reescribirlo. NO DEBE capturar ningún otro campo, y en
particular NO DEBE capturar empresa, nombre normalizado, marca de baja ni ninguna lista de
miembros.

**R23** — CUANDO el usuario guarde un nombre para un grupo nuevo, el sistema DEBE invocar la
operación de **creación**; CUANDO lo guarde para un grupo existente, DEBE invocar la de
**renombrado**, y esta NO DEBE alterar los miembros de ese grupo.

**R24** — SI la creación o el renombrado se rechazan, ENTONCES el sistema DEBE decidir qué pintar
por el **código estable** del error y nunca por su texto, DEBE presentar el error en línea junto al
campo del nombre cuando el código lo identifique —nombre de grupo duplicado— y en una región de
error del formulario cuando no lo identifique, DEBE mantener el panel abierto y NO DEBE perder lo
escrito.

### Miembros del grupo

**R25** — MIENTRAS el panel lateral esté abierto sobre un grupo existente, el sistema DEBE
presentar, bajo el nombre, la lista de **miembros** de ese grupo tal como la devuelve la operación
de consulta de miembros, presentando de cada persona su **nombre mostrable**. El sistema NO DEBE
filtrar, ordenar, buscar ni recortar esa lista por su cuenta, y NO DEBE añadir, ocultar ni
reordenar ninguna persona respecto de lo que esa operación entrega.

**R26** — La lista de miembros DEBE estar **paginada** con la misma forma de página que el listado
de grupos: DEBE permitir avanzar y retroceder, DEBE indicar la posición dentro del total que la
operación devuelve y NO DEBE presentar todos los miembros de golpe sin límite superior.

**R27** — MIENTRAS la lista de miembros se está obteniendo, el panel DEBE presentar un indicador de
carga identificable; SI esa consulta responde con error, el panel DEBE presentarlo de forma
identificable y NO DEBE presentar una lista vacía como si el grupo no tuviera miembros.

**R28** — El panel DEBE ofrecer un **buscador de personas** para añadir a alguien al grupo, cuyos
candidatos DEBEN provenir de la **consulta de personas ya publicada** por el módulo, buscando en el
servidor sobre el conjunto entero; el sistema NO DEBE derivarlos de ninguna otra fuente, NO DEBE
escribirlos a mano y NO DEBE construir una consulta propia a base de datos. CUANDO el usuario elija
a una persona, el sistema DEBE invocar la operación de **meter a una persona** con ese grupo y esa
persona, **de a una**, y NO DEBE enviar nunca un conjunto completo de miembros.

> **Enmienda 2026-10-05 (decidido por el humano: el buscador solo ofrece personas activas).** Los
> candidatos de R28 salen ahora de `listWorkGroupCandidatesAction`, la consulta de candidatos de
> grupo que publica `identity`: solo devuelve personas con estado efectivo activo y excluye al
> actor. Sigue buscando en el servidor, paginada, y la pantalla no filtra nada por su cuenta. Queda
> enmendada también la entrada «Consulta de personas» del glosario, que fijaba `listUsersAction`:
> para R28 la consulta es `listWorkGroupCandidatesAction`; `listUsersAction` sigue siendo la de la
> pestaña de personas. Tests: en `tests/unit/configuracion-ui/grupos/work-group-form.test.tsx`,
> «consulta la accion de candidatos de grupo, no el listado de usuarios, y pinta lo que devuelve»
> y «si al crear el grupo una pendiente ya no esta activa, el aviso trae el motivo del catalogo»;
> en `tests/unit/configuracion-ui/grupos/work-group-members.test.tsx`, «aparece aunque no se
> escriba nada en el buscador: trae la primera pagina de candidatos» y «busca en el servidor sobre
> el conjunto entero, con rebote».

**R29** — SI meter a una persona se rechaza, ENTONCES el sistema DEBE distinguir el caso por su
**código estable** y nunca por el texto del mensaje, DEBE presentar el error dentro del panel y DEBE
mantenerlo abierto; y DEBE distinguir, **como cuatro casos separados**, «ya pertenece y se ve»,
«ya pertenece pero su cuenta está pendiente», «ya pertenece pero su cuenta está inactiva» y «ya
pertenece pero su cuenta está bloqueada».

**R30** — CUANDO meter o sacar a una persona termine con éxito, el sistema DEBE volver a pedir la
lista de miembros al servidor y presentar lo que ésta devuelva; NO DEBE insertar ni retirar
ninguna fila por su cuenta, y por tanto NO DEBE afirmar que aparece en la lista una persona que la
operación de consulta no devuelve.

**R31** — La lista de miembros NO DEBE presentar ningún dato de credencial, ningún correo, ningún
documento ni ningún estado de cuenta de la persona, y NO DEBE compensar su ausencia calculándolos,
pidiéndolos por otra vía ni deduciéndolos.

**R32** — El panel DEBE ofrecer, por cada miembro presentado, una acción para **sacarlo** del grupo,
que DEBE invocar la operación de **sacar a una persona**; SI esa operación se rechaza, ENTONCES el
sistema DEBE presentar el error por su código dentro del panel y NO DEBE retirar la persona de la
lista.

### Borrado de un grupo

**R33** — CUANDO el usuario active el borrado de un grupo, el sistema DEBE pedir confirmación en un
diálogo que **nombre a ese grupo** y advierta que la acción no se puede deshacer. MIENTRAS el
usuario no confirme, el sistema NO DEBE invocar la operación de borrado; CUANDO confirme, DEBE
invocarla.

**R34** — SI el borrado se rechaza, ENTONCES el sistema DEBE presentar ese error **dentro del
diálogo de confirmación**, distinguiéndolo por su código y nunca por su texto, DEBE mantener el
diálogo abierto y NO DEBE retirar la fila de la lista.

**R35** — CUANDO una operación de creación, renombrado, borrado, alta o baja de miembro termine con
éxito, el sistema DEBE cerrar el panel o el diálogo abierto, notificar el éxito mediante un aviso
emergente y actualizar lo que se muestra **sin que el usuario tenga que recargar la pantalla** y
sin perder la pestaña vigente ni los parámetros de lista. El sistema DEBE emitir sus avisos sobre
la región que el layout privado ya monta y NO DEBE montar una segunda: en la zona privada DEBE
seguir habiendo exactamente una.

### Límite de alcance: no se escribe backend

**R36** — El sistema NO DEBE incluir en esta feature ningún caso de uso, service, puerto, adaptador,
repositorio, Server Action, route handler, migración ni cambio de `db/schema.prisma`, y NO DEBE
modificar ningún archivo de `lib/modules/`. Toda lectura y toda escritura DEBEN realizarse mediante
las **operaciones de grupos** y la **consulta de personas** ya publicadas, importadas **por su ruta
exacta** y nunca desde el contrato público del módulo; el sistema NO DEBE llamar a rutas API propias
con `fetch` y el estado inicial de los formularios DEBE construirlo **esta pantalla**.

**R37** — El sistema NO DEBE incorporar ninguna dependencia de terceros nueva. Las primitivas de
interfaz que necesite —el conmutador de pestañas incluido— DEBEN provenir de la librería de
componentes por su CLI, sin escribir ni editar a mano archivos de `components/ui/`; y SI la
primitiva arrastrase un paquete que `package.json` no tiene, ENTONCES el trabajo DEBE detenerse y
proponerse la dependencia con sus cuatro checks, en vez de instalarla.

### Estructura, convenciones y plataforma

**R38** — Los componentes propios de la pestaña de grupos DEBEN vivir en la carpeta `components/`
de la ruta de usuarios y exponerse por su **barrel `index.ts`**; la página NO DEBE importarlos por
ruta profunda ni dejarlos sueltos junto a `page.tsx`.

**R39** — El sistema NO DEBE re-crear ni duplicar el layout privado, la barra lateral, la región de
avisos, las primitivas ya instaladas, la tabla compartida, el corte por permiso de página, el
filtrado del menú por permisos ni las utilidades de test: los hereda. Cualquier test heredado de
lista CERRADA cuyo punto de extensión por diseño sea darse de alta en él DEBE **tensarse**, nunca
relajarse.

**R40** — La pestaña de grupos DEBE ser utilizable en viewport angosto y en viewport ancho: NO DEBE
usar `100vh` como alto de pantalla, NO DEBE depender de `:hover` como única vía para descubrir o
activar una acción, sus controles táctiles DEBEN medir al menos 44×44 px y sus campos de formulario
DEBEN tener un tamaño de fuente de al menos 16 px. NO DEBE declararse ninguna excepción de
escritorio. MIENTRAS el ancho disponible no alcance, el desbordamiento DEBE resolverse con scroll
contenido en la propia tabla, sin scroll horizontal del documento.

**R41** — Los tests de esta feature DEBEN identificar controles, estados y destinos por rol ARIA,
`data-testid` o constantes exportadas, y NO DEBEN afirmar sobre literales de copy.

**R42** — El sistema DEBE quedar cubierto por una prueba de **extremo a extremo** que recorra, en un
solo guion: entrar a la pantalla de usuarios, **cambiar a la pestaña de grupos**, **crear** un
grupo, **renombrarlo**, **meter** a una persona, **sacarla** y **borrar** el grupo, comprobando en
cada paso lo que la pantalla presenta.

**R43** — Los tests de extremo a extremo que ya existen DEBEN seguir pasando **sin cambios en su
guion** —lo que ejercita cada `test(...)`, sus selectores y sus aserciones—, en particular el de la
pantalla de usuarios y el de permisos.

### Cobertura de las decisiones cerradas

Cada fila de `## Decisiones cerradas (no reabrir)`, en el orden en que está escrita, con los
requisitos que la hacen testeable. Ninguna queda sin `R<n>`.

| # | Decisión cerrada | Requisito(s) |
| --- | --- | --- |
| 1 | Pestaña «Grupos» dentro de `/configuracion/usuarios`; se toca la pantalla de QC-67 para meterle el conmutador; primera pantalla de Configuración con pestañas | R1, R4, R6, R7, R20 |
| 2 | El menú no gana ítem; `PRIVATE_NAV_ITEMS` intacto; la guardia de QC-75 verde sin excepciones | R4, R5 |
| 3 | La pestaña se refleja en la dirección; personas es la de por defecto | R1, R2, R3 |
| 4 | Los miembros se gestionan en el panel lateral: nombre editable arriba, lista paginada abajo, buscador para añadir y acción para sacar; sin pantalla de detalle ni fila expandible | R20, R23, R25, R26, R28, R32 |
| 5 | La tabla no muestra conteo de miembros: `WorkGroupRow` tiene exactamente `id` y `name`; el conteo es QC-100 | R12 |
| 6 | Solo cuentas activas, tal como las devuelve QC-84; la pantalla no filtra ni inventa | R25, R30, R31 |
| 7 | El formulario exige al menos una letra o un número, dicho mientras se escribe; el backend de QC-84 no se toca | R21, R22, R36 |
| 8 | `usuarios.consultar` para ver y `usuarios.modificar` para escribir, heredados; sin corte propio | R8, R9, R11 |
| 9 | El borrado va con diálogo de confirmación que dice qué grupo | R33, R34 |
| 10 | Se reutilizan tabla compartida, búsqueda y orden con paginación 10/25, panel lateral, diálogo de borrado y los componentes de vacío, cargando y error | R12, R13, R14, R15, R18, R19, R27, R38, R39 |
| 11 | E2E de esta ficha, recorrido completo; QC-84 la difirió aquí | R42, R43 |
| 12 | No se toca backend: ningún caso de uso, service, Server Action ni migración; se consumen los siete casos de uso de QC-84 | R36 |
| 13 | Ninguna librería nueva; el conmutador de pestañas sale de shadcn/ui | R37 |

## Preguntas abiertas

Dos. **Ninguna bloquea la implementación**: las dos tienen una respuesta por defecto escrita en
`design.md > 10`, y se dejan aquí porque son decisiones de producto, no de diseño técnico.

1. **El actor no puede añadirse a sí mismo a un grupo desde el buscador.** La consulta de personas
   de QC-66 **no devuelve al actor** (decisión 12 de QC-66), así que quien administra los grupos no
   aparece entre los candidatos de R28. ¿Se acepta ese hueco —quien quiera meterse en un grupo se lo
   pide a otro administrador— o hace falta otra vía? Abrirla sería backend, o sea **fuera de esta
   ficha**. Por defecto: se acepta y se documenta.
2. **Una persona cuya cuenta no está `active` sí entra en el grupo, pero no aparece en la lista.**
   El caso de uso de QC-84 crea la fila sea cual sea el estado de cuenta, y la lista solo muestra
   cuentas activas (decisión 6). ¿El buscador de candidatos debe mostrar el estado de cuenta de cada
   persona para que ese resultado no sorprenda? Por defecto: **no** se muestra —R25 y R31 mantienen
   la lista tal cual la devuelve el módulo, y R30 impide afirmar lo contrario—, y se revisa si
   molesta en uso.

> **Enmienda 2026-10-05 (decidido por el humano): las dos preguntas quedan resueltas.**
> 1. El actor no puede meterse a sí mismo en un grupo: el buscador no lo ofrece y, si se intenta
>    por otra vía, el servidor lo rechaza con `work_group_member_self`. No hace falta otra vía.
> 2. Una persona no activa no entra en el grupo: el buscador solo ofrece personas activas (ver la
>    enmienda de R28) y el servidor rechaza a cualquier otra con `work_group_member_not_active`, sin
>    crear fila. Ya no hay persona que entre y no aparezca, así que no hace falta mostrar el estado
>    de cuenta en el buscador.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
| --- | --- | --- |
| 2026-09-12 | ¿Pantalla propia o sección dentro de usuarios? | **Pestaña «Grupos» dentro de `/configuracion/usuarios`.** Todo lo de gente queda en un sitio y el menú no crece. **Dos precios escritos**: hay que tocar la pantalla de **QC-67, recién mergeada**, para meterle el conmutador, y **es la primera pantalla de Configuración con pestañas** —las otras tres (Presentaciones, Unidades, Usuarios) no las usan—, así que el patrón nace aquí |
| 2026-09-12 | ¿El menú gana un ítem? | **No.** `PRIVATE_NAV_ITEMS` no se toca: no hay ruta nueva que declarar ni permiso nuevo que enlazar. La guardia de navegación de **QC-75** tiene que seguir verde sin excepciones |
| 2026-09-12 | ¿La pestaña se refleja en la dirección? | **Sí**, para poder enlazarla y para que recargar no devuelva al usuario a la pestaña de personas. La pestaña de personas es la de por defecto |
| 2026-09-12 | ¿Dónde se gestionan los miembros de un grupo? | **En el panel lateral** del patrón de **QC-45**/**QC-67**: arriba el nombre, editable; abajo la lista de miembros **paginada** —la que QC-84 dejó en R51–R54— con **buscador para añadir** a alguien y acción para sacarlo. Sin salir de la tabla. Se descartó la pantalla de detalle propia (una ruta más, con su carga, su error y su E2E) y la fila expandible (la tabla compartida de **QC-55** no lo soporta hoy y habría que tocar un componente que usan todas las pantallas) |
| 2026-09-12 | ¿La tabla muestra cuántas personas tiene cada grupo? | **No, y NO es un olvido: hoy es imposible.** `WorkGroupRow` tiene **exactamente `id` y `name`**, con un test que congela esas claves exactas, así que ningún número —ni el de visibles ni el total— es alcanzable desde el frontend. **QC-100** devolverá los dos y los pintará como «**3 de 5**» con su ayuda. Esta ficha **no** lo muestra |
| 2026-09-12 | ¿Qué miembros se ven? | **Solo cuentas activas**, tal como los devuelve QC-84 (su dec. 3). La pantalla **no filtra por su cuenta ni inventa nada**: pinta lo que el caso de uso da. El precio ya está escrito en QC-84: alguien recién creado nace `pending` y no aparece |
| 2026-09-12 | El nombre de solo signos («!!!»), ¿se ataja aquí? | **Sí: el formulario exige al menos una letra o un número**, y lo dice **mientras se escribe**, no después de guardar. Así el choque de «!!!» con «¿¿¿» deja de ser alcanzable desde la pantalla. **El backend de QC-84 no se toca** —su R12 sigue siendo correcto—: esto es validación de entrada, no una regla nueva de dominio. Cierra la pendiente que QC-84 dejó |
| 2026-09-12 | ¿Quién puede entrar y quién puede escribir? | **`usuarios.consultar` para ver, `usuarios.modificar` para escribir**, heredado de **QC-84 dec. 1**. La pestaña **no añade corte propio**: la pantalla ya está cortada por permiso (**QC-75**), y quien solo consulta ve los grupos sin acciones de escritura |
| 2026-09-12 | ¿Cómo se borra un grupo? | **Con diálogo de confirmación**, el mismo patrón del borrado de QC-45 y del de usuarios de QC-67. El diálogo dice **qué grupo** se va a borrar |
| 2026-09-12 | ¿Qué se reutiliza y no se vuelve a montar? | La **tabla de datos compartida** (QC-55), **búsqueda y orden** (QC-57) con paginación 10/25, el **panel lateral** y el **diálogo de borrado** (QC-45/QC-67), y los componentes hermanos de estado **vacío, cargando y error**. Es la T0 que existe justo para que no se re-monte lo que ya está |
| 2026-09-12 | ¿Hace falta E2E? | **Sí, y es de esta ficha**: **QC-84 dec. 17 la difirió aquí expresamente**. Recorrido completo: entrar, cambiar a la pestaña, crear un grupo, renombrarlo, meter y sacar una persona y borrarlo |
| 2026-09-12 | ¿Se toca backend? | **Nada.** Ningún caso de uso, ningún service, ninguna Server Action y ninguna migración. Se consumen los siete casos de uso de QC-84 por el contrato público de `identity` |
| 2026-09-12 | ¿Librería nueva? | **Ninguna.** El componente de pestañas sale de shadcn/ui, que ya está montado |
