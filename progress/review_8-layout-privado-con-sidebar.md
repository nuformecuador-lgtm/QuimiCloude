# progress/review_8-layout-privado-con-sidebar.md

> Feature 8 - `layout-privado-con-sidebar` - zona `frontend`
> Rama: `feature/8-layout-privado-con-sidebar` - worktree `.worktrees/8-layout-privado-con-sidebar/`
> Revisado el 2026-08-06 contra `specs/8-layout-privado-con-sidebar/{requirements,design,tasks}.md`,
> `progress/impl_8-layout-privado-con-sidebar.md`, `CHECKPOINTS.md`, `docs/architecture.md`,
> `docs/conventions.md`, `docs/verification.md`.
> **Gate**: no se corre aqui (`AGENTS.md > Regla del gate`); lo corre el leader. Esta revision
> es de codigo y de trazabilidad, no de ejecucion de la suite.

## Veredicto

**OK.** Cero hallazgos bloqueantes. 6 hallazgos menores, ninguno impide el merge; dos de ellos
piden decision del leader (icono ausente en "modo icono", atajo Ctrl/Cmd+B).

---

## Lo primero: las tres afirmaciones falsas del design, verificadas sobre el codigo

Las tres son **ciertas** y las tres estan **realmente mitigadas** en el codigo, no solo en la
bitacora. Verificadas leyendo el primitivo generado y `node_modules/@base-ui/react`.

### 1. `Menu.Item` cierra el menu al clicar (riesgo "verde en test, roto en navegador")

- **Confirmado en la fuente**: `node_modules/@base-ui/react/menu/item/MenuItem.d.ts` documenta
  `closeOnClick?: boolean` con `@default true`.
- **Confirmado el paso de la prop**: `components/ui/dropdown-menu.tsx:76` (`DropdownMenuItem`)
  hace spread de `MenuPrimitive.Item.Props`, asi que `closeOnClick` llega al primitivo.
- **Confirmado el uso**: `components/private/nav-user.tsx:87`
  `<DropdownMenuItem closeOnClick={false} nativeButton render={<LogoutMenuItem />} />`,
  dentro de `<form action={logoutAction}>` (linea 86).
- **Y ademas esta protegido contra regresion**, que es lo que importaba: `DropdownMenuContent`
  monta en `MenuPrimitive.Portal` **sin `keepMounted`**, asi que al cerrarse el menu el item se
  desmonta - lo prueba el propio test de R18, que tras `Escape` afirma
  `queryByTestId('private-logout')` nulo. Los tests de R20 y R21 (`nav-user.test.tsx:191`,
  `:211`, `:216`) **vuelven a consultar** `private-logout` **despues** del clic; si alguien
  quitara `closeOnClick={false}`, esas consultas fallarian. El test **no** esta ciego a esta
  regresion.
- Intente ademas una comprobacion empirica por mutacion (quitar la prop y correr
  `nav-user.test.tsx`); el sandbox la bloqueo por ser una edicion de codigo, coherente con el
  rol de reviewer. La cadena de evidencia estructural de arriba es suficiente y verificable por
  lectura.

### 2. La prop `tooltip` no deja el nombre accesible en reposo

- **Confirmado**: `components/ui/sidebar.tsx:541-549` monta `TooltipContent` con
  `hidden={state !== "collapsed" || isMobile}`, y `components/ui/tooltip.tsx:41` lo mete en
  `TooltipPrimitive.Portal`. En reposo no hay texto en el arbol accesible, y Base UI lo enlaza
  como descripcion, no como nombre.
- **Mitigacion presente**: `aria-label` explicito en todos los controles de navegacion -
  `app-sidebar.tsx:87` (marca), `:156` (item simple), `:194` (grupo inline), `:240` (grupo
  flotante) - y en el pie (`nav-user.tsx:54`). Ninguno edita `components/ui/`.
- Es exactamente la "via B" que `design.md > 5.5` (lineas 368-373) preautoriza por escrito.
- Matiz anotado abajo como **menor 1**: el test de R25 no puede detectar si esa mitigacion
  desaparece.

### 3. El `SidebarProvider` escribe la cookie pero nunca la lee

- **Confirmado**: `components/ui/sidebar.tsx:74` usa `React.useState(defaultOpen)` con
  `defaultOpen = true` (linea 57) y asigna `document.cookie` solo en el setter (linea 86). No hay
  ninguna lectura. **`design.md > 5.5` (linea 385) se equivoca** al decir "que el mismo lee al
  montar".
- **Mitigacion presente y correcta**: `app/(private)/layout.tsx:34-35` lee la cookie en servidor
  con `cookies()` y la traduce con `readSidebarOpenState()` (`lib/utils/sidebar-state.ts`), y la
  pasa como `defaultOpen` (linea 38). Preautorizado por `design.md > 5.5` (lineas 396-399).
- **El test de R28 prueba el viaje redondo, no la escritura**: `sidebar-desktop.test.tsx:257-308`
  monta, colapsa, lee `document.cookie`, hace `cleanup()`, **puentea la cookie hacia el
  `cookies()` de servidor**, remonta y afirma `data-state="collapsed"` y `aria-expanded="false"`.
  Si el layout dejara de leer la cookie, el test se pone rojo. Hay ademas el caso simetrico
  (expandido) y limpieza de cookie en `beforeEach` **y** `afterEach`.

---

## Checklist de `CHECKPOINTS.md`

### Especificacion
- [x] `requirements.md` con EARS numerados R1-R36, sin preguntas abiertas.
- [x] `design.md` con alternativas descartadas: **13** (A-M, seccion 9), cada una con su porque.
- [x] `tasks.md` con **21/21 tasks `[x]`** (T0-T20). Verificado por grep de encabezados.

### Trazabilidad
- [x] **Los 36 requisitos tienen test nombrado, existente y que afirma lo que el requisito
      dice.** Verificados uno a uno abriendo cada archivo de test, no leyendo la tabla. Detalle
      en la seccion siguiente.
- [x] `progress/impl_<feature>.md` contiene el mapa `R<n> -> test`.

### Calidad de codigo
- [~] `typecheck` / `lint` / `test`: **delegado al gate del leader**. Esta revision no los corre
      (instruccion explicita). La bitacora reporta `./init.sh` completo en verde, 16 archivos de
      test y 141 tests.
- [x] E2E: **declarado NO APLICA y diferido** por decision humana del 2026-08-06 (T18). La razon
      es verificable: `app/(private)/` no tiene `page.tsx`, luego el route group **no produce
      ninguna URL** y no hay camino que un E2E pueda recorrer. Deuda anotada.

### Datos y seguridad (Supabase)
- [x] **NO APLICA, declarado y no omitido** (bitacora, seccion de checklist): la feature no crea
      ni consulta tablas, no anade migraciones, no anade variables de entorno, no toca Prisma ni
      Supabase. Verificado: el diff contra `dev` no toca `db/`, `package.json` ni `.env*`.
- [x] Sin secretos hardcodeados. Sin webhooks (no aplica firma ni idempotencia).
- [x] RLS: no hay tablas nuevas, no aplica, declarado.

### Patron de capas
- [x] Controller (Server Action `lib/actions/logout.ts`) sin queries ni logica; delega en el
      servicio.
- [x] Service (`lib/services/session-stub.ts`) no conoce HTTP: no importa `next/headers` ni
      `next/navigation` (verificado por lectura **y** por guardia de codigo en
      `logout-action.test.ts:51-79`).
- [x] Repository: **no hay, por diseno**, declarado.
- [x] Componentes de ruta bajo `app/(private)/components/` con barrel `index.ts`, importados
      como `./components`.

### Permisos
- [x] **"Paginas protegidas validan permisos en servidor via `cookies()`": NO APLICA, declarado**
      con su razon (es el alcance de la feature 10; hoy la zona privada no esta protegida y no
      expone URL). No es una omision.
- [x] Componentes `private/` reciben datos por props y no fetchean: requisito duro (R16) con
      test de runtime **y** guardia de codigo sobre los tres archivos de `components/private/`
      (`private-layout.test.tsx:160-176`).
- [x] Mutaciones por Server Action, no `fetch` a API route: el logout es un `<form action=...>`
      sin `onClick`; verificado por lectura y por la guardia de R22.

### Configuracion
- [x] Nada dependiente de entorno hardcodeado. Rutas siempre por constante exportada.

### Verificacion final
- [x] `progress/review_<feature>.md` existe (este archivo), veredicto OK.
- [ ] `progress/history.md` y desmontaje del worktree: **pendientes del leader**, fuera del
      alcance del reviewer.

---

## Verificacion de trazabilidad R1-R36 (test por test)

Comprobado que cada `it` citado **existe con ese nombre** y **afirma lo que el requisito dice**.
Resumen de lo revisado en los casos que podian ser "test aledano":

- **R3** - no se conforma con "hay un `<nav>`": `getByRole('navigation', { name: PRIVATE_NAV_LABEL })`
  **y** `getAllByRole('navigation')` de longitud 1, que es la parte "distinguible" del requisito.
- **R6** - compara la lista de `data-testid` en orden de DOM contra `PRIVATE_NAV_ITEMS.map(testId)`
  con `toEqual`: cubre "ni una de mas" tanto como "ni una de menos".
- **R8** - ademas del `aria-current` en el item activo, afirma que
  `document.querySelectorAll('[aria-current]')` contiene **exactamente** ese elemento. Cubre el
  "y solo ese".
- **R9** - afirma `tagName === 'BUTTON'`, ausencia de `href`, `queryByRole('link', {name})` nulo
  **y** activacion con Enter y con Espacio. Cubre "no debe renderizarlo como enlace navegable".
- **R10** - verificable de verdad porque `Collapsible.Panel` desmonta (`keepMounted` false por
  defecto): los hijos no estan en el DOM, no es un `display:none` que jsdom no evaluaria.
- **R12** - ademas del submenu activo, afirma que **el otro** submenu sigue colapsado (no hay
  contagio).
- **R13** - no solo comprueba los `href` esperados: recoge **todos** los `a[href]` del arbol
  (abriendo antes los submenus) y exige que cada uno pertenezca al conjunto de constantes. Es el
  assert que pone en rojo un literal incrustado.
- **R16** - dos vias: runtime (lo que pinta el pie es lo que devolvio el proveedor mockeado) y
  guardia de fuente sobre `app-sidebar.tsx`, `nav-user.tsx` y `logout-menu-item.tsx` contra
  `session-stub`, `next/headers`, `cookies(`, `fetch(`, `prisma`, `supabase`.
- **R21** - no se limita a ver el `disabled`: deja la Server Action **pendiente** y observa el
  ciclo completo (habilitado, deshabilitado con `aria-busy=true`, resolver, habilitado).
- **R22** - guardia de fuente con regex sobre `lib/actions/logout.ts` **y**
  `lib/services/session-stub.ts`, filtrando comentarios (los archivos mencionan `redirect` y
  `cookies` a proposito en sus cabeceras). Un `redirect` anadido manana lo pone en rojo.
- **R26** - en modo icono afirma primero que los hijos **no** estan en el DOM, y despues que al
  activar el control aparecen como `menuitem` con su `href` y su nombre accesible.
- **R30** - no afirma sobre `aria-modal` (Base UI **no lo emite**; impone la modalidad con
  `aria-hidden` mas `data-base-ui-inert`). Afirma sobre lo que el primitivo hace de verdad,
  incluido que `queryByRole('main')` es nulo, y sobre el traslado real del foco dentro del panel.
- **R34** - parte **deliberadamente** de `sidebar_state=false` (modo icono persistido) para fijar
  que en angosto ese estado se ignora. Es el assert que impide mezclar los dos mecanismos.
- **R35 (negativo, "no toca sesion")** - combina guardia de fuente y assert de runtime: extrae por
  regex **todas** las operaciones `cookieStore.<metodo>(<args>)` de `app/(private)/layout.tsx` y
  exige que el metodo sea `get` y el argumento sea `SIDEBAR_STATE_COOKIE`; prohibe
  `document.cookie`, `Set-Cookie`, `cookieStore.set`, `cookieStore.delete`, `redirect`, `prisma`,
  `supabase`, `fetch(`; y en runtime afirma que **la unica** cookie consultada al renderizar es
  `SIDEBAR_STATE_COOKIE`. **La cookie esta tratada como preferencia de UI y no hay lectura ni
  emision de cookie de sesion en ningun punto de la feature.**
- **R36 (el "no hay `<Toaster />`")** - **si tiene test negativo de verdad**, y no de fachada:
  afirma cero `[data-sonner-toaster]`, cero `[aria-live]`, cero roles `region`, `status`, `alert`
  y `log` en el arbol renderizado, **mas** guardia de fuente contra `sonner`,
  `@/components/ui/sonner` y `<Toaster`. Montar un toaster "ya que estamos" lo pondria en rojo.
  (Nota de numeracion: el encargo llamaba R35 a este requisito; tras la renumeracion de la
  revision (b) es **R36**. R35 es el de "no valida sesion / unica cookie admitida".)

**No se encontro ningun requisito con test vacio, con test que verifique algo aledano, ni con
test inexistente. Cero huecos.**

---

## Costura con la feature 10

- **Datos por props**: `app/(private)/layout.tsx` es el **unico** archivo que importa
  `getSessionUser()`; `AppSidebar` y `NavUser` reciben `user` por prop. Verificado por lectura y
  por la guardia de codigo de R16.
- **Logout como disparador vacio**: `logoutAction(): Promise<void>` sin parametros y sin retorno;
  `endSession()` es un no-op. Sin `redirect`, sin cookies, sin red.
- **Criterio "la 10 conecta sin tocar un solo archivo de UI": SE SOSTIENE.** Ningun componente de
  UI conoce el proveedor de sesion; todos dependen del tipo `SessionUser` y de `logoutAction`,
  ambos congelados.
- **Matiz real** (menor 2): "`session-stub.ts` es el unico archivo que la feature 10 reescribe"
  **no es exacto**. La propia bitacora (deuda 8) reconoce que la 10 tambien anadira
  `redirect(LOGIN_ROUTE)` en `lib/actions/logout.ts`, y ese cambio pondra **en rojo** la guardia
  de R22/R35 de `logout-action.test.ts`. Ninguno de los dos es UI, asi que el criterio duro se
  cumple; lo inexacto es la afirmacion "un solo archivo", que aparece tambien en el comentario de
  cabecera de `lib/services/session-stub.ts`.

---

## Reglas de la casa

- **`components/ui/` intacto.** El diff contra `dev` son **33 archivos, todos `A` (anadidos),
  ninguno modificado**. Los 8 archivos de `components/ui/` son salida del CLI: cero `data-testid`,
  cero `eslint-disable`, cero comentarios en espanol, cero referencias a requisitos. **Ninguna
  primitiva de shadcn sustituida por codigo propio**: la composicion se hace desde fuera con la
  prop `render` de Base UI y con wrappers propios (`SidebarToggle`, `AppSidebar`).
- **Rutas por constante**, nunca literales: `lib/navigation/private-nav.ts` mas `DASHBOARD_ROUTE`
  reutilizado de `lib/types/auth.ts` (no redeclarado). Guardia en el test de R13.
- **Asserts sobre roles ARIA, `data-testid` y constantes exportadas, nunca sobre copy.**
  Verificado por grep: en los 5 archivos de test de la feature no hay un solo `getByText(...)` ni
  `toHaveTextContent('<literal>')`. El unico `toHaveTextContent('QuimiCloude')` del repo esta en
  `login-form.test.tsx`, que es de la feature 7 y no se toco.
- **Archivos compartidos no tocados**: `vitest.config.mts`, `tests/setup.ts`, `eslint.config.mjs`,
  `app/globals.css`, `package.json`, `pnpm-lock.yaml`. Correcto habiendo ramas en vuelo.

---

## Las cuatro decisiones que se pidio juzgar

1. **Toggle en `app/(private)/components/` con barrel: CORRECTO.** La regla existe y dice lo que
   la bitacora afirma: `docs/architecture.md:263-310` ("Regla: componentes de ruta en
   `components/` con barrel `index.ts`"), y `docs/architecture.md:330-332` lista "componentes de
   ruta sueltos junto a `page.tsx`" entre los **anti-patrones que el reviewer rechaza**. Los
   commits citados existen y son del 2026-08-06 (`c666481` refactor de la feature 7, `b8be46a`
   docs de agents), y entraron en esta rama por el merge `a98072e` desde `dev`, es decir despues
   de escrito el spec. Apartarse del design aqui era **obligatorio**, no opcional: seguirlo al pie
   de la letra habria producido justo el anti-patron. El barrel se usa de verdad (`layout.tsx`
   importa `./components`, el test importa `@/app/(private)/components`) y no lleva `'use client'`.
2. **`eslint-disable` de una linea en `hooks/use-mobile.ts`: ELECCION CORRECTA**, con una reserva
   menor. Es codigo generado por el CLI y el disable esta acotado a la linea exacta con su porque
   escrito; la alternativa (un `override` en `eslint.config.mjs`) habria tocado un archivo
   compartido con features en vuelo **y** habria apagado la regla tambien para codigo escrito a
   mano, que es peor. Reserva: al ser un comentario dentro de codigo generado, se pierde si se
   regenera el hook (ya anotado como deuda 7). Un `override` acotado con
   `files: ['hooks/use-mobile.ts']` seria mas duradero; queda como sugerencia, no como exigencia.
3. **Correccion de `vitest.config.ts` a `vitest.config.mts` en `tasks.md`: ES CORRECCION DE UN
   DATO DE HECHO, no un cambio de alcance encubierto.** Revisado el diff real
   (`git diff 9c8b3cb 1da7f22 -- specs/8-layout-privado-con-sidebar/tasks.md`): los unicos cambios
   de contenido son el nombre del archivo de config, la mencion de sus dos `projects`, y el mismo
   nombre en el "aviso de superficie" de T12; el resto del commit son marcas `[x]`. Ni un
   requisito, ni un criterio de "hecho cuando", ni una task tocados. El archivo existe con ese
   nombre en el repo.
4. **Atajo global Ctrl/Cmd+B: ACEPTABLE, se anota; no se exige cubrirlo ni desactivarlo.** Ningun
   requisito lo pide y ninguno lo prohibe; viene de fabrica en `SidebarProvider` y desactivarlo
   obligaria a editar `components/ui/sidebar.tsx`, que es la linea roja de esta feature. Cubrirlo
   con un test seria testear la dependencia, no un requisito. Lo correcto es lo que se hizo:
   declararlo como comportamiento heredado (deuda 6) para que nadie lo descubra tarde. **Nota para
   el leader**: es un listener global de teclado y podria colisionar el dia que la zona privada
   monte un editor de texto rico; si eso llega, entra como requisito propio, no como parche ahora.

---

## Hallazgos

### menor 1 - El test de R25 no puede detectar que se caiga su propia mitigacion
`sidebar-desktop.test.tsx:197-209` afirma `toHaveAccessibleName(item.label)` en modo icono. Pero
en jsdom no se aplica Tailwind y el `<span>` con la etiqueta **sigue en el DOM** en los dos modos
(`app-sidebar.tsx:161`, `:199`, `:244`), asi que el nombre accesible se calcularia del contenido
aunque se quitara el `aria-label`: el test seguiria verde. Atenuante verificado: en el navegador
el ocultamiento en modo icono es por `overflow-hidden` mas `size-8`
(`components/ui/sidebar.tsx:478`), **no** `display:none`, asi que el texto seguiria expuesto al
arbol de accesibilidad y R25 no esta realmente en riesgo. El `aria-label` es cinturon y tirantes,
correcto tenerlo. **No bloqueante**: el requisito se cumple hoy y el riesgo residual es bajo. Si
se quiere cerrar del todo, la via es afirmar el `aria-label` explicito, no mas assert de contenido.

### menor 2 - "`session-stub.ts` es el unico archivo que la feature 10 reescribe" no es exacto
La cabecera de `lib/services/session-stub.ts` y el titular de la bitacora lo afirman; la deuda 8
de la misma bitacora lo desmiente (la 10 tambien anade `redirect(LOGIN_ROUTE)` en
`lib/actions/logout.ts`, y eso rompera a proposito la guardia de R22/R35). El criterio duro
-**cero archivos de UI**- si se sostiene. Corregir la redaccion en la cabecera del stub y dejar
escrito para la 10 que la guardia de `logout-action.test.ts` cambia junto con el requisito.

### menor 3 - El "modo icono" no muestra iconos
`NavLink` y `NavGroup` no tienen campo de icono (ni en el codigo ni en `design.md > 4.3`, que es
lo aprobado), asi que en modo icono cada entrada queda como un boton de 32 px con la etiqueta
recortada por `overflow-hidden`, no como un icono. **No es un incumplimiento del implementer**:
sigue el design aprobado al pie de la letra y ningun requisito exige iconografia. Pero el glosario
de `requirements.md` define modo icono como "reducida a iconos", y lo entregado no lo es
visualmente. Como no hubo verificacion manual en navegador (T18, admitido), esto no lo habria
visto nadie. **Decision del leader**: aceptarlo como estado conocido, o entrarlo como feature
propia (anadir `icon` al tipo). No bloquea el merge.

### menor 4 - El control de colapso vive dentro del `<main>`
`app/(private)/layout.tsx:45-51` mete el `<header>` con `SidebarToggle` dentro de `SidebarInset`,
que **es** el `<main>`. Es HTML valido, no crea landmark `banner` y es justo lo que hace que R5
("un unico `main`") pase limpio; esta explicado en el comentario. Pero un control global de chrome
dentro del contenido principal es un olor de accesibilidad menor. Se anota por si la feature 9
prefiere reubicarlo al montar la primera pantalla.

### menor 5 - `SIDEBAR_STATE_COOKIE` duplica una constante privada del primitivo
`lib/utils/sidebar-state.ts:20` repite `'sidebar_state'` porque la constante equivalente de
`components/ui/sidebar.tsx:28` no se exporta. Esta documentado y es la decision correcta (no se
edita `components/ui/`). **Con red de seguridad**: si el CLI cambiase el nombre, el viaje redondo
de R28 se pondria rojo, porque el helper del test lee `document.cookie` por esa misma constante.
Deriva detectable, no silenciosa.

### menor 6 - Deuda de rutas dispersas y de `lib/utils.ts` frente a `lib/utils/`
Ya declaradas por el implementer (deudas 4 y 5). `DASHBOARD_ROUTE` en `lib/types/auth.ts` y el
resto en `lib/navigation/private-nav.ts`; y el archivo `lib/utils.ts` conviviendo con el
directorio `lib/utils/`. Typecheck resuelve ambos sin ambiguedad y consolidarlo tocaria archivos
de la feature 7. Correcto no hacerlo aqui; queda para el leader.

**Bloqueantes: ninguno.**

---

## Lo que este reviewer NO verifico (dicho, no omitido)

- **No se corrio la suite ni `./init.sh`** (instruccion del leader; el gate es suyo). El veredicto
  de trazabilidad es por lectura de codigo y de tests, que es donde estaban los riesgos reales de
  esta feature; el verde es responsabilidad del gate.
- **No hay verificacion en navegador** de esta feature, y no puede haberla: el route group no
  expone URL. Es el punto ciego conocido, y es el motivo por el que se auditaron a mano los tres
  puntos donde "test verde / navegador roto" era posible (los tres del principio).
