# QC-153 — modelo-de-clientes · tasks.md

> Zona: `backend` · Complejidad: `medium` · depends_on: — · Rama: `feature/QC-153-modelo-de-clientes`
>
> El **qué** está en `requirements.md` (R1–R29), el **cómo** en `design.md`. Aquí va el desglose.
> `[P]` = paralelizable con las demás `[P]` del mismo bloque. Cada task se cierra con
> `./init.sh --rapido` en verde salvo que diga otra cosa; la feature se cierra con `./init.sh`
> completo (regla 5 de `CLAUDE.md`). Un commit por task (`docs/conventions.md > Commits`).
>
> **Regla transversal.** Manda `docs/conventions.md > Comentarios`: ningún comentario nuevo cita
> `QC-<n>`, `R<n>`, `design.md` ni «decisión cerrada», ni en `db/` ni en `lib/` ni en `tests/`; en los
> tests `R<n>` va en el **nombre del caso**. Las líneas de comentario que la rama toca se limpian; las
> preexistentes que no toca no se arrastran.

## Archivos que esta feature declara tocar (para la validación de conflicto del leader)

**Producción, modificados:** `db/schema.prisma`, `lib/modules/identity/domain/permissions.ts`.

**Producción, nuevos:** `db/migrations/<ts>_customers/migration.sql`,
`db/migrations/<ts>_customers/down.sql`, `lib/modules/clientes/index.ts`,
`lib/modules/clientes/domain/customer.ts`, `lib/modules/clientes/ports/.gitkeep`,
`lib/modules/clientes/adapters/.gitkeep`.

**Tests nuevos:** `tests/unit/clientes/schema/customers-schema.test.ts`,
`tests/unit/clientes/schema/customers-migration.test.ts`, `tests/unit/clientes/scope.test.ts`,
`tests/integration/clientes/customers-constraints.int.test.ts`,
`tests/integration/clientes/customers-migration.int.test.ts`.

**Tests y censos modificados:** los de `design.md > 6.1`, `tests/guards/guard-identificador-de-request.test.ts`,
`tests/integration/aislamiento.json`.

**NO se tocan:** `lib/modules/identity/domain/seed-initial-access.ts`, `lib/modules/identity/domain/roles.ts`,
`scripts/seed.ts`, `lib/composition/**`, `lib/shared/**`, `app/**`, `components/**`, `middleware.ts`,
`e2e/**`, `package.json`, ninguna migración existente.

**Conflicto conocido:** QC-142 (`permiso-propio-de-documentos`) toca `permissions.ts` y casi todos los
tests de `design.md > 6.1`; no deben estar `in_progress` a la vez sin que el leader lo resuelva.
QC-158 (`in_progress`) puede añadir migración: choca solo en `MIGRACIONES_ESPERADAS` y en el `<ts>`.

---

## T0 — Preparación (bloquea todo)

- [x] **T0.** Base propia: crear `QuimiCloude_QC153`, apuntar el `.env` del worktree a ella, dejarla
      migrada y sembrada con la cadena de `dev`, y exportar `DATABASE_URL` en el shell que corre el
      gate. Anotar en `progress/impl_QC-153-modelo-de-clientes.md`: la base usada, la última migración
      de `dev` (de ella sale `<ts>`) y el catálogo de `PERMISSIONS` en `dev` (códigos y número: el
      «catálogo previo» de R21; los números de T5–T7 salen de ahí más dos, no de «dieciséis»).
      **Hecho cuando:** `pnpm run db:test status` sobre esa base dice «al día» y la bitácora tiene los
      tres datos. **Ninguna** migración de esta ficha se aplica a la base compartida `QuimiCloude`.

## T1–T3 — Esquema, migración y armazón

- [x] **T1.** `db/schema.prisma`: modelo `Customer` al final, tal cual `design.md > 2.1`.
      `pnpm prisma generate`. **Hecho cuando:** `pnpm prisma validate` pasa, `typecheck` pasa y
      `guard-empresa-en-esquema` y `guard-arquitectura-modulos` (bloque 10) siguen verdes.
      *Depende de T0.*
- [x] **T2.** `db/migrations/<ts>_customers/migration.sql` y `down.sql`, escritos a mano según
      `design.md > 2.2` y `> 2.3`, con cabecera corta sin citas. Aplicar con `pnpm run db:migrate`
      sobre `QuimiCloude_QC153`; comprobar `pnpm run db:rollback` y volver a aplicar.
      Alta de `<ts>_customers` al final de `MIGRACIONES_ESPERADAS`
      (`tests/guards/guard-identificador-de-request.test.ts:210-297`) con una línea de motivo sin citar
      la ficha. **Hecho cuando:** migrar → revertir → migrar termina sin error, `_prisma_migrations`
      queda coherente, y `guard-rls-force` y `guard-identificador-de-request` están verdes.
      *Depende de T1.*
- [x] **T3.** [P] Armazón `lib/modules/clientes/` (`design.md > 4`): `index.ts`, `domain/customer.ts`,
      `ports/.gitkeep`, `adapters/.gitkeep`. **Hecho cuando:** `guard-arquitectura-modulos` (bloques 1,
      4 y 6) sigue verde y `typecheck` pasa. *Depende de T1 (el tipo copia sus campos).*

## T4–T7 — El catálogo de permisos

- [ ] **T4.** `permissions.ts`: las dos entradas al final de `PERMISSIONS`, los dos códigos al final
      de la lista del Administrador, la frase del recuento y el párrafo de enmienda
      (`design.md > 3`). **Hecho cuando:** `typecheck` pasa y `guard-permisos-sembrados` solo está
      rojo por su número (lo sube T6). *Independiente de T1–T3; en la misma tanda que T5–T7.*
- [ ] **T5.** [P] `tests/unit/identity/permissions.test.ts`: las ampliaciones de `design.md > 6.1`,
      reescritura del caso «QC-144 R5» para que siga afirmando lo mismo sin romperse por orden, y los
      casos nuevos de R21, R22 y R25 (con su caso sintético que el detector de citas sí caza).
      **Hecho cuando:** el archivo está verde y, con T4 revertido en local, los casos de R21/R22/R25
      caen. *Depende de T4.*
- [ ] **T6.** [P] Recuentos en guardias y tests unitarios de `design.md > 6.1`: `qc75-convenciones`,
      `guard-permisos-sembrados`, `guard-nav-permisos-declarados`, `documentos/authorization`,
      `qc145-estado-solo-planta`, `order-assignments-migration`, `grupos/scope`, `roles/scope`,
      `seed-initial-access`. Números **subidos**, listas **ampliadas**; nada relajado.
      **Hecho cuando:** `./init.sh --rapido` verde. *Depende de T4.*
- [ ] **T7.** [P] `tests/integration/identity/identity-seed.int.test.ts`: números y comentarios de las
      líneas de `design.md > 6.1`. **Hecho cuando:** el archivo pasa contra la base efímera.
      *Depende de T2 y T4.*

## T8–T12 — Tests de la ficha

- [ ] **T8.** [P] `tests/unit/clientes/schema/customers-schema.test.ts` (`design.md > 7`): R1, R3,
      R4, R5, R7, R11, R15, R16, R19 y el tipo `Customer` atado al modelo. **Hecho cuando:** verde, y
      cada detector tiene su caso sintético que muerde (p. ej. un `@relation` en `companyId`, un
      `@unique` en `email`, un campo más en el tipo). *Depende de T1 y T3.*
- [ ] **T9.** [P] `tests/unit/clientes/schema/customers-migration.test.ts` (`design.md > 7`): R1–R7,
      R10, R12, R13, R17, R18, R22–R24, R27, más la cabecera sin citas. **Hecho cuando:** verde, y un
      SQL sintético con `ON DELETE SET NULL`, con `CASCADE` en el `DROP`, con `'Operador'` en la
      asignación o con un `ALTER TABLE "orders"` lo pone rojo. *Depende de T2 y T4.*
- [ ] **T10.** [P] `tests/unit/clientes/scope.test.ts` (`design.md > 7`): R20, R26, R28, R29. El
      mensaje de fallo de R26 dice que QC-154 lo relaja al consumir los permisos. **Hecho cuando:**
      verde, con casos sintéticos de un `'clientes.modificar'` en un archivo de `app/` y de un archivo
      en `adapters/driving/` que lo ponen rojo. *Depende de T3 y T4.*
- [ ] **T11.** `tests/integration/clientes/customers-constraints.int.test.ts` (`design.md > 7`), en
      transacción revertida: R2, R3, R5–R17. Alta en `tests/integration/aislamiento.json`
      (`transaccion`). **Hecho cuando:** verde contra la base efímera y `guard-aislamiento-integracion`
      verde. *Depende de T2.*
- [ ] **T12.** `tests/integration/clientes/customers-migration.int.test.ts` (`design.md > 7`), con el
      SQL leído del archivo y en transacción revertida: R18, R23, R24. Alta en
      `aislamiento.json`. **Hecho cuando:** verde, y un `down.sql` sintético sin el `DELETE` de
      `role_permissions` lo pone rojo por la FK `RESTRICT`. Si aparece un bloqueo con otro archivo de
      integración, se pasa a `commit` con motivo en el censo, no se relaja la prueba. *Depende de T2 y T4.*

## T13 — Cierre

- [ ] **T13.** Mapa `R<n> -> test` completo (R1–R29) en `progress/impl_QC-153-modelo-de-clientes.md`;
      sincronizar con `origin/dev`, `pnpm install` si cambió `package.json`, `db:migrate` sobre
      `QuimiCloude_QC153`, y `./init.sh` **completo**. **Hecho cuando:** el gate completo no tiene
      ningún archivo rojo fuera de `tests/baseline-rojos.json`, `git diff origin/dev...HEAD` solo
      contiene archivos de la lista de arriba, y ninguno de `e2e/`. *Depende de T1–T12.*

### Orden

T0 → T1 → (T2 ∥ T3 ∥ T4) → (T5 ∥ T6 ∥ T8 ∥ T10) → (T7 ∥ T9 ∥ T11 ∥ T12) → T13.
T4–T7 van en la misma tanda: T4 sola deja el gate rojo por los recuentos.
