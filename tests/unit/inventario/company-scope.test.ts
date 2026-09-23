// T14 (QC-49) — EL UNICO PUNTO DE CONSULTA del modulo `inventario` (`design.md > 5`) y la
// forma de su salida publica.
//
// Cubre R13 (la condicion «de la empresa» se define UNA sola vez y toda consulta y toda
// escritura se construyen a partir de ella) y R19 (la empresa entra en la consulta y NO viaja
// al navegador).
//
// HONESTIDAD SOBRE EL ALCANCE: este archivo no toca Postgres. No puede demostrar que la base
// filtro -eso es `tests/integration/inventario/company-scope-queries.int.test.ts` (T13)-. Lo que
// si demuestra, y no puede demostrar ningun test de integracion, es que la condicion es UNA:
// que las tres envolturas son la MISMA funcion vestida de tres tipos, y que cambiarla en un
// sitio las cambia todas. Un test contra la base pasaria igual con tres copias divergentes
// mientras las tres coincidieran POR AHORA.
//
// LO QUE ESTE ARCHIVO TAMPOCO PRUEBA, desde el 2026-09-11: que CADA metodo de los dos puertos
// reciba el ambito y lo use. Sus dos afirmaciones de texto son POR ARCHIVO, y un metodo nuevo que
// lo omita las pasa las dos. Eso lo cierra `tests/guards/guard-ambito-empresa-inventario.test.ts`,
// que muerde POR FUNCION.

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { Prisma } from '@prisma/client';

import {
  companyScopeColumns,
  presentationCompanyScope,
  productCompanyScope,
} from '@/lib/modules/inventario/adapters/driven/persistence/company-scope';
import {
  PRODUCT_SELECT,
  toProductView,
} from '@/lib/modules/inventario/adapters/driven/persistence/product-prisma';
import {
  presentationSelect,
  toPresentationView,
} from '@/lib/modules/inventario/adapters/driven/persistence/presentation-prisma';

import type { InventoryScope } from '@/lib/modules/inventario/domain/inventory-scope';

const AMBITO: InventoryScope = { companyId: '11111111-1111-4111-8111-111111111111' };
const OTRO_AMBITO: InventoryScope = { companyId: '22222222-2222-4222-8222-222222222222' };

/**
 * Las TRES envolturas que publica el punto unico, con el nombre con el que se leen.
 *
 * Eran CUATRO hasta el 2026-09-11: `batchCompanyScope` (`Prisma.ProductBatchWhereInput`) se borro
 * al cerrar la revision F2.2 porque ningun archivo de produccion la usaba --su unico consumidor
 * era ESTE test--. `product_batches` no tiene lectura propia en el modulo: la unica llega por la
 * fila de producto de `addBatchToAlive`, ya acotada con `productCompanyScope`, y sus dos
 * creaciones se acotan con `companyScopeColumns`. Una envoltura que solo usa su test parece
 * cobertura y no filtra ninguna consulta. QC-81 la reintroducira CON su consumidor el dia que
 * necesite un `where` de lote (ver el docblock de `company-scope.ts`).
 */
const ENVOLTURAS = [
  { nombre: 'productCompanyScope', envoltura: productCompanyScope },
  { nombre: 'presentationCompanyScope', envoltura: presentationCompanyScope },
  { nombre: 'companyScopeColumns', envoltura: companyScopeColumns },
] as const;

describe('QC-49 R13 — las envolturas producen LA MISMA condicion', () => {
  it('las tres devuelven exactamente `{ companyId }` para el mismo ambito', () => {
    for (const { nombre, envoltura } of ENVOLTURAS) {
      const condicion = envoltura(AMBITO);

      // La FORMA, no solo el valor: una envoltura que devolviera `{ companyId, deletedAt: null }`
      // -o cualquier extra- ya no seria la misma definicion, y la diferencia se pagaria en la
      // consulta de otra tabla.
      expect(Object.keys(condicion), nombre).toEqual(['companyId']);
      expect(condicion, nombre).toEqual({ companyId: AMBITO.companyId });
    }
  });

  it('las tres coinciden entre si, sean cuales sean el ambito y el orden', () => {
    for (const ambito of [AMBITO, OTRO_AMBITO]) {
      const producidas = ENVOLTURAS.map(({ envoltura }) => envoltura(ambito));
      const [primera] = producidas;

      for (const condicion of producidas) {
        expect(condicion).toEqual(primera);
      }
      // Y todas dicen la empresa del ambito, no una cableada: con el segundo ambito el valor
      // cambia. Sin esto, tres funciones que devolvieran la misma constante pasarian arriba.
      expect(producidas.map((c) => (c as { companyId: string }).companyId)).toEqual([
        ambito.companyId,
        ambito.companyId,
        ambito.companyId,
      ]);
    }
  });

  it('cada llamada devuelve un objeto NUEVO: nadie puede mutar la condicion de los demas', () => {
    // Una condicion compartida entre consultas es una bomba: Prisma no la copia, y un
    // `Object.assign` en cualquier `where` la cambiaria para todas las consultas siguientes.
    const primera = productCompanyScope(AMBITO) as { companyId: string };
    const segunda = productCompanyScope(AMBITO) as { companyId: string };

    expect(primera).not.toBe(segunda);
    expect(primera).toEqual(segunda);
  });
});

describe('QC-49 R13 — la definicion se escribe UNA vez y el modulo la consume de ahi', () => {
  const RAIZ_PERSISTENCIA = path.join(
    process.cwd(),
    'lib',
    'modules',
    'inventario',
    'adapters',
    'driven',
    'persistence',
  );

  /** El codigo de un archivo del adaptador, sin comentarios: la prosa explica la regla y no
   *  debe contar como implementacion. */
  function codigoSinComentarios(archivo: string): string {
    return readFileSync(path.join(RAIZ_PERSISTENCIA, archivo), 'utf-8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
  }

  it('solo `company-scope.ts` escribe `companyId: scope.companyId`', () => {
    // ESTA es la afirmacion que hace de R13 algo mas que «las consultas filtran»: la condicion
    // no se re-escribe caso a caso. Si manana una consulta nueva se la escribe a mano en
    // `product-prisma.ts` -doce copias que pueden divergir, `design.md > 5`-, esto cae.
    const definicion = /companyId:\s*scope\.companyId/;

    expect(definicion.test(codigoSinComentarios('company-scope.ts'))).toBe(true);

    for (const archivo of ['product-prisma.ts', 'presentation-prisma.ts']) {
      expect(
        definicion.test(codigoSinComentarios(archivo)),
        `${archivo} debe componer el ambito con las envolturas de company-scope, no a mano`,
      ).toBe(false);
    }
  });

  it('los dos adaptadores de repositorio importan el punto unico', () => {
    // La otra mitad: no basta con que no lo escriban a mano; tienen que usarlo. Si alguno
    // dejara de importarlo, sus consultas habrian perdido el ambito por completo.
    for (const archivo of ['product-prisma.ts', 'presentation-prisma.ts']) {
      expect(codigoSinComentarios(archivo), archivo).toContain('./company-scope');
    }
  });
});

describe('QC-49 R19 — la empresa entra en la consulta y no sale hacia el navegador', () => {
  it('el `select` de las lecturas publicas ni siquiera pide la columna de empresa', () => {
    // Lo que no se selecciona no se puede filtrar por accidente en la vista. Se afirma sobre
    // el dato exportado, no sobre el texto del archivo.
    expect(Object.keys(PRODUCT_SELECT)).not.toContain('companyId');
    expect(Object.keys(presentationSelect)).not.toContain('companyId');
  });

  it('`toProductView` no publica la empresa NI AUNQUE la fila la traiga', () => {
    // El caso hostil: una fila con `companyId` dentro -un `select` ampliado por descuido en el
    // futuro-. El mapeo tiene que seguir publicando exactamente sus campos.
    const fila = {
      id: 'product-1',
      name: 'Bidon 20 L',
      imagePath: null,
      qtyAlert: new Prisma.Decimal(2),
      stock: new Prisma.Decimal(0),
      unitId: null,
      type: 'PRODUCT',
      createdAt: new Date('2026-09-11T10:00:00.000Z'),
      updatedAt: new Date('2026-09-11T10:00:00.000Z'),
      companyId: AMBITO.companyId,
    };

    const vista = toProductView(fila as unknown as Parameters<typeof toProductView>[0]);

    expect(Object.keys(vista)).not.toContain('companyId');
    expect(JSON.stringify(vista)).not.toContain(AMBITO.companyId);
    // Ancla: la vista sigue trayendo lo suyo. Un mapeo que devolviera `{}` pasaria arriba.
    expect(Object.keys(vista).sort()).toEqual([
      'createdAt',
      'id',
      'imagePath',
      'name',
      'qtyAlert',
      'stock',
      'type',
      'unitId',
      'updatedAt',
    ]);
  });

  it('`toPresentationView` tampoco la publica aunque la fila la traiga', () => {
    const fila = {
      id: 'presentation-1',
      name: 'Bidon 20 L',
      nameNormalized: 'bidon20l',
      unitId: '33333333-3333-4333-8333-333333333333',
      createdAt: new Date('2026-09-11T10:00:00.000Z'),
      updatedAt: new Date('2026-09-11T10:00:00.000Z'),
      companyId: AMBITO.companyId,
    };

    const vista = toPresentationView(fila);

    expect(Object.keys(vista)).not.toContain('companyId');
    expect(JSON.stringify(vista)).not.toContain(AMBITO.companyId);
    expect(Object.keys(vista).sort()).toEqual([
      'createdAt',
      'id',
      'name',
      'nameNormalized',
      'unitId',
      'updatedAt',
    ]);
  });

  it('el contrato publico del modulo no declara ninguna empresa en sus dos vistas', () => {
    // Los dos tipos de salida son de `domain/`, y ahi `companyId` no aparece ni como campo ni
    // como comentario de codigo. Es lo que impide que se «recupere» el dato por el tipo.
    const raizDominio = path.join(process.cwd(), 'lib', 'modules', 'inventario', 'domain');

    for (const archivo of ['product-view.ts', 'presentation-view.ts']) {
      const codigo = readFileSync(path.join(raizDominio, archivo), 'utf-8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');

      expect(codigo, archivo).not.toContain('companyId');
      expect(codigo, archivo).not.toContain('company_id');
    }
  });
});
