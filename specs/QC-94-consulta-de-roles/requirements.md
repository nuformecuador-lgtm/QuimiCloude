# QC-94 — consulta-de-roles · requirements.md

> **Zona** `backend` · **Complejidad** `low` · **depends_on** — · **Rama** `feature/QC-94-consulta-de-roles`
>
> **Alcance.** Una consulta que devuelve los roles existentes con su identificador y su nombre,
> ordenados por nombre, autorizada en el service. Es la pieza que le falta a QC-67 para pintar el
> selector de rol: QC-66 exige un `roleId` UUID en el alta y la edición de usuarios, y hoy no hay
> forma de saber qué roles hay ni qué identificador tiene cada uno.
>
> **Lo que NO entra.** Crear, editar o borrar roles: el catálogo es cerrado y corto y no tiene
> pantalla de administración (**QC-4**). Los permisos de cada rol → los declara **QC-74** y no se
> exponen aquí. La `description` del rol → existe en la tabla y hoy no la pinta nadie. Ninguna
> pantalla: el selector es **QC-67**.
>
> *Sembrado por `/afinar-feature` el 2026-09-11. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.*

## Requisitos (EARS)

> Notación EARS (`docs/specs.md`). **«El sistema»** aquí es el módulo **`identity`**: **un** caso de
> uso nuevo de consulta, su puerto, su adaptador driven de lectura y su adaptador driving. El modelo
> `Role` **ya existe y no se re-especifica** (feature 4, `db/schema.prisma`): esta ficha **solo lee**.
> Los dos permisos que autorizan —`usuarios.consultar` y `usuarios.modificar`— **ya existen** desde
> QC-66: esta ficha **no crea ninguno**.
>
> Cómo leer los requisitos que dicen «no»: **R11, R12 y R17–R21 son de ALCANCE y son requisitos de
> pleno derecho**, no comentarios, igual que R38–R48 de QC-66. Aquí son críticos: el catálogo es
> global y no se acota por empresa, la consulta no es un listado paginado, no se escribe ningún rol,
> no hay migración y no hay dependencia nueva.
>
> El mapa `R<n> -> test` lo escribe el implementer en `progress/impl_QC-94-consulta-de-roles.md`
> (`CHECKPOINTS.md > Trazabilidad`); el mapa previsto está en `tasks.md > Trazabilidad`.

### Autorización y actor

**R1.** El sistema DEBE exigir un permiso como **primera línea** de la consulta de roles —antes de
interpretar ninguna entrada y antes de tocar ningún puerto—: basta con que el actor traiga
**`usuarios.consultar` O `usuarios.modificar`**.

**R2.** SI el actor no trae **ninguno** de esos dos códigos exactos en su conjunto de permisos,
ENTONCES el caso de uso DEBE rechazar la operación con un error de autorización y NO DEBE realizar
ninguna lectura por ningún puerto. Falla **cerrado**: actor ausente, actor sin conjunto de permisos,
conjunto vacío, conjunto que no es una lista y conjunto con un permiso ajeno se rechazan igual; la
pertenencia es **exacta**, sin normalización y sin coincidencia parcial (un conjunto con `usuarios.`,
`usuarios.consultarlo` o `inventario.consultar` no concede nada).

**R3.** MIENTRAS el actor traiga **exactamente uno** de los dos códigos —solo `usuarios.consultar`, o
solo `usuarios.modificar`—, la consulta DEBE resolverse con éxito y devolver el catálogo completo: el
sistema NO DEBE exigir los dos a la vez, y NO DEBE derivar uno del otro para ningún otro fin.

**R4.** La decisión de autorizar NO DEBE depender del **rol** del actor: el caso de uso no lee, no
recibe y no compara el rol de quien pide, y ningún archivo nuevo de `lib/modules/identity/**` de esta
ficha incrusta el literal `'Administrador'` ni ningún otro nombre de rol.

**R5.** El sistema DEBE recibir el actor **como parámetro de entrada** de la consulta, y el dominio NO
DEBE leer sesión, cookie ni cabecera por su cuenta.

**R6.** CUANDO el adaptador driving de esta feature ejecuta la consulta, DEBE obtener el actor de la
sesión del servidor ya cableada a través de `@/lib/composition`, y NO DEBE repetir la comprobación de
permiso ni ninguna otra regla de negocio; SI la sesión no se resuelve, ENTONCES el actor DEBE ser
ausente y el caso de uso rechazar por R2.

**R7.** El sistema NO DEBE crear, modificar ni suprimir ninguna policy de `ROW LEVEL SECURITY`, y NO
DEBE apoyarse en ninguna para cumplir R1: una policy de RLS **no** cuenta como permiso implementado
(`docs/architecture.md > Acceso a datos y autorizacion`).

### Qué devuelve la consulta

**R8.** CUANDO un actor autorizado consulta los roles, el sistema DEBE devolver **todos** los roles
existentes en el catálogo, sin omitir ninguno y sin ningún límite superior de elementos.

**R9.** Cada rol devuelto DEBE traer **exactamente dos datos**: su **identificador** y su **nombre**.
El sistema NO DEBE incluir la `description`, ni los permisos del rol, ni las marcas de tiempo, ni
ningún otro campo: las claves de cada elemento son esas dos y ninguna más.

**R10.** El sistema DEBE devolver los roles ordenados por **nombre ascendente**, en un orden
**determinista**: dos invocaciones sobre el mismo contenido de la tabla devuelven la misma secuencia.

**R11.** La consulta NO DEBE acotarse por empresa: CUANDO dos actores autorizados de **empresas
distintas** la ejecutan sobre el mismo contenido de la tabla, el sistema DEBE devolverles el **mismo**
conjunto de roles, y ninguna lectura de esta feature DEBE filtrar por empresa ni exigir la empresa del
actor para resolverse.

**R12.** La consulta NO DEBE aceptar página, tamaño de página, texto de búsqueda ni orden pedido por
quien llama: no recibe ningún argumento de consulta además del actor, NO DEBE usar el contrato de
listado de QC-57 (`ListQuery`, `Page`, `sanitizeListQuery`) y NO DEBE declarar ninguna lista blanca de
campos consultables para `Role`.

### Frontera, módulo y errores

**R13.** El sistema DEBE exponer la consulta como **Server Action** en `adapters/driving/` del módulo
`identity`, con **argumento ya tipado y no `FormData`**; y NO DEBE crear ningún route handler ni llamar
por `fetch` a ninguna ruta API propia.

**R14.** El sistema DEBE señalar el fallo con una clase de error de dominio que lleve un **`code`
estable**, y el adaptador driving DEBE traducirlo a `{ status: 'error', code, message }` usando ese
`code` —**nunca** el texto del mensaje— con el traductor único del módulo `errores`; y NO DEBE existir
ningún `catch` que descarte un error sin manejarlo ni propagarlo con contexto.

**R15.** La Server Action de esta feature NO DEBE reexportarse desde `lib/modules/identity/index.ts`:
el contrato del módulo sigue reexportando **solo** símbolos de `./domain`, sin `'use server'`,
`@prisma/client` ni `next/*` en su cierre transitivo, de modo que QC-67 la importe por su **ruta
exacta** y el contrato siga siendo importable desde un componente de cliente.

**R16.** El sistema DEBE alojar el caso de uso en `lib/modules/identity/domain/`, con el acceso a datos
detrás de un **puerto** implementado en `adapters/driven/` y cableado **solo** en `lib/composition/`;
el dominio y el puerto NO DEBEN importar framework, Prisma, `lib/shared/`, `lib/composition` ni las
tripas de otro módulo.

### Alcance (lo que esta ficha NO hace)

**R17.** Esta feature NO DEBE ofrecer ninguna operación de **escritura** sobre los roles —crear,
editar, borrar ni reasignar permisos—: ningún método del puerto nuevo escribe, y ningún archivo nuevo
ejecuta un `create`, `update`, `upsert` o `delete` sobre `roles` ni sobre `role_permissions`.

**R18.** Esta feature NO DEBE incluir ninguna pantalla, página, componente de interfaz ni ruta bajo
`app/` o `components/` —el selector es **QC-67**—; por lo tanto no aporta ningún flujo navegable que un
test E2E pueda visitar, y su verificación es **unitaria y de integración**. El E2E se difiere **aquí y
con motivo** a QC-67.

**R19.** Esta feature NO DEBE añadir ninguna **migración** ni modificar `db/schema.prisma`: no crea ni
cambia ninguna tabla, columna, índice, restricción ni tipo, y no inserta ni borra ninguna fila.

**R20.** Esta feature NO DEBE incorporar ninguna **dependencia de terceros** nueva.

**R21.** Esta feature NO DEBE añadir, quitar ni renombrar ningún permiso del catálogo cerrado:
reutiliza los dos códigos que ya creó QC-66, y el catálogo DEBE seguir teniendo **trece** entradas
después de esta ficha.

### Cobertura de las decisiones cerradas

Cada fila de `## Decisiones cerradas (no reabrir)`, en el orden en que está escrita, con los requisitos
que la hacen testeable. Ninguna queda sin `R<n>`.

| # | Decisión cerrada | Requisito(s) |
| --- | --- | --- |
| 1 | El catálogo de roles es **global**: no se acota por empresa y no necesita la sesión para filtrar | R11, R8, R19 |
| 2 | Autoriza **cualquiera de los dos** permisos de usuarios, `consultar` **O** `modificar`; no queda abierta a cualquier sesión válida | R1, R2, R3, R21 |
| 3 | Autorización **en el service**, primera línea, fallando cerrado; actor por parámetro; la sesión se resuelve en el adaptador vía `@/lib/composition` | R1, R2, R4, R5, R6, R7 |
| 4 | Devuelve **identificador y nombre y nada más**, ordenados por nombre ascendente; la `description` **no sale** | R8, R9, R10 |
| 5 | **Nada** de paginado, búsqueda ni orden pedido; no se usa el contrato de QC-57 ni se declara `ROLE_QUERYABLE` | R12 |
| 6 | **Server Action de consulta con argumento tipado**; errores por `code` estable con el traductor único de QC-70; la action **no** se reexporta desde `index.ts` | R13, R14, R15 |
| 7 | **Sin E2E**, diferida a QC-67 con motivo; unitarios e integración sí, incluido el del permiso | R18, R1, R2, R3 |
| 8 | **Ninguna migración y ninguna dependencia nueva**: la tabla existe desde QC-4 y esta ficha solo lee | R19, R20, R17 |

Requisitos que **no** salen de una fila de la tabla, y de dónde salen: **R16** de
`docs/architecture.md > Modulos y arquitectura hexagonal` y `> Punto unico de composicion`; **R17** del
bloque «Lo que NO entra» («crear, editar o borrar roles» es **QC-4**, no esta ficha); **R18** del mismo
bloque; **R21** del catálogo cerrado de QC-74 tal y como lo dejó QC-66 (trece entradas).

## Preguntas abiertas

Ninguna.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-09-11 | ¿Los roles son de la empresa o del sistema? | **Del sistema: el catálogo es GLOBAL.** `db/schema.prisma` lo dice sin ambigüedad: `Role` tiene `id`, `name` **único en toda la tabla**, `description` y las marcas de tiempo — **ninguna columna de empresa**. Todas las empresas comparten los mismos roles, así que la consulta **no se acota por empresa** y no necesita el contexto de sesión para filtrar. **Corrige la primera redacción de la tarjeta**, escrita el mismo día, que decía «los roles de la empresa de la sesión» y era falsa; el board se corrigió antes de sembrar |
| 2026-09-11 | ¿Quién puede consultarlos? | **Cualquiera de los dos permisos de usuarios: `usuarios.consultar` O `usuarios.modificar`.** QC-74 decidió que `modificar` **no** implica `consultar`, y las dos mitades necesitan el selector: quien entra a la pantalla de QC-67 tiene `consultar`, quien abre el formulario de alta tiene `modificar`. Exigir solo uno dejaría a la otra mitad con un selector vacío. **Descartado** dejarla abierta a cualquier sesión válida: toda operación de este repo valida un permiso en el service y `CHECKPOINTS.md` exige su test |
| 2026-09-11 | ¿Dónde se autoriza y cómo llega el actor? | **En el service, como primera línea, y falla cerrado**: rechaza al actor ausente, al que trae el conjunto de permisos vacío y al que no trae ninguno de los dos códigos, sin normalización ni coincidencia parcial. El actor entra **por parámetro** y el dominio **no** lee sesión, cookie ni cabecera; la sesión se resuelve en el adaptador vía `@/lib/composition`. Heredado de **QC-66**, **QC-74** y `docs/architecture.md > Acceso a datos y autorizacion` |
| 2026-09-11 | ¿Qué devuelve cada rol? | **Identificador y nombre, y nada más**, ordenados por nombre ascendente. Es lo mínimo que el selector necesita. **La `description` no sale**: existe en la tabla, hoy no la pinta nadie, y devolver un campo que nadie usa invita a que aparezca en una pantalla sin que nadie lo decida |
| 2026-09-11 | ¿Paginado, búsqueda, orden pedido por quien llama? | **Nada de eso.** El catálogo es **cerrado y corto** —dos roles en el seed— y se devuelve entero. **No** se usa el contrato de listado de QC-57 ni se declara un `ROLE_QUERYABLE`: sería maquinaria para una lista que cabe en un selector. Si algún día hiciera falta, es una ficha, no un hueco de esta |
| 2026-09-11 | Forma de la frontera y errores | **Server Action de consulta con argumento ya tipado** —no `FormData`, porque nadie la llama desde un `<form>`—, igual que `getUserAction` y `listUsersAction` de QC-66. Los errores se traducen **por su `code` estable**, nunca por el texto del mensaje, con el traductor único del módulo `errores` (QC-70). La action **no se reexporta desde `index.ts`**: QC-67 la importa por su **ruta exacta**, porque un `'use server'` en el cierre transitivo del contrato lo haría inimportable desde un componente de cliente |
| 2026-09-11 | ¿E2E? | **No, y se difiere a QC-67 con motivo**: esta ficha no tiene pantalla, y el flujo de extremo a extremo se prueba cuando exista el selector que la ejerce — la E2E de QC-67 ya crea un usuario eligiendo rol. Precedente **QC-43 → QC-44** y **QC-66 → QC-67**. Tests unitarios y de integración **sí**, incluido el del permiso |
| 2026-09-11 | ¿Migración o dependencia nueva? | **Ninguna de las dos.** La tabla `roles` existe desde **QC-4** y está sembrada; esta ficha **solo lee**. Nada que instalar |
