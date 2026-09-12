# QC-84 — crud-de-grupos-de-trabajo · requirements.md

> **Zona** `backend` · **Complejidad** _la asigna el leader en F1.0_ · **depends_on** QC-83 ·
> **Rama** `feature/QC-84-crud-de-grupos-de-trabajo`
>
> **Alcance.** Los **casos de uso** de un grupo de trabajo sobre el modelo que ya dejó **QC-83**:
> crear uno con su nombre, listar los de la empresa, ver quiénes lo componen, cambiar su nombre,
> **meter** y **sacar** personas, y darlo de baja. Todo limitado a la empresa de quien pide. El
> nombre es único dentro de la empresa y el duplicado se rechaza diciéndolo. Vive en el módulo
> **`identity`**, donde ya vive el grupo.
>
> **Lo que NO entra.** El modelo y la migración → **QC-83** (hechos). La pantalla → **QC-85**.
> Asignar un pedido a un grupo → **QC-86** (hecho), que **consume** el grupo y no lo administra.
> Y **ninguna migración ni cambio de esquema**: si esta ficha necesita tocar `db/schema.prisma`,
> algo se entendió mal.
>
> *Sembrado por `/afinar-feature` el 2026-09-11. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.*

## Requisitos (EARS)

_Los escribio `spec_author` en F1.2 (R1-R54): viven en la copia de este archivo en la rama `feature/QC-84-crud-de-grupos-de-trabajo`._

## Preguntas abiertas

**P1 (del humano, 2026-09-11).** Una, y **no bloquea**: al asignar un pedido, ¿QC-87 descarta a los
miembros cuya cuenta no está activa? Esta ficha decide qué se **muestra**; a quién se puede
**asignar** es de QC-87.

**P2 — CERRADA el 2026-09-11** por decisión humana al aprobar el spec (F1.4): la consulta de miembros
**sí se pagina**, con orden y desempate estable y con el total. Pasó a ser la **fila 18** de
`## Decisiones cerradas (no reabrir)` y la escriben **R51–R54**.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
| --- | --- | --- |
| 2026-09-11 | ¿Qué permiso corta las operaciones de grupos? | **Se reusan `usuarios.consultar` y `usuarios.modificar`. NO nacen permisos nuevos y el catálogo se queda en 15.** Un grupo es un conjunto de personas y vive en `identity`: quien administra usuarios administra sus grupos. **Precio escrito**: no se puede dar a alguien la gestión de turnos sin darle también el alta y la baja de usuarios. Si algún día hace falta separarlo, es una ficha con su migración |
| 2026-09-11 | ¿Dónde se comprueba el permiso? | **En el service, primera línea de cada operación, fallando cerrado**, con el actor por parámetro y la sesión desde `identity.getSessionUser()`. `consultar` para leer, `modificar` para escribir, **sin implicación entre ellos**. La RLS no cuenta como frontera. Heredado de **QC-66 dec. 15** y **QC-74** |
| 2026-09-11 | Al pedir los miembros de «Turno noche», ¿quién sale? | **Solo las cuentas con estado `active`** (y no dadas de baja). **Dos precios, escritos a propósito**: (a) una persona recién dada de alta nace **`pending`** (QC-66 dec. 7) y **no aparecerá en sus grupos** hasta que entre y cambie la contraseña; (b) una cuenta bloqueada por intentos fallidos **desaparece del grupo y vuelve sola** al desbloquearse. La pertenencia **no se toca** en ninguno de los dos casos: esto es un filtro de **lectura**, que es exactamente el encargo que **QC-83 dec. 2** dejó a esta ficha |
| 2026-09-11 | ¿A quién se puede meter en un grupo? | **A cualquier persona viva de la empresa, sea cual sea su estado de cuenta.** La pertenencia no depende del estado (**QC-83 dec. 2**). A una persona **dada de baja no se la puede meter**: las operaciones la tratan como inexistente (**QC-66 dec. 5**) |
| 2026-09-11 | Si alguien intenta meter a una persona que ya está dentro pero el filtro oculta, ¿qué pasa? | **Se rechaza con un error que dice que ya pertenece Y por qué no se ve** («ya pertenece a Turno noche; su cuenta está bloqueada»). Sin eso, el operador lee «ya existe» sobre una lista donde esa persona no aparece y no tiene forma de entenderlo. **Es el caso que esta ficha tiene que cubrir con test** |
| 2026-09-11 | ¿Meter y sacar personas es parte de editar el grupo? | **No: son operaciones propias, de a una**, independientes de cambiar el nombre. Dos encargados pueden trabajar a la vez sin pisarse y el error dice **quién** falló. Se descartó mandar el conjunto completo al editar: si dos personas editan a la vez, la segunda **borra en silencio** lo que hizo la primera |
| 2026-09-11 | Al sacar a alguien de un grupo, ¿qué se borra? | **Solo la fila de pertenencia, y de verdad** (excepción al borrado lógico, **QC-83 dec. 4**). **No borra ni desactiva a la persona**: sigue siendo usuario y sigue en sus otros grupos |
| 2026-09-11 | Se da de baja un grupo con 5 personas dentro. ¿Qué pasa con las pertenencias? | **Se quedan.** La baja es **lógica** y es del **grupo** (`deleted_at`, QC-83 dec. 5); sus filas de pertenencia se conservan, así que no se pierde quién estaba dentro. **No se ofrece restaurar**: un grupo dado de baja no se recupera (**QC-66 dec. 3**), y su nombre queda libre para otro grupo nuevo (índice único parcial, QC-83 dec. 8) |
| 2026-09-11 | ¿Dar de baja un grupo puede dejar un pedido sin responsables? | **No, y esta ficha lo demuestra con test.** **QC-86 guardó a las PERSONAS, no al grupo vivo**: el pedido conserva sus responsables y el nombre del grupo congelado. El test es la prueba ejecutable de que esa decisión de QC-86 aguanta desde el otro lado |
| 2026-09-11 | ¿Renombrar un grupo cambia lo que ya se asignó? | **No.** El nombre que QC-86 congeló en un pedido **no se toca**: el pedido sigue diciendo cómo se llamaba el grupo el día que se asignó |
| 2026-09-11 | ¿Puede haber dos grupos con el mismo nombre? | **No, dentro de la misma empresa**, medido **sin mayúsculas y sin acentos** contra la columna normalizada y el índice único **parcial** que ya creó **QC-83** (dec. 7 y 8). El duplicado **se rechaza diciéndolo**, con un `code` estable, no con un error genérico |
| 2026-09-11 | ¿Qué ve alguien de otra empresa? | **Nada.** Las siete operaciones se acotan a la empresa de la sesión. Heredado de **QC-47** y **QC-48**. *(Decía «las seis»; el número se corrigió al aprobar el spec (F1.4): el Alcance de esta misma ficha enumera **siete** casos de uso y el «seis» venía de copiar la redacción de QC-66. **La decisión no cambia**, y sigue siendo «todas, sin excepción».)* |
| 2026-09-11 | ¿Cómo se lista? | **Paginado, con orden y desempate estable**, siguiendo el listado de usuarios. Heredado de **QC-66 dec. 11** y **QC-57** |
| 2026-09-11 | Forma de las operaciones | **Server Actions con `FormData`** en las mutaciones, errores con **`code` estable**, identificadores en **inglés** `snake_case`. Heredado de **QC-66 dec. 16** |
| 2026-09-11 | ¿Hay migración? | **Ninguna, y es un límite, no un olvido.** El modelo entero es de **QC-83** y está mergeado. Ni `db/schema.prisma` ni `db/migrations/` se tocan |
| 2026-09-11 | ¿Hace falta E2E? | **No aquí: diferida a QC-85**, que es donde existe la pantalla que recorrer. Los E2E existentes tienen que **seguir verdes**. Mismo criterio de **QC-66 dec. 17** |
| 2026-09-11 | ¿Librería nueva? | **Ninguna** |
| 2026-09-11 | ¿La consulta de los miembros de un grupo se pagina? | **Sí: paginada, con orden y desempate estable y con el total.** Mismos tamaños que el resto de la aplicación —**10** por defecto, **25** de tope— y el mismo desempate que impide que dos personas del mismo turno se intercambien entre páginas. Heredado de **QC-66 dec. 11** y **QC-57**: que las dos listas de la pantalla de QC-85 se paginen igual es lo que evita que QC-85 tenga que inventarse una segunda manera. **Cerrada al aprobar el spec (F1.4)**, y cierra la pregunta abierta **P2** que `spec_author` dejó escrita en F1.2. La escriben **R51–R54** |
