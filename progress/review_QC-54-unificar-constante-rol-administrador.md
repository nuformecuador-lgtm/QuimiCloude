# QC-54 — unificar-constante-rol-administrador · review

> Revisor: subagente `reviewer`, 2026-09-07. Worktree
> `.worktrees/QC-54-unificar-constante-rol-administrador`, rama
> `feature/QC-54-unificar-constante-rol-administrador`, 5 commits propios
> (`3381e90`..`631c115`) sobre `origin/dev` mas el merge `155b2c7`.
> Todo lo que sigue lo corri yo; no cito la bitacora como evidencia.
> Arbol limpio al terminar (`git status --porcelain` vacio).

## Veredicto

**APROBADO (OK).** 0 hallazgos BLOQUEANTES. 5 hallazgos `menor`, ninguno impide cerrar.

## Verificacion ejecutable — salida real de mi corrida

| Paso | Resultado |
| --- | --- |
| `pnpm run typecheck` | verde, sin errores |
| `pnpm run lint` | verde, sin errores |
| `pnpm run test:json` (suite completa, con `.env` cargado en el shell) | Test Files 2 failed / 210 passed (212) · Tests 2 failed / 2512 passed / 4 skipped |
| `node scripts/comparar-baseline-rojos.mjs .vitest-rojos.json` | sin rojos nuevos (2 rojos, todos en el baseline de 5); 3 por limpiar · EXIT=0 |
| `pnpm run test:guardias` | 17 archivos, 169 passed / 4 skipped |
| `pnpm exec vitest run tests/guards/guard-middleware-edge.test.ts` | 1 passed, 7 casos (R14) |
| `pnpm exec vitest run tests/guards/guard-rol-administrador-unico.test.ts` | 5 passed |
| migraciones con down.sql | sin cambios en `db/`; el paso no aplica |

`./init.sh` completo NO se corrio entero: muere en el paso 3/4 con
"feature_list.json invalido: faltan specs ... QC-35" por el bug conocido de
`scripts/validate-features.mjs` (WT_DIR resuelto contra el cwd; revienta dentro de cualquier
worktree y pasa limpio desde la raiz), documentado desde QC-21 y **ajeno a esta ficha**. Los
pasos 6, 7 y 8 se corrieron a mano, en orden, y son los de la tabla.

**Aviso de entorno reproducido y descartado como rojo:** en un shell sin las variables de
`.env` exportadas, 27 archivos de `tests/integration/**` fallan con
"PrismaClientInitializationError: Environment variable not found: DATABASE_URL" — vitest no
carga `.env` por su cuenta. Exportandolas, los 27 pasan (`identity-seed.int.test.ts`
verificado en aislado: 11/11). No es de QC-54.

## Checklist de CHECKPOINTS.md

### Especificacion
- [x] `requirements.md` con 17 requisitos EARS numerados R1..R17.
- [x] `design.md` con alternativas descartadas y su porque (cuatro para la pieza compartida, una
      para la guardia).
- [x] `tasks.md` con las **12** tasks en `[x]` (T1..T12). Verificado en el archivo.

### Trazabilidad
- [x] Los 17 requisitos tienen mapeo. **16 de 17 verificados por un test que muerde de verdad**
      (los abri uno a uno); R2 queda parcial y R17 se apoya en comprobacion manual → hallazgos
      1 y 2, los dos `menor`.
- [x] `progress/impl_QC-54-...md` contiene el mapa R -> test.

### Calidad de codigo
- [x] typecheck y lint verdes.
- [x] Suite verde salvo los 2 rojos del baseline heredado (analizados abajo, hallazgo 3).
- [~] Flujo critico (permisos) sin E2E nuevo → decision cerrada 5, tomada por el humano ANTES
      del spec y con motivo escrito: refactor sin cambio de comportamiento observable, la prueba
      son los tests de autorizacion existentes. Excepcion declarada; no bloqueante.
- [x] No toca UI: el diff no incluye `app/`, `components/` ni `hooks/`. La regla multiplataforma
      no aplica.
- [x] Cero dependencias nuevas: `package.json` y `pnpm-lock.yaml` fuera del diff;
      `guard-dependencias-aprobadas` verde.

### Datos y seguridad
- [x] Sin modelos nuevos en `db/schema.prisma`: `db/` **entero** fuera del diff (R5). No aplica
      columna de empresa, ni RLS, ni migracion, ni down.sql.
- [x] Sin consultas de datos nuevas: el aislamiento por empresa no cambia de forma.
- [x] El permiso se sigue validando en el dominio, antes de todo puerto — ahora en una sola
      implementacion. Los cinco tests de autorizacion lo ejercitan con dobles de puerto que
      explotan si se los llama.
- [x] Sin secretos ni configuracion hardcodeada nueva. El unico literal en juego,
      'Administrador', queda con **un solo dueño**.
- [x] Sin webhooks.

### Modulos hexagonales
- [x] `identity/domain/require-admin.ts` es dominio puro: su unico import es `./roles`.
- [x] Los cinco `domain/actor.ts` importan `@/lib/modules/identity` **por barrel**, nunca por
      ruta profunda. Permitido explicitamente por `docs/architecture.md > La regla de
      dependencias` (fila domain/** -> `@/lib/modules/N` barrel).
- [x] El barrel de `identity` sigue siendo solo dominio (revisado linea a linea): no arrastra
      `next/*`, Prisma ni 'use server' a los barriles de los cinco modulos que ahora lo alcanzan.
      `guard-arquitectura-modulos` y los module-contract de `unidades` y `recetas` —que verifican
      el cierre transitivo del barrel— verdes.
- [x] `lib/composition/route-role-rules.ts` sigue cargando en el borde. Ademas el borde ADELGAZA:
      deja de importar el barrel de `inventario` como valor.

### Verificacion final
- [x] Gate ejecutado a mano por el bug del validador (arriba).
- [x] Este archivo existe con veredicto.
- [ ] `progress/history.md` sin entrada de QC-54 → paso de cierre del leader (hallazgo 5).
- [ ] Worktree por desmontar → paso de cierre del leader.

## Lo que verifique por mi cuenta, punto por punto

### A. El comportamiento no se movio: cada modulo sigue lanzando SU error

Confirmado en codigo, no en la bitacora:

- Los cinco `requireAdmin` conservan su firma `asserts actor is Actor` y hacen
  `assertAdminRole(actor, () => new UnauthorizedError())` con el `UnauthorizedError` importado de
  `./errors` de **su propio** modulo.
- Los cinco `domain/errors.ts` estan **fuera del diff**: `UnauthorizedError` sigue extendiendo
  `InventarioError`, `RecetasError`, `UnidadesError`, `PedidosError` y `ProveedoresError`
  respectivamente.
- Los **siete** catch siguen ahi y siguen atrapandolo: `inventario/presentation-actions.ts:49`,
  `inventario/product-actions.ts:113`, `pedidos/order-actions.ts:90`,
  `proveedores/supplier-actions.ts:70`, `proveedores/supplier-catalog-actions.ts:54`,
  `recetas/recipe-actions.ts:73`, `unidades/unit-actions.ts:29` — todos
  `error instanceof <Modulo>Error`.
- Los tests de esos adaptadores estan fuera del diff y verdes en la suite completa. **Ningun caso
  de uso pasa a lanzar un error que su adaptador ya no atrape.** Sin hallazgo.

### B. El valor de la cadena

`lib/modules/identity/domain/roles.ts` sigue con
`export const ROLE_ADMINISTRADOR = 'Administrador'` y `SEED_ROLES` sigue derivando el nombre de esa
constante. `db/` fuera del diff. Anclado por dos tests: `tests/unit/pedidos/authorization.test.ts`
(expect(ROLE_ADMINISTRADOR).toBe('Administrador'), archivo **sin diff**) y el ultimo caso de la
guardia nueva. R4 y R5 cubiertos.

### C. `lib/composition/route-role-rules.ts` en el borde

`guard-middleware-edge.test.ts` corrido por mi: 7 casos verdes. El archivo pasa a importar
`ROLE_ADMINISTRADOR` del barrel de `identity`, barrel que `route-guard-middleware.ts` ya importaba
**como valor**: cero imports nuevos en el borde. Las tres filas (INVENTORY_ROUTE, FORMULAS_ROUTE,
SUPPLIERS_ROUTE) siguen siendo las mismas y con el mismo rol, ancladas en
`tests/unit/identity/route-role-rules.test.ts`, cuyo caso "las filas se derivan de ... y no de
literales propios" sigue exigiendo que el fuente no contenga el literal. R13 y R14 cubiertos.

### D. Encargo 1 — `proveedores` delega y su centinela NO se afloja

Leido `tests/unit/proveedores/authorization.test.ts` (bloque L296-332) y su diff:

- **Cambia UNA asercion**: la regex del import pasa de `ROLE_ADMINISTRADOR` a `assertAdminRole`,
  con el razonamiento del humano escrito dentro del `it`.
- **Siguen vivas y mordiendo**: el barrido del literal (regex de las tres comillas) sobre **todos**
  los fuentes del modulo (L302-308); `expect(actor).not.toMatch(/@\/lib\/modules\/identity\//)`
  (ruta profunda); `expect(actor).not.toMatch(/@\/lib\/modules\/inventario/)`; y
  `expect(existsSync(join(moduloDir,'domain','roles.ts'))).toBe(false)`. Mas las dos anclas del
  valor de `ROLE_ADMINISTRADOR`.
- La mutacion que lo pone rojo sigue siendo la de siempre (declarar un `ADMIN_ROLE_NAME` propio).
  **Confirmado: no se aflojo.**
- El centinela de `pedidos` esta fuera del diff y verde.

### E. Encargo 2 — la guardia muerde de verdad (mutacion propia, distinta de la del implementer)

Meti **dos** mutaciones a la vez, ninguna de las dos probada por el implementer:

1. `const ROL_REVIEWER = 'Administrador';` (comilla **simple**) al final de **middleware.ts** —
   archivo de **primer nivel de la raiz**, la rama del barrido que nadie habia ejercitado.
2. `export const ROL_INTRUSO = 'Administrador';` en un archivo NUEVO
   `lib/modules/identity/domain/zz-reviewer-tmp.ts` — para comprobar que la exencion esta acotada
   **al archivo** `seed-initial-access.ts` y **no** a la carpeta `identity/domain/`.

Resultado: **ROJA**, con mensaje util y citando los dos infractores por ruta:

    AssertionError: El rol Administrador tiene un unico dueño (R1):
    lib/modules/identity/domain/roles.ts. Se encontro el literal declarado tambien en:
    lib/modules/identity/domain/zz-reviewer-tmp.ts, middleware.ts. No repitas la cadena ahi:
    importa ROLE_ADMINISTRADOR del barrel '@/lib/modules/identity' ...

Revertidas las dos, la guardia vuelve a 5 passed y `git status --porcelain` queda **vacio**.
Confirmado tambien por lectura: EXENTOS es una lista de **dos rutas de archivo exactas**, no un
prefijo de carpeta, y las dos estan ancladas con `toContain` contra el verde por vacuidad. El patron
se **deriva** de `ROLE_ADMINISTRADOR` con escapeRegExp y cubre las tres comillas; `stripComments`
quita linea antes que bloque y tiene su caso de regresion. R1, R11 y R12 cubiertos.

### F. Encargo 3 — los dos archivos del baseline: CONFIRMADO, y no ocultan nada de QC-54

Desglose por caso de los dos archivos rojos, leido del reporte JSON de mi corrida:

- `tests/unit/recetas/module-contract.test.ts`: **4 casos verdes, 1 rojo** — "la feature no anade
  ningun route handler bajo app/, y lib/modules/recetas no cambio de forma".
- `tests/unit/recetas-ui/recipe-route-contract.test.ts`: **23 casos verdes, 1 rojo** — "la feature
  no toca lib/modules/recetas ni db/".

Los dos rojos son **el mismo**: expected [ "lib/modules/recetas/domain/actor.ts" ] to deeply equal
[], medido sobre `git diff --name-only origin/dev...HEAD`. Es decir: fallan **porque QC-54 toca
`recetas` legitimamente** (T3 y T7), no por el motivo que el baseline documenta ("en dev el rango
esta vacio"). La afirmacion del implementer es **correcta**.

Y lo que se preguntaba de verdad: **no ocultan ningun fallo real de QC-54**. Todos los demas casos
de los dos archivos —contrato del modulo `recetas`, barrel, ausencia de rutas HTTP bajo app/, la
regla multiplataforma de la pantalla, los casos de QC-64— **pasan**. Hoy el gate pasa porque el
comparador silencia los dos archivos **enteros**, pero dentro de ellos no hay nada rojo que sea de
esta ficha. Deuda de `dev` anterior a QC-54 → hallazgo 3, `menor`, con ficha propia sugerida.

### G. Encargo 4 — spec modificado: las nueve filas originales intactas

`git diff 5782dd1 HEAD -- specs/QC-54-.../requirements.md` da **exactamente dos lineas anadidas y
cero borradas**: las dos filas nuevas de "Decisiones cerradas", ambas etiquetadas "(cerrada por el
humano durante F2.1)". **Las nueve filas originales, el bloque de Alcance, "Lo que NO entra", los 17
requisitos y la tabla de cobertura quedan byte por byte.**

Las dos correcciones fechadas de `design.md > 5` describen lo que el codigo hace de verdad:

- "la exencion son dos archivos y solo dos, y NO la carpeta identity/domain/ entera" → verificado en
  EXENTOS y con mi mutacion (E).
- "el centinela de proveedores cambia una asercion al nuevo medio; las otras cuatro intactas; el de
  pedidos no se toca" → verificado en el diff y en el archivo (D).

Ademas comprobe la premisa de la segunda correccion: `seed-initial-access.ts` declara
`INITIAL_ADMIN_FIRST_NAMES` con el literal como **nombre de pila**, hermano de
`INITIAL_ADMIN_LAST_NAMES = 'Inicial'`, y `tests/unit/identity/seed/seed-initial-access.test.ts` lo
ancla. La exencion esta justificada y motivada dentro de la propia guardia.

## Hallazgos

1. **`menor` — R2 no tiene una asercion directa que prohiba el export.** "Los contratos publicos de
   inventario, recetas y unidades NO DEBEN exportar ninguna constante con el nombre del rol". Hoy
   eso se sostiene en: (a) el simbolo ADMIN_ROLE_NAME ya no existe en lib/, app/, components/ ni
   hooks/ (verificado por mi), (b) typecheck, y (c) la guardia nueva, que muerde si alguien
   **redeclara el literal**. Lo que NO cubre nadie es la reincidencia por **alias**:
   `export { ROLE_ADMINISTRADOR as ADMIN_ROLE_NAME } from '@/lib/modules/identity'` en uno de los
   tres barriles pasaria los tres filtros. `tests/unit/recetas/recipe-catalog.test.ts` solo afirma
   simbolos **presentes**, no ausentes. Sugerencia para ficha futura, no para esta.
2. **`menor` — R17 se verifica con comprobacion manual, no con un test.** La guardia **descuenta**
   los comentarios a proposito, asi que no puede cubrirlo. Verifique a mano que los tres archivos
   citados (`lib/composition/route-role-rules.ts`, `lib/modules/identity/index.ts`,
   `lib/modules/identity/domain/route-role-rules.ts`) describen el estado nuevo y que
   ADMIN_ROLE_NAME no aparece en ningun comentario de produccion. El estado es correcto; falta la
   red que impida que se pudra.
3. **`menor` (deuda ajena, NO de esta ficha) — dos archivos silenciados enteros por el baseline.**
   Ver F. El propio baseline ya declara la correccion pendiente. Confirmado que no esconden ningun
   rojo real de QC-54. Merece ficha propia; no bloquea este cierre.
4. **`menor` — sin E2E para un flujo de permisos.** CHECKPOINTS lo pide; la decision cerrada 5 lo
   difiere con motivo y la tomo el humano ANTES del spec. Queda anotado para que la excepcion sea
   visible, no como reproche.
5. **`menor` — pasos de cierre pendientes del leader.** Sin entrada de QC-54 en
   `progress/history.md` y worktree aun montado. No los toco: hay otra sesion de leader viva en el
   arbol principal y no debo tocar `feature_list.json` ni `progress/current.md`.

**Bonus verificado, no es hallazgo:** reproduje el hueco de entorno del worktree (sin
DATABASE_URL en el shell caen 27 integraciones) y confirmo que `docs/worktrees.md` no lo menciona.
Buena candidata a nota de arnes.

## Cobertura R1-R17 (verificada abriendo el test, no la tabla de la bitacora)

| R | Estado | Como lo comprobe |
| --- | --- | --- |
| R1 | cubierto | guardia nueva sobre el repo real + **mi** mutacion en middleware.ts |
| R2 | cubierto **parcial** (hallazgo 1) | simbolo ausente en produccion + typecheck + guardia; sin asercion contra el alias |
| R3 | cubierto | route-role-rules.test.ts (el fuente no contiene el literal) + los cinco actor.ts importando por barrel |
| R4 | cubierto | ancla de pedidos/authorization.test.ts (sin diff) + ancla de la guardia |
| R5 | cubierto | db/ fuera del diff + seed-initial-access.test.ts e identity-seed.int.test.ts verdes sin tocar |
| R6 | cubierto | require-admin.test.ts + los cinco modulos delegando (leidos) + los cinco tests de autorizacion |
| R7 | cubierto | require-admin.test.ts: 7 casos con ErrorDePrueba propia y vi.fn que verifica que onDenied se invoca una vez |
| R8 | cubierto | los cinco tests de autorizacion, con dobles de puerto que explotan si se los llama |
| R9 | cubierto | idem + "el rol Administrador exacto no lanza, y onDenied no se invoca" |
| R10 | cubierto | los 7 catch verificados en codigo + los tests de adaptador, fuera del diff y verdes |
| R11 | cubierto | mi mutacion (dos archivos, dos carpetas) → roja con mensaje util; revertida → verde |
| R12 | cubierto | los 5 casos sinteticos + el de regresion de stripComments + derivacion con escapeRegExp |
| R13 | cubierto | route-role-rules.test.ts: tres filas exactas, en orden, mismo rol |
| R14 | cubierto | guard-middleware-edge.test.ts corrido por mi: 7/7 |
| R15 | cubierto | diff de tests/ y e2e/ revisado linea a linea: solo import + identificador, salvo las dos excepciones declaradas y respaldadas por decision humana |
| R16 | cubierto | inventario-schema.test.ts fuera del diff y verde en la suite |
| R17 | cubierto **por comprobacion manual** (hallazgo 2) | los tres archivos leidos; ADMIN_ROLE_NAME sin ocurrencias en produccion |

**16 de 17 con test ejecutable que muerde; R2 parcial. Ningun requisito sin cubrir.**

## Veredicto final

**OK — APROBADO.** El refactor cierra las dos duplicaciones sin mover una sola linea de
comportamiento: cada modulo conserva su jerarquia de errores, los siete adaptadores driving siguen
atrapando y serializando igual, el valor de la cadena no cambia, el borde carga —y ademas
adelgaza—, y entra una guardia que muerde de verdad contra la reincidencia. Los cinco hallazgos son
`menor` y ninguno pertenece al nucleo de la ficha.
