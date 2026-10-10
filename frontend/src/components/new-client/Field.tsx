import type { ClientFormKey, FieldConfig } from "../../lib/clientFields";

interface Props {
  config: FieldConfig;
  value: string;
  onChange: (key: ClientFormKey, value: string) => void;
}

/** One labelled form control, chosen by the field's kind. */
export default function Field({ config, value, onChange }: Props) {
  const { key, label, kind, required, options, wide } = config;
  const set = (e: { target: { value: string } }) => onChange(key, e.target.value);

  let control;
  if (kind === "select") {
    control = (
      <select value={value} onChange={set}>
        <option value="">Not provided</option>
        {options?.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    );
  } else if (kind === "textarea") {
    control = <textarea value={value} onChange={set} rows={4} />;
  } else {
    control = (
      <input
        type={kind}
        value={value}
        onChange={set}
        required={required}
        step={kind === "number" ? "0.01" : undefined}
        min={kind === "number" ? 0 : undefined}
      />
    );
  }

  return (
    <label className={wide ? "field wide" : "field"}>
      {label}
      {required && <span aria-hidden="true"> *</span>}
      {control}
    </label>
  );
}
