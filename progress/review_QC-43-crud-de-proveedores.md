# QC-43 — crud-de-proveedores · review

> Reviewer, 2026-09-03. Rama `feature/QC-43-crud-de-proveedores`, worktree
> `.worktrees/QC-43-crud-de-proveedores`. Base `QuimiCloude_QC43`.
> **Veredicto: OK (APROBADO).** 0 hallazgos BLOQUEANTES, 5 hallazgos `menor`.
>
> Nada de lo que hay aqui se dio por bueno leyendo la bitacora: el gate se volvio a correr
> entero, los 91 tests de `proveedores` se listaron nombre a nombre contra la tabla de
> trazabilidad, y **catorce mutaciones** —siete en codigo, tres en el SQL en disco, cuatro
> sobre las restricciones de la base real— se aplicaron, se vieron en rojo y se revirtieron.
> La base quedo en el mismo estado en que estaba; se comprueba en la seccion 6.

---

## 1. Checklist de `CHECKPOINTS.md`, punto por punto

### Especificacion
- [x] `specs/QC-43-crud-de-proveedores/requirements.md`, **R1–R48** en EARS, con el bloque de
      Alcance, las 18 decisiones cerradas y las seis preguntas abiertas (P2 resuelta el
      2026-09-03 al aprobar el spec).
- [x] `design.md` con alternativas descartadas y su porque: nueve, de la 12.1 a la 12.9, mas
      la comparativa A/B del `CHECK` de contacto en 2.1.
- [x] `tasks.md`: **T0–T20, todas marcadas `[x]`**. Cero `[ ]` en el archivo.

### Trazabilidad
- [x] **Cada `R1`–`R48` mapea a un test que existe y que muerde.** Se listaron los nombres
      reales de los 91 tests de `tests/unit/proveedores` + `tests/integration/proveedores`
      con el reporter JSON y se cruzaron uno a uno contra la tabla de `tasks.md`.
      **Ningun nombre de la tabla es inventado y ninguno quedo huerfano.** Los seis que
      apuntan a tests heredados (R6, R19, R26, R44, R45, R46) se comprobaron en
      `tests/guards/**` y `tests/unit/pagination.test.ts`, que **no se tocaron en el diff**.
- [x] `progress/impl_QC-43-crud-de-proveedores.md` contiene el mapa `R<n> -> test` completo y
      cuadra con `tasks.md`.

### Calidad de codigo
- [x] `pnpm run typecheck` limpio, `pnpm run lint` limpio (dentro de `./init.sh`).
- [x] **`./init.sh` completo corrido por el reviewer: `EXIT=0`, `== init OK ==`,
      125 archivos, 1325 tests, sin rojos nuevos.** No se confio en la corrida del leader.
- [x] E2E — «no aplica» correctamente declarado, con matiz (hallazgo `menor` 1).
- [x] UI multiplataforma — **no aplica de verdad**: el diff no toca `app/`, `components/`,
      `e2e/` ni `middleware.ts` (comprobado con `git diff --name-only origin/dev...HEAD`).
- [x] Dependencias — **no aplica de verdad**: `package.json`, `pnpm-lock.yaml` y
      `docs/dependencias.md` estan **intactos** frente a `origin/dev` (diff vacio).

### Datos y seguridad
- [x] **El permiso se valida en el dominio y en la primera linea de los nueve casos de uso.**
      Verificado archivo por archivo: en los nueve, `requireAdmin(actor)` aparece **antes**
      del `safeParse` y **antes** de cualquier `deps.*`. Con test y con mutacion (seccion 2).
- [x] RLS activado y forzado en las dos tablas; esta ficha no crea ninguna tabla nueva y su
      migracion **no contiene ni un `ROW LEVEL SECURITY`** (afirmado en positivo por el test).
- [x] Todo el acceso a datos pasa por los dos adaptadores driven con Prisma. Ninguna lectura
      ni escritura con el cliente de Supabase.
- [x] La migracion `20260903200343_supplier_contact_cost_and_line_audit` tiene su `down.sql`
      y `_prisma_migrations` quedo coherente: las nueve migraciones con `finished_at` no nulo
      y `rolled_back_at` nulo (censo leido por el reviewer contra la base).
- [x] Ningun secreto hardcodeado.
- [x] Webhooks — no aplica: la feature no anade ninguno ni ningun route handler.

### Modulos hexagonales
- [x] `domain/` y `ports/` sin framework, sin Prisma, sin `lib/shared/`, sin `composition`.
- [x] De `inventario` e `identity` solo se importa el **barrel**. `ROLE_ADMINISTRADOR` sale de
      `@/lib/modules/identity` (P1 resuelta por `design.md > 3`), y **el literal
      `'Administrador'` no aparece en ningun archivo del modulo** — la unica coincidencia
      textual es la palabra «Administradores» dentro de un comentario explicativo.
- [x] Ningun adaptador driving instancia su driven: las dos Server Actions piden la fachada a
      `@/lib/composition`, y el cableado existe **exactamente una vez**, en
      `lib/composition/index.ts`, con las nueve claves y **reutilizando** `productCatalog`.
- [x] `lib/shared/**` sigue siendo hoja: `pagination.ts` se consume, no se toca.
- [x] Ningun `'use server'` sale del barrel: `index.ts` reexporta **solo de `./domain`**
      (quince reexports, ni uno de `adapters/`).
- [x] En la raiz de `lib/` siguen solo `composition/`, `modules/`, `shared/` y `utils.ts`.
- [x] **La logica de negocio esta en `domain/`, no en la Server Action.** Verificado a mano:
      la action resuelve el actor, arma el candidato desde `FormData` y traduce el error por
      `code`; no repite `requireAdmin`, no parsea con `zod`, no traduce `duplicate`/`not_found`.
- [x] ORM solo en los dos adaptadores driven: la lista blanca de `module-contract.test.ts` es
      **exacta** (dos rutas literales), asi que un tercer archivo con `@prisma/client` cae.

### Permisos y configuracion
- [x] Paginas protegidas y componentes `private/` — no aplican: no hay ninguna pagina.
- [x] Mutaciones por Server Action, sin `fetch` a rutas propias, sin route handler nuevo.
- [x] Nada que cambie entre entornos quedo hardcodeado.

---

## 2. Las catorce mutaciones: que se rompio y que se puso rojo

Ninguna se dio por buena de la bitacora. Cada una se aplico de verdad, se corrio la suite y se
revirtio. Arbol y base quedaron limpios.

### Codigo del modulo (7)

| # | Que se rompio | Requisito | Resultado |
| --- | --- | --- | --- |
| M1 | Quitar la comprobacion de proveedor vivo de `createCatalogLine` | **R48**, alta | **ROJO** — `un proveedor dado de baja no admite lineas nuevas ni edicion de las suyas, y el borrado si sigue permitido` |
| M2 | Hacer que `deleteCatalogLineById` **tambien** exija proveedor vivo | **R48**, exclusion del borrado | **ROJO** — el mismo caso cae. **La exclusion esta fijada por test, no es un olvido.** |
| M3 | Quitar la comprobacion de proveedor vivo de `listCatalogLinesBySupplierAlive` | **R36** | **ROJO** — `el listado del catalogo no devuelve ninguna linea de un proveedor dado de baja...` |
| M4 | Quitar `requireAdmin` de `get-supplier.ts` | **R1–R4** | **ROJO** — 3 casos de `authorization.test.ts` |
| M5 | Quitar `requireAdmin` de `delete-catalog-line.ts` | **R1–R4** | **ROJO** — 3 casos |
| M6 | Quitar `requireAdmin` de `list-suppliers.ts` | **R1–R4** | **ROJO** — 3 casos |
| M7 | Anadir `createdBy: actorId` al `update` del proveedor, a su baja logica y al `updateTerms` de la linea | **R8**, **R31** | **ROJO** las tres veces (`la edicion y la baja no pisan created_by...`, `la edicion de la linea no pisa created_by...`) |

**Aviso metodologico, por si se repite:** el primer intento de M7 reemplazo la primera aparicion
textual de `updatedBy: actorId`, que esta en `create` —donde `createdBy` ya existe—, y la suite
siguio verde. **No era el test el que no mordia: era la mutacion la que no mutaba nada.**
Reaplicada sobre el bloque correcto, cae. Queda escrito porque es exactamente la forma en que
una revision por mutacion se autoengana.

### SQL en disco (3)

| # | Que se rompio | Requisito | Resultado |
| --- | --- | --- | --- |
| M8 | Anadir un `ALTER TABLE "suppliers" ADD COLUMN "notes" TEXT;` al `migration.sql` | **R38** | **ROJO** — `la migracion solo contiene los tres cambios y no toca ninguna otra tabla` |
| M9 | Borrar del `down.sql` el `ADD CONSTRAINT ... cost_non_negative` (dejarlo solo con `DROP`) | **R39** | **ROJO** — dos casos, incluido `un down.sql que solo dropeara dejaria la base sin ninguna de las dos reglas` |
| M10 | Crear `app/api/compras/route.ts` consumiendo `proveedores.listSuppliers` desde `@/lib/composition` | **R42/R47** | **ROJO** — `no hay ningun route handler de proveedores bajo app/api` **y** el caso de `module-contract`. **El arreglo de T19 muerde de verdad.** |

### Restricciones de la base real (4)

| # | Que se rompio | Requisito | Resultado |
| --- | --- | --- | --- |
| M11 | Devolver `suppliers_contact_required` a su forma de QC-42 | **R12** | **ROJO** — lo detecta el `beforeAll` de `supplier-crud.int.test.ts` con mensaje claro |
| M12 | Quitar solo el `COALESCE`, dejando `btrim` para que el `beforeAll` no lo vea | **R12** | **ROJO** — `el CHECK rechaza con SQLSTATE 23514 el proveedor vivo sin contacto util, al insertar y al modificar`. **El agujero del `CHECK` que evalua a `NULL` esta cubierto por el caso, no solo por el guardian de arranque.** |
| M13 | Quitar la clausula `deleted_at IS NOT NULL` (variante A, total) | **P2, variante B** | **ROJO** — `un proveedor dado de baja si puede quedarse sin telefono ni correo (P2, variante B)`. **Son dos mutaciones distintas y caen en dos casos distintos, como debia ser.** |
| M14 | `supplier_catalog_lines_cost_positive` de `> 0` a `>= 0` | **R29** | **ROJO** — `el CHECK rechaza con SQLSTATE 23514 la linea con costo cero o negativo, al insertar y al modificar`. **Lo rechaza la base, no `zod`: el caso escribe con `$executeRaw`.** |

---

## 3. Lo que esta feature cambio de otras fichas

### 3.1 Los tres cambios de esquema sobre QC-42
Censo de restricciones leido de la base real. `suppliers_contact_required` quedo con la forma
PARCIAL de la variante B —la que el humano cerro— tratando el blanco como ausencia via
`COALESCE(btrim(...))` y exceptuando las filas con `deleted_at` no nulo;
`supplier_catalog_lines_cost_positive` es `CHECK (cost > 0)` y `_cost_non_negative` **ya no
existe**; `created_by`/`updated_by` existen como `UUID` anulables, con sus dos FK
`ON DELETE RESTRICT ON UPDATE CASCADE` hacia `users` y sus dos indices. **El UP contiene
exactamente diez sentencias** y el test las cuenta. El `down.sql` **recrea** las dos
restricciones de QC-42 con su definicion literal, no solo las dropea (M9 lo confirma).

### 3.2 Los diez DROP CONSTRAINT de drift
**No estan.** Censo de FK de **toda** la base: las quince siguen vivas —cuatro de `products`,
tres de `recipe_lines`, dos de `recipes`, cuatro de `supplier_catalog_lines`, dos de `suppliers`
y dos de `users`—. Y **algo los vigila**: `proveedores-migration.test.ts` filtra todo
`DROP CONSTRAINT` cuyo `ALTER TABLE` no sea sobre las dos tablas propias y exige lista vacia,
ademas de prohibir la mencion de `products`, `presentations`, `recipes`, `recipe_lines`, `units`,
`roles` y `document_types`. El censo exhaustivo de FK vivas de
`proveedores-constraints.int.test.ts` cierra el otro flanco.

### 3.3 Las afirmaciones de QC-42 derogadas o ampliadas
Las cuatro se revisaron leyendo el diff completo, no el resumen. **Ninguna se ablando; dos
quedaron mas exigentes:**

- `module-contract.test.ts`: «las tres carpetas estan vacias» pasa a **lista literal exacta** de
  archivos por carpeta (un archivo de mas cae) y los `.gitkeep` pasan de exigirse presentes a
  exigirse **ausentes**. La prohibicion total de `@prisma/client` pasa a lista blanca de **dos
  rutas literales**. La directiva de servidor pasa de prohibida en todo el modulo a
  **obligatoria en la primera linea de `driving/` y prohibida en el resto**. Y la afirmacion
  «composition no menciona proveedores», derogada por T13, no desaparece: se **invierte** en un
  caso nuevo que exige la fachada con sus nueve claves, una sola instancia de `productCatalog` y
  que nadie fuera de `composition` importe los adaptadores driven. Es mas red, no menos.
- `proveedores-schema.test.ts`: el caso que afirmaba la **ausencia** de `createdBy`/`updatedBy`
  pasa a afirmar su **presencia** con la misma dureza (escalares uuid opcionales, sin `@default`,
  **sin `@relation`**) mas sus dos `@@index`. Los censos de columnas, escalares cross-modulo e
  indices se ampliaron, no se recortaron.
- `proveedores-constraints.int.test.ts`: el censo exhaustivo de FK gana las dos filas nuevas y
  **sigue siendo exhaustivo**; el caso del cero deja de aceptar costo cero y **anade** la
  afirmacion de que la base lo rechaza con 23514.
- `proveedores-migration.test.ts`: archivo nuevo para el SQL de QC-43; el de QC-42 no se relajo.

**Ninguna guardia de tests/guards fue tocada** — no aparece en el diff.

### 3.4 El hallazgo de T19
Real y arreglado. Antes buscaba la cadena `lib/modules/proveedores` dentro de `app/api`, asi que
una ruta con otro nombre que pidiera la fachada a `@/lib/composition` se le escapaba. Ahora busca
la **palabra** (`proveedor|supplier`, sin distinguir mayusculas). **M10 lo confirma en rojo.**

---

## 4. Hallazgos

### `menor` 1 — El E2E queda como deuda de QC-44 y conviene que no viva solo en esta bitacora
El checkpoint «si la feature toca permisos, hay al menos un test E2E» **si se dispara**: los nueve
casos de uso exigen `ROLE_ADMINISTRADOR`. El «no aplica» es **correcto** —R47 prohibe cualquier
pantalla, no hay superficie navegable que Playwright pueda abrir, y es la decision cerrada 8 que
el humano aprobo, con el precedente exacto de QC-20 hacia QC-22—. Lo que no es correcto es dejar
la obligacion viviendo **solo** en `progress/impl_QC-43-crud-de-proveedores.md`: quien tome QC-44
leera su propia ficha. **Accion sugerida al leader:** anotarlo en
`progress/current.md > Deudas y cosas abiertas` y/o en la descripcion de QC-44 en el board.
No bloquea el merge.

### `menor` 2 — La deuda P1 (constante del rol duplicada) sigue abierta y sin ficha
`design.md > 3` la resuelve **bien para esta feature** —`proveedores` toma el rol del barrel de
`identity` y no aumenta la deuda— y propone una ficha de arnes para borrar las copias locales de
`inventario` y `recetas`. Esa ficha **no existe todavia**. Es correcto que QC-43 no la ejecute;
lo que falta es que alguien la cree, o se perdera junto con la propuesta.

### `menor` 3 — El conteo de «siete no aplica» de la bitacora es seis
En `progress/impl_QC-43-crud-de-proveedores.md` se declaran seis: E2E, UI multiplataforma,
dependencias, webhooks, paginas protegidas y componentes `private/`. El texto dice «siete» dos
veces. Los seis son **correctos** y estan verificados uno a uno arriba; el error es de conteo.

### `menor` 4 — La fila R38 de la tabla presenta dos tests como si midieran lo mismo
`proveedores-migration.test.ts` mide el **SQL de la migracion** y `scope.test.ts` mide los
**modelos de `db/schema.prisma`**. Son complementarios y **entre los dos** no dejan hueco (M8 cae
en el primero; una columna anadida solo al schema cae en el segundo), pero la tabla puede leerse
como si el segundo fuera respaldo del primero, y no lo es. Es redaccion, no cobertura.

### `menor` 5 — La carrera declarada de R48 en el alta
`createCatalogLine` comprueba «proveedor vivo» con un SELECT previo al INSERT: entre los dos cabe
una baja concurrente. **Esta escrito, razonado y aceptado** en `design.md > 7` y en el propio
adaptador, con el argumento correcto: el unico efecto es una linea invisible que si se puede
borrar, y hacerlo atomico costaria la traduccion del 23505 de la que depende R27. Se anota para
que quede en el expediente, no como objecion. `updateTerms` **si** es atomico.

---

## 5. Cosas que se buscaron y NO aparecieron

- Ruido en el diff: sin archivos reescritos enteros, sin restos de andamio, sin temporales.
  Los 47 archivos del diff son los que `design.md > 1` y `tasks.md` anuncian.
- `catch` vacios, `console.*`, literales de rol, secretos: ninguno en `lib/modules/proveedores`.
- `lib/modules/inventario`: **sin modificar**. La feature solo consume su contrato publico.
- Reimplementaciones de la aritmetica de paginacion dentro del modulo: ninguna.
- Guardias relajadas: ninguna.

## 6. Estado en que quedo el entorno

- **Arbol de trabajo limpio** (`git status --short` vacio) tras revertir las catorce mutaciones.
- **Base `QuimiCloude_QC43` identica a como estaba.** Censo posterior a las mutaciones: el CHECK
  de contacto con su forma parcial y su COALESCE, el de costo con `> 0`, las quince FK del repo
  presentes, y `_prisma_migrations` con las nueve migraciones aplicadas y ninguna revertida.
- Los ficheros auxiliares que el reviewer creo para consultar la base se borraron.

---

## Veredicto

**OK — APROBADO.** Cero hallazgos BLOQUEANTES. Los cinco `menor` no impiden el merge: el 1 y el 2
son acciones del leader; el 3 y el 4 son correcciones de redaccion de la bitacora y de la tabla;
el 5 es una constancia.

Los 48 requisitos tienen test, los tests muerden —comprobado por muestreo agresivo, incluidos los
seis que el encargo senalaba como los mas faciles de falsear—, las tasks estan todas cerradas,
`./init.sh` termina en verde con 1325 tests, la migracion contiene exactamente los tres cambios,
su `down.sql` revierte al esquema literal de QC-42, y los diez DROP CONSTRAINT de drift no
llegaron ni a la rama ni a la base.
