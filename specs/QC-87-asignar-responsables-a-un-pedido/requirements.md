# QC-87 — asignar-responsables-a-un-pedido · requirements.md

> **Zona** `fullstack` — **se parte en backend + frontend en F1.0** · **Complejidad** _la asigna el
> leader_ · **depends_on** QC-86, QC-84 · **Rama** `feature/QC-87-asignar-responsables-a-un-pedido`
>
> **Alcance.** Asignar y desasignar responsables de un pedido **desde la pantalla de pedidos**:
> marcar personas sueltas, aplicar uno o varios grupos de trabajo, o mezclar las dos cosas. El
> listado y el detalle muestran a los responsables como **avatares**, y cuando vinieron de un grupo
> se muestra **el nombre del grupo** junto a sus caras — quien mira el tablero tiene que distinguir
> «Turno noche» de cinco personas elegidas a mano. **Consume la tabla de QC-86 y no la define.**
>
> **Lo que NO entra.** El modelo de asignación → **QC-86** (hecho). El listado de pedidos asignados
> del Operador → **QC-88**. Ejecutar la receta → **QC-63**. La pantalla de pedidos **no se rehace**:
> se le añade lo de responsables (**QC-35**).
>
> *Sembrado por `/afinar-feature` el 2026-09-12. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.*

## Requisitos (EARS)

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

Ninguna.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
| --- | --- | --- |
| 2026-09-12 | ¿Qué estados de pedido admiten asignación? | **Solo `PENDIENTE` y `EN_CURSO`.** Un **`ENTREGADO` congela su asignación** —ni se añade ni se quita a nadie: es el único dato que dice quién preparó realmente ese pedido, y reescribirlo después de los hechos lo destruiría— y un **`CANCELADO` no admite asignación nueva**, como ya decía el board. Quien se equivocó lo corrige **antes** de entregar. **Cierra la pregunta abierta 2 que dejó QC-86** |
| 2026-09-12 | Se vuelve a aplicar un grupo ya aplicado, y entretanto entró gente. ¿Qué pasa? | **Añade a los que faltan.** Las personas que ya estaban **se quedan como estaban, con su origen intacto**, y entran las nuevas; la pantalla dice **cuántas se añadieron**. Se descartó reemplazar por la foto de hoy: sacaría del pedido a quien ya no esté en el grupo, que es **exactamente lo que QC-86 prohíbe**. **Consecuencia escrita**: alguien a quien se desasignó a mano vuelve a entrar si sigue en el grupo y se reaplica. **Cierra la pregunta abierta 1 de QC-86** |
| 2026-09-12 | Al aplicar un grupo, ¿se asigna a quien tiene la cuenta bloqueada o recién creada? | **No: solo a las cuentas `active`.** Lo que la pantalla de grupos muestra (QC-84 dec. 3) es **lo que se asigna**, así que nadie pulsa «5» y obtiene otra cosa. **Precio escrito**: dar de alta a alguien y meterlo en el turno **no le asigna nada** hasta que entre por primera vez y cambie su contraseña; cuando se reaplique el grupo, entrará. **Cierra la pregunta abierta que QC-85 dejó para esta ficha** |
| 2026-09-12 | ¿Dónde se asigna dentro de la pantalla de pedidos? | **En el panel lateral del pedido**, con buscador para marcar personas, selector de grupos y acción para sacar. Es el patrón de **QC-45**, **QC-67** y **QC-85**, y evita estrenar una forma nueva de editar |
| 2026-09-12 | ¿Quién ve los avatares y quién puede asignar? | **Ver: quien pueda ver pedidos** (`pedidos.consultar`) — quién prepara un pedido es información del pedido, como su receta o su estado. **Asignar y desasignar: `asignaciones.modificar`** (QC-86), comprobado **en el service, primera línea, fallando cerrado**, con el actor por parámetro. Heredado de **QC-66 dec. 15** |
| 2026-09-12 | ¿Cómo se distingue un grupo de cinco personas sueltas? | Se muestra **el nombre del grupo junto a los avatares de sus personas**, no solo las caras. Viene del board y es el motivo de que QC-86 congelara **el nombre** además de las personas |
| 2026-09-12 | Lo que se hereda de QC-86 y no se reabre | La asignación **se congela**; **gana el primer origen**; **quitar un grupo se lleva a las personas que trajo**; se puede **desasignar persona a persona**; y la **coherencia de empresa la vigila la base**. Esta ficha **consume** esa tabla y no la redefine |
| 2026-09-12 | ¿Se toca el esquema? | **Nada.** El modelo entero es de **QC-86** y está mergeado: ni `db/schema.prisma` ni `db/migrations/`. **Tampoco nacen permisos**: los dos de `asignaciones` ya existen y el catálogo sigue con **quince** |
| 2026-09-12 | ¿Qué se reutiliza y no se vuelve a montar? | La **tabla de datos compartida** (QC-55), **orden y filtro** (QC-57), el **panel lateral** (QC-45/QC-67/QC-85) y la **pantalla de pedidos de QC-35**, que **no se rehace**. La primitiva **`avatar` ya existe** en `components/ui/` —verificado en disco—, así que **no hay que añadirla con la CLI** ni arrastrar ninguna dependencia |
| 2026-09-12 | Forma de las operaciones | **Server Actions con `FormData`** en las mutaciones, errores con **`code` estable**, identificadores en **inglés**. Heredado de **QC-66 dec. 16** |
| 2026-09-12 | ¿Hace falta E2E? | **Sí, y es de esta ficha.** `CHECKPOINTS.md` pide E2E para flujos críticos y aquí hay permisos y un cambio real en el trabajo de la gente. Recorrido: abrir un pedido, marcar una persona, aplicar un grupo, sacar a alguien y comprobar que el listado muestra los avatares y el nombre del grupo |
| 2026-09-12 | ¿Librería nueva? | **Ninguna** |
