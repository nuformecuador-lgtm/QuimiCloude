/**
 * Pantalla 404 de la zona privada (QC-75 T5; R7, R8, R9, R14; `design.md > 2.3`).
 *
 * **Quien la dispara y por que sale envuelta en el armazon privado.** Cada `page.tsx` bajo
 * `app/(private)/` abre con `requirePagePermission('<modulo>.consultar')`, que llama a
 * `notFound()` cuando la sesion no lleva ese codigo. Next captura ese `notFound()` con el
 * limite `not-found` **mas cercano por encima de la pagina** —este archivo— y lo renderiza
 * **dentro de los layouts de su segmento y superiores**. Como vive en el route group
 * `(private)`, el 404 sale envuelto en `app/(private)/layout.tsx`: barra lateral con el menu ya
 * filtrado, cabecera y control de cerrar sesion (R8, R14). Quien no tenga ningun permiso ve
 * esta pantalla en toda ruta privada y **sigue teniendo por donde salir** (R9, decision cerrada
 * nº 3), en vez de quedarse encerrado con la unica salida de borrar la cookie a mano.
 *
 * **NUNCA se llama a `notFound()` desde `app/(private)/layout.tsx`.** Un `notFound()` lanzado en
 * un layout hace fallar ese layout, asi que el limite que responde es el de **arriba** y el 404
 * saldria pelado: sin menu y sin boton de salir, justo lo que la decision cerrada nº 3 existe
 * para evitar. Por eso el corte por permiso va en la pagina y no en el layout, aunque el layout
 * ya lea la sesion.
 *
 * **Que NO dice este copy, y por que** (R7): ni «permiso», ni «rol», ni «autorizacion», ni el
 * nombre del modulo pedido. Quien lo lea no puede distinguir «esta pantalla no existe» de «esta
 * pantalla existe pero tu no puedes verla»; decirlo confirmaria la existencia de la pantalla, que
 * es justo lo que la ficha viene a esconder. Por lo mismo **no** se pinta un enlace a «la primera
 * pantalla disponible»: haria falta resolver permisos otra vez —consulta que R19 no quiere— y el
 * destino delataria cuales tiene esa persona. La navegacion ya filtrada de la barra lateral es la
 * unica pista, y esa ya la vio al entrar.
 *
 * **Limite conocido y aceptado** (`design.md > 2.3`): una URL que no casa con **ninguna** ruta
 * del App Router (`/inventario/loquesea`) no llega a ninguna pagina, asi que la resuelve el
 * limite raiz de Next, fuera del layout privado, y se ve distinta. Dentro del conjunto de rutas
 * privadas **declaradas**, «sin permiso» y «no existe» si son indistinguibles, que es lo que R7
 * exige y lo que se puede sondear. Se descarto cerrar ese hueco con un catch-all
 * `app/(private)/[...slug]/page.tsx`: `(private)` es un route group y **no aparece en la URL**,
 * asi que ese catch-all capturaria toda URL no reconocida de la aplicacion —las publicas
 * tambien— y las meteria en el layout privado, redirigiendo al login a cualquier visitante
 * anonimo que se equivoque de direccion (alternativa descartada nº 2).
 *
 * Server Component **sin props**: Next no le pasa ninguna (`not-found.js` no acepta props). El
 * contenedor exterior es un `<div>` y **no** un `<main>`: `SidebarInset` del layout privado ya es
 * el `<main>` y R5 de QC-11 exige que sea unico.
 */
export default function PrivateNotFound() {
  return (
    <div
      data-testid="private-not-found"
      className="flex flex-1 flex-col items-center justify-center gap-2 p-4 text-center md:p-6"
    >
      <h1 className="text-2xl font-semibold">No encontramos esta página</h1>
      <p className="text-muted-foreground max-w-prose text-sm">
        Revisa la dirección e inténtalo de nuevo, o continúa desde el menú lateral.
      </p>
    </div>
  );
}
