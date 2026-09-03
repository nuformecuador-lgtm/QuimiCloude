# QC-22 — pantalla-de-productos · review

> Reviewer, 2026-09-03. Worktree `.worktrees/QC-22-pantalla-de-productos/`, rama
> `feature/QC-22-pantalla-de-productos`, 27 commits sobre `dev`. **Veredicto: APROBADO**
> (0 hallazgos bloqueantes; 4 menores, anotados abajo).
>
> Nota de entorno confirmada: Vitest en este worktree no carga `.env` por si mismo. Todo lo que
> sigue se corrio tras exportarlo a mano.

## Checklist

| Punto | Resultado |
| --- | --- |
| `specs/QC-22-*/requirements.md` con EARS numerados R1-R32 | OK |
| `design.md` con alternativas descartadas y su porque (A-G) | OK |
| `tasks.md` con todas las tasks marcadas | **NO**: T16 y T19 siguen sin marcar — ver menor 1 |
| Cada requisito mapea a al menos un test concreto | OK, 32/32 (verificado por muestreo con mutacion) |
| `progress/impl_*.md` contiene el mapa Rn -> test | OK (T17, con la mutacion y el estado de cada requisito) |
| `pnpm run typecheck` / `pnpm run lint` | OK (dentro del gate) |
| `./init.sh` completo | **VERDE, corrido por el reviewer**: 92 archivos, 1014 tests, `== init OK ==` |
| E2E de flujo critico | Spec escrito (`e2e/inventario.spec.ts`), **nunca ejecutado** — declarado, ver menor 1 |
| Multiplataforma | Sin `100vh`, sin hover como unica via, targets 44x44 y campos a 16px por clase; **la comprobacion de scroll anidado en WebKit/iOS que la regla exige sigue pendiente (T16)** |
| Dependencias | **Ninguna añadida**: `package.json` y `pnpm-lock.yaml` no aparecen en el diff contra `dev`; `docs/dependencias.md` sin cambios; P2 resuelta en negativo |
| Datos y seguridad (RLS, migraciones, down.sql, secretos, webhooks) | **NO APLICA**, declarado en tasks.md e impl > T18. Verificado: el diff no toca `db/` |
| Modulos hexagonales | OK. `lib/modules/inventario/` sin una sola linea tocada. `guard-arquitectura-modulos` y `guard-middleware-edge` verdes |
| Permisos | OK: corte de ruta en middleware (R4) mas `requireAdmin` en los casos de uso de QC-20 (R5). La pantalla no repite ninguna decision |
| Componentes privados por props / Server Actions | OK (R30, R28, con guardia de fuente) |
| Configuracion | OK: nada que cambie entre entornos; unica constante de ruta en `lib/shared/routes.ts` |
| Ruido en el diff | Ninguno: 40 archivos, sin andamios, sin temporales, sin reescrituras completas de archivos ajenos |

## Trazabilidad verificada por mutacion (no por lectura de la bitacora)

Ocho mutaciones reales aplicadas sobre el codigo y revertidas con `git checkout`; arbol limpio
despues de cada una. Los cinco requisitos que el encargo señalaba como los mas faciles de falsear
estan entre ellas.

| Mutacion | Resultado |
| --- | --- |
| **R9** — el `overflow-x-auto` sube al contenedor de `product-list-section.tsx` | **ROJO** en `product-page.test.tsx` (el desbordamiento y ningun ancestro) y en `product-route-contract.test.ts` |
| **R9** — el primitivo `components/ui/table.tsx` pierde su `overflow-x-auto` | **ROJO** en `product-page.test.tsx`: el test no da por bueno el envoltorio, comprueba su clase |
| **R31** — las acciones de fila pasan a `hidden ... hover:flex` | **ROJO** en la guardia de fuente de hover/100vh/tamanos |
| **R22** — se quita el `Toaster` del layout privado | **ROJO** en `private-layout.test.tsx` (el invertido) y en `product-route-contract.test.ts` |
| **R4** — la regla pasa a admitir tambien Operador | **ROJO** en 3 casos: `route-role-rules.test.ts` (dos) y `route-access.test.ts` |
| **R7** — la columna del nombre concatena `createdBy` | **ROJO** en `product-page.test.tsx` y en la guardia de fuente |
| **R5/R16** — el estado de error se pinta como estado vacio | **ROJO** en los dos casos de R16 y en el de R5 |
| Centinela del barrel: `hooks/mal-factoria.ts` importa una factoria | **ROJO**, nombrandola. El caso legitimo (esquema zod) queda **verde** |

Conclusion: los tests muerden. **No se encontro ningun requisito marcado como verificado en la
bitacora que no lo estuviera.** Los dos huecos que la bitacora declara (la mitad de R31 que jsdom
no observa, cubierta por guardia de fuente; y R9 en WebKit mas el E2E, pendientes de T16) estan
bien declarados y no se presentan como verdes.

## Las cuatro superaciones de decisiones de features cerradas

1. **`tests/unit/private-layout.test.tsx` (QC-11 R36/D9 -> R22).** Invertido, no borrado. Conserva
   la mitad vigente (un solo `main`, la region no dentro del `main`, ningun landmark
   status/alert/log nuevo) y añade el conteo de **exactamente una** region aria-live, que es lo
   unico que delataria un Toaster duplicado. Fecha y motivo escritos dentro del test y dentro del
   layout. **Muerde** (mutacion R22 de arriba).
2. **`tests/unit/sidebar-mobile.test.tsx` (QC-11 R30).** El cambio es de granularidad del marcado
   de Base UI, con la causa tecnica explicada dentro del test y fechada. **La linea que de verdad
   protege R30 —el `main` no consultable con el panel abierto— sigue intacta.** Comprobado que el
   bloque sigue mordiendo: con `modal={false}` en el Sheet movil de `components/ui/sidebar.tsx` el
   test enrojece y el `main` vuelve a quedar expuesto. Revertido.
3. **`tests/unit/inventario/scope.test.ts` (QC-20 R34).** Invertido con fecha y motivo. No se
   ablando: ahora exige que la pantalla exista, que viva entera bajo su carpeta de ruta, que
   `components/` siga sin una sola pieza de catalogo y que la lista de specs E2E de catalogo sea
   cerrada. El patron se amplio a `inventario` porque sin eso media guardia no miraba nada. El
   primer caso (R29, sin route handlers) queda intacto.
4. **`tests/unit/inventario/schema/inventario-schema.test.ts` (QC-24/QC-20).** Acotado de la forma
   del import a lo que se importa: enrojece traerse una **factoria de caso de uso** fuera de
   `lib/composition`. La lista de las nueve **se deriva del barrel** por el tipo `...Deps` hermano,
   con un centinela sobre el derivador que impide el falso verde si el parseo dejara de encontrar
   nada; ademas cierra dos huecos que la version anterior tenia (import multilinea e import de
   espacio de nombres). Verificado a mano: factoria desde `hooks/` -> rojo; esquema zod -> verde.

**Correccion de arquitectura.** `ROUTE_ROLE_RULES` vive en `lib/composition/route-role-rules.ts`.
`guard-arquitectura-modulos.test.ts` y `guard-middleware-edge.test.ts` estan verdes (dentro del
gate y corridos aparte). El doble de `tests/unit/identity/route-guard-middleware.test.ts` **aplica
de verdad**: reapuntando el `vi.mock` a un especificador inexistente caen exactamente 2 casos, los
dos de rol insuficiente, tal como el propio test deja escrito en su cabecera.

## Hallazgos

### BLOQUEANTES

Ninguno.

### menor 1 — T16 sin cerrar y `pnpm run e2e` nunca ejecutado

`tasks.md` deja **T16** (verificacion manual en navegador, con WebKit/iOS para el scroll anidado de
R9) y **T19** (gate y PR) sin marcar. `e2e/inventario.spec.ts` esta escrito y pasa typecheck y
lint, pero no ha visto un navegador. Hoy eso incumple dos casillas de `CHECKPOINTS.md`: todas las
tasks marcadas, y la parte de la regla multiplataforma que exige comprobar el **scroll anidado en
iOS** antes de darlo por bueno (el `design.md` no declara excepcion, a proposito).

**No se clasifica como bloqueante y no vuelve al implementer** por dos razones: (a) esta declarado
sin adornos en `tasks.md > T16`, en `impl > T15` y en `impl > T17`, es decir no hay nada marcado
como verificado que no lo este; (b) sus dueños son el humano (T16) y el leader (T19), no el
implementer. **Condicion explicita para pasar a done:** T16 en verde en WebKit real o simulador y
`pnpm run e2e` verde en Chromium y WebKit, con la base limpia tras la corrida. Si el scroll anidado
falla en WebKit, la propia T16 obliga a arreglarlo, no a declarar excepcion de escritorio.

### menor 2 — la guardia de R31 mide por archivo, no por control

`product-route-contract.test.ts` exige que un archivo que renderice controles **contenga**
`min-h-11`, y que un archivo con campos **contenga** `text-base`. Es presencia, no cobertura.
Comprobado: quitando las dos constantes del campo entero de `product-form.tsx` (linea 387, que pasa
a `text-sm`) **la suite sigue verde** — los cuatro campos enteros del formulario quedarian por
debajo de 44 px y a 14 px, y nada enrojece. El riesgo real hoy es bajo (los controles se pintan
desde componentes compartidos con una constante por archivo), pero la guardia no lo cubre y la
mitad tactil y tipografica de R31 acaba dependiendo de T16. Sugerencia para una ficha futura, no
para esta: afirmar por control en vez de por archivo.

### menor 3 — dos guardias de fuente son mas anchas de lo que su requisito pide

- R13 prohibe el texto `filter(` en todo archivo de la ruta. Hoy no molesta, pero prohibe de paso
  `Array.prototype.filter`, que es legitimo y no tiene nada que ver con ofrecer un buscador.
- R9 prohibe el texto `sticky` en todo archivo de la ruta, incluida una cabecera de tabla pegajosa
  **vertical**, que la regla de multiplataforma no prohibe: lo que se comporta distinto en WebKit
  es la horizontal.

Son deudas de mantenimiento: la proxima ficha que toque la pantalla se topara con un rojo que no
corresponde a ninguna regla real, y la tentacion sera ablandar la guardia. Queda anotado.

### menor 4 — el centinela de alcance dejara de valer con QC-45

`tests/unit/inventario/scope.test.ts` fija la lista de specs E2E de catalogo en exactamente
`inventario.spec.ts`. Es deliberado y correcto hoy, pero QC-45 (pantalla de presentaciones) lo
pondra rojo por construccion. Que quede dicho aqui para que entonces se lea como lo que sera —una
premisa caida, a invertir con fecha y motivo, igual que se hizo en esta ficha— y no como una
guardia que estorba.

## Observaciones (no son hallazgos)

- `private-nav.ts` **reexporta** `INVENTORY_ROUTE` en vez de redeclararla, para no tocar
  `tests/unit/app-sidebar.test.tsx`, que no esta entre los archivos que R32 autoriza. Hay una sola
  declaracion y el test de contrato lo vigila. Correcto.
- El literal de la ruta solo aparece, en codigo, en `lib/shared/routes.ts`; las demas apariciones
  del repo estan en comentarios. Verificado sobre `app/`, `components/`, `lib/`, `hooks/`, `e2e/`,
  `tests/` y `middleware.ts`.
- Los «no aplica» de `CHECKPOINTS.md` declarados en `impl > T18` se revisaron uno por uno y son
  correctos. En particular «Datos y seguridad» no aplica de verdad: el diff no toca `db/` y toda
  lectura pasa por las Server Actions de QC-20.
- `tests/unit/inventario/product-page.test.tsx` monta el `page.tsx` y el `layout.tsx` **reales** y
  solo dobla las seis Server Actions, que son el borde del modulo ajeno. No hay reimplementacion de
  la pantalla dentro del test.

## Veredicto

**OK — APROBADO.** 0 bloqueantes. Los 32 requisitos tienen test que muerde, el gate completo esta
verde de forma reproducible (92 archivos, 1014 tests), no entro ninguna dependencia,
`lib/modules/inventario/` no se toco, y las cuatro superaciones de decisiones ajenas se hicieron
invirtiendo o acotando con fecha y motivo dentro del test, sin ablandar lo que protegian.

**Condicion de merge, que no depende del implementer:** cerrar T16 (incluido el scroll anidado en
WebKit/iOS) y ejecutar `pnpm run e2e` en verde. Mientras esas dos no se cierren, la feature no
cumple `CHECKPOINTS.md` entero y no debe pasar a `done`.
