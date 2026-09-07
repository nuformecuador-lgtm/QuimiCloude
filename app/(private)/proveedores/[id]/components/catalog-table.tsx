import type { ReactNode } from 'react';

import { EntityImage } from '@/components/shared/entity-image';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { CatalogLineView } from '@/lib/modules/proveedores';

import { CATALOG_COLUMNS, UNRESOLVED_CELL } from './catalog-columns';
import type { CatalogDirectories } from './catalog-directories';

/**
 * Tabla del catalogo de un proveedor (R12, R13, R21, R22, R30, R41, R48; `design.md > 6`).
 *
 * **Sin `'use client'`**: no tiene estado ni manejadores. Recibe las lineas y los diccionarios por
 * props desde `CatalogListSection`, que es quien llama a la operacion de consulta y quien
 * construye los diccionarios **una sola vez** (R46, R22).
 *
 * **R13 lo cumple el primitivo, no una clase escrita aqui**: `components/ui/table.tsx` envuelve el
 * `<table>` en un `div[data-slot=table-container]` con `overflow-x-auto`. El desbordamiento
 * horizontal lo absorbe ese envoltorio y ningun ancestro de la pantalla declara scroll horizontal
 * ni `100vh`, de modo que el documento no se desplaza en viewport angosto. No se edita el
 * primitivo (R44) ni se anade columna pegajosa: `position: sticky` horizontal se comporta distinto
 * en WebKit y las acciones se alcanzan con el scroll de la propia tabla.
 */

/**
 * Encabezado de la columna de imagen. Constante para que ningun test dependa del literal.
 *
 * **ENMIENDA A R30 (decision humana del 2026-09-07)**: R30 dejo escrito que la tabla de la linea
 * «no muestra la imagen». Ahora SI la muestra, en la PRIMERA columna, con el mismo marcador que
 * la tabla de inventario. Lo que NO cambia de R30: el formulario de la linea sigue sin pedir
 * imagen ni ofrecer subirla, asi que `image_path` sigue sin ser llenada por nadie y lo que se ve
 * en todas las filas es el marcador.
 *
 * Se declara AQUI y no en la lista de columnas por lo mismo que en inventario: esa lista es de
 * DATOS -cada columna devuelve una cadena- y una miniatura es marcado. Imagen primero, datos en
 * medio, acciones al final.
 */
export const CATALOG_IMAGE_COLUMN_LABEL = 'Imagen';

/** Encabezado de la columna de acciones. Constante para que ningun test dependa del literal. */
export const CATALOG_ACTIONS_COLUMN_LABEL = 'Acciones';

type CatalogTableProps = {
  readonly lines: readonly CatalogLineView[];
  readonly directories: CatalogDirectories;
  /**
   * Acciones de la fila (editar, dar de baja). Es un **slot**: la tabla no importa el panel
   * lateral ni el dialogo de baja -los enchufa `CatalogListSection`, que es un Server Component-,
   * asi que la tabla no arrastra frontera de cliente y no conoce la API de esos componentes.
   *
   * Cuando no se pasa, la columna de acciones **no se declara**: una columna de encabezado
   * «Acciones» con celdas vacias solo ensancharia la tabla sin decir nada.
   */
  readonly rowActions?: (line: CatalogLineView) => ReactNode;
};

export function CatalogTable({ lines, directories, rowActions }: CatalogTableProps) {
  return (
    <Table data-testid="catalog-table">
      <TableHeader>
        <TableRow>
          <TableHead scope="col" data-testid="catalog-column-image" className="w-14 text-left">
            {CATALOG_IMAGE_COLUMN_LABEL}
          </TableHead>
          {CATALOG_COLUMNS.map((column) => (
            <TableHead
              key={column.key}
              data-testid={column.testId}
              className={column.align === 'end' ? 'text-right' : 'text-left'}
              scope="col"
            >
              {column.label}
            </TableHead>
          ))}
          {rowActions === undefined ? null : (
            <TableHead scope="col" data-testid="catalog-column-actions" className="text-right">
              {CATALOG_ACTIONS_COLUMN_LABEL}
            </TableHead>
          )}
        </TableRow>
      </TableHeader>
      <TableBody>
        {lines.map((line) => (
          <TableRow key={line.id} data-testid="catalog-row">
            {/* Ver la enmienda a R30 en `CATALOG_IMAGE_COLUMN_LABEL`. */}
            <TableCell className="text-left" data-testid="catalog-cell-image">
              <EntityImage path={line.imagePath} name={line.name} testId="catalog-image" />
            </TableCell>
            {CATALOG_COLUMNS.map((column) => {
              const text = column.value(line, directories);
              return (
                <TableCell
                  key={column.key}
                  data-testid={`catalog-cell-${column.key}`}
                  className={column.align === 'end' ? 'text-right tabular-nums' : 'text-left'}
                >
                  {/*
                    R22: cuando el nombre no se resuelve -unidad ausente, presentacion fuera de la
                    cota del diccionario o directorio que fallo- la celda pinta un MARCADOR con su
                    propio `data-testid`, y en ningun caso el identificador tecnico.
                  */}
                  {text === null ? (
                    <span
                      data-testid={`catalog-unresolved-${column.key}`}
                      className="text-muted-foreground"
                      aria-label="Sin nombre disponible"
                    >
                      {UNRESOLVED_CELL}
                    </span>
                  ) : (
                    text
                  )}
                </TableCell>
              );
            })}
            {rowActions === undefined ? null : (
              /*
                Las acciones van en la ultima columna y se alcanzan con el scroll de la propia
                tabla. **Siempre visibles**: nada de revelarlas con `:hover`, que en tactil no
                existe (R48).
              */
              <TableCell className="text-right" data-testid="catalog-cell-actions">
                <div className="flex justify-end gap-1">{rowActions(line)}</div>
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
