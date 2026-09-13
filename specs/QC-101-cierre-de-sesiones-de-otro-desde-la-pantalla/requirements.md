# QC-101 — cierre-de-sesiones-de-otro-desde-la-pantalla · requirements.md

> **Zona** `fullstack` (era `frontend`; cambio al acotar) · **Complejidad** `medium` ·
> **depends_on** QC-23 (cerrada) ·
> **Rama** `feature/QC-101-cierre-de-sesiones-de-otro-desde-la-pantalla`
>
> **Alcance.** El Administrador puede cerrar **todas** las sesiones de otra persona desde el **panel
> de detalle del usuario**. Entra la **Server Action que hoy falta** —el caso de uso
> `end-all-sessions` existe en el dominio y esta probado, y **nada lo expone**—, el boton en el
> panel, un **dialogo de confirmacion con el nombre de la persona dentro**, y el **E2E del recorrido
> completo**: el administrador cierra, y el otro, que tenia sesion abierta, acaba en el login. Solo
> se ofrece sobre **cuentas activas**, y **nunca sobre uno mismo**.
>
> **La zona cambio de `frontend` a `fullstack` al acotar, y ese es el hallazgo principal.** La ficha
> nacio creyendo que solo faltaba un boton, y falta tambien **la puerta por la que ese boton llama**.
>
> **Lo que NO entra.**
> - **El boton del propio usuario sobre sus sesiones**: es **QC-53**, y es tambien donde vive la
>   autoaplicacion, con su aviso de que te echa de la sesion actual.
> - **Decir cuantas sesiones se cerraron.** `end-all-sessions.ts:64` devuelve `void`; contar
>   exigiria la lectura por peticion que **QC-23 descarto a proposito**.
> - **Listar las sesiones vivas de nadie.** No existe tal lista: la revocacion es un **sello de
>   tiempo**, no un borrado por sesion. QC-23 lo descarto y dijo que **no habria ficha**.
> - **Un permiso nuevo `sesiones.modificar`**: se usa `usuarios.modificar`, y el porque ya esta
>   escrito en `end-all-sessions.ts:33-35`.
>
> *Sembrado por `/afinar-feature` el 2026-09-13. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijo el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aqui es `## Requisitos (EARS)`.*

## Requisitos (EARS)

> Identificadores en ingles. Cada `R<n>` termina mapeado a un test concreto en
> `progress/impl_QC-101-*.md` (`CHECKPOINTS.md > Trazabilidad`). Los requisitos **negativos**
> (R16-R20) son los limites de alcance de la tabla de decisiones, escritos como requisitos para que
> tengan test propio y no se queden en nota de diseno.

### La Server Action (la puerta que hoy falta)

**R1.** El sistema DEBE exponer **una** Server Action, `endAllSessionsAction`, que cierre todas las
sesiones de la persona objetivo **delegando en el caso de uso ya cableado**
`identity.endAllSessions` (`lib/composition/index.ts:568`), sin reimplementar, repetir ni compensar
ninguna de sus reglas: ni la comprobacion de permiso, ni el filtro de empresa, ni el truncado del
sello, ni la traduccion de los tres casos de no-encontrado.

**R2.** CUANDO se invoca `endAllSessionsAction`, el sistema DEBE construir el actor con **las dos
caras** de la sesion del servidor —identificador y permisos de `getSessionUser()`, empresa de
`getSessionContext()`— y pasarlo **por parametro** al caso de uso. SI falta cualquiera de las dos,
ENTONCES el actor DEBE ser `null` y la accion DEBE seguir adelante hasta que el caso de uso la
rechace (falla cerrado, sin error propio escrito en el borde).

**R3.** SI quien invoca la accion sobre **otra** persona no trae `usuarios.modificar`, ENTONCES el
sistema DEBE rechazar la operacion **en el service** con el codigo estable `unauthorized` y **no
DEBE tocar el puerto de revocacion**: ninguna sesion de nadie queda invalidada. Ocultar el control
en la interfaz **no cuenta** como cumplimiento de este requisito
(`docs/architecture.md > Acceso a datos y autorizacion`).

**R4.** SI el objetivo no existe, esta borrado logicamente o pertenece a otra empresa, ENTONCES el
sistema DEBE responder el **mismo** codigo `user_not_found` en los tres casos, sin distinguirlos y
sin revelar cual fue.

**R5.** CUANDO la operacion termina bien, la accion DEBE devolver un estado serializable de exito
**sin ningun dato**: sin numero de sesiones cerradas, sin identificadores de sesion, sin credencial
y sin lista de dispositivos.

**R6.** El sistema DEBE traducir todo fallo de la accion **por el `code` estable** de la clase de
error y nunca por el texto del mensaje, con el traductor unico del modulo `errores`, y DEBE devolver
`unexpected` —con su mensaje neutro y el detalle solo en el registro del servidor— ante cualquier
error que no sea de dominio. Ningun `catch` DEBE descartar un error, y **no se declara ningun codigo
de error nuevo**.

### El control y su confirmacion, en el panel de detalle

**R7.** MIENTRAS el panel de detalle del usuario este abierto sobre **otra** persona **con la cuenta
`active`**, el sistema DEBE ofrecer un control «Cerrar todas las sesiones» cuyo nombre accesible
incluya **el nombre de esa persona**.

**R8.** El sistema **NO DEBE** anadir ninguna accion nueva a la fila del listado: la celda de
acciones DEBE seguir emitiendo exactamente los tres controles de hoy —editar, cambiar estado y
eliminar—, ni uno mas, y no se introduce ningun menu desplegable de fila.

**R9.** CUANDO se activa ese control, el sistema DEBE pedir confirmacion en un dialogo que **nombre
a la persona** y advierta que tendra que volver a entrar. MIENTRAS no se confirme, el sistema **NO
DEBE** invocar la Server Action: abrir el dialogo no cierra ninguna sesion.

**R10.** CUANDO se confirma el dialogo, el sistema DEBE invocar la Server Action **exactamente una
vez** y con el identificador de la persona del panel.

**R11.** SI la cuenta de la persona del panel **no** esta `active`, ENTONCES el control **NO DEBE
existir en el DOM**: ni visible, ni deshabilitado, ni acompanado de explicacion.

**R12.** SI la persona del panel es **el propio actor de la sesion**, ENTONCES el control **NO DEBE
existir en el DOM**, con el mismo criterio de R11.

**R13.** CUANDO la accion responde exito, el sistema DEBE, en este orden: cerrar el dialogo, avisar
por el `<Toaster />` que ya monta el layout privado con un texto que **confirma la accion sin
prometer ningun numero**, y poner la pantalla al dia **con la misma URL** (sin perder pagina,
tamano, orden, filtro ni busqueda).

**R14.** SI la accion responde error, ENTONCES el sistema DEBE pintarlo **dentro del dialogo** y
**por su `code`**, DEBE mantener el dialogo abierto y **NO DEBE** emitir el aviso de exito ni alterar
nada de lo pintado en la pantalla.

**R15.** El control y su dialogo DEBEN cumplir
`docs/architecture.md > Componentes > Regla: multiplataforma`: objetivo tactil de al menos 44x44 px
y ninguna via de activacion que dependa de `:hover`.

**R16.** La decision de si el control se emite DEBE bajar **por props** desde el servidor: ningun
componente de cliente de esta pantalla lee la sesion, importa `lib/composition` ni consulta la base
por su cuenta.

### El recorrido completo (la razon de ser de la ficha)

**R17.** CUANDO un Administrador con `usuarios.modificar` cierra las sesiones de otra persona que
**tenia una sesion viva en otro navegador**, ENTONCES la siguiente navegacion privada de esa persona
DEBE acabar **en el login**, sin llegar a ver ninguna pantalla privada y **en una sola redireccion
de documento**. Se verifica de punta a punta, en un navegador real, con **dos contextos vivos a la
vez** (`e2e/`).

### Limites de alcance (requisitos negativos, cada uno con su test)

**R18.** El sistema **NO DEBE** crear el permiso `sesiones.modificar` ni modificar el catalogo de
permisos: el conjunto de codigos declarado DEBE ser identico al de la base de fusion, y la
autorizacion DEBE seguir siendo `usuarios.modificar` heredado de QC-23.

**R19.** El sistema **NO DEBE** anadir al dominio ningun conteo de sesiones: ninguna firma nueva o
modificada DEBE devolver un numero de sesiones, y ningun texto de la interfaz DEBE afirmar cuantas
se cerraron.

**R20.** El sistema **NO DEBE** exponer ninguna lista de sesiones vivas: el puerto de revocacion
DEBE seguir declarando exactamente `revokeSession` y `stampAll`, sin ningun metodo de listado,
busqueda o lectura.

**R21.** El sistema **NO DEBE** incluir el control del **propio** usuario sobre sus sesiones —eso es
QC-53—: ninguna pantalla nueva ni existente DEBE ofrecer «cerrar mis sesiones», y `endOtherSessions`
DEBE seguir sin ser invocado desde ninguna interfaz.

**R22.** El sistema **NO DEBE** anadir ninguna dependencia: el conjunto de nombres de
`dependencies` + `devDependencies` DEBE ser identico al de la base de fusion con `origin/dev`.

## Preguntas abiertas

Ninguna. Las **cinco** que la ficha traia quedan cerradas: **tres las contesto el disco** —no hay
menu de fila, el caso de uso no devuelve numero, y no existe ninguna lista de sesiones— y **dos las
decidio el humano** el 2026-09-13.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-09-13 | La ficha es `frontend`, pero no hay Server Action que el botón pueda llamar. ¿Cómo se reparte? | **Pasa a `fullstack` e incluye la acción.** El caso de uso ya existe y está probado; la Server Action es un envoltorio fino. Partirla en una ficha `backend` de un solo archivo serían **dos ciclos SDD completos** para exponer una función ya escrita, y esa mitad no le sirve a nadie sola |
| 2026-09-13 | ¿Dónde vive el botón? | **En el panel de detalle del usuario** (`user-sheet`), no en la fila. Es una acción poco frecuente que **expulsa a alguien que puede estar trabajando**: pedirla desde el detalle obliga a mirar de quién se trata antes de pulsar. La fila se queda con sus tres iconos |
| 2026-09-13 | ¿Existe un menú de la fila donde colgarlo? | **No, y esto lo contestó el disco.** Hoy son **tres botones de icono** —editar, cambiar estado, borrar— en `user-row-actions.tsx:98,110,122`. La pregunta de la ficha daba por hecho un menú que no existe |
| 2026-09-13 | ¿Pide confirmación, y con qué texto? | **Sí, con el nombre de la persona dentro** —«¿Cerrar todas las sesiones de Ana Rodríguez?»— y la advertencia de que tendrá que volver a entrar. Reutiliza el patrón que ya usan cambiar estado y borrar en esta misma pantalla. **El nombre dentro es lo que convierte un «¿seguro?» en una comprobación real** |
| 2026-09-13 | ¿Puede el administrador aplicárselo a sí mismo? | **No: sobre uno mismo no se ofrece.** El dominio lo permite —si el destino es uno mismo no exige permiso—, pero quien pulsa desde la pantalla de administración no está pensando en sí mismo y acabaría en el login sin esperarlo. Ese botón es **QC-53**, donde se explica lo que va a pasar |
| 2026-09-13 | ¿Se ofrece sobre cuentas no activas? | **No: solo sobre cuentas activas.** En una cuenta dada de baja o suspendida las sesiones **ya se cortaron** al cambiar el estado (QC-23). Ofrecerlo ahí invita a pulsar algo que no hace nada visible y siembra la duda de si el corte automático funcionó |
| 2026-09-13 | ¿Qué se dice al terminar, y qué si no había ninguna sesión abierta? | **Se confirma la acción sin prometer número** —«Se cerraron las sesiones de Ana Rodríguez»—. **El sistema no sabe cuántas cerró**: `end-all-sessions.ts:64` devuelve `void`. El mensaje es verdad tanto con cinco sesiones como con ninguna: en ambos casos el resultado es el mismo |
| 2026-09-13 | ¿El listado muestra cuántas sesiones vivas hay? | **No, y es imposible sin trabajo nuevo de backend.** La revocación es un **sello de tiempo**, no un borrado por sesión: **no hay ninguna lista que leer**. QC-23 descartó esa lectura por dar nada que no dé el cierre total, y dijo que no habría ficha |
| 2026-09-13 | ¿Hace falta E2E? | **Sí, el recorrido completo**: el administrador cierra y el otro, con sesión abierta, acaba en el login. `CHECKPOINTS.md` lo pide para autenticación y permisos, y esto es las dos cosas. Es **el único sitio donde se demuestra que la revocación de QC-23 sirve de punta a punta**: hasta hoy está probada en el servicio y nunca ejercitada desde la interfaz |
| 2026-09-13 | Permiso, y quién lo valida | **`usuarios.modificar`, validado en el service. Heredado de QC-23**, y **no** se crea un permiso nuevo `sesiones.modificar`: el porqué ya está escrito en `end-all-sessions.ts:33-35` —obligaría a migración y seed de `role_permissions` y no separa nada útil—. El administrador **nunca elige dispositivo**: lo suyo es siempre total |
