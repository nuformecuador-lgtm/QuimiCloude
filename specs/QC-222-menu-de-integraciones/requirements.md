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
> Este archivo **no venía sembrado** por `/afinar-feature`. La tabla de «Decisiones cerradas»
> recoge la ficha de Jira QC-222 tal como la trae el encargo del leader, lo que QC-221 dejó
> decidido para esta ficha y las respuestas del humano en F1.4 (2026-10-08,
> `progress/features/QC-222.md > Decisiones`).
>
> **Dependencia.** QC-221 ya está en `dev` (PR #176, merge `57fa8326`) con el permiso
> `integraciones.modificar` y las constantes `AI_PROVIDER_INTEGRATION_ROUTE`,
> `INVENTORY_INTEGRATION_ROUTE` y `WHATSAPP_INTEGRATION_ROUTE`. Esta rama se sincroniza con
> `origin/dev` antes de tocar código (`tasks.md > T0`).

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
> - **[D8]** la sección del sidebar (F1.4)
> - **[D9]** el icono del grupo (F1.4)
> - **[D10]** el texto del estado vacío (F1.4)
> - **[D11]** el estado vacío con el patrón del repo (F1.4)
> - **[D12]** el Maestro fuera de la E2E (F1.4)
> - **[D13]** el título de cada página (F1.4)
> - **[D14]** el permiso y las constantes de QC-221, ya en `dev` (F1.4)
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
>   mano**. Medido con QC-221 en `dev`: Operador, Empacador, Maestro y Administrador
>   de acondicionamiento.

### El grupo del menú

**R1.** `PRIVATE_NAV_ITEMS` DEBE contener exactamente un `NavGroup` con la etiqueta
«Integraciones». Sus hijos DEBEN ser exactamente tres `NavLink`, en este orden:

1. «Proveedor IA», con destino `AI_PROVIDER_INTEGRATION_ROUTE`;
2. «Inventarios», con destino `INVENTORY_INTEGRATION_ROUTE`;
3. «WhatsApp», con destino `WHATSAPP_INTEGRATION_ROUTE`.

Ningún otro item del menú DEBE tener un destino igual a `/integraciones` o que empiece por
`/integraciones/`. [D1]

**R2.** Cada uno de los tres hijos DEBE declarar el permiso, y ese código DEBE ser el mismo que
exige la página de su destino. [D2, D3, D14]

**R3.** El grupo DEBE pertenecer a la sección «Configuración» del menú y DEBE declarar un icono
con fila en `NAV_ICONS` que se resuelva al icono `Puzzle` de `lucide-react`. [D1, D8, D9]

**R4.** CUANDO el menú se filtra con un conjunto de permisos que contiene el permiso, el resultado
DEBE contener el grupo con sus tres hijos, en el orden de R1. [D1, D2]

**R5.** SI el conjunto de permisos con que se filtra el menú no contiene el permiso, ENTONCES el
resultado NO DEBE contener el grupo ni ninguno de sus hijos: ni su etiqueta, ni sus destinos, ni
sus `testId`, en ninguna parte de lo que se serializa hacia el cliente. Se comprueba para cada rol
sin el permiso, el Maestro incluido. [D2, D12]

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

- un título cuyo texto es exactamente la etiqueta del hijo del menú que lleva a esa ruta, sin
  prefijo ni sufijo;
- un estado vacío identificable cuyo texto es exactamente «Próximamente podrás configurar esta
  integración.», el mismo en las tres páginas.

[D3, D10, D11, D13]

**R10.** Las tres páginas NO DEBEN contener ningún formulario, campo de entrada, selector, botón
ni dato de configuración o credencial. NO DEBEN leer datos: ni `searchParams`, ni `params`, ni
Server Actions, ni casos de uso de ningún módulo. [D3, D7]

**R11.** Cada página DEBE exigir el permiso con `requirePagePermission` antes de renderizar nada, y
DEBE exigir exactamente ese código y ningún otro. [D3, D14]

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

Se recorre con todos los roles sin el permiso **salvo el Maestro**, que queda fuera de la E2E y
cubre R5 en test unitario. Hoy son Operador, Empacador y Administrador de acondicionamiento.
[D4, D5, D12]

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
- `components/private/app-sidebar.tsx`;
- `components/ui/`: el estado vacío reutiliza el patrón de estado vacío que ya usa el repo y no
  añade ninguna primitiva.

Ninguna página DEBE ofrecer una vía para configurar una integración o guardar una credencial.
[D7, D11]

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
| D8 Sección «Configuración» | R3 |
| D9 Icono `Puzzle` | R3 |
| D10 Texto del estado vacío | R9 |
| D11 Estado vacío con el patrón del repo | R9, R22 |
| D12 Maestro fuera de la E2E, cubierto en unit | R5, R20 |
| D13 Título = etiqueta del menú | R9 |
| D14 Permiso y constantes de QC-221 en `dev` | R2, R11 |
| D15 Tensar cinco tests más a la forma nueva del menú (enmienda 2026-10-08) | R1, R6, R14 |
| D16 Exclusión por nombre en los tests de alcance (enmienda 2026-10-08) | R8 |
| D17 Paso de teclado de la E2E sobre `private-logout` (enmienda 2026-10-08) | R20 |
| D18 Alta de `integraciones.spec.ts` en `E2E_ESPERADOS` (enmienda 2026-10-08) | R21 |

## Preguntas abiertas

Ninguna. Las siete del borrador se cerraron en F1.4 (2026-10-08) y están en la tabla de abajo
como D8–D14.

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
| 2026-10-08 (F1.4) | ¿En qué sección del sidebar va el grupo? | **«Configuración»** (`NAV_SECTION_CONFIGURATION`), como último item del array |
| 2026-10-08 (F1.4) | ¿Qué icono lleva el grupo? | **`Puzzle` de `lucide-react`** (ya instalado; no es dependencia nueva) |
| 2026-10-08 (F1.4) | ¿Qué texto tiene el estado vacío? | **«Próximamente podrás configurar esta integración.»**, el mismo en las tres páginas |
| 2026-10-08 (F1.4) | ¿Con qué pieza se dibuja el estado vacío? | **Con el patrón que ya usa el repo** (`design.md > 4.2`). No se añade la primitiva `empty` de shadcn |
| 2026-10-08 (F1.4) | ¿El Maestro entra en la E2E? | **No.** Un test unitario cubre que no ve el grupo |
| 2026-10-08 (F1.4) | ¿Qué título lleva cada página? | **La etiqueta del hijo del menú**, sin prefijo |
| 2026-10-08 (F1.4) | ¿Están en `dev` el permiso y las constantes de QC-221? | **Sí.** PR #176, merge `57fa8326`: `integraciones.modificar`, `AI_PROVIDER_INTEGRATION_ROUTE`, `INVENTORY_INTEGRATION_ROUTE` y `WHATSAPP_INTEGRATION_ROUTE` |
| 2026-10-08 (enmienda, bloqueo de T0) | ¿Qué se hace con los cinco tests que fijan la forma del menú o la lista de pantallas y que el diseño no listaba? | **Se tensan** a la forma nueva (`design.md > 7.2`): orden del DOM del sidebar, lista de 10→11 items, ancla de 10→13 enlaces, «Configuración» de 2→3 items y `RUTAS_ESPERADAS_HOY` de 21→24. Las tres rutas entran en esa lista como **entradas**, no como excepciones |
| 2026-10-08 (enmienda, bloqueo de T0) | ¿Qué se hace con el falso positivo de `inventario/scope.test.ts` y `proveedores/scope.test.ts`? | **Se excluye `app/(private)/integraciones/` por nombre, con su motivo escrito**, con el patrón de las exclusiones previas de esos archivos. **No se toca la regex** (`design.md > 7.5`) |
| 2026-10-08 (enmienda, bloqueo de T0) | ¿Qué comprueba el paso de teclado de la E2E, si `private-user-trigger` ya no existe (se quitó el 2026-09-07)? | Que **`private-logout` es visible y recibe el foco por teclado** (`design.md > 8`) |
| 2026-10-08 (enmienda, rojo de `guard-identificador-de-request`) | ¿Qué se hace con el rojo de `tests/guards/guard-identificador-de-request.test.ts:893` («no hay ningun archivo nuevo en e2e/ y existe el test que lo sustituye (R21)»), que da `e2e/integraciones.spec.ts` (exigido por R21 de esta ficha) por archivo no esperado? | **Se da de alta `integraciones.spec.ts` en `E2E_ESPERADOS` como una entrada con nombre y su comentario**, que es como crece esa lista cerrada. **Ni excepción ni relajación** de la guardia (`design.md > 7.2`, E4) |
