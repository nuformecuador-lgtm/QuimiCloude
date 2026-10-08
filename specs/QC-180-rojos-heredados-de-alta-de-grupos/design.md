# QC-180 — rojos-heredados-de-alta-de-grupos · design.md

## Lo que ya existe

Busqué con tres términos: `listRecipesAction` / `loadFormCatalogs`, `segunda pantalla de recetas` y
`897a4f91` / `pantallas-exigen-permiso` / `baseline-rojos`.

- **Board (`feature_list.json`).** Solo QC-180 cita `897a4f91` o `loadFormCatalogs`.
  - QC-112 (guardia de QC-66 frente al desbloqueo de QC-95) es un caso **análogo**, no la misma
    ficha: una guardia que se enmienda para admitir exactamente un archivo sin abrirse. Sirve de
    precedente de forma.
  - QC-177 cita otro rojo del baseline (`account-status-scope`), que no tiene que ver con este.
  - Nada que duplique esta ficha.
- **Specs.** Ningún spec trata este rojo. Los dueños de lo que se toca son:
  - `specs/QC-25-crud-de-recetas`: R44, `scope.test.ts`.
  - `specs/QC-24-modelo-recetas`: T10, `module-contract.test.ts`.
  - `specs/QC-75-menu-y-rutas-por-permiso`: R6, R7, `pantallas-exigen-permiso`.
  - `specs/QC-35-pantalla-de-pedidos`: R31, selector de receta con búsqueda en el servidor.
- **Código (grafo + Grep).** Llaman a `listRecipesAction` en `app/` cuatro sitios:
  - `app/(private)/produccion/formulas/components/recipe-list-section.tsx`, la pantalla de recetas;
  - `app/(private)/pedidos/components/recipe-picker.tsx:182`, la búsqueda del selector;
  - `app/(private)/pedidos/page.tsx:89`, `loadFormCatalogs`. Este es el disparador del rojo;
  - `order-list-section.tsx`, que ya no la llama. Su comentario de la línea 41 lo dice.

  Los dos guardianes ya tienen una lista cerrada de pantallas autorizadas con un solo archivo,
  `app/(private)/asignacion/[id]/page.tsx`, añadido el 2026-09-17.
- **Qué se reutiliza.** El mecanismo de lista cerrada que ya tienen los dos guardianes: se amplía,
  no se inventa otro. También el patrón de mocks espía `actions` de `pantallas-exigen-permiso`.

## 1. Modelo de datos

Ninguno. Sin tablas, sin RLS, sin migraciones y sin cambios en `db/schema.prisma`.

## 2. Diagnóstico por archivo

| Archivo | Qué falla hoy | Por qué |
|---|---|---|
| `tests/unit/recetas/scope.test.ts` | El caso «la pantalla de recetas vive solo donde la declara QC-26», en la aserción `segundasPantallas` | `app/(private)/pedidos/page.tsx` es un `page.tsx` fuera de la carpeta de fórmulas. Su código sin comentarios casa con `/recet\|recipe/i` (`listRecipesAction`, `RecipePickerPage`, `recipes={recipes}`) y no es `PANTALLA_DE_EJECUCION`. |
| `tests/unit/recetas/module-contract.test.ts` | El último caso, en la aserción `violaciones` | La misma página: `page.tsx` que menciona recetas y que no está en `PANTALLAS_AUTORIZADAS` da «segunda pantalla de recetas fuera de su carpeta». Su consumo **sí** es legítimo, porque solo importa `@/lib/modules/recetas/adapters/driving/recipe-actions`. |
| `tests/unit/navegacion/pantallas-exigen-permiso.test.tsx` | `'/pedidos' se sirve con el permiso` | `listRecipesAction` y `getMassVolumeBridgeAction` son `vi.fn()` sin valor. `loadFormCatalogs` lee `.status` sobre `undefined`. Además, esas dos lecturas no están en el conjunto espía `actions`, así que los casos «sin permiso» no comprueban que **no** ocurran. |

Comprobé en el worktree que ningún otro `page.tsx`/`layout.tsx` fuera de fórmulas menciona recetas en
código. `proveedores/[id]/page.tsx` solo lo hace en comentarios, que los dos guardianes ya eliminan.
Pedidos es el único archivo que dispara el rojo.

## 3. Mocks, baseline y falsabilidad

### 3.1 `pantallas-exigen-permiso.test.tsx` (R3, R5, R6, R7)

- `listRecipesAction` y `getMassVolumeBridgeAction` entran en el objeto espía `actions` de
  `vi.hoisted`, junto a `listUnitsAction`. El `vi.mock` de cada módulo pasa a apuntar a esos espías.
- El `beforeEach` ya hace `mockResolvedValue(RESULTADO_DE_ERROR)` sobre todo `actions`, así que:
  - con permiso, `/pedidos` recibe tres errores y degrada a selector vacío, sin unidades y sin
    puente. Eso es R7;
  - sin permiso o sin sesión, `lecturasOcurridas()` incluye las tres, y el `toEqual([])` existente
    pasa a vigilarlas. Eso es R5 y R6. No hace falta añadir casos: los `it.each(PAGINAS)` ya los
    recorren.
- Se actualiza el JSDoc de cabecera: «las cuatro Server Actions» pasa a enumerar las seis.
- Efecto en las demás pantallas: ninguna llama a esas dos actions en su propio cuerpo (las listas
  viven bajo `<Suspense>`), y `leeAlgo` sigue valiendo lo mismo. Si alguna las llamara con permiso,
  `leeAlgo` ya es `true` en todas salvo `/dashboard`, que no las importa.

### 3.2 `tests/baseline-rojos.json` (R4)

Se borran las tres claves, `scope`, `module-contract` y `pantallas-exigen-permiso`, sin tocar las
demás. El JSON tiene que seguir siendo válido y cada entrada que queda conserva `motivo` y `desde`
(`docs/gate.md`).

### 3.3 Falsabilidad de los guardianes (R8, R9)

Los guardianes se prueban sobre el árbol real, así que la mitad negativa se demuestra **por
mutación**, igual que lo deja escrito `scope.test.ts`, caso 2 («Falsable con solo crear…»). El
implementer lo hace en local, sin commitear, y deja la salida en `progress/impl_QC-180-….md`:

1. Crear una carpeta nueva `app/(private)/qc180-mutacion/` con un `page.tsx` que importe
   `listRecipesAction`: los dos guardianes caen (R8). Tiene que ser una carpeta que no exista, para no
   pisar ninguna pantalla.
2. Cambiar en `app/(private)/pedidos/page.tsx` el import a
   `@/lib/modules/recetas/domain/list-recipes`: `module-contract` cae con «consume recetas por
   dentro» (R9).
3. Revertir las dos cosas: los dos vuelven a verde.

La ruta de la mutación 1 es solo de ejemplo. Sirve cualquier carpeta nueva con `page.tsx` fuera de
fórmulas.

## 4. La llamada de pedidos se queda (D4: R10, R11)

Solo se tocan tests y specs. Producción no cambia.

- **`tests/unit/recetas/scope.test.ts`.** `PANTALLA_DE_EJECUCION` (un archivo) pasa a ser un
  conjunto cerrado de dos rutas exactas. El filtro `segundasPantallas` excluye las rutas del
  conjunto. Va un comentario fechado `AMPLIADA el 2026-10-08 (QC-180)`, con el mismo estilo
  que los anteriores del archivo, que diga:
  - qué entra: `app/(private)/pedidos/page.tsx`;
  - por qué: el alta de pedidos necesita la primera página del catálogo de recetas en la cabecera,
    consumo aprobado por QC-35 R31 y movido de `OrderListSection` a la página por `897a4f91`;
  - qué sigue prohibido: cualquier otra segunda pantalla y el goteo suelto;
  - que el contrato público lo vigila `module-contract.test.ts`.
- **`tests/unit/recetas/module-contract.test.ts`.** `PANTALLAS_AUTORIZADAS` pasa de un elemento a
  dos, con un comentario fechado equivalente. La rama `consumesOnlyPublicContract` se le sigue
  aplicando a pedidos (R9).
- **Igualdad de las dos listas (R10).** Hoy cada guardián tiene su lista. No se extrae a un módulo
  compartido (ver 5.3). R10 se comprueba con la lectura de los dos archivos en review, y el mapa de
  trazabilidad cita las dos constantes.
- **R11.** `git diff --name-only origin/dev...HEAD` no debe listar nada bajo `app/` ni `lib/`. Los
  tests de `tests/unit/pedidos-ui/` que ya cubren la página siguen verdes sin tocarse:
  `pedidos-viewport.test.tsx` y `order-sheet.test.tsx` mockean `listRecipesAction`.

## 5. Alternativas descartadas

### 5.0 Opción B: quitar de la página la llamada a recetas (descartada por el humano el 2026-10-08, D4)

`app/(private)/pedidos/page.tsx` dejaba de pedir recetas, y `RecipePicker` cargaba la primera página
por su cuenta al abrir el panel. Se descartó por tres motivos:

- el consumo ya estaba aprobado por QC-35 R31, y `897a4f91` solo lo movió de archivo;
- habría tocado 8 archivos de `app/(private)/pedidos/` (la prop de recetas atraviesa `OrderSheet`,
  `OrderListSection`, `OrderTable`, `OrderForm`, `order-columns` y el barrel) y unos 12 tests de
  `tests/unit/pedidos-ui/`;
- el selector habría arrancado vacío hasta que llegara la primera página.

### 5.1 Esconder la palabra en `page.tsx` (descartada)

Se movería `loadFormCatalogs` a `app/(private)/pedidos/components/` y se renombrarían las props
(`catalogs` en lugar de `recipes`) hasta que el código de `page.tsx` no case con `/recet|recipe/i`.
Pondría los guardianes en verde sin tocarlos, pero **les miente**: la página seguiría pidiendo el
catálogo de recetas y el guardián dejaría de verlo. Además cambia producción y tests de pedidos solo
para esquivar una expresión regular.

### 5.2 Exención por regla en lugar de por nombre (descartada)

La regla sería: «un `page.tsx` que solo consume `adapters/driving/` de recetas no es segunda
pantalla». Es más corta, pero cualquier página futura que pinte el catálogo de recetas entero pasaría
sin ficha, que es justo el goteo que R44 de QC-25 caza. Los dos guardianes ya eligieron nombrar el
archivo exacto el 2026-09-17 («Se nombra el archivo EXACTO, nunca la carpeta»). Esta ficha sigue ese
criterio.

### 5.3 Extraer la lista cerrada a un módulo compartido entre los dos guardianes (descartada)

Garantizaría R10 por construcción, pero cambia la estructura de dos guardianes ajenos más allá de lo
que pide el rojo. Además, cada guardián documenta en su propio archivo por qué cada ruta está ahí, y
ese texto es parte de lo que vigilan. La duplicación es de dos literales y la revisa el reviewer.

### 5.4 Dejarlos en el baseline (descartada)

Lo contradice D1. Mientras sigan ahí, el gate no vigila la ubicación de la pantalla de recetas ni el
corte por permiso de ninguna pantalla privada, incluidas las de QC-174.

## 6. Enmiendas a specs ya cerrados (D5)

Cada una es una nota fechada el 2026-10-08 al final del archivo. No se reescribe
nada:

- `specs/QC-25-crud-de-recetas/requirements.md`, bajo R44: lista cerrada de pantallas autorizadas
  ampliada con `app/(private)/pedidos/page.tsx` (QC-180).
- `specs/QC-24-modelo-recetas/requirements.md`: la defensa de ubicación de `module-contract.test.ts`
  admite esa misma página, que sigue sujeta al contrato público.
- `specs/QC-35-pantalla-de-pedidos/requirements.md`: la página carga los catálogos del alta (primera
  página de recetas, unidades, puente) una sola vez y monta el disparador junto al título. Entró con
  `897a4f91`, fuera del arnés.

## 7. Dependencias de terceros

Ninguna nueva.

## 8. Cruce con otras fichas

`scope.test.ts` lo amplía cada ficha que trae un spec E2E de recetas: QC-172 y QC-174 lo hicieron.
`pantallas-exigen-permiso.test.tsx` lo amplía cada ficha con pantallas privadas nuevas. Son puntos
calientes de conflicto: el leader repite `scripts/archivos-en-vuelo.mjs` en F2.0 con
`tasks.md > Archivos esperados`.
