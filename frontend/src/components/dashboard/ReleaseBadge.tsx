import { daysUntil, formatDate } from "../../lib/format";

export default function ReleaseBadge({ date }: { date: string | null }) {
  if (!date) return <span className="release release-none">No release date</span>;
  const days = daysUntil(date);
  if (days < 0) return <span className="release">Released {formatDate(date)}</span>;
  if (days === 0) return <span className="release release-soon">Out today</span>;
  if (days <= 30) return <span className="release release-soon">Out in {days} day{days === 1 ? "" : "s"}</span>;
  return <span className="release">{formatDate(date)}</span>;
}
