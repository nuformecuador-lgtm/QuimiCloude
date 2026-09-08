// Barrel de los componentes de la zona privada
// (`docs/architecture.md > Componentes > Regla: componentes de ruta en components/ con barrel index.ts`).
//
// Sin `'use client'`: la frontera cliente/servidor se declara en cada archivo de componente,
// nunca aqui. Asi `layout.tsx` sigue siendo Server Component aunque importe desde el barrel.
export { LogoutButton, LOGOUT_LABEL } from './logout-button';
export { SidebarToggle, SIDEBAR_TOGGLE_LABEL } from './sidebar-toggle';
// Las tres etiquetas de opcion (`THEME_OPTION_*`) desaparecieron el 2026-09-07: el control de
// tema paso de menu de tres opciones a interruptor claro/oscuro y ya no hay opciones que nombrar.
export { ThemeToggle, THEME_TOGGLE_LABEL } from './theme-toggle';
