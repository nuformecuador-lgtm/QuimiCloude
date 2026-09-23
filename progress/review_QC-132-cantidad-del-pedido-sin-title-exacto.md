# QC-132 — cantidad-del-pedido-sin-title-exacto · review

> Reviewer, 2026-09-23. Rama `feature/QC-132-cantidad-del-pedido-sin-title-exacto`, commit revisado
> `86c6b2cf` (diff contra `02587759`). Spec aprobado: R1–R11 + R12 (nota del 2026-09-23).

## Checklist

| # | Punto | Resultado |
|---|---|---|
| 1 | Trazabilidad R1–R12 | PASA. R1–R6 y R12 tienen su caso `QC-132 R<n>` que afirma `title` exacto o su ausencia sobre el DOM; R7 por las afirmaciones de texto (ver menor 1); R8/R10/R11 por comprobación de diff y censo, repetidas por mí (abajo); R9 por la forma de los 9 casos y diff sin `e2e/`. |
| 1b | Los tests muerden | PASA. Cada caso positivo (R1, R3, R5×2, R12 valor largo) espera `title` con valor concreto: sin el atributo recibe `null`. El caso R12 `'1'` ml→L distingue además la opción (a) de la (c): `exactDecimalTitle(line.quantity)` daría `undefined` y el caso fallaría. Mutación T5 del implementer coherente con esto; no la repetí porque el reviewer no edita producción. |
| 2 | Tasks `[x]` | PARCIAL. T1–T7 `[x]`. T8 (gate rápido), T9 (gate completo) y T10 (cierre del mapa) quedan `[ ]`: son del leader por diseño de esta vuelta (ver menor 3). |
| 3 | CHECKPOINTS.md | Especificación: PASA (EARS numerados, design con 4 alternativas descartadas). Trazabilidad: PASA (mapa en `progress/impl_…md`). Calidad: typecheck/lint/tests los corre el leader en el gate; sin flujo crítico, sin E2E (decisión cerrada). Datos/seguridad, módulos, permisos, configuración: no aplican (sin esquema, rutas, acciones, secretos ni config). Verificación final: pendiente del gate completo, `history.md` y desmontaje del worktree (leader). |
| 4 | Verificación ejecutable | Corrí los tres archivos de test: `Test Files 3 passed (3)`, `Tests 66 passed (66)`. `./init.sh` no lo corrí: lo corre el leader en paralelo (rápido) y después (completo), por instrucción. No sospecho regresión fuera de estos tres archivos. |
| 5 | Calidad y seguridad | PASA. Sin tablas, webhooks, secretos ni hardcode de contexto. Capas: los tres componentes importan de `lib/shared/ui/decimal-display` como antes. |
| 6 | Multiplataforma | PASA. No hay alto de pantalla, targets, inputs ni librería nueva. El `title` solo aparece al pasar el puntero, pero es información complementaria, no activación, y su invisibilidad en móvil está aceptada por decisión cerrada (R7). |
| 7 | Dependencias | PASA. Sin cambios en `package.json` ni lockfile. |
| 8 | Aislamiento por empresa | No aplica (sin modelos ni consultas). |
| 9 | Comentarios | PASA. Único comentario tocado (`order-columns.tsx:198-199`): 2 líneas, explica un porqué, sin `QC-`/`R<n>`/`design.md`. Sustituye al anterior que citaba `R39`. Ningún comentario nuevo en los otros dos archivos. |

### Comprobaciones repetidas por el reviewer

- **R8/R11 (diff negativo).** `git diff --stat 02587759..HEAD -- lib e2e components package.json pnpm-lock.yaml app/(private)/pedidos/components/order-field.tsx`: vacío. `decimal-display.ts`, su test y `order-field.tsx` sin tocar.
- **R11 (tests solo añaden).** `git diff 02587759..HEAD -- tests | grep -c '^-[^-]'` → `0`.
- **R10 (censo).** `formatDecimalDisplay(` en `app/`, `components/`, `lib/`: 9 apariciones, iguales a las del informe; todas con `exactDecimalTitle` en su nodo o en el nodo padre salvo `order-field.tsx:68` (excepción admitida).

## Hallazgos

1. **menor — R7: afirmaciones de texto parciales en los casos de `/asignacion/[id]`.** `design.md > 5`
   promete «igualdad exacta sobre `textContent`» y el informe de implementación afirma que los casos
   R3, R5 y R12 la usan, pero usan `toHaveTextContent('<cadena>')`, que en jest-dom es coincidencia
   **parcial**. En concreto `order-execution-lines.test.tsx:254` (`toHaveTextContent('0')`, caso R12
   valor largo) es casi vacuo: pasaría con `'0.001'`, `'10'` o cualquier texto con un cero. Las de
   `'0.13'` y `'Pedido 0.13'` sí fallarían si se pintara el valor exacto en lugar del redondeado, pero
   no si se añadiera texto detrás. No bloquea porque el núcleo de la feature (el `title`) está bien
   cubierto, la función de pintado no cambia (R8) y `order-columns.test.tsx` sí usa `toBe`. Corrección
   sugerida: `expect(cantidad.textContent).toBe('0')` (y análogos), y corregir la frase del informe.
2. **menor — R6 no afirma el texto pintado.** El caso `QC-132 R6` solo comprueba la ausencia de
   `title`; no fija que `'20'` se pinte `20`. Lo cubre el caso preexistente de la línea 61
   (`'Hipoclorito · 10,00 % · 20 L'`, igualdad exacta), así que es cosmético.
3. **menor — T8, T9 y T10 sin marcar.** `CHECKPOINTS.md` exige todas las tasks `[x]`. Son los gates y
   el cierre del mapa que el leader corre él mismo; el mapa R1–R12 ya está en el informe. Este OK queda
   **condicionado** a que `./init.sh --rapido` y `./init.sh` completo terminen en verde y se marquen
   T8–T10 antes del PR.

Bloqueantes: 0. Menores: 3.

## Veredicto

**OK** (condicionado al gate rápido y completo en verde, que corre el leader, y a marcar T8–T10).
