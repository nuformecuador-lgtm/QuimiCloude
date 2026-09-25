/**
 * El traductor de error propio de la revision de una formula: `documentos.confirmFormulaImport`
 * puede rechazar con un error PROPIO, o con uno de `recetas` (el choque de nombre, la receta que
 * ya no existe, un producto terminado) o de `inventario` (el permiso de crear una materia prima).
 *
 * Prueba las tres familias en el orden fijado por `design.md > 6.2`: la primera clase base que
 * reconoce el error lo traduce con el traductor UNICO de QC-70 (`createErrorStateTranslator`); si
 * ninguna lo reconoce, el de `documentos` lo deja en `unexpected_error`, como el resto de acciones
 * de este modulo. No construye NINGUN estado a mano: delega siempre en el traductor unico.
 */
import { DocumentosError } from '@/lib/modules/documentos';
import { createErrorStateTranslator, type ErrorState, type RequestIdHeaderReader } from '@/lib/modules/errores';
import { InventarioError } from '@/lib/modules/inventario';
import { RecetasError } from '@/lib/modules/recetas';

export function createFormulaImportErrorTranslator(
  readRequestIdHeader: RequestIdHeaderReader,
): (error: unknown) => Promise<ErrorState> {
  const documentosTranslator = createErrorStateTranslator(DocumentosError, readRequestIdHeader);
  const recetasTranslator = createErrorStateTranslator(RecetasError, readRequestIdHeader);
  const inventarioTranslator = createErrorStateTranslator(InventarioError, readRequestIdHeader);

  return async function translateFormulaImportError(error: unknown): Promise<ErrorState> {
    if (error instanceof DocumentosError) return documentosTranslator(error);
    if (error instanceof RecetasError) return recetasTranslator(error);
    if (error instanceof InventarioError) return inventarioTranslator(error);
    return documentosTranslator(error);
  };
}
