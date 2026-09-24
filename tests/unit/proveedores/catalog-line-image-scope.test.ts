// Que las imagenes de las lineas de catalogo NO se movieron (R32).
//
// La decision cerrada 9 dice que la imagen de una linea no se aisla por empresa: sigue siendo
// una RUTA guardada que se sirve por enlace PUBLICO, sin la empresa dentro, sin mover ni
// renombrar ningun archivo y sin pasar a enlace privado/firmado. Este archivo es el candado de
// regresion: si alguien «arregla» de paso el aislamiento de las imagenes mientras implementa el
// resto de la ficha, cae aqui.
//
// EL ESTADO REAL, que conviene no confundir con el de `recetas`: `proveedores` NO tiene puerto
// de almacenamiento. `imagePath` es un campo de texto de la linea -lo valida zod, lo escribe el
// adaptador y lo pinta `components/shared/entity-image.tsx` tal cual en el `src`-. Asi que «que
// ninguna firma del puerto de almacenamiento gane la empresa» se comprueba de la unica forma en
// que es comprobable aqui: que ese puerto sigue sin existir y que la empresa no entra por
// ninguno de los sitios por los que la ruta pasa.

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { toCatalogLineView } from '@/lib/modules/proveedores/adapters/driven/persistence/supplier-catalog-line-prisma';
import { createCatalogLineSchema } from '@/lib/modules/proveedores/domain/catalog-line-input';
import { createCreateCatalogLine } from '@/lib/modules/proveedores/domain/create-catalog-line';
import { createUpdateCatalogLine } from '@/lib/modules/proveedores/domain/update-catalog-line';

import type { Actor } from '@/lib/modules/proveedores/domain/actor';
import type { SupplierCatalogRepository } from '@/lib/modules/proveedores/ports/supplier-catalog-repository';
import type { UnitCatalog } from '@/lib/modules/unidades';

const EMPRESA = '11111111-1111-4111-8111-111111111111';
const PROVEEDOR = '22222222-2222-4222-8222-222222222222';
const LINEA = '33333333-3333-4333-8333-333333333333';
const PRESENTACION = '44444444-4444-4444-8444-444444444444';

const RUTA_DE_LA_IMAGEN = 'catalogo/acido-citrico.png';
const AHORA = new Date('2026-09-17T12:00:00.000Z');

const ACTOR: Actor = {
  id: 'u-1',
  companyId: EMPRESA,
  permissions: ['proveedores.consultar', 'proveedores.modificar'],
};

const CAMPOS_LINEA = {
  name: 'Acido citrico',
  presentationId: PRESENTACION,
  unitId: null,
  imagePath: RUTA_DE_LA_IMAGEN,
  cost: '12.5000',
  minPurchase: null,
  deliveryTime: null,
};

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const moduloDir = join(repoRoot, 'lib', 'modules', 'proveedores');

function leer(...ruta: readonly string[]): string {
  return readFileSync(join(repoRoot, ...ruta), 'utf8');
}

/** Todos los `.ts`/`.tsx` de un arbol, recursivamente. */
function fuentesDe(dir: string): readonly string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entrada) => {
    const ruta = join(dir, entrada.name);
    if (entrada.isDirectory()) return fuentesDe(ruta);
    return entrada.isFile() && /\.tsx?$/.test(ruta) ? [ruta] : [];
  });
}

// El puerto de `unidades` publica dos metodos y este modulo solo usa el primero. El segundo
// se dobla lanzando, no devolviendo vacio: si algun dia una llamada nueva lo alcanzara, es un
// acoplamiento que tiene que salir en rojo aqui en vez de pasar en silencio.
const units: UnitCatalog = {
  findRefs: vi.fn(async () => []),
  findRefsSharingBaseInCompany: vi.fn(async () => {
    throw new Error('proveedores no pide unidades hermanas de base');
  }),
};

describe('R32 — `proveedores` sigue SIN puerto de almacenamiento, y esta ficha no le crea uno', () => {
  it('el censo de `ports/` es exacto: cuatro puertos, ninguno de imagenes', () => {
    // Lista CERRADA a proposito: un puerto nuevo de almacenamiento -aunque naciera «solo para
    // componer la URL»- entra por aqui y este caso lo dice. Se anade
    // `supplier-catalog-import-repository.ts` -la importacion por identidad, sin nada de
    // imagenes ni de almacenamiento- y el censo sube de tres a cuatro.
    expect(readdirSync(join(moduloDir, 'ports')).sort()).toEqual([
      'list-query-log.ts',
      'supplier-catalog-import-repository.ts',
      'supplier-catalog-repository.ts',
      'supplier-repository.ts',
    ]);
  });

  it('ninguna firma del modulo junta la imagen con la empresa', () => {
    // Recorre el modulo entero: si alguna funcion, tipo o puerto pasara a recibir la empresa
    // «para la imagen», la linea que los junta aparece aqui.
    for (const ruta of fuentesDe(moduloDir)) {
      const codigo = readFileSync(ruta, 'utf8');
      for (const [indice, linea] of codigo.split('\n').entries()) {
        if (!/imagePath|image_path/i.test(linea)) continue;
        expect(
          /companyId|company_id/i.test(linea),
          `${ruta}:${String(indice + 1)} junta la imagen con la empresa: la ruta de la imagen no lleva empresa (R32)`,
        ).toBe(false);
      }
      expect(
        /createSignedUrl|signedUrl|SignedUrl/i.test(codigo),
        `${ruta} compone una URL firmada: la imagen se sirve por enlace publico (R32)`,
      ).toBe(false);
    }
  });
});

describe('R32 — la ruta viaja tal cual: ni se prefija, ni se reescribe, ni gana la empresa', () => {
  it('el esquema de entrada acepta la ruta tal cual y no le anade ningun segmento', () => {
    const parsed = createCatalogLineSchema.safeParse({ supplierId: PROVEEDOR, ...CAMPOS_LINEA });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.imagePath).toBe(RUTA_DE_LA_IMAGEN);

    // Y una ruta que YA llevara algo parecido a una empresa tampoco se toca: el esquema no
    // conoce ninguna forma de ruta, que es exactamente lo que decidio QC-52.
    const conUuid = `${EMPRESA}/foto.png`;
    const otra = createCatalogLineSchema.safeParse({
      supplierId: PROVEEDOR,
      ...CAMPOS_LINEA,
      imagePath: conUuid,
    });
    expect(otra.success && otra.data.imagePath).toBe(conUuid);
  });

  it('el alta y la edicion mandan al puerto EXACTAMENTE la ruta que llego, sin empresa', async () => {
    const create = vi.fn<SupplierCatalogRepository['create']>(async () => ({ id: LINEA }));
    const replaceAlive = vi.fn<SupplierCatalogRepository['replaceAlive']>(async () => 'ok' as const);
    const catalog = { create, replaceAlive } as unknown as SupplierCatalogRepository;
    const now = () => AHORA;

    await createCreateCatalogLine({ catalog, units, now })(
      { supplierId: PROVEEDOR, ...CAMPOS_LINEA },
      ACTOR,
    );
    await createUpdateCatalogLine({ catalog, units, now })(LINEA, CAMPOS_LINEA, ACTOR);

    const datosDelAlta = create.mock.calls[0]?.[0] as { imagePath: string | null };
    const datosDeLaEdicion = replaceAlive.mock.calls[0]?.[1] as { imagePath: string | null };

    for (const [nombre, datos] of [
      ['alta', datosDelAlta],
      ['edicion', datosDeLaEdicion],
    ] as const) {
      expect(datos.imagePath, `${nombre}: la ruta se reescribio`).toBe(RUTA_DE_LA_IMAGEN);
      expect(datos.imagePath, `${nombre}: la ruta lleva la empresa`).not.toContain(EMPRESA);
    }

    // El ambito viaja como CUARTO/QUINTO argumento, aparte de los datos: la empresa acota la
    // consulta, no la ruta.
    expect(create.mock.calls[0]?.[3]).toStrictEqual({ companyId: EMPRESA });
    expect(replaceAlive.mock.calls[0]?.[4]).toStrictEqual({ companyId: EMPRESA });
  });

  it('la lectura devuelve la ruta tal cual, sin recomponerla', () => {
    const fila = {
      id: LINEA,
      supplierId: PROVEEDOR,
      name: 'Acido citrico',
      presentationId: PRESENTACION,
      unitId: null,
      imagePath: RUTA_DE_LA_IMAGEN,
      cost: new Prisma.Decimal('12.5'),
      minPurchase: null,
      deliveryTime: null,
      createdAt: AHORA,
      updatedAt: AHORA,
      createdBy: 'u-0',
      updatedBy: 'u-0',
      companyId: EMPRESA,
    };
    const vista = toCatalogLineView(fila as unknown as Parameters<typeof toCatalogLineView>[0]);
    expect(vista.imagePath).toBe(RUTA_DE_LA_IMAGEN);
    expect(vista).not.toHaveProperty('companyId');
  });
});

describe('R32 — se sigue sirviendo por enlace publico', () => {
  it('la miniatura compartida pinta la RUTA tal cual en el `src`, sin firmar y sin empresa', () => {
    const codigo = leer('components', 'shared', 'entity-image.tsx');

    expect(codigo).toMatch(/src=\{usaMarcador \? MISSING_IMAGE_SRC : path\}/);
    expect(codigo).not.toMatch(/createSignedUrl|signedUrl|SignedUrl/i);
    expect(codigo).not.toMatch(/companyId|company_id/i);
  });

  it('la pantalla del catalogo le pasa la ruta de la linea, sin componer ninguna URL', () => {
    const columnas = leer(
      'app',
      '(private)',
      'proveedores',
      '[id]',
      'components',
      'catalog-columns.tsx',
    );

    expect(columnas).toMatch(/<EntityImage path=\{line\.imagePath\}/);
    expect(columnas).not.toMatch(/createSignedUrl|signedUrl|SignedUrl|getPublicUrl/i);
    expect(columnas).not.toMatch(/companyId|company_id/i);
  });
});
