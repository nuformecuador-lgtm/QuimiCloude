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

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

**Ninguna.** Las cuatro que quedaron abiertas al acotar las cerró el humano el 2026-09-07, y
están en la tabla de abajo (cuatro últimas filas). Dos de ellas —el símbolo único y la
convergencia de presentación con unidad— cerraron además **las preguntas abiertas 1 y 3 de
QC-32**, vivas desde el 2026-09-02; queda anotado en el issue QC-32, cuyo spec no se toca.

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
