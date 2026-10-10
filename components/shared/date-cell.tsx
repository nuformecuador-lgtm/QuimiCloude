import { formatCivilDate } from '@/lib/shared/ui/date-civil';
import { EMPTY_MARK } from '@/lib/shared/ui/empty-mark';

export type DateCellProps = {
  readonly value: Date | null;
};

export function DateCell({ value }: DateCellProps) {
  return <>{value === null ? EMPTY_MARK : formatCivilDate(value)}</>;
}
