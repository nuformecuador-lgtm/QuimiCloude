# QC-54 — unificar-constante-rol-administrador · design.md

> Refactor de arnés, sin cambio de comportamiento observable. **Cero cambios en `db/`** (ni
> esquema, ni migración, ni seed) y **cero cambios en `app/` y `components/`**: no hay modelo de
> datos, ni RLS, ni endpoint, ni ruta nueva que diseñar. Lo que sí hay que diseñar es la forma
> exacta de la pieza compartida, el efecto sobre el cierre de imports del borde y el alcance de la
> guardia. Requisitos en `requirements.md`.

## 0. Dependencias de terceros

**Ninguna nueva.** Esta ficha no añade una sola línea a `package.json`: la pieza compartida son
quince líneas de dominio puro y la guardia usa `node:fs` / `node:path` / `vitest`, que es lo que ya
usan las doce guardias de `tests/guards/`. No aplica la puerta de
`docs/architecture.md > Dependencias de terceros`, y `guard-dependencias-aprobadas` debe seguir
verde sin tocar `docs/dependencias.md`.

## 1. Estado medido de partida

Verificado en el árbol del worktree antes de escribir este diseño:

| Cosa | Dónde | Estado |
|---|---|---|
| `ROLE_ADMINISTRADOR = 'Administrador'` | `lib/modules/identity/domain/roles.ts:7` | la buena; ya en el barrel (`index.ts:17`) |
| `ADMIN_ROLE_NAME = 'Administrador'` | `inventario/domain/actor.ts:12`, `recetas/domain/actor.ts:13`, `unidades/domain/actor.ts:14` | tres copias, **exportadas por los tres barriles** |
| `requireAdmin` | `domain/actor.ts` de los cinco módulos | mismo cuerpo cinco veces |
| Patrón destino | `pedidos/domain/actor.ts:10`, `proveedores/domain/actor.ts:8` | ya importan `ROLE_ADMINISTRADOR` de `@/lib/modules/identity` |
| Consumidor de cableado | `lib/composition/route-role-rules.ts:30` | importa `ADMIN_ROLE_NAME` del barrel de `inventario`, **como valor**, en tres filas |
| Consumidor E2E | `e2e/session.spec.ts:51` | importa `ADMIN_ROLE_NAME` del barrel de `inventario` (lo usa en dos sitios más) |
| Consumidores de test | 15 archivos bajo `tests/` | unos por barrel, otros por ruta profunda a `domain/actor` |

**El E2E no estaba en el resumen de contexto y sí es un consumidor.** No es código de producción,
pero `e2e/` entra en el `typecheck` del gate: si el barrel de `inventario` deja de exportar el
símbolo, `pnpm typecheck` se pone rojo ahí. Está en `tasks.md` (T9).

## 2. La pieza compartida en `identity`

### 2.1 Archivo y firma

Archivo nuevo: **`lib/modules/identity/domain/require-admin.ts`**. Dominio puro: no importa nada
salvo `./roles`. Se publica desde el barrel `lib/modules/identity/index.ts`.

```ts
/** Lo mínimo que la regla necesita saber de un actor. Cada módulo conserva su propio `Actor`. */
export type RoleBearer = { readonly roleName: string | null };

/**
 * La ÚNICA implementación de «el actor es Administrador» (R6).
 * Falla cerrado y compara por igualdad EXACTA (R8, R9).
 * El error lo pone quien llama (R7): esta función no conoce ninguna jerarquía de errores.
 */
export function assertAdminRole(
  actor: RoleBearer | null | undefined,
  onDenied: () => Error,
): void {
  if (!actor || actor.roleName !== ROLE_ADMINISTRADOR) {
    throw onDenied();
  }
}
```

### 2.2 Por qué `void` y no una firma de aserción (`asserts actor is ...`)

Los cinco `requireAdmin` de módulo **conservan su firma actual**, byte por byte:

```ts
export function requireAdmin(actor: Actor | null | undefined): asserts actor is Actor {
  assertAdminRole(actor, () => new UnauthorizedError());
}
```

Esto funciona y es deliberado: **TypeScript no verifica el cuerpo de una función de aserción**, solo
exige que el *llamante* de una aserción la invoque por un nombre con anotación de tipo explícita.
Como `assertAdminRole` devuelve `void`, no hay ninguna interacción con esa restricción, y como
`requireAdmin` mantiene su propio `asserts actor is Actor`, **el estrechamiento de tipos que ven los
casos de uso no cambia**. Ni un caso de uso ni un test tienen que anotar nada nuevo. Es la propiedad
que hace verificable R15.

### 2.3 Alternativas descartadas

**(a) `UnauthorizedError` compartido en `identity`.** Descartada por la decisión 3 del seed, y
medida: los siete adaptadores driving (`presentation-actions`, `product-actions`, `order-actions`,
`supplier-actions`, `supplier-catalog-actions`, `recipe-actions`, `unit-actions`) serializan con
`error instanceof <Modulo>Error`. Un error compartido no puede extender `InventarioError`,
`RecetasError`, `UnidadesError`, `PedidosError` y `ProveedoresError` a la vez, así que caería fuera
de los siete `catch` y saldría por el camino del error inesperado: **cambio de comportamiento
silencioso** en la serialización de un 403. Justo lo que esta ficha no puede permitirse.

**(b) `identity` exporta una firma de aserción genérica**
(`assertAdmin<T extends RoleBearer>(actor: T | null | undefined, onDenied): asserts actor is T`).
Compila, pero obliga a que cada llamante la invoque por un identificador con anotación explícita y
convierte la delegación en una fuente de errores de tipo crípticos cuando alguien la reexporte o la
envuelva en un objeto. Cero beneficio: el estrechamiento ya lo aporta el `requireAdmin` de módulo.

**(c) `identity` exporta un predicado `isAdmin(actor): boolean` y cada módulo escribe su `if`.**
Deja la comparación —el `!actor ||`, la igualdad exacta, el orden— **replicada cinco veces**. Es
justo la duplicación que la decisión 2 manda cerrar: unifica el literal y no la regla.

**(d) Re-export de `ADMIN_ROLE_NAME` desde los tres barriles apuntando a `ROLE_ADMINISTRADOR`.**
Descartada por la decisión 1 del seed, y no se reabre: dos nombres vivos para la misma cosa, y nada
obliga a migrar.

## 3. Cambios por archivo (producción)

| Archivo | Cambio |
|---|---|
| `lib/modules/identity/domain/require-admin.ts` | **nuevo**: `RoleBearer`, `assertAdminRole` |
| `lib/modules/identity/index.ts` | exporta `assertAdminRole` y `type RoleBearer`; se reescribe el comentario de las líneas 42-45, que afirma que nombrar el rol exige el barrel de `inventario` (R17) |
| `lib/modules/identity/domain/route-role-rules.ts` | se reescribe el comentario de cabecera equivalente (líneas ~16-22) (R17) |
| `lib/modules/{inventario,recetas,unidades}/domain/actor.ts` | se borra `ADMIN_ROLE_NAME` y su JSDoc de deuda; `requireAdmin` delega en `assertAdminRole` |
| `lib/modules/{pedidos,proveedores}/domain/actor.ts` | `requireAdmin` delega en `assertAdminRole`; el `import { ROLE_ADMINISTRADOR }` se retira si ya no se usa |
| `lib/modules/{inventario,recetas,unidades}/index.ts` | se retira `ADMIN_ROLE_NAME` del `export` (R2). `requireAdmin` y `Actor` siguen exportándose |
| `lib/composition/route-role-rules.ts` | `import { ROLE_ADMINISTRADOR } from '@/lib/modules/identity'`; las tres filas pasan a `[ROLE_ADMINISTRADOR]`; se reescribe la cabecera y el JSDoc de `ROUTE_ROLE_RULES` (R13, R17) |

Nada bajo `app/`, `components/`, `hooks/` ni `db/`.

## 4. El borde: por qué es seguro, y por qué además mejora

`lib/composition/route-role-rules.ts` **tiene** que cargar en el runtime del borde: `middleware.ts`
lo alcanza vía `identity/adapters/driving/route-guard-middleware.ts`, y
`tests/guards/guard-middleware-edge.test.ts` recorre el cierre completo de imports desde
`middleware.ts` buscando `node:crypto`, `crypto`, `@prisma/client`, `next/headers` y
`lib/shared/db/prisma`.

Lo medido, y esto es lo que exige decir explícitamente el encargo:

1. **El barrel de `identity` ya está en ese cierre, y como VALOR.**
   `route-guard-middleware.ts:29-33` hace `import { decideRouteAccess, isSessionExpired, type
   RouteAccessSession } from '@/lib/modules/identity'`. Leer de ahí `ROLE_ADMINISTRADOR` **no añade
   un solo archivo nuevo** al cierre del borde.
2. **`identity/domain/roles.ts` y el `require-admin.ts` nuevo no importan nada.** Dominio puro; el
   segundo solo importa el primero. No pueden arrastrar nada prohibido.
3. **El cambio ADELGAZA el borde.** Hoy `route-role-rules.ts` importa el barrel de `inventario` como
   valor, así que **todo el cierre de ese barrel** —nueve factorías de caso de uso, `zod`, esquemas,
   `list-query`— entra en el bundle del middleware. Al retirarlo, si ningún otro archivo del cierre
   lo alcanza, el borde deja de cargar el módulo `inventario` entero. Es un efecto secundario
   favorable, no un objetivo, y **no se convierte en requisito**: `guard-middleware-edge` verifica
   ausencia de imports prohibidos, no tamaño. Lo que sí se verifica es que la aserción
   `expect(files).toContain(...)` de esa guardia siga citando archivos que existen.
4. **El centinela de `inventario` no estorba y no se toca (R16).**
   `tests/unit/inventario/schema/inventario-schema.test.ts` no barre `lib/composition/**` —no está
   entre sus `raicesVigiladas`— y lo que prohíbe fuera de ahí es importar **factorías de caso de
   uso** del barrel como valor, no cualquier valor. Retirar un import solo puede acercarlo al verde.

## 5. La guardia nueva

**Archivo:** `tests/guards/guard-rol-administrador-unico.test.ts`. El nombre empieza por `guard-`,
que es lo que selecciona `pnpm run test:guardias`; no hay ningún registro que actualizar.

**Patrón de la casa**, copiado de `guard-firma-sesion-unica.test.ts` y de la mitad centinela de
`tests/unit/pedidos/authorization.test.ts` (que es la prueba de concepto ya mergeada de esta idea, a
escala de un módulo):

- `findRepoRoot()` subiendo hasta el `package.json`.
- Barrido recursivo de `PRODUCTION_DIRS = ['lib', 'app', 'components', 'hooks']` más los `.ts`/`.tsx`
  de **primer nivel** de la raíz, con `IGNORED_DIRS` incluyendo `.worktrees`. `tests/`, `e2e/`,
  `scripts/` y `db/` quedan fuera: mencionan el literal a propósito.
  La decisión 4 pide como mínimo `lib/modules`; se barre el conjunto de producción entero porque
  `lib/composition/route-role-rules.ts` —el tercer consumidor de hoy— vive fuera de `lib/modules`, y
  porque una página que escriba el rol a mano es exactamente la misma deuda.
- `stripComments()` con **los comentarios de línea PRIMERO y los de bloque después**. No es un
  detalle de estilo: al revés, un comentario de línea que contenga una apertura de bloque abre un
  bloque falso que se traga el código de debajo y la guardia pasa en verde sin mirar. Está
  documentado en las dos guardias citadas y hay un test de regresión para ello en ambas; esta lo
  hereda.
- El patrón se **deriva** del valor: ``new RegExp(`['"\`]${escapeRegExp(ROLE_ADMINISTRADOR)}['"\`]`)``.
  Nunca la cadena `"'Administrador'"` escrita a mano. Los dos agujeros de esa versión están medidos
  en `progress/impl_QC-34-crud-de-pedidos.md`: solo veía la comilla simple —la doble y el backtick se
  colaban, y ninguna regla de lint obliga a una comilla concreta— y, si `identity` renombrara el rol,
  seguiría vigilando un nombre inexistente y quedaría **verde por vacuidad**.
- **Exención única:** `lib/modules/identity/domain/roles.ts`. Y su ancla simétrica:
  `expect(infractores).not.toEqual([])` **no**; lo que se ancla es que el archivo exento **sí** casa
  con el patrón (`expect(conElLiteral).toContain(DUENO_UNICO)`), para que la guardia avise en vez de
  callarse si `roles.ts` cambia de forma.
- Casos **sintéticos** obligatorios (R12): un fuente con el literal en comilla simple → rojo; con
  comilla doble → rojo; con backtick → rojo; el mismo literal dentro de un comentario → verde; el
  caso simétrico de un archivo que importa `ROLE_ADMINISTRADOR` → verde.

**Alternativa descartada para la guardia:** replicar en cada módulo el centinela que ya tienen
`pedidos` y `proveedores` dentro de su `authorization.test.ts`. Se descarta porque es justo el modo
de fallo que la ficha ataca: **el módulo número seis nacería sin centinela**, igual que
`inventario`, `recetas` y `unidades` nacieron sin él teniendo `identity` delante. Una guardia global
en `tests/guards/` cubre lo que todavía no existe; cinco centinelas locales solo cubren lo que
alguien se acordó de escribir. Los centinelas locales de `pedidos` y `proveedores` **se dejan como
están** (defensa en profundidad barata, y tocarlos violaría R15).

## 6. Contrato de I/O

No cambia ninguno. En concreto, y esto es lo que hay que poder afirmar al cerrar:

- `requireAdmin(actor)` de los cinco módulos: misma firma, mismo `asserts actor is Actor`, mismo
  error, mismo momento (antes de cualquier puerto).
- Los siete adaptadores driving: mismo `{ status: 'error', code: 'unauthorized', message }`.
- `ROUTE_ROLE_RULES`: mismas tres filas, mismos prefijos, mismo rol.
- La cookie de sesión: intacta. El rol sigue viajando firmado con el valor `'Administrador'`, así que
  **ninguna sesión viva se invalida** (decisión 6).

## 7. Riesgos y cómo se cierran

| Riesgo | Cierre |
|---|---|
| Un consumidor se queda sin migrar | Rompe el `typecheck` del gate. Es donde se quiere que rompa (decisión 1) |
| El refactor cambia el error que ve la UI | R10 + los tests de los siete adaptadores driving, sin tocar |
| Un test necesita cambiar más que el import | **Señal de que el refactor cambió comportamiento.** Se para y se reporta, no se «arregla» el test (R15) |
| La guardia queda verde por vacuidad | El patrón se deriva del valor y se ancla el archivo exento (§5) |
| El middleware deja de cargar | `guard-middleware-edge` en cada tanda, no solo al final (§4, R14) |
