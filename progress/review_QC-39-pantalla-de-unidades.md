# QC-39 — pantalla-de-unidades · review

> Revisado en el worktree `.worktrees/QC-39-pantalla-de-unidades`, rama
> `feature/QC-39-pantalla-de-unidades`, diff `git diff origin/dev...HEAD` (63 archivos,
> +9994/-357). Fecha: 2026-09-08.
>
> **Veredicto: OK (APROBADO).** 0 bloqueantes, 8 menores.

## Qué se ha verificado, y cómo

No se repitió el gate completo (lo corrió el leader: `== init OK ==`, 3615 tests, único rojo en
baseline) ni el E2E (4 passed en Chromium y WebKit). Lo que sí se ejecutó aquí:

- `pnpm exec vitest run tests/unit/configuracion-ui tests/unit/unidades` -> **46 archivos, 650
  tests, todos verdes**.
- Los archivos de centinela ajeno tocados o afectados, en modo verbose, para leer los `skipped`
  uno a uno -> **90 passed, 5 skipped**, y los cinco saltos son ruidosos y dicen «este caso NO ha
  comprobado nada».
- Lectura del diff completo de `lib/`, de `app/(private)/configuracion/unidades/**`, de las cinco
  anclas tensadas y de los dos centinelas acotados, línea a línea.

## Checklist de CHECKPOINTS.md

### Especificación
- [x] `requirements.md` con 50 requisitos EARS numerados y 35 decisiones cerradas.
- [x] `design.md` con alternativas descartadas (el plan B de las sobrecargas, la alternativa J del
      estado en React, el `UnitRef` más gordo) y su porqué.
- [~] `tasks.md`: **46 de 48 casillas marcadas**. Las dos abiertas son T13 (comprobación manual en
      WebKit real, imposible para un agente, abierta a propósito) y T15 «./init.sh completo en
      verde», que el leader ya corrió verde y solo falta tildar. Ver menor 1.

### Trazabilidad
- [x] Los 50 `R<n>` mapean a test. **Verificado abriendo los archivos, no fiándose del mapa.**
      Ningún requisito se cierra «por inspección»: incluso R4 —que se cumple por tipos— tiene
      `consumidores-catalogo.test.tsx`, que renderiza los dos consumidores reales con datos de
      `UnitView` y además comprueba contra el diff que sus archivos no cambiaron. R39 lo cubren un
      caso de `unit-page.test.tsx` («su fuente no monta la región de avisos») y otro de
      `unit-sheet.test.tsx` («el panel no monta ninguna región de avisos propia»), no solo el
      heredado. Ninguno de los tests muestreados es vacío: todos llevan ancla anti-vacuidad y caso
      negativo del tipo «y la guardia MUERDE ante...».
- [x] `progress/impl_QC-39-pantalla-de-unidades.md` contiene el mapa `R<n> -> test` completo.

### Calidad de código
- [x] typecheck y lint verdes (leader e implementer; el gate completo cubre ambos).
- [x] Tests unitarios de la feature verdes (ejecutados por mí en el worktree).
- [x] E2E: la feature toca permisos, y `e2e/unidades.spec.ts` cubre los dos recorridos que R50
      pide (alta de unidad derivada con equivalencia armada, y 404 sin permisos), verde en Chromium
      y WebKit. Sin `force: true`; las credenciales son efímeras y generadas por `RUN_ID`.
- [x] Multiplataforma: `unidades-viewport.test.tsx` cubre a 375 px y a 1280 px el `100vh`, el
      `:hover` como única vía, los 44x44 px de todos los controles táctiles (lista, panel y
      diálogo) y los 16 px de los cuatro campos. **`design.md` no declara ninguna excepción y no
      la necesita.** El desbordamiento se resuelve dentro de la tabla (`overflow-x-auto` en el
      envoltorio, ningún ancestro que lo declare) y el documento no se mueve.
- [x] Dependencias: `package.json` **no aparece en el diff**, y hay dos guardias que lo afirman
      (la de la ruta compara entrada por entrada contra la rama base). Nada que anotar en
      `docs/dependencias.md`, y ninguna utilidad escrita a mano que duplique una librería del stack.

### Datos y seguridad
- [x] Ningún modelo nuevo en `db/schema.prisma` — el archivo no está en el diff, y
      `modulo-intacto.test.ts` lo vigila contra `git merge-base origin/dev HEAD`.
- [x] Aislamiento por empresa: la ficha no añade consultas. Las dos lecturas pasan por
      `listUnitsAction` -> `listUnits` -> `UnitRepository`, que ya llevan `UnitScope` en la firma,
      con sus tests de integración heredados de QC-76. La ampliación **mete `companyId` en el
      `select` pero NO lo deja salir**: `toUnitView` lo consume para derivar `isSystem` y no lo
      proyecta. `unit-view-projection.test.ts` afirma los seis campos de salida «y ninguno más».
- [x] Permisos en el service, no en la pantalla: `list-units.ts` exige `unidades.consultar` en su
      primera línea y las tres escrituras exigen `modificar`; la pantalla no repite nada (R14, R30,
      con guardia de fuente que cuenta cuántas veces se lee `isSystem` y dónde).
- [x] Sin secretos, sin RLS que tocar (ninguna tabla nueva), sin migraciones, sin webhooks.

### Módulos hexagonales
- [x] La ampliación se quedó **exactamente donde el spec la puso**: los seis archivos de
      `design.md > 1` y ni uno más. `unit-catalog-prisma.ts` (`findRefs`), los tres casos de uso de
      escritura, `unit-input.ts`, `errors.ts`, `actor.ts`, `unit-queryable.ts` y
      `convert-quantity.ts` están intactos, y `modulo-intacto.test.ts` lo comprueba contra la base
      de fusión (corregido a mitad de ficha para no atribuirle a QC-39 lo que trajo el merge).
- [x] `UnitView` es tipo **nuevo** que extiende `UnitRef`; `UnitRef` conserva sus tres campos
      (aserto explícito). `UNIT_QUERYABLE` no gana ni un campo ordenable ni un filtro (R6).
- [x] Las sobrecargas de `listUnitsAction` no abren nada más: la action no valida, no sanea y no
      traduce; la consulta viaja tal cual al caso de uso, con test que lo afirma («la consulta llega
      al caso de uso SIN TRADUCIR: el mismo objeto que recibió»).
- [x] `page.tsx` importa `requirePagePermission` por ruta profunda del adaptador driving de
      `identity`: es el patrón de las **diez** páginas privadas del repo, porque un módulo con
      `use server` no puede reexportarse desde el barrel. No es desviación de esta ficha.
- [x] Componentes de cliente por props; sin `fetch` a rutas del propio origen; sin route handlers.

### Verificación final
- [x] `./init.sh` completo en verde (leader).
- [x] Este archivo existe, con veredicto OK.
- [ ] Entrada en `progress/history.md` y desmontaje del worktree: pasos de cierre del leader (F2.5),
      pendientes por definición en el momento de esta revisión.

## Los tres puntos de contexto que el leader pidió mirar con lupa

### 1. Las tres listas cerradas ajenas: TENSADAS, no aflojadas — confirmado

- `tests/unit/shared/data-table-alcance.test.ts`: entra el quinto consumidor y **el ancla
  anti-falso-verde sube de `toBeGreaterThan(3)` a `toBeGreaterThan(4)`**; la carpeta se deriva de
  `UNITS_ROUTE` importada, no de un literal; el mensaje de fallo pasa a hablar de una «sexta»; el
  caso «recetas sigue SIN consumirlo» está intacto. La segunda lista (specs E2E que referencian
  `data-table`) pasa de cuatro entradas a cinco con `toEqual` exacto, en el mismo commit que crea
  el archivo, así que la lista no apunta ni un minuto a algo inexistente.
- `tests/unit/recetas-ui/recipe-route-contract.test.ts`: una fila más en un `toEqual` de igualdad
  exacta y ordenado. **La garantía de QC-64 R12 no se toca**: el patrón que detecta al asistente de
  lectura se sigue aplicando a todas las declaraciones del archivo y `UNITS_ROUTE` no encaja en él.
  Verificado ejecutando el archivo entero.
- `tests/unit/unidades/unidades-convenciones.test.ts` (las dos anclas de QC-38): ambas afirman
  **más** que antes. «Cero ítems de menú» pasa a «exactamente UNO, a `UNITS_ROUTE` importada, con
  `unidades.consultar` y en Configuración», **más** un caso nuevo que barre `lib/modules/unidades/**`
  buscando ocho formas de abrir navegación, con su caso «la guardia MUERDE» y su contraprueba de que
  no muerde a lo legítimo. «Cero specs E2E nuevos» pasa a `toEqual(['e2e/unidades.spec.ts'])` —cero
  también lo pone rojo, y dos también—, **más** que ese spec derive la URL de la constante y declare
  exactamente dos casos `test(...)`, con el contador probado contra fuentes sintéticas.
- Las cinco anclas restantes (`guard-pantallas-exigen-permiso` 9->10,
  `guard-nav-permisos-declarados` 6->7 nombrando el `testId` nuevo, `private-nav-configuracion` 1->2
  conservando que la sección es UNA y que presentaciones sigue **primero**, `app-sidebar` 6->7 y
  `private-layout-menu` 6->7, las dos con lista exacta y en orden) suben el número **y** nombran la
  entrada nueva. Ninguna degeneró en un «al menos N». `module-contract.test.ts` solo deduplica el
  barrido para que las sobrecargas no cuenten tres veces; el conjunto exacto de cuatro actions sigue
  igual.

### 2. Los dos centinelas de alcance ajenos acotados: correctos, y con una consecuencia

`tests/unit/navegacion/qc75-convenciones.test.ts` y `tests/unit/identity/account-status-scope.test.ts`.
Verificado con el diff línea a línea y ejecutándolos:

- **Ningún aserto cambió** en ninguno de los dos. Lo único que cambia es la precondición (señal
  conjuntiva: archivo central **más** carpeta de spec de la propia ficha) y, en el segundo, el
  rango (`dev...HEAD` -> `git merge-base origin/dev HEAD`), que además corrige un fallo real: el
  `dev` local iba 18 commits por detrás del remoto y el centinela le atribuía a la rama en curso
  trabajo ajeno ya mergeado.
- **No quedan verdes por vacuidad.** Los cinco casos afectados salen `skipped` con mensaje
  explícito «este caso NO ha comprobado nada». La doctrina «no puedo mirar es ROJO» de
  `account-status-scope` se conserva intacta: `archivosTocados()` sigue lanzando si el rango no
  resuelve, y el caso que lo prueba sigue corriendo y pasando.
- **Los casos de ÁRBOL siguen vivos y mordiendo en cualquier rama**: R19 («los archivos de
  producción que nombran el estado son EXACTAMENTE los cinco permitidos», con `toEqual` y ancla
  `length > 100`), el «ni el login, ni la sesión, ni el middleware, ni la UI lo nombran», el ancla
  positiva del esquema y la migración, y el «ningún driving nombra el estado». Lo mismo con los
  cuatro bloques de `qc75-convenciones` que no dependen del rango (catálogo de once permisos sin
  comodines, el layout privado que no dispara el 404, las rutas congeladas, las dependencias).
- **En la rama real de su propia ficha aplicarían igual y con la misma severidad**: en QC-75 y en
  QC-65 ambas señales están presentes por construcción, porque la carpeta de spec nace dentro de su
  propio rango. Consecuencia, que va como menor 4: esas ramas ya no existen y sus carpetas de spec
  están mergeadas en `dev`, así que en la práctica los casos de CAMBIO de ambos centinelas quedan
  inertes para siempre. Es el mal menor correcto frente a poner en rojo el gate de todas las ramas
  siguientes, pero es el tercer episodio del mismo patrón.

### 3. El hueco de R11: CONFIRMADO

**Es cierto: ningún test del repo compara el catálogo de permisos del código con el de la base.**
Comprobado, no supuesto:

- `permisos-unidades-coherentes.test.ts` (R11) mide `SEED_ROLE_PERMISSIONS`, la constante. Está bien
  hecho —deriva los códigos de `PERMISSIONS`, lleva dos anclas anti-vacuidad y cuatro casos
  sintéticos donde la regla debe y no debe disparar—, pero mide el código.
- El único test que toca la tabla `permissions` en Postgres real es
  `tests/integration/identity/identity-seed.int.test.ts` (caso 10). Y **empieza vaciando la tabla**
  (`resetIdentityToEmptyState`, `expect(count).toBe(0)`) dentro de una transacción que se revierte:
  mide que la **función de seed** produce el catálogo, nunca el estado real de la base compartida.
- Las guardias `guard-permisos-sembrados` y `guard-permisos-no-administrables` son de fuente.

O sea: exactamente la grieta que produjo el 404 real en la primera corrida del E2E —base con diez
permisos, código con once— es indetectable por el gate. **No es de esta ficha cerrarlo** (QC-39 es
`frontend`, no toca `db/` ni el seed, y R47 se lo prohíbe). Va como menor 3, con recomendación de
ficha propia.

## Hallazgos

### BLOQUEANTES

Ninguno.

### Menores

1. **menor — `tasks.md` con dos casillas sin marcar.** T13 (comprobación manual en un WebKit real)
   está abierta a propósito y no la puede cerrar un agente; T15 «./init.sh completo en verde» ya se
   cumplió y solo falta tildarla. `CHECKPOINTS.md > Especificación` pide todas en `[x]`: al cerrar,
   tildar T15 y anotar T13 en `progress/current.md > Deudas y cosas abiertas` con su razón. Lo que
   no vale es dejarla ahí en silencio.

2. **menor — `tests/unit/identity/account-status-scope.test.ts` se reescribió con finales de línea
   CRLF.** El diff muestra 605 líneas cambiadas cuando el cambio real son 101 (`--ignore-all-space`
   lo revela). No hay `.gitattributes` en el repo y es el único archivo del muestreo con CRLF. Sin
   efecto funcional, pero vuelve ilegible el diff de justo el archivo que había que revisar con
   lupa. Recomendable normalizar a LF.

3. **menor (hueco de verificación ajeno, confirmado) — nadie compara el catálogo de permisos del
   código con el de la base.** Ver el punto 3 de arriba. R11 puede estar verde con la grieta abierta
   en la base de pruebas, y eso ya produjo un 404 real en el E2E. Fuera del alcance de QC-39;
   **merece ficha** (`identity`/`backend`): un test que compare `PERMISSIONS` y
   `SEED_ROLE_PERMISSIONS` contra las filas reales de `permissions` y `role_permissions` **sin
   resembrar antes**, o un paso de despliegue que garantice el seed.

4. **menor (deuda de arnés, no de la ficha) — los dos centinelas acotados quedan permanentemente
   inertes en sus casos de cambio.** Su señal conjuntiva incluye la carpeta de spec de su propia
   ficha, que ya vive en `dev` y no volverá a aparecer en un rango `merge-base(origin/dev)...HEAD`.
   La decisión es la correcta —lo contrario es un rojo ajeno en toda rama siguiente— y los casos de
   árbol siguen vivos, pero es el **tercer episodio** del mismo patrón (QC-38, QC-75, y aquí dos).
   Suscribo la recomendación del implementer: esto pide una **regla del arnés** vía `/afinar-regla`
   —del tipo «un centinela de alcance de ficha se autolimita por una señal que solo existe en su
   rango, y cuando la señal desaparece se retira o se convierte en guardia de árbol»—, no un parche
   por ficha.

5. **menor — R47 no enumera esos dos archivos ajenos.** R47 autoriza tocar la ruta y su prefijo, la
   navegación, los archivos del módulo que R1-R6 acotan, y los tests heredados de lista CERRADA cuyo
   punto de extensión sea darse de alta en ellos. `qc75-convenciones.test.ts` y
   `account-status-scope.test.ts` no son ninguna de esas cosas: son centinelas de alcance que mordían
   por autolimitación defectuosa. La intervención está justificada, documentada en la bitácora y
   verificada como endurecimiento puro, así que **no la considero bloqueante**; pero R47 —o la regla
   del menor 4— debería contemplar el caso explícitamente en vez de dejarlo al criterio del
   implementer de turno.

6. **menor — `private-layout-menu.test.tsx`, caso «sin ningún permiso»:** su lista de `testId` que
   no deben estar no nombra `nav-unidades`, mientras que el caso hermano «con solo
   `inventario.consultar`» sí lo hace. El impacto práctico es nulo porque ese mismo caso afirma
   `queryAllByRole('link')` con longitud 0 sobre el landmark de navegación, que ya cubre cualquier
   ítem. El implementer lo dejó anotado a propósito por ser uno de los dos rojos de baseline;
   conviene recogerlo cuando se cierre esa deuda de `dev`.

7. **menor — un enunciado heredado que ya no describe la realidad.**
   `tests/unit/unidades/unidades-convenciones.test.ts` conserva el caso «no existe ninguna pantalla
   de unidades bajo `app/(private)/`», que solo mira `app/(private)/unidades` y `app/(private)/units`.
   La pantalla ahora existe, en `app/(private)/configuracion/unidades`. No es un falso verde
   peligroso —los otros casos del bloque fijan la forma exacta de la pantalla real— pero el título
   miente y convendría relevarlo como se relevaron sus dos hermanos.

8. **menor (estilo) — `unit-actions.ts`:**
   `return isUnitPage(data) ? { status: 'success', data } : { status: 'success', data };` tiene las
   dos ramas idénticas. Sirve para estrechar la unión sin una aserción de tipo y está explicado en
   comentario, pero se lee como un error a primera vista.

## La pregunta del leader: ¿limpiar las dos entradas del baseline entra en esta ficha?

**No, y no es solo alcance: borrarlas ahora rompería el gate.** Las dos entradas
(`tests/unit/recetas-ui/recipe-route-contract.test.ts` y `tests/unit/recetas/module-contract.test.ts`)
fallan **solo cuando la suite se corre desde `dev`**, donde su caso de guardia de diff ve un rango
vacío o ajeno; en una rama de feature pasan, que es justo la situación que el gate está observando
ahora. La salida limpia es la que el propio `tests/baseline-rojos.json` ya deja escrita: que esos
casos distingan «no hay rango» de «el rango trae cosas», saltándose lo primero de forma explícita y
ruidosa, y **entonces** borrar la entrada. Eso es trabajo sobre dos archivos ajenos que R47 no
autoriza a esta ficha, y encaja de lleno con la regla de arnés del menor 4. Recomendación: **ficha
propia**, junto con el menor 4.

## Veredicto

**OK.** 0 bloqueantes, 8 menores. La trazabilidad es real y verificada requisito por requisito, la
ampliación del módulo se quedó exactamente donde el spec la autorizó y no abrió nada más, las cinco
anclas heredadas y las tres listas cerradas se tensaron sin aflojar ninguna garantía ajena, y los
dos centinelas acotados conservan intactos todos sus asertos y todos sus casos de árbol. Los menores
3 y 4 son deudas del repo que esta ficha destapó y documentó bien, no defectos suyos.
