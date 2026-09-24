# Review — QC-153 modelo-de-clientes

> Reviewer, 2026-09-24. Rama `feature/QC-153-modelo-de-clientes`, HEAD `b1064c9e`, diff contra
> `origin/dev` (`08935782`). Spec: `specs/QC-153-modelo-de-clientes/` (R1-R29 + nota F1.4).
> Bitácora: `progress/impl_QC-153-modelo-de-clientes.md`.

## Veredicto: **OK** — 0 bloqueantes, 8 menores

Condicionado a lo que corre el leader: `./init.sh` **completo** en verde (no lo corrí por
instrucción) y T13 marcado `[x]` después.

---

## Verificación ejecutable (corrida por el reviewer)

- `pnpm run typecheck`: exit 0.
- `pnpm run lint`: 0 errores. Hay 2 warnings en `tests/unit/pedidos/order-service.test.ts`, que
  vienen de `dev` y no de esta rama.
- `vitest run` sobre `tests/unit/clientes`, `tests/integration/clientes`, `tests/unit/identity`
  (todo), `qc75-convenciones`, `documentos/authorization`, `qc145-estado-solo-planta`,
  `order-assignments-migration`, `identity-seed.int`, `packer-role-migration.int` y **todo
  `tests/guards`**, con `DATABASE_URL` de `QuimiCloude_QC153` y la base efímera
  `qct_qc153_a65926a5_mufkxfna_pc4`: **147 archivos, 2426 pass, 39 skip, 0 fallos**.
- Reporter verbose sobre los 7 archivos de la ficha más `permissions.test.ts` y el de QC-145:
  **99/99 verdes**. Ningún caso de la ficha se salta.
- **Base compartida intacta**: la comprobé solo leyendo, con Prisma.
  - `QuimiCloude`: no tiene ninguna fila de customers en `_prisma_migrations`, `to_regclass` de
    `public.customers` es NULL, hay 0 permisos `clientes.*` y la última migración es
    `20260923140000_product_batch_nullable_machine`.
  - `QuimiCloude_QC153`: `20260924120000_customers` está aplicada, la tabla existe y hay 2
    permisos `clientes.*`.

## Checklist

### Especificación
- [x] `requirements.md` en EARS, R1-R29, sin preguntas abiertas, con la nota F1.4.
- [x] `design.md` con 5 alternativas descartadas y su porqué.
- [ ] `tasks.md`: T0-T12 `[x]`; **T13 sin marcar**. Depende del gate completo, que corre el
  leader (menor 1).

### Trazabilidad (R -> test que muerde)
- [x] El mapa R1-R29 está en la bitácora y lo comprobé caso por caso contra los tests reales:

| R | Test(s) que muerden |
|---|---|
| R1, R4 | `customers-schema.test.ts`: censo exacto de 13 campos. `customers-constraints.int`: alta y relectura |
| R2 | `customers-constraints.int`: 23502 en INSERT y en UPDATE a NULL de los tres obligatorios. `customers-migration.test.ts`: NOT NULL solo donde toca |
| R3 | schema (opcionalidad), migration (sin CHECK), int (las 8 combinaciones) |
| R5 | schema (sin tipo nativo `@db`), migration (TEXT sin VARCHAR), int (10 000 caracteres) |
| R6 | migration (sin CHECK), int (correo sin forma de correo, teléfono libre) |
| R7 | schema (un único `@@unique`), migration (un único UNIQUE INDEX), int (dos filas idénticas) |
| R8, R9 | migration (RESTRICT), int (23502/23503; borrar una empresa con un cliente dado de baja da 23503) |
| R10 | migration (clave `(company_id, id)`), int (una tabla hija con FK compuesta rechaza otra empresa con 23503) |
| R11 | schema (sin `@relation` y sin campo de tipo Company/User), int (las 3 FK en `pg_constraint`) |
| R12, R13 | migration (RESTRICT, no SET NULL), int (autor NULL, autor inexistente 23503, borrar al autor 23503 y la autoría se conserva) |
| R14 | schema (sin columna de estado), int (baja lógica con los datos intactos) |
| R15 | schema (`@updatedAt`), int (`updated_at` crece y `created_at` no cambia) |
| R16 | schema (snake_case y nombres de índices), int (`information_schema`) |
| R17 | migration (ENABLE+FORCE, sin POLICY, con mutación), int (`pg_class`/`pg_policies`) |
| R18 | migration (3 sentencias, orden, sin CASCADE), int (DOWN real y un down sintético que cae por la FK RESTRICT) |
| R19 | schema (`/// @module clientes`) más `guard-arquitectura-modulos` (acceso de un módulo ajeno) |
| R20 | `scope.test.ts` (4 casos) |
| R21 | `permissions.test.ts` (entradas exactas, catálogo previo más dos, lista a mano de 18) |
| R22 | `permissions.test.ts` (Admin `toEqual`; Operador y Empacador exactos). La migración, solo al Administrador |
| R23 | `customers-migration.int` (DOWN seguido de UP, solo el Administrador, el resto idéntico) y los literales iguales a `PERMISSIONS` |
| R24 | `customers-migration.int` (sembrado previo, sin fallo ni duplicado, `updated_at` idéntico) |
| R25 | `permissions.test.ts` (párrafo de 5 líneas o menos, «enmienda», los dos códigos, sin citas, primera frase limpia) |
| R26 | `scope.test.ts` (barrido de literales en `lib/app/components/hooks/middleware`, `ports/adapters` vacíos) |
| R27 | `customers-migration.test.ts` (sin ALTER, índice ni mención de `orders` ajenos, con mutación) |
| R28 | `scope.test.ts`, y ningún archivo de `e2e/` en el diff (menor 5) |
| R29 | `scope.test.ts` contra el merge-base, y el diff sin `package.json` (menor 4) |

Ningún R queda sin test ni con un test vacío. Las coberturas parciales van en el menor 6.

### Migración `20260924120000_customers`
- [x] Escrita a mano y con su `down.sql`. Los identificadores están en inglés y snake_case.
- [x] `first_names`, `last_names` y `city` son TEXT NOT NULL; `phone`, `email` y `address` son TEXT
  anulables. Sin longitud y sin CHECK.
- [x] El borrado es lógico (`deleted_at`) y no hay columna de estado. `created_by`/`updated_by`
  llevan FK **simples** a `users(id)` con RESTRICT, como se decidió en F1.4. Tienen sus índices.
- [x] `company_id` es NOT NULL con FK a `companies`, y `customers_company_id_id_key` hace de clave
  candidata `(company_id, id)` para la FK compuesta futura.
- [x] RLS `ENABLE` y `FORCE` al final, sin policies.
- [x] No hay índices únicos de negocio: el único UNIQUE es la clave candidata.
- [x] Los permisos son idempotentes (`ON CONFLICT DO NOTHING` en ambos INSERT) y solo se asignan al
  Administrador. La migración no toca ninguna otra tabla.
- [x] `down.sql`: `role_permissions` (cualquier rol), luego `permissions` y después el DROP de
  `customers` sin CASCADE. La bitácora anota que migrar, revertir y volver a migrar funciona sobre
  la base propia.

### Enmienda del catálogo (16 a 18, asignaciones 20 a 22)
- [x] `permissions.ts`: las dos entradas al final con las descripciones de F1.4, los dos códigos al
  final del Administrador y la frase del recuento («dieciocho»). El párrafo «Quinta enmienda» tiene
  4 líneas y ninguna cita. El ordinal es correcto: es la quinta tras las de QC-38, 66, 86 y 144.
- [x] **Todos** los sitios de `design.md > 6.1` se actualizaron **subiendo** el número o
  **ampliando** la lista:
  - `permissions.test.ts`, `qc75-convenciones` y `guard-permisos-sembrados`;
  - `guard-nav-permisos-declarados` (el ancla de 9 enlaces sigue igual);
  - `documentos/authorization` y `qc145` (R16);
  - `order-assignments-migration` (la resta sigue dando 13);
  - `grupos/scope`, `roles/scope`, `seed-initial-access` e `identity-seed.int`.

  Ninguno se relajó a `toContain` ni a `toBeGreaterThan`. Busqué con grep los 16/20/«dieciseis»
  que quedaban y no hay ninguna aserción sin actualizar: lo que queda son comentarios (menor 7) o
  números ajenos al catálogo.
- [x] **`permissions.test.ts` reescrito.**
  - El caso «QC-144 R5» ahora afirma el orden con `slice` alrededor de `terminados.consultar`. Deja
    de exigir que sea el último, lo que ya no puede ser cierto, pero sigue exigiendo que el
    catálogo real sea igual, entrada a entrada, a la lista escrita a mano. Eso cubre «ningún otro
    código cambia».
  - Si `terminados.consultar` desaparece, `indexOf` devuelve -1, la lista resultante es distinta y
    el caso cae. No se relaja nada.
  - Los casos nuevos de R21, R22 y R25 son exactos (`toEqual`, `toContainEqual` y el detector de
    citas compartido).

### El módulo `lib/modules/clientes`
- [x] Es solo el armazón:
  - `index.ts` reexporta únicamente `type Customer`;
  - `domain/customer.ts` es un tipo puro sin imports;
  - `ports/` y `adapters/` solo tienen `.gitkeep`.

  No hay caso de uso, puerto con métodos, adaptador, Server Action, composición ni menú. Los
  literales `clientes.*` solo aparecen en `permissions.ts`.

### Decisión humana 2026-09-24 (`qc145-estado-solo-planta.test.ts`)
- [x] **Conserva la intención de QC-145.** Su R29 decía que *esa* ficha no añadía modelos. Ahora se
  compara el merge del PR #112 (`51f2d101`) con su primer padre (`f54225c5`), que es exactamente
  la aportación de QC-145.
  - Comprobé que el SHA es el merge del PR #112 de QC-145 y que es ancestro de `origin/dev`.
  - Entre padre y merge, `db/schema.prisma` solo cambia en `finishedAt` de `Order`.
  - La versión anterior medía la rama actual contra `dev` y cazaba cualquier ficha posterior, como
    esta: era un falso positivo estructural.
- [x] **Muerde en lo que puede morder.** El caso sintético usa ahora la **misma** `modelosDe` que
  el caso real (antes tenía una copia local, que era vacua). El caso real es una comprobación
  histórica congelada: solo cae si alguien reescribe la historia o cambia el parser. Es la
  consecuencia natural de fijarlo al alcance de QC-145, y es aceptable.
- [x] **No depende de red.** `git show` sobre el SHA lee objetos locales. En un clon superficial
  sin ese commit **lanza** un error con el motivo, en vez de pasar en verde. Es la misma exposición
  que ya tenía el caso de `package.json` del mismo archivo con el merge-base.
- [x] **Quitar la excepción de QC-141 es correcto.** `ReservationMovement` no está ni en el padre ni
  en el merge de QC-145, así que la excepción ya no tiene objeto. Mantenerla sería una lista de
  permitidos muerta.
- [x] Se usa `~1` para el primer padre, en vez de la notación con acento circunflejo, por el escape
  de `cmd.exe`: es equivalente.

### CHECKPOINTS.md
- [x] typecheck y lint.
- [~] `pnpm test` / `./init.sh`: todo lo relacionado y todas las guardias están en verde; la suite
  completa la corre el leader.
- [x] **E2E en un flujo crítico (permisos).** No aplica en esta ficha: la decisión cerrada lo manda
  a QC-155 y R28 lo prohíbe. Hay precedente con QC-144.
- [x] Sin UI: la regla multiplataforma no aplica. Sin dependencias: `package.json` no está en el
  diff.
- [x] La tabla nueva lleva `company_id` (`guard-empresa-en-esquema` verde, no es exenta). No hay
  consultas de operación nuevas, así que no hace falta test de acceso cruzado: la guardia por
  función queda para QC-154 (`design.md > 6.4`).
- [x] El permiso en el service es de QC-154: aquí no hay service, y R26 prueba que no existe.
- [x] RLS activada y forzada. Sin cliente de Supabase. Migración versionada y reversible.
- [x] Sin secretos ni hardcode de entorno. Sin webhooks.
- [x] Hexágono: `domain` sin imports, barrel sin use-server, `/// @module clientes`, y la raíz de
  `lib/` intacta.
- [ ] `progress/history.md`, desmontar el worktree y veredicto OK: los hace el leader al cerrar.

### Convenciones (comentarios de producción)
- [x] Ninguna línea añadida o modificada en `db/` o `lib/` cita una ficha, un requisito,
  `design.md` ni «decisión cerrada».
  - En `permissions.ts` cambian la línea 8 («dieciocho») y el párrafo nuevo, los dos limpios. Las
    citas de alrededor son preexistentes y no se tocan, así que no son hallazgo.
  - El comentario del modelo (4 líneas más `@module`) y las cabeceras SQL no tienen citas, y
    `customers-migration.test.ts` lo prueba.

---

## Hallazgos

Ninguno es BLOQUEANTE.

1. **menor. T13 sin marcar en `tasks.md`.** Su parte técnica está hecha: el mapa, la
   sincronización con `origin/dev`, `db:migrate` y el diff limitado a los archivos declarados.
   Falta el `./init.sh` completo, que corre el leader. Hay que marcarlo cuando esté verde.
2. **menor. Comentarios de test que citan fichas o requisitos** en líneas que añade o toca esta
   rama. La regla de `docs/conventions.md > Comentarios` también vale para `tests/`, con el
   requisito solo en el nombre del caso.
   - Cabeceras de los cinco archivos nuevos: «T8/T9/T10/T12 — (QC-153 ...)», «Cubre R1, R3 ...»,
     «QC-154 y QC-155».
   - `qc145-estado-solo-planta.test.ts`: la línea nueva «Commit de merge del PR #112 (QC-145)».
   - `qc75-convenciones.test.ts`: las líneas modificadas «QC-86 sumo ...; esta ficha suma» y
     «(QC-74 R4 ...)».
   - `permissions.test.ts`: las líneas reescritas de los JSDoc de `CODIGOS_DEL_REQUISITO`,
     `MODULOS` y `MODULOS_CON_ESCRITURA`, que citan QC-86, QC-66 y QC-74.
3. **menor. Varios casos de «sensibilidad» son tautológicos.** Mutan un texto y comprueban que la
   mutación contiene lo que se le puso, sin volver a pasar el predicado real. Algunos ejemplos:
   - `customers-schema.test.ts`: `@unique` en `email`, `@relation` en `companyId`;
   - `customers-migration.test.ts`: VARCHAR, Operador en lugar de Administrador, CASCADE en el
     DROP;
   - `scope.test.ts`: la carpeta ajena y el literal fabricado, que no llama a
     `fuentesDeProduccion`.

   Las aserciones reales sí morderían, pero estos casos no lo demuestran. Los de FK RESTRICT, RLS
   FORCE, ALTER ajeno y el down sintético de integración sí reutilizan el predicado.
4. **menor. El caso R29 de `scope.test.ts` pasa en verde en silencio** (`return`) si no hay
   `origin/dev` o no se puede leer el `package.json` base, aunque su propio comentario diga
   «Saltar explicitamente, no pasar en verde por vacio». Debería usar `ctx.skip()` o lanzar
   un error. El diff real no toca `package.json`.
5. **menor. El caso R28 («ningun archivo de e2e/ menciona clientes») solo mira nombres de
   archivo, no el contenido.** El título promete más de lo que comprueba. El diff real no toca
   `e2e/`.
6. **menor. Coberturas de integración parciales** (el requisito está cubierto por la parte
   estática):
   - **R11**: la comprobación de que el objeto creado no trae una propiedad `company` es vacua,
     porque sin `include` Prisma nunca devuelve la relación aunque exista. La parte que muerde es
     el test estático del esquema.
   - **R13**: solo se borra en runtime al usuario *creador*; el camino «solo editor» se cubre
     únicamente en estático.
   - **R18**: nada ejerce la parte «las asignaciones de cualquier rol, las haya puesto la migración
     o no». Un DELETE acotado al Administrador pasaría los dos tests de R18, porque la base solo
     tiene asignaciones del Administrador.
7. **menor. Comentarios con el recuento desfasado** junto a líneas que toca la rama:
   - `tests/unit/identity/roles/scope.test.ts:179-187`: el JSDoc de `PERMISOS_ESPERADOS` sigue
     diciendo «DIECISEIS ... dieciseis mas tarde», con la constante ya en 18.
   - `tests/unit/identity/permissions.test.ts:239`: «los dieciseis van escritos uno a uno».
8. **menor. La bitácora queda desordenada y con un estado viejo.** La sección final
   «Sincronizacion con origin/dev» dice que `qc145` sigue rojo y que «NO se ha tocado: pendiente de
   decision». La sección «Decision humana 2026-09-24», escrita *antes* en el archivo, lo resuelve
   (commit `b1064c9e`). Además, el mapa remite a «casos de R21 (T5)» en vez de nombrar los casos.

## Qué vuelve al implementer

Nada que bloquee. Los menores 2-8 pueden ir en un commit de limpieza de tests antes del PR, o
quedar anotados. El menor 1 lo cierra el leader al terminar el gate completo.
