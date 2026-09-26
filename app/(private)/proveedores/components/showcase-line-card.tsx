import { EntityImage } from '@/components/shared/entity-image';
import type { ShowcaseLine } from '@/lib/modules/proveedores';

type ShowcaseLineCardProps = {
  readonly line: ShowcaseLine;
};

/** Elemento del carrusel de una fila: imagen y nombre de la línea, nada más. */
export function ShowcaseLineCard({ line }: ShowcaseLineCardProps) {
  return (
    <li
      className="flex w-20 shrink-0 snap-start flex-col items-center gap-1 text-center"
      data-testid={`showcase-line-card-${line.id}`}
    >
      <EntityImage path={line.imageUrl} name={line.name} />
      <span className="line-clamp-2 text-xs">{line.name}</span>
    </li>
  );
}
