import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { setupUser } from '../helpers/user-event';

import { AppSidebar } from '@/components/private/app-sidebar';
import { SidebarProvider } from '@/components/ui/sidebar';
import {
  BRAND_LABEL,
  PRIVATE_NAV_ITEMS,
  PRIVATE_NAV_LABEL,
  INVENTORY_ROUTE,
  RECIPES_LABEL,
  type NavGroup,
  type NavItem,
  type NavLink,
} from '@/lib/shared/navigation/private-nav';
import * as privateNav from '@/lib/shared/navigation/private-nav';
import { DASHBOARD_ROUTE, FORMULAS_ROUTE } from '@/lib/shared/routes';
import type { SessionUser } from '@/lib/modules/identity';

import { resetViewport, setViewportWidth, WIDE_VIEWPORT } from '../helpers/viewport';

const { usePathnameMock, logoutActionMock } = vi.hoisted(() => ({
  usePathnameMock: vi.fn<() => string>(),
  logoutActionMock: vi.fn<() => Promise<void>>(),
}));

// Solo se sustituye `usePathname` (R8, R12); el resto del modulo se conserva porque
// `next/link` depende de el.
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  usePathname: usePathnameMock,
}));

// El pie de usuario se monta dentro de la barra: sin este mock, el `<form>` del logout
// intentaria ejecutar la Server Action real.
vi.mock('@/lib/modules/identity/adapters/driving/logout-action', () => ({
  logoutAction: logoutActionMock,
}));

/** Ruta que no coincide con ningun destino de la navegacion: nada arranca activo. */
const RUTA_SIN_COINCIDENCIA = '/ruta-que-no-esta-en-la-navegacion';

const testId = {
  sidebar: 'private-sidebar',
  brand: 'private-brand',
  brandLink: 'private-brand-link',
  brandLong: 'private-brand-long',
  nav: 'private-nav',
  user: 'private-user',
} as const;

/** Primer grupo de `PRIVATE_NAV_ITEMS`, tomado de la constante y no escrito a mano. */
function primerGrupo(): NavGroup {
  const grupo = PRIVATE_NAV_ITEMS.find((item): item is NavGroup => item.kind === 'group');
  if (!grupo) {
    throw new Error('PRIVATE_NAV_ITEMS no contiene ningun item con submenu');
  }
  return grupo;
}

/**
 * El orden REAL en el que `AppSidebar` dibuja los items de nivel superior: agrupados por
 * `section` con `groupNavItemsBySection`, no el orden crudo de `PRIVATE_NAV_ITEMS`.
 *
 * Antes de que «Usuarios» pasara a `NAV_SECTION_OPERATION` (2026-09-21), ambos ordenes
 * coincidian porque cada seccion era un bloque contiguo del array. Dejaron de coincidir en
 * cuanto un item cambio de seccion sin moverse de sitio en el array: el DOM sigue la seccion.
 */
function ordenDeNivelSuperiorEnDom(): readonly NavItem[] {
  return privateNav.groupNavItemsBySection(PRIVATE_NAV_ITEMS).flatMap((seccion) => seccion.items);
}

/**
 * Fixture propia con dos grupos de un hijo cada uno, reconocible como dato de prueba y
 * desacoplada de `PRIVATE_NAV_ITEMS` (R9, R10): no referencia `SUPPLIERS_ROUTE` (retirada en
 * QC-13) ni `FORMULAS_ROUTE` (terreno de QC-26).
 */
const FIXTURE_GRUPO_A: NavGroup = {
  kind: 'group',
  label: 'Grupo A',
  testId: 'grupo-a',
  section: 'Fixture',
  items: [
    {
      kind: 'link',
      href: '/fixture/grupo-a/hijo',
      label: 'Hijo A',
      testId: 'grupo-a-hijo',
      // QC-75 T1: `permission` es obligatorio en `NavLink`. Fixture de vista: el filtrado por
      // permiso lo hace el layout antes de llegar aqui (decision cerrada nº 7).
      permission: 'inventario.consultar',
    },
  ],
};

const FIXTURE_GRUPO_B: NavGroup = {
  kind: 'group',
  label: 'Grupo B',
  testId: 'grupo-b',
  section: 'Fixture',
  items: [
    {
      kind: 'link',
      href: '/fixture/grupo-b/hijo',
      label: 'Hijo B',
      testId: 'grupo-b-hijo',
      permission: 'pedidos.consultar',
    },
  ],
};

const FIXTURE_DOS_GRUPOS: readonly NavItem[] = [FIXTURE_GRUPO_A, FIXTURE_GRUPO_B];

function sessionUser(): SessionUser {
  return {
    id: 'u-1',
    username: 'ana.perez',
    displayName: 'Ana Maria Perez',
    roleName: 'Jefa de planta',
    // QC-74 T8: `SessionUser` exige `permissions`. Vacio: este test no autoriza nada.
    permissions: [],
  };
}

/** `AppSidebar` usa `useSidebar()`: sin el provider no monta. */
function renderSidebar(navItems: readonly NavItem[] = PRIVATE_NAV_ITEMS) {
  return render(
    <SidebarProvider>
      <AppSidebar user={sessionUser()} navItems={navItems} />
    </SidebarProvider>,
  );
}

/**
 * Lista de `<li>` de primer nivel de la navegacion, en orden de DOM.
 *
 * Recorre **todas** las listas de nivel superior, una por seccion, y no solo la primera: los
 * items se agrupan por `section` y con una sola lista este helper contaria unicamente los de
 * la primera seccion —tres de cinco— y el test pasaria por mirar de menos.
 *
 * Se excluyen las listas de submenu (`sidebar-menu-sub`): sus `<li>` son hijos de un item,
 * no entradas de primer nivel, y colarlos aqui inflaria el recuento con las rutas hijas.
 *
 * Una navegacion **sin ninguna lista es un resultado valido** —es lo que ocurre con una
 * coleccion vacia— y por eso ya no se lanza: devuelve vacio y el test que lo comprueba
 * afirma sobre eso.
 */
function entradasDeNavegacion(): readonly HTMLLIElement[] {
  const menus = screen
    .getByTestId(testId.nav)
    .querySelectorAll('ul[data-slot="sidebar-menu"]');

  return Array.from(menus).flatMap((menu) =>
    Array.from(menu.children).filter(
      (child): child is HTMLLIElement => child instanceof HTMLLIElement,
    ),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  usePathnameMock.mockReturnValue(RUTA_SIN_COINCIDENCIA);
  logoutActionMock.mockResolvedValue(undefined);
  // jsdom no trae `matchMedia`: hay que fijar el ancho ANTES de montar nada.
  setViewportWidth(WIDE_VIEWPORT);
});

afterEach(() => {
  cleanup();
  resetViewport();
});

describe('barra lateral privada', () => {
  it('la barra lateral expone sus tres regiones: marca, navegacion y pie de usuario', () => {
    // R2
    renderSidebar();

    const barra = screen.getByTestId(testId.sidebar);

    expect(within(barra).getByTestId(testId.brand)).toBeInTheDocument();
    expect(within(barra).getByTestId(testId.nav)).toBeInTheDocument();
    expect(within(barra).getByTestId(testId.user)).toBeInTheDocument();
  });

  it('la navegacion es un landmark de navegacion con nombre accesible', () => {
    // R3
    renderSidebar();

    const landmark = screen.getByRole('navigation', { name: PRIVATE_NAV_LABEL });

    expect(landmark).toBe(screen.getByTestId(testId.nav));
    // Distinguible de cualquier otro landmark de navegacion: hoy es el unico del arbol.
    expect(screen.getAllByRole('navigation')).toHaveLength(1);
  });

  it('la marca es un enlace a DASHBOARD_ROUTE con nombre accesible', () => {
    // R4
    renderSidebar();

    const enlace = screen.getByTestId(testId.brandLink);

    expect(screen.getByTestId(testId.brand)).toContainElement(enlace);
    expect(enlace).toHaveRole('link');
    expect(enlace).toHaveAttribute('href', DASHBOARD_ROUTE);
    expect(enlace).toHaveAccessibleName(BRAND_LABEL);
    // En viewport ancho y modo expandido se muestra la version larga de la marca.
    expect(screen.getByTestId(testId.brandLong)).toBeInTheDocument();
  });

  it('renderiza una entrada por cada item de PRIVATE_NAV_ITEMS y en su orden', () => {
    // R6
    renderSidebar();

    const entradas = entradasDeNavegacion();

    // Ni una entrada de menos ni una de mas.
    expect(entradas).toHaveLength(PRIVATE_NAV_ITEMS.length);

    const enDom = entradas.map((entrada) =>
      entrada.querySelector('[data-testid]')?.getAttribute('data-testid'),
    );
    // La lista va A MANO y no sale de `groupNavItemsBySection`: si esa funcion ordenara mal, una
    // expectativa derivada de ella se moveria junto con el DOM y R6 dejaria de cazar el fallo. El
    // orden lo manda la SECCION (Operacion, Cadena, Configuracion), no la posicion en el array:
    // «Usuarios» es el ultimo item declarado en `PRIVATE_NAV_ITEMS` pero se dibuja junto a los
    // demas de «Operación».
    const esperado = [
      'nav-dashboard',
      'nav-asignacion',
      'nav-inventario',
      'nav-pedidos',
      'nav-usuarios',
      'nav-produccion',
      'nav-proveedores',
      'nav-clientes',
      'nav-presentaciones',
      'nav-unidades',
    ];

    expect(enDom).toEqual(esperado);
  });

  it('con una coleccion de navegacion vacia no renderiza entradas y el layout sigue en pie', () => {
    // R7
    renderSidebar([]);

    expect(screen.getByRole('navigation', { name: PRIVATE_NAV_LABEL })).toBeInTheDocument();
    expect(entradasDeNavegacion()).toHaveLength(0);

    // El resto del armazon no se rompe.
    expect(screen.getByTestId(testId.brandLink)).toBeInTheDocument();
    expect(screen.getByTestId(testId.user)).toBeInTheDocument();
  });

  it('marca con aria-current solo el enlace simple cuya ruta coincide con la activa', () => {
    // R8
    usePathnameMock.mockReturnValue(INVENTORY_ROUTE);
    renderSidebar();

    const activo = PRIVATE_NAV_ITEMS.find(
      (item): item is NavLink => item.kind === 'link' && item.href === INVENTORY_ROUTE,
    );
    if (!activo) {
      throw new Error('PRIVATE_NAV_ITEMS no contiene un item simple hacia INVENTORY_ROUTE');
    }

    expect(screen.getByTestId(activo.testId)).toHaveAttribute('aria-current', 'page');

    // Y solo ese: ningun otro elemento del arbol se declara actual.
    const marcados = Array.from(document.querySelectorAll('[aria-current]'));
    expect(marcados).toEqual([screen.getByTestId(activo.testId)]);
  });

  it('un item con hijos se renderiza como control de expansion, no como enlace, y es activable por teclado', async () => {
    // R9
    const user = setupUser();
    const grupo = primerGrupo();
    renderSidebar();

    const control = screen.getByTestId(grupo.testId);

    expect(control.tagName).toBe('BUTTON');
    expect(control).toHaveRole('button');
    expect(control).not.toHaveAttribute('href');
    expect(screen.queryByRole('link', { name: grupo.label })).toBeNull();
    expect(control).toHaveAccessibleName(grupo.label);

    // Alcanzable con Tab desde la entrada anterior EN EL DOM, que sigue el orden agrupado por
    // seccion (`groupNavItemsBySection`), no el orden crudo del array: desde el 2026-09-21
    // difieren, porque «Usuarios» vive en «Operación» aunque sea el ultimo del array.
    const ordenEnDom = ordenDeNivelSuperiorEnDom();
    const indiceGrupo = ordenEnDom.indexOf(grupo);
    const anterior = ordenEnDom[indiceGrupo - 1];
    if (!anterior) {
      throw new Error('el primer grupo no tiene ninguna entrada anterior');
    }
    // El foco directo abre el tooltip del item anterior (estado de React): dentro de `act`.
    await act(async () => {
      screen.getByTestId(anterior.testId).focus();
    });
    await user.tab();
    expect(control).toHaveFocus();

    // Y activable con Enter y con Espacio, no solo con raton.
    await user.keyboard('{Enter}');
    await waitFor(() => expect(control).toHaveAttribute('aria-expanded', 'true'));

    await user.keyboard(' ');
    await waitFor(() => expect(control).toHaveAttribute('aria-expanded', 'false'));
  });

  it('el submenu colapsado expone aria-expanded=false y no expone sus hijos; expandido los expone', async () => {
    // R10
    const user = setupUser();
    const grupo = primerGrupo();
    renderSidebar();

    const control = screen.getByTestId(grupo.testId);

    expect(control).toHaveAttribute('aria-expanded', 'false');
    for (const hijo of grupo.items) {
      expect(screen.queryByTestId(hijo.testId)).toBeNull();
    }

    await user.click(control);

    await waitFor(() => expect(control).toHaveAttribute('aria-expanded', 'true'));
    for (const hijo of grupo.items) {
      const enlace = screen.getByTestId(hijo.testId);
      expect(enlace).toHaveRole('link');
      expect(enlace).toHaveAttribute('href', hijo.href);
    }
  });

  it('activar el control del submenu alterna entre expandido y colapsado', async () => {
    // R11
    const user = setupUser();
    const grupo = primerGrupo();
    const primerHijo = grupo.items[0];
    if (!primerHijo) {
      throw new Error('el grupo no tiene hijos');
    }
    renderSidebar();

    const control = screen.getByTestId(grupo.testId);
    expect(control).toHaveAttribute('aria-expanded', 'false');

    await user.click(control);
    await waitFor(() => expect(control).toHaveAttribute('aria-expanded', 'true'));
    expect(screen.getByTestId(primerHijo.testId)).toBeInTheDocument();

    await user.click(control);
    await waitFor(() => expect(control).toHaveAttribute('aria-expanded', 'false'));
    await waitFor(() => expect(screen.queryByTestId(primerHijo.testId)).toBeNull());
  });

  it('si la ruta activa es la de un hijo, su submenu arranca expandido y el hijo queda marcado como actual', () => {
    // R12
    const hijoActivo = FIXTURE_GRUPO_A.items[0];
    if (!hijoActivo) {
      throw new Error('el fixture de grupo A no tiene hijos');
    }
    usePathnameMock.mockReturnValue(hijoActivo.href);
    renderSidebar(FIXTURE_DOS_GRUPOS);

    // Sin ninguna interaccion previa.
    expect(screen.getByTestId(FIXTURE_GRUPO_A.testId)).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId(hijoActivo.testId)).toHaveAttribute('aria-current', 'page');

    // El otro submenu no se abre por contagio.
    expect(screen.getByTestId(FIXTURE_GRUPO_B.testId)).toHaveAttribute('aria-expanded', 'false');
  });

  it('los destinos de la marca y de todas las entradas salen de las constantes exportadas', async () => {
    // R13
    const user = setupUser();
    renderSidebar();

    // Los hijos solo existen en el DOM cuando su submenu esta abierto: se abren todos.
    for (const item of PRIVATE_NAV_ITEMS) {
      if (item.kind === 'group') {
        await user.click(screen.getByTestId(item.testId));
        await waitFor(() =>
          expect(screen.getByTestId(item.testId)).toHaveAttribute('aria-expanded', 'true'),
        );
      }
    }

    const esperados = new Set<string>([DASHBOARD_ROUTE]);
    for (const item of PRIVATE_NAV_ITEMS) {
      if (item.kind === 'link') {
        expect(screen.getByTestId(item.testId)).toHaveAttribute('href', item.href);
        esperados.add(item.href);
        continue;
      }
      for (const hijo of item.items) {
        expect(screen.getByTestId(hijo.testId)).toHaveAttribute('href', hijo.href);
        esperados.add(hijo.href);
      }
    }

    expect(screen.getByTestId(testId.brandLink)).toHaveAttribute('href', DASHBOARD_ROUTE);

    // Y ningun destino del arbol queda fuera del conjunto de constantes.
    const enDom = Array.from(document.querySelectorAll('a[href]')).map((enlace) =>
      enlace.getAttribute('href'),
    );
    expect(enDom.length).toBeGreaterThan(0);
    for (const href of enDom) {
      expect(esperados.has(href as string)).toBe(true);
    }
  });

  it('el item de recetas apunta a la constante FORMULAS_ROUTE, es el unico, y el enlace muestra RECIPES_LABEL (R5)', async () => {
    // R5 — QC-26 T23. El item nace en el barrel `private-nav.ts` (T3) ya migrado; aqui se
    // afirma sobre el DOM real: un solo item apunta a `FORMULAS_ROUTE`, con el testId nuevo, y
    // el testId viejo (`nav-produccion-formulas`) ya no existe en ningun sitio del arbol.
    // Decision humana del 2026-09-21: el literal 'Fórmulas' deja de ser el nombre placeholder
    // que QC-13 desterro y pasa a ser el nombre definitivo de esta pantalla; la aserción del
    // enlace compara contra RECIPES_LABEL, la unica fuente de verdad, no contra un literal.
    const user = setupUser();

    const itemsDeRecetas = PRIVATE_NAV_ITEMS.flatMap((item) =>
      item.kind === 'group' ? item.items : [item],
    ).filter((item) => item.href === FORMULAS_ROUTE);

    // Hay exactamente un item que apunta a la constante: ni cero, ni un duplicado.
    expect(itemsDeRecetas).toHaveLength(1);
    const itemRecetas = itemsDeRecetas[0] as NavLink;
    expect(itemRecetas.testId).toBe('nav-produccion-recetas');
    expect(itemRecetas.label).toBe(RECIPES_LABEL);

    const grupo = PRIVATE_NAV_ITEMS.find(
      (item): item is NavGroup =>
        item.kind === 'group' && item.items.some((hijo) => hijo.href === FORMULAS_ROUTE),
    );
    if (!grupo) {
      throw new Error('ningun grupo de PRIVATE_NAV_ITEMS contiene el item de recetas');
    }

    renderSidebar();

    await user.click(screen.getByTestId(grupo.testId));
    await waitFor(() =>
      expect(screen.getByTestId(grupo.testId)).toHaveAttribute('aria-expanded', 'true'),
    );

    const enlace = screen.getByTestId('nav-produccion-recetas');
    expect(enlace).toHaveAttribute('href', FORMULAS_ROUTE);
    expect(enlace.textContent).toContain(RECIPES_LABEL);

    // El testId viejo ya no aparece en ningun sitio del arbol renderizado.
    expect(screen.queryByTestId('nav-produccion-formulas')).toBeNull();
  });
});

describe('el borrado de items de relleno (QC-13)', () => {
  it('private-nav.ts no exporta las constantes de ruta retiradas', () => {
    // R1
    const exportadas = Object.keys(privateNav);

    expect(exportadas).not.toEqual(
      expect.arrayContaining([
        'NOTIFICATIONS_ROUTE',
        'PURCHASE_ORDERS_ROUTE',
        'SUPPLIERS_ROUTE',
        'BATCHES_ROUTE',
      ]),
    );
  });

  it('PRIVATE_NAV_ITEMS no contiene ningun destino ni testId de los items retirados', () => {
    // R2, R3
    const rutasRetiradas = [
      '/notificaciones',
      '/compras/ordenes',
      '/compras/proveedores',
      '/produccion/lotes',
    ];
    const testIdsRetirados = ['nav-notificaciones', 'nav-compras'];

    const todosLosItems: NavItem[] = [];
    for (const item of PRIVATE_NAV_ITEMS) {
      todosLosItems.push(item);
      if (item.kind === 'group') {
        todosLosItems.push(...item.items);
      }
    }

    for (const item of todosLosItems) {
      if (item.kind === 'link') {
        expect(rutasRetiradas).not.toContain(item.href);
      }
      expect(testIdsRetirados).not.toContain(item.testId);
    }
  });

  it('PRIVATE_NAV_ITEMS tiene exactamente nueve entradas de nivel superior en orden', () => {
    // R5. AMPLIADO el 2026-09-04 (QC-44 T2, R4): la CUARTA entrada es la pantalla de proveedores,
    // item de nivel superior de la seccion «Cadena» -hermano del grupo de produccion, no hijo
    // suyo-. El centinela no se relaja: sigue exigiendo la lista exacta y su orden, asi que una
    // quinta entrada sin ficha que la respalde lo vuelve a poner en rojo. El destino y la
    // etiqueta del item nuevo los afirma
    // `tests/unit/proveedores/supplier-route-contract.test.ts` sobre `SUPPLIERS_ROUTE` y
    // `SUPPLIERS_LABEL`, nunca sobre el literal del copy.
    // AMPLIADO otra vez el 2026-09-06 (QC-35 T2, R3): la entrada nueva es la pantalla de
    // pedidos, item de nivel superior de la seccion «Operación» —hermano de Dashboard e
    // Inventario— y por eso va detras de ellos y delante del grupo de produccion. El centinela
    // no se relaja: sigue exigiendo la lista exacta y su orden, asi que una sexta entrada sin
    // ficha que la respalde lo vuelve a poner en rojo. El destino y la etiqueta del item nuevo
    // los afirma `tests/unit/pedidos-ui/private-nav-pedidos.test.ts` sobre `ORDERS_ROUTE` y
    // `ORDERS_LABEL`, nunca sobre el literal del copy.
    // AMPLIADO otra vez el 2026-09-08 (QC-45 T2, R3): la entrada nueva es la pantalla de
    // presentaciones, unico item de la seccion «Configuración» y ULTIMO del array —seccion nueva
    // que se abre detras de las que ya habia—. El centinela no se relaja: sigue exigiendo la
    // lista exacta y su orden, asi que una septima entrada sin ficha que la respalde lo vuelve a
    // poner en rojo. El destino, la etiqueta y el permiso del item nuevo los afirma
    // `tests/unit/configuracion-ui/private-nav-configuracion.test.ts` sobre `PRESENTATIONS_ROUTE`
    // y `PRESENTATIONS_LABEL`, nunca sobre el literal del copy.
    // TENSADO el 2026-09-08 (QC-39 T4, R9/R10/R47): la entrada nueva es la pantalla de unidades,
    // SEGUNDO item de la seccion «Configuración» que QC-45 ya habia abierto -no se crea seccion
    // ninguna- y ULTIMO del array, detras de presentaciones, al que no se toca ni se reordena. El
    // ancla se TENSA, nunca se afloja (R47): sube de seis a siete y sigue exigiendo la lista
    // exacta y su orden, asi que una octava entrada sin ficha que la respalde lo vuelve a poner en
    // rojo. El destino, la etiqueta y el permiso del item nuevo los afirma
    // `tests/unit/configuracion-ui/private-nav-unidades.test.ts` sobre `UNITS_ROUTE` y
    // `UNITS_LABEL`, nunca sobre el literal del copy.
    // TENSADO el 2026-09-11 (QC-67 T2, R2/R39): la entrada nueva es la pantalla de usuarios,
    // ULTIMO del array, detras de unidades. El ancla se TENSA, nunca se afloja: sube de siete a
    // OCHO y sigue exigiendo la lista exacta y su orden, asi que una novena entrada sin ficha que
    // la respalde lo vuelve a poner en rojo. El destino, la etiqueta y el permiso del item nuevo
    // los afirma `tests/unit/configuracion-ui/private-nav-usuarios.test.ts` sobre `USERS_ROUTE` y
    // `USERS_LABEL`, nunca sobre el literal del copy.
    // POR DECISION HUMANA del 2026-09-21, `nav-usuarios` paso de la seccion «Configuración» a
    // «Operación» -usuarios es operacion, no configuracion-: NO se movio de sitio en el array,
    // solo cambio su `section`, asi que este centinela de POSICION sigue exigiendo la MISMA lista
    // y el MISMO orden.
    // «Asignación» va ENTRE Dashboard e Inventario, no al final: el aterrizaje de quien no tiene
    // `dashboard.consultar` es el primer item visible de su menu, asi que ese orden lo decide.
    //
    // TENSADO: la entrada nueva es la pantalla de clientes, ULTIMO del array y de la seccion
    // «Cadena», detras de proveedores. El ancla se TENSA, nunca se afloja: sube de nueve a DIEZ.
    expect(PRIVATE_NAV_ITEMS).toHaveLength(10);
    expect(PRIVATE_NAV_ITEMS.map((item) => item.testId)).toEqual([
      'nav-dashboard',
      'nav-asignacion',
      'nav-inventario',
      'nav-pedidos',
      'nav-produccion',
      'nav-proveedores',
      'nav-presentaciones',
      'nav-unidades',
      'nav-usuarios',
      'nav-clientes',
    ]);
  });

  it('el grupo nav-produccion conserva un unico hijo: el item de recetas', () => {
    // R6. La asercion original comparaba contra el literal 'nav-produccion-formulas'. QC-26
    // (R5) le cambio el testId a 'nav-produccion-recetas', y volver a escribir aqui a mano el
    // literal nuevo repetiria el mismo error que rompio este test hoy: dos copias sueltas de un
    // mismo dato que solo una de las dos actualiza. En su lugar se deriva el testId esperado del
    // propio `PRIVATE_NAV_ITEMS`, localizando el item por `FORMULAS_ROUTE` -la fuente que ya usa
    // el test de R5 de este archivo-, asi que si alguien vuelve a renombrar el testId, ambos
    // lados de la comparacion se mueven juntos. Lo que esta ficha (QC-13) garantiza sigue igual:
    // el grupo tiene exactamente un hijo. Actualizado el 2026-09-03 al resolver el conflicto de
    // F2.3 (merge con dev).
    const grupoProduccion = PRIVATE_NAV_ITEMS.find(
      (item): item is NavGroup => item.kind === 'group' && item.testId === 'nav-produccion',
    );
    if (!grupoProduccion) {
      throw new Error('PRIVATE_NAV_ITEMS no contiene el grupo nav-produccion');
    }

    const itemRecetas = PRIVATE_NAV_ITEMS.flatMap((item) =>
      item.kind === 'group' ? item.items : [item],
    ).find((item) => item.href === FORMULAS_ROUTE);
    if (!itemRecetas) {
      throw new Error('PRIVATE_NAV_ITEMS no contiene el item de recetas (FORMULAS_ROUTE)');
    }

    expect(grupoProduccion.items).toHaveLength(1);
    expect(grupoProduccion.items[0]?.testId).toBe(itemRecetas.testId);
  });

  // El test «FORMULAS_ROUTE y su item se conservan intactos: terreno de QC-26» vivia aqui y lo
  // BORRO QC-26 al llegar, no por incomodo: afirmaba `label === 'Formulas'` y
  // `testId === 'nav-produccion-formulas'`, que son exactamente las dos cosas que esta ficha
  // cambia por decision cerrada (R5). Su propio titulo lo declaraba: guardaba «terreno de QC-26»
  // mientras QC-26 no existiera. Lo que protegia -que el item existe, es unico y apunta a la
  // constante- lo cubre ahora el test de R5 de este mismo archivo, que ademas comprueba que el
  // item YA NO dice «Formulas». Mantener los dos seria mantener dos versiones contradictorias de
  // la misma verdad. Decision humana del 2026-09-03, al resolver el conflicto de F2.3.
});
