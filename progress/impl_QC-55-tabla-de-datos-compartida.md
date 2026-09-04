# QC-55 — tabla-de-datos-compartida · bitacora de implementacion

Rama `feature/QC-55-tabla-de-datos-compartida`, worktree
`.worktrees/QC-55-tabla-de-datos-compartida/`. Spec aprobado por el humano el 2026-09-04 (F1.4).

## T0 — Base heredada verificada (2026-09-04)

Comprobado uno por uno sobre el worktree ya sincronizado con `origin/dev`:

1. **`components.json`** presente (`style: base-nova`, alias `utils: @/lib/utils`) y
   `lib/utils.ts:4` exporta `cn`. **OK**
2. **`components/ui/table.tsx`** presente, con `div[data-slot=table-container]` y
   `overflow-x-auto`. **No se re-crea.** **OK**
3. **Primitivas**: `skeleton.tsx`, `dropdown-menu.tsx`, `select.tsx`, `button.tsx`,
   `input.tsx` ya estaban. **Faltaba `popover.tsx`** — anadida por CLI en T2 junto con
   `calendar.tsx`.
4. **`vitest.config.mts`** presente. **Matiz respecto a `tasks.md`**: no es un `include`
   unico, son **tres `projects`** (`ui` jsdom para `tests/**/*.test.tsx` y `tests/ui/**`,
   `node` para el resto de `tests/**/*.test.ts`, `integration` en serie). Consecuencia para
   esta feature: los tests con DOM tienen que llamarse `.test.tsx`, y los puros `.test.ts`.
   `pnpm test` arranca. **OK**
5. **`tests/helpers/viewport.ts`** exporta `setViewportWidth`, `resetViewport`,
   `NARROW_VIEWPORT` (375) y `WIDE_VIEWPORT` (1280). **OK**
6. **`lib/shared/pagination.ts`** exporta `DEFAULT_PAGE_SIZE` (10) y `MAX_PAGE_SIZE` (25).
   **OK**

Ningun punto obligo a parar.

## T1 — Dependencias

`docs/dependencias.md` **ya traia las dos filas** (`@tanstack/react-table` y
`react-day-picker`), escritas por el leader al aprobar el spec (commit `2ba085f`), asi que
esta task se limito a instalar.

- `pnpm add @tanstack/react-table` -> **`^9.2.4`**. Verificado en el paquete instalado que
  `columnPinningFeature` y `rowSortingFeature` existen entre sus exports.
- `react-day-picker` **`^10.0.1`** la instalo el CLI de shadcn en T2, como manda la decision 6.
- `@tanstack/react-store`, `date-fns` y `@date-fns/tz` quedan como **transitivas sin fila**
  (decision 14): ninguna esta en `dependencies` directas.
- `pnpm exec vitest related --run tests/guards/guard-dependencias-aprobadas.test.ts` -> **2
  passed**.

## T2 — Primitivas por CLI

`pnpm exec shadcn add calendar popover` (CLI **4.16.2**, el que el repo ya fija en
`package.json`). Genera `components/ui/calendar.tsx` y `components/ui/popover.tsx`.
`button.tsx` NO se sobrescribio (se respondio `no` al prompt).

### Desvio que necesita ratificacion humana (ver «Bloqueos» al final)

El registro de shadcn **hoy** emite `import { cn } from "cn"` en vez de
`import { cn } from "@/lib/utils"`, y el CLI anade a `package.json` **dos entradas directas
nuevas mas**: `cn@^0.2.5` y `date-fns@^4.4.0`. Las dos chocan de frente con **R31** («las
UNICAS dependencias directas nuevas ... y NO DEBE incorporar ninguna otra entrada directa
nueva en el manifiesto»), y `cn` ademas **falla el check 3** de salud.

Resuelto asi, y anotado, no escondido:

- **`date-fns` desinstalada de `dependencies` directas.** Ningun archivo la importa
  (`grep date-fns components/ui/` -> ninguno); el CLI la declara solo porque la entrada de
  registro de `react-day-picker` la lista. Sigue disponible como transitiva. **Consecuencia
  para T9**: pnpm aisla por defecto, asi que `import ... from 'date-fns'` desde codigo del
  repo **no resolveria** sin ser directa. Los tres atajos se escriben con aritmetica nativa
  de `Date` en vez de `subWeeks`/`subMonths`/`subYears` — desvio consciente de
  `design.md > 6.1`, tomado porque **R31 es requisito y §6.1 es un «como»**.
- **`cn` desinstalada de `dependencies` directas**, y en los dos archivos generados se
  normalizo el especificador del import a `@/lib/utils` — que es literalmente el alias
  `utils` que declara `components.json` y lo que ya hacen los otros 16 archivos de
  `components/ui/`. Es la unica linea tocada de cada archivo generado; el resto es CLI puro.
