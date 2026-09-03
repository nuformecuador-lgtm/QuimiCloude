# QC-13 — guardia-de-sesion-en-navegacion · design.md

> Ámbito técnico de `requirements.md`. Sin modelo de datos, sin migración, sin service: esta
> ficha toca un módulo de datos estáticos de navegación y dos archivos de test.

## 1. Qué cambia y dónde

### 1.1 `lib/shared/navigation/private-nav.ts`

- Se retiran las declaraciones de `NOTIFICATIONS_ROUTE`, `PURCHASE_ORDERS_ROUTE`,
  `SUPPLIERS_ROUTE` y `BATCHES_ROUTE` (R1).
- Se retira, de `PRIVATE_NAV_ITEMS`, el ítem de nivel superior `nav-notificaciones` y el grupo
  entero `nav-compras` con sus dos hijos (`nav-compras-ordenes`, `nav-compras-proveedores`)
  (R2, R3).
- El grupo `nav-produccion` conserva solo el hijo `nav-produccion-formulas`; se retira el hijo
  `nav-produccion-lotes` y, con él, la última referencia a `BATCHES_ROUTE` (R6).
- No se toca `FORMULAS_ROUTE`, su literal `/produccion/formulas`, su etiqueta `Fórmulas` ni su
  `testId` (R4, R14): es terreno de QC-26.
- El comentario de cabecera del archivo, que hoy dice «ninguna de estas rutas existe» sobre las
  cinco de ejemplo, se actualiza para reflejar que quedan cuatro constantes de placeholder menos
  y que Fórmulas sigue siendo placeholder hasta que QC-26 lo convierta.
- El resto del archivo —tipos, `groupNavItemsBySection`, `INVENTORY_ROUTE` reexportado,
  constantes de marca— no cambia (R7).

Resultado esperado de `PRIVATE_NAV_ITEMS` tras el cambio:

```
[
  { kind: 'link', testId: 'nav-dashboard', href: DASHBOARD_ROUTE, section: Operación },
  { kind: 'link', testId: 'nav-inventario', href: INVENTORY_ROUTE, section: Operación },
  {
    kind: 'group', testId: 'nav-produccion', section: Cadena,
    items: [
      { kind: 'link', testId: 'nav-produccion-formulas', href: FORMULAS_ROUTE },
    ],
  },
]
```

### 1.2 `tests/unit/app-sidebar.test.tsx`

Hoy dos casos (R8/R12 originales del spec de QC-11, ver `specs/11-layout-privado-con-sidebar/`)
usan `SUPPLIERS_ROUTE`: el que afirma `aria-current` sobre un hijo activo y el que afirma que su
grupo arranca expandido con el hermano colapsado. `SUPPLIERS_ROUTE` desaparece con esta ficha.

**Decisión: fixture propia, no `FORMULAS_ROUTE`.** Se construye un array `NavItem[]` local al
test —dos grupos con un hijo cada uno, con `href`, `testId` y `section` inventados y
reconocibles como fixture (p. ej. `grupo-a`/`grupo-a-hijo`, `grupo-b`/`grupo-b-hijo`)— y se
inyecta a `renderSidebar(fixture)`, que el archivo ya soporta (`navItems` con valor por defecto
`PRIVATE_NAV_ITEMS`, usado hoy en el caso de colección vacía). El resto de los tests del archivo
—los que hoy leen `primerGrupo()`/`segundoGrupo()` de `PRIVATE_NAV_ITEMS`— **no se tocan**: la
decisión cerrada 6 dice que el precedente de QC-11 («los tests iteran `PRIVATE_NAV_ITEMS`») sigue
rigiendo para todo lo demás del menú, y `nav-produccion` sigue teniendo un grupo real que
ejercitarlos. Solo los dos casos que dependían de `SUPPLIERS_ROUTE` migran a la fixture.

Por qué no `FORMULAS_ROUTE`: es de QC-26, que en su R5 le cambia de etiqueta y de destino
(`specs/QC-26-pantalla-de-recetas/`, en su worktree, todavía no en `dev`). Atar un test de esta
ficha a ese valor lo rompe en cuanto QC-26 mergee, sin que esta ficha haya cambiado nada. Es
exactamente la razón que ya deja escrita la decisión cerrada 6 del `requirements.md`.

### 1.3 `e2e/session.spec.ts`

Dos líneas cambian de `DASHBOARD_ROUTE` a `INVENTORY_ROUTE`:

- El `page.goto(...)` inicial pasa a pedir `INVENTORY_ROUTE` en vez de `DASHBOARD_ROUTE`.
- El `waitForURL` y el `expect(...).toBe(...)` del parámetro `next` del login, y el
  `waitForURL` posterior al login, pasan a esperar `INVENTORY_ROUTE`.
- El `expect(page.getByTestId('dashboard-title')).toBeVisible()` del paso 2 se sustituye por una
  afirmación equivalente sobre la pantalla de inventario. **Qué `testId` expone `/inventario`
  para afirmar que aterrizó ahí y no en otro sitio es un hueco de este design.md**: no hay
  constante ni test previo en el repo que lo declare (`app/(private)/inventario/` es de QC-22,
  fuera de esta rama en el momento de escribir esto). El implementer lo verifica leyendo
  `app/(private)/inventario/page.tsx` en `dev` antes de escribir la línea; si no expone ningún
  `testId` propio, la alternativa mínima es afirmar sobre `page.url()` con el mismo
  `waitForURL`, que ya es una aserción válida y no depende de marcado que no existe.
- El `import { DASHBOARD_ROUTE }` se sustituye por `import { INVENTORY_ROUTE }` desde
  `@/lib/shared/routes` (ambas ya conviven en ese archivo, ver `lib/shared/routes.ts`).
- El resto del recorrido —crear usuario, ver el nombre, cerrar sesión, "atrás" no restaura la
  zona privada— no cambia: sigue siendo un único `test()` (R13).
- Los comentarios de cabecera que citan `/dashboard` como ejemplo del recorrido se actualizan
  para no describir un paso que ya no ocurre.

No se toca `DASHBOARD_ROUTE` en sí ni el paso 2 del login normal (`e2e/login.spec.ts`, si lo
tuviera): el aterrizaje post-login **directo** (sin ruta previa pedida) sigue siendo
`DASHBOARD_ROUTE`, eso lo fijó QC-9 y no es parte de esta ficha.

## 2. Cómo se prueba «borrado» sin depender del copy

R1–R3 y R8 son requisitos negativos: «ya no existe». Un test que sirva tiene que **fallar si
alguien los reintroduce**, sin acoplarse al texto visible (el precedente de `private-nav.ts` ya
manda esto: «los tests afirman sobre las constantes, nunca sobre el literal del copy»).

- **Para las constantes (R1):** TypeScript ya lo hace cumplir gratis. Si `NOTIFICATIONS_ROUTE` se
  reintrodujera como exportación, ningún test lo detecta por sí solo —reintroducir una
  exportación no rompe nada—, así que R1 se verifica con una afirmación explícita en un test
  unitario nuevo (o ampliando `tests/unit/app-sidebar.test.tsx`) que importa el módulo entero con
  `import * as privateNav` y afirma `expect(Object.keys(privateNav)).not.toEqual(
  expect.arrayContaining(['NOTIFICATIONS_ROUTE', 'PURCHASE_ORDERS_ROUTE', 'SUPPLIERS_ROUTE',
  'BATCHES_ROUTE']))`. Esto muerde tanto si alguien reexporta la constante como si la reintroduce
  con otro nombre pero el mismo `testId`/`href` (cubierto por el punto siguiente).
- **Para los ítems y sus destinos (R2, R3, R6):** un test recorre `PRIVATE_NAV_ITEMS` (incluidos
  los hijos de cada grupo) y afirma que ningún `href` del árbol es igual a `/notificaciones`,
  `/compras/ordenes`, `/compras/proveedores` ni `/produccion/lotes`, y que ningún `testId` es
  `nav-notificaciones` ni `nav-compras`. Esto muerde aunque alguien reintroduzca el enlace con un
  `href` escrito a mano en vez de con la constante retirada.
- **Para la longitud y el orden exactos (R5, R6):** un test afirma `PRIVATE_NAV_ITEMS.length` y
  el `testId` de cada entrada de nivel superior, y el `length` y el `testId` del único hijo de
  `nav-produccion`. Longitud exacta, no "al menos": así una reintroducción parcial (un ítem
  suelto sin agregar a un grupo) también rompe el test.
- **Para R4/R14 (Fórmulas intacto):** un test afirma el valor literal de `FORMULAS_ROUTE` y el
  `href`, `label` y `testId` del ítem `nav-produccion-formulas`, para que un cambio accidental de
  esta ficha sobre ese ítem —el terreno común con QC-26— falle aquí y no se descubra en el
  merge.

Estos tests son **nuevos casts sobre `app-sidebar.test.tsx`** (o un archivo unitario hermano
dedicado a `private-nav.ts` si el implementer prefiere no mezclar aserciones de datos puros con
las de renderizado del componente — ver alternativa descartada 3 más abajo) y se documentan en
`tasks.md`.

## 3. Guardia de serialización: no se afloja

`tests/guards/guard-nav-serializable.test.ts` ya recorre `PRIVATE_NAV_ITEMS` entero y no depende
de cuántos ítems tenga: sigue mordiendo igual con tres entradas que con cinco (R8). **No se
modifica ese archivo.** El riesgo real no es que la guardia se debilite, sino que alguien la
esquive añadiendo un dato no serializable en otro punto de `private-nav.ts` sin tocar
`PRIVATE_NAV_ITEMS` — fuera del alcance de esta ficha, que solo borra, no añade.

## 4. Alternativas descartadas

**Alternativa descartada: mover el test de agrupación a `FORMULAS_ROUTE` en vez de a una fixture
propia.** Es lo que un primer vistazo sugiere —`FORMULAS_ROUTE` sigue viva y sigue siendo hija de
un grupo, así que el test compilaría hoy sin tocar nada más—. Se descarta porque **QC-26 se está
apropiando de ese ítem ahora mismo**: su R5 le cambia la etiqueta y, según su `design.md`
(worktree `QC-26-pantalla-de-recetas`, léase el suyo, no se reescribe aquí), probablemente
también cambia su `href` a la ruta de recetas. Un test de esta ficha que dependiera de
`FORMULAS_ROUTE` quedaría roto en el momento en que QC-26 mergee, sin que esta ficha haya hecho
nada mal — exactamente el acoplamiento que la decisión cerrada 6 prohíbe. La fixture local cuesta
unas líneas más y no depende de ninguna otra rama.

**Alternativa descartada: un archivo de test unitario nuevo y separado para `private-nav.ts`, en
vez de ampliar `tests/unit/app-sidebar.test.tsx`.** Separar afirmaciones de datos puros (R1–R6)
de afirmaciones de render (`AppSidebar`) es más limpio en teoría, y de hecho el precedente de
`guard-nav-serializable.test.ts` ya prueba que testear `PRIVATE_NAV_ITEMS` fuera del componente
es un patrón aceptado en el repo. Se deja como decisión del implementer (no bloquea el spec)
en vez de fijarla aquí, porque cualquiera de las dos ubicaciones cumple los requisitos igual de
bien y forzar una sobre la otra en el design.md sería una opinión de estilo, no una decisión
técnica con consecuencias distintas. `tasks.md` deja la elección abierta con un criterio de
"hecho" que no depende de en qué archivo viva.

**Alternativa descartada: no modificar `e2e/session.spec.ts` y en su lugar crear un E2E nuevo
para el retorno a `/inventario`.** El bloque de Alcance y la decisión cerrada 8 son explícitos:
«se modifica el E2E existente, no se crea otro». Crear uno nuevo duplicaría la creación de
usuario, rol y limpieza de huérfanos que ya vive en `session.spec.ts`, y dejaría dos recorridos
del mismo ciclo de sesión divergiendo con el tiempo. Descartada por instrucción directa del
alcance, no por preferencia técnica.

## 5. Librerías de terceros

Ninguna. Es borrar exportaciones de un módulo de datos estáticos y ajustar dos tests ya
existentes con las herramientas que el repo ya usa (Vitest, Testing Library, Playwright). No
hay checks de `docs/architecture.md > Dependencias de terceros` que correr porque no hay
propuesta (decisión cerrada 17, R16).

## 6. Riesgo de terreno compartido con QC-26

`private-nav.ts` y `tests/unit/app-sidebar.test.tsx` los tocan **las dos** features. El alcance
no se solapa —QC-13 borra Compras y Notificaciones; QC-26 transforma Fórmulas— pero el archivo
sí, así que quien mergee segundo resuelve un conflicto de merge textual (no de contenido: los
bloques que cada una toca no son los mismos). `tasks.md` coloca una tarea explícita de sincronizar
con `dev` inmediatamente antes de abrir el PR, no solo al empezar la ficha, siguiendo la lección
que QC-42 dejó escrita sobre QC-32: sincronizar antes de que la otra rama esté en `dev` da un
falso no-op que no repite el conflicto real.
