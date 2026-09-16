# docs/architecture.md — Que significa "buen trabajo" aqui

Referencia de arquitectura. El reviewer usa esto para decidir si una implementacion
esta bien hecha, no solo si "funciona".

## Dominio

**QuimiCloude es un ERP para una empresa de productos quimicos.** De ahi salen tres
consecuencias de arquitectura que no son opinables:

1. **Multiempresa en los datos de operacion, un solo sistema en la identidad** (reescrita
   el 2026-09-04 al abrir la epica QC-46; antes decia «un solo tenant, no hay `empresa_id`
   ni aislamiento por tenant»). El ERP sirve a varias empresas y **todo dato de operacion
   pertenece a una y solo una**: inventario, recetas, unidades, proveedores y pedidos.
   Ninguna consulta ni escritura de esos datos cruza la frontera de la empresa de quien
   pide, y conocer el identificador de una fila ajena no da acceso a ella. **La identidad
   NO se parte**: roles y tipos de documento son del sistema y se comparten —
   «Administrador» significa lo mismo en todas. Lo que une las dos mitades es que **cada
   usuario pertenece a UNA empresa y tiene UN rol**: la empresa es una columna de su ficha
   (`users.company_id`, obligatoria), no una tabla de pertenencias. Un usuario no puede
   estar en dos empresas a la vez, y eso es deliberado (QC-47, decisiones 4 y 5). Lo que
   SI se parte por empresa dentro de la identidad es la **unicidad**: el correo, el nombre
   de usuario y el documento se miden dentro de la empresa, asi que dos empresas pueden
   tener cada una su `admin`.
   - **La frontera se valida en el service.** `## Acceso a datos y autorizacion` sigue
     mandando entero: la RLS no filtra ninguna query de esta aplicacion, asi que un
     aislamiento implementado solo como policy **no cuenta como implementado**, igual que
     no cuenta un permiso. La empresa viaja firmada en la sesion (QC-48) y **eso tampoco
     autoriza por si solo**.
   - **Toda tabla de negocio nueva nace con su columna de empresa.** Las unicas exentas
     son las del sistema, y son una lista corta y cerrada: `users`, `roles`,
     `document_types`. Anadir una tabla de operacion sin empresa es BLOQUEANTE.
   - **Lo ya construido todavia no lo esta**, y esa es la deuda que salda la epica QC-46:
     recetas (QC-50), unidades (QC-51), proveedores (QC-59) y pedidos
     (QC-60). La guardia que lo hace cumplir es QC-61. Mientras una tabla siga en esa
     lista es deuda registrada, no
     incumplimiento; cuando la lista quede vacia, esta vineta se borra.
   - **Lo que la regla vieja protegia sigue en pie.** No se prepara infraestructura «por
     si acaso». Lo que cambio es que multiplicar empresas dejo de ser hipotetico y paso a
     ser backlog; sigue siendo sobre-ingenieria —y el reviewer la rechaza— todo lo que no
     esta pedido: jerarquias de empresas, empresas anidadas, un usuario en varias empresas,
     permisos por empresa mas alla de su rol, o un selector de empresa antes de que exista
     su ficha.
   - **Coste que esto impone y se acepta**: cada feature de datos pasa a llevar columna de
     empresa, filtro en cada consulta, rechazo probado del acceso cruzado y su test. No es
     gratis y no es opcional.
2. **Modulos, no pantallas sueltas.** Un ERP crece por areas funcionales (inventario,
   compras, ventas, produccion, contabilidad...) que comparten entidades. La separacion
   de capas de mas abajo es lo que evita que un modulo nuevo tenga que tocar las tripas
   de otro: se comparten **servicios via interfaz**, nunca repositorios ni tablas
   directamente entre modulos.
3. **Los datos son el producto.** En un ERP el registro *es* la operacion de la empresa:
   un movimiento mal escrito o borrado sin rastro es dinero o inventario perdido. Nada de
   borrado fisico en tablas transaccionales, y toda operacion que mueva existencias o
   dinero es **idempotente y auditable** (quien, cuando, sobre que).

Estado actual: las features 1-9 del backlog son el esqueleto (usuarios, roles, hash de
contrasena, seed, login, sesion, proteccion de rutas, layout y dashboard). **Todavia no
hay ninguna feature de dominio quimico implementada.**

### Preguntas abiertas del dominio

No se rellenan con supuestos (regla 6 de `CLAUDE.md`). Estan aqui porque **son caras de meter
despues**: cambiarlas con datos ya cargados obliga a migrar historico. Conviene cerrarlas
antes de la primera feature de inventario o de producto, no despues. De las cuatro
originales queda **una cerrada**, la 4 desde el 2026-09-03 (QC-33). La **1 se reabrio el
2026-09-07 (QC-76)**: estuvo cerrada desde el 2026-09-01 (QC-14) y revisada el 2026-09-02
(QC-32), pero la conversion entre unidades, que las dos daban por descartada, ahora existe.
Siguen abiertas **la 2 y la 3**, y el 2026-09-04 se abrio **la 5** al reescribir el punto 1
del dominio.

1. ~~**Unidades de medida.**~~ **CERRADA el 2026-09-01 (QC-14) y REVISADA el 2026-09-02
   (QC-32).** Una sola unidad por elemento y **sin conversiones**: eso no ha cambiado y la
   unidad sigue siendo puramente anotativa. Lo que cambio es la forma. QC-14 la guardo como
   **texto libre y opcional** en la columna `unit` del producto, asumiendo a conciencia que
   normalizarla despues costaria una limpieza de datos. El 2026-09-02, al acotar QC-32, el
   humano decidio normalizarla: la unidad pasa a ser un **catalogo propio** (modulo `unidades`,
   tabla `Unit`, nombre unico normalizado y simbolo opcional), y el producto y la linea de
   receta apuntan a el en vez de guardar texto. Se paga el coste que QC-14 anticipo, con la
   suerte de que la base todavia esta vacia. Detalle en
   `specs/QC-32-modelo-unidades/requirements.md`.
   **REABIERTA el 2026-09-07 (QC-76).** Lo que cambia es justo la mitad que QC-14 y QC-32
   daban por cerrada: **si va a haber conversion**. La unidad gana la unidad de la que deriva y
   un **factor decimal exacto de cuatro decimales, mayor que cero** —1 litro = 1000 mililitros—,
   con derivacion de **un solo nivel**, y el modulo `unidades` publica la funcion que convierte.
   Efecto util: la derivacion **deduce la familia de la magnitud**, asi que convertir entre dos
   unidades que no comparten base es un error, no un resultado.
   **El PRIMER CONSUMIDOR es QC-63** (`ejecutar-receta-operador`), decidido el 2026-09-08 al
   acotarla: la pantalla con la que el Operador ejecuta la receta de un pedido asignado deja
   **cambiar la unidad en que se ven las cantidades** —la misma linea en litros o en mililitros—,
   para no obligar a nadie a convertir de cabeza en planta. Cambia **solo como se ve**: no altera la receta ni el pedido y
   no persiste nada, y solo se ofrecen unidades que **comparten base efectiva**. Inventario, recetas y
   pedidos **siguen** tratando la unidad como anotativa. QC-76 anade tambien el **ambito por empresa**
   (`company_id` opcional; sin el, la unidad es de sistema y vale para todas), lo que **absorbio y
   cancelo QC-51**. Detalle y las 30 decisiones cerradas en
   `specs/QC-76-equivalencia-y-ambito-de-unidades/requirements.md`.
2. **Trazabilidad por lote.** ¿Se rastrea lote/batch y fecha de vencimiento? En quimicos
   suele ser obligatorio por normativa, y retrofitear lotes sobre un inventario que solo
   guarda totales es de las migraciones mas dolorosas que existen.
   **RESPONDIDA A MEDIAS, NO CERRADA (2026-09-10, al acotar QC-90).** La tabla
   `product_batches` existe desde el 2026-09-09 -presentacion, existencia, costo unitario,
   `lot` y `expiry_date`, los dos ultimos opcionales- y **QC-90** es quien empieza a
   escribirla: el alta de producto crea su primer lote. Ademas se decidio que **manda el
   lote**: `products.stock` se quita y la existencia pasa a ser la suma de los lotes, que es
   **QC-91**, con **QC-92** para corregirla por ajuste. Lo que sigue ABIERTO es el resto de la
   pregunta: **nada consume todavia** el lote ni el vencimiento -no hay pantalla que los liste,
   ni consumo que elija de que lote sale lo que se despacha, ni aviso por vencer-, y esta sin
   decidir que cuenta como lote vivo. Detalle en
   `specs/QC-90-alta-del-primer-lote/requirements.md`.
   **Corregido el 2026-09-13 (QC-81): `lot` deja de ser opcional.** Pasa a ser obligatorio, con
   **correlativo generado por el backend**, numero simple **unico por empresa** y serie que
   continua desde el mas alto; los lotes que hoy lo tienen vacio se rellenan al migrar. Entra
   ademas la **fecha de compra**, que no existia -`expiry_date` es otra cosa-: obligatoria, con
   hoy por defecto y **nunca futura**. `expiry_date` **sigue siendo opcional**. Esto **no cierra
   la pregunta**: lo que sigue abierto es el resto, que nada consume todavia el lote ni el
   vencimiento. Detalle en `specs/QC-81-lote-y-fecha-de-compra/requirements.md`.
3. **Fichas de seguridad y clasificacion de peligro.** ¿El sistema debe almacenar FDS/SDS,
   clasificacion GHS, o restricciones de almacenamiento/transporte por incompatibilidad?
   Eso decide si hay gestion de archivos (Supabase Storage) y reglas de validacion.
4. ~~**Contabilidad e impuestos.**~~ **CERRADA el 2026-09-03 (QC-33).** El ERP **no
   factura ni liquida impuestos**. El dinero **si** entra al modelo —el precio de venta del
   pedido nace aqui— con `decimal(14,4)` y nunca `float`, y los calculos de dinero, empezando
   por el total del pedido, son **internos y derivados**: se calculan multiplicando precio
   unitario por cantidad y **no se guardan**, para que no puedan contradecir a sus factores.
   **Queda un fleco abierto**: si algun dia hay que exportar esos datos a un contable externo
   no se evaluo, y esta anotado como pregunta abierta en
   `specs/QC-33-modelo-pedidos/requirements.md`.
5. **Moneda por empresa.** QC-14 y QC-42 cerraron que la moneda del costo es **implicita y
   no se guarda**, y la razon escrita fue «el ERP es de un solo tenant». Esa premisa ya no
   vale. Si dos empresas pueden operar en monedas distintas, es columna nueva y conversion
   sobre datos ya cargados. **No se rellena con supuestos**: la cierra la primera ficha de
   aislamiento que toque importes.

## Stack
- **Frontend/servidor:** Next.js (App Router) + TypeScript en modo strict.
- **Estilos:** Tailwind CSS v4.
- **Componentes:** shadcn/ui (Radix UI base). Primero revisar si existe en shadcn/ui
  antes de crear uno propio. `npx shadcn add <component>`.
- **Datos:** Supabase (Postgres). **Prisma es el unico camino de lectura/escritura de la
  aplicacion**; el cliente de Supabase (PostgREST) no se usa para datos. Ver
  `## Acceso a datos y autorizacion`, que explica por que eso cambia donde vive la
  seguridad.
- **ORM:** Prisma. Migraciones versionadas, con `down.sql` **de convencion propia** (ver
  `## Migraciones up/down`).
- **Validacion:** zod en el borde de toda entrada externa.
- **Data fetching cliente:** SWR para queries publicas/no sensibles.
- **Mutaciones internas:** Server Actions (`'use server'`) para crear/editar/eliminar
  dentro del mismo proyecto. No usar `fetch` a rutas API internas para mutaciones.
- **API externa/webhooks:** Route handlers en `app/api/` con zod + firma/idempotencia.
- **Deploy:** Vercel. Secretos en variables de entorno, nunca en repo.
- **Integraciones externas:** ninguna definida todavia. Cuando entre la primera, se
  documenta aqui con su cliente en `lib/modules/<modulo>/adapters/driven/`.

## Dependencias de terceros

**La regla.** Antes de escribir una utilidad, comprueba si ya la resuelve una librería del
ecosistema y prefiérela. Reimplementar a mano lo que una librería mantenida ya hace —fechas,
validación, parsing, decimales, drag&drop, tablas— es código nuestro que hay que mantener,
testear y arreglar. `components/ui/` ya lo dice para shadcn/ui (`## Componentes`); esto lo
generaliza a todo el repo, front y back.

**Los cuatro checks.** Ninguna dependencia entra sin los cuatro, verificados y anotados:
1. No marcada `deprecated` en npm.
2. Release en los últimos 12 meses.
3. >= 10.000 descargas semanales.
4. Licencia MIT, Apache-2.0, BSD o ISC.

Si alguno falla, no se propone. Si no puedes verificarlo (sin red, dato no público), no es un
sí: es un desconocido, y se dice (regla 6 de `CLAUDE.md`).

**La puerta.** Los cuatro checks no bastan: **una dependencia nueva la aprueba una persona.**
Los subagentes no instalan nada por su cuenta — proponen, paran y devuelven la propuesta al
implementer, que la sube al leader, que pregunta. Aprobada, se anota en `docs/dependencias.md`
y ahí se instala. Cuando la librería se elige en la fase de spec, la propuesta va en el
`design.md` y se aprueba junto con el spec (F1.4): así el gate llega antes del código.

**Excepción.** Ninguna silenciosa. Una librería que falla un check puede entrar si el humano
la aprueba explícitamente y la fila del registro dice qué check falló y por qué se aceptó.

**Quién lo verifica.** `tests/guards/guard-dependencias-aprobadas.test.ts` compara
`package.json` contra el registro y falla el gate ante cualquier dependencia no listada. El
reviewer lo trata como BLOQUEANTE. La guardia no consulta npm —el gate corre sin red—, así que
lo que comprueba es la aprobación, no la salud: la salud la acredita la fila del registro.

**Alcance.** Rige hacia adelante. El `package.json` de hoy entra sembrado como `heredada` para
que el gate quede verde el día uno, y se audita contra los cuatro checks en una feature propia
del board. El código ya escrito que reimplementa algo no se reescribe hacia atrás; cuando una
feature lo toque, se aplica a lo que toque.

**Lo que cuesta.** Cada dependencia nueva cuesta una parada y una espera a un humano, y el
umbral de 10.000 descargas descarta librerías nicho legítimas —que entran igual, pero por la
excepción documentada. A cambio, `package.json` deja de crecer solo y el registro dice, en un
sitio, por qué está cada cosa. La regla es preventiva: la fijó el humano el 2026-09-01, no hay
ningún incidente previo que la motive.

## Principios
1. **Arquitectura hexagonal por modulos.** El codigo de negocio vive en
   `lib/modules/<modulo>/`, separado en dominio, puertos y adaptadores. La dependencia
   va siempre hacia adentro (`app/components -> composicion -> adaptadores driven ->
   puertos -> dominio`); el dominio no conoce framework, DB ni composicion. Ver
   `## Modulos y arquitectura hexagonal`.
2. **Borde tipado.** Toda entrada externa (request, webhook, respuesta de API) se
   valida y se tipa en el borde con zod. Nada de `any` cruzando la frontera.
3. **Idempotencia en webhooks.** Un mismo evento entrante no debe producir efectos
   duplicados. Validar firma/token siempre.
4. **Sin hardcode de contexto.** Credenciales, endpoints y cualquier parametro que
   cambie entre entornos se resuelven por configuracion, nunca incrustados en el codigo.
5. **Migraciones versionadas y reversibles.** Toda migracion Prisma tiene su
   `migration.sql` (UP) y `down.sql` (DOWN). Ver `scripts/db-rollback.ts`.
6. **La autorizacion vive en el service, no en la base.** Un permiso que solo existe
   como policy de RLS no protege a esta aplicacion (ver la seccion siguiente).

## Modulos y arquitectura hexagonal

El codigo de negocio vive en `lib/modules/<modulo>/`, no en carpetas horizontales por
tipo tecnico. Cada modulo tiene exactamente tres piezas mas un contrato:

```
lib/modules/<modulo>/
  index.ts                      # CONTRATO PUBLICO: solo reexporta de ./domain
  domain/                       # logica de negocio pura. No conoce framework ni DB.
  ports/                        # interfaces que el dominio necesita (PasswordHasher...)
  adapters/
    driven/                     # implementan un puerto: Prisma, bcrypt, SDKs externos
    driving/                    # Server Actions, route handlers: llaman AL modulo
```

- **Dominio** (`domain/`): casos de uso y tipos. Solo puede importar de su propio
  `domain/`/`ports/`, el contrato (`index.ts`) de otro modulo, y paquetes puros (hoy:
  `zod`). Nunca `next/*`, `react*`, `@prisma/client`, `lib/shared/`, `lib/composition`,
  `app/`, `components/` ni las tripas de otro modulo.
- **Puertos** (`ports/`): la superficie hacia adentro. Los implementa el adaptador
  driven correspondiente y los cablea el punto de composicion. Nadie mas los importa.
- **Adaptador driven**: detalle tecnico detras de un puerto (Prisma, bcrypt, un SDK).
  Es el unico lugar del modulo que puede tocar `@prisma/client` o el cliente Prisma
  compartido.
- **Adaptador driving**: lo que consume la UI (`'use server'` en Server Actions, o un
  route handler). Llama al modulo ya cableado via `lib/composition`.
- **Contrato** (`index.ts`): la unica puerta de entrada al modulo desde fuera. Solo
  reexporta simbolos de `./domain`, nunca de `adapters/` ni `ports/`. Debe poder
  importarse desde un componente de cliente sin arrastrar servidor: nada de
  `'use server'`, `@prisma/client` ni `next/*` en su cierre transitivo de imports.
  **Excepcion:** los adaptadores driving (`'use server'`) NO pasan por el barrel; la UI
  los importa por su ruta exacta (`@/lib/modules/<m>/adapters/driving/...`), porque un
  barrel mezclaria ese codigo de servidor con el contrato puro y lo arrastraria al
  cliente.

### Punto unico de composicion (`lib/composition/`)

`lib/composition/index.ts` es el **unico** archivo del repositorio (fuera de `tests/` y
`scripts/`) que puede importar un adaptador driven de cualquier modulo. Aqui, y solo
aqui, se elige que implementacion concreta cumple cada puerto. Prohibido en sentido
contrario: `lib/composition/` nunca importa un adaptador driving (la flecha va
driving -> composicion, nunca al reves, para que no haya ciclo).

```ts
// lib/composition/index.ts
import { verifyCredentials } from '@/lib/modules/identity';
import { createPasswordHash, verifyPasswordHash } from '@/lib/modules/identity/adapters/driven/security/password-hash';
import type { PasswordHasher } from '@/lib/modules/identity/ports/password-hasher';

const passwordHasher: PasswordHasher = { hash: createPasswordHash, verify: verifyPasswordHash };
export const identity = { verifyCredentials, passwordHasher /* ... */ } as const;
```

Una Server Action, una ruta o un layout consumen el modulo asi: `import { identity }
from '@/lib/composition'`. Un componente de cliente **nunca** importa la composicion ni
un adaptador driven: recibe datos por props y llama a la Server Action por su ruta.

### La regla de dependencias

`M` y `N` son modulos distintos. La hace cumplir
`tests/guards/guard-arquitectura-modulos.test.ts`.

| Origen | PUEDE importar | NO PUEDE importar |
| --- | --- | --- |
| `lib/modules/M/domain/**`, `ports/**` | su propio `domain/ports`, `@/lib/modules/N` (barrel), paquetes puros (`zod`) | `next/*`, `react*`, `@prisma/client`, `lib/shared/**`, `lib/composition`, `adapters/**`, `app/**`, `components/**`, `hooks/**`, `lib/modules/N/**` (profundo) |
| `lib/modules/M/adapters/driven/**` | `../../domain`, `../../ports`, `lib/shared/**`, `@prisma/client`, SDKs externos, `@/lib/modules/N` (barrel), **otro driven del MISMO modulo** (ver nota) | `lib/composition`, `../driving/**`, `app/**`, `components/**`, `lib/modules/N/**` (profundo), **un driven de OTRO modulo** |
| `lib/modules/M/adapters/driving/**` | `lib/composition`, `@/lib/modules/M` (barrel), su propia carpeta, `next/*`, `react*`, `lib/shared/**` | `@prisma/client`, el cliente Prisma compartido, `../driven/**`, `../../domain`/`../../ports` por ruta profunda |
| `lib/composition/**` | `@/lib/modules/*` (barrel), `*/ports/**`, `*/adapters/driven/**`, `lib/shared/**` | `*/adapters/driving/**`, `app/**`, `components/**` |
| `lib/shared/**` | paquetes npm, otros `lib/shared/**` | `lib/modules/**`, `lib/composition` |
| `app/**` (servidor) | `lib/composition`, `@/lib/modules/M` (barrel), `.../adapters/driving/**`, `lib/shared/**`, `components/**`, `hooks/**` | `.../domain/**`, `.../ports/**`, `.../adapters/driven/**` |
| `components/**`, `hooks/**`, archivos `'use client'` | `@/lib/modules/M` (barrel), `.../adapters/driving/**`, `lib/shared/ui/**`, `lib/shared/routes`, `@/lib/utils` | ademas de lo anterior: `lib/composition`, `lib/shared/db/**` |
| `tests/**`, `scripts/**` | todo | — (exentos) |

> **Nota sobre driven -> driven (QC-9).** Un adaptador driven puede apoyarse en otro driven **de su
> mismo modulo**: es lo que permite extraer el codec de sesion (`session-cookie.ts` delega el formato
> y la firma en `session-token.ts`) y por tanto que exista **una sola** implementacion del HMAC en el
> repositorio, que es R5 de QC-8. No cablea nada —el cableado puerto -> implementacion sigue siendo
> exclusivo de `lib/composition/**`—, asi que no toca R11. Un driven de **otro** modulo sigue
> prohibido: eso si seria saltarse el contrato. Lo hace cumplir
> `tests/guards/guard-arquitectura-modulos.test.ts`.

**Direccion, en una frase:** hacia adentro. `app/components -> composicion -> adaptadores
driven -> puertos -> dominio`, y el dominio no mira a nadie.

## Estructura de carpetas

```
app/                            # Rutas y paginas (App Router). SIN CAMBIOS de ubicacion.
  api/                          # Route handlers (webhooks, API publica)
  (public)/                     # Paginas publicas (login...)
  (private)/                    # Paginas autenticadas
  <ruta>/
    page.tsx                    # solo archivos del App Router en la raiz de la ruta
    components/                 # componentes propios de esa ruta
      index.ts                  # barrel: reexporta TODOS (ver ## Componentes)
lib/
  utils.ts                      # `cn`. Fijado por components.json: NO se mueve.
  modules/
    <modulo>/
      index.ts                  # CONTRATO: solo reexporta de ./domain
      domain/                   # casos de uso y tipos, puros
      ports/                    # interfaces que implementan los adaptadores driven
      adapters/
        driven/                 # Prisma, bcrypt, SDKs externos
        driving/                # Server Actions ('use server'), route handlers
  composition/
    index.ts                    # PUNTO UNICO DE COMPOSICION
  shared/                       # nucleo compartido: HOJA del grafo, no conoce modulos
    routes.ts
    db/prisma.ts                # instancia unica de PrismaClient
    navigation/
    ui/
components/
  ui/                           # Primitivas shadcn/ui (Button, Input, Card...)
  shared/                       # Compuestos reutilizables (DataTable, FormField...)
  private/                      # Componentes con datos sensibles (datos via props)
hooks/                          # React hooks reutilizables
db/
  schema.prisma                 # Esquema de Prisma. Cada modelo declara `/// @module <m>`
  migrations/                   # Migraciones versionadas, cada una con:
    20250101000000_init/
      migration.sql             # UP
      down.sql                  # DOWN (OBLIGATORIO)
tests/
  guards/                       # Guardias ejecutables (arquitectura, RLS, contrasenas...)
  unit/                         # Dominio, adaptadores y componentes (mockeando DB)
  integration/                  # Constraints de DB de test
e2e/                            # Playwright (flujos criticos)
scripts/
  db-rollback.ts                # Script de rollback (aplica down.sql)
```

## Acceso a datos y autorizacion

**Esta seccion existe porque el par Prisma + RLS engaña.** Si no se entiende, se escriben
policies que dan una sensacion de seguridad que no es real.

### El hecho

Prisma se conecta por Postgres directo con el rol de `DATABASE_URL`, que en Supabase es el
**dueño de las tablas**. Postgres **no aplica RLS al dueño** salvo que la tabla declare
`FORCE ROW LEVEL SECURITY`. Y aunque se fuerce, Prisma no setea `request.jwt.claims`, asi
que `auth.uid()` es NULL y toda policy que dependa de el deniega o devuelve vacio.

Conclusion: **las policies de RLS no filtran ninguna query de esta aplicacion.** Solo
protegen lo que entre por PostgREST con la anon key, via que aqui no se usa.

### La regla

1. **La autorizacion se valida en el service**, antes de tocar el repositorio. El service
   recibe quien es el usuario y que permisos trae; decide y, si no procede, lanza. No es "ademas de
   RLS": es **la** frontera.
2. **RLS se activa igual en toda tabla con datos de usuario u operacion**, y con
   `ALTER TABLE ... FORCE ROW LEVEL SECURITY`. Es defensa en profundidad para el dia que
   alguien entre por otra via (un cliente nuevo, una consola, un job mal configurado). No
   sustituye al punto 1.
3. **Un permiso que solo existe como policy no cuenta como implementado.** El reviewer
   pide el test de autorizacion en el service; el test de RLS es adicional, no el que
   cierra el requisito.
4. **No se usa `createServerClient()` de Supabase para leer o escribir datos de negocio.**
   Un solo camino de datos: repositorio → Prisma. Dos APIs de datos conviviendo es como se
   acaba con la mitad de las tablas protegidas y la otra mitad no.

### Variables de entorno de la base

Supabase expone dos cadenas y **Prisma necesita las dos**:

```
DATABASE_URL   # pooler (pgbouncer, puerto 6543) — lo que usa la app en runtime
DIRECT_URL     # conexion directa (puerto 5432)  — lo que usa Prisma Migrate
```

En el `datasource` van declaradas ambas (`url` y `directUrl`). **Prisma Migrate no
funciona a traves del pooler en transaction mode**: sin `directUrl`, las migraciones
fallan con errores que no apuntan a la causa. Es el error mas comun al montar Prisma sobre
Supabase.

## Permisos y autenticacion
- Las paginas (Server Components) exigen su permiso en el servidor, antes de leer o pintar datos.
- `middleware.ts` intercepta las rutas privadas y **valida** la cookie de sesion: su **firma**, su
  **caducidad** y la **empresa** del contenido firmado. Que la cookie exista no es sesion.
- El middleware **no corta por rol**: no existe ninguna lista ruta→rol y ninguna decision del borde
  depende del rol que viaja en la cookie. El borde tampoco **consulta la base de datos** y no va a
  hacerlo: no conoce los permisos, y `tests/guards/guard-middleware-edge.test.ts` recorre su cierre
  de imports y se pone roja si alguien mete ahi un repositorio o el catalogo de permisos.
- El corte va en **los dos sentidos**: sin sesion valida en una ruta privada, redirige al login con
  la ruta pedida en `next`; con sesion valida en el login, redirige al dashboard.
- Componentes `private/` reciben datos por props desde el Server Component padre.
- Datos publicos: el cliente fetchea con SWR desde el navegador.
- Datos privados (balances, PII): pre-fetch en Server Component, stream al cliente.

**El corte por permiso vive en la pagina.** Cada `page.tsx` de `app/(private)/` abre con
`requirePagePermission('<modulo>.consultar')`, antes de cualquier lectura de datos. Si el permiso
falta, la respuesta es **404** —no 403—, con el mismo contenido que cualquier otro 404 de la zona
privada: no nombra el modulo pedido ni menciona permisos, de modo que «no existe» y «no puedes» son
indistinguibles para quien sondea URLs.

**El layout privado sigue siendo la ultima linea de defensa.** El corte del middleware no lo
sustituye ni lo relaja: el layout de la zona privada vuelve a leer la sesion en el servidor y
redirige si no la hay. Ademas **filtra el menu** con los permisos de esa misma lectura, en el
servidor: un item para el que no hay permiso no viaja en el HTML. El middleware ahorra render y da
la vuelta rapida; no es la unica puerta.

**Esa lectura es una sola por peticion** (QC-104): el layout, el corte por permiso de la pagina y
las Server Actions que esos componentes invocan mientras se pintan comparten **la misma** lectura de
sesion en vez de repetirla cada uno por su cuenta, y lo compartido muere con la peticion —**nunca**
se reutiliza entre peticiones, porque una sesion revocada no puede sobrevivir a la peticion en que
se leyo—. Lo que esta probado es el **conteo**: sendos **tests del gate** —en `tests/unit/`, no en
`tests/guards/`: los selecciona el grafo de imports, no el barrido de guardias— fallan si una
pantalla, o una Server Action de las que resuelven a la vez el usuario y la empresa, supera **una**
lectura de sesion. La lista de esas acciones **no se escribe a mano**: el test recorre
`lib/modules/**/adapters/driving/**` y se pone rojo si aparece una sin ambito, que es como se
detecta la que llegue en el proximo merge.

**Ni el borde ni la pagina son la frontera de autorizacion.** `## Acceso a datos y autorizacion`
sigue mandando: la **autorizacion se valida en el service**, antes de tocar el repositorio. El rol
que viaja firmado en la cookie **no autoriza** nada; es un dato de presentacion (el nombre que
pinta `nav-user`). **Un permiso implementado solo como corte de ruta no cuenta como implementado**,
igual que no cuenta uno implementado solo como policy de RLS: el 404 de la pagina decide si se
**enseña** una pantalla, y el service decide si se puede **hacer**. Ademas los permisos que lleva la
sesion son una **foto del instante del login** y envejecen hasta 8 h: un cambio de permisos no llega
a la pantalla hasta que la sesion caduca, asi que una pantalla puede pintarse para alguien a quien
el service ya deniega. La invalidacion inmediata es QC-23.

## Server Actions vs Route Handlers
| Caso | Usar |
| --- | --- |
| Mutacion desde un componente propio | Server Action (`lib/modules/<m>/adapters/driving/`) |
| Webhook de un tercero | Route Handler (`app/api/`) |
| API publica para terceros | Route Handler (`app/api/`) |
| Cron interno | Route Handler (`app/api/`) |

## Migraciones up/down

> **`down.sql` no es de Prisma.** Prisma Migrate **no tiene down migrations**: genera solo
> el `migration.sql` (UP). El DOWN es una convencion de este repo, y `db:rollback` un
> script propio. Se documenta asi para que nadie busque el comando de Prisma que lo hace,
> porque no existe.

Cada migracion tiene esta estructura:
```
db/migrations/<timestamp>_<nombre>/
  migration.sql    ← UP: lo genera Prisma
  down.sql         ← DOWN: manual, revierte exactamente migration.sql
```

Cada modelo lleva encima un comentario de documentacion `/// @module <modulo>` que
declara su modulo propietario (arquitectura hexagonal por modulos, ver
`## Modulos y arquitectura hexagonal`). Un modelo sin ese comentario es un
incumplimiento: es lo que evita que un modulo nuevo anada tablas sin dueño. Solo los
adaptadores driven del modulo propietario pueden consultar ese modelo con Prisma; la
guardia `tests/guards/guard-arquitectura-modulos.test.ts` lo hace cumplir leyendo el
esquema y buscando `prisma.<modelo>` fuera de su modulo.

El schema vive en `db/schema.prisma`, **no** en la ruta por defecto `prisma/schema.prisma`.
Eso hay que declararlo (campo `prisma.schema` en `package.json` o `prisma.config.ts`) o
cada comando necesita `--schema=db/schema.prisma`. La carpeta `migrations/` siempre cuelga
de donde este el schema.

Proceso:
1. `pnpm run db:migrate:create` → envuelve `prisma migrate dev --create-only`: crea el
   `migration.sql` y **no** lo aplica.
2. Escribir `down.sql` a mano, revirtiendo exactamente lo que hace `migration.sql`.
3. `pnpm run db:migrate` → `prisma migrate deploy` aplica la migracion.
4. `pnpm run db:rollback` → `scripts/db-rollback.ts` aplica el `down.sql` de la ultima y
   despues corre `prisma migrate resolve --rolled-back <migracion>`. **Ese segundo paso no
   es opcional**: Prisma lleva su propio registro en la tabla `_prisma_migrations`, y
   deshacer el SQL sin avisarle deja el historial mintiendo — la siguiente migracion se
   aplica sobre un estado que Prisma cree que es otro.

## Componentes
- `components/ui/`: primitivas de shadcn/ui. **Nunca crees un componente si ya existe en shadcn/ui.**
  Agregas con: `npx shadcn add <component>`.
- `components/shared/`: compuestos construidos con primitivas ui/. Reutilizables entre features.
- `components/private/`: contienen datos sensibles. El padre (Server Component) valida permisos y
  pasa datos por props. No fetchean datos por si mismos.

### Regla: sin sobre-ingenieria
Si un componente se usa en UN SOLO lugar y no tiene logica reutilizable, vive junto
a la pagina que lo usa. Solo se promueve a `shared/` cuando al menos DOS features
lo necesitan con la misma API.

### Regla: componentes de ruta en `components/` con barrel `index.ts`

"Junto a la pagina" **no** significa sueltos al lado de `page.tsx`. Cada ruta que necesite
componentes propios agrupa **todos** bajo una carpeta `components/` dentro de la ruta, con
un `index.ts` que los reexporta. En la carpeta de la ruta solo quedan los archivos que el
App Router reconoce (`page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx`…).

```
app/(public)/login/
  page.tsx                      # solo la pagina; importa desde ./components
  components/
    index.ts                    # barrel: reexporta TODOS los componentes de la ruta
    login-form.tsx
    submit-button.tsx
```

```ts
// app/(public)/login/components/index.ts
export { LoginForm } from './login-form';
export { SubmitButton } from './submit-button';
```

```tsx
// app/(public)/login/page.tsx
import { LoginForm } from './components';        // SI
// import { LoginForm } from './components/login-form';   NO: salta el barrel
// import { LoginForm } from './login-form';              NO: componente suelto
```

Por que:

- **`page.tsx` se lee de un vistazo.** La carpeta de la ruta deja de mezclar archivos del
  framework con detalles de implementacion.
- **El barrel es la superficie publica de la ruta.** Lo que no esta en `index.ts` es interno;
  un componente que solo usa otro componente de la misma ruta no tiene por que exportarse.
- **Mover un componente a `components/shared/` cuesta una linea**, porque nadie importa por
  ruta profunda.

Notas que evitan sorpresas:

- Una carpeta dentro de `app/` **no crea una ruta** mientras no contenga `page.tsx` o
  `route.ts`, asi que `components/` es seguro. No hace falta el prefijo `_` de Next.js.
- El barrel **no borra la frontera cliente/servidor**: `'use client'` sigue declarandose en
  cada archivo de componente que lo necesite, nunca en el `index.ts`.
- Si la ruta necesita **un solo** componente, tambien va en `components/` con su `index.ts`.
  La consistencia vale mas que ahorrar una carpeta: asi nadie decide caso por caso.
- Esto aplica a componentes **de ruta**. `components/ui/`, `components/shared/` y
  `components/private/` mantienen su estructura y se importan por su ruta de siempre.

### Regla: multiplataforma — web, iOS y Android

La UI se consume desde navegador de escritorio y desde navegador movil o WebView en iOS y
Android. Toda decision de UI se valida contra las tres plataformas, no solo contra la ventana
en la que se escribio.

**Librerias.** Antes de añadir una dependencia de UI, verifica que soporte Safari/WebKit (iOS)
y Chrome Android. Se descartan las que dependan de APIs no soportadas en iOS o que solo
funcionen con mouse/hover. Si no puedes verificar el soporte, no la uses y dilo: soporte sin
verificar es un desconocido, no un si (regla 6 de `CLAUDE.md`).

**Estilos.** Mobile-first con los breakpoints de Tailwind.
- Nada de `100vh` para alto de pantalla: `100dvh` / `min-h-dvh`, por la barra de direcciones de iOS.
- `env(safe-area-inset-*)` en headers y footers fijos, por el notch.
- `:hover` nunca es la unica forma de descubrir o activar algo.
- `position: fixed` y scroll anidado se comprueban en iOS antes de darlos por buenos.

**Interaccion.**
- Targets tactiles de al menos 44x44 px.
- `font-size` >= 16px en inputs, o iOS hace zoom al enfocar.
- Nada que dependa de eventos exclusivos de mouse: Pointer Events o los handlers de React,
  que ya cubren touch.

**Excepcion.** Una feature puede usar algo que solo funcione en escritorio si su
`specs/<feature>/design.md` lo declara y explica por que. Sin esa declaracion el reviewer
rechaza. La excepcion se documenta donde se decide, no en un comentario del componente.

**Alcance.** Rige para codigo nuevo. Lo ya mergeado no se audita hacia atras; cuando una
feature toque un componente existente, se aplica a lo que toque.

**Lo que cuesta.** Descarta librerias de UI que solo se prueban en Chrome escritorio y añade
una pasada de revision en cada PR con UI. El coste se acepta porque el humano fijo el soporte
movil como requisito del producto (2026-08-28). No hay ningun incidente previo que la motive:
la regla es preventiva, no reactiva.

## Anti-patrones que el reviewer rechaza
- Logica de negocio dentro de componentes o handlers de ruta.
- Queries sin indice en rutas calientes o crons frecuentes.
- Tablas nuevas sin RLS, o con RLS pero sin `FORCE ROW LEVEL SECURITY` (sin el `FORCE`,
  el dueño de la tabla —que es con quien se conecta Prisma— la ignora entera).
- **Un permiso implementado solo como policy de RLS**, sin su validacion en el service.
- Leer o escribir datos de negocio con el cliente de Supabase en vez del repositorio.
- Un webhook sin validacion de firma o sin idempotencia.
- Cualquier `console.log` de secretos o PII.
- Migracion nueva sin `down.sql`.
- **Borrado fisico (`DELETE`) en una tabla transaccional.** Se anula o se marca, dejando
  rastro de quien y cuando; el registro es la operacion de la empresa (ver `## Dominio`).
- **`float`/`double` para importes o cantidades.** Se usa decimal con precision explicita:
  en un ERP el redondeo binario se acumula y descuadra.
- **Cantidad sin unidad de medida** en cualquier tabla de producto o existencias, mientras
  la pregunta abierta 1 del dominio no este cerrada en `null`.
- Server component fetcheando datos publicos del cliente (usa SWR en el cliente).
- Componente privado haciendo fetch de datos sensibles (recibe por props).
- **Componentes de ruta sueltos junto a `page.tsx`**, o importados por ruta profunda
  (`./components/login-form`) saltandose el barrel `index.ts` de la ruta
  (ver `## Componentes > Regla: componentes de ruta en components/ con barrel index.ts`).
- **UI que solo funciona en escritorio**: `100vh` como alto de pantalla, `:hover` como unica
  via de activacion, targets tactiles menores de 44x44 px, `font-size` < 16px en inputs, o una
  libreria de UI sin soporte verificado en Safari/WebKit y Chrome Android — salvo excepcion
  declarada en el `design.md` de la feature
  (ver `## Componentes > Regla: multiplataforma — web, iOS y Android`).
- **Dependencia en `package.json` que no está en `docs/dependencias.md`**, o añadida sin
  aprobación humana (ver `## Dependencias de terceros`).
- **Utilidad escrita a mano que ya resuelve una librería del stack** (fechas, validación,
  parsing, decimales) sin que el `design.md` explique por qué no se usó.
- **Import desde el dominio hacia afuera**: `domain/` o `ports/` importando framework,
  Prisma, `lib/shared/`, `lib/composition`, `app/` o `components/`.
- **Import a las tripas de otro modulo** saltandose su `index.ts` (ruta profunda a
  `domain/`, `ports/` o `adapters/` de un modulo que no es el propio).
- **Cableado de adaptadores fuera de `lib/composition/`**: cualquier archivo que no sea
  el punto de composicion (o `tests/`/`scripts/`) importando un adaptador driven.
- **Acceso con Prisma a un modelo de otro modulo**: `prisma.<modelo>` en el adaptador
  driven de un modulo que no es el propietario declarado en `db/schema.prisma`.
- **Codigo de negocio nuevo colgando de `lib/`** en vez de vivir dentro de un modulo
  (`lib/modules/<m>/`).
