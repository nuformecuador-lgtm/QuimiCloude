# QC-249 — entorno-de-preview · design.md

> Escrito por `spec_author` (F1.2) el 2026-10-09. Requisitos en `requirements.md` (R1–R17).
> Respeta la tabla «Decisiones cerradas (no reabrir)» de `requirements.md`; lo que este diseño
> añade y necesita el visto bueno del humano está marcado como **decisión de diseño**.

## Lo que ya existe

Buscado en el board (`feature_list.json`: `preview`, `staging`, `despliegue`), en `specs/`
(`preview`, `VERCEL_ENV`, `comparte base`) y en el código (grafo y Grep: `pasosDelBuild`,
`evaluateDemoSeedGuard`, `readMailTransportFromEnv`, `documentsE2EDoublesEnabled`).

| Qué apareció | Dónde | Qué se hace con ello |
|---|---|---|
| QC-229 — despliegue a producción por CLI y token | `.github/workflows/desplegar.yml`, `tests/guards/guard-despliegue-produccion.test.ts`, `docs/architecture.md > Despliegue a produccion` | Se **reutiliza la forma** (CLI `vercel@63.1.0` por `npx`, mismos tres secrets, comprobación de secrets, sin `pnpm install`). Workflow nuevo y aparte; `desplegar.yml` no se toca. |
| `pasosDelBuild` / `ejecutarBuild` | `scripts/build.mjs`, `tests/unit/scripts/build.test.ts`, `tests/unit/identity/seed/deploy-hook.test.ts` | Se **amplía**: rama nueva para `VERCEL_ENV=preview`. El resto de ramas no cambia (R8). |
| QC-230 — seed de demostración y sus guardas | `scripts/seed-demo.ts`, `scripts/seed-demo/guard.ts`, `tests/unit/scripts/seed-demo-guard.test.ts`, `tests/unit/scripts/seed-demo-run.test.ts` | Se **enmienda** la guarda (decisión cerrada). El seed en sí no cambia. QC-230 no tiene spec (pregunta abierta 2). |
| Transportes de correo `resend` / `outbox` / `smtp` | `lib/modules/identity/adapters/driven/config/mail-config-env.ts`, `lib/modules/identity/adapters/driven/mail/*`, `lib/composition/index.ts` (`credentialSetupMailer`) | Se **añade** un cuarto transporte, `desactivado` (§ 6). `outbox` no sirve en preview (§ 9.4). |
| Dobles de `documentos` | `lib/modules/documentos/adapters/driven/config/e2e-doubles-env.ts`, `lib/composition/index.ts`, `tests/guards/guard-dobles-e2e.test.ts` | Se **reutilizan sin tocar código**: la variable se pone en Vercel, scope Preview (§ 7). |
| Vercel Authentication (`ssoProtection`, `all_except_custom_domains`) | Proyecto `quimi-cloude` en Vercel (medido por el leader el 2026-10-09) | Ya protege las previews. Solo se **verifica** en cada despliegue (R6, § 3.4). |
| Vercel Cron (`vercel.json`, `/api/cron/caducar-pedidos`) | `vercel.json` | Vercel solo lo ejecuta en despliegues de producción: en preview no corre. `CRON_SECRET` queda vacía en Preview. |

No apareció ninguna ficha ni spec que ya resuelva una preview: QC-229 la dejó explícitamente para
«otra ficha» (`docs/architecture.md > Despliegue a produccion > Por qué`).

## 1. Resumen

```
PR a dev (rama del repo)                                   PR desde fork
        │                                                      │
        ▼                                                      ▼
.github/workflows/preview.yml ── job saltado (R2) ◄────────────┘
  1. comprobar secrets (R4)
  2. npx vercel@63.1.0 deploy  (sin --prod)  ──► Vercel, scope Preview
        │                                          pnpm run build = scripts/build.mjs
        │                                            0. comprobación previa de preview (R9, R10)
        │                                            1. prisma migrate deploy   ─┐
        │                                            2. prisma generate          │ base de preview
        │                                            3. tsx scripts/seed.ts      │ (PREVIEW_SUPABASE_REF)
        │                                            4. tsx scripts/seed-demo.ts ┘
        │                                            5. next build
  3. URL -> entorno «preview» del PR + resumen (R3)
  4. curl sin credenciales: 2xx = rojo (R6)
```

En runtime, la preview lee las variables del scope Preview de Vercel: base y storage del proyecto
de Supabase de preview, `MAIL_TRANSPORT=desactivado`, `DOCUMENTS_E2E_DOUBLES` puesta y ninguna
credencial de correo, IA ni QStash. La comprobación previa del build hace cumplir eso: una preview
mal configurada no llega a construirse.

## 2. Modelo de datos

**Sin cambios.** Ninguna tabla, columna, política RLS ni migración nueva. La base de preview es
otro proyecto de Supabase (lo crea el humano, fuera de alcance) y recibe las mismas migraciones
por `prisma migrate deploy` en cada build de preview (R7).

Consecuencia aceptada en la tabla de decisiones (fila «¿Varias previews a la vez?»): la base de
preview es una sola, así que la migración de un PR queda aplicada para todas las previews. Dos
`migrate deploy` simultáneos sobre la misma base no se pisan: Prisma Migrate toma un candado
consultivo de Postgres durante la migración.

## 3. Workflow `.github/workflows/preview.yml` (R1–R6)

### 3.1 Disparo y alcance (R1, R2, R5)

```yaml
on:
  pull_request:
    branches: [dev]
    types: [opened, synchronize, reopened]

permissions:
  contents: read

concurrency:
  group: preview-${{ github.event.pull_request.number }}
  cancel-in-progress: false

jobs:
  preview:
    if: github.event.pull_request.head.repo.full_name == github.repository
    runs-on: ubuntu-latest
    timeout-minutes: 15
    environment:
      name: preview
      url: ${{ steps.desplegar.outputs.url }}
```

- `pull_request`, **nunca** `pull_request_target`: el código del PR no se ejecuta con permisos
  de la rama base.
- La condición `if:` deja saltado (no en rojo) el job de un fork (R2). Un fork tampoco recibiría
  los secrets.
- Grupo de concurrencia **por PR** y sin cancelar (R5): el build remoto migra la base de preview,
  y uno cortado a medias deja sin saber en qué estado quedó (mismo motivo que `desplegar.yml`).
  Previews de PRs distintos sí corren a la vez (§ 2).
- `actions/checkout@v4` con su valor por defecto: en `pull_request` saca el commit de merge del
  PR con `dev`, o sea lo que se integraría.

### 3.2 Pasos

1. `actions/checkout@v4`.
2. `actions/setup-node@v4` con Node 24. Sin pnpm ni `pnpm install`: la CLI va por `npx` y el build
   es remoto (decisión heredada de QC-229).
3. **Secrets presentes** (R4): el mismo paso que `desplegar.yml` (`-n "$VERCEL_TOKEN"` … y
   `exit 1` nombrando los que faltan).
4. **Desplegar** (`id: desplegar`):
   ```bash
   url=$(npx --yes vercel@63.1.0 deploy --yes)
   echo "url=$url" >> "$GITHUB_OUTPUT"
   ```
   Sin `--prod` (R1), versión idéntica a la de `desplegar.yml`, token por la variable de entorno
   `VERCEL_TOKEN` y nunca por `--token`. `vercel deploy` espera a que el build remoto termine y
   sale con error si falla.
5. **Resumen** (R3): la URL en `$GITHUB_STEP_SUMMARY`.
6. **Protección** (R6): ver § 3.4.

### 3.3 La URL en el PR (R3)

**Decisión de diseño:** la URL se publica como **entorno de despliegue de GitHub** (`environment:
name: preview, url: …`). GitHub lo muestra en la conversación del PR («deployed to preview» con el
botón «View deployment») y lo actualiza con cada push. No hace falta ningún permiso extra
(`contents: read` basta) ni comentarios que se acumulen. Alternativa descartada en § 9.2.

### 3.4 La preview no es pública (R6)

Vercel Authentication ya está activo para todo lo que no sea dominio propio (medido el
2026-10-09). En vez de confiar en esa configuración, cada despliegue la comprueba:

```bash
codigo=$(curl -s -o /dev/null -w '%{http_code}' --max-time 30 "$URL")
case "$codigo" in
  2??) echo "::error::La preview responde $codigo sin credenciales: es publica. Revisa Deployment Protection en Vercel."; exit 1 ;;
esac
```

Se rechaza **cualquier 2xx**; no se fija qué responde Vercel a un anónimo (401 o redirección a su
login), porque no está medido en este repo y no hace falta para la regla.

## 4. Comprobación previa de preview: `scripts/entorno-de-preview.mjs` (R9, R10)

Módulo **nuevo**, Node puro y sin dependencias (lo importa `scripts/build.mjs`, que corre antes de
que exista nada generado), con funciones puras sobre un `env` recibido como dato:

```js
/** Nombre de la variable con el identificador del proyecto de Supabase de preview. */
export const VARIABLE_REF_DE_PREVIEW = 'PREVIEW_SUPABASE_REF'

/**
 * R9 (y R13): ¿apuntan estas variables al proyecto de preview?
 * @returns {{ ok: true } | { ok: false, variables: string[] }}  // nombres que no cumplen, nunca valores
 */
export function apuntanAPreview(env, nombres) { … }

/**
 * R9 + R10: todo lo que tiene que cumplir el scope Preview antes de construir.
 * @returns {{ ok: true } | { ok: false, problemas: string[] }}  // una linea por variable, sin valores
 */
export function comprobarEntornoDePreview(env) { … }
```

**Decisión de diseño — cómo se reconoce la base de preview.** El host no basta: el pooler de
Supabase (`*.pooler.supabase.com`) lo comparten todos los proyectos de la región, y lo que
distingue el proyecto es su *Reference ID*, que va en el usuario del pooler (`postgres.<ref>`), en
el host directo (`db.<ref>.supabase.co`) y en la URL de Storage (`https://<ref>.supabase.co`). Así
que:

- El humano pone `PREVIEW_SUPABASE_REF` (el Reference ID del proyecto de preview) **solo** en el
  scope Preview de Vercel.
- `apuntanAPreview(env, ['DATABASE_URL', 'DIRECT_URL', 'SUPABASE_STORAGE_URL'])` exige que la
  variable exista, no esté vacía y que cada URL **contenga** ese identificador.
- El caso que esto atrapa es el peligroso: un scope Preview que sigue con la `DATABASE_URL` de
  producción (copiada) haría que una preview migrara producción con las migraciones de un PR sin
  mergear. Con la comprobación, ese build falla antes del primer paso.
- No se versiona ningún identificador de proyecto (el repo es público).

**Enmienda 2026-10-09 (m1 del review, aprobada por el humano; R9).** «Contenga» se sustituye por
forma y posición, en `scripts/entorno-de-preview.mjs`:

- `PREVIEW_SUPABASE_REF` (recortado) tiene que cumplir `/^[a-z]{20}$/`; si no, `apuntanAPreview`
  devuelve solo `PREVIEW_SUPABASE_REF` y el mensaje lo nombra sin valor.
- Cada URL se lee con `new URL` y la posición depende del nombre de la variable
  (`POSICION_DEL_REF`): `DATABASE_URL` y `DIRECT_URL` cumplen si el usuario es exactamente
  `postgres.<ref>` (pooler, transaction 6543 o session 5432) o si el host es exactamente
  `db.<ref>.supabase.co` (directa); `SUPABASE_STORAGE_URL` cumple si el host es exactamente
  `<ref>.supabase.co`. El ref en el nombre de la base, en la contraseña o en un parámetro no cuenta;
  una URL ilegible o una variable sin regla no cumple (lado seguro). Además (2026-10-09, aprobado
  por el humano), una URL que traiga el parámetro `host` en la query (nombre exacto sin mirar
  mayúsculas, con cualquier valor, vacío o repetido) no cumple, como H1 de QC-230.
- La guarda del seed de demostración llama a `apuntanAPreview` con `['DATABASE_URL', 'DIRECT_URL']`
  y hereda el candado sin cambios propios.
- De paso (m5 del review), `scripts/build.mjs` compara `VERCEL_ENV` recortado, igual que la guarda
  del seed.

**Los efectos fuera de la app (R10).** `comprobarEntornoDePreview` añade un problema por cada una
de estas condiciones:

| Variable | Debe | Por qué |
|---|---|---|
| `MAIL_TRANSPORT` | ser exactamente `desactivado` | ningún correo real sale (§ 6) |
| `DOCUMENTS_E2E_DOUBLES` | tener valor | IA de guion, cola en línea y almacenamiento en memoria (§ 7) |
| `RESEND_API_KEY`, `SMTP_PASS` | estar vacías o ausentes | sin credencial, ni un transporte mal elegido puede enviar |
| `ANTHROPIC_API_KEY`, `GEMINI_API_KEY` | estar vacías o ausentes | no se gastan créditos de IA de producción |
| `QSTASH_TOKEN` | estar vacía o ausente | no se publica en la cola de producción |

Las credenciales se exigen **ausentes** además de elegir los dobles: son dos cerrojos
independientes, y el scope Preview hoy tiene copias de los valores de producción.

Los mensajes nombran la variable y la regla (`MAIL_TRANSPORT debe ser "desactivado"`,
`ANTHROPIC_API_KEY debe estar vacia en preview`), **nunca el valor**. Para `MAIL_TRANSPORT` tampoco
se repite el valor recibido (mismo criterio que `mail-config-env.ts`).

**Ojo con la guardia de dobles.** `tests/guards/guard-dobles-e2e.test.ts` pone en rojo cualquier
archivo versionado que *asigne* `DOCUMENTS_E2E_DOUBLES` (`NOMBRE=valor`, `NOMBRE: valor`). Este
módulo solo la **lee**: el nombre va como elemento de un arreglo o como índice
(`env['DOCUMENTS_E2E_DOUBLES']`), nunca como clave de un objeto literal ni a la izquierda de un
`=`. El nombre queda duplicado respecto a `e2e-doubles-env.ts` porque un `.mjs` que corre antes de
`prisma generate` no importa TypeScript de `lib/`; el test de § 10 compara los dos literales.

## 5. `scripts/build.mjs` (R7, R8, R9, R10)

```js
const SEMBRAR_DEMO = 'tsx scripts/seed-demo.ts'
const CON_TODO = [MIGRAR, GENERAR, SEMBRAR, CONSTRUIR]               // production y fuera de Vercel: igual que hoy
const CON_TODO_Y_DEMO = [MIGRAR, GENERAR, SEMBRAR, SEMBRAR_DEMO, CONSTRUIR]   // preview
const SIN_BASE = [GENERAR, CONSTRUIR]                                // resto de Vercel: igual que hoy
```

`pasosDelBuild(env)` gana una rama para `VERCEL` definida y `VERCEL_ENV === 'preview'`:

- Llama a `comprobarEntornoDePreview(env)`.
- Si no cumple: devuelve `{ pasos: [], saltados: [...CON_TODO_Y_DEMO], motivo, problemas }` con
  `motivo = '[build] Vercel preview -> configuracion de preview incompleta'`.
- Si cumple: `{ pasos: [...CON_TODO_Y_DEMO], saltados: [], motivo: '[build] Vercel preview -> con migrate, seed y seed de demostracion (base de preview)' }`.

`ejecutarBuild` escribe `motivo`; si hay `problemas`, escribe cada uno por `salida.error` y
devuelve `1` sin ejecutar ningún paso (R9, R10). El resto de ramas no cambia (R8): el mensaje de
`development`/otros deja de decir «comparte base con produccion», que ya no es cierto, y pasa a
«sin migrate ni seed (solo production y preview tocan la base)».

**Seed de demostración en el build.** Va como paso propio después del seed base (que crea la
empresa sobre la que siembra la demo) y antes de `next build`. Corre `tsx scripts/seed-demo.ts`
**sin** `--forzar`: lo que lo deja pasar es la guarda enmendada (§ 8), no la bandera. Los dos seeds
son idempotentes (R16: ya cubierto por los tests de QC-6/QC-230), así que repetirlo en cada push no
duplica nada. Solo en preview: producción no recibe nunca datos de demo (R8, R15).

## 6. Correo: transporte `desactivado` (R11, R12)

`outbox` no vale en preview: se niega con `NODE_ENV=production` (Vercel ejecuta las previews con
`NODE_ENV=production`) y escribe en disco, que en una función de Vercel es efímero. Dejar el
transporte real sin credencial funcionaría por accidente (§ 9.4). Por eso, **código nuevo**:

- `mail-config-env.ts`: `MAIL_TRANSPORTS = ['resend', 'outbox', 'smtp', 'desactivado']`.
  `resend` sigue el **primero** y `DEFAULT_MAIL_TRANSPORT = MAIL_TRANSPORTS[0]` no cambia (R12; lo
  vigila `guard-envio-de-correo.test.ts`).
- Archivo nuevo `lib/modules/identity/adapters/driven/mail/credential-setup-mailer-desactivado.ts`:
  ```ts
  export async function sendCredentialSetupLink(input: {
    readonly to: string
    readonly secret: string
  }): Promise<'sent' | 'failed'>
  ```
  No importa ninguna librería, no lee ninguna variable, no escribe archivos. Registra una línea
  (`[identity] correo desactivado (MAIL_TRANSPORT=desactivado): no se envia el enlace`) sin
  destinatario, URL ni secreto, y devuelve `'failed'`.
- `lib/composition/index.ts`: `case 'desactivado': return sendCredentialSetupLinkDisabled(input)`
  en `credentialSetupMailer`.

**Por qué `'failed'` y no `'sent'`.** Es la verdad: no salió nada. Con `'failed'` el usuario queda
creado en `pending` y la pantalla ofrece el reenvío (QC-79 R30), igual que si el proveedor fallara.
En preview se entra con las cuentas del seed y del seed de demo, que tienen contraseña; el alta
sin contraseña se puede ejercitar hasta el punto del correo, no más allá.

## 7. Documentos, IA y cola: dobles existentes (R10)

Sin código nuevo. El humano pone `DOCUMENTS_E2E_DOUBLES` con cualquier valor en el scope Preview
de Vercel, y `lib/composition` ya cablea, en cada llamada: IA de guion (`ai-reader-canned`), cola
en línea (`processing-queue-inline`, ejecuta el trabajo en el mismo proceso: nada sale a QStash) y
almacenamiento en memoria de PDF y recortes.

- La variable vive en Vercel, no en un archivo versionado, así que `guard-dobles-e2e.test.ts`
  sigue en verde y sigue protegiendo lo que protegía: que ningún archivo del repo la encienda.
- La comprobación previa exige que esté puesta (R10) y además que no haya credenciales de IA ni de
  QStash: aunque alguien la quitara, no habría con qué llamar a los proveedores.
- **Límite conocido (pregunta abierta 1):** el almacenamiento en memoria firma la subida contra
  `https://documentos-e2e.invalid`, que no resuelve. En una preview, la subida de un PDF desde el
  navegador falla, y las rutas firmadas viven en la memoria de una invocación. Los flujos de
  catálogo y fórmula desde PDF **no se prueban en preview**; se siguen probando en el E2E local.
- Enmienda fechada a QC-107 `design.md > 8` (§ 12).

## 8. Seed de demostración: enmienda de la guarda (R13–R15)

`scripts/seed-demo/guard.ts`, `evaluateDemoSeedGuard`:

```
VERCEL_ENV = preview:
   VERCEL ausente                                   -> se niega ("preview solo dentro de Vercel")
   apuntanAPreview(env, [DATABASE_URL, DIRECT_URL]) falla -> se niega, nombrando variables
   si no                                            -> permitido, forced: false   (R13)
   (--forzar no cambia nada en ninguna de las tres: R14)
VERCEL_ENV no vacío, distinto de development y preview -> se niega siempre (R15, como hoy)
VERCEL_ENV vacío o development                      -> reglas de hoy: CI, base local, --forzar
```

- En la rama de preview **no se aplica la regla de `CI`**: no está medido si Vercel define `CI`
  en sus builds, y la identidad del entorno ya la dan `VERCEL` + `VERCEL_ENV` + la base de preview.
  Fuera de esa rama, `CI` sigue negando como hoy.
- Reutiliza `apuntanAPreview` de `scripts/entorno-de-preview.mjs` (TypeScript importa el `.mjs`:
  `tsconfig.json` tiene `allowJs`). La guarda la vuelve a comprobar aunque el build ya lo hizo:
  `pnpm db:seed:demo` se puede lanzar a mano con cualquier entorno.
- `seed-demo.ts` no cambia. Su comentario de cabecera y el de `guard.ts` dejan de decir que preview
  comparte la base de producción.
- **Nota de enmienda (pregunta abierta 2):** QC-230 no tiene spec. La enmienda queda fechada en la
  cabecera de `scripts/seed-demo/guard.ts`, en `docs/verification.md > Datos de demostración` y
  aquí.

## 9. Alternativas descartadas

### 9.1 Integración de Git de Vercel (previews automáticas de Vercel)

Es lo estándar y daría el comentario en el PR gratis, pero **no se puede**: la cuenta de Vercel
tiene vinculada otra cuenta de GitHub y el repo vive en otra (motivo de QC-229, sigue vigente).
Además la tabla de decisiones fija CLI y token.

### 9.2 Comentar la URL en el PR con `gh`

`gh pr comment` desde el workflow. Descartada: exige `pull-requests: write` en un workflow que
ejecuta código del PR, y o deja un comentario por push (ruido) o necesita lógica para editar el
anterior. El entorno de despliegue de GitHub (§ 3.3) da el enlace visible y actualizado sin
permisos extra.

### 9.3 Separar la IA y la cola de los dobles, con almacenamiento real de preview

Una variable nueva que active solo la IA de guion y la cola en línea, dejando el Storage real del
proyecto de preview: la subida de PDF funcionaría en preview. Descartada **en esta ficha**: cambia
la bifurcación única de QC-107 (`design.md > 8`, vigilada por `guard-dobles-e2e.test.ts`) y la
decisión cerrada dice «los dobles existentes». Queda como pregunta abierta 1 por si el humano la
quiere en otra ficha.

### 9.4 Correo apagado sin código: transporte real sin credencial

`MAIL_TRANSPORT` vacía (o `smtp`) y sin `RESEND_API_KEY`/`SMTP_*`: los adaptadores devuelven
`'failed'` sin lanzar, y no sale nada. Cero líneas de código, pero el apagado sería **accidental**:
quien copie una credencial al scope Preview enciende el envío real sin tocar nada más, y no hay un
valor que la comprobación previa pueda exigir. Con `desactivado` el apagado es explícito, se exige
en el build y además se exige la ausencia de credenciales.

También descartado `outbox`: se niega con `NODE_ENV=production` y escribe en un disco efímero.

### 9.5 Reconocer la base de preview por el host

Comparar el host de `DATABASE_URL` con uno esperado. Descartada: el pooler de Supabase comparte
host entre proyectos, así que una URL de producción y una de preview pueden tener el mismo host.
El Reference ID sí distingue (§ 4).

### 9.6 Correr migrate y seeds desde el runner de GitHub

Descartada: obligaría a `pnpm install` en el runner (decisión heredada: no) y a tener la
credencial de la base de preview como secret de GitHub, además de en Vercel. El build remoto ya
tiene las variables del scope Preview.

## 10. Tests y guardias

| Archivo | Tipo | Cubre |
|---|---|---|
| `tests/guards/guard-despliegue-preview.test.ts` (nuevo) | guardia, lee el YAML como texto (sin parser, igual que la de producción) | R1 (`on:` = `pull_request` a `[dev]` con `opened/synchronize/reopened`, sin `push` ni `pull_request_target`; `vercel@x.y.z deploy` **sin** `--prod`; misma versión que `desplegar.yml`; sin `pnpm install` ni `vercel build`), R2 (`if:` con `head.repo.full_name == github.repository`), R3 (`environment.url` desde la salida del paso y `GITHUB_STEP_SUMMARY`), R4 (paso de secrets con `-n` y `exit 1` antes del despliegue; sin `--token`), R5 (grupo por número de PR, `cancel-in-progress: false`), R6 (paso posterior al despliegue con `curl` y salida en rojo ante `2??`); `permissions` solo `contents: read` |
| `tests/unit/scripts/entorno-de-preview.test.ts` (nuevo) | unidad | R9 (ref ausente/vacía; cada una de las tres URL sin el ref; las tres con él), R10 (cada condición por separado y juntas), que ningún mensaje contiene un valor, y que el literal `DOCUMENTS_E2E_DOUBLES` coincide con el de `e2e-doubles-env.ts` |
| `tests/unit/scripts/build.test.ts` (se amplía; cambia el caso de preview) | unidad | R7 (orden de los cinco pasos), R8 (production sin demo, development/vacío/ausente sin base, fuera de Vercel sin demo aunque `VERCEL_ENV=preview`), R9/R10 vía `ejecutarBuild` (devuelve 1, no ejecuta ningún paso, escribe los problemas) |
| `tests/unit/identity/seed/deploy-hook.test.ts` | unidad (existente) | R8: production sigue con el seed; se revisa que siga en verde |
| `tests/unit/scripts/seed-demo-guard.test.ts` (se amplía; cambia el caso de preview) | unidad | R13 (permitido con `VERCEL`, preview y ref, aunque haya `CI` y base remota, `forced: false`), R14 (sin `VERCEL`, sin ref o URL de otro proyecto: negado, también con `--forzar`), R15 (production y valores arbitrarios: negado con y sin `--forzar`) |
| `tests/unit/scripts/seed-demo-run.test.ts`, `tests/integration/identity/identity-seed.int.test.ts` | existentes | R16 (idempotencia de los dos seeds; no se tocan) |
| `tests/unit/identity/credencial/mail-config.test.ts` (se amplía) | unidad | R12 (ausente/vacía = `resend`), y `desactivado` admitido |
| `tests/unit/identity/credencial/mailer-desactivado.test.ts` (nuevo) | unidad | R11 (devuelve `'failed'`, no llama a `fetch` ni escribe archivos, la línea registrada no contiene destinatario, secreto ni URL) |
| `tests/unit/composition/identity-facade.test.ts` (se amplía) | unidad | R11 (con `MAIL_TRANSPORT=desactivado`, la fachada usa ese transporte) |
| `tests/guards/guard-envio-de-correo.test.ts` | guardia (existente) | R12; el archivo nuevo no importa `resend` ni `nodemailer` (ya lo cubre el recorrido) |
| `tests/guards/guard-variables-por-entorno.test.ts` (nuevo) | guardia | R17: cada variable declarada en `.env.example` fuera del bloque MCP (`ATLASSIAN_MCP_AUTH`, `CONTEXT7_API_KEY`, `SUPABASE_PROJECT_REF`) aparece en la primera columna de la tabla de `docs/architecture.md > Previews > Variables por entorno`; caso de sensibilidad con una variable inventada |

Ningún test necesita red, Vercel ni la base de preview. Lo único que solo se comprueba de verdad
desplegando es el primer PR (T9).

## 11. Variables por entorno (va a `docs/architecture.md`, R17)

Sin valores. «Prod» = lo que hay hoy en producción, sin cambios. «Local» = `.env` de cada dev.

| Variable | Production | Preview | Local |
|---|---|---|---|
| `DATABASE_URL`, `DIRECT_URL` | base de producción | base del proyecto de preview (contienen `PREVIEW_SUPABASE_REF`) | base local |
| `PREVIEW_SUPABASE_REF` | ausente | Reference ID del proyecto de Supabase de preview | ausente |
| `SESSION_SECRET` | propio | **propio de preview**, distinto del de producción | propio |
| `SEED_ADMIN_*`, `SEED_MAESTRO_*` | de producción | propias de preview | propias |
| `SEED_DEMO_OPERADOR_PASSWORD`, `SEED_DEMO_EMPACADOR_PASSWORD`, `SEED_DEMO_ACONDICIONAMIENTO_PASSWORD` | ausentes | **obligatorias** (el seed de demo falla sin ellas) | en el entorno del comando |
| `SUPABASE_STORAGE_URL`, `SUPABASE_STORAGE_KEY` | de producción | del proyecto de preview | según dev |
| `SUPABASE_STORAGE_BUCKET`, `SUPABASE_DOCUMENTS_BUCKET`, `SUPABASE_CROPS_BUCKET` | de producción | buckets del proyecto de preview | según dev |
| `MAIL_TRANSPORT` | el de hoy (`resend` o `smtp`) | **`desactivado`** | vacía, `outbox` (E2E) o `smtp` |
| `RESEND_API_KEY`, `SMTP_PASS` | de producción | **ausentes** (R10) | según dev |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `MAIL_FROM_ADDRESS`, `APP_BASE_URL` | de producción | ausentes (solo las lee el correo) | según dev |
| `MAIL_OUTBOX_DIR` | ausente | ausente | solo con `outbox` |
| `ANTHROPIC_API_KEY`, `GEMINI_API_KEY` | de producción | **ausentes** (R10) | según dev |
| `ANTHROPIC_MODEL`, `GEMINI_MODEL` | de producción | ausentes | según dev |
| `QSTASH_TOKEN` | de producción | **ausente** (R10) | según dev |
| `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY`, `QSTASH_TARGET_URL` | de producción | ausentes (sin ellas, el webhook rechaza todo) | según dev |
| `DOCUMENT_PROCESSING_TIMEOUT_SECONDS`, `DOCUMENT_PROCESSING_MAX_RETRIES` | opcionales | vacías (valores por defecto) | vacías |
| `CATALOG_PROMPT`, `FORMULA_PROMPT` | de producción | copia de producción (el procesamiento las lee antes de la IA de guion) | según dev |
| `CRON_SECRET` | de producción | ausente (Vercel no ejecuta crons en previews) | según dev |
| `INTEGRATIONS_ENCRYPTION_KEYS`, `INTEGRATIONS_ENCRYPTION_ACTIVE` | de producción | **propias de preview** (la base ya no se comparte) | propias |
| `DOCUMENTS_E2E_DOUBLES` | ausente | **con valor** (R10) | vacía; solo la pone `playwright.config.ts` |

`VERCEL` y `VERCEL_ENV` las pone Vercel y no se cargan a mano.

## 12. Enmiendas a specs y docs cerrados

Cada una, con fecha 2026-10-09 y referencia a QC-249:

- **QC-79** `specs/QC-79-alta-sin-contrasena-y-enlace/design.md > 9.2`: cuarto transporte
  `desactivado` (§ 6). Las condiciones 1 y 2 de 9.2 no cambian.
- **QC-107** `specs/QC-107-componente-de-carga-de-archivos/design.md > 8`: la variable se pone
  también en el scope Preview de Vercel, por decisión del humano; ningún archivo versionado la
  activa salvo `playwright.config.ts` (la regla de la guardia sigue igual).
- **QC-229** `docs/architecture.md > Despliegue a produccion`: el «Por qué» de «Migrate y seed solo
  en produccion» pasa a «solo en production y preview, cada uno con su base»; se añade la sección
  `## Previews (QC-249)` con el flujo, la comprobación previa y la tabla del § 11.
- **QC-230** (sin spec): `docs/verification.md > Datos de demostración` y la cabecera de
  `scripts/seed-demo/guard.ts`.
- `.env.example`: `PREVIEW_SUPABASE_REF=` vacía y comentada («solo en el scope Preview de
  Vercel»); `desactivado` en el comentario de `MAIL_TRANSPORT`; el bloque de
  `INTEGRATIONS_ENCRYPTION_*` deja de decir que preview y producción comparten base;
  `DOCUMENTS_E2E_DOUBLES=` sigue **vacía** (lo exige la guardia de dobles).
- `docs/dependencias.md`, fila de la CLI de Vercel: el uso incluye `preview.yml` (misma versión,
  ninguna dependencia nueva).

## 13. Lo que hace el humano (fuera del código)

En el scope **Preview** de Vercel, antes del primer PR que despliegue: dejar las variables como
dice el § 11. En concreto, además de lo ya hecho (base) y en curso (storage, `SESSION_SECRET`,
seeds): **añadir** `PREVIEW_SUPABASE_REF`, `MAIL_TRANSPORT=desactivado` y `DOCUMENTS_E2E_DOUBLES`;
**borrar** `RESEND_API_KEY` (si está), `SMTP_*`, `MAIL_FROM_ADDRESS`, `APP_BASE_URL`, `QSTASH_*`,
`ANTHROPIC_API_KEY`, `GEMINI_API_KEY` y los modelos; **regenerar** `INTEGRATIONS_ENCRYPTION_*`.
Si falta algo de lo que exige R9/R10, el build de preview falla diciendo qué variable.

## 14. Dependencias

Ninguna nueva. La CLI de Vercel (`vercel@63.1.0`) ya está aprobada; `curl` viene en el runner de
GitHub. `package.json` no cambia.

## 15. Riesgos

- **Una migración de un PR rompe la base de preview para las demás previews.** Aceptado en la
  tabla de decisiones. Si pasa, se arregla la base de preview a mano o se recrea; producción no se
  entera.
- **Un PR malicioso de alguien con acceso de escritura** ejecuta código en el build de Vercel con
  las variables de Preview. Con la tabla del § 11 y la comprobación previa, esas variables no
  tienen ninguna credencial de producción.
- **`vercel@63.1.0` y sus dependencias transitivas por `npx`**: mismo riesgo abierto que ya anota
  `docs/dependencias.md`.
