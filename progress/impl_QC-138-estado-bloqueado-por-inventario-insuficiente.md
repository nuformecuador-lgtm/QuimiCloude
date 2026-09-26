# QC-138 — estado-bloqueado-por-inventario-insuficiente · bitácora del implementer

Rama `feature/QC-138-estado-bloqueado-por-inventario-insuficiente`, worktree
`.worktrees/QC-138-estado-bloqueado-por-inventario-insuficiente`, sobre el spec aprobado el
2026-09-25 en F1.4 (commit `74929817`, que cierra P1-P10 y la pregunta 2 de la semilla con
D17-D27).

Alcance de esta tanda: **T0 a T4**. T5 en adelante no se tocan.

## T0 — Confirmar las respuestas de F1.4 y el estado de QC-168

**Estado:** hecha.

### Lo que quedó aprobado en F1.4

P1 a P10 se aprobaron tal como estaban propuestas, y con ellas las decisiones cerradas D17 a D27
de `requirements.md`. Las preguntas 2 y 3 también quedaron respondidas y aprobadas. La
**pregunta 1 sigue abierta** y no bloquea la implementación: el trabajo de T0 a T4 no depende de
su respuesta.

### R4, R12, R16, R20, R23, R27 y R31 son firmes

Los siete requisitos que la feature sostiene para el alcance de esta tanda se aprobaron con la
propuesta tal cual, sin reservas:

- **R4** — la señal de «no alcanza» sale de la reserva de material, no del coste.
- **R12** — un pedido que ya está en `EN_CURSO` no se bloquea: se rechaza con
  `insufficient_material` sin escribir nada.
- **R16** — la revisión de bloqueados ordena por `(created_at, id)` y usa el índice parcial de la
  segunda migración.
- **R20** — el disparo de la revisión son las dos operaciones de inventario que suben existencia.
- **R23** — un fallo de la revisión no hace fallar el alta ni el ajuste que la dispararon.
- **R27** — `BLOQUEADO` es cancelable.
- **R31** — el Operador ve el bloqueado con su etiqueta y un botón de entrar deshabilitado.

### Orden del enum

`ALTER TYPE ... ADD VALUE` solo añade al final, así que el orden lo fija el diseño y no la
migración. `BLOQUEADO` va **último**, después del último valor que haya en `dev` al rebasar.

## Estado de QC-168 al arrancar

QC-168 (los estados `POR_EMPACAR` y `EN_EMPAQUE`) **ya está en `dev`**, con su PR #129 mergeado
por merge commit, no por squash:

- `6b1cb4ee` — `Merge pull request #129 from singularis-co/feature/QC-168-estado-por-empacar`.
- `18fb9d92` — el commit de cierre de la feature en `dev`; verificado con
  `git merge-base --is-ancestor 18fb9d92 origin/dev`, que sale verdadero.
- La rama de esta feature ya trae ese `dev`: `origin/dev` (`0736e1ff`) es ancestro de `HEAD`
  (`c6cb590f`), comprobado con `git merge-base --is-ancestor origin/dev HEAD`. No hace falta otro
  `merge origin/dev` antes de seguir.
- El commit `c33e14d0` de esta rama es el merge de `origin/dev` dentro de la feature, no el de
  QC-168. No figura como ancestro de `dev` porque vive solo en la rama: es lo normal.

### Enum de partida

`OrderStatus` tiene seis valores y `EN_EMPAQUE` es el último:

```
PENDIENTE, EN_CURSO, POR_EMPACAR, EN_EMPAQUE, ENTREGADO, CANCELADO
```

La última migración en `dev` es `20260925120100_packing_permission`, así que las dos migraciones de
esta feature van después de ella, y separadas entre sí por el orden que exige el enum.

## Base de datos

**Pendiente antes del test de rollback de T1.** El `.env` de este worktree apunta a `QuimiCloude`,
la base compartida, y QC-168 estableció el precedente de no tocarla: esta feature necesita su
propia base, creada desde la plantilla de la rama, y hay que borrar esa base al cerrar la feature.
No hay `psql` en el `PATH` de esta máquina, así que la creación se hace con el cliente de Prisma.

## Tareas y commits

| Task | Estado | Commit |
|---|---|---|
| T0 decisiones de F1.4 y estado de QC-168 | [x] | este commit |
| T1 enum `BLOQUEADO`, mapas, cancelación, borrado, asignación, UI | [ ] | |
| T2 índice parcial de bloqueados | [ ] | |
| T3 `ReservationOutcome` distingue `insufficient` | [ ] | |
| T4 errores nuevos del catálogo | [ ] | |
| T5-T15 | fuera de alcance de esta tanda | |

`tasks.md` de esta feature no usa casillas de verificación: sus tareas son listas de
`**Depende de**`, `**Archivos**` y `**Hecho**`, igual que el de QC-168. El estado por tarea se
anota en esta tabla, que es donde se lleva el estado en el resto del repo.

## Desviaciones respecto de `tasks.md`, y por qué

1. **Matriz de transiciones: 7×7, no 5×5.** `tasks.md > T1 > Hecho` dice «la matriz 5×5 probada
   par a par: 25 casos», y `design.md > 4` titulara la matriz 5×5. Las dos están desfasadas: se
   escribieron antes de que QC-168 añadiera `POR_EMPACAR` y `EN_EMPAQUE`. Con el estado nuevo, la
   matriz es de siete estados por siete, o sea 49 pares. Se implementa y se prueba la de 49.

2. **Los tests de esquema van en un archivo nuevo.** `tasks.md > T1` y `> T2` nombran
   `tests/unit/pedidos/schema/pedidos-migration.test.ts`. Ese archivo es historia de QC-33, QC-34 y
   QC-60, y una parte lleva la marca de no tocarse. QC-168 resolvió exactamente este problema
   creando `tests/unit/pedidos/schema/order-packing-states-migration.test.ts`, su propio archivo
   para su propia migración. Se sigue ese precedente:
   `tests/unit/pedidos/schema/order-status-blocked-migration.test.ts` para las dos migraciones de
   esta feature, y `pedidos-migration.test.ts` queda intacto.

3. **`order-row-actions.tsx` y `company-orders-columns.tsx` se tocan solo si hace falta.** El
   diseño deja `delete-order.ts` sin cambios y trata los bloqueados como cancelables y borrables, lo
   que en varios de esos archivos no requiere edición. Se anotará archivo por archivo qué se tocó
   de verdad.

## Verificación

Por instrucción explícita, esta tanda **no** corre la suite completa ni `./init.sh`. Lo que se
corre, y lo que hay que dejar en verde antes de dar cada task por hecha:

- `pnpm run typecheck`
- `pnpm run lint`
- `pnpm exec vitest related --run <archivos tocados>`

Después de tocar `db/schema.prisma`, los artefactos se regeneran con `pnpm exec prisma generate` y
`pnpm exec next typegen`.
