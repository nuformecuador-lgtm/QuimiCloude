"use client"

import * as React from "react"
import { Dialog as SheetPrimitive } from "@base-ui/react/dialog"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { XIcon } from "lucide-react"

/**
 * El panel se cierra por «Cancelar» o por la X -ambas razon `close-press`- y, por defecto, por
 * nada mas: un click fuera o un Escape sobre un panel con `isForm` tira un formulario a medio
 * llenar de un gesto que el usuario no queria.
 *
 * Son DOS ejes distintos y por eso son dos props. El click fuera lo frena el propio primitivo con
 * `disablePointerDismissal`; el Escape hay que cancelarlo aqui, y hacerlo se aparta a conciencia
 * de WAI-ARIA -que espera que Escape cierre un dialogo modal-: se acepta en un panel de formulario
 * porque siempre ofrece dos salidas visibles y enfocables.
 *
 * Un panel SIN formulario detras no gana nada con esto y pierde: el cajon de navegacion movil de
 * `components/ui/sidebar.tsx` monta un `Sheet` y debe cerrarse tocando el velo o con Escape. Ese
 * caso desactiva ambas guardas.
 */
function Sheet({
  disablePointerDismissal = true,
  disableEscapeDismissal = true,
  onOpenChange,
  ...props
}: SheetPrimitive.Root.Props & {
  /** Con `false`, un Escape cierra el panel (comportamiento nativo del dialogo). */
  disableEscapeDismissal?: boolean
}) {
  return (
    <SheetPrimitive.Root
      data-slot="sheet"
      disablePointerDismissal={disablePointerDismissal}
      onOpenChange={(open, eventDetails) => {
        if (!open && disableEscapeDismissal && eventDetails.reason === "escape-key") {
          eventDetails.cancel()
          return
        }
        onOpenChange?.(open, eventDetails)
      }}
      {...props}
    />
  )
}

function SheetTrigger({ ...props }: SheetPrimitive.Trigger.Props) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />
}

function SheetClose({ ...props }: SheetPrimitive.Close.Props) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />
}

function SheetPortal({ ...props }: SheetPrimitive.Portal.Props) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />
}

function SheetOverlay({ className, ...props }: SheetPrimitive.Backdrop.Props) {
  return (
    <SheetPrimitive.Backdrop
      data-slot="sheet-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-black/10 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 supports-backdrop-filter:backdrop-blur-xs",
        className
      )}
      {...props}
    />
  )
}

function SheetContent({
  className,
  children,
  footer,
  isForm = false,
  formProps,
  side = "right",
  showCloseButton = true,
  ...props
}: SheetPrimitive.Popup.Props & {
  side?: "top" | "right" | "bottom" | "left"
  showCloseButton?: boolean
  /** Acciones del panel. Se pintan abajo, en una fila alineada a la derecha. */
  footer?: React.ReactNode
  /**
   * Envuelve TODO el contenido del panel -cabecera, cuerpo y pie- en un unico `<form>`. Asi el
   * boton de guardar puede vivir en el pie y seguir enviando: `useFormStatus()` lo ve desde ahi
   * porque el formulario es su ancestro.
   */
  isForm?: boolean
  /** Props del `<form>` que monta `isForm` (`action`, `onSubmit`, `id`...). Se ignora sin `isForm`. */
  formProps?: React.ComponentProps<"form"> & { [attr: `data-${string}`]: string }
}) {
  const body = (
    <>
      {children}
      {footer === undefined ? null : <SheetFooter>{footer}</SheetFooter>}
    </>
  )
  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Popup
        data-slot="sheet-content"
        data-side={side}
        className={cn(
          "fixed z-50 flex flex-col gap-4 bg-popover bg-clip-padding text-sm text-popover-foreground shadow-lg transition duration-200 ease-in-out data-ending-style:opacity-0 data-starting-style:opacity-0 data-[side=bottom]:inset-x-0 data-[side=bottom]:bottom-0 data-[side=bottom]:h-auto data-[side=bottom]:border-t data-[side=bottom]:data-ending-style:translate-y-[2.5rem] data-[side=bottom]:data-starting-style:translate-y-[2.5rem] data-[side=left]:inset-y-0 data-[side=left]:left-0 data-[side=left]:h-full data-[side=left]:w-3/4 data-[side=left]:border-r data-[side=left]:data-ending-style:translate-x-[-2.5rem] data-[side=left]:data-starting-style:translate-x-[-2.5rem] data-[side=right]:inset-y-0 data-[side=right]:right-0 data-[side=right]:h-full data-[side=right]:w-3/4 data-[side=right]:border-l data-[side=right]:data-ending-style:translate-x-[2.5rem] data-[side=right]:data-starting-style:translate-x-[2.5rem] data-[side=top]:inset-x-0 data-[side=top]:top-0 data-[side=top]:h-auto data-[side=top]:border-b data-[side=top]:data-ending-style:translate-y-[-2.5rem] data-[side=top]:data-starting-style:translate-y-[-2.5rem] data-[side=left]:sm:max-w-sm data-[side=right]:sm:max-w-sm",
          className
        )}
        {...props}
      >
        {isForm ? (
          <form
            data-slot="sheet-form"
            {...formProps}
            className={cn("flex min-h-0 flex-1 flex-col", formProps?.className)}
          >
            {body}
          </form>
        ) : (
          body
        )}
        {showCloseButton && (
          <SheetPrimitive.Close
            data-slot="sheet-close"
            render={
              <Button
                variant="ghost"
                className="absolute top-3 right-3"
                size="icon-sm"
              />
            }
          >
            <XIcon
            />
            <span className="sr-only">Close</span>
          </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Popup>
    </SheetPortal>
  )
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-header"
      className={cn("flex shrink-0 flex-col gap-0.5 border-b p-4", className)}
      {...props}
    />
  )
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn(
        "mt-auto flex shrink-0 flex-row flex-wrap items-center justify-end gap-2 border-t p-4",
        className
      )}
      {...props}
    />
  )
}

function SheetTitle({ className, ...props }: SheetPrimitive.Title.Props) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn(
        "font-heading text-base font-medium text-foreground",
        className
      )}
      {...props}
    />
  )
}

function SheetDescription({
  className,
  ...props
}: SheetPrimitive.Description.Props) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
}
