-- QC-34: crud-de-pedidos. La UNICA migracion de la ficha (decision cerrada 22).
--
-- De Prisma sale UNA SOLA COSA: la columna `cancellation_reason` (`db/schema.prisma` declara
-- `cancellationReason String? @map("cancellation_reason")`). TODO LO DEMAS de este archivo es
-- DRIFT para Prisma y no lo regenera nunca:
--   1. `ALTER TYPE "OrderStatus" ADD VALUE 'CANCELADO'` — Prisma SI conoce el valor en el
--      esquema, pero el `ALTER TYPE` de una base ya migrada hay que escribirlo aqui.
--   2. El CHECK `orders_cancellation_reason_matches_status` (R30, design.md > 3.3).
--   3. El `DROP`/`ADD` del CHECK `orders_delivered_not_deleted`, que pasa a excluir tambien
--      `CANCELADO` (R32, decision cerrada 9, design.md > 3.4). CONSERVA SU NOMBRE a proposito.
--   4. La funcion `next_order_sequence(integer)` y las secuencias `orders_sequence_<ano>` que
--      ella misma crea al vuelo (R11, R12, design.md > 4.1).
--
-- Tras esta migracion `orders` tiene SEIS CHECK (los cinco de QC-33, uno de ellos redefinido,
-- mas el del motivo), las CUATRO FK de QC-33, su indice unico del correlativo y el RLS
-- activado Y forzado. TODA MIGRACION FUTURA SOBRE `orders` HAY QUE REVISARLA A MANO: si el
-- drift de `prisma migrate dev` se lleva por delante las cuatro FK, los seis CHECK, los dos
-- ALTER de RLS o esta funcion, el esquema sigue validando y el cliente sigue compilando —no se
-- entera nadie—. La unica guardia que tienen es
-- `tests/unit/pedidos/schema/pedidos-migration.test.ts`.
--
-- IMPORTACIONES Y RESTAURACIONES (design.md > 4.4, pregunta abierta 4 de requirements.md): la
-- secuencia de un ano solo sabe de los numeros que ella misma entrego. Si alguien carga pedidos
-- de un ano POR OTRA VIA —una importacion, una restauracion parcial, un seed—, las siguientes
-- altas chocarian contra el indice unico `orders_order_year_order_sequence_key` hasta rebasar
-- el maximo existente. Quien cargue filas a mano es responsable de ajustar la secuencia:
--   SELECT setval('orders_sequence_2026', (SELECT max("order_sequence") FROM "orders"
--                                          WHERE "order_year" = 2026));
-- Esta ficha NO crea ninguna herramienta de importacion y hoy no existe ninguna en el repo.

-- 1. EL VALOR NUEVO DEL CONJUNTO CERRADO (decision cerrada 3, R48). Es el coste que QC-33
-- asumio a conciencia al elegir un enum en vez de una tabla: anadir un valor es una migracion
-- del tipo, y quitarlo no se puede (lo resuelve el `down.sql` recreando el tipo entero).
-- El valor va en CASTELLANO porque es un termino de negocio fijado por el humano (R51, QC-33
-- R36); los identificadores, en ingles.
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'CANCELADO';

-- 2. LA COLUMNA DEL MOTIVO (decision cerrada 4, R27, R30). `TEXT` SIN longitud: el tope de 500
-- vive en `zod` (design.md > 3.2), porque cambiar un tope de validacion no puede ser una
-- migracion. ANULABLE, porque el motivo solo existe en un pedido cancelado —es la mitad del
-- CHECK de abajo—.
ALTER TABLE "orders" ADD COLUMN "cancellation_reason" TEXT;

-- 3. CHECK — el motivo existe SI Y SOLO SI el pedido esta cancelado (R30, design.md > 3.3).
--
-- Es una IGUALDAD DE DOS BOOLEANOS, no una implicacion, y por eso cubre LOS DOS sentidos que
-- pide la decision cerrada 4: cancelar sin motivo se rechaza Y escribir motivo sin cancelar
-- tambien. `status` es NOT NULL, asi que ningun lado puede evaluar a NULL —el agujero clasico
-- del CHECK que se cumple por ser nulo—.
--
-- EL `::text` NO ES COSMETICO Y NO SE SIMPLIFICA (design.md > 3.1): Postgres NO deja usar un
-- valor recien anadido a un enum como VALOR DEL ENUM en la misma transaccion que lo anadio, y
-- Prisma Migrate ejecuta cada migracion en una. `"status" = 'CANCELADO'` fallaria aqui con
-- `55P04 unsafe use of new value "CANCELADO" of enum type`. El cast enum -> text es IMMUTABLE,
-- asi que sigue siendo legitimo dentro de un CHECK (el mismo muro que QC-33 rodeo con
-- `AT TIME ZONE 'UTC'`, y por el mismo motivo).
ALTER TABLE "orders" ADD CONSTRAINT "orders_cancellation_reason_matches_status"
  CHECK (("status"::text = 'CANCELADO') = ("cancellation_reason" IS NOT NULL));

-- 4. CHECK — el de borrado de QC-33, AMPLIADO para excluir tambien `CANCELADO` (R32, decision
-- cerrada 9, design.md > 3.4). Se cancela para dejar constancia, asi que borrar despues la
-- borraria de las consultas.
--
-- EL NOMBRE NO CAMBIA: es la misma regla con la definicion ampliada, y renombrarla obligaria a
-- QC-35 y a cualquier traductor de SQLSTATE a conocer dos nombres para lo mismo.
--
-- Sigue siendo SIMETRICO y hay que leerlo en los dos sentidos, como enseno QC-33: bloquea
-- borrar un ENTREGADO O un CANCELADO, bloquea poner ENTREGADO o CANCELADO a un pedido ya
-- borrado, y NO bloquea nada mas —borrar un PENDIENTE o un EN_CURSO sigue siendo legal
-- (QC-33 R30)—. Mismo `::text` que arriba, por el mismo `55P04`.
ALTER TABLE "orders" DROP CONSTRAINT "orders_delivered_not_deleted";
ALTER TABLE "orders" ADD CONSTRAINT "orders_delivered_not_deleted"
  CHECK ("deleted_at" IS NULL OR "status"::text NOT IN ('ENTREGADO', 'CANCELADO'));

-- 5. Entrega la siguiente posicion del correlativo del ano pedido (QC-34 R11, R12; cierra la
-- pregunta abierta 2 de QC-33). Una SECUENCIA POR ANO, creada al vuelo la primera vez.
--
-- POR QUE UNA SECUENCIA Y NO UN CONTADOR EN UNA TABLA: `nextval` NO bloquea ni espera, asi que
-- dos altas simultaneas del mismo ano se llevan numeros distintos sin que ninguna haga cola --
-- que es literalmente lo que pide la decision 10. Un `INSERT ... ON CONFLICT DO UPDATE
-- RETURNING` sobre una tabla de contadores tambien seria atomico, pero mantiene el lock de fila
-- HASTA EL COMMIT: serializa todas las altas del ano, que es la opcion que la decision descarto.
--
-- HUECOS: una transaccion abortada consume su numero y nadie lo reutiliza. Es exactamente lo que
-- QC-33 R42 y la decision cerrada 27 aceptaron a conciencia.
CREATE OR REPLACE FUNCTION "next_order_sequence"(p_year integer)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  seq_name text := format('orders_sequence_%s', p_year);
BEGIN
  RETURN nextval(seq_name::regclass)::integer;
EXCEPTION WHEN undefined_table THEN
  -- PRIMERA ALTA DEL ANO. El lock de aviso serializa SOLO esta rama -- la creacion, una vez al
  -- ano -- y nunca el camino normal de `nextval`. Sin el, dos altas simultaneas el 1 de enero
  -- pueden intentar crear la misma secuencia y una se lleva un 42P07/23505 de `pg_class`.
  PERFORM pg_advisory_xact_lock(hashtext(seq_name));
  EXECUTE format('CREATE SEQUENCE IF NOT EXISTS %I AS integer MINVALUE 1 START WITH 1', seq_name);
  RETURN nextval(seq_name::regclass)::integer;
END;
$$;
