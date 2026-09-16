# QC-88 — listado-de-pedidos-asignados · requirements.md

> **Zona** `fullstack` · **Complejidad** `high` · **depends_on** QC-86 (hecha) ·
> **Rama** `feature/QC-88-listado-de-pedidos-asignados` · **Bloquea** QC-63
>
> **Alcance.** La **lista de trabajo del Operador**: los pedidos que tiene asignados, en
> **PENDIENTE** y **EN_CURSO**, en una **pantalla propia** con su item de menu, cortada por
> `asignaciones.consultar`. Cada fila muestra numero, receta, cantidad, prioridad, estado y **los
> demas responsables** como grupo de avatares, con el nombre del grupo cuando la asignacion vino de
> uno. Un pedido **EN_CURSO** se ve con el disparador de entrar **deshabilitado y con su motivo**.
> Monta la **tabla compartida** (QC-55) y compone los responsables **en lote**, como QC-102.
>
> **Medido en disco el 2026-09-15, y es lo que la hace `fullstack`.** La consulta «los pedidos de
> esta persona» **no existe**: `OrderAssignmentRepository` solo va al reves —`listByOrderInCompany`,
> `listByOrdersInCompany` (QC-102)— y borra. Hay indice `order_assignments_user_id_idx`, asi que es
> barata, pero hay que **crearla**: metodo de puerto, adaptador y caso de uso. Ademas el listado de
> pedidos **no admite filtrar por un conjunto de ids** —`ORDER_QUERYABLE` declara `status`,
> `priority` y `createdAt`, con `searchable: false`— y **QC-33 R53 prohibe el JOIN** entre `orders` y
> `order_assignments`.
>
> **Lo que NO entra.**
> - **Ejecutar la receta paso a paso**: es **QC-63**, que empieza donde esta lista termina y es quien
>   aplica en el servidor la regla del pedido ya tomado.
> - **Asignar responsables**: es **QC-87**.
> - **Guardar quien abrio el pedido**: no se anade ese dato. Hoy solo existen el estado del pedido y
>   `orders.updated_by`, que es «quien lo toco por ultima vez».
> - **Cambiar el estado del pedido** desde esta lista: las transiciones son de QC-34 y las dispara
>   QC-63 al ejecutar.
>
> *Sembrado por `/afinar-feature` el 2026-09-15. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijo el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aqui es `## Requisitos (EARS)`.*

## Requisitos (EARS)

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

1. **¿Como se llama la ruta y su item de menu?** La decision cerrada 1 fija que hay **pantalla
   propia**, no cual es su direccion ni su etiqueta. `lib/shared/routes.ts` declara una constante por
   pantalla y `order-route-contract.test.ts` vigila que ninguna se redeclare, asi que la ruta nueva
   nace con su constante y su prueba. `spec_author` **propone** nombre de ruta y etiqueta en
   `design.md` y el humano los aprueba en F1.4; si no hay respuesta, no se inventa un nombre
   definitivo en el codigo.

2. **¿Donde se compone la lista: ampliando `pedidos` o solo desde `asignaciones`?** Hacen falta dos
   lecturas —los pedidos de la persona y los datos de esos pedidos— y hoy `pedidos` no sabe leer un
   conjunto de ids. `spec_author` decide en `design.md` entre anadir esa lectura al modulo `pedidos`
   o resolverlo desde `asignaciones`, **midiendo el numero de consultas por pagina** y respetando
   QC-33 R53 (sin JOIN) y la regla de dependencias entre modulos. Lo declara; no lo da por hecho.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decision |
|---|---|---|
| 2026-09-15 | ¿Por donde entra el Operador a su lista de trabajo? | **Pantalla propia, ruta nueva**, con su item de menu y el permiso **`asignaciones.consultar`**, que el Operador ya tiene (`SEED_ROLE_PERMISSIONS`). **NO se reutiliza `/pedidos`**: exige `pedidos.consultar`, que el Operador no tiene, y darselo le abriria el listado completo de la empresa |
| 2026-09-15 | Un pedido EN_CURSO, ¿que ve quien no lo abrio? | **Se ve, con el disparador de entrar DESHABILITADO y su motivo.** La regla de verdad —rechazar la ejecucion— la aplica **QC-63 en el servidor**: esta ficha no la duplica ni la adelanta |
| 2026-09-15 | ¿Se guarda quien esta preparando el pedido? | **No.** Hoy no existe el dato y **no se anade**: nada de columna ni tabla nueva. La fila **muestra a sus responsables**, que ya se saben, y no afirma quien lo abrio. `updated_by` **no** se usa para esto: lo escribe cualquier edicion, incluida la de un Administrador |
| 2026-09-15 | ¿Que pedidos entran? | **Solo `PENDIENTE` y `EN_CURSO`.** Los `ENTREGADO` y `CANCELADO` no aparecen: es una lista de trabajo, no un historial, y nadie los archiva a mano. **Heredado de la acotacion de QC-63** (2026-09-08) |
| 2026-09-15 | ¿Que muestra cada fila? | Numero, receta, cantidad, prioridad, estado y **los demas responsables** como avatares, con el **nombre del grupo** cuando la asignacion vino de uno. **Heredado de QC-63**; el nombre del grupo **no cuesta join**, porque QC-86 lo congelo dentro de la fila |
| 2026-09-15 | ¿Con que se pinta la lista? | **La tabla compartida de QC-55**, ya migrada en siete pantallas, y la composicion de responsables **en lote** de QC-102 (`listByOrdersInCompany`): ni una consulta por fila ni un JOIN |
| 2026-09-15 | Estados vacio, error y carga | **Fuera de la tabla**, como en productos, pedidos, recetas y proveedores. **Heredado de QC-56 D12**, que corrigio lo que QC-55 habia dejado dicho |
| 2026-09-15 | ¿Quien trae los datos? | **La pantalla, en el servidor, y los pasa por props.** Ningun componente de cliente invoca la operacion de listado. **Heredado de QC-55 y QC-22** |
| 2026-09-15 | Permisos | **`asignaciones.consultar` para ver la pantalla**, y la autorizacion **se valida en el caso de uso**, no solo en la ruta: `docs/architecture.md > Acceso a datos y autorizacion` y `CHECKPOINTS.md` exigen su test. Un corte de ruta **no cuenta** como permiso implementado |
| 2026-09-15 | Aislamiento por empresa | **La consulta nueva filtra por empresa**, como todo el modulo `asignaciones` desde QC-86: `companyId` primero, para que una llamada que lo olvide no compile |
| 2026-09-15 | Tamano de pagina y multiplataforma | **10 y 25** desde `lib/shared/pagination`, y **sin excepcion de escritorio**. Heredado de **QC-22** |
| 2026-09-15 | ¿Hace falta E2E? | **Si**: el recorrido del Operador que entra, ve solo sus pedidos ejecutables y encuentra uno EN_CURSO que no puede abrir. `CHECKPOINTS.md` lo pide para permisos, y esta pantalla **es** la puerta del Operador. Se corre en **Chromium y WebKit** |
| 2026-09-15 | ¿Dependencia nueva? | **Ninguna.** La tabla, los avatares y el contrato de lista ya estan montados |
| 2026-09-15 | ¿Zona y complejidad? | **`fullstack` / `high`.** Estrena pantalla, ruta, item de menu y **una consulta que no existe**, con su puerto y su adaptador |
