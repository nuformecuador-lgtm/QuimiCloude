import { cleanup, render, screen } from '@testing-library/react';

import PrivateNotFound from '@/app/(private)/not-found';
import { PERMISSIONS } from '@/lib/modules/identity';

/**
 * QC-75 T5 — la pantalla 404 de la zona privada (R7, R8, R9, R14).
 *
 * Lo que se prueba aqui es sobre todo **lo que el copy NO dice**: R7 exige que quien lo lea no
 * pueda distinguir «esta pantalla no existe» de «existe pero tu no puedes verla». Por eso la
 * lista de palabras prohibidas incluye los nombres de modulo, y **se deriva de `PERMISSIONS`**
 * (campo `module`) en vez de escribirse a mano: un modulo nuevo en el catalogo entra solo en esta
 * guardia. Que el 404 salga envuelto por la barra lateral y el control de cerrar sesion (R8, R14)
 * lo demuestra el layout, no este archivo: es cosa de `private-layout-menu.test.tsx`.
 */

/** Marcas diacriticas combinantes (`NFD` las separa de su letra base). */
const DIACRITICOS = new RegExp('[\u0300-\u036f]', 'g');

/** Minusculas y sin acentos: «Página» no debe esconder una palabra prohibida. */
function normalizar(texto: string): string {
  return texto.toLowerCase().normalize('NFD').replace(DIACRITICOS, '');
}

/** Los modulos del catalogo de QC-74, sin repetir. Ninguno puede asomar en el copy. */
const MODULOS = Array.from(new Set(PERMISSIONS.map((permiso) => permiso.module)));

/** Todo lo que delataria que la pantalla existe pero esta vedada (R7). */
const PALABRAS_PROHIBIDAS = ['permiso', 'rol', 'autoriz', 'acceso', '403', ...MODULOS];

afterEach(() => {
  cleanup();
});

describe('404 de la zona privada', () => {
  it('se identifica con su data-testid y muestra un mensaje', () => {
    // R8: es la pantalla que el layout privado envuelve; el E2E la busca por este testId.
    render(<PrivateNotFound />);

    const pantalla = screen.getByTestId('private-not-found');
    expect(pantalla).toBeInTheDocument();
    expect(normalizar(pantalla.textContent ?? '')).not.toHaveLength(0);
  });

  it('no menciona permisos, roles, autorizacion ni ningun modulo del catalogo', () => {
    // R7 — el nucleo de la ficha: «sin permiso» y «no existe» tienen que leerse igual.
    const { container } = render(<PrivateNotFound />);

    const texto = normalizar(container.textContent ?? '');

    for (const prohibida of PALABRAS_PROHIBIDAS) {
      expect(texto, `el copy del 404 no debe contener «${prohibida}»`).not.toContain(
        normalizar(prohibida),
      );
    }
  });

  it('la lista de palabras prohibidas no esta vacia y trae los modulos del catalogo', () => {
    // Ancla anti-vacuidad: si `PERMISSIONS` cambiara de forma, el test de arriba pasaria a no
    // comprobar nada y nadie se enteraria.
    expect(MODULOS.length).toBeGreaterThanOrEqual(5);
    expect(MODULOS).toContain('inventario');
    expect(MODULOS).toContain('pedidos');
    expect(MODULOS).toContain('proveedores');
    expect(MODULOS).toContain('recetas');
    expect(MODULOS).toContain('dashboard');
  });

  it('no pinta ningun enlace: no delata a donde si se puede ir', () => {
    // R7 y `design.md > 2.3`: un enlace a «la primera pantalla disponible» exigiria resolver
    // permisos otra vez y su destino revelaria cuales tiene esa persona.
    render(<PrivateNotFound />);

    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });
});
