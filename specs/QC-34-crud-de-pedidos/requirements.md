# QC-34 — crud-de-pedidos · requirements.md

> **Zona:** `backend` · **Complejidad:** `high` · **depends_on:** `QC-33`, `QC-8` ·
> **Rama:** `feature/QC-34-crud-de-pedidos`
>
> **Alcance.** Los casos de uso de pedidos sobre el modelo que dejó **QC-33**: alta, consulta
> paginada, edición, **cancelación** y borrado, con su superficie de servidor (Server Actions) y
> sin pantalla. Entra además **una migración**, porque la acotación añadió un cuarto estado
> —`CANCELADO`— con su motivo, y cambió la restricción de borrado que QC-33 escribió en la base.
> Es la ficha que decide los permisos, las transiciones de estado y quién calcula el número
> correlativo: las tres cosas que QC-33 dejó escritas para aquí.
>
> **Lo que NO entra.** La pantalla y todo lo visual, que es **QC-35**. Las **devoluciones**: un
> pedido entregado no se deshace, y hoy no existe ficha que lo resuelva (pregunta abierta 1). El
> modelo de recetas y el de unidades no se tocan más allá de lo que sus **contratos públicos**
> deban publicar para que esta ficha lea nombres. La caché de sesión es **QC-28** y el registro de
> sesiones **QC-23**: aquí la sesión se consume tal como está hoy.
>
> Sembrado por `/afinar-feature` el 2026-09-04. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

No se rellenan con supuestos (regla 6 de `CLAUDE.md`).

1. **¿Qué se hace cuando un pedido entregado no debió salir?** La acotación cerró que de
   `ENTREGADO` no se sale: no se cancela, no se edita y no se borra. Eso deja sin resolver el caso
   real de una devolución o de un despacho registrado por error. **No hay ficha para ello y no se
   crea ninguna aquí**: crearla obligaría a inventar el alcance de un módulo de devoluciones que
   nadie ha pedido. La salida disponible hoy es crear otro pedido, y no compensa la fila
   equivocada.
2. **¿El sistema exporta alguna vez a un contable externo?** Heredada de **QC-33** (su pregunta
   abierta 1) y sigue igual de abierta: el ERP no factura ni liquida impuestos y los totales se
   calculan sin guardarse, pero nunca se evaluó si hay que entregar esos datos a una contabilidad
   de fuera. No afecta a esta ficha; se arrastra para que no se pierda.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
| --- | --- | --- |
| 2026-09-04 | ¿Quién puede consultar, crear, editar, cancelar y borrar pedidos? | **Solo Administrador, en las cinco operaciones.** El Operador ni siquiera consulta. Se valida **en el service, primera línea del caso de uso** (`docs/architecture.md > Acceso a datos y autorizacion`) y `CHECKPOINTS.md` exige su test: una policy de RLS no cuenta como implementado. Heredado de **QC-20 D2**, **QC-25** y **QC-43**, y lo anticipaba **QC-33** («los permisos los fija QC-34»). Consecuencia: la pantalla de **QC-35** tampoco la ve el Operador |
| 2026-09-04 | ¿El alta recibe una fecha de solicitud? | **No, y la ficha del board decía lo contrario.** La fecha de solicitud **es** `created_at`: la pone el sistema y no se edita. Heredado de **QC-33** (su decisión 10 y **R4**), que ya cerró que una segunda columna con el mismo dato solo puede divergir. La `description` del issue QC-34 **se reescribió antes de sembrar esto** |
| 2026-09-04 | ¿Hay un estado de cancelación? | **Sí: cuarto estado `CANCELADO`**, valor nuevo del tipo enumerado `OrderStatus`. **Esto trae migración**, y es exactamente el coste que **QC-33** asumió a conciencia al elegir enum en vez de tabla («añadir un valor será una migración del tipo») |
| 2026-09-04 | El motivo de la cancelación | **Columna nueva en el pedido, obligatoria al cancelar.** Cancelar sin motivo se rechaza, y **escribir motivo sin cancelar también**: el motivo solo existe en un pedido cancelado. Se **conserva** —no se limpia ni se pierde— y no se puede editar después, porque de `CANCELADO` no se sale. Tope de **500** caracteres en la **validación de aplicación** con `zod`, no en la columna (heredado de **QC-43** y de **QC-42 D15**) |
| 2026-09-04 | ¿Qué transiciones de estado son válidas? | **Solo hacia delante:** `PENDIENTE → EN_CURSO`, `EN_CURSO → ENTREGADO` y `PENDIENTE → ENTREGADO` (se despachó sin pasar por producción). **No se retrocede.** `ENTREGADO` y `CANCELADO` son **finales**. Cierra lo que **QC-33 R19** dejó explícitamente para esta ficha: la base no restringe nada, la restricción es de aplicación y lleva su test |
| 2026-09-04 | ¿Desde dónde se cancela? | **Desde `PENDIENTE` y desde `EN_CURSO`**, nunca desde `ENTREGADO` —eso sería una devolución, que no existe (pregunta abierta 1)— ni desde un pedido ya cancelado. Si el cliente rectifica después de entregado, se crea un pedido nuevo |
| 2026-09-04 | ¿Cancelar es edición o caso de uso propio? | **Caso de uso propio**, y el **único** camino que escribe `CANCELADO`. La edición normal **no puede cancelar**. Así el «motivo obligatorio» se garantiza en un solo sitio, y la operación tiene nombre propio para el permiso, para su test y para **QC-35** |
| 2026-09-04 | ¿Qué se puede editar de un pedido que ya avanzó? | Mientras está `PENDIENTE` o `EN_CURSO` se corrige **todo**: receta, cantidad, precio, unidad, prioridad y estado (dentro de las transiciones válidas). Un pedido **`ENTREGADO` o `CANCELADO` no admite ninguna edición**, ni siquiera la prioridad: es el registro de lo que pasó. Lo de `CANCELADO` se sigue de que es final, igual que `ENTREGADO` |
| 2026-09-04 | ¿Qué pedidos se pueden borrar? | **Ni `ENTREGADO` ni `CANCELADO`.** Se cancela para dejar constancia, así que borrarlo después la borraría de las consultas. **Cambia la restricción que escribió QC-33** (`deleted_at IS NULL OR status <> 'ENTREGADO'`, su **R29**), que pasa a excluir también `CANCELADO`, **en la base y no solo en la aplicación** — misma filosofía que **QC-20 D16**. Va en la misma migración de esta ficha. El borrado sigue siendo **lógico y sin restaurar** (**QC-4**, **QC-20 D5**, **QC-25**) |
| 2026-09-04 | ¿Quién calcula el número correlativo, y qué pasa con dos altas simultáneas? | **Una secuencia de la base por año.** La base entrega el siguiente número, así que dos altas simultáneas no compiten y ninguna falla con un error de índice único que nadie tradujo. **Cierra la pregunta abierta 2 de QC-33**, que subía aquí explícitamente. Se descartó leer el máximo del año y reintentar (carrera real bajo concurrencia) y serializar con bloqueo (convierte cada alta en una cola). **Se aceptan huecos**, ya decidido el 2026-09-03 (**QC-33 R42**): el número de un alta que se cae se pierde y nadie lo reutiliza |
| 2026-09-04 | Forma de la consulta | **Paginada, 10 por página por defecto y tope 25**, **reutilizando** `lib/shared/pagination` (**QC-20 D15/D16/D21**, ya reutilizado por **QC-25** y **QC-43**). Duplicar ese cálculo sería justo el error que el util existe para evitar |
| 2026-09-04 | ¿Hay filtros en la consulta? | **Sí: por estado y por prioridad**, opcionales y combinables. Sin filtro salen todos. **Sin búsqueda por texto** y sin filtro por número: lo que se busca de un pedido es su número, y eso llega mejor como filtro exacto el día que haga falta. **Los borrados no salen nunca; los cancelados sí** —para eso tienen estado propio en vez de desaparecer |
| 2026-09-04 | Orden por defecto del listado | **Por prioridad descendente** (`CRITICA` primero, siguiendo el orden de declaración del enum que fijó **QC-33 R16**) y, dentro de cada prioridad, **por antigüedad ascendente**. **Desempate por el correlativo** (año y posición), que es único y hace el orden total y la paginación estable. Se aparta del `name ASC` de **QC-20** y **QC-25** a propósito: un pedido no tiene nombre y lo que importa es a qué atender antes. Consecuencia asumida: la lista **cambia de forma cuando alguien sube una prioridad** |
| 2026-09-04 | ¿La consulta devuelve ids o nombres de la receta y la unidad? | **También los nombres**, resueltos por los **contratos públicos** `@/lib/modules/recetas` y `@/lib/modules/unidades` —nunca por sus tablas (**QC-33 R32**)—. Se aparta de **QC-20 D21** y **QC-25**, que devuelven solo ids y dejan resolver al front. Coste aceptado: una lectura extra por página. Lo que **no** cambia: los autores siguen llegando como **ids**, y resolverlos es de **QC-35** |
| 2026-09-04 | ¿Y si la receta del pedido está dada de baja? | **Se devuelve su nombre igual.** Un pedido conserva su referencia aunque la receta se dé de baja (**QC-33 R15**), así que la fila tiene que seguir diciendo qué se pidió. Obliga a que el contrato de `recetas` publique una **consulta por ids que incluya las dadas de baja** — trabajo **dentro de `recetas`**, exactamente como **QC-25** hizo con `ProductCatalog` y con `UnitCatalog` |
| 2026-09-04 | ¿Se puede editar un pedido cuya receta está dada de baja? | **Sí: se admite la receta que el pedido ya tenía.** La existencia y vigencia de la receta se exige **solo cuando cambia**, así que sigue siendo imposible **poner** una receta inexistente o de baja, pero corregir la cantidad de un pedido viejo no obliga a cambiarle la fórmula. Heredado literal de **QC-25** (su pregunta 7), que resolvió el mismo choque con los productos |
| 2026-09-04 | ¿Qué se rechaza antes de guardar? | Receta ausente, inexistente o dada de baja (salvo la que ya estaba, fila anterior); unidad ausente o inexistente; cantidad ausente, negativa o cero; precio ausente o negativo —**cero sí vale**, **QC-33 R9**—; prioridad o estado fuera de su conjunto cerrado; una transición de estado no permitida; cancelar sin motivo; motivo sin cancelar; y editar o borrar un pedido `ENTREGADO` o `CANCELADO` |
| 2026-09-04 | ¿De dónde salen el autor y el usuario en sesión? | De **`identity.getSessionUser()` vía `@/lib/composition`** (**QC-20 D17**, **QC-43**). `created_by` y `updated_by` se toman **de la sesión y nunca de la entrada**; el service recibe el actor y su rol **por parámetro** y **ningún caso de uso lee cookie, cabecera ni sesión por su cuenta** |
| 2026-09-04 | Mutaciones y consultas | **Server Actions** en `adapters/driving/`, no Route Handlers (`docs/architecture.md > Server Actions vs Route Handlers`). `create`/`update`/`cancel`/`delete` reciben `FormData` porque salen de un formulario; `get`/`list` reciben argumentos ya tipados. **Prohibido `fetch` a API routes propias.** Validación de entrada con **zod** en el borde (`docs/conventions.md`). Heredado de **QC-20** y **QC-43** |
| 2026-09-04 | Errores | Clases de error de dominio traducidas por la Server Action a `{ status: 'error', code, message }` con el **`code` estable de la clase, nunca el texto**, como `inventario`, `recetas` e `identity`. Nada de `catch` vacíos (`docs/conventions.md`) |
| 2026-09-04 | Módulo y frontera | Módulo **`pedidos`**, que **QC-33** dejó con `domain/` poblado y `ports/` y `adapters/` vacíos con `.gitkeep`: **se llenan aquí** y los `.gitkeep` se borran al poner el primer archivo real. El cableado puerto→implementación es **exclusivo de `lib/composition`**. La receta y la unidad se conocen **solo** por sus contratos públicos, nunca por sus tablas, modelos de Prisma ni repositorios (**QC-33 R31-R34**, **QC-15**) |
| 2026-09-04 | Migración | Una sola migración con su **`down.sql`** obligatorio (**QC-4 R20**, **QC-42 D19**), que revierte al esquema exacto anterior y que el gate verifica. **Ojo:** Postgres **no sabe quitar un valor de un tipo enumerado**, así que el `down.sql` tiene que **recrear el tipo** —y no basta con un `ALTER TYPE ... DROP VALUE`, que no existe. Es la parte cara de la decisión del cuarto estado y se asume sabiéndolo |
| 2026-09-04 | Idioma, RLS y total | Identificadores de la base en **inglés**, valores del enum en castellano (**QC-33 R36**). **RLS ya está activada y forzada** en `orders` por QC-33 y **no sustituye** a la autorización del service. El **total sigue sin guardarse** (**QC-33 R10**): esta ficha no lo persiste ni añade columna para él |
| 2026-09-04 | E2E | **Diferido con motivo, a QC-35**: esta ficha es backend puro y no aporta ningún flujo navegable que Playwright pueda visitar. **El diferimiento se declara aquí, no al final.** Mismo criterio que **QC-20 D4**, **QC-24**, **QC-25**, **QC-33** y **QC-43** |
| 2026-09-04 | Dependencias nuevas | **Ninguna.** Si el diseño creyera necesitar una librería, el `backend_dev` **para y la propone**; no la instala (regla 7 de `CLAUDE.md`, y `tests/guards/guard-dependencias-aprobadas.test.ts` lo pondría en rojo) |
