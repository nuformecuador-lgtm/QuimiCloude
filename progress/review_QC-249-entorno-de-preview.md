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
