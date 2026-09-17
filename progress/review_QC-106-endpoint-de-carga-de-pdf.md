# QC-106 - endpoint-de-carga-de-pdf - review

> Revisado el 2026-09-16 dentro del worktree `.worktrees/QC-106-endpoint-de-carga-de-pdf`, sobre
> `feature/QC-106-endpoint-de-carga-de-pdf`, contra el merge-base con `origin/dev`
> (`61757009796022ff52306644b7b5644ed2077f67`).
>
> **Como se verifico, y por que no con `./init.sh`.** El gate completo aborta con exit 1 antes de
> typecheck, lint y tests porque la zona `backend` tiene tres features `in_progress`, que es una
> decision humana registrada y no un fallo de esta ficha. Se corrieron los comandos dirigidos:
>
>     pnpm lint                                  -> sin un solo hallazgo
>     pnpm exec vitest run tests/unit/documentos -> 10 archivos, 149 tests, 149 passed
>     pnpm exec vitest run guard                 -> 41 archivos, 445 passed | 9 skipped
>
> Los 335 errores de `pnpm typecheck` son **ambientales y estan diagnosticados** (pnpm ignoro los
> build scripts de Prisma y el cliente nunca se genero en este worktree). Se comprobo que **ninguno
> menciona `modules/documentos` ni `composition`**. No se cuentan como hallazgo.

## Checklist de CHECKPOINTS.md

### Especificacion
- [x] `requirements.md` con requisitos EARS numerados **R1-R34**, y la tabla de cobertura D1-D19.
- [x] `design.md` con alternativas descartadas y su porque (seccion 4 (a) y (b), seccion 8 con
      `mupdf`/`pdf-lib`/`pdf2pic`, seccion 11 con seis mas).
- [x] `tasks.md` con **T0-T13, todas [x]**.

### Trazabilidad
- [x] `progress/impl_<feature>.md` contiene el mapa `R<n> -> test` con las 34 filas.
- [~] **33 de 34 requisitos mapean a un test que de verdad los verifica.** Se leyeron los diez
      archivos de test uno a uno, no solo sus nombres. **R12 solo esta verificado a medias** - ver
      hallazgo **B1**.

### Calidad de codigo
- [x] `pnpm lint` limpio.
- [~] `pnpm typecheck`: rojo **por causa ambiental ajena a la ficha**, cero errores en sus archivos.
- [x] Tests de la feature: 149/149; las 41 guardias en verde.
- [ ] E2E: **no aplica y esta declarado**. La ficha no anade pantalla ni ruta navegable (R34, D17);
      deuda con destinatario **QC-107**, escrita en la bitacora y en `design.md > 12`. Excepcion
      consciente, no silenciosa.
- [x] UI multiplataforma: **no aplica**, cero archivos bajo `app/**` y `components/**`, afirmado
      contra el diff por `qc106-alcance.test.ts`.
- [x] Dependencias: `unpdf` y `@napi-rs/canvas` tienen **fila propia** en `docs/dependencias.md` con
      los cuatro checks y la aprobacion humana citada; la fila de `@supabase/storage-js` quedo
      **enmendada** a dos consumidores.

### Datos y seguridad
- [x] **Ninguna tabla nueva**: el diff no toca `db/**`, verificado a mano y por guardia. No aplican
      columna de empresa, RLS ni `down.sql`.
- [x] **El permiso se valida en el SERVICE y tiene su test.** `issue-upload-links.ts:68` es la
      primera linea del caso de uso, antes de zod y antes de tocar ningun puerto.
- [x] Falla cerrado con **seis** actores (nulo, ausente, sin `permissions`, lista vacia, valor que no
      es lista, con otros permisos), y en cada uno se afirma que **ningun metodo de ningun puerto**
      se llamo.
- [x] **No se autoriza por rol**: se exige `proveedores.modificar`, codigo ya existente, tipado con
      `PermissionCode`; `guard-rol-administrador-unico` en verde.
- [x] Sin acceso a datos por Supabase: el almacenamiento no toca ningun dato de negocio.
- [x] Ningun secreto: `.env.example` declara `SUPABASE_DOCUMENTS_BUCKET` **vacia** y documentada, y
      un test barre el archivo entero buscando valores.
- [x] Webhooks: no aplica, no hay ninguno.

### Modulos hexagonales
- [x] `domain/` y `ports/` no importan framework, SDK, `lib/shared` ni `lib/composition`; el unico
      paquete externo admitido es `zod`.
- [x] De `identity` se consume **solo el barrel**, nunca ruta profunda.
- [x] El driving **no instancia** su driven: lo pide a `@/lib/composition`.
- [x] **Ningun `use server` sale por el barrel**: el barril solo reexporta de `./domain`, y se
      comprueba el **cierre transitivo**, no el archivo suelto.
- [x] Cableado puerto -> adaptador **solo** en `lib/composition/index.ts`, bloque nuevo al final, sin
      invocar nada: construir la fachada no lee ninguna variable ni toca la red.
- [x] La logica esta en `domain/`: la Server Action resuelve actor, valida y traduce, y no decide.

### Configuracion
- [x] Nada hardcodeado: direccion, credencial y bucket por entorno, **leidos en la invocacion**.
- [x] Los seis limites viven cada uno en **una sola** definicion, comprobado por nombre **y por
      valor** sobre el arbol del modulo.

## Lo prohibido, comprobado uno por uno

Las cinco prohibiciones de `tasks.md`, contra el diff del merge-base y contra el test de alcance:

| Prohibicion | Estado |
| --- | --- |
| Nada bajo `app/**` ni `components/**` | **Cumple** - cero archivos |
| Ningun Route Handler ni `app/api/**` | **Cumple** - cero archivos; la accion no nombra `NextRequest`/`NextResponse` ni exporta verbos HTTP |
| Ni `db/schema.prisma`, ni migracion, ni `down.sql` | **Cumple** - cero archivos bajo `db/` |
| Ningun codigo de error ni permiso nuevo | **Cumple** - `error-codes.ts` y `permissions.ts` **identicos** a los de la base, comparados con `git show` |
| Ningun E2E | **Cumple** - cero archivos bajo `e2e/` |

La guardia `qc106-alcance.test.ts` no solo afirma sobre el repo: **prueba sus detectores por los dos
lados**, con listas fabricadas que tienen que dar hallazgo. No es un verde vacuo.

## Dependencias

- `unpdf@1.8.1` y `@napi-rs/canvas@1.0.9`: fila propia con los cuatro checks fechados, aprobacion
  humana citada, y las alternativas descartadas con su motivo (`mupdf` por AGPL, `pdf-lib` y
  `pdf2pic` por el check 2).
- **La condicion escrita de esa aprobacion se cumple**: el barrido sobre `lib`, `app`, `components`,
  `hooks`, `scripts`, `tests` y `e2e` confirma que **un unico archivo** importa cada uno de los dos
  paquetes, `pdf-converter-unpdf.ts`. Verificado ademas a mano.
- `@supabase/storage-js` **no entra como nueva** y su fila quedo enmendada a dos consumidores; un
  test afirma que los importadores de produccion son **exactamente esos dos**.
- `DEPENDENCIAS_ESPERADAS` 31 -> 33: autorizado expresamente y **no metido al baseline**. No es
  hallazgo.

## Comentarios que citan fichas

Se busco `QC-<n>` en **todo** el codigo nuevo de produccion: `lib/modules/documentos/**` y el bloque
nuevo de `lib/composition/index.ts`. **Cero apariciones.** Los `R<n>` viven en los nombres de los
tests, que es donde deben estar. Es exactamente lo que le costo el rechazo a QC-60 hoy, y aqui esta
bien hecho.

## Hallazgos

### B1 - BLOQUEANTE. La mitad de LECTURA de R12 no esta implementada, no esta probada y no esta declarada

**Lo que dice R12** (`requirements.md:97-100`): toda ruta que el sistema firme debe empezar por el
identificador de la empresa del actor; y **si se pide firmar -de subida o de lectura- una ruta que no
este bajo ese prefijo**, el sistema debe rechazarla con `unauthorized`, exista o no el archivo, y sin
revelar si existe.

**Lo que dice el propio `design.md > 5`**, punto 2, sin ambiguedad: al firmar una lectura o al
descargar -lo que usara QC-111- la ruta si llega de fuera, y entonces
`isPathInCompany(path, actor.companyId)` decide: si no empieza por el prefijo exacto de la empresa
del actor, `UnauthorizedError` **antes de tocar el puerto** (R12).

**Lo que hay en disco.** La mitad de **subida** esta cumplida, y bien: la ruta la construye el
servidor con `actor.companyId`, el cliente no puede proponer ninguna -`strictObject` lo hace
inexpresable- y hay tests que lo afirman con dos actores de empresas distintas y la misma entrada. La
mitad de **lectura** no existe:

- `isPathInCompany` tiene **cero llamantes en produccion**. Sus unicas apariciones fuera de su propia
  declaracion son la reexportacion del barril y los tests. Es una funcion pura, correcta y bien
  probada por su cuenta, que **nadie usa para rechazar nada**.
- No hay ningun caso de uso de lectura ni de descarga en `domain/`, asi que no hay ningun punto donde
  la comprobacion pudiera ocurrir.
- Y sin embargo `lib/composition/index.ts:1042-1046` **si cablea** `createSignedReadUrl` y `download`
  dentro de `documentStorage`. La capacidad de leer y descargar por ruta queda construida y **sin
  guardia de empresa**; lo unico que hoy la mantiene a salvo es que la fachada `documentos` expone
  solo `issueUploadLinks` y `convertPdfs`, de modo que ningun consumidor la alcanza **todavia**.

**Por que es bloqueante y no menor.** No es una comprobacion defensiva que falte: el aislamiento por
empresa de esta ficha **no es una columna sino la ruta** (D5, D6), y sin fila en base -son palabras de
la propia decision- conocer un identificador ajeno daria acceso al archivo. QC-111 va a consumir este
puerto: recibira `download(path)` y `createSignedReadUrl(path)` sin que nada del modulo compruebe la
empresa, y la pieza que deberia hacerlo se publica por el barril como si el trabajo estuviera hecho.
Ademas **no esta declarado en ningun sitio**: la bitacora enumera cuatro limites -el bucket,
`@napi-rs/canvas`, el render real y `tests/unit/composition`- y **este no esta entre ellos**, asi que
no es deuda con destinatario sino un hueco silencioso entre lo que el design prometio y lo que el
codigo hace.

**Que falta para cumplirlo.** Cualquiera de las dos, y la eleccion es del implementer:

1. **Implementarlo**, que es lo que dice el design: un caso de uso de lectura/descarga en `domain/`
   que reciba el actor, aplique `isPathInCompany` y lance `UnauthorizedError` **antes** de tocar el
   puerto -con el mismo error para "no es tu empresa" y para "no existe", sin revelar cual-, con su
   test del rechazo cruzado **a traves del caso de uso**, no solo sobre la funcion pura.
2. **Declararlo y cerrarlo**, si el humano prefiere que la lectura entera sea de QC-111: reescribir
   R12 como se hizo con R10/D19, anotar el limite en la bitacora con destinatario explicito, y -esto
   no es opcional- no dejar `createSignedReadUrl` ni `download` cableados sin guardia, o dejar un
   test que afirme que no son alcanzables desde la fachada, para que quien los consuma tenga que
   pasar por la comprobacion en vez de encontrarselos abiertos.

### m1 - menor. Cableado sin consumidor en lib/composition

Consecuencia del anterior, pero con arreglo propio: de las tres operaciones del puerto de
almacenamiento **solo `createSignedUpload` tiene consumidor**. Las otras dos se atan a su adaptador y
no las invoca nadie. Es coherente con dejarlas listas para QC-111 y esta explicado en el docblock del
puerto; lo que falta es que ese "para QC-111" este escrito como limite en la bitacora, junto a los
otros cuatro.

### m2 - menor. El estado en disco de la ficha no esta puesto al dia en este worktree

`feature_list.json` y `progress/current.md` de este worktree **no mencionan QC-106**. Es trabajo del
leader, no del implementer, y no afecta al codigo; pero `CHECKPOINTS.md > Verificacion final` pide la
entrada en `progress/history.md` y el estado coherente antes de `done`. Se anota para que no se
pierda al cerrar.

### m3 - menor. La caducidad informada es la del reloj del dominio, no la de cada firma

`issue-upload-links.ts:89-92` **reescribe** el `expiresAt` que devuelve el adaptador con uno unico
para toda la tanda. Esta hecho a proposito y documentado -firmar diez archivos no puede dar diez
vencimientos distintos- y el test lo fija. El efecto secundario, que no se dice en ningun sitio: el
instante informado para el ultimo archivo es **ligeramente anterior** al real, porque su firma se
emitio despues. Es conservador, asi que nunca enganna a favor de quien sube. Se anota, no se pide.

### m4 - menor. El factor de milisegundos se escribe dos veces

`MILLISECONDS_PER_SECOND` en `issue-upload-links.ts:35` y un `* 1000` suelto en
`document-storage-supabase.ts:58-60`. No es ninguno de los seis limites que R20 protege, asi que el
barrido de duplicados no lo ve. Trivial; se dice porque el criterio del modulo es no repetir numeros.

## Lo que se miro con dureza y salio bien

- **Los tests prueban lo que dicen.** Varios afirman sobre **no llamadas** contra un doble que
  registra, y en la Server Action el caso de uso real se cablea sobre un puerto cuyos tres metodos
  **revientan si alguien los toca**: "no se toco el almacenamiento" es una afirmacion y no la
  ausencia de una asercion. Las reglas de contrato y de alcance se prueban ademas **por el lado que
  tiene que dar rojo**, con arboles y listas fabricados. No se encontro ni un test vacio ni un verde
  vacuo.
- **El orden permiso -> esquema -> puerto** esta probado por el resultado y no por lectura: con actor
  sin permiso **y** entrada rota, gana `unauthorized`. Es la decision humana de T9, bien
  implementada: la accion no comprueba ningun permiso ni conoce el codigo exigido.
- **R10 tras la enmienda D19**: el codigo **no promete** quince minutos en la subida. El puerto
  **pierde** el parametro de plazo -un contrato que pidiera un plazo que nadie honra seria una
  mentira-, se declara `PROVIDER_UPLOAD_LINK_TTL_SECONDS` con su docblock diciendo que el modulo no
  lo elige, y hay un test que afirma que lo informado **no** son los quince minutos.
- **Los tres limites que la ficha no puede probar estan declarados con destinatario** y no
  disimulados: el tope de 20 MB lo impone el bucket -y un test afirma que **ningun archivo del modulo
  compara contra el**-, el render real lo ejercitara QC-111, el E2E va a QC-107.
- **Sin red y sin bucket**: importar el adaptador con las tres variables vacias no lanza, y el error
  de configuracion nombra las que faltan sin filtrar ningun valor.

## Veredicto

**RECHAZADO.**

Un solo bloqueante, **B1**, y el resto del trabajo esta por encima de la media: el alcance se respeto
entero, la autorizacion esta donde tiene que estar, las dependencias entraron con su acta y sus
condiciones, y la calidad de los tests es alta de verdad y no de nombre. Pero R12 es el requisito que
sostiene el aislamiento por empresa de una feature **que no tiene tabla**, y su mitad de lectura no
esta implementada, no esta probada a traves de ningun caso de uso y no esta declarada como diferida,
mientras el puerto que la necesita ya queda cableado. Vuelve al implementer con las dos salidas de
B1; cualquiera de las dos cierra el hallazgo. Los cuatro menores no bloquean.
