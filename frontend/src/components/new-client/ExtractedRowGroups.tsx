import { ROW_GROUPS, type ExtractedRows, type RowGroupKey } from "../../lib/extractedRows";
import RowGroup from "./RowGroup";

interface Props {
  rows: ExtractedRows;
  onRemove: (group: RowGroupKey, index: number) => void;
}

export default function ExtractedRowGroups({ rows, onRemove }: Props) {
  const isEmpty = ROW_GROUPS.every((group) => rows[group.key].length === 0);

  return (
    <fieldset className="nc-panel">
      <legend>Also found in the documents</legend>
      <div>
        <p className="hint nc-body">
          {isEmpty
            ? "No fees, contacts, medications, benefits or IDs were found."
            : "Remove anything that looks wrong. Everything left will be saved to the client's record."}
        </p>
        {ROW_GROUPS.map((group) => (
          <RowGroup
            key={group.key}
            title={group.title}
            labels={group.labels(rows)}
            onRemove={(index) => onRemove(group.key, index)}
          />
        ))}
      </div>
    </fieldset>
  );
}
