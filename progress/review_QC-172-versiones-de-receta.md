# Review — QC-172 versiones-de-receta

- Rama: `feature/QC-172-versiones-de-receta`, HEAD `acd9c9e7`, comparada contra `origin/dev`.
- Revisado el 2026-10-02 por el reviewer. No se ha editado ningun archivo de codigo ni de test.
- Grafo: no se uso. Todo se midio con git diff, Grep y Read sobre el worktree.

## Checklist

### Especificacion
- [x] `requirements.md` con R1–R45 en EARS. Las preguntas abiertas P1–P3 estan resueltas en F1.4.
- [x] `design.md` con alternativas descartadas (§8, 8 alternativas, cada una con su motivo).
- [x] `tasks.md`: T0–T14, todas `[x]`.

### Trazabilidad
- [x] R1–R44: todos tienen al menos un caso con `R<n>` en el nombre que comprueba de verdad lo que
  pide el requisito. Se miraron a mano los de mas riesgo:
  - R6 y R22: `update-recipe-version.test.ts`. El de R22 hace un viaje de ida y vuelta con estado:
    `getRecipe` → editar → `getRecipe`.
  - R14, R15, R17–R20, R23 y R24: `recipe-versions-repository.int.test.ts`, contra Postgres. El de
    R18 fuerza el fallo con un trigger.
  - R26–R29: `recipe-version-select.test.tsx` y `order-form.test.tsx`.
  - R34 y R35: `update-order.test.ts`.
  - R44 y R30: `e2e/versiones-de-receta.spec.ts`. Comprueba en Postgres que se reservan A y C, y
    que B no.
- [~] R45: no hay ningun caso con `R45` en el nombre. Lo trato como aceptable (ver m1).
- [x] `progress/impl_QC-172-versiones-de-receta.md` tiene el mapa R → test (T14) y apunta en que se
  aparta de la tabla de `tasks.md`.

### Calidad de codigo
- [x] `pnpm run typecheck`: limpio (en mi corrida).
- [x] `pnpm run lint`: 0 errores y 8 avisos, todos de antes.
- [x] `pnpm test`, en mi corrida de `./init.sh` completo: 7 archivos en rojo. 5 estan en
  `tests/baseline-rojos.json`. Los otros 2 fallan por timeout bajo carga:
  - `documentos/module-contract.test.ts`: test de 20 s.
  - `identity/session-once-per-request-render.test.tsx`: hook `beforeAll` de 60 s, en el import
    dinamico de `@/lib/composition`.

  Al correrlos solos pasan los dos (`Test Files 2 passed`, `Tests 32 passed`). El gate del
  implementer sobre `8c33974e` salio `init OK` con solo los 5 rojos del baseline. Entre `8c33974e`
  y HEAD solo cambian la bitacora y `tasks.md`. Ver m6.
- [x] E2E: hay uno porque se toca la reserva de material, que es flujo critico. Pasa en chromium
  y webkit (`progress/e2e_QC-172_versiones-de-receta.log`).
- [x] Multiplataforma: el componente nuevo usa el `Select` de `components/ui` que ya estaba,
  `min-h-11 min-w-11` y `text-base` en el disparador y en las opciones, y no tiene `hover:`,
  `100vh` ni `h-screen`. El `text-sm` del diff solo esta en la etiqueta y en el mensaje de error,
  no en un control de entrada.
- [x] Dependencias: el diff de `package.json` y `pnpm-lock.yaml` contra `origin/dev` sale vacio
  (verificado por mi).

### Datos y seguridad
- [x] No hay tabla nueva. Se añade una columna y una FK a la propia tabla `recipes`, que ya tiene
  `company_id`, RLS y FORCE. `guard-empresa-en-esquema` y `guard-rls-force` estan en verde.
- [x] Cada consulta nueva filtra por empresa:
  - `createRecipeVersion`: SQL crudo con `company_id` y `FOR SHARE`.
  - `listAliveRecipeVersions` y la baja en cascada: `recipeCompanyScope(scope)`.
  - `replaceAliveRecipeWithPropagation`: el `updateMany` de cada version lleva el ambito y
    `parentRecipeId: id` antes de tocar sus lineas.
  - `findIdsMatchingName`: el `OR` va dentro del `AND` del ambito.

  `guard-ambito-empresa-recetas` se amplio con mutantes que mueren si se quita el ambito o el
  `FOR SHARE`. El rechazo cruzado tiene tests (R40) en
  `recipe-versions-repository.int.test.ts` y `company-scope-queries.int.test.ts`.
- [x] Los permisos se validan en el service. Los tres casos de uso nuevos llaman a
  `requirePermission` antes de leer (R38). El pedido conserva sus permisos (R39). No se toca el
  catalogo de permisos.
- [x] Ningun dato de negocio se lee con el cliente de Supabase.
- [x] La migracion tiene `down.sql`. El `down.sql` aborta entero si hay versiones guardadas (R43),
  y hay test estatico y de integracion.
- [x] No hay secretos ni datos que cambien entre entornos escritos en el codigo.
- [x] No se tocan webhooks.

### Modulos hexagonales
- [x] `pedidos` solo importa `RecipeRef` desde `@/lib/modules/recetas`.
- [x] Las acciones se importan desde `adapters/driving` en `app/`, igual que el resto de la
  pantalla.
- [x] `domain/` no importa Prisma ni el framework.
- [x] La logica esta en el dominio (`order-recipe.ts`, `recipe-version.ts` y los casos de uso).
  El adaptador solo invoca `propagateLines` dentro de la transaccion, tal como justifica
  design §4 y §8.5.
- [x] `guard-arquitectura-modulos` esta en verde.

### Comentarios (produccion)
- [x] Ninguna linea añadida o modificada en `app/`, `lib/` o `db/` cita `QC-<n>`, `R<n>`,
  `design.md` ni «decision cerrada» (comprobado con grep sobre el diff). El diff incluso quita
  citas que habia antes en las lineas que toca.

## Puntos que marco el implementer

1. **R45 sin caso con su numero**: aceptable, ver m1.
2. **R6 y R22 solo en `update-recipe-version.test.ts`**: correcto, porque R6 y R22 tratan de editar
   una version y ese es el caso de uso que lo hace. `update-recipe.test.ts` cubre R7 (rechazar una
   version), que es lo que le toca. La tabla de `tasks.md > T14` quedo desfasada y la bitacora lo
   corrige. No es hallazgo.
3. **R35 solo en un `it.each`**: suficiente. Son dos casos reales, «por revisar» y «de baja», y cada
   uno comprueba lo mismo:
   - que no se consulta el catalogo;
   - que `recipeId` sigue siendo la version;
   - el coste;
   - la necesidad de material.

   No es hallazgo.
4. **Tests tocados fuera del mapa de T12**: es legitimo. Las dos listas cerradas de specs E2E
   exigen dar de alta el spec nuevo, que es su forma de crecer por diseño. Lo que si es hallazgo
   menor es la forma de los comentarios añadidos (m3).
5. **El estado del formulario guarda solo `versionId`**: aceptable. El nombre no se usa en el
   formulario y las props del componente coinciden con §7. Ver m4.

## Hallazgos

Ninguno bloqueante.

- **m1 (menor) — R45 sin caso con su numero.** `tasks.md:219` pide que «cada `R1`–`R45` tenga un
  test con su `R<n>` en el nombre», y R45 no lo tiene. Lo acepto porque R45 restringe el diff, no
  describe un comportamiento. Lo he comprobado yo: el diff de `package.json` y `pnpm-lock.yaml`
  contra `origin/dev` sale vacio.

  `guard-dependencias-aprobadas` sola no lo demostraria, porque solo rechaza dependencias **no
  aprobadas**. La prueba real es el diff vacio. Si se quiere cerrar del todo, haria falta un caso
  `R45` que compare los nombres de `dependencies` y `devDependencies` con el merge-base, como hizo
  QC-101 R22. No hace falta para fusionar.
- **m2 (menor) — La tabla R → test de `tasks.md` no coincide con los tests.**
  `specs/QC-172-versiones-de-receta/tasks.md:195` sigue citando `update-recipe.test.ts` para R6 y
  R22. La bitacora (`impl_QC-172-versiones-de-receta.md:838-840`) ya lo explica. Conviene enmendar
  la tabla para que spec y tests no se contradigan.
- **m3 (menor) — Comentarios de tests que citan la ficha y pasan de 5 lineas.** La regla de
  comentarios vale tambien para los tests: el `R<n>` va solo en el nombre del caso. Casos:
  - `tests/guards/guard-identificador-de-request.test.ts:214-221`: bloque de 8 lineas que cita
    «QC-172 R44» y «QC-71 R21».
  - `tests/unit/recetas/scope.test.ts:236-245`: bloque de 10 lineas que cita QC-172, R44, R30 y la
    ruta de `requirements.md`.
  - Tambien hay citas `QC-<n>` en comentarios añadidos de `guard-ambito-empresa-recetas.test.ts`,
    `errores/catalogo.test.ts`, `recetas/module-contract.test.ts`, `pedidos/get-order.test.ts` y
    `recipe-versions-repository.int.test.ts`.

  Se imita el estilo que ya tienen alrededor, que es justo lo que `docs/conventions.md` pide no
  hacer.
- **m4 (menor) — Desviacion de design §7 sin enmienda en el design.** El formulario guarda solo
  `versionId` en vez de `{ id; name }`. Esta anotado en la bitacora
  (`impl_QC-172-versiones-de-receta.md:739-742`), pero `design.md:334` sigue diciendo lo otro. Es
  inocuo y conviene una linea de enmienda.
- **m5 (menor) — Limpieza de comentarios mezclada con el cambio en el mismo commit.**
  `lib/modules/pedidos/adapters/driving/order-actions.ts:150-152` reescribe el comentario de
  `readOptionalFormString`, una funcion que el diff no cambia, en el commit `cfd98d6d` (T8), que es
  de codigo. Pasa lo mismo, en menor grado, con el comentario de `ORDER_BUSINESS_FIELDS` en
  `order-form.tsx:131-135`; ahi la linea si se toca, asi que eso es correcto.
- **m6 (menor) — Gate inestable por timeouts bajo carga.** En la corrida completa del reviewer:
  - `tests/unit/documentos/module-contract.test.ts:262` agoto su limite de 20 s;
  - `tests/unit/identity/session-once-per-request-render.test.tsx:235` agoto su limite de 60 s;
  - la duracion total fue de 904 s, de los que 2713 s son de import sumados entre workers.

  Los dos pasan en aislado, y el gate del implementer no los tuvo en rojo. No lo atribuyo al cambio,
  aunque `lib/composition/index.ts` crece un poco. Si se repite en otra corrida, merece una ficha
  aparte sobre el tiempo de import de `@/lib/composition` en esos tests.
- **m7 (menor) — Logs del gate sin commitear.** En el worktree hay tres logs sin seguimiento
  (`progress/gate_QC-172_completo.log`, `gate_QC-172_completo_intento1.log` y
  `gate_QC-172_rezagados.log`). La bitacora los cita, asi que hay que commitearlos o quitar la
  referencia antes del PR.

## Veredicto

**OK** (aprobado). 0 bloqueantes, 7 menores.

Antes de fusionar, el leader corre `./init.sh` completo como exige la regla 5. Si vuelven los dos
timeouts de m6, repetir los dos archivos en aislado antes de tratarlos como regresion.
