# QC-75 — menu-y-rutas-por-permiso · requirements.md

> **Zona** `fullstack` · **Complejidad** `high` · **depends_on** QC-74 ·
> **Rama** `feature/QC-75-menu-y-rutas-por-permiso`
>
> ## Alcance
>
> La zona privada deja de enseñar lo que no se puede usar. El menú lateral se arma en el
> servidor con los permisos de quien entra: quien no puede consultar un módulo no ve su ítem.
> Entrar por URL a una pantalla sin permiso devuelve **404**, indistinguible de una ruta que no
> existe — no se confirma siquiera que la pantalla exista. Se retira la lista de reglas
> ruta-a-rol del middleware, que queda solo con lo que puede comprobar sin base de datos: firma,
> caducidad y empresa. El login deja de llevar siempre al dashboard.
>
> ## Lo que NO entra
>
> - **Backend propio.** Consume el modelo de permisos de QC-74: no crea tablas, ni permisos, ni
>   casos de uso, ni toca el seed.
> - **Las pantallas de cuenta en sí.** Cambiar mi contraseña es **QC-36** y cerrar mis sesiones es
>   **QC-53**. Aquí solo se fija que su ruta no exige permiso de módulo.
> - **La pantalla de unidades.** `unidades.consultar` existe desde QC-74, pero su pantalla es
>   **QC-39**: hoy no hay ítem de menú que filtrar para ese módulo.
> - **Administrar permisos o roles.** No existe y no se crea (heredado de QC-74).
>
> _Sembrado por `/afinar-feature` el 2026-09-07. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`._

## Requisitos (EARS)

> Los códigos de permiso son los **diez del catálogo de QC-74** (`lib/modules/identity/domain/permissions.ts`).
> Esta ficha no crea ninguno.

### El menú se arma con los permisos de quien entra

**R1.** MIENTRAS exista una sesión válida, el sistema DEBE construir la navegación de la zona
privada **en el servidor** filtrando `PRIVATE_NAV_ITEMS` con el conjunto de permisos del usuario de
esa sesión, de modo que solo queden los ítems cuyo permiso declarado pertenezca a ese conjunto.

**R2.** CUANDO un enlace del menú exija un permiso que el usuario no tiene, el sistema DEBE
**omitirlo del HTML servido** —ni su etiqueta, ni su `href`, ni su `data-testid` aparecen en la
respuesta— y NO DEBE limitarse a ocultarlo con CSS ni a decidirlo en el cliente.

**R3.** SI un grupo de navegación se queda sin ningún hijo visible tras el filtrado, ENTONCES el
sistema DEBE omitir el grupo entero, incluidos su etiqueta y su disparador.

**R4.** El sistema DEBE conservar en el menú filtrado el **orden y la agrupación** de
`PRIVATE_NAV_ITEMS`: el filtrado quita ítems, nunca los reordena, los mueve de sección ni los
duplica.

**R5.** El sistema DEBE declarar el permiso que exige cada enlace **dentro de
`lib/shared/navigation/private-nav.ts`**, que sigue siendo la única fuente de la navegación, con la
forma `<modulo>.consultar`; ningún componente de UI (`AppSidebar` incluido) DEBE decidir la
visibilidad de un ítem. Todo permiso declarado allí DEBE pertenecer al catálogo de QC-74.

### Entrar por URL sin permiso da 404

**R6.** El sistema DEBE exigir, en cada pantalla bajo `app/(private)/`, el permiso
`<modulo>.consultar` de su módulo **en el servidor y antes de leer o pintar datos** de esa pantalla.

**R7.** CUANDO alguien con sesión válida pida por URL una ruta privada cuyo permiso no tiene, el
sistema DEBE responder con **estado HTTP 404** y con el mismo contenido que devuelve cualquier otro
404 de la zona privada, y NO DEBE nombrar el módulo pedido, mencionar permisos, roles ni sugerir de
ninguna forma que esa pantalla existe.

**R8.** CUANDO se produzca ese 404, el sistema DEBE pintarlo **dentro del layout privado**: la
cabecera y el control de cerrar sesión están presentes, y el menú es el ya filtrado (vacío si no
queda ningún ítem).

**R9.** MIENTRAS el rol de quien entra no tenga ningún permiso de consulta, el sistema DEBE
responder 404 en **toda** ruta privada, y NO DEBE presentar una pantalla de «sin acceso» ni rechazar
el login de esa persona.

**R10.** La comprobación de permiso de pantalla DEBE delegar en `assertPermission` del contrato
público de `identity` —la única implementación de «el actor tiene este permiso» (QC-74 R12)— y NO
DEBE comparar el conjunto de permisos a mano.

### El destino del login

**R11.** CUANDO unas credenciales correctas no traigan un destino de vuelta válido, el sistema DEBE
aterrizar en el **primer enlace visible del menú ya filtrado**, recorriéndolo de arriba abajo y
entrando en cada grupo por el orden de sus hijos.

**R12.** SI el menú filtrado queda vacío, ENTONCES el login DEBE llevar igualmente a una ruta
privada, que responde 404 dentro del layout privado (R7, R8): NO DEBE devolver al login, ni mostrar
error de credenciales, ni pantalla de «sin acceso».

**R13.** CUANDO el login traiga un destino de vuelta interno y válido, el sistema DEBE seguir
aterrizando en él (comportamiento heredado de QC-9 R8, que esta ficha no cambia).

### Las rutas de la cuenta

**R14.** MIENTRAS exista una sesión válida, el sistema DEBE permitir **cerrar sesión** sin exigir
ningún permiso del catálogo, incluso a quien tenga el conjunto de permisos vacío.

**R15.** El sistema NO DEBE añadir ningún permiso comodín, de «cuenta» o equivalente: el catálogo
sigue teniendo exactamente los diez códigos de QC-74.

### La retirada del corte por rol del borde

**R16.** El sistema DEBE retirar la lista `ROUTE_ROLE_RULES` y todo corte de ruta por **nombre de
rol**: ninguna decisión del middleware DEBE depender del rol que viaja en la cookie.

**R17.** MIENTRAS se retira ese corte, el middleware DEBE seguir validando **firma, caducidad y
empresa** del contenido firmado, redirigiendo al login —con la ruta pedida como destino de vuelta—
toda petición anónima a una ruta privada, y redirigiendo fuera del login a quien ya tenga sesión.

**R18.** El sistema NO DEBE introducir en el cierre de imports del middleware ninguna consulta a
base de datos, ningún repositorio ni el catálogo de permisos: el borde sigue decidiendo sin tocar la
base.

**R19.** El sistema DEBE obtener el conjunto de permisos del actor **de la misma lectura de sesión**
que ya hace el layout privado, sin añadir ninguna consulta por petición (QC-74 R11).

### Que no se quede atrás

**R20.** El sistema DEBE fallar ruidosamente —guardia ejecutable en `tests/guards/`— si una pantalla
bajo `app/(private)/` no exige ningún permiso, o si un enlace de `PRIVATE_NAV_ITEMS` declara un
permiso que no está en el catálogo de QC-74.

**R21.** El sistema DEBE cubrir con un test E2E el recorrido completo de un usuario con el rol
`Operador`: entra con credenciales correctas, aterriza en la primera pantalla de su menú, ve un menú
corto —sin los ítems de los módulos que no puede consultar— y, al pedir por URL una ruta de un
módulo sin permiso, recibe 404 con el control de cerrar sesión presente.

**R22.** El sistema NO DEBE añadir ninguna dependencia nueva, ni modificar el esquema de datos, el
seed, ni los casos de uso de los módulos de negocio: esta ficha consume el modelo de permisos de
QC-74.

## Preguntas abiertas

1. **Cómo se llega a las pantallas de cuenta** — menú de usuario en la cabecera, sección propia
   del sidebar, u otra cosa. Se decide cuando exista la primera de ellas (**QC-36**), no aquí:
   hoy la única ruta de cuenta es cerrar sesión, que ya tiene su sitio en el layout.

2. **La decisión 9 dice «recibe 404 en inventario», y eso hoy no puede pasar** (la anota
   `spec_author`, no reabre la decisión: el E2E sigue viviendo aquí y sigue siendo el del Operador).
   `SEED_ROLE_PERMISSIONS` da al `Operador` exactamente `inventario.consultar` (QC-74 R9), o sea que
   inventario es justamente el único módulo que **sí** puede consultar; el 404 en esa ruta exigiría
   cambiar el seed, y el seed está fuera de alcance. R21 conserva la forma del recorrido —menú corto
   + 404 por URL— apuntando el 404 a un módulo que el Operador no tiene (`/pedidos`), y el aterrizaje
   del login a `/inventario`. Si lo que se quería era otra cosa, se dice y se ajusta R21.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-09-07 | ¿Qué ve alguien cuyo rol no tiene permiso para ninguna pantalla? | **404 en todo, sin pantalla especial de «sin acceso».** Coherente al máximo con la regla del 404 de esta misma ficha y sin código nuevo. Se descartaron una pantalla dedicada y rechazar el login: la segunda además miente sobre lo que pasó —las credenciales eran correctas— y dejaría a esa persona sin poder cambiar su contraseña. |
| 2026-09-07 | ¿Hay rutas privadas que no exigen permiso de módulo? | **Sí: lo propio de la cuenta.** Cerrar sesión, y cuando existan, cambiar mi contraseña (QC-36) y mis sesiones (QC-53). No son módulos del ERP, son la cuenta de quien ya está autenticado. **No se inventa un permiso «mi cuenta» que todos los roles llevan siempre**: eso es un comodín disfrazado, y QC-74 descartó los comodines por escrito. |
| 2026-09-07 | ¿Dónde se pinta el 404 de una ruta privada? | **Dentro del layout privado**: menú vacío, pero cabecera y cerrar sesión presentes. Es lo que hace compatibles las dos decisiones anteriores — con un 404 pelado, quien no tenga ningún permiso entra y queda encerrado sin botón de salir, y la única salida sería borrar la cookie a mano. |
| 2026-09-07 | El grupo «Producción», cuyo único hijo hoy es «Recetas», ¿qué hace si ese hijo se oculta? | **Desaparece el grupo entero.** Regla: un grupo se dibuja solo si le queda al menos un hijo visible. Un grupo que se despliega y no tiene nada dentro enseña que existe algo que no puedes usar, que es justo lo que esta ficha viene a quitar. |
| 2026-09-07 | «La primera pantalla que esa persona puede ver», ¿primera según qué orden? | **El orden del menú ya filtrado**, de arriba abajo. Sin segunda lista que mantener: `PRIVATE_NAV_ITEMS` ya es la única fuente de navegación, y lo que ve al entrar coincide con lo primero que tiene delante. Una lista de prioridad aparte es el tipo de duplicación que ya costó QC-54. |
| 2026-09-07 | ¿Por qué permiso se filtra cada ítem del menú? | Por `<modulo>.consultar`. **Heredado de QC-74**: no hay implicación entre permisos, así que tener `<modulo>.modificar` no enseña el ítem. |
| 2026-09-07 | ¿Quién decide qué se dibuja en el menú? | **Heredado de QC-11**: `PRIVATE_NAV_ITEMS` es la única fuente de la navegación y `AppSidebar` no decide nada, solo la recorre. El filtro por permiso entra en la fuente, no en el componente. |
| 2026-09-07 | ¿El middleware deja de proteger la zona privada? | **No.** Se le quita la lista ruta-a-rol, no la validación de sesión: firma, caducidad y empresa se quedan. **Heredado de QC-9 y `docs/architecture.md`**: el layout privado sigue siendo la última línea de defensa y el middleware nunca fue frontera de autorización. |
| 2026-09-07 | ¿Hace falta E2E? | **Sí, y vive aquí**: el Operador entra, ve un menú corto y recibe 404 en inventario. Es el que `CHECKPOINTS.md` exige para permisos y que QC-74 difirió con motivo por no tener pantalla que abrir. |
| 2026-09-07 | ¿Librería nueva? | **No.** |
