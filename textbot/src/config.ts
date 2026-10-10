export type Mode = "cloud" | "terminal";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is required`);
  return v;
}

export function loadConfig() {
  const mode = (process.env.TEXTBOT_MODE ?? "terminal") as Mode;
  if (mode !== "cloud" && mode !== "terminal") {
    throw new Error(`TEXTBOT_MODE must be "cloud" or "terminal", got "${mode}"`);
  }
  return {
    mode,
    projectId: mode === "cloud" ? required("SPECTRUM_PROJECT_ID") : "",
    projectSecret: mode === "cloud" ? required("SPECTRUM_PROJECT_SECRET") : "",
    backendUrl: (process.env.BACKEND_URL ?? "http://localhost:3000").replace(/\/$/, ""),
    serviceSecret: required("BOT_SERVICE_SECRET"),
    port: Number(process.env.TEXTBOT_PORT ?? 8787),
    // After sign-in, messages this close together are merged into one turn.
    mergeWindowMs: Number(process.env.MERGE_WINDOW_MS ?? 2500),
    // Photos waiting for sign-in, a 1/2 choice, or SAVE are dropped after this long.
    photoHoldMs: Number(process.env.PHOTO_HOLD_MS ?? 10 * 60_000),
    testSenderPhone: process.env.TEST_SENDER_PHONE ?? "+14045550100",
  };
}

export type Config = ReturnType<typeof loadConfig>;
