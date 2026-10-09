// QC-74 — el catalogo cerrado de permisos (R1, R2) y el conjunto que el seed asigna a cada rol
// (R8, R9). Hermano exacto de `./roles`: dominio puro, sin Prisma, sin `next/*`, sin `lib/shared`.
// Vive centralizado en `identity` a proposito (`design.md > 2`): repartirlo por modulo crearia un
// ciclo entre barriles (`identity -> inventario -> identity`) con constantes en `undefined`.
import {
  ROLE_ADMINISTRADOR,
  ROLE_OPERADOR,
  ROLE_EMPACADOR,
  ROLE_MAESTRO,
  ROLE_ACONDICIONAMIENTO,
} from './roles';

/**
 * El catalogo cerrado: el codigo tiene la forma `<modulo>.<accion>`, con modulo y accion en
 * español y en minusculas, siguiendo los nombres de modulo del repositorio (R1). Un modulo con
 * escritura declara `consultar` y `modificar`, y `modificar` cubre tambien el borrado (R3); un
 * modulo sin escritura declara solo `consultar` (R4: solo `dashboard`). NINGUNA entrada lleva
 * campo de empresa (R6).
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
 * **Esto vuelve a enmendar QC-74 R2**, y es la TERCERA enmienda al catalogo: QC-74 R2 dijo
 * «exactamente diez permisos», QC-38 lo llevo a once, QC-66 a trece y **QC-86 a quince**. QC-86
 * suma `asignaciones.consultar` y `asignaciones.modificar` (QC-86 R25). A diferencia de `usuarios`,
 * `asignaciones` SI es una carpeta real de `lib/modules/`, asi que estas dos entradas cumplen QC-74
 * R1 al pie de la letra; lo unico que tienen en comun con las de QC-66 es que su permiso vive
 * centralizado aqui, en `identity`, como el de todos los demas modulos.
 *
 * **Cuarta enmienda al catalogo cerrado**: suma `terminados.consultar`, ver todos los pedidos
 * terminados de la empresa sin filtro por usuario. Cambia el recuento y, como `usuarios`, su
 * modulo no es una carpeta de `lib/modules/`. Declara solo `consultar` porque no tiene escritura.
 * Lo reciben el Administrador y el Empacador; el Operador no.
 *
 * **Quinta enmienda al catalogo cerrado**: suma `clientes.consultar` y `clientes.modificar`, ver y
 * mantener los clientes de la empresa. Cambia el recuento; como `asignaciones`, su modulo si es una
 * carpeta de `lib/modules/`, y declara las dos acciones porque tiene escritura. Solo los recibe el
 * Administrador.
 *
 * `documentos` suma `documentos.consultar` y `documentos.modificar`: declara sus dos acciones
 * porque tiene escritura, y solo las recibe el Administrador.
 *
 * `empaque` suma `empaque.modificar`, sin `empaque.consultar`: es el primer modulo del catalogo
 * que solo escribe, porque quien lo tiene ya ve el pedido por otra via y no necesita una consulta
 * propia. Lo recibe unicamente el Empacador.
 *
 * **Octava enmienda al catalogo cerrado**: suma `empresas.consultar` y `empresas.modificar`,
 * ver y mantener las empresas de la plataforma. Cambia el recuento; como `usuarios`, su modulo no
 * es una carpeta de `lib/modules/`. Solo los recibe el Maestro: ningun rol de empresa los tiene.
 *
 * `asignaciones.ejecutar` es la unica accion que no es `consultar` ni `modificar`: separa ver los
 * pedidos asignados de entrar a ejecutarlos, para que quien solo empaca los vea sin ejecutarlos.
 * Lo reciben el Administrador y el Operador.
 *
 * **Otra enmienda al catalogo cerrado**: suma `acondicionamiento.modificar`, comenzar y terminar el
 * acondicionamiento y registrar sus datos de lote. Como `empaque`, su modulo no es una carpeta de
 * `lib/modules/` y solo escribe. Lo recibe unicamente el Administrador de acondicionamiento: el
 * Administrador no.
 *
 * **Otra enmienda al catalogo cerrado**: suma `integraciones.modificar`, ver y configurar las
 * integraciones con servicios externos. Su modulo si es una carpeta de `lib/modules/` y, como
 * `empaque`, solo declara `modificar`: quien configura una integracion la ve con el mismo permiso.
 * Lo recibe unicamente el Administrador.
 *
 * `entregas` suma `entregas.modificar`, entregar al cliente el producto terminado de un pedido.
 * Como `empaque`, su modulo no es una carpeta de `lib/modules/` y solo escribe. Lo recibe el
 * Administrador.
 *
 * `entregas.anular` es la segunda accion que no es `consultar` ni `modificar`: separa entregar de
 * deshacer una entrega, que devuelve producto al inventario. Lo recibe el Administrador.
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
  {
    code: 'asignaciones.consultar',
    module: 'asignaciones',
    action: 'consultar',
    description: 'Consultar los pedidos asignados.',
  },
  {
    code: 'asignaciones.modificar',
    module: 'asignaciones',
    action: 'modificar',
    description: 'Asignar y desasignar responsables de un pedido.',
  },
  {
    code: 'asignaciones.ejecutar',
    module: 'asignaciones',
    action: 'ejecutar',
    description: 'Entrar, comenzar y terminar la ejecución de los pedidos asignados.',
  },
  {
    code: 'terminados.consultar',
    module: 'terminados',
    action: 'consultar',
    description: 'Consultar todos los pedidos terminados de la empresa.',
  },
  {
    code: 'clientes.consultar',
    module: 'clientes',
    action: 'consultar',
    description: 'Consultar los clientes de la empresa.',
  },
  {
    code: 'clientes.modificar',
    module: 'clientes',
    action: 'modificar',
    description: 'Crear, editar y borrar clientes de la empresa.',
  },
  {
    code: 'documentos.consultar',
    module: 'documentos',
    action: 'consultar',
    description: 'Consultar los documentos de la empresa y el estado de su procesamiento.',
  },
  {
    code: 'documentos.modificar',
    module: 'documentos',
    action: 'modificar',
    description: 'Subir documentos PDF y encolar su procesamiento.',
  },
  {
    code: 'empaque.modificar',
    module: 'empaque',
    action: 'modificar',
    description: 'Comenzar y terminar el empaque de los pedidos de la empresa.',
  },
  {
    code: 'empresas.consultar',
    module: 'empresas',
    action: 'consultar',
    description: 'Consultar las empresas de la plataforma.',
  },
  {
    code: 'empresas.modificar',
    module: 'empresas',
    action: 'modificar',
    description: 'Dar de alta, editar y dar de baja empresas de la plataforma.',
  },
  {
    code: 'acondicionamiento.modificar',
    module: 'acondicionamiento',
    action: 'modificar',
    description:
      'Comenzar y terminar el acondicionamiento de los pedidos de la empresa y registrar sus datos de lote.',
  },
  {
    code: 'integraciones.modificar',
    module: 'integraciones',
    action: 'modificar',
    description: 'Ver y configurar las integraciones con servicios externos.',
  },
  {
    code: 'entregas.modificar',
    module: 'entregas',
    action: 'modificar',
    description: 'Entregar al cliente el producto terminado de los pedidos de la empresa.',
  },
  {
    code: 'entregas.anular',
    module: 'entregas',
    action: 'anular',
    description: 'Anular entregas de producto terminado de los pedidos de la empresa.',
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
 * que cualquier otro rol, y el Operador nace con exactamente los que se le escriben aqui: ni
 * `recetas.consultar` ni ningun otro. Las claves salen de
 * `./roles`, nunca del literal. Sin empresa: el permiso cuelga del rol y de nada mas (R6).
 *
 * El Empacador nace con exactamente `asignaciones.consultar`, `terminados.consultar` y
 * `empaque.modificar`, sin `inventario.consultar` ni `asignaciones.modificar`.
 *
 * El Maestro nace con exactamente `empresas.consultar` y `empresas.modificar`, y ningun rol de
 * empresa recibe ninguno de los dos.
 *
 * El Administrador de acondicionamiento nace con exactamente `asignaciones.consultar` y
 * `acondicionamiento.modificar`.
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
    'asignaciones.consultar',
    'asignaciones.modificar',
    'asignaciones.ejecutar',
    'terminados.consultar',
    'clientes.consultar',
    'clientes.modificar',
    'documentos.consultar',
    'documentos.modificar',
    'integraciones.modificar',
    'entregas.modificar',
    'entregas.anular',
  ],
  [ROLE_OPERADOR]: ['inventario.consultar', 'asignaciones.consultar', 'asignaciones.ejecutar'],
  [ROLE_EMPACADOR]: ['asignaciones.consultar', 'terminados.consultar', 'empaque.modificar'],
  [ROLE_MAESTRO]: ['empresas.consultar', 'empresas.modificar'],
  [ROLE_ACONDICIONAMIENTO]: ['asignaciones.consultar', 'acondicionamiento.modificar'],
};

/**
 * Los codigos del catalogo que el Administrador NO recibe, aunque exista un modulo que los
 * declare: el empaque es tarea del Empacador y las empresas son cosa de la plataforma, no de una
 * empresa. Vive aqui, y no en un test, para que quien compare "lo que tiene el Administrador"
 * contra "el catalogo entero" lo haga restando esta lista en vez de escribiendo un total a mano.
 *
 * El acondicionamiento es tarea del Administrador de acondicionamiento; el Administrador lo
 * supervisa desde «Todos».
 */
export const ADMIN_EXCLUDED_PERMISSIONS: readonly PermissionCode[] = [
  'empaque.modificar',
  'empresas.consultar',
  'empresas.modificar',
  'acondicionamiento.modificar',
];
