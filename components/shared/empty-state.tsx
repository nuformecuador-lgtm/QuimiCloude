import Link from 'next/link';
import type { ReactNode } from 'react';

import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type EmptyStateLink = {
  readonly href: string;
  readonly label: ReactNode;
  readonly testId: string;
};

export type EmptyStateProps = {
  readonly testId: string;
  readonly message: ReactNode;
  readonly messageTestId?: string;
  /** Va antes de `firstPage`. */
  readonly clearSearch?: EmptyStateLink;
  readonly firstPage?: EmptyStateLink;
  readonly className?: string;
  /** Acciones, después de los enlaces. */
  readonly children?: ReactNode;
};

const DEFAULT_CLASS_NAME =
  'flex flex-col items-center gap-3 rounded-lg border border-dashed p-8 text-center';

function EmptyStateAction({ link }: { readonly link: EmptyStateLink }) {
  return (
    <Link
      href={link.href}
      data-slot="button"
      data-testid={link.testId}
      className={cn(buttonVariants({ variant: 'outline', touch: true }))}
    >
      {link.label}
    </Link>
  );
}

export function EmptyState({
  testId,
  message,
  messageTestId,
  clearSearch,
  firstPage,
  className = DEFAULT_CLASS_NAME,
  children,
}: EmptyStateProps) {
  return (
    <div data-testid={testId} className={className}>
      <p className="text-sm text-muted-foreground" data-testid={messageTestId}>
        {message}
      </p>
      {clearSearch === undefined ? null : <EmptyStateAction link={clearSearch} />}
      {firstPage === undefined ? null : <EmptyStateAction link={firstPage} />}
      {children}
    </div>
  );
}
