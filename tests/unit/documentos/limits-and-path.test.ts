// Los limites del modulo, la firma del PDF y la ruta con prefijo de empresa.
//
// Las tres piezas son puras: se ejercitan con bytes y cadenas fabricados aqui, sin red, sin bucket
// y sin un solo archivo binario nuevo en el repositorio.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { buildDocumentPath, isPathInCompany } from '@/lib/modules/documentos/domain/document-path';
import {
  MAX_FILES_PER_BATCH,
  MAX_PDF_BYTES,
  MAX_PDF_PAGES,
  PAGE_RENDER_DPI,
  PROVIDER_UPLOAD_LINK_TTL_SECONDS,
  READ_LINK_TTL_SECONDS,
} from '@/lib/modules/documentos/domain/limits';
import { isPdfContent } from '@/lib/modules/documentos/domain/pdf-content';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const MODULO = join(repoRoot, 'lib', 'modules', 'documentos');
const LIMITS = join(MODULO, 'domain', 'limits.ts');
const PUERTO = join(MODULO, 'ports', 'document-storage.ts');

const EMPRESA = '6b1c0000-0000-4000-8000-000000000001';

/** Bytes a partir de un texto: asi los casos de prueba se leen como lo que son. */
function bytesDe(texto: string): Uint8Array {
  return new TextEncoder().encode(texto);
}

function stripComments(source: string): string {
  return source
    .split('\n')
    .map((line) => line.replace(/\/\/[^\n]*$/, ''))
    .join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, ' ');
}

function fuentesDelModulo(dir: string = MODULO): readonly string[] {
  return readdirSync(dir).flatMap((nombre) => {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) return fuentesDelModulo(ruta);
    return ruta.endsWith('.ts') ? [ruta] : [];
  });
}

function relPosix(absPath: string): string {
  return relative(repoRoot, absPath).split(sep).join('/');
}

describe('documentos — limites, firma del PDF y ruta de empresa', () => {
  describe('«¿es un PDF?» se responde por el CONTENIDO (R17)', () => {
    it('R17 — un archivo que empieza por la firma de PDF es valido', () => {
      expect(isPdfContent(bytesDe('%PDF-1.7\n%âãÏÓ\n1 0 obj'))).toBe(true);
      expect(isPdfContent(bytesDe('%PDF-1.4'))).toBe(true);
    });

    it('R17 — un PNG, un texto plano y un archivo vacio son invalidos aunque se llamen `.pdf`', () => {
      // El nombre no entra en la funcion A PROPOSITO: no hay forma de que la extension decida.
      const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
      expect(isPdfContent(png), 'catalogo.pdf que en realidad es un PNG').toBe(false);
      expect(isPdfContent(bytesDe('precio;producto\n12.5;Acido citrico')), 'un CSV renombrado').toBe(false);
      expect(isPdfContent(new Uint8Array(0)), 'archivo vacio').toBe(false);
      expect(isPdfContent(bytesDe('%PDF')), 'firma incompleta').toBe(false);
      expect(isPdfContent(bytesDe('  %PDF-1.7')), 'la firma no esta al principio').toBe(false);
      expect(isPdfContent(bytesDe('%pdf-1.7')), 'la firma distingue mayusculas').toBe(false);
    });
  });

  describe('la ruta empieza por la empresa (R12)', () => {
    it('R12 — la ruta construida empieza por la empresa y termina en `.pdf`', () => {
      const path = buildDocumentPath(EMPRESA);
      expect(path.startsWith(`${EMPRESA}/`)).toBe(true);
      expect(path.endsWith('.pdf')).toBe(true);
      expect(isPathInCompany(path, EMPRESA)).toBe(true);
      // Dos llamadas seguidas no colisionan: el nombre lo pone el servidor, no el cliente.
      expect(buildDocumentPath(EMPRESA)).not.toBe(path);
    });

    it('R12 — dos empresas distintas caen en prefijos distintos', () => {
      const otra = '6b1c0000-0000-4000-8000-000000000002';
      const deUna = buildDocumentPath(EMPRESA);
      const deOtra = buildDocumentPath(otra);
      expect(isPathInCompany(deUna, otra)).toBe(false);
      expect(isPathInCompany(deOtra, EMPRESA)).toBe(false);
    });

    it('R12 — `empresa-A2/x.pdf` NO pasa como ruta de `empresa-A`: se compara el segmento completo', () => {
      // Con un `startsWith` pelado esto pasaria, y una empresa leeria los archivos de otra solo por
      // como se llama. Es el caso que justifica la funcion entera.
      expect(isPathInCompany('empresa-A2/x.pdf', 'empresa-A')).toBe(false);
      expect(isPathInCompany('empresa-A/x.pdf', 'empresa-A')).toBe(true);
    });

    it('R12 — la travesia de directorios y la carpeta sola tampoco pasan', () => {
      for (const ruta of [
        '../empresa-B/x.pdf',
        'empresa-A',
        'empresa-A/',
        '/empresa-A/x.pdf',
        'otra/empresa-A/x.pdf',
        '',
      ]) {
        expect(isPathInCompany(ruta, 'empresa-A'), ruta).toBe(false);
      }
      // Y una empresa vacia no autoriza nada, ni siquiera una ruta que empiece por `/`.
      expect(isPathInCompany('/x.pdf', '')).toBe(false);
    });
  });

  describe('cada plazo tiene su dueno, y no son el mismo (R10)', () => {
    it('R10 — el plazo de LECTURA lo fija este modulo: quince minutos, y el puerto SI los pide', () => {
      expect(READ_LINK_TTL_SECONDS).toBe(15 * 60);
      const puerto = stripComments(readFileSync(PUERTO, 'utf8'));
      expect(puerto).toMatch(/createSignedReadUrl\(path: string, expiresInSeconds: number\)/);
    });

    it('R10 — el plazo de SUBIDA lo impone el PROVEEDOR: dos horas, y el puerto NO las pide', () => {
      // Un puerto que pidiera un plazo que el proveedor ignora seria una mentira en el contrato.
      expect(PROVIDER_UPLOAD_LINK_TTL_SECONDS).toBe(2 * 60 * 60);
      const puerto = stripComments(readFileSync(PUERTO, 'utf8'));
      expect(puerto).toMatch(/createSignedUpload\(path: string\)/);
      expect(puerto).not.toMatch(/createSignedUpload\([^)]*expiresInSeconds/);
    });

    it('R10 — el docblock del plazo de subida dice que el modulo NO lo elige y NO lo promete', () => {
      const fuente = readFileSync(LIMITS, 'utf8');
      expect(fuente).toMatch(/NO lo elige/);
      expect(fuente).toMatch(/NO lo promete/);
      // Y los dos plazos son distintos de verdad: si alguien los igualara, uno de los dos sobraria.
      expect(PROVIDER_UPLOAD_LINK_TTL_SECONDS).not.toBe(READ_LINK_TTL_SECONDS);
    });
  });

  describe('cada limite vive en UNA sola definicion (R20, R18)', () => {
    it('R20 — los seis limites tienen los valores acordados', () => {
      expect(MAX_FILES_PER_BATCH).toBe(10);
      expect(MAX_PDF_PAGES).toBe(50);
      expect(PAGE_RENDER_DPI).toBe(150);
      expect(READ_LINK_TTL_SECONDS).toBe(15 * 60);
      expect(PROVIDER_UPLOAD_LINK_TTL_SECONDS).toBe(2 * 60 * 60);
      expect(MAX_PDF_BYTES).toBe(20 * 1024 * 1024);
    });

    it('R20 — cada nombre se declara exactamente una vez en el arbol del modulo', () => {
      const fuentes = fuentesDelModulo();
      expect(fuentes.length).toBeGreaterThan(0);
      for (const nombre of [
        'MAX_FILES_PER_BATCH',
        'MAX_PDF_PAGES',
        'PAGE_RENDER_DPI',
        'READ_LINK_TTL_SECONDS',
        'PROVIDER_UPLOAD_LINK_TTL_SECONDS',
        'MAX_PDF_BYTES',
      ]) {
        const declarantes = fuentes.filter((ruta) =>
          new RegExp(`export const ${nombre}\\b`).test(stripComments(readFileSync(ruta, 'utf8'))),
        );
        expect(declarantes.map(relPosix), nombre).toEqual(['lib/modules/documentos/domain/limits.ts']);
      }
    });

    it('R20 — ningun otro archivo del modulo escribe los valores: se importan, no se repiten', () => {
      // Se busca el NUMERO, no el nombre: un `const TOPE = 10` en otro archivo es exactamente la
      // divergencia silenciosa que este caso existe para impedir.
      const valores: readonly (readonly [string, RegExp])[] = [
        ['MAX_FILES_PER_BATCH', /\b10\b/],
        ['MAX_PDF_PAGES', /\b50\b/],
        ['PAGE_RENDER_DPI', /\b150\b/],
        ['READ_LINK_TTL_SECONDS', /\b900\b|15\s*\*\s*60/],
        ['PROVIDER_UPLOAD_LINK_TTL_SECONDS', /\b7200\b|2\s*\*\s*60\s*\*\s*60/],
        ['MAX_PDF_BYTES', /\b20971520\b|20\s*\*\s*1024\s*\*\s*1024/],
      ];
      const otros = fuentesDelModulo().filter((ruta) => ruta !== LIMITS);
      expect(otros.length).toBeGreaterThan(0);

      for (const [nombre, patron] of valores) {
        const codigoDeLimits = stripComments(readFileSync(LIMITS, 'utf8'));
        expect(patron.test(codigoDeLimits), `${nombre} no aparece en limits.ts`).toBe(true);

        const intrusos = otros.filter((ruta) => patron.test(stripComments(readFileSync(ruta, 'utf8'))));
        expect(intrusos.map(relPosix), `${nombre} repetido fuera de limits.ts`).toEqual([]);
      }
    });

    it('R18 — el docblock de MAX_PDF_BYTES dice que lo impone el bucket y que el codigo no lo hace cumplir', () => {
      const fuente = readFileSync(LIMITS, 'utf8');
      expect(fuente).toMatch(/fileSizeLimit/);
      expect(fuente).toMatch(/NO LO HACE CUMPLIR/);

      // Y la otra mitad, que es la que lo demuestra: ningun archivo del modulo COMPARA con el tope.
      const comparaciones = fuentesDelModulo()
        .filter((ruta) => ruta !== LIMITS)
        .filter((ruta) => /MAX_PDF_BYTES\s*(<|>|<=|>=|===|!==)|(<|>|<=|>=|===|!==)\s*MAX_PDF_BYTES/.test(
          stripComments(readFileSync(ruta, 'utf8')),
        ));
      expect(comparaciones.map(relPosix)).toEqual([]);
    });
  });
});
