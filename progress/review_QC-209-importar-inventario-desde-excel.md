# review QC-209 — importar-inventario-desde-excel

## Vuelta 1 (rama completa contra `origin/dev`, HEAD `ee075cdd`)

Revisado contra `specs/QC-209-importar-inventario-desde-excel/{requirements,design,tasks}.md`,
`progress/impl_QC-209-importar-inventario-desde-excel.md`, `docs/architecture.md`,
`docs/conventions.md`, `docs/verification.md` y `CHECKPOINTS.md`, con las enmiendas aprobadas en
F1.4 y F2.1 (papaparse en `PURE_PACKAGES`, DS-8 normalizada, R24 `nothing_imported`,
`completed_at`, criterio de tandas con rojos del baseline, contrato de ruta propio de `importar/`).

El grafo de código no se usó: exploración con Grep/Read y git.

### Verificación que corrí yo

| Qué | Resultado |
| --- | --- |
| `pnpm run typecheck` | exit 0 (compila también `inventory-import-contract.test-d.ts`) |
| `pnpm run lint` | 0 errores, 8 warnings preexistentes en archivos que la rama no toca |
| `vitest run` de los 20 unitarios del diff (incluidos `importar/`, listas cerradas tocadas, `xlsx-reader`) + todas las guardias (`guard`) | `Test Files 102 passed (102)`, `Tests 1523 passed / 13 skipped` |
| `vitest run --project integration tests/integration/inventario/inventory-import` | `Test Files 5 passed (5)`, `Tests 32 passed / 1 skipped` (el saltado es la medida de 2.000 filas, condicionada a `QC209_MEDIR_2000=1`) |
| `./init.sh` completo y E2E | no los corrí (los corre el leader): completo verde con 8 rojos todos del baseline; E2E 2/2 (chromium y webkit) |

### Checklist

**Especificación**
- [x] `requirements.md` con R1-R33 en EARS.
- [x] `design.md` con alternativas descartadas y su porqué (sección 10, ocho).
- [x] `tasks.md`: T0, B1-B10, F1-F6 marcadas `[x]`. TI y TZ no llevan casilla; su «hecho cuando» se cumple (fixtures borrados, exención de `scope.test.ts` retirada, acciones reales, E2E verde, mapa R → test en la bitácora, gate completo verde según el leader).

**Trazabilidad**
- [x] Cada R1..R33 aparece como prefijo de al menos un caso en los tests nuevos de la rama (contado por script sobre los títulos de los casos; mínimo R7, R11, R23, R33 con 1 caso; R4 con 43). Revisé el cuerpo de los de más riesgo: R1 (espías del lector y del repo a cero), R7/R24/R26/R27 (integración contra la base: lotes, asiento `opening` con autor, existencia, `onStockIncreased` por lote, fila fallida que no deshace las demás), R24 `nothing_imported` sin escribir `inventory_imports`, R29 (clave repetida, reservas simultáneas, reenvío con filas ya duplicadas), R30, R31 (seis casos de adaptador más el cruce de `finishImport`), R33 (E2E con lotes, asientos, `inventory_imports` 9/5/2/1/1 y archivo de errores con una sola fila y su motivo). No hay tests vacíos.
- [x] La bitácora tiene el mapa R → test (consolidado en TZ y por pista).

**Calidad de código**
- [x] typecheck y lint.
- [x] Suite: verde con los rojos del baseline (leader); los de la feature, verdes en mi corrida.
- [x] Flujo crítico (movimientos de inventario) cubierto por E2E: `e2e/inventario-importar.spec.ts`.
- [x] Multiplataforma (ver abajo).
- [x] Dependencias: `read-excel-file`, `papaparse`, `@types/papaparse` con fila en `docs/dependencias.md` (cuatro checks) y aprobación citada en `design.md > 9.1`. Versiones instaladas = medidas.

**Datos y seguridad**
- [x] `inventory_imports` lleva `company_id`; `guard-empresa-en-esquema` verde.
- [x] Toda consulta del adaptador nuevo filtra por empresa (`productCompanyScope`, `batchCompanyScope`, `companyScopeColumns`, `company_id = ...` en el SQL crudo), y `guard-ambito-empresa-inventario` ya enumera `InventoryImportRepository` (deriva los métodos del puerto, así que cubre también `findImport`). Rechazo cruzado probado en `inventory-import-isolation.int.test.ts`.
- [x] Permiso en el service: `requirePermission(actor, "inventario.modificar")` primera línea de los dos casos de uso y de `createImportFinishedGoods`; probado en unit e integración contra la composición real.
- [x] RLS `ENABLE` + `FORCE`. Sin policies, igual que el resto del repo (ninguna migración crea policies).
- [x] Acceso a datos solo por Prisma.
- [x] Migración con `down.sql`; rollback/migrate comprobados por el implementer en base desechable y en `QuimiCloude_QC209`.
- [x] Sin secretos. Sin webhooks.

**Módulos hexagonales**
- [x] Dominio puro: solo `zod`, `papaparse` (admitido) y barrels de `identity`/`unidades`. El hash pasa a un puerto (`FileDigest`) con adaptador `node:crypto`.
- [x] El ciclo con `recetas` se resuelve con el puerto `ImportFormulaLookup` atado en la composición.
- [x] La Server Action no instancia driven: pide a `lib/composition`; queda fuera del barrel.
- [x] `lib/shared/routes.ts` solo gana una constante.
- [x] Modelo con `/// @module inventario`.
- [x] Lógica en `domain/` (planificación, revalidación, escritura por fila, traducción de errores); la acción solo valida el borde, resuelve el actor y revalida la ruta.

**Permisos**
- [x] `/inventario/importar` llama a `requirePagePermission("inventario.modificar")` (404 sin permiso, probado). El enlace en `/inventario` sale solo con `canAdjustBatchStock`, que es `inventario.modificar`.
- [x] Mutaciones por Server Actions; las altas de faltantes reutilizan `createUnitAction` / `createPresentationAction` sin cambios.

**Configuración**
- [x] Los topes (2.000 filas, 1.000.000 bytes, `maxDuration = 300`) son reglas del spec (D6, DS-5, DS-12), no valores de entorno.

**Verificación final**
- [x] `./init.sh` verde (leader, rojos solo del baseline).
- [ ] `progress/history.md`, desmontaje del worktree, borrar `QuimiCloude_QC209` y restaurar `.env.bak-QuimiCloude`: pendientes del leader al cerrar, fuera de esta revisión.

### Multiplataforma (`docs/architecture.md > Regla: multiplataforma`)

- Sin `100vh` (el diálogo usa `100dvh`); sin `hover:` propio; botones, filtros, enlaces y `SelectTrigger` con `min-h-11 min-w-11`; el aspa `icon-sm` del diálogo se desactiva.
- Inputs a 16 px (`text-base md:text-base`); el input de archivo es `sr-only` con botón visible.
- Tabla compartida con desplazamiento horizontal propio.
- Riesgos declarados en design 6 y en la bitácora (descarga por `Blob` en WebView, `crypto.randomUUID` en Safari iOS ≥ 15.4). No hacen falta excepciones.

### Los desvíos de la bitácora

| Desvío | Juicio |
| --- | --- |
| Puerto `FileDigest` + adaptador `node:crypto` | Correcto. `guard-firma-sesion-unica` prohíbe `crypto.subtle` fuera del codec de sesión, y un puerto es la forma hexagonal de sacar la E/S del dominio. No afloja nada. |
| `InventoryImportRepository.findImport` | Correcto y necesario. Con la enmienda de R24, sin él un reenvío cuyas filas pasan todas a `duplicado` devolvería `nothing_imported` en vez de `already_imported` y rompería R29. Es solo lectura, filtra por empresa, la guardia lo cubre y se consulta solo en ese caso. Probado (unit e integración «R24 R29 …»). |
| `addImportedFinishedGoodsBatch` en `product-prisma.ts` | Correcto. El diseño decía «solo exports», pero `guard-libro-de-inventario` exige que toda escritura de `product_batches` viva en `product-prisma.ts`, exportada y con `writeMovement`. La función asienta `opening` y recalcula, entra en los dos censos (`CAMINOS_ESPERADOS` y `qc121-alcance`) y ninguna guardia se afloja. |
| Listas cerradas al día (`guard-identificador-de-request`, `guard-pantallas-exigen-permiso`, `guard-libro-de-inventario`, `guard-ambito-empresa-inventario`, `qc121-alcance`, `inventario-schema`, `pedidos-schema`, `scope`, `data-table-alcance`, `recipe-route-contract`) | Correcto. Cada una crece con una entrada o un nombre exacto y nota fechada; cuentas y centinelas se tensan, no se aflojan. La exención de `pedidos-schema` es por nombre exacto (`InventoryImport`) y el patrón sigue entero. `product-route-contract` excluye `importar/` por decisión humana, y la subruta tiene su propio contrato (`importar-route-contract.test.ts`, verde). |
| No se reutiliza `components/shared/file-field.tsx` | Justificado: su `accept` es una unión de MIME sin .xlsx, filtra por `file.type` (Windows da `application/vnd.ms-excel` a un .csv) y bloquea archivos grandes en vez de avisar. Cambiarlo tocaba `components/shared/`. El reemplazo sigue el patrón de `document-upload.tsx` y no es una utilidad que ya resuelva una librería. |
| `skipEmptyLines: false` en el lector .csv | Correcto. Con `greedy`, una línea en blanco en medio desplazaba los `rowNumber` respecto a Excel. Las filas en blanco las quita `import-sheet.ts` sin correr la numeración. Probado en `csv-reader.test.ts` e `import-sheet-limits.test.ts`. |
| Tests de integración `*.int.test.ts` | Correcto: es el sufijo que exige `guard-aislamiento-integracion`. Están censados en `aislamiento.json`. |

### Hallazgos

**Bloqueantes:** ninguno.

**Menores (4):**

1. `menor` — **`design.md` no recoge los desvíos de la implementación.** Siguen escritos así: 4.1 `skipEmptyLines: greedy`; 5.1 «+ la policy por empresa» (la migración no crea ninguna, como el resto del repo); 5.2 sin `findImport`; 5 y 5.2 «se exportan sin cambiar su cuerpo» (hoy hay función nueva); 6 «Reutiliza `file-field.tsx`»; 11 con nombres `.test.ts` donde son `.int.test.ts`; y no aparece `FileDigest`. Todo está en la bitácora, pero el diseño es lo que se lee después. Conviene una enmienda de cierre.
2. `menor` — **R31 se prueba a medias en lo que es de la importación.** `inventory-import-isolation.int.test.ts` cubre productos, terminados, lotes, la clave y las escrituras. Lo que no tiene ningún caso de esta ficha es que una unidad (incluidas las de sistema), una presentación o una fórmula homónima de otra empresa salgan como faltante o `formula_not_found` en la vista previa. Hoy se cumple porque los catálogos que se reutilizan ya filtran por `companyId` y tienen sus propios tests de aislamiento, pero R31 los nombra uno por uno. Cerraría el hueco un caso de integración por la composición real con esos tres homónimos en otra empresa.
3. `menor` — **R1 «sin leer el archivo» se cumple en el dominio, no en la acción.** `previewInventoryImportAction` y `confirmInventoryImportAction` llaman a `file.arrayBuffer()` (función `readFile`) antes que al caso de uso, que es quien comprueba el permiso. Nada se parsea ni se consulta sin permiso (lo prueban los espías), y Next ya ha recibido el cuerpo con su tope de 1 MB, así que el riesgo es nulo. Aun así, el texto de R1 y el flujo de design 3 («antes de leer bytes») piden otra cosa. Bastaría con pasar los bytes de forma perezosa o con anotarlo en el spec.
4. `menor` — **La bitácora tiene secciones desactualizadas** que contradicen su propio final. En TZ, R33 sigue «sin correr» y el gate completo «sin veredicto». En «Rojos del gate completo», el punto 5 habla de `finished_at` como rojo pendiente, aunque se resuelve más abajo. En B8, el punto 8 dice que R24 reserva la clave, que es el comportamiento anterior a la enmienda. Faltaría una línea de estado final al principio, o tachar lo superado.

Comentarios (`docs/conventions.md > Comentarios`): ninguna línea añadida o modificada en `lib/`, `app/` ni `db/` cita `QC-<n>`, `R<n>`, `design.md` ni «decisión cerrada». El único cambio de comentario en código preexistente (`inventario/page.tsx`) quita una cita `R27` y el literal de la directiva de cliente; va en su propio commit (`5d44c59f`).

### Veredicto

**OK**: ningún bloqueante y 4 menores. Ninguno de los menores impide el merge. Se pueden recoger en una enmienda de cierre del spec y de la bitácora, o en una ficha aparte.
