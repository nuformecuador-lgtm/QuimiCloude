# QC-67 — pantalla-de-usuarios · requirements.md

> **Zona** `frontend` · **Complejidad** `medium` · **depends_on** `QC-66`, `QC-94` ·
> **Rama** `feature/QC-67-pantalla-de-usuarios`
>
> **Alcance.** La pantalla de administración de usuarios en `configuracion/usuarios`: listado
> sobre la tabla compartida de QC-55 (paginado 10/25, búsqueda por nombres, correo o nombre de
> usuario, filtro por estado de cuenta y orden), alta y edición en panel lateral, borrado con
> confirmación y la acción de mover el estado de cuenta entre sus cuatro valores. No construye
> backend: consume las seis Server Actions de QC-66 por su ruta exacta.
>
> **Lo que NO entra.** La consulta de roles que alimenta el selector → **QC-94** (la bloquea).
> Que salir de `blocked` limpie el contador de intentos fallidos → **QC-95** (no la bloquea).
> El enlace para establecer la contraseña → **QC-79**. Restablecer la contraseña de otro →
> **QC-89**. «Mis datos» y cambiar mi propia contraseña → **QC-36**; el actor no se ve a sí
> mismo (QC-66, decisión 12), así que esta pantalla no lo cubre.
>
> *Sembrado por `/afinar-feature` el 2026-09-11. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.*

## Requisitos (EARS)

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

Ninguna.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-09-11 | ¿De dónde salen los roles del selector? | **De QC-94**, ficha backend nueva que devuelve identificador y nombre de los roles y se autoriza con `usuarios.consultar`. QC-66 exige un `roleId` UUID y el módulo solo exporta `SEED_ROLES` (nombres, sin id): hoy no hay de dónde sacarlos. Esta ficha **no construye backend propio** —lo dice su tarjeta— y por eso el trabajo va a su propia ficha, no aquí. **QC-67 queda bloqueada por QC-94** |
| 2026-09-11 | ¿Dónde vive la pantalla? | **`configuracion/usuarios`**, tercer ítem de la sección **Configuración** que ya existe junto a Presentaciones (QC-45) y Unidades (QC-39). La sección **no se crea de nuevo, no se renombra y no se reordena su primer ítem**. Descartada una sección «Administración» propia: nacería con un solo ítem, que es exactamente la deuda de los cinco ítems de navegación de QC-11 |
| 2026-09-11 | ¿Qué permiso corta la pantalla? | **Dos, y cada uno para lo suyo.** El ítem del menú y la página exigen **`usuarios.consultar`** (`requirePagePermission`); crear, editar, borrar y mover el estado **solo se ofrecen** si la sesión trae además **`usuarios.modificar`**. QC-74 decidió que `modificar` NO implica `consultar`, y QC-66 creó los dos: usarlos así es para lo que nacieron. Se aparta a propósito de **QC-45**, que cortó la pantalla entera con `.modificar` —allí no existía el par—. La autorización de verdad sigue **en el service** (QC-66 R1): la UI oculta, no autoriza |
| 2026-09-11 | ¿Cómo se cambia el estado de cuenta? | **Una sola acción de fila, «Cambiar estado», con selector de los cuatro valores y confirmación** antes de escribir. Es exactamente la firma de `setUserAccountStatusAction`: la pantalla no traduce estados a verbos ni decide qué transiciones ofrecer, porque eso sería regla de negocio escrita en la UI |
| 2026-09-11 | ¿Qué estado pinta el listado? | **El almacenado, tal cual lo devuelve QC-66.** La pantalla no calcula el estado efectivo ni lee `locked_until` —QC-66 R45 no lo devuelve, a propósito—. Queda un desfase conocido: una cuenta `blocked` con el plazo ya vencido se pinta `blocked` mientras el login la deja entrar. Es **la dirección segura** (muestra más bloqueado de lo que está) y queda anotado como deuda con nombre, no tapado con lógica en la UI |
| 2026-09-11 | Salir de `blocked`, ¿desbloquea de verdad? | **Sí, y lo arregla QC-95**: mover una cuenta de `blocked` a `active` retira el bloqueo y reinicia el contador de intentos fallidos. Lo que cambia es **R45 de QC-66** —`setUserAccountStatus` llama a `clearedLockState()` de QC-78—, no el código de esta pantalla. **QC-95 no bloquea a QC-67**: la acción se ofrece igual desde el primer día; hasta que esa ficha esté `done`, salir de `blocked` no surte efecto en el acceso |
| 2026-09-11 | ¿E2E? | **Sí**: login → la pantalla → crear un usuario → verlo en la lista con estado `pending`, más el **rechazo de quien no tiene el permiso** (404 dentro del layout privado, mecanismo de QC-75). Es el camino de **QC-45**, y **cierra la E2E que QC-66 difirió aquí con motivo** |
| 2026-09-11 | ¿Qué se dice tras el alta? | **Toast de éxito neutro**, «Usuario creado», como las otras seis pantallas. La cuenta nace `pending` y nadie puede entrar hasta QC-79, pero la pantalla no anuncia un enlace que todavía no existe |
| 2026-09-11 | ¿Qué trae cada fila y qué NO? | Las **seis claves de `UserRow`**: identificador, nombre mostrable, nombre de usuario, correo, rol y estado de cuenta. **Ningún dato de credencial** —el tipo lo impide—, ni `companyId`, ni `accountStatusChangedBy`. El actor **no aparece** en su propio listado (QC-66, decisión 12) |
| 2026-09-11 | Listado, búsqueda, filtro y orden | **Se consumen tal cual los dejó `USER_QUERYABLE`**: paginado 10/25, búsqueda por nombres o apellidos, correo y nombre de usuario, filtro **multivalor** por estado de cuenta y orden por apellidos y nombres. La firma nació abierta para que esta ficha **no tenga que reabrirla** (QC-66, decisión 11): no se añade ningún campo consultable |
| 2026-09-11 | Base heredada, sin re-crear | **Tabla compartida de QC-55**, panel lateral (`sheet`) para alta y edición, **toast** en éxito y error en línea junto al campo, diálogo de confirmación para borrar nombrando al usuario, `<Toaster />` ya montado por el layout privado, constante de ruta única en `lib/shared/routes.ts`, componentes en `<ruta>/components/` con barrel `index.ts`, shadcn/ui **por CLI**, datos de sesión **por props**, asserts sobre roles ARIA / `data-testid` / constantes exportadas y **nunca** sobre literales de copy, viewport angosto y ancho sin excepción de escritorio. Heredado de **QC-22 / QC-45 / QC-55** |
| 2026-09-11 | Mutaciones y errores | **Server Actions de QC-66, importadas por su ruta exacta** (`lib/modules/identity/adapters/driving/user-actions`), nunca por el barrel: un `'use server'` en el cierre transitivo del contrato lo haría inimportable desde un componente de cliente. El estado inicial `{ status: 'idle' }` **lo construye esta pantalla** (un archivo `'use server'` no puede exportar constantes). El error se reconoce **por su `code` estable**, nunca por el texto del mensaje. **Quien decide qué se revalida es esta ficha**: QC-66 no escribió ningún `revalidatePath` porque no había ruta que revalidar |
| 2026-09-11 | Protección de la ruta | **Dos controles, y ninguno sustituye al otro**: `PRIVATE_ROUTE_PREFIXES` cubre la ruta en el borde —garantiza **sesión**, y su guardia pone el gate en rojo si una pantalla de `app/(private)/` se queda sin prefijo— y `requirePagePermission('usuarios.consultar')` exige el **permiso** dentro. Ya no existe regla ruta→rol: QC-75 la borró |
| 2026-09-11 | ¿Librería nueva? | **Ninguna.** Todo lo que hace falta está aprobado y montado |
