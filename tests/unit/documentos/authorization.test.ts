// Autorizacion POR PERMISO del modulo `documentos`.
//
// `docs/architecture.md > Acceso a datos y autorizacion` es explicito: Prisma se conecta como dueno
// de las tablas y no setea `auth.uid()`, y ademas esta feature no deja ninguna fila en la base. La
// frontera real es el caso de uso, y este archivo existe para encontrar el agujero de que la
// comprobacion se salte o quede DESPUES de tocar un puerto.
//
// Los casos de uso llegan en tandas posteriores; lo que aqui se ejercita es `requirePermission`
// —la unica pieza de autorizacion que existe hoy— con la matriz completa del fallo cerrado, y la
// PROPIEDAD de orden: con un actor denegado, ningun metodo de ningun doble de puerto se llama.

import { describe, expect, it, vi } from 'vitest';

import {
  DOCUMENT_UPLOAD_PERMISSION,
  requirePermission,
  type Actor,
} from '@/lib/modules/documentos/domain/actor';
import { DocumentosError, UnauthorizedError } from '@/lib/modules/documentos/domain/errors';
import {
  PERMISSIONS,
  ROLE_ADMINISTRADOR,
  ROLE_OPERADOR,
  SEED_ROLE_PERMISSIONS,
} from '@/lib/modules/identity';

import type { DocumentStorage } from '@/lib/modules/documentos/ports/document-storage';
import type { PdfConverter } from '@/lib/modules/documentos/ports/pdf-converter';

const EMPRESA = '33333333-3333-4333-8333-333333333333';
const PERSONA = '11111111-1111-4111-8111-111111111111';

function conPermisos(...permissions: readonly string[]): Actor {
  return { id: PERSONA, companyId: EMPRESA, permissions };
}

/**
 * Los actores que el fallo cerrado deniega, en un solo sitio para que toda operacion futura se
 * pruebe con EXACTAMENTE la misma matriz. El ultimo no es un actor sin permisos: trae otros
 * permisos del sistema, que es el caso realista y el unico que distingue «pertenencia exacta» de
 * «tiene algo parecido».
 */
const ACTORES_DENEGADOS: readonly (readonly [string, Actor | null | undefined])[] = [
  ['actor nulo', null],
  ['actor ausente', undefined],
  ['sin conjunto de permisos', { id: PERSONA, companyId: EMPRESA } as unknown as Actor],
  ['con el conjunto vacio', conPermisos()],
  [
    'con un valor que no es una lista',
    { id: PERSONA, companyId: EMPRESA, permissions: 'proveedores.modificar' } as unknown as Actor,
  ],
  ['con otros permisos, pero no el exigido', conPermisos('inventario.consultar', 'recetas.modificar')],
];

/** Doble del puerto de almacenamiento que REGISTRA sus llamadas: ninguna debe ocurrir. */
function dobleDeAlmacenamiento() {
  return {
    createSignedUpload: vi.fn(),
    createSignedReadUrl: vi.fn(),
    download: vi.fn(),
    remove: vi.fn(),
  };
}

/** Doble del puerto de conversion, con el mismo proposito. */
function dobleDeConversion() {
  return {
    countPages: vi.fn(),
    extractText: vi.fn(),
    renderPages: vi.fn(),
  };
}

/**
 * Cobertura de los dobles, comprobada por el TIPO y no por un comentario: si un puerto ganara un
 * metodo, estas dos lineas dejan de compilar y el barrido de «ningun metodo se llamo» no puede
 * quedarse corto en silencio.
 */
const _cobertura: readonly [Record<keyof DocumentStorage, unknown>, Record<keyof PdfConverter, unknown>] = [
  dobleDeAlmacenamiento(),
  dobleDeConversion(),
];
void _cobertura;

describe('documentos — autorizacion', () => {
  describe('falla cerrado (R2, R3)', () => {
    for (const [nombre, actor] of ACTORES_DENEGADOS) {
      it(`R2, R3 — ${nombre}: rechaza con el codigo 'unauthorized'`, () => {
        expect(() => requirePermission(actor, DOCUMENT_UPLOAD_PERMISSION)).toThrow(UnauthorizedError);
        try {
          requirePermission(actor, DOCUMENT_UPLOAD_PERMISSION);
          expect.unreachable('tenia que haber lanzado');
        } catch (error) {
          expect(error).toBeInstanceOf(DocumentosError);
          expect((error as UnauthorizedError).code).toBe('unauthorized');
        }
      });

      it(`R2, R5 — ${nombre}: no se llama a NINGUN metodo de NINGUN puerto`, () => {
        const almacenamiento = dobleDeAlmacenamiento();
        const conversion = dobleDeConversion();

        // La forma de toda operacion del modulo: el permiso PRIMERO, el puerto DESPUES. Si alguien
        // invirtiera ese orden, estas aserciones se ponen rojas.
        const operacion = () => {
          requirePermission(actor, DOCUMENT_UPLOAD_PERMISSION);
          return almacenamiento.createSignedUpload('ruta');
        };

        expect(operacion).toThrow(UnauthorizedError);
        for (const metodo of [...Object.values(almacenamiento), ...Object.values(conversion)]) {
          expect(metodo).not.toHaveBeenCalled();
        }
      });
    }

    it('R2 — el rechazo no revela nada del recurso: ni la persona, ni la empresa, ni la ruta', () => {
      const error = new UnauthorizedError();
      expect(error.message).not.toContain(PERSONA);
      expect(error.message).not.toContain(EMPRESA);
      expect(error.code).toBe('unauthorized');
    });
  });

  describe('pertenencia EXACTA, sin implicacion entre permisos (R2)', () => {
    it('R2 — el actor con el codigo exigido pasa', () => {
      expect(() => requirePermission(conPermisos(DOCUMENT_UPLOAD_PERMISSION), DOCUMENT_UPLOAD_PERMISSION)).not.toThrow();
    });

    it('R2 — un codigo del mismo modulo pero de lectura no concede la escritura', () => {
      expect(() => requirePermission(conPermisos('proveedores.consultar'), DOCUMENT_UPLOAD_PERMISSION)).toThrow(
        UnauthorizedError,
      );
    });

    it('R2 — no hay normalizacion, coincidencia parcial ni comodines', () => {
      for (const parecido of [
        `${DOCUMENT_UPLOAD_PERMISSION} `,
        ` ${DOCUMENT_UPLOAD_PERMISSION}`,
        DOCUMENT_UPLOAD_PERMISSION.toUpperCase(),
        'proveedores',
        'proveedores.',
        'proveedores.*',
        '*',
      ]) {
        expect(() => requirePermission(conPermisos(parecido), DOCUMENT_UPLOAD_PERMISSION), parecido).toThrow(
          UnauthorizedError,
        );
      }
    });
  });

  describe('el permiso exigido sale del catalogo cerrado (R4)', () => {
    it('R4 — el codigo exigido YA EXISTE en el catalogo: no se amplia nada', () => {
      const codigos = PERMISSIONS.map((permiso) => permiso.code);
      expect(codigos).toContain(DOCUMENT_UPLOAD_PERMISSION);
      // Ancla anti-vacuidad: el catalogo sigue siendo el cerrado de quince.
      expect(codigos).toHaveLength(15);
      // Y ninguna entrada nace para este modulo.
      expect(codigos.filter((codigo) => codigo.startsWith('documentos.'))).toEqual([]);
    });

    it('R4 — en el sembrado vigente lo tiene el administrador y NO el operador, leido del contrato', () => {
      // Los dos conjuntos salen de `SEED_ROLE_PERMISSIONS`, no escritos a mano: si el sembrado
      // cambiara, este caso se entera en vez de seguir afirmando algo que dejo de ser cierto.
      const delAdministrador = SEED_ROLE_PERMISSIONS[ROLE_ADMINISTRADOR] as readonly string[];
      const delOperador = SEED_ROLE_PERMISSIONS[ROLE_OPERADOR] as readonly string[];

      expect(delAdministrador).toContain(DOCUMENT_UPLOAD_PERMISSION);
      expect(delOperador).not.toContain(DOCUMENT_UPLOAD_PERMISSION);
      expect(delOperador.length).toBeGreaterThan(0);
    });
  });

  describe('la forma del actor (R1)', () => {
    it('R1 — el actor entra por parametro y trae la empresa junto con los permisos', () => {
      const actor = conPermisos(DOCUMENT_UPLOAD_PERMISSION);
      expect(actor.companyId).toBe(EMPRESA);
      expect(requirePermission.length).toBe(2);
    });

    it('R1 — el dominio no lee la sesion, ni una cookie, ni una cabecera', async () => {
      const { readFileSync } = await import('node:fs');
      const { dirname, join } = await import('node:path');
      const { fileURLToPath } = await import('node:url');
      const raiz = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
      const fuente = readFileSync(join(raiz, 'lib', 'modules', 'documentos', 'domain', 'actor.ts'), 'utf8');

      expect(fuente).not.toMatch(/from\s+'next/);
      expect(fuente).not.toMatch(/\bcookies\s*\(/);
      expect(fuente).not.toMatch(/getSession(User|Context)\s*\(/);
      // Del otro modulo se consume el CONTRATO, nunca una ruta profunda.
      expect(fuente).toContain("from '@/lib/modules/identity'");
      expect(fuente).not.toMatch(/@\/lib\/modules\/identity\//);
    });

    it('R4 — el codigo del permiso se escribe UNA sola vez en todo el modulo', async () => {
      const { readdirSync, readFileSync, statSync } = await import('node:fs');
      const { dirname, join } = await import('node:path');
      const { fileURLToPath } = await import('node:url');
      const moduloDir = join(
        dirname(fileURLToPath(import.meta.url)),
        '..',
        '..',
        '..',
        'lib',
        'modules',
        'documentos',
      );
      const fuentes = (function listar(dir: string): readonly string[] {
        return readdirSync(dir).flatMap((nombre) => {
          const ruta = join(dir, nombre);
          return statSync(ruta).isDirectory() ? listar(ruta) : ruta.endsWith('.ts') ? [ruta] : [];
        });
      })(moduloDir);

      expect(fuentes.length).toBeGreaterThan(0);
      const apariciones = fuentes.filter((ruta) =>
        readFileSync(ruta, 'utf8').includes(`'${DOCUMENT_UPLOAD_PERMISSION}'`),
      );
      expect(apariciones).toHaveLength(1);
      expect(apariciones[0]).toMatch(/actor\.ts$/);
    });
  });
});
