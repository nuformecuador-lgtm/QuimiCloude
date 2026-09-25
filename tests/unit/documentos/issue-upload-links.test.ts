// La emision de enlaces de subida, contra un doble del puerto que REGISTRA sus llamadas.
//
// Un doble que solo devuelve valores no puede probar lo que aqui mas importa, que son las NO
// llamadas: que un actor sin permiso no firme nada, y que una tanda por encima del tope no firme
// «los diez primeros». Por eso el doble anota cada invocacion y cada caso la inspecciona.
//
// Sin red, sin bucket y sin variables de entorno: el puerto es el unico contacto con el exterior y
// aqui esta sustituido.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

import { DOCUMENT_UPLOAD_PERMISSION, type Actor } from '@/lib/modules/documentos/domain/actor';
import { isPathInCompany } from '@/lib/modules/documentos/domain/document-path';
import { UnauthorizedError, ValidationError } from '@/lib/modules/documentos/domain/errors';
import { createIssueUploadLinks } from '@/lib/modules/documentos/domain/issue-upload-links';
import {
  PROVIDER_UPLOAD_LINK_TTL_SECONDS,
  READ_LINK_TTL_SECONDS,
} from '@/lib/modules/documentos/domain/limits';

import type { DocumentStorage, SignedUpload } from '@/lib/modules/documentos/ports/document-storage';

const EMPRESA = '33333333-3333-4333-8333-333333333333';
const OTRA_EMPRESA = '44444444-4444-4444-8444-444444444444';
const PERSONA = '11111111-1111-4111-8111-111111111111';

/** El instante de emision, fijo: sin un reloj inyectado la caducidad no se podria afirmar. */
const EMISION = new Date('2026-09-16T10:00:00.000Z');
/**
 * DOS HORAS despues, escrito a mano a proposito: si el plazo cambiara, este caso se entera.
 *
 * Dos horas y no quince minutos porque el plazo de un enlace de SUBIDA lo impone el proveedor y este
 * modulo no lo elige. Los quince minutos son el plazo de LECTURA, que es el unico que si fija aqui.
 */
const CADUCIDAD = '2026-09-16T12:00:00.000Z';

function actorAutorizado(companyId: string = EMPRESA): Actor {
  return { id: PERSONA, companyId, permissions: [DOCUMENT_UPLOAD_PERMISSION] };
}

/**
 * Doble del puerto que anota cada llamada.
 *
 * Devuelve una caducidad DELIBERADAMENTE ABSURDA: el plazo que vale es el del modulo, contado desde
 * el reloj inyectado, y si el caso de uso se limitara a reenviar lo que dice el adaptador, el caso
 * del camino feliz se pondria rojo con esta fecha de 1999.
 */
function dobleDeAlmacenamiento() {
  const llamadas: { path: string }[] = [];

  const createSignedUpload = vi.fn(async (path: string): Promise<SignedUpload> => {
    llamadas.push({ path });
    return {
      path,
      uploadUrl: `https://almacenamiento.invalido/subida/${llamadas.length}`,
      token: `token-${llamadas.length}`,
      expiresAt: '1999-01-01T00:00:00.000Z',
    };
  });

  const createSignedReadUrl = vi.fn(async (): Promise<string> => {
    throw new Error('la emision de enlaces no firma lecturas');
  });
  const download = vi.fn(async (): Promise<Uint8Array> => {
    throw new Error('la emision de enlaces no descarga nada');
  });
  const remove = vi.fn(async (): Promise<void> => {
    throw new Error('la emision de enlaces no borra nada');
  });

  const storage: DocumentStorage = { createSignedUpload, createSignedReadUrl, download, remove };
  return { storage, createSignedUpload, createSignedReadUrl, download, llamadas };
}

function emisor(storage: DocumentStorage) {
  return createIssueUploadLinks({ storage, now: () => EMISION });
}

/** Una tanda de `cantidad` archivos validos. */
function tanda(cantidad: number) {
  return {
    files: Array.from({ length: cantidad }, (_, indice) => ({
      fileName: `catalogo-${indice + 1}.pdf`,
      contentType: 'application/pdf' as const,
    })),
  };
}

describe('documentos — emision de enlaces de subida', () => {
  describe('el permiso va PRIMERO (R6)', () => {
    it('R6 — un actor sin el permiso recibe `unauthorized` y el puerto no se llama NI UNA vez', async () => {
      const doble = dobleDeAlmacenamiento();
      const sinPermiso: Actor = { id: PERSONA, companyId: EMPRESA, permissions: ['proveedores.consultar'] };

      await expect(emisor(doble.storage)(sinPermiso, tanda(3))).rejects.toThrow(UnauthorizedError);
      expect(doble.createSignedUpload).not.toHaveBeenCalled();
      expect(doble.llamadas).toEqual([]);
    });

    it('R6 — el actor ausente tampoco firma nada, y el rechazo es el mismo', async () => {
      const doble = dobleDeAlmacenamiento();
      await expect(emisor(doble.storage)(null, tanda(1))).rejects.toThrow(UnauthorizedError);
      expect(doble.llamadas).toEqual([]);
    });

    it('R6 — el permiso se comprueba ANTES que el esquema: con entrada rota y sin permiso, gana `unauthorized`', async () => {
      // Si validara primero, quien no tiene derecho a pedir nada se enteraria de como es la entrada
      // solo por haberla mandado mal.
      const doble = dobleDeAlmacenamiento();
      const sinPermiso: Actor = { id: PERSONA, companyId: EMPRESA, permissions: [] };

      await expect(emisor(doble.storage)(sinPermiso, { files: [] })).rejects.toThrow(UnauthorizedError);
      expect(doble.llamadas).toEqual([]);
    });
  });

  describe('documentos.modificar decide, nunca proveedores.* (R14, R15, R16)', () => {
    it('R15 — proveedores.modificar y proveedores.consultar, sin documentos.modificar, rechazan sin tocar el puerto', async () => {
      const doble = dobleDeAlmacenamiento();
      const actor: Actor = {
        id: PERSONA,
        companyId: EMPRESA,
        permissions: ['proveedores.modificar', 'proveedores.consultar'],
      };

      await expect(emisor(doble.storage)(actor, tanda(1))).rejects.toThrow(UnauthorizedError);
      expect(doble.llamadas).toEqual([]);
    });

    it('R15 — solo documentos.consultar, sin documentos.modificar, tambien rechaza', async () => {
      const doble = dobleDeAlmacenamiento();
      const actor: Actor = { id: PERSONA, companyId: EMPRESA, permissions: ['documentos.consultar'] };

      await expect(emisor(doble.storage)(actor, tanda(1))).rejects.toThrow(UnauthorizedError);
      expect(doble.llamadas).toEqual([]);
    });

    it('R16 — documentos.modificar sin ningun permiso de proveedores autoriza la operacion', async () => {
      const doble = dobleDeAlmacenamiento();
      const actor: Actor = { id: PERSONA, companyId: EMPRESA, permissions: ['documentos.modificar'] };

      const { uploads } = await emisor(doble.storage)(actor, tanda(1));

      expect(uploads).toHaveLength(1);
    });
  });

  describe('la tanda se rechaza ENTERA, sin firmar nada (R8, R9, R16)', () => {
    it('R8 — once archivos: `invalid_input` y CERO enlaces firmados, ni siquiera los diez primeros', async () => {
      const doble = dobleDeAlmacenamiento();

      await expect(emisor(doble.storage)(actorAutorizado(), tanda(11))).rejects.toThrow(ValidationError);
      // La afirmacion que importa: no es que se firmaran y se descartaran, es que no se firmo nada.
      expect(doble.createSignedUpload).not.toHaveBeenCalled();
      expect(doble.llamadas).toHaveLength(0);
    });

    it('R8 — el codigo del rechazo es `invalid_input`', async () => {
      const doble = dobleDeAlmacenamiento();
      await emisor(doble.storage)(actorAutorizado(), tanda(11)).then(
        () => expect.unreachable('tenia que haber rechazado'),
        (error: unknown) => {
          expect(error).toBeInstanceOf(ValidationError);
          expect((error as ValidationError).code).toBe('invalid_input');
        },
      );
    });

    it('R9 — una tanda vacia se rechaza con `invalid_input` y no llama al almacenamiento', async () => {
      const doble = dobleDeAlmacenamiento();

      await expect(emisor(doble.storage)(actorAutorizado(), { files: [] })).rejects.toThrow(ValidationError);
      expect(doble.llamadas).toEqual([]);
    });

    it('R16 — la entrada pasa por el esquema: campo desconocido, nombre vacio y tipo ajeno se rechazan sin tocar el puerto', async () => {
      const doble = dobleDeAlmacenamiento();
      const entradas: readonly unknown[] = [
        undefined,
        null,
        'una tanda',
        {},
        { files: 'catalogo.pdf' },
        { files: [{ fileName: 'catalogo.pdf', contentType: 'application/pdf' }], companyId: OTRA_EMPRESA },
        { files: [{ fileName: '   ', contentType: 'application/pdf' }] },
        { files: [{ fileName: 'catalogo.pdf', contentType: 'image/png' }] },
      ];

      for (const entrada of entradas) {
        await expect(
          emisor(doble.storage)(actorAutorizado(), entrada),
          JSON.stringify(entrada) ?? 'undefined',
        ).rejects.toThrow(ValidationError);
      }
      expect(doble.llamadas).toEqual([]);
    });

    it('R7 — los BYTES no tienen por donde entrar: una tanda que los traiga se rechaza y nada se sube', async () => {
      // `strictObject` hace que mandar bytes FALLE en vez de ignorarse en silencio. Los bytes viajan
      // del navegador al bucket sin atravesar la aplicacion.
      const doble = dobleDeAlmacenamiento();
      const conBytes = {
        files: [{ fileName: 'catalogo.pdf', contentType: 'application/pdf', bytes: [0x25, 0x50] }],
      };

      await expect(emisor(doble.storage)(actorAutorizado(), conBytes)).rejects.toThrow(ValidationError);
      expect(doble.llamadas).toEqual([]);
    });

    it('R12 — el cliente no puede proponer ruta: mandarla es un campo desconocido y se rechaza', async () => {
      const doble = dobleDeAlmacenamiento();
      const conRuta = {
        files: [
          {
            fileName: 'catalogo.pdf',
            contentType: 'application/pdf',
            path: `${OTRA_EMPRESA}/robado.pdf`,
          },
        ],
      };

      await expect(emisor(doble.storage)(actorAutorizado(), conRuta)).rejects.toThrow(ValidationError);
      expect(doble.llamadas).toEqual([]);
    });
  });

  describe('camino feliz: rutas y enlaces (R6, R10, R12, R13, R15)', () => {
    it('R6 — tres archivos dan tres entradas, cada una con su ruta y su enlace firmado', async () => {
      const doble = dobleDeAlmacenamiento();

      const { uploads } = await emisor(doble.storage)(actorAutorizado(), tanda(3));

      expect(uploads).toHaveLength(3);
      expect(doble.createSignedUpload).toHaveBeenCalledTimes(3);
      for (const upload of uploads) {
        expect(upload.path.length).toBeGreaterThan(0);
        expect(upload.uploadUrl.length).toBeGreaterThan(0);
        expect(upload.token.length).toBeGreaterThan(0);
      }
      // Tres rutas DISTINTAS: dos archivos de la misma tanda no se pisan.
      expect(new Set(uploads.map((upload) => upload.path)).size).toBe(3);
    });

    it('R12 — cada ruta cae bajo el prefijo de LA EMPRESA DEL ACTOR, y el nombre del cliente no entra en ella', async () => {
      const doble = dobleDeAlmacenamiento();

      const { uploads } = await emisor(doble.storage)(actorAutorizado(), tanda(3));

      for (const upload of uploads) {
        expect(upload.path.startsWith(`${EMPRESA}/`), upload.path).toBe(true);
        expect(isPathInCompany(upload.path, EMPRESA)).toBe(true);
        expect(isPathInCompany(upload.path, OTRA_EMPRESA)).toBe(false);
        // El `fileName` solo sirve para que la pantalla sepa de que archivo es cada enlace.
        expect(upload.path).not.toContain('catalogo');
      }
      // Y lo que se le pidio FIRMAR al puerto es exactamente eso, no otra cosa.
      for (const llamada of doble.llamadas) {
        expect(llamada.path.startsWith(`${EMPRESA}/`)).toBe(true);
      }
    });

    it('R12 — dos actores de empresas distintas con la MISMA entrada caen en prefijos distintos', async () => {
      // La ruta no sale de la entrada: sale del actor. Con la entrada como unica variable compartida,
      // lo unico que puede separar los dos resultados es la empresa de quien pide.
      const doble = dobleDeAlmacenamiento();
      const misma = tanda(2);

      const deUna = await emisor(doble.storage)(actorAutorizado(EMPRESA), misma);
      const deOtra = await emisor(doble.storage)(actorAutorizado(OTRA_EMPRESA), misma);

      for (const upload of deUna.uploads) {
        expect(isPathInCompany(upload.path, EMPRESA)).toBe(true);
        expect(isPathInCompany(upload.path, OTRA_EMPRESA)).toBe(false);
      }
      for (const upload of deOtra.uploads) {
        expect(isPathInCompany(upload.path, OTRA_EMPRESA)).toBe(true);
        expect(isPathInCompany(upload.path, EMPRESA)).toBe(false);
      }
    });

    it('R10 — la caducidad es la emision mas las DOS HORAS del proveedor, con el reloj inyectado', async () => {
      const doble = dobleDeAlmacenamiento();

      const { uploads } = await emisor(doble.storage)(actorAutorizado(), tanda(3));

      for (const upload of uploads) {
        expect(upload.expiresAt).toBe(CADUCIDAD);
        // Y no la fecha absurda del doble: la de la tanda se cuenta desde el reloj inyectado.
        expect(upload.expiresAt).not.toBe('1999-01-01T00:00:00.000Z');
      }
      // El plazo escrito arriba es de verdad el del proveedor, y esta en una sola definicion.
      expect(new Date(CADUCIDAD).getTime() - EMISION.getTime()).toBe(
        PROVIDER_UPLOAD_LINK_TTL_SECONDS * 1000,
      );
      expect(PROVIDER_UPLOAD_LINK_TTL_SECONDS).toBe(2 * 60 * 60);
    });

    it('R10 — la SUBIDA no promete los quince minutos: ese plazo es el de LECTURA y aqui no se usa', async () => {
      // El agujero que este caso cierra es el de volver a contar la caducidad de la subida con un
      // plazo que este modulo elija: el enlace seguiria vivo dos horas y la respuesta mentiria.
      const doble = dobleDeAlmacenamiento();

      const { uploads } = await emisor(doble.storage)(actorAutorizado(), tanda(2));

      const quinceMinutos = new Date(EMISION.getTime() + READ_LINK_TTL_SECONDS * 1000).toISOString();
      for (const upload of uploads) {
        expect(upload.expiresAt).not.toBe(quinceMinutos);
      }
      expect(READ_LINK_TTL_SECONDS).toBe(15 * 60);
      expect(PROVIDER_UPLOAD_LINK_TTL_SECONDS).not.toBe(READ_LINK_TTL_SECONDS);
    });

    it('R10 — al puerto NO se le pasa ningun plazo: quien lo impone es el proveedor', async () => {
      // Si alguien volviera a pasarle un `expiresInSeconds`, seria un valor que el proveedor ignora
      // y que nadie puede honrar. La firma recibe la RUTA y nada mas.
      const doble = dobleDeAlmacenamiento();

      await emisor(doble.storage)(actorAutorizado(), tanda(3));

      expect(doble.llamadas).toHaveLength(3);
      for (const argumentos of doble.createSignedUpload.mock.calls) {
        expect(argumentos).toHaveLength(1);
        expect(typeof argumentos[0]).toBe('string');
      }
    });

    it('R10 — toda la tanda caduca a la vez aunque el reloj avance entre firma y firma', async () => {
      // El plazo se calcula una vez para la tanda: firmar diez archivos no puede dar diez
      // vencimientos distintos por el mero paso del tiempo.
      const doble = dobleDeAlmacenamiento();
      let tic = 0;
      const emisorQueAvanza = createIssueUploadLinks({
        storage: doble.storage,
        now: () => new Date(EMISION.getTime() + (tic += 1000)),
      });

      const { uploads } = await emisorQueAvanza(actorAutorizado(), tanda(4));

      expect(new Set(uploads.map((upload) => upload.expiresAt)).size).toBe(1);
    });

    it('R13, R15 — la salida son rutas y enlaces: ninguna URL de lectura y ninguna conversion', async () => {
      const doble = dobleDeAlmacenamiento();

      const resultado = await emisor(doble.storage)(actorAutorizado(), tanda(3));

      // La forma exacta de la respuesta: nada mas que la tanda de enlaces.
      expect(Object.keys(resultado)).toEqual(['uploads']);
      for (const upload of resultado.uploads) {
        expect(Object.keys(upload).sort()).toEqual(['expiresAt', 'path', 'token', 'uploadUrl']);
        // La RUTA es una ruta, no una URL: cambiar de proyecto o de bucket no obliga a reescribirla.
        expect(upload.path).not.toMatch(/^https?:/);
        expect(upload.path).not.toContain('://');
      }
      // Y nadie pidio una lectura firmada ni una descarga.
      expect(doble.createSignedReadUrl).not.toHaveBeenCalled();
      expect(doble.download).not.toHaveBeenCalled();
    });

    it('R14 — no se escribe ni se lee ninguna fila: el caso de uso no tiene por donde', async () => {
      // La ausencia se comprueba en la FUENTE porque no hay base que observar: si manana alguien le
      // cablea un repositorio, este caso se pone rojo.
      const raiz = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
      const fuente = readFileSync(
        join(raiz, 'lib', 'modules', 'documentos', 'domain', 'issue-upload-links.ts'),
        'utf8',
      );

      expect(fuente).not.toMatch(/prisma/i);
      expect(fuente).not.toMatch(/repository/i);
      expect(fuente).not.toMatch(/@prisma\/client/);
    });
  });
});
