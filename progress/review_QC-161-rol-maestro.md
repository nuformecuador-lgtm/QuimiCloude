# Review QC-161 — rol-maestro (F2.2)

> Reviewer, 2026-10-01. Rama `feature/QC-161-rol-maestro`, punta `b2749955`, contra `origin/dev`
> (`81f1cd8e`; merge-base `e3f891ab`, dev va 25 commits por delante sin tocar ningun archivo de
> esta rama). Solo lectura salvo este informe. MCP del grafo no usado: revision por diff, Grep y Read.

## Lo que corri yo

| Que | Resultado |
|---|---|
| `pnpm exec tsc --noEmit` | verde |
| `eslint` de los `.ts/.tsx` del diff | limpio |
| `vitest run tests/unit/identity tests/unit/errores qc75-convenciones order-assignments-migration tests/guards` | 146 archivos: 145 verdes, 2530 passed, 39 skipped, **1 rojo**: `tests/unit/identity/account-status-scope.test.ts` (por `list-responsible-candidates.ts` de asignaciones). Esta en `tests/baseline-rojos.json` y la rama no toca ese archivo: **no es hallazgo** |
| `vitest run` de `maestro-migration.int`, `login.int`, `session-user.int`, `role-catalog.int`, `user-crud.int`, `identity-seed.int`, `identity-constraints.int` (base efimera copia de `qct_tpl_0f74965b392b`; `.env` con `QuimiCloude_QC161`) | 7 archivos, **184 passed** |
| `git diff --stat <merge-base> HEAD -- e2e/ package.json` | vacio (R19, R20) |
| `./init.sh` completo | **no corrido** por indicacion del leader (lo corre el en paralelo) |

## Checklist

- [x] **Trazabilidad R1-R44.** `design.md > 10.3` mapea cada `R<n>`. Un script busco en `tests/` cada
  nombre de caso citado: existen todos; dos se generan con plantilla (`R22` vivo / dado de baja en
  `maestro-migration.int.test.ts:416`; `R29` x4 + simetrico en `maestro-sin-empresa-actions.test.ts:126,141`).
  Lei los de R22 y R29, y el codigo de produccion de R1, R10-R13, R23-R25 y R30-R32: los tests
  afirman lo que dicen, ninguno esta vacio. R19 y R20 por revision (diff vacio).
- [ ] **Tasks.** T0-T13 `[x]`; **T14 abierta** (gate completo + confirmacion de `SEED_MAESTRO_*` en
  Vercel con el humano). Es del leader y esta en curso; la feature no pasa a `done` sin cerrarla.
- [x] **Especificacion.** requirements EARS numerados, design con 11 alternativas descartadas, tasks.
- [x] **typecheck / lint** (arriba). `pnpm test` completo: lo cierra el `./init.sh` del leader.
- [x] **E2E en flujo critico (auth/permisos).** No hay: D8 lo difiere a QC-162/QC-166 por decision
  humana (`design.md > 10.2`, final). No es hallazgo.
- [x] **UI / multiplataforma.** La rama no toca `app/`, `components/` ni `hooks/`. No aplica.
- [x] **Dependencias.** `package.json` sin cambios.
- [x] **Aislamiento por empresa.** Ningun modelo nuevo. `User.companyId` pasa a opcional con el
  disparador `users_check_company_by_role` como garantia (R26/R27 probados contra Postgres) y
  `docs/architecture.md > Dominio` n.º 1 actualizado. Lista de exentas de `guard-empresa-en-esquema`
  identica (solo cambia la redaccion del motivo). Las consultas nuevas que cruzan empresas
  (`countLiveUsersWithUsername`, `countLiveUsersWithoutCompanyWithEmail`) son solo del seed. La
  sesion sin empresa deja `context: null` y las actions de empresa fallan cerrado (R29: todo el
  catalogo, repositorio trampa y caso simetrico).
- [x] **RLS.** Ninguna tabla nueva; las cuatro tocadas ya tienen `FORCE ROW LEVEL SECURITY`.
- [x] **Migracion versionada y reversible.** Una sola carpeta con `migration.sql` y `down.sql`;
  `SET NOT NULL` antes de cualquier `DELETE` en el DOWN; R21, R22, R38 y R39 probados en integracion.
- [x] **Secretos.** Las `SEED_MAESTRO_*` van sin valor en `.env.example`; los errores del seed no
  llevan valores (R12, R42, R43).
- [x] **Hexagonal.** `domain/` y `ports/` sin framework; el adaptador nuevo vive en
  `adapters/driven`; la composicion solo cablea `maestroCredentials`.
- [x] **Autorizacion por permiso.** Las exclusiones del Maestro viven en `identity` (rol objetivo, no
  actor), el mismo patron que ya tiene el Administrador; la guardia gana `ROLE_MAESTRO` (R16).
- [ ] **Comentarios en lineas tocadas de produccion.** Falla: ver B1.
- [ ] **`./init.sh` verde, `progress/history.md`, worktree.** Pendientes del leader (T14 y cierre).

## Hallazgos

### B1 — BLOQUEANTE · citas de fichas en lineas de comentario que la rama modifica

`lib/modules/identity/domain/session-claims.ts:84-85`, JSDoc de `parseSessionClaims`. La rama
reescribe esas dos lineas para meter el `null` de `cid` y arrastra dentro las citas:

```
 * es texto (QC-9 R28), o un `cid` ausente, vacio, que no es texto ni `null`, o sin forma de UUID,
 * o un `sid` ausente, vacio, que no es texto o sin forma de UUID (QC-23 R6). No lanza en
```

`docs/conventions.md > Comentarios` y el punto 9 del reviewer (`docs/perfil-agentes.md > reviewer`): en lineas que el diff anade o
modifica en produccion, citar `QC-<n>` o `R<n>` es bloqueante («al tocar un archivo se limpian los
comentarios de las lineas que toca la rama»). Arreglo: quitar `(QC-9 R28)` y `(QC-23 R6)` de esas dos
lineas. Es el unico caso: barrido de las lineas `+` de `git diff -U0 origin/dev...HEAD` sobre
`lib/`, `app/`, `components/`, `hooks/` y `db/`.

### m1 — menor · comentarios de tests con citas

148 lineas de comentario anadidas en `tests/` citan `QC-<n>`, `R<n>` o `design.md` (p. ej. la
cabecera de `tests/unit/identity/maestro-sin-empresa-actions.test.ts:1-3`). La convencion aplica
igual a los tests: el `R<n>` va en el nombre del caso, no en el comentario.

### m2 — menor · T7: criterio de «Hecho» del texto del seed (pendiente 2 del implementer)

`tasks.md` T7 pedia que la segunda corrida de `db:seed` dijera «ya existia»; imprime
«db:seed: nada que crear». El comportamiento es el correcto: R18 exige que la segunda corrida no
cree nada, y `scripts/seed.ts` si suma «usuario maestro: creado / ya existia» cuando la corrida crea
algo (`design.md > 5.2` punto 8, cumplido). Lo que estaba mal escrito era el criterio, no el codigo:
basta con anotarlo, el script no se toca.

### m3 — menor · `db/schema.prisma:165` sin reajustar

La linea del comentario de cabecera de `User` que la rama reescribe queda en unos 150 caracteres
(«... los dados de baja. `users_company_id_idx` no sobra: ...»). Cosmetico.

## Juicio de los tres pendientes del implementer

1. **T11, fixture del Maestro fuera de la transaccion del test: se acepta, no es hallazgo.**
   `login.int` y `session-user.int` estan en el censo como `commit` y los adaptadores leen con el
   cliente Prisma global, que no ve filas sin confirmar: crear el fixture «en la transaccion» obligaria
   a no probar el adaptador real. Lo que importa de la task (no usar el Maestro del seed y no dejar
   residuos) se cumple: fixture por caso, nombre `qc161_*_<uuid>`, borrado en `finally`. Esos dos
   archivos pasan en mi corrida.
2. **T7, texto de la segunda corrida: menor (m2).** Codigo correcto; el criterio estaba mal escrito.
3. **T7, `mustChangeCredential: true`: se acepta, no es hallazgo.** El spec no fija el campo; el
   valor replica el del Administrador inicial (`initial-access-repository-prisma.ts:150`) por un
   motivo verificable (la credencial llega por variable de despliegue) y es tambien el de toda alta
   (`user-admin-prisma.ts:318`). Hoy nada en `app/`, `middleware.ts` ni el login lo lee, asi que no
   altera R30 ni R33; si una ficha futura impone el cambio obligado, el Maestro quedara sujeto como
   cualquiera, coherente con D12.

## No son hallazgos (decisiones humanas o deuda ajena)

- `empresas.consultar`/`empresas.modificar` en `ADMIN_EXCLUDED_PERMISSIONS` (desviacion aprobada el
  2026-10-01, `design.md > 2`).
- R39 con el texto literal del design.
- Rojos de `tests/baseline-rojos.json` (incluidos `product-page`, `recipe-page` y
  `account-status-scope`), que arregla QC-177.
- Sin E2E (D8).

## Veredicto

**RECHAZADO** — 1 bloqueante (B1), 3 menores (m1-m3).

Para pasar a OK: quitar `(QC-9 R28)` y `(QC-23 R6)` de las dos lineas modificadas del JSDoc de
`parseSessionClaims` en `lib/modules/identity/domain/session-claims.ts` (solo comentario; re-correr
`tests/unit/identity/session-claims.test.ts` y `./init.sh --rapido`). Para cerrar la feature, ademas,
T14 tiene que quedar `[x]` con el `./init.sh` completo verde del leader y la confirmacion humana de las
`SEED_MAESTRO_*` en Vercel (produccion y preview). Los menores no bloquean.

---

## Vuelta 2 (2026-10-01)

Revisado solo lo que cambia entre `914456fc` y `37432923` (commits `efe4a8d7`, `03b6bf5b`,
`fd67991c`, `52dd90b3` y la bitacora). Gate completo de `b2749955` verde segun el leader (5 rojos,
todos en el baseline): no lo vuelvo a correr. Corri `tsc --noEmit` (verde) y `vitest run`
de `session-claims`, `tests/unit/identity/schema`, `permissions` y `tests/unit/identity/roles`
(377 passed, 4 skipped).

- [x] **B1, cerrado.** `session-claims.ts:84-85` ya no lleva `(QC-9 R28)` ni `(QC-23 R6)`. Vuelvo a
  barrer las lineas `+` de `git diff -U0 origin/dev...HEAD` en `lib/`, `app/`, `components/`,
  `hooks/` y `db/`: 0 citas.
- [x] **m1, cerrado.** Barrido por script de los comentarios (`//`, `/*`, ` *`) que anade la rama en
  `tests/`: 240 lineas de comentario, **0** citan `QC-<n>`, `R<n>`, `design.md` o «decision cerrada».
  Las excepciones aceptadas (`permissions.test.ts:635` y `:731-733`, mensaje de `maestro-rol.test.ts:207`)
  son codigo, no comentarios: la regex y los casos sinteticos que la guardia necesita. Los cambios
  de `fd67991c` en `tests/` son solo de comentarios: ningun `expect`, nombre de caso ni linea de codigo
  cambia. Correccion mia: las «148 lineas» de la vuelta 1 estaban infladas. Mi `grep -E` no
  entendia `\s` y conto tambien nombres de caso (`it('QC-161 R…')`), que si deben llevar la cita. Los
  42 que quito el implementer eran los comentarios reales.
- [x] **m2, cerrado.** El «Hecho» de T7 en `tasks.md` dice ahora «la segunda imprime
  "db:seed: nada que crear"», que es la salida real.
- [x] **m3, cerrado; la linea correcta era la 90.** El «:165» de la vuelta 1 era mi error: era la
  linea del archivo de salida del diff, no la de `db/schema.prisma`. En `b2749955` la linea que
  tocaba la rama y medía 145 caracteres es la 90. Partida en `52dd90b3`, ahora ninguna de las lineas
  de comentario que toca la rama pasa de 98 columnas. Las demas lineas largas del archivo (7, 45,
  69-70, 121, 127, 131-133) son preexistentes o de codigo: no son hallazgo.

Pendiente fuera del alcance del reviewer: T14 `[ ]` hasta que el leader la marque con el gate
verde y la confirmacion humana de las `SEED_MAESTRO_*` en Vercel (produccion y preview).

### Veredicto de la vuelta 2

**OK** — 0 bloqueantes, 0 menores abiertos.
