# QC-180 — rojos-heredados-de-alta-de-grupos · review

Vuelta 1. Fecha 2026-10-09. HEAD revisado `626dd188`, diff `origin/dev...HEAD` (12 archivos).

## Checklist

### Especificación
- [x] `requirements.md` con R1..R11 en EARS.
- [x] `design.md` con alternativas descartadas (5.0 a 5.4) y su porqué.
- [x] `tasks.md`: T1..T7 en `[x]` (21 marcas `[x]`, 0 `[ ]`).
- [x] `design.md` abre con `## Lo que ya existe`, con búsqueda hecha. El diff no re-crea nada: amplía
      la lista cerrada que ya existía y reutiliza el espía `actions`.

### Trazabilidad (verificada ejecutando, no solo por la bitácora)
- [x] R1 → `scope.test.ts`: pasa entero. El diff no añade `skip`/`todo`/`only` ni borra ningún `it`/`test`.
- [x] R2 → `module-contract.test.ts`: lo mismo.
- [x] R3 → `pantallas-exigen-permiso.test.tsx`: pasa entero. `PAGINAS` no se toca.
- [x] R4 → `tests/baseline-rojos.json`: pierde solo las tres claves. Queda `"archivos": {}` y
      `_nota` sin cambios; en `origin/dev` no había más entradas. El JSON parsea.
      `scripts/comparar-baseline-rojos.mjs` acepta el archivo (`Object.entries({})`). Lo corrí contra un
      reporte real de los 5 archivos afectados: «sin rojos nuevos (5 archivos ejecutados, baseline vacio)», exit 0.
- [x] R5/R6 → casos de `/pedidos` «404 sin el permiso», «conjunto vacío» y «login sin sesión».
      **Mutación T1 repetida**: con `loadFormCatalogs()` antes de `requirePagePermission`, caen los tres
      casos. Revertida.
- [x] R7 → «`/pedidos` se sirve con el permiso»: las tres lecturas reciben `RESULTADO_DE_ERROR` del `beforeEach`.
- [x] R8 → **mutación 1 de T4 repetida** (`app/(private)/qc180-mutacion/page.tsx` importa
      `listRecipesAction`): caen los dos guardianes. Revertida.
- [x] R9 → mutación 2 de T4: evidencia en la bitácora. No la repetí: la rama `consumesOnlyPublicContract`
      está a la vista en `module-contract.test.ts:613-614` y se aplica a las dos rutas autorizadas.
- [x] R10 → las dos listas tienen las mismas dos rutas. `scope.test.ts:163` usa
      `join('app','(private)','asignacion','[id]','page.tsx')` y `join('app','(private)','pedidos','page.tsx')`,
      porque compara con `relative()` nativo. `module-contract.test.ts:597` usa las cadenas POSIX
      `'app/(private)/asignacion/[id]/page.tsx'` y `'app/(private)/pedidos/page.tsx'`, porque compara con `toPosix()`.
      Son las mismas rutas exactas, sin carpetas, prefijos ni globs. La forma distinta ya existía antes.
- [x] R11 → `git diff --name-only origin/dev...HEAD` no muestra nada bajo `app/` ni `lib/`.
      `pedidos-viewport.test.tsx` y `order-sheet.test.tsx` siguen en verde sin tocarse.
- [x] La bitácora `progress/impl_…` incluye el mapa `R<n> -> test`.

### D5 (notas de enmienda)
- [x] QC-24, QC-25 y QC-35 llevan una nota «Enmienda 2026-10-08 … (QC-180)» al final del archivo y no
      reescriben nada. La de QC-25 se declara bajo R44 y la de QC-35 cita R31.

### Calidad de código
- [x] `pnpm run typecheck` sale con exit 0.
- [x] `eslint` sobre los tres tests tocados: sin problemas.
- [x] Corrida de los 3 archivos objetivo más los 2 de pedidos-ui: 84/84 en verde, 0 pendientes y 0 todo.
- [x] `./init.sh` rápido en verde, según el leader y `progress/features/QC-180.md > Tandas`. No lo repetí.
- [ ] `gate-completo` de CI: pendiente del PR. No se puede revisar aquí.
- [x] No hay flujo crítico nuevo que pida E2E. Solo cambian tests y specs.
- [x] No hay dependencias nuevas, `package.json` no cambia, y no hay secretos ni configuración hardcodeada.

### Checkpoints del proyecto y perfil-agentes (puntos 5 a 9)
- [x] Puntos 5, 6, 7 y 8: no aplican. No hay tablas, UI, dependencias ni consultas.
- [x] Punto 9 (comentarios): no aplica. El diff no toca archivos de producción. Los comentarios que
      citan QC/R están en tests, siguiendo el estilo que ya tienen esos archivos.
- [x] Módulos hexagonales y permisos: sin cambios en `lib/`. El corte por permiso de `/pedidos` queda
      ahora vigilado también sobre sus lecturas de catálogo.

## Hallazgos

- **menor**: la bitácora `progress/impl_QC-180-…md` acaba en «Pendiente para el leader: T7: `./init.sh`
  … no lo corrió el implementer». T7 ya está hecho: lo registra `progress/features/QC-180.md > Tandas`.
  Conviene actualizar esa línea o enlazar el resultado para que la bitácora no se contradiga con `tasks.md`.
- **menor**: R10 se cumple por revisión, no por construcción (design 5.3 lo asume a conciencia). Las dos
  constantes tienen forma distinta (`join()` frente a cadena POSIX), así que una futura ampliación puede
  desalinearlas sin que salte ningún test. Es una nota para fichas futuras, no algo que cambiar aquí.
- **menor**: `progress/features/QC-180.md > Cierre` todavía no tiene el PR ni las deudas. Es normal en
  esta fase: lo completa el leader al cerrar.

No hay bloqueantes.

## Veredicto

**OK**
