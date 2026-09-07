# QC-74 — modelo-de-permisos · requirements.md

> **Zona** `backend` · **Complejidad** `high` · **depends_on** QC-54 ·
> **Rama** `feature/QC-74-modelo-de-permisos`
>
> ## Alcance
>
> Sustituir la única pregunta de autorización que existe hoy —«¿es Administrador?», repetida
> dentro de cinco módulos— por un modelo de permisos por módulo. Cada módulo declara dos
> permisos, **consultar** y **modificar**; un rol es el conjunto de permisos que tiene
> asignados, en base y sembrado. Los cinco servicios pasan a exigir el permiso concreto en
> lugar del rol, sin cambiar dónde se autoriza: sigue siendo el servicio, antes del
> repositorio. Entra una guardia contra el olvido.
>
> ## Lo que NO entra
>
> - **Nada de UI**: ni menú, ni 404 por ruta, ni destino del login. Todo eso es **QC-75**.
> - **El middleware no se toca en esta ficha.** `ROUTE_ROLE_RULES` sigue como está y sigue
>   cortando por rol; se retira en QC-75, que es quien pone el corte nuevo en su sitio.
> - **Pantalla para administrar roles y permisos**: no existe y no se crea. El catálogo se
>   cambia por seed y migración, igual que los roles desde QC-4.
> - **Permisos por empresa**: no. `docs/architecture.md > Dominio` los nombra entre lo que
>   el reviewer rechaza como sobre-ingeniería. El permiso cuelga del rol.
>
> _Sembrado por `/afinar-feature` el 2026-09-07. El bloque de Alcance y la tabla de
> «Decisiones cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los
> reabre y no los reescribe: su trabajo aquí es `## Requisitos (EARS)`._

## Requisitos (EARS)

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

1. **QC-28 (caché de sesión en Redis) todavía no está construida, y este modelo le añade
   carga.** Esa ficha ya exige que dar de baja a alguien o cambiarle el rol borre su dato
   cacheado en el acto. Falta decidir si **cambiar los permisos de un rol** debe invalidar
   el caché de todos los usuarios que lo tienen, o si el minuto de caducidad basta. No se
   decide aquí porque el caché no existe todavía; se decide al acotar QC-28.
2. **El tercer rol.** Todo lo cerrado abajo funciona con Administrador y Operador, que son
   los dos que siembra QC-6. Si el negocio ya sabe que habrá un Supervisor o un Auxiliar de
   bodega, decirlo antes del diseño ahorra una migración de datos sembrados.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-09-07 | ¿El permiso es «entrar al módulo» o distingue ver de modificar? | **Dos permisos por módulo: consultar y modificar.** Un permiso único dejaría que quien consulta recetas también las edite, y QC-63 (`ejecutar-receta-operador`) ya tiene escrito lo contrario: el Operador sigue la fórmula en planta «sin poder modificar nada». Se descartó una fila por operación (consultar/crear/editar/borrar): 20+ permisos y ninguna ficha del backlog lo pide. **Borrar entra dentro de modificar.** |
| 2026-09-07 | ¿El Administrador pasa por ser Administrador, o tiene sus permisos escritos? | **Escritos uno a uno en el seed. Sin comodín.** Un comodín deja la ruta del permiso sin probar para el único rol que importa, y no ayuda el día que exista un tercero. El coste —un módulo nuevo tiene que sumarse al seed— se cubre con la guardia de abajo. |
| 2026-09-07 | ¿Modificar implica consultar? | **No: hacen falta los dos, y el seed los da juntos.** Preguntar por «consultar inventario» responde que sí solo si ese permiso está asignado. Sin reglas invisibles: lo que está en la tabla es lo que pasa, y el modelo no envejece mal si mañana aparece «aprobar» o «exportar». |
| 2026-09-07 | ¿Con qué permisos nace el Operador? | **Solo «consultar inventario».** Ve el catálogo y la ficha de un producto —mirar si queda hipoclorito antes de preparar la mezcla— y no crea, ni edita, ni borra. Recetas **no** entran: QC-63 abrirá esa lectura con su propio motivo, que es como se ha decidido que crezca el seed. |
| 2026-09-07 | ¿El dashboard lleva permiso propio? | **Sí, es un módulo más.** Regla uniforme, sin excepciones que recordar. La consecuencia —el login ya no puede llevar siempre ahí— se resuelve en QC-75: lleva a la primera pantalla con permiso. |
| 2026-09-07 | ¿Un módulo sin escritura declara igual los dos permisos? | **No: declara solo los que tiene.** El dashboard hoy solo puede consultarse, así que solo declara «consultar». Declarar un permiso que nadie puede ejercer es una fila que miente. |
| 2026-09-07 | ¿Entra una guardia contra la reincidencia? | **Sí, ejecutable en `tests/guards`**: rojo si un módulo declara un permiso que ningún rol tiene asignado en el seed, y rojo si un servicio sigue autorizando por nombre de rol en vez de por permiso. Sin ella la ficha arregla el presente y no el futuro — que es exactamente lo que pasó con `ADMIN_ROLE_NAME`, declarado cuatro veces teniendo uno bueno delante (QC-54). |
| 2026-09-07 | ¿Dónde se comprueba el permiso? | **En el service, antes del repositorio**, sin cambiar la frontera (`docs/architecture.md > Acceso a datos y autorizacion`). Los cinco `requireAdmin` pasan a ser `requirePermission`. **Encima de QC-54, no en su lugar**: aquélla deja una sola implementación, y sustituir una es quirúrgico donde sustituir cinco copias es su trabajo. De ahí el `depends_on`. |
| 2026-09-07 | ¿En qué idioma se nombran permisos y tablas? | **Tablas y columnas en inglés** (heredado de QC-4), **el valor del permiso en español**, siguiendo los nombres de módulo del repo y el precedente del rol `'Administrador'`: `inventario.consultar`, `inventario.modificar`. Un valor es dato, no identificador. |
| 2026-09-07 | ¿El permiso se puede dar por empresa? | **No.** Heredado de `docs/architecture.md > Dominio`, que lista «permisos por empresa más allá de su rol» entre lo que el reviewer rechaza. El permiso cuelga del rol; la empresa filtra datos y es la épica QC-46. |
| 2026-09-07 | ¿El catálogo de permisos es administrable? | **No, y sigue el precedente de los roles (QC-4): catálogo cerrado y corto, sin pantalla de administración.** Cambiarlo es una migración. Si algún día se administra, será dentro de la épica de usuarios (QC-66/QC-67), no aquí. |
| 2026-09-07 | ¿Hace falta E2E? | **Sí, y es de QC-75, no de esta ficha.** `CHECKPOINTS.md` nombra «permisos» entre los flujos críticos, pero aquí no hay pantalla que abrir: lo que cierra esta ficha son los tests de autorización en los cinco servicios, incluido el rechazo probado del acceso sin permiso. El E2E —el Operador entra, ve un menú corto y recibe 404 en inventario— vive donde existe la pantalla. |
