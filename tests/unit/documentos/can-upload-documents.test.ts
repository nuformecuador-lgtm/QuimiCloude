import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { canUploadDocuments, DOCUMENT_UPLOAD_PERMISSION } from '@/lib/modules/documentos/domain/actor';
import type { PermissionBearer } from '@/lib/modules/identity';

function actorCon(...permissions: readonly string[]): PermissionBearer {
  return { permissions };
}

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const MODULO_ABS = join(repoRoot, 'lib', 'modules', 'documentos');

function archivosTsDelModulo(): readonly string[] {
  const salida: string[] = [];
  const recorrer = (absDir: string) => {
    for (const nombre of readdirSync(absDir)) {
      const ruta = join(absDir, nombre);
      if (statSync(ruta).isDirectory()) recorrer(ruta);
      else if (ruta.endsWith('.ts')) salida.push(ruta);
    }
  };
  recorrer(MODULO_ABS);
  return salida;
}

describe('canUploadDocuments — el predicado de presentacion del modulo documentos', () => {
  it('R12: con documentos.modificar devuelve true', () => {
    expect(canUploadDocuments(actorCon(DOCUMENT_UPLOAD_PERMISSION))).toBe(true);
  });

  it('R12: con el literal "documentos.modificar" escrito aqui devuelve true', () => {
    // Escrito a mano y no via la constante: si alguien cambia el valor del permiso, este caso
    // se pone rojo aunque el conteo de abajo no lo detecte (solo mira lib/modules/documentos).
    expect(canUploadDocuments(actorCon('documentos.modificar'))).toBe(true);
  });

  it('R12: con proveedores.modificar devuelve false', () => {
    expect(canUploadDocuments(actorCon('proveedores.modificar'))).toBe(false);
  });

  it('R12: con documentos.consultar devuelve false', () => {
    expect(canUploadDocuments(actorCon('documentos.consultar'))).toBe(false);
  });

  it('R12: con recetas.modificar devuelve false', () => {
    expect(canUploadDocuments(actorCon('recetas.modificar'))).toBe(false);
  });

  it('R12: con el conjunto vacio devuelve false', () => {
    expect(canUploadDocuments(actorCon())).toBe(false);
  });

  it('R12: con null devuelve false y no lanza', () => {
    expect(() => canUploadDocuments(null)).not.toThrow();
    expect(canUploadDocuments(null)).toBe(false);
  });

  it('R12: con undefined devuelve false y no lanza', () => {
    expect(() => canUploadDocuments(undefined)).not.toThrow();
    expect(canUploadDocuments(undefined)).toBe(false);
  });

  it('R12: el literal "documentos.modificar" aparece una sola vez bajo lib/modules/documentos', () => {
    const archivos = archivosTsDelModulo();
    expect(archivos.length).toBeGreaterThan(0);

    let apariciones = 0;
    for (const archivo of archivos) {
      const contenido = readFileSync(archivo, 'utf8');
      const coincidencias = contenido.match(/'documentos\.modificar'/g);
      if (coincidencias !== null) apariciones += coincidencias.length;
    }

    expect(apariciones).toBe(1);
  });
});
