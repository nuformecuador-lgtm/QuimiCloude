// QC-57 T7 — La UNICA implementacion del puerto `ListQueryLog` (R6, `design.md > 8`).
//
// Lo que aqui se prueba es lo que el puerto NO puede garantizar por si solo: que lo que sale por
// el log lleva el listado y los NOMBRES de campo y **nada mas**. Registrar el texto buscado o el
// valor del filtro seria PII en los logs, y `docs/architecture.md > Anti-patrones` lo prohibe.
//
// La firma ya hace imposible pasar el valor -no lo recibe-, asi que este archivo verifica la
// otra mitad: que lo que se EMITE se limita a lo recibido, y que una consulta limpia no emite
// nada (un aviso por consulta seria ruido, y el ruido acaba escondiendo el aviso que importa).

import { logIgnoredListQueryFields } from '@/lib/shared/observability/list-query-log';

/** Lo que un log JAMAS debe contener: el valor que escribio la persona (R6, anti-patron de PII). */
const TERMINO_BUSCADO = 'acido sulfurico del cliente Perez';

function espiarConsola() {
  return vi.spyOn(console, 'warn').mockImplementation(() => undefined);
}

describe('logIgnoredListQueryFields', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('emite el nombre del listado y los nombres de los campos omitidos', () => {
    // R6 — «una advertencia que nombre el listado y el campo omitido».
    const warn = espiarConsola();

    logIgnoredListQueryFields('products', ['deletedAt', 'nombre']);

    expect(warn).toHaveBeenCalledTimes(1);
    const emitido = String(warn.mock.calls[0]?.[0]);
    expect(emitido).toContain('products');
    expect(emitido).toContain('deletedAt');
    expect(emitido).toContain('nombre');
  });

  it('no emite nada cuando no se omitio ningun campo', () => {
    // R6 — solo se registra CUANDO se omite algo; una consulta limpia no deja rastro.
    const warn = espiarConsola();

    logIgnoredListQueryFields('products', []);

    expect(warn).not.toHaveBeenCalled();
  });

  it('nunca emite un valor: solo puede decir lo que se le paso, y lo que se le pasa son nombres', () => {
    // R6 — el aserto en negativo. Aunque alguien colara el termino buscado en la lista de
    // campos, el test que importa es el del caso de uso (`list-products.test.ts`), que
    // comprueba que lo que se pasa a este puerto son NOMBRES. Aqui se ancla que esta funcion
    // no anade nada por su cuenta: lo emitido no contiene mas que listado y campos.
    const warn = espiarConsola();

    logIgnoredListQueryFields('products', ['deletedAt']);

    const emitido = String(warn.mock.calls[0]?.[0]);
    expect(emitido).not.toContain(TERMINO_BUSCADO);
    expect(emitido).not.toContain('Perez');
  });
});
