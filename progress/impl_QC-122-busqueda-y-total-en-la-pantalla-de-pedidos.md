# impl QC-122 — busqueda-y-total-en-la-pantalla-de-pedidos

> Implementer, 2026-09-23. Alcance: **solo búsqueda** (el importe salió a QC-151 en F1.4) **+ R27**
> (ampliación aprobada por el humano el 2026-09-23, «sí, arréglalo aquí»; `spec_author` lo formaliza en
> `requirements.md`). Todo el código lo escribió `frontend_dev`; no hay backend (la consulta es de QC-68).

## Commits (rama feature/QC-122-busqueda-y-total-en-la-pantalla-de-pedidos)

| Commit | Task |
|---|---|
| 83f66fd9 | T1 — `q` entra y sale de la URL |
| 65ad22e7 | T2 — caja montada y vuelta a la página 1 |
| 28dd9dc6 | T3 — «sin coincidencias» dentro de la tabla y limpiar |
| 86472f4c | T5 — E2E `e2e/pedidos-busqueda.spec.ts` |
| 8190a054 | T4 — el término sobrevive al panel lateral |
| 36ee19e2 | T7 — la caja sigue a la URL cuando el término cambia por fuera (R27) |
| último `chore(QC-122)` | bitácora, tasks.md y arreglo del localizador de cierre del panel en el E2E |

## Archivos

Producción (`app/(private)/pedidos/components/`): `order-list-params.ts`, `order-table.tsx`,
`order-list-section.tsx`, `index.ts` (solo exportaciones añadidas).

Tests: `tests/unit/pedidos-ui/order-list-params.test.ts`, `order-table.test.tsx`,
`order-list-section.test.tsx`, `order-sheet.test.tsx`; E2E nuevo `e2e/pedidos-busqueda.spec.ts`.

Sin diff (comprobado con `git diff 602df3d2..HEAD`): `components/shared/**`, `lib/**`, `db/**`,
`package.json`, `order-columns.tsx`, `order-list-empty.tsx`, `order-list-skeleton.tsx`. Sin dependencias.

### R27: enfoque

En `OrderTable`, dos `useState`: `pendingSearches` (términos que la propia caja pidió, por tecleo o por
«Limpiar», aún sin eco) y `lastSearch`. Al renderizar con un `params.search` distinto de `lastSearch`: si
está en `pendingSearches` se descartan él y los anteriores (eco propio, no se remonta: R11 intacto, también
en la carrera del rebote); si no está, cambio externo (Atrás, enlace) -> `boxEpoch + 1` y la `DataTable` se
remonta con la caja naciendo del término de la URL. Patrón «ajustar estado en render»; `useRef` lo rechaza
el lint `react-hooks/refs`. No toca la caja compartida: proveedores e inventario **siguen** con el desfase
(candidato a ficha propia, alternativa C de `design.md > 3.3`).

## Mapa R<n> -> test

| R | Test |
|---|---|
| R1 | `order-table.test.tsx` > la caja de busqueda existe y respeta el area tactil minima (R1) > se pinta con al menos 44px de alto y 16px de letra |
| R2 | `order-table.test.tsx` > escribir en la caja navega desde la primera pagina, conservando lo demas (R2, R8) > un termino nuevo vuelve a la pagina 1 y conserva tamano, orden y filtros; `order-list-params.test.ts` > withSearchResetsPage reinicia la pagina solo si el termino cambia (R2) (2 casos) |
| R3 | `order-table.test.tsx` > las filas se pintan tal cual llegan aunque ninguna contenga el termino (R3) > la tabla no filtra, ni ordena, ni recorta en el cliente; E2E R25 a |
| R4 | `order-list-params.test.ts` > lee 'q' con espacios al principio y al final y los retira (R4); `order-sheet.test.tsx` > con "q" en la URL, la consulta recibe el termino y la caja lo muestra (R4) |
| R5 | `order-list-params.test.ts` > un 'search' en la URL se IGNORA: solo 'q' alimenta la busqueda (R5); buildOrderListQuery escribe 'q' solo cuando el termino no esta vacio, y nunca 'search'; ida y vuelta `it.each` con un termino de busqueda (R5) |
| R6 | `order-list-params.test.ts` > sin 'q', con 'q' vacio o con 'q' de solo espacios, la busqueda queda vacia (R6) |
| R7 | `order-list-params.test.ts` > un termino mas largo que el tope se recorta, sin lanzar (R7); el tope de esta pantalla esta atado al del dominio: acepta 120 y rechaza 121 |
| R8 | `order-table.test.tsx` > (R2, R8) > avanzar de pagina con un termino vigente conserva ese termino (R8) |
| R9 | `order-sheet.test.tsx` > abrir y cerrar el panel lateral de una fila no navega y conserva el termino en la caja (R9); E2E R25 d (panel + recarga) |
| R10, R11, R12 | `order-table.test.tsx` > mientras la navegacion esta en vuelo, la caja conserva foco y texto (R10, R11, R12) > aria-busy, rotulo de carga, sin esqueleto, y la misma caja con foco y texto |
| R13, R14 | `order-list-section.test.tsx` > sin coincidencias: DENTRO de la tabla, con la caja montada (R13, R14, R15, R16) > con termino y cero filas pinta "sin coincidencias" dentro de la tabla, y NO el vacio de siempre; con termino y cero filas no se pide el lote de responsables |
| R15 | `order-list-section.test.tsx` > «Limpiar la busqueda» enlaza sin 'q', con la primera pagina, y conserva tamano, orden y filtros (R15); `order-table.test.tsx` > sin coincidencias: «Limpiar la busqueda» navega y vacia la caja (R15) > el clic simple navega al 'clearHref' y la caja queda vacia antes y despues del rerender; un clic con modificador no intercepta |
| R16 | `order-list-section.test.tsx` > sin termino y cero filas sigue siendo el vacio de siempre, sin "Limpiar la busqueda" (R16) |
| R17–R24 | **Retirados en F1.4, van a QC-151.** Sin test. |
| R25 (a) | `e2e/pedidos-busqueda.spec.ts` > escribir un termino recorta la lista a lo que devuelve la consulta, y la URL lleva `q` (R25 a) |
| R25 (b) | **Retirado en F1.4, va a QC-151.** Sin test. |
| R25 (c) | `e2e/pedidos-busqueda.spec.ts` > un termino sin coincidencias muestra el estado propio dentro de la tabla, y limpiar devuelve todo (R25 c) |
| R25 (d), R26 | `e2e/pedidos-busqueda.spec.ts` > el termino sobrevive a cambiar de pagina, al panel lateral, a recargar y a Atras (R25 d, R9, R26) |
| R27 | `order-table.test.tsx` > la caja sigue a la URL cuando el termino cambia por fuera (R27) > un params.search externo, ajeno a la caja, se muestra tras el rerender (mordía: sin el arreglo, toHaveValue('base') recibía 'acido'); el termino que la propia caja emitio no la remonta: mismo nodo, foco y texto (R27, R11); la carrera del rebote: seguir tecleando tras emitir no se pierde cuando llega la respuesta vieja (R27, R11). `e2e/pedidos-busqueda.spec.ts` > Atras entre dos terminos distintos deja la caja con el termino de la URL (R27) |

## Tests sustituidos (design.md > 7)

- `order-list-params.test.ts`: bloque «la pantalla todavia no busca…» -> bloque «el termino de busqueda vive en 'q' (R4, R5, R6, R7)».
- `order-table.test.tsx`: «la caja de busqueda NO existe (R20)» -> bloques R1, R2/R8, R3, R10–R12, R15.
- `order-list-section.test.tsx`: comentario «search siempre vacío» -> bloque R13–R16.
- `order-columns.test.tsx`: sin tocar (diez columnas y bloque R18 de QC-123 vigentes).

## Salida real

`pnpm run typecheck` -> `tsc --noEmit` sin errores. `pnpm run lint` -> `eslint` sin salida.

`pnpm exec vitest related --run` sobre los cuatro archivos de producción:

```
 Test Files  26 passed (26)
      Tests  369 passed (369)
```

Regresiones de T4 (`vitest run`, por `frontend_dev`): order-columns, pedidos-viewport, a11y-tactil
(pedidos-ui), read-only, order-row-wiring, order-sheet-responsibles, pedidos-convenciones,
permiso-ruta-pedidos, guard-pantalla-pedidos-se-amplia -> 9 archivos, 129 pasan + 5 skip. Guardias E2E
(guard-e2e-landing, guard-dobles-e2e) -> 21/21.

E2E, **solo Chromium** (`pnpm run e2e e2e/pedidos-busqueda.spec.ts --project=chromium`). La primera
corrida falló por un localizador ambiguo en el propio spec (`[data-slot="sheet-close"]` casaba con la X y
con «Cancelar»); se cambió a `getByTestId('order-form-cancel')`. Segunda corrida:

```
  ✓  2 [chromium] › escribir un termino recorta la lista a lo que devuelve la consulta, y la URL lleva `q` (R25 a) (20.2s)
  ✓  4 [chromium] › un termino sin coincidencias muestra el estado propio dentro de la tabla, y limpiar devuelve todo (R25 c) (21.8s)
  ✓  1 [chromium] › Atras entre dos terminos distintos deja la caja con el termino de la URL (R27) (22.6s)
  ✓  3 [chromium] › el termino sobrevive a cambiar de pagina, al panel lateral, a recargar y a Atras (R25 d, R9, R26) (27.2s)
  4 passed (36.3s)
```

(Los `[WebServer] ⨯ Error: aborted` del log son las navegaciones que el rebote deja a medias en `next dev`.)

**Pendiente del leader:** WebKit del E2E (T5 pide los dos navegadores; aquí solo Chromium por
instrucción), `./init.sh` completo (T6) y la formalización de R27 en `requirements.md`.
