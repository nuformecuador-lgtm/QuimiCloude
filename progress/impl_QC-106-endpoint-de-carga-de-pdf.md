# QC-106 — endpoint-de-carga-de-pdf · bitacora de implementacion

> Fase 2, implementada dentro del worktree `.worktrees/QC-106-endpoint-de-carga-de-pdf`
> sobre la rama `feature/QC-106-endpoint-de-carga-de-pdf`.
> Spec aprobado por el humano en F1.4 el 2026-09-16.

## T0 — las dos respuestas de la puerta F1.4

Las dos llegaron **aprobadas** con el spec. Se escriben aqui porque T1 no se cierra sin la
segunda y T8 no se abre sin la primera.

### T0.1 — la dependencia: **SI**

`unpdf` y `@napi-rs/canvas`, aprobadas por el humano, con sus filas **ya escritas** en
`docs/dependencias.md` por el commit anterior a esta implementacion.

Instaladas en las versiones exactas de la aprobacion:

```
+ unpdf 1.8.1
+ @napi-rs/canvas 1.0.9
```

**Condicion de la aprobacion, tal como la escribe la fila**: las dos quedan **aisladas en un
solo archivo**, `pdf-converter-unpdf.ts`, detras del puerto de conversion. Ningun otro archivo
del repositorio puede importarlas. Ninguna otra dependencia se instalo.

**Hallazgo que conviene no repetir.** Las filas del registro estaban escritas y los paquetes no
estaban instalados, y eso dejaba `tests/guards/guard-dependencias-aprobadas.test.ts` **en rojo
antes de escribir una sola linea de la feature**. La guardia es **bidireccional**: su segundo
caso, «el registro no lista paquetes que ya no estan instalados», recoge las filas del registro
que no aparecen en `package.json`. Escribir la fila y no instalar deja el gate rojo igual que
instalar sin fila. Verificado en verde tras la instalacion:

```
RUN  v4.1.10
Test Files  1 passed (1)
     Tests  2 passed (2)
```

### T0.2 — el permiso exigido: **`proveedores.modificar`**

Decision humana cerrada. Verificada en disco antes de implementar, en
`lib/modules/identity/domain/permissions.ts`:

- **Existe** en el catalogo cerrado de quince permisos. No nace ningun `documentos.*`, no hay
  migracion, ni seed, ni guardia de permisos que tocar.
- En `SEED_ROLE_PERMISSIONS` lo tiene **unicamente el Administrador**. El Operador nace con dos
  permisos, `inventario.consultar` y `asignaciones.consultar`, y ese no esta entre ellos.
- Se valida **en el service**, como primer paso, antes de `zod` y antes de tocar ningun puerto.
  **No se compara el nombre del rol** (prohibido desde QC-74).

### Lo demas que T0 manda anotar

- **Enmienda a `docs/dependencias.md`**: la fila de `@supabase/storage-js` ya quedo enmendada por
  el leader. Decia «lo consume **un solo archivo**» y ahora declara **dos**, los dos detras de un
  puerto: el de `recetas` (bucket publico de imagenes) y el de `documentos` (bucket privado de
  PDFs con enlaces firmados). No es dependencia nueva y no hay cuatro checks que rehacer.
- **`documentos` en `BUSINESS_MODULES` de `guard-autorizacion-por-permiso.test.ts`**: **no** entra
  en esta ficha. Es tocar la guardia de otra, y `design.md > 12` lo dejo propuesto para que lo
  decida el humano en ficha propia.

## Archivos creados y modificados

(Se completa al cerrar cada tanda.)

## Mapa `R<n>` -> test

(Se completa en T13, con los 34 requisitos y sin ninguno huerfano.)

## Salida de los tests

(Se completa al cerrar cada tanda.)

## DIVERGENCIA QUE REQUIERE DECISION HUMANA — el plazo del enlace de SUBIDA

**No se resuelve por cuenta propia y no se ha cambiado nada por decidirlo.** Se escribe aqui
porque afecta a una decision cerrada (**D3**) y a un requisito (**R10**).

**Lo que dice el spec.** D3: «el enlace vive **15 minutos**». R10: «Cada enlace de subida DEBE
caducar 15 minutos despues de su emision; el sistema **NO DEBE emitir enlaces sin caducidad**».
`design.md > 3.1` modelo el puerto como `createSignedUpload(path, expiresInSeconds)`, dando por
supuesto que el plazo se le pasa al proveedor.

**Lo que hace de verdad la libreria aprobada.** Verificado en las declaraciones de tipos del
paquete **instalado** (`@supabase/storage-js@2.115.0`,
`node_modules/@supabase/storage-js/dist/index.d.cts`), no de memoria:

```ts
// linea 1076 — la de SUBIDA: NO admite plazo
createSignedUploadUrl(path: string, options?: { upsert: boolean }): Promise<...>

// linea 1302 — la de LECTURA: SI admite plazo
createSignedUrl(path: string, expiresIn: number, options?: {...}): Promise<...>
```

**La consecuencia, dicha sin adornos.** El plazo de los enlaces de **lectura** si lo fija este
modulo y R10 se cumple ahi. El de **subida** **no lo fija nuestro codigo**: la API no lo acepta.
El `expiresAt` que devuelve la emision es **el instante que declara el modulo** (emision + la
constante unica), **no una garantia del proveedor**, y el servicio puede seguir aceptando esa
firma despues de los quince minutos. El adaptador lo dice en su docblock en vez de fingir la
garantia.

**Por que no se eligio una salida aqui.** Las 18 decisiones cerradas son del humano, y cuando una
resulta imposible el encargo es **parar y preguntar**, no sustituirla. Las salidas concebibles
—aceptar el plazo que imponga el proveedor y corregir la redaccion de R10; mover el vencimiento a
donde si sea exigible; o descartar la subida directa— **cambian el alcance o el significado de D3**,
y ninguna es del implementer.

**Lo que esto NO invalida.** El resto de D3 y R10 se sostiene: el plazo vive en **una sola**
definicion del modulo, toda la tanda caduca a la vez y nada se firma sin permiso. Lo unico que no
se sostiene es que la caducidad de la **subida** sea algo que este sistema imponga.

## Limites y deudas declaradas

- **El E2E se difiere a QC-107**, con motivo: esta ficha no anade ninguna pantalla, pagina ni
  ruta navegable, asi que no hay recorrido que un test de navegador pueda visitar. Es **deuda con
  destinatario, no exencion** de `CHECKPOINTS.md > Calidad de codigo`.
- **`@napi-rs/canvas` en el runtime de Vercel: DESCONOCIDO.** Es un binario nativo y
  `design.md > 9` lo dejo sin resolver a proposito, sin rellenarlo con un «si». No bloquea: la
  conversion a **texto** no necesita el par nativo, asi que si el binario no cargara solo caeria
  la conversion a imagen. Destinatario **QC-111**, que es quien primero invoca la conversion.
- **Los limites del bucket (20 MB y `application/pdf`) no los verifica el gate.** Son opciones
  del bucket y no hay ni un script ni una migracion que cree buckets en este repositorio. Es
  trabajo de entorno.
