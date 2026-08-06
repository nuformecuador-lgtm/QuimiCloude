import { getInitials } from '@/lib/utils/initials';

// Casos borde del helper de iniciales. Apoya R15 (`nav-user.test.tsx` cubre el render);
// aqui se fija el contrato puro del formateo, sin DOM.
describe('getInitials', () => {
  it('devuelve cadena vacia cuando el nombre visible esta vacio', () => {
    // R15
    expect(getInitials('')).toBe('');
  });

  it('devuelve cadena vacia cuando el nombre visible es solo espacios', () => {
    // R15
    expect(getInitials('   ')).toBe('');
    expect(getInitials('\t\n ')).toBe('');
  });

  it('devuelve una sola inicial cuando el nombre tiene una sola palabra', () => {
    // R15
    expect(getInitials('ana')).toBe('A');
  });

  it('devuelve la inicial de cada palabra cuando el nombre tiene dos', () => {
    // R15
    expect(getInitials('ana perez')).toBe('AP');
  });

  it('con tres o mas palabras usa la primera y la ultima', () => {
    // R15
    expect(getInitials('ana maria perez')).toBe('AP');
    expect(getInitials('ana maria perez gomez')).toBe('AG');
  });

  it('tolera espacios multiples, iniciales y finales', () => {
    // R15
    expect(getInitials('  ana   maria   perez  ')).toBe('AP');
  });

  it('devuelve las iniciales siempre en mayusculas', () => {
    // R15
    expect(getInitials('ana perez')).toBe(getInitials('ANA PEREZ'));
    expect(getInitials('ana perez')).toBe('AP');
  });

  it('nunca devuelve mas de dos caracteres', () => {
    // R15
    const nombres = ['ana', 'ana perez', 'ana maria perez gomez de la torre', '  a  b  c  d  '];

    for (const nombre of nombres) {
      expect(getInitials(nombre).length).toBeLessThanOrEqual(2);
    }
  });
});
