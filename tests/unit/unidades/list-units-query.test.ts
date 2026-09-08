// QC-57 T12 — El caso de uso de listado de UNIDADES con el CONTRATO GENERICO y la PAGINA
// OPCIONAL (`design.md > 7`, `> 12`), con el repositorio y el log MOCKEADOS.
//
// Cubre R5, R6, R7, R8, R11, R16, R20, R27, R28, R29, R30, R33 y R34. Lo que ya cubria QC-32
// -R40, R41- sigue en `list-units.test.ts`, con sus asertos intactos.
//
// EL CASO CENTRAL DE ESTA FICHA es la union discriminada POR LA FORMA DE LA ENTRADA: sin
// parametros, el catalogo entero -y el selector de unidad del formulario de recetas no se
// entera-; con `page` o `pageSize`, una `Page<UnitView>`. Se comprueban las dos, y ademas que el
// orden, el filtro y la busqueda SI se aplican en el modo catalogo: «sin paginar» no es «sin
// consultar».
//
// EL TEST QUE NO PUEDE FALTAR (`design.md > 12`): pedir orden por `deletedAt` -que ademas es una
// columna que `units` NI SIQUIERA TIENE- y comprobar LAS TRES COSAS A LA VEZ.

import { createListUnits, isUnitPage, MAX_UNITS } from '@/lib/modules/unidades/domain/list-units';
import { UnauthorizedError, ValidationError } from '@/lib/modules/unidades/domain/errors';

import type { Actor } from '@/lib/modules/unidades/domain/actor';
import type { ListQuery } from '@/lib/modules/unidades/domain/list-query';
import type { Page } from '@/lib/modules/unidades/domain/page';
import type { UnitView } from '@/lib/modules/unidades/domain/unit-view';
import type { UnitScope } from '@/lib/modules/unidades/domain/unit-scope';
import type { ListQueryLog } from '@/lib/modules/unidades/ports/list-query-log';
import type { UnitRepository } from '@/lib/modules/unidades/ports/unit-repository';

/** QC-74 (R16, R17, R18): el actor autorizado lo es por TENER `'unidades.consultar'`, no por
 *  llamarse Administrador —el `Actor` de `unidades` ya no tiene nombre de rol—. */
const EMPRESA = 'company-1';

const CON_PERMISO: Actor = {
  id: 'admin-1',
  companyId: EMPRESA,
  permissions: ['unidades.consultar'],
};

/** El que antes era el `Operador`: ahora es «un actor con permisos de OTRO modulo» (R13, R14). */
const SIN_PERMISO: Actor = {
  id: 'operador-1',
  companyId: EMPRESA,
  permissions: ['inventario.consultar'],
};

/* QC-39 (T1): el puerto de listado devuelve `UnitView` -los tres campos de siempre MAS la
 *  equivalencia y `isSystem`-, asi que los fixtures de este archivo llevan los seis campos. Es
 *  la forma de los dobles lo que cambia; **ningun aserto de este archivo cambia de exigencia**,
 *  y las comparaciones siguen siendo de igualdad estricta contra el fixture entero. */
const CATALOGO: readonly UnitView[] = [
  { id: 'unit-1', name: 'Gramo', symbol: 'g', baseUnitId: null, factor: null, isSystem: true },
  {
    id: 'unit-2',
    name: 'Litro',
    symbol: 'L',
    baseUnitId: 'unit-1',
    factor: '1000.0000',
    isSystem: false,
  },
];

const PAGINA: Page<UnitView> = {
  items: CATALOGO,
  total: 2,
  page: 1,
  pageSize: 10,
  totalPages: 1,
};

function montar() {
  const listAll = vi.fn<UnitRepository['listAll']>(async () => CATALOGO);
  const listPage = vi.fn<UnitRepository['listPage']>(async () => PAGINA);
  const units = { listAll, listPage } satisfies UnitRepository;
  const log: ListQueryLog = { ignoredFields: vi.fn<ListQueryLog['ignoredFields']>() };
  return { units, log, listUnits: createListUnits({ units, log }) };
}

/** La consulta que llego a `listAll` (segundo argumento) en la ultima llamada. El tercero es el
 *  AMBITO de QC-76, que este archivo no interroga: lo hace `list-units.test.ts`. */
function consultaDelCatalogo(
  recibidas: readonly (readonly [number, ListQuery, UnitScope])[],
): ListQuery {
  const ultima = recibidas.at(-1);
  if (ultima === undefined) throw new Error('listAll no fue llamado');
  return ultima[1];
}

/** La consulta que llego a `listPage` (primer argumento) en la ultima llamada. */
function consultaDeLaPagina(recibidas: readonly (readonly [ListQuery, UnitScope])[]): ListQuery {
  const ultima = recibidas.at(-1);
  if (ultima === undefined) throw new Error('listPage no fue llamado');
  return ultima[0];
}

describe('list-units: la pagina es OPCIONAL (R27, R28, R29)', () => {
  it('SIN PARAMETROS devuelve el catalogo entero, acotado y sin paginar (R28)', async () => {
    // R28 — es lo que mantiene verde el selector de unidad del formulario de recetas sin
    // tocarlo: `listUnitsAction()` sigue recibiendo un ARRAY -de `UnitView` desde QC-39-, no
    // una pagina.
    const { units, listUnits } = montar();

    const resultado = await listUnits(undefined, CON_PERMISO);

    expect(resultado).toEqual(CATALOGO);
    expect(Array.isArray(resultado)).toBe(true);
    expect(units.listAll).toHaveBeenCalledTimes(1);
    expect(units.listPage).toHaveBeenCalledTimes(0);
    // La cota de R40 (QC-32) sigue intacta: ninguna consulta sin limite declarado.
    // QC-76: el tercer argumento es el AMBITO de la empresa del actor (R17). Se anade a la
    // llamada; la cota que este caso vigila no cambia.
    expect(units.listAll).toHaveBeenCalledWith(MAX_UNITS, expect.anything(), {
      companyId: EMPRESA,
    });
  });

  it('con una consulta SIN page ni pageSize sigue siendo el catalogo entero (R28)', async () => {
    // R28 — «sin parametros» es sin PAGINACION, no sin consulta: pedir orden o busqueda no
    // convierte la salida en una pagina.
    const { units, listUnits } = montar();

    const resultado = await listUnits({ sort: { columnId: 'symbol', direction: 'desc' } }, CON_PERMISO);

    expect(isUnitPage(resultado)).toBe(false);
    expect(units.listAll).toHaveBeenCalledTimes(1);
    expect(units.listPage).toHaveBeenCalledTimes(0);
  });

  it('con page devuelve una Page<UnitView> (R27, R29)', async () => {
    // R27 + R29 — el otro lado de la union discriminada. QC-39 no elige metodo: manda lo que
    // trae la URL y la forma de la salida sale de la forma de la entrada.
    const { units, listUnits } = montar();

    const resultado = await listUnits({ page: 2 }, CON_PERMISO);

    expect(isUnitPage(resultado)).toBe(true);
    expect(resultado).toEqual(PAGINA);
    expect(units.listPage).toHaveBeenCalledTimes(1);
    expect(units.listAll).toHaveBeenCalledTimes(0);
    expect(consultaDeLaPagina(units.listPage.mock.calls).page).toBe(2);
  });

  it('con pageSize a solas tambien devuelve una pagina (R29)', async () => {
    // R29 — pedir un tamano de pagina es pedir paginacion, aunque no se diga que pagina. El
    // ACOTADO a 25 lo aplica el adaptador con `lib/shared/pagination`, no este caso de uso:
    // aqui se comprueba que el `pageSize` pedido llega entero y sin rechazarse.
    const { units, listUnits } = montar();

    const resultado = await listUnits({ pageSize: 100 }, CON_PERMISO);

    expect(isUnitPage(resultado)).toBe(true);
    expect(consultaDeLaPagina(units.listPage.mock.calls).pageSize).toBe(100);
  });

  it('el orden, el filtro y la busqueda se aplican TAMBIEN en el modo catalogo (R27)', async () => {
    // R27 — unidades acepta orden, filtro y busqueda «como los demas». Que no pagine no
    // significa que no consulte.
    const { units, listUnits } = montar();

    await listUnits({ sort: { columnId: 'name', direction: 'desc' }, search: 'litro' }, CON_PERMISO);

    const query = consultaDelCatalogo(units.listAll.mock.calls);
    expect(query.sort).toEqual({ columnId: 'name', direction: 'desc' });
    expect(query.search).toBe('litro');
  });
});

describe('list-units: autorizacion antes que todo (R33, R34; QC-74 R12, R13, R14, R16)', () => {
  // R34 exige probarlo DOS veces: con una consulta valida y con una que traiga campos no
  // declarados. Se afirma CONTANDO invocaciones de los dos metodos del doble, no solo mirando
  // que lanza.
  const CONSULTAS: ReadonlyArray<{ readonly nombre: string; readonly entrada: unknown }> = [
    { nombre: 'consulta valida', entrada: { page: 1, pageSize: 10 } },
    {
      nombre: 'consulta con campos no declarados',
      entrada: {
        page: 1,
        sort: { columnId: 'deletedAt', direction: 'asc' },
        filters: { nombre: { kind: 'text', value: 'x' } },
      },
    },
  ];

  for (const caso of CONSULTAS) {
    it(`rechaza al actor con permisos de otro modulo con ${caso.nombre} sin tocar el repositorio`, async () => {
      const { units, log, listUnits } = montar();

      await expect(listUnits(caso.entrada, SIN_PERMISO)).rejects.toBeInstanceOf(UnauthorizedError);
      expect(units.listAll).toHaveBeenCalledTimes(0);
      expect(units.listPage).toHaveBeenCalledTimes(0);
      expect(log.ignoredFields).toHaveBeenCalledTimes(0);
    });

    it(`rechaza al actor ausente con ${caso.nombre} sin tocar el repositorio`, async () => {
      const { units, log, listUnits } = montar();

      await expect(listUnits(caso.entrada, null)).rejects.toBeInstanceOf(UnauthorizedError);
      expect(units.listAll).toHaveBeenCalledTimes(0);
      expect(units.listPage).toHaveBeenCalledTimes(0);
      expect(log.ignoredFields).toHaveBeenCalledTimes(0);
    });

    it(`rechaza al actor con el conjunto vacio con ${caso.nombre} sin tocar el repositorio`, async () => {
      const { units, log, listUnits } = montar();

      await expect(
        listUnits(caso.entrada, { id: 'user-1', companyId: EMPRESA, permissions: [] }),
      ).rejects.toBeInstanceOf(UnauthorizedError);
      expect(units.listAll).toHaveBeenCalledTimes(0);
      expect(units.listPage).toHaveBeenCalledTimes(0);
      expect(log.ignoredFields).toHaveBeenCalledTimes(0);
    });

    it(`rechaza al actor con un codigo PARECIDO con ${caso.nombre} sin tocar el repositorio`, async () => {
      // La conversion de «rol Administradores externos» de QC-32: la pertenencia es EXACTA, un
      // prefijo del codigo no concede nada (R13).
      const { units, log, listUnits } = montar();

      await expect(
        listUnits(caso.entrada, { id: 'user-1', companyId: EMPRESA, permissions: ['unidades.'] }),
      ).rejects.toBeInstanceOf(UnauthorizedError);
      expect(units.listAll).toHaveBeenCalledTimes(0);
      expect(units.listPage).toHaveBeenCalledTimes(0);
      expect(log.ignoredFields).toHaveBeenCalledTimes(0);
    });
  }
});

describe('list-units: el campo no declarado se omite, no rompe y se anota (R5, R6, R7, R8, R11)', () => {
  it('ordenar por deletedAt: no falla, aplica el orden por defecto Y el log recibe el campo', async () => {
    // R5 + R7 + R11 + R6, LAS TRES COSAS A LA VEZ (`design.md > 12`). Y aqui `deletedAt` no es
    // solo un campo no declarado: `units` NI SIQUIERA TIENE esa columna, asi que dejarlo pasar
    // reventaria la consulta en la base.
    const { units, log, listUnits } = montar();

    const resultado = await listUnits(
      { sort: { columnId: 'deletedAt', direction: 'desc' } },
      CON_PERMISO,
    );

    // (a) la consulta NO falla
    expect(resultado).toEqual(CATALOGO);
    // (b) el orden aplicado es el de por defecto: `sort: null`
    expect(consultaDelCatalogo(units.listAll.mock.calls).sort).toBeNull();
    // (c) el log recibio el campo, con el nombre del listado
    expect(log.ignoredFields).toHaveBeenCalledWith('units', ['deletedAt']);
  });

  it('cualquier filtro se omite y se anota: unidades no declara ninguno (R5, R8)', async () => {
    // R5 — `UNIT_QUERYABLE.filterable` esta vacio a proposito. Un filtro que llegue no puede
    // romper la consulta, pero tampoco puede aplicarse en silencio.
    const { units, log, listUnits } = montar();

    await listUnits({ filters: { symbol: { kind: 'text', value: 'g' } } }, CON_PERMISO);

    expect(consultaDelCatalogo(units.listAll.mock.calls).filters).toEqual({});
    expect(log.ignoredFields).toHaveBeenCalledWith('units', ['symbol']);
  });

  it('el log recibe NOMBRES de campo y nunca el valor buscado ni el del filtro (R6, PII)', async () => {
    const TERMINO = 'unidad del cliente Perez';
    const VALOR_DE_FILTRO = 'cliente-secreto';
    const { log, listUnits } = montar();

    await listUnits(
      {
        search: TERMINO,
        sort: { columnId: 'inventado', direction: 'asc' },
        filters: { tambienInventado: { kind: 'select', values: [VALOR_DE_FILTRO] } },
      },
      CON_PERMISO,
    );

    expect(log.ignoredFields).toHaveBeenCalledTimes(1);
    const argumentos = JSON.stringify(vi.mocked(log.ignoredFields).mock.calls[0]);
    expect(argumentos).toContain('inventado');
    expect(argumentos).toContain('tambienInventado');
    expect(argumentos).not.toContain(TERMINO);
    expect(argumentos).not.toContain(VALOR_DE_FILTRO);
  });

  it('una consulta limpia tambien llama al log, pero con la lista vacia (R6)', async () => {
    const { log, listUnits } = montar();

    await listUnits(undefined, CON_PERMISO);

    expect(log.ignoredFields).toHaveBeenCalledWith('units', []);
  });
});

describe('list-units: validacion de la forma (R20, R30)', () => {
  it('una busqueda de solo espacios es ausencia de busqueda (R20)', async () => {
    const { units, listUnits } = montar();

    await listUnits({ search: '   ' }, CON_PERMISO);

    expect(consultaDelCatalogo(units.listAll.mock.calls).search).toBe('');
  });

  it('la entrada que no cumple la FORMA se rechaza antes de tocar el repositorio (R30)', async () => {
    // R30 — una pagina 0 no es un campo no declarado: la forma esta mal y se rechaza.
    const { units, log, listUnits } = montar();

    await expect(listUnits({ page: 0 }, CON_PERMISO)).rejects.toBeInstanceOf(ValidationError);
    expect(units.listAll).toHaveBeenCalledTimes(0);
    expect(units.listPage).toHaveBeenCalledTimes(0);
    expect(log.ignoredFields).toHaveBeenCalledTimes(0);
  });
});
