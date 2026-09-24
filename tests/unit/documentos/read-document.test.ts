// Las dos operaciones de LECTURA, ejercitadas A TRAVES DE SU CASO DE USO y no sobre la funcion pura
// de la ruta.
//
// La diferencia no es de estilo: que `isPathInCompany` devuelva `false` para una ruta ajena no
// demuestra que nadie pueda leerla, solo que existe una funcion capaz de decirlo. Lo que estos casos
// afirman es que la comprobacion ESTA EN EL CAMINO —que pedir una lectura de otra empresa termina en
// `unauthorized` y con CERO llamadas al puerto—, que es la propiedad que de verdad aisla.
//
// El doble del puerto REGISTRA cada invocacion, asi que «no se llamo» es una afirmacion y no la
// ausencia de una asercion. Sin red, sin bucket y sin variables de entorno.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

import { DOCUMENT_UPLOAD_PERMISSION, type Actor } from '@/lib/modules/documentos/domain/actor';
import { UnauthorizedError } from '@/lib/modules/documentos/domain/errors';
import { READ_LINK_TTL_SECONDS } from '@/lib/modules/documentos/domain/limits';
import {
  createDownloadDocument,
  createIssueReadLink,
} from '@/lib/modules/documentos/domain/read-document';

import type { DocumentStorage } from '@/lib/modules/documentos/ports/document-storage';

const EMPRESA = '33333333-3333-4333-8333-333333333333';
const OTRA_EMPRESA = '44444444-4444-4444-8444-444444444444';
const PERSONA = '11111111-1111-4111-8111-111111111111';

const RUTA_PROPIA = `${EMPRESA}/8f2a0000-0000-4000-8000-00000000000a.pdf`;
const RUTA_AJENA = `${OTRA_EMPRESA}/8f2a0000-0000-4000-8000-00000000000b.pdf`;

/** Un actor con permisos, para dejar claro que lo que decide aqui NO es el permiso sino la empresa. */
function actorDe(companyId: string): Actor {
  return { id: PERSONA, companyId, permissions: [DOCUMENT_UPLOAD_PERMISSION] };
}

const BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46]);

/**
 * Doble del puerto que anota cada llamada de las dos operaciones de lectura.
 *
 * Responde a CUALQUIER ruta, incluida la ajena: asi, si la guardia faltara, el caso del rechazo
 * cruzado terminaria en verde con una URL en la mano, que es exactamente el fallo que se busca.
 */
function dobleDeAlmacenamiento() {
  const lecturas: { path: string; expiresInSeconds: number }[] = [];
  const descargas: { path: string }[] = [];

  const createSignedReadUrl = vi.fn(async (path: string, expiresInSeconds: number): Promise<string> => {
    lecturas.push({ path, expiresInSeconds });
    return `https://almacenamiento.invalido/lectura/${lecturas.length}`;
  });

  const download = vi.fn(async (path: string): Promise<Uint8Array> => {
    descargas.push({ path });
    return BYTES;
  });

  const createSignedUpload = vi.fn(async (): Promise<never> => {
    throw new Error('la lectura no firma subidas');
  });
  const remove = vi.fn(async (): Promise<void> => {
    throw new Error('la lectura no borra nada');
  });

  const storage: DocumentStorage = { createSignedUpload, createSignedReadUrl, download, remove };
  return { storage, createSignedUpload, createSignedReadUrl, download, lecturas, descargas };
}

/** Las DOS operaciones, con la misma forma, para que ninguna se pruebe menos que la otra. */
const OPERACIONES = [
  {
    nombre: 'firmar la lectura',
    construir: (storage: DocumentStorage) => createIssueReadLink({ storage }),
  },
  {
    nombre: 'descargar',
    construir: (storage: DocumentStorage) => createDownloadDocument({ storage }),
  },
] as const;

/** Ningun metodo de ningun puerto se llamo: el barrido completo, no solo el de la operacion. */
function ningunaLlamada(doble: ReturnType<typeof dobleDeAlmacenamiento>): void {
  expect(doble.createSignedReadUrl).not.toHaveBeenCalled();
  expect(doble.download).not.toHaveBeenCalled();
  expect(doble.createSignedUpload).not.toHaveBeenCalled();
  expect(doble.lecturas).toEqual([]);
  expect(doble.descargas).toEqual([]);
}

describe('documentos — lectura y descarga con comprobacion de empresa', () => {
  describe('el rechazo cruzado ocurre EN EL CASO DE USO (R12)', () => {
    for (const { nombre, construir } of OPERACIONES) {
      it(`R12 — ${nombre}: un actor de una empresa pidiendo la ruta de OTRA recibe 'unauthorized' y el puerto no se llama NI UNA vez`, async () => {
        const doble = dobleDeAlmacenamiento();

        await expect(construir(doble.storage)(actorDe(EMPRESA), RUTA_AJENA)).rejects.toThrow(
          UnauthorizedError,
        );
        ningunaLlamada(doble);
      });

      it(`R12 — ${nombre}: el codigo del rechazo es 'unauthorized' y el mensaje no nombra la ruta, la empresa ni a la persona`, async () => {
        const doble = dobleDeAlmacenamiento();

        await construir(doble.storage)(actorDe(EMPRESA), RUTA_AJENA).then(
          () => expect.unreachable('tenia que haber rechazado'),
          (error: unknown) => {
            expect(error).toBeInstanceOf(UnauthorizedError);
            expect((error as UnauthorizedError).code).toBe('unauthorized');
            expect((error as UnauthorizedError).message).not.toContain(OTRA_EMPRESA);
            expect((error as UnauthorizedError).message).not.toContain(EMPRESA);
            expect((error as UnauthorizedError).message).not.toContain(PERSONA);
            expect((error as UnauthorizedError).diagnostic).toBeUndefined();
          },
        );
      });

      it(`R12 — ${nombre}: EXISTA O NO el archivo el rechazo es el mismo, porque no se llega a preguntar`, async () => {
        // El doble responde a cualquier ruta, asi que «existe» y «no existe» solo se distinguirian
        // llamandolo. Como no se le llama, las dos ejecuciones son literalmente la misma.
        const doble = dobleDeAlmacenamiento();
        const operacion = construir(doble.storage);

        const errores: UnauthorizedError[] = [];
        for (const ruta of [RUTA_AJENA, `${OTRA_EMPRESA}/no-existe.pdf`]) {
          await operacion(actorDe(EMPRESA), ruta).then(
            () => expect.unreachable('tenia que haber rechazado'),
            (error: unknown) => errores.push(error as UnauthorizedError),
          );
        }

        expect(errores).toHaveLength(2);
        expect(errores[0]?.code).toBe(errores[1]?.code);
        expect(errores[0]?.message).toBe(errores[1]?.message);
        ningunaLlamada(doble);
      });

      it(`R12 — ${nombre}: las trampas de la ruta tampoco pasan, ahora por el caso de uso`, async () => {
        // Las mismas que cubre la funcion pura, pero afirmadas donde de verdad protegen algo. La
        // primera es la que justifica comparar el SEGMENTO y no el prefijo a secas.
        const doble = dobleDeAlmacenamiento();
        const operacion = construir(doble.storage);
        const actor = actorDe('empresa-A');

        for (const ruta of [
          'empresa-A2/x.pdf',
          '../empresa-B/x.pdf',
          // La travesia que SI empieza por el segmento correcto: sale de la empresa en cuanto se
          // normaliza, y comparar solo el primer segmento la dejaria pasar.
          'empresa-A/../empresa-B/x.pdf',
          '/empresa-A/x.pdf',
          'otra/empresa-A/x.pdf',
          'empresa-A',
          'empresa-A/',
          '',
        ]) {
          await expect(operacion(actor, ruta), ruta).rejects.toThrow(UnauthorizedError);
        }
        ningunaLlamada(doble);
      });

      it(`R12 — ${nombre}: sin actor o sin empresa falla cerrado, y el puerto tampoco se llama`, async () => {
        const doble = dobleDeAlmacenamiento();
        const operacion = construir(doble.storage);
        const sinEmpresa = { id: PERSONA, permissions: [] } as unknown as Actor;

        for (const actor of [null, undefined, sinEmpresa]) {
          await expect(operacion(actor, RUTA_PROPIA)).rejects.toThrow(UnauthorizedError);
        }
        ningunaLlamada(doble);
      });
    }
  });

  describe('la ruta de la PROPIA empresa pasa y llega al puerto (R12)', () => {
    it('R12 — firmar la lectura: la ruta propia llega al puerto tal cual y la URL vuelve a quien la pidio', async () => {
      const doble = dobleDeAlmacenamiento();

      const url = await createIssueReadLink({ storage: doble.storage })(
        actorDe(EMPRESA),
        RUTA_PROPIA,
      );

      expect(doble.createSignedReadUrl).toHaveBeenCalledTimes(1);
      expect(doble.lecturas.map((llamada) => llamada.path)).toEqual([RUTA_PROPIA]);
      expect(url).toBe('https://almacenamiento.invalido/lectura/1');
      expect(doble.download).not.toHaveBeenCalled();
    });

    it('R12 — descargar: la ruta propia llega al puerto y vuelven sus bytes', async () => {
      const doble = dobleDeAlmacenamiento();

      const bytes = await createDownloadDocument({ storage: doble.storage })(
        actorDe(EMPRESA),
        RUTA_PROPIA,
      );

      expect(doble.download).toHaveBeenCalledTimes(1);
      expect(doble.descargas.map((llamada) => llamada.path)).toEqual([RUTA_PROPIA]);
      expect(bytes).toEqual(BYTES);
      expect(doble.createSignedReadUrl).not.toHaveBeenCalled();
    });

    it('R12 — la misma ruta pasa para su empresa y se rechaza para la otra: lo unico que cambia es el actor', async () => {
      const doble = dobleDeAlmacenamiento();
      const firmar = createIssueReadLink({ storage: doble.storage });

      await expect(firmar(actorDe(EMPRESA), RUTA_PROPIA)).resolves.toBeTypeOf('string');
      await expect(firmar(actorDe(OTRA_EMPRESA), RUTA_PROPIA)).rejects.toThrow(UnauthorizedError);
      expect(doble.lecturas).toHaveLength(1);
    });
  });

  describe('el plazo de la firma de lectura es el del modulo (R10)', () => {
    it('R10 — al puerto se le pasa exactamente READ_LINK_TTL_SECONDS, y no lo elige quien llama', async () => {
      const doble = dobleDeAlmacenamiento();

      await createIssueReadLink({ storage: doble.storage })(actorDe(EMPRESA), RUTA_PROPIA);

      expect(doble.lecturas).toEqual([{ path: RUTA_PROPIA, expiresInSeconds: READ_LINK_TTL_SECONDS }]);
      expect(READ_LINK_TTL_SECONDS).toBe(15 * 60);
      // Y el caso de uso recibe DOS argumentos: el actor y la ruta. No hay hueco para un plazo.
      expect(createIssueReadLink({ storage: doble.storage }).length).toBe(2);
    });

    it('R10 — la descarga no lleva plazo: al puerto solo le va la ruta', async () => {
      const doble = dobleDeAlmacenamiento();

      await createDownloadDocument({ storage: doble.storage })(actorDe(EMPRESA), RUTA_PROPIA);

      for (const argumentos of doble.download.mock.calls) {
        expect(argumentos).toHaveLength(1);
      }
    });
  });

  describe('las lecturas no exigen ningun permiso, solo la empresa (R18)', () => {
    for (const { nombre, construir } of OPERACIONES) {
      it(`R18 — ${nombre}: un actor SIN ningun permiso lee su propia ruta igual que uno con permisos`, async () => {
        const doble = dobleDeAlmacenamiento();
        const sinPermisos: Actor = { id: PERSONA, companyId: EMPRESA, permissions: [] };

        await expect(construir(doble.storage)(sinPermisos, RUTA_PROPIA)).resolves.toBeDefined();
      });
    }
  });

  describe('la forma de las dos operaciones (R1)', () => {
    it('R1 — el actor entra por parametro: el dominio no lee sesion, cookie ni cabecera', () => {
      const raiz = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
      const fuente = readFileSync(
        join(raiz, 'lib', 'modules', 'documentos', 'domain', 'read-document.ts'),
        'utf8',
      );

      expect(fuente).not.toMatch(/from\s+'next/);
      expect(fuente).not.toMatch(/\bcookies\s*\(/);
      expect(fuente).not.toMatch(/getSession(User|Context)\s*\(/);
      // Ni base de datos, ni SDK del almacenamiento: el unico contacto con el exterior es el puerto.
      expect(fuente).not.toMatch(/prisma/i);
      expect(fuente).not.toMatch(/@supabase/);
    });
  });
});
