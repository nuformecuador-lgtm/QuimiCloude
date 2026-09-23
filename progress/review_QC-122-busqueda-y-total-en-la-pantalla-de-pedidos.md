# review QC-122 — busqueda-y-total-en-la-pantalla-de-pedidos

> Reviewer, 2026-09-23. Rama `feature/QC-122-busqueda-y-total-en-la-pantalla-de-pedidos`, HEAD `372d2e62`.
> Alcance revisado: solo búsqueda (R1–R16, R25 a/c/d, R26) + R27 (ampliación). R17–R24 y R25 (b)
> retirados en F1.4 (van a QC-151).

## Veredicto: RECHAZADO

3 bloqueantes, 5 menores.

## Checklist

| # | Punto | Estado |
|---|---|---|
| 1 | Trazabilidad `R<n>` -> test que muerde | **NO**: R12 sin test real (B2); R27 con un caso sin cubrir que además falla (B1) |
| 1b | Retirados sin código | OK: el diff de `app/` no tiene `ingredientsCost` ni importe ni formateador; `order-columns.tsx`, `order-list-skeleton.tsx` y `order-list-empty.tsx` sin cambios |
| 2 | Tasks `[x]` | **NO**: T6 abierta (cierre del leader). T5 está marcada `[x]`, pero su «Hecho» pide los dos navegadores y WebKit está rojo (B3) |
| 3 | CHECKPOINTS | Especificación OK (design con alternativas descartadas A, B, C, D). El mapa en la bitácora OK. `./init.sh` completo: lo corre el leader. E2E: rojo en WebKit |
| 4 | Verificación ejecutada por mí | `vitest run tests/unit/pedidos-ui` + `guard-e2e-landing` + `guard-contrato-listados`: 28 archivos, 388 pasan y 3 skip. E2E `pedidos-busqueda` en Chromium: 4/4 pasan. **E2E en WebKit: 0/4** (los 4 con timeout en `waitForURL` después de `fill`) |
| 5 | Seguridad y capas | OK: sin tablas, sin RLS nueva, sin secretos, sin endpoints nuevos. La consulta sigue en `listOrdersAction` (QC-68) |
| 6 | Multiplataforma | OK: caja `min-h-11 text-base` (compartida); «Limpiar la búsqueda» `min-h-11 min-w-11`; sin `100vh` ni `:hover` |
| 7 | Dependencias | OK: `package.json` sin cambios |
| 8 | Aislamiento por empresa | No aplica (no hay modelo ni consulta nuevos). El E2E usa una empresa efímera |
| 9 | Comentarios en producción | OK: ninguna línea añadida en `app/` cita `QC-`, `R<n>`, `design.md` ni «decisión cerrada». Un bloque largo (m1) |
| — | `components/shared/**` sin diff | OK (`git diff e8bd02cb HEAD -- components/ lib/ db/ package.json` vacío) |
| — | Guardias o tests sustituidos, no relajados | OK: «la pantalla todavia no busca…» -> bloque de `q` (R4–R7); «la caja de busqueda NO existe (R20)» -> R1/R2/R8/R3/R10–R12/R15. No se relajó ninguna guardia de `tests/guards/` (sin diff). `order-columns.test.tsx` intacto |
| — | E2E sin red y con `loginAndLand` | OK: Prisma local, empresa efímera, `loginAndLand`, limpieza en `afterAll` y de huérfanos |

## Hallazgos

### B1 — BLOQUEANTE: después de «Limpiar la búsqueda», la caja deja de seguir a la URL (R27, y R15 a medias)

`order-table.tsx`: `clearing` pasa a `true` en `handleClearSearch` y **solo** vuelve a `false`
dentro de `handleParamsChange`. Las dos ramas de `OrderListSection` (con coincidencias y sin
ellas) dejan `OrderTable` en la misma posición del árbol, así que la instancia sobrevive y
`clearing` se queda en `true` hasta que el usuario vuelve a interactuar con la tabla. Mientras
tanto `visibleParams` fuerza `search: ''` y `page: FIRST_PAGE` sobre **cualquier** `params` que
llegue del servidor.

Reproducción (comprobada con un test temporal de componente, que borré después):
buscar X sin coincidencias -> «Limpiar» -> llega la lista sin `q` -> «Atrás» del navegador (llega
`params.search = 'x'`, `page: 2`). `lastSearch` detecta el cambio externo y remonta, pero con
`visibleParams.search` vacío: **la caja queda vacía** con la URL en `q=x`, y el paginador se pinta
en la página 1 mientras la lista es la de la página 2.
`expect(caja).toHaveValue('x')` -> `Received: ''`.

Falta: que `clearing` deje de mandar en cuanto llega el eco de la limpieza (o cualquier
`params.search` distinto), no solo cuando la tabla emite, y un test en `order-table.test.tsx`
que cubra «Limpiar y luego un cambio externo de `params`» (debe estar rojo sin el arreglo).

### B2 — BLOQUEANTE: R12 no tiene un test que lo compruebe

El mapa asigna R12 a `order-table.test.tsx` > «aria-busy, rotulo de carga, sin esqueleto, y la misma
caja con foco y texto». Ese caso **retiene** la navegación y nunca la suelta: solo comprueba
`aria-busy` a `false` antes y a `true` durante. Nada comprueba que, cuando llega la lista nueva, se
sustituyan las filas y se retiren la atenuación, `aria-busy` y el rótulo de carga. T2 lo pedía
explícitamente («y al soltarlo desaparecen (R12)», patrón de `supplier-page.test.tsx`, que sí
comprueba `aria-busy` a `false` al final). Ningún otro test de `pedidos-ui` lo cubre.

Falta: soltar la navegación retenida (o terminar la transición) y comprobar `aria-busy="false"`,
que ya no están ni `opacity-60` ni `ORDER_TABLE_TEXTS.loading` y que las filas son las nuevas.

### B3 — BLOQUEANTE: el E2E nuevo está rojo en WebKit (R25 a, c, d; R26; R27)

`pnpm run e2e e2e/pedidos-busqueda.spec.ts --project=webkit`: **4 failed**, los cuatro con
`TimeoutError: page.waitForURL: Timeout 60000ms exceeded` justo después del primer
`searchBox.fill(...)` (líneas 252, 271, 297 y 371). En Chromium, en la misma máquina y la misma
sesión, pasan 4/4, así que no es el entorno. Es la trampa ya conocida y documentada en
`e2e/proveedores.spec.ts:499` y `e2e/recetas.spec.ts:408`: lo escrito antes de hidratar no emite
la búsqueda, y WebKit hidrata tarde. Esos specs envuelven el vaciado, el `fill` del término y el
`waitForURL` en `expect(...).toPass()`, y este no. `playwright.config.ts` declara WebKit, T5 exige
«en verde en los dos navegadores» y el propio `design.md > 8` dice «Chromium y WebKit». T5 está
marcada `[x]` sin haberlo cumplido (la bitácora lo reconoce: «solo Chromium»).

Falta: esperar a la hidratación o reintentar el primer `fill` como en proveedores y recetas, y
pegar en la bitácora la salida verde de los dos proyectos.

### m1 — menor: bloque de comentario largo en producción

`order-table.tsx`, el bloque sobre `pendingSearches` tiene 8 líneas (la regla habla de ~5). El
porqué ya está en `design.md > 4.1`. Se puede quedar en 2 o 3 líneas.

### m2 — menor: comentario viejo que el diseño mandaba sustituir

`tests/unit/pedidos-ui/order-list-section.test.tsx:403` dice que `search` va «siempre vacio».
`design.md > 7` lo lista entre lo que se sustituye y sigue ahí, ahora falso.

### m3 — menor: R15 («conserva los filtros») no se afirma en el test de la sección

El caso de `clearHref` comprueba `page`, `pageSize` y `sort`, pero no pasa ningún filtro (`status`,
`priority`, fechas). El código lo conserva por el spread; el test no lo prueba.

### m4 — menor: citas de fichas en comentarios de tests

`e2e/pedidos-busqueda.spec.ts:4-6` (cabecera con R25 a, c, d; R9; R26 y QC-151), el comentario de
`order-table.test.tsx` que cita `supplier-page.test.tsx > R14`, y el `describe` de
`order-sheet.test.tsx` con QC-122 en el nombre. `docs/conventions.md > Comentarios`: en tests,
`R<n>` va en el nombre del caso, no en comentarios, y la ficha no va en ninguno de los dos.

### m5 — menor: detalles del E2E

- Línea 236: `companyId` repetido en la misma guarda.
- Tras `waitForURL` se lee `visibleOrderNumbers` en el acto (líneas 256, 301, 386). La URL puede
  cambiar antes de que se pinte la lista nueva. Mejor `expect.poll`, como en `proveedores.spec.ts`.
- R10 («atenuada»): ningún test afirma `opacity-60` en pedidos. Se puede cubrir junto con B2.

## Trazabilidad (vigentes)

| R | Test | Muerde |
|---|---|---|
| R1 | order-table > caja existe (R1) | sí |
| R2 | order-table > (R2, R8) página 1; order-list-params > withSearchResetsPage (R2) | sí |
| R3 | order-table > (R3); E2E R25 a | sí |
| R4 | order-list-params > (R4); order-sheet > (R4) | sí |
| R5 | order-list-params > (R5), 3 casos | sí |
| R6 | order-list-params > (R6) | sí |
| R7 | order-list-params > (R7) + tope atado a `createListQuerySchema` | sí |
| R8 | order-table > (R8) | sí |
| R9 | order-sheet > (R9); E2E R25 d | sí (Chromium) |
| R10, R11 | order-table > en vuelo (R10, R11, R12) | sí (sin opacidad, m5) |
| R12 | ninguno | **no** (B2) |
| R13, R14 | order-list-section > sin coincidencias | sí |
| R15 | order-list-section > clearHref; order-table > Limpiar | sí (filtros sin afirmar, m3) |
| R16 | order-list-section > (R16) | sí |
| R25 a, c, d y R26 | e2e/pedidos-busqueda.spec.ts | Chromium sí, **WebKit rojo** (B3) |
| R27 | order-table > (R27), 3 casos; E2E R27 | parcial: no cubre «tras Limpiar», y ahí falla (B1) |
| R17–R24, R25 b | retirados, sin test ni código | OK |
