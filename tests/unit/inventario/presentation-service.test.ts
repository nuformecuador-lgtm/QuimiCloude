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
  PresentationUnitLockedError,
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
/** QC-49 (R11): la empresa EN CUYO NOMBRE opera el actor. El caso de uso la convierte en
 *  `InventoryScope` y se la pasa al puerto; no autoriza nada por si sola. */
const EMPRESA = 'company-a';

const ADMIN: Actor = {
  id: 'actor-admin',
  companyId: EMPRESA,
  permissions: ['inventario.consultar', 'inventario.modificar'],
};

/** QC-74 (R13, R14): actor con el conjunto VACIO. Sustituye al viejo "rol Operador": desde
 *  QC-74 el Operador SI tiene `inventario.consultar`, asi que ya no sirve como caso de rechazo. */
const SIN_PERMISO: Actor = { id: 'actor-sin-permiso', companyId: EMPRESA, permissions: [] };

/** QC-80: la unidad de la presentacion, uuid de una fila de `units`. Aqui es un doble; que
 *  exista de verdad lo cierra la FK, no este archivo. */
const UNIDAD = '11111111-1111-4111-8111-111111111111';
const OTRA_UNIDAD = '22222222-2222-4222-8222-222222222222';

const PRESENTACION: PresentationView = {
  id: 'presentacion-1',
  name: 'Bidon 20 L',
  nameNormalized: 'bidon20l',
  unitId: UNIDAD,
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
    replace: PresentationRepository['replace'];
    deleteById: PresentationRepository['deleteById'];
    list: PresentationRepository['list'];
  }> = {},
): PresentationRepository {
  return {
    create: overrides.create ?? vi.fn(async () => ({ id: PRESENTACION.id })),
    replace: overrides.replace ?? vi.fn(async () => 'ok' as const),
    deleteById: overrides.deleteById ?? vi.fn(async () => 'deleted' as const),
    list: overrides.list ?? vi.fn(async () => PAGINA_VACIA),
  };
}

describe('create-presentation', () => {
  it('persiste el nombre normalizado junto al nombre y a la unidad, en la misma escritura (R11)', async () => {
    const create = vi.fn<PresentationRepository['create']>(async () => ({
      id: PRESENTACION.id,
    }));
    const replace = vi.fn<PresentationRepository['replace']>(async () => 'ok' as const);
    const presentations = montarRepositorio({ create, replace });

    const createPresentation = createCreatePresentation({ presentations });
    await createPresentation({ name: 'Bidon 20 L', unitId: UNIDAD }, ADMIN);

    // QC-80 (R11): los tres campos viajan JUNTOS en una unica llamada al puerto. No existe
    // ninguna segunda escritura que anada la unidad despues.
    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith(
      {
        name: 'Bidon 20 L',
        nameNormalized: normalizePresentationName('Bidon 20 L'),
        unitId: UNIDAD,
      },
      { companyId: EMPRESA },
    );
    expect(create).toHaveBeenCalledWith(
      { name: 'Bidon 20 L', nameNormalized: 'bidon20l', unitId: UNIDAD },
      { companyId: EMPRESA },
    );

    const updatePresentation = createUpdatePresentation({ presentations });
    await updatePresentation(
      PRESENTACION.id,
      { name: 'Bidon 20 Litros', unitId: UNIDAD },
      ADMIN,
    );

    expect(replace).toHaveBeenCalledWith(
      PRESENTACION.id,
      {
        name: 'Bidon 20 Litros',
        nameNormalized: normalizePresentationName('Bidon 20 Litros'),
        unitId: UNIDAD,
      },
      { companyId: EMPRESA },
    );
  });

  it('rechaza el alta SIN unidad antes de llamar al puerto (R10)', async () => {
    const create = vi.fn<PresentationRepository['create']>(async () => ({
      id: PRESENTACION.id,
    }));
    const presentations = montarRepositorio({ create });
    const createPresentation = createCreatePresentation({ presentations });

    await expect(createPresentation({ name: 'Bidon 20 L' }, ADMIN)).rejects.toThrow(
      ValidationError,
    );
    await expect(
      createPresentation({ name: 'Bidon 20 L', unitId: '' }, ADMIN),
    ).rejects.toThrow(ValidationError);
    expect(create).not.toHaveBeenCalled();
  });

  it("traduce 'invalid_unit' a ValidationError, DISTINGUIBLE del duplicado (R13)", async () => {
    // La FK `presentations_unit_id_fkey` es la que detecta que esa unidad no existe -no hay
    // ningun SELECT previo, § 4.2-, y el puerto lo devuelve como resultado discriminado. El
    // caso de uso lo traduce a `invalid_input`, que es como el modulo trata una FK rota, y
    // NUNCA a `PresentationDuplicateNameError`: son dos arreglos distintos para el usuario.
    const create = vi.fn<PresentationRepository['create']>(async () => 'invalid_unit' as const);
    const presentations = montarRepositorio({ create });
    const createPresentation = createCreatePresentation({ presentations });

    const fallo = createPresentation({ name: 'Bidon 20 L', unitId: OTRA_UNIDAD }, ADMIN);

    await expect(fallo).rejects.toThrow(ValidationError);
    await expect(
      createPresentation({ name: 'Bidon 20 L', unitId: OTRA_UNIDAD }, ADMIN),
    ).rejects.not.toBeInstanceOf(PresentationDuplicateNameError);
  });

  it('rechaza la presentacion cuyo nombre normalizado ya existe', async () => {
    // El puerto devuelve 'duplicate' aunque no exista ninguna comprobacion previa: es
    // exactamente el escenario del indice unico rechazando una carrera perdida (§ 11.4
    // del design). El test demuestra la TRADUCCION del servicio, no el indice en si.
    const create = vi.fn<PresentationRepository['create']>(async () => 'duplicate' as const);
    const presentations = montarRepositorio({ create });
    const createPresentation = createCreatePresentation({ presentations });

    await expect(
      createPresentation({ name: 'Bidon 20 L', unitId: UNIDAD }, ADMIN),
    ).rejects.toThrow(PresentationDuplicateNameError);
  });

  it("un 'duplicate' devuelto por el puerto se traduce a PresentationDuplicateNameError aunque la comprobacion previa hubiera pasado", async () => {
    // No hay ninguna comprobacion previa en el propio caso de uso -por diseno, § 11.4-,
    // asi que esto ejercita exactamente lo mismo que el caso anterior desde el lado del
    // renombrado: el servicio nunca ignora un 'duplicate' del puerto.
    const replace = vi.fn<PresentationRepository['replace']>(async () => 'duplicate' as const);
    const presentations = montarRepositorio({ replace });
    const updatePresentation = createUpdatePresentation({ presentations });

    await expect(
      updatePresentation(PRESENTACION.id, { name: 'Bidon 20 L', unitId: UNIDAD }, ADMIN),
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
    await expect(createPresentation({ name: '---', unitId: UNIDAD }, ADMIN)).rejects.toThrow(
      ValidationError,
    );
    expect(create).not.toHaveBeenCalled();
  });
});

describe('update-presentation', () => {
  it('devuelve no encontrado al editar una presentacion inexistente', async () => {
    const replace = vi.fn<PresentationRepository['replace']>(async () => 'not_found' as const);
    const presentations = montarRepositorio({ replace });
    const updatePresentation = createUpdatePresentation({ presentations });

    await expect(
      updatePresentation('inexistente', { name: 'Bidon 20 L', unitId: UNIDAD }, ADMIN),
    ).rejects.toThrow(PresentationNotFoundError);
  });

  it('rechaza la entrada invalida antes de llamar al puerto', async () => {
    const replace = vi.fn<PresentationRepository['replace']>(async () => 'ok' as const);
    const presentations = montarRepositorio({ replace });
    const updatePresentation = createUpdatePresentation({ presentations });

    await expect(
      updatePresentation(PRESENTACION.id, { name: '   ', unitId: UNIDAD }, ADMIN),
    ).rejects.toThrow(ValidationError);
    expect(replace).not.toHaveBeenCalled();
  });

  it('REEMPLAZA la unidad: la que llega es la que se escribe, no la anterior (R12)', async () => {
    // La edicion es reemplazo completo desde QC-20 y QC-80 la extiende a la unidad: el caso de
    // uso no lee la unidad vieja ni la conserva -no tiene forma de hacerlo, el puerto no
    // expone ninguna lectura por id-.
    const replace = vi.fn<PresentationRepository['replace']>(async () => 'ok' as const);
    const presentations = montarRepositorio({ replace });
    const updatePresentation = createUpdatePresentation({ presentations });

    await updatePresentation(
      PRESENTACION.id,
      { name: PRESENTACION.name, unitId: OTRA_UNIDAD },
      ADMIN,
    );

    expect(replace).toHaveBeenCalledWith(
      PRESENTACION.id,
      {
        name: PRESENTACION.name,
        nameNormalized: PRESENTACION.nameNormalized,
        unitId: OTRA_UNIDAD,
      },
      { companyId: EMPRESA },
    );
    expect(replace.mock.calls[0]?.[1].unitId).not.toBe(PRESENTACION.unitId);
  });

  it('rechaza la edicion SIN unidad antes de llamar al puerto (R10, R12)', async () => {
    const replace = vi.fn<PresentationRepository['replace']>(async () => 'ok' as const);
    const presentations = montarRepositorio({ replace });
    const updatePresentation = createUpdatePresentation({ presentations });

    await expect(
      updatePresentation(PRESENTACION.id, { name: 'Bidon 20 L' }, ADMIN),
    ).rejects.toThrow(ValidationError);
    expect(replace).not.toHaveBeenCalled();
  });

  it("traduce 'invalid_unit' de la edicion a ValidationError (R13)", async () => {
    const replace = vi.fn<PresentationRepository['replace']>(
      async () => 'invalid_unit' as const,
    );
    const presentations = montarRepositorio({ replace });
    const updatePresentation = createUpdatePresentation({ presentations });

    await expect(
      updatePresentation(PRESENTACION.id, { name: 'Bidon 20 L', unitId: OTRA_UNIDAD }, ADMIN),
    ).rejects.toThrow(ValidationError);
  });

  it("traduce 'unit_locked' a PresentationUnitLockedError, DISTINGUIBLE de ValidationError, sin exigir mas permiso que inventario.modificar (R20, R24)", async () => {
    const replace = vi.fn<PresentationRepository['replace']>(
      async () => 'unit_locked' as const,
    );
    const presentations = montarRepositorio({ replace });
    const updatePresentation = createUpdatePresentation({ presentations });

    const fallo = updatePresentation(
      PRESENTACION.id,
      { name: PRESENTACION.name, unitId: OTRA_UNIDAD },
      ADMIN,
    );

    await expect(fallo).rejects.toBeInstanceOf(PresentationUnitLockedError);
    await expect(
      updatePresentation(PRESENTACION.id, { name: PRESENTACION.name, unitId: OTRA_UNIDAD }, ADMIN),
    ).rejects.not.toBeInstanceOf(ValidationError);
    expect(new PresentationUnitLockedError().code).toBe('presentation_unit_locked');
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
    expect(list).toHaveBeenCalledWith(
      { page: 1, sort: null, filters: {}, search: '' },
      { companyId: EMPRESA },
    );
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
  // R14: `requirePermission` es la PRIMERA linea, antes de zod y antes del puerto. La prueba
  // es que el actor sin permiso no produce NI UNA sola llamada al repositorio, ni siquiera con
  // una entrada perfectamente valida como la de aqui.
  it('rechaza al actor sin permiso en crear, editar, borrar y listar sin llamar al puerto (R14)', async () => {
    const presentations = montarRepositorio();
    const createPresentation = createCreatePresentation({ presentations });
    const updatePresentation = createUpdatePresentation({ presentations });
    const deletePresentation = createDeletePresentation({ presentations });
    const listPresentations = createListPresentations({ presentations, log: logDoble() });

    await expect(
      createPresentation({ name: 'Bidon 20 L', unitId: UNIDAD }, SIN_PERMISO),
    ).rejects.toThrow(UnauthorizedError);
    await expect(
      updatePresentation(PRESENTACION.id, { name: 'Bidon 20 L', unitId: UNIDAD }, SIN_PERMISO),
    ).rejects.toThrow(UnauthorizedError);
    await expect(deletePresentation(PRESENTACION.id, SIN_PERMISO)).rejects.toThrow(
      UnauthorizedError,
    );
    await expect(listPresentations({ page: 1 }, SIN_PERMISO)).rejects.toThrow(UnauthorizedError);

    expect(presentations.create).not.toHaveBeenCalled();
    expect(presentations.replace).not.toHaveBeenCalled();
    expect(presentations.deleteById).not.toHaveBeenCalled();
    expect(presentations.list).not.toHaveBeenCalled();
  });
});
