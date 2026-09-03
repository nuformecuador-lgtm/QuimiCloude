# QC-43 — crud-de-proveedores · requirements.md

> **Zona** `backend` · **Complejidad** `high` · **depends_on** `QC-42`, `QC-8` · **Rama** `feature/QC-43-crud-de-proveedores`
>
> **Alcance.** Alta, consulta, edición y baja de proveedores y de las líneas de su catálogo de
> productos, **solo para el Administrador**. Valida las reglas del modelo que QC-42 no pudo
> defender por sí solo: al menos teléfono o correo —y **ninguno de los dos vale en blanco**—, un
> producto una sola vez por proveedor, y **costo estrictamente mayor que cero**. Trae **tres
> cambios de esquema** sobre QC-42, baratos porque las tablas están vacías: la restricción de
> contacto pasa a rechazar el texto en blanco, el costo deja de admitir cero, y la línea del
> catálogo gana **columnas de autor** para que subir un precio deje rastro. El catálogo de un
> proveedor se consulta con un **listado propio paginado**. Llena los puertos y los adaptadores
> que QC-42 dejó vacíos con `.gitkeep`.
>
> **Lo que NO entra.** La pantalla: va a **QC-44 — Pantalla de proveedores**, que ya existe en el
> board y está bloqueada por esta. El **historial de precios**: hoy, cuando un proveedor sube el
> costo, el anterior se pierde; si hace falta reconstruirlo, es **ficha propia de la épica QC-41**
> (pregunta abierta 2 de QC-42). **Conciliar el costo del producto con el del catálogo**: conviven
> a propósito y pueden contradecirse; quién manda lo decidirá **la feature que registre compras**
> (pregunta abierta 3 de QC-42). **Lote y vencimiento**: pregunta abierta 2 del dominio, sigue
> abierta y el lote vive en el movimiento, no en el catálogo. Y **nada de UI**: esta ficha no abre
> `app/` ni `components/`.
>
> Sembrado por `/afinar-feature` el 2026-09-03. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

Notación EARS (`docs/specs.md`). **«El sistema»** aquí es el módulo **`proveedores`** —sus casos de
uso, sus puertos y sus adaptadores—, el util de paginación de `lib/shared/pagination.ts` y **la
migración de esta ficha**. El modelo ya existe y **no se re-especifica**: lo aportó **QC-42**
(`db/schema.prisma`, `db/migrations/20260903131417_suppliers_and_supplier_catalog_lines/`). Lo
único que esta ficha cambia del esquema son los **tres cambios** de la tabla de decisiones, y
están en R12, R29, R31, R32 y R38.

Los **nueve casos de uso** a los que se refieren los requisitos de autorización son: **crear,
consultar (lista paginada y ficha), editar y dar de baja un proveedor** —cinco, contando lista y
ficha por separado— y **crear, editar, dar de baja y listar** una línea del catálogo.

### Autorización y actor

**R1.** El sistema DEBE recibir el actor —su identificador y su rol— **como parámetro de entrada**
de cada uno de los nueve casos de uso, y NO DEBE leer la sesión, la cookie ni ninguna cabecera por
su cuenta desde el dominio.

**R2.** SI el rol del actor no es `Administrador`, ENTONCES cualquiera de los nueve casos de uso
DEBE rechazar la operación con un error de autorización, y NO DEBE realizar ninguna lectura ni
ninguna escritura por ningún puerto —ni el repositorio de proveedores, ni el del catálogo, ni el
catálogo de productos de `inventario`—. Esto incluye **consultar**: el Operador tampoco lee.

**R3.** SI la operación llega sin actor, o con un actor cuyo rol es nulo, vacío o desconocido,
ENTONCES el sistema DEBE rechazarla igual que en R2 (falla cerrado), y NO DEBE tratar la ausencia
de rol como permiso.

**R4.** El sistema DEBE tomar el nombre del rol `Administrador` de **una sola constante
importada**, y NO DEBE incrustar el literal `'Administrador'` en ningún archivo de
`lib/modules/proveedores/**`.

**R5.** CUANDO un adaptador driving de esta feature ejecuta un caso de uso, DEBE obtener el actor
de `identity.getSessionUser()` a través de `@/lib/composition`, y NO DEBE resolver la sesión por
su cuenta ni repetir la comprobación de rol ni ninguna otra regla de negocio.

**R6.** El sistema DEBE conservar `ROW LEVEL SECURITY` habilitado **y forzado** en `suppliers` y
`supplier_catalog_lines` después de la migración de esta feature, y NO DEBE crear ninguna policy
que pretenda sustituir la comprobación de R2.

### Proveedor — alta y edición

**R7.** CUANDO un actor con rol `Administrador` da de alta un proveedor con datos válidos, el
sistema DEBE persistirlo y DEBE devolver su identificador.

**R8.** CUANDO se da de alta un proveedor, el sistema DEBE registrar al actor como autor de la
creación **y** como autor de la última modificación; y CUANDO se edita o se da de baja un
proveedor, DEBE registrar al actor como autor de la última modificación, **sin alterar** el autor
de la creación.

**R9.** SI el nombre del proveedor está vacío, se compone solo de espacios, o **queda vacío al
normalizarlo** —porque no contiene ningún carácter alfanumérico—, ENTONCES el sistema DEBE
rechazar la operación como nombre inválido; y CUANDO el nombre es válido, DEBE recortar los
espacios de sus extremos **antes** de guardarlo.

**R10.** SI algún campo de texto del proveedor supera el largo máximo declarado en
`design.md > 6.1`, ENTONCES el sistema DEBE rechazar la operación en la **validación de
aplicación**, y NO DEBE imponer ese límite cambiando el tipo de ninguna columna.

**R11.** SI ni el teléfono ni el correo llegan con contenido —ausentes, cadena vacía o solo
espacios—, ENTONCES el sistema DEBE rechazar el alta y la edición del proveedor **en la validación
de aplicación**, antes de llegar al repositorio.

**R12.** El sistema DEBE rechazar **en la propia base de datos**, tanto al insertar como al
modificar, todo proveedor **vivo** cuyo teléfono y cuyo correo estén los dos ausentes o **en
blanco**, aunque la escritura no pase por la validación de aplicación.

**R13.** CUANDO el teléfono o el correo llegan con espacios en los extremos, el sistema DEBE
recortarlos antes de guardar; y CUANDO uno de los dos llega vacío o solo con espacios, DEBE
persistirlo como **ausente**, no como cadena vacía.

**R14.** CUANDO se edita un proveedor, el sistema DEBE reemplazar el conjunto completo de sus
campos de negocio —nombre, teléfono y correo—, y NO DEBE ofrecer edición parcial campo a campo.

**R15.** SI se intenta dar de alta o renombrar un proveedor cuyo nombre normalizado coincide con
el de otro proveedor **vivo**, ENTONCES el sistema DEBE rechazar la operación con un error de
duplicado y NO DEBE crear ni modificar ninguna fila; y MIENTRAS un proveedor esté dado de baja, su
nombre DEBE quedar libre para otro proveedor.

**R16.** CUANDO se da de alta o se edita un proveedor, el sistema DEBE persistir, junto al nombre,
su **forma normalizada**, y DEBE mantener las dos sincronizadas en toda escritura.

**R17.** El sistema DEBE garantizar la unicidad de R15 con el **índice único parcial de la base de
datos** sobre la columna normalizada, de modo que dos altas simultáneas acaben con **una sola**
fila creada y la otra rechazada.

### Proveedor — consulta y baja

**R18.** CUANDO se consulta la lista de proveedores, el sistema DEBE devolver como máximo tantos
elementos como indique el tamaño de página efectivo, junto con el número total de proveedores que
cumplen la consulta.

**R19.** SI la consulta no indica tamaño de página, ENTONCES el sistema DEBE usar **10**; y SI
pide un tamaño mayor que **25**, ENTONCES DEBE devolver como máximo 25 elementos y NO DEBE
ejecutar una consulta sin límite superior.

**R20.** SI el número de página o el tamaño de página recibidos no son enteros mayores o iguales a
1, ENTONCES el sistema DEBE rechazar la consulta y NO DEBE leer del repositorio.

**R21.** El sistema DEBE ordenar el listado de proveedores por **nombre ascendente** y DEBE
desempatar de forma estable, de modo que ningún proveedor aparezca en dos páginas ni se omita de
todas ellas mientras el conjunto no cambie.

**R22.** El sistema DEBE excluir los proveedores dados de baja de **toda** consulta —lista paginada
y ficha individual—, y NO DEBE ofrecer ninguna operación de restauración ni ningún listado de
proveedores dados de baja.

**R23.** CUANDO se da de baja un proveedor, el sistema DEBE conservar su fila completa y marcar el
instante de la baja, y NO DEBE eliminarla físicamente.

**R24.** SI la consulta, la edición o la baja apuntan a un proveedor que no existe o que ya está
dado de baja, ENTONCES el sistema DEBE responder con un error de «no encontrado» y NO DEBE crear
ni modificar ninguna fila.

### Catálogo del proveedor

**R25.** CUANDO un actor con rol `Administrador` añade una línea al catálogo de un proveedor vivo,
con un producto existente y vivo y datos válidos, el sistema DEBE persistirla y DEBE devolver su
identificador.

**R26.** SI el producto de la línea no existe o está dado de baja, ENTONCES el sistema DEBE
rechazar el alta sin crear ninguna fila; y DEBE comprobarlo **a través del contrato público
`@/lib/modules/inventario`**, sin consultar el modelo `Product` ni la tabla `products` con el
cliente Prisma y sin importar `inventario` por ruta profunda.

**R27.** SI ya existe una línea para la misma pareja proveedor-producto, ENTONCES el sistema DEBE
rechazar la operación con un error de duplicado y NO DEBE crear ni modificar ninguna fila; y esa
garantía DEBE venir del **índice único de la base**, de modo que dos altas simultáneas acaben con
una sola línea.

**R28.** SI el costo recibido es cero o negativo, ENTONCES el sistema DEBE rechazar la operación en
la **validación de aplicación**, antes de llegar al repositorio.

**R29.** El sistema DEBE rechazar **en la propia base de datos**, tanto al insertar como al
modificar, toda línea de catálogo cuyo costo no sea **estrictamente mayor que cero**, aunque la
escritura no pase por la validación de aplicación.

**R30.** SI el mínimo de compra o el tiempo de entrega recibidos son negativos, ENTONCES el sistema
DEBE rechazar la operación; y CUANDO no se indican, DEBE persistir la línea **sin** ellos.

**R31.** CUANDO se crea una línea de catálogo, el sistema DEBE registrar al actor como autor de su
creación **y** de su última modificación; y CUANDO se edita una línea, DEBE registrar al actor como
autor de la última modificación **sin alterar** el autor de la creación ni ningún dato del
proveedor.

**R32.** El sistema DEBE almacenar los dos autores de la línea como **referencia real a un usuario
existente**; SI se intenta registrar como autor un identificador que no corresponde a ningún
usuario, ENTONCES la base DEBE rechazar la escritura; y MIENTRAS no haya autor —una importación, un
seed—, la línea DEBE poder existir sin él.

**R33.** CUANDO se edita una línea de catálogo, el sistema DEBE reemplazar sus **condiciones
comerciales** —costo, mínimo de compra y tiempo de entrega— y NO DEBE permitir cambiar ni el
proveedor ni el producto de la línea.

**R34.** CUANDO se da de baja una línea de catálogo, el sistema DEBE eliminar su fila, que deja de
existir; y NO DEBE marcarla como borrada ni conservarla.

**R35.** El sistema DEBE ofrecer el catálogo de un proveedor como **listado propio y paginado**,
con las mismas reglas de R18, R19, R20 y R21, y NO DEBE devolver las líneas dentro de la ficha ni
dentro del listado de proveedores.

**R36.** MIENTRAS un proveedor esté dado de baja, ninguna consulta del catálogo DEBE devolver sus
líneas, aunque las filas sigan existiendo en la base.

**R37.** MIENTRAS el producto de una línea esté dado de baja, la línea DEBE conservarse y DEBE
seguir apareciendo en el catálogo de su proveedor.

### Migración y esquema

**R38.** La migración de esta feature DEBE limitarse a los **tres cambios** de R12, R29 y R31/R32,
y NO DEBE añadir, quitar ni modificar ninguna otra columna, índice o restricción de `suppliers` ni
de `supplier_catalog_lines`, ni tocar ninguna otra tabla.

**R39.** CUANDO se revierte la migración de esta feature, el esquema DEBE quedar **exactamente** en
el estado previo a aplicarla —con la restricción de contacto y la de costo en la forma que les dio
QC-42 y sin las columnas de autor de la línea—, sin dejar columnas, índices ni restricciones
residuales.

**R40.** El sistema DEBE nombrar en **inglés** y en `snake_case` toda columna, índice y restricción
que cree o renombre esta feature.

### Borde, módulo y alcance

**R41.** El sistema DEBE validar con un esquema toda entrada externa de los nueve casos de uso en
el borde, y NO DEBE dejar que ningún dato sin validar ni tipar cruce hacia el dominio.

**R42.** El sistema DEBE exponer las mutaciones como **Server Actions** en `adapters/driving/` del
módulo `proveedores`, recibiendo `FormData` en crear, editar y dar de baja, y argumentos ya
tipados en consultar y listar; y NO DEBE crear ningún route handler ni llamar por `fetch` a
ninguna ruta API propia.

**R43.** El sistema DEBE señalar cada fallo con una clase de error de dominio que lleve un `code`
estable, y el adaptador driving DEBE traducirlo a `{ status: 'error', code, message }` usando ese
`code` —**nunca** el texto del mensaje—; y NO DEBE existir ningún `catch` que descarte un error sin
manejarlo ni propagarlo con contexto.

**R44.** El sistema DEBE alojar los casos de uso en `lib/modules/proveedores/domain/`, con los
accesos a datos detrás de puertos implementados en `adapters/driven/` y cableados **solo** en
`lib/composition/`; el dominio y los puertos NO DEBEN importar framework, Prisma, `lib/shared/`,
`lib/composition` ni las tripas de otro módulo; y el contrato `lib/modules/proveedores/index.ts`
NO DEBE reexportar nada que no sea de `./domain`, en particular ningún adaptador driving.

**R45.** El sistema DEBE resolver el cálculo de la paginación con el util de `lib/shared/`, y NO
DEBE reimplementar esa aritmética dentro del módulo `proveedores`.

**R46.** El sistema NO DEBE incorporar ninguna dependencia de terceros nueva para cumplir los
requisitos anteriores.

**R47.** El sistema NO DEBE incluir en esta feature ninguna pantalla, página, componente de
interfaz ni ruta bajo `app/` —van a **QC-44**—; por lo tanto esta feature no aporta ningún flujo
navegable que un test E2E pueda visitar, y su verificación es **unitaria y de integración**.

### Cobertura de las decisiones cerradas

Cada fila de `## Decisiones cerradas (no reabrir)`, en el orden en que está escrita, con los
requisitos que la hacen testeable. Ninguna queda sin `R<n>`.

| # | Decisión cerrada | Requisito(s) |
| --- | --- | --- |
| 1 | Solo el Administrador, en las cuatro operaciones y en las del catálogo, validado en el service | R2, R3, R4 |
| 2 | El blanco se corta en los dos sitios: `zod` y la base | R11, R12, R13, R38, R39 |
| 3 | Columnas de autor propias en la línea del catálogo | R31, R32, R38, R39 |
| 4 | El costo tiene que ser mayor que cero | R28, R29, R38, R39 |
| 5 | El catálogo se consulta con listado propio y paginado | R18, R19, R20, R21, R35, R45 |
| 6 | Un proveedor dado de baja no se recupera | R22, R23, R15 |
| 7 | Al dar de baja un proveedor, sus líneas dejan de aparecer con él | R36 |
| 8 | E2E diferido con motivo a QC-44 | R47 |
| 9 | Las 22 decisiones de modelo de QC-42 se heredan enteras salvo las dos modificadas | R6, R15, R16, R17, R26, R27, R30, R32, R34, R37, R38 |
| 10 | Mutaciones y consultas por Server Action, con `FormData` en las mutaciones | R42 |
| 11 | El usuario en sesión sale de `identity.getSessionUser()` vía `@/lib/composition` | R1, R5 |
| 12 | Errores con `code` estable, sin `catch` vacíos | R43 |
| 13 | Orden por defecto por nombre ascendente, con desempate estable | R21, R35 |
| 14 | Largos máximos en la validación de aplicación, no en la columna | R10, R38 |
| 15 | Migración con su `down.sql` que revierte al esquema exacto anterior | R39 |
| 16 | Ninguna dependencia nueva | R46 |
| 17 | Se llenan los puertos y adaptadores que QC-42 dejó vacíos; el cableado es exclusivo de `lib/composition` | R44 |

Requisitos que no salen de una fila de la tabla, y de dónde salen: **R7**, **R14**, **R24**,
**R25** y **R33** del propio alcance —los caminos felices del alta, la forma de la edición y el
caso de la ficha inexistente—; **R9** de la pregunta abierta 1 del `design.md` de QC-42 (un nombre
en blanco choca contra el índice único con un mensaje confuso) y del precedente QC-20 D22; **R41**
de `docs/architecture.md > Principios` n.º 2; **R40** de QC-4 y del enunciado del alcance; y
**R47** del bloque «Lo que NO entra».

## Preguntas abiertas

**P1 — De dónde sale la constante del nombre del rol `Administrador` para este módulo.** Hoy vive
en `lib/modules/inventario/domain/actor.ts` (`ADMIN_ROLE_NAME`), porque QC-20 la necesitó primero.
Que `proveedores` la importe de `inventario` es **el mismo olor que ya apareció en QC-22**, donde
la primera regla ruta→rol acabó importando ese mismo símbolo desde `identity` y destapó dos
guardias seguidas. Un rol es un concepto de **`identity`**, no de un módulo de negocio. Esta ficha
**no lo resuelve por su cuenta**: lo decide el `design.md`, y si la respuesta es mudarla, hay que
mirar qué se lleva por delante. No se rellena con un supuesto (regla 6 de `CLAUDE.md`).

**P2 — Si la restricción nueva de contacto se escribe solo para las filas vivas, cierra de paso la
pregunta abierta 8 de QC-42.** Hoy el `CHECK` se evalúa en toda fila, viva o no, así que **no se
puede vaciar el teléfono y el correo de un proveedor ya dado de baja** —lo que pediría una
solicitud de borrado de datos personales— sin violar la restricción o borrar la fila entera. Como
esta ficha **ya toca ese `CHECK`**, es el momento barato de decidirlo. Posición por defecto
escrita, no decidida: hacerlo parcial (`WHERE deleted_at IS NULL`) no cuesta nada más ahora y deja
la puerta abierta. Lo cierra el humano al aprobar el spec, o el `design.md` lo deja explícito.

**RESUELTA el 2026-09-03 al aprobar el spec (F1.4): la restricción se escribe SOLO para las
filas vivas.** Decisión del humano, con la recomendación del `design.md`. Consecuencia buscada:
un proveedor dado de baja **sí** puede quedarse sin teléfono y sin correo, que es lo que exigiría
una solicitud de borrado de datos personales, y se consigue sin eliminar la fila ni romper nada
que la referencie. Esto **cierra de paso la pregunta abierta 8 de QC-42**, que quedó anotada allí
como asumida por no haber ficha de retención. **T3 queda desbloqueada.**


**P3 — El mínimo de compra no dice en qué se mide.** Se lee según la unidad del producto, que
QC-32 dejó **opcional**: un mínimo de `2,5` sobre un producto sin unidad es ambiguo. Heredada de
QC-42 (pregunta 4). No se añade columna de unidad a la línea: hacerlo después es barato mientras
el catálogo esté vacío.

**P4 — Nada concilia el costo del producto con el del catálogo.** Conviven a propósito (decisión 2
de QC-42) y pueden contradecirse sin que ninguna capa se queje. Heredada de QC-42 (pregunta 3).
Hoy no hay dueño.

**P5 — Al editar una línea, ¿se puede cambiar el producto?** La tabla cierra que la línea se
edita, pero no si «editar» alcanza a la pareja proveedor-producto o solo a las condiciones
comerciales. **Añadida por `spec_author` en F1.2**, no cubierta por la tabla. Posición por defecto
escrita, no decidida (`design.md > 6.3`): **la pareja es la identidad de la línea y no se toca**;
cambiar de producto es dar de baja la línea y crear otra, que además es lo único compatible con el
índice único `(supplier_id, product_id)` sin una comprobación no atómica. **R33 escribe esa
posición**; si el humano decide lo contrario al aprobar el spec, R33 cambia y el puerto gana un
parámetro, nada más.

**P6 — Los largos máximos concretos del nombre, el teléfono y el correo.** La tabla cierra
**dónde** viven (en `zod`, no en la columna) pero no **cuánto** valen. **Añadida por `spec_author`
en F1.2.** Posición por defecto escrita, no decidida (`design.md > 6.1`): **120** el nombre —igual
que el producto en QC-20 D11—, **40** el teléfono y **160** el correo. Cambiarlos es una línea de
`zod` y su caso de test: no hay migración detrás, por eso no bloquea. **R10 apunta a la tabla del
`design.md`** justamente para que cambiar el número no renumere nada.

Si durante la implementación aparece cualquier otra ambigüedad, el `backend_dev` **para y la
reporta al leader**; no la rellena con supuestos.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
| --- | --- | --- |
| 2026-09-03 | ¿Quién puede crear, editar y dar de baja proveedores? | **Solo el Administrador**, en las cuatro operaciones y también en las del catálogo. **Se aparta de la `description` original de la ficha**, que decía «para usuarios con sesion iniciada»: el humano lo cerró al acotar y **la `description` del issue se reescribió antes de sembrar esto**. Hereda el criterio de QC-20: los proveedores y sus precios son datos maestros. La autorización se valida **en el service, primera línea del caso de uso** (`docs/architecture.md > Acceso a datos y autorizacion`), y `CHECKPOINTS.md` exige su test |
| 2026-09-03 | El `CHECK` de «al menos teléfono o correo» solo mira ausencia de valor: `phone = ''` lo satisface | **Se corta en los dos sitios.** `zod` rechaza el texto en blanco antes de llegar a la base, **y además** la restricción de la base pasa a tratar el blanco como ausente. QC-42 dejó como posición por defecto que bastara con `zod`; el humano decidió lo contrario. **Es una migración**, y sale barata porque no hay proveedores cargados: con datos, obligaría a limpiarlos antes. Ver **P2** sobre si se escribe parcial |
| 2026-09-03 | ¿Queda rastro de quién cambia el precio de una línea? | **Sí, con columnas de autor propias en la línea del catálogo.** Se aparta de la decisión 14 de QC-42, que no le puso auditoría heredando el criterio de `recipe_lines`. El motivo del cambio: allí editar una línea es editar la fórmula y el rastro queda en `recipes.updated_by`; aquí **subir el costo es un hecho comercial propio** que no modifica nada más del proveedor. **Es una migración**, barata ahora con el catálogo vacío. Se descartó la alternativa de tocar `suppliers.updated_by`: barata pero imprecisa, no distingue qué línea cambió |
| 2026-09-03 | ¿Un costo de 0 es una línea válida? | **NO: tiene que ser mayor que cero.** Hoy la base solo prohíbe negativos. Un cero casi siempre es un dato a medio escribir. **Es una migración** —un `CHECK` distinto— y cerrarla ahora evita la limpieza de datos que costaría después. Consecuencia aceptada: **una muestra gratis no se puede registrar como línea de catálogo** |
| 2026-09-03 | ¿Cómo se consulta el catálogo de un proveedor? | **Listado propio y paginado por proveedor**, con el mismo defecto de **10** y tope de **25** que ya aplica `lib/shared/pagination` (QC-20, D15/D16/D21). No se devuelven las líneas dentro del proveedor: un proveedor químico puede tener cientos de referencias y eso no escala |
| 2026-09-03 | ¿Se puede recuperar un proveedor dado de baja? | **NO.** La fila se conserva con su marca de borrado —no se pierde histórico ni se rompe nada que la referencie— pero **no hay operación de restaurar**, igual que en el catálogo de productos de QC-20. Si un proveedor vuelve, se da de alta otra vez. Se descartó reactivar: es un caso de uso más y choca con que el nombre único **solo mira a los vivos** (decisión 8 de QC-42), así que otro proveedor puede haber tomado ese nombre mientras tanto |
| 2026-09-03 | Al dar de baja un proveedor, ¿qué pasa con sus líneas? | **Dejan de aparecer con él.** La baja es lógica, así que las líneas siguen en la base, pero **ninguna consulta del catálogo devuelve las de un proveedor dado de baja**. Es coherente con que consultar proveedores tampoco lo devuelva. El filtro de borrado lógico en las consultas **es de esta ficha**: QC-42 no tiene ninguna consulta (su `design.md > 310`) |
| 2026-09-03 | ¿E2E? | **Diferido con motivo, a QC-44.** Esta ficha es backend puro y no aporta nada navegable: un Playwright no tendría pantalla que abrir. Mismo motivo por el que QC-42 lo difirió (su decisión 21) y por el que QC-20 lo dejó a QC-22 — que efectivamente lo trajo y pasó en Chromium y WebKit. **El diferimiento se declara aquí, no al final** |
| 2026-09-03 | Las 22 decisiones de modelo de QC-42 | **Se heredan enteras y no se reabren**, salvo las dos que esta tabla modifica expresamente (la 14, auditoría de la línea; y el `CHECK` de contacto de la 7). En particular siguen firmes: módulo propio `proveedores` conociendo el producto por el contrato de `inventario`; la relación proveedor-producto como entidad propia única por pareja; `decimal(14,4)` sin negativos; el mínimo admite fracciones; nombre único normalizado con índice parcial; sin unicidad ni formato en correo y teléfono; la línea se va con su proveedor en `CASCADE` y un producto dado de baja **no** se la lleva (`RESTRICT`); FK escalares sin `@relation`; moneda implícita; identificadores en inglés; RLS activada y forzada |
| 2026-09-03 | Mutaciones y consultas | **Server Actions**, heredado de QC-20: `create`/`update`/`delete` reciben `FormData` porque salen de un formulario; `get`/`list` reciben argumentos ya tipados. Prohibido `fetch` a API routes propias |
| 2026-09-03 | ¿De dónde sale el usuario en sesión? | De **`identity.getSessionUser()` vía `@/lib/composition`** (QC-20, D17). **Ningún caso de uso lee sesión, cookie ni cabecera por su cuenta**, y la Server Action **no decide nada**: traduce entrada y resultado, no repite reglas de negocio |
| 2026-09-03 | Errores | Clases de error de dominio traducidas por la Server Action a `{ status: 'error', code, message }` con el **`code` estable de la clase, nunca el texto** — mismo patrón que `inventario` e `identity`. Nada de `catch` vacíos (`docs/conventions.md`) |
| 2026-09-03 | Orden por defecto del listado | **Por nombre ascendente**, heredado de QC-20, con un desempate estable |
| 2026-09-03 | Largos máximos | En la **validación de aplicación** con `zod`, no en la columna (decisión 15 de QC-42) |
| 2026-09-03 | Migración | Con su **`down.sql` que revierte al esquema exacto anterior** (decisión 19 de QC-42), y el gate lo verifica |
| 2026-09-03 | Dependencias nuevas | **Ninguna.** Si el diseño creyera necesitar una librería, el `backend_dev` **para y la propone**; no la instala (regla 7 de `CLAUDE.md`, y `tests/guards/guard-dependencias-aprobadas.test.ts` lo pondría en rojo) |
| 2026-09-03 | Puertos y adaptadores | QC-42 los dejó **vacíos con `.gitkeep`** esperando a esta ficha (`design.md > 412`). Se llenan aquí, y los `.gitkeep` se borran al poner el primer archivo real. El cableado puerto→implementación es **exclusivo de `lib/composition`** |
