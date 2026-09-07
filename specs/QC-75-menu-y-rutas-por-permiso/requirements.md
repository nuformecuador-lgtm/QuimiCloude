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

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

1. **Cómo se llega a las pantallas de cuenta** — menú de usuario en la cabecera, sección propia
   del sidebar, u otra cosa. Se decide cuando exista la primera de ellas (**QC-36**), no aquí:
   hoy la única ruta de cuenta es cerrar sesión, que ya tiene su sitio en el layout.

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
