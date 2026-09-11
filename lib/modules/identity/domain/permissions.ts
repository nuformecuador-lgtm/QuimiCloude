// QC-74 — el catalogo cerrado de permisos (R1, R2) y el conjunto que el seed asigna a cada rol
// (R8, R9). Hermano exacto de `./roles`: dominio puro, sin Prisma, sin `next/*`, sin `lib/shared`.
// Vive centralizado en `identity` a proposito (`design.md > 2`): repartirlo por modulo crearia un
// ciclo entre barriles (`identity -> inventario -> identity`) con constantes en `undefined`.
import { ROLE_ADMINISTRADOR, ROLE_OPERADOR } from './roles';

/**
 * El catalogo cerrado: trece permisos, ni uno mas ni uno menos (QC-74 R2, enmendado por QC-38 y
 * por QC-66). El codigo tiene la forma `<modulo>.<accion>`, con modulo y accion en español y en
 * minusculas, siguiendo los nombres de modulo del repositorio (R1). Un modulo con escritura
 * declara `consultar` y `modificar`, y `modificar` cubre tambien el borrado (R3); un modulo sin
 * escritura declara solo `consultar` (R4: solo `dashboard`). NINGUNA entrada lleva campo de
 * empresa (R6).
 *
 * **Esto enmienda QC-74 R2** («exactamente diez permisos, ni uno mas ni uno menos»). QC-74 R4 dejo
 * a `unidades` sin escritura justificandolo con «no tiene escritura»; QC-38 es justamente la ficha
 * que se la da, asi que esa premisa dejo de ser cierta y el catalogo gana `unidades.modificar`
 * (QC-38 decision cerrada 23, habilitada por QC-76 decision cerrada 24: «si el permiso debe
 * cambiar, lo decide QC-38»).
 *
 * **Esto enmienda QC-74 R1** («siguiendo los nombres de modulo del repositorio»). QC-66 suma
 * `usuarios.consultar` y `usuarios.modificar`, y `usuarios` NO es ninguna carpeta de
 * `lib/modules/`: los usuarios viven dentro de `identity` y ahi se quedan (el modelo `User` es
 * `/// @module identity`). Vale igual como `<modulo>` porque el codigo lo lee una persona y
 * `identidad.consultar` no dice QUE se consulta (QC-66 decision cerrada 2, R12). Es la SEGUNDA
 * enmienda al catalogo de QC-74, despues de la de QC-38, y se dice con estas palabras en vez de
 * disimularla.
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
    code: 'unidades.modificar',
    module: 'unidades',
    action: 'modificar',
    description: 'Crear, editar y borrar unidades de medida.',
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
  {
    code: 'usuarios.consultar',
    module: 'usuarios',
    action: 'consultar',
    description: 'Consultar los usuarios de la empresa.',
  },
  {
    code: 'usuarios.modificar',
    module: 'usuarios',
    action: 'modificar',
    description:
      'Crear, editar, borrar y cambiar el estado de cuenta de los usuarios de la empresa.',
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
    'unidades.modificar',
    'proveedores.consultar',
    'proveedores.modificar',
    'pedidos.consultar',
    'pedidos.modificar',
    'usuarios.consultar',
    'usuarios.modificar',
  ],
  [ROLE_OPERADOR]: ['inventario.consultar'],
};
