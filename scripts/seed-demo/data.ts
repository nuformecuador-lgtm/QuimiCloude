/**
 * Los datos de demostracion: ficticios, y todos reconocibles por el prefijo `DEMO`
 * (nombres), `DEMO-` (lotes) o `demo.` (nombres de usuario). Nada de aqui es un dato real.
 *
 * Cada entidad se identifica por su nombre dentro de la empresa; el pedido, que no tiene
 * nombre, por su receta y su cantidad. Por eso dos pedidos de la misma receta llevan
 * cantidades distintas.
 */
import type { MovementReason } from '../../lib/modules/inventario'
import type { OrderPriority, OrderStatus } from '../../lib/modules/pedidos'

import type { DemoRoleKey } from './guard'

export const DEMO_PREFIX = 'DEMO'

export type DemoUser = {
  readonly key: string
  readonly username: string
  readonly role: DemoRoleKey
  readonly firstNames: string
  readonly lastNames: string
  readonly documentNumber: string
  readonly phone: string
}

export type DemoWorkGroup = {
  readonly key: string
  readonly name: string
  readonly members: readonly string[]
}

export type DemoUnit = {
  readonly key: string
  readonly name: string
  readonly symbol: string
  readonly baseSystemUnit: string
  readonly factor: string
}

export type DemoPresentation = {
  readonly key: string
  readonly name: string
  readonly unit: string
  readonly content: string
}

export type DemoBatch = {
  readonly lot: string
  readonly stock: string
  readonly unitCost: string | null
  readonly purchaseDate: string
  readonly expiryDate?: string
}

export type DemoProduct =
  | {
      readonly key: string
      readonly type: 'PRODUCT'
      readonly name: string
      readonly unit: string
      readonly qtyAlert: string
      readonly batches: readonly DemoBatch[]
    }
  | {
      readonly key: string
      readonly type: 'PACKAGING'
      readonly name: string
      readonly presentation: string
      readonly qtyAlert: string
      readonly batches: readonly DemoBatch[]
    }
  | {
      readonly key: string
      readonly type: 'MACHINE'
      readonly name: string
      readonly batches: readonly DemoBatch[]
    }

export type DemoAdjustment = {
  readonly lot: string
  readonly delta: string
  readonly reason: MovementReason
}

export type DemoCatalogLine = {
  readonly name: string
  readonly presentation: string
  readonly unit: string | null
  readonly cost: string
  readonly minPurchase: string | null
  readonly deliveryTime: number | null
  readonly material: string | null
}

export type DemoSupplier = {
  readonly name: string
  readonly phone: string
  readonly email: string
  readonly catalog: readonly DemoCatalogLine[]
}

export type DemoCustomer = {
  readonly key: string
  readonly firstNames: string
  readonly lastNames: string
  readonly city: string
  readonly phone: string
  readonly email: string
  readonly address: string
}

export type DemoRecipeLine = { readonly product: string; readonly percentage: string }

export type DemoRecipeVersion = {
  readonly key: string
  readonly name: string
  readonly lines: readonly DemoRecipeLine[]
}

export type DemoRecipe = {
  readonly key: string
  readonly name: string
  readonly description: string
  readonly steps: readonly string[]
  readonly packingSteps: readonly string[]
  readonly lines: readonly DemoRecipeLine[]
  readonly tools: readonly { readonly product: string; readonly quantity: number }[]
  readonly versions: readonly DemoRecipeVersion[]
}

export type DemoOrder = {
  readonly key: string
  readonly recipe: string
  readonly version?: string
  readonly quantity: string
  readonly unit: string
  readonly priority: OrderPriority
  readonly target: OrderStatus
  readonly packaging: readonly { readonly product: string; readonly packages: number }[]
  readonly customer: string | null
  readonly responsibles: { readonly users: readonly string[]; readonly groups: readonly string[] }
  readonly operator: string
  readonly packer: string
  readonly conditioner: string
  readonly cancellationReason?: string
}

export type DemoDataset = {
  readonly users: readonly DemoUser[]
  readonly workGroups: readonly DemoWorkGroup[]
  readonly units: readonly DemoUnit[]
  readonly presentations: readonly DemoPresentation[]
  readonly products: readonly DemoProduct[]
  readonly adjustments: readonly DemoAdjustment[]
  readonly suppliers: readonly DemoSupplier[]
  readonly customers: readonly DemoCustomer[]
  readonly recipes: readonly DemoRecipe[]
  readonly orders: readonly DemoOrder[]
}

/**
 * `ENTREGADO` existe en el enum pero ningun caso de uso lleva hoy un pedido ahi: el empaque
 * termina en `POR_ACONDICIONAR` y el acondicionamiento en `TERMINADO`. No se fuerza por SQL.
 */
export const UNREACHABLE_ORDER_STATUSES: readonly OrderStatus[] = ['ENTREGADO']

const users: readonly DemoUser[] = [
  { key: 'operador1', username: 'demo.operador1', role: 'operador', firstNames: 'DEMO Oscar', lastNames: 'Perez', documentNumber: 'DEMO-1002', phone: '+57 300 000 1002' },
  { key: 'operador2', username: 'demo.operador2', role: 'operador', firstNames: 'DEMO Olga', lastNames: 'Martinez', documentNumber: 'DEMO-1003', phone: '+57 300 000 1003' },
  { key: 'empacador1', username: 'demo.empacador1', role: 'empacador', firstNames: 'DEMO Esteban', lastNames: 'Lopez', documentNumber: 'DEMO-1004', phone: '+57 300 000 1004' },
  { key: 'empacador2', username: 'demo.empacador2', role: 'empacador', firstNames: 'DEMO Elena', lastNames: 'Garcia', documentNumber: 'DEMO-1005', phone: '+57 300 000 1005' },
  { key: 'acondicionador', username: 'demo.acondicionador', role: 'acondicionamiento', firstNames: 'DEMO Andres', lastNames: 'Castro', documentNumber: 'DEMO-1006', phone: '+57 300 000 1006' },
]

const workGroups: readonly DemoWorkGroup[] = [
  { key: 'operarios', name: 'DEMO Operarios turno manana', members: ['operador1', 'operador2'] },
  { key: 'empaque', name: 'DEMO Empaque', members: ['empacador1', 'empacador2'] },
]

const units: readonly DemoUnit[] = [
  { key: 'galon', name: 'DEMO galon', symbol: 'gal', baseSystemUnit: 'mililitro', factor: '3785.4118' },
  { key: 'tonelada', name: 'DEMO tonelada', symbol: 't', baseSystemUnit: 'gramo', factor: '1000000' },
]

const presentations: readonly DemoPresentation[] = [
  { key: 'garrafa5', name: 'DEMO Garrafa 5 L', unit: 'litro', content: '5' },
  { key: 'bidon20', name: 'DEMO Bidon 20 L', unit: 'litro', content: '20' },
  { key: 'frasco500', name: 'DEMO Frasco 500 ml', unit: 'mililitro', content: '500' },
  { key: 'saco25', name: 'DEMO Saco 25 kg', unit: 'kilogramo', content: '25' },
  { key: 'galon1', name: 'DEMO Galon', unit: 'galon', content: '1' },
]

const products: readonly DemoProduct[] = [
  { key: 'hipoclorito', type: 'PRODUCT', name: 'DEMO Hipoclorito de sodio 13%', unit: 'litro', qtyAlert: '50', batches: [
    { lot: 'DEMO-HIP-001', stock: '400', unitCost: '2.5', purchaseDate: '2026-08-04', expiryDate: '2027-02-04' },
    { lot: 'DEMO-HIP-002', stock: '300', unitCost: '2.7', purchaseDate: '2026-09-15', expiryDate: '2027-03-15' },
  ] },
  { key: 'agua', type: 'PRODUCT', name: 'DEMO Agua desmineralizada', unit: 'litro', qtyAlert: '200', batches: [
    { lot: 'DEMO-AGU-001', stock: '2000', unitCost: '0.1', purchaseDate: '2026-09-01' },
  ] },
  { key: 'les', type: 'PRODUCT', name: 'DEMO Lauril eter sulfato de sodio', unit: 'kilogramo', qtyAlert: '25', batches: [
    { lot: 'DEMO-LES-001', stock: '120', unitCost: '4.2', purchaseDate: '2026-08-20' },
    { lot: 'DEMO-LES-002', stock: '80', unitCost: '4.45', purchaseDate: '2026-09-25' },
  ] },
  { key: 'sal', type: 'PRODUCT', name: 'DEMO Cloruro de sodio', unit: 'kilogramo', qtyAlert: '50', batches: [
    { lot: 'DEMO-NAC-001', stock: '500', unitCost: '0.8', purchaseDate: '2026-08-10' },
  ] },
  { key: 'fragancia', type: 'PRODUCT', name: 'DEMO Fragancia limon', unit: 'kilogramo', qtyAlert: '5', batches: [
    { lot: 'DEMO-FRA-001', stock: '20', unitCost: '35', purchaseDate: '2026-09-05', expiryDate: '2027-09-05' },
  ] },
  { key: 'colorante', type: 'PRODUCT', name: 'DEMO Colorante amarillo', unit: 'gramo', qtyAlert: '500', batches: [
    { lot: 'DEMO-COL-001', stock: '5000', unitCost: '0.05', purchaseDate: '2026-09-05' },
  ] },
  { key: 'soda', type: 'PRODUCT', name: 'DEMO Hidroxido de sodio', unit: 'kilogramo', qtyAlert: '20', batches: [
    { lot: 'DEMO-SOD-001', stock: '100', unitCost: '3', purchaseDate: '2026-09-10' },
  ] },
  // Poca existencia a proposito: el pedido de la receta citrica queda BLOQUEADO.
  { key: 'citrico', type: 'PRODUCT', name: 'DEMO Acido citrico', unit: 'kilogramo', qtyAlert: '10', batches: [
    { lot: 'DEMO-ACI-001', stock: '0.5', unitCost: '6', purchaseDate: '2026-09-12' },
  ] },
  { key: 'envaseGarrafa', type: 'PACKAGING', name: 'DEMO Envase garrafa 5 L', presentation: 'garrafa5', qtyAlert: '40', batches: [
    { lot: 'DEMO-ENV-G5-001', stock: '200', unitCost: '1.2', purchaseDate: '2026-09-02' },
  ] },
  { key: 'envaseBidon', type: 'PACKAGING', name: 'DEMO Envase bidon 20 L', presentation: 'bidon20', qtyAlert: '10', batches: [
    { lot: 'DEMO-ENV-B20-001', stock: '60', unitCost: '4', purchaseDate: '2026-09-02' },
  ] },
  { key: 'envaseFrasco', type: 'PACKAGING', name: 'DEMO Envase frasco 500 ml', presentation: 'frasco500', qtyAlert: '100', batches: [
    { lot: 'DEMO-ENV-F500-001', stock: '500', unitCost: '0.3', purchaseDate: '2026-09-02' },
  ] },
  { key: 'agitador', type: 'MACHINE', name: 'DEMO Agitador industrial', batches: [
    { lot: 'DEMO-MAQ-001', stock: '2', unitCost: null, purchaseDate: '2026-01-15' },
  ] },
  { key: 'balanza', type: 'MACHINE', name: 'DEMO Balanza digital', batches: [
    { lot: 'DEMO-MAQ-002', stock: '1', unitCost: '450', purchaseDate: '2026-02-20' },
  ] },
]

const adjustments: readonly DemoAdjustment[] = [
  { lot: 'DEMO-HIP-002', delta: '-5', reason: 'merma' },
  { lot: 'DEMO-NAC-001', delta: '10', reason: 'conteo_fisico' },
  { lot: 'DEMO-ENV-F500-001', delta: '-5', reason: 'rotura' },
]

const suppliers: readonly DemoSupplier[] = [
  { name: 'DEMO Quimicos Andinos S.A.S.', phone: '+57 601 000 2001', email: 'ventas@quimicos-andinos.demo.test', catalog: [
    { name: 'DEMO Hipoclorito 13% bidon 20 L', presentation: 'bidon20', unit: 'litro', cost: '48', minPurchase: '10', deliveryTime: 3, material: null },
    { name: 'DEMO Lauril eter sulfato saco 25 kg', presentation: 'saco25', unit: 'kilogramo', cost: '102', minPurchase: '4', deliveryTime: 7, material: null },
    { name: 'DEMO Acido citrico saco 25 kg', presentation: 'saco25', unit: 'kilogramo', cost: '140', minPurchase: '2', deliveryTime: 10, material: null },
  ] },
  { name: 'DEMO Envases del Valle Ltda.', phone: '+57 602 000 2002', email: 'pedidos@envases-valle.demo.test', catalog: [
    { name: 'DEMO Garrafa PEAD 5 L', presentation: 'garrafa5', unit: null, cost: '1.15', minPurchase: '100', deliveryTime: 5, material: 'PEAD' },
    { name: 'DEMO Frasco PET 500 ml', presentation: 'frasco500', unit: null, cost: '0.28', minPurchase: '500', deliveryTime: 5, material: 'PET' },
  ] },
]

const customers: readonly DemoCustomer[] = [
  { key: 'ferreteria', firstNames: 'DEMO Laura', lastNames: 'Gomez', city: 'Bogota', phone: '+57 310 000 3001', email: 'laura.gomez@cliente.demo.test', address: 'Calle 10 # 20-30' },
  { key: 'hotel', firstNames: 'DEMO Mateo', lastNames: 'Sanchez', city: 'Medellin', phone: '+57 310 000 3002', email: 'mateo.sanchez@cliente.demo.test', address: 'Carrera 45 # 12-08' },
  { key: 'colegio', firstNames: 'DEMO Valentina', lastNames: 'Herrera', city: 'Cali', phone: '+57 310 000 3003', email: 'valentina.herrera@cliente.demo.test', address: 'Avenida 6 # 15-40' },
  { key: 'clinica', firstNames: 'DEMO Santiago', lastNames: 'Vargas', city: 'Barranquilla', phone: '+57 310 000 3004', email: 'santiago.vargas@cliente.demo.test', address: 'Calle 72 # 50-11' },
]

const recipes: readonly DemoRecipe[] = [
  {
    key: 'multiusos',
    name: 'DEMO Limpiador multiusos limon',
    description: 'Limpiador de superficies con aroma a limon. Formula ficticia de demostracion.',
    steps: [
      'Cargar el agua desmineralizada en el tanque de mezcla.',
      'Agregar el lauril eter sulfato con agitacion lenta hasta disolver.',
      'Incorporar la sal, la fragancia y el colorante; agitar 15 minutos.',
    ],
    packingSteps: ['Envasar, tapar y etiquetar cada envase.'],
    lines: [
      { product: 'agua', percentage: '85' },
      { product: 'les', percentage: '10' },
      { product: 'fragancia', percentage: '3' },
      { product: 'colorante', percentage: '1' },
      { product: 'sal', percentage: '1' },
    ],
    tools: [{ product: 'agitador', quantity: 1 }],
    versions: [
      { key: 'concentrado', name: 'DEMO Concentrado', lines: [
        { product: 'agua', percentage: '75' },
        { product: 'les', percentage: '18' },
        { product: 'fragancia', percentage: '5' },
        { product: 'colorante', percentage: '1' },
        { product: 'sal', percentage: '1' },
      ] },
      { key: 'sinColorante', name: 'DEMO Sin colorante', lines: [
        { product: 'agua', percentage: '86' },
        { product: 'les', percentage: '10' },
        { product: 'fragancia', percentage: '3' },
        { product: 'sal', percentage: '1' },
      ] },
    ],
  },
  {
    key: 'blanqueador',
    name: 'DEMO Blanqueador hipoclorito 5%',
    description: 'Dilucion de hipoclorito para desinfeccion. Formula ficticia de demostracion.',
    steps: ['Cargar el agua.', 'Agregar el hipoclorito despacio, sin salpicar, y homogeneizar.'],
    packingSteps: ['Envasar en recipiente opaco y rotular con advertencias.'],
    lines: [
      { product: 'agua', percentage: '61.5' },
      { product: 'hipoclorito', percentage: '38.5' },
    ],
    tools: [],
    versions: [],
  },
  {
    key: 'desengrasante',
    name: 'DEMO Desengrasante alcalino',
    description: 'Desengrasante para cocinas industriales. Formula ficticia de demostracion.',
    steps: ['Disolver el hidroxido de sodio en el agua con agitacion.', 'Agregar el tensoactivo y homogeneizar.'],
    packingSteps: ['Envasar y rotular como corrosivo.'],
    lines: [
      { product: 'agua', percentage: '80' },
      { product: 'soda', percentage: '5' },
      { product: 'les', percentage: '15' },
    ],
    tools: [{ product: 'agitador', quantity: 1 }, { product: 'balanza', quantity: 1 }],
    versions: [],
  },
  {
    key: 'citrico',
    name: 'DEMO Limpiador citrico',
    description: 'Desincrustante suave a base de acido citrico. Formula ficticia de demostracion.',
    steps: ['Disolver el acido citrico en el agua.'],
    packingSteps: ['Envasar y rotular.'],
    lines: [
      { product: 'agua', percentage: '90' },
      { product: 'citrico', percentage: '10' },
    ],
    tools: [],
    versions: [],
  },
]

const everyone = { users: [] as string[], groups: ['operarios', 'empaque'] }

const orders: readonly DemoOrder[] = [
  { key: 'pendiente-baja', recipe: 'blanqueador', quantity: '40', unit: 'litro', priority: 'BAJA', target: 'PENDIENTE', packaging: [{ product: 'envaseGarrafa', packages: 8 }], customer: 'ferreteria', responsibles: { users: ['operador1'], groups: [] }, operator: 'operador1', packer: 'empacador1', conditioner: 'acondicionador' },
  { key: 'pendiente-media', recipe: 'multiusos', quantity: '20', unit: 'litro', priority: 'MEDIA', target: 'PENDIENTE', packaging: [{ product: 'envaseBidon', packages: 1 }], customer: null, responsibles: everyone, operator: 'operador2', packer: 'empacador2', conditioner: 'acondicionador' },
  { key: 'en-curso', recipe: 'desengrasante', quantity: '30', unit: 'litro', priority: 'ALTA', target: 'EN_CURSO', packaging: [{ product: 'envaseGarrafa', packages: 6 }], customer: 'hotel', responsibles: everyone, operator: 'operador1', packer: 'empacador1', conditioner: 'acondicionador' },
  { key: 'por-empacar', recipe: 'multiusos', version: 'concentrado', quantity: '25', unit: 'litro', priority: 'CRITICA', target: 'POR_EMPACAR', packaging: [{ product: 'envaseGarrafa', packages: 5 }], customer: 'colegio', responsibles: everyone, operator: 'operador2', packer: 'empacador1', conditioner: 'acondicionador' },
  { key: 'en-empaque', recipe: 'blanqueador', quantity: '60', unit: 'litro', priority: 'MEDIA', target: 'EN_EMPAQUE', packaging: [{ product: 'envaseBidon', packages: 3 }], customer: 'clinica', responsibles: everyone, operator: 'operador1', packer: 'empacador2', conditioner: 'acondicionador' },
  { key: 'por-acondicionar', recipe: 'multiusos', quantity: '40', unit: 'litro', priority: 'ALTA', target: 'POR_ACONDICIONAR', packaging: [{ product: 'envaseGarrafa', packages: 8 }], customer: 'ferreteria', responsibles: everyone, operator: 'operador2', packer: 'empacador1', conditioner: 'acondicionador' },
  { key: 'en-acondicionamiento', recipe: 'desengrasante', quantity: '20', unit: 'litro', priority: 'BAJA', target: 'EN_ACONDICIONAMIENTO', packaging: [{ product: 'envaseBidon', packages: 1 }], customer: 'hotel', responsibles: everyone, operator: 'operador1', packer: 'empacador2', conditioner: 'acondicionador' },
  { key: 'terminado', recipe: 'multiusos', version: 'sinColorante', quantity: '10', unit: 'litro', priority: 'CRITICA', target: 'TERMINADO', packaging: [{ product: 'envaseFrasco', packages: 20 }], customer: 'clinica', responsibles: everyone, operator: 'operador2', packer: 'empacador1', conditioner: 'acondicionador' },
  { key: 'cancelado', recipe: 'blanqueador', quantity: '15', unit: 'litro', priority: 'MEDIA', target: 'CANCELADO', packaging: [{ product: 'envaseGarrafa', packages: 3 }], customer: 'colegio', responsibles: { users: ['operador2'], groups: [] }, operator: 'operador2', packer: 'empacador1', conditioner: 'acondicionador', cancellationReason: 'DEMO: el cliente aplazo la compra.' },
  { key: 'bloqueado', recipe: 'citrico', quantity: '100', unit: 'litro', priority: 'ALTA', target: 'BLOQUEADO', packaging: [{ product: 'envaseBidon', packages: 5 }], customer: 'ferreteria', responsibles: everyone, operator: 'operador1', packer: 'empacador1', conditioner: 'acondicionador' },
]

export const DEMO_DATASET: DemoDataset = {
  users,
  workGroups,
  units,
  presentations,
  products,
  adjustments,
  suppliers,
  customers,
  recipes,
  orders,
}
