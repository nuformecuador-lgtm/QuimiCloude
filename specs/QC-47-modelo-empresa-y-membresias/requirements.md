# QC-47 — modelo-empresa-y-membresias · requirements.md

> Zona: `backend` · Complejidad: `high` · `depends_on`: null · Rama: `feature/QC-47-modelo-empresa-y-membresias`
>
> **El slug dice «membresias» y ya no hay membresías.** El nombre se conserva a propósito: la
> rama, el worktree y esta carpeta existen con él, y el arnés no renombra lo que ya está en disco
> (`docs/jira.md`). En el board la ficha se llama «Modelo de empresa y pertenencia del usuario».
>
> **Alcance.** Una tabla nueva, `companies`, y **una columna nueva en `users`: `company_id`**,
> obligatoria. Un usuario pertenece a **una sola** empresa y tiene **un solo** rol. La empresa se
> identifica por un UUID aleatorio no adivinable y su nombre no se repite, medido sin mayúsculas
> ni acentos; al dar de baja una empresa su nombre queda liberado. El correo, el nombre de
> usuario y el documento pasan a ser únicos **dentro de la empresa**. El seed deja una empresa
> inicial `QuimiCloud` con el usuario semilla dentro.
>
> **Lo que NO entra.** `users.role_id` **no se toca**: se queda exactamente donde está y como
> está. **No hay tabla de membresías** y no se construye nada que permita pertenecer a dos
> empresas. La empresa en la sesión y su validación en el middleware: es **QC-48**. Separar los
> datos ya guardados: inventario **QC-49**, recetas **QC-50**, unidades **QC-51**, proveedores
> **QC-59** y pedidos **QC-60**. La guardia de esquema: **QC-61**. Un CRUD de empresas, una
> pantalla o un selector de empresa **no tienen ficha y no se construyen**
> (`docs/architecture.md > Dominio` n.º 1: eso sigue siendo sobre-ingeniería). **No hay E2E
> nuevo** (decisión 15).
>
> Sembrado por `/afinar-feature` el 2026-09-04 y **reacotado el mismo día**, tras un
> malentendido: la primera versión modelaba una relación de muchos a muchos con tabla de
> pertenencias y movía el rol allí. El humano aclaró que un usuario tiene un solo rol y pertenece
> a una sola empresa. El bloque de Alcance y la tabla de «Decisiones cerradas» los fijó el humano
> ANTES del spec. `spec_author` los respeta, no los reabre y no los reescribe: su trabajo aquí es
> `## Requisitos (EARS)`.

## Requisitos (EARS)

Notación EARS (`docs/specs.md`). **«El sistema»** aquí es la **capa de persistencia** de
QuimiCloude —el esquema Prisma (`db/schema.prisma`) más la base Postgres con la migración de esta
feature aplicada—, **más el seed de acceso inicial** (`lib/modules/identity/domain/
seed-initial-access.ts` y su adaptador) y las **lecturas existentes** del login y de la sesión.
No hay alta, edición ni baja de empresas, ni service, ni pantalla, ni Server Action: ningún
requisito habla de quién llama ni desde dónde, y R28 lo fija como límite.

**Dos avisos de lectura.** (a) Los requisitos R13, R14 y R15 son de **no-regresión**: dicen que
algo NO cambia. Están escritos como requisitos y no como comentarios porque la primera vuelta de
esta ficha sí lo cambió, y un enunciado que nadie testea es un enunciado que se vuelve a romper.
(b) R25 y R26 son la misma exigencia en los dos sentidos: revertir devuelve el esquema exacto, y
si devolverlo obligara a perder o inventar un dato, la reversión falla en vez de hacerlo.

### La empresa

**R1.** El sistema DEBE persistir, para cada empresa, un identificador propio, estable, **no
correlativo y no derivado de sus datos de negocio**, y DEBE generarlo la propia base de datos.

**R2.** SI se intenta persistir una empresa sin nombre, ENTONCES el sistema DEBE rechazar la
operación **en la propia base de datos** y no crear ninguna fila; y NO DEBE limitar en la columna
la longitud del nombre.

**R3.** El sistema DEBE persistir el nombre normalizado de cada empresa —sin acentos, sin signos y
sin distinguir mayúsculas de minúsculas— en una **columna propia** junto al nombre original, y
DEBE exponer **una única definición** de esa normalización, publicada por el contrato público del
módulo `identity`, de modo que la columna, el seed y cualquier consumidor futuro normalicen igual.

**R4.** SI se intenta persistir una empresa **viva** cuyo nombre coincida, una vez normalizado, con
el de otra empresa viva ya existente, ENTONCES el sistema DEBE rechazar la operación **contra un
índice único de la base de datos** —no contra una comprobación previa al vuelo— y no crear ni
modificar ninguna fila.

**R5.** MIENTRAS una empresa esté dada de baja, el sistema DEBE aceptar el alta de otra empresa con
ese mismo nombre normalizado, y NO DEBE rechazarla por colisión.

**R6.** El sistema DEBE declarar en la empresa una marca de baja lógica que nace **vacía**, y NO
DEBE incluir en esta feature ninguna operación que la escriba: no hay alta, edición ni baja de
empresas.

**R7.** El sistema DEBE registrar, para cada empresa, el instante de creación y el instante de la
última modificación, y DEBE actualizar el segundo cada vez que la fila cambia.

**R8.** El sistema DEBE nombrar en **inglés** y en `snake_case` la tabla, las columnas, los índices
y las restricciones que cree, renombre o recree esta feature.

### La pertenencia del usuario

**R9.** El sistema DEBE persistir, para cada usuario, una referencia a **exactamente una** empresa,
y esa referencia DEBE ser **obligatoria en la propia base de datos**.

**R10.** SI se intenta persistir un usuario cuya referencia de empresa no corresponda a ninguna
empresa existente, ENTONCES el sistema DEBE rechazar la operación **en la propia base de datos** y
no crear ni modificar ninguna fila.

**R11.** SI se intenta eliminar una empresa referenciada por al menos un usuario —esté ese usuario
vivo o dado de baja—, ENTONCES el sistema DEBE rechazar el borrado y DEBE dejar la empresa y sus
usuarios intactos.

**R12.** El sistema NO DEBE incluir ninguna tabla, modelo, columna ni relación de **pertenencia**
que permita a un usuario pertenecer a más de una empresa, y NO DEBE ofrecer ninguna forma de
asociar un usuario a una segunda empresa.

### El rol: lo que NO cambia (no-regresión)

**R13.** El sistema DEBE conservar la columna de rol **en la propia fila del usuario**, obligatoria
y con el mismo nombre, tipo, clave foránea (borrado restringido hacia el catálogo de roles) e
índice con los que ya existía antes de esta feature; y esta feature NO DEBE moverla, renombrarla,
recrearla, hacerla anulable ni sustituirla por ninguna otra fuente del rol.

**R14.** CUANDO el sistema resuelve el rol de una persona —al autenticarla, al leer su sesión o al
decidir el acceso a una ruta—, DEBE tomarlo de esa misma columna del usuario y NO DEBE necesitar
ninguna lectura adicional a otra tabla para obtenerlo.

**R15.** El sistema NO DEBE añadir columna de empresa al catálogo de roles ni al catálogo de tipos
de documento, y DEBE permitir que usuarios de empresas distintas tengan el mismo rol del mismo
catálogo.

### La unicidad, ahora dentro de la empresa

**R16.** SI se intenta persistir un usuario **vivo** cuyo correo coincida, sin distinguir mayúsculas
de minúsculas, con el de otro usuario vivo **de la misma empresa**, ENTONCES el sistema DEBE
rechazar la operación **en la propia base de datos**; y DEBE aceptar ese mismo correo en un usuario
de **otra** empresa.

**R17.** SI se intenta persistir un usuario **vivo** cuyo nombre de usuario coincida, sin distinguir
mayúsculas de minúsculas, con el de otro usuario vivo **de la misma empresa**, ENTONCES el sistema
DEBE rechazar la operación **en la propia base de datos**; y DEBE aceptar ese mismo nombre de
usuario en un usuario de **otra** empresa.

**R18.** SI se intenta persistir un usuario **vivo** cuya pareja tipo de documento + número coincida
con la de otro usuario vivo **de la misma empresa**, ENTONCES el sistema DEBE rechazar la operación
**en la propia base de datos**; y DEBE aceptar esa misma pareja en un usuario de **otra** empresa.

**R19.** El sistema NO DEBE conservar en la base ningún índice único ni restricción que haga el
correo, el nombre de usuario o la pareja de documento únicos **fuera del alcance de una empresa**;
y las tres unicidades de R16, R17 y R18 DEBEN seguir midiéndose **solo entre usuarios vivos**, de
modo que dar de baja a un usuario libere su correo, su nombre de usuario y su documento dentro de
su empresa.

### La empresa inicial y el seed

**R20.** CUANDO se ejecuta el seed de acceso inicial sobre una base sin acceso inicial, el sistema
DEBE dejar creada la empresa inicial y el usuario semilla **dentro de ella**, en la misma
transacción, de modo que no exista ningún instante en el que quede una persona sin empresa ni una
empresa creada por un seed que después falló.

**R21.** El nombre de la empresa inicial DEBE salir de **una única constante del dominio** —la
misma que usa el backfill de la migración— y NO DEBE leerse de ninguna variable de entorno ni
escribirse como literal en ningún otro punto del código.

**R22.** CUANDO se ejecuta el seed sobre una base que ya tiene su acceso inicial, el sistema NO
DEBE crear una segunda empresa, ni un segundo usuario semilla, ni modificar los existentes:
ejecutarlo dos veces seguidas DEBE dejar exactamente el mismo estado que ejecutarlo una.

### La migración

**R23.** CUANDO se aplica la migración de esta feature sobre una base que ya tiene usuarios
cargados, el sistema DEBE crear la empresa inicial y dejar a **todos** esos usuarios —incluidos los
dados de baja— referenciando esa empresa, y DEBE dejar el rol de cada uno **exactamente como
estaba**, sin cambiar, vaciar ni reasignar ninguno.

**R24.** El sistema DEBE tener `ROW LEVEL SECURITY` activado **y forzado**
(`FORCE ROW LEVEL SECURITY`) en la tabla que crea esta feature.

**R25.** CUANDO se revierte la migración de esta feature, el sistema DEBE quedar exactamente en el
estado de esquema previo a aplicarla: no queda tabla, columna, índice, clave foránea ni restricción
residual de la empresa, y los tres índices únicos del usuario —correo, nombre de usuario y
documento— vuelven a tener **la definición literal** que tenían antes de esta feature.

**R26.** SI al revertir la migración existieran dos usuarios vivos de empresas distintas que
comparten correo, nombre de usuario o pareja de documento, ENTONCES el sistema DEBE **abortar la
reversión completa**, NO DEBE aplicar ninguno de sus cambios y NO DEBE borrar, renombrar ni dar de
baja ninguna fila para poder recrear los índices (es R25 leído al revés: fallar antes que perder el
dato).

### Frontera de módulo y límite de alcance

**R27.** El sistema DEBE declarar `identity` como módulo propietario del modelo que crea esta
feature, y ningún módulo distinto de `identity` DEBE consultarlo con el cliente Prisma.

**R28.** El sistema NO DEBE incluir en esta feature ninguna ruta, pantalla, Server Action, route
handler ni regla de permisos, y por tanto NO DEBE aportar ningún flujo navegable nuevo; y los
tests E2E que ya existen DEBEN seguir pasando **sin cambios en su guion** (lo que ejercita cada
`test(...)`, sus selectores y sus aserciones).

**R29.** El sistema NO DEBE incorporar ninguna dependencia de terceros nueva para cumplir los
requisitos anteriores.

### Cobertura de las decisiones cerradas

Cada fila de `## Decisiones cerradas (no reabrir)`, en el orden en que está escrita, con los
requisitos que la hacen testeable. Ninguna queda sin `R<n>`.

| # | Decisión cerrada | Requisito(s) |
| --- | --- | --- |
| 1 | Empresa identificada por UUID aleatorio, ni correlativo ni derivado del nombre | R1 |
| 2 | No hay dos empresas con el mismo nombre, medido sin mayúsculas ni acentos | R2, R3, R4 |
| 3 | Una empresa dada de baja libera su nombre (índice único parcial) | R5 |
| 4 | Un usuario pertenece a UNA sola empresa: `users.company_id` obligatoria, FK que impide borrar una empresa con usuarios, **sin tabla de pertenencias** | R9, R10, R11, R12 |
| 5 | Un solo rol, y `users.role_id` se queda intacto: seed, login y cookie lo leen del mismo sitio | R13, R14 |
| 6 | Correo, usuario y documento pasan a ser únicos DENTRO de la empresa; hay que rehacer los tres índices de QC-4 | R16, R17, R18, R19 |
| 7 | Baja lógica de empresa: `deleted_at` nace con la tabla, la operación no se construye aquí | R6 |
| 8 | Roles y tipos de documento son del sistema, no se separan por empresa | R15 |
| 9 | La empresa inicial se llama `QuimiCloud`, en una única constante del dominio usada por el seed y por el backfill, y no sale del entorno | R20, R21, R22 |
| 10 | La migración crea la empresa inicial y mete dentro a los usuarios ya cargados sin perder ni cambiar su rol | R23 |
| 11 | Identificadores de la base en inglés | R8 |
| 12 | `created_at` y `updated_at` en la tabla nueva | R7 |
| 13 | RLS activada y forzada en `companies` | R24 |
| 14 | Migración con `down.sql` que revierte al esquema exacto anterior, incluidos los tres índices únicos de QC-4 tal como estaban | R25, R26 |
| 15 | No hay E2E nuevo; los existentes tienen que seguir verdes | R28 |
| 16 | `/// @module identity` en `Company` | R27 |
| 17 | Ninguna librería nueva | R29 |

## Preguntas abiertas

No se rellenan con supuestos (regla 6 de `CLAUDE.md`).

1. **Cómo sabe el login de qué empresa eres.** Si el nombre de usuario solo es único dentro de la
   empresa, dos empresas pueden tener cada una su `admin` y el login deja de poder identificar a
   nadie solo con usuario y contraseña. **Hoy no rompe nada** —solo hay una empresa y ninguna
   ficha permite crear otra—, así que no bloquea esta ficha. La hereda **QC-48**, donde ya está
   anotada con las salidas conocidas (campo de empresa en el login, subdominio o ruta por
   empresa, o dejar el usuario global). **No se decide aquí.**
2. **Moneda por empresa** (pregunta abierta n.º 5 del dominio). No bloquea: aquí no entra ningún
   importe.

**Añadidas por `spec_author` (F1.2).** Ninguna bloquea el modelo y ninguna se rellena con un
supuesto. La 3 es la única que puede cambiar la forma de la migración, y por eso `tasks.md` la
resuelve con una comprobación ejecutable antes de escribir el backfill definitivo.

3. **~~¿`FORCE ROW LEVEL SECURITY` sobre `users` deja pasar el `UPDATE` del backfill?~~
   CERRADA el 2026-09-04 por la comprobacion ejecutable de T5.** **Sí, aquí pasa**, y la razón
   importa más que la respuesta. Medido contra `QuimiCloude_QC47`, con la cadena `DIRECT_URL`
   que usa Prisma Migrate: `users` está en `ENABLE`+`FORCE ROW LEVEL SECURITY` con **cero
   policies**, y un `ADD COLUMN` + `UPDATE … SET` + `SET NOT NULL` dentro de una transacción
   escribió **1 de 1** filas sin que Postgres lo denegara. Pero el rol de esa conexión es
   `postgres` con `rolsuper = true` y `rolbypassrls = true`, y **un superusuario salta la RLS
   pase lo que pase, `FORCE` incluido**: la medición confirma que el backfill corre aquí, no que
   la RLS lo deje pasar. La misma comprobación reproducida sobre una tabla `ENABLE`+`FORCE` sin
   policies cuyo **dueño NO es superusuario** da el resultado contrario y **silencioso**: el
   `UPDATE` termina en `OK` afectando **0 filas** y el `SELECT count(*)` ve **0**. No hay error.
   Consecuencia para el diseño: el backfill de §3.2 **se escribe tal cual** (no se elige a
   ciegas una salida que la medición no pide), y el riesgo residual queda acotado por el paso 6
   —`SET NOT NULL` fallaría con `23502` sobre una base con usuarios y sin backfill efectivo—,
   de modo que un despliegue con dueño no superusuario **rompe ruidosamente en vez de callar**.
   Queda anotado para la ficha que despliegue fuera de local.

**Redacción original de la pregunta 3, conservada:**

   **¿`FORCE ROW LEVEL SECURITY` sobre `users` deja pasar el `UPDATE` del backfill?** QC-4 dejó
   `users` con RLS **activada y forzada y sin ninguna policy**, y `FORCE` alcanza también al dueño
   de la tabla. El backfill de esta ficha necesita **escribir** en `users` (`SET company_id = …`),
   cosa que ninguna migración posterior a QC-4 ha hecho todavía: la única evidencia disponible es
   que la primera vuelta de QC-47 **leyó** `users` desde su migración sin que la denegaran. Que el
   rol con el que corre Prisma Migrate tenga `BYPASSRLS` no está escrito en `docs/` ni en el
   código, así que es un **desconocido** (regla 6). No cambia ningún requisito; cambia el `design`
   solo si la respuesta es «no», y en ese caso la salida está escrita en
   `design.md > 8, riesgo 2`.
4. **¿Puede entrar quien pertenece a una empresa dada de baja?** No se decide aquí: la decisión 7
   deja fuera la operación de baja, así que hoy no hay forma de que exista un usuario en una
   empresa muerta. Cuando esa operación exista habrá que decidir si arrastra a sus usuarios, si
   los bloquea en el login o si no hace nada. Es de la ficha que construya la baja, no de esta.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
| --- | --- | --- |
| 2026-09-04 | Cómo se identifica una empresa | Por un **identificador propio no adivinable**: UUID aleatorio como clave, ni correlativo ni derivado del nombre. Heredado del patrón de **QC-4** |
| 2026-09-04 | ¿Puede haber dos empresas con el mismo nombre? | **No.** Único, medido **sin mayúsculas ni acentos**, con el patrón de nombre normalizado de **QC-14**/**QC-20** y **QC-32** |
| 2026-09-04 | ¿Una empresa dada de baja libera su nombre? | **Sí.** Índice único **parcial** (`WHERE deleted_at IS NULL`), el precedente de `recipes`, `suppliers` y `users` |
| 2026-09-04 | ¿A cuántas empresas pertenece un usuario? | **A una sola.** `users.company_id`, **obligatoria**, con FK que impide borrar una empresa que todavía tenga usuarios. **No hay tabla de pertenencias** |
| 2026-09-04 | ¿Cuántos roles tiene un usuario? | **Uno solo, y `users.role_id` se queda intacto.** El rol NO se mueve: el seed, el login y el rol firmado en la cookie siguen leyéndolo del mismo sitio que hoy |
| 2026-09-04 | ¿El correo, el usuario y el documento siguen siendo únicos en todo el sistema? | **No: pasan a ser únicos DENTRO de la empresa.** Dos empresas pueden tener cada una su `admin`. Obliga a rehacer los tres índices únicos de **QC-4**, que son funcionales y parciales y están escritos a mano en su migración |
| 2026-09-04 | ¿Se puede dar de baja una empresa? | **Baja lógica.** La columna `deleted_at` nace con la tabla; **la operación de baja no se construye aquí** |
| 2026-09-04 | ¿Los roles y los tipos de documento se separan por empresa? | **No, son del sistema.** «Administrador» significa lo mismo en todas (`docs/architecture.md > Dominio` n.º 1) |
| 2026-09-04 | Cómo se llama la empresa inicial que crea el seed | **`QuimiCloud`**, en una única constante del dominio, usada por el seed **y** por el backfill de la migración. **No** sale del entorno |
| 2026-09-04 | Qué hace la migración con los usuarios ya cargados | Crea la empresa inicial y **mete a todos dentro**, sin perder ni cambiar el rol de ninguno |
| 2026-09-04 | Idioma de los identificadores de la base | **Inglés**. Heredado de **QC-4** |
| 2026-09-04 | Marcas de tiempo | `created_at` y `updated_at` en la tabla nueva. Heredado de **QC-4** y **QC-14** |
| 2026-09-04 | RLS | **Activada y forzada** en `companies`. La frontera real es el service (`docs/architecture.md > Acceso a datos y autorizacion`) |
| 2026-09-04 | Migración | Con su `down.sql`, que revierte **al esquema exacto anterior**, incluidos los tres índices únicos de QC-4 tal como estaban |
| 2026-09-04 | ¿Hace falta E2E? | **No hay E2E nuevo.** Es ficha de modelo y seed. Los E2E existentes tienen que seguir verdes |
| 2026-09-04 | Módulo declarado en el esquema | `/// @module identity` en `Company`: el usuario es de `identity` y la empresa cuelga de él. Cerrado ya en la primera vuelta del `design.md` |
| 2026-09-04 | ¿Librería nueva? | **Ninguna** |
