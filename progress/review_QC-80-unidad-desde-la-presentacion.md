# QC-80 — unidad-desde-la-presentacion · review

> Escrita por el `reviewer`. Worktree `.worktrees/QC-80-unidad-desde-la-presentacion`, rama
> `feature/QC-80-unidad-desde-la-presentacion` (sin commits: el trabajo esta en el arbol, a
> proposito). Base `QuimiCloude_QC80`, nueva, 24 migraciones aplicadas y sin residuo de tests.
> Corrida limpia: la anterior se aborto porque otra sesion revirtio la migracion en la base
> compartida; esta empieza de cero.

## Veredicto

**OK.** Ningun hallazgo bloqueante. Cinco menores, ninguno impide el PR.

## Checklist de CHECKPOINTS.md

### Especificacion
- [x] `requirements.md` con R1-R28 en EARS.
- [x] `design.md` con seis alternativas descartadas (A-F) y su porque.
- [x] `tasks.md` con T0-T14, **todas `[x]`**.

### Trazabilidad
- [x] Los 28 requisitos mapean a un test que **existe y corre**. Verificado uno a uno contra el
      disco, no contra el mapa del `tasks.md`. Tabla abajo.
- [x] `progress/impl_QC-80-unidad-desde-la-presentacion.md` trae el mapa `R<n> -> test` completo.

### Calidad de codigo
- [x] `typecheck` limpio y `lint` limpio (dentro de `./init.sh`).
- [x] `./init.sh` completo, dos corridas; la segunda cierra en `== init OK ==`.
- [x] Sin E2E, y con motivo (decision cerrada 9): no hay movimiento de inventario ni importe.
      R28 tiene caso de integracion que compara la fila entera del lote con `toEqual` antes y
      despues de crear y editar presentaciones.
- [x] Multiplataforma: el selector nuevo lleva `min-h-11 min-w-11` y `text-base md:text-base`,
      con caso de test que los afirma. Ningun `100vh`/`h-screen`, ningun `:hover` como unica via
      de activacion, ningun input por debajo de 16 px. No se declara excepcion porque no hace
      falta: se cumple la regla.
- [x] Dependencias: `package.json`, `pnpm-lock.yaml` y `docs/dependencias.md` **intactos**
      (`git status` vacio para los tres). Nada que aprobar.

### Datos y seguridad
- [x] Ninguna tabla nueva, asi que no dispara la exigencia de columna de empresa. `presentations`
      **no** gana columna de empresa (R27): eso es QC-49.
- [x] `requirePermission(actor, 'inventario.modificar')` es la **primera** linea de
      `create-presentation.ts` y de `update-presentation.ts`, antes de zod y antes del puerto,
      con su caso: «rechaza al actor sin permiso ... sin llamar al puerto» (R14).
- [x] RLS: la migracion abre y cierra el parentesis `NO FORCE` -> `ENABLE`+`FORCE` en
      `presentations` **y** en `units`, sin ninguna policy, dentro de la misma transaccion.
- [x] El acceso a datos pasa por el repositorio Prisma; ninguna lectura con el cliente Supabase.
- [x] La migracion tiene `down.sql`; el rollback lo verifico el implementer contra su base.
- [x] Sin secretos en el diff. Sin webhooks.

### Modulos hexagonales, permisos y configuracion
- [x] `domain/` y `ports/` sin framework ni Prisma. `PresentationData` vive en el puerto.
- [x] `components/shared/presentation-unit-select.tsx` importa el barrel `@/lib/modules/unidades`
      y `presentation-select.tsx` el de `@/lib/modules/inventario`. Ninguna ruta profunda.
- [x] Mutaciones por Server Action; ningun route handler nuevo.
- [x] Nada que cambie entre entornos quedo hardcodeado.

## Trazabilidad verificada, R por R

| R | Donde, comprobado en disco |
|---|---|
| R1 | `presentation-unit-migration.test.ts::R1` (nace anulable, se aprieta, sin DEFAULT) + `inventario-schema.test.ts` + `inventario-constraints.int` |
| R2 | `presentation-unit-migration.test.ts::R2` (RESTRICT/CASCADE, y el caso cae si se afloja) + `inventario-constraints.int` |
| R3 | `presentation-unit-migration.test.ts::R3` + censo de indices en `inventario-schema.test.ts` + `list-query-indexes.int` |
| R4 | `presentation-unit-migration.test.ts::R4` (busca por `name_normalized`, nunca por uuid, con sus dos RAISE EXCEPTION) |
| R5 | `presentation-unit-migration.test.ts::R5` (cero INSERT / DELETE / TRUNCATE) |
| R6 | `presentation-unit-migration.test.ts::R6` (las DOS tablas, y ninguna CREATE POLICY) |
| R7 | `presentation-unit-migration.test.ts::R7` + `inventario-schema.test.ts` (censo de indices de Product a `[]`) + `inventario-constraints.int` (a products no le queda ninguna FK) |
| R8 | `presentation-unit-migration.test.ts::R8`, dos casos: reversion exacta y censo de contrarias up/down |
| R9 | `presentation-unit-migration.test.ts::R9` + censo exacto de las seis columnas de Presentation |
| R10 | `presentation-input.test.ts`, cinco casos: uuid, ausencia, vacio, no-uuid, sin default |
| R11 | `presentation-service.test.ts` + `presentation-actions.test.ts` + `catalog-line-sheet.test.tsx` y `product-page.test.tsx` para el SEGUNDO camino |
| R12 | `presentation-input.test.ts` + `presentation-unit.int`, dos casos (con y sin cambiar el nombre) |
| R13 | `presentation-unit.int` (alta, edicion y distinguible del duplicado) + `presentation-prisma.test.ts` |
| R14 | `presentation-service.test.ts`: actor sin permiso, sin una sola llamada al puerto |
| R15 | `presentation-sheet.test.tsx` (la edicion precarga su unidad) + `presentation-prisma.test.ts` |
| R16 | `presentation-unit-select.test.tsx` (todas las del catalogo) + `presentation-sheet.test.tsx` |
| R17 | `presentation-unit-select.test.tsx` (ninguna opcion vacia, con `data-value` para poder afirmarlo en negativo) + `presentation-sheet.test.tsx` (error junto al campo) |
| R18 | `presentation-sheet.test.tsx`: tras el rechazo, nombre Y unidad |
| R19 | `presentation-page.test.tsx`, tres casos: sin disparador de alta, sin «crear la primera», y con catalogo OK vuelven |
| R20 | `presentation-unit-select.test.tsx` (44x44 y 16 px en todos los anchos) + `configuracion-viewport.test.tsx` |
| R21 | `product-input.test.ts` + `product-actions.test.ts` + `product-catalog.test.ts` + `list-query.test.ts` + `guard-contrato-listados.test.ts` + `unidades-schema.test.ts` |
| R22 | `product-prisma.test.ts` (un lote, varios, desempate por id desc, y el `orderBy`/`take: 1` afirmados COMO DATO) + `list-query-products.int` |
| R23 | `product-prisma.test.ts` (null) + `recipe-line-unit-group.test.tsx`, cuatro casos + `list-query-products.int` |
| R24 | `recipe-line-unit-group.test.tsx`, siete casos: solo su grupo, la mas pequena, y no pisa la ya elegida del mismo grupo |
| R25 | `inventario-schema.test.ts` (la guardia de QC-90 reconvertida) + `presentation-unit-migration.test.ts::R25` |
| R26 | `inventario-schema.test.ts::R26` (SupplierCatalogLine.unitId sigue `String?`) + `catalog-line.int` |
| R27 | `presentation-unit-select.test.tsx` (no filtra por empresa) + censo exacto de columnas de Presentation (ver menor-3) |
| R28 | `presentation-unit.int::R28`: `toEqual` de la fila entera del lote |

**Ningun requisito sin test.**

## Decisiones cerradas: ninguna reabierta

- La presentacion **no** vuelve a colgar del producto: `Product` no recupera `presentationId` ni
  `presentation`, y hay caso en negativo sobre el UP **y** sobre el DOWN.
- El backfill lleva **todas** las presentaciones a `kilogramo` y **no borra ninguna fila**: el
  `migration.sql` no tiene ni un INSERT ni un DELETE, y un caso lo vigila.
- `supplier_catalog_lines.unitId` sigue siendo propia y opcional (`String?`).
- El selector de la presentacion ofrece el catalogo entero, sin filtrar por empresa.

## La migracion

Correcta contra R1-R8. Orden real del `migration.sql`: ADD COLUMN anulable -> NO FORCE de las
**dos** tablas -> bloque anonimo de relleno con sus dos guardias (kilogramo no encontrado / algun
nulo restante, cada una con su RAISE EXCEPTION que nombra QC-80) -> ENABLE + FORCE -> SET NOT NULL
-> FK `presentations_unit_id_fkey` RESTRICT/CASCADE + `presentations_unit_id_idx` -> drop del
indice, la FK y la columna de `products`. El `down.sql` existe y es simetrico: `products.unit_id`
vuelve **anulable** con su FK (mismas acciones referenciales) y su indice, y `presentations` pierde
indice, FK y columna, en orden inverso.

## Las cuatro decisiones fuera del spec, juzgadas una a una

1. **Selector promovido a `components/shared/presentation-unit-select.tsx`** - **correcta**.
   Dejarlo bajo `app/(private)/configuracion/presentaciones/components/` obligaba a que
   `components/shared/` importara de `app/`: inversion de capas. **No contradice** la alternativa C
   del `design.md`, que descartaba promover el `UnitSelect` **de proveedores** —cuya API central es
   la opcion «sin unidad»—, que es otra cosa. Hay dos consumidores obligatorios con la misma API,
   que es el umbral de `docs/architecture.md > Componentes`. Las tres props nuevas (`name`,
   `value`, `onValueChange`) son **aditivas** y el barrel de presentaciones lo republica, asi que
   ningun consumidor de la ruta vieja cambio. El `design.md > 5.1` queda desactualizado en la
   ubicacion: esta anotado en la bitacora, que es donde el arnes pide anotarlo.
2. **`LATEST_BATCH_UNIT` con `satisfies` y no `as const`** - **correcta y obligada**: el `orderBy`
   de Prisma exige un array mutable y un `as const` lo congela en `readonly`. Queda explicado en el
   comentario del propio archivo, que es donde se lee.
3. **`PresentationData` no exportado desde el barrel** - **correcta**: nadie fuera del modulo lo
   consume y el barrel reexporta solo de `./domain`. Exportarlo habria ensanchado el contrato
   publico sin consumidor.
4. **El segundo camino de alta en `components/shared/presentation-select.tsx`** - **correcta, y era
   un incumplimiento real de R11**. El alta rapida embebida validaba
   `createPresentationSchema.safeParse({ name })` sin `unitId`; con R10 volviendo el campo
   obligatorio, ese camino se quedaba muerto en la validacion previa y no llegaba nunca a la Server
   Action, en sus dos consumidores (detalle de proveedor y formulario de producto). Ahora manda la
   unidad y, coherente con R19, si no hay catalogo el alta rapida no se ofrece y elegir una
   presentacion existente sigue funcionando. El `tasks.md` no lo preveia: es un hueco del spec que
   el implementer cerro bien.

## Las dos guardias tocadas

- **Censo de migraciones de QC-90** en `tests/unit/inventario/schema/inventario-schema.test.ts`:
  se retiraron **exactamente** los dos casos de censo por git y sus ayudantes
  (`archivosAgregadosEnLaRama`, `carpetasDeMigracionEn`, `carpetasDeMigracionEnDisco`,
  `mergeBaseConDev`, el import de `node:child_process`), y se **conservo** el caso de las columnas
  de `ProductBatch`, reconvertido en guardia de R25. No se aflojo nada de mas: el archivo **gana**
  casos en negativo (Product sin `unitId`, sin `unit`, sin `unit_id`, sin `Unit`) y el censo de
  indices de Product pasa a `[]` con asercion propia.
- **Retensado de la guardia de alcance de recetas** (`recipe-route-contract.test.ts`):
  `MIGRACION_QC80` nombra **dos** rutas, las de la carpeta de migracion de esta ficha, y se suma a
  `DB_PERMITIDAS`. Ni un comodin, ni `db/` entero, ni una entrada nueva en `RECETAS_PERMITIDAS`.
  Correcto y minimo.

## El gate, corrido por el reviewer

`./init.sh` **completo**, desde el worktree, **dos veces**, contra `QuimiCloude_QC80`.

| Corrida | Resultado |
|---|---|
| 1.a (352 s) | `Test Files 3 failed / 318 passed` - `Tests 4 failed / 4296 passed / 27 skipped`. El comparador senala **un** archivo fuera del baseline: `tests/unit/inventario/product-page.test.tsx` |
| 2.a (208 s) | `Test Files 2 failed / 319 passed` - `Tests 2 failed / 4298 passed / 27 skipped` -> **`== init OK ==`**, «sin rojos nuevos (2 rojos, todos en el baseline de 5)» |

- Los **dos** rojos constantes son los estructurales ya listados en `tests/baseline-rojos.json`:
  `tests/unit/recetas/module-contract.test.ts` y `tests/unit/recetas-ui/recipe-route-contract.test.ts`.
  Miden `git diff origin/dev...HEAD`, la rama no tiene commits, el rango va vacio y el caso falla
  adrede («este caso no ha comprobado nada»). **No son de esta rama.**
- `product-page.test.tsx` cayo en la 1.a corrida con **dos** casos, los dos de validacion del
  **costo unitario** —territorio de QC-90, no de esta ficha—, y por **expiracion de `waitFor`**, no
  por asercion. Corrido **aislado pasa 38/38** (comprobado por mi) y en la **2.a corrida completa
  tambien pasa**. Es la firma exacta del flake de saturacion que describe
  `docs/verification.md`: falla en la suite, pasa en aislado, cambia de sitio entre corridas.
  **No lo trato como bloqueante y no pido entrada de baseline**: la segunda corrida ya responde la
  pregunta que el gate hace.

### `identity-constraints`: veredicto explicito

**El rojo era de la base, no de la rama. Queda demostrado.**
`tests/integration/identity/identity-constraints.int.test.ts` corrio en **las dos** corridas sobre
esta base limpia y paso **47 de 47, cero fallos**, incluido el caso «el catalogo arranca solo con
CC». La atribucion del implementer —27 filas `DOC%` de residuo de tests en la base compartida— era
correcta. Sobre `QuimiCloude_QC80`, sin residuo, el caso pasa. No hay nada que arreglar en la rama
y **no hace falta ninguna entrada de baseline**; limpiar el residuo de la base compartida sigue
siendo QC-77.

## Hallazgos

**Bloqueantes: ninguno.**

- **menor-1 - 85 archivos convertidos de LF a CRLF.** El repo los tenia en LF y no hay
  `.gitattributes`. El diff mide `22 759` insertadas / `20 563` borradas; ignorando espacios,
  `3 235` / `1 039`. O sea: **cerca de 19 500 lineas de ruido puro de fin de linea, el 86 % del
  diff**. Ninguna regla del arnes lo prohibe, pero hace ilegible el PR y multiplica los conflictos
  al mergear. Ejemplo medible: `tests/unit/inventario/scope.test.ts` aparece como 313/300 lineas
  cuando el cambio real son 19/6. Sugerencia para el leader: normalizar antes de abrir el PR.
- **menor-2 - dos predicados identicos** en
  `lib/modules/inventario/adapters/driven/persistence/presentation-prisma.ts`:
  `isPresentationInUseViolation` e `isUnitForeignKeyViolation` tienen **el mismo cuerpo**
  (`error.code === 'P2003'`) y ninguno mira el nombre de la restriccion. La separacion es **por
  funcion**, que es lo que pedia `design.md > 4.2`, y hoy es correcta porque cada camino solo puede
  romper una FK. Pero el dia que `presentations` gane una segunda FK —QC-49 le dara su columna de
  empresa—, un `P2003` de esa otra FK al crear se traducira como `'invalid_unit'` y mentira. Queda
  anotado para quien haga QC-49; no pido cambio ahora.
- **menor-3 - R27, segunda mitad, cubierta solo de forma indirecta.** «`presentations` NO DEBE
  ganar ninguna columna de empresa» no tiene asercion propia: lo impide el `toEqual` exacto de las
  seis columnas escalares de `Presentation` en `inventario-schema.test.ts`. Muerde, pero por efecto
  lateral; si alguien relaja ese censo, R27 se queda sin guardia y nadie se entera.
- **menor-4 - el `tasks.md` (T9) nombra `presentation-list-empty.tsx` entre los archivos tocados y
  no se toco.** Sin consecuencia para el requisito: R19 se resuelve en la seccion, que es donde
  debe, y sus tres casos pasan. Es desajuste del papel con el disco, no del disco con R19.
- **menor-5 - tres entradas del baseline ya pasan, y el propio gate lo avisa**:
  `tests/integration/inventario/product-crud.int.test.ts`,
  `tests/unit/unidades/modulo-intacto.test.ts` y
  `tests/unit/unidades/unidades-convenciones.test.ts`. Deuda del arnes, ajena a QC-80, pero conviene
  que el leader la recoja.

## Lo que queda para el leader

1. Los dos rojos del baseline seguiran hasta que la rama tenga su **primer commit**; conviene
   re-correr `./init.sh` despues de commitear, que es cuando esas dos guardias **si** muerden, y el
   retensado `MIGRACION_QC80` esta puesto justo para eso.
2. `progress/history.md`, `feature_list.json` y el desmontaje del worktree son suyos.

---

**Veredicto final: OK.**
