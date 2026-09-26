# QC-74 — modelo-de-permisos · requirements.md

> **Zona** `backend` · **Complejidad** `high` · **depends_on** QC-54 ·
> **Rama** `feature/QC-74-modelo-de-permisos`
>
> ## Alcance
>
> Sustituir la única pregunta de autorización que existe hoy —«¿es Administrador?», repetida
> dentro de cinco módulos— por un modelo de permisos por módulo. Cada módulo declara dos
> permisos, **consultar** y **modificar**; un rol es el conjunto de permisos que tiene
> asignados, en base y sembrado. Los cinco servicios pasan a exigir el permiso concreto en
> lugar del rol, sin cambiar dónde se autoriza: sigue siendo el servicio, antes del
> repositorio. Entra una guardia contra el olvido.
>
> ## Lo que NO entra
>
> - **Nada de UI**: ni menú, ni 404 por ruta, ni destino del login. Todo eso es **QC-75**.
> - **El middleware no se toca en esta ficha.** `ROUTE_ROLE_RULES` sigue como está y sigue
>   cortando por rol; se retira en QC-75, que es quien pone el corte nuevo en su sitio.
> - **Pantalla para administrar roles y permisos**: no existe y no se crea. El catálogo se
>   cambia por seed y migración, igual que los roles desde QC-4.
> - **Permisos por empresa**: no. `docs/architecture.md > Dominio` los nombra entre lo que
>   el reviewer rechaza como sobre-ingeniería. El permiso cuelga del rol.
>
> _Sembrado por `/afinar-feature` el 2026-09-07. El bloque de Alcance y la tabla de
> «Decisiones cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los
> reabre y no los reescribe: su trabajo aquí es `## Requisitos (EARS)`._

## Requisitos (EARS)

> Notacion EARS (`docs/specs.md`). «Permiso» significa siempre un codigo del catalogo
> (`<modulo>.<accion>`), nunca un nombre de rol. «Servicio» / «caso de uso» significa una funcion
> de `lib/modules/<m>/domain/`, que es donde se autoriza hoy y donde se sigue autorizando.

### El catalogo de permisos

**R1.** El sistema DEBE declarar un catalogo cerrado de permisos en un unico lugar del codigo de
produccion, donde cada permiso tiene un codigo con la forma `<modulo>.<accion>`, con `<modulo>` y
`<accion>` escritos en español y en minusculas, siguiendo los nombres de modulo del repositorio
(`inventario`, `recetas`, `unidades`, `proveedores`, `pedidos`, `dashboard`).

**R2.** El catalogo DEBE contener exactamente estos diez permisos, ni uno mas ni uno menos:
`dashboard.consultar`, `inventario.consultar`, `inventario.modificar`, `recetas.consultar`,
`recetas.modificar`, `unidades.consultar`, `proveedores.consultar`, `proveedores.modificar`,
`pedidos.consultar`, `pedidos.modificar`.

**R3.** DONDE un modulo tiene casos de uso de escritura, el sistema DEBE declarar para ese modulo
los dos permisos `<modulo>.consultar` y `<modulo>.modificar`, y el permiso `<modulo>.modificar`
DEBE cubrir tambien el borrado.

> *Enmendado el 2026-09-25 por QC-168: `empaque` es el primer módulo solo de escritura. Declara
> únicamente `empaque.modificar`, sin `empaque.consultar` —el Empacador no consulta inventario, y
> «consultar» mentiría sobre un módulo que solo escribe—. `MODULOS_SOLO_ESCRITURA` documenta la
> excepción.*

**R4.** SI un modulo no tiene ningun caso de uso de escritura, ENTONCES el sistema DEBE declarar
para ese modulo unicamente `<modulo>.consultar` (hoy: `dashboard` y `unidades`).

**R5.** El sistema NO DEBE ofrecer ninguna via de aplicacion —Server Action, route handler ni
caso de uso— que cree, edite o borre un permiso del catalogo o una asignacion de permiso a un rol;
el catalogo y las asignaciones solo cambian por migracion y seed.

**R6.** El sistema DEBE asignar un permiso unicamente a un rol, y NO DEBE admitir ninguna
asignacion de permiso condicionada a una empresa: ni la tabla de asignacion ni el modelo de
dominio del permiso tienen columna ni campo de empresa.

### El conjunto de permisos de un rol

**R7.** El sistema DEBE persistir el catalogo de permisos y la asignacion permiso-rol en la base
de datos, y DEBE resolver los permisos de un actor a partir de esa asignacion, nunca a partir del
nombre de su rol.

**R8.** El sistema DEBE asignar al rol `Administrador` los diez permisos del catalogo, escritos
uno a uno, y NO DEBE reconocer ningun comodin ni regla implicita que conceda permisos por ser
`Administrador`.

> *Enmendado el 2026-09-25 por QC-168: el Administrador deja de recibir el catálogo entero.
> `empaque.modificar` queda fuera: es el primer permiso que `ADMIN_EXCLUDED_PERMISSIONS` excluye de
> su asignación en el seed.*

**R9.** El sistema DEBE asignar al rol `Operador` exactamente un permiso: `inventario.consultar`.

**R10.** CUANDO corre el seed, el sistema DEBE crear solo los permisos del catalogo y las
asignaciones permiso-rol que falten, y DEBE dejar intactas las que ya existan; correr el seed dos
veces seguidas DEBE producir el mismo estado que correrlo una vez.

**R11.** CUANDO se lee la sesion de un usuario, el sistema DEBE resolver el conjunto de permisos
vigente de su rol en la base en esa misma lectura, sin una consulta adicional por peticion, y DEBE
entregarlo al servicio junto con el identificador del actor.

### La comprobacion del permiso

**R12.** El sistema DEBE comprobar el permiso dentro del caso de uso, ANTES de invocar ningun
puerto —repositorio, log o cualquier otro— y antes de validar la entrada.

**R13.** El sistema DEBE decidir el acceso por pertenencia exacta del codigo al conjunto de
permisos del actor, sin normalizacion, sin coincidencia parcial y sin ninguna implicacion entre
permisos: tener `<modulo>.modificar` NO concede `<modulo>.consultar`, y tener `<modulo>.consultar`
NO concede `<modulo>.modificar`.

**R14.** SI el actor es nulo, no tiene conjunto de permisos, lo tiene vacio, o su conjunto no
contiene el codigo exigido, ENTONCES el sistema DEBE rechazar la operacion sin efectos sobre los
datos y sin revelar nada del recurso pedido.

**R15.** CUANDO un caso de uso rechaza por falta de permiso, el sistema DEBE lanzar el error de
autorizacion **del propio modulo** —subclase de la clase de error raiz de ese modulo—, de modo que
los adaptadores driving lo sigan serializando con su comprobacion `error instanceof <Modulo>Error`
y con el mismo codigo estable que hoy.

**R16.** El sistema DEBE exigir en cada caso de uso de los cinco modulos exactamente el permiso de
esta tabla, y NO DEBE exigir ningun otro:

| Modulo | Casos de uso | Permiso exigido |
|---|---|---|
| `inventario` | `getProduct`, `listProducts`, `listPresentations` | `inventario.consultar` |
| `inventario` | `createProduct`, `updateProduct`, `deleteProduct`, `createPresentation`, `updatePresentation`, `deletePresentation` | `inventario.modificar` |
| `recetas` | `getRecipe`, `listRecipes` | `recetas.consultar` |
| `recetas` | `createRecipe`, `updateRecipe`, `deleteRecipe` | `recetas.modificar` |
| `unidades` | `listUnits` | `unidades.consultar` |
| `proveedores` | `getSupplier`, `listSuppliers`, `listCatalogLines` | `proveedores.consultar` |
| `proveedores` | `createSupplier`, `updateSupplier`, `deleteSupplier`, `createCatalogLine`, `updateCatalogLine`, `deleteCatalogLine` | `proveedores.modificar` |
| `pedidos` | `getOrder`, `listOrders` | `pedidos.consultar` |
| `pedidos` | `createOrder`, `updateOrder`, `cancelOrder`, `deleteOrder` | `pedidos.modificar` |

**R17.** El sistema DEBE conceder la operacion CUANDO el conjunto de permisos del actor contiene
el codigo exigido, sea cual sea el nombre de su rol; en particular, un actor con
`inventario.consultar` DEBE poder consultar el catalogo de producto y DEBE ser rechazado en toda
operacion de escritura de `inventario` y en todos los casos de uso de los otros cuatro modulos.

**R18.** Ningun caso de uso ni adaptador de los modulos `inventario`, `recetas`, `unidades`,
`proveedores` y `pedidos` DEBE leer, comparar ni recibir el nombre del rol del actor: el tipo
`Actor` de cada uno de esos modulos NO DEBE tener campo de nombre de rol.

### Las guardias

**R19.** SI un permiso declarado en el catalogo no esta asignado a ningun rol en el seed, ENTONCES
una guardia ejecutable de `tests/guards/` DEBE fallar nombrando ese permiso.

**R20.** SI un archivo de produccion de los cinco modulos de negocio autoriza por nombre de rol
—usa el literal o la constante de un rol, la comprobacion «es Administrador» heredada de QC-54, o
un campo de nombre de rol en su `Actor`—, ENTONCES una guardia ejecutable de `tests/guards/` DEBE
fallar nombrando ese archivo.

**R21.** Las dos guardias DEBEN derivar lo que comprueban del catalogo y del seed reales —no de
una copia escrita a mano— y DEBEN demostrar sobre fuentes sinteticos que disparan ante la
infraccion y que no disparan ante el caso correcto simetrico.

### Datos y alcance

**R22.** El sistema DEBE crear las tablas nuevas con una migracion versionada que tenga su
`down.sql`, con `ENABLE ROW LEVEL SECURITY` y `FORCE ROW LEVEL SECURITY` en cada tabla nueva, y
`pnpm run db:rollback` DEBE revertirla dejando `_prisma_migrations` coherente.

**R23.** El sistema DEBE dejar el corte de rutas por rol del middleware exactamente como esta: las
reglas ruta -> rol y su comportamiento NO cambian en esta feature.

**R24.** El sistema DEBE probar en cada caso de uso de los cinco modulos tanto la concesion con el
permiso exigido como el rechazo sin el, en tests de servicio; esta feature NO añade ningun test
E2E, que corresponde a QC-75 cuando exista la pantalla.

## Preguntas abiertas

1. **QC-28 (caché de sesión en Redis) todavía no está construida, y este modelo le añade
   carga.** Esa ficha ya exige que dar de baja a alguien o cambiarle el rol borre su dato
   cacheado en el acto. Falta decidir si **cambiar los permisos de un rol** debe invalidar
   el caché de todos los usuarios que lo tienen, o si el minuto de caducidad basta. No se
   decide aquí porque el caché no existe todavía; se decide al acotar QC-28.
2. **El tercer rol.** Todo lo cerrado abajo funciona con Administrador y Operador, que son
   los dos que siembra QC-6. Si el negocio ya sabe que habrá un Supervisor o un Auxiliar de
   bodega, decirlo antes del diseño ahorra una migración de datos sembrados.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-09-07 | ¿El permiso es «entrar al módulo» o distingue ver de modificar? | **Dos permisos por módulo: consultar y modificar.** Un permiso único dejaría que quien consulta recetas también las edite, y QC-63 (`ejecutar-receta-operador`) ya tiene escrito lo contrario: el Operador sigue la fórmula en planta «sin poder modificar nada». Se descartó una fila por operación (consultar/crear/editar/borrar): 20+ permisos y ninguna ficha del backlog lo pide. **Borrar entra dentro de modificar.** |
| 2026-09-07 | ¿El Administrador pasa por ser Administrador, o tiene sus permisos escritos? | **Escritos uno a uno en el seed. Sin comodín.** Un comodín deja la ruta del permiso sin probar para el único rol que importa, y no ayuda el día que exista un tercero. El coste —un módulo nuevo tiene que sumarse al seed— se cubre con la guardia de abajo. |
| 2026-09-07 | ¿Modificar implica consultar? | **No: hacen falta los dos, y el seed los da juntos.** Preguntar por «consultar inventario» responde que sí solo si ese permiso está asignado. Sin reglas invisibles: lo que está en la tabla es lo que pasa, y el modelo no envejece mal si mañana aparece «aprobar» o «exportar». |
| 2026-09-07 | ¿Con qué permisos nace el Operador? | **Solo «consultar inventario».** Ve el catálogo y la ficha de un producto —mirar si queda hipoclorito antes de preparar la mezcla— y no crea, ni edita, ni borra. Recetas **no** entran: QC-63 abrirá esa lectura con su propio motivo, que es como se ha decidido que crezca el seed. |
| 2026-09-07 | ¿El dashboard lleva permiso propio? | **Sí, es un módulo más.** Regla uniforme, sin excepciones que recordar. La consecuencia —el login ya no puede llevar siempre ahí— se resuelve en QC-75: lleva a la primera pantalla con permiso. |
| 2026-09-07 | ¿Un módulo sin escritura declara igual los dos permisos? | **No: declara solo los que tiene.** El dashboard hoy solo puede consultarse, así que solo declara «consultar». Declarar un permiso que nadie puede ejercer es una fila que miente. |
| 2026-09-07 | ¿Entra una guardia contra la reincidencia? | **Sí, ejecutable en `tests/guards`**: rojo si un módulo declara un permiso que ningún rol tiene asignado en el seed, y rojo si un servicio sigue autorizando por nombre de rol en vez de por permiso. Sin ella la ficha arregla el presente y no el futuro — que es exactamente lo que pasó con `ADMIN_ROLE_NAME`, declarado cuatro veces teniendo uno bueno delante (QC-54). |
| 2026-09-07 | ¿Dónde se comprueba el permiso? | **En el service, antes del repositorio**, sin cambiar la frontera (`docs/architecture.md > Acceso a datos y autorizacion`). Los cinco `requireAdmin` pasan a ser `requirePermission`. **Encima de QC-54, no en su lugar**: aquélla deja una sola implementación, y sustituir una es quirúrgico donde sustituir cinco copias es su trabajo. De ahí el `depends_on`. |
| 2026-09-07 | ¿En qué idioma se nombran permisos y tablas? | **Tablas y columnas en inglés** (heredado de QC-4), **el valor del permiso en español**, siguiendo los nombres de módulo del repo y el precedente del rol `'Administrador'`: `inventario.consultar`, `inventario.modificar`. Un valor es dato, no identificador. |
| 2026-09-07 | ¿El permiso se puede dar por empresa? | **No.** Heredado de `docs/architecture.md > Dominio`, que lista «permisos por empresa más allá de su rol» entre lo que el reviewer rechaza. El permiso cuelga del rol; la empresa filtra datos y es la épica QC-46. |
| 2026-09-07 | ¿El catálogo de permisos es administrable? | **No, y sigue el precedente de los roles (QC-4): catálogo cerrado y corto, sin pantalla de administración.** Cambiarlo es una migración. Si algún día se administra, será dentro de la épica de usuarios (QC-66/QC-67), no aquí. |
| 2026-09-07 | ¿Hace falta E2E? | **Sí, y es de QC-75, no de esta ficha.** `CHECKPOINTS.md` nombra «permisos» entre los flujos críticos, pero aquí no hay pantalla que abrir: lo que cierra esta ficha son los tests de autorización en los cinco servicios, incluido el rechazo probado del acceso sin permiso. El E2E —el Operador entra, ve un menú corto y recibe 404 en inventario— vive donde existe la pantalla. |
