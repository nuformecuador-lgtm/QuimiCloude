# QC-81 — lote-y-fecha-de-compra · requirements.md

> **Zona** `backend` · **Complejidad** `medium` · **depends_on** QC-49 (cerrada) ·
> **Rama** `feature/QC-81-lote-y-fecha-de-compra`
>
> **Alcance.** El lote y la fecha de compra viven en **`product_batches`**, no en el producto: cada
> entrada de mercancia es un lote con su propio correlativo y su propia fecha. El lote pasa a ser
> **obligatorio**; si quien da de alta no lo escribe, **lo genera el backend** con un numero simple
> que **continua desde el mas alto** de esa empresa, y la unicidad es **por empresa**. La fecha de
> compra es obligatoria, con **hoy** por defecto, y **nunca futura**. Las filas que ya existen se
> rellenan al migrar: el lote por orden de creacion con la serie de su empresa, y la fecha con el
> `created_at` que la fila ya tiene.
>
> **La premisa de esta ficha estaba derogada y se corrigio al acotar.** Se escribio el 2026-09-08
> diciendo que el lote es un campo del **producto** y que habia que esperar a que `products` tuviera
> `company_id`. Desde entonces cerro **QC-90**: el lote **ya existe**, en `product_batches.lot`
> —anulable, sin unicidad y sin correlativo—, un producto puede tener **varios** lotes, y
> `product_batches` **ya tiene** `company_id` desde QC-49. La fecha de compra, en cambio, **no existe
> en ninguna parte**: lo que hay es `expiry_date`, que es otra cosa.
>
> **Lo que NO entra.**
> - **La pantalla.** Que el formulario de alta muestre la fecha de compra y el lote generado es
>   **QC-103** (`zone: frontend`, «is blocked by» esta), creada el 2026-09-13 al acotar. Mismo
>   reparto que QC-87 → QC-102.
> - **El E2E**, diferido **con motivo** a QC-103: aqui no hay recorrido nuevo que mirar. Lo que se
>   exige aqui es **integracion contra base real**.
> - **Que la existencia salga de los lotes** (**QC-91**) y **el ajuste de inventario** (**QC-92**).
> - **Consumir el lote**: elegir de que lote sale lo despachado, avisos por vencer, y que cuenta
>   como lote vivo. Sigue siendo la **pregunta 2 del dominio**, abierta.
>
> *Sembrado por `/afinar-feature` el 2026-09-13. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijo el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aqui es `## Requisitos (EARS)`.*

## Requisitos (EARS)

> Notación EARS (`docs/specs.md`). **«El sistema»** aquí es el módulo **`inventario`** —su esquema
> de entrada del alta, su puerto, su caso de uso y su adaptador Prisma—, la **Server Action** del
> alta y la **migración** que esta ficha añade. La pantalla **no** es sujeto de ningún requisito:
> es QC-103.
>
> **Lo que ya existe y no se re-especifica.** `product_batches` la creó
> `20260909120000_product_batches` (presentación obligatoria, `stock` con `CHECK >= 0`, `unit_cost`
> `DECIMAL(14,4)` con `CHECK > 0`, auditoría, RLS `ENABLE`+`FORCE` sin policies) y QC-49 le añadió
> `company_id` NOT NULL con su FK, su índice y el disparador `product_batches_check_company`
> (`20260911130000_inventory_company_scope`). El alta con su primer lote la escribió QC-90. Esta
> ficha **cambia dos cosas** de eso: `lot` pasa de anulable a obligatorio con correlativo y unicidad
> por empresa, y aparece una columna de **fecha de compra** que hoy no existe en ninguna parte
> (`db/schema.prisma:697-720`).
>
> Cada requisito lleva entre corchetes la fila de **«Decisiones cerradas»** que lo origina, para que
> ninguna decisión se quede sin test. **`D<n>` es la fila n-ésima de esa tabla, en su orden**: D1
> quién genera el lote, D2 unicidad por empresa, D3 fecha obligatoria con hoy por defecto, D4 dónde
> viven los dos campos, D5 forma del correlativo, D6 la serie continúa desde el más alto, D7 los
> lotes vacíos de hoy y el `NOT NULL`, D8 qué fecha reciben las filas existentes, D9 nunca futura,
> D10 la pantalla no entra, D11 qué verificación se exige, D12 autorización/idioma/borrado/forma de
> la fecha, y D13 —añadida en la enmienda del 2026-09-15— el lote tecleado de solo dígitos que no
> puede llegar a 60 caracteres. **D4 no lleva requisito propio a propósito**: es el sujeto de R1–R27
> —todos hablan de `product_batches`— y ningún requisito menciona `products` como sede de estos dos
> campos.
>
> **Enmienda del 2026-09-15 (F1.2 sobre el spec ya aprobado e implementado).** Sale de la revisión
> (`progress/review_QC-81-lote-y-fecha-de-compra.md > 6`) y cambia tres cosas de este archivo, ninguna
> más:
> - **R4**, y R6 por el mismo motivo, dicen ahora qué ve quien llama y qué se queda en el registro
>   (menor m3).
> - Nace **D13**, con sus requisitos **R34–R36**.
> - Se abre la **pregunta P1**, sobre la migración, y queda **cerrada el mismo 2026-09-15 con la
>   opción D**: no hay guardia y no nace R37.
>
> Ningún otro requisito cambia de texto ni de número.

### La fecha de compra

**R1.** El sistema DEBE registrar en **cada** fila de `product_batches` una **fecha de compra**
obligatoria, como fecha **civil** (día, sin hora ni zona). No DEBE existir ningún camino de escritura
que deje una fila de lote sin fecha de compra. [D3]

**R2.** CUANDO el alta **no** trae fecha de compra, el sistema DEBE guardar **la fecha de hoy**,
derivada del **mismo instante** que el caso de uso ya inyecta para `created_at`/`updated_at`, y no de
un segundo reloj. [D3]

**R3.** CUANDO el alta trae fecha de compra, esta DEBE viajar como **fecha civil `YYYY-MM-DD`** y el
sistema DEBE guardar **la misma fecha civil** que se escribió, sin corrimiento de día por zona
horaria ni por hora del día del servidor. [D12]

**R4.** SI la fecha de compra recibida es **posterior a hoy**, ENTONCES el sistema DEBE rechazar el
alta con `invalid_input` y NO DEBE escribir ni el producto ni el lote. Quien llama recibe **ese
código y su mensaje del catálogo, sin indicación de campo**, igual que con cualquier otra entrada
inválida. El motivo, que nombra `purchaseDate`, DEBE quedar en el **diagnóstico** del error, que va
al registro del servidor y no a quien llama. [D9]
*(Precisado el 2026-09-15, menor m3: la redacción anterior prometía «señalando el campo
`purchaseDate`», y ese campo solo llega al registro. Pintar el rechazo en el campo es herencia de
QC-103, `design.md > 9.5`.)*

**R5.** El sistema DEBE **aceptar** cualquier fecha de compra **anterior o igual a hoy**, incluida
una de días o meses atrás, sin rechazarla y sin corregirla. [D9]

**R6.** SI la fecha de compra recibida no tiene la forma `YYYY-MM-DD` o no es una fecha de calendario
existente, ENTONCES el sistema DEBE rechazar el alta con `invalid_input`, sin escribir nada, y la
**validación de entrada** DEBE señalar el campo `purchaseDate`. Quien llama al alta en el servidor
recibe, como en R4, el código sin campo. [D9]
*(Precisado el 2026-09-15 por el mismo motivo que R4. No cambia ningún test: el campo ya se afirma
sobre la validación de entrada.)*

### El lote es obligatorio y lo genera el backend

**R7.** El sistema DEBE terminar **toda** alta con el `lot` de la fila **escrito**: ni `NULL` ni
cadena vacía ni solo espacios. La obligatoriedad DEBE estar **en la base** —columna `NOT NULL` más
una restricción que rechace el lote en blanco—, no solo en la validación de entrada. [D7]

**R8.** CUANDO el alta **no** trae lote, el sistema DEBE **generarlo en el backend**. NO DEBE
aceptarse ningún camino en el que el correlativo lo proponga el cliente. [D1]

**R9.** El lote generado DEBE ser un **número simple en texto** —dígitos, sin relleno de ceros, sin
año y sin prefijo— igual al **siguiente entero del más alto** de los lotes **puramente numéricos**
que ya existen **en esa empresa**; y DEBE ser `1` cuando esa empresa no tiene todavía ningún lote
numérico. [D5, D6]

**R10.** CUANDO el alta trae un lote escrito a mano, el sistema DEBE guardarlo **tal cual** tras
recortar los espacios de los extremos —siga o no la forma numérica— y NO DEBE sustituirlo por un
correlativo generado. [D5]

**R11.** El sistema DEBE garantizar **en la base**, con un índice único sobre la pareja
(empresa, lote), que dentro de una misma empresa no existan dos lotes con el mismo valor. Una
comprobación hecha solo en el código NO satisface este requisito. [D2]

**R12.** MIENTRAS dos lotes pertenezcan a **empresas distintas**, el sistema DEBE permitir que
tengan **el mismo** valor de lote. [D2]

**R13.** SI el lote escrito a mano ya existe en la empresa del actor, ENTONCES el sistema DEBE
rechazar el alta con un error **distinguible** del resto —código propio, mensaje propio—, NO DEBE
escribir ni el producto ni el lote y NO DEBE sustituirlo por un correlativo generado. [D2]

**R14.** CUANDO **dos altas de la misma empresa** piden el correlativo **a la vez**, el sistema DEBE
terminar con **dos lotes distintos y consecutivos** y **ninguna** de las dos altas DEBE fallar por
ello. [D11]

**R15.** SI aun así una escritura con lote **generado** choca contra la unicidad de la base, ENTONCES
el sistema DEBE **reintentar la generación** un número **acotado** de veces; agotados los intentos
DEBE fallar de forma ruidosa —error propagado con contexto, nunca `catch` vacío— **sin escribir
ninguna fila** y **sin reutilizar** un lote que ya existe. [D2, D11]

**R16.** CUANDO en una empresa existe un lote `'50'` escrito a mano y la serie iba por `7`, el
siguiente lote generado para esa empresa DEBE ser `'51'`. El generador NO DEBE proponer nunca un
valor que ya existe en esa empresa. [D6]

### La migración y el relleno de lo que ya está escrito

**R17.** El sistema DEBE añadir **una** migración versionada con su `migration.sql` y su `down.sql`,
y la reversión DEBE dejar el esquema **exactamente** como estaba: sin la columna de fecha de compra,
sin el índice único de lote y con `lot` anulable otra vez. [D7, D8]

**R18.** CUANDO se aplica la migración, cada fila existente **sin lote** DEBE recibir un correlativo
**por orden de creación dentro de su empresa**, continuando desde el más alto que esa empresa ya
tenga; y cada fila que **ya tiene** lote DEBE conservarlo intacto. [D7, D6]

**R19.** CUANDO se aplica la migración, cada fila existente DEBE recibir como fecha de compra la
fecha civil de **su propio `created_at`**, y NO la fecha en que se ejecuta la migración. [D8]

**R20.** MIENTRAS la tabla `product_batches` esté **vacía**, la migración DEBE aplicarse **sin
error** y dejar el esquema completo. NO DEBE convertirse en una segunda migración que la receta de la
plantilla de tests tenga que esperar que falle. [D7]

**R21.** SI antes de migrar existen dos filas de la **misma empresa** con el **mismo** lote, ENTONCES
la migración DEBE detenerse **entera**, con un mensaje que diga cuántas son y qué hacer, y NO DEBE
dejar ninguna columna, restricción ni índice a medias. [D2]

**R22.** El sistema DEBE rellenar las dos columnas **antes** de exigirlas —`NOT NULL` y el índice
único al final—, todo dentro de la **misma transacción**: no DEBE existir ningún instante en el que
otra sesión pueda escribir un lote sin fecha de compra o sin lote. [D7, D8]

**R23.** El `down.sql` NO DEBE borrar **ningún** valor de lote ya escrito —ni los del relleno ni los
escritos a mano, que no se pueden distinguir—: se limita a quitar lo que el UP añadió. [D7]

### Autorización, escritura y herencias

**R24.** SI el actor no está autenticado o no tiene el permiso `inventario.modificar`, ENTONCES el
sistema DEBE rechazar con `unauthorized` **antes** de validar la entrada y **antes** de tocar el
puerto de datos, sin escribir nada ni consumir ningún correlativo. [D12]

**R25.** El sistema DEBE escribir el producto y su lote **en una sola transacción**, también cuando el
lote se genera: si falla cualquier parte —la generación, la unicidad, la fecha—, NO DEBE quedar
ninguna de las dos filas. [D1, D12]

**R26.** El sistema DEBE nombrar en **inglés** la columna nueva, su restricción y su índice, DEBE
guardar la fecha como tipo **fecha** (no texto, no marca de tiempo) y NO DEBE cambiar el régimen de
borrado de ninguna tabla: `product_batches` sigue **sin** marca de borrado y el producto sigue con
borrado **lógico**. [D12]

**R27.** El sistema DEBE seguir escribiendo la empresa del lote **desde el ámbito del actor** y NO
DEBE aceptarla por la entrada: el correlativo se calcula **contra la empresa del ámbito**, nunca
contra una empresa que venga del llamante. [D2, D12]

### Límites de esta ficha (requisitos negativos)

**R28.** El sistema NO DEBE cambiar **ningún** archivo bajo `app/**` ni bajo `components/**`: el diff
de esta rama en esas dos carpetas DEBE ser **vacío**. La pantalla es **QC-103**. [D10]

**R29.** El sistema NO DEBE añadir **ningún** test E2E nuevo ni modificar los existentes: el recorrido
de navegador se difiere a QC-103. La verificación exigida aquí es **integración contra base real**.
[D11]

**R30.** El sistema NO DEBE añadir, quitar ni actualizar ninguna dependencia: `package.json` y
`pnpm-lock.yaml` DEBEN quedar **sin cambios**.

**R31.** El sistema NO DEBE tocar la **existencia por lote** (QC-91) ni el **ajuste de inventario**
(QC-92): `products.stock` se sigue escribiendo como lo dejó QC-90 y no aparece ninguna operación de
ajuste, de suma de lotes ni de consumo de lote.

**R32.** El sistema NO DEBE ofrecer ninguna operación de **listar**, **editar** ni **borrar** lotes:
el contrato público de `inventario` no expone ninguna de las tres (se mantiene QC-90 R30).

**R33.** CUANDO se verifica esta ficha, DEBE existir prueba de **integración contra base real** —no
solo unitaria con la base simulada— del **correlativo**, de la **unicidad por empresa**, del
**relleno de la migración** y de **dos altas compitiendo por el mismo número**. [D11]

### Enmienda del 2026-09-15: el lote numérico generado cabe siempre

> Sale de la corrección m4. Con la serie sin techo, si el lote de solo dígitos más alto de una
> empresa tiene 60 caracteres, el siguiente generado tendría 61 y no cabría en el largo máximo del
> lote. D13 lo corta en la entrada.
>
> **«Solo dígitos»** son los caracteres `0`–`9`: el mismo conjunto con el que la serie decide qué
> lote es numérico (R9). Qué hace la migración si un lote así ya está escrito fue la pregunta
> **P1**, cerrada el 2026-09-15 con la opción D («no los hay, es nuevo todo»). No lleva guardia ni
> requisito: no hay R37.

**R34.** SI el alta trae un lote escrito que, **tras recortar los espacios de los extremos**, está
formado **solo por dígitos** y llega a los **60 caracteres** —contando también los ceros a la
izquierda—, ENTONCES el sistema DEBE rechazar el alta con `invalid_input`, NO DEBE escribir ni el
producto ni el lote, y NO DEBE sustituirlo por un correlativo generado. Además, la **validación de
entrada** DEBE señalar el campo `lot` con **un solo** rechazo. [D13]

**R35.** El sistema DEBE seguir **aceptando** un lote escrito de hasta 60 caracteres que contenga
**al menos un carácter que no sea dígito**, y uno de **solo dígitos de hasta 59 caracteres**. Los
dos se guardan tal cual, como dice R10. [D13, D5]

**R36.** CUANDO el lote de solo dígitos más alto de una empresa tiene **59 caracteres**, el siguiente
lote generado para esa empresa DEBE escribirse con sus **60 caracteres**, sin ningún rechazo, sin
reintento y sin error. [D13, D6]

## Preguntas abiertas

**Ninguna.** Las dos que la ficha arrastraba desde el 2026-09-08 —la forma exacta del correlativo y
qué valor reciben las filas existentes en el backfill— están cerradas en la tabla de abajo. La que
abrió la enmienda del 2026-09-15, **P1**, también está cerrada: se deja escrita aquí debajo como
constancia, con su respuesta.

**P1 (abierta y cerrada el 2026-09-15). ¿Qué hace la migración si una empresa ya tiene escrito un
lote de solo dígitos de 60 caracteres?**

> **CERRADA el 2026-09-15 con la opción D.** Respuesta textual del humano: **«no los hay, es nuevo
> todo»**. No existen datos previos con lotes de solo dígitos de 60 caracteres o más, porque todo es
> nuevo.
>
> **Consecuencia:**
> - **La migración no lleva guardia para ese caso.**
> - **No nace R37.**
> - **T15 queda cancelada** («NO APLICA»).
>
> Por el mismo motivo tampoco se protege el caso vecino, el de los lotes ya escritos de **más** de 60
> caracteres de cualquier forma. Los dos quedan como límite conocido y aceptado en
> `design.md > 9.6`. Se registra también como nota de D13, en la tabla de abajo; no abre otra
> decisión.
>
> Lo que sigue es el planteamiento tal como se hizo, sin cambios.

D13 impide **teclearlo** desde ahora, pero no dice nada de los que ya estén en la base. Hoy no consta
ninguno: en la base de desarrollo hay una sola fila y **no se ha medido producción**. Lo que pasa
ahora mismo, medido contra base efímera (`progress/impl_QC-81-lote-y-fecha-de-compra.md >
Correcciones de la revision`):

- **Con 60 nueves y alguna fila sin lote en esa empresa**, la migración aborta **entera** al crear el
  `CHECK` de largo, con el mensaje genérico de Postgres. No deja nada a medias.
- **Con 60 nueves y ninguna fila sin lote**, la migración pasa. A partir de ahí, **toda** alta con lote
  generado de esa empresa falla como `unexpected`. Como R32 no deja editar lotes, no hay arreglo desde
  la aplicación.
- **Con 60 dígitos que no son todos nueves**, no falla nada. Ni el relleno ni el alta pasan de 60
  hasta que la serie llegue a 60 nueves, y por generación eso no ocurre en la práctica.

Opciones, con su coste (detalle en `design.md > 9.6`):

- **A.** La migración aborta con **mensaje propio**, como R21, si **cualquier** empresa tiene un lote
  de solo dígitos de 60 caracteres. Es coherente al pie de la letra con D13, pero bloquea la migración
  también por datos que no rompen nada. Hay que renombrarlos a mano por SQL antes de migrar.
- **B.** La migración aborta con **mensaje propio** solo si **alguna empresa tiene como máximo numérico
  60 nueves**, que es el único dato que rompe algo: el relleno o el alta. Cambia el aborto genérico por
  uno legible y cierra el bloqueo del alta, sin frenar la migración por datos inocuos.
- **D.** No se hace nada. Se acepta como límite conocido (`design.md > 9.6`), con el aborto genérico y
  el posible bloqueo del alta en esa empresa.

Hay una cuarta vía que **no** se ofrece, porque contradice D6: que la serie **ignore** esos lotes al
calcular el máximo. Para eso habría que enmendar D6, no responder P1.

Opinión técnica de `spec_author`, **no** decisión: la **B** es la que elimina los dos fallos reales
con la condición más estrecha. Al responder, conviene decir también si la guardia debe cubrir los
lotes ya escritos de **más** de 60 caracteres de cualquier forma, que hoy abortan con el mismo
mensaje genérico (desviación 5 de la Tanda 1 de la bitácora). Es un caso vecino, no es D13, y no se
incluye sin respuesta.

~~**Hasta que haya respuesta, T15 no se empieza**, y el requisito que nazca de ella (R37) no existe.~~
*Superado por el cierre del 2026-09-15: la respuesta fue D, T15 no aplica y R37 no nace.*

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-09-08 | ¿Quién genera el lote cuando no viene escrito? | **El backend**, nunca el front por su cuenta |
| 2026-09-08 | ¿La unicidad del lote es global o por empresa? | **Por empresa.** Dos empresas distintas sí pueden repetir el mismo valor entre ellas |
| 2026-09-08 | ¿La fecha de compra admite vacío? | **No**, y su valor por defecto es la fecha actual |
| 2026-09-13 | ¿Dónde viven los dos campos, ahora que los lotes existen? | **En `product_batches`, no en `products`.** Cada entrada de mercancía es un lote con su propio correlativo y su propia fecha: comprar el mismo producto en marzo y en junio son dos lotes con dos fechas. Es lo único coherente con **QC-90**, donde el alta siempre crea un lote |
| 2026-09-13 | ¿Qué forma tiene el correlativo? | **Número simple por empresa** (1, 2, 3…). El lote sigue siendo **texto**, así que quien quiera escribir «ACME-2026-07» a mano puede. No se fija ningún formato que envejezca —ni relleno de ceros ni año dentro— |
| 2026-09-13 | Alguien escribe «50» a mano cuando la serie iba por 7. ¿Qué genera el sistema después? | **51: la serie continúa desde el más alto que ya existe en esa empresa.** Así el generador **nunca** propone un valor que ya existe. Coste aceptado: un tecleo de «9000» deja la serie saltada para siempre |
| 2026-09-13 | ¿Qué pasa con los lotes que hoy tienen `lot` vacío? | **Se les asigna al migrar** —por orden de creación, con la serie de su empresa— **y la columna pasa a NOT NULL**. Esto **cambia** lo que decidió QC-90, que lo dejó opcional a propósito: por eso se preguntó en vez de darse por hecho |
| 2026-09-13 | La fecha de compra es obligatoria: ¿qué valor reciben las filas ya existentes? | **Su propio `created_at`**, que el lote ya tiene. Es lo más cerca de la verdad que hay en la base y no exige que nadie revise datos a mano. Se descartó la fecha de la migración, que afirmaría una fecha falsa indistinguible de una real |
| 2026-09-13 | ¿La fecha de compra admite cualquier valor? | **Hoy o antes, nunca futura.** Se puede registrar una compra de la semana pasada que se carga tarde; lo que aún no llegó no es existencia |
| 2026-09-13 | ¿Entra la pantalla? | **No**: va en **QC-103**, `zone: frontend`, bloqueada por esta. Mantiene la zona limpia y el cupo de paralelismo intacto, igual que QC-87 → QC-102 |
| 2026-09-13 | ¿Qué verificación se exige? | **Integración contra base real**, que es donde viven estas reglas: el correlativo, la unicidad por empresa, el backfill y **dos altas compitiendo por el mismo número**. Un unitario con la base simulada no puede demostrar ninguna de las dos últimas. **El E2E se difiere a QC-103**, que es la que tendrá algo que mirar |
| 2026-09-13 | Autorización, idioma, borrado y forma de la fecha | **Heredados, no se reabren.** Autorización **en el service** con `inventario.modificar` (**QC-20**, **QC-90**); identificadores de base **en inglés** y borrado **lógico** (**feature 4**, **QC-14**, **QC-90**); la fecha viaja como **fecha civil `YYYY-MM-DD`** y la convierte el adaptador (**QC-90**, `expiryDate`) |
| 2026-09-15 | Con la serie ya sin techo (m4), si el lote de solo dígitos más alto de una empresa tiene 60 caracteres, el siguiente generado tendría 61 y no cabe en el largo máximo de 60: en el alta es un error de base sin traducir y en la migración un aborto genérico. ¿Qué se hace? | **Un lote tecleado que sea solo dígitos no puede tener 60 caracteres**, para que el siguiente generado quepa siempre en el largo máximo de 60. **Precisa el alcance de D5**: el lote sigue siendo texto y un lote con al menos un carácter que no sea dígito conserva sus 60. Salió de la revisión de QC-81 y se decidió en la enmienda del spec. **Nota de cierre (2026-09-15, P1 → opción D):** con un lote así **ya escrito**, la migración **no lleva guardia**, y tampoco para los lotes ya escritos de más de 60 caracteres. Motivo textual del humano: «no los hay, es nuevo todo». No nace R37 |

*La fila D13 la escribió `spec_author` el 2026-09-15 en la enmienda F1.2. Transcribe la decisión humana
que transmitió el leader, y el humano la **aprobó** el 2026-09-15 (F1.4 de la enmienda). La nota de
cierre de P1 se añadió ese mismo día con la respuesta del humano. Las filas D1–D12 no se tocaron.*
