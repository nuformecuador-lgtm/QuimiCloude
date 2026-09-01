// Barrel de los componentes de la zona privada
// (`docs/architecture.md > Componentes > Regla: componentes de ruta en components/ con barrel index.ts`).
//
// Sin `'use client'`: la frontera cliente/servidor se declara en cada archivo de componente,
// nunca aqui. Asi `layout.tsx` sigue siendo Server Component aunque importe desde el barrel.
export { SidebarToggle, SIDEBAR_TOGGLE_LABEL } from './sidebar-toggle';
