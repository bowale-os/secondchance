import { useEffect, useState } from "react";
import type { AppliedFilter, Gender, ResourceCategory, ResourceQuery } from "../../types";
import { CATEGORIES, CATEGORY_LABELS } from "./labels";

/** Yes/no filters shown as chips after the category chips. */
type ToggleKey = "near_transit" | "open_now" | "no_id_required" | "records_accepted" | "families";
const TOGGLES: { key: ToggleKey; label: string }[] = [
  { key: "near_transit", label: "Near transit" },
  { key: "open_now", label: "Open now" },
  { key: "no_id_required", label: "No ID required" },
  { key: "records_accepted", label: "Records accepted" },
  { key: "families", label: "Families welcome" },
];

const SEARCH_DELAY_MS = 300;
const THIS_WEEK_DAYS = 7;

interface Props {
  query: ResourceQuery;
  onChange: (query: ResourceQuery) => void;
  /** Filters set from a client's profile get a "from profile" note (client tab only). */
  applied?: AppliedFilter[];
}

function Chip({ pressed, label, note, onClick }: { pressed: boolean; label: string; note?: string; onClick: () => void }) {
  return (
    <button type="button" className="res-chip" aria-pressed={pressed} onClick={onClick}>
      {label}
      {note && <span className="res-chip-note"> · {note}</span>}
    </button>
  );
}

/** Search box and filter chips. Every chip is a toggle button (aria-pressed). */
export default function ResourceFilters({ query, onChange, applied = [] }: Props) {
  const [text, setText] = useState(query.q ?? "");

  // Wait for a pause in typing before searching.
  useEffect(() => {
    if (text === (query.q ?? "")) return;
    const t = setTimeout(() => onChange({ ...query, q: text || undefined }), SEARCH_DELAY_MS);
    return () => clearTimeout(t);
  }, [text, query, onChange]);

  const fromProfile = (key: keyof ResourceQuery) =>
    applied.some((a) => a.key === key && a.reason === "profile") ? "from profile" : undefined;

  const categories = query.categories ?? [];
  const hasDated = (cs: ResourceCategory[]) => cs.includes("classes") || cs.includes("events");
  const toggleCategory = (c: ResourceCategory) => {
    const next = categories.includes(c) ? categories.filter((x) => x !== c) : [...categories, c];
    // "This week" only means something for classes and events.
    onChange({ ...query, categories: next, starts_within_days: hasDated(next) ? query.starts_within_days : undefined });
  };

  return (
    <div className="res-filters">
      <input
        type="search"
        className="dash-search res-search"
        placeholder="Search by name or service"
        aria-label="Search resources"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />

      <div className="res-chip-group" role="group" aria-label="Categories">
        {CATEGORIES.map((c) => (
          <Chip
            key={c}
            pressed={categories.includes(c)}
            label={CATEGORY_LABELS[c]}
            note={categories.includes(c) ? fromProfile("categories") : undefined}
            onClick={() => toggleCategory(c)}
          />
        ))}
      </div>

      <div className="res-chip-group" role="group" aria-label="Filters">
        {hasDated(categories) && (
          <Chip
            pressed={query.starts_within_days === THIS_WEEK_DAYS}
            label="This week"
            onClick={() =>
              onChange({ ...query, starts_within_days: query.starts_within_days === THIS_WEEK_DAYS ? undefined : THIS_WEEK_DAYS })
            }
          />
        )}
        {TOGGLES.map(({ key, label }) => (
          <Chip
            key={key}
            pressed={!!query[key]}
            label={label}
            note={query[key] ? fromProfile(key) : undefined}
            onClick={() => onChange({ ...query, [key]: !query[key] })}
          />
        ))}
        <Chip
          pressed={query.language === "es"}
          label="Spanish-speaking"
          note={query.language === "es" ? fromProfile("language") : undefined}
          onClick={() => onChange({ ...query, language: query.language === "es" ? undefined : "es" })}
        />
        <label className="res-select">
          <span>Serves</span>
          <select
            value={query.gender ?? "any"}
            onChange={(e) => {
              const gender = e.target.value as Gender;
              onChange({ ...query, gender: gender === "any" ? undefined : gender });
            }}
          >
            <option value="any">Anyone</option>
            <option value="men">Men</option>
            <option value="women">Women</option>
          </select>
        </label>
      </div>
    </div>
  );
}
