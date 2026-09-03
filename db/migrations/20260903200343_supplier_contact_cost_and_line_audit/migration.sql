-- QC-43: crud-de-proveedores. LOS TRES CAMBIOS sobre el esquema que dejo QC-42
-- (`specs/QC-43-crud-de-proveedores/design.md` seccion 2), y NADA MAS: el contacto en
-- blanco deja de valer, el costo deja de admitir cero, y la linea del catalogo gana
-- columnas de autor.
--
-- AVISO DE DRIFT — de todo lo que hay en este archivo, Prisma solo sabe generar los DOS
-- `ADD COLUMN` y los DOS `CREATE INDEX`. Los dos `CHECK` y las dos FK hacia `users` son
-- SQL escrito A MANO, porque Prisma no modela CHECK y porque `created_by` / `updated_by`
-- son campos ESCALARES SIN `@relation` a proposito (decision cerrada 13/14 de QC-42,
-- R26 y R44 de esta ficha): asi la base garantiza la integridad y el cliente Prisma NO
-- puede atravesar de `proveedores` a `identity` con un `include`.
--
-- `prisma migrate dev --create-only` genero ADEMAS diez `DROP CONSTRAINT` sobre
-- `products`, `recipes`, `recipe_lines`, `suppliers` y `supplier_catalog_lines` -- todas
-- las FK que cruzan de modulo del repo, precisamente porque no estan en el esquema. Se
-- BORRARON A MANO: aplicarlas habria destruido en silencio la integridad referencial de
-- tres features ya mergeadas. Toda migracion futura sobre estas tablas hay que revisarla
-- a mano por lo mismo.
--
-- Esta migracion NO toca ninguna otra tabla (R38): las unicas menciones a `users` son las
-- dos FK que `supplier_catalog_lines` declara sobre SI MISMA.
--
-- Sale barata porque LAS DOS TABLAS ESTAN VACIAS (`design.md` seccion 2.0): QC-42 fue
-- esquema puro y esta es la primera ficha que escribe en ellas. Con datos cargados, un
-- solo `phone = ''` o un solo costo a cero harian fallar el `ADD CONSTRAINT` entero.

-- CAMBIO 1 (R12) — la restriccion de contacto trata el BLANCO como ausencia.
-- Hasta hoy solo miraba ausencia de VALOR, asi que `phone = ''` la satisfacia: un
-- proveedor al que no se puede llamar ni escribir pasaba el filtro.
--
-- El `COALESCE` NO es adorno: sin el, con `phone` NULL, `btrim(NULL) <> ''` evalua a NULL
-- y UN CHECK QUE EVALUA A NULL SE CUMPLE, con lo que la restriccion dejaria pasar justo la
-- fila que existe para bloquear. `btrim` es IMMUTABLE, asi que es legitima dentro del CHECK.
--
-- PARCIAL PARA LAS FILAS VIVAS (variante B de `design.md` seccion 2.1). Lo decidio el
-- humano al aprobar el spec el 2026-09-03 (P2), y cierra de paso la pregunta abierta 8 de
-- QC-42: un proveedor DADO DE BAJA si puede quedarse sin telefono y sin correo -- que es
-- lo que exigiria una solicitud de borrado de datos personales-- sin borrar la fila entera.
-- Un CHECK no admite `WHERE`, asi que el predicado va DENTRO: `deleted_at IS NOT NULL OR ...`.
-- Consecuencia asumida: la invariante pasa a leerse «todo proveedor VIVO tiene contacto».
--
-- El nombre NO cambia (`suppliers_contact_required`): es la misma regla con distinta
-- definicion, y renombrarla obligaria a QC-44 y a cualquier traductor de SQLSTATE a
-- conocer dos nombres para lo mismo.
ALTER TABLE "suppliers" DROP CONSTRAINT "suppliers_contact_required";

ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_contact_required"
  CHECK ("deleted_at" IS NOT NULL
         OR COALESCE(btrim("phone"), '') <> ''
         OR COALESCE(btrim("email"), '') <> '');

-- CAMBIO 2 (R29) — el costo deja de admitir cero (decision cerrada 4). Un cero casi
-- siempre es un dato a medio escribir. Consecuencia aceptada: una muestra gratis no se
-- puede registrar como linea de catalogo.
--
-- Aqui la restriccion SI se renombra, y a proposito: `_non_negative` describiria mal lo
-- que hace, y un nombre viejo sobreviviendo a una regla nueva es el tipo de mentira que
-- nadie detecta leyendo el esquema.
--
-- `min_purchase` y `delivery_time` NO se tocan: siguen `>= 0` y siguen opcionales
-- (decision 5 de QC-42, R30). Un minimo de cero es «sin minimo pactado» y un plazo de cero
-- es «mismo dia»: datos legitimos, no datos a medio escribir.
ALTER TABLE "supplier_catalog_lines" DROP CONSTRAINT "supplier_catalog_lines_cost_non_negative";

ALTER TABLE "supplier_catalog_lines" ADD CONSTRAINT "supplier_catalog_lines_cost_positive"
  CHECK ("cost" > 0);

-- CAMBIO 3 (R31, R32) — la linea gana columnas de autor. Se aparta de la decision cerrada
-- 14 de QC-42, que la dejo sin auditoria heredando el criterio de `recipe_lines`: alli
-- editar una linea es editar la formula y el rastro queda en `recipes.updated_by`; aqui
-- SUBIR EL COSTO es un hecho comercial propio que no modifica nada del proveedor.
--
-- ANULABLES (R32): NULL es «no lo creo una persona» -- una importacion, un seed--, no «se
-- perdio el dato». Que toda escritura de la APLICACION lleve autor es garantia del
-- service, no del esquema.
ALTER TABLE "supplier_catalog_lines" ADD COLUMN "created_by" UUID;

ALTER TABLE "supplier_catalog_lines" ADD COLUMN "updated_by" UUID;

-- AddForeignKey (A MANO) — auditoria: linea -> usuario. Cruza a `identity`, asi que es
-- escalar en Prisma y FK real aqui. Las columnas son anulables y eso no afloja nada: en
-- SQL una FK solo se verifica cuando la columna tiene valor, asi que una linea sin autor
-- pasa (R32) y una linea con un autor inventado se rechaza con 23503.
--
-- `ON DELETE RESTRICT`, NUNCA `SET NULL`, aunque la columna lo permitiria: `SET NULL`
-- convertiria «al usuario lo borraron» en «no lo creo una persona», que son cosas
-- distintas y esta ficha las separa a proposito.
ALTER TABLE "supplier_catalog_lines" ADD CONSTRAINT "supplier_catalog_lines_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "supplier_catalog_lines" ADD CONSTRAINT "supplier_catalog_lines_updated_by_fkey"
  FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateIndex — Postgres no indexa el lado hijo de una FK, y por ahi pasa la verificacion
-- del RESTRICT al borrar un usuario.
CREATE INDEX "supplier_catalog_lines_created_by_idx" ON "supplier_catalog_lines"("created_by");

-- CreateIndex
CREATE INDEX "supplier_catalog_lines_updated_by_idx" ON "supplier_catalog_lines"("updated_by");
