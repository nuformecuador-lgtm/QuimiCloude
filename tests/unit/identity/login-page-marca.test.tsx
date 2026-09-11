// QC-78 T27 — La segunda mitad de R30 (a): «la pantalla de login DEBE renderizarse **igual** con
// la marca y sin ella: ni mensaje, ni aviso, ni cambio visible alguno».
//
// Por que existe este archivo (review de F2.2, menor 3). Esa mitad del requisito se sostenia con
// dos cosas que NO son ella: un argumento estructural —la pagina solo lee el parametro de destino
// de vuelta e ignora el resto de la cadena de consulta— y el paso 5 del E2E, que comprueba que no
// aparece ningun toast. Las dos son ciertas y ninguna es la IGUALDAD que el requisito pide. Aqui
// se compara el marcado de verdad.
//
// Por que importa y no es celo: la marca viaja en la barra de direcciones, donde la ve el usuario
// y cualquiera que mire por encima del hombro. Si algun dia alguien la usara para pintar un «tu
// sesion ha caducado» o un «cuenta inactiva», la URL pasaria a distinguir por que no hay sesion, y
// eso es exactamente el oraculo que R3 lleva toda la ficha evitando: confirmaria que esa cuenta
// existe. El requisito no pide discrecion por elegancia.
import { render } from '@testing-library/react';

import LoginPage from '@/app/(public)/login/page';
import { RETURN_PARAM } from '@/lib/modules/identity/domain/return-path';
import { SESSION_ENDED_PARAM } from '@/lib/shared/routes';

/**
 * Renderiza la pantalla con la cadena de consulta pedida y devuelve su marcado.
 *
 * `LoginPage` es un Server Component `async`: se invoca como funcion y se espera su elemento, en
 * vez de montarlo con `<LoginPage />`. Es lo que ya hace `tests/unit/login-skin.test.tsx`.
 */
async function marcadoDelLogin(searchParams: Record<string, string>): Promise<string> {
  const elemento = await LoginPage({ searchParams: Promise.resolve(searchParams) });
  const { container, unmount } = render(elemento);
  const marcado = container.innerHTML;
  unmount();
  return marcado;
}

describe('R30 (a) — el login se renderiza IGUAL con la marca y sin ella', () => {
  it('el marcado con la marca es identico al marcado sin ella', async () => {
    const sinMarca = await marcadoDelLogin({});
    const conMarca = await marcadoDelLogin({ [SESSION_ENDED_PARAM]: 'fin' });

    // Primero: que se haya renderizado algo. Comparar dos cadenas vacias pasaria en verde sin
    // haber mirado nada, que es la forma mas facil de que este test mienta.
    expect(sinMarca.length).toBeGreaterThan(100);
    expect(sinMarca).toContain('data-login="screen"');

    expect(
      conMarca,
      'la marca no puede cambiar NI UN BYTE de la pantalla: si la pantalla la leyera para avisar ' +
        'de algo, la URL pasaria a decir por que no hay sesion, que es el oraculo que R3 evita',
    ).toBe(sinMarca);
  });

  it('tampoco cambia con otro valor de la marca, ni con la marca sin valor', async () => {
    const sinMarca = await marcadoDelLogin({});

    for (const valor of ['fin', '', 'loquesea']) {
      expect(await marcadoDelLogin({ [SESSION_ENDED_PARAM]: valor }), valor).toBe(sinMarca);
    }
  });

  // EL CONTROL, y sin el los dos casos de arriba no valdrian nada: hay que demostrar que esta
  // comparacion SABE detectar una diferencia. Si el marcado fuera insensible a la cadena de
  // consulta entera —porque el render fallara, porque devolviera siempre lo mismo—, los `toBe` de
  // arriba pasarian por la razon equivocada. El destino de vuelta SI viaja al marcado (va en el
  // campo oculto del formulario), asi que sirve de testigo.
  it('el destino de vuelta SI cambia el marcado: la comparacion detecta diferencias', async () => {
    const sinNada = await marcadoDelLogin({});
    const conDestino = await marcadoDelLogin({ [RETURN_PARAM]: '/inventario' });

    expect(conDestino).not.toBe(sinNada);
    expect(conDestino).toContain('/inventario');
  });
});
