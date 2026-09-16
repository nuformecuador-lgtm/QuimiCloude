// El esquema de entrada de la tanda: lo que entra, lo que se rechaza y lo que NI SIQUIERA se puede
// expresar. Ningun caso toca la red: el esquema es dominio puro.

import { describe, expect, it } from 'vitest';

import { MAX_FILES_PER_BATCH } from '@/lib/modules/documentos/domain/limits';
import { issueUploadLinksSchema } from '@/lib/modules/documentos/domain/upload-input';

function archivo(fileName = 'catalogo.pdf') {
  return { fileName, contentType: 'application/pdf' };
}

function tandaDe(cuantos: number) {
  return { files: Array.from({ length: cuantos }, (_, indice) => archivo(`catalogo-${indice}.pdf`)) };
}

describe('documentos — esquema de entrada de la tanda', () => {
  describe('el tamano de la tanda (R8, R9)', () => {
    it('R9 — una tanda sin ningun archivo se rechaza', () => {
      expect(issueUploadLinksSchema.safeParse({ files: [] }).success).toBe(false);
    });

    it('R16 — una tanda sin la clave `files` se rechaza', () => {
      expect(issueUploadLinksSchema.safeParse({}).success).toBe(false);
    });

    it('R8 — una tanda con el tope exacto de archivos se acepta', () => {
      const resultado = issueUploadLinksSchema.safeParse(tandaDe(MAX_FILES_PER_BATCH));
      expect(resultado.success).toBe(true);
      expect(resultado.success && resultado.data.files).toHaveLength(MAX_FILES_PER_BATCH);
      // Ancla del tope: el esquema usa la constante del modulo, no un numero propio.
      expect(MAX_FILES_PER_BATCH).toBe(10);
    });

    it('R8 — una tanda con un archivo de mas se rechaza ENTERA', () => {
      const resultado = issueUploadLinksSchema.safeParse(tandaDe(MAX_FILES_PER_BATCH + 1));
      expect(resultado.success).toBe(false);
      // No hay ninguna forma de que el esquema devuelva «los diez primeros»: o pasa la tanda, o no
      // pasa nada.
      expect(resultado.success ? resultado.data : null).toBeNull();
    });
  });

  describe('cada archivo de la tanda (R16)', () => {
    it('R16 — un nombre vacio o de puros espacios se rechaza: se recorta antes de medir', () => {
      expect(issueUploadLinksSchema.safeParse({ files: [archivo('')] }).success).toBe(false);
      expect(issueUploadLinksSchema.safeParse({ files: [archivo('   ')] }).success).toBe(false);
    });

    it('R16 — el nombre llega recortado al caso de uso', () => {
      const resultado = issueUploadLinksSchema.safeParse({ files: [archivo('  catalogo.pdf  ')] });
      expect(resultado.success).toBe(true);
      expect(resultado.success && resultado.data.files[0]?.fileName).toBe('catalogo.pdf');
    });

    it('R16 — un nombre mas largo de lo admitido se rechaza', () => {
      expect(issueUploadLinksSchema.safeParse({ files: [archivo('a'.repeat(256))] }).success).toBe(false);
      expect(issueUploadLinksSchema.safeParse({ files: [archivo('a'.repeat(255))] }).success).toBe(true);
    });

    it('R16 — un `contentType` ajeno se rechaza, y eso es comodidad y no garantia', () => {
      for (const ajeno of ['image/png', 'application/octet-stream', 'text/csv', 'APPLICATION/PDF', '']) {
        expect(
          issueUploadLinksSchema.safeParse({ files: [{ fileName: 'x.pdf', contentType: ajeno }] }).success,
          ajeno,
        ).toBe(false);
      }
      // Quien MIENTE en ese campo pasa este esquema y lo para el bucket: por eso el tipo declarado
      // no se usa en ningun sitio como prueba de que el archivo sea un PDF.
      expect(issueUploadLinksSchema.safeParse({ files: [archivo()] }).success).toBe(true);
    });

    it('R16 — falta un campo del archivo: se rechaza', () => {
      expect(issueUploadLinksSchema.safeParse({ files: [{ fileName: 'x.pdf' }] }).success).toBe(false);
      expect(issueUploadLinksSchema.safeParse({ files: [{ contentType: 'application/pdf' }] }).success).toBe(false);
    });
  });

  describe('lo que NO esta en el esquema es el requisito (R16)', () => {
    it('R16 — un campo desconocido en la tanda se rechaza en vez de ignorarse', () => {
      expect(issueUploadLinksSchema.safeParse({ files: [archivo()], companyId: 'otra' }).success).toBe(false);
    });

    it('R16 — un campo desconocido en un archivo tambien se rechaza', () => {
      for (const extra of [{ path: 'otra-empresa/x.pdf' }, { bytes: 'AAAA' }, { size: 999 }]) {
        expect(
          issueUploadLinksSchema.safeParse({ files: [{ ...archivo(), ...extra }] }).success,
          JSON.stringify(extra),
        ).toBe(false);
      }
    });
  });
});
