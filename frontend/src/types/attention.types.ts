/** GET /clients/attention. Mirrors ClientAttention in backend/app/schemas.py. */
export interface ClientAttention {
  client_id: string;
  client_name: string;
  /** Profile rows nobody has checked against the source documents yet. */
  unverified_records: number;
  /** Plain-language problems: lost or expiring IDs, medication refills. */
  problems: string[];
}
