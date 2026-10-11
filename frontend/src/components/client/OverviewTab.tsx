import { formatDate, formatMoney, humanize } from "../../lib/format";
import type { ClientDetail, ClientRead } from "../../types";
import SuggestedGuides from "../learn/SuggestedGuides";
import TextingCard from "./TextingCard";

interface Props {
  client: ClientRead | ClientDetail;
  /** The texting card is for case workers; the client portal hides it. */
  showTexting?: boolean;
}

export default function OverviewTab({ client, showTexting = true }: Props) {
  const facts: [string, string | null][] = [
    ["Phone", client.phone],
    ["Email", client.email],
    ["Date of birth", client.date_of_birth && formatDate(client.date_of_birth)],
    ["Release date", client.release_date && formatDate(client.release_date)],
    ["Address", [client.address_line, client.city, client.zip_code].filter(Boolean).join(", ") || null],
    ["Housing", client.housing_status && humanize(client.housing_status)],
    ["Employment", client.employment_status && humanize(client.employment_status)],
    ["Monthly income", client.monthly_income && formatMoney(client.monthly_income)],
    ["Preferred contact", client.preferred_contact_method && humanize(client.preferred_contact_method)],
    ["Emergency contact", [client.emergency_contact_name, client.emergency_contact_phone].filter(Boolean).join(" · ") || null],
  ];

  return (
    <div className="panel-body">
      <SuggestedGuides client={client} role="staff" />
      <dl className="facts">
        {facts.map(([label, value]) => (
          <div key={label} className="fact">
            <dt>{label}</dt>
            <dd className={value ? undefined : "fact-missing"}>{value ?? "Not provided"}</dd>
          </div>
        ))}
      </dl>
      {showTexting && <TextingCard client={client} />}
      <div className="notes">
        <h3>Notes</h3>
        <p className={client.notes ? undefined : "fact-missing"}>{client.notes ?? "No notes."}</p>
      </div>
    </div>
  );
}
