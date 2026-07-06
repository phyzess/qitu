import { DataState, TableCell, TableRow } from "@qitu/ui";
import { useI18n } from "./i18n";

export function ReviewRecordsEmptyState() {
  const { t } = useI18n();

  return (
    <TableRow>
      <TableCell colSpan={5}>
        <DataState
          description={t("review.emptyStagedDescription")}
          state="empty"
          title={t("review.emptyStagedTitle")}
        />
      </TableCell>
    </TableRow>
  );
}
