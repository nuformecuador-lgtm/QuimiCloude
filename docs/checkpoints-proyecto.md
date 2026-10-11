<!-- perfil: revisado=2026-10-06 por=arnes-v2 -->
# docs/checkpoints-proyecto.md — Criterios de "estado final correcto" propios de QuimiCloude

Complementa a `CHECKPOINTS.md`, que es del arnés y solo trae lo que vale para cualquier proyecto.
Una feature solo pasa a `done` si se cumplen las dos listas; el reviewer recorre esta igual que
aquella, punto por punto.

## Calidad de codigo
- [ ] `pnpm run typecheck` pasa sin errores (TypeScript strict).
- [ ] `pnpm run lint` pasa sin errores.
- [ ] El E2E de un flujo critico es de Playwright.
- [ ] Si la feature toca UI, cumple `docs/architecture.md > Componentes > Regla:
      multiplataforma — web, iOS y Android`, o el `design.md` declara la excepcion y su porque.
- [ ] Toda pieza nueva, subida, extendida o borrada en `components/ui`, `components/shared`,
      `lib/shared/ui` o `hooks` tiene su fila al día en `components/shared/CATALOGO.md`.
- [ ] Todo componente nuevo o con cambio visual tiene su pase `/design` aprobado, citado en el
      `design.md` de la feature y en la celda `Diseño` de su fila del catálogo.

## Flujos criticos
Los que `CHECKPOINTS.md > Calidad de codigo` obliga a cubrir con E2E: autenticacion, permisos,
movimientos de inventario, importes, webhooks.

## Datos y seguridad (Supabase)
Lo genérico (secretos, webhooks) está en `CHECKPOINTS.md > Seguridad`.

- [ ] **Toda tabla de operacion nueva lleva su columna de empresa** y toda consulta suya
      filtra por la empresa de quien pide, con test del rechazo cruzado. Exentas solo las
      de la lista cerrada de `docs/architecture.md > Dominio` n.º 1, que hace cumplir
      `tests/guards/guard-empresa-en-esquema.test.ts` (`users` no es exenta).
- [ ] **Cada permiso de la feature se valida en el caso de uso (`domain/`) y tiene su test.** Esta es la
      frontera real: Prisma se conecta como dueño de las tablas y las policies de RLS no
      filtran sus queries (`docs/architecture.md > Acceso a datos y autorizacion`). Un
      permiso implementado solo como policy NO cuenta como implementado.
- [ ] Toda tabla nueva con datos de usuario/operacion tiene RLS activado **y**
      `FORCE ROW LEVEL SECURITY`. Es defensa en profundidad, no reemplaza lo anterior.
- [ ] El acceso a datos de negocio pasa solo por un adaptador `driven` (Prisma). No se coló
      ninguna lectura/escritura con el cliente de Supabase.
- [ ] Las migraciones son versionadas y reversibles: toda migracion nueva tiene su
      `down.sql` (convencion propia; Prisma no genera downs) y `pnpm run db:rollback`
      revierte y deja `_prisma_migrations` coherente.

## Modulos hexagonales
- [ ] `domain/` y `ports/` no importan framework, base de datos, `shared` ni adaptadores.
- [ ] De otro modulo se importa solo su contrato (`@/lib/modules/<otro>`), nunca ruta profunda.
- [ ] Ningun adaptador `driving` instancia su `driven`: lo pide a `lib/composition`.
- [ ] `lib/shared/**` no importa modulos ni `composition` (es hoja del grafo).
- [ ] Ningun `'use server'` sale reexportado desde el barrel del modulo.
- [ ] Todo modelo de `db/schema.prisma` tiene `/// @module`, y ningun modulo consulta un
      modelo ajeno.
- [ ] No reaparecen `lib/services/`, `lib/repositories/` ni `lib/interfaces/`.
- [ ] En la raiz de `lib/` solo hay `modules/`, `shared/`, `composition/` y `utils.ts`. Todo
      codigo de negocio nuevo cuelga de un modulo, no de `lib/`. **La guardia tampoco lo
      comprueba**: prohibe siete nombres concretos, no todo lo que no sea esos cuatro, asi
      que un `lib/helpers/` o un `lib/dominio/` nuevo pasa en verde.
- [ ] La logica de negocio esta en `domain/`, no en la Server Action. **Esto la guardia no
      lo comprueba**: un caso de uso que solo llama al adaptador y devuelve pasa en verde y
      esta mal.

## Permisos
- [ ] Paginas protegidas validan permisos en el servidor via `cookies()`.
- [ ] Componentes `private/` reciben datos por props; no fetchean datos sensibles.
- [ ] Mutaciones internas usan Server Actions, no fetch a API routes.
