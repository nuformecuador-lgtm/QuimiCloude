# QC-125 — espera-minima-por-paso · review

Rama `feature/QC-125-espera-minima-por-paso`, comparada contra `origin/dev` (`b625ca9d`).
Fecha: 2026-09-18. Reviewer: verificacion propia, sin editar codigo. Las mutaciones se hicieron
en caliente y se revirtieron con `git checkout`; el arbol quedo limpio.

## Veredicto de la primera vuelta: RECHAZADO (en la segunda: OK, ver «Segunda vuelta» al final)

Un bloqueante: R8 tiene un hueco real que un mutante plausible atraviesa en verde (H1). Falta un
test; el codigo de produccion no falla, porque la implementacion actual cumple R8.

## Checklist

| # | Punto | Estado |
| --- | --- | --- |
| 1 | Trazabilidad R1–R22 → test | **FALLA** en R8 (H1). R22 mapeado a un E2E existente pero **no verificado** (H3). El resto, verificado |
| 2 | Tasks en `[x]` | **FALLA**: T7 y T8 abiertas (H3, H4) |
| 3 | CHECKPOINTS | Ver abajo |
| 4 | Verificacion ejecutable | Parcial: `./init.sh --rapido` se para en `validate-features` por QC-68, que ya falla en `origin/dev` (H4). Pasos corridos a mano: verdes |
| 5 | Calidad y seguridad | OK: sin tablas, sin endpoints, sin secretos, sin configuracion cableada (el `5` es una regla de negocio fija, no depende del entorno) |
| 6 | Multiplataforma | OK: no se añade ningun control; el cronometro es un `span` dentro de un `p text-base`; ni `100vh` ni `:hover`; el test R26 de 44x44 sigue aplicando |
| 7 | Dependencias | OK: ni `package.json` ni el lockfile cambian |
| 8 | Aislamiento por empresa | No aplica: sin modelos nuevos y sin consultas |
| 9 | Comentarios | OK en lo bloqueante: ninguna linea añadida en `app/` ni en `components/` cita `QC-`, `R<n>`, `design.md` ni «decision cerrada». Menores en H6 y H7 |

### CHECKPOINTS.md

- Especificacion: requirements con R1–R22 en EARS, design con cinco alternativas descartadas: OK. Tasks todas en `[x]`: **NO** (T7, T8).
- Trazabilidad: el mapa existe en `progress/impl_QC-125-espera-minima-por-paso.md`; **R8 no queda cubierto del todo** (H1).
- `typecheck`: verde (lo corri yo). `lint`: verde (lo corri yo). `pnpm test`: no corri la suite completa, siguiendo el encargo; corri los 6 archivos afectados (135/135 verdes) y las 38 guardias (476 verdes, 5 omitidos).
- E2E de flujo critico: no aplica (no toca autenticacion, permisos, inventario, importes ni webhooks). El E2E heredado R29 de QC-63 es R22: sin ejecutar (H3).
- Multiplataforma: OK. Dependencias: no hay.
- Datos y seguridad, modulos hexagonales, permisos: no aplica (solo cliente, sin `lib/` ni `db/`).
- Configuracion: OK (`MIN_STEP_SECONDS` es una constante de modulo, y R4 prohibe que sea configurable).
- Verificacion final: `./init.sh` completo no verde en esta rama por H4; review OK: no; `history.md` y el desmontaje del worktree son del cierre del leader.

### Verificacion que corri yo

    pnpm exec vitest run step-reader, order-execution-screen, recipe-form, recipe-route-contract, countdown-timer, guard-editor-aislado
      Test Files 6 passed (6) · Tests 135 passed (135)
    pnpm run typecheck   -> exit 0
    pnpm run lint        -> sin problemas
    pnpm exec vitest run tests/guards
      Test Files 38 passed (38) · Tests 476 passed, 5 skipped (481)
    ./init.sh --rapido   -> feature_list.json invalido: faltan specs para features sdd en vuelo: QC-68

Mutaciones (revertidas):

| Mutacion | Resultado |
| --- | --- |
| `blocked = pending > 0` (sin la causa de tiempo) | 6 rojos en SR: R1, R7, R8 x2, R12, R13. Confirma lo que dice el implementer |
| `MIN_STEP_SECONDS = 4` | 3 rojos en OES: R4, R5, R18. Confirmado |
| Solo `key={arrival}` → `key={currentIndex}` | Mutante **equivalente**: `arrival` sube exactamente cuando cambia el indice, asi que las dos claves remontan igual. Ningun test puede ponerlo rojo; el «Hecho cuando» de T3 pedia algo imposible |
| «Cumplido = indice» en un escalar (`waitedArrival !== currentIndex`, `setWaitedArrival(currentIndex)`, `key={currentIndex}`) | **0 rojos** en SR y OES (57/57 verdes). Ver H1 |

## Hallazgos

### H1 — BLOQUEANTE · R8 sin cubrir en el recorrido que falla de verdad

Con «cumplido = indice» guardado en un escalar (la implementacion ingenua que `design.md > 4`
quiere descartar), los dos tests de R8 y todo SR y OES siguen verdes. Pero ese mutante **incumple
R8**: paso 1 cumplido → Siguiente → **Anterior enseguida, mientras corre la cuenta del paso 2** →
el paso 1 aparece ya cumplido: Siguiente habilitado y sin cuenta. Lo confirme con un test temporal
(borrado despues): **verde** con el codigo de la rama y **rojo** con el mutante, que falla en la
afirmacion de que `step-reader-next` esta deshabilitado.

El test de R8 existente no lo cubre porque solo retrocede **despues** de cumplir el paso 2, y en
ese punto el escalar ya apunta al paso 2. Ademas, el recorrido que cita `design.md > 4` («Anterior →
Siguiente antes de que acabe el paso 1») es imposible: Siguiente esta bloqueado mientras el paso 1
espera. La trampa real es la contraria: pulsar **Anterior antes de que acabe el paso actual** lleva
a un paso ya cumplido. R8 lo prohibe expresamente («el paso al que llega DEBE exigir de nuevo la
duracion completa aunque ya la hubiera cumplido antes»), y es justo lo que hace un operario cuando
se equivoca al avanzar.

**Que falta** (implementer, en `tests/unit/recetas-ui/step-reader.test.tsx`): un caso de R8 que
cumpla el paso 1, avance, pulse Anterior **sin dejar que se cumpla el paso 2** y afirme que en el
paso 1 Siguiente esta deshabilitado y la cuenta vuelve a `00:05`. Tiene que ponerse rojo con el
mutante del escalar descrito arriba. Ademas, corregir en `design.md > 4` el recorrido de la trampa
(o anotarlo en la bitacora) y cambiar el «Hecho cuando» de T3 por esta mutacion, porque la de solo
`key` es equivalente.

**Juicio sobre la declaracion 1 del implementer:** tiene razon en que la mutacion literal de T3 no
se puede detectar. **No** tiene razon en que R8 este cubierto: su test solo mata un mutante con un
`Set` de indices, y el mutante mas simple, un escalar, sobrevive.

### H2 — menor · El retorno temprano de `goNext` y `finish` no se ejercita aislado

Es cierto: React no despacha `onClick` en un `button` deshabilitado, asi que ningun test llega a la
guarda, y quitarla no pondria nada rojo. Es una defensa redundante con `disabled`, la misma que ya
tenia `goNext` antes de esta ficha. Lo que R12 y R13 exigen se ve desde fuera (con activacion
programatica no se avanza y no se llama a `onFinish` ni a la accion), y eso si esta afirmado.
**No hace falta un test**; queda anotado.

### H3 — menor (pendiente de cierre) · R22 no verificado, T7 abierta

El E2E `e2e/ejecucion-receta.spec.ts` (R29 de QC-63) no se ha corrido: faltan los navegadores de
Playwright en esta maquina. No se instalaron. Por el diseño, `click()` espera a que el boton se
habilite y deberia absorber 2 x 5 s, pero **no hay evidencia**. R22 queda **NO VERIFICADO** y T7
abierta. Hay que correrlo antes del PR en una maquina con navegadores, junto con
`e2e/recetas-pasos.spec.ts`. El gate no corre Playwright, asi que no lo va a detectar solo.

### H4 — menor (ajeno a la rama) · `./init.sh` se para en `validate-features` por QC-68

`origin/dev` tiene QC-68 en `in_progress` y sin `specs/QC-68-*` (el spec vive en su rama), asi que
el gate falla en el primer paso **aqui y en `dev`**. No lo causa esta rama, pero impide cerrar T8
con `./init.sh` verde. Corri typecheck, lint y las guardias a mano (verdes). El leader tiene que
resolverlo, o dejar anotado por que se da por bueno, antes de cerrar T8.

### H5 — menor · La enmienda de «si la operacion falla» deja el reloj falso sin `finally`

Llama a `vi.useFakeTimers()` y vuelve a reloj real a mitad del test, sin `try/finally`, cuando los
casos nuevos de OES si lo usan. Si algo falla antes de `useRealTimers()`, el reloj falso contamina
los tests siguientes del archivo. No afloja la afirmacion.

### H6 — menor · Cabecera larga en `countdown-timer.tsx`

El bloque de 20 lineas al principio del archivo supera las ~5 que marca `docs/conventions.md >
Comentarios`. Los motivos (fin por instante, `onEnd` en un ref, reinicio durante el render) son
ciertos y no citan fichas. Entro con el cherry-pick de `CountdownTimer`, que es parte del diff de
esta rama.

### H7 — menor · Limpieza de un comentario en el mismo commit que el codigo

En `goPrevious` se quito el `R15:` de un comentario preexistente dentro de `0d4754a7`, junto a
cambios de codigo. Es una linea y esta junto a lo que se toca, asi que es aceptable. Queda
anotado por la regla.

## Lo que se revisa y esta bien

- Las dos decisiones humanas se respetan: el test R18 de QC-63 pasa a lista cerrada con nota
  fechada (solo `step-reader.tsx`, y conserva el `skip` sin merge-base) y `CountdownTimer` no cambia
  de color ni de API respecto al commit incorporado.
- Opt-in de verdad: `recipe-form.tsx` no se toca; R2 (sin prop, 0, negativo, NaN) y R3 (sin
  cronometro en el modal, y Finalizar se pulsa sin esperar) estan cubiertos.
- `aria-describedby` con las dos causas y el texto de elementos sin cambios: el test heredado de
  QC-64, que compara la igualdad exacta, sigue verde.
- Los casos existentes de SR y OES no se editan, salvo los dos que el spec autoriza.
- No hay reloj propio en el asistente (R10): la fuente no contiene `setTimeout`, `setInterval` ni
  `Date.now`.

## Segunda vuelta (2026-09-18)

Solo se revisan los commits `d254384d`, `2ec1e6b7`, `17f3375c` y `61106e47` (diff contra
`20e4ba28`). No hay cambios de produccion: solo tests, spec y bitacora.

### Veredicto: OK

Sin bloqueantes. H1 queda resuelto; H5 tambien.

### Comprobaciones hechas por el reviewer

| Punto | Resultado |
| --- | --- |
| H1: caso nuevo «R8: retroceder con Anterior mientras corre la cuenta del paso 2 vuelve a exigir la duracion completa en el paso 1» | El recorrido es el que pedia la review: se cumple el paso 1, Siguiente, 1000 ms y Anterior. Afirma paso 1, Siguiente deshabilitado, motivo visible, cuenta en `00:05`, deshabilitado a 4999 ms y habilitado a 5000 ms |
| Ese caso con el codigo de la rama | **Verde**: SR + OES 58/58 |
| Ese caso con el mutante del escalar (`waitedArrival !== currentIndex`, `setWaitedArrival(currentIndex)`, `key={currentIndex}`) | **Rojo**: 1 fallo y 57 verdes, y el unico que cae es el caso nuevo. Mutante revertido; el arbol quedo limpio |
| T3 y `design.md > 4` | El «Hecho cuando» nombra ahora el mutante del escalar, con enmienda fechada. La nota del diseño corrige el recorrido de la trampa sin borrar el texto original. Correcto |
| H5 | `try/finally` alrededor del tramo con reloj falso; las afirmaciones no cambian |
| Bitacora | El mapa de R8 incluye el caso nuevo; lo que declara coincide con lo que medi |
| `pnpm run typecheck` / `pnpm run lint` | Verdes (los corri yo) |

### Abiertos (conocidos por el leader, no bloquean esta vuelta)

- **H3 — R22 / T7:** el E2E `e2e/ejecucion-receta.spec.ts` sigue **sin verificar** porque faltan los navegadores de Playwright. Hay que correrlo, junto con `e2e/recetas-pasos.spec.ts`, antes del PR.
- **H4 — T8:** `./init.sh` sigue parado en `validate-features` por QC-68, que ya falla en `origin/dev`. T8 no se puede cerrar con el gate en verde hasta resolverlo.
- Por esos dos, el checkpoint «todas las tasks en `[x]`» sigue sin cumplirse. La feature no pasa a `done` hasta cerrarlos.
- Los menores H2, H6 y H7 siguen como estaban. Ninguno bloquea.
