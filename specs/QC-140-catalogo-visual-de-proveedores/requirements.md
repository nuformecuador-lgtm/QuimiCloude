# QC-140 — catalogo-visual-de-proveedores · requirements.md

> **Zona** fullstack · **Complejidad** high · **depends_on** QC-44, QC-52, QC-57 ·
> **Rama** `feature/QC-140-catalogo-visual-de-proveedores`
>
> **Alcance.** `/proveedores` pasa de ser una lista de proveedores a una lista donde cada fila es
> un proveedor y lleva dentro sus productos con imagen, en scroll horizontal de 10 en 10 con un
> botón «cargar más». Al bajar, los siguientes proveedores se cargan de forma perezosa de 5 en 5.
> Se filtra por nombre de producto (iLike) y por nombre de proveedor.
>
> **Lo que NO entra.** El alta, la edición y la baja de proveedores: se mudan a
> `/proveedores/<id>`, que QC-44 ya monta y que esta ficha NO toca —salvo el botón de alta, que
> vive en la cabecera de la vista nueva—. Tampoco entra el botón desde un pedido con faltante:
> eso es QC-139.
>
> Sembrado por `/afinar-feature` el 2026-09-21. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

> **Glosario mínimo.** **Vista de catálogo visual** (o «la vista»): la pantalla que esta ficha pone
> en la URL de proveedores. **Fila**: el bloque de UN proveedor dentro de la vista, con su nombre y
> su carrusel. **Carrusel**: la tira horizontal de líneas de catálogo de esa fila. **Línea**: una
> fila de `SupplierCatalogLine` (QC-52), que es lo que la ficha llama «producto» del proveedor.
> **Vivo**: sin marca de baja lógica. **Tanda de proveedores**: el bloque de proveedores que se
> carga de una vez. **Tanda de líneas**: el bloque de líneas que se añade a un carrusel de una vez.
> **Lecturas de la vista**: las tres consultas que la alimentan —la tanda inicial, cada tanda
> siguiente de proveedores y cada «cargar más» de una fila—. **Filtro de producto** y **filtro de
> proveedor**: los dos campos de búsqueda de la vista.
>
> **Citas.** `[D<n>]` es la fila n de `## Decisiones cerradas`, contada de arriba abajo. `[P<n>]`
> marca un requisito cuyo contenido **depende de una pregunta abierta**: no está decidido y no se
> implementa hasta que el humano la cierre en F1.4. El `design.md` da para cada una la opción
> recomendada y lo que cambia con la otra.

### Ruta, permiso y sustitución

**R1** — El sistema DEBE servir la vista de catálogo visual en la URL que declara la constante de
ruta de proveedores (`SUPPLIERS_ROUTE`), dentro del layout privado y sin declarar un landmark
principal propio. Ningún archivo de producción DEBE incrustar esa URL como literal, ni entre
comillas ni dentro de una plantilla. [D12]

**R2** — El sistema DEBE dejar de pintar en esa URL la lista paginada de proveedores de QC-44: la
vista NO DEBE contener la tabla compartida, ni controles de paginación por número de página, ni
selector de tamaño de página, ni orden por columnas. [D2]

**R3** — CUANDO un usuario sin el permiso `proveedores.consultar` pida la URL de la vista, el
sistema DEBE responder con el 404 de la zona privada, sin nombrar el módulo y sin ningún dato de
proveedores ni de líneas. [D10]

**R4** — CUANDO se invoque cualquiera de las lecturas de la vista con un actor nulo o sin el
permiso `proveedores.consultar`, el caso de uso DEBE rechazarla con el error de autorización del
módulo **antes** de validar la entrada y antes de consultar ningún repositorio. [D10]

### Estructura de la fila

**R5** — El sistema DEBE pintar una fila por cada proveedor que cumpla los filtros activos, y cada
fila DEBE mostrar el nombre del proveedor y, dentro de ella, el carrusel horizontal de sus líneas.
Ningún proveedor DEBE aparecer en más de una fila. [D1]

**R6** — El nombre del proveedor de cada fila DEBE ser un enlace a su página de detalle, construido
con el helper que deriva esa ruta de la constante de R1 (`supplierDetailRoute`), nunca como literal.
[D1] [D3] [D12]

**R7** — Cada elemento del carrusel DEBE mostrar la imagen de la línea y su nombre. [D1]

**R8** — La vista NO DEBE mostrar quién creó ni quién modificó un proveedor o una línea, ni los
identificadores de esas personas. [D11]

### Imagen

**R9** — SI la ruta de imagen de una línea es nula, es la cadena vacía o no resuelve al cargarse,
ENTONCES el sistema DEBE pintar en su lugar el marcador `MISSING_IMAGE_SRC`, y la imagen de la línea
—con o sin marcador— DEBE pintarla el componente compartido `EntityImage`, sin una segunda
implementación de ese comportamiento en la ruta. [D5]

**R10** — El sistema DEBE listar las líneas sin imagen exactamente igual que las que la tienen: la
ausencia de imagen NO DEBE excluir una línea de ningún carrusel ni de ningún filtro. [D4]

### Tandas

**R11** — CUANDO se abre la vista, el sistema DEBE mostrar como máximo **5** proveedores y, en cada
fila, como máximo **10** líneas. [D7]

**R12** — CUANDO el usuario se desplaza hasta el final de los proveedores ya cargados y quedan
proveedores por cargar, el sistema DEBE pedir la siguiente tanda de como máximo **5** proveedores y
añadirla al final, sin recargar la página, sin perder las filas ya cargadas y sin alterar lo que
cada fila ya muestra. [D7] [D8]

**R13** — MIENTRAS no queden proveedores por cargar, el sistema NO DEBE pedir ninguna tanda más.
[D7]

**R14** — MIENTRAS una tanda de proveedores está en vuelo, el sistema DEBE señalar que está
cargando y NO DEBE pedir otra tanda de proveedores. [D7]

**R15** — SI una fila muestra menos líneas de las que le corresponden, ENTONCES DEBE ofrecer el
control «cargar más»; CUANDO el usuario lo activa, el sistema DEBE añadir al final de ese carrusel
las **10** líneas siguientes (o las que queden), sin afectar a ninguna otra fila. MIENTRAS esa
carga está en vuelo, el control DEBE señalar que está cargando y NO DEBE lanzar una segunda carga.
[D7]

**R16** — MIENTRAS una fila muestra todas las líneas que le corresponden, el sistema NO DEBE
ofrecer en ella el control «cargar más». [D7]

**R17** — Tras cualquier secuencia de tandas de proveedores y de «cargar más», el conjunto mostrado
DEBE ser exactamente el prefijo del listado completo en su orden: sin proveedores ni líneas
repetidas y sin huecos entre una tanda y la siguiente. [D1] [D7]

**R18** — La detección de «el usuario llegó al final de la lista» DEBE hacerla la librería aprobada
en F1.4 y registrada en `docs/dependencias.md`; ningún archivo de producción DEBE crear un
observador de intersección ni escuchar el desplazamiento a mano para ese fin. [D8] [P5]

### Filtros

**R19** — El sistema DEBE ofrecer un filtro de producto que seleccione las líneas cuyo nombre
contiene el término escrito, de forma parcial e insensible a mayúsculas. [D6]

**R20** — MIENTRAS el filtro de producto está activo, el sistema DEBE mostrar solo los proveedores
que tengan al menos una línea viva que coincida con él. [D6]

**R21** — MIENTRAS el filtro de producto está activo, el carrusel de cada fila DEBE mostrar el
conjunto de líneas que fije P1 —opción A: solo las que coinciden; opción B: todas las vivas del
proveedor—, y «cargar más» DEBE recorrer ese mismo conjunto. [D6] [P1]

**R22** — El sistema DEBE ofrecer un filtro de proveedor que seleccione los proveedores cuyo nombre
contiene el término escrito, de forma parcial e insensible a mayúsculas.

**R23** — MIENTRAS los dos filtros están activos, el sistema DEBE mostrar solo los proveedores que
cumplen los dos a la vez.

**R24** — SI un filtro queda vacío o solo con espacios, ENTONCES el sistema DEBE tratarlo como
ausente.

**R25** — CUANDO el usuario cambia cualquiera de los dos filtros, el sistema DEBE descartar lo
cargado y volver a la primera tanda con los filtros nuevos.

**R26** — SI con algún filtro activo ningún proveedor coincide, ENTONCES el sistema DEBE mostrar un
aviso de «sin resultados», distinto del estado vacío, con una acción que limpia los dos filtros.

### Censo, vida y empresa

**R27** — Todas las lecturas de la vista DEBEN excluir los proveedores dados de baja y las líneas
dadas de baja; ninguna DEBE ofrecer la forma de verlos. [D13]

**R28** — Todas las lecturas de la vista DEBEN devolver solo proveedores y líneas de la empresa del
usuario; SI se pide «cargar más» sobre el identificador de un proveedor de otra empresa, ENTONCES el
sistema DEBE responder igual que ante un proveedor inexistente, sin devolver ninguna línea.

**R29** — Las lecturas de la vista NO DEBEN escribir en la base. SI la implementación añade algún
objeto de base de datos (un índice), ENTONCES su nombre y los de sus columnas DEBEN ir en inglés y
su migración DEBE traer `down.sql`; la ficha NO DEBE crear tablas ni columnas. [D13]

**R30** — SI un proveedor vivo no tiene ninguna línea viva y no hay filtro de producto activo,
ENTONCES el sistema DEBE tratarlo como fije P2 —opción A: pinta su fila con un aviso de «sin
productos» y cuenta en su tanda; opción B: no aparece y no cuenta en ninguna tanda—. [D1] [P2]

**R31** — El sistema DEBE ordenar los proveedores y las líneas de cada carrusel con un orden total y
estable, desempatado por identificador, cuyo criterio principal fije P4. [P4]

### Estados de carga y de error

**R32** — MIENTRAS se resuelve la tanda inicial, el sistema DEBE pintar un esqueleto de carga en el
lugar de las filas, y los campos de filtro DEBEN seguir montados y conservar el foco.

**R33** — SI no hay ningún proveedor vivo en la empresa y no hay filtro activo, ENTONCES el sistema
DEBE mostrar el estado vacío de proveedores, con el botón de alta.

**R34** — SI falla la tanda inicial, ENTONCES el sistema DEBE mostrar el estado de error de la lista
de proveedores, sin ningún dato de proveedores ni de líneas y sin el detalle técnico del fallo.

**R35** — SI falla una tanda siguiente de proveedores o un «cargar más», ENTONCES el sistema DEBE
conservar todo lo ya cargado, no mostrar el detalle técnico del fallo, y reaccionar como fije P3.
[P3]

### Alta, edición y baja

**R36** — La cabecera de la vista DEBE mostrar el botón de alta de proveedor, que abre el panel de
alta ya existente; CUANDO un alta termina con éxito, el sistema DEBE cerrar el panel, avisar y
volver a cargar la vista desde la primera tanda con los filtros vigentes. [D3]

**R37** — Las filas de la vista NO DEBEN ofrecer la edición ni la baja del proveedor. Dónde quedan
esas dos operaciones lo fija P6. [D3] [P6]

### Multiplataforma y accesibilidad

**R38** — Cada carrusel DEBE poder desplazarse en horizontal con gesto táctil, con rueda o
trackpad y con teclado; ningún control de la vista DEBE depender de `:hover` para descubrirse o
activarse, los controles pulsables DEBEN medir al menos 44x44 px y los campos de filtro DEBEN usar
un tamaño de letra de al menos 16 px.

**R39** — Cada carrusel DEBE exponer a las tecnologías de asistencia un nombre accesible que
identifique al proveedor de su fila, y el control «cargar más» DEBE nombrar también a ese
proveedor.

### Verificación

**R40** — Esta ficha NO DEBE añadir un E2E propio; los E2E ya existentes que recorren la URL de
proveedores —el 404 sin permiso, el aislamiento entre empresas y el alta— DEBEN seguir pasando
contra la vista nueva, adaptados a ella. [D9]

### Mapa decisión -> requisito

| Decisión | Requisitos |
| --- | --- |
| D1 · fila = proveedor | R5, R6, R7, R17, R30 |
| D2 · sustituye a QC-44 | R2 |
| D3 · alta/edición/baja en `/proveedores/<id>`, alta en cabecera | R6, R36, R37 |
| D4 · imagen nullable | R10 |
| D5 · marcador y `EntityImage` | R9 |
| D6 · filtro de producto iLike | R19, R20, R21 |
| D7 · tandas 10 / +10 / 5 | R11, R12, R13, R14, R15, R16, R17 |
| D8 · carga perezosa con librería | R12, R18 |
| D9 · E2E diferido | R40 |
| D10 · `proveedores.consultar` en el service | R3, R4 |
| D11 · sin autores | R8 |
| D12 · `SUPPLIERS_ROUTE` | R1, R6 |
| D13 · borrado lógico, identificadores en inglés | R27, R29 |

## Preguntas abiertas

1. **Qué enseña la fila con el filtro de producto activo.** ¿Solo los productos que coinciden, o
   todos los del proveedor y el filtro solo decide **qué proveedores** salen? Las dos son
   defendibles y dan pantallas distintas.
2. **Proveedor sin ninguna línea de catálogo.** ¿Aparece la fila vacía con un aviso, o no aparece
   en la lista? Afecta al censo de proveedores y por tanto a las tandas de 5.
3. **Fallo de una carga incremental.** Qué se ve si falla la tanda de 5 proveedores o el «cargar
   más» de una fila. El estado de error de la carga INICIAL sí sigue el patrón de QC-44; lo que
   no tiene precedente es el fallo a mitad de scroll.
4. **Orden por defecto** de los proveedores y de los productos dentro del carrusel.
5. **Qué librería concreta** de scroll infinito. Se decide en F1.4 (ver decisiones cerradas).

_Añadidas por spec_author (F1.2), 2026-09-23. Salen de leer el código, no de reabrir ninguna
decisión:_

6. **La edición y la baja del proveedor no existen hoy en `/proveedores/<id>`.** La decisión D3 las
   da por mudadas a esa página «que QC-44 ya monta y que esta ficha NO toca», pero en `dev` la
   página de detalle solo pinta nombre, teléfono, correo y el catálogo
   (`app/(private)/proveedores/[id]/components/supplier-detail-header.tsx`). Los controles de edición
   (`SupplierSheet` con proveedor) y de baja (`DeleteSupplierDialog`) viven en las filas de la tabla de la lista
   (`app/(private)/proveedores/components/supplier-table.tsx`, líneas 77-81), que D2 retira. Si se
   aplican D2 y D3 tal cual, la aplicación se queda sin ninguna forma de editar ni de dar de baja un
   proveedor. Hay que elegir: ¿esta ficha lleva los dos controles a la cabecera del detalle
   —tocando `/proveedores/<id>` en ese punto—, los deja en la fila de la vista nueva, o se abre una
   ficha aparte y se acepta el hueco mientras tanto? Afecta a R37 y a dos E2E existentes.
7. **Tamaño de la imagen.** `EntityImage` pinta una miniatura fija de 60x60 px, sin prop de tamaño.
   ¿Basta ese tamaño para un «catálogo visual», o la imagen tiene que ser mayor? Si tiene que serlo,
   hay que tocar el componente compartido, que usan otras dos pantallas.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
| --- | --- | --- |
| 2026-09-21 | ¿Cada fila es un proveedor o un producto? | **Un proveedor.** Sigue siendo la lista de proveedores; cada fila lleva dentro el carrusel de sus productos. Es la única lectura coherente con «los siguientes proveedores de 5 en 5» |
| 2026-09-21 | ¿Sustituye la lista de QC-44 o convive con ella? | **Sustituye.** La vista nueva ocupa `/proveedores` y la lista paginada de QC-44 desaparece |
| 2026-09-21 | Entonces, ¿dónde viven el alta, la edición y la baja? | **En `/proveedores/<id>`**, que QC-44 ya monta y que se queda intacto. El alta es un botón en la cabecera de la vista nueva. QC-44 **no** queda huérfana: su nivel 2 sigue vivo entero. Anotado en su ficha del board |
| 2026-09-21 | ¿La imagen del producto es obligatoria? | **No, nullable.** `SupplierCatalogLine.imagePath` ya es `String?` y así se queda |
| 2026-09-21 | ¿Qué se pinta si no hay imagen válida o es `null`? | **El marcador que ya usa toda la app**: `MISSING_IMAGE_SRC = '/inv_not_found.png'`, de `components/shared/entity-image.tsx`. `EntityImage` ya cubre los tres casos —`null`, cadena vacía y ruta que no resuelve, vía `onError`—. Se **reutiliza**, no se reimplementa |
| 2026-09-21 | ¿Coincidencia exacta o parcial en el filtro de producto? | **iLike**: parcial e insensible a mayúsculas. Cae sobre `SupplierCatalogLine.name` / `nameNormalized`, que existen desde QC-52. La línea **no** tiene `product_id`, así que filtrar por identificador no se puede hoy |
| 2026-09-21 | Tamaños de tanda | **10** productos por proveedor · **+10** por «cargar más» · **5** proveedores por carga perezosa |
| 2026-09-21 | ¿Carga perezosa a mano o con librería? | **Con librería.** La candidata la propone `spec_author` en el `design.md` y la aprueba el humano en **F1.4**, con los cuatro checks de salud y su fila en `docs/dependencias.md` (regla 7 de `CLAUDE.md`). Nadie instala nada antes |
| 2026-09-21 | ¿Hace falta E2E? | **Se difiere, con motivo, y se difiere AQUÍ y no al final.** `CHECKPOINTS.md` exige E2E para autenticación, permisos, movimientos de inventario, importes y webhooks. Esta pantalla es de solo lectura y no toca ninguno de los cinco |
| 2026-09-21 | ¿Quién puede verla? | **`proveedores.consultar`**, heredado de QC-43 R13: sin implicación entre permisos, toda lectura del catálogo lo exige. Se valida **en el service** (`docs/architecture.md > Acceso a datos y autorizacion`), con su test (`CHECKPOINTS.md`) |
| 2026-09-21 | ¿Se muestra quién creó o modificó? | **No**, heredado de QC-44, que ya cerró ese reenvío: las vistas traen ids, no nombres, y resolverlos exige consumir el contrato público de `identity` |
| 2026-09-21 | La URL | **`SUPPLIERS_ROUTE`**, la constante que ya vive en `lib/shared/routes.ts`. Ningún archivo la incrusta como literal (QC-11 R13) |
| 2026-09-21 | Borrado e identificadores de la DB | **Lógico** y **en inglés**, heredado de QC-4. Esta ficha no crea tablas, así que solo aplica a lo que consulte |
