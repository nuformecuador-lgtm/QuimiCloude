# QC-38 — crud-de-unidades · requirements.md

> **Zona** `backend` · **Complejidad** `medium` · **depends_on** QC-32, QC-76, QC-74 · **Rama**
> `feature/QC-38-crud-de-unidades`
>
> **Alcance.** El **alta, la edición y el borrado** de unidades de medida sobre el catálogo que
> creó QC-32 y el modelo que le añade QC-76, con su superficie de **Server Actions**. Autoriza
> **por permiso**, con el modelo de QC-74. Es la ficha que hace administrable un catálogo que hoy
> solo se puede tocar por migración.
>
> **Lo que NO entra.** La **consulta**: ya existe (`listUnits`, de QC-26 y QC-57) y su filtro por
> empresa lo pone **QC-76**; esta ficha no la construye ni la reescribe. El esquema, la
> equivalencia y el ámbito por empresa → **QC-76**. La pantalla → **QC-39**. Filtrar el menú por
> permiso → **QC-75**.
>
> *Sembrado por `/afinar-feature` el 2026-09-07. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.*

## Requisitos (EARS)

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

**Ninguna.**

Esta acotación además **cierra la pregunta abierta 5 de QC-32** —«¿un nombre en blanco es un
nombre?»—, que esa ficha dejó escrita apuntando aquí. Con ella, las tres preguntas abiertas de
QC-32 quedan cerradas: la 1 y la 3 el mismo día al acotar QC-76, y la 5 aquí. Anotado como
comentario en el issue QC-32, cuyo spec no se toca.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
| --- | --- | --- |
| 2026-09-07 | ¿Qué casos de uso trae? | **Alta, edición y borrado**, y nada más. **La consulta NO**: ya existe desde QC-26 y QC-57, y su filtro por empresa lo pone QC-76 |
| 2026-09-07 | ¿Cómo se decide quién puede? | **Por permiso**, con el modelo que dejó **QC-74**. **No** se escribe un `requireAdmin` nuevo: sería el séptimo sitio comparando contra el literal «Administrador», justo después de que **QC-54** gastara una ficha entera en unificarlos |
| 2026-09-07 | ¿Quién puede consultar unidades? | **Solo el Administrador, como hoy.** Se conserva lo que fijó **QC-32** y no se abre la lectura al Operador. Si eso deja al Operador sin selector de unidad en recetas, se resuelve en la ficha que se lo plantee (candidata: **QC-63**), no aquí |
| 2026-09-07 | ¿Dónde se valida la autorización? | **En el service**, como primera línea y falla cerrado, con su test. Heredado de **QC-20 D2** y exigido por `CHECKPOINTS.md > Permisos`. Una policy de RLS **no** cuenta como implementado (`docs/architecture.md > Acceso a datos y autorizacion`) |
| 2026-09-07 | Largo máximo del nombre | **60 caracteres**, que es lo que **QC-20 D11** le dio al nombre de presentación, el catálogo corto más parecido. Vive **solo en la validación**, no en la columna: sin migración. Cierra el límite que **QC-32 R6** dejó escrito apuntando aquí |
| 2026-09-07 | Largo máximo del símbolo | **10 caracteres.** `kg`, `ml` y `mmHg` son de 2 a 4; más de 10 ya no es un símbolo. También solo en la validación |
| 2026-09-07 | Nombre vacío o en blanco | **Se rechaza**, y se recortan los espacios de los extremos antes de guardar. **También se rechaza el nombre que al normalizar queda vacío** —un «---»—, para que no llegue al índice único y se anuncie como «ya existe». Heredado de **QC-20 D9 y D23**; cierra la **pregunta abierta 5 de QC-32** |
| 2026-09-07 | ¿La edición es total o parcial? | **Reemplazo completo.** Llegan los cuatro campos —nombre, símbolo, de qué unidad deriva y factor— y reemplazan lo que hubiera. Con envío parcial no se distingue «no lo toques» de «bórralo», y aquí hay **dos campos que se pueden vaciar** |
| 2026-09-07 | ¿Se puede editar o borrar una unidad de sistema? | **No.** Se rechaza **en el service**, con su test. No tienen `company_id`, valen para todas las empresas, y cambiar «kilogramo» las afectaría a todas a la vez. Heredado de **QC-76** |
| 2026-09-07 | ¿De quién es la unidad que se crea? | **De la empresa de quien la crea**, siempre. Desde la aplicación **no se puede crear una unidad de sistema**: las únicas son las cuatro de la migración. Heredado de **QC-76** |
| 2026-09-07 | Unicidad del nombre al crear y editar | **Dentro de la empresa**, comparando **normalizado** —sin acentos, sin caracteres especiales y sin distinguir mayúsculas—. La garantía real es el índice único que crea **QC-76**, no la comprobación previa: dos altas simultáneas que la superen acaban con una sola fila y la otra rechazada. Heredado de **QC-76** y **QC-32 D5** |
| 2026-09-07 | Unicidad del símbolo | **Único cuando existe**, con el mismo ámbito que el nombre. El símbolo **sigue siendo opcional**. Heredado de **QC-76** |
| 2026-09-07 | Validación de la equivalencia | La unidad de la que deriva y el factor **van juntos o no va ninguno**; el factor es **mayor que cero** y admite valores **menores que 1**; la unidad apuntada tiene que ser una **unidad base** —la derivación es de un solo nivel—, **no puede ser ella misma**, y tiene que ser **de la propia empresa o de sistema**, nunca de otra empresa. Heredado de **QC-76** |
| 2026-09-07 | ¿Se puede cambiar la base o el factor de una unidad ya en uso? | **Sí.** El producto y la línea de receta guardan una **referencia** a la unidad, no una cantidad ya convertida, así que no invalida nada guardado. Mismo criterio que **QC-33** con el total del pedido. Heredado de **QC-76** |
| 2026-09-07 | ¿Se puede borrar una unidad en uso? | **No.** Ni si la usa un producto o una línea de receta, ni si **otra unidad deriva de ella**. Lo garantiza `ON DELETE RESTRICT` en la base, no una comprobación al vuelo. Heredado de **QC-32 D10** y **QC-76** |
| 2026-09-07 | ¿El borrado es lógico? | **No: físico**, y bloqueado por la FK. El catálogo **no tiene `deleted_at`** precisamente para que el `RESTRICT` pueda impedirlo: el borrado lógico es un UPDATE y ninguna FK reacciona a un UPDATE. Heredado de **QC-32 D11**, mismo criterio que las presentaciones en **QC-20 D6** |
| 2026-09-07 | Superficie de servidor | **Server Actions** en `adapters/driving/`, nunca Route Handler (`docs/architecture.md > Server Actions vs Route Handlers`), con **zod** validando la entrada en el borde (`docs/conventions.md`). Heredado de **QC-20 D18** |
| 2026-09-07 | ¿De dónde sale el actor? | El service lo **recibe por parámetro**; quien lo resuelve es el **adaptador driving**, con `identity`. El dominio no lee sesión, cookie ni cabecera. Heredado de **QC-20 D17** y de cómo ya está escrito `unit-actions.ts` |
| 2026-09-07 | Errores | Clases de error de dominio con **`code` estable**, traducidas por la Server Action a estado serializable; el texto nunca es el discriminante, y lo que no es error de dominio **se relanza**. Es lo que ya hace `unit-actions.ts` (`docs/conventions.md > Manejo de errores`) |
| 2026-09-07 | Módulo y fronteras | Módulo **`unidades`**, hexagonal (**QC-15**). Los adaptadores driving **no pasan por el barrel** —el contrato público tiene que poder importarse desde un componente de cliente— y ningún otro módulo entra por su tabla ni por su repositorio. Identificadores de la DB en **inglés** (**QC-4**) |
| 2026-09-07 | ¿E2E? | **Diferido con motivo**: esta ficha no tiene pantalla ni flujo navegable que visitar. Lo decide **QC-39**. Heredado de **QC-32** y mismo criterio que **QC-20 D4** |
| 2026-09-07 | Librería nueva | **Ninguna.** Son casos de uso, validación con zod —ya aprobada— y aritmética propia. Regla 7 de `CLAUDE.md` sin propuesta que abrir |
