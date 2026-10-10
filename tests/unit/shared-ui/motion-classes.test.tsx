import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AppSidebar } from '@/components/private/app-sidebar';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Autocomplete,
  AutocompleteContent,
  AutocompleteInput,
  AutocompleteItem,
  AutocompleteList,
} from '@/components/ui/autocomplete';
import { Button, buttonVariants } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarProvider,
  SidebarRail,
} from '@/components/ui/sidebar';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { NavGroup } from '@/lib/shared/navigation/private-nav';
import type { SessionUser } from '@/lib/modules/identity';

import { resetViewport, setViewportWidth, WIDE_VIEWPORT } from '../../helpers/viewport';

const { usePathnameMock } = vi.hoisted(() => ({ usePathnameMock: vi.fn<() => string>() }));

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  usePathname: usePathnameMock,
}));

vi.mock('@/lib/modules/identity/adapters/driving/logout-action', () => ({
  logoutAction: vi.fn(),
}));

/** Duraciones y curvas que la guía de movimiento retira de los primitivos. */
const PROHIBIDAS = /(^|:)(duration-(100|150|200)|ease-linear|ease-in-out)$/;

function clases(elemento: Element | null): string[] {
  expect(elemento, 'el elemento no está en el documento').not.toBeNull();
  return (elemento!.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);
}

function slot(nombre: string): Element | null {
  return document.querySelector(`[data-slot="${nombre}"]`);
}

/** Afirma que el elemento lleva todas las clases esperadas y ninguna duración o curva retirada. */
function esperarMovimiento(elemento: Element | null, esperadas: readonly string[]) {
  const lista = clases(elemento);
  for (const clase of esperadas) expect(lista).toContain(clase);
  expect(lista.filter((c) => PROHIBIDAS.test(c))).toEqual([]);
}

const ENTRADA_DE_MENU = [
  'duration-(--dur-base)',
  'ease-(--ease-enter)',
  'data-closed:duration-(--dur-fast)',
  'data-closed:ease-(--ease-exit)',
  'data-open:animate-in',
  'data-closed:animate-out',
];

afterEach(() => {
  cleanup();
  resetViewport();
});

describe('clases de movimiento de los primitivos', () => {
  it('R4: el diálogo entra con fundido y escala de 96 % en --dur-slow con --ease-enter, y el velo en --dur-base', () => {
    render(
      <>
        <Dialog open>
          <DialogContent>
            <DialogTitle>titulo</DialogTitle>
            <DialogDescription>descripcion</DialogDescription>
          </DialogContent>
        </Dialog>
        <AlertDialog open>
          <AlertDialogContent>
            <AlertDialogTitle>titulo</AlertDialogTitle>
            <AlertDialogDescription>descripcion</AlertDialogDescription>
          </AlertDialogContent>
        </AlertDialog>
      </>,
    );

    for (const prefijo of ['dialog', 'alert-dialog']) {
      esperarMovimiento(slot(`${prefijo}-content`), [
        'duration-(--dur-slow)',
        'ease-(--ease-enter)',
        'data-open:animate-in',
        'data-open:fade-in-0',
        'data-open:zoom-in-96',
      ]);
      esperarMovimiento(slot(`${prefijo}-overlay`), [
        'duration-(--dur-base)',
        'ease-(--ease-standard)',
        'data-open:fade-in-0',
      ]);
    }
  });

  it('R5: el diálogo sale con fundido (y el contenido con escala a 96 %) en --dur-fast con --ease-exit', () => {
    render(
      <>
        <Dialog open>
          <DialogContent>
            <DialogTitle>titulo</DialogTitle>
            <DialogDescription>descripcion</DialogDescription>
          </DialogContent>
        </Dialog>
        <AlertDialog open>
          <AlertDialogContent>
            <AlertDialogTitle>titulo</AlertDialogTitle>
            <AlertDialogDescription>descripcion</AlertDialogDescription>
          </AlertDialogContent>
        </AlertDialog>
      </>,
    );

    const salida = ['data-closed:duration-(--dur-fast)', 'data-closed:ease-(--ease-exit)', 'data-closed:fade-out-0'];
    for (const prefijo of ['dialog', 'alert-dialog']) {
      esperarMovimiento(slot(`${prefijo}-content`), [...salida, 'data-closed:zoom-out-96']);
      esperarMovimiento(slot(`${prefijo}-overlay`), salida);
      expect(clases(slot(`${prefijo}-content`))).not.toContain('data-closed:zoom-out-95');
    }
  });

  it('R6: el panel lateral entra en --dur-slow con --ease-enter y sale en --dur-fast con --ease-exit; el velo sigue al diálogo', () => {
    render(
      <Sheet open>
        <SheetContent side="right">
          <SheetTitle>titulo</SheetTitle>
          <SheetDescription>descripcion</SheetDescription>
        </SheetContent>
      </Sheet>,
    );

    esperarMovimiento(slot('sheet-content'), [
      'duration-(--dur-slow)',
      'ease-(--ease-enter)',
      'data-ending-style:duration-(--dur-fast)',
      'data-ending-style:ease-(--ease-exit)',
      'data-[side=right]:data-starting-style:translate-x-[2.5rem]',
    ]);
    esperarMovimiento(slot('sheet-overlay'), [
      'duration-(--dur-base)',
      'data-ending-style:duration-(--dur-fast)',
      'data-ending-style:ease-(--ease-exit)',
    ]);
  });

  it('R7: menús, desplegables, popover y autocompletar entran en --dur-base con --ease-enter y salen en --dur-fast con --ease-exit', () => {
    render(
      <>
        <DropdownMenu open>
          <DropdownMenuTrigger>menu</DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem>uno</DropdownMenuItem>
            <DropdownMenuSub open>
              <DropdownMenuSubTrigger>mas</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuItem>dos</DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </DropdownMenuContent>
        </DropdownMenu>
        <Select open defaultValue="a">
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="a">A</SelectItem>
          </SelectContent>
        </Select>
        <Popover open>
          <PopoverTrigger>popover</PopoverTrigger>
          <PopoverContent>contenido</PopoverContent>
        </Popover>
        <Autocomplete open items={['uno']}>
          <AutocompleteInput aria-label="buscar" />
          <AutocompleteContent>
            <AutocompleteList>
              {(item: string) => (
                <AutocompleteItem key={item} value={item}>
                  {item}
                </AutocompleteItem>
              )}
            </AutocompleteList>
          </AutocompleteContent>
        </Autocomplete>
      </>,
    );

    for (const nombre of [
      'dropdown-menu-content',
      'dropdown-menu-sub-content',
      'select-content',
      'popover-content',
      'autocomplete-content',
    ]) {
      esperarMovimiento(slot(nombre), ENTRADA_DE_MENU);
    }
  });

  it('R8: el tooltip se muestra en --dur-fast con --ease-enter y se oculta con --ease-exit', () => {
    render(
      <TooltipProvider>
        <Tooltip open>
          <TooltipTrigger>ayuda</TooltipTrigger>
          <TooltipContent>texto</TooltipContent>
        </Tooltip>
      </TooltipProvider>,
    );

    const lista = clases(slot('tooltip-content'));
    esperarMovimiento(slot('tooltip-content'), [
      'duration-(--dur-fast)',
      'ease-(--ease-enter)',
      'data-closed:ease-(--ease-exit)',
      'data-closed:animate-out',
    ]);
    expect(lista.filter((c) => /duration-/.test(c))).toEqual(['duration-(--dur-fast)']);
  });

  it('R9: el indicador de la pestaña activa transiciona en --dur-base con --ease-standard', () => {
    render(
      <Tabs defaultValue="a">
        <TabsList variant="line">
          <TabsTrigger value="a">A</TabsTrigger>
          <TabsTrigger value="b">B</TabsTrigger>
        </TabsList>
      </Tabs>,
    );

    for (const pestana of screen.getAllByRole('tab')) {
      esperarMovimiento(pestana, [
        'after:transition-opacity',
        'after:duration-(--dur-base)',
        'after:ease-(--ease-standard)',
      ]);
    }
  });

  it('R11: el ancho de la barra lateral de escritorio, su rail y la etiqueta de grupo cambian en --dur-base con --ease-standard', () => {
    setViewportWidth(WIDE_VIEWPORT);
    render(
      <SidebarProvider>
        <Sidebar collapsible="icon">
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>grupo</SidebarGroupLabel>
            </SidebarGroup>
          </SidebarContent>
          <SidebarRail />
        </Sidebar>
      </SidebarProvider>,
    );

    const curva = ['duration-(--dur-base)', 'ease-(--ease-standard)'];
    esperarMovimiento(slot('sidebar-gap'), ['transition-[width]', ...curva]);
    esperarMovimiento(slot('sidebar-container'), ['transition-[left,right,width]', ...curva]);
    esperarMovimiento(slot('sidebar-rail'), ['transition-all', ...curva]);
    esperarMovimiento(slot('sidebar-group-label'), ['transition-[margin,opacity]', ...curva]);
  });

  it('R12: el chevron de un grupo del menú lateral gira en --dur-base con --ease-standard', () => {
    setViewportWidth(WIDE_VIEWPORT);
    usePathnameMock.mockReturnValue('/ruta-que-no-esta-en-la-navegacion');
    const grupo: NavGroup = {
      kind: 'group',
      label: 'Grupo A',
      testId: 'grupo-a',
      section: 'Fixture',
      items: [
        {
          kind: 'link',
          href: '/fixture/grupo-a/hijo',
          label: 'Hijo A',
          testId: 'grupo-a-hijo',
          permission: 'inventario.consultar',
        },
      ],
    };
    const usuario: SessionUser = {
      id: 'u-1',
      username: 'ana.perez',
      displayName: 'Ana Perez',
      roleName: 'Jefa de planta',
      permissions: [],
    };
    render(
      <SidebarProvider>
        <AppSidebar user={usuario} navItems={[grupo]} />
      </SidebarProvider>,
    );

    const chevron = screen.getByTestId('grupo-a').querySelector('svg.ml-auto');
    esperarMovimiento(chevron, [
      'transition-transform',
      'duration-(--dur-base)',
      'ease-(--ease-standard)',
      'group-data-open/menu-button:rotate-90',
    ]);
  });
});

describe('clases de movimiento de los botones', () => {
  const PULSACION = 'active:not-aria-[haspopup]:scale-[0.98]';
  const DESPLAZAMIENTO = 'active:not-aria-[haspopup]:translate-y-px';

  it('R16: el botón primario usa el brillo de degradado en lugar del cambio de fondo', () => {
    render(<Button data-testid="primario">Guardar</Button>);

    const lista = clases(screen.getByTestId('primario'));
    expect(lista).toContain('btn-shine');
    expect(lista).toContain('bg-primary');
    expect(lista).not.toContain('hover:bg-primary/80');
    expect(buttonVariants().split(' ')).toContain('btn-shine');
  });

  it('R17: el botón secundario (outline) usa el velo y ya no cambia su fondo ni su texto al hover', () => {
    render(
      <Button variant="outline" data-testid="secundario">
        Cancelar
      </Button>,
    );

    const lista = clases(screen.getByTestId('secundario'));
    expect(lista).toContain('btn-veil');
    expect(lista.filter((c) => /^(dark:)?hover:(bg|text)-/.test(c))).toEqual([]);
    expect(buttonVariants({ variant: 'outline' }).split(' ')).toContain('btn-veil');
  });

  it('R17: outline-dashed, secondary y ghost usan el velo en lugar de su hover anterior', () => {
    for (const variant of ['outline-dashed', 'secondary', 'ghost'] as const) {
      const lista = buttonVariants({ variant }).split(' ');
      expect(lista, variant).toContain('btn-veil');
      expect(lista.filter((c) => /^(dark:)?hover:(bg|text)-/.test(c)), variant).toEqual([]);
    }
  });

  it('R17: destructive y link no llevan velo; destructive conserva su hover rojo', () => {
    for (const variant of ['destructive', 'link'] as const) {
      expect(buttonVariants({ variant }).split(' '), variant).not.toContain('btn-veil');
    }
    // ENMIENDA QC-227: destructive pasa a solido y su hover rojo a la mezcla con --foreground.
    expect(buttonVariants({ variant: 'destructive' }).split(' ')).toContain(
      'hover:bg-[color-mix(in_oklch,var(--destructive),var(--foreground)_10%)]',
    );
  });

  it('R18: todas las variantes salvo link escalan al 98 % al pulsar, salvo si abren un menú; link conserva su pulsación', () => {
    for (const variant of ['default', 'outline', 'outline-dashed', 'secondary', 'ghost', 'destructive'] as const) {
      const lista = buttonVariants({ variant }).split(' ');
      expect(lista, variant).toContain(PULSACION);
      expect(lista, variant).not.toContain(DESPLAZAMIENTO);
    }
    const link = buttonVariants({ variant: 'link' }).split(' ');
    expect(link).toContain(DESPLAZAMIENTO);
    expect(link).not.toContain(PULSACION);
  });
});
