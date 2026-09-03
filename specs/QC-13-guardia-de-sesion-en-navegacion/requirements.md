# QC-13 — guardia-de-sesion-en-navegacion · requirements.md

> **Zona:** `frontend` · **Complejidad:** `low` · **depends_on:** `QC-9`, `QC-10`, `QC-12`,
> `QC-15`, `QC-22` · **Rama:** `feature/QC-13-guardia-de-sesion-en-navegacion`
>
> **Alcance.** Retirar de la navegación privada el relleno de maqueta: **cuatro de los cinco
> enlaces que hoy dan 404** —Notificaciones, Órdenes de compra, Proveedores y Lotes— y sus cuatro
> constantes de ruta. **Fórmulas NO se toca**: QC-26 se lo está apropiando ahora mismo para la
> pantalla de recetas (decisión 3). Y cerrar la
> deuda del E2E que QC-9 dejó anotada: que el recorrido de retorno pida `/inventario` en vez de
> `/dashboard`, para que aterrizar ahí demuestre que el retorno a la ruta pedida funcionó y no
> que se cayó al destino por defecto.
>
> **Lo que NO entra.** El destino de la raíz `/`, que hoy sigue siendo la plantilla de
> `create-next-app`: **decisión humana del 2026-09-03**, más adelante habrá una pantalla de
> inicio de verdad y será ficha propia; **hasta entonces no tiene ficha y la raíz se queda como
> está** (decisión 6). Los ítems de menú de cada módulo futuro: los trae su propia ficha
> (**QC-44** proveedores, **QC-35** pedidos, **QC-39** unidades, **QC-45** presentaciones), como
> `private-nav.ts` ya prescribe. **El ítem «Fórmulas»: es de QC-26**, que lo convierte en el
> catálogo de recetas — esta ficha no lo borra ni lo renombra. La revocación de sesiones:
> **QC-23**. Y nada de lo que la
> descripción original prometía sobre validar la cookie, redirigir, autenticar o mostrar el
> usuario: **ya está entregado** (decisión 1).
>
> Sembrado por `/afinar-feature` el 2026-09-03. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

No se rellenan con supuestos (regla 6 de `CLAUDE.md`). Ninguna bloquea la ficha.

1. **El grupo «Producción» queda con un solo hijo.** Nadie ha decidido si una sección de un
   elemento se justifica o si Recetas debería subir a primer nivel. Se deja como está: moverlo
   sería pisar a QC-26, que es quien manda hoy sobre ese ítem.
2. **El E2E pasará a pedir `/inventario`, que solo ve el Administrador** (primera regla ruta-rol
   del repo, estrenada por QC-22). El recorrido depende ahora de que el usuario semilla siga
   siendo Administrador: si eso cambiara, el test probaría el rechazo por rol creyendo que
   prueba el retorno.
3. **Con dos entradas, no se evaluó si la barra lateral colapsable sigue justificándose.** Se
   conserva tal cual: es maquetación de QC-11 y esta ficha no la revisa.
4. **El orden del menú cuando vuelvan los módulos no está decidido.** Hoy es el orden del array
   y nadie lo ha declarado criterio.
5. **QC-13 y QC-26 escriben las dos en `private-nav.ts` y en `app-sidebar.test.tsx`.** El alcance
   ya no se solapa, pero el archivo sí: **quien mergee segundo se come el conflicto**. Es el mismo
   patrón que QC-42 vivió con QC-32, donde el primer intento de sincronizar dio un falso no-op
   porque la otra rama aún no estaba en `dev`. Sincronizar con `dev` **justo antes** del PR, no
   solo al empezar.
6. **La raíz `/` se queda sin ficha.** Es decisión consciente del humano, no un olvido, pero
   mientras tanto la primera pantalla del ERP muestra el logo de otro producto y es pública.
   La deuda sigue anotada en `progress/current.md > Deudas y cosas abiertas`.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
| --- | --- | --- |
| 2026-09-03 | ¿Qué queda de la `description` original de la ficha? | **Casi nada, y se reescribió en el board antes de sembrar.** Verificado en el código: la validación de la cookie en cada navegación y los redirects en ambos sentidos los entregó **QC-9**; el formulario autentica de verdad desde **QC-7/QC-9**; el layout muestra el usuario real (`identity.getSessionUser()`) desde **QC-8/QC-11**; el logout funciona (`logoutAction`) desde **QC-8**; y el dashboard es destino post-login desde **QC-12**. La ficha se escribió antes de que QC-9 existiera |
| 2026-09-03 | El E2E que QC-12 difirió explícitamente a esta ficha | **Ya existe y no se re-crea.** `e2e/session.spec.ts` (QC-9, R24) recorre: pide pantalla privada sin sesión → login → aterriza → ve su nombre → cierra sesión → atrás no muestra la zona privada. La deuda de QC-12 se cierra **por constatación**, y así debe decirse en `history.md` |
| 2026-09-03 | Los enlaces que dan 404 | **Se quitan CUATRO de los cinco**: `NOTIFICATIONS_ROUTE`, `PURCHASE_ORDERS_ROUTE`, `SUPPLIERS_ROUTE` y `BATCHES_ROUTE`, con sus ítems. Un menú con la mayoría de enlaces rotos es lo primero que ve quien abre la app. Es lo que `private-nav.ts` ya prescribía: «la feature que traiga cada módulo sustituye su ítem» |
| 2026-09-03 | **`FORMULAS_ROUTE` y su ítem «Fórmulas»** | **NO se tocan: son de QC-26.** Su spec (sembrado, en su worktree, **todavía no en `dev`**) lo reclama en su R5: el ítem «DEBE dejar de comportarse como placeholder», pasa a resolver a la pantalla de recetas y «NO DEBE seguir presentando la etiqueta Fórmulas». Detectado al cruzar los `tasks.md` en F1.0, que es una comprobación **del leader y no del validador**. Sin esto, las dos features se destruían entre sí: una borra lo que la otra convierte en real |
| 2026-09-03 | ¿Qué queda en el menú? | **Dashboard**, **Inventario** y el grupo **Producción** con su único hijo, Fórmulas —que QC-26 renombra a Recetas—. El grupo **Compras desaparece entero**, porque sus dos hijos eran placeholder |
| 2026-09-03 | La capacidad de agrupar de `AppSidebar` | **Se conserva, y además sigue teniendo datos reales**: el grupo Producción sobrevive. Aun así, `app-sidebar.test.tsx` **pasa a una fixture propia** en vez de apoyarse en `SUPPLIERS_ROUTE` o en `FORMULAS_ROUTE`: el primero desaparece aquí y el segundo lo está moviendo QC-26 a `routes.ts`, así que atarse a cualquiera de los dos garantiza un conflicto. Se aparta a propósito del precedente de **QC-11** («los tests iteran `PRIVATE_NAV_ITEMS`») y queda escrito: el precedente sigue rigiendo para todo lo demás del menú |
| 2026-09-03 | El destino de la raíz `/` | **Fuera de esta ficha y sin ficha propia todavía.** Decisión humana del 2026-09-03: más adelante habrá una pantalla de inicio de verdad en `/` y entonces nacerá su ficha. Hasta entonces la raíz sigue siendo la plantilla de `create-next-app`, pública. **No se crea ficha ahora a propósito**, y por eso queda como pregunta abierta 6 en vez de como frontera hacia otra tarjeta |
| 2026-09-03 | La deuda del E2E de QC-9 sobre el retorno | **Entra aquí.** El recorrido pedirá `/inventario` en vez de `/dashboard`: hoy el dashboard es a la vez destino y respaldo, así que aterrizar ahí no distingue «el retorno funcionó» de «cayó al destino por defecto». Se **modifica** el E2E existente, no se crea otro |
| 2026-09-03 | Zona | **`frontend`**, era `fullstack`. Lo que queda es navegación y un E2E: ni base de datos, ni service, ni API. **Sin partición** (`AGENTS.md > Particion de fullstack` no aplica). Escrito en el board como label `zone:frontend` |
| 2026-09-03 | Complejidad | **`low`**, era `medium`. La `medium` se asignó sobre el alcance viejo, que hoy está entregado. Escrito en el board como label `complexity:low` |
| 2026-09-03 | `depends_on` | Se añade **QC-22** a las cuatro que ya había: el E2E pasa a necesitar que `/inventario` exista. Escrito en el board como link «is blocked by» |
| 2026-09-03 | ¿Quién manda en la navegación? | **`lib/shared/navigation/private-nav.ts` sigue siendo la única fuente**, y `AppSidebar` solo recorre y dibuja. Heredado de **QC-11**: añadir, quitar o mover un ítem se hace ahí y en ningún otro sitio |
| 2026-09-03 | Serialización a través de la frontera servidor/cliente | **Se mantiene la guardia.** Lo que cruza a `AppSidebar` debe ser serializable —un icono de `lucide-react` no lo es— y `guard-nav-serializable` lo hace cumplir. Es la regresión que tuvo **la zona privada entera devolviendo 500 con toda la suite en verde**; ningún test unitario la vio porque en jsdom no existe esa frontera |
| 2026-09-03 | ¿Dónde viven las rutas que sobreviven? | En `lib/shared/routes.ts`, y **no se redeclaran**. Heredado de **QC-22**. El reexport de compatibilidad de `INVENTORY_ROUTE` en `private-nav.ts` **no se toca**: no es relleno de maqueta y limpiarlo excede esta ficha |
| 2026-09-03 | Permisos y reglas ruta-rol | **Aquí no se añade ninguna.** Las trae la ficha de cada módulo, como estrenó **QC-22** con el Administrador en `/inventario`. Quitar un enlace del menú no cambia quién puede entrar a una ruta: eso lo decide el middleware |
| 2026-09-03 | E2E | **Sí, y es el corazón de la ficha** — no se difiere. `CHECKPOINTS.md` lo exige para autenticación y permisos, y aquí se modifica el recorrido que ya existe |
| 2026-09-03 | Librería nueva | **Ninguna.** Es borrar datos de navegación y ajustar un test. Regla 7 de `CLAUDE.md` sin propuesta que abrir |
