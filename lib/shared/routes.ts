export const DASHBOARD_ROUTE = '/dashboard';

export const LOGIN_ROUTE = '/login';

/**
 * Nombre del parametro que marca «este login viene de un corte de sesion» (QC-78 R29, R30).
 *
 * Existe para romper un BUCLE, no para informar de nada. El servidor corta la sesion consultando
 * la base; el borde no puede consultarla (QC-9 R4, QC-75 R18) y sigue viendo la cookie firmada y
 * viva, asi que devolvia al usuario a la zona privada y el layout lo devolvia al login, sin fin.
 * Con la marca, la regla 3 de `route-access.ts` no dispara y la navegacion termina en el login.
 */
export const SESSION_ENDED_PARAM = 'sesion';

/**
 * Destino al que redirige el servidor cuando la sesion se corto. **Un solo texto para los TRES
 * cortes** —baja logica (QC-8 R11), empresa no viva (QC-48 R15) y estado de cuenta (QC-78 R20)—:
 * la marca es OPACA y la URL no dice por que (R30 a). Ni codigo, ni motivo, ni estado.
 *
 * El valor es `fin` y no `cuenta-bloqueada` ni `inactivo` a proposito: cualquiera de esos
 * convertiria la barra de direcciones en el oraculo que R3 lleva toda la ficha evitando.
 *
 * La pantalla de login no lo lee: hoy solo mira el destino de vuelta e ignora el resto de la
 * cadena de consulta, asi que se renderiza EXACTAMENTE igual con marca y sin ella (R30 a).
 */
export const LOGIN_ROUTE_SESSION_ENDED = `${LOGIN_ROUTE}?${SESSION_ENDED_PARAM}=fin`;

/**
 * Pantalla de productos del catalogo (QC-22, R2).
 *
 * Vive aqui y no en `navigation/private-nav.ts` —donde nacio como placeholder— porque el
 * middleware y la regla ruta->rol de `identity` la necesitan y **no pueden depender de la
 * navegacion**, que arrastra etiquetas, iconos y agrupacion de UI. `private-nav.ts` ya importa de
 * este archivo, asi que la flecha no se invierte ni aparece un ciclo.
 */
export const INVENTORY_ROUTE = '/inventario';

/**
 * Pantalla de recetas de produccion (QC-26, R3).
 *
 * Vive aqui y no en `navigation/private-nav.ts` —donde nacio como placeholder— porque el
 * middleware y la regla ruta->rol de `identity` la necesitan y **no pueden depender de la
 * navegacion**, que arrastra etiquetas, iconos y agrupacion de UI. `private-nav.ts` ya importa de
 * este archivo, asi que la flecha no se invierte ni aparece un ciclo.
 */
export const FORMULAS_ROUTE = '/produccion/formulas';

/** Ruta de alta de una receta nueva, derivada de `FORMULAS_ROUTE` (QC-26, R4). */
export const NEW_RECIPE_ROUTE = `${FORMULAS_ROUTE}/nueva`;

/** Ruta de edicion de una receta existente, derivada de `FORMULAS_ROUTE` (QC-26, R5, R6). */
export function recipeEditRoute(id: string): string {
  return `${FORMULAS_ROUTE}/${id}`;
}

/**
 * Pantalla de proveedores (QC-44, R2).
 *
 * Vive aqui y no en `navigation/private-nav.ts` porque el middleware y la regla ruta->rol de
 * `identity` la necesitan y **no pueden depender de la navegacion**, que arrastra etiquetas,
 * iconos y agrupacion de UI. `private-nav.ts` ya importa de este archivo, asi que la flecha no se
 * invierte ni aparece un ciclo. A diferencia de `INVENTORY_ROUTE` y `FORMULAS_ROUTE`, esta
 * constante **nace** aqui —no se muda desde la navegacion—, asi que no necesita reexport de
 * compatibilidad: nadie la importaba antes de `private-nav`.
 */
export const SUPPLIERS_ROUTE = '/proveedores';

/**
 * Ruta de la pagina de detalle de un proveedor, derivada de `SUPPLIERS_ROUTE` (QC-44, R3).
 *
 * Mismo patron que `recipeEditRoute`: ningun archivo de producto incrusta la URL del detalle como
 * literal, se construye siempre aqui.
 */
export function supplierDetailRoute(id: string): string {
  return `${SUPPLIERS_ROUTE}/${id}`;
}

/**
 * Pantalla de pedidos (QC-35, R2).
 *
 * Vive aqui y no en `navigation/private-nav.ts` porque el middleware y la regla ruta->rol de
 * `identity` la necesitan y **no pueden depender de la navegacion**, que arrastra etiquetas,
 * iconos y agrupacion de UI. `private-nav.ts` ya importa de este archivo, asi que la flecha no se
 * invierte ni aparece un ciclo. Como `SUPPLIERS_ROUTE`, esta constante **nace** aqui —no se muda
 * desde la navegacion—, asi que no necesita reexport de compatibilidad: nadie la importaba antes.
 *
 * **No hay helper de ruta de detalle**: no hay pagina de detalle de un pedido (R1). La lista, el
 * alta, la edicion, la cancelacion y el borrado ocurren todos en esta misma ruta.
 */
export const ORDERS_ROUTE = '/pedidos';

/**
 * Pantalla del catalogo de presentaciones (QC-45, R2).
 *
 * Vive aqui y no en `navigation/private-nav.ts` porque el middleware y la regla ruta->rol de
 * `identity` la necesitan y **no pueden depender de la navegacion**, que arrastra etiquetas,
 * iconos y agrupacion de UI. `private-nav.ts` ya importa de este archivo, asi que la flecha no se
 * invierte ni aparece un ciclo. Como `SUPPLIERS_ROUTE` y `ORDERS_ROUTE`, esta constante **nace**
 * aqui —no se muda desde la navegacion—, asi que no necesita reexport de compatibilidad: nadie la
 * importaba antes.
 *
 * **No se declara `CONFIGURATION_ROUTE = '/configuracion'`** (`design.md > 2`): no hay pantalla en
 * esa URL, visitarla daria 404, y una constante de ruta que no lleva a ninguna parte es
 * exactamente la deuda de los cinco items de QC-11 que no se quiere repetir. El segmento
 * `configuracion` aparece **una sola vez**, dentro de esta constante; cuando llegue QC-39
 * declarara su hermana `/configuracion/unidades`, igual que `FORMULAS_ROUTE` convive hoy con
 * `/produccion` sin que exista una constante para el tramo intermedio.
 */
export const PRESENTATIONS_ROUTE = '/configuracion/presentaciones';

/**
 * Pantalla del catalogo de unidades de medida (QC-39, R8). La hermana que el comentario de
 * `PRESENTATIONS_ROUTE` ya anunciaba: el segmento `configuracion` sigue sin tener constante
 * propia porque sigue sin haber pantalla en esa URL.
 *
 * **Ya esta en `PRIVATE_ROUTE_PREFIXES`** (R13), donde entro junto con
 * `app/(private)/configuracion/unidades/page.tsx`: `guard-rutas-privadas-cubiertas` compara la
 * lista de prefijos con las carpetas que tienen `page.tsx` bajo `app/(private)/` y pone el gate en
 * rojo en los DOS sentidos —prefijo sin pantalla y pantalla sin prefijo—, asi que las dos cosas
 * tenian que entrar juntas. Esa fila garantiza **sesion, no autorizacion**: quien decide si esta
 * pantalla se ve son los dos `requirePagePermission` de su `page.tsx` (R12), y ninguna de las dos
 * garantias sustituye a la otra.
 *
 * Ademas, `unitListHref` deriva de esta constante (R8): la URL no se escribe como literal en
 * ningun archivo de producto.
 */
export const UNITS_ROUTE = '/configuracion/unidades';

/**
 * Pantalla de administracion de usuarios (QC-67, R1). La TERCERA hermana del segmento
 * `configuracion`, junto a `PRESENTATIONS_ROUTE` y `UNITS_ROUTE`: el tramo intermedio
 * `/configuracion` sigue **sin constante propia** porque sigue sin haber pantalla en esa URL, y
 * una constante que no lleva a ninguna parte seria la deuda de los cinco items de QC-11.
 *
 * **Entra junto con su fila de `PRIVATE_ROUTE_PREFIXES`** (R5) y con
 * `app/(private)/configuracion/usuarios/page.tsx`: `guard-rutas-privadas-cubiertas` compara la
 * lista de prefijos con las carpetas que tienen `page.tsx` bajo `app/(private)/` y se pone roja en
 * los DOS sentidos —prefijo sin pantalla y pantalla sin prefijo—, asi que las tres cosas tenian
 * que llegar a la vez.
 *
 * Esa fila garantiza **sesion, no autorizacion**: quien decide si esta pantalla se ve es el
 * `requirePagePermission('usuarios.consultar')` de su `page.tsx` (R4), y ninguna de las dos
 * garantias sustituye a la otra.
 *
 * Ademas, `userListHref` derivara de esta constante (R1): la URL no se escribe como literal en
 * ningun archivo de producto.
 */
export const USERS_ROUTE = '/configuracion/usuarios';

/**
 * Pagina PUBLICA donde una persona establece su contrasena la primera vez, a la que se llega
 * desde el enlace del correo (QC-79, R17).
 *
 * **No entra en `PRIVATE_ROUTE_PREFIXES`, y es a proposito** (`design.md > 5.1`): se sirve **sin
 * sesion**, y la regla 1 de `route-access.ts` deja pasar sin redirigir todo lo que no es privado
 * ni el login, asi que el middleware **no se toca**. Meterla en la lista de prefijos privados
 * mandaria al login a la unica persona que todavia no puede entrar.
 *
 * Vive aqui, como `LOGIN_ROUTE`, porque la escriben tres sitios que no se conocen entre si —la
 * pagina, y los **dos** transportes de correo que arman la URL del enlace— y ninguno de ellos
 * debe incrustar la URL como literal. Antes de T19 era una constante local duplicada en los tres.
 */
export const CREDENTIAL_SETUP_ROUTE = '/establecer-contrasena';

/**
 * Camino de la pagina de arriba **con el secreto del enlace en el CAMINO**, nunca en la cadena de
 * consulta (QC-79, `design.md > 4.4`): en el camino no acaba como un parametro mas en los
 * registros de acceso de los intermediarios, y el secreto va en base64url, que no necesita
 * escapado.
 *
 * Mismo patron que `recipeEditRoute` y `supplierDetailRoute`: ningun archivo de producto compone
 * esta URL a mano. Devuelve un camino **relativo**; quien necesite la URL absoluta —el correo— le
 * antepone la base que le da su configuracion (R28).
 */
export function credentialSetupRoute(secret: string): string {
  return `${CREDENTIAL_SETUP_ROUTE}/${secret}`;
}

/** Ruta aun inexistente (S6): hoy devuelve 404 y el slug definitivo esta sin confirmar. */
export const FORGOT_PASSWORD_ROUTE = '/recuperar-contrasena';

/**
 * Pantalla de pedidos asignados a la persona que ha iniciado sesion (QC-88, R1).
 *
 * Vive aqui y no en `navigation/private-nav.ts` porque el middleware y la regla ruta->rol de
 * `identity` la necesitan y **no pueden depender de la navegacion**, que arrastra etiquetas,
 * iconos y agrupacion de UI. `private-nav.ts` ya importa de este archivo, asi que la flecha no se
 * invierte ni aparece un ciclo. Como `SUPPLIERS_ROUTE` y `ORDERS_ROUTE`, esta constante **nace**
 * aqui —no se muda desde la navegacion—, asi que no necesita reexport de compatibilidad: nadie la
 * importaba antes.
 *
 * Es una pantalla propia del Operador: la lista de los pedidos donde figura como responsable
 * (`design.md > 7.1`). **No hay pagina de detalle de un pedido dentro de esta ruta**: el helper
 * `assignedOrderRoute` de abajo apunta a QC-63, que monta su propia ruta de detalle cuando exista.
 */
export const ASSIGNED_ORDERS_ROUTE = '/asignacion';

/**
 * Ruta de detalle de un pedido asignado, derivada de `ASSIGNED_ORDERS_ROUTE` (QC-88, R21, R22).
 *
 * Mismo patron que `recipeEditRoute` y `supplierDetailRoute`: ningun archivo de producto incrusta
 * esta URL como literal, se construye siempre aqui. **Hoy responde 404**: QC-63, la pantalla que
 * la serviria, no existe todavia — mismo estado que `FORMULAS_ROUTE` antes de QC-26, o
 * `FORGOT_PASSWORD_ROUTE` hoy.
 *
 * **No anade una fila nueva a `PRIVATE_ROUTE_PREFIXES`**: la guardia
 * `guard-rutas-privadas-cubiertas` y el middleware comparan por segmentos
 * (`route === prefix || route.startsWith(prefix + '/')`), asi que la fila de `ASSIGNED_ORDERS_ROUTE`
 * de mas abajo ya cubre `/asignacion/<id>`. Tampoco anade ninguna carpeta bajo `app/`: eso lo hace
 * QC-63 cuando llegue.
 */
export function assignedOrderRoute(id: string): string {
  return `${ASSIGNED_ORDERS_ROUTE}/${id}`;
}

/**
 * Prefijos de URL que cuelgan de `app/(private)/` y, por tanto, exigen sesion valida (R1).
 *
 * `(private)` es un route group: **no aparece en la URL**, asi que el middleware no puede
 * deducir del camino que una ruta es privada y hay que declararlo. Para que la declaracion no se
 * quede atras del arbol de archivos, `tests/guards/guard-rutas-privadas-cubiertas.test.ts`
 * compara esta lista con las carpetas que tienen `page.tsx` bajo `app/(private)/`: una pantalla
 * nueva sin prefijo que la cubra pone el gate en rojo con su nombre, y un prefijo que ya no
 * corresponde a ninguna pantalla, tambien.
 */
export const PRIVATE_ROUTE_PREFIXES = [
  DASHBOARD_ROUTE,
  INVENTORY_ROUTE,
  FORMULAS_ROUTE,
  // QC-44 R5: UNA sola entrada cubre la lista y el detalle. La guardia y el middleware comparan
  // por segmentos (`route === prefix || route.startsWith(prefix + '/')`), asi que
  // `/proveedores/<id>` ya cae dentro; una segunda fila para el detalle seria redundante.
  SUPPLIERS_ROUTE,
  // QC-35 R4: la pantalla de pedidos. `(private)` no aparece en la URL, asi que sin esta fila
  // `/pedidos` se serviria SIN sesion. Una sola entrada: no hay pagina de detalle (R1).
  ORDERS_ROUTE,
  // QC-45 R5: la pantalla de presentaciones. Sin esta fila, `(private)` no aparece en la URL y
  // `/configuracion/presentaciones` se serviria SIN sesion. Una sola entrada: no hay pagina de
  // detalle, y la comparacion por segmentos ya cubriria cualquier subcamino.
  PRESENTATIONS_ROUTE,
  // QC-39 R13: la pantalla de unidades. Sin esta fila, `(private)` no aparece en la URL y
  // `/configuracion/unidades` se serviria SIN sesion. Una sola entrada: no hay pagina de detalle,
  // y la comparacion por segmentos ya cubriria cualquier subcamino. Cubre SESION; el permiso lo
  // exige la propia pantalla (R12).
  UNITS_ROUTE,
  // QC-67 R5: la pantalla de usuarios. Sin esta fila, `(private)` no aparece en la URL y
  // `/configuracion/usuarios` se serviria SIN sesion. Una sola entrada: no hay pagina de detalle
  // —el alta y la edicion ocurren en un panel lateral sobre la propia lista— y la comparacion por
  // segmentos ya cubriria cualquier subcamino. Cubre SESION; el permiso `usuarios.consultar` lo
  // exige la propia pantalla (R4).
  USERS_ROUTE,
  // QC-88 R2: la pantalla de pedidos asignados. Sin esta fila, `(private)` no aparece en la URL y
  // `/asignacion` se serviria SIN sesion. Una sola entrada: no hay pagina de detalle dentro de esta
  // ruta (el detalle lo monta QC-63 en su propia ruta), y la comparacion por segmentos ya cubriria
  // cualquier subcamino si algun dia lo hubiera.
  ASSIGNED_ORDERS_ROUTE,
] as const;
