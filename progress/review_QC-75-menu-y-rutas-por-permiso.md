# QC-75 — menu-y-rutas-por-permiso · review

> Rama `feature/QC-75-menu-y-rutas-por-permiso`, worktree
> `.worktrees/QC-75-menu-y-rutas-por-permiso/`, HEAD `aa3e71c`, arbol de trabajo limpio.
> Rango revisado: `origin/dev...HEAD` (3 commits de la ficha, 65 archivos).
>
> **Veredicto: APROBADO.** 0 bloqueantes, 3 menores.
>
> El reviewer NO corrio la suite completa ni el E2E entero (queda para el leader). Corrio
> `typecheck`, `lint`, `tests/guards/` (19 archivos), `tests/unit/identity/`,
> `tests/unit/navegacion/`, `dashboard-route-contract`, `login-form`, `permiso-ruta-pedidos`,
> y **siete mutaciones** sobre codigo de produccion.

---

## 1. Checklist

### Especificacion
- [x] `requirements.md` con R1-R22 EARS numerados, Alcance, «Lo que NO entra» y las diez
      decisiones cerradas del humano. Ninguna decision cerrada se contradice (ver seccion 3).
- [x] `design.md` con 9 secciones y **cinco** alternativas descartadas con su porque.
- [x] `tasks.md`: **16 de 16 tasks en `[x]`**. Cada una tiene su archivo tocado en el diff.

### Trazabilidad
- [x] Los 22 requisitos mapean a un test que **existe y prueba lo que el requisito dice**.
      Se abrieron los archivos, no se confio en el mapa de la bitacora (seccion 2).
- [x] `progress/impl_QC-75-menu-y-rutas-por-permiso.md` contiene el mapa `R<n> -> test` con
      el caso concreto de cada uno.

### Calidad de codigo
- [x] `pnpm run typecheck` — sin salida, cero errores (corrido por el reviewer).
- [x] `pnpm run lint` — sin salida, cero errores (corrido por el reviewer).
- [x] `vitest run tests/guards/ tests/unit/identity/ tests/unit/pedidos-ui/permiso-ruta-pedidos.test.ts`
      -> `51 passed (51)` · `657 passed (657)`.
- [x] `vitest run dashboard-route-contract + require-page-permission + login-action + login-form
      + tests/unit/navegacion/` -> `9 passed (9)` · `137 passed (137)`.
- [x] **Flujo critico «permisos» con E2E**: `e2e/permisos.spec.ts` (R21). Revisado linea a
      linea (seccion 6); no re-ejecutado aqui por instruccion.
- [x] **Multiplataforma**: la unica UI nueva es `app/(private)/not-found.tsx` — texto estatico,
      sin `100vh`, sin `:hover`, sin controles ni inputs, sin libreria nueva.
      `dashboard-route-contract` conserva su guardia de `100vh` y `hover:`. Sin hallazgos.
- [x] **Dependencias**: `package.json` **no aparece** en el diff.
      `tests/unit/navegacion/qc75-convenciones.test.ts` lo afirma contra el merge-base con `dev`,
      y `guard-dependencias-aprobadas` sigue verde sin tocarse.

### Datos y seguridad
- [x] `db/schema.prisma`, `db/migrations/**` y el seed **no aparecen** en el diff (verificado con
      `git diff --stat origin/dev...HEAD`, no de palabra). Ningun modelo nuevo -> nada que exigir
      de columna de empresa ni de RLS.
- [x] Ninguna consulta de datos de operacion nueva: la ficha no toca `lib/modules/*/domain/**`
      de los cinco modulos de negocio.
- [x] Sin secretos hardcodeados. El `.env` del worktree esta ignorado (`.gitignore:38`).
- [x] Sin webhooks nuevos.

### Modulos hexagonales
- [x] `require-page-permission.ts` es un **adaptador driving** y usa `next/navigation` y
      `@/lib/composition`, exactamente lo que `docs/architecture.md` permite a
      `adapters/driving/**` y prohibe a `domain/**`.
- [x] `lib/shared/navigation/private-nav.ts` no importa modulos ni composition: sigue siendo hoja
      del grafo. Por eso `NavLink.permission` es `string` y no `PermissionCode`, con guardia que
      cierra el hueco.
- [x] El barrel de `identity` no reexporta ningun `'use server'` ni el helper nuevo.
- [x] `guard-middleware-edge.test.ts` **no se toco** y sigue verde.

### Verificacion final
- [x] `progress/review_QC-75-menu-y-rutas-por-permiso.md` (este archivo).
- [ ] `./init.sh` completo — **lo corre el leader** (por instruccion explicita).
- [ ] Entrada en `progress/history.md` y desmontaje del worktree — cierre del leader.

---

## 2. Trazabilidad R1-R22 — verificada abriendo cada test

| R | Estado | Comprobacion del reviewer |
|---|---|---|
| R1 | OK | `nav-filtrado.test.ts` (filtro puro) + `private-layout-menu.test.tsx`, que renderiza el layout real. La mutacion 4 lo mata. |
| R2 | OK | `private-layout-menu` usa `queryByTestId === null` sobre el arbol, no clases CSS; `permisos.spec.ts` usa `toHaveCount(0)` sobre el HTML servido. |
| R3 | OK | `nav-filtrado` «el grupo sin ningun hijo visible desaparece ENTERO». La mutacion 6 lo mata. |
| R4 | OK | Tres casos: orden y seccion, no muta la entrada, devuelve estructuras nuevas. |
| R5 | OK | `guard-nav-permisos-declarados` importa `PERMISSIONS` **y** `PRIVATE_NAV_ITEMS` reales, con ancla de los cinco enlaces y casos sinteticos (permiso desconocido, permiso ausente, hijo de grupo). |
| R6 | OK | `pantallas-exigen-permiso.test.tsx` invoca las **ocho paginas reales** con promesas espia de params/searchParams y las cuatro Server Actions mockeadas, y afirma que no hubo NINGUNA lectura en el corte. Es «antes de leer», no solo «exige». La mutacion 5 mata 20 casos. |
| R7 | OK | `private-not-found.test.tsx` (copy sin «permiso», «rol», «autoriz» ni modulo, y sin enlaces) + `require-page-permission` (la llamada LANZA) + E2E con `response.status() === 404`. |
| R8 | OK | E2E: tras el 404 siguen `private-not-found` y `private-logout` alcanzable, o sea que el 404 sale envuelto en el layout. `app/(private)/layout.tsx` no contiene ningun `notFound` (leido entero). |
| R9 | OK | Las ocho paginas con permisos vacios responden 404 (`it.each` completo); `private-layout-menu` «sin ningun permiso el menu queda vacio y el pie con cerrar sesion sigue ahi»; `login-action` no rechaza el login. |
| R10 | OK | Test de comportamiento (`inventario.modificar` no abre `inventario.consultar`) **mas** test de fuente que prohibe la comparacion manual del conjunto en el helper. |
| R11 | OK, con el arreglo verificado | Ver seccion 5. |
| R12 | OK | `login-action` «sin ningun permiso -> DASHBOARD_ROUTE» + `firstVisibleNavHref` devuelve `null` con lista vacia. |
| R13 | OK | «el destino de vuelta interno gana al respaldo» y «descarta el externo y manda el respaldo». |
| R14 | OK | `private-layout-menu` (logout presente con permisos vacios y con uno solo) + E2E (logout alcanzable **en la pantalla de 404**, por teclado). |
| R15 | OK | `qc75-convenciones`: diez codigos exactos, sin comodin de modulo ni de accion, modulos y acciones enumerados, **con caso sintetico que dispara y su simetrico que no**. |
| R16 | OK | Ver seccion 7. |
| R17 | OK | `route-guard-middleware.test.ts`: anonimo -> login con `next`, caducada, firma manipulada, token v1, login con sesion -> dashboard, **y el bloque «la empresa firmada y el portero de rutas (QC-48)»** (sin empresa -> login; empresa mal formada -> login). |
| R18 | OK | `guard-middleware-edge.test.ts` **sin tocar** (no aparece en el diff) + test de fuente del middleware. |
| R19 | OK | `private-layout-menu` «una sola lectura de sesion» (`toHaveBeenCalledTimes(1)`). |
| R20 | OK | Las dos guardias nuevas. La mutacion 7 (pagina nueva sin corte) las pone rojas con nombre de archivo y mensaje accionable. |
| R21 | OK | `e2e/permisos.spec.ts`, seccion 6. |
| R22 | OK | `qc75-convenciones` compara contra el merge-base con `dev`: esquema, migraciones, seed, dominio de los cinco modulos y dependencias, con casos fabricados que disparan y limpios que no. Confirmado ademas en `git diff --stat`. |

**Ningun requisito quedo sin test, y ningun test del mapa resulto vacio o tautologico.**

---

## 3. Las diez decisiones cerradas

| # | Decision | Cumplida |
|---|---|---|
| 1 | 404 en todo para quien no tiene permisos, sin pantalla de «sin acceso» | Si. No existe ninguna pantalla de «sin acceso» en el diff; el login no se rechaza. |
| 2 | Rutas de cuenta sin permiso de modulo, **sin comodin** | Si. `NavLink.permission` es obligatorio (un enlace sin permiso no compila) y `qc75-convenciones` prohibe el comodin. |
| 3 | El 404 se pinta **dentro** del layout privado | Si. `app/(private)/not-found.tsx` en el route group; el layout **no** llama a `notFound()`. Ver menor M1. |
| 4 | Grupo sin hijos visibles desaparece entero | Si (R3). |
| 5 | «Primera pantalla» = orden del menu filtrado | Si. `firstVisibleNavHref`, sin segunda lista. |
| 6 | Se filtra por `<modulo>.consultar` | Si, con caso explicito de que `.modificar` no enseña el item. |
| 7 | La fuente decide, `AppSidebar` no | Si. `components/private/app-sidebar.tsx` **no aparece en el diff**. |
| 8 | El middleware no deja de proteger | Si (R17). |
| 9 | E2E del Operador | Si, con la correccion del board (404 en `/pedidos`, no en `/inventario`), anotada en `requirements.md > Preguntas abiertas 2` sin reabrir la decision. |
| 10 | Ninguna libreria nueva | Si. |

---

## 4. Encargo 1 — el centinela del dashboard, acotado (la desviacion delicada)

`tests/unit/dashboard-route-contract.test.ts`. Se verifico punto por punto:

**(a) La excepcion es exactamente ese import y no un colador.** No hay ningun `continue` que salte
`page.tsx`. Hay una constante `IMPORT_PERMITIDO` que es una **regexp anclada a linea completa**
(inicio y fin de linea, llaves con un solo simbolo, y la ruta exacta del helper, que sale a su vez
de dos constantes), una funcion `sinElImportDelHelper` que **quita solo las lineas que casan esa
regexp**, y despues se aplica la lista **entera** de prohibidos —`fetch(`, `cookies`, `prisma`,
`supabase`, `@/lib/composition`, `@/lib/modules/`— a todo lo que queda. Un import del helper con
un simbolo extra, o desde otra ruta, no casa la regexp y cae como infractor. La ruta y el nombre
salen de constantes compartidas con el caso positivo: si el helper se mudara, ambos se ponen rojos
a la vez en vez de quedar uno vigilando una ruta muerta.

**(b) `dashboard-content.tsx` conserva la prohibicion entera.** Es la primera asercion del caso:
la lista completa contra el componente de ruta, sin descontar nada.

**(c) El resto de R6 de QC-12 sigue vigente y probado.** Siguen intactos: «se renderizan en
servidor» (`use client`, `useState`, `useEffect`, `onClick` prohibidos en las dos fuentes), «la
pantalla no valida sesion ni protege la ruta» (`redirect`, `next/headers`, `getSessionUser`
prohibidos en `page.tsx` — y el helper no los introduce, los encapsula), «no incrusta literales de
ruta», «no toca `PRIVATE_NAV_ITEMS` ni redeclara constantes de ruta» y la guardia multiplataforma.

**Mutacion 1 — el colador.** Inyectados en `app/(private)/dashboard/page.tsx` un
`import { identity } from '@/lib/composition';` y un
`import { listOrdersAction } from '@/lib/modules/pedidos/adapters/driving/order-actions';`:

```
× la pantalla no consulta datos, red ni cookies (salvo el corte por permiso de la pagina)
- []
+ [ "@/lib/composition", "@/lib/modules/" ]
```

**Los dos casos caen, cada uno nombrado.** La guardia no es un colador. Ademas el caso sintetico
«la excepcion del import permitido no es un colador» ya demuestra lo mismo en memoria.

**Mutacion 2 — la vacuidad.** Borrado el import del helper y la llamada
`await requirePagePermission('dashboard.consultar')` de `page.tsx`:

```
× la pagina exige dashboard.consultar y ese import permitido existe de verdad
× cada pantalla privada llama a requirePagePermission con un codigo del catalogo   (guardia R20)
```

La parte positiva impide que la excepcion quede verde por no haber nada que descontar.
**Relajacion correcta y cerrada por los dos lados.**

---

## 5. Encargo 3 — R11 y el arreglo que destapo el E2E

**Confirmado el diagnostico de la bitacora 5.1** leyendo el codigo del rango: `app/(public)/login/page.tsx`
pasaba `DASHBOARD_ROUTE` como respaldo a `resolveReturnPath`, y `LoginForm` tenia
`next = DASHBOARD_ROUTE` por defecto, asi que el campo oculto viajaba con `/dashboard` en todo
login sin `?next=` y ganaba dentro de `loginAction`.

**Arreglo, hoy en el arbol:** la pagina entrega cadena vacia y `LoginForm` tiene `next = ''`. Es
seguro porque la cadena vacia no es una ruta interna, asi que `resolveReturnPath` cae al respaldo
calculado. QC-9 R8/R9 no se debilita: hay caso que afirma que `?next=/inventario?pagina=2` sigue
mandando y que el externo se sigue descartando.

**La red de regresion existe y funciona, en dos capas:**

1. `tests/unit/identity/login-action.test.ts` > «el campo next **presente pero vacio** no pisa el
   respaldo por permisos (R11)» — el caso exacto que el unitario viejo no tenia, que es el que el
   navegador manda de verdad.
2. `tests/unit/login-form.test.tsx` > «sin parametro de vuelta el campo oculto viaja vacio», mas
   los dos de descarte (externo, repetido) y el de montaje directo del formulario sin props.

**Mutacion 3 — devolver el agujero.** `login/page.tsx` vuelve a fabricar `/dashboard`:

```
× sin parametro de vuelta el campo oculto viaja vacio
× descarta un destino externo y el campo oculto queda vacio
× descarta un parametro repetido, que llega como lista y no como texto
```

**Tres rojos.** La red cubre las dos vias por las que el agujero volveria: la pagina y el valor por
defecto de la prop del formulario. No es un arreglo sin red.

---

## 6. Encargo 6 — el E2E (R21)

`e2e/permisos.spec.ts` **asierta**, no solo navega:

1. **Aterriza en `/inventario`**: `waitForURL` sobre `INVENTORY_ROUTE` (derivado de la constante,
   no escrito a mano) **y** `expect(getByTestId('inventario-title')).toBeVisible()`.
2. **Menu corto**: `nav-inventario` visible; `toHaveCount(0)` sobre `nav-dashboard`, `nav-pedidos`,
   `nav-proveedores`, `nav-produccion` **y** `nav-produccion-recetas`. Sobre `data-testid`, nunca
   sobre clases CSS.
3. **404 al pedir `/pedidos` por URL**: `expect(response?.status()).toBe(404)` sobre la respuesta
   real de `goto`, mas `private-not-found` visible, mas cuatro palabras prohibidas comprobadas en
   el copy (`permiso`, `rol`, `autoriz`, `pedido`), mas `private-logout` alcanzable **desde el 404**.

El rol es el **`Operador` real del seed**, no un fixture: si falta, el `beforeAll` falla con mensaje
explicito pidiendo el seed. Usuario y empresa efimeros con prefijo propio `qc75_e2e_`, limpieza
defensiva por edad para no pisar al otro proyecto. Corre en Chromium y WebKit.

La descripcion vieja de la ficha («404 en inventario») era imposible y esta corregida en R21, con
la contradiccion anotada en `requirements.md > Preguntas abiertas 2` sin reabrir la decision 9.
Correcto.

---

## 7. Encargo 5 — el borde (R16, R17, R18), verificado sobre el diff

Con `git diff origin/dev...HEAD`, no de palabra:

- **`lib/composition/route-role-rules.ts` y `lib/modules/identity/domain/route-role-rules.ts`:
  borrados enteros** (62 y 48 lineas). `lib/modules/identity/index.ts` pierde los dos exports.
- **`route-guard-middleware.ts`**: desaparecen el `import { ROUTE_ROLE_RULES }` y el
  `rules: ROUTE_ROLE_RULES` de la llamada; `readSession` devuelve
  `{ kind: 'authenticated', sub: claims.sub }` **sin `roleName`**. Ningun corte por nombre de rol.
- **`route-access.ts`**: `RouteAccessSession` sin `roleName`, `RouteAccessInput` sin `rules`,
  `RedirectReason` sin `'forbidden'`, sin `isAllowedByRules`, politica renumerada a cuatro pasos.
- **`middleware.ts` no aparece en el diff**: intacto, como decia el design.
- **Firma, caducidad y empresa siguen**: `sessionTokenVerifier.verify` mas `isSessionExpired`, y el
  esquema de `domain/session-claims.ts` exige la empresa (`cid`) para que el contenido firmado sea
  valido, asi que una cookie sin empresa o mal formada cae a `anonymous`. Lo cubre el bloque «la
  empresa firmada y el portero de rutas (QC-48)», que sigue verde.
- **`ROUTE_ROLE_RULES` / `RouteRoleRule` / `findRouteRule` fuera de `specs/` y `progress/`**: solo
  quedan como **asercion de ausencia** en `tests/unit/identity/route-access.test.ts` («el dominio
  no menciona roles ni reglas ruta-rol»). Eso no es una mencion viva, es la guardia que lo impide.
- **R18**: `tests/guards/guard-middleware-edge.test.ts` **no esta en el diff**. Sigue recorriendo
  el cierre de imports desde `middleware.ts` con su lista de paquetes prohibidos
  (`node:crypto`, `crypto`, `@prisma/client`, `next/headers`) y el cliente Prisma compartido, y
  esta verde. El helper nuevo vive en la misma carpeta que el middleware pero **no** entra en su
  cierre de imports.
- La relajacion de `guard-autorizacion-por-permiso.test.ts` se limita a **retirar las dos anclas
  que exigian que la lista y el `claims.roleName` siguieran existiendo**. El barrido, los cinco
  modulos de negocio, los patrones prohibidos y el ancla de `identity` como dueño del literal del
  rol no se tocan. Correcto: mantenerlas habria dejado la guardia roja por vigilar codigo borrado.

---

## 8. Encargo 2 — los imports por ruta profunda: deuda aceptable, y ademas la forma correcta

Las ocho paginas importan
`@/lib/modules/identity/adapters/driving/require-page-permission` en vez del barrel de `identity`.
**No es hallazgo**, por tres razones que estan por escrito en el repo:

1. **`docs/architecture.md` lo declara explicitamente** (seccion de la regla de dependencias):
   «**Excepcion:** los adaptadores driving NO pasan por el barrel; la UI los importa por su ruta
   exacta (`@/lib/modules/<m>/adapters/driving/...`), porque un barrel mezclaria ese codigo de
   servidor con el contrato puro y lo arrastraria al cliente». Y la tabla de dependencias autoriza
   a `app/**` a importar `.../adapters/driving/**`.
2. **El barrel de `identity` no puede exportarlo.** Su primera linea dice: «Regla: solo reexporta
   de ./domain. Nada de 'use server', nada de Prisma, nada de `next/*`». `requirePagePermission`
   importa `next/navigation` y `@/lib/composition`: meterlo en el barrel romperia esa regla y
   arrastraria `next/navigation` a todo el que importe el contrato de `identity`.
3. **Es el patron ya establecido para este mismo modulo**: `login-form.tsx` importa `loginAction`
   y `LOGIN_INITIAL_STATE` por la misma ruta profunda desde QC-9/QC-10. No se inaugura una forma
   nueva que cueste deshacer: se sigue la que el repo ya tiene.

Lo que el centinela de `inventario` prohibe es otra cosa: la ruta profunda **al dominio o a los
driven** de otro modulo, que es lo que la tabla de dependencias marca en rojo. Aqui no ocurre.
Cinco archivos (ocho paginas) con la misma forma correcta no son deuda: son consistencia.

---

## 9. Encargo 4 — el 404 (R7, R8, R9), verificado en el codigo

- **Sale de `app/(private)/not-found.tsx`**, dentro del route group, asi que Next lo renderiza
  dentro de `app/(private)/layout.tsx`.
- **Se dispara desde cada `page.tsx`**: las ocho llaman a `requirePagePermission`, que delega en
  `assertPermission(user, permission, () => notFound())`.
- **NUNCA desde el layout**: `app/(private)/layout.tsx` **no contiene la palabra `notFound`**
  (leido entero). El motivo esta razonado en los comentarios del layout y del `not-found.tsx`.
  El E2E lo sostiene de forma indirecta pero real: si el corte se moviera al layout, el 404 saldria
  pelado y `private-logout` no estaria en pantalla, y el paso 5 se pondria rojo. Ver menor M1.
- **R9**: `pantallas-exigen-permiso` corre las ocho paginas con el conjunto de permisos vacio y las
  ocho responden 404; `private-layout-menu` demuestra que en ese estado el menu queda vacio **y el
  pie con cerrar sesion sigue ahi**. La salida existe: nadie queda encerrado.
- **Limite conocido** (`design.md > 2.3`, repetido en el fuente): una URL que no casa con ninguna
  ruta declarada (`/inventario/loquesea`) la resuelve el limite raiz, fuera del layout privado.
  Esta **declarado y justificado** en el design, con su alternativa descartada (el catch-all
  `[...slug]` capturaria tambien las URLs publicas). Aceptado, no es hallazgo.

---

## 10. Mutaciones — resumen

| # | Mutacion | Resultado | Simetrico correcto |
|---|---|---|---|
| 1 | `page.tsx` del dashboard importa `@/lib/composition` **y** un modulo cualquiera | **ROJO**, con los dos literales nombrados | arbol real, verde |
| 2 | Borrado el corte por permiso del dashboard | **ROJO** en el caso positivo del centinela **y** en `guard-pantallas-exigen-permiso` | arbol real, verde |
| 3 | `login/page.tsx` vuelve a fabricar `/dashboard` | **ROJO**, 3 casos de `login-form.test.tsx` | arbol real, verde |
| 4 | El layout pasa `PRIVATE_NAV_ITEMS` sin filtrar | **ROJO**, 2 casos de `private-layout-menu` | arbol real, verde |
| 5 | `requirePagePermission` deja de cortar | **ROJO**, 3 + 20 casos (`require-page-permission`, `pantallas-exigen-permiso`) | arbol real, verde |
| 6 | `filterNavItemsByPermissions` deja de borrar el grupo vacio | **ROJO**, 9 casos entre `nav-filtrado` y `private-layout-menu` | arbol real, verde |
| 7 | Pagina nueva `app/(private)/zzztemp/page.tsx` sin el corte | **ROJO**, guardia R20 con el nombre del archivo y como arreglarlo | arbol real, verde |

Todas revertidas. `git status` limpio, `typecheck` y `lint` verdes al terminar la revision.

---

## 11. Hallazgos

### Bloqueantes

**Ninguno.**

### Menores

**M1 — `menor`. No hay guardia ejecutable de que el layout privado nunca llame a `notFound()`.**
La decision cerrada nº 3 depende de que el corte viva en la pagina y no en el layout. Hoy eso lo
sostienen (a) comentarios extensos en `app/(private)/layout.tsx` y `app/(private)/not-found.tsx`,
y (b) el E2E, que caeria si alguien lo moviera. Ninguna guardia de fuente lo afirma. Un
`expect(fuente de layout.tsx).not.toContain('notFound')` en
`tests/unit/navegacion/qc75-convenciones.test.ts` —que ya tiene la ruta del layout en su lista de
archivos congelados— cerraria el hueco en una linea y lo cazaria en `--rapido` en vez de en el
E2E. No bloquea: la propiedad esta cubierta, pero por el test mas caro y mas tardio.

**M2 — `menor`, operativo. El E2E de la ficha corre contra una base propia del worktree.**
El `.env` del worktree apunta a `QuimiCloude_QC75`, creada, migrada y sembrada para esta rama (el
`.env` esta gitignorado; ningun secreto aparece en el diff). El spec **depende del seed** para el
rol `Operador` y sus permisos de QC-74. Al correr `./init.sh` completo o el E2E fuera de este
worktree, esa base tiene que estar sembrada con QC-6/QC-74 o `permisos.spec.ts` fallara — con
mensaje explicito, eso si (`el rol 'Operador' no existe: correr el seed`). Es dato para el leader,
no un defecto del codigo.

**M3 — `menor`, prosa. `docs/checkpoints-proyecto.md > Permisos` quedo desfasado respecto de esta ficha.**
`docs/architecture.md` se actualizo bien («las paginas exigen su permiso en el servidor, antes de
leer o pintar datos»), pero `CHECKPOINTS.md` sigue diciendo «Paginas protegidas validan permisos en
el servidor via `cookies()`». Se cumple en sustancia —`requirePagePermission` resuelve la sesion,
que sale de la cookie— pero la frase nombra un mecanismo que la pagina ya no toca directamente, y
que el propio `dashboard-route-contract` le **prohibe** nombrar. No es de esta ficha arreglar
`CHECKPOINTS.md`; se anota para que no se lea como contradiccion en la siguiente revision.

### Datos, no hallazgos

- **`tests/unit/composition/identity-facade.test.ts`**: la bitacora lo reporta cayendo por
  `Test timed out in 5000ms` bajo carga y pasando en aislado, sin estar en
  `tests/baseline-rojos.json`. El reviewer **no lo cruzo** (no corrio la suite completa), asi que
  no lo confirma ni lo desmiente. La decision sobre el baseline es del humano.
- `catalog-line-sheet.test.tsx` y `supplier-page.test.tsx`: ruido conocido, ya en el baseline
  (QC-58). No se reporta como hallazgo.
- Higiene del diff: los finales de linea se corrigieron antes de llegar aqui, asi que lo revisado
  son 65 archivos de cambio real, sin ruido de CRLF.

---

## 12. Veredicto

**APROBADO.**

Sin bloqueantes. Los 22 requisitos estan trazados a tests que prueban lo que dicen —abiertos uno a
uno, no leidos del mapa—, las 16 tasks estan cerradas, las diez decisiones cerradas se respetan, la
relajacion del centinela del dashboard esta acotada a una linea concreta y cerrada por los dos
lados (colador y vacuidad), el agujero de R11 que destapo el E2E tiene red de regresion en dos
capas que se verifico rompiendola, el borde quedo sin `ROUTE_ROLE_RULES` conservando firma,
caducidad y empresa y sin tocar la base, y el E2E asierta de verdad las tres cosas que R21 pide.
Los tres menores son mejoras, no condiciones.

Pendiente del leader: `./init.sh` completo en verde antes del PR.
