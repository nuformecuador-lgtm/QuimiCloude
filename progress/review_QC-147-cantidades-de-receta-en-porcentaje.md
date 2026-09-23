# QC-147 — cantidades-de-receta-en-porcentaje · review (F2.2)

> Reviewer, 2026-09-22. Worktree `.worktrees/QC-147-cantidades-de-receta-en-porcentaje`, rama
> `feature/QC-147-cantidades-de-receta-en-porcentaje`, HEAD `646a88e1` (19 commits sobre `origin/dev`).
> Contra `specs/QC-147-cantidades-de-receta-en-porcentaje/` (R1–R26, D1–D16, T1–T12), `docs/` y
> `CHECKPOINTS.md`. **No he corrido `./init.sh` ni la suite completa**: los corre el leader ahora.
> Los rojos de `module-contract.test.ts` y `recipe-route-contract.test.ts` están en
> `tests/baseline-rojos.json` y no cuentan como hallazgo.

## Veredicto

**OK (aprobado), con condición**: 0 mayores, 11 menores. La condición es la de T12, que no es un
defecto de la implementación: `./init.sh` completo en verde (lo está corriendo el leader) y el E2E
`e2e/recetas-porcentaje.spec.ts` en verde en Chromium y WebKit, porque la ficha toca importes. Si
alguno de los dos sale rojo, este veredicto no vale.

**Aviso para F2.3 (menor n.º 1):** al sincronizar con `origin/dev`, el test estático de la propia
migración se pone rojo. Hay que renumerar la migración, y no es un conflicto trivial.

## Lo que he corrido yo

- `pnpm exec vitest run` sobre 15 archivos unitarios de la feature (recipe-percentage, recipe-input,
  recipe-service, authorization, recipe-lines-percentage-migration, order-cost,
  resolve-ingredients-cost, order-ingredients-table, get-assigned-order-execution,
  order-execution-lines, order-execution-screen, recipe-lines-sum, recipe-form, recipe-form-payload,
  product-catalog): **15 archivos, 236 tests en verde**.
- `git merge-tree HEAD origin/dev`: conflictos en `feature_list.json` y en
  `tests/guards/guard-identificador-de-request.test.ts`.
- Búsqueda en el diff de producción de comentarios que citen `QC-`, `R<n>`, `D<n>`, `design.md` o
  «decisión cerrada»: **ninguno**.
- Integración y E2E: no los he corrido (el E2E todavía no se ha ejecutado, lo corre el leader).

## Checklist

### Especificación
- [x] requirements.md con requisitos EARS R1–R26 y D1–D16.
- [x] design.md con alternativas descartadas (§11, cinco).
- [ ] tasks.md todo `[x]`: **T12 abierta** (el gate completo, que corre el leader). T10 está
      marcada `[x]` aunque su «Hecho cuando» («pasan en Chromium y WebKit») todavía no se ha cumplido
      (menor n.º 11).

### Trazabilidad (mapa de `progress/impl_…md`, comprobado caso a caso)
- [x] Todos los R1–R26 tienen al menos un test que existe y prueba de verdad lo que pide su R.
      He comprobado los nombres citados en los archivos. Los flojos, abajo:
  - R7: el test del mapa (`authorization.test.ts › R16`) usa una entrada **válida**, y los de
    `recipe-service.test.ts › R7` solo afirman `.rejects.toThrow()`. Ninguno de los dos detecta
    que alguien mueva `requirePermission` detrás del `safeParse`. **Sí** lo detecta
    `authorization.test.ts › «QC-74 R12 — con entrada invalida, el rechazo es por PERMISO y no por
    validacion»`, cuya `RECETA_INVALIDA` lleva `lines: []` (suma 0,00): cubre R7, pero el mapa no
    lo cita (menor n.º 3).
  - R8: el caso de integración es vacío (menor n.º 2). Lo cubre de verdad el test estático del SQL.
  - R9: sin test automatizado del rollback; se verificó a mano (menor n.º 4).
  - R22: el E2E está escrito y cubre los cuatro escenarios de `design.md > 13`, pero **no se ha
    ejecutado**.
- [x] El mapa `R<n> -> test` está en la bitácora.

### Calidad de código
- [~] typecheck / lint: según la bitácora, en verde. Los confirma el `./init.sh` del leader.
- [x] Los tests unitarios que he corrido están en verde.
- [x] La ficha toca importes y **hay E2E** (escenario 3: `orders.ingredients_cost = 40.0000`).
      Falta ejecutarlo.
- [x] Multiplataforma. El campo de porcentaje es `type="text"` + `inputMode="decimal"`, con
      `text-base` y `min-h-11`; el cambio frente a `type="number"` está justificado en design §8.1.
      No hay `100vh` ni `:hover` como única vía, y el indicador de suma es texto con `role="status"`.
      Se borra un control (`UnitPicker`) y no se añade ninguno. El `md:text-sm` que trae el `Input`
      base es anterior a esta ficha.
- [x] Dependencias: `package.json`, `pnpm-lock.yaml` y `docs/dependencias.md` no se tocan. Design
      §3 justifica la aritmética `BigInt` propia: no hay librería de decimales aprobada y el repo
      ya resuelve igual el mismo tipo de dato.

### Datos y seguridad
- [x] No hay tabla ni modelo nuevo. `recipe_lines` sigue en la lista de exentas de `company_id`.
      Las consultas nuevas (`products.findRefs` en `resolve-ingredients-cost.ts` y en
      `get-assigned-order-execution.ts`) filtran por `companyId` / `actor.companyId`.
- [x] Permiso en el service: `requirePermission(actor, 'recetas.modificar')` sigue siendo la
      primera línea de `createRecipe` y `updateRecipe`, antes del `safeParse` y de todo puerto.
      Quitar `units: UnitCatalog` no cambia el orden.
- [x] RLS: la migración abre y cierra el paréntesis `NO FORCE` → `ENABLE` + `FORCE`, sin crear
      ninguna policy. El `down.sql` hace lo mismo.
- [x] Acceso a datos solo por Prisma.
- [x] `down.sql` presente y simétrico. `NO FORCE` → `DELETE` → quita el CHECK y `percentage` →
      `quantity DECIMAL(14,4) NOT NULL` + `recipe_lines_quantity_positive` → `unit_id UUID NOT NULL`
      + FK `ON DELETE RESTRICT ON UPDATE CASCADE` + índice → `ENABLE` + `FORCE`. Los nombres de
      constraint e índice coinciden con los originales de `units_catalog` y
      `recipes_and_recipe_lines`. Vaciar la tabla es obligatorio (`NOT NULL` sin `DEFAULT`) y se
      dice en la cabecera.
- [x] Sin secretos ni webhooks.

### Módulos hexagonales
- [x] `recipe-percentage.ts` es puro: no importa nada y no pasa por `number` ni por `Intl`. Se
      publica por el barrel de `recetas`. `pedidos` y `asignaciones` lo consumen por
      `@/lib/modules/recetas`, y no hay ruta profunda nueva.
- [x] `ProductRef.unitId` es el único cambio de contrato de `inventario`, y es el que pide design §5.
- [x] La lógica vive en `domain/`. Las Server Actions no cambian.

### Comentarios (`docs/conventions.md > Comentarios`)
- [x] En producción, ninguna línea añadida o modificada cita ficha, requisito, `design.md` ni
      «decisión cerrada». Ni en `migration.sql`, ni en `down.sql`, ni en `schema.prisma`, ni en
      `lib/`, ni en `app/`.
- [ ] Hay comentarios nuevos con un motivo erróneo o no verificable, y bloques largos (menor n.º 8).

## Hallazgos

### Mayores (bloqueantes)

Ninguno.

### Menores

1. **La migración queda por detrás de `origin/dev`.** `20260919120000_recipe_lines_percentage` es
   anterior a `20260922120000_packer_role` (QC-144), que ya está en `origin/dev`. Tras el merge
   de F2.3, el caso de la propia ficha
   `recipe-lines-percentage-migration.test.ts › «el timestamp es posterior al de la ultima migracion conocida»`
   **se pone rojo**. Además `git merge-tree` da conflicto en
   `tests/guards/guard-identificador-de-request.test.ts` (las dos ramas añaden su migración a la
   lista cerrada) y en `feature_list.json`. Arreglo en F2.3: renombrar la carpeta a un timestamp
   posterior a `20260922120000` y actualizar la lista de la guardia. La base de desarrollo ya
   tiene aplicada la migración con el nombre viejo (bitácora, nota 1), así que primero hay que
   hacer `db:rollback` y después reaplicar. **No es un conflicto trivial.** Design §2.2 solo
   exigía ser posterior a `master`, así que no incumple el spec, pero el gate de F2.4 lo va a
   parar.
2. **R8: el caso de integración es vacío.**
   `recipe-lines-percentage.int.test.ts › «una receta con cero lineas conserva nombre, pasos y updated_at»`
   crea una receta **después** de la migración y la lee dos veces sin nada en medio: no ejercita
   la migración y no puede ponerse rojo. R8 lo cubre de verdad el test estático del SQL (`NO FORCE`
   antes del `DELETE`, ninguna sentencia menciona `"recipes"`). O se quita ese caso, o se
   renombra para que no prometa lo que no prueba.
3. **R7: el mapa cita un test que no discrimina el orden.** `recipe-service.test.ts › R7` solo
   afirma `.rejects.toThrow()`. Con 97,50 %, un `ValidationError` también lo cumple, y el
   `findRefs` tampoco se llamaría. Hay que afirmar `.rejects.toBeInstanceOf(UnauthorizedError)`
   (T4 lo pide: «recibe el error de permiso») y citar en el mapa
   `authorization.test.ts › QC-74 R12 — con entrada invalida, el rechazo es por PERMISO`, que es
   el que de verdad lo prueba.
4. **R9: el rollback solo se probó a mano, y sobre la base de DESARROLLO.** T1 pedía hacerlo sobre
   una base de test. No hay test automatizado; el estático solo comprueba el texto del `down.sql`.
   Lo que dice la nota 1 de la bitácora (rollback → re-migrate con `rolled_back_at: null`) es
   coherente, pero no lo he reproducido.
5. **R18: falta el separador «·».** Design §7 fija «{insumo} · {porcentaje} · {cantidad}
   {unidad}», pero `order-execution-lines.tsx` pinta cuatro `<span>` separados por `gap-3`, sin
   «·». El caso `order-execution-lines.test.tsx` se llama «muestra "Hipoclorito · 10,00 % · 20 L"»
   y comprueba cada trozo por separado. El contenido de R18 está completo; lo que no coincide es
   la forma que promete el nombre del test y el design.
6. **E2E, escenario 4: las aserciones son flojas.** `line.toContainText('20')` y
   `toContainText('L')` se hacen sobre la fila entera, y el nombre del insumo lleva el `RUN_ID` en
   hexadecimal, que puede contener «20». Es mejor afirmar
   `order-execution-line-quantity-0` `toHaveText('20')` y el `order-execution-line-percentage-0`.
7. **Un nombre de test viejo contradice D7.** `order-execution-screen.test.tsx:92` sigue
   diciendo «R21: el factor y las cantidades tal cual estan escritas», que es justo lo que D7
   deroga. El caso pasa, pero el nombre engaña.
8. **Comentarios nuevos de producción con motivo erróneo o no verificable, y bloques largos.**
   - `lib/modules/recetas/domain/recipe-view.ts`: el comentario de `productStock` dice «`null`
     … cuando `productUnitId` es `null`, `0` cuando no tiene ningún lote», y es contradictorio:
     sin lotes, `productUnitId` es `null`. El código (`get-recipe.ts › stockInProductUnit`)
     devuelve `0` para un insumo vivo sin unidad, y `null` solo si está de baja.
   - `recipe-lines-field.tsx` (cabecera): «una receta SIN ninguna se puede llegar a enviar» choca
     con R11, que bloquea Guardar y Enter.
   - `recipe-form-state.ts`: «`grep` de la ruta confirma que en ningún archivo … aparece
     `parseFloat(`…» es una afirmación sobre otros archivos que nadie mantiene.
   - Bloques de más de 5 líneas añadidos en `order-ingredients-table.tsx`,
     `recipe-lines-field.tsx` y `recipe-form-state.ts`.
9. **Comentarios que esta ficha deja falsos en `unidades`.** Siguen nombrando
   `recipe_lines_unit_id_fkey` / `recipe_lines.unit_id`, que ya no existen:
   `unit-write-prisma.ts:87`, `delete-unit.ts:26`, `errors.ts:164`, `unit-catalog.ts:3` y
   `ports/unit-write-repository.ts:66`. El diff no los toca, así que no son citas que haya que
   limpiar aquí. Pero ahora mandan a buscar una FK inexistente, que es justo el caso que el propio
   comentario de `unit-write-prisma.ts` describe. Conviene una ficha de limpieza de `unidades`.
10. **Los tests citan fichas en comentarios.** Hay 91 líneas de comentario añadidas en `tests/` y
    `e2e/` que citan `QC-`, `R<n>`, `D<n>` o `design.md`: 28 en `e2e/recetas-porcentaje.spec.ts` y
    15 en `recipe-form.test.tsx`, entre otros. `docs/conventions.md` aplica a los tests la misma
    regla de comentarios (`R<n>` solo en el nombre del caso).
11. **T10 marcada `[x]` sin haber cumplido su «Hecho cuando».** Exige que el E2E pase en Chromium
    y WebKit, y no se ha ejecutado. T12 sigue abierta. Es la condición del veredicto.

## Nota fuera de alcance (no cuenta)

`createRecipeAction` / `updateRecipeAction` hacen `safeParse` **antes** de resolver el actor. Por
eso quien llama sin permiso y con porcentajes inválidos recibe `invalid_input` en la Server Action,
aunque el service sí compruebe primero el permiso. Es anterior a esta ficha y el diff no lo toca;
R7 habla del service («igual que hoy»).
