export const INTEGRATION_EMPTY_MESSAGE = 'Próximamente podrás configurar esta integración.';

type IntegrationPlaceholderProps = {
  readonly title: string;
};

export function IntegrationPlaceholder({ title }: IntegrationPlaceholderProps) {
  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
      <h1 data-testid="integration-title" className="text-2xl font-semibold">
        {title}
      </h1>
      <div
        data-testid="integration-empty"
        className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-8 text-center"
      >
        <p className="text-sm text-muted-foreground">{INTEGRATION_EMPTY_MESSAGE}</p>
      </div>
    </div>
  );
}
