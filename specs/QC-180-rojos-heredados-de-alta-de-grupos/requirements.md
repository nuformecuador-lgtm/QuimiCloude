# QC-180 — rojos-heredados-de-alta-de-grupos · requirements.md

> **Zona:** `frontend` · **Complejidad:** `low` · **depends_on:** — ·
> **Rama:** `feature/QC-180-rojos-heredados-de-alta-de-grupos`
>
> **Alcance.** Desde el 2026-10-02, `dev` tiene tres archivos de test en rojo. Los trajo `897a4f91`
> (feat(grupos,usuarios): alta de grupo con miembros + botones de alta alineados con el título), un
> commit que no pasó por el arnés. Viven en `tests/baseline-rojos.json` (añadidos en `ff4cd933`,
> QC-174, PR #139, por decisión humana):
>
> - `tests/unit/recetas/scope.test.ts`
> - `tests/unit/recetas/module-contract.test.ts`
> - `tests/unit/navegacion/pantallas-exigen-permiso.test.tsx`
>
> **Causa medida (ficha y worktree).** `897a4f91` subió el disparador del alta de pedido
> (`<OrderSheet />`) a la cabecera, junto al título. Para eso, `app/(private)/pedidos/page.tsx` pide
> ahora una sola vez los catálogos del panel (`loadFormCatalogs`): la primera página de recetas
> (`listRecipesAction`), las unidades (`listUnitsAction`) y el puente masa-volumen
> (`getMassVolumeBridgeAction`). Esas lecturas las hacía antes `OrderListSection`.
> - Los dos guardianes de recetas ven ahora un `page.tsx` fuera de la carpeta de fórmulas cuyo código
>   menciona recetas, y lo cuentan como **segunda pantalla de recetas**.
> - `pantallas-exigen-permiso` mockea `listRecipesAction` y `getMassVolumeBridgeAction` con un
>   `vi.fn()` que devuelve `undefined`. El caso «`/pedidos` se sirve con el permiso» cae con
>   `TypeError: Cannot read properties of undefined (reading 'status')`.
>
> **Salida (ficha):** los tres archivos en verde y sus entradas borradas de `tests/baseline-rojos.json`.
>
> **Lo que NO entra.** El alta de grupos y los botones de alta de usuarios y grupos (el resto de
> `897a4f91`). Ningún otro rojo del baseline. Cambiar `lib/modules/recetas/**`. Cambiar la lista
> cerrada de specs E2E de recetas de `scope.test.ts`.
>
> Esta ficha no tiene semilla de `/afinar-feature`: `spec_author` transcribe la tabla de abajo de la
> descripción de la ficha en `feature_list.json`, sin reinterpretarla.

## Decisiones cerradas (no reabrir)

| # | Fuente | Decisión |
|---|---|---|
| D1 | Descripción de QC-180 | Salida: los tres archivos (`scope.test.ts`, `module-contract.test.ts`, `pantallas-exigen-permiso.test.tsx`) en verde y sus tres entradas borradas de `tests/baseline-rojos.json`. |
| D2 | Descripción de QC-180 | Hay que decidir si la llamada de pedidos a `listRecipesAction` es intencionada (se actualizan los mocks y la lista cerrada del guardián, y se enmienda el spec dueño) o si sobra y se quita del código. «No se da por supuesta ninguna de las dos.» La decisión es **P1**, abajo. |
| D3 | Ficha y `docs/gate.md` | Las tres entradas se **borran**. No se reemplazan por otra entrada ni se apaga ningún caso con `skip`/`todo`. |
| D4 | Humano, 2026-10-08 (cierra P1) | Opción A. La llamada de pedidos a `listRecipesAction` es intencionada y se queda. Se nombra `app/(private)/pedidos/page.tsx` **exacto** en la lista cerrada de los dos guardianes de recetas. Al test de permisos se le añaden los mocks que faltan, incluido `getMassVolumeBridgeAction`. La opción B queda descartada. |
| D5 | Humano, 2026-10-08 (cierra P2) | Se añaden notas de enmienda fechadas en QC-25 (R44), QC-24 (T10) y QC-35. |

## Requisitos (EARS)

> Cada requisito cita entre corchetes la decisión que cubre. D5 son notas en specs ajenos, no
> comportamiento. Se cumple con T6 de `tasks.md` y lo verifica el reviewer sobre el diff, no un test.
>
> «Mencionar recetas» significa lo mismo que en los dos guardianes: el patrón `/recet|recipe/i`
> sobre el **código sin comentarios** o sobre la ruta del archivo.

### Los tres archivos vuelven a verde

- **R1** [D1] — `tests/unit/recetas/scope.test.ts` DEBE pasar entero, sin `skip`, `todo` ni casos
  borrados.
- **R2** [D1] — `tests/unit/recetas/module-contract.test.ts` DEBE pasar entero, sin `skip`, `todo`
  ni casos borrados.
- **R3** [D1] — `tests/unit/navegacion/pantallas-exigen-permiso.test.tsx` DEBE pasar entero, sin
  `skip`, `todo` ni casos borrados. Ninguna de las pantallas que hoy enumera puede salir de la
  lista `PAGINAS`.
- **R4** [D1, D3] — `tests/baseline-rojos.json` NO DEBE contener ninguna entrada para esos tres
  archivos. Las demás entradas DEBEN quedar idénticas, y el comparador del gate completo
  (`scripts/comparar-baseline-rojos.mjs`) DEBE seguir aceptando el archivo.

### El corte por permiso de `/pedidos` cubre sus lecturas nuevas

- **R5** [D1] — CUANDO se invoca la pantalla `/pedidos` con una sesión que no tiene
  `pedidos.consultar` (otro permiso o el conjunto vacío), el sistema NO DEBE invocar ninguna de las
  lecturas de catálogo que esa pantalla hace en su propio cuerpo. Son tres: el listado de recetas,
  el de unidades y el puente masa-volumen.
- **R6** [D1] — CUANDO se invoca `/pedidos` sin sesión, el sistema DEBE redirigir al login y NO DEBE
  invocar ninguna de esas tres lecturas.
- **R7** [D1] — SI se invoca `/pedidos` con `pedidos.consultar` y las tres lecturas de catálogo
  responden con error, ENTONCES la pantalla DEBE servirse sin lanzar, sin 404 y sin redirigir.

### Los guardianes de recetas siguen mordiendo

- **R8** [D2] — SI un `page.tsx` o `layout.tsx` de `app/`, fuera de la carpeta que deriva de
  `FORMULAS_ROUTE`, menciona recetas y su ruta no está nombrada **exacta** en la lista cerrada de
  pantallas autorizadas, ENTONCES `scope.test.ts` y `module-contract.test.ts` DEBEN fallar los dos.
  La lista nombra archivos, nunca carpetas, prefijos ni globs.
- **R9** [D2] — SI un archivo de la lista cerrada importa de `lib/modules/recetas` algo que no sea el
  barrel (`@/lib/modules/recetas`) ni un adaptador `adapters/driving/`, ENTONCES
  `module-contract.test.ts` DEBE fallar. Estar en la lista no exime de consumir solo el contrato
  público.

### La llamada de pedidos se queda (D4)

- **R10** [D2, D4] — La lista cerrada de pantallas autorizadas fuera de la carpeta de fórmulas
  DEBE ser **exactamente** `app/(private)/asignacion/[id]/page.tsx` y `app/(private)/pedidos/page.tsx`,
  con el mismo contenido en `scope.test.ts` y en `module-contract.test.ts`.
- **R11** [D2, D4] — La pantalla `/pedidos` DEBE seguir pidiendo la primera página de recetas una
  sola vez por render de la página y DEBE entregársela al disparador de la cabecera y a la sección de
  la lista. Esta ficha NO DEBE cambiar ningún archivo bajo `app/` ni bajo `lib/`.

## Preguntas abiertas

Ninguna. Las dos se cerraron el 2026-10-08 (D4 y D5). Se conservan abajo como registro de lo que se
decidió.

- **P1 — ¿La llamada de `/pedidos` a `listRecipesAction` es intencionada?** *Cerrada (D4): opción A.*
  La ficha dice que se decide «con el autor del commit» `897a4f91`. Había dos salidas:
  - **A.** Se queda. Se nombra `app/(private)/pedidos/page.tsx` en la lista cerrada de los dos
    guardianes, se completan los mocks y se anota la enmienda en los specs dueños.
  - **B.** Sobra. `page.tsx` deja de pedir recetas y el selector carga su primera página por su
    cuenta.

  **Recomendación de `spec_author`: A.** Hay cuatro motivos, medidos en el worktree:
  1. Pedidos **ya consumía** `listRecipesAction` antes de `897a4f91`, aprobado por QC-35 R31 el
     2026-09-06. Lo llaman `app/(private)/pedidos/components/recipe-picker.tsx:182` para la búsqueda
     y `OrderListSection` para la primera página. El commit **mueve** la llamada de un componente a la
     página. No abre un consumo nuevo.
  2. La intención está escrita en el propio código. El JSDoc de `page.tsx` explica que los catálogos
     «se piden también AQUÍ, UNA SOLA VEZ» para el disparador de la cabecera y para la sección. Eso es
     lo que hace falta para alinear el botón de alta con el título, que es el título del commit.
  3. Ya hay precedente con la misma forma: `app/(private)/asignacion/[id]/page.tsx` se nombró exacto
     en los dos guardianes el 2026-09-17, sin abrir carpetas ni patrones.
  4. B es mucho más grande y cambia comportamiento. Toca 8 archivos de `app/(private)/pedidos/`, que
     pasan `RecipePickerPage` por props, y unos 12 tests de `tests/unit/pedidos-ui/`. Además, el
     selector arrancaría vacío hasta que llegue la primera página.

- **P2 — ¿Qué specs dueños se enmiendan?** *Cerrada (D5): los tres.* Lleva una nota fechada cada
  uno de estos:
  - `specs/QC-25-crud-de-recetas/requirements.md`: R44 es el caso de `scope.test.ts`.
  - `specs/QC-24-modelo-recetas/requirements.md`: `module-contract.test.ts` es su T10.
  - `specs/QC-35-pantalla-de-pedidos/requirements.md`: deja escrito que la página carga los catálogos
    del alta y monta el disparador en la cabecera. Ese comportamiento entró con `897a4f91` sin spec.

  QC-75 (`pantallas-exigen-permiso`) no se enmienda: completar los mocks no cambia ningún requisito
  suyo.
