# QC-249 — entorno-de-preview · requirements.md

> **Zona:** `backend` · **Complejidad:** `medium` · **depends_on:** — ·
> **Rama:** `feature/QC-249-entorno-de-preview`
>
> **Alcance.** Cada PR a `dev` publica una preview de la app en Vercel, sin la integración de Git
> de Vercel, contra una base y un storage de preview propios. El build de preview migra y siembra
> esa base (seed base + seed de demo). Correo, cola de documentos e IA no tienen efecto real en
> preview. El link solo lo abren cuentas de Vercel del equipo.
>
> **Lo que NO entra.** Crear el proyecto de Supabase, los buckets ni cargar variables en Vercel
> (lo hace el humano; ya hechas la base y, en curso, el storage). Una base por PR. El paso dev → prod
> (se hace al cerrar el rediseño). Previews de PRs desde forks (GitHub no les da secrets).
>
> Sembrado por `/afinar-feature` el 2026-10-09. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

Escritos por `spec_author` (F1.2) el 2026-10-09. «El build» es `pnpm run build`
(`scripts/build.mjs`); «el workflow de preview» es el de GitHub Actions que crea esta feature;
«la base de preview» es la del proyecto de Supabase de preview que identifica
`PREVIEW_SUPABASE_REF` (`design.md > 4`).

### Publicar la preview

- **R1** (evento) — CUANDO se abre, se reabre o recibe un push un pull request cuya rama base es
  `dev` y cuya rama de origen vive en este mismo repositorio, el sistema DEBE desplegar ese código
  en Vercel como despliegue de **preview** (nunca de producción), con la CLI de Vercel en la
  versión fija aprobada y por token, sin instalar dependencias ni construir en el runner.
- **R2** (condicional) — SI la rama de origen del pull request vive en un fork, ENTONCES el
  sistema NO DEBE intentar el despliegue: el job queda saltado, no en rojo.
- **R3** (evento) — CUANDO el despliegue de preview termina bien, el sistema DEBE dejar su URL
  visible en el pull request y en el resumen de la ejecución del workflow.
- **R4** (condicional) — SI falta alguno de los secrets `VERCEL_TOKEN`, `VERCEL_ORG_ID` o
  `VERCEL_PROJECT_ID`, ENTONCES el workflow de preview DEBE fallar antes de desplegar, nombrando los
  que faltan y sin pasar el token por la línea de comandos.
- **R5** (de estado) — MIENTRAS un despliegue de preview de un pull request está en curso, el
  sistema DEBE encolar el siguiente despliegue de ese mismo pull request sin cancelar el que está
  en curso.

### Quién la abre

- **R6** (condicional) — SI, terminado el despliegue, la URL de la preview responde con un código
  2xx a una petición sin credenciales de Vercel, ENTONCES el workflow de preview DEBE fallar
  diciendo que la preview es pública.

### Build de preview: migra y siembra

- **R7** (evento) — CUANDO el build corre en Vercel con `VERCEL_ENV=preview` y pasa las
  comprobaciones de R9 y R10, el sistema DEBE ejecutar, en este orden, `prisma migrate deploy`,
  `prisma generate`, el seed base, el seed de demostración y `next build`, y parar en el primer
  paso que falle con su código de salida.
- **R8** (ubicuo) — El build DEBE conservar el resto de casos sin cambios: en Vercel con
  `VERCEL_ENV=production`, migrate, generate, seed base y `next build` (sin seed de
  demostración); en Vercel con `VERCEL_ENV` ausente, vacío o con cualquier otro valor, solo
  `prisma generate` y `next build`; fuera de Vercel, los cuatro pasos de siempre (sin seed de
  demostración).
- **R9** (condicional) — SI el build corre en Vercel con `VERCEL_ENV=preview` y falta
  `PREVIEW_SUPABASE_REF`, o alguna de `DATABASE_URL`, `DIRECT_URL` o `SUPABASE_STORAGE_URL` no
  contiene ese identificador, ENTONCES el build DEBE fallar antes de ejecutar ningún paso, con un
  mensaje que nombre las variables que no cumplen y que no incluya ningún valor.
  - *Enmienda 2026-10-09 (m1 del review, aprobada por el humano):* «contiene» se endurece. (a)
    `PREVIEW_SUPABASE_REF` DEBE tener la forma de un Reference ID de Supabase, exactamente 20
    letras minúsculas `[a-z]`; si no, el build falla con un mensaje que nombra la variable, sin
    valor. (b) El identificador DEBE aparecer en una posición reconocida, no como subcadena suelta:
    en `DATABASE_URL` y `DIRECT_URL`, como usuario del pooler (`postgres.<ref>:`) o como host directo
    (`@db.<ref>.supabase.co`); en `SUPABASE_STORAGE_URL`, como host (`//<ref>.supabase.co`). Las que
    no cumplen se nombran sin valores. La guarda del seed de demostración (R13, R14) hereda el mismo
    candado para `DATABASE_URL` y `DIRECT_URL`. Motivo: con un ref como `supabase`, `postgres` o uno
    truncado, las URL de producción pasaban la comprobación. Además (2026-10-09, aprobado por el
    humano), cualquiera de las tres URL que traiga el parámetro `host` en la query (sin mirar
    mayúsculas del nombre, también vacío o repetido) no cumple y se nombra sin valor, con el mismo
    criterio que H1 de QC-230.

### Sin efectos fuera de la app

- **R10** (condicional) — SI el build corre en Vercel con `VERCEL_ENV=preview` y se cumple alguna
  de estas condiciones: `MAIL_TRANSPORT` distinta de `desactivado`; `DOCUMENTS_E2E_DOUBLES` vacía
  o ausente; o alguna de `RESEND_API_KEY`, `SMTP_PASS`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY` o
  `QSTASH_TOKEN` con valor, ENTONCES el build DEBE fallar antes de ejecutar ningún paso, con un
  mensaje que nombre cada variable que no cumple y que no incluya ningún valor.
- **R11** (opcional) — DONDE `MAIL_TRANSPORT=desactivado`, el sistema DEBE, al pedirse el envío
  de un enlace para establecer la contraseña, no contactar a ningún proveedor ni escribir ningún
  archivo, devolver `failed` y registrar una línea que diga que el correo está desactivado sin
  incluir destinatario, URL ni secreto.
- **R12** (ubicuo) — El transporte de correo por defecto (con `MAIL_TRANSPORT` ausente o vacía)
  DEBE seguir siendo `resend`; `desactivado` solo se usa si alguien lo pone a propósito.

### Seed de demostración en preview (enmienda QC-230)

- **R13** (evento) — CUANDO el seed de demostración corre con `VERCEL` definida,
  `VERCEL_ENV=preview`, `PREVIEW_SUPABASE_REF` definida y contenida en `DATABASE_URL` y en
  `DIRECT_URL`, el sistema DEBE permitirlo sin la bandera
  `--forzar`, aunque la base sea remota y aunque la variable `CI` esté presente.
- **R14** (condicional) — SI el seed de demostración corre con `VERCEL_ENV=preview` y no se
  cumplen las condiciones de R13, ENTONCES el sistema DEBE negarse, y `--forzar` NO DEBE anularlo.
- **R15** (condicional) — SI el seed de demostración corre con `VERCEL_ENV=production` o con
  cualquier valor no vacío distinto de `development` y de `preview`, ENTONCES el sistema DEBE
  negarse siempre, con o sin `--forzar` (sin cambios respecto a QC-230).
- **R16** (evento) — CUANDO el build de preview corre sobre una base de preview ya sembrada, el
  seed base y el de demostración NO DEBEN duplicar ningún registro.

### Documentación

- **R17** (ubicuo) — La documentación del proyecto DEBE incluir una tabla con cada variable de
  entorno que lee la app y qué lleva en Production, en Preview y en local (sin valores: «propio
  del entorno», «vacía», «`desactivado`», etc.), y toda variable declarada en `.env.example` fuera
  del bloque de servidores MCP DEBE aparecer en esa tabla.

### Cobertura de las decisiones cerradas

| Decisión (fila) | Requisitos |
|---|---|
| ¿Cuándo se crea una preview? | R1, R3, R5 |
| ¿Con qué datos arranca? (y enmienda QC-230) | R7, R13, R14, R15, R16 |
| ¿Efectos fuera de la app en preview? | R10, R11, R12 |
| ¿Varias previews a la vez? | R9 (una sola base de preview, la que nombra `PREVIEW_SUPABASE_REF`), R7 |
| ¿Quién abre una preview? | R6 |
| ¿Storage? | R9 (`SUPABASE_STORAGE_URL` del proyecto de preview), R17 |
| Despliegue | R1, R2, R4 |
| Build en preview | R7, R8 |

## Preguntas abiertas

Añadidas por `spec_author` el 2026-10-09. El spec se puede aprobar con ellas abiertas: el diseño
toma la opción indicada como «por defecto» y lo dice.

1. **La subida de PDF no funciona en preview con los dobles existentes.** Con
   `DOCUMENTS_E2E_DOUBLES` puesta, el almacenamiento de documentos es el doble en memoria: firma
   la subida contra `https://documentos-e2e.invalid` (un dominio que no resuelve, a propósito: en
   el E2E Playwright intercepta esa petición) y guarda las rutas firmadas en la memoria del
   proceso, que en Vercel no se comparte entre invocaciones. En una preview, el navegador falla
   al subir el PDF, así que los flujos de catálogo y fórmula desde PDF no se pueden probar ahí.
   ¿Se acepta? **Por defecto: sí**, se acepta y se documenta como límite conocido de la preview.
   La alternativa (separar la IA y la cola de los dobles para conservar el almacenamiento real de
   preview) cambia la bifurcación única de QC-107 (`design.md > 8`) y sería otra ficha
   (`design.md > 9.3` de este spec).
2. **QC-230 no tiene spec** (`sdd: false`, `progress/features/QC-230.md`), así que la «nota
   fechada en el spec de QC-230» de la tabla de decisiones no tiene dónde ir. **Por defecto:** la
   enmienda queda fechada en `docs/verification.md > Datos de demostración`, en la cabecera de
   `scripts/seed-demo/guard.ts` y en `design.md > 8` de este spec. ¿Vale, o se quiere además en
   otro sitio?
## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-10-09 | ¿Cuándo se crea una preview? | En cada PR a `dev`, y se actualiza con cada push al PR. El link queda visible en el PR. |
| 2026-10-09 | ¿Con qué datos arranca? | Seed base + seed de demo (QC-230), ambos idempotentes. **Enmienda QC-230:** la guarda de `scripts/seed-demo.ts` pasa a admitir `VERCEL_ENV=preview` contra la base remota de preview; sigue negándose siempre en `production`. Nota fechada en el spec de QC-230. |
| 2026-10-09 | ¿Efectos fuera de la app en preview? | Apagados o con dobles: ningún correo real sale, la lectura de PDFs usa los dobles existentes, no se gastan créditos de IA de prod. |
| 2026-10-09 | ¿Varias previews a la vez? | Comparten la única base de preview. Se acepta que una migración de un PR afecte la base que ven otras previews. |
| 2026-10-09 | ¿Quién abre una preview? | Solo cuentas de Vercel del equipo (Deployment Protection). |
| 2026-10-09 | ¿Storage? | Separado: buckets en el proyecto de Supabase de preview; variables con scope Preview, cargadas por el humano. |
| 2026-10-09 | Despliegue | Por CLI y token como `desplegar.yml` (QC-229): `npx vercel@<fija> deploy` sin `--prod`, sin `pnpm install` en el runner. Heredado de QC-229. |
| 2026-10-09 | Build en preview | `scripts/build.mjs` corre migrate y seed también con `VERCEL_ENV=preview`; sin `VERCEL_ENV`, sigue saltándolos (lado seguro, QC-229). |
