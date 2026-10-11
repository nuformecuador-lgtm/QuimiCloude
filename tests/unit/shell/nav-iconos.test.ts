// Iconos del menú lateral: uno distinto por destino, con la tabla aprobada, y sin mover nada
// más de cada destino.

import {
  Boxes,
  ClipboardCheck,
  ClipboardList,
  Factory,
  FlaskConical,
  LayoutDashboard,
  Package,
  Puzzle,
  Ruler,
  SquareUser,
  Truck,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { describe, expect, it } from 'vitest';

import { NAV_ICONS } from '@/lib/shared/navigation/nav-icons';
import { PRIVATE_NAV_ITEMS, type NavIconName, type NavItem } from '@/lib/shared/navigation/private-nav';

/** Nivel superior e hijos, en el orden en que se declaran. */
function aplanar(items: readonly NavItem[]): readonly NavItem[] {
  return items.flatMap((item) => (item.kind === 'group' ? [item, ...item.items] : [item]));
}

const DESTINOS: readonly NavItem[] = aplanar(PRIVATE_NAV_ITEMS);
const CON_ICONO = DESTINOS.filter(
  (destino): destino is NavItem & { icon: NavIconName } => destino.icon !== undefined,
);

const TABLA_DE_ICONOS: ReadonlyArray<readonly [string, NavIconName, LucideIcon]> = [
  ['nav-asignacion', 'clipboard-check', ClipboardCheck],
  ['nav-dashboard', 'layout-dashboard', LayoutDashboard],
  ['nav-inventario', 'package', Package],
  ['nav-pedidos', 'clipboard-list', ClipboardList],
  ['nav-usuarios', 'users', Users],
  ['nav-produccion', 'factory', Factory],
  ['nav-produccion-recetas', 'flask-conical', FlaskConical],
  ['nav-proveedores', 'truck', Truck],
  ['nav-clientes', 'square-user', SquareUser],
  ['nav-presentaciones', 'boxes', Boxes],
  ['nav-unidades', 'ruler', Ruler],
  ['nav-integraciones', 'puzzle', Puzzle],
];

const SIN_ICONO = [
  'nav-integraciones-proveedor-ia',
  'nav-integraciones-inventarios',
  'nav-integraciones-whatsapp',
] as const;

describe('iconos del menú lateral', () => {
  it('R1: ningún destino del menú, de nivel superior o hijo, repite icono', () => {
    const nombres = CON_ICONO.map((destino) => destino.icon);
    const repetidos = nombres.filter((nombre, i) => nombres.indexOf(nombre) !== i);

    expect(repetidos).toEqual([]);
    expect(nombres.length).toBeGreaterThan(0);
  });

  it('R1: ningún destino comparte el componente de icono con otro', () => {
    const componentes = CON_ICONO.map((destino) => NAV_ICONS[destino.icon]);

    expect(new Set(componentes).size).toBe(componentes.length);
  });

  it('R1: cada icono declarado tiene fila en NAV_ICONS', () => {
    for (const destino of CON_ICONO) {
      expect(NAV_ICONS[destino.icon], destino.testId).toBeDefined();
    }
  });

  it.each(TABLA_DE_ICONOS)('R2: %s se dibuja con %s', (testId, nombre, componente) => {
    const destino = DESTINOS.find((d) => d.testId === testId);

    expect(destino?.icon).toBe(nombre);
    expect(NAV_ICONS[nombre]).toBe(componente);
  });

  it('R2: los hijos de Integraciones siguen sin icono', () => {
    for (const testId of SIN_ICONO) {
      const destino = DESTINOS.find((d) => d.testId === testId);
      expect(destino, testId).toBeDefined();
      expect(destino?.icon, testId).toBeUndefined();
    }
  });

  it('R2: la tabla cubre todos los destinos del menú', () => {
    const cubiertos = [...TABLA_DE_ICONOS.map(([testId]) => testId), ...SIN_ICONO].sort();

    expect(DESTINOS.map((d) => d.testId).sort()).toEqual(cubiertos);
  });

  it('R3: etiqueta, ruta, testId, permiso, sección y orden no cambian', () => {
    const forma = DESTINOS.map((item) =>
      item.kind === 'group'
        ? { kind: item.kind, label: item.label, testId: item.testId, section: item.section }
        : {
            kind: item.kind,
            label: item.label,
            href: item.href,
            testId: item.testId,
            permission: item.permission,
            section: item.section,
          },
    );

    expect(forma).toEqual([
      { kind: 'link', label: 'Asignación', href: '/asignacion', testId: 'nav-asignacion', permission: 'asignaciones.consultar', section: 'Operación' },
      { kind: 'link', label: 'Dashboard', href: '/dashboard', testId: 'nav-dashboard', permission: 'dashboard.consultar', section: 'Operación' },
      { kind: 'link', label: 'Inventario', href: '/inventario', testId: 'nav-inventario', permission: 'inventario.consultar', section: 'Operación' },
      { kind: 'link', label: 'Pedidos', href: '/pedidos', testId: 'nav-pedidos', permission: 'pedidos.consultar', section: 'Operación' },
      { kind: 'group', label: 'Producción', testId: 'nav-produccion', section: 'Cadena' },
      { kind: 'link', label: 'Fórmulas', href: '/produccion/formulas', testId: 'nav-produccion-recetas', permission: 'recetas.consultar', section: undefined },
      { kind: 'link', label: 'Proveedores', href: '/proveedores', testId: 'nav-proveedores', permission: 'proveedores.consultar', section: 'Cadena' },
      { kind: 'link', label: 'Presentaciones', href: '/configuracion/presentaciones', testId: 'nav-presentaciones', permission: 'inventario.modificar', section: 'Configuración' },
      { kind: 'link', label: 'Unidades', href: '/configuracion/unidades', testId: 'nav-unidades', permission: 'unidades.consultar', section: 'Configuración' },
      { kind: 'link', label: 'Usuarios', href: '/configuracion/usuarios', testId: 'nav-usuarios', permission: 'usuarios.consultar', section: 'Operación' },
      { kind: 'link', label: 'Clientes', href: '/clientes', testId: 'nav-clientes', permission: 'clientes.consultar', section: 'Cadena' },
      { kind: 'group', label: 'Integraciones', testId: 'nav-integraciones', section: 'Configuración' },
      { kind: 'link', label: 'Proveedor IA', href: '/integraciones/proveedor-ia', testId: 'nav-integraciones-proveedor-ia', permission: 'integraciones.modificar', section: undefined },
      { kind: 'link', label: 'Inventarios', href: '/integraciones/inventarios', testId: 'nav-integraciones-inventarios', permission: 'integraciones.modificar', section: undefined },
      { kind: 'link', label: 'WhatsApp', href: '/integraciones/whatsapp', testId: 'nav-integraciones-whatsapp', permission: 'integraciones.modificar', section: undefined },
    ]);
  });
});
