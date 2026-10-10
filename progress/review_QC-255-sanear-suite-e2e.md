# QC-255 — sanear-suite-e2e · revision

> Reviewer, 2026-10-10. Rama `feature/QC-255-sanear-suite-e2e`, HEAD `b3968c92`, base `origin/dev`.
> Grafo no usado: el diff es de tests/E2E/CI y se reviso con Grep/Read y `git diff`.

## Verificacion ejecutada (no me fio solo de la bitacora)

| Comando | Resultado |
|---|---|
| `set -a; . ../../.env; set +a; ./init.sh` | `== init OK ==` (typecheck, lint, test:rapido, guardias, validador, perfil). Aviso amarillo «no hay .env» del worktree: ajeno, se cargo el de la raiz. |
| `pnpm exec vitest run tests/guards tests/unit/shared tests/unit/clientes tests/unit/e2e-helpers` | 135 archivos, 1689 passed, 19 skipped (previos), 0 failed |
| `gh run view 38075057426` | `workflow_dispatch` sobre la rama, sha `b136a060` (HEAD solo añade la bitacora de T9). Los 8 jobs en `success`: estatico, vitest x3, `e2e (chromium)`, `e2e (webkit)`, `gate-completo`, `e2e` |
| Logs de CI de los dos navegadores | `171 passed` en cada uno, 0 `Retry #`, 3 `sesion=fin` por navegador (coincide con la tabla de R27) |
| `git diff --name-only origin/dev...HEAD` contra `app/ lib/ components/ hooks/ middleware.ts db/` | vacio (R22) |
| Grep de `.skip(/.fixme(/.fail(/.only(` en `e2e/` (incluidos helpers) | 0 |
| Grep de creaciones de usuario anidadas (`users: { create`), SQL crudo o `user.create<…>(` fuera del helper | 0 |

## Checklist

### Agente (`.claude/agents/reviewer.md`)
- [x] 1. Trazabilidad: R1–R27 mapeados en `progress/impl_QC-255.md`. R1–R4 test unitario real
  (`tests/unit/e2e-helpers/fixture-user.test.ts`, mock de Prisma, 10 casos); R5–R6 y R19 guardias con
  caso sintetico rojo; R23–R25 guardia de presupuesto; R7–R18 E2E concretos; R20–R21 tabla de
  equivalencias; R22 diff; R26–R27 run de CI verificado arriba.
- [x] 2. Tasks: 9/9 `[x]`, ninguna abierta.
- [x] 3. Checkpoints (`CHECKPOINTS.md` + `docs/checkpoints-proyecto.md`): spec completo con
  alternativas descartadas; `## Lo que ya existe` presente y con contenido; el diff no re-crea nada
  de esa lista (reutiliza `loginAndLand`, `openRowActionsMenuItem`, el patron de QC-204). Typecheck y
  lint verdes. `gate-completo` verde en el run. Sin secretos, sin webhooks, sin config por entorno
  hardcodeada. Sin tablas, migraciones ni RLS. Sin dependencias nuevas (no toca `package.json`).
- [x] 4. Verificacion ejecutable: ver tabla.

### Proyecto (`docs/perfil-agentes.md > reviewer`)
- [x] 5. Calidad y seguridad: no aplica a produccion; los fixtures limpian por prefijo/ids propios.
- [x] 6. Multiplataforma: no toca UI. WebKit sigue ejercitado de verdad (ahora en su propio job).
- [x] 7. Dependencias: ninguna.
- [x] 8. Aislamiento por empresa: no toca esquema ni consultas. `aislamiento-recetas` conserva
  todas sus afirmaciones de cruce.
- [~] 9. Comentarios: sin bloqueantes (no hay lineas de produccion). Menores en tests: ver m1, m2.

## Foco pedido por el leader

1. **Nada se afloja.** Revisados los diez casos adaptados contra su diff:
   - `errores` (R9 + D-1): antes `-message` y `-code` en claro; ahora `data-code="unexpected"`,
     mensaje del catalogo y referencia visible (que el componente solo pinta con codigo
     `unexpected`, `components/shared/unexpected-error-notice.tsx:52`). Igual o mas. El chequeo del
     HTML sin detalle interno no cambia.
   - `presentaciones` (R10): solo añade la eleccion de unidad; afirmaciones intactas.
   - `aislamiento-recetas` (R11): siembra un producto de A, lo elige y afirma `toBeEnabled()` antes de
     guardar (mas que antes). Limpieza de productos antes que la empresa. Afirmaciones de aislamiento
     intactas.
   - `pedidos-cotizacion` (R12/R13): la unidad se elige antes de (a); los cinco importes literales sin
     tocar. El paso (d) ya no la elige, coherente.
   - `permisos` (R14): `private-logout` visible + `focus()` + `toBeFocused()`. El paso que se va
     (abrir `private-user-trigger` con Enter) desaparece porque el menu ya no existe; el resto igual.
   - `grupos-de-trabajo` (R15): unico candidato por id de persona, unica fila del selector, boton por
     nombre accesible; afirmaciones de miembro intactas. El ambito pasa de pagina a bloque de miembros
     (necesario por el `data-table-search` compartido), no afloja el «unico candidato».
   - `datos-de-lote` (R16): via `openRowActionsMenuItem`, igual que los otros specs.
   - `proveedores` (R17): texto `12.35` + `title` exacto `12.3456` contra la constante tecleada.
   - `usuarios` (R18): tokens → usuarios → empresa con patron `primerFallo`.
   Ningun `force: true`, ningun timeout de caso subido, ningun salto.
2. **D-1 y D-2: justificadas.** D-1 es la misma clase de caso que D2 (UI cambiada a proposito,
   QC-71/QC-231) con equivalente directo; adaptarla en vez de parar es lo que dice D7 y no cae en
   R21. D-2 es un arreglo de limpieza (FK `Restrict` de `revoked_sessions`, QC-23), igual que F en
   `usuarios` y que ya hacia `login.spec.ts`; no toca afirmaciones. Las dos estan en la tabla.
3. **Helper y guardias.** El helper pone los defaults antes de `...args.data` (lo del llamante gana);
   `login.spec.ts` sigue pasando `pending`/`inactive`/`blocked` explicitos (R8). Guardias con caso rojo
   sintetico y nombran archivo y linea. Huecos de falso verde, ninguno usado hoy: ver m3, m4.
4. **gate.yml.** Matriz `e2e-navegador` [chromium, webkit] con `fail-fast: false`, cache, instalacion y
   artefacto por proyecto, `pnpm run e2e --project=…` (el script es `playwright test`, los argumentos
   pasan). Agregador con id y nombre `e2e`, `needs: e2e-navegador`, `if: always() && <condicion
   original>`, y `exit 1` si `needs.e2e-navegador.result != success` (cubre `failure` y `cancelled`).
   La condicion de disparo de la matriz es literalmente la de antes (`workflow_dispatch` o
   `base_ref == 'prod'` fuera de borrador); ningun otro job dependia de `e2e`.
   `guard-e2e-presupuesto` vigila `actionTimeout ∈ (0, 30 s]`, matriz = `projects[].name`,
   `fail-fast: false`, `--project=${{ matrix.project }}`, `needs`, `always()` y la comparacion con
   `success`. Ver m5.
5. **R22:** limpio.
6. **Trazabilidad y comentarios:** completa; comentarios en m1, m2.

## Hallazgos

Ningun BLOQUEANTE.

- **m1 — menor. Citas de ficha y requisito en comentarios nuevos de tests.** `docs/conventions.md >
  Comentarios` aplica a `tests/` y `e2e/` la misma regla (solo `R<n>` en el nombre del caso). El diff
  añade unas 20: cabeceras de las tres guardias (`Guardia de QC-255 (R…)`), del helper
  (`e2e/helpers/fixture-user.ts:1`, `QC-255 … (R1-R5)`) y del test unitario (`QC-255 T1 … (R1…R4)`),
  `ACTION_TIMEOUT_MAXIMO_MS` («Tope de R23»), y en los specs adaptados (`QC-232`, `QC-71`, `QC-231`,
  `QC-180`, `QC-204`, `QC-80`, `QC-23`, `QC-79`, `R41`, «R8 y R14» en `permisos`). Tambien los `describe`
  de los tests nuevos empiezan por `guardia de QC-255 —`/`QC-255 —` (en el nombre se admite `R<n>`, no la
  ficha). Precedente: menor (QC-122 m4, QC-142 m3, QC-150 m5).
- **m2 — menor. Bloques largos.** Cabeceras de 10–14 lineas en las guardias y el helper, y el bloque de
  `permisos.spec.ts` (~16 lineas) que la rama reescribe. El porque es valido pero pertenece al
  `design.md`.
- **m3 — menor. `guard-e2e-fixture-user` no ve `prisma.user.create<Tipo>(…)` ni creaciones anidadas
  (`company.create({ data: { users: { create … } } })`).** La regex exige `(` justo tras el metodo. Hoy no
  hay ninguna (grep a 0), pero son dos formas plausibles de esquivarla. El «LIMITE HONESTO» solo
  menciona SQL crudo y otro cliente.
- **m4 — menor. `guard-e2e-sin-saltos` solo mira `*.spec.ts` y corta en el primer `//` de la linea.**
  Un `test.skip(` dentro de un helper (`e2e/helpers/*.ts`) o tras una URL en string en la misma linea
  saldria verde; tampoco ve `test\n  .skip(`. Hoy 0 casos. No bloquea: cubre lo que pide R19 («sobre
  `e2e/`», spec).
- **m5 — menor. `guard-e2e-presupuesto` no afirma el nombre del check ni la condicion de disparo.** No
  comprueba `name: e2e` del agregador (P2: conservar el nombre) ni que la matriz y el agregador lleven
  la misma condicion `workflow_dispatch || base_ref == 'prod' && !draft`. Hoy esta bien en el YAML; un
  cambio futuro podria renombrar el check o disparar el E2E en cada PR sin que nada lo vea.
- **m6 — menor (observacion). R14 «alcanzable por teclado» se demuestra con `focus()` programatico.**
  `toBeFocused()` tras `focus()` prueba que el control es enfocable, no que este en el orden de `Tab`.
  Es lo que fijaba el design y lo mismo que hacia el caso antes con el disparador, asi que no es un
  aflojamiento; un `Tab` hasta el boton lo haria mas fuerte.

## Veredicto

**OK.** Sin bloqueantes. Los diez casos adaptados vigilan lo mismo o mas, contra el comportamiento
actual y con su origen citado; D-1 y D-2 estan justificadas; R22 limpio; el run de CI `38075057426`
esta verificado (171/171 por navegador, 0 retries, 6 `sesion=fin` todos intencionales). Los menores
(m1–m6) pueden ir en esta rama si se aprovecha el viaje o en una ficha de limpieza.
