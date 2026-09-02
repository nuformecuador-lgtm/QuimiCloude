# QC-12 — dashboard-en-blanco · review

> Reviewer · 2026-09-02 · worktree `.worktrees/QC-12-dashboard-en-blanco/`, rama
> `feature/QC-12-dashboard-en-blanco` (HEAD `4439c66`, ya con `origin/dev` mergeado — incluye QC-6).
> Verificado ejecutando, no leyendo la bitácora. **`./init.sh` lo corre el leader** (indicación
> expresa); aquí se corrieron typecheck, lint y la **suite completa** de Vitest.

## Veredicto

**OK.** Cero hallazgos bloqueantes. Cuatro notas menores, ninguna devuelve la feature.

---

## Checklist

### Especificación
- [x] `requirements.md` con R1–R12 EARS numerados, sin saltos.
- [x] `design.md` con alternativas descartadas y su porqué (A–F, seis).
- [~] `tasks.md`: T0–T8 en `[x]`. **T9 sigue en `[ ]`** — es la task del leader (gate completo +
      PR) y está declarada como tal en el propio archivo. Se marca al cerrar. Ver hallazgo M4.

### Trazabilidad
- [x] Los 12 requisitos mapean a un test **que existe y pasa**. Verificado nombre a nombre contra
      los `it(...)` reales de los dos archivos, no contra la tabla de la bitácora.
- [x] `progress/impl_QC-12-dashboard-en-blanco.md` contiene el mapa `R<n> → test` y la salida real.

| Req | Test verificado | Archivo | Sustancia (no es un test vacío) |
| --- | --- | --- | --- |
| R1 | `la pantalla del dashboard se renderiza dentro del armazon privado` / `la pagina vive en la ruta que declara DASHBOARD_ROUTE` | page / contract | `toContainElement` sobre `private-content` del layout real; `existsSync` de las 3 rutas derivadas |
| R2 | `presenta exactamente un encabezado de primer nivel` | page | `getAllByRole('heading',{level:1})` === 1 **y** identidad con el testid |
| R3 | `el area de contenido se renderiza vacia…` | page | `children` 0, `textContent` vacío, 6 roles de contenido a 0 |
| R4 | `no anade landmarks…` | page | línea base con hijo neutro + comparación; `main` === 1 y el título dentro de ese `main` |
| R5 | `declara un titulo de documento propio que incluye la marca` | page | assert sobre `BRAND_LABEL` importado, no sobre copy |
| R6 | `la pantalla no consulta datos, red ni cookies` | contract | 6 tokens prohibidos × 2 fuentes, comentarios excluidos |
| R7 | `la pantalla y su componente de ruta se renderizan en servidor` | contract | 4 tokens × 2 fuentes + barrel |
| R8 | `la pantalla no valida sesion ni protege la ruta` | contract | `redirect`, `next/headers`, `getSessionUser` |
| R9 | `el componente de ruta se expone por el barrel…` | contract | barrel exporta; la página importa `./components` y **no** ruta profunda |
| R10 | `la ubicacion de la ruta se deriva de DASHBOARD_ROUTE…` | contract | ruta construida desde la constante; ausencia del **valor** de la constante en la fuente |
| R11 | `el item Dashboard de la navegacion apunta a la misma constante…` | contract | exactamente 1 `NavLink` con `href === DASHBOARD_ROUTE` + guardia negativa |
| R12 | `renderiza titulo y area de contenido en viewport angosto y en ancho` / `no usa 100vh ni hover como unica via` | page + contract | 375 y 1280 px con el helper de QC-11; unidad de viewport y `hover:` + ocultar |

Ningún test de la tabla es cosmético: todos afirman sobre roles ARIA, `data-testid` o constantes
exportadas, y los negativos (R3, R4, R6–R8, R10–R12) se pondrían rojos ante la regresión que
vigilan.

### Calidad de código (ejecutado por el reviewer)
- [x] `pnpm run typecheck` — limpio.
- [x] `pnpm run lint` — limpio.
- [x] **Suite completa** de Vitest — **37 archivos, 391 tests, 391 pasando**, 18.6 s. Sin regresión
      en QC-11 (`private-layout`, `app-sidebar`, `sidebar-desktop`, `sidebar-mobile`), QC-15
      (guardias de arquitectura) ni QC-6.
- [x] E2E: no aplica, **diferido a QC-13 con motivo escrito** (`design.md > 8`, T8). No hay flujo
      crítico: la ruta no tiene sesión ni mutación.
- [x] Multiplataforma: cumple; ver D1 más abajo.
- [x] Dependencias: no aplica; ninguna añadida.

### Datos y seguridad, módulos hexagonales, permisos, configuración
- **NO APLICAN**, y están declarados uno por uno en la bitácora (T7), no omitidos. Comprobado
  contra el diff: cero tablas, cero migraciones, cero RLS, cero secretos, cero webhooks, cero
  módulos, cero Server Actions, cero variables de entorno. La guardia de R6 lo hace cumplir hacia
  adelante.
- La ruta **no protegida** hasta QC-13 es decisión cerrada del humano (2026-09-02), no hallazgo.

---

## Los seis puntos que el leader pidió comprobar en concreto

**1. Trazabilidad completa — CUMPLE.** Tabla de arriba; los 12 mapean a tests que existen y pasan.

**2. Feature puramente aditiva — CONFIRMADO POR MÍ, no dado por bueno.**
El diff con nombre y estado contra el merge-base (`f1484ef`) devuelve **nueve archivos, todos `A`;
ningún `M`, ningún `D`, ningún `R`**; 1285 inserciones y 0 borrados:

- `app/(private)/dashboard/page.tsx`
- `app/(private)/dashboard/components/dashboard-content.tsx`
- `app/(private)/dashboard/components/index.ts`
- `tests/unit/dashboard-page.test.tsx`
- `tests/unit/dashboard-route-contract.test.ts`
- `progress/impl_QC-12-dashboard-en-blanco.md`
- `specs/QC-12-dashboard-en-blanco/{requirements,design,tasks}.md`

No se tocó `app/(private)/layout.tsx`, `app/(private)/components/`, `components/private/*`,
`components/ui/sidebar.tsx`, `lib/shared/navigation/private-nav.ts`, `lib/shared/routes.ts` ni
`app/page.tsx`. El riesgo principal de la ficha (repetir el choque features 4↔10) **no se
materializó**.

**3. Sin `main` anidado — CUMPLE, verificado por tres vías.** (a) Búsqueda sobre las tres fuentes:
la etiqueta sólo aparece en dos líneas de **comentario** de `page.tsx`, nunca en JSX; el contenedor
exterior es un `div`. (b) El test de R4 renderiza la pantalla **dentro de `PrivateLayout` real** y
afirma `getAllByRole('main')` con longitud 1, más que el título vive dentro de ese único landmark.
(c) El test de QC-11 `el contenido de la pantalla se renderiza dentro de un unico main` sigue verde
en la suite completa. El área de contenido tampoco es `role="region"`, así que el test negativo de
landmarks de QC-11 no se ve afectado: la comparación contra la línea base da igualdad exacta.

**4. Sin ampliación de alcance — CUMPLE.** `dashboard-content.tsx` es literalmente un `div` con
`data-testid="dashboard-content"` y clases de espaciado: sin hijos, sin props, sin texto.
`page.tsx` son ocho líneas de JSX: un `h1` y el contenedor. Ni tarjetas, ni KPIs, ni `loading.tsx`,
ni `error.tsx`, ni empty state ilustrado. La alternativa B de `design.md > 7` queda respetada y R3
la vigila en negativo.

**5. Componentes de ruta con barrel — CUMPLE.** `app/(private)/dashboard/components/` con
`index.ts` que reexporta `DashboardContent`, e import desde `./components` (nunca ruta profunda),
como exige `docs/architecture.md > Componentes > Regla: componentes de ruta en components/ con
barrel index.ts`. La tensión con `> Regla: sin sobre-ingenieria` está razonada en `design.md > 7.A`
en vez de colarse por inercia — correcto.

**6. Ninguna dependencia nueva — CUMPLE.** El diff acotado a `package.json`, `pnpm-lock.yaml`,
`components.json` y `docs/dependencias.md` devuelve **cero archivos**. No se ejecutó `shadcn add`.
La guardia `guard-dependencias-aprobadas` pasa en la suite completa.

---

## Juicio de las cuatro cosas que el implementer declaró

### D1 — T5: la verificación visual no la hizo nadie con los ojos → **ACEPTABLE CON NOTA**

No es bloqueante y **no hace falta declarar excepción en `design.md`**. La cláusula de excepción de
`docs/architecture.md > Regla: multiplataforma` cubre *usar algo que sólo funciona en escritorio*;
aquí no se usa nada de eso, y eso **sí** está verificado objetivamente y no de vista: sin unidad de
alto de viewport fija (guardia de fuente), sin `:hover` como vía única (guardia de fuente), sin
controles interactivos — luego sin targets táctiles ni inputs con zoom en iOS —, espaciado
mobile-first `p-4 md:p-6`, ancho fluido sin anchos fijos, y presencia del título y del área a
**375 px y 1280 px** en jsdom, que es donde el sidebar de QC-11 cambia de mecanismo (768 px). A eso
se suma el HTML realmente servido, con 200 y un solo landmark principal. Declarar una excepción de
escritorio aquí sería además **falso**: no hay ninguna.

**La nota:** el criterio de hecho de T5 pedía literalmente emulación de dispositivo y eso no se
hizo; el implementer lo dijo en vez de firmar una comprobación que no existió, que es la conducta
correcta. Queda como **verificación humana pendiente**, ya anotada en la bitácora, y el leader
debería trasladarla a `progress/current.md > Deudas y cosas abiertas` junto a la deuda de E2E. Para
una pantalla con un `h1` y un contenedor vacío, el riesgo residual es de los más bajos posibles.

### D2 — `vitest related` no enlaza `dashboard-route-contract.test.ts` → **ACEPTABLE CON NOTA (menor)**

Es un límite conocido del patrón de guardias de fuente, **no un agujero introducido por QC-12**, y
ya existía en el repo: `tests/unit/identity/login-action.test.ts` y
`tests/unit/identity/logout-action.test.ts` leen fuentes con `readFileSync` exactamente igual. Dos
atenuantes que verifiqué en `scripts/test-rapido.mjs`: (a) mientras la rama viva, la selección se
calcula sobre el diff contra `origin/dev`, que **incluye el propio archivo de test**, así que hoy
sí entra; el hueco sólo se abre **después del merge**, para cambios futuros bajo
`app/(private)/dashboard/`; (b) el gate completo lo corre siempre, y es obligatorio antes de todo
PR (regla 5 de `CLAUDE.md`).

**La nota, para el leader, no para esta feature:** `test:rapido` corre *siempre* todo lo que casa
con el patrón `guard`. Si estas guardias de fuente se llamaran `guard-…` o vivieran en
`tests/guards/`, quedarían cubiertas también en modo rápido sin cambiar una línea del arnés. Es una
mejora que afecta a tres archivos preexistentes además de éste, y por tanto **no se le exige a
QC-12**: candidata a `/afinar-regla`.

### D3 — R4 medido contra línea base del layout → **ACEPTABLE (sin reservas)**

Es lo que T3 pedía textualmente («respecto al layout solo») y es **más fuerte**, no más laxo, que
comparar contra ceros: si mañana QC-11 añadiese legítimamente un landmark propio, el rojo aparece
en el archivo de QC-11 y no aquí, que es donde debe aparecer. Además el assert del landmark
principal **sí** es absoluto (longitud 1), que es el invariante que de verdad protege R5 de QC-11,
y se añade que el título vive dentro de él. Bien resuelto.

### D4 — La guardia negativa de R11 va sobre *escribir* la navegación → **ACEPTABLE (sin reservas)**

Prohibir el import sería directamente **falso**: `page.tsx` importa `BRAND_LABEL` de `private-nav`
porque R5 lo exige, y una guardia que hay que borrar al primer cambio legítimo es una guardia
muerta. Lo que R11 protege —no modificar la colección de navegación ni sus constantes— queda
cubierto por las dos prohibiciones reales (`PRIVATE_NAV_ITEMS` y la redeclaración de constantes de
ruta) más la parte positiva, que es exacta: **exactamente un** `NavLink` con
`href === DASHBOARD_ROUTE`. Y la prueba dura de que la navegación no se tocó no es la guardia sino
el diff, que verifiqué: cero archivos modificados. Nota sin acción: una guardia de fuente no puede,
por construcción, impedir que otra feature edite `private-nav.ts`; ese invariante lo sostiene la
parte positiva del test, y lo sostiene bien.

---

## Hallazgos

**Bloqueantes: ninguno.**

- **M1 · menor** — Verificación visual en navegador real con emulación de dispositivo pendiente
  (T5). Declarada por el implementer, no oculta. Acción sugerida al leader: anotarla en
  `progress/current.md > Deudas y cosas abiertas`. No condiciona el merge.
- **M2 · menor** — Tras el merge, el modo rápido del gate podría no seleccionar
  `tests/unit/dashboard-route-contract.test.ts` ante cambios en `app/(private)/dashboard/`. Límite
  del patrón de guardias de fuente, **preexistente** (mismo caso en dos tests de `identity/`) y
  cubierto por el gate completo obligatorio antes de PR. Mejora del arnés, no de esta feature.
- **M3 · menor** — Deudas que la feature deja **escritas** y que el leader debe trasladar a
  `progress/current.md`: E2E diferido a QC-13, `/dashboard` sin protección de sesión hasta QC-13,
  el ítem «Dashboard» del sidebar lo reconecta QC-13, y `app/page.tsx` (raíz) sin dueño en el
  backlog (pregunta abierta **P1**). Ninguna es un agujero introducido aquí; todas estaban
  decididas antes de implementar.
- **M4 · menor** — `tasks.md > T9` sigue sin marcar porque es la task del leader (gate completo +
  PR). `CHECKPOINTS.md` exige todas las tasks en `[x]`: se cierra al terminar T9, no antes. Se
  anota para que no se pase por alto al marcar la feature `done`.

## Lo que queda del checklist y no depende del implementer

- `./init.sh` completo en verde — **lo corre el leader** (en curso en paralelo mientras se escribe
  esta revisión).
- Entrada en `progress/history.md`.
- Desmontaje del worktree (`./scripts/wt.sh done QC-12-dashboard-en-blanco`) o HOLD anotado con su
  razón.

## Veredicto final

**OK.**

La feature hace exactamente lo que su spec dice y nada más: tres archivos de producción, dos de
test, cero modificaciones a lo ajeno, cero dependencias, cero contenido inventado, un solo landmark
principal. Los 12 requisitos tienen test real y en verde, y la suite completa (391 tests) no
muestra ninguna regresión sobre QC-11, QC-15 ni QC-6. De las cuatro cosas que el implementer
declaró por su cuenta, dos son aceptables sin reservas y dos aceptables con nota; ninguna es
bloqueante. Pasa a T9 (gate completo y PR) en manos del leader.
