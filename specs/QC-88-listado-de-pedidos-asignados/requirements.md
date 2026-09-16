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

> Cada requisito cita entre corchetes la **decision cerrada** de la que sale (`[D1]`…`[D14]`, por
> orden de la tabla de abajo) o la **pregunta abierta** de la que depende (`[PA1]`, `[PA2]`).
> Ninguna fila de la tabla se queda sin requisito; el mapa esta al final de `design.md > 15`.
>
> **Donde dice «la operacion de listado»** se habla del caso de uso, no de la pantalla ni de la
> Server Action: **en que modulo vive lo decide el humano en F1.4** (`[PA2]`, propuesto en
> `design.md > 2.2`). Los requisitos estan escritos sobre el COMPORTAMIENTO para que la respuesta a
> esa pregunta no obligue a renumerarlos.

### Ruta, menu y acceso

- **R1.** El sistema DEBE declarar la direccion de esta pantalla en **una sola constante** de
  `lib/shared/routes.ts`, y todo archivo de producto que necesite esa direccion DEBE derivarla de
  ella en vez de escribirla como literal. `[D1]` `[PA1]`
- **R2.** El sistema DEBE incluir esa constante en `PRIVATE_ROUTE_PREFIXES` **exactamente una vez**,
  de modo que la pantalla no se sirva sin sesion valida. `[D1]`
- **R3.** El sistema DEBE publicar **un item de menu** cuyo `href` derive de la constante de R1 y
  que declare el permiso **`asignaciones.consultar`**, el mismo codigo que exige la pantalla. `[D1]`
- **R4.** SI la sesion no trae `asignaciones.consultar`, ENTONCES la pantalla DEBE responder **404**
  con el mismo contenido que cualquier otro 404 de la zona privada, **sin nombrar el modulo pedido
  ni mencionar permisos**. `[D1]` `[D9]`
- **R5.** La operacion de listado DEBE exigir **`asignaciones.consultar` en su primera linea**,
  antes de validar la entrada y **antes de tocar ningun puerto**. `[D9]`
- **R6.** SI el actor esta ausente, no trae conjunto de permisos, lo trae vacio o no contiene el
  codigo exigido, ENTONCES la operacion DEBE rechazar **los cuatro casos igual**, con el error de
  autorizacion del modulo y **sin haber tocado ningun puerto**. `[D9]`
- **R7.** La operacion de listado DEBE acotar **toda** lectura a la empresa del actor, con la
  empresa tomada del actor y **nunca de la entrada de la operacion**. `[D10]`
- **R8.** SI una asignacion pertenece a otra empresa, ENTONCES NO DEBE aparecer en la lista ni DEBE
  poder distinguirse de una que no existe. `[D10]`

### La consulta que no existe

- **R9.** El sistema DEBE ofrecer en el puerto de asignaciones una lectura **«los pedidos asignados
  a esta persona en esta empresa»**, con la empresa como **primer parametro**, de modo que una
  llamada que la olvide **no compile**. `[D14]` `[D10]`
- **R10.** El adaptador de persistencia DEBE resolver esa lectura en **una sola sentencia**, **sin
  `include` y sin navegar ninguna relacion** entre `orders` y `order_assignments`. `[D14]` `[D6]`
- **R11.** La lista DEBE contener **solo** los pedidos en estado **`PENDIENTE`** o **`EN_CURSO`**;
  un pedido `ENTREGADO` o `CANCELADO` NO DEBE aparecer, y el descarte DEBE ocurrir **antes de
  paginar**, de modo que el total describa lo que se muestra. `[D4]`
- **R12.** El contrato publico del modulo DEBE publicar la factoria del caso de uso y el tipo de su
  salida **sin arrastrar** `next/*`, `@prisma/client` ni ningun `'use server'` en su cierre de
  imports. `[D14]`
- **R13.** El cableado puerto → implementacion de la lectura nueva DEBE vivir **solo** en
  `lib/composition`. `[D14]`
- **R14.** El numero de consultas a la base por pagina DEBE ser **constante**: NO DEBE crecer con el
  numero de filas ni con el numero de responsables, ni con el tamano de pagina elegido. `[D6]`
- **R15.** La lista DEBE tener un orden **total y estable**: dos lecturas seguidas de la misma
  pagina, sin cambios en los datos, DEBEN devolver la misma secuencia. `[D6]`

### Lo que muestra cada fila

- **R16.** Cada fila DEBE mostrar el **numero visible** del pedido compuesto por la funcion de
  formato del contrato de `pedidos`, nunca compuesto a mano. `[D5]`
- **R17.** Cada fila DEBE mostrar **nombre de receta, cantidad, prioridad y estado**; y SI el nombre
  de la receta no se puede resolver, ENTONCES DEBE pintarse el marcador de ausencia de la pantalla y
  **nunca el identificador tecnico**. `[D5]`
- **R18.** Cada fila DEBE mostrar **los demas responsables** del pedido como grupo de avatares, con
  el **nombre completo** de cada persona como nombre accesible —no solo en un `tooltip`—. `[D5]`
- **R19.** DONDE la asignacion vino de un grupo, la fila DEBE mostrar el **nombre del grupo
  congelado en la propia fila de asignacion**, y NO DEBE consultar el nombre vigente del grupo. `[D5]`
- **R20.** La persona que consulta **NO DEBE aparecer** entre los avatares de «los demas
  responsables» de sus propias filas. `[D5]`
- **R21.** MIENTRAS un pedido de la lista este en **`EN_CURSO`**, su disparador de entrar DEBE
  presentarse **deshabilitado** y acompanado de **su motivo, visible y con nombre accesible**. `[D2]`
- **R22.** MIENTRAS un pedido de la lista este en **`PENDIENTE`**, su disparador de entrar DEBE
  presentarse **habilitado**. `[D2]`
- **R23.** Esta pantalla NO DEBE aplicar ni replicar en el servidor la regla de «pedido ya tomado»:
  la unica garantia que aporta es de **presentacion**, y el rechazo real es de QC-63. `[D2]`
- **R24.** La feature NO DEBE anadir ninguna columna, ninguna tabla y ninguna migracion. `[D3]`
- **R25.** Ninguna fila DEBE afirmar **quien abrio** el pedido, y `orders.updated_by` NO DEBE usarse
  para deducirlo. `[D3]`

### La pantalla

- **R26.** La pantalla DEBE pintarse con la **tabla compartida** de QC-55, consumida por su barrel
  publico, y NO DEBE modificar `components/shared/data-table/`. `[D6]`
- **R27.** Los datos DEBEN pedirse **en el servidor** por la propia pantalla y bajar por **props**;
  **ningun componente de cliente** DEBE invocar la operacion de listado. `[D8]`
- **R28.** SI la operacion de listado falla, ENTONCES la pantalla DEBE pintar un estado de **error
  fuera de la tabla** y **sin mostrar ningun dato**. `[D7]`
- **R29.** SI la persona no tiene ningun pedido asignado en esos dos estados, ENTONCES la pantalla
  DEBE pintar un estado **vacio propio, fuera de la tabla**, distinguible de un fallo de carga. `[D7]`
- **R30.** MIENTRAS la consulta de la pagina este en vuelo, la pantalla DEBE anunciar la carga con
  un **esqueleto fuera de la tabla**, con tantas filas como el tamano de pagina pedido. `[D7]`
- **R31.** Los tamanos de pagina ofrecidos DEBEN ser **10 y 25**, tomados de `lib/shared/pagination`
  y no escritos a mano, y la pagina y el tamano vigentes DEBEN viajar en la **cadena de consulta**.
  `[D11]`
- **R32.** La pantalla DEBE cumplir la regla multiplataforma sin excepcion: objetivos tactiles de al
  menos 44x44 px, ningun `:hover` como unica via de descubrir o activar algo, y ningun `100vh` como
  alto de pantalla. `[D11]`

### Efectos sobre lo que ya existe

- **R33.** El sistema DEBE tener una prueba de **contrato de ruta** equivalente a la de `/pedidos`:
  que la constante exista y no se redeclare, que aparezca una sola vez en los prefijos privados, que
  la pantalla viva donde dice la constante, que sus componentes cuelguen de `components/` con su
  barrel sin `'use client'`, y que ningun archivo de la ruta escriba la URL como literal. `[D1]`
- **R34.** CUANDO una persona con rol Operador entra sin destino de vuelta, ENTONCES DEBE aterrizar
  en la **primera pantalla visible de su menu ya filtrado**, y las pruebas que hoy afirman ese
  aterrizaje DEBEN quedar actualizadas en el mismo cambio. `[D1]`
- **R35.** Las guardias que cuentan enlaces de menu o codigos de permiso DEBEN **tensarse** —subir
  el numero **y** nombrar el enlace nuevo—, y NO DEBEN relajarse a una comprobacion mas laxa. `[D1]`
- **R36.** La guardia del contrato del modulo `asignaciones` DEBE admitir el codigo
  `asignaciones.consultar` **unicamente** en el caso de uso nuevo del dominio de ese modulo, y DEBE
  seguir dando hallazgo si ese codigo aparece en `app/**`, `components/**`, `lib/shared/**`, en un
  adaptador `driving` o en otro modulo. `[D9]`
- **R37.** Ningun archivo fuera de `lib/modules/asignaciones/adapters/driven/**` DEBE consultar
  `prisma.orderAssignment`, y ninguna consulta nueva DEBE usar `include`. `[D14]` `[D6]`
- **R38.** La feature DEBE cubrirse con un **E2E en Chromium y WebKit** del recorrido del Operador:
  entra, ve solo sus pedidos en los dos estados ejecutables, y encuentra uno `EN_CURSO` cuyo
  disparador no puede usar. `[D12]`
- **R39.** La feature NO DEBE anadir **ninguna dependencia** a `package.json`. `[D13]`
- **R40.** La autorizacion de esta pantalla DEBE quedar demostrada con un test que llame a la
  operacion con un actor sin `asignaciones.consultar` y confirme que **lanza sin llegar al
  repositorio**; un corte de ruta o una policy NO cuentan como cumplimiento de R5. `[D9]` `[D14]`

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
