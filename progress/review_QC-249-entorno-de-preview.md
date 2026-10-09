# Review QC-249 — entorno-de-preview · vuelta 1

Revisado el 2026-10-09 sobre `feature/QC-249-entorno-de-preview`, HEAD `4a75dc62`, diff
`origin/dev...HEAD` (27 archivos). T9 es del humano y no se revisa.

## Verificación ejecutada (no solo la bitácora)

- `vitest run` de los 9 archivos del diff (+ `guard-dobles-e2e`): 135/135 en verde.
- `deploy-hook`, `seed-demo-run`, `guard-envio-de-correo`, `guard-despliegue-produccion`: 44/44 en verde.
- `tsc --noEmit`: sin errores. `eslint` sobre los archivos del diff: sin errores.
- `.int` (`identity-seed.int.test.ts`, R16): no corrido por mí (Docker); la bitácora y el leader lo
  dan en verde en T8 (`./init.sh`).
- **Mutaciones** (cada una aplicada, suite relacionada, revertida con `git checkout`; árbol limpio al
  final): 18 de 18 muertas.
  quitar el `return 1` de `problemas` en el build · `includes(ref)` siempre cierto · sin la exigencia
  de `VERCEL` en la guarda del seed · seed de demo en production · `--prod` en preview.yml · sin el
  `if:` de forks · sin `QSTASH_TOKEN` · la línea del mailer con el destinatario ·
  `cancel-in-progress: true` · `--token` en la CLI · `pnpm install` en el runner · un valor en el
  mensaje · preview sin comprobar la base en el seed · production admitido en el seed · sin
  `SUPABASE_STORAGE_URL` · `desactivado` como transporte por defecto · demo antes que el seed base ·
  `curl` que no falla ante `2??`.
- **Intento de romper R9 a mano** (`pasosDelBuild` con URLs de producción): ver hallazgo m1.

## Checklist

- [x] Trazabilidad: R1–R17 tienen test concreto (mapa en `progress/impl_…md`). R1–R6
  `guard-despliegue-preview`; R7–R10 `build.test` + `entorno-de-preview.test`; R11–R12
  `mailer-desactivado`, `mail-config`, `identity-facade`; R13–R15 `seed-demo-guard`; R16
  `seed-demo-run` + `identity-seed.int` (existentes, como dice `design.md > 10`); R17
  `guard-variables-por-entorno`. Las mutaciones confirman que no son tests vacíos.
- [x] Tasks T1–T8 `[x]` (T9, del humano, fuera).
- [x] `design.md > ## Lo que ya existe` presente y con contenido; el diff reutiliza/amplía lo listado
  (`desplegar.yml` no se toca, la CLI es la misma fila de `docs/dependencias.md`), no re-crea nada.
- [x] Alternativa descartada con porqué (`design.md > 9`).
- [x] R8: el build de producción no cambia (production → `CON_TODO` sin demo; otro `VERCEL_ENV`,
  vacío o ausente → solo generate + build; fuera de Vercel → los cuatro de siempre). Mutación M4 muerta.
- [x] R9/R13–R15: preview no migra ni siembra si `DATABASE_URL`/`DIRECT_URL`/`SUPABASE_STORAGE_URL`
  no contienen el ref; la guarda del seed exige `VERCEL` + ref en las dos URL de base; production
  se niega siempre. `VERCEL_ENV=Preview` (mayúscula) cae al lado seguro.
- [x] Mensajes sin valores: solo nombres de variable y la regla (tests + mutación M12).
- [x] preview.yml: `pull_request` (no `_target`), `if:` de fork, token solo por `env`, sin `--token`,
  sin `pnpm install` ni `vercel build`, `vercel@63.1.0` sin `--prod`, `permissions: contents: read`,
  concurrencia por PR sin cancelar.
- [x] Regla de solo adiciones: `lib/composition/index.ts` +3 −0 y `.env.example` +18 −0, ninguna
  línea ajena tocada ni reordenada.
- [x] Sin dependencias nuevas (`package.json` intacto; la fila de la CLI solo se amplía).
- [x] Sin secretos: las URLs del diff son de tests con `.invalid` y claves inventadas; ningún ref ni
  ID de proyecto versionado.
- [x] Comentarios (perfil 9): en producción (`lib/`) ninguna línea añadida cita `QC-`/`R<n>`/
  `design.md`; la cita de `mail-config-env.ts` se limpió. Las citas de `scripts/` están fuera de la
  regla (`docs/conventions.md > Comentarios`).
- [x] Calidad/seguridad (perfil 5), multiplataforma (6, sin UI), dependencias (7), empresa (8, sin
  esquema): sin hallazgos.
- [x] Typecheck y lint en verde. `./init.sh` en verde (T8, leader).
- [ ] `gate-completo` en CI: pendiente del PR (no lo corre el reviewer).

## Hallazgos

Ningún BLOQUEANTE.

- **m1 — menor (el más importante; recomendado antes de T9).** La comprobación de R9 es «contiene
  el ref» como subcadena, sin forma mínima. Con `PREVIEW_SUPABASE_REF` mal puesto a una cadena que
  aparece en cualquier URL de Supabase (`supabase`, `postgres`, `pooler`, un ref truncado), un scope
  Preview que siga con las URLs de **producción** pasa la comprobación y el build migra y siembra
  producción. Reproducido: `pasosDelBuild({VERCEL:'1', VERCEL_ENV:'preview',
  PREVIEW_SUPABASE_REF:'supabase', DATABASE_URL/DIRECT_URL/SUPABASE_STORAGE_URL de prod, …})`
  devuelve los cinco pasos. Cumple la letra de R9 y de `design.md > 4`, por eso no es bloqueante; pero
  el riesgo es la base de producción y cerrarlo es barato: exigir la forma del Reference ID o que
  aparezca en las posiciones que el propio `design.md > 4` describe (`postgres.<ref>:`, `db.<ref>.`,
  `//<ref>.`). Es una enmienda de spec: decide el humano.
- **m2 — menor (desvío declarado, aceptable).** `PREVIEW_SUPABASE_REF` va antes del bloque de dobles
  en `.env.example`: es adición pura y evita la fragilidad de `guard-dobles-e2e`. Sin objeción.
- **m3 — menor (desvío declarado, aceptable).** El paso «La preview no es publica» queda rojo si
  `curl` falla por red (código `000`, `bash -e`): falla hacia el lado seguro. Solo se pierde un
  mensaje claro; si molesta, otra ficha.
- **m4 — menor (desvío declarado, deuda).** El comentario «Los tres cumplen el MISMO puerto» de
  `lib/composition/index.ts` queda falso (ahora son cuatro). No se tocó por la regla de solo
  adiciones; queda como deuda para cuando se libere el choque (anotarla en `Cierre`).
- **m5 — menor.** `pasosDelBuild` compara `VERCEL_ENV === 'preview'` sin `trim`, y la guarda del seed
  sí lo recorta. La asimetría falla hacia el lado seguro (un `' preview'` no migra en el build), así
  que es solo coherencia.

## Veredicto

**OK.** Recomendación al humano: valorar m1 antes de T9 (primer despliegue real).

## Vuelta 2 (acotada a 549821fd..d4f5fc29)

Commits: 8ff83083 (candado estricto del ref, m1; trim de `VERCEL_ENV`, m5) y d4f5fc29 (rechazo
de `?host=`, ampliación aprobada por el humano).

### Checklist

- [x] m1 cerrado: `PREVIEW_SUPABASE_REF` exige `/^[a-z]{20}$/` (recortado) y cada URL lleva el ref
  en su posición (`postgres.<ref>` como usuario o `db.<ref>.supabase.co` como host en las de base;
  `<ref>.supabase.co` como host en storage).
- [x] m5 cerrado: `pasosDelBuild` compara `VERCEL_ENV` recortado.
- [x] `?host=` rechazado en las tres URL (sin mirar mayúsculas, vacío, codificado `h%6Fst`); `ghost`
  y `hostaddr` no se rechazan (lo segundo es deuda declarada, no se pide aquí).
- [x] Enmiendas fechadas como adiciones puras (+N −0) en `requirements.md` (R9), `design.md > 4`,
  `docs/architecture.md` y el comentario de `.env.example`; no se reescribe texto previo.
- [x] `lib/composition/index.ts` (+3 −0) y `.env.example` (+21 −0) siguen siendo solo adiciones
  respecto a `origin/dev`.
- [x] Mensajes sin valores: probado con ref y `host=prod.example` reales en el env; el texto del
  problema no contiene ninguno de los dos.
- [x] R8: `pasosDelBuild` con `VERCEL_ENV=production` y fuera de Vercel devuelve los mismos pasos
  y motivo que antes (migrate, generate, seed, next build).
- [x] Tests relacionados: 87/87 verdes (`entorno-de-preview`, `build`, `seed-demo-guard`); eslint
  limpio sobre los 5 archivos; `tsc --noEmit` limpio.

### Sondas (probe local, sin tocar el repo)

Con las URL de producción: ref `supabase`, `postgres`, truncado a 19, en mayúsculas -> rechazan
solo `PREVIEW_SUPABASE_REF`. Ref válido solo como subcadena (nombre de la base, contraseña,
parámetro, path de storage, `x<ref>.supabase.co`, `<ref>.supabase.co.evil.com`) -> rechaza la
variable. URL ilegible -> rechaza. Ref con espacios alrededor -> pasa (recortado, correcto).

### Mutaciones (aplicadas y revertidas; árbol limpio al final)

Todas matadas: forma laxa del ref (5 rojos), sin rechazo de `host` (5), `host` sensible a
mayúsculas (5), `host` como subcadena (1, el de `ghost`), usuario como subcadena (3), host de
storage como subcadena (2), host directo como subcadena (2), sin `trim` de `VERCEL_ENV` (1),
variable sin regla pasa (1).

### Efecto colateral declarado

`' production '` ahora migra en Vercel. Coherente con la guarda del seed, que ya recortaba, y
Vercel no emite ese valor con espacios; un valor así solo podría venir de una variable puesta a mano
y su intención es inequívoca. Aceptado. `Production` (mayúscula) sigue sin migrar: lado seguro.

### Hallazgos

- **v2-m1 — menor.** La rama del usuario del pooler no ata el host: `postgres.<ref_preview>@db.<ref_prod>.supabase.co`
  pasa el candado. Es conforme a la enmienda («usuario del pooler **o** host directo») y no es
  explotable en la práctica (la conexión directa de Supabase no tiene el rol `postgres.<ref>`,
  así que falla al autenticar, no escribe en producción). Si se quiere cerrar, exigir que con usuario
  `postgres.<ref>` el host termine en `.pooler.supabase.com`; otra ficha, no bloquea.
- **v2-m2 — menor (informativo).** `DB.<REF>.SUPABASE.CO` en mayúsculas pasa (se compara el host en
  minúsculas): correcto, los hosts no distinguen mayúsculas.

Ningún bloqueante. Ninguna regresión sobre la vuelta 1.

### Veredicto vuelta 2

**OK.**
