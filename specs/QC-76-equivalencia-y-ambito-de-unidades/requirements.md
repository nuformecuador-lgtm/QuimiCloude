# QC-76 — equivalencia-y-ambito-de-unidades · requirements.md

> **Zona** `backend` · **Complejidad** `high` · **depends_on** QC-32, QC-48 · **Rama**
> `feature/QC-76-equivalencia-y-ambito-de-unidades`
>
> **Alcance.** El catálogo de unidades que creó QC-32 gana la **equivalencia entre unidades**
> —de qué unidad deriva cada una y por qué factor— y el **ámbito por empresa**: una unidad
> pertenece a una empresa o es **de sistema** y vale para todas. El módulo `unidades` publica en
> su contrato la función que **convierte** una cantidad entre dos unidades compatibles. Y el
> listado que **ya existe** (`listUnits`, de QC-26 y QC-57) pasa a devolver las unidades de la
> empresa **más** las de sistema, no todas.
>
> **Lo que NO entra.** El alta, la edición y el borrado de unidades, y el rechazo a editar o
> borrar una unidad de sistema → **QC-38**. La pantalla `configuracion/unidades` → **QC-39**.
> Usar la conversión en recetas, pedidos o inventario → **sin ficha todavía**; quien la estrene
> abre la suya.
>
> *Sembrado por `/afinar-feature` el 2026-09-07, en dos corridas. El bloque de Alcance y la tabla
> de «Decisiones cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los
> reabre y no los reescribe: su trabajo aquí es `## Requisitos (EARS)`.*

## Requisitos (EARS)

Notación EARS (`docs/specs.md`). **«El sistema»** aquí son tres cosas y ninguna más:

1. la **capa de persistencia** —el esquema Prisma (`db/schema.prisma`) más la base Postgres con la
   migración nueva de esta feature aplicada—;
2. el **módulo `unidades`** tal y como existe hoy: su contrato público (`index.ts`), su único caso
   de uso (`domain/list-units.ts`), su puerto de listado, su adaptador Prisma y su Server Action;
3. la **frontera** de ese listado con `identity`, de donde sale la empresa de quien pregunta
   (`getSessionContext()`, QC-48).

**No hay alta, edición ni borrado de unidades en esta ficha** (decisión cerrada 1, van a QC-38), así
que ningún requisito describe un formulario ni un caso de uso de escritura. Cuando un requisito dice
«SI se intenta persistir … ENTONCES el sistema DEBE rechazar **en la propia base de datos**», habla
de la garantía que deja la migración: es lo que se prueba con un `INSERT`/`UPDATE` directo en la base
de test, no con una llamada a un service que todavía no existe.

### Equivalencia entre unidades

**R1.** El sistema DEBE permitir que cada unidad declare **de qué unidad deriva** y **por qué
factor**, DEBE tratar los dos como opcionales, y DEBE aceptar una unidad que no declare ninguno de
los dos (unidad **base**).

**R2.** SI se intenta persistir una unidad que declare la unidad de la que deriva **sin** factor, o
un factor **sin** unidad de la que deriva, ENTONCES el sistema DEBE rechazar la operación en la
propia base de datos y NO DEBE crear ni modificar ninguna fila.

**R3.** El sistema DEBE persistir el factor como **decimal exacto de cuatro decimales** y NO DEBE
usar coma flotante para esa columna; DEBE conservar sin pérdida un factor escrito con cuatro
decimales y DEBE rechazar en la propia base de datos —o truncar nunca en silencio— un valor que no
quepa en esa precisión.

**R4.** SI se intenta persistir una unidad con factor **menor o igual que cero**, ENTONCES el
sistema DEBE rechazar la operación en la propia base de datos y NO DEBE crear ni modificar ninguna
fila.

**R5.** El sistema DEBE aceptar **cualquier factor mayor que cero**, incluidos los menores que 1
(por ejemplo `0.5000`), sin rechazarlos, sin normalizarlos y sin exigir que la unidad apuntada sea
la más pequeña de su familia.

**R6.** SI se intenta persistir un estado en el que una unidad derive de otra que **a su vez
deriva** de una tercera —tanto al declarar la unidad derivada como al convertir en derivada una
unidad de la que ya deriva alguna—, ENTONCES el sistema DEBE rechazar la operación en la propia base
de datos y NO DEBE crear ni modificar ninguna fila: la derivación es de **un solo nivel**.

**R7.** SI se intenta persistir una unidad que declare derivar **de sí misma**, ENTONCES el sistema
DEBE rechazar la operación en la propia base de datos y NO DEBE crear ni modificar ninguna fila.

**R8.** SI se intenta **eliminar** una unidad de la que deriva al menos otra unidad, ENTONCES el
sistema DEBE rechazar el borrado en la propia base de datos y DEBE conservar intactas las dos
unidades y la referencia entre ellas.

**R9.** El sistema DEBE permitir que una unidad de una empresa derive de otra unidad **de esa misma
empresa** o de una unidad **de sistema**; SI se intenta persistir una unidad que derive de una
unidad **de otra empresa**, ENTONCES el sistema DEBE rechazar la operación en la propia base de
datos y NO DEBE crear ni modificar ninguna fila.

**R10.** El sistema DEBE permitir **cambiar** la unidad de la que deriva una unidad, o su factor,
aunque esa unidad ya esté referenciada por un producto o por una línea de receta, y ese cambio NO
DEBE modificar ninguna cantidad ya guardada ni invalidar ninguna fila existente.

### Ámbito por empresa

**R11.** El sistema DEBE persistir, para cada unidad, la **empresa** a la que pertenece en una
columna **opcional**, y la **ausencia de valor** en esa columna —y nada más— DEBE significar que la
unidad es **de sistema**.

**R12.** El sistema NO DEBE declarar en el catálogo de unidades ninguna otra columna, bandera ni
valor que marque una unidad como «de sistema».

**R13.** SI se intenta persistir una unidad cuya empresa no corresponda a ninguna empresa existente,
ENTONCES el sistema DEBE rechazar la operación en la propia base de datos y NO DEBE crear ni
modificar ninguna fila.

**R14.** SI se intenta persistir una unidad cuyo **nombre normalizado** coincida con el de otra
unidad **de la misma empresa**, o —siendo las dos de sistema— con el de otra unidad de sistema,
ENTONCES el sistema DEBE rechazar la operación en la propia base de datos, contra un índice único y
no contra una comprobación previa al vuelo; y DEBE **aceptar** el mismo nombre normalizado en dos
empresas distintas, y en una empresa frente a una unidad de sistema. El nombre normalizado DEBE
seguir siendo el que produce la **única definición** de la normalización que publica el contrato del
módulo (QC-32 R4).

**R15.** SI se intenta persistir una unidad **con símbolo** cuyo símbolo coincida con el de otra
unidad del **mismo ámbito** —la misma empresa, o el conjunto de las de sistema—, ENTONCES el sistema
DEBE rechazar la operación en la propia base de datos; y DEBE seguir aceptando unidades **sin
símbolo**, incluidas varias sin símbolo en el mismo ámbito, y el mismo símbolo en dos ámbitos
distintos.

**R16.** CUANDO una empresa queda marcada como borrada, el sistema NO DEBE borrar, vaciar ni alterar
ninguna unidad de esa empresa.

### El listado de unidades

**R17.** CUANDO se consulta el listado de unidades en nombre de una empresa, el sistema DEBE
devolver **exactamente** las unidades de esa empresa **más** las unidades de sistema, y NO DEBE
devolver ninguna unidad de otra empresa; esto DEBE cumplirse en los **dos** modos del listado —el
catálogo completo y la página—, y en el modo paginado el recuento total DEBE contar solo las
unidades visibles para esa empresa.

**R18.** El sistema DEBE definir la condición de ámbito «de la empresa **o** de sistema» **una sola
vez** dentro del módulo `unidades`, DEBE construir a partir de esa definición **toda** consulta del
listado, y NO DEBE permitir que una consulta del listado se ejecute sin recibir la empresa en cuyo
nombre se pregunta.

**R19.** CUANDO se invoca el listado desde su adaptador driving, la empresa DEBE salir del
**contexto de sesión del servidor** y nunca de la entrada del llamante; SI no hay contexto de sesión,
ENTONCES el sistema DEBE rechazar la operación sin consultar el repositorio.

**R20.** El sistema DEBE seguir exigiendo, **antes** de validar la entrada y antes de tocar el
repositorio, el permiso de consulta de unidades —que hoy tiene únicamente el rol **Administrador**—
validado **en el service**, y DEBE rechazar por igual al actor ausente, al que no trae conjunto de
permisos, al que lo trae vacío y al que no trae ese código exacto. Que la empresa viaje en la sesión
NO DEBE autorizar por sí sola.

**R21.** El sistema NO DEBE cambiar el orden por defecto, la búsqueda, el filtrado ni la paginación
que el listado ya tenía, ni la forma de su resultado para quien lo llama sin consulta.

### La conversión

**R22.** El **contrato público** del módulo `unidades` DEBE publicar una función que convierta una
cantidad de una unidad a otra, y esa función DEBE ser **pura**: sin acceso a base de datos, sin
framework y sin estado.

**R23.** CUANDO se convierte una cantidad entre dos unidades que **comparten unidad base** —incluido
el caso de una unidad consigo misma y el de una unidad base con una derivada suya—, el sistema DEBE
devolver la cantidad equivalente según los factores declarados, NO DEBE redondearla a ninguna escala
de presentación y NO DEBE guardarla en ninguna columna. En concreto: SI la división termina,
ENTONCES el resultado DEBE ser **exacto**, con todas sus cifras y sin ceros de relleno; SI la
división **no termina** —el factor de destino tiene algún divisor distinto de 2 y de 5—, ENTONCES el
sistema DEBE calcularlo con una **escala interna fija de 12 decimales, truncando** y nunca
redondeando hacia arriba, y esa escala DEBE estar declarada en **una única constante con nombre**
documentada en el contrato, no repartida por el cálculo.

**R24.** SI las dos unidades **no comparten unidad base**, ENTONCES el sistema DEBE fallar con un
error de dominio distinguible del resto y NO DEBE devolver ninguna cantidad.

**R25.** SI la cantidad recibida o alguno de los factores no es un decimal válido, o el factor no es
mayor que cero, o una unidad declara unidad base sin factor —o factor sin unidad base—, ENTONCES el
sistema DEBE fallar con un error de dominio y NO DEBE devolver ninguna cantidad.

**R26.** El sistema NO DEBE introducir en `inventario`, `recetas` ni `pedidos` ninguna llamada a la
conversión, ni convertir cantidades en ninguna consulta o escritura existente: la unidad sigue
siendo anotativa para todos ellos.

### Esquema, migración y seguridad

**R27.** El sistema DEBE introducir los cambios de esquema de esta feature en una **migración
nueva** y NO DEBE modificar el contenido de la migración ya aplicada `20260903121404_units_catalog`.

**R28.** CUANDO se aplica la migración de esta feature, las **cuatro** unidades existentes DEBEN
quedar así: `litro` derivando de `mililitro` con factor 1000, `kilogramo` derivando de `gramo` con
factor 1000, `mililitro` y `gramo` sin derivación, y las cuatro **sin empresa**.

**R29.** La migración de esta feature NO DEBE crear ninguna unidad nueva ni eliminar ninguna
existente: al terminar, el catálogo DEBE tener exactamente esas cuatro unidades.

**R30.** CUANDO termina la migración de esta feature, la tabla de unidades DEBE tener
`ROW LEVEL SECURITY` **activada y forzada** (`FORCE ROW LEVEL SECURITY`).

**R31.** El sistema DEBE nombrar en **inglés** la columna, los índices, las restricciones y
cualquier otro objeto de base de datos que cree o renombre esta feature.

**R32.** El sistema NO DEBE declarar ninguna marca de borrado lógico en el catálogo de unidades: la
tabla NO DEBE ganar columna `deleted_at` ni equivalente.

**R33.** La migración de esta feature DEBE traer su `down.sql`, y CUANDO se revierte, el esquema
DEBE quedar exactamente como estaba antes de aplicarla —sin columna, índice, restricción ni
disparador residual, con el índice único de nombre anterior restaurado y con la RLS activada y
forzada—, y las cuatro unidades DEBEN seguir existiendo.

**R34.** SI al revertir la migración existe alguna unidad con empresa, o alguna unidad derivada que
no sea una de las dos que dejó la propia migración, ENTONCES el sistema DEBE **abortar la reversión
completa** y NO DEBE descartar ese dato en silencio.

### Límites de alcance

**R35.** El sistema NO DEBE incluir en esta feature ninguna operación de alta, edición o borrado de
unidades, ningún rechazo de aplicación a editar o borrar una unidad de sistema, ni ruta, pantalla o
adaptador driving nuevo que las exponga; por lo tanto esta feature NO aporta ningún flujo navegable
que un test E2E pueda visitar.

**R36.** El sistema NO DEBE cambiar en esta feature la resolución de referencias de unidad que
consumen otros módulos (`UnitCatalog.findRefs`) ni a sus llamantes: acotar por empresa lo que lee
`recetas` pertenece a la ficha que aísle ese módulo (QC-50, deuda registrada en
`docs/architecture.md > Dominio`).

**R37.** El sistema NO DEBE relacionar el catálogo de unidades con el de presentaciones ni fundirlos:
siguen siendo dos entidades separadas.

**R38.** El sistema NO DEBE incorporar ninguna dependencia de terceros nueva para cumplir los
requisitos anteriores.

### Cobertura de las decisiones cerradas

Cada fila de `## Decisiones cerradas (no reabrir)`, en el orden en que está escrita, con el requisito
que la hace testeable. Ninguna queda sin `R<n>`.

| # | Decisión cerrada | Requisito(s) |
| --- | --- | --- |
| 1 | Qué gana el catálogo: equivalencia y ámbito, nada más | R1, R11, R35 |
| 2 | La equivalencia: unidad de la que deriva + factor, juntos o ninguno | R1, R2 |
| 3 | Decimal exacto de cuatro decimales, nunca coma flotante | R3 |
| 4 | Ni cero ni negativo | R4 |
| 5 | Puede ser menor que 1; convertir depende solo de compartir base | R5, R23, R24 |
| 6 | Un solo nivel de derivación | R6 |
| 7 | Ninguna unidad deriva de sí misma | R7 |
| 8 | No se borra una unidad de la que otra deriva (`ON DELETE RESTRICT`) | R8 |
| 9 | Una unidad de empresa deriva de una suya o de una de sistema | R9 |
| 10 | `company_id` opcional; sin él, unidad de sistema | R11, R13 |
| 11 | No hay campo `system` | R12 |
| 12 | Las de sistema solo se leen; el rechazo lo implementa QC-38 | R17, R35 |
| 13 | Las de sistema son las cuatro de la migración de QC-32 | R28, R29 |
| 14 | Unicidad del nombre normalizado dentro del ámbito | R14 |
| 15 | La consulta trae las de la empresa más las de sistema, filtro en un único punto | R17, R18 |
| 16 | El filtro entra aquí, sobre el `listUnits` que ya existe, con el `companyId` de la sesión | R17, R19, R21 |
| 17 | La conversión no redondea y no se guarda | R23 |
| 18 | Nadie usa la conversión todavía; el contrato la publica | R22, R26 |
| 19 | Migración nueva que actualiza las cuatro filas, sin tocar la ya aplicada | R27, R28 |
| 20 | La migración no añade unidades | R29 |
| 21 | Sin `deleted_at` en el catálogo | R32 |
| 22 | Identificadores de la base en inglés | R31 |
| 23 | RLS activada y forzada; UP más `down.sql` que revierte al esquema exacto | R30, R33, R34 |
| 24 | Permisos: los de hoy, solo Administrador, en el service, falla cerrado | R20 |
| 25 | E2E diferido con motivo | R35 |
| 26 | Ninguna librería nueva | R38 |
| 27 | Se puede cambiar la base o el factor de una unidad ya en uso | R10 |
| 28 | El símbolo es único cuando existe, con el mismo ámbito que el nombre | R15 |
| 29 | Las unidades de una empresa borrada no se tocan | R16 |
| 30 | Presentación y unidad no convergen | R37 |
| 31 | Escala del resultado cuando la división no termina: 12 decimales, truncando | R22, R23 |

> **Nota sobre la fila 24, sin reabrirla.** La decisión nombra `ADMIN_ROLE_NAME` en
> `lib/modules/unidades/domain/actor.ts`. Ese símbolo **ya no existe**: QC-54 lo retiró y QC-74
> cambió la autorización de «nombre de rol» a **permiso**, de modo que hoy `listUnits` exige
> `unidades.consultar` y ese código lo tiene, en el seed, **únicamente** el rol Administrador
> (`lib/modules/identity/domain/permissions.ts`). Lo que la decisión fija —los permisos de hoy, solo
> Administrador, validado en el service y fallando cerrado— se cumple **tal cual**; solo cambia el
> mecanismo con el que se comprueba, y por eso R20 se escribe sobre el permiso y no sobre el nombre
> del rol. No es una decisión nueva: es la misma leída sobre el código que hay en la rama.

## Preguntas abiertas

**Ninguna.** Las cuatro que quedaron abiertas al acotar las cerró el humano el 2026-09-07, y
están en la tabla de abajo (cuatro últimas filas). Dos de ellas —el símbolo único y la
convergencia de presentación con unidad— cerraron además **las preguntas abiertas 1 y 3 de
QC-32**, vivas desde el 2026-09-02; queda anotado en el issue QC-32, cuyo spec no se toca.

`spec_author` abrió una quinta el 2026-09-07 al escribir los requisitos —qué escala tiene el
resultado de convertir cuando la división no termina— y **el humano la cerró ese mismo día**: es la
**última fila** de la tabla de abajo y vive en R23. No queda ninguna abierta.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
| --- | --- | --- |
| 2026-09-07 | ¿Qué gana el catálogo? | La **equivalencia entre unidades** y el **ámbito por empresa**. Nada más: el alta, la edición y el borrado siguen siendo de **QC-38** |
| 2026-09-07 | ¿Cómo se guarda la equivalencia? | Cada unidad puede declarar **de qué unidad deriva** (`unit_id`, opcional) y **por qué factor** (opcional). Van **juntos o ninguno**. El factor dice **cuántas unidades de la apuntada caben en una de esta**: litro apunta a mililitro con 1000; kilogramo, a gramo con 1000 |
| 2026-09-07 | Tipo y precisión del factor | **Decimal exacto de cuatro decimales**, nunca coma flotante. Heredado de **QC-33**, que lo fijó para el dinero. Los cuatro decimales limitan el **factor guardado**, no el resultado de convertir |
| 2026-09-07 | ¿Se admite factor cero o negativo? | **No: siempre mayor que cero.** Con factor cero la conversión inversa sería una división por cero |
| 2026-09-07 | ¿El factor puede ser menor que 1? | **Sí, cualquier valor mayor que cero.** La unidad base **no** tiene por qué ser la más pequeña de su familia: una empresa puede definir «media garrafa» derivando de garrafa con factor 0,5. Lo único que decide si dos unidades se convierten es que **compartan base** |
| 2026-09-07 | ¿Hasta dónde encadena la derivación? | **Un solo nivel.** Una unidad derivada apunta siempre a una unidad **base**, y una base no deriva de nadie. Tonelada se declara como 1.000.000 de gramos, no como 1000 kilogramos. Sin recorrido, sin ciclos que detectar y sin error acumulado |
| 2026-09-07 | ¿Una unidad puede derivar de sí misma? | **No.** Ni directa ni indirectamente: con un solo nivel, la auto-referencia es el único ciclo posible |
| 2026-09-07 | ¿Se puede borrar una unidad de la que otra deriva? | **No.** Igual que no se borra una unidad en uso por un producto o una línea de receta. Lo garantiza **la base** —`ON DELETE RESTRICT`, extendiendo **QC-32 D10**—, no una comprobación previa al vuelo |
| 2026-09-07 | ¿De qué unidad puede derivar una unidad de empresa? | **De una suya o de una de sistema.** Nunca de una unidad de **otra** empresa: rompería el aislamiento y haría que borrar algo en una empresa afectara a otra |
| 2026-09-07 | ¿De quién es cada unidad? | De una empresa, por una columna `company_id` **opcional**. **Sin** `company_id` es una unidad **de sistema**: vale para todas las empresas. Toda unidad creada desde la aplicación lleva la empresa de quien la crea |
| 2026-09-07 | ¿Hace falta un campo `system`? | **No, y no se crea.** «De sistema» significa **exactamente** «sin `company_id`». Dos campos que dicen casi lo mismo acaban contradiciéndose, y entonces nadie sabe interpretar la fila. **Esto cambia la petición original**, que sí pedía `system` con default `false` |
| 2026-09-07 | ¿Qué puede hacer una empresa con las unidades de sistema? | **Solo leerlas.** Se listan y se usan, pero nadie las edita ni las borra desde la aplicación: cambiar «kilogramo» afectaría a todas las empresas a la vez. Quien quiera otra definición crea la suya. El rechazo lo implementa **QC-38**, que es quien tiene el resto del service |
| 2026-09-07 | ¿Cuáles son las unidades de sistema? | **Las cuatro que insertó la migración de QC-32** —mililitro, litro, gramo, kilogramo— y ninguna más |
| 2026-09-07 | Unicidad del nombre | **Dentro de la empresa**, no entre todas. Dos empresas pueden tener cada una su «kilogramo», y una empresa puede crear el suyo aunque exista el de sistema; las de sistema no se repiten entre ellas. Sustituye al índice único global de **QC-32 R5**. Se sigue comparando **normalizado** —sin acentos, sin caracteres especiales y sin distinguir mayúsculas—, por columna persistida más índice, heredado de **QC-32 D5** |
| 2026-09-07 | ¿La consulta trae las de sistema? | **Sí: las de la empresa MÁS las de sistema** (`company_id` de la empresa **o** vacío). El filtro vive en **un único punto de consulta** del módulo y no repetido en cada caso de uso: ninguna base de datos lo garantiza, y la consulta nueva que se olvide de él enseña a una empresa lo que no es suyo |
| 2026-09-07 | ¿El filtro entra aquí o en QC-38? | **Aquí.** El listado **ya existe** desde QC-26 y QC-57 —`listUnits`, con `requireAdmin`, su puerto, su adaptador Prisma, su Server Action y tres pantallas llamándolo— y `identity.getSessionContext()` ya entrega el `companyId` desde **QC-48**. Dejar la columna sin filtro hasta QC-38 publicaría una versión donde la columna existe y nadie la respeta, que es lo que `docs/architecture.md` prohíbe: un aislamiento que existe solo porque la empresa viaja en la sesión **no cuenta como implementado**. Por esto la ficha toca el caso de uso, y por esto la complejidad es **alta** |
| 2026-09-07 | ¿La conversión redondea? | **No.** El resultado **no se guarda** en ninguna columna, así que sale con toda la precisión de la operación y **redondea quien lo muestra**. 1 gramo pasado a toneladas no puede acabar valiendo cero |
| 2026-09-07 | ¿Quién usa la conversión? | **Nadie todavía.** El contrato público de `unidades` la publica, con su test, e inventario, recetas y pedidos siguen tratando la unidad como anotativa. Quien la estrene va en su propia ficha, con su propia decisión de negocio |
| 2026-09-07 | ¿Cómo entra el cambio en la base? | **Con una migración nueva**, no editando `20260903121404_units_catalog`, que **ya está aplicada**: editarla rompe el checksum de Prisma y obligaría a reconstruir la base de desarrollo, que hoy tiene datos. La nueva añade las columnas y sus índices y **actualiza las cuatro filas existentes**: litro → mililitro con 1000, kilogramo → gramo con 1000, y las cuatro sin `company_id` |
| 2026-09-07 | ¿La migración añade unidades nuevas? | **No, ninguna.** Solo actualiza las cuatro que ya hay. «unidad» sigue fuera del arrancador, como la dejó **QC-32** |
| 2026-09-07 | Borrado del catálogo | **Sin `deleted_at`**, igual que hoy. Heredado de **QC-32 D11**: el borrado lógico es un UPDATE y una FK no puede bloquear un UPDATE, así que la columna neutralizaría en silencio la única garantía real del `RESTRICT` |
| 2026-09-07 | Idioma de los identificadores de la DB | **Inglés** (`unit_id`, `company_id`, …). Heredado de **QC-4** |
| 2026-09-07 | RLS y migración | **RLS activada y forzada**, heredado de **QC-4 R19**; `migration.sql` (UP) más `down.sql` (DOWN) obligatorio, y revertirla deja el esquema exactamente como estaba, heredado de **QC-4 R20** |
| 2026-09-07 | Permisos | **Los de hoy: solo Administrador** (`ADMIN_ROLE_NAME`, `lib/modules/unidades/domain/actor.ts`), validado en el service y falla cerrado. Heredado de **QC-32**, pregunta 4. Si el permiso debe cambiar, lo decide **QC-38** |
| 2026-09-07 | E2E | **Diferido con motivo**: no hay pantalla ni flujo navegable que abrir. Lo decide **QC-39**. Mismo criterio que QC-14, QC-24 y QC-32 |
| 2026-09-07 | Librería nueva | **Ninguna.** Es esquema, migración, un filtro y una función pura. Regla 7 de `CLAUDE.md` sin propuesta que abrir |
| 2026-09-07 | ¿Se puede cambiar la base o el factor de una unidad ya en uso? | **Sí se puede.** El producto y la línea de receta guardan una **referencia** a la unidad, no una cantidad ya convertida, así que cambiar el factor no invalida nada de lo guardado. Mismo criterio que **QC-33** con el total del pedido, que se calcula y no se guarda. La validación de la edición es de **QC-38** |
| 2026-09-07 | ¿El símbolo debe ser único? | **Sí.** Único **cuando existe** —sigue siendo **opcional**— y con el **mismo ámbito que el nombre**: dentro de la empresa, y las de sistema entre ellas. Medirlo distinto haría que el «kg» de sistema bloqueara el «kg» de una empresa que sí puede tener su propio kilogramo. **Cierra la pregunta abierta 1 de QC-32**, que dejó el símbolo sin índice a propósito |
| 2026-09-07 | ¿Qué pasa con las unidades de una empresa que se borra? | **Nada.** `companies` tiene borrado lógico (**QC-47**), así que ninguna fila desaparece de verdad y las unidades de esa empresa se quedan como están |
| 2026-09-07 | ¿Convergen presentación y unidad? | **No: son entidades separadas** y no convergen. **Cierra la pregunta abierta 3 de QC-32** |
| 2026-09-07 | ¿Qué escala tiene el resultado de la conversión cuando la división no termina? | **12 decimales, truncando** —nunca redondeando hacia arriba—, en una **constante con nombre** documentada en el contrato. Cuando la división **sí** termina, el resultado sale **exacto**, con todas sus cifras: eso no cambia. No se falla y no se expone el resultado como par exacto. Los 12 salen de que la escala máxima que guarda hoy cualquier columna del ERP son **4** decimales (`decimal(14,4)`, **QC-33**), así que dejan **ocho dígitos de margen** por debajo de lo que cualquier consumidor vaya a mostrar. **Cierra la pregunta abierta que `spec_author` levantó al escribir los requisitos**: «no redondea» no estaba definido para un factor de destino con algún divisor distinto de 2 y de 5 —un `3.0000` produce un decimal periódico— |
