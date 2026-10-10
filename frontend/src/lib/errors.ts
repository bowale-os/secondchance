/** Text to show the user for anything thrown (ApiError messages are already user-readable). */
export const errorText = (e: unknown): string => (e instanceof Error ? e.message : String(e));
