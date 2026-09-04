# QC-47 — modelo-empresa-y-membresias · requirements.md

> Zona: `backend` · Complejidad: `high` · `depends_on`: null · Rama: `feature/QC-47-modelo-empresa-y-membresias`
>
> **Alcance.** Dos tablas nuevas —la empresa y la pertenencia de un usuario a una empresa— y el
> movimiento del rol desde la ficha del usuario hasta esa pertenencia. La empresa tiene nombre
> único y se identifica por un identificador propio no adivinable. Un usuario puede pertenecer a
> varias empresas, con un rol distinto en cada una. El seed deja una empresa inicial con el
> usuario semilla dentro, y el seed y el login se adaptan a leer el rol de la pertenencia.
>
> **Lo que NO entra.** La empresa en la sesión y su validación en el middleware: es **QC-48**.
> Separar los datos ya guardados: inventario **QC-49**, recetas **QC-50**, unidades **QC-51**,
> proveedores **QC-59** y pedidos **QC-60**. La guardia de esquema que hará cumplir la columna de
> empresa: es **QC-61**. Un CRUD de empresas, una pantalla o un selector de empresa **no tienen
> ficha y no se construyen** (`docs/architecture.md > Dominio` n.º 1: eso sigue siendo
> sobre-ingeniería). **No hay E2E nuevo** (decisión 14).
>
> Sembrado por `/afinar-feature` el 2026-09-04. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

Notación EARS (`docs/specs.md`). **«El sistema»** aquí es (a) la **capa de persistencia** de
QuimiCloude —el esquema Prisma (`db/schema.prisma`) más la base Postgres con la migración de esta
feature aplicada— y (b) los **dos únicos consumidores** que hoy leen el rol de una persona: el
**seed** (`identity/domain/seed-initial-access.ts` + `scripts/seed.ts`) y el **login**
(`identity/adapters/driven/persistence/user-credentials-prisma.ts` y `session-user-prisma.ts`).
No hay CRUD de empresas, ni service de empresa, ni pantalla, ni selector: ningún requisito habla
de quién llama ni desde dónde, salvo donde nombra explícitamente al seed o al login.

### La empresa

**R1.** El sistema DEBE persistir, para cada empresa, un identificador propio **estable, no
derivado de sus datos de negocio y no adivinable** —un UUID aleatorio, ni correlativo ni derivado
del nombre—, más su **nombre**.

**R2.** SI se intenta persistir una empresa sin nombre, ENTONCES el sistema DEBE rechazar la
operación **en la propia base de datos** y no crear ninguna fila.

**R3.** El sistema DEBE persistir el **nombre normalizado** de cada empresa —sin acentos, sin
caracteres especiales y sin distinguir mayúsculas de minúsculas— en una **columna propia** junto al
nombre original, y DEBE exponer **una única definición** de esa normalización, publicada por el
contrato público del módulo propietario, de modo que la columna y cualquier consumidor futuro
normalicen igual.

**R4.** SI se intenta persistir una empresa cuyo nombre coincida, **una vez normalizado**, con el de
otra empresa **no dada de baja**, ENTONCES el sistema DEBE rechazar la operación **en la propia base
de datos** —contra un índice único, no contra una comprobación previa al vuelo— y no crear ni
modificar ninguna fila.

**R5.** El sistema DEBE declarar en la empresa una **marca de baja lógica** que nace vacía y que
significa «empresa viva» mientras esté vacía; y NO DEBE incluir en esta feature ninguna operación,
caso de uso, adaptador driving, ruta ni pantalla que dé de baja una empresa, ni ningún borrado
físico de la fila.

**R6.** El sistema DEBE registrar, en la empresa **y** en la pertenencia, el instante de creación y
el instante de la última modificación, y DEBE actualizar el segundo cada vez que la fila cambia.

### La pertenencia

**R7.** El sistema DEBE persistir, para cada pertenencia, un identificador propio más **tres
referencias obligatorias**: la persona, la empresa y el **rol que esa persona tiene en esa empresa**.

**R8.** El sistema DEBE admitir que una misma persona tenga pertenencias a **varias empresas
distintas**, con un **rol distinto en cada una**, y NO DEBE limitar a una el número de pertenencias
de una persona ni exigir que el rol coincida entre ellas.

**R9.** SI se intenta persistir una segunda pertenencia con la **misma pareja persona + empresa**
que una ya existente, ENTONCES el sistema DEBE rechazar la operación **en la propia base de datos**
—contra un índice único— y no crear ni modificar ninguna fila.

**R10.** SI se intenta persistir una pertenencia cuya referencia de persona, de empresa o de rol no
corresponda a ninguna fila existente, ENTONCES el sistema DEBE rechazar la operación **en la propia
base de datos** y no crear ni modificar ninguna fila.

**R11.** SI se intenta eliminar una persona, una empresa o un rol referenciados por al menos una
pertenencia, ENTONCES el sistema DEBE rechazar el borrado y conservar las tres filas intactas.

**R12.** El sistema NO DEBE declarar ninguna marca de borrado lógico en la pertenencia: esta feature
no construye ninguna revocación de pertenencia, y una columna que nadie escribe es deuda, no
información.

**R13.** El sistema NO DEBE añadir ninguna columna de empresa a `users`, `roles` ni
`document_types`, y NO DEBE separar por empresa el catálogo de roles ni el de tipos de documento: un
mismo rol, con un mismo identificador y un mismo nombre, DEBE poder usarse desde pertenencias a
empresas distintas.

### El rol se muda de la persona a la pertenencia

**R14.** El sistema NO DEBE conservar ninguna columna de rol en la tabla de usuarios: la columna
`role_id`, su clave foránea y su índice DEBEN desaparecer de `users`, y ningún archivo del
repositorio DEBE volver a leer ni escribir el rol de una persona desde esa tabla.

**R15.** El sistema DEBE resolver el rol de una persona **por su pertenencia**; y MIENTRAS una
persona tenga **exactamente una** pertenencia, el rol resuelto para ella DEBE ser el de esa
pertenencia (con más de una, quién elige es de **QC-48**, ver pregunta abierta 2).

**R16.** CUANDO alguien inicia sesión con credenciales válidas, el sistema DEBE firmar en la sesión
**el mismo rol que firmaba antes de esta feature** para esa misma persona, DEBE resolverlo **en la
misma consulta que autentica** —sin añadir una segunda lectura a la base en el camino de login— y
esa consulta DEBE seguir apoyándose en el índice único funcional `users_username_unique`.

**R17.** SI una persona viva no tiene **ninguna** pertenencia, ENTONCES el login DEBE tratarla como
no encontrada y NO DEBE emitir sesión con ningún rol: el sistema NO DEBE inventar un rol por
defecto ni emitir una sesión sin rol.

### El seed

**R18.** CUANDO se ejecuta el seed sobre una base sin acceso inicial, el sistema DEBE dejar creados
—**en una única transacción**, de modo que si cualquier paso falla no quede nada a medias— los roles
del catálogo, **exactamente una empresa inicial**, el usuario semilla, y **una pertenencia** que une
a ese usuario con esa empresa y con el rol `Administrador`.

**R19.** CUANDO se ejecuta el seed sobre una base que ya tiene su acceso inicial, el sistema NO DEBE
crear una segunda empresa ni una segunda pertenencia ni pisar las existentes: ejecutarlo dos veces
seguidas DEBE dejar exactamente el mismo estado que ejecutarlo una, y DEBE seguir informando por
consola sin exponer ninguna credencial.

**R20.** El nombre de la empresa inicial DEBE salir de **una única definición** del repositorio, y su
nombre normalizado persistido DEBE coincidir con el que produce sobre ese nombre la **única
definición** de la normalización (R3), tanto si la fila la crea el seed como si la crea la migración.

### Esquema, seguridad y migración

**R21.** El sistema DEBE nombrar en **inglés** las tablas, columnas, índices y restricciones que cree
esta feature.

**R22.** El sistema DEBE declarar el **módulo propietario** (`/// @module`) de los dos modelos
nuevos en el esquema, y ningún módulo distinto de ese propietario DEBE consultarlos con el cliente
Prisma.

**R23.** El sistema DEBE tener `ROW LEVEL SECURITY` activado **y forzado**
(`FORCE ROW LEVEL SECURITY`) en las **dos** tablas que crea esta feature.

**R24.** CUANDO se aplica la migración de esta feature sobre una base con usuarios ya cargados, el
sistema DEBE dejar para **cada** usuario una pertenencia con **exactamente el rol que tenía** en
`users.role_id`, sin perder ni cambiar el rol de ninguno y sin dejar ningún usuario sin rol
resoluble.

**R25.** CUANDO se revierte la migración de esta feature, el sistema DEBE quedar **exactamente** en
el estado de esquema previo a aplicarla: `users.role_id` vuelve a existir, obligatoria, con su clave
foránea y su índice tal como los dejó **QC-4**, y con el rol que la pertenencia guardaba; y no queda
tabla, columna, índice ni restricción residual de la empresa ni de la pertenencia.

**R26.** SI al revertir la migración algún usuario tiene un número de pertenencias **distinto de
una**, ENTONCES el sistema DEBE **abortar la reversión completa** y NO DEBE inventar, elegir al azar
ni descartar en silencio ningún rol (es R24 leído al revés: fallar antes que perder el dato).

**R27.** El sistema NO DEBE eliminar, recrear ni alterar los índices únicos **funcionales y
parciales** de `users` (`users_email_unique`, `users_username_unique`, `users_document_unique`), que
viven escritos a mano en la migración de **QC-4**, ni el `FORCE ROW LEVEL SECURITY` de las tablas
existentes: esta feature los deja byte a byte como estaban.

### Límite de alcance

**R28.** El sistema NO DEBE incluir en esta feature ninguna operación de alta, edición o baja de
empresas, ninguna pantalla, ningún selector de empresa, ninguna empresa en la sesión ni ninguna
columna de empresa en las tablas de operación; por lo tanto esta feature **no aporta ningún flujo
navegable nuevo** que un test E2E pueda visitar, y el E2E de login que ya existe (**QC-7**) DEBE
seguir pasando **sin cambios en su guion**.

**R29.** El sistema NO DEBE incorporar ninguna dependencia de terceros nueva para cumplir los
requisitos anteriores.

### Cobertura de las decisiones cerradas

Cada fila de `## Decisiones cerradas (no reabrir)`, en el orden en que está escrita, con el o los
requisitos que la hacen testeable. Ninguna queda sin `R<n>`.

| # | Decisión cerrada | Requisito(s) |
| --- | --- | --- |
| 1 | La empresa se identifica por un UUID aleatorio, no adivinable | R1 |
| 2 | El nombre de empresa es único sin distinguir mayúsculas ni acentos | R2, R3, R4 |
| 3 | Un usuario puede pertenecer a varias empresas | R8 |
| 4 | La pareja usuario + empresa es única | R9 |
| 5 | El rol es por empresa y vive en la pertenencia | R7, R8, R15 |
| 6 | `users.role_id` se mueve del todo; seed y login siguen dando el mismo resultado | R14, R15, R16, R17, R18, R24 |
| 7 | Roles y tipos de documento son del sistema, no se separan por empresa | R13 |
| 8 | Baja lógica de empresa; la operación de baja no se construye aquí | R5 |
| 9 | Identificadores de la base en inglés | R21 |
| 10 | `created_at` y `updated_at` en las dos tablas nuevas | R6 |
| 11 | RLS activada y forzada en las dos tablas nuevas | R23 |
| 12 | Migración con `down.sql` que revierte al esquema exacto anterior, `role_id` incluida | R25, R26, R27 |
| 13 | `/// @module` obligatorio en los dos modelos nuevos | R22 |
| 14 | No hay E2E nuevo; el E2E de login de QC-7 es la prueba de que nada se rompió hacia fuera | R16, R28 |
| 15 | Ninguna librería nueva | R29 |
| 16 | El nombre de la empresa inicial es `QuimiCloud`, en una única definición usada por el seed y por el backfill (cerrada en F1.4) | R20 |
| 17 | Una empresa dada de baja libera su nombre: índice único parcial (cerrada en F1.4) | R4 |

## Preguntas abiertas

No se rellenan con supuestos (regla 6 de `CLAUDE.md`).

1. **Módulo propietario de las dos tablas nuevas.** ¿Un módulo `empresas` propio, como se hizo
   con `unidades` en QC-32, o dentro de `identity`? No es libre: la guardia
   `guard-arquitectura-modulos` prohíbe que un módulo consulte un modelo ajeno con Prisma, y el
   login y el seed —que son de `identity`— pasan a necesitar el rol, que vivirá en la
   pertenencia. Lo decide el `design.md` con ese condicionante encima de la mesa.
2. **Con qué empresa inicia sesión quien tenga más de una pertenencia.** El modelo lo permite
   desde el primer día; quién elige es de **QC-48**, que ya la lleva anotada como su pregunta
   abierta. Aquí solo se hace constar que el modelo no la cierra.
3. **Moneda por empresa** (pregunta abierta n.º 5 del dominio, abierta el 2026-09-04 al
   reescribir el punto 1). No bloquea esta ficha: aquí no entra ningún importe.

**Las dos preguntas que añadió `spec_author` el 2026-09-04 (F1.2) quedaron CERRADAS por el humano
el mismo día, al aprobar el spec (F1.4).** Sus respuestas son las dos últimas filas de la tabla de
abajo. No queda ninguna pregunta abierta que bloquee la implementación.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
| --- | --- | --- |
| 2026-09-04 | Cómo se identifica una empresa | Por un **identificador propio no adivinable**: UUID aleatorio como clave, ni correlativo ni derivado del nombre. Heredado del patrón de **QC-4** y de todas las tablas del repo |
| 2026-09-04 | ¿Puede haber dos empresas con el mismo nombre? | **No.** El nombre es único, medido **sin distinguir mayúsculas ni acentos**, con el patrón de nombre normalizado que ya usan las presentaciones (**QC-14**/**QC-20**) y las unidades (**QC-32**) |
| 2026-09-04 | ¿Un usuario puede pertenecer a varias empresas? | **Sí**, el modelo lo soporta desde el principio. Hoy todos pertenecen a una sola y no hay forma de cambiar |
| 2026-09-04 | ¿La misma persona puede estar dos veces en la misma empresa? | **No.** La pareja usuario + empresa es única |
| 2026-09-04 | ¿El rol es el mismo en todas las empresas de una persona? | **No: el rol es por empresa.** Sale de la ficha del usuario y vive en la pertenencia |
| 2026-09-04 | Qué pasa con `users.role_id`, del que hoy leen el seed, el login y el rol firmado en la cookie | **Se mueve del todo en esta ficha.** La columna desaparece de `users`. Como cada persona tiene exactamente una pertenencia, el seed y el login resuelven el rol por ella y **siguen firmando el mismo rol de siempre**: nada cambia hacia fuera |
| 2026-09-04 | ¿Los roles y los tipos de documento se separan por empresa? | **No, son del sistema.** «Administrador» significa lo mismo en todas (`docs/architecture.md > Dominio` n.º 1) |
| 2026-09-04 | ¿Se puede dar de baja una empresa? | **Baja lógica.** La columna `deleted_at` nace con la tabla; **la operación de baja no se construye aquí** — no hay CRUD ni pantalla |
| 2026-09-04 | Idioma de los identificadores de la base | **Inglés** (tablas, columnas, índices, restricciones). Heredado de **QC-4** |
| 2026-09-04 | Marcas de tiempo | `created_at` y `updated_at` en las dos tablas nuevas. Heredado de **QC-4** y **QC-14** |
| 2026-09-04 | RLS | **Activada y forzada** en las dos tablas nuevas. Es defensa en profundidad; la frontera real es el service (`docs/architecture.md > Acceso a datos y autorizacion`). Heredado de **QC-14** |
| 2026-09-04 | Migración | Con su `down.sql`, que revierte **al esquema exacto anterior** — incluida la vuelta de `role_id` a `users`. Heredado de **QC-14** |
| 2026-09-04 | Módulo declarado en el esquema | `/// @module` obligatorio en los dos modelos nuevos. Heredado de **QC-14**; qué módulo, pregunta abierta 1 |
| 2026-09-04 | ¿Hace falta E2E? | **No hay E2E nuevo.** Es ficha de modelo y seed, no estrena pantalla. Pero el login **sí** cambia de fuente para el rol, así que el E2E de login que ya existe (**QC-7**) tiene que seguir verde y **esa es la prueba de que nada se rompió hacia fuera** |
| 2026-09-04 | ¿Librería nueva? | **Ninguna** |
| 2026-09-04 | Cómo se llama la empresa inicial que crea el seed (pregunta 4 del `spec_author`) | **`QuimiCloud`**, en una única constante del dominio (`INITIAL_COMPANY_NAME`), usada tanto por el seed como por el backfill de la migración. **No** sale del entorno. Cerrada por el humano en F1.4; se aparta de la posición por defecto que proponía `design.md > 6.1` (`Empresa Inicial`) |
| 2026-09-04 | ¿Una empresa dada de baja libera su nombre? (pregunta 5 del `spec_author`) | **Sí, lo libera.** Índice único **parcial** (`WHERE deleted_at IS NULL`), el precedente de `recipes`, `suppliers` y `users`. Cerrada por el humano en F1.4; coincide con la posición por defecto y es lo que ya dice **R4** |
