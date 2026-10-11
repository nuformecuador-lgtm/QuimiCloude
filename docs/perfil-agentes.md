<!-- perfil: revisado=2026-10-06 por=arnes-v2 -->
# docs/perfil-agentes.md — Reglas del proyecto para cada agente

Los agentes de `.claude/agents/*.md` son **del arnés** (`arnes.manifest`): `scripts/arnes-sync.sh`
los sobrescribe desde la plantilla y solo dicen lo que vale para cualquier proyecto (rol, proceso,
qué leen, qué escriben, qué corren, formato del informe). Lo que es **de QuimiCloude** —stack,
módulos, Supabase, carpetas, reglas propias— vive aquí, que es perfil del proyecto y el sync no
toca. Cada agente lee, al empezar, su sección y `> Todos los agentes`.

Si una regla de aquí contradice a un doc del perfil (`docs/architecture.md`,
`docs/conventions.md`, `docs/verification.md`), manda el doc del perfil y esto se corrige.

## Todos los agentes

- **Comandos de verificación de una tanda.** Cuando un agente dice «typecheck, lint y los tests
  que tu cambio toca», en este repo son:
  `pnpm run typecheck`, `pnpm run lint` y `pnpm exec vitest related --run <tus archivos>`.
  **NO corras `pnpm test`** (la suite completa): ningún subagente la corre
  (`AGENTS.md > Quién corre qué`). Detalle: `docs/verification.md > El gate tiene DOS niveles`.
- **E2E de un spec concreto:** `pnpm exec playwright test <spec>`.
- **Guardias:** `pnpm exec vitest run guard`.
- **Rutas en `tasks.md > Archivos esperados`:** en este repo tienen la forma
  `` `lib/modules/x/y.ts` ``.

### Regla de decisión para componentes (obligatoria)

Regla dura del humano (2026-10-10), no una recomendación: **antes de crear cualquier componente
SIEMPRE se reutiliza lo que existe.** Solo se crea uno nuevo si no existe. Busca en
`components/shared/CATALOGO.md` y aplica en este orden, sin saltarte pasos:

1. **Reutiliza** la pieza que ya existe.
2. **Extiéndela** con una prop opcional, sin romper los usos actuales (los consumidores no cambian
   y sus tests siguen verdes). Anota el punto de extensión en su fila.
3. **Compón** una pieza nueva con las existentes.
4. **Crea** la pieza en la carpeta `components/` de la ruta.

Una pieza **sube a `components/shared`** cuando la necesita una **segunda ruta**, y en ese commit
gana su fila. Subirla antes solo con excepción declarada en el `design.md`, con los consumidores
identificados.

### Pase de diseño para componentes nuevos (obligatorio)

Regla dura del humano (2026-10-10). Todo componente **nuevo** —pasos 3 y 4 de la regla de arriba—
y todo **cambio visual** de uno existente pasa por la guía de marca
(`docs/diseno/guia-de-marca.html`) y lleva su propio pase `/design`: un tablero en el canvas de
Claude Design con sus animaciones, el componente o librería que usa y sus estados en escritorio,
tablet y teléfono. El humano lo aprueba **antes** del spec que lo implementa, el tablero se copia a
`docs/diseno/canvas/` y el `design.md` de esa ficha lo cita. **Sin esa referencia no se
implementa.** Única excepción: un subcomponente interno de una ruta que solo compone piezas ya
catalogadas y no introduce UI visible nueva. Flujo completo: `docs/diseno/README.md`.

## spec_author

- En `design.md`, el **modelo de datos** incluye tablas, **RLS** y migraciones.
- Si la feature toca UI, `## Lo que ya existe` cita las filas de `components/shared/CATALOGO.md`
  consultadas y, por cada componente nuevo, el paso de la regla de decisión que lo justifica
  (`> Todos los agentes > Regla de decisión para componentes`).
- Si el spec propone un componente nuevo o un cambio visual, `design.md` cita su tablero aprobado
  (`docs/diseno/canvas/<Nombre>.dc.html`). Si no existe, **no escribas el spec**: devuelve
  `BLOQUEADO: falta el pase /design de <pieza>` (`> Todos los agentes > Pase de diseño para
  componentes nuevos`).

## implementer

- `frontend_dev` — componentes, páginas, hooks, layouts (stack de UI: `> frontend_dev`).
- `backend_dev` — lógica de negocio y acceso a datos (estructura de módulos: `> backend_dev`),
  migraciones, autorización, **Server Actions**.
- E2E: `pnpm exec playwright test <spec>`, solo los specs que escribiste o tocaste.
- Sincronizar con la rama de integración (F2.3): `git fetch origin dev && git merge origin/dev`.

## backend_dev

Alcance en este repo: casos de uso, puertos, adaptadores, migraciones, RLS, Server Actions y tests.

### Stack y herramientas
- **ORM:** Prisma con migraciones versionadas.
- **DB:** Supabase (Postgres) con RLS en toda tabla sensible.
- **Validación:** zod en el borde de toda entrada externa (route handlers, webhooks).
- **Tests:** Vitest para unit + integracion. Playwright para E2E (flujos criticos).
- **Server Actions:** para mutaciones que no requieren CORS/public API.

### Modulos hexagonales (OBLIGATORIO)

**`lib/services/`, `lib/repositories/` y `lib/interfaces/` ya no existen.** Eran la
estructura anterior; el bloque 2 de `tests/guards/guard-arquitectura-modulos.test.ts` las
prohibe y crear una de ellas pone el gate en rojo.

```
app/api/<feature>/route.ts                        ← borde HTTP: zod, llama al caso de uso
lib/modules/<modulo>/
  index.ts                                        ← CONTRATO: solo reexporta de ./domain
  domain/<caso-de-uso>.ts                         ← logica de negocio. Sin framework, sin DB
  ports/<Algo>.ts                                 ← interfaz por la que el dominio pide
  adapters/driven/<algo>.ts                       ← implementacion: Prisma, cripto, SDKs
  adapters/driving/<accion>.ts                    ← 'use server', route handlers
lib/composition/index.ts                          ← UNICO sitio que ata puerto -> adaptador
lib/shared/                                       ← lo que no pertenece a ningun modulo
```

#### Reglas de capa
1. `domain/` y `ports/` NO importan `next/*`, `react*`, `@prisma/client`,
   `@/lib/shared/**` ni adaptadores. Si el dominio "necesita" la base, lo que necesita es
   un **puerto**, y la implementacion va en `adapters/driven/`.
2. De otro modulo se importa SOLO su contrato (`@/lib/modules/<otro>`), nunca una ruta
   profunda. Si el contrato no expone lo que hace falta, eso es una conversacion sobre el
   contrato, no un import profundo.
3. Un adaptador `driving` NO instancia su adaptador `driven`: lo pide a
   `@/lib/composition`. Ese es el unico sitio donde un puerto se ata a su implementacion.
4. `lib/shared/**` es HOJA del grafo: no importa modulos ni `composition`. Si necesita un
   modulo, no era compartido.
5. Modelo nuevo en `db/schema.prisma` = `/// @module <modulo>` encima. Un modelo sin dueno
   es un hallazgo de la guardia.

La tabla completa de que puede importar que esta en
`docs/architecture.md > La regla de dependencias`. Leela **antes** de crear el primer
archivo, no cuando la guardia se ponga roja.

Antes de dar una tanda por buena: `pnpm exec vitest run guard`.

### Server Actions
Las mutaciones del mismo proyecto van con Server Actions (`'use server'`), no con
rutas de API internas. Los webhooks y APIs publicas si van como route handlers.

```ts
'use server'
import { cookies } from 'next/headers'

export async function createOrder(data: CreateOrderInput) {
  const session = (await cookies()).get('session')
  // validar entrada, pedir el caso de uso a `@/lib/composition` (nunca instanciar), llamar, devolver
}
```

### Migraciones up/down (OBLIGATORIO)
Cada migracion de Prisma DEBE tener su `down.sql` correspondiente:
```
db/migrations/20250101000000_init/
  migration.sql          ← UP (generado por Prisma)
  down.sql               ← DOWN (manual, revierte exactamente migration.sql)
```

`down.sql` es **convencion de este repo, no de Prisma** (Prisma Migrate no genera
downs). Al crear una migracion con `pnpm run db:migrate:create` (que envuelve
`prisma migrate dev --create-only`), ANTES de aplicar, escribe el `down.sql` que revierta
exactamente lo que hace `migration.sql`.

### Comentarios

1. Solo el porque que el codigo no muestra, y corto. Nunca `QC-<n>`, `R<n>`, `design.md` ni
   "decision cerrada" en un comentario de produccion (incluidos `db/schema.prisma` y las
   migraciones; `/// @module` no cuenta). En tests, `R<n>` va en el nombre del caso.
2. **No imites el estilo de alrededor.** Limpia los comentarios de **las lineas que tocas**; los
   preexistentes que no tocas NO se arrastran -se limpian por modulo, en fichas del board-. Si la
   limpieza abulta, va en un commit aparte `chore(<key>): limpia comentarios de <archivo>` que no
   cambie codigo.
3. Si no has verificado el motivo, no lo escribas.

Detalle en `docs/conventions.md > Comentarios`; el reviewer lo rechaza.

### Supabase, RLS y donde vive la autorizacion

**Lee `docs/architecture.md > Acceso a datos y autorizacion` antes de tocar permisos.**
Resumen: Prisma se conecta como dueño de las tablas, y Postgres **no aplica RLS al dueño**
salvo `FORCE ROW LEVEL SECURITY`; ademas Prisma no setea `auth.uid()`. O sea que **las
policies no filtran ninguna query de esta app**.

1. **La autorizacion se valida en el caso de uso (`domain/`)**, antes de llamar al puerto de datos. Esa es la
   frontera real. Un permiso que solo existe como policy NO esta implementado.
2. Toda tabla nueva con datos de usuario/operacion DEBE tener RLS activado **y**
   `ALTER TABLE ... FORCE ROW LEVEL SECURITY`. Es defensa en profundidad, no la frontera.
3. **NO uses el cliente de Supabase para leer/escribir datos de negocio.** Un solo camino:
   adaptador `driven` → Prisma. (El cliente de Supabase queda para lo que no son datos de
   negocio, p. ej. Storage, que ya entra por `@supabase/storage-js`: `docs/dependencias.md`.)
4. Nunca hardcodees URLs ni keys de Supabase; usa variables de entorno. La base necesita
   **dos**: `DATABASE_URL` (pooler) y `DIRECT_URL` (directa, la que usa Migrate).

### Tests (lo propio de este repo)
2. Unit tests para los casos de uso de `domain/` (puertos simulados, sin DB).
3. Integration tests para los adaptadores `driven` y los `driving` contra DB real (base de test:
   `docs/verification.md`).
4. E2E tests (Playwright) para flujos criticos si la feature los requiere.

(Son los puntos 2–4 de la lista original; el 1 —un test por `R<n>`— sigue en
`.claude/agents/backend_dev.md > Tests`, que resume estos tres en genérico.)

## frontend_dev

### Stack y herramientas
- **Componentes:** shadcn/ui (copia codigo al repo, clases Tailwind).
- **Estilos:** Tailwind CSS v4. Nada de CSS-in-JS ni modulos extra.
- **Datos:** Server Components leen y pasan props; no hay libreria de data fetching de cliente
  aprobada (SWR no esta instalado). Si hace falta una, se propone en el `design.md` (regla 7).
- **Mutaciones:** Server Actions (`'use server'`) para crear/editar/eliminar.
  No uses `fetch` a rutas de API para mutaciones locales del mismo proyecto.
- **Permisos:** Las pages obtienen permisos del server via `cookies()` de
  `next/headers`. Los componentes reciben datos como props. Los componentes del directorio
  `components/private/` asumen que el padre ya verifico permisos.

### Estructura de componentes
```
components/ui/        ← primitivas shadcn/ui (Button, Input, Card, Dialog...)
components/shared/    ← compuestos reutilizables (DataTable, FormField, StatusBadge...)
components/private/   ← componentes con datos sensibles (solo render si permisos OK)
```

Y los componentes propios de UNA ruta van dentro de la ruta, agrupados y con barrel:

```
app/(public)/login/
  page.tsx            ← solo archivos del App Router en la raiz de la ruta
  components/
    index.ts          ← reexporta TODOS los componentes de la ruta
    login-form.tsx
    submit-button.tsx
```

### Reglas propias de este repo
(Conservan su número original; las genéricas —accesibilidad, textos, dependencias— están en
`.claude/agents/frontend_dev.md > Reglas`.)

1. NUNCA inventes componentes si los tiene shadcn/ui. Usa `pnpm exec shadcn add <component>`.
2. Usa `kebab-case.tsx` para todos los archivos de componentes (UI, shared y private); el nombre exportado va en `PascalCase` (`docs/conventions.md > Nombres`).
5. No hagas `fetch` a `/api/*` del mismo proyecto para mutaciones; usa Server Actions.
6. La carga de datos va por Server Components; no fetchees del cliente sin libreria aprobada.
7. Si un componente es privado (datos de usuario especifico), vive en `components/private/`
   y recibe los datos por props desde un Server Component padre.
8. Los componentes propios de una ruta **nunca quedan sueltos junto a `page.tsx`**: van en
   `<ruta>/components/` con un `index.ts` que los reexporta, y `page.tsx` importa **desde el
   barrel** (`from './components'`), nunca por ruta profunda. Aplica aunque el componente
   sea uno solo. `'use client'` se declara en cada componente, **nunca en el `index.ts`**:
   el barrel no debe convertirse en frontera cliente/servidor. Detalle y motivos en
   `docs/architecture.md > Componentes`; el reviewer lo rechaza como anti-patron.
9. **Multiplataforma: web, iOS y Android.** La UI se consume desde escritorio y desde navegador
   movil / WebView. Antes de añadir una libreria de UI, verifica su soporte en Safari/WebKit y
   Chrome Android. En estilos: mobile-first, `100dvh` en vez de `100vh`, `env(safe-area-inset-*)`
   en elementos fijos, nunca `:hover` como unica via, targets tactiles >= 44x44 px y `font-size`
   >= 16px en inputs. Si necesitas algo que solo funcione en escritorio, declaralo en el
   `design.md` de la feature; sin esa declaracion el reviewer lo rechaza. Detalle y motivos en
   `docs/architecture.md > Componentes > Regla: multiplataforma`.
11. **Comentarios: solo el porque que el codigo no muestra, y corto.** Nunca cites `QC-<n>`,
    `R<n>`, `design.md` ni "decision cerrada" en un comentario de produccion; en tests, `R<n>` va
    en el nombre del caso. **No imites el estilo de alrededor**: limpia los comentarios de **las
    lineas que tocas**; los preexistentes que no tocas NO se arrastran -se limpian por modulo, en
    fichas del board-. Si la limpieza abulta, va en un commit aparte `chore(<key>): limpia
    comentarios de <archivo>` que no cambie codigo. Si no has verificado el motivo, no lo
    escribas. Detalle en `docs/conventions.md > Comentarios`; el reviewer lo rechaza.
12. Lee `components/shared/CATALOGO.md` antes de crear un componente. Si creas, subes, extiendes
    o borras una pieza de `components/ui`, `components/shared`, `lib/shared/ui` o `hooks`, su
    fila se actualiza en el mismo commit; la guardia `guard-catalogo-de-componentes` lo exige.
13. No crees un componente sin lo que le toca según dónde vive. Si falta, para y devuélvelo al
    leader.
    - **En `components/ui`, `components/shared`, `lib/shared/ui` o `hooks`:** necesita fila en el
      catálogo y referencia de diseño en el `design.md` de tu feature.
    - **En la carpeta `components/` de una ruta** (paso 4 de la regla de decisión): no lleva fila
      en el catálogo. Necesita referencia de diseño en el `design.md` de tu feature si introduce
      UI visible nueva. No la necesita si es un subcomponente interno que solo compone piezas ya
      catalogadas.

### Tests
- Los tests de componentes van en el proyecto `ui` de vitest: `*.test.tsx`.
- E2E de un flujo critico: escribe o ajusta su spec y corre solo ese:
  `pnpm exec playwright test <spec>`.

## reviewer

- En el punto 4 de `.claude/agents/reviewer.md` («verificación ejecutable»), en este repo eso es:
  typecheck, lint, `vitest related`, guardias y los `.int` afectados.
- Revisa también `docs/checkpoints-proyecto.md` punto por punto, igual que `CHECKPOINTS.md`.

Puntos propios de este repo (continúan la lista de `.claude/agents/reviewer.md`):

5. **Calidad y seguridad:** RLS en tablas nuevas, idempotencia/firma en webhooks,
   sin hardcode de contexto, sin secretos, capas separadas.
6. **Multiplataforma:** si la feature toca UI, revisa el diff contra
   `docs/architecture.md > Componentes > Regla: multiplataforma — web, iOS y Android`.
   `100vh` como alto de pantalla, `:hover` como única vía de activación, targets táctiles
   menores de 44x44 px, `font-size` < 16px en inputs o una librería de UI sin soporte
   verificado en iOS son BLOQUEANTES, salvo que el `design.md` de la feature declare la
   excepción y diga por qué.
7. **Dependencias:** si el diff toca `package.json`, cada dependencia añadida debe tener su
   fila en `docs/dependencias.md` y su aprobación citada en el `design.md` de la feature.
   Una dependencia sin fila, o una utilidad escrita a mano que ya resuelve una librería del
   stack sin justificación en `design.md`, son BLOQUEANTES
   (`docs/architecture.md > Dependencias de terceros`).
8. **Aislamiento por empresa:** si el diff añade un modelo a `db/schema.prisma`, debe llevar
   su columna de empresa salvo que su tabla este en la lista cerrada de exentas de
   `docs/architecture.md > Dominio` (la hace cumplir `tests/guards/guard-empresa-en-esquema.test.ts`;
   `users` no es exenta). Y si toca consultas de datos de operación, cada una filtra por la
   empresa de quien pide y existe un test que prueba que el acceso cruzado se rechaza.
   Falta cualquiera de las dos: BLOQUEANTE (`docs/architecture.md > Dominio` n.º 1).
9. **Comentarios** (`docs/conventions.md > Comentarios`): en las líneas que el diff añade o
   modifica en archivos de producción, un comentario que cite `QC-<n>`, `R<n>`, `design.md` o
   «decisión cerrada» es BLOQUEANTE. Los comentarios **preexistentes** que el diff no toca **no**
   son hallazgo: se limpian por módulo, en fichas del board. Son `menor`:
   - un comentario que repite lo que hace el código;
   - un bloque largo;
   - un motivo que no has podido verificar;
   - una limpieza de comentarios mezclada con cambios de código en el mismo commit.

   Hasta que exista la guardia (**QC-115**), esto solo lo ves tú.
10. **Duplicados:** un componente nuevo del diff que cubre lo mismo que una fila de
    `components/shared/CATALOGO.md`, sin que el `design.md` diga qué paso de la regla de decisión
    aplicó y por qué los anteriores no bastaban, es BLOQUEANTE.
11. **Diseño:** un componente nuevo, o un cambio visual de uno existente, sin referencia de diseño
    en el `design.md` de la feature, o cuya fila del catálogo no la lleva en `Diseño`, es
    BLOQUEANTE. No lo es un subcomponente interno de una ruta que solo compone piezas ya
    catalogadas (`frontend_dev` regla 13).

## extractor

- Las carpetas de código que no tocas son `app/`, `lib/`, `components/`, `db/` y `tests/`.
- El framework, el ORM y la librería de UI que el núcleo agnóstico de `prompt.md` (§1–§14) no
  nombra salvo en la §3 y la §6 son, en este repo, **Next, Prisma y shadcn**.
