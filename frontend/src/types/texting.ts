/** Text-bot enrollment, mirrors backend schemas.TextingStatus / TextingEnroll. */

export type TextingState = "active" | "stopped" | "locked" | "revoked";
export type TextingChannel = "imessage" | "rcs" | "sms" | "whatsapp" | "telegram" | "other";

export interface TextingStatus {
  enrolled: boolean;
  status: TextingState | null;
  phone_last4: string | null;
  channel: TextingChannel | null;
  consent_at: string | null;
  locked_at: string | null;
  /** Only set right after enrolling: whether the welcome text went out. */
  welcome_sent: boolean | null;
  /** Morning reminder, set by the client by texting NUDGE ON / NUDGE OFF / NUDGE 7:30. */
  nudge_enabled: boolean;
  nudge_time: string | null; // "08:00", Eastern
}

export interface TextingEnroll {
  phone: string;
  consent: boolean;
}
