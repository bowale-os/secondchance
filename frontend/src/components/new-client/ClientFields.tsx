import { CLIENT_FIELD_SECTIONS, type ClientFormKey, type ClientFormState } from "../../lib/clientFields";
import Field from "./Field";

interface Props {
  form: ClientFormState;
  onChange: (key: ClientFormKey, value: string) => void;
}

export default function ClientFields({ form, onChange }: Props) {
  return (
    <>
      {CLIENT_FIELD_SECTIONS.map((section) => (
        <fieldset key={section.title} className="form-section">
          <legend>{section.title}</legend>
          <div className="field-grid">
            {section.fields.map((config) => (
              <Field key={config.key} config={config} value={form[config.key]} onChange={onChange} />
            ))}
          </div>
        </fieldset>
      ))}
    </>
  );
}
