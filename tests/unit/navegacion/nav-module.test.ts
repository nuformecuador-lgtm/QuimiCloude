import { describe, expect, it } from 'vitest';

import { navItemHrefs, navModuleKey } from '@/lib/shared/navigation/nav-module';
import type { NavItem } from '@/lib/shared/navigation/private-nav';

const HREFS = ['/pedidos', '/configuracion/integraciones/ia', '/configuracion/usuarios'];

describe('navModuleKey', () => {
  it('R19: la ruta de un ítem es su propio módulo', () => {
    expect(navModuleKey('/pedidos', HREFS)).toBe('/pedidos');
  });

  it('R19: el prefijo es por segmentos, no por texto', () => {
    expect(navModuleKey('/pedidos-x', HREFS)).toBe('/pedidos-x');
    expect(navModuleKey('/pedidos-x', HREFS)).not.toBe(navModuleKey('/pedidos', HREFS));
  });

  it('R20: una pantalla de detalle pertenece al módulo del ítem', () => {
    expect(navModuleKey('/pedidos/123', HREFS)).toBe('/pedidos');
    expect(navModuleKey('/pedidos/123?tab=lineas#x', HREFS)).toBe('/pedidos');
  });

  it('R19: gana el href más largo que es prefijo', () => {
    const hrefs = ['/configuracion', '/configuracion/usuarios'];
    expect(navModuleKey('/configuracion/usuarios/7', hrefs)).toBe('/configuracion/usuarios');
    expect(navModuleKey('/configuracion/otra', hrefs)).toBe('/configuracion');
  });

  it('R19: hermanos dentro de un grupo son módulos distintos', () => {
    expect(navModuleKey('/configuracion/usuarios', HREFS)).not.toBe(
      navModuleKey('/configuracion/integraciones/ia', HREFS),
    );
  });

  it('R19: una ruta sin ítem usa su primer segmento', () => {
    expect(navModuleKey('/perfil/editar', HREFS)).toBe('/perfil');
    expect(navModuleKey('/perfil', HREFS)).toBe('/perfil');
  });

  it('R19: la raíz o una ruta vacía no rompen', () => {
    expect(navModuleKey('/', HREFS)).toBe('/');
    expect(navModuleKey('', HREFS)).toBe('/');
  });

  it('R19: un href "/" no se traga todos los módulos', () => {
    expect(navModuleKey('/pedidos', ['/', '/inventario'])).toBe('/pedidos');
  });
});

describe('navItemHrefs', () => {
  it('R19: aplana enlaces y los hijos de cada grupo', () => {
    const items: NavItem[] = [
      { kind: 'link', href: '/a', label: 'A', testId: 'a', permission: 'a.consultar' },
      {
        kind: 'group',
        label: 'G',
        testId: 'g',
        items: [
          { kind: 'link', href: '/g/b', label: 'B', testId: 'b', permission: 'b.consultar' },
          { kind: 'link', href: '/g/c', label: 'C', testId: 'c', permission: 'c.consultar' },
        ],
      },
    ];
    expect(navItemHrefs(items)).toEqual(['/a', '/g/b', '/g/c']);
  });
});
