# QC-61 — guardia-empresa-en-esquema · design.md

> `[Dn]` cita la fila n de `requirements.md > Decisiones cerradas`, contando desde arriba (D1 = qué
> tablas están exentas … D8 = librería). `R<n>` son los requisitos del mismo archivo.

## 1. Qué se construye

Una guardia nueva, **un solo archivo**: `tests/guards/guard-empresa-en-esquema.test.ts`. Lee
`db/schema.prisma` como texto, extrae cada modelo con su tabla y sus columnas, y da rojo si un
modelo no declara `company_id` y su tabla no está en `EXENTAS`, la lista cerrada que vive en ese
mismo archivo con el motivo de cada entrada [D5]. Además se corrige el bullet de exentas de
`docs/architecture.md > Dominio` [D6].

**No hay** modelo de datos nuevo, migración, RLS, ruta, Server Action, contrato I/O de producción,
integración externa ni E2E [D7]. No se toca `lib/`, `app/`, `components/` ni `db/`.

## 2. Medición de partida (disco, 2026-09-18)

`db/schema.prisma` declara 20 modelos, **todos con `@@map`**. Sin columna `company_id` hay
exactamente ocho, que son las ocho exentas de [D1]: `DocumentType`→`document_types`,
`Role`→`roles`, `Permission`→`permissions`, `RolePermission`→`role_permissions`,
`Company`→`companies`, `CredentialSetupToken`→`credential_setup_tokens`,
`RevokedSession`→`revoked_sessions`, `RecipeLine`→`recipe_lines`. `Unit` la lleva opcional
(`String? @map("company_id")`) [D3]; `User` la lleva obligatoria (QC-47). Así que la guardia nace
verde (R10) sin tocar el esquema.

Menciones de la lista vieja de exentas (`users`, `roles`, `document_types`) en el repo:

| Archivo | Líneas | ¿Entra por la acotación? |
|---|---|---|
| `docs/architecture.md` | 30-32 | **Sí** [D6] |
| `CHECKPOINTS.md` | 28-30 | **No lo dice** → § 9, punto F1.4-A |
| `.claude/agents/reviewer.md` | 33-35 | **No lo dice** → § 9, punto F1.4-A |

## 3. Cómo se lee el esquema

Funciones puras exportadas desde el propio archivo de la guardia, mismo patrón que el bloque 10 de
`tests/guards/guard-arquitectura-modulos.test.ts` (`extractModelOwners` +
`findModelOwnershipFindings`).

```ts
type ModeloLeido = { modelo: string; tabla: string; columnas: ReadonlySet<string> }
export function leerModelos(schemaSource: string): readonly ModeloLeido[]
```

1. **Normaliza fines de línea primero** (`\r\n?` → `\n`) [R11]. Es la trampa ya conocida del
   repo: en un checkout de Windows con `core.autocrlf=true` y sin `.gitattributes`, un stripper
   `/\/\/.*$/` sin bandera `m` no borra nada sobre una línea que acaba en `\r`. Aquí el efecto
   sería el contrario del que se busca: un `// company_id` superviviente haría pasar un modelo.
2. **Quita los comentarios de línea** (`//` y `///`) línea a línea, **antes** de cualquier otra
   búsqueda [R5]. El esquema no usa comentarios de bloque.
3. Recorre bloques `model <Nombre> {` … `}` (una `}` sola en su línea cierra el bloque). `enum`,
   `datasource` y `generator` no son modelos y se ignoran.
4. Dentro del bloque:
   - **Tabla** = el argumento de `@@map("…")`; si no hay `@@map`, el nombre del modelo (es la
     regla de Prisma para la tabla por defecto).
   - **Columnas**: cada línea de campo `^\s*(\w+)\s+\w+` (nombre + tipo, con `?` o `[]`
     opcionales) que **no** empieza por `@@`. Su columna es el argumento de `@map("…")` si lo
     lleva, o el nombre del campo si no. La obligatoriedad (`?`) **no se mira** [D3] [R3].
   - Un campo de relación (`company Company @relation(fields: [companyId], …)`) aporta la columna
     `company`, no `company_id`: el `companyId` dentro de `fields: [...]` no cuenta [R5].

```ts
type Exenta = { tabla: string; motivo: string }
export const EXENTAS: readonly Exenta[]
export function hallazgosSinEmpresa(modelos: readonly ModeloLeido[], exentas: readonly Exenta[]): readonly string[]
export function hallazgosExentasSinMotivo(exentas: readonly Exenta[]): readonly string[]
```

- `hallazgosSinEmpresa`: un hallazgo por modelo con `!columnas.has('company_id')` cuya `tabla` no
  está en `exentas` [R2] [R4] [R6]. Mensaje:
  `db/schema.prisma: el modelo 'X' (tabla 'x') no declara la columna company_id y su tabla no esta en EXENTAS`
  seguido del remedio: o añade la columna, o añade la tabla a `EXENTAS` **con su motivo**, en la
  revisión.
- `hallazgosExentasSinMotivo`: un hallazgo por entrada con `motivo.trim() === ''` [R9].
- La guardia **no** mira nada más de una tabla exenta: ni de qué receta cuelga `recipe_lines`, ni
  si su padre tiene empresa. Es el riesgo que [D2] acepta, y queda dicho en el motivo de la entrada.

## 4. Decisión: identificar por **tabla**, no por modelo

`EXENTAS` se escribe con nombres de tabla (`@@map`) y la comparación es contra la tabla del modelo.

- La tabla de [D1] ya está escrita en tablas, y `docs/architecture.md` también; con la misma unidad
  en los tres sitios, la comprobación de R14 es una igualdad de conjuntos, sin traducir.
- Es la tabla la que tiene o no tiene la columna en Postgres; el modelo es un nombre del cliente.

**Alternativa descartada — por nombre de modelo (`DocumentType`, `Role`, …).** Obligaría a traducir
al comparar con [D1] y con `architecture.md`, y un `@@map` que cambiara de destino sin renombrar el
modelo seguiría exento aunque la tabla física fuera otra. R6 fija la consecuencia: un modelo llamado
como una exenta pero con otra tabla, da rojo.

## 5. Decisión: la columna se reconoce por su **nombre físico `company_id`**

Se mira la columna (vía `@map` o nombre del campo), no el nombre del campo Prisma.

**Alternativa descartada — buscar el campo `companyId`.** Un `companyId String` sin `@map` crearía la
columna `"companyId"`, que no es la columna de empresa del dominio (`users.company_id`,
`docs/architecture.md > Dominio`), y pasaría. Y buscar la subcadena `companyId` en el bloque daría
verde a cualquier modelo que solo la nombre en una relación o un comentario (R5).

## 6. Decisión: **archivo propio**, parser propio

**Alternativa descartada 1 — un bloque más en `guard-arquitectura-modulos.test.ts`, reutilizando
`extractModelOwners`.** Ese archivo pasa de 1.500 líneas, vigila otra propiedad (dueño del modelo),
y su lector no normaliza CRLF ni lee columnas. Importar sus funciones desde otro test tampoco vale:
importar un `*.test.ts` registra sus `describe` dentro del importador y los correría dos veces.

**Alternativa descartada 2 — el DMMF de Prisma (`Prisma.dmmf` del cliente generado o
`@prisma/internals`).** Da tabla y columna ya resueltas, pero `@prisma/internals` sería dependencia
nueva [D8], y el cliente generado juzga el esquema **de la última `prisma generate`**, no el del
disco: un modelo añadido sin regenerar pasaría. R1 exige no depender del cliente generado.

## 7. Autocomprobación de la guardia (falsabilidad)

Regla del repo (`docs/verification.md > Probar que muerde, no que pasa`, y el patrón de fixtures en
memoria del bloque 10 de la guardia de módulos): cada regla se demuestra con un fuente sintético que
la viola **y** su simétrico que no.

| Caso | Fixture en memoria | Espera | R |
|---|---|---|---|
| Esquema real | `db/schema.prisma` | `leerModelos` > 0 y `[]` hallazgos; `users` en `columnas` con `company_id` | R10, R12 |
| Modelo sin columna, no exento | `model Foo { … @@map("foos") }` | 1 hallazgo que nombra `Foo`, `foos`, `company_id` | R2 |
| Columna obligatoria / opcional | `String @map("company_id")` y `String? @map("company_id")` | `[]` | R3 |
| Exenta sin columna | tabla `roles` sin `company_id` | `[]` | R4 |
| `users` sin columna | `model User { … @@map("users") }` | 1 hallazgo | R7, R10 |
| Solo en comentario | `// company_id` y `/// company_id` dentro del bloque | 1 hallazgo | R5 |
| Solo en relación | `company Company @relation(fields: [companyId], …)` sin escalar | 1 hallazgo | R5 |
| Nombre de exenta, otra tabla | `model Role { … @@map("roles_v2") }` | 1 hallazgo | R6 |
| CRLF = LF | el mismo fixture con `\r\n` y con `\n` (incluido el caso del comentario) | hallazgos idénticos | R11 |
| Sin modelos | `''` y un esquema con solo `enum` | la guardia lo trata como rojo | R12 |
| Motivo vacío | `[{ tabla: 'x', motivo: '  ' }]` | 1 hallazgo que nombra `x` | R9 |
| Lista exacta | `EXENTAS` real | conjunto de tablas = las ocho de [D1], sin `users`, todos con motivo | R7, R8, R9 |
| Sitio de la guardia | `import.meta.url` | vive en `tests/guards/` y el nombre casa con `guard` | R13 |
| Doc = guardia | `docs/architecture.md` real | conjunto de § 8 = tablas de `EXENTAS` | R14 |

Y la prueba de verdad (T6): romper el `db/schema.prisma` real y ver el gate en rojo.

## 8. `docs/architecture.md > Dominio` y su comprobación (R14)

El bullet que empieza por **«Toda tabla de negocio nueva nace con su columna de empresa.»**
(l. 30-32) se reescribe para nombrar las ocho tablas de [D1] con su motivo agrupado (catálogos
compartidos, la propia empresa, cuelgan de un usuario, hereda de su receta), decir que la lista
la hace cumplir `tests/guards/guard-empresa-en-esquema.test.ts` y que **basta con que la columna
exista** [D3]. El resto del bullet («Anadir una tabla de operacion sin empresa es BLOQUEANTE») se
conserva.

La comprobación: la guardia localiza ese bullet por su frase inicial y extrae los identificadores
entre comillas invertidas con forma de tabla (`^[a-z][a-z_]*$`), descontando `company_id`. El
conjunto debe ser igual al de `EXENTAS`. Consecuencia para quien edite el bullet: **no nombrar en
él, entre comillas invertidas, ninguna tabla que no sea exenta** (por ejemplo, `users` va sin
ellas si se menciona). Si el bullet no se encuentra, la guardia da rojo: no pasa en vacío.

## 9. Resuelto en F1.4 (2026-09-18)

**El humano aprobó el spec el 2026-09-18 con las tres opciones: A, B y C entran.** T5, T7 y T8 dejan
de ser condicionales, y R16 entra en `requirements.md`. Lo que sigue es el razonamiento original.

- **F1.4-A — ¿Se corrigen también `CHECKPOINTS.md` (l. 28-30) y `.claude/agents/reviewer.md`
  (l. 33-35)?** Repiten la lista vieja de tres. [D6] solo nombra `architecture.md`. Si no se
  corrigen, quedan contradiciendo a la guardia; `reviewer.md` además es configuración de un agente.
  Si se aprueba: T7 entra y ninguna R cambia (se verifica por revisión, no por test).
- **F1.4-B — ¿La lista cerrada da rojo también cuando le SOBRA una entrada?** Es decir, una exenta
  cuya tabla ya no existe en el esquema, o que ya declara `company_id` (lo que le pasó a `users`).
  La acotación dice «lista cerrada» y no lo resuelve. La convención del repo va en ese sentido:
  `guard-permisos-no-administrables`, `guard-rutas-privadas-cubiertas`, `guard-e2e-landing`,
  `guard-dependencias-aprobadas` y `guard-autorizacion-por-permiso` fallan cuando una exención
  sobra. Si se aprueba, entra como **R16** —al final, para no renumerar—:
  «SI una tabla de la lista de exentas no existe en `db/schema.prisma` o ya declara la columna de
  empresa, ENTONCES la guardia DEBE dar rojo nombrando la entrada que sobra», con T8. Hoy las ocho
  existen y ninguna la declara, así que nacería verde.
- **F1.4-C — La comprobación de § 8 ata el texto de `architecture.md` al gate.** Es lo que hace
  testeable R14, pero impone a futuras ediciones de ese bullet la restricción descrita. Si el
  humano no la quiere, R14 pasa a verificarse solo en la revisión y el caso «Doc = guardia» de § 7
  se quita.

## 10. Convenciones que aplican

- **Comentarios** (`docs/conventions.md > Comentarios`): en `tests/` rige la misma regla que en
  producción —ni `QC-<n>`, ni `R<n>`, ni `design.md` en comentarios—, salvo que `R<n>` **sí** va
  en el nombre de cada `it(...)`. Los motivos de `EXENTAS` son **datos**, no comentarios, y
  tampoco citan fichas: dicen el porqué con sus palabras.
- **Gate**: `pnpm run test:guardias` selecciona por patrón (`vitest run guard`), así que el archivo
  entra solo en `--rapido` y en el completo, sin tocar `package.json` ni `scripts/` [R13].
- **Cruce con otras fichas**: la guardia no toca ningún archivo de `pedidos`. Una ficha en curso que
  **añada un modelo** a `db/schema.prisma` sin `company_id` (y fuera de `EXENTAS`) se pondrá roja
  al rebasar sobre esta: es el objetivo, no un conflicto de archivos.

## 11. Dependencias

Ninguna nueva [D8] [R15]. Se usa `node:fs`, `node:path`, `node:url` y `vitest`, ya presentes.
