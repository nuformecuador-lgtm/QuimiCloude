// QC-74 — el catalogo cerrado de permisos (R1, R2) y el conjunto que el seed asigna a cada rol
// (R8, R9). Hermano exacto de `./roles`: dominio puro, sin Prisma, sin `next/*`, sin `lib/shared`.
// Vive centralizado en `identity` a proposito (`design.md > 2`): repartirlo por modulo crearia un
// ciclo entre barriles (`identity -> inventario -> identity`) con constantes en `undefined`.
import { ROLE_ADMINISTRADOR, ROLE_OPERADOR } from './roles';

/**
 * El catalogo cerrado: diez permisos, ni uno mas ni uno menos (R2). El codigo tiene la forma
 * `<modulo>.<accion>`, con modulo y accion en español y en minusculas, siguiendo los nombres de
 * modulo del repositorio (R1). Un modulo con escritura declara `consultar` y `modificar`, y
 * `modificar` cubre tambien el borrado (R3); un modulo sin escritura declara solo `consultar`
 * (R4: `dashboard` y `unidades`). NINGUNA entrada lleva campo de empresa (R6).
 *
 * El catalogo solo cambia por migracion y seed: no hay via de aplicacion que lo edite (R5).
 */
export const PERMISSIONS = [
  {
    code: 'dashboard.consultar',
    module: 'dashboard',
    action: 'consultar',
    description: 'Consultar el panel de inicio.',
  },
  {
    code: 'inventario.consultar',
    module: 'inventario',
    action: 'consultar',
    description: 'Consultar productos y presentaciones del inventario.',
  },
  {
    code: 'inventario.modificar',
    module: 'inventario',
    action: 'modificar',
    description: 'Crear, editar y borrar productos y presentaciones del inventario.',
  },
  {
    code: 'recetas.consultar',
    module: 'recetas',
    action: 'consultar',
    description: 'Consultar recetas y sus pasos.',
  },
  {
    code: 'recetas.modificar',
    module: 'recetas',
    action: 'modificar',
    description: 'Crear, editar y borrar recetas y sus pasos.',
  },
  {
    code: 'unidades.consultar',
    module: 'unidades',
    action: 'consultar',
    description: 'Consultar las unidades de medida.',
  },
  {
    code: 'proveedores.consultar',
    module: 'proveedores',
    action: 'consultar',
    description: 'Consultar proveedores y su catalogo.',
  },
  {
    code: 'proveedores.modificar',
    module: 'proveedores',
    action: 'modificar',
    description: 'Crear, editar y borrar proveedores y lineas de su catalogo.',
  },
  {
    code: 'pedidos.consultar',
    module: 'pedidos',
    action: 'consultar',
    description: 'Consultar pedidos y su contenido.',
  },
  {
    code: 'pedidos.modificar',
    module: 'pedidos',
    action: 'modificar',
    description: 'Crear, editar, anular y borrar pedidos.',
  },
] as const;

/**
 * Union de literales, NO `string`: un caso de uso que exija `'inventaro.consultar'` no compila.
 * Media clase de errores se convierte asi en rojo de `typecheck` en vez de en un test que nadie
 * escribio (`design.md > 2`).
 */
export type PermissionCode = (typeof PERMISSIONS)[number]['code'];

/**
 * Los permisos que el seed asigna a cada rol, ESCRITOS UNO A UNO (decision 2026-09-07 nº2). Sin
 * comodin y sin derivarlos de `PERMISSIONS`: el Administrador pasa por la MISMA ruta de permiso
 * que cualquier otro rol (R8), y el Operador nace con exactamente uno (R9). Las claves salen de
 * `./roles`, nunca del literal. Sin empresa: el permiso cuelga del rol y de nada mas (R6).
 */
export const SEED_ROLE_PERMISSIONS: Readonly<Record<string, readonly PermissionCode[]>> = {
  [ROLE_ADMINISTRADOR]: [
    'dashboard.consultar',
    'inventario.consultar',
    'inventario.modificar',
    'recetas.consultar',
    'recetas.modificar',
    'unidades.consultar',
    'proveedores.consultar',
    'proveedores.modificar',
    'pedidos.consultar',
    'pedidos.modificar',
  ],
  [ROLE_OPERADOR]: ['inventario.consultar'],
};
