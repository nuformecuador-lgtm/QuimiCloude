# QC-85 — pantalla-de-grupos-de-trabajo · requirements.md

> **Zona** `frontend` · **Complejidad** _la asigna el leader en F1.0_ · **depends_on** QC-84, QC-67 ·
> **Rama** `feature/QC-85-pantalla-de-grupos-de-trabajo`
>
> **Alcance.** La **pestaña «Grupos»** dentro de la pantalla de usuarios
> (`/configuracion/usuarios`): ver los grupos de la empresa, crear uno, cambiarle el nombre, meter y
> sacar personas, y borrarlo con confirmación. Los miembros se gestionan en el **panel lateral**, con
> buscador para añadir y acción para sacar. **Consume los siete casos de uso de QC-84 y no escribe
> backend.**
>
> **Lo que NO entra.** El modelo → **QC-83**. Los casos de uso → **QC-84**. Asignar trabajo a un
> grupo → **QC-87**, desde pedidos. **El conteo de miembros por grupo → QC-100**: el listado de
> QC-84 no lo devuelve y añadirlo es backend. Y **ningún caso de uso, service ni Server Action
> nuevos**: si esta ficha necesita tocar `lib/modules/`, algo se entendió mal.
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
| 2026-09-12 | ¿Pantalla propia o sección dentro de usuarios? | **Pestaña «Grupos» dentro de `/configuracion/usuarios`.** Todo lo de gente queda en un sitio y el menú no crece. **Dos precios escritos**: hay que tocar la pantalla de **QC-67, recién mergeada**, para meterle el conmutador, y **es la primera pantalla de Configuración con pestañas** —las otras tres (Presentaciones, Unidades, Usuarios) no las usan—, así que el patrón nace aquí |
| 2026-09-12 | ¿El menú gana un ítem? | **No.** `PRIVATE_NAV_ITEMS` no se toca: no hay ruta nueva que declarar ni permiso nuevo que enlazar. La guardia de navegación de **QC-75** tiene que seguir verde sin excepciones |
| 2026-09-12 | ¿La pestaña se refleja en la dirección? | **Sí**, para poder enlazarla y para que recargar no devuelva al usuario a la pestaña de personas. La pestaña de personas es la de por defecto |
| 2026-09-12 | ¿Dónde se gestionan los miembros de un grupo? | **En el panel lateral** del patrón de **QC-45**/**QC-67**: arriba el nombre, editable; abajo la lista de miembros **paginada** —la que QC-84 dejó en R51–R54— con **buscador para añadir** a alguien y acción para sacarlo. Sin salir de la tabla. Se descartó la pantalla de detalle propia (una ruta más, con su carga, su error y su E2E) y la fila expandible (la tabla compartida de **QC-55** no lo soporta hoy y habría que tocar un componente que usan todas las pantallas) |
| 2026-09-12 | ¿La tabla muestra cuántas personas tiene cada grupo? | **No, y NO es un olvido: hoy es imposible.** `WorkGroupRow` tiene **exactamente `id` y `name`**, con un test que congela esas claves exactas, así que ningún número —ni el de visibles ni el total— es alcanzable desde el frontend. **QC-100** devolverá los dos y los pintará como «**3 de 5**» con su ayuda. Esta ficha **no** lo muestra |
| 2026-09-12 | ¿Qué miembros se ven? | **Solo cuentas activas**, tal como los devuelve QC-84 (su dec. 3). La pantalla **no filtra por su cuenta ni inventa nada**: pinta lo que el caso de uso da. El precio ya está escrito en QC-84: alguien recién creado nace `pending` y no aparece |
| 2026-09-12 | El nombre de solo signos («!!!»), ¿se ataja aquí? | **Sí: el formulario exige al menos una letra o un número**, y lo dice **mientras se escribe**, no después de guardar. Así el choque de «!!!» con «¿¿¿» deja de ser alcanzable desde la pantalla. **El backend de QC-84 no se toca** —su R12 sigue siendo correcto—: esto es validación de entrada, no una regla nueva de dominio. Cierra la pendiente que QC-84 dejó |
| 2026-09-12 | ¿Quién puede entrar y quién puede escribir? | **`usuarios.consultar` para ver, `usuarios.modificar` para escribir**, heredado de **QC-84 dec. 1**. La pestaña **no añade corte propio**: la pantalla ya está cortada por permiso (**QC-75**), y quien solo consulta ve los grupos sin acciones de escritura |
| 2026-09-12 | ¿Cómo se borra un grupo? | **Con diálogo de confirmación**, el mismo patrón del borrado de QC-45 y del de usuarios de QC-67. El diálogo dice **qué grupo** se va a borrar |
| 2026-09-12 | ¿Qué se reutiliza y no se vuelve a montar? | La **tabla de datos compartida** (QC-55), **búsqueda y orden** (QC-57) con paginación 10/25, el **panel lateral** y el **diálogo de borrado** (QC-45/QC-67), y los componentes hermanos de estado **vacío, cargando y error**. Es la T0 que existe justo para que no se re-monte lo que ya está |
| 2026-09-12 | ¿Hace falta E2E? | **Sí, y es de esta ficha**: **QC-84 dec. 17 la difirió aquí expresamente**. Recorrido completo: entrar, cambiar a la pestaña, crear un grupo, renombrarlo, meter y sacar una persona y borrarlo |
| 2026-09-12 | ¿Se toca backend? | **Nada.** Ningún caso de uso, ningún service, ninguna Server Action y ninguna migración. Se consumen los siete casos de uso de QC-84 por el contrato público de `identity` |
| 2026-09-12 | ¿Librería nueva? | **Ninguna.** El componente de pestañas sale de shadcn/ui, que ya está montado |
