# QC-58 — timeout-tests-ui-bajo-carga · requirements.md

> **Zona** `frontend` · **Complejidad** `medium` · **depends_on** ninguna · **Rama**
> `feature/QC-58-timeout-tests-ui-bajo-carga`
>
> **Alcance.** Dejar la batería de tests estable bajo carga atacando las **dos** causas medidas:
> el **plazo**, que sube de 5000 a 15000 ms en los **tres** proyectos de Vitest (`ui`, `node`,
> `integration`), y la **forma de teclear**, que pasa a tener una sola definición compartida sin
> retardo entre teclas. Y **vaciar del baseline** las tres entradas que están ahí por esta causa,
> que es lo que hace que el arreglo cuente.
>
> **Lo que NO entra.** Rehacer ninguna pantalla ni sus reglas. Las dos entradas del baseline que
> están por el motivo estructural del rango de git (`recetas-ui/recipe-route-contract`,
> `recetas/module-contract`) **no se retiran** —son otro problema—, solo se corrige su motivo. La
> colisión de correlativo en la base de integración → **QC-77**. Bajar los workers de Vitest está
> **descartado y medido**: no lo cura (`docs/verification.md`).
>
> *Sembrado por `/afinar-feature` el 2026-09-07. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.*

## Requisitos (EARS)

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

**Ninguna.** Las seis que había al acotar las cerró el humano el 2026-09-07 y están en la tabla de
abajo.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
| --- | --- | --- |
| 2026-09-07 | ¿Hasta dónde llega el plazo nuevo? | **Los tres proyectos**, no solo `ui`. El fallo se midió el mismo día en `ui` (`proveedores-ui/catalog-line-sheet`, tecleando) y en `node` (`composition/identity-facade`, que **no teclea nada** y murió en `await import('@/lib/composition')`, cargando el barril que arrastra los cinco módulos y el cliente de Prisma). La causa es contención de CPU y no distingue de proyecto |
| 2026-09-07 | ¿A cuánto sube el plazo? | **De 5000 a 15000 ms.** El coste aceptado, y es el único: un test colgado de verdad tarda 15 s en reportarse en vez de 5. No cambia si un test pasa o falla, solo cuánto se espera para saberlo |
| 2026-09-07 | ¿Cómo se arregla la forma de teclear? | **Una sola definición compartida**, sin retardo entre teclas, importada desde los 33 archivos que hoy llaman `userEvent.setup()` (224 llamadas, de las que solo 2 pasan opciones). Lo que se gana **no** es evitar tocar los 33 archivos —hay que tocarlos, con un cambio mecánico de una línea cada uno—: es que exista **un** sitio donde está escrito cómo se teclea en este repo, en vez de 224 llamadas sueltas donde la 225ª volverá a nacer mal. Promueve a compartido el precedente que ya existe a mano en `tests/unit/recetas-ui/recipe-form.test.tsx:201` |
| 2026-09-07 | ¿Y el test que necesita retardo de verdad? | **`tests/unit/async-autocomplete.test.tsx` conserva el suyo** (`delay: 20`), que está puesto **a propósito** para probar el debounce del autocomplete. Se pide explícitamente y queda declarado, en vez de romperse en silencio bajo un cambio global. **No** se reescribe con relojes falsos: eso es trabajo de diagnóstico que esta ficha no tiene |
| 2026-09-07 | ¿Qué cuenta como prueba? | **Cinco corridas seguidas de la batería completa, las cinco verdes.** La ficha decía «varias veces» y sin número el reviewer no puede verificar nada. Hereda el criterio de `docs/verification.md` (2026-09-04): **una corrida verde no es prueba** cuando el fallo es intermitente — es exactamente la lección que costó el diagnóstico fallido de los workers |
| 2026-09-07 | ¿Qué se lleva del baseline? | **Las tres de esta causa**: `unit/inventario/product-page`, `unit/proveedores-ui/catalog-line-sheet` y `unit/proveedores-ui/supplier-page`. Las dos estructurales se quedan, **con su motivo corregido**: el de `recipe-route-contract` hoy **miente**, porque falla por la migración de QC-35 que aparece en el diff, no por el rango de git vacío que dice su nota |
| 2026-09-07 | ¿Cambia la `zone`? | **No, sigue `frontend`**, aunque ahora toque la configuración de los tres proyectos. Cambiarla a `fullstack` dispararía la partición en dos fichas (`AGENTS.md > Particion de fullstack`), que no tiene sentido para un arreglo de configuración |
| 2026-09-07 | ¿La colisión de correlativo entra aquí? | **No: es QC-77.** `order-repository.int.test.ts` falla con «Ya existe la llave (order_year, order_sequence)», y eso es **estado residual** en la base compartida, no plazo. Son causas distintas y mezclarlas haría que ninguna de las dos se pueda dar por probada |

### El terreno medido antes de especificar (2026-09-07)

Datos tomados en el worktree, sobre `af5d258`. No son requisitos: son el suelo del que parte
`spec_author`, para que no los vuelva a medir.

- **224 llamadas a `userEvent.setup()` en 33 archivos.** Solo 2 pasan opciones: la excepción
  deliberada de `async-autocomplete.test.tsx:248` y el precedente de `recipe-form.test.tsx:201`.
- **`vitest.config.mts` no fija `testTimeout` en ningún proyecto**: los tres corren con el default
  de 5000 ms, que es literalmente el número del error.
- **Reparto de los tres proyectos**: `ui` 50 archivos (jsdom), `node` 156, `integration` 27 (en
  serie, con `fileParallelism: false`).
- El proyecto `ui` monta `setupFiles: ['./tests/setup.ts']`, que hoy solo importa
  `@testing-library/jest-dom/vitest`.
- **El gate del 2026-09-07 pasó las cinco entradas del baseline** y avisó «5 por limpiar». Que
  pasen una corrida **no** es prueba de que el flake esté muerto: es justo el error que la tabla
  de arriba convierte en criterio de cinco corridas.
