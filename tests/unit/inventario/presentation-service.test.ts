// T7 — Los cuatro casos de uso de presentacion, con dobles del puerto (`design.md > 3`, `> 7`).
//
// HONESTIDAD (obligatoria por el prompt de esta task): R20, R21 y R22 los cierran de verdad
// los tests de INTEGRACION contra Postgres (T14, `tests/integration/inventario/
// presentation-uniqueness.int.test.ts`): el indice unico y el `ON DELETE RESTRICT` son
// garantias de la base, no de este archivo. Lo que los tests de aqui demuestran es la
// TRADUCCION que hace el servicio del resultado discriminado que devuelve el puerto
// ('duplicate' -> PresentationDuplicateNameError, 'in_use' -> PresentationInUseError, 'deleted' -> exito,
// 'not_found' -> PresentationNotFoundError) usando dobles, nunca una base real. No se afirma aqui que R20,
// R21 o R22 queden cerrados por este archivo.

import { createCreatePresentation } from '@/lib/modules/inventario/domain/create-presentation';
import { createDeletePresentation } from '@/lib/modules/inventario/domain/delete-presentation';
import {
  PresentationDuplicateNameError,
  PresentationNotFoundError,
  PresentationInUseError,
  UnauthorizedError,
  ValidationError,
} from '@/lib/modules/inventario/domain/errors';
import { createListPresentations } from '@/lib/modules/inventario/domain/list-presentations';
import { normalizePresentationName } from '@/lib/modules/inventario/domain/presentation-name';
import { createUpdatePresentation } from '@/lib/modules/inventario/domain/update-presentation';

import type { Actor } from '@/lib/modules/inventario/domain/actor';
import type { Page } from '@/lib/modules/inventario/domain/page';
import type { PresentationView } from '@/lib/modules/inventario/domain/presentation-view';
import type { ListQueryLog } from '@/lib/modules/inventario/ports/list-query-log';
import type { PresentationRepository } from '@/lib/modules/inventario/ports/presentation-repository';

/** QC-74 (R18): el actor ya no trae nombre de rol, trae su conjunto de permisos. Este
 *  lleva los dos codigos de `inventario`, que es lo que el seed da al Administrador. */
const ADMIN: Actor = {
  id: 'actor-admin',
  permissions: ['inventario.consultar', 'inventario.modificar'],
};

/** QC-74 (R13, R14): actor con el conjunto VACIO. Sustituye al viejo "rol Operador": desde
 *  QC-74 el Operador SI tiene `inventario.consultar`, asi que ya no sirve como caso de rechazo. */
const SIN_PERMISO: Actor = { id: 'actor-sin-permiso', permissions: [] };

const PRESENTACION: PresentationView = {
  id: 'presentacion-1',
  name: 'Bidon 20 L',
  nameNormalized: 'bidon20l',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

const PAGINA_VACIA: Page<PresentationView> = {
  items: [],
  total: 0,
  page: 1,
  pageSize: 10,
  totalPages: 1,
};

/**
 * Doble del puerto que REGISTRA sus llamadas: se tipa con la firma de
 * `PresentationRepository` para que el compilador vigile los argumentos, y sus resultados
 * por defecto son los del camino feliz -cada test sobreescribe lo que necesite mutar.
 */
function montarRepositorio(
  overrides: Partial<{
    create: PresentationRepository['create'];
    rename: PresentationRepository['rename'];
    deleteById: PresentationRepository['deleteById'];
    list: PresentationRepository['list'];
  }> = {},
): PresentationRepository {
  return {
    create: overrides.create ?? vi.fn(async () => ({ id: PRESENTACION.id })),
    rename: overrides.rename ?? vi.fn(async () => 'ok' as const),
    deleteById: overrides.deleteById ?? vi.fn(async () => 'deleted' as const),
    list: overrides.list ?? vi.fn(async () => PAGINA_VACIA),
  };
}

describe('create-presentation', () => {
  it('persiste el nombre normalizado junto al nombre al crear y al renombrar', async () => {
    const create = vi.fn<PresentationRepository['create']>(async () => ({
      id: PRESENTACION.id,
    }));
    const rename = vi.fn<PresentationRepository['rename']>(async () => 'ok' as const);
    const presentations = montarRepositorio({ create, rename });

    const createPresentation = createCreatePresentation({ presentations });
    await createPresentation({ name: 'Bidon 20 L' }, ADMIN);

    expect(create).toHaveBeenCalledWith('Bidon 20 L', normalizePresentationName('Bidon 20 L'));
    expect(create).toHaveBeenCalledWith('Bidon 20 L', 'bidon20l');

    const updatePresentation = createUpdatePresentation({ presentations });
    await updatePresentation(PRESENTACION.id, { name: 'Bidon 20 Litros' }, ADMIN);

    expect(rename).toHaveBeenCalledWith(
      PRESENTACION.id,
      'Bidon 20 Litros',
      normalizePresentationName('Bidon 20 Litros'),
    );
  });

  it('rechaza la presentacion cuyo nombre normalizado ya existe', async () => {
    // El puerto devuelve 'duplicate' aunque no exista ninguna comprobacion previa: es
    // exactamente el escenario del indice unico rechazando una carrera perdida (§ 11.4
    // del design). El test demuestra la TRADUCCION del servicio, no el indice en si.
    const create = vi.fn<PresentationRepository['create']>(async () => 'duplicate' as const);
    const presentations = montarRepositorio({ create });
    const createPresentation = createCreatePresentation({ presentations });

    await expect(createPresentation({ name: 'Bidon 20 L' }, ADMIN)).rejects.toThrow(
      PresentationDuplicateNameError,
    );
  });

  it("un 'duplicate' devuelto por el puerto se traduce a PresentationDuplicateNameError aunque la comprobacion previa hubiera pasado", async () => {
    // No hay ninguna comprobacion previa en el propio caso de uso -por diseno, § 11.4-,
    // asi que esto ejercita exactamente lo mismo que el caso anterior desde el lado del
    // renombrado: el servicio nunca ignora un 'duplicate' del puerto.
    const rename = vi.fn<PresentationRepository['rename']>(async () => 'duplicate' as const);
    const presentations = montarRepositorio({ rename });
    const updatePresentation = createUpdatePresentation({ presentations });

    await expect(
      updatePresentation(PRESENTACION.id, { name: 'Bidon 20 L' }, ADMIN),
    ).rejects.toThrow(PresentationDuplicateNameError);
  });

  it('rechaza el nombre invalido antes de llamar al puerto', async () => {
    const create = vi.fn<PresentationRepository['create']>(async () => ({
      id: PRESENTACION.id,
    }));
    const presentations = montarRepositorio({ create });
    const createPresentation = createCreatePresentation({ presentations });

    // '---' normaliza a la cadena vacia: R37 lo rechaza como nombre invalido en el
    // esquema zod, ANTES de tocar el repositorio.
    await expect(createPresentation({ name: '---' }, ADMIN)).rejects.toThrow(ValidationError);
    expect(create).not.toHaveBeenCalled();
  });
});

describe('update-presentation', () => {
  it('devuelve no encontrado al renombrar una presentacion inexistente', async () => {
    const rename = vi.fn<PresentationRepository['rename']>(async () => 'not_found' as const);
    const presentations = montarRepositorio({ rename });
    const updatePresentation = createUpdatePresentation({ presentations });

    await expect(
      updatePresentation('inexistente', { name: 'Bidon 20 L' }, ADMIN),
    ).rejects.toThrow(PresentationNotFoundError);
  });

  it('rechaza la entrada invalida antes de llamar al puerto', async () => {
    const rename = vi.fn<PresentationRepository['rename']>(async () => 'ok' as const);
    const presentations = montarRepositorio({ rename });
    const updatePresentation = createUpdatePresentation({ presentations });

    await expect(
      updatePresentation(PRESENTACION.id, { name: '   ' }, ADMIN),
    ).rejects.toThrow(ValidationError);
    expect(rename).not.toHaveBeenCalled();
  });
});

describe('delete-presentation', () => {
  it("traduce 'in_use' del puerto a PresentationInUseError (R21, garantia real de integracion)", async () => {
    const deleteById = vi.fn<PresentationRepository['deleteById']>(
      async () => 'in_use' as const,
    );
    const presentations = montarRepositorio({ deleteById });
    const deletePresentation = createDeletePresentation({ presentations });

    await expect(deletePresentation(PRESENTACION.id, ADMIN)).rejects.toThrow(
      PresentationInUseError,
    );
  });

  it("traduce 'deleted' del puerto en exito (R22, borrado fisico; garantia real de integracion)", async () => {
    const deleteById = vi.fn<PresentationRepository['deleteById']>(
      async () => 'deleted' as const,
    );
    const presentations = montarRepositorio({ deleteById });
    const deletePresentation = createDeletePresentation({ presentations });

    await expect(deletePresentation(PRESENTACION.id, ADMIN)).resolves.toBeUndefined();
  });

  it('devuelve no encontrado al borrar una presentacion inexistente', async () => {
    const deleteById = vi.fn<PresentationRepository['deleteById']>(
      async () => 'not_found' as const,
    );
    const presentations = montarRepositorio({ deleteById });
    const deletePresentation = createDeletePresentation({ presentations });

    await expect(deletePresentation('inexistente', ADMIN)).rejects.toThrow(PresentationNotFoundError);
  });
});

/** Doble del puerto del log de campos omitidos (QC-57 T7). */
function logDoble(): ListQueryLog {
  return { ignoredFields: vi.fn<ListQueryLog['ignoredFields']>() };
}

describe('list-presentations', () => {
  it('delega la consulta valida en el puerto', async () => {
    const list = vi.fn<PresentationRepository['list']>(async () => PAGINA_VACIA);
    const presentations = montarRepositorio({ list });
    const listPresentations = createListPresentations({ presentations, log: logDoble() });

    const resultado = await listPresentations({ page: 1 }, ADMIN);

    expect(resultado).toBe(PAGINA_VACIA);
    // QC-57: lo que llega al puerto es la consulta del contrato generico ya saneada, con sus
    // defectos aplicados -no el `{ page: 1 }` crudo del llamante-.
    expect(list).toHaveBeenCalledWith({ page: 1, sort: null, filters: {}, search: '' });
  });

  it('rechaza una consulta con pagina invalida antes de llamar al puerto', async () => {
    const list = vi.fn<PresentationRepository['list']>(async () => PAGINA_VACIA);
    const presentations = montarRepositorio({ list });
    const listPresentations = createListPresentations({ presentations, log: logDoble() });

    await expect(listPresentations({ page: 0 }, ADMIN)).rejects.toThrow(ValidationError);
    expect(list).not.toHaveBeenCalled();
  });
});

describe('autorizacion de los cuatro casos de uso (complemento a T8)', () => {
  it('rechaza al actor sin permiso en crear, renombrar, borrar y listar sin llamar al puerto', async () => {
    const presentations = montarRepositorio();
    const createPresentation = createCreatePresentation({ presentations });
    const updatePresentation = createUpdatePresentation({ presentations });
    const deletePresentation = createDeletePresentation({ presentations });
    const listPresentations = createListPresentations({ presentations, log: logDoble() });

    await expect(createPresentation({ name: 'Bidon 20 L' }, SIN_PERMISO)).rejects.toThrow(
      UnauthorizedError,
    );
    await expect(
      updatePresentation(PRESENTACION.id, { name: 'Bidon 20 L' }, SIN_PERMISO),
    ).rejects.toThrow(UnauthorizedError);
    await expect(deletePresentation(PRESENTACION.id, SIN_PERMISO)).rejects.toThrow(
      UnauthorizedError,
    );
    await expect(listPresentations({ page: 1 }, SIN_PERMISO)).rejects.toThrow(UnauthorizedError);

    expect(presentations.create).not.toHaveBeenCalled();
    expect(presentations.rename).not.toHaveBeenCalled();
    expect(presentations.deleteById).not.toHaveBeenCalled();
    expect(presentations.list).not.toHaveBeenCalled();
  });
});
