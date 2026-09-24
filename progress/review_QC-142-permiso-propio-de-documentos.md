# QC-142 — permiso-propio-de-documentos · review (F2.2)

> Reviewer, 2026-09-24. Rama `feature/QC-142-permiso-propio-de-documentos` en HEAD `7d62679b`,
> comparada con `origin/dev` (`git diff origin/dev...HEAD`).
> No corrí ni la suite completa ni el E2E: el leader está corriendo `./init.sh` completo, y el
> rojo de R19 es heredado de dev (lo decidió el leader y consta en `progress/current.md > Deudas`).

## Veredicto: **RECHAZADO** — 1 mayor, 9 menores

El producto está bien: el catálogo, el seed, la constante, la migración y su `down`. Lo que se
rechaza es **el test que hace cumplir R3**. Tiene dos defectos que lo dejan ciego ante formas que
el propio design le encarga detectar, y lo demostré ejecutando su predicado sobre los archivos de
`origin/dev` (hallazgo M1).

## Checklist

| # | Punto | Estado |
|---|---|---|
| 1 | Trazabilidad R1-R21 → test | Pasa, con la salvedad de M1 (R3) y de los menores m6-m8 |
| 2 | Tasks `[x]` | T1-T10 `[x]`. **T11 `[ ]`**: pendiente del `./init.sh` completo del leader (m9) |
| 3 | CHECKPOINTS | Ver el desglose de abajo |
| 4 | Verificación ejecutable | Corrí los 68 archivos unit y guard que toca la rama (lista abajo): **723 pasan, 38 se saltan (skipped), 0 fallan**. No corrí integración, E2E ni `./init.sh` (lo corre el leader) |
| 5 | Calidad y seguridad | Pasa. No hay tablas nuevas, así que RLS no aplica. Sin webhooks, sin secretos y sin contexto hardcodeado. Las capas no cambian |
| 6 | Multiplataforma | No aplica: la rama no toca UI |
| 7 | Dependencias | Pasa: `package.json`, `pnpm-lock.yaml` y `docs/dependencias.md` sin cambios (R21) |
| 8 | Aislamiento por empresa | Pasa: no hay modelo nuevo en `db/schema.prisma` ni consultas de operación nuevas |
| 9 | Comentarios de producción | Pasa: ninguna línea añadida o modificada en `lib/` o `db/` cita `QC-`, `R<n>`, `design.md` ni «decisión cerrada». Menores de forma en m4 |
| — | Baseline | Pasa: `tests/baseline-rojos.json` no cambia y sigue con `archivos: {}` |

Tests que corrí: `vitest run` sobre `catalogo-sin-total-fijo`, `schema/documents-permissions-migration`,
`permissions`, `seed-initial-access`, `roles/scope`, `grupos/scope`, `tests/unit/documentos/*`,
`document-upload-convenciones`, `qc75-convenciones`, `qc145-estado-solo-planta`,
`order-assignments-migration`, `guard-permisos-sembrados`, `guard-nav-permisos-declarados` y
`guard-identificador-de-request`.

### Lo que pediste mirar en concreto

- **La migración `20260924130000_documents_permissions`.** Solo tiene datos: tres `INSERT ... ON
  CONFLICT DO NOTHING` y cero DDL. Es idempotente. La herencia de D5 va por permiso (filtra
  `role_permissions` por `proveedores.modificar`) y solo da `documentos.modificar`. El
  Administrador se resuelve por nombre, que es D4 y no la herencia; `roles.name` es `@unique`
  global. El `down` son dos `DELETE` acotados a los dos códigos, primero las asignaciones, sin
  `CASCADE`. Las dos pruebas lo confirman: la estática, con mutaciones, y la de integración, con
  rol efímero con y sin `proveedores.modificar`. **Pasa.**
- **R3 sin total literal.** El árbol hoy cumple: con grep no queda ningún total literal del
  catálogo ni del seed en `tests/` ni en `e2e/`. **El test que lo vigila no es un placebo**, porque
  sus casos sintéticos disparan, **pero es ciego ante dos formas que el design le encarga** → M1.
- **`DOCUMENT_UPLOAD_PERMISSION`.** Lo usan como primera línea `issue-upload-links.ts:72`,
  `enqueue-batch.ts:31` y `get-batch-status.ts:30`. `read-document.ts` no cambia y no exige
  permiso; el test nuevo de R18 lo prueba con un actor sin ningún permiso en las dos operaciones.
  Buscar `proveedores.` en `lib/modules/documentos` no devuelve nada. **Pasa.**
- **La enmienda de `document-upload-convenciones.test.ts`.** Es correcta y más fuerte que antes:
  afirma que los únicos códigos que casan con el patrón documento|subir|carga son exactamente los
  dos de `documentos`. Queda un comentario que ahora miente (m2).
- **Comentarios.** Ver m2, m3 y m4. Ninguno es bloqueante.
- **Baseline.** No se añadió nada.

### CHECKPOINTS

- Especificación: requirements EARS R1-R21 ✓; design con 7 alternativas descartadas ✓; tasks con
  T11 pendiente (m9).
- Trazabilidad: el mapa está en `progress/impl_…md` ✓; R3 en M1.
- Calidad de código: typecheck y lint verdes según la bitácora; los unit y guard afectados, verdes
  en mi corrida. `pnpm test` completo y `./init.sh` están pendientes del leader. Permisos es flujo
  crítico: E2E R20 verde según la bitácora; R19 es rojo heredado de dev (decisión del leader).
- Datos y seguridad: el permiso se valida en el service y tiene test ✓. La migración tiene su
  `down.sql` ✓, y según la bitácora `db:rollback` revierte y deja `_prisma_migrations` coherente.
  No hay tabla nueva.
- Hexagonal, Permisos y Configuración: sin cambios de estructura ✓.
- Verificación final: pendiente (`./init.sh`, `history.md`, worktree).

## Hallazgos

### MAYOR

**M1 — `tests/unit/identity/catalogo-sin-total-fijo.test.ts` no detecta dos formas de total fijo
que el design le encarga (R3; design §5, último párrafo; T8).**

Pasé el predicado del test (`PATRONES_DE_TOTAL_FIJO` + `sinComentarios`) sobre las versiones de
`origin/dev` de los sitios de design §1.3. **No dispara** en dos sitios cuya forma el design lista
expresamente como detectable:

1. **Sitio #1, `tests/guards/guard-permisos-sembrados.test.ts`** (`PERMISSIONS.length` contra
   literal). La aserción original es multilínea: `expect(` / `PERMISSIONS.length,` / un mensaje
   concatenado en tres líneas / `).toBe(18)`. El patrón de «PERMISSIONS.length» solo tolera hasta
   80 caracteres **sin salto de línea** entre el identificador y el matcher, así que **esta misma
   aserción**, reintroducida tal cual, pasaría en verde.
2. **Sitio #9, `tests/unit/pedidos/qc145-estado-solo-planta.test.ts`**:
   `expect(PERMISSIONS).toHaveLength(18);` en una sola línea, que es justo la forma
   «`PERMISSIONS)` + `toHaveLength(`». Se escapa por un **bug de `sinComentarios`**: la regex de
   comentario de bloque toma por inicio de comentario cualquier `/*` o `/**` que aparezca
   **dentro de un string** (en ese archivo, el nombre de un caso con una ruta `…/**…`) y se come
   ~8,7 KB de código hasta el siguiente `*/`, incluida la aserción. Cualquier archivo de test con
   un glob o una ruta con `**/*` en un string queda ciego en todo ese tramo.

El barrido real, además, **no tiene ancla contra la vacuidad**: `fuentesDeTestBajo` se traga los
errores de `readdirSync` y nada afirma que se hayan leído archivos. Con la raíz mal resuelta, el
caso pasaría en verde sin mirar nada.

**Qué hace falta para cumplir** (sin cambiar el alcance del design):
- que los patrones admitan saltos de línea dentro de la llamada `expect(…)` (por ejemplo,
  normalizando los espacios antes de probar, o ampliando la ventana a `[^;]` con un tope
  razonable);
- que `sinComentarios` no trate como comentario un `/*` que esté dentro de un string o de un
  literal de plantilla. Basta con quitar solo los comentarios que empiezan una línea (tras
  espacios), o con usar el scanner de `typescript`, que ya está en el stack;
- dos casos sintéticos con el texto exacto de `origin/dev` de los sitios #1 y #9, que tienen que
  disparar;
- un ancla del barrido: se leyó más de 0 archivos, y entre ellos uno conocido (por ejemplo,
  `tests/guards/guard-permisos-sembrados.test.ts`).

### Menores

- **m1 — El alcance del predicado de R3 es más estrecho que R3.** Solo mira cinco
  identificadores. En `origin/dev` había 18 líneas con total literal, y de ellas también se le
  escapan formas como `expect(codigos).toHaveLength(18)` (authorization, permissions),
  `new Set(codigos).size).toBe(18)`, `expect(catalogo).toHaveLength(18)` (qc75),
  `codigosDelAdministrador).toHaveLength(18)` y `antes.permisos).toHaveLength(18)`. Es fiel al
  design §5, así que queda en menor. Recomiendo ampliarlo al corregir M1.
- **m2 — Comentarios de test que la rama ha vuelto falsos**, aunque sus líneas no están en el
  diff:
  - `tests/unit/identity/seed/seed-initial-access.test.ts:210-211`: «veintidos (Administrador 18
    + Operador 2 + Empacador 2)»;
  - `tests/unit/documentos-ui/document-upload-convenciones.test.ts:194`: «un codigo QUE YA
    EXISTIA, no uno inventado para esta ficha»;
  - `e2e/documentos.spec.ts:173`: «Un rol efimero no probaria el permiso de verdad», en el mismo
    archivo que ahora usa un rol efímero para R20.
- **m3 — Citas de ficha y requisito en comentarios de test** (`docs/conventions.md >
  Comentarios`: en tests `R<n>` va en el nombre del caso, no en comentarios):
  `e2e/documentos.spec.ts:73, 138, 220` («R20 (QC-142)») y la cabecera de
  `documents-permissions-migration.int.test.ts` («para R6/R7»). El JSDoc de los predicados de
  `schema/documents-permissions-migration.test.ts` también cita R9, R10 y R11.
- **m4 — Forma de los comentarios de producción.**
  - La cabecera de `migration.sql` tiene 9 líneas, por encima de las ~5 de la regla.
  - En `permissions.ts`, el párrafo «Sexta enmienda al catalogo cerrado» imita la narrativa de
    los párrafos anteriores (la regla dice que no se imita el estilo de alrededor), y el ordinal
    chocará al mergear QC-161 y QC-168.
  - Las líneas 8-9 de ese mismo JSDoc quedaron partidas a mitad de frase.
- **m5 — El test R17 de `authorization.test.ts`** escribe `'Empacador'` como literal en vez de
  importar `ROLE_EMPACADOR`, y no afirma que la lista de fuentes del módulo tenga elementos: si
  estuviera vacía, pasaría sin comparar nada.
- **m6 — Integración de la migración.**
  - R10 compara Administrador, Operador, Empacador y el rol efímero, pero no toda la tabla
    `permissions`, toda `role_permissions` ni `roles`, que es lo que pedía T5. El test estático
    del `DELETE` acotado lo compensa.
  - El caso «R9 UP tras seed» no afirma que el Administrador ya tuviera los dos `documentos.*`
    antes de aplicar la migración. Si no los tuviera, «no cambia» sería falso, así que falta esa
    ancla.
- **m7 — R2.** El caso «previo + dos» compara códigos, pero no que las entradas previas conserven
  módulo, acción y descripción, que es parte del texto de R2.
- **m8 — R13 sobre «una base sembrada antes de esta feature».** No hay un caso con los códigos de
  `documentos`. Lo cubre en genérico el caso 17 del seed, con `pedidos.modificar`.
- **m9 — Bookkeeping.**
  - T11 sigue `[ ]` hasta el `./init.sh` del leader.
  - La bitácora `progress/impl_…md` se contradice consigo misma y con `tasks.md`. La cabecera y
    la línea 34 dicen que T10 está abierta; las líneas 136-141 dicen «el E2E no se ha corrido,
    R19 y R20 siguen sin verificar», y eso contradice la sección «Corrida E2E».

### Observación (no cuenta como hallazgo)

- R19 sale rojo en el procesado, después de la autorización. Siguiendo el contexto del leader, es
  un rojo heredado de dev y la rama no toca el procesado: `lib/modules/documentos` solo cambia la
  constante. **Tiene que constar en el PR.** El caso nuevo de R20 afirma que la subida se montó
  antes de comprobar el rechazo, así que no pasa en verde por la razón equivocada.

## Para la vuelta 2 (implementer)

1. Arreglar M1 como se indica arriba.
2. De paso, recomendados: m1, m2 y m5.

---

## Revisión 2 (2026-09-24)

> Delta revisado: `ace494d6..8d96f824` (de `e4417e4c` a `1a46fbbe`, más el merge de `origin/dev`,
> que no trae conflictos ni migraciones). No corrí ni la suite, ni la integración, ni el E2E, ni
> `./init.sh`: los corre el leader.

### Veredicto: **APROBADO** — 0 mayores, 2 menores nuevos

Queda condicionado a que el `./init.sh` completo del leader termine en verde. T11 se cierra con él.

### Verificación ejecutable

- `vitest run` sobre los 8 archivos que toca el delta: `catalogo-sin-total-fijo`, `permissions`,
  `seed-initial-access`, `authorization`, `schema/documents-permissions-migration`,
  `document-upload-convenciones`, `guard-convenciones-showcase` y `guard-aislamiento-integracion`.
  Resultado: **123 pasan, 0 fallan**.
- Probé yo mismo el predicado nuevo. Transpilé `sinComentarios` y `totalesFijosDelCatalogoEn` del
  archivo real y los pasé por las versiones de `origin/dev` de los ocho sitios:
  - `guard-permisos-sembrados` (la aserción multilínea) → **dispara** `PERMISSIONS.length`;
  - `qc145-estado-solo-planta` (el glob `/**` dentro de un string) → **dispara**
    `PERMISSIONS) + toHaveLength(`;
  - `identity-seed.int` y `seed-initial-access` → disparan también en `antes.permisos`,
    `antes.asignaciones` y `codigosDelAdministrador` (ampliación de m1);
  - `authorization`, `permissions` y `qc75` → no disparan, que es lo esperado según la
    justificación de m1.

### Cierre de los hallazgos de la revisión 1

| Hallazgo | Estado |
|---|---|
| **M1** | **Cerrado.** El scanner de `typescript` (ya era devDependency, no hay dependencia nueva) deja de confundir un `/**` dentro de un string con un comentario. Los espacios se colapsan antes de probar los patrones, así que ahora se ven las aserciones multilínea. Están los dos casos sintéticos con el texto exacto de dev, y el barrido tiene ancla: más de 0 archivos, uno de ellos conocido, y `readdirSync` ya no se traga los errores |
| m1 | **Justificado.** No se amplía a `codigos)`, `new Set(codigos).size)` ni `catalogo)`, porque esos identificadores se reutilizan con totales de otros catálogos y darían falsos positivos. Lo acepto |
| m2 | Cerrado. Los tres comentarios falsos están corregidos |
| m3 | Cerrado en lo que señalé. Pero el delta **introduce citas nuevas** → r2-m1 |
| m4 | Cerrado. La cabecera de `migration.sql` baja a 4 líneas; el párrafo del ordinal pasa a una frase corta; el JSDoc está recompuesto. Las líneas de producción añadidas o modificadas no citan ficha, R, D ni `design.md` |
| m5 | Cerrado: usa `ROLE_EMPACADOR` y ancla que la lista de fuentes no está vacía |
| m6 | Cerrado. R10 compara `permissions`, `role_permissions` y `roles` completas, con la foto tomada después de preparar el escenario y antes del UP (línea 341) y comparada tras el DOWN. «R9 UP tras seed» ancla el estado previo |
| m7 | Cerrado: `PERMISOS_PREVIOS`, con sus tres campos copiados a mano, sin total |
| m8 | Cerrado: casos de R13 sobre «base sembrada salvo `documentos.*`», en unit y en integración |
| m9 | Cerrado: la bitácora es coherente con `tasks.md`. T11 sigue `[ ]` hasta el gate del leader |

### El arreglo del R29 de QC-140 (`e476cfd1`)

**No esconde nada.**
- El guard viejo comparaba `origin/dev..HEAD`, y por eso cualquier rama posterior que añadiera
  algo en `db/` lo ponía en rojo. Esta rama lo pone en rojo con su propia migración, legítima.
- Ahora compara el merge de entrada de QC-140 (`a738d81f`, PR #118) contra su primer padre
  (`cf99cc2b`), que es exactamente lo que ese PR aportó a dev. Lo comprobé a mano: el diff
  `--diff-filter=A` bajo `db/` sale vacío, y `components/shared/entity-image.tsx` no aparece. El
  guard afirma algo que es verdad.
- El anti-placebo `ffabc3af` sí añade archivos bajo `db/` (`schema.prisma`, `migration_lock.toml`
  y otros).
- Si el commit no está en el clon, el test falla con un error explícito; no se salta en silencio.
- Los precedentes `bb01139e` y `7cd534e8` existen y siguen el mismo patrón.
- Se pierde la comprobación del árbol de trabajo sin commitear, que solo tenía sentido mientras
  QC-140 estaba en curso.

### Hallazgos nuevos (menores)

- **r2-m1 — Citas nuevas en comentarios de test** (`docs/conventions.md > Comentarios`; en tests,
  `R<n>` solo en el nombre del caso):
  - `catalogo-sin-total-fijo.test.ts`: «R3 en origin/dev, sitio #1…» y «…sitio #9…»;
  - `permissions.test.ts`: el JSDoc de `PERMISOS_PREVIOS` cita «QC-142 R2»;
  - `guard-convenciones-showcase.test.ts`: «Lo que R29 y D20 protegen…», con fecha incluida.
  
  No afecta a producción.
- **r2-m2 — Límites conocidos del predicado de R3**, que no bloquean:
  - la ventana `.{0,300}?` cruza sentencias, así que `expect(PERMISSIONS.length).toBeGreaterThan(0);
    expect(otra).toBe(3);` dispara. Es un falso positivo, pero falla en rojo (lado seguro) y hoy
    el barrido está limpio;
  - el scanner corre sin contexto sintáctico y no re-escanea los literales regex, así que un regex
    con `\/\/` ciega el resto de su línea.

  Conviene dejarlo dicho junto al predicado, o acotar la ventana a la sentencia.

### Observación

El delta cambia el comentario de `migration.sql` y con él su checksum. Solo lo había aplicado la
base propia `QuimiCloude_QC142`, y `prisma migrate status` sigue al día según la bitácora. Si la
plantilla de integración `qct_tpl_*` se reutilizara con el checksum viejo, lo delatará el
`./init.sh` del leader.
