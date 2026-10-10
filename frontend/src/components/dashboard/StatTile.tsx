interface Props {
  value: number | string;
  label: string;
  tone?: "attention";
}

export default function StatTile({ value, label, tone }: Props) {
  return (
    <div className={tone ? `stat-tile stat-${tone}` : "stat-tile"}>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}
