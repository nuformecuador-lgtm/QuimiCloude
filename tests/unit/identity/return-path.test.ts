// T7 — El destino de vuelta se valida como interno (R9), y la redireccion al login lleva la ruta
// pedida (R7). Dominio puro: sin Next, sin cookies, sin base de datos (R20).

import {
  RETURN_PARAM,
  buildLoginRedirect,
  isInternalPath,
  resolveReturnPath,
} from '@/lib/modules/identity/domain/return-path';

const DASHBOARD = '/dashboard';

describe('isInternalPath', () => {
  // R9 — el agujero clasico: un enlace fabricado que saca al usuario del ERP tras autenticarse.
  it.each([
    ['una URL absoluta con esquema', 'https://evil.example'],
    ['una URL protocolo-relativa', '//evil.example'],
    ['una barra invertida que el navegador normaliza a //', '/\\evil.example'],
    ['un esquema javascript:', 'javascript:alert(1)'],
    ['un esquema data:', 'data:text/html,<script>1</script>'],
    ['un // camuflado con codificacion porcentual', '%2F%2Fevil.example'],
    ['un // camuflado tras una barra inicial', '/%2Fevil.example'],
    ['una cadena vacia', ''],
    ['una ruta relativa', 'dashboard'],
    ['una ruta con caracteres de control', '/dash\u0000board'],
    ['una codificacion porcentual invalida', '/dash%zzboard'],
  ])('rechaza %s', (_caso, candidato) => {
    expect(isInternalPath(candidato)).toBe(false);
  });

  it.each([
    ['una ruta simple', '/dashboard'],
    ['una ruta anidada con cadena de consulta', '/dashboard/reportes?desde=ayer'],
    ['una ruta con fragmento', '/dashboard#seccion'],
    ['la raiz', '/'],
  ])('acepta %s', (_caso, candidato) => {
    expect(isInternalPath(candidato)).toBe(true);
  });

  // R9 — `//evil.example` decodificado sigue siendo `//evil.example`: la doble comprobacion
  // (texto recibido y texto decodificado) es lo que cierra el camuflaje.
  it('un %2F%2F que decodifica a // no es interno aunque su forma cruda lo parezca', () => {
    expect(isInternalPath('/%2F%2Fevil.example')).toBe(false);
    expect(decodeURIComponent('/%2F%2Fevil.example')).toBe('///evil.example');
  });
});

describe('resolveReturnPath', () => {
  it('devuelve la ruta cuando es interna', () => {
    expect(resolveReturnPath('/dashboard/reportes?desde=ayer', DASHBOARD)).toBe(
      '/dashboard/reportes?desde=ayer',
    );
  });

  // R9 — todo lo que no es interno cae al fallback, en silencio.
  it.each([
    ['https://evil.example'],
    ['//evil.example'],
    ['/\\evil.example'],
    ['javascript:alert(1)'],
    ['%2F%2Fevil.example'],
    [''],
  ])('descarta %s y cae al fallback', (candidato) => {
    expect(resolveReturnPath(candidato, DASHBOARD)).toBe(DASHBOARD);
  });

  it('descarta la ausencia de destino (undefined o null) y cae al fallback', () => {
    expect(resolveReturnPath(undefined, DASHBOARD)).toBe(DASHBOARD);
    expect(resolveReturnPath(null, DASHBOARD)).toBe(DASHBOARD);
  });
});

describe('buildLoginRedirect', () => {
  // R7 — la ruta pedida viaja entera: camino y cadena de consulta.
  it('lleva el camino y la cadena de consulta pedidos como destino de vuelta', () => {
    const destino = buildLoginRedirect('/login', '/dashboard/reportes', '?desde=ayer');

    const url = new URL(destino, 'https://app.example');
    expect(url.pathname).toBe('/login');
    expect(url.searchParams.get(RETURN_PARAM)).toBe('/dashboard/reportes?desde=ayer');
  });

  // R7 — sin `encodeURIComponent`, `?desde=ayer` seria un segundo parametro DEL LOGIN.
  it('codifica la ruta pedida para que su query no se mezcle con la del login', () => {
    const destino = buildLoginRedirect('/login', '/dashboard/reportes', '?desde=ayer');

    expect(destino).toBe('/login?next=%2Fdashboard%2Freportes%3Fdesde%3Dayer');
    expect(new URL(destino, 'https://app.example').searchParams.get('desde')).toBeNull();
  });

  it('sin cadena de consulta lleva solo el camino', () => {
    expect(buildLoginRedirect('/login', '/dashboard', '')).toBe('/login?next=%2Fdashboard');
  });

  // El destino que produce se vuelve a validar al consumirlo (design.md > 8, doble validacion).
  it('el destino que construye sobrevive a resolveReturnPath', () => {
    const destino = buildLoginRedirect('/login', '/dashboard/reportes', '?desde=ayer');
    const recibido = new URL(destino, 'https://app.example').searchParams.get(RETURN_PARAM);

    expect(resolveReturnPath(recibido, DASHBOARD)).toBe('/dashboard/reportes?desde=ayer');
  });
});
