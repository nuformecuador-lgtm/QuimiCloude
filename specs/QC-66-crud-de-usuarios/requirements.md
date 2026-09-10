# QC-66 — crud-de-usuarios · requirements.md

> **Zona:** `backend` · **Complejidad:** `medium` · **depends_on:** `QC-65` ·
> **Rama:** `feature/QC-66-crud-de-usuarios`
>
> **Alcance.** Los **seis** casos de uso que administran usuarios dentro del módulo `identity`:
> crear, consultar la ficha, listar, editar, borrar lógicamente y mover el estado de cuenta entre
> los cuatro valores que persiste QC-65. Todo acotado a la empresa de la sesión y autorizado por
> **dos permisos nuevos** —`usuarios.consultar` y `usuarios.modificar`— que llevan el catálogo
> cerrado de once a trece, con su migración y su seed. La contraseña la **genera el sistema** y
> nadie la ve: **esta ficha crea cuentas, no da acceso.**
>
> **Lo que NO entra.** La pantalla → **QC-67**. Que el estado mande en el login, y limpiar el
> contador de intentos al salir de `blocked` → **QC-78**. La contraseña opcional en el alta y el
> enlace para establecerla → **QC-79**, bloqueada por esta. Cambiar mi propia contraseña →
> **QC-36**. Restablecer la de otra persona → **QC-89**, creada al acotar esta ficha y bloqueada
> por QC-79. Invalidar sesiones abiertas con un sello por usuario → **QC-23**. Consultar mis
> propios datos → **no existe ficha y no se crea aquí**: el actor no se ve a sí mismo (decisión
> 12), así que «mis datos» tendrá que ser una consulta propia el día que alguien la pida.
>
> Sembrado por `/afinar-feature` el 2026-09-10. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

**P1 — Nadie le dice a la persona que tiene cuenta.** El alta no da acceso (decisiones 6 y 7), el
enlace para establecer la contraseña es **QC-79** y hasta que exista quedan usuarios creados que no
pueden entrar **sin que nada en el sistema lo diga**. Puede ser solo un orden de trabajo —hacer
QC-79 inmediatamente detrás de esta— o un requisito de esta ficha, y eso no se decide por supuesto
(regla 6 de `CLAUDE.md`).

**P2 — Qué pasa con una sesión ya abierta cuando cambia el rol o el nombre de usuario.** La
edición admite los dos (decisión 10). **QC-78** resuelve el caso del estado de cuenta y **QC-23**
el sello de invalidación, pero **ninguna de las dos habla del rol**: hoy una sesión viva podría
seguir operando con los permisos del rol anterior hasta que caduque. Tampoco está decidido si
cambiar el nombre de usuario afecta a la sesión que se abrió con el nombre viejo.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-09-10 | ¿Cómo se decide quién puede? | **Por permiso**, no por rol. Nacen `usuarios.consultar` y `usuarios.modificar`, y el catálogo cerrado pasa de once a **trece**, sembrados al rol `Administrador` **uno a uno** —**QC-74 decidió que `modificar` NO implica `consultar`**—. `usuarios.modificar` cubre crear, editar, borrar y mover el estado. **Descartado** comparar contra el literal «Administrador»: sería el séptimo sitio haciéndolo, justo después de que **QC-54** gastara una ficha entera en unificarlos. Precedente exacto: **QC-38**, que hizo esto mismo con `unidades.modificar` |
| 2026-09-10 | `usuarios` no es una carpeta de `lib/modules/`. ¿Vale igual como `<modulo>` del código? | **Sí, y esto enmienda QC-74 R1** («`<modulo>` siguiendo los nombres de módulo del repositorio»). Es el primer permiso cuyo módulo no es una carpeta: los usuarios viven dentro de `identity`, pero el código lo lee una persona y `identidad.consultar` no dice **qué** se consulta. Es la **segunda** enmienda al catálogo de QC-74, después de la de QC-38, y se dice con esas palabras en vez de disimularla |
| 2026-09-10 | ¿Entra borrar, si la tarjeta no lo enumeraba? | **Sí: borrado lógico**, con la columna `deleted_at` que ya dejó **QC-4**. **No se recupera**: si la persona vuelve, se crea de nuevo (precedente **QC-43 D6**). No se añade ninguna operación de recuperación |
| 2026-09-10 | ¿El borrado libera el correo, el nombre de usuario y el documento? | **Sí**, dentro de la empresa. Los tres índices únicos funcionales de **QC-47** solo miran filas vivas (`WHERE deleted_at IS NULL`) y **no se tocan**: no hay migración de índices en esta ficha. **Descartado** ocuparlos para siempre: obligaría a reescribir los tres índices por migración |
| 2026-09-10 | ¿Qué se puede hacer con un usuario ya borrado? | **Nada.** No sale en el listado, no responde por identificador, no se edita y no se le cambia el estado. Las seis operaciones tratan una fila con `deleted_at` como inexistente |
| 2026-09-10 | ¿Qué contraseña lleva el usuario que se crea? | **La genera el sistema al azar.** Se guarda ya transformada con bcrypt (**QC-5**), cumple la política de **QC-19** por construcción y **no se devuelve en ninguna respuesta ni se muestra a nadie** — ni al administrador, ni en un registro, ni un instante |
| 2026-09-10 | Entonces, ¿quién puede entrar después del alta? | **Nadie, por esta ficha. Consecuencia aceptada y escrita en el board.** El acceso lo da **QC-79** con su enlace. Esta ficha crea la cuenta, le pone empresa, rol y estado `pending`, y ahí termina. **Descartado** mostrar la contraseña generada una sola vez al administrador: deja una contraseña conocida por dos personas |
| 2026-09-10 | ¿El usuario nace con la marca de cambiar la contraseña al entrar? | **Sí, en verdadero.** Nadie conoce la generada, pero la marca cierra el caso de que la contraseña llegue por otro camino —el enlace de QC-79, o el restablecimiento de QC-89— sin que nadie se acuerde de ponerla. Precedente: el seed de acceso inicial, que crea al administrador con `mustChangeCredential: true` |
| 2026-09-10 | ¿Guardas para que un administrador no se encierre fuera? | **Dos, las dos en el service y con su test.** (a) No puede cambiar **su propio** estado de cuenta, **su propio** rol, ni **borrarse** a sí mismo. (b) **Ninguna** operación —estado, rol o borrado— puede dejar a la empresa sin **al menos un** administrador en estado `active`. La guarda usa `ROLE_ADMINISTRADOR` de `lib/modules/identity/domain/roles.ts`, que ya existe: **no** se escribe una séptima constante del nombre del rol |
| 2026-09-10 | ¿Qué se puede editar de un usuario ya creado? | Nombres, apellidos, fecha de nacimiento, correo, teléfono, tipo y número de documento, nombre de usuario y **rol**. **La empresa NUNCA**: se heredó de quien lo creó, y moverla no es editar, es otra cosa. **La contraseña de otra persona tampoco**: cambiar la mía es QC-36, restablecer la de otro es QC-89 |
| 2026-09-10 | ¿Cómo es la consulta? | **Listado paginado 10/25**, búsqueda por nombre, correo o nombre de usuario, **filtro opcional por estado de cuenta**, y orden por apellidos y nombres ascendente con **desempate estable**. Siempre acotado a la empresa de la sesión y **sin** los borrados. Cada fila trae nombre, usuario, correo, rol y estado; más la **ficha individual por identificador**. La firma nace abierta **a propósito**, para que **QC-67** no tenga que reabrirla: es exactamente la lección de QC-38 → QC-39, donde el listado cerrado costó una ficha entera |
| 2026-09-10 | ¿El actor se ve a sí mismo? | **No: ni en el listado ni pidiendo su ficha por identificador.** El listado excluye su propia fila y la consulta individual de su propio identificador no lo devuelve. Encaja con que tampoco pueda cambiarse el estado ni el rol (decisión 9). **Consecuencia:** «mis datos» necesita una consulta aparte que hoy no existe, y **no se crea aquí** |
| 2026-09-10 | ¿Qué se escribe al mover el estado de cuenta? | El nuevo valor más `account_status_changed_at` y `account_status_changed_by` **con el identificador del actor** (**QC-65** R8–R12; `NULL` significa «lo cambió el sistema», y aquí nunca es el caso). Se puede mover a cualquiera de los cuatro, `blocked` incluido. **Limpiar el contador de intentos fallidos al salir de `blocked` es de QC-78**, dueña de ese mecanismo: esta ficha **no** toca `failed_login_attempts`, `lock_level` ni `locked_until` |
| 2026-09-10 | ¿De dónde sale la empresa del usuario nuevo? | **Se hereda de la sesión del administrador que lo crea.** No se pregunta ni se elige en el alta. Heredado de la decisión humana del **2026-09-06**, tomada al acotar **QC-48** y comentada en este issue; es lo que mantiene coherente que correo, usuario y documento sean únicos **dentro de la empresa** (QC-47) |
| 2026-09-10 | ¿Dónde se autoriza y cómo llega el actor? | **En el service, como primera línea de cada uno de los seis casos de uso, y falla cerrado** —rechaza al actor ausente, al que trae el conjunto de permisos vacío y al que no trae ese código exacto, sin normalización ni coincidencia parcial—. El actor entra **por parámetro** (identificador, empresa y conjunto de permisos) y el dominio **no** lee sesión, cookie ni cabecera; la sesión sale de `identity.getSessionUser()` vía `@/lib/composition`. Heredado de **QC-38 / QC-43 / QC-74** y exigido por `CHECKPOINTS.md > Permisos`. Una policy de RLS **no** cuenta como implementado |
| 2026-09-10 | Forma de la frontera, errores y nombres | **Server Actions** para mutaciones y consultas, con `FormData` en las mutaciones; errores con `code` estable y sin `catch` vacíos; identificadores de base en **inglés** y `snake_case`; la migración del catálogo de permisos lleva su **`down.sql`** que revierte al esquema exacto anterior. Heredado de **QC-4** y **QC-43 D10/D12/D15** |
| 2026-09-10 | ¿E2E y dependencias nuevas? | **E2E diferida a QC-67, y se difiere aquí con motivo**: esta ficha no tiene pantalla, y el flujo de extremo a extremo se prueba cuando exista la pantalla que lo ejerce (precedente **QC-43 D8**, que la difirió a QC-44). **Ninguna dependencia nueva**: bcrypt ya está desde QC-5 y la generación al azar sale del `crypto` de Node |
