// La Server Action de la emision de enlaces, probada contra dobles: sin sesion real, sin red y sin
// bucket.
//
// Lo que se afirma aqui es que la accion NO DECIDE NADA: resuelve el actor con las dos caras de la
// sesion, valida con el esquema del contrato, entrega y traduce el error por su `code`. Que la
// autorizacion rechace de verdad lo prueban los tests del dominio; aqui lo que importa es el REPARTO
// —quien decide que— y el orden en que se ven los dos rechazos posibles.
//
// Dos formas de doblar, a proposito:
//   - `issueUploadLinksMock` a secas, cuando lo que se mira es QUE le llega al caso de uso o que
//     hace la accion con lo que devuelve;
//   - el caso de uso REAL cableado sobre un puerto de almacenamiento que REVIENTA si alguien lo
//     llama, cuando lo que se mira es que un rechazo no firma nada. Asi «no se toco el
//     almacenamiento» es una afirmacion y no la ausencia de una asercion.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createIssueUploadLinks, UnauthorizedError, ValidationError } from '@/lib/modules/documentos';
import { DOCUMENT_UPLOAD_PERMISSION } from '@/lib/modules/documentos/domain/actor';
import { issueUploadLinksAction } from '@/lib/modules/documentos/adapters/driving/document-upload-actions';

import type { Actor, IssueUploadLinksInput } from '@/lib/modules/documentos';
import type { DocumentStorage } from '@/lib/modules/documentos/ports/document-storage';

const { getSessionUserMock, getSessionContextMock, issueUploadLinksMock } = vi.hoisted(() => ({
  getSessionUserMock: vi.fn(),
  getSessionContextMock: vi.fn(),
  issueUploadLinksMock: vi.fn(),
}));

/** La accion pide a la composicion la lectura de la cabecera y se la pasa al traductor unico de
 *  errores. Sin ella en el doble, el modulo ni siquiera carga. */
const { REQUEST_ID_DE_PRUEBA, readRequestIdHeaderMock } = vi.hoisted(() => {
  const id = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
  return { REQUEST_ID_DE_PRUEBA: id, readRequestIdHeaderMock: vi.fn(async () => id) };
});

vi.mock('@/lib/composition', () => ({
  observabilidad: { readRequestIdHeader: readRequestIdHeaderMock },
  identity: {
    getSessionUser: getSessionUserMock,
    getSessionContext: getSessionContextMock,
  },
  documentos: { issueUploadLinks: issueUploadLinksMock },
}));

const PERSONA = '11111111-1111-4111-8111-111111111111';
const EMPRESA = '33333333-3333-4333-8333-333333333333';

/** La sesion conserva `roleName` porque es DISPLAY; la accion no lo mira. */
const SESSION_USER = {
  id: PERSONA,
  username: 'ana.perez',
  displayName: 'Ana Perez',
  roleName: 'Administrador',
  permissions: [DOCUMENT_UPLOAD_PERMISSION, 'proveedores.consultar'],
};

const SESSION_CONTEXT = { userId: PERSONA, companyId: EMPRESA, roleName: 'Administrador' };

/** Igualdad ESTRICTA contra esto es lo que pone en rojo un `roleName` o un `username` colados. */
const ACTOR_ESPERADO: Actor = {
  id: PERSONA,
  companyId: EMPRESA,
  permissions: [DOCUMENT_UPLOAD_PERMISSION, 'proveedores.consultar'],
};

/** Una tanda bien formada de `cantidad` archivos. */
function tanda(cantidad: number): IssueUploadLinksInput {
  return {
    files: Array.from({ length: cantidad }, (_, indice) => ({
      fileName: `catalogo-${indice + 1}.pdf`,
      contentType: 'application/pdf' as const,
    })),
  };
}

/**
 * Entradas que el TIPO no puede impedir: lo que llega de un cliente puede ser cualquier cosa, y por
 * eso el esquema existe. El casteo dice justo eso y no disimula nada.
 */
function entradaCruda(valor: unknown): IssueUploadLinksInput {
  return valor as IssueUploadLinksInput;
}

/** El puerto doblado de forma que CUALQUIER metodo reviente si alguien lo llama. */
function almacenamientoQueNoDebeLlamarse() {
  const explota = (nombre: string) =>
    vi.fn(async (): Promise<never> => {
      throw new Error(`${nombre} no debia invocarse`);
    });

  const createSignedUpload = explota('createSignedUpload');
  const createSignedReadUrl = explota('createSignedReadUrl');
  const download = explota('download');
  const storage = {
    createSignedUpload,
    createSignedReadUrl,
    download,
  } as unknown as DocumentStorage;

  return { storage, metodos: [createSignedUpload, createSignedReadUrl, download] };
}

/** Cablea el caso de uso REAL sobre el puerto que revienta y lo enchufa a la fachada doblada, para
 *  que la accion invoque dominio de verdad en vez de otro doble. */
function cablearCasoDeUsoReal() {
  const puerto = almacenamientoQueNoDebeLlamarse();
  const emitir = createIssueUploadLinks({ storage: puerto.storage });
  issueUploadLinksMock.mockImplementation((actor: Actor | null, input: unknown) =>
    emitir(actor, input),
  );
  return puerto;
}

const raizDelRepo = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const RUTA_DE_LA_ACCION = 'lib/modules/documentos/adapters/driving/document-upload-actions.ts';

beforeEach(() => {
  vi.clearAllMocks();
  getSessionUserMock.mockResolvedValue(SESSION_USER);
  getSessionContextMock.mockResolvedValue(SESSION_CONTEXT);
});

describe('documentos — la Server Action de la emision de enlaces', () => {
  describe('camino feliz: rutas y enlaces (R29)', () => {
    it('R29 — devuelve `success` con la tanda de enlaces tal cual la da el caso de uso', async () => {
      const lote = {
        uploads: [
          {
            path: `${EMPRESA}/a1.pdf`,
            uploadUrl: 'https://almacenamiento.invalido/subida/1',
            token: 'token-1',
            expiresAt: '2026-09-16T10:15:00.000Z',
          },
        ],
      };
      issueUploadLinksMock.mockResolvedValue(lote);

      const resultado = await issueUploadLinksAction(tanda(1));

      expect(resultado).toEqual({ status: 'success', data: lote });
      // Serializable sin perder nada: lo que devuelve una Server Action cruza al navegador.
      expect(JSON.parse(JSON.stringify(resultado))).toEqual({ status: 'success', data: lote });
    });

    it('R29 — el actor lleva id, empresa y permisos, y nada mas: ni username ni roleName viajan', async () => {
      issueUploadLinksMock.mockResolvedValue({ uploads: [] });

      await issueUploadLinksAction(tanda(2));

      expect(issueUploadLinksMock.mock.calls[0]?.[0]).toEqual(ACTOR_ESPERADO);
      expect(getSessionUserMock).toHaveBeenCalledTimes(1);
      expect(getSessionContextMock).toHaveBeenCalledTimes(1);
    });

    it('R16 — al caso de uso cruza el valor YA VALIDADO por el esquema del contrato', async () => {
      issueUploadLinksMock.mockResolvedValue({ uploads: [] });

      await issueUploadLinksAction(tanda(2));

      expect(issueUploadLinksMock.mock.calls[0]?.[1]).toEqual({
        files: [
          { fileName: 'catalogo-1.pdf', contentType: 'application/pdf' },
          { fileName: 'catalogo-2.pdf', contentType: 'application/pdf' },
        ],
      });
    });

    it('R29 — la accion no recibe BYTES por ninguna via: su firma admite UN argumento', async () => {
      issueUploadLinksMock.mockResolvedValue({ uploads: [] });
      expect(issueUploadLinksAction).toHaveLength(1);
    });
  });

  describe('entrada invalida con un actor autorizado (R16)', () => {
    /** Todo lo que el esquema del contrato rechaza: tanda vacia, tanda por encima del tope, campo
     *  desconocido, nombre en blanco, tipo ajeno, bytes y una ruta propuesta por el cliente. */
    const ENTRADAS_INVALIDAS: readonly (readonly [string, IssueUploadLinksInput])[] = [
      ['tanda vacia', tanda(0)],
      ['once archivos', tanda(11)],
      ['campo desconocido en la tanda', entradaCruda({ ...tanda(1), companyId: EMPRESA })],
      ['nombre en blanco', entradaCruda({ files: [{ fileName: '   ', contentType: 'application/pdf' }] })],
      ['tipo ajeno', entradaCruda({ files: [{ fileName: 'x.pdf', contentType: 'image/png' }] })],
      [
        'bytes',
        entradaCruda({
          files: [{ fileName: 'x.pdf', contentType: 'application/pdf', bytes: [0x25, 0x50] }],
        }),
      ],
      [
        'ruta propuesta por el cliente',
        entradaCruda({
          files: [{ fileName: 'x.pdf', contentType: 'application/pdf', path: 'otra-empresa/x.pdf' }],
        }),
      ],
      ['nada', entradaCruda(undefined)],
    ];

    it.each(ENTRADAS_INVALIDAS)(
      'R16 — %s: `invalid_input` y el almacenamiento NO se toca',
      async (_nombre, entrada) => {
        const puerto = cablearCasoDeUsoReal();

        const resultado = await issueUploadLinksAction(entrada);

        expect(resultado).toMatchObject({ status: 'error', code: 'invalid_input' });
        for (const metodo of puerto.metodos) expect(metodo).not.toHaveBeenCalled();
      },
    );

    it('R16 — la entrada rota NO llega al caso de uso como valor tipado: llega cruda, y el esquema es el UNICO juez', async () => {
      // El esquema del borde y el del dominio son el MISMO objeto del contrato, no dos copias: por
      // eso lo que la accion rechazaria es exactamente lo que el caso de uso rechaza.
      cablearCasoDeUsoReal();
      const rota = entradaCruda({ files: 'catalogo.pdf' });

      const resultado = await issueUploadLinksAction(rota);

      expect(resultado).toMatchObject({ status: 'error', code: 'invalid_input' });
      expect(issueUploadLinksMock.mock.calls[0]?.[1]).toBe(rota);
    });
  });

  describe('sin sesion, y sin permiso: el veredicto de autorizacion gana SIEMPRE (R29)', () => {
    it('R29 — falta la PRIMERA cara (getSessionUser): `unauthorized`, actor null y cero llamadas al almacenamiento', async () => {
      const puerto = cablearCasoDeUsoReal();
      getSessionUserMock.mockResolvedValue(null);

      const resultado = await issueUploadLinksAction(tanda(3));

      expect(resultado).toMatchObject({ status: 'error', code: 'unauthorized' });
      expect(issueUploadLinksMock.mock.calls[0]?.[0]).toBeNull();
      for (const metodo of puerto.metodos) expect(metodo).not.toHaveBeenCalled();
    });

    it('R29 — falta la SEGUNDA cara (getSessionContext, la EMPRESA): mismo rechazo', async () => {
      const puerto = cablearCasoDeUsoReal();
      getSessionContextMock.mockResolvedValue(null);

      const resultado = await issueUploadLinksAction(tanda(3));

      expect(resultado).toMatchObject({ status: 'error', code: 'unauthorized' });
      expect(issueUploadLinksMock.mock.calls[0]?.[0]).toBeNull();
      for (const metodo of puerto.metodos) expect(metodo).not.toHaveBeenCalled();
    });

    it('R29 — la accion NO comprueba ningun permiso: un actor sin permisos llega igual y lo rechaza el caso de uso', async () => {
      const puerto = cablearCasoDeUsoReal();
      getSessionUserMock.mockResolvedValue({ ...SESSION_USER, permissions: [] });

      const resultado = await issueUploadLinksAction(tanda(3));

      expect(issueUploadLinksMock.mock.calls[0]?.[0]).toEqual({
        ...ACTOR_ESPERADO,
        permissions: [],
      });
      expect(resultado).toMatchObject({ status: 'error', code: 'unauthorized' });
      for (const metodo of puerto.metodos) expect(metodo).not.toHaveBeenCalled();
    });

    it('R29 — sin permiso Y con la entrada rota gana `unauthorized`: quien no puede operar no se entera de como es la entrada', async () => {
      // Si el borde cortara con `invalid_input` antes de que el dominio comprobara el permiso, este
      // caso devolveria `invalid_input` y el rechazo dejaria de fallar cerrado.
      const puerto = cablearCasoDeUsoReal();
      getSessionUserMock.mockResolvedValue({ ...SESSION_USER, permissions: [] });

      const resultado = await issueUploadLinksAction(entradaCruda({ files: [] }));

      expect(resultado).toMatchObject({ status: 'error', code: 'unauthorized' });
      expect(resultado).not.toMatchObject({ code: 'invalid_input' });
      for (const metodo of puerto.metodos) expect(metodo).not.toHaveBeenCalled();
    });

    it('R29 — sin sesion Y con la entrada rota, tambien gana `unauthorized`', async () => {
      const puerto = cablearCasoDeUsoReal();
      getSessionUserMock.mockResolvedValue(null);
      getSessionContextMock.mockResolvedValue(null);

      const resultado = await issueUploadLinksAction(entradaCruda({ files: 'catalogo.pdf' }));

      expect(resultado).toMatchObject({ status: 'error', code: 'unauthorized' });
      for (const metodo of puerto.metodos) expect(metodo).not.toHaveBeenCalled();
    });
  });

  describe('la traduccion es POR EL CODE, nunca por el texto (R29)', () => {
    it('R29 — el rechazo de autorizacion sale con su code aunque se mute el mensaje del error', async () => {
      const error = new UnauthorizedError();
      Object.defineProperty(error, 'message', { value: 'un texto que nadie debe mirar' });
      issueUploadLinksMock.mockRejectedValue(error);

      const resultado = await issueUploadLinksAction(tanda(1));

      expect(resultado).toMatchObject({ status: 'error', code: 'unauthorized' });
      expect(JSON.stringify(resultado)).not.toContain('un texto que nadie debe mirar');
    });

    it('R16 — el rechazo del esquema sale como `invalid_input` aunque se mute el mensaje', async () => {
      const error = new ValidationError();
      Object.defineProperty(error, 'message', { value: 'otro texto que nadie debe mirar' });
      issueUploadLinksMock.mockRejectedValue(error);

      const resultado = await issueUploadLinksAction(tanda(1));

      expect(resultado).toMatchObject({ status: 'error', code: 'invalid_input' });
      expect(JSON.stringify(resultado)).not.toContain('otro texto que nadie debe mirar');
    });

    it('R29 — un error ajeno al dominio sale como `unexpected`, con referencia y sin filtrar su texto', async () => {
      issueUploadLinksMock.mockRejectedValue(new Error('storage responded 500 for bucket documentos'));

      const resultado = await issueUploadLinksAction(tanda(1));

      expect(resultado).toMatchObject({
        status: 'error',
        code: 'unexpected',
        reference: REQUEST_ID_DE_PRUEBA,
      });
      expect(JSON.stringify(resultado)).not.toContain('storage responded 500');
    });
  });

  describe('el borde: Server Action y nada mas (R29)', () => {
    it("R29 — el archivo declara 'use server' y no se reexporta desde el contrato del modulo", () => {
      const fuenteDeLaAccion = readFileSync(join(raizDelRepo, ...RUTA_DE_LA_ACCION.split('/')), 'utf8');
      const primeraSentencia = fuenteDeLaAccion
        .split('\n')
        .map((linea) => linea.trim())
        .find((linea) => linea.length > 0);
      expect(primeraSentencia).toBe("'use server';");

      // El contrato no puede arrastrar este archivo: un `'use server'` en su cierre transitivo lo
      // volveria inimportable desde un componente de cliente.
      const barril = readFileSync(
        join(raizDelRepo, 'lib', 'modules', 'documentos', 'index.ts'),
        'utf8',
      );
      const reexportaciones = [...barril.matchAll(/export\s+(?:[^'";]*?from\s+)?['"]([^'"]+)['"]/g)]
        .map((coincidencia) => coincidencia[1] as string)
        .filter((especificador) => !especificador.startsWith('./domain/'));
      expect(reexportaciones).toEqual([]);
      expect(barril).not.toContain('document-upload-actions');
    });

    it('R29 — la emision de enlaces no estrena ningun Route Handler: el modulo no tiene ninguno', () => {
      // La accion vive en `adapters/driving/`, que es el borde de este modulo. Que `app/api/**` siga
      // sin existir lo vigila la guardia de alcance de la ficha; aqui se afirma lo del modulo.
      const fuente = readFileSync(join(raizDelRepo, ...RUTA_DE_LA_ACCION.split('/')), 'utf8');
      expect(fuente).not.toMatch(/NextRequest|NextResponse/);
      expect(fuente).not.toMatch(/export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE)\b/);
    });
  });
});
