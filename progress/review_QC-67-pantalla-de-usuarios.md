# QC-67 — pantalla-de-usuarios · review

> Revisor: subagente `reviewer`. Fecha 2026-09-11. Worktree
> `.worktrees/QC-67-pantalla-de-usuarios`, rama `feature/QC-67-pantalla-de-usuarios`,
> diff contra `origin/dev` (6 commits de producto + 2 de spec/bitacora, 52 archivos).
>
> **Veredicto: APROBADO.** 0 bloqueantes, 6 menores.

## Checklist de `CHECKPOINTS.md`

### Especificacion
- [x] `requirements.md` con R1-R42 en EARS numerados, mas Alcance y las 14 decisiones cerradas por
      el humano. **Ninguna de las 14 se reabre ni se reescribe** en `design.md` ni en el codigo: se
      comprobo una por una contra lo implementado (ruta, doble permiso, accion unica de estado,
      estado almacenado, toast neutro, seis claves de `UserRow`, `USER_QUERYABLE` sin ampliar,
      actions por ruta exacta, dos controles de proteccion, cero librerias).
- [x] `design.md` con **nueve** alternativas descartadas y su porque (A-I).
- [x] `tasks.md`: T0-T16, los 45 pasos marcados `[x]`. Cada uno tiene correspondencia real en el
      diff; no hay `[x]` de cortesia (se verifico archivo por archivo).

### Trazabilidad (regla 4 de `CLAUDE.md`)
- [x] **R1-R42 mapeados, y los tests MUERDEN.** Se reviso el contenido, no el nombre:
  - R4 y R6-servidor: `usuarios-page.test.tsx` mockea **el proveedor de sesion**
    (`@/lib/composition`), no `requirePagePermission`: el corte se ejecuta de verdad,
    `assertPermission` incluido. Casos: sin sesion, redirige al login y `notFound` NO se llama; con
    `usuarios.modificar` pero sin `consultar`, 404 -que es exactamente la prueba de que `modificar`
    no implica `consultar`-; sin permisos, 404; con `consultar`, renderiza. Los dobles de
    `notFound` y `redirect` **lanzan**, asi que el corte no sigue ejecutandose y el test no mide
    otra cosa. Ancla anti-vacuidad que deriva los dos codigos del catalogo `PERMISSIONS`.
  - R6-cliente: `user-row-actions.test.tsx` + `user-table.test.tsx` + `usuarios-page.test.tsx`: sin
    `usuarios.modificar` no hay disparador de alta, ni acciones de fila, ni panel, ni dialogos en el
    arbol; con el, las cuatro escrituras, cada una abriendo sobre **ese** usuario.
  - R7: `user-list-section.test.tsx`: con `unauthorized` se pinta el error y **ni un solo dato**, y
    en positivo -con la consulta resuelta el dato SI se pinta-, que es lo que evita el falso verde.
  - R11: tres angulos. Se pintan exactamente las filas devueltas, no hay region que anuncie ninguna
    ausencia, y la fuente de la seccion no menciona al actor.
  - R35, R36, R37, R38, R8 y R29: `usuarios-convenciones.test.ts` afirma sobre la FUENTE y **cada
    detector tiene su caso anti-vacuidad**: falla ante el import profundo, ante el barrel del
    modulo, ante el `fetch` propio, ante los cuatro imports prohibidos en un modulo de cliente,
    ante cada dato de credencial y ante una segunda region de avisos. R37 se ata contra el **diff
    real** de la rama base, con un caso que demuestra que el diff no sale vacio.
  - R40 y R21: `usuarios-viewport.test.tsx`, 27 casos en 375 y 1280 px, con siete casos
    anti-vacuidad del detector de alto de ventana.
  - R41: verificado a mano. **Cero** `getByText`, `findByText` o `getByLabelText` en los 17
    archivos de test de la ficha; todo por `data-testid`, rol ARIA, atributo de datos o constante
    exportada.
- [x] `progress/impl_QC-67-pantalla-de-usuarios.md` contiene el mapa `R<n> -> test` con nombres
      reales de archivo.

### Calidad de codigo
- [x] Gate completo ya corrido por el leader: `== init OK ==`, 346 archivos, 4704 tests, 0 rojos
      nuevos. **No se repite** (regla del gate de `AGENTS.md`).
- [x] Verificacion propia del revisor: `pnpm exec vitest run tests/unit/configuracion-ui` da
      **41 archivos, 630 tests, 0 fallos** en este worktree. No se confio solo en la bitacora.
- [x] E2E: `e2e/usuarios.spec.ts`, los dos recorridos de R42, en Chromium y WebKit.
- [x] UI multiplataforma: seccion propia mas abajo.
- [x] Dependencias: `package.json` **no aparece en el diff**. Ninguna fila nueva en
      `docs/dependencias.md` es necesaria. `lucide-react` -el icono `users`- ya estaba instalado y
      aprobado.

### Datos y seguridad
- [x] **Ninguna tabla nueva, ninguna migracion, ningun cambio en `db/schema.prisma`**: `db/` no
      aparece en el diff. La seccion se cumple por vacio.
- [x] **Aislamiento por empresa**: esta pantalla no puede pedir otra empresa -no existe parametro
      por el que hacerlo-; el acotado lo aplica el puerto de QC-66, y por eso `companyId` no viaja
      ni en `UserRow` ni en `UserDetail`. El E2E lo comprueba en la direccion util: la cuenta creada
      nace con la empresa **del actor**, no del formulario.
- [x] **Permisos validados en el service**: intactos los de QC-66
      (`tests/unit/identity/usuarios/authorization.test.ts`). Esta ficha no los repite ni los
      sustituye.
- [x] Sin secretos, sin cliente de Supabase, sin acceso a datos fuera de las Server Actions.

### Modulos hexagonales y permisos
- [x] `lib/modules/identity/**` **no se abre** (atado por test contra el diff).
- [x] Actions importadas **por su ruta exacta**, nunca desde el barrel del modulo; los tipos y
      conjuntos cerrados (`UserRow`, `UserDetail`, `USER_QUERYABLE`, `USER_ACCOUNT_STATUSES`,
      `DOCUMENT_TYPE_CODES`, `RoleOption`, `assertPermission`) si por el contrato.
- [x] Ningun modulo de cliente importa el punto de composicion ni Prisma; los datos bajan por props.
- [x] Mutaciones por Server Actions, cero `fetch` a rutas propias, cero route handlers nuevos.

### Los dos cortes de permiso
- [x] **Borde (sesion)**: `USERS_ROUTE` entra en `PRIVATE_ROUTE_PREFIXES` en el mismo commit que la
      constante y que `page.tsx`; `guard-rutas-privadas-cubiertas` se pone roja en los dos sentidos
      y sigue verde.
- [x] **Dentro (permiso)**: `requirePagePermission('usuarios.consultar')` es la **primera**
      sentencia del cuerpo, antes de `canModify` y antes de resolver los parametros de la URL. Un
      test cuenta que haya **exactamente una** llamada y otro fija el orden.
- [x] **Ninguno sustituye al otro**, y el spec y los comentarios lo dicen con esas palabras.
- [x] **La UI oculta pero no autoriza**: `canModify` decide que se emite en el HTML; quien rechaza
      sigue siendo el caso de uso de QC-66 -`requirePermission` como primera linea de las seis
      operaciones, con sus tests propios intactos-. La mitad «el service rechaza» no se reimplementa
      aqui, que es lo correcto.
- [x] **Ningun dato de credencial llega al cliente**: lo impide el TIPO -`UserRow` seis claves,
      `UserDetail` quince, ninguna de credencial- y ademas un detector sobre la fuente con
      anti-vacuidad. El formulario envia **exactamente los nueve** nombres de negocio.
- [x] **El actor no se pinta**: R11 verificado por tres angulos en unidad y por construccion en el
      E2E -el recorrido crea a OTRA persona y busca a esa-.

### Multiplataforma
- [x] Sin `100vh`, `h-screen` ni `min-h-screen`: verificado ademas por busqueda directa sobre la
      carpeta de la ruta, cero coincidencias.
- [x] Sin `:hover` como unica via: **cero** clases `hover:` en la ruta; las tres acciones de fila
      estan siempre en el DOM y nunca dentro de un desplegable.
- [x] Objetivos tactiles `min-h-11 min-w-11` en botones, disparadores y selectores.
- [x] Campos con `text-base md:text-base`, o sea >= 16 px en TODOS los anchos, no solo en movil.
- [x] Desbordamiento horizontal **contenido en la tabla**, con un caso que comprueba que ningun
      ancestro desplaza.
- [x] Ninguna excepcion de escritorio declarada, y R40 prohibe declararla.

### Listas cerradas heredadas
Las nueve tocadas se **TENSAN**, ninguna se relaja: el ancla sube **y** se nombra la entrada nueva,
y la comparacion sigue siendo por igualdad exacta y en orden. `guard-pantallas-exigen-permiso` de
10 a 11, `guard-nav-permisos-declarados` de 7 a 8, `guard-identificador-de-request` de 13 a 14,
`app-sidebar` de 7 a 8, `private-layout-menu` de 7 a 8, `private-nav-configuracion` de 2 a 3,
`private-nav-unidades` de 2 a 3 -con un aserto NUEVO que fija que unidades sigue siendo el
segundo-, `recipe-route-contract`, `data-table-alcance` en sus dos anclas, y
`account-status-scope` con bloque rotulado propio y una entrada por archivo con su requisito.

## Las dos decisiones que el implementer pidio juzgar

**1. `canModify` por instancia centinela sobre `assertPermission`: SOLIDO, no es un rodeo.**
Se verifico el cuerpo de `lib/modules/identity/domain/require-permission.ts`: el predicado
`holdsPermission` es **privado a proposito** -su comentario dice que no se exporta ni se reexporta
porque quien autoriza debe pasar por una de las dos aserciones-, asi que hoy **no hay ninguna via
de leer la pertenencia sin lanzar**. Las opciones reales eran dos: escribir un
`permissions.includes(...)` en la pagina -una SEGUNDA definicion de «el actor tiene este permiso»,
libre de divergir de la de QC-74 R12- o consumir la unica que existe. El implementer eligio la
segunda: no introduce una tercera forma de decidir permisos, **delega en la primera**. Y es
correcto en los tres puntos donde estas cosas se rompen: `assertPermission` solo puede lanzar lo que
devuelve su `onDenied`; el `catch` compara **por identidad** y **relanza intacto** cualquier otro
error, de modo que un fallo real de sesion no se traga como «no puede»; y con actor nulo devuelve
`false`, que es la direccion segura. El centinela es una constante privada del modulo: nadie mas
puede lanzarlo. Lo respalda ademas un test que prohibe `.includes(`, `.some(`, `.indexOf(`,
`.find(` y `.filter(` en la fuente de la pagina. Coste real, anotado como menor 3: el idioma
«lanzar para preguntar» se copiara el dia que una segunda pantalla necesite un booleano de permiso;
ahi la respuesta no es repetirlo, sino que `identity` publique un predicado. Eso es su ficha, no
esta.

**2. Manejadores por props y una instancia de panel por pagina: NO rompe el precedente.**
Comparado con QC-45 / QC-22 y con `unit-row-actions.tsx`. Lo que el precedente garantizaba al
montar los dialogos dentro de la fila era que **cada apertura arranca limpia**; esa propiedad no se
pierde, se conserva por otra via y verificada: cada panel se monta **solo mientras esta abierto** y
el panel lateral lleva `key` por modo e identificador, asi que un rechazo anterior no reaparece. Lo
que se gana es material: una instancia en vez de 25. Los dos riesgos del patron estan cubiertos: el
disparador del alta vive en la tabla -no en un disparador propio del panel, que habria dejado el
modo de alta muerto- y la precarga lleva `forId`, de modo que **una respuesta tardia no puede
pintar la ficha de otra persona**. Nada de la tabla compartida se toco
(`data-table-intacta-usuarios.test.ts` lo ata contra el diff) y R6 se comprueba en la nueva
frontera: sin `usuarios.modificar` no se emite ni el disparador ni ningun panel. Aprobado tal cual.

## Hallazgos

Ninguno bloqueante.

1. **menor — `getUserAction` sin `.catch` en `user-sheet.tsx`.** El `void getUserAction(id).then(...)`
   cubre el estado de error que la action DEVUELVE, pero no el rechazo de la promesa:
   `currentActor()` queda **fuera** del `try` de la action, asi que un fallo al resolver la sesion
   dejaria el panel en «cargando» para siempre, con una rechazada sin manejar. Es el mismo patron
   que `order-form.tsx`, o sea deuda compartida y no regresion de esta ficha. Si se arregla, que sea
   en las dos.
2. **menor — la resolucion de sesion se paga dos veces por render** (`requirePagePermission` mas
   `canModifyUsers`), y cada una es una consulta a `users`. **No es peor que el precedente**:
   `unidades/page.tsx` hace dos `requirePagePermission`. La mejora real -una resolucion cacheada por
   peticion- es transversal y merece su propia ficha.
3. **menor — el idioma del centinela es copiable.** Ver el juicio de arriba: candidato a que
   `identity` publique un predicado de pertenencia en vez de que cada pantalla invente como
   preguntar sin lanzar. Ficha propia; **no se pide cambiar nada aqui**.
4. **menor — tercera copia del resolutor de Server Components asincronos en tests**
   (`presentation-page`, `unit-page`, `usuarios-page`, y de hecho tambien `usuarios-viewport`). Ya
   viene anotada como deuda con nombre en la bitacora, y R39 impedia extraerla sin ficha que lo
   respalde: correcto no haberla tocado.
5. **menor — la busqueda no vuelve a la pagina 1.** Comportamiento de la tabla compartida, que R9
   prohibe modificar. La consecuencia esta cubierta por R18 -«volver a la primera pagina» en el
   estado vacio- y el test refleja el comportamiento REAL en vez de uno deseado, que es lo honesto.
   Si se quiere el reset, es decision nueva y ficha nueva.
6. **menor — un aserto condicionado en `usuarios-page.test.tsx`**: el `if (lectura >= 0)` que quedo
   de T3, cuando la pagina aun no leia los parametros de la URL. Hoy la rama SI se ejecuta, y el
   aserto incondicional de la linea siguiente -el corte antes de `canModify`- cubre el orden igual;
   pero renombrar la lectura lo apagaria en silencio. Conviene volverlo incondicional en el proximo
   toque del archivo.

## Notas explicitamente excluidas del juicio (ajenas a esta ficha)

- `tests/unit/inventario/product-page.test.tsx`: flake de saturacion documentado por QC-58, pasa
  aislado y paso en el gate del leader. **No se cuenta como hallazgo**; su destino lo decide el
  humano.
- Las 5 entradas del baseline que ya pasan: deuda previa, ninguna de esta ficha.

## Veredicto

**OK — APROBADO.** No hay bloqueantes. Los seis menores son deuda con nombre o mejoras que
pertenecen a otras fichas; ninguno condiciona el merge.
