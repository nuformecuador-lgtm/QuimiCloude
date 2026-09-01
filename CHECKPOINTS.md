# CHECKPOINTS.md — Criterios de "estado final correcto"

Una feature solo pasa a `done` si TODO esto se cumple. El reviewer valida contra
esta lista.

## Especificacion
- [ ] Existe `specs/<feature>/requirements.md` con requisitos EARS numerados `R1`, `R2`…
- [ ] Existe `specs/<feature>/design.md` con al menos una alternativa descartada y su porqué.
- [ ] Existe `specs/<feature>/tasks.md` y todas las tasks estan marcadas `[x]`.

## Trazabilidad
- [ ] Cada `R<n>` de requirements.md mapea a al menos un test concreto.
- [ ] `progress/impl_<feature>.md` contiene el mapa `R<n> -> test`.

## Calidad de codigo
- [ ] `pnpm run typecheck` pasa sin errores (TypeScript strict).
- [ ] `pnpm run lint` pasa sin errores.
- [ ] `pnpm test` pasa (unit/integracion).
- [ ] Si la feature toca un flujo critico (autenticacion, permisos, movimientos de
      inventario, importes, webhooks), hay al menos un test E2E (Playwright) que lo cubre.
- [ ] Si la feature toca UI, cumple `docs/architecture.md > Componentes > Regla:
      multiplataforma — web, iOS y Android`, o el `design.md` declara la excepcion y su porque.
- [ ] Si la feature añadió dependencias, cada una tiene su fila en `docs/dependencias.md`
      con los cuatro checks y la aprobacion humana citada en el `design.md`.


## Datos y seguridad (Supabase)
- [ ] **Cada permiso de la feature se valida en el SERVICE y tiene su test.** Esta es la
      frontera real: Prisma se conecta como dueño de las tablas y las policies de RLS no
      filtran sus queries (`docs/architecture.md > Acceso a datos y autorizacion`). Un
      permiso implementado solo como policy NO cuenta como implementado.
- [ ] Toda tabla nueva con datos de usuario/operacion tiene RLS activado **y**
      `FORCE ROW LEVEL SECURITY`. Es defensa en profundidad, no reemplaza lo anterior.
- [ ] El acceso a datos de negocio pasa solo por el repositorio (Prisma). No se coló
      ninguna lectura/escritura con el cliente de Supabase.
- [ ] Las migraciones son versionadas y reversibles: toda migracion nueva tiene su
      `down.sql` (convencion propia; Prisma no genera downs) y `pnpm run db:rollback`
      revierte y deja `_prisma_migrations` coherente.
- [ ] Ningun secreto quedo hardcodeado; todo va por variables de entorno.
- [ ] Webhooks nuevos validan firma/token y son idempotentes.

## Patron de capas
- [ ] Controller no contiene queries de DB ni logica de negocio.
- [ ] Service no conoce HTTP (Request/Response/headers).
- [ ] Repository solo ejecuta queries Prisma, sin logica de negocio.
- [ ] Las interfaces estan en `lib/interfaces/`, separadas por categoria.

## Permisos
- [ ] Paginas protegidas validan permisos en el servidor via `cookies()`.
- [ ] Componentes `private/` reciben datos por props; no fetchean datos sensibles.
- [ ] Mutaciones internas usan Server Actions, no fetch a API routes.

## Configuracion
- [ ] Nada que cambie entre entornos (URLs, credenciales, limites) quedo hardcodeado;
      todo se resuelve por configuracion o variables de entorno.

## Verificacion final
- [ ] `./init.sh` termina en verde.
- [ ] `progress/review_<feature>.md` existe y su veredicto es OK.
- [ ] Se añadio una entrada a `progress/history.md`.
- [ ] El worktree de la feature se desmonto (`./scripts/wt.sh done <id>-<slug>`), o
      quedo anotado en `progress/current.md > Deudas y cosas abiertas` con la razon
      del HOLD. Lo que no vale es dejarlo ahi en silencio.
