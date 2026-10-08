# QC-38 — crud-de-unidades · requirements.md

> **Zona** `backend` · **Complejidad** `medium` · **depends_on** QC-32, QC-76, QC-74 · **Rama**
> `feature/QC-38-crud-de-unidades`
>
> **Alcance.** El **alta, la edición y el borrado** de unidades de medida sobre el catálogo que
> creó QC-32 y el modelo que le añade QC-76, con su superficie de **Server Actions**. Autoriza
> **por permiso**, con el modelo de QC-74. Es la ficha que hace administrable un catálogo que hoy
> solo se puede tocar por migración.
>
> **Lo que NO entra.** La **consulta**: ya existe (`listUnits`, de QC-26 y QC-57) y su filtro por
> empresa lo pone **QC-76**; esta ficha no la construye ni la reescribe. El esquema, la
> equivalencia y el ámbito por empresa → **QC-76**. La pantalla → **QC-39**. Filtrar el menú por
> permiso → **QC-75**.
>
> *Sembrado por `/afinar-feature` el 2026-09-07. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.*

## Requisitos (EARS)

Notación EARS (`docs/specs.md`). **«El sistema»** aquí son cuatro cosas y ninguna más:

1. los **casos de uso de escritura** del módulo `unidades` (`lib/modules/unidades/domain/`), que hoy
   no existen: el módulo solo tiene `list-units.ts`;
2. su **puerto de escritura** y el **adaptador Prisma** que lo implementa;
3. sus **Server Actions** (`lib/modules/unidades/adapters/driving/`), que hoy son una sola,
   `listUnitsAction`;
4. la **frontera con `identity`**: el permiso que se exige (`assertPermission`, QC-74) y el
   contexto de sesión del que sale la empresa del actor (`getSessionContext()`, QC-48).

**El esquema NO es «el sistema» de esta ficha.** Todo lo que estos requisitos exigen sobre la base
—los cuatro índices únicos parciales, los tres `CHECK`, las dos FK `ON DELETE RESTRICT` y el
disparador `units_check_derivation`— **ya está aplicado** por la migración
`20260907190000_units_equivalence_and_scope` (QC-76). Cuando un requisito dice «DEBE rechazar … y NO
DEBE escribir ninguna fila», lo que esta ficha aporta es **traducir ese rechazo a un error de
dominio distinguible**, no volver a crear la restricción. La ficha **no trae migración** (decisiones
cerradas 5, 6 y 15).

### Los casos de uso y quién puede

**R1.** El sistema DEBE ofrecer **exactamente tres** casos de uso de escritura sobre el catálogo de
unidades —**alta**, **edición** y **borrado**— y NO DEBE añadir ni modificar ningún caso de uso de
**consulta**.

**R2.** El sistema DEBE autorizar los tres casos de uso **por permiso**, contra el catálogo cerrado
de `identity` (QC-74), exigiendo el código **`unidades.modificar`**, y NO DEBE comparar en ningún
punto contra el nombre de un rol ni contra ninguna constante que lo represente.

**R3.** El sistema DEBE comprobar el permiso **en el service**, como **primera línea** de cada uno de
los tres casos de uso, **antes** de validar la entrada con zod y **antes** de tocar el repositorio; y
DEBE rechazar por igual, con el mismo error de autorización, al actor **ausente**, al que no trae
conjunto de permisos, al que lo trae **vacío** y al que no trae **ese código exacto** —sin
normalización, sin coincidencia parcial y sin implicación entre permisos—.

**R4.** El sistema DEBE conceder `unidades.modificar` **únicamente** al rol `Administrador` en el
seed de roles, y DEBE dárselo **junto con** `unidades.consultar`, escritos los dos uno a uno: tener
`unidades.modificar` NO DEBE implicar por sí solo poder consultar. El sistema NO DEBE concedérselo
al rol `Operador`, y NO DEBE cambiar quién puede **consultar** unidades: `unidades.consultar` DEBE
seguir siendo el mismo y seguir estando asignado únicamente al `Administrador`.

**R5.** El catálogo cerrado de permisos DEBE pasar a contener **once** permisos —los diez de QC-74
más `unidades.modificar`—, y el sistema DEBE tratar el nuevo como un permiso más: con la forma
`<modulo>.<accion>`, su módulo, su acción y su descripción; DEBE crearlo por el **seed**, de forma
idempotente; y NO DEBE ofrecer ninguna vía de aplicación que edite el catálogo de permisos.

### El alta

**R6.** CUANDO se da de alta una unidad con un actor autorizado y una entrada válida, el sistema DEBE
crear **una** fila en el catálogo y DEBE devolver su **identificador**.

**R7.** CUANDO se da de alta una unidad, el sistema DEBE asignarle **siempre** la empresa del actor,
tomada del **contexto de sesión del servidor**, y NUNCA de la entrada del llamante; y NO DEBE ofrecer
ninguna forma de crear desde la aplicación una unidad **de sistema** (sin empresa).

**R8.** El sistema DEBE **recortar los espacios de los extremos** del nombre antes de guardarlo; y SI
el nombre recibido está vacío, es solo espacios, o su forma **normalizada** queda vacía —por ejemplo
`---`—, ENTONCES el sistema DEBE rechazar la operación con un error de **entrada inválida**, NO DEBE
escribir ninguna fila y NO DEBE dejar que el caso llegue al índice único ni se anuncie como
«ya existe».

**R9.** SI el nombre recibido, ya recortado, supera **60 caracteres**, ENTONCES el sistema DEBE
rechazar la operación sin escribir ninguna fila; y DEBE aceptar un nombre de exactamente 60. Ese
límite DEBE vivir **solo en la validación** del módulo: el sistema NO DEBE añadir ninguna restricción
de longitud a la columna ni ninguna migración.

**R10.** El sistema DEBE tratar el símbolo como **opcional** y DEBE aceptar una unidad **sin
símbolo**; SI el símbolo recibido supera **10 caracteres**, ENTONCES el sistema DEBE rechazar la
operación sin escribir ninguna fila, y DEBE aceptar uno de exactamente 10. Ese límite DEBE vivir
**solo en la validación**, sin restricción en la columna y sin migración. El símbolo **vacío o en
blanco** lo cubre R36.

**R11.** SI el nombre **normalizado** de la unidad que se intenta escribir coincide con el de otra
unidad **de la misma empresa**, ENTONCES el sistema DEBE rechazar la operación con un error de
dominio **distinguible del resto por su código**, y NO DEBE escribir ninguna fila. La garantía DEBE
salir del **índice único** de la base —no de una comprobación previa al vuelo—, de modo que dos altas
simultáneas que superen cualquier comprobación previa acaben con **una sola fila** y la otra
rechazada con ese mismo error; y el sistema DEBE seguir aceptando el mismo nombre normalizado en
**otra** empresa y frente a una unidad **de sistema**.

**R12.** SI la unidad que se intenta escribir declara símbolo y ese símbolo coincide con el de otra
unidad **de la misma empresa**, ENTONCES el sistema DEBE rechazar la operación con un error de
dominio distinguible del resto, respaldado por el índice único, y NO DEBE escribir ninguna fila; y
DEBE seguir aceptando **varias** unidades sin símbolo en la misma empresa, y el mismo símbolo frente
a una unidad de sistema o de otra empresa.

### La equivalencia (alta y edición)

**R13.** SI la entrada declara la unidad de la que deriva **sin** factor, o un factor **sin** unidad
de la que deriva, ENTONCES el sistema DEBE rechazar la operación con un error de entrada inválida y
NO DEBE escribir ninguna fila; y DEBE aceptar la entrada que **no declara ninguno de los dos**
(unidad **base**).

**R14.** SI el factor recibido no es **mayor que cero** —cero, negativo, o no un decimal válido—,
ENTONCES el sistema DEBE rechazar la operación sin escribir ninguna fila; y DEBE aceptar **cualquier
valor mayor que cero**, incluidos los **menores que 1** (por ejemplo `0.5`), sin normalizarlos.

**R15.** SI la unidad de la que se declara derivar **deriva a su vez** de otra —o si la unidad que se
edita ya es base de alguna otra y se la intenta convertir en derivada—, ENTONCES el sistema DEBE
rechazar la operación con un error de dominio distinguible y NO DEBE escribir ninguna fila: la
derivación es de **un solo nivel**. SI la unidad declara derivar **de sí misma**, ENTONCES el sistema
DEBE rechazarla igualmente.

**R16.** El sistema DEBE aceptar que una unidad derive de otra **de la propia empresa del actor** o
**de sistema**; SI la unidad de la que se declara derivar pertenece a **otra empresa**, o **no
existe**, ENTONCES el sistema DEBE rechazar la operación con un error de dominio y NO DEBE escribir
ninguna fila.

### La edición

**R17.** CUANDO se edita una unidad, el sistema DEBE tratar la entrada como un **reemplazo
completo** de los cuatro campos —nombre, símbolo, unidad de la que deriva y factor—: los cuatro DEBEN
llegar en cada edición y DEBEN sustituir lo que hubiera; y CUANDO llegan sin unidad de la que deriva
y sin factor, el sistema DEBE dejar la unidad **sin derivación** (unidad base). El sistema NO DEBE
interpretar la ausencia de un campo como «no lo toques».

**R18.** CUANDO se edita una unidad, el sistema DEBE aplicar **las mismas** reglas de validación que
en el alta (R8, R9, R10, R11, R12, R13, R14, R15, R16, R36), y NO DEBE tener un segundo juego de
reglas distinto para editar.

**R19.** CUANDO se edita una unidad, el sistema NO DEBE cambiar la **empresa** a la que pertenece: la
empresa no es un campo editable y no DEBE poder llegar desde la entrada del llamante.

**R20.** El sistema DEBE permitir **cambiar** la unidad de la que deriva una unidad, o su factor,
aunque esa unidad ya esté referenciada por un producto o por una línea de receta; y ese cambio NO
DEBE modificar ninguna cantidad ya guardada ni invalidar ninguna fila existente.

**R21.** SI se intenta editar una unidad **de sistema** —una unidad sin empresa—, ENTONCES el sistema
DEBE rechazar la operación **en el service**, con un error de dominio distinguible del resto por su
código, **antes de intentar ninguna escritura**, y NO DEBE modificar ninguna fila. El rechazo NO DEBE
depender de ninguna restricción de la base ni de ninguna policy de RLS.

**R22.** SI se intenta editar una unidad que pertenece a **otra empresa**, o una unidad que **no
existe**, ENTONCES el sistema DEBE rechazar la operación y NO DEBE modificar ninguna fila.

### El borrado

**R23.** CUANDO se borra una unidad, el sistema DEBE hacerlo de forma **física**; NO DEBE marcarla
como borrada, NO DEBE añadir al catálogo de unidades ninguna columna `deleted_at` ni equivalente, y
NO DEBE dejar la fila en la base con ninguna marca de vida.

**R24.** SI se intenta borrar una unidad que está **en uso** —referenciada por un producto, por una
línea de receta, o **base de otra unidad**—, ENTONCES el sistema DEBE rechazar el borrado con un
error de dominio distinguible del resto, DEBE conservar intactas la unidad y las filas que la
referencian, y ese rechazo DEBE provenir de la restricción `ON DELETE RESTRICT` **de la base**
traducida por el adaptador, y NO de una comprobación de uso hecha al vuelo antes de borrar.

**R25.** SI se intenta borrar una unidad **de sistema**, ENTONCES el sistema DEBE rechazar la
operación **en el service**, con el mismo error de dominio que R21 y **antes de intentar ningún
borrado**, y NO DEBE borrar ninguna fila.

**R26.** SI se intenta borrar una unidad que pertenece a **otra empresa**, o una unidad que **no
existe**, ENTONCES el sistema DEBE rechazar la operación y NO DEBE borrar ninguna fila.

### Superficie de servidor, entrada y errores

**R27.** El sistema DEBE exponer los tres casos de uso como **Server Actions** en
`adapters/driving/` del módulo `unidades`, y NO DEBE crear ningún Route Handler ni ningún otro
endpoint HTTP para ellos.

**R28.** El sistema DEBE validar la **forma** de la entrada de alta y de edición con **zod** antes de
tocar el repositorio, DEBE rechazar con un error de entrada inválida la entrada que no cumpla esa
forma, y NO DEBE escribir nada en ese caso.

**R29.** El sistema DEBE recibir el **actor** —identificador, empresa y conjunto de permisos— **por
parámetro** en cada caso de uso; el dominio NO DEBE leer sesión, cookie ni cabecera. CUANDO se invoca
cualquiera de las tres Server Actions, el actor DEBE resolverlo el **adaptador driving** con
`identity`, y SI falta la sesión o el contexto de sesión, ENTONCES el sistema DEBE rechazar la
operación sin tocar el repositorio.

**R30.** El sistema DEBE señalar cada fallo de negocio con una clase de error del dominio `unidades`
que lleve un **`code` estable**, y la Server Action DEBE traducirla a un estado **serializable** con
ese código; el **texto** del mensaje NO DEBE ser nunca el discriminante, y todo error que **no** sea
de dominio DEBE relanzarse sin capturar.

### Fronteras y límites de alcance

**R31.** El sistema NO DEBE reexportar las Server Actions nuevas —ni nada marcado con
`'use server'`— desde el contrato público del módulo (`lib/modules/unidades/index.ts`), que DEBE
seguir siendo importable desde un componente de cliente; y ningún módulo distinto de `unidades` DEBE
acceder a la tabla `units` ni a su repositorio para estas operaciones.

**R32.** El sistema DEBE nombrar en **inglés** cualquier identificador de base de datos que
introduzca; y esta feature NO DEBE introducir ninguna **migración** ni ningún cambio en
`db/schema.prisma`.

**R33.** El sistema NO DEBE cambiar `listUnits`: ni su firma, ni su filtro por empresa, ni su orden
por defecto, ni su búsqueda, ni su paginación, ni la forma de su resultado, ni el permiso que exige.

**R34.** El sistema NO DEBE incluir en esta feature ninguna pantalla, ruta ni entrada de menú para
administrar unidades; por lo tanto esta feature NO aporta ningún flujo navegable que un test **E2E**
pueda visitar.

**R35.** El sistema NO DEBE incorporar ninguna dependencia de terceros nueva para cumplir los
requisitos anteriores.

### Añadido al cerrarse las preguntas abiertas (2026-09-08)

Se numera al final para **no renumerar** nada de lo anterior. Es el hueco que R10 dejaba a propósito
mientras la pregunta seguía abierta.

**R36.** SI la entrada declara símbolo y ese símbolo está **vacío** o es **solo espacios**, ENTONCES
el sistema DEBE rechazar la operación con un error de **entrada inválida**, NO DEBE escribir ninguna
fila, y NO DEBE convertirlo en «sin símbolo»: no lo DEBE guardar como vacío ni como ausente. El
sistema DEBE seguir aceptando la entrada que **no declara símbolo** (R10), y esta regla DEBE
aplicarse por igual en el alta y en la edición (R18).

### Cobertura de las decisiones cerradas

Cada fila de `## Decisiones cerradas (no reabrir)`, en el orden en que está escrita, con el requisito
que la hace testeable. Ninguna queda sin `R<n>`.

| # | Decisión cerrada | Requisito(s) |
| --- | --- | --- |
| 1 | Alta, edición y borrado, y nada más; la consulta NO | R1, R33 |
| 2 | Por permiso (QC-74), sin `requireAdmin` nuevo | R2, R5 |
| 3 | Consultar unidades: solo el Administrador, como hoy | R4, R33 |
| 4 | La autorización se valida en el service, primera línea, falla cerrado | R3 |
| 5 | Nombre: 60 caracteres, solo en la validación, sin migración | R9, R32 |
| 6 | Símbolo: 10 caracteres, solo en la validación | R10, R32 |
| 7 | Nombre vacío o en blanco: se rechaza; se recorta; el normalizado vacío también se rechaza | R8 |
| 8 | La edición es reemplazo completo de los cuatro campos | R17 |
| 9 | No se edita ni se borra una unidad de sistema; se rechaza en el service | R21, R25 |
| 10 | La unidad creada es de la empresa del creador; no se crean unidades de sistema | R7, R19, R22, R26 |
| 11 | Unicidad del nombre normalizado dentro de la empresa; la garantía es el índice único | R11 |
| 12 | Símbolo único cuando existe, mismo ámbito que el nombre; sigue siendo opcional | R12 |
| 13 | Validación de la equivalencia: juntos o ninguno, factor > 0, un solo nivel, no auto-referencia, ámbito del padre | R13, R14, R15, R16, R18 |
| 14 | Se puede cambiar la base o el factor de una unidad ya en uso | R20 |
| 15 | No se borra una unidad en uso ni una de la que otra deriva; lo garantiza `ON DELETE RESTRICT` | R24 |
| 16 | Borrado físico, no lógico; el catálogo no tiene `deleted_at` | R23 |
| 17 | Superficie: Server Actions en `adapters/driving/`, nunca Route Handler, con zod en el borde | R27, R28 |
| 18 | El actor llega por parámetro; lo resuelve el adaptador driving con `identity` | R29 |
| 19 | Errores de dominio con `code` estable; el texto no discrimina; lo que no es de dominio se relanza | R30 |
| 20 | Módulo `unidades` hexagonal; los driving no pasan por el barrel; identificadores de DB en inglés | R31, R32 |
| 21 | E2E diferido con motivo; lo decide QC-39 | R34 |
| 22 | Ninguna librería nueva | R35 |
| 23 | Se crea `unidades.modificar`; el catálogo pasa a once y se siembra junto a `unidades.consultar`; enmienda QC-74 R2 | R2, R4, R5 |
| 24 | El símbolo vacío o en blanco se rechaza; no se convierte en `NULL`; sigue siendo opcional | R36, R10, R18 |

## Preguntas abiertas

**Ninguna.**

Esta acotación además **cierra la pregunta abierta 5 de QC-32** —«¿un nombre en blanco es un
nombre?»—, que esa ficha dejó escrita apuntando aquí. Con ella, las tres preguntas abiertas de
QC-32 quedan cerradas: la 1 y la 3 el mismo día al acotar QC-76, y la 5 aquí. Anotado como
comentario en el issue QC-32, cuyo spec no se toca.

`spec_author` abrió dos el 2026-09-08 al escribir los requisitos —el código del permiso de
escritura, que no existía en el catálogo de QC-74, y qué hacer con un símbolo vacío o en blanco— y
**el humano las cerró ese mismo día**: son las **dos últimas filas** de la tabla de abajo y viven en
R2, R4, R5 y R36. No queda ninguna abierta.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
| --- | --- | --- |
| 2026-09-07 | ¿Qué casos de uso trae? | **Alta, edición y borrado**, y nada más. **La consulta NO**: ya existe desde QC-26 y QC-57, y su filtro por empresa lo pone QC-76 |
| 2026-09-07 | ¿Cómo se decide quién puede? | **Por permiso**, con el modelo que dejó **QC-74**. **No** se escribe un `requireAdmin` nuevo: sería el séptimo sitio comparando contra el literal «Administrador», justo después de que **QC-54** gastara una ficha entera en unificarlos |
| 2026-09-07 | ¿Quién puede consultar unidades? | **Solo el Administrador, como hoy.** Se conserva lo que fijó **QC-32** y no se abre la lectura al Operador. Si eso deja al Operador sin selector de unidad en recetas, se resuelve en la ficha que se lo plantee (candidata: **QC-63**), no aquí |
| 2026-09-07 | ¿Dónde se valida la autorización? | **En el service**, como primera línea y falla cerrado, con su test. Heredado de **QC-20 D2** y exigido por `docs/checkpoints-proyecto.md > Permisos`. Una policy de RLS **no** cuenta como implementado (`docs/architecture.md > Acceso a datos y autorizacion`) |
| 2026-09-07 | Largo máximo del nombre | **60 caracteres**, que es lo que **QC-20 D11** le dio al nombre de presentación, el catálogo corto más parecido. Vive **solo en la validación**, no en la columna: sin migración. Cierra el límite que **QC-32 R6** dejó escrito apuntando aquí |
| 2026-09-07 | Largo máximo del símbolo | **10 caracteres.** `kg`, `ml` y `mmHg` son de 2 a 4; más de 10 ya no es un símbolo. También solo en la validación |
| 2026-09-07 | Nombre vacío o en blanco | **Se rechaza**, y se recortan los espacios de los extremos antes de guardar. **También se rechaza el nombre que al normalizar queda vacío** —un «---»—, para que no llegue al índice único y se anuncie como «ya existe». Heredado de **QC-20 D9 y D23**; cierra la **pregunta abierta 5 de QC-32** |
| 2026-09-07 | ¿La edición es total o parcial? | **Reemplazo completo.** Llegan los cuatro campos —nombre, símbolo, de qué unidad deriva y factor— y reemplazan lo que hubiera. Con envío parcial no se distingue «no lo toques» de «bórralo», y aquí hay **dos campos que se pueden vaciar** |
| 2026-09-07 | ¿Se puede editar o borrar una unidad de sistema? | **No.** Se rechaza **en el service**, con su test. No tienen `company_id`, valen para todas las empresas, y cambiar «kilogramo» las afectaría a todas a la vez. Heredado de **QC-76** |
| 2026-09-07 | ¿De quién es la unidad que se crea? | **De la empresa de quien la crea**, siempre. Desde la aplicación **no se puede crear una unidad de sistema**: las únicas son las cuatro de la migración. Heredado de **QC-76** |
| 2026-09-07 | Unicidad del nombre al crear y editar | **Dentro de la empresa**, comparando **normalizado** —sin acentos, sin caracteres especiales y sin distinguir mayúsculas—. La garantía real es el índice único que crea **QC-76**, no la comprobación previa: dos altas simultáneas que la superen acaban con una sola fila y la otra rechazada. Heredado de **QC-76** y **QC-32 D5** |
| 2026-09-07 | Unicidad del símbolo | **Único cuando existe**, con el mismo ámbito que el nombre. El símbolo **sigue siendo opcional**. Heredado de **QC-76** |
| 2026-09-07 | Validación de la equivalencia | La unidad de la que deriva y el factor **van juntos o no va ninguno**; el factor es **mayor que cero** y admite valores **menores que 1**; la unidad apuntada tiene que ser una **unidad base** —la derivación es de un solo nivel—, **no puede ser ella misma**, y tiene que ser **de la propia empresa o de sistema**, nunca de otra empresa. Heredado de **QC-76** |
| 2026-09-07 | ¿Se puede cambiar la base o el factor de una unidad ya en uso? | **Sí.** El producto y la línea de receta guardan una **referencia** a la unidad, no una cantidad ya convertida, así que no invalida nada guardado. Mismo criterio que **QC-33** con el total del pedido. Heredado de **QC-76** |
| 2026-09-07 | ¿Se puede borrar una unidad en uso? | **No.** Ni si la usa un producto o una línea de receta, ni si **otra unidad deriva de ella**. Lo garantiza `ON DELETE RESTRICT` en la base, no una comprobación al vuelo. Heredado de **QC-32 D10** y **QC-76** |
| 2026-09-07 | ¿El borrado es lógico? | **No: físico**, y bloqueado por la FK. El catálogo **no tiene `deleted_at`** precisamente para que el `RESTRICT` pueda impedirlo: el borrado lógico es un UPDATE y ninguna FK reacciona a un UPDATE. Heredado de **QC-32 D11**, mismo criterio que las presentaciones en **QC-20 D6** |
| 2026-09-07 | Superficie de servidor | **Server Actions** en `adapters/driving/`, nunca Route Handler (`docs/architecture.md > Server Actions vs Route Handlers`), con **zod** validando la entrada en el borde (`docs/conventions.md`). Heredado de **QC-20 D18** |
| 2026-09-07 | ¿De dónde sale el actor? | El service lo **recibe por parámetro**; quien lo resuelve es el **adaptador driving**, con `identity`. El dominio no lee sesión, cookie ni cabecera. Heredado de **QC-20 D17** y de cómo ya está escrito `unit-actions.ts` |
| 2026-09-07 | Errores | Clases de error de dominio con **`code` estable**, traducidas por la Server Action a estado serializable; el texto nunca es el discriminante, y lo que no es error de dominio **se relanza**. Es lo que ya hace `unit-actions.ts` (`docs/conventions.md > Manejo de errores`) |
| 2026-09-07 | Módulo y fronteras | Módulo **`unidades`**, hexagonal (**QC-15**). Los adaptadores driving **no pasan por el barrel** —el contrato público tiene que poder importarse desde un componente de cliente— y ningún otro módulo entra por su tabla ni por su repositorio. Identificadores de la DB en **inglés** (**QC-4**) |
| 2026-09-07 | ¿E2E? | **Diferido con motivo**: esta ficha no tiene pantalla ni flujo navegable que visitar. Lo decide **QC-39**. Heredado de **QC-32** y mismo criterio que **QC-20 D4** |
| 2026-09-07 | Librería nueva | **Ninguna.** Son casos de uso, validación con zod —ya aprobada— y aritmética propia. Regla 7 de `CLAUDE.md` sin propuesta que abrir |
| 2026-09-08 | ¿Cuál es el permiso de escritura, si `unidades` no tiene ninguno? | **Se crea `unidades.modificar`** y el catálogo de permisos pasa a **once**. Se siembra al rol **Administrador** **junto con `unidades.consultar`**: **QC-74 decidió que `modificar` NO implica `consultar`** y que el seed los da **los dos**, escritos uno a uno. **Esto enmienda QC-74 R2** —«exactamente estos diez permisos, ni uno más ni uno menos»—, y se dice con esas palabras y no disimulado: QC-74 **R4** dejó a `unidades` sin escritura justificándolo con «no tiene escritura», y **esta ficha es justamente la que se la da**, así que la premisa de aquella decisión deja de ser cierta. Lo habilita además **QC-76 D24** («si el permiso debe cambiar, lo decide QC-38»). **Descartado** reutilizar `unidades.consultar` para escribir: rompería la separación `consultar`/`modificar` que QC-74 construyó a propósito en los otros cuatro módulos. Los **seis** archivos de test ajenos que afirman «diez» se actualizan **en la misma tanda** que el cambio, nunca al final. **Cierra la pregunta abierta 1 de `spec_author`** |
| 2026-09-08 | Símbolo vacío o en blanco | **Se rechaza**, igual que el nombre vacío de la decisión 7, y **no se convierte en `NULL`**: si se manda símbolo, tiene que tener contenido. El símbolo **sigue siendo opcional** —**no** mandarlo es legal—; lo que se rechaza es mandarlo vacío o solo con espacios. El motivo es el mismo que allí: `units_company_symbol_unique` es un índice parcial sobre `symbol IS NOT NULL`, así que una cadena vacía **sí** cuenta como valor y dos unidades con `''` chocarían y se anunciarían como «símbolo duplicado», un «ya existe» falso. **Descartado** recortarlo y guardarlo como símbolo ausente: convertiría en silencio una entrada que el usuario escribió mal en una unidad sin símbolo, sin decírselo. **Cierra la pregunta abierta 2 de `spec_author`** |
