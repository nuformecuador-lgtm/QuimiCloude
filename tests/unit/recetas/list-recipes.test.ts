// QC-57 T10 — El caso de uso de listado de RECETAS con el CONTRATO GENERICO de consulta, con el
// repositorio y el log MOCKEADOS (`design.md > 1`, `> 12`).
//
// Cubre R5, R6, R7, R8, R11, R13, R15, R16, R20, R30, R33 y R34. Lo que NO se prueba aqui es
// como se traduce la consulta a SQL: eso es de `tests/integration/recetas/` -un doble del puerto
// no puede demostrar que la base filtro antes de paginar-.
//
// EL TEST QUE NO PUEDE FALTAR (`design.md > 12`): pedir orden por `deletedAt` y comprobar LAS
// TRES COSAS A LA VEZ -que la consulta no falla, que el orden aplicado es el de por defecto y
// que el log recibio el campo-. Comprobar solo la primera pasa en verde con un `catch` vacio.
//
// Y una propia de este listado: **la inyeccion de `toOffsetLimit`/`buildPage` se CONSERVA**
// (R40 de QC-26). Hay un caso que lo afirma contando las invocaciones de los dos dobles: si
// alguien la sustituyera por una llamada directa a `lib/shared/pagination`, el dominio pasaria a
// importar `lib/shared/**` y este archivo se pondria rojo antes que la guardia.

import type { Actor } from '@/lib/modules/recetas/domain/actor';
import { UnauthorizedError, ValidationError } from '@/lib/modules/recetas/domain/errors';
import { createListRecipes } from '@/lib/modules/recetas/domain/list-recipes';

import type { ListQuery } from '@/lib/modules/recetas/domain/list-query';
import type { Page } from '@/lib/modules/recetas/domain/page';
import type { RecipeScope } from '@/lib/modules/recetas/domain/recipe-scope';
import type { ListQueryLog } from '@/lib/modules/recetas/ports/list-query-log';
import type { RecipeImageStorage } from '@/lib/modules/recetas/ports/recipe-image-storage';
import type { RecipeRepository } from '@/lib/modules/recetas/ports/recipe-repository';

/** La empresa desde la que se lista, siempre la del actor (QC-50). */
const EMPRESA = 'empresa-1';

// QC-74 (R16, R18): el actor ya no lleva nombre de rol, lleva el conjunto de permisos.
// Los dos codigos de `recetas`, que es lo que exigen los cinco casos de uso.
const ADMIN: Actor = {
  id: 'admin-1',
  companyId: EMPRESA,
  permissions: ['recetas.consultar', 'recetas.modificar'],
};
// QC-74 (R13): tiene `recetas.modificar` y NADA mas. Modificar NO concede consultar.
const SIN_PERMISO_DE_CONSULTA: Actor = {
  id: 'sin-consulta-1',
  companyId: EMPRESA,
  permissions: ['recetas.modificar'],
};

function montar() {
  const listAlive = vi.fn<RecipeRepository['listAlive']>(async () => ({ rows: [], total: 0 }));
  const recipes = {
    create: vi.fn<RecipeRepository['create']>(),
    findAliveById: vi.fn<RecipeRepository['findAliveById']>(),
    listAlive,
    replaceAlive: vi.fn<RecipeRepository['replaceAlive']>(),
    softDeleteAlive: vi.fn<RecipeRepository['softDeleteAlive']>(),
  } satisfies RecipeRepository;
  const images: RecipeImageStorage = {
    upload: vi.fn(),
    remove: vi.fn(),
    publicUrl: vi.fn(() => 'https://example.test/imagen.jpg'),
  };
  const log: ListQueryLog = { ignoredFields: vi.fn<ListQueryLog['ignoredFields']>() };
  /** Los mismos dobles de aritmetica que usa el resto de la suite de `recetas`. */
  const toOffsetLimit = vi.fn((page: number, pageSize?: number) => ({
    offset: (page - 1) * (pageSize ?? 10),
    limit: pageSize ?? 10,
  }));
  /** `buildPage` es GENERICA y `vi.fn` no puede tipar un generico sin perderlo, asi que las
   *  invocaciones se anotan a mano: es lo mismo que espiar, sin `any` ni cast. */
  const llamadasDeBuildPage: Array<{
    items: number;
    total: number;
    page: number;
    pageSize: number;
  }> = [];
  function buildPage<T>(
    items: readonly T[],
    total: number,
    page: number,
    pageSize: number,
  ): Page<T> {
    llamadasDeBuildPage.push({ items: items.length, total, page, pageSize });
    return { items, total, page, pageSize, totalPages: 1 };
  }

  return {
    recipes,
    images,
    log,
    toOffsetLimit,
    llamadasDeBuildPage,
    listRecipes: createListRecipes({ recipes, images, log, toOffsetLimit, buildPage }),
  };
}

/** La consulta que llego al puerto en la ultima llamada (tercer argumento de `listAlive`). */
function consultaRecibida(
  recibidas: readonly (readonly [number, number, ListQuery, RecipeScope])[],
): ListQuery {
  const ultima = recibidas.at(-1);
  if (ultima === undefined) throw new Error('el puerto no fue llamado');
  return ultima[2];
}

/** El scope de empresa que llego al puerto en la ultima llamada (cuarto argumento). */
function scopeRecibido(
  recibidas: readonly (readonly [number, number, ListQuery, RecipeScope])[],
): RecipeScope {
  const ultima = recibidas.at(-1);
  if (ultima === undefined) throw new Error('el puerto no fue llamado');
  return ultima[3];
}

describe('list-recipes: autorizacion antes que todo (R33, R34)', () => {
  // R34 exige probarlo DOS veces: con una consulta valida y con una que traiga campos no
  // declarados. Si el permiso se comprobara despues de sanear, el segundo caso fallaria por
  // otro motivo y nadie lo notaria.
  const CONSULTAS: ReadonlyArray<{ readonly nombre: string; readonly entrada: unknown }> = [
    { nombre: 'consulta valida', entrada: { page: 1, pageSize: 10 } },
    {
      nombre: 'consulta con campos no declarados',
      entrada: {
        sort: { columnId: 'deletedAt', direction: 'asc' },
        filters: { nombre: { kind: 'text', value: 'x' } },
      },
    },
  ];

  for (const caso of CONSULTAS) {
    it(`rechaza a quien no tiene recetas.consultar con ${caso.nombre} sin tocar el repositorio`, async () => {
      // R34 — se afirma CONTANDO invocaciones del doble, no solo mirando que lanza.
      // QC-74 R13: el actor tiene `recetas.modificar`, que no abre la lectura.
      const { recipes, log, listRecipes } = montar();

      await expect(listRecipes(caso.entrada, SIN_PERMISO_DE_CONSULTA)).rejects.toBeInstanceOf(UnauthorizedError);
      expect(recipes.listAlive).toHaveBeenCalledTimes(0);
      expect(log.ignoredFields).toHaveBeenCalledTimes(0);
    });

    it(`rechaza al actor ausente con ${caso.nombre} sin tocar el repositorio`, async () => {
      // R34 — sin actor es el mismo caso que con un conjunto de permisos insuficiente.
      const { recipes, log, listRecipes } = montar();

      await expect(listRecipes(caso.entrada, null)).rejects.toBeInstanceOf(UnauthorizedError);
      expect(recipes.listAlive).toHaveBeenCalledTimes(0);
      expect(log.ignoredFields).toHaveBeenCalledTimes(0);
    });
  }
});

describe('list-recipes: el campo no declarado se omite, no rompe y se anota (R5, R6, R7, R8, R11)', () => {
  it('ordenar por deletedAt: no falla, aplica el orden por defecto Y el log recibe el campo', async () => {
    // R5 + R7 + R11 + R6, LAS TRES COSAS A LA VEZ (`design.md > 12`).
    const { recipes, log, listRecipes } = montar();

    const pagina = await listRecipes(
      { page: 1, sort: { columnId: 'deletedAt', direction: 'desc' } },
      ADMIN,
    );

    // (a) la consulta NO falla
    expect(pagina.items).toEqual([]);
    // (b) el orden aplicado es el de por defecto: `sort: null` -quien lo traduce a
    //     `name ASC, id ASC` es el adaptador (R11)-
    expect(recipes.listAlive).toHaveBeenCalledTimes(1);
    expect(consultaRecibida(recipes.listAlive.mock.calls).sort).toBeNull();
    // (c) el log recibio el campo, con el nombre del listado
    expect(log.ignoredFields).toHaveBeenCalledWith('recipes', ['deletedAt']);
  });

  it('un filtro con la forma equivocada se omite y se anota, sin fallar (R8)', async () => {
    // R8 — `createdAt` es `dateRange`; pedirlo como texto no puede romper la consulta.
    const { recipes, log, listRecipes } = montar();

    await listRecipes({ filters: { createdAt: { kind: 'text', value: '2026' } } }, ADMIN);

    expect(consultaRecibida(recipes.listAlive.mock.calls).filters).toEqual({});
    expect(log.ignoredFields).toHaveBeenCalledWith('recipes', ['createdAt']);
  });

  it('el log recibe NOMBRES de campo y nunca el valor buscado ni el del filtro (R6, PII)', async () => {
    // R6 + anti-patron de PII: lo que se registra no puede contener lo que la persona escribio.
    const TERMINO = 'formula del cliente Perez';
    const VALOR_DE_FILTRO = 'cliente-secreto';
    const { log, listRecipes } = montar();

    await listRecipes(
      {
        search: TERMINO,
        sort: { columnId: 'inventado', direction: 'asc' },
        filters: { tambienInventado: { kind: 'select', values: [VALOR_DE_FILTRO] } },
      },
      ADMIN,
    );

    expect(log.ignoredFields).toHaveBeenCalledTimes(1);
    const argumentos = JSON.stringify(vi.mocked(log.ignoredFields).mock.calls[0]);
    expect(argumentos).toContain('inventado');
    expect(argumentos).toContain('tambienInventado');
    expect(argumentos).not.toContain(TERMINO);
    expect(argumentos).not.toContain(VALOR_DE_FILTRO);
  });

  it('una consulta limpia tambien llama al log, pero con la lista vacia (R6)', async () => {
    const { log, listRecipes } = montar();

    await listRecipes({ page: 1, sort: { columnId: 'name', direction: 'asc' } }, ADMIN);

    expect(log.ignoredFields).toHaveBeenCalledWith('recipes', []);
  });
});

describe('list-recipes: lo que llega al repositorio (R11, R13, R15, R16, R20, R30)', () => {
  it('sin orden, la consulta llega con sort nulo: el orden de hoy (R11)', async () => {
    const { recipes, listRecipes } = montar();

    await listRecipes({ page: 3, pageSize: 25 }, ADMIN);

    expect(consultaRecibida(recipes.listAlive.mock.calls)).toEqual({
      page: 3,
      pageSize: 25,
      sort: null,
      filters: {},
      search: '',
    });
    // QC-50: la empresa que llega al puerto es la del actor, nunca una elegida por la entrada.
    expect(scopeRecibido(recipes.listAlive.mock.calls)).toEqual({ companyId: EMPRESA });
  });

  it('la busqueda del contrato llega intacta al repositorio (R16)', async () => {
    const { recipes, log, listRecipes } = montar();

    await listRecipes({ page: 1, pageSize: 25, search: 'solucion' }, ADMIN);

    expect(consultaRecibida(recipes.listAlive.mock.calls).search).toBe('solucion');
    expect(log.ignoredFields).toHaveBeenCalledWith('recipes', []);
  });

  it('una busqueda de solo espacios es ausencia de busqueda (R20)', async () => {
    const { recipes, listRecipes } = montar();

    await listRecipes({ search: '   ' }, ADMIN);

    expect(consultaRecibida(recipes.listAlive.mock.calls).search).toBe('');
  });

  it('el filtro declarado llega intacto, junto con el orden (R13, R15)', async () => {
    // R15 — la conjuncion la aplica el motor; lo que este nivel puede afirmar es que el filtro
    // declarado llega ENTERO al puerto, junto al orden, en la misma consulta.
    const { recipes, listRecipes } = montar();

    await listRecipes(
      {
        sort: { columnId: 'createdAt', direction: 'desc' },
        filters: { createdAt: { kind: 'dateRange', from: '2026-01-01', to: '2026-01-31' } },
      },
      ADMIN,
    );

    const query = consultaRecibida(recipes.listAlive.mock.calls);
    expect(query.sort).toEqual({ columnId: 'createdAt', direction: 'desc' });
    expect(query.filters).toEqual({
      createdAt: { kind: 'dateRange', from: '2026-01-01', to: '2026-01-31' },
    });
  });

  it('la entrada que no cumple la FORMA se rechaza antes de tocar el repositorio (R30)', async () => {
    // R30 — validar es del caso de uso, con zod, ANTES del repositorio. Un campo no declarado
    // se omite (R5); una pagina 0 es otra cosa: la forma esta mal y se rechaza.
    const { recipes, log, listRecipes } = montar();

    await expect(listRecipes({ page: 0 }, ADMIN)).rejects.toBeInstanceOf(ValidationError);
    expect(recipes.listAlive).toHaveBeenCalledTimes(0);
    expect(log.ignoredFields).toHaveBeenCalledTimes(0);
  });
});

describe('list-recipes: la aritmetica de paginacion SIGUE INYECTADA (R40 de QC-26)', () => {
  it('el offset y el limite del puerto salen de toOffsetLimit, y la pagina de buildPage', async () => {
    // `recetas` no puede importar `lib/shared/**` desde `domain/`: la aritmetica llega
    // inyectada y QC-57 no la sustituye. Se afirma sobre las invocaciones de los dos dobles,
    // que es lo unico que distingue «la recibe» de «la calcula por su cuenta».
    const { recipes, toOffsetLimit, llamadasDeBuildPage, listRecipes } = montar();

    const pagina = await listRecipes({ page: 2, pageSize: 5 }, ADMIN);

    expect(toOffsetLimit).toHaveBeenCalledWith(2, 5);
    // El puerto recibe la ventana YA CALCULADA fuera del adaptador, mas la consulta saneada y
    // el ambito de empresa del actor (QC-50).
    expect(recipes.listAlive).toHaveBeenCalledWith(
      5,
      5,
      expect.objectContaining({ page: 2 }),
      { companyId: EMPRESA },
    );
    // Y el `pageSize` de la salida es el que devolvio `toOffsetLimit`, no el que se pidio.
    expect(llamadasDeBuildPage).toEqual([{ items: 0, total: 0, page: 2, pageSize: 5 }]);
    expect(pagina.pageSize).toBe(5);
  });
});
