# QC-35 — pantalla-de-pedidos · revision

> Zona `frontend` · complejidad `high` · rama `feature/QC-35-pantalla-de-pedidos`
> Worktree: `.worktrees/QC-35-pantalla-de-pedidos` · HEAD `72b8912`
> Revisado el 2026-09-07. El reviewer NO edita codigo: verifica y reporta.

## 1. Veredicto

**RECHAZADO.** Vuelve al implementer.

La feature esta bien construida —la trazabilidad es real, no decorativa; las decisiones cerradas se
respetan; no entro ninguna dependencia; las guardias de recetas quedaron falsables— pero **la rama
tiene 6 tests en rojo en HEAD**, y la bitacora afirma lo contrario. La causa es la misma que ya se
resolvio bien para recetas, aplicada solo a 2 de las 5 guardias que esta feature invalida.

## 2. Checklist

| # | Punto | Resultado |
| --- | --- | --- |
| 1 | Trazabilidad R1-R49 -> test | **PASA.** 37/49 verificados abriendo el test y leyendo la asercion; 12 comprobados a nivel de mapa/nombre. Cero tests vacios, cero mapas rotos |
| 2 | Las 33 decisiones cerradas | **PASA.** Ver seccion 4 |
| 3 | `components/shared/data-table/` de QC-55 | **PASA en (a) y (b), FALLA en (c)** — ver M1 |
| 3a | Props opcionales, ausencia = comportamiento de antes | **PASA.** `searchable?: boolean` (default `true`) y `defaultPinnedColumns?: readonly string[]` (default vacio). El cambio de `readPersistedPinning` a devolver `null` es neutro sin defecto: el `persisted ?? {left:[],right:[]}` reproduce el `EMPTY_PINNING` de antes |
| 3b | Ningun test de QC-55 modificado ni borrado | **PASA, comprobado sobre el diff.** `git diff --numstat origin/dev...HEAD -- tests/unit/shared/`: `+55/-0` y `+91/-1`. La UNICA linea eliminada es el `import` de vitest (ampliado con `beforeEach`). `--diff-filter=DR` vacio en toda la rama: ningun archivo borrado ni renombrado |
| 3c | Suite de QC-55 entera y verde | **FALLA.** 12 passed / 1 failed, 146/148 — ver M1 |
| 4 | Guardias de recetas ajustadas el 2026-09-07 | **PASA. Falsabilidad comprobada por mi, no por la bitacora** — ver seccion 3 |
| 5 | Autorizacion | **PASA.** La pantalla no aporta ni repite autorizacion (R6, test con `unauthorized`: ni una fila, ni el correlativo, ni la receta). `ORDERS_ROUTE` en `PRIVATE_ROUTE_PREFIXES` una sola vez y regla ruta->rol restringida a `ADMIN_ROLE_NAME`, con centinela de lista exacta ampliado 3->4 sin relajarse |
| 6 | Multiplataforma | **PASA.** `describe.each` sobre angosto y ancho con `tests/helpers/viewport.ts`, sin excepcion de escritorio. Scroll contenido: el unico `.overflow-x-auto` del DOM es el `table-container`; nadie usa `w-screen`, `100vh`, `h-screen` ni `overflow-x` en linea sobre `html`/`body`. 44x44, 16 px de fuente y nada revelado por `:hover` |
| 7 | Ninguna dependencia nueva | **PASA.** `git diff origin/dev...HEAD -- package.json pnpm-lock.yaml` vacio. Doble via en test: ni la feature toca el manifiesto, ni su contenido difiere del de `dev` |
| 8 | E2E, dos recorridos, Chromium y WebKit | **PASA por inspeccion.** `e2e/pedidos.spec.ts` cubre R48 (alta -> lista -> cancelar con motivo -> motivo en la fila, con asercion contra Postgres) y R49 (no-Administrador acaba en el dashboard, no en el login, y cero datos). `playwright.config.ts` declara `chromium` y `webkit`. **No lo ejecute yo** (requiere `.env` y base): lo confirma el leader en el `./init.sh` completo |
| — | Tasks en `tasks.md` | 64 `[x]`, **1 sin marcar**: el `./init.sh` completo que corre el leader. Es justamente lo que habria cazado M1 |
| — | `typecheck` | **verde**, cero errores |
| — | `lint` | **verde**, sin salida |
| — | `pnpm run test:rapido` | verde (69 archivos, 773 tests + 15 guardias, 157) — **pero es un verde falso**, ver M2 |
| — | `pnpm exec vitest run` (suite completa) | **ROJO: 3 archivos, 6 tests** |

## 3. Las guardias de recetas: falsabilidad comprobada por mi

El ajuste del 2026-09-07 (criterio estructural «una pantalla se reconoce por tener ruta propia»)
**no las desdento**. Mute el arbol real, corri las dos guardias y restaure; `git status` limpio
despues de cada mutacion. Las cuatro prohibiciones caen:

| Mutacion | Resultado |
| --- | --- |
| Segunda pantalla: `app/(private)/pedidos/recetas/page.tsx` | **ROJO en las DOS** («segunda pantalla de recetas fuera de su carpeta») |
| Archivo suelto sin ruta propia: `app/(private)/recetas-suelto.tsx` | **ROJO en las DOS** («no cuelga de ninguna pantalla con ruta propia»). Valido: no existe `app/(private)/page.tsx`, asi que `screenRootOf` devuelve nulo de verdad |
| `components/recipe-card.tsx` | **ROJO** en `scope.test.ts` («componente de recetas bajo components/»). `components/` sigue prohibido del todo |
| Import de las tripas: `@/lib/modules/recetas/domain/recipe-name` | **ROJO** en `module-contract.test.ts` («consume recetas por dentro») |
| Import de `adapters/driven/...` | **ROJO** en `module-contract.test.ts`, igual |

Ninguna es hallazgo. El criterio se deriva del arbol, sin lista blanca escrita a mano, y la carpeta
permitida se sigue derivando de `FORMULAS_ROUTE`.

## 4. Las 33 decisiones cerradas

Recorridas contra el codigo. Las que mas facil se incumplen, una a una:

- **Importes como cadena decimal, sin aritmetica**: **CUMPLE**. El precio escrito llega al
  `FormData` como esa misma cadena; la celda pinta `12.5000` sin perder ceros; los controles son
  `type="text"` con `inputMode="decimal"`; guardia de fuente sobre las 18 fuentes de la ruta que
  falla ante `parseFloat(`, `Number(order.x)`, `toFixed(` y `type="number"`, y que no muerde al
  `Number(raw)` de la paginacion. **Ninguna columna de total**, afirmado en positivo y en negativo.
- **Server Actions por ruta exacta, ningun `fetch` a API propia**: **CUMPLE**. Guardia con casos
  negativos; ningun route handler creado.
- **Sin `react-hook-form`**: **CUMPLE**. `<form action>` mas `useActionState`, validado con
  `createOrderSchema` y `updateOrderSchema` del contrato; `package.json` identico al de `dev`.
- **shadcn por CLI, ningun primitivo a mano**: **CUMPLE**. Cero cambios en `components/ui/` en todo
  el diff, y guardia sobre el diff que lo afirma.
- **Sin caja de busqueda y sin columna de total (salieron a QC-68)**: **CUMPLE**. La caja no se
  pinta inerte: **no existe en el DOM**, y ninguna navegacion escribe `search` en la URL.
  `buildOrderListQuery` no emite nunca ese parametro, ni vacio.
- **Estado solo desde el formulario, nunca desde la lista**: **CUMPLE**. El alta no ofrece selector
  de estado y no envia el campo; la edicion ofrece `EDITABLE_STATUS_VALUES` y **nunca** `CANCELADO`;
  no hay control de estado en la fila.
- **Entregado y cancelado deshabilitan en vez de dejar intentarlo**: **CUMPLE**. Los tres controles
  quedan `disabled`, con el motivo pintado y localizable por `data-testid` —no por `title`, que no
  existe en tactil—, y los dobles de los tres enganches **lanzan** si alguien los llama: no se les
  llama.
- Resto (una sola ruta, panel lateral, selector de receta al servidor, selector de unidad sin alta,
  orden por cuatro cabeceras, filtros de estado/prioridad/rango, correlativo fijado, tamanos 10 y
  25, constante unica en `lib/shared/routes.ts`, item en «Operacion», toast heredado, tres estados,
  datos por props, asserts sobre roles/testid y nunca sobre copy): **CUMPLEN**.

## 5. Hallazgos

### MAYORES (bloqueantes)

**M1 — La rama tiene 6 tests en rojo en HEAD, y son de esta ficha.**
`pnpm exec vitest run` sobre el worktree: `Test Files 3 failed, 218 passed (221)` y
`Tests 6 failed, 2579 passed (2585)`.

| Archivo | Caso en rojo |
| --- | --- |
| `tests/unit/shared/data-table-alcance.test.ts` | ningun archivo bajo app/, lib/modules/, db/ o e2e/ importa components/shared/data-table |
| `tests/unit/shared/data-table-alcance.test.ts` | e2e/ no contiene ninguna referencia a data-table |
| `tests/unit/pedidos/scope.test.ts` | no hay ninguna pagina, componente ni ruta de pedidos bajo app/ o components/ (R57) |
| `tests/unit/pedidos/scope.test.ts` | no hay ningun spec E2E nuevo, y el diferimiento esta declarado en el spec (R57) |
| `tests/unit/pedidos/scope.test.ts` | ningun archivo de app/ ni de components/ importa el modulo pedidos (R57) |
| `tests/unit/pedidos/module-contract.test.ts` | las Server Actions viven en UN SOLO archivo driving, y no hay ninguna ruta HTTP ni pantalla |

**No son ajenos a esta ficha.** Los dispara el codigo que QC-35 crea, y los mensajes lo dicen:
«`app/(private)/pedidos/components/order-columns.tsx` no debe importar components/shared/data-table
todavia (migrar es QC-56, R34)» y «`app/(private)/pedidos` no debe existir».

Es **exactamente la misma situacion** que las dos guardias de recetas: son centinelas de LIMITE DE
ALCANCE de QC-34 (R57, «la pantalla no es esta ficha») y de QC-55 (R34 y R36, «ninguna pantalla lo
consume todavia»), y su premisa la derriba la decision humana del 2026-09-06 que hace de QC-35 el
primer consumidor de la tabla compartida y la pantalla de pedidos. El implementer detecto y trato
ese patron en 2 de las 5 guardias afectadas, y dio las otras 3 por verdes sin correrlas.

Para levantarlo: el mismo trato que recibieron las de recetas —**invertir y retensar, no borrar ni
aflojar**, con la fecha y quien lo decide en el comentario—, y lo decide el humano, no el
implementer por su cuenta. Lo que esos casos protegen de verdad y tiene que seguir en rojo: que
`components/shared/data-table` no se copie ni se importe por ruta profunda —hoy solo
`order-table.tsx` lo importa, y por el barrel—, que no aparezca ningun route handler de pedidos, que
las Server Actions sigan viviendo en un solo archivo driving, y que la pantalla no entre en
`lib/modules/`.

**M2 — El gate completo nunca se corrio, y el rapido da un verde falso.**
`pnpm run test:rapido` pasa (773 tests mas las 157 aserciones de las 15 guardias) **porque
`vitest related` no puede relacionar esos tres archivos**: recorren el disco con `node:fs` y no
tienen ninguna arista en el grafo de imports. La lista de archivos que `test:rapido` selecciono
—visible en su propia salida— no incluye ninguno de los tres. La regla 5 de `CLAUDE.md` existe para
esto: `./init.sh` completo **antes de cada PR, sin excepcion**, y es la unica task que sigue sin
marcar en `tasks.md`. Mientras M1 siga abierto, ese gate no puede terminar en verde.

### MENORES

**m1 — La bitacora afirma verde algo que esta rojo.** Seccion 4:
`pnpm exec vitest run tests/unit/shared/ -> 13 passed (13), 148 passed (148)`, y seccion 6.1: «su
suite sigue entera en verde (13 archivos, 148 tests)». Lo real hoy es `1 failed, 12 passed (13)` y
`2 failed, 146 passed (148)`. Tambien la seccion 1: «el unico rojo que queda es de otra sesion». No
es un fallo de codigo, pero es la clase de afirmacion que hace que el reviewer exista: si no se
corre, no se afirma.

**m2 — `module-contract.test.ts` es mas estricto que el criterio que declara.** Un `page.tsx` o
`layout.tsx` fuera de la carpeta de formulas que mencione recetas **en codigo** se marca como
«segunda pantalla» aunque tenga ruta propia, porque la rama de `basename` se evalua antes que
`screenRootOf`. Hoy no molesta —`app/(private)/pedidos/page.tsx` no menciona recetas—, pero manana
un `page.tsx` de pedidos que pase el nombre de una receta lo pondria rojo sin que nada este mal.
Yerra del lado estricto, asi que no bloquea; conviene dejarlo anotado.

**m3 — Desviacion 1 de la seccion 7 de la bitacora** (no se puso `pattern` en los campos decimales
porque `DECIMAL_14_4` no lo exporta el contrato publico y escribirlo a mano seria la segunda copia
que R33 prohibe): **correcta y bien argumentada**. Se acepta.

### AJENO a esta ficha (no es hallazgo)

**a1 — `./init.sh --rapido` aborta con «faltan specs para features sdd en vuelo: QC-48».** Es un
punto ciego del arnes: corrido dentro de un worktree, `scripts/validate-features.mjs` no ve
`.worktrees/`, y el spec de QC-48 vive en el worktree de otra sesion. Ni es de QC-35 ni lo arregla
QC-35. Los pasos se corrieron a mano (`typecheck`, `lint`, `test:rapido`) y ademas la suite completa.

## 6. Que falta para aprobar

1. Resolver **M1**: decision humana sobre las tres guardias de alcance de QC-34 y QC-55 cuya premisa
   QC-35 invalida, y aplicarla invirtiendo y retensando cada caso —nunca borrandolo—, con la fecha y
   el motivo en el comentario, como ya se hizo con las de recetas.
2. Corregir las secciones 1, 4 y 6.1 de `progress/impl_QC-35-pantalla-de-pedidos.md` con la salida
   real (**m1**).
3. Correr `./init.sh` completo y que termine en verde, y cerrar la ultima task de `tasks.md`
   (**M2**). El bloqueo de `feature_list.json` por QC-48 (**a1**) lo destraba el leader, no esta
   ficha.

Nada de esto toca la pantalla: el codigo de producto de QC-35 se revisa **correcto**.
