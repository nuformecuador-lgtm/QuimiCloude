import {
  ASSIGNED_ORDERS_ROUTE,
  DASHBOARD_ROUTE,
  FORMULAS_ROUTE,
  INVENTORY_ROUTE,
  ORDERS_ROUTE,
  PRESENTATIONS_ROUTE,
  SUPPLIERS_ROUTE,
  UNITS_ROUTE,
  USERS_ROUTE,
} from '../routes';

/**
 * Navegacion de la zona privada (`design.md > 4.3`).
 *
 * **Los items y sus rutas nacieron como datos de relleno (placeholder, D2), no dominio.** Salvo
 * el dashboard —que crea la feature 9— e `INVENTORY_ROUTE` —que estrena QC-22—, la unica ruta de
 * placeholder que queda es `FORMULAS_ROUTE`: visitarla hoy da **404, y eso es lo esperado**,
 * mismo patron que `FORGOT_PASSWORD_ROUTE` de la feature 7, hasta que QC-26 la convierta en real.
 * Las demas rutas de relleno (notificaciones, compras, lotes) se retiraron en QC-13 por no tener
 * feature que las respalde. La feature que traiga cada modulo del ERP sustituye su item y su
 * constante de ruta; nadie debe leer esta tabla como definicion del dominio quimico.
 *
 * `DASHBOARD_ROUTE`, `INVENTORY_ROUTE` y `FORMULAS_ROUTE` se **reutilizan** de
 * `lib/shared/routes.ts` en vez de redeclararlas: dos constantes con la misma ruta es como se
 * acaba con `/dashboard` y `/panel` conviviendo. `INVENTORY_ROUTE` se mudo alli en QC-22 y
 * `FORMULAS_ROUTE` en QC-26 porque el middleware y la regla ruta->rol las necesitan y no pueden
 * depender de este archivo de navegacion.
 *
 * Los tests iteran `PRIVATE_NAV_ITEMS` y afirman sobre estas constantes, nunca sobre el
 * literal del copy.
 *
 * **Este archivo es la unica fuente de la navegacion.** `AppSidebar` no decide nada: recorre
 * este array y lo dibuja. Anadir un item, cambiarle el icono o moverlo de seccion se hace
 * aqui y en ningun otro sitio; el componente no se toca.
 */

/**
 * Reexport por compatibilidad: `INVENTORY_ROUTE` **vive en `lib/shared/routes.ts`**, no aqui.
 *
 * Nacio en este archivo como placeholder y quien ya la importaba de `private-nav` sigue
 * funcionando sin tocarse. Codigo nuevo debe importarla de `lib/shared/routes.ts`.
 */
export { INVENTORY_ROUTE };

/**
 * Reexport por compatibilidad: `FORMULAS_ROUTE` **vive en `lib/shared/routes.ts`**, no aqui.
 *
 * Nacio en este archivo como placeholder y quien ya la importaba de `private-nav` sigue
 * funcionando sin tocarse. Codigo nuevo debe importarla de `lib/shared/routes.ts`, que es de
 * donde la leen el middleware y la regla ruta->rol: esos NO pueden depender de la navegacion,
 * que arrastra etiquetas, iconos y agrupacion de UI. Mismo criterio que `INVENTORY_ROUTE`.
 */
export { FORMULAS_ROUTE };

/** Etiqueta del sidebar para la pantalla de fórmulas (QC-26, R3). */
export const RECIPES_LABEL = 'Fórmulas';

/**
 * Etiqueta del sidebar para la pantalla de proveedores (QC-44, R4).
 *
 * `SUPPLIERS_ROUTE` **no se reexporta** desde aqui: nacio en `lib/shared/routes.ts` y no hay
 * codigo previo que la importara de este archivo, asi que no hay compatibilidad que sostener.
 */
export const SUPPLIERS_LABEL = 'Proveedores';

/**
 * Etiqueta del sidebar para la pantalla de pedidos (QC-35, R3).
 *
 * `ORDERS_ROUTE` **no se reexporta** desde aqui: nace en `lib/shared/routes.ts` y no hay codigo
 * previo que la importara de este archivo, asi que no hay compatibilidad que sostener. Mismo
 * criterio que `SUPPLIERS_LABEL`.
 */
export const ORDERS_LABEL = 'Pedidos';

/**
 * Etiqueta del sidebar para la pantalla de presentaciones (QC-45, R3).
 *
 * `PRESENTATIONS_ROUTE` **no se reexporta** desde aqui: nace en `lib/shared/routes.ts` y no hay
 * codigo previo que la importara de este archivo, asi que no hay compatibilidad que sostener.
 * Mismo criterio que `SUPPLIERS_LABEL` y `ORDERS_LABEL`.
 */
export const PRESENTATIONS_LABEL = 'Presentaciones';

/**
 * Etiqueta del sidebar para la pantalla de unidades de medida (QC-39, R9).
 *
 * `UNITS_ROUTE` **no se reexporta** desde aqui: nace en `lib/shared/routes.ts` y no hay codigo
 * previo que la importara de este archivo, asi que no hay compatibilidad que sostener. Mismo
 * criterio que `SUPPLIERS_LABEL`, `ORDERS_LABEL` y `PRESENTATIONS_LABEL`.
 *
 * **Es la UNICA copia de este texto** y por eso vive aqui: el titulo y la metadata de la pantalla
 * salen de esta misma constante —`app/(private)/configuracion/unidades/components/unit-labels.ts`
 * la reexporta para sus consumidores de la ruta—, porque el nombre de la pantalla y el de su
 * enlace son el mismo dato.
 */
export const UNITS_LABEL = 'Unidades';

/**
 * Etiqueta del sidebar para la pantalla de administracion de usuarios (QC-67, R2).
 *
 * `USERS_ROUTE` **no se reexporta** desde aqui: nace en `lib/shared/routes.ts` y no hay codigo
 * previo que la importara de este archivo, asi que no hay compatibilidad que sostener. Mismo
 * criterio que `SUPPLIERS_LABEL`, `ORDERS_LABEL`, `PRESENTATIONS_LABEL` y `UNITS_LABEL`.
 */
export const USERS_LABEL = 'Usuarios';

/** Lleva tilde a proposito: es el texto que se lee en pantalla, no el segmento de la URL. */
export const ASSIGNED_ORDERS_LABEL = 'Asignación';

/** Nombre accesible del landmark de navegacion de la barra lateral (R3). */
export const PRIVATE_NAV_LABEL = 'Navegación principal';

/** Marca larga, modo expandido (R4, D7). */
export const BRAND_LABEL = 'QuimiCloude';

/** Marca corta, modo icono (R24, D7). */
export const BRAND_SHORT_LABEL = 'QC';

/**
 * Bajada de la marca, bajo el nombre y solo en modo expandido.
 *
 * **Es texto quemado a proposito** (decision humana del 2026-09-02): no hay identidad visual
 * definida para este producto y no la decide este archivo. Cuando la haya, esto y el simbolo
 * de `AppSidebar` salen de donde diga esa ficha.
 */
export const BRAND_TAGLINE = 'ERP Químico';

/** Titulos de las secciones en las que se agrupan los items de nivel superior. */
export const NAV_SECTION_OPERATION = 'Operación';
export const NAV_SECTION_CHAIN = 'Cadena';
/**
 * Seccion de configuracion del producto (QC-45, R3). Nacio con **un solo item**,
 * «Presentaciones», y QC-39 le anadio su hermana «Unidades» (QC-39 R9): la seccion NO se crea de
 * nuevo, no se renombra y no se reordena su primer item.
 *
 * «Usuarios» ya NO vive aqui: nacio en esta seccion con QC-67 y paso a `NAV_SECTION_OPERATION`
 * por decision humana del 2026-09-21 (usuarios es operacion, no configuracion). La seccion se
 * queda con sus dos items originales, Presentaciones y Unidades.
 */
export const NAV_SECTION_CONFIGURATION = 'Configuración';

/**
 * Nombre del icono de un item. **Es una cadena y no el componente a proposito.**
 *
 * `PRIVATE_NAV_ITEMS` lo consume `app/(private)/layout.tsx`, que es Server Component, y se lo
 * pasa por props a `AppSidebar`, que es cliente. Todo lo que cruza esa frontera tiene que ser
 * serializable, y un icono de `lucide-react` no lo es: es un objeto con `$$typeof` y `render`.
 * Pasarlo entero revienta en ejecucion con «Only plain objects can be passed to Client
 * Components from Server Components», y **ningun test unitario lo ve**, porque en jsdom no
 * existe esa frontera y todo se renderiza en cliente.
 *
 * El componente lo resuelve con el mapa de `nav-icons.ts`.
 */
export type NavIconName =
  | 'layout-dashboard'
  | 'package'
  | 'bell'
  | 'shopping-cart'
  | 'clipboard-list'
  | 'truck'
  | 'factory'
  | 'flask-conical'
  | 'boxes'
  // QC-67 R2: el item de usuarios. Es el UNICO nombre que esta ficha anade, y se anade porque
  // ninguno de los ocho anteriores habla de personas: reutilizar `package`, `boxes` o
  // `flask-conical` para «Usuarios» seria un icono que miente, y ademas `boxes` y `flask-conical`
  // ya estan tomados dentro de la MISMA seccion «Configuración». `lucide-react` ya esta instalado
  // (no es dependencia nueva) y el `Record` de `NAV_ICONS` obliga a que su fila exista.
  | 'users';

export type NavLink = {
  readonly kind: 'link';
  readonly href: string;
  readonly label: string;
  readonly testId: string;
  /**
   * Permiso `<modulo>.consultar` que exige este enlace para aparecer en el menu (QC-75 R5).
   *
   * **Es obligatorio, no opcional, a proposito.** Un enlace sin permiso seria un enlace que se
   * ve siempre, o sea un comodin, y la decision cerrada nº 2 de QC-75 los prohibe por escrito
   * (heredada de QC-74: no hay permiso «de cuenta» ni equivalente). Olvidarse el campo al
   * anadir un item tiene que ser un error de compilacion, no un item visible para todos.
   *
   * **Por que el tipo es `string` y no `PermissionCode`:** `lib/shared/**` NO puede importar
   * `lib/modules/**` (`docs/architecture.md > La regla de dependencias`), asi que la union de
   * literales que `identity` define en `domain/permissions.ts` no llega hasta aqui. Bajar el
   * catalogo a `lib/shared` para poder tiparlo seria mover el dominio de permisos fuera de su
   * modulo; se prefiere la cadena.
   *
   * El hueco que esa cadena deja —un codigo mal escrito, `'pedidos.consultarr'`, que no casaria
   * con ningun permiso real y ocultaria el item en silencio— **lo cierra una guardia, no este
   * comentario**: `tests/guards/guard-nav-permisos-declarados.test.ts` (QC-75 R20) importa a la
   * vez `PERMISSIONS` y `PRIVATE_NAV_ITEMS` —cruce de capas que solo `tests/` puede hacer— y se
   * pone roja si algun enlace declara un codigo fuera del catalogo o no declara ninguno.
   *
   * Sigue siendo serializable (una cadena), asi que `guard-nav-serializable` sigue verde.
   */
  readonly permission: string;
  /**
   * Icono del item. Solo lo llevan los de **nivel superior**: los hijos de un submenu se
   * dibujan sin icono, como en el diseno, y por eso es opcional en vez de obligatorio.
   */
  readonly icon?: NavIconName;
  /** Seccion a la que pertenece. Solo en items de nivel superior (ver `icon`). */
  readonly section?: string;
  /**
   * Contador que se pinta como etiqueta a la derecha del item.
   *
   * **Hoy es un valor fijo, no un dato real** (decision humana del 2026-09-02): no existe
   * ninguna fuente de notificaciones en el repo, y inventarla seria dominio que nadie ha
   * especificado. La ficha que traiga las notificaciones sustituye este numero por su origen.
   */
  readonly badge?: number;
};

/**
 * Un grupo del menu.
 *
 * **`NavGroup` NO lleva `permission`, y es deliberado** (QC-75 R3, decision cerrada nº 4): un
 * grupo se ve si le queda **algun hijo visible** tras filtrar, y desaparece entero —etiqueta y
 * disparador incluidos— cuando no le queda ninguno. Darle un permiso propio crearia dos verdades
 * sobre lo mismo: un grupo permitido con todos los hijos ocultos (un desplegable vacio que
 * anuncia que existe algo que no puedes usar) o un grupo denegado que esconde hijos permitidos.
 */
export type NavGroup = {
  readonly kind: 'group';
  readonly label: string;
  readonly testId: string;
  readonly icon?: NavIconName;
  readonly section?: string;
  /** Un solo nivel: los hijos son `NavLink`, nunca `NavItem`. Lo garantiza el tipo. */
  readonly items: readonly NavLink[];
};

export type NavItem = NavLink | NavGroup;

export const PRIVATE_NAV_ITEMS: readonly NavItem[] = [
  {
    kind: 'link',
    href: DASHBOARD_ROUTE,
    label: 'Dashboard',
    testId: 'nav-dashboard',
    permission: 'dashboard.consultar',
    icon: 'layout-dashboard',
    section: NAV_SECTION_OPERATION,
  },
  // La posicion no es cosmetica: `firstVisibleNavHref` recorre el menu filtrado de arriba abajo,
  // asi que quien no tiene `dashboard.consultar` aterriza en el primer item visible, que con este
  // orden es este.
  {
    kind: 'link',
    href: ASSIGNED_ORDERS_ROUTE,
    label: ASSIGNED_ORDERS_LABEL,
    testId: 'nav-asignacion',
    permission: 'asignaciones.consultar',
    icon: 'clipboard-list',
    section: NAV_SECTION_OPERATION,
  },
  {
    kind: 'link',
    href: INVENTORY_ROUTE,
    label: 'Inventario',
    testId: 'nav-inventario',
    permission: 'inventario.consultar',
    icon: 'package',
    section: NAV_SECTION_OPERATION,
  },
  // QC-35 R3: item de NIVEL SUPERIOR en la seccion «Operación» —un pedido es produccion, no
  // cadena de suministro (decision humana del 2026-09-06)—. El icono `clipboard-list` ya existe
  // en `NavIconName` y en `NAV_ICONS`: no se anade ningun icono.
  {
    kind: 'link',
    href: ORDERS_ROUTE,
    label: ORDERS_LABEL,
    testId: 'nav-pedidos',
    permission: 'pedidos.consultar',
    icon: 'clipboard-list',
    section: NAV_SECTION_OPERATION,
  },
  {
    kind: 'group',
    label: 'Producción',
    testId: 'nav-produccion',
    icon: 'factory',
    section: NAV_SECTION_CHAIN,
    items: [
      {
        kind: 'link',
        href: FORMULAS_ROUTE,
        label: RECIPES_LABEL,
        testId: 'nav-produccion-recetas',
        permission: 'recetas.consultar',
        icon: 'flask-conical',
      },
    ],
  },
  // QC-44 R4: item de NIVEL SUPERIOR en la seccion «Cadena», hermano del grupo «Producción» y
  // **no un hijo suyo**: proveedores es modulo de dominio propio (epica QC-41, creada fuera de
  // Catalogos y de Inventario). El icono `truck` ya existe en `NavIconName` y en `NAV_ICONS`.
  {
    kind: 'link',
    href: SUPPLIERS_ROUTE,
    label: SUPPLIERS_LABEL,
    testId: 'nav-proveedores',
    permission: 'proveedores.consultar',
    icon: 'truck',
    section: NAV_SECTION_CHAIN,
  },
  // QC-45 R3, R4 — ULTIMA entrada de nivel superior y unica de la seccion «Configuración»: el
  // catalogo de presentaciones no es operacion diaria ni cadena de suministro, y por eso estrena
  // seccion propia en vez de colarse en una existente. Sigue siendo UNA sola: «Unidades» llega con
  // QC-39. El icono `boxes` ya existe en `NavIconName` y en `NAV_ICONS`: no se anade ninguno.
  //
  // **El ocultado a quien no puede entrar lo hace el filtrado por PERMISO de QC-75**
  // (`filterNavItemsByPermissions` en `app/(private)/layout.tsx`), no un campo `adminOnly`: el
  // texto original de la T2 de QC-45 describia ese apaño por rol porque QC-75 aun no existia, y
  // manda el mecanismo nuevo. `inventario.modificar` es el mismo codigo que exige la pantalla con
  // `requirePagePermission`, asi que el item no puede salir en el menu de quien recibiria un 404
  // al pulsarlo: el Operador del seed lleva `inventario.consultar` y NO este, asi que no lo ve.
  // Al no quedarle ningun hijo visible, `groupNavItemsBySection` tampoco deja el encabezado
  // «Configuración» huerfano.
  {
    kind: 'link',
    href: PRESENTATIONS_ROUTE,
    label: PRESENTATIONS_LABEL,
    testId: 'nav-presentaciones',
    permission: 'inventario.modificar',
    icon: 'boxes',
    section: NAV_SECTION_CONFIGURATION,
  },
  // QC-39 R9, R10 — SEGUNDO item de la seccion «Configuración», junto al de presentaciones y sin
  // tocarlo: la seccion ya existia y esta ficha solo se da de alta en ella.
  //
  // **El permiso es `unidades.consultar`, uno de los DOS que exige la pantalla**
  // (`specs/QC-39-pantalla-de-unidades/design.md > 6`). `NavLink.permission` es UNA cadena —y
  // convertirlo en lista significaria reescribir el tipo, `filterNavItemsByPermissions` y su
  // guardia, que R9 y R47 prohiben tocar—, asi que se declara el que sigue la forma normal
  // `<modulo>.consultar` de QC-75 R5. **Aqui NO aplica la excepcion de QC-45**, que declaro
  // `inventario.modificar` porque el Operador lleva `inventario.consultar` y habria visto un
  // enlace que rebota: `unidades.consultar` no lo tiene nadie salvo el Administrador
  // (`SEED_ROLE_PERMISSIONS`), que tambien tiene `unidades.modificar`, asi que nadie ve un enlace
  // que le daria 404. Que eso siga siendo cierto lo vigila
  // `tests/unit/configuracion-ui/permisos-unidades-coherentes.test.ts` (R11): se pone rojo el dia
  // que un rol reciba exactamente uno de los dos.
  //
  // El icono `flask-conical` ya existe en `NavIconName` y en `NAV_ICONS`: **no se anade ninguno**.
  // Se reutiliza a proposito —un matraz es un instrumento de MEDIDA, que es de lo que habla esta
  // pantalla— y no colisiona dentro de la seccion, donde el otro item lleva `boxes`.
  {
    kind: 'link',
    href: UNITS_ROUTE,
    label: UNITS_LABEL,
    testId: 'nav-unidades',
    permission: 'unidades.consultar',
    icon: 'flask-conical',
    section: NAV_SECTION_CONFIGURATION,
  },
  // QC-67 R2, R3 origino este item dentro de «Configuración», al final del array y sin tocar los
  // dos que ya vivian dentro de esa seccion. Por decision humana del 2026-09-21 paso a
  // `NAV_SECTION_OPERATION`: usuarios es operacion de la organizacion, no configuracion del
  // producto. El objeto NO se movio de sitio en el array a proposito —solo cambio su `section`—:
  // `groupNavItemsBySection` agrupa por `section` conservando el orden de aparicion, asi que ya
  // sale dibujado dentro de «Operación», detras de Pedidos; y `firstVisibleNavHref` recorre el
  // array crudo de arriba abajo, asi que mover el objeto habria cambiado el aterrizaje de quien no
  // tiene `dashboard.consultar`, algo que el humano no pidio.
  //
  // **El permiso es `usuarios.consultar`, EL MISMO codigo que exige la pantalla** con
  // `requirePagePermission` (`design.md > 3`). Aqui NO aplica la excepcion de QC-45 —que declaro
  // `inventario.modificar` para que el Operador no viera un enlace que rebota— ni hace falta la
  // contencion de QC-39, que exigia DOS codigos y declaraba uno: con un solo codigo a cada lado, el
  // enlace y el 404 coinciden exactamente y nadie ve un enlace que le daria 404. Que item y pagina
  // sigan diciendo lo mismo lo vigila
  // `tests/unit/configuracion-ui/private-nav-usuarios.test.ts`, que LEE el codigo de la fuente de
  // `page.tsx` en vez de repetirlo aqui.
  //
  // El icono `users` SI es nuevo en `NavIconName` y en `NAV_ICONS`: ninguno de los ocho existentes
  // habla de personas. No entra ninguna dependencia: `lucide-react` ya estaba.
  {
    kind: 'link',
    href: USERS_ROUTE,
    label: USERS_LABEL,
    testId: 'nav-usuarios',
    permission: 'usuarios.consultar',
    icon: 'users',
    section: NAV_SECTION_OPERATION,
  },
];

/**
 * Agrupa los items de nivel superior por su `section`, **conservando el orden de aparicion**
 * en `PRIVATE_NAV_ITEMS` tanto para las secciones como para los items dentro de cada una.
 *
 * Vive aqui y no en el componente porque es la forma del dato, no de la vista: asi el
 * `AppSidebar` recorre y dibuja, sin decidir agrupaciones.
 *
 * Un item **sin** `section` no se pierde: cae en un grupo sin titulo, que se dibuja igual pero
 * sin encabezado. Es lo que hace que anadir un item al array nunca lo haga desaparecer de la
 * pantalla por olvidar un campo opcional.
 */
export type NavSection = {
  readonly label: string | null;
  readonly items: readonly NavItem[];
};

export function groupNavItemsBySection(items: readonly NavItem[]): readonly NavSection[] {
  const secciones: NavSection[] = [];

  for (const item of items) {
    const label = item.section ?? null;
    const ultima = secciones.find((seccion) => seccion.label === label);

    if (ultima) {
      (ultima.items as NavItem[]).push(item);
    } else {
      secciones.push({ label, items: [item] });
    }
  }

  return secciones;
}

/**
 * Los items visibles para un conjunto de permisos, en el **mismo orden** (QC-75 R1, R3, R4).
 *
 * Reglas, exactamente las de `design.md > 1.2`:
 *
 * - un `NavLink` se conserva si su `permission` esta en `permissions`;
 * - un `NavGroup` filtra sus hijos con esa misma regla y **desaparece entero** —etiqueta y
 *   disparador incluidos— si no le queda ninguno (R3); si le queda al menos uno, se devuelve el
 *   grupo con sus hijos filtrados;
 * - nunca reordena, nunca mueve un item de seccion, nunca duplica y **nunca muta la entrada**:
 *   devuelve estructuras nuevas (R4).
 *
 * **Vive aqui y no en `AppSidebar`** (decision cerrada nº 7, heredada de QC-11): la fuente decide
 * y el componente dibuja. Ademas el componente es `'use client'`, asi que filtrar alli haria
 * viajar los items ocultos en el payload servidor→cliente, que es justo lo que R2 prohibe.
 *
 * `groupNavItemsBySection` se aplica despues, sobre el resultado ya filtrado, sin cambios.
 */
export function filterNavItemsByPermissions(
  items: readonly NavItem[],
  permissions: readonly string[],
): readonly NavItem[] {
  const visible = (enlace: NavLink): boolean => permissions.includes(enlace.permission);

  const resultado: NavItem[] = [];

  for (const item of items) {
    if (item.kind === 'link') {
      if (visible(item)) resultado.push({ ...item });
      continue;
    }

    const hijos = item.items.filter(visible).map((hijo) => ({ ...hijo }));
    if (hijos.length === 0) continue;

    resultado.push({ ...item, items: hijos });
  }

  return resultado;
}

/**
 * El `href` del primer enlace visible del menu ya filtrado, o `null` si no queda ninguno
 * (QC-75 R11).
 *
 * Recorre de arriba abajo y, al topar un grupo, entra en sus hijos por el orden en que estan
 * declarados. Es el aterrizaje del login cuando no hay destino de vuelta valido: «la primera
 * pantalla que esa persona puede ver» se define por el **orden del menu** (decision cerrada
 * nº 5), sin una segunda lista de prioridad que mantener.
 *
 * No muta ni recorre nada mas de lo necesario: para en el primer enlace que encuentra.
 */
export function firstVisibleNavHref(items: readonly NavItem[]): string | null {
  for (const item of items) {
    if (item.kind === 'link') return item.href;

    const hijo = item.items[0];
    if (hijo !== undefined) return hijo.href;
  }

  return null;
}
