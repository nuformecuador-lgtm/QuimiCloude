# QC-9 — proteccion-de-rutas-privadas · bitacora de implementacion

> Bloque 4 (T12-T15) y T16. Los bloques 1-3 los cerraron tandas anteriores; sus commits estan en
> la rama y esta bitacora no los repite salvo el arreglo heredado que hubo que hacer primero.

## T0 — typecheck heredado en rojo

`tests/guards/guard-rutas-privadas-cubiertas.test.ts(99,45): error TS2339: Property 'sort' does
not exist on type 'readonly string[]'`. Venia del bloque 3. Arreglado con el cambio minimo (se
copia la lista antes de ordenarla); lo que la guardia afirma no cambia. Commit `fix(QC-9)`.

## Archivos creados

| Archivo | Que es |
| --- | --- |
| `lib/composition/edge.ts` | cableado edge-safe de `SessionTokenVerifier` (T12) |
| `lib/modules/identity/adapters/driving/route-guard-middleware.ts` | el portero (T13) |
| `middleware.ts` | cascaron de Next: reexport + matcher literal (T14) |
| `tests/unit/identity/route-guard-middleware.test.ts` | 12 casos, `NextRequest` reales (T13, T13-bis) |
| `tests/unit/middleware-root-contract.test.ts` | el archivo de la raiz no decide nada (T14) |
| `tests/guards/guard-middleware-edge.test.ts` | cierre de imports desde `middleware.ts` (T15) |

## Archivos modificados

| Archivo | Cambio |
| --- | --- |
| `tests/guards/guard-rutas-privadas-cubiertas.test.ts` | copia antes de `.sort()` (T0) |
| `lib/modules/identity/adapters/driving/login-action.ts` | lee y revalida `next`, redirige ahi (T16) |
| `tests/unit/identity/login-action.test.ts` | 3 casos nuevos de destino de vuelta (T16) |
| `specs/.../tasks.md` | T12-T16 marcadas |

## Mapa `R<n>` -> test

| R | Test |
| --- | --- |
| R2, R7 | `route-guard-middleware.test.ts` · «redirige al login con la ruta pedida cuando no hay cookie…» |
| R3 | idem · «cookie caducada» y «firma manipulada» |
| R4 | idem · «no importa la composicion Node ni ningun repositorio» + `guard-middleware-edge` |
| R5 | idem · «no emite, reemite ni borra la cookie de sesion en ningun caso» |
| R8, R9 | `login-action.test.ts` · destino interno / externo / ausente |
| R10, R11 | `route-guard-middleware.test.ts` · «login con sesion» / «login sin sesion» |
| R12, R13, R26 | idem · «evalua las reglas ruta→rol con el rol FIRMADO en la cookie» |
| R15 | `guard-middleware-edge.test.ts` · cierre real + 5 casos sinteticos |
| R18 | `route-guard-middleware.test.ts` · «falla cerrado cuando falta SESSION_SECRET» |
| R20, R21 | `middleware-root-contract.test.ts` · «no contiene ninguna decision propia», «no importa un driven» |
| R22 | idem · «no se aplica a los recursos estaticos» (matcher ejercitado como regex) |
| R27 | `route-guard-middleware.test.ts` · «rechaza un token v1 aunque su firma sea correcta» |
| R29 | `route-access.test.ts` (bloque 3) + encabezado del adaptador driving |
| R30 | `route-guard-middleware.test.ts` · describe «limite conocido: el rol firmado no se entera de un cambio de rol» |

R1, R6, R14, R16, R17, R19, R23, R24, R25, R28 los cubren los bloques 1-3 o tasks posteriores
(T18 documentacion, T19 E2E). La trazabilidad completa se cierra en T20.

## Salida real de los comandos

```
pnpm run typecheck   -> tsc --noEmit, sin salida (verde)
pnpm run lint        -> eslint, sin salida (verde)

pnpm exec vitest run tests/unit/identity tests/guards tests/unit/middleware-root-contract.test.ts
  Test Files  37 passed (37)
       Tests  435 passed (435)

pnpm exec vitest run tests/integration/identity
  Test Files  4 passed (4)
       Tests  51 passed (51)
```

Evidencia de que `guard-middleware-edge` dispara: con un `import { cookies } from 'next/headers'`
añadido a mano en `route-guard-middleware.ts`, la guardia se pone roja con
`middleware.ts -> lib/modules/identity/adapters/driving/route-guard-middleware.ts importa
'next/headers', que no existe en el borde (R15)`; quitado el import, vuelve a verde.

## Hallazgo que obligo a desviarse

Las guardias existentes quitan los comentarios de BLOQUE antes que los de linea. Un `//` que
mencione una ruta con comodin abre un bloque falso que se cierra en el siguiente JSDoc y se traga
los imports que haya en medio: el archivo parece no importar nada y la guardia pasa en verde sin
haber mirado. Pasaba de verdad con `lib/composition/edge.ts` y `middleware.ts` tal y como los
escribi. Dos medidas: `guard-middleware-edge` quita los de linea primero, y los comentarios de
esos dos archivos se reescribieron sin comodines para que las guardias viejas vean sus imports.
El mismo agujero sigue abierto en `guard-arquitectura-modulos` y `guard-firma-sesion-unica`; no se
tocan aqui porque no es el alcance de esta tanda, y queda anotado.

## Veredicto

Bloque 4 y T16 cerrados y verdes; el portero corta antes de renderizar, no toca la cookie y decide
con el rol firmado, con su limite conocido caracterizado.
