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

_Pendiente: los escribe spec_author (F1.2)._

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

**P3 — El mínimo de compra no dice en qué se mide.** Se lee según la unidad del producto, que
QC-32 dejó **opcional**: un mínimo de `2,5` sobre un producto sin unidad es ambiguo. Heredada de
QC-42 (pregunta 4). No se añade columna de unidad a la línea: hacerlo después es barato mientras
el catálogo esté vacío.

**P4 — Nada concilia el costo del producto con el del catálogo.** Conviven a propósito (decisión 2
de QC-42) y pueden contradecirse sin que ninguna capa se queje. Heredada de QC-42 (pregunta 3).
Hoy no hay dueño.

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
