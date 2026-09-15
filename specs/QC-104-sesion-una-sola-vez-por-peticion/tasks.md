# QC-104 — sesion-una-sola-vez-por-peticion · tasks.md

> Cada task lista **los archivos que toca**. `[P]` = se puede hacer en paralelo con las demas `[P]`
> de su tanda. Ningun subagente corre la suite completa: cada task cierra con `pnpm typecheck`,
> `pnpm lint` y `pnpm exec vitest related --run <sus archivos>`. El gate lo corre el leader.
>
> **Conflictos declarados con QC-81** (`backend`, `in_progress`):
> - **T3** toca `lib/composition/index.ts` (~8 lineas: import + `:297-344`). QC-81 T7 puede tocarlo.
> - **T4** toca `lib/modules/inventario/adapters/driving/product-actions.ts`, en `currentActor`
>   (`:150-161`) + un import. QC-81 T10 toca el mismo archivo en `buildCreateProductCandidate`.
>
> Lo valida el leader antes de lanzar T3 y T4.

## Tanda 0 — medir ANTES de cambiar nada

- [ ] **T1 — Conteo en ejecucion, ANTES (R16).** Sin dependencias. **Debe hacerse antes de T3 y T4
      sobre este arbol**, o sobre un checkout del merge-base con `dev`.
      Archivos:
      - `scripts/medir-sesion-por-peticion.ts` (nuevo): el modo «conteo»;
      - `progress/medicion_QC-104-sesion-una-sola-vez-por-peticion.md` (nuevo).

      Comprobar cual de las dos vias de `design.md > 6.1` esta disponible en la base local
      (`pg_stat_statements` o `log_statement`) y dejarlo escrito. Con `next build && next start`,
      contar las lecturas de la ficha en `/configuracion/usuarios`, `/pedidos`,
      `/configuracion/unidades` y en crear una unidad.
      **Hecho:** el archivo de medicion tiene las secciones `Metodo`, `Conteo en ejecucion` (columna
      «antes» rellena, con la cifra real que corrige o confirma H3) y `Tiempos` con la linea
      `PENDIENTE: Pregunta abierta 1`. Ninguna linea de log anadida a la aplicacion.

## Tanda 1 — el mecanismo

- [ ] **T2 [P] — Helper de ambito de peticion (R4-R7, R9, R20).** Sin dependencias de codigo.
      Archivos:
      - `lib/shared/request-scope.ts` (nuevo);
      - `tests/unit/shared/request-scope.test.ts` (nuevo).

      `createRequestScope({ renderStore })`, y la instancia de produccion con
      `cache(() => new Map())` de `react` y `AsyncLocalStorage` de `node:async_hooks`
      (`design.md > 2.3`). Casos de `design.md > 5.1`, incluida la prueba de fuente de imports.
      **Hecho:**
      - los casos de `> 5.1` en verde;
      - `tests/guards/guard-arquitectura-modulos.test.ts` en verde (`lib/shared` sigue siendo hoja);
      - `package.json` sin cambios.

- [ ] **T3 — Cableado en la composicion (R1, R11, R12).** Depende de T2.
      Archivos: `lib/composition/index.ts`, **solo** una linea de import y `:297-344`
      (`design.md > 2.5`).
      `const resolveSessionOncePerRequest = requestScoped(() => resolveSession());` detras de `:301`.
      Las dos proyecciones de `:328` y `:330` pasan a llamarla. Comentario con QC-104 y la razon.
      **Hecho:**
      - `tests/unit/composition/identity-facade.test.ts` y `tests/unit/identity/resolve-session.test.ts`
        en verde sin tocarlos;
      - `git diff` del archivo con ~8 lineas, en esos dos bloques y en ninguno mas.

- [ ] **T4 [P] — Ambito explicito en los 8 `currentActor` (R3).** Depende de T2. Paralela a T3.
      Archivos:
      - `lib/modules/unidades/adapters/driving/unit-actions.ts`
      - `lib/modules/inventario/adapters/driving/product-actions.ts` (**conflicto QC-81**, ver cabecera)
      - `lib/modules/inventario/adapters/driving/presentation-actions.ts`
      - `lib/modules/identity/adapters/driving/credential-setup-actions.ts`
      - `lib/modules/asignaciones/adapters/driving/order-assignment-actions.ts`
      - `lib/modules/identity/adapters/driving/work-group-actions.ts`
      - `lib/modules/identity/adapters/driving/user-actions.ts`
      - `lib/modules/identity/adapters/driving/role-actions.ts`

      En cada uno, el `Promise.all([identity.getSessionUser(), identity.getSessionContext()])` se
      envuelve en `runInRequestScope` (`design.md > 2.6`): un import y dos lineas por archivo.
      Antes de editar, confirmar por archivo que cada accion exportada llama a `currentActor()` una
      sola vez por invocacion. Si alguna lo llama mas, **no se arregla aqui**: se anota en
      `progress/impl_...` y se sube al leader.
      **NO** se tocan `recipe-actions.ts`, `supplier-actions.ts`, `supplier-catalog-actions.ts`,
      `order-actions.ts` ni `login-action.ts` (`design.md > 1`, `> 2.7`).
      **Hecho:**
      - los tests existentes de las 8 acciones en verde sin tocarlos
        (`pnpm exec vitest related --run <los 8 archivos>`);
      - la guardia de arquitectura en verde.

## Tanda 2 — el conteo del gate

- [ ] **T5 — Conteo por pantalla (R1, R2, R9, R10, R12, R14, R15).** Depende de T3 y T4.
      Archivos: `tests/unit/identity/session-once-per-request-render.test.tsx` (nuevo).
      Montaje y casos de `design.md > 5.2`:
      - composicion real importada una vez en `beforeAll` con plazo propio;
      - dobles de `session-cookie`, `session-user-prisma`, `@/lib/shared/db/prisma`, `next/headers`
        y `next/navigation`;
      - `@/lib/shared/request-scope` sustituido por el `createRequestScope` real con un
        `renderStore` controlado por el test.

      Cubre layout + `UsuariosPage`, `UnidadesPage` + `UnitListSection`, y la seccion de `/pedidos`
      con las acciones que invoca al pintarse.
      **Hecho:**
      - `findActiveById` exactamente 1 por pantalla y 2 con dos peticiones;
      - con el fallo: 1 lectura y 1 linea de registro;
      - camino feliz sin `console.*`;
      - el archivo pasa solo y con `vitest related`.

- [ ] **T6 [P] — Conteo por Server Action (R3, R5, R7, R11, R13, R15).** Depende de T3 y T4.
      Paralela a T5.
      Archivos: `tests/unit/identity/session-once-per-request-actions.test.ts` (nuevo).
      Casos de `design.md > 5.3`:
      - una accion por cada uno de los 8 archivos de T4, con entrada que llegue a `currentActor`;
      - dos invocaciones → 2 lecturas;
      - lectura sin ambito con la cookie cambiando entre llamadas;
      - prueba de fuente de que `login-action.ts` no abre ambito;
      - `length === 0` de las dos proyecciones.

      **Hecho:** `findActiveById` exactamente 1 por invocacion en los 8, y los demas casos en verde.

- [ ] **T7 — Prueba de que el conteo muerde (R15).** Depende de T5 y T6.
      Archivos: `progress/impl_QC-104-sesion-una-sola-vez-por-peticion.md` (nuevo o ampliado). El
      codigo de produccion **se restaura** al terminar.
      - Quitar a mano `requestScoped` del cableado de T3 → T5 y T6 rojos.
      - Quitar `runInRequestScope` de **un** `currentActor` → su caso de T6 rojo.
      - Restaurar desde copia, no con `git checkout` (`docs/verification.md > Probar que muerde`).

      **Hecho:**
      - la salida roja de las dos mutaciones y la verde tras restaurar, pegadas en el `impl_`;
      - `git diff` de produccion identico al de T3 y T4.

## Tanda 3 — medir DESPUES y cerrar

- [ ] **T8 — Conteo en ejecucion, DESPUES (R16).** Depende de T3, T4 y T1.
      Archivos: `progress/medicion_QC-104-sesion-una-sola-vez-por-peticion.md`.
      El mismo metodo de T1, sobre la rama. Si algun numero «despues» es mayor que 1 en una pantalla
      que no sea respuesta a un POST, **se para y se sube al leader**: contradiria `design.md > 2.2`.
      **Hecho:** columna «despues» rellena para las tres pantallas y el guardado, sin umbral y sin
      recomendacion (R19).

- [ ] **T9 — Tiempos antes y despues (R17, R18).** **BLOQUEADA por la Pregunta abierta 1.** Depende
      de T8 y de que el humano responda.
      Archivos:
      - `scripts/medir-sesion-por-peticion.ts` (modo «tiempos»);
      - `progress/medicion_QC-104-sesion-una-sola-vez-por-peticion.md`.

      Metodo de `design.md > 6.2`. «Antes» sobre un checkout del merge-base con `dev`, «despues»
      sobre la rama, alternando corridas. Mientras siga bloqueada, la seccion `Tiempos` conserva
      `PENDIENTE: Pregunta abierta 1`.
      **Hecho:**
      - mediana y p95 de las tres pantallas y del guardado, antes y despues, con el metodo;
      - la linea `PENDIENTE` retirada;
      - ningun umbral.

      **La ficha no puede pasar a `done` con esta task abierta** salvo decision humana escrita.

- [ ] **T10 [P] — Test del artefacto de medicion (R16-R19).** Depende de T8.
      Archivos: `tests/unit/identity/session-measurement-artifact.test.ts` (nuevo).
      Afirmaciones de `design.md > 5.6`. Tiene que pasar tanto con `Tiempos` en `PENDIENTE` como con
      numeros, nunca con las dos cosas.
      **Hecho:** en verde contra el archivo real, y rojo con dos mutaciones de copia (quitar
      `Metodo`; anadir una linea con «umbral»), probadas y restauradas.

- [ ] **T11 [P] — Nota en la arquitectura.** Depende de T3.
      Archivos: `docs/architecture.md`, solo `## Permisos y autenticacion`, parrafo «El layout
      privado sigue siendo la ultima linea de defensa».
      Una o dos frases: la sesion se resuelve una vez por peticion (QC-104). Layout, pagina y las
      acciones invocadas al pintar comparten esa lectura, que nunca se reutiliza entre peticiones.
      **Hecho:** `tests/guards/guard-arquitectura-modulos.test.ts` (bloque 12 lee este documento) en
      verde; el parrafo no promete nada que no pruebe T5.

- [ ] **T12 — Mapa de trazabilidad.** Depende de T5, T6, T7, T8 y T10 (y de T9 si se desbloquea).
      Archivos: `progress/impl_QC-104-sesion-una-sola-vez-por-peticion.md`.
      Mapa `R1..R22 → test` segun `design.md > 9`, con el nombre exacto de cada caso.
      R8 y R21 (`e2e/session.spec.ts`) y R22 apuntan a tests **existentes**. El E2E lo corre el
      **leader** al cerrar la feature, no el subagente.
      **Hecho:**
      - los 22 requisitos con al menos un test;
      - las Preguntas abiertas 1 y 2 citadas con su estado;
      - `typecheck` y `lint` en verde.
