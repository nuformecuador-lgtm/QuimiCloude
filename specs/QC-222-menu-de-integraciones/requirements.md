# QC-222 — menu-de-integraciones · requirements.md

> Zona: frontend · Complejidad: low · Épica: QC-220 «Integraciones» · depends_on: QC-221 · Rama:
> feature/QC-222-menu-de-integraciones
>
> **Alcance.** En el sidebar aparece un **grupo desplegable «Integraciones»** (`NavGroup`, QC-75)
> con tres hijos: **Proveedor IA**, **Inventarios** y **WhatsApp**. Cada hijo exige el permiso de
> QC-221 y abre una **página cascarón**: título y estado vacío, sin formulario. Cada página se
> protege con `requirePagePermission`, y sus tres rutas entran en `PRIVATE_ROUTE_PREFIXES` junto
> con su página (lo que QC-221 dejó para esta ficha en su `design.md > 4`). Entra la E2E: el
> Administrador ve el grupo y entra a las tres páginas; los demás roles no ven el grupo y, por URL,
> no pasan.
>
> **Lo que NO entra.** Configuración ni credenciales de ninguna integración. Ningún cambio al
> catálogo de permisos, al seed, a la base ni al módulo `lib/modules/integraciones/`. Ningún cambio
> a `AppSidebar` ni a las funciones de filtrado del menú.
>
> Este archivo **no venía sembrado** por `/afinar-feature` y no hay `progress/features/QC-222.md`.
> La tabla de «Decisiones cerradas» recoge la ficha de Jira QC-222 tal como la trae el encargo del
> leader y lo que QC-221 dejó decidido para esta ficha. No es una conversación nueva con el humano.
>
> **Dependencia dura.** QC-221 (PR #176) aún no está en `dev`. Esta ficha no compila sin ella:
> `requirePagePermission` recibe un `PermissionCode`, y `integraciones.modificar` solo existe en el
> catálogo cuando QC-221 se mergea. Todo lo que aquí se cita de QC-221 se leyó de su worktree
> (`.worktrees/QC-221-permiso-y-modulo-de-integraciones`).

## Requisitos (EARS)

> Notación EARS (`docs/specs.md`). Entre corchetes, cada requisito cita la fila de «Decisiones
> cerradas» de la que sale:
>
> - **[D1]** el grupo y sus tres hijos
> - **[D2]** el permiso de cada hijo y el ocultado del grupo
> - **[D3]** la página cascarón y su corte por permiso
> - **[D4]** el aterrizaje sin permiso (QC-93)
> - **[D5]** la E2E
> - **[D6]** las rutas en los prefijos privados (herencia de QC-221)
> - **[D7]** lo que no entra
>
> Vocabulario fijo de este documento:
>
> - «el permiso» = `integraciones.modificar`, el código que crea QC-221 (solo lo recibe el
>   Administrador).
> - «las tres rutas» = las constantes de QC-221 `AI_PROVIDER_INTEGRATION_ROUTE`
>   (`/integraciones/proveedor-ia`), `INVENTORY_INTEGRATION_ROUTE` (`/integraciones/inventarios`) y
>   `WHATSAPP_INTEGRATION_ROUTE` (`/integraciones/whatsapp`).
> - «el grupo» = el `NavGroup` «Integraciones» de `PRIVATE_NAV_ITEMS`; «los tres hijos» = sus
>   `NavLink`.
> - «roles de semilla» = las claves de `SEED_ROLE_PERMISSIONS`. «Roles sin el permiso» = los roles
>   de semilla cuyo conjunto no contiene el permiso, **derivados del conjunto y no escritos a
>   mano**. Medido en este worktree más QC-221: Operador, Empacador, Maestro y Administrador de
>   acondicionamiento.

### El grupo del menú

**R1.** `PRIVATE_NAV_ITEMS` DEBE contener exactamente un `NavGroup` con la etiqueta
«Integraciones». Sus hijos DEBEN ser exactamente tres `NavLink`, en este orden:

1. «Proveedor IA», con destino `AI_PROVIDER_INTEGRATION_ROUTE`;
2. «Inventarios», con destino `INVENTORY_INTEGRATION_ROUTE`;
3. «WhatsApp», con destino `WHATSAPP_INTEGRATION_ROUTE`.

Ningún otro item del menú DEBE tener un destino igual a `/integraciones` o que empiece por
`/integraciones/`. [D1]

**R2.** Cada uno de los tres hijos DEBE declarar el permiso, y ese código DEBE ser el mismo que
exige la página de su destino. [D2, D3]

**R3.** El grupo DEBE declarar un icono que tenga fila en `NAV_ICONS` y una sección del menú. El
icono y la sección concretos son los de `design.md > 3` (Preguntas abiertas 1 y 2). [D1]

**R4.** CUANDO el menú se filtra con un conjunto de permisos que contiene el permiso, el resultado
DEBE contener el grupo con sus tres hijos, en el orden de R1. [D1, D2]

**R5.** SI el conjunto de permisos con que se filtra el menú no contiene el permiso, ENTONCES el
resultado NO DEBE contener el grupo ni ninguno de sus hijos: ni su etiqueta, ni sus destinos, ni
sus `testId`, en ninguna parte de lo que se serializa hacia el cliente. Se comprueba para cada rol
sin el permiso. [D2]

**R6.** Añadir el grupo NO DEBE cambiar, para ningún rol de semilla, el destino que da
`firstVisibleNavHref` sobre el menú filtrado. Tampoco DEBE cambiar el orden, la sección ni el
contenido de ningún item que ya existiera. [D1, D4]

**R7.** Esta feature NO DEBE modificar `components/private/app-sidebar.tsx`, los tipos `NavLink`,
`NavGroup` y `NavItem`, ni las funciones `filterNavItemsByPermissions`, `groupNavItemsBySection` y
`firstVisibleNavHref`. El grupo DEBE dibujarse y filtrarse con el mecanismo que ya existe. [D1, D2]

### Las páginas cascarón

**R8.** Para cada una de las tres rutas DEBE existir una página en la zona privada que la sirva.
NO DEBE existir ninguna otra página cuya URL sea `/integraciones` o empiece por `/integraciones/`.
[D3]

**R9.** CUANDO un usuario con sesión y con el permiso abre una de las tres rutas, el sistema DEBE
mostrar:

- un título cuyo texto es la etiqueta del hijo del menú que lleva a esa ruta;
- un estado vacío identificable, con un texto que dice que esa integración todavía no se puede
  configurar.

[D3]

**R10.** Las tres páginas NO DEBEN contener ningún formulario, campo de entrada, selector, botón
ni dato de configuración o credencial. NO DEBEN leer datos: ni `searchParams`, ni `params`, ni
Server Actions, ni casos de uso de ningún módulo. [D3, D7]

**R11.** Cada página DEBE exigir el permiso con `requirePagePermission` antes de renderizar nada, y
DEBE exigir exactamente ese código y ningún otro. [D3]

**R12.** SI un usuario con sesión cuyo rol no tiene el permiso abre una de las tres rutas, ENTONCES
el sistema DEBE responder con estado HTTP 404 y pintar la pantalla de «no encontrado» dentro del
layout privado: la misma de cualquier ruta inexistente, sin mencionar permisos ni roles y con el
control de cerrar sesión alcanzable, como fijaron QC-75 y QC-93. [D4]

**R13.** SI una petición sin sesión pide una de las tres rutas, ENTONCES el sistema DEBE
redirigirla al login, como a cualquier otra ruta privada. [D6]

### Las rutas en los prefijos privados

**R14.** `PRIVATE_ROUTE_PREFIXES` DEBE contener las tres rutas, una entrada por ruta, por su
constante. NO DEBE contener `/integraciones` ni ninguna otra entrada bajo `/integraciones`. Las
guardias `guard-rutas-privadas-cubiertas`, `guard-pantallas-exigen-permiso` y
`guard-nav-permisos-declarados` DEBEN pasar sin añadirles ninguna excepción. [D6]

**R15.** SI se evalúa el acceso a `/integraciones/inventarios` sin sesión y con una lista de
prefijos privados que no contiene las tres rutas, ENTONCES la decisión del borde DEBE ser dejar
pasar: esa URL NO DEBE quedar cubierta por el prefijo de `/inventario`. [D6]

### Enmiendas a QC-221

**R16.** Esta feature DEBE sustituir el requisito R15 de QC-221 («mientras no exista una
pantalla…»). Sus tests DEBEN afirmar la presencia exacta de lo que R1, R8 y R14 exigen, y no su
ausencia. [D6]

**R17.** En el código de producción, sin contar comentarios, el permiso solo DEBE aparecer en
estos archivos:

- el catálogo de permisos;
- `db/migrations/`;
- las tres páginas de R8;
- `lib/shared/navigation/private-nav.ts`.

Esta feature relaja así el R9 de QC-221, abriendo esas rutas **exactas** y ninguna carpeta. [D6]

**R18.** Las páginas, el menú y la lista de prefijos DEBEN referirse a las tres rutas por sus
constantes. Ninguna de las tres URL DEBE aparecer escrita como literal fuera de
`lib/shared/routes.ts`; el R14 de QC-221 sigue en pie. [D6]

### La E2E

**R19.** CUANDO un usuario con el rol Administrador inicia sesión, el recorrido E2E DEBE comprobar
lo siguiente:

1. aterriza en el destino que deriva `loginAndLand` (QC-93);
2. ve el grupo y, al desplegarlo, sus tres hijos;
3. pulsa cada hijo y llega a su ruta, con el título y el estado vacío de R9;
4. al pedir cada ruta por URL, recibe estado HTTP 200.

[D5]

**R20.** CUANDO inicia sesión un usuario de un rol sin el permiso, el recorrido E2E DEBE
comprobar lo siguiente:

1. ni el grupo ni ninguno de sus hijos llegan al HTML del navegador (cero elementos con sus
   `testId`);
2. al pedir por URL cada una de las tres rutas, recibe estado HTTP 404 y la pantalla de «no
   encontrado» del layout privado.

Se recorre con los roles Operador, Empacador y Administrador de acondicionamiento (Pregunta
abierta 5). [D4, D5]

**R21.** La E2E DEBE cumplir estas condiciones:

- entra siempre por `loginAndLand`, sin ninguna ruta de aterrizaje escrita a mano
  (`guard-e2e-landing`);
- usa los roles reales del seed, que no crea ni borra;
- toma de `SEED_ROLE_PERMISSIONS` qué roles tienen el permiso, y no de una lista escrita a mano;
- crea y borra sus propios usuarios y empresas, con prefijo propio y limpieza por edad;
- corre en Chromium y en WebKit.

[D5]

### Alcance

**R22.** Esta feature NO DEBE añadir dependencias a `package.json`. Además, NO DEBE tocar:

- `db/` ni `lib/modules/` (catálogo, seed, módulo `integraciones` incluidos);
- `lib/composition/`;
- `middleware.ts` ni `lib/modules/identity/adapters/driving/route-guard-middleware.ts`;
- `components/private/app-sidebar.tsx`.

Ninguna página DEBE ofrecer una vía para configurar una integración o guardar una credencial.
[D7]

### Cobertura de la tabla de decisiones

| Decisión | Requisitos |
|---|---|
| D1 El grupo y sus tres hijos | R1, R3, R4, R6, R7 |
| D2 El permiso de cada hijo y el ocultado del grupo | R2, R4, R5, R7 |
| D3 Página cascarón protegida | R2, R8, R9, R10, R11 |
| D4 Aterrizaje sin permiso como QC-93 | R6, R12, R20 |
| D5 E2E | R19, R20, R21 |
| D6 Rutas en los prefijos privados (herencia de QC-221) | R13, R14, R15, R16, R17, R18 |
| D7 Lo que no entra | R10, R22 |

## Preguntas abiertas

1. **Sección del sidebar donde va el grupo.** Ni la ficha ni los docs la fijan. **Propuesta:**
   `NAV_SECTION_CONFIGURATION` («Configuración»), como último item de esa sección y del array.
   Conectar servicios externos es configuración de la empresa, no operación diaria ni cadena de
   suministro. Hoy esa sección solo la ve el Administrador, que es también el único con el permiso.
   **Coste:** tres tests que fijan «Configuración tiene exactamente dos items» se tensan a tres
   (`design.md > 7`). Alternativas: sección propia («Integraciones», que repetiría la etiqueta del
   grupo) o sin sección. Confirmar en F1.4.
2. **Icono del grupo.** Ninguno de los once de `NavIconName` habla de conectar sistemas.
   **Propuesta:** un nombre nuevo, `plug`, resuelto a `Plug` de `lucide-react`, que ya está
   instalado: no es dependencia nueva. Precedente: `users` y `contact` entraron igual. Confirmar o
   elegir otro en F1.4.
3. **Texto del estado vacío.** La ficha dice «estado vacío» sin copy. **Propuesta:** «Esta
   integración todavía no se puede configurar.», el mismo texto en las tres páginas. Confirmar o
   cambiar en F1.4.
4. **Pieza del estado vacío.** En el repo no hay un componente de estado vacío compartido: cada
   pantalla tiene el suyo (`*-list-empty.tsx`), con el mismo `div` de borde discontinuo.
   `docs/architecture.md` dice «nunca crees un componente si ya existe en shadcn/ui», y shadcn
   tiene la primitiva `empty`. **Propuesta:** añadirla con `pnpm exec shadcn add empty` y usarla
   desde un componente de ruta compartido por las tres páginas (`design.md > 4`). Si la CLI no la
   ofrece para el estilo `base-nova`, o si toca `package.json`, se para y se cae al patrón del
   repo. Confirmar en F1.4.
5. **El Maestro fuera de la E2E.** El Maestro es el único usuario sin empresa, y QC-161 exige que
   la base garantice que **solo un** Maestro tenga la empresa vacía. Crear un Maestro efímero por
   worker (Chromium y WebKit en paralelo) chocaría con esa garantía o con el Maestro del seed.
   **Propuesta:** la E2E recorre Operador, Empacador y Administrador de acondicionamiento. Que el
   Maestro no ve el grupo lo cubre el test unitario de R5, que recorre **todos** los roles sin el
   permiso. Confirmar en F1.4.
6. **Título de cada página.** **Propuesta:** el título es la etiqueta del hijo del menú, sin
   prefijo («Proveedor IA», no «Integración con Proveedor IA»). Es el mismo criterio que
   `UNITS_LABEL`: el nombre de la pantalla y el de su enlace son el mismo dato. Confirmar en F1.4.
7. **Decisiones de QC-221 aún sin confirmar en su F1.4.** Esta ficha da por hechos el código
   `integraciones.modificar` y los nombres de las tres constantes. Si QC-221 los cambia antes de
   mergearse, este spec se ajusta a lo que entre en `dev`, sin reabrir nada más.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-10-08 (ficha) | ¿Qué aparece en el menú? | Un **grupo desplegable «Integraciones»** (`NavGroup`, QC-75) con tres hijos: **Proveedor IA**, **Inventarios** y **WhatsApp** |
| 2026-10-08 (ficha) | ¿Qué permiso lleva cada hijo? | **El de QC-221** (`integraciones.modificar`). El grupo **se oculta si ningún hijo es visible** (regla de QC-75): el grupo no lleva permiso propio |
| 2026-10-08 (ficha) | ¿Qué abre cada hijo? | Una **página cascarón**: título y estado vacío, **sin formulario**. Cada página se protege con `requirePagePermission` |
| 2026-10-08 (ficha) | ¿Qué pasa si entra alguien sin el permiso? | **Aterriza como dice QC-93**: el destino se deriva del menú filtrado, y la ruta pedida por URL da el 404 del layout privado |
| 2026-10-08 (ficha) | ¿E2E? | **Sí.** El Administrador ve el grupo y entra a las tres páginas. Los demás roles no ven el grupo y, si escriben la URL a mano, no pasan. **Recoge la E2E diferida desde QC-221** |
| 2026-10-08 (QC-221 `design.md > 4`) | ¿Cómo se protegen las rutas? | Las tres rutas entran en `PRIVATE_ROUTE_PREFIXES` **junto con su página**, para que `guard-rutas-privadas-cubiertas`, `guard-pantallas-exigen-permiso` y `guard-nav-permisos-declarados` queden en verde. El corte por permiso es el `requirePagePermission` de cada página; el middleware no decide por permiso (QC-75 R16, R18). Esta ficha enmienda R15 y relaja R9 de QC-221 |
| 2026-10-08 (ficha) | ¿Qué NO entra? | **Configuración ni credenciales** de ninguna integración |
