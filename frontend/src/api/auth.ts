import type { StaffRead, StaffSignup } from "../types";
import type { Http } from "./http";

export function createAuthApi(http: Http) {
  return {
    /** POST /auth/signin. Rejects with ApiError(404) if the Auth0 user has no profile yet. */
    signin: (): Promise<StaffRead> => http.post<StaffRead>("/auth/signin"),

    /** POST /auth/signup. Rejects with ApiError(409) if the account already exists. */
    signup: (body: StaffSignup): Promise<StaffRead> => http.post<StaffRead, StaffSignup>("/auth/signup", body),

    /** GET /auth/me */
    me: (): Promise<StaffRead> => http.get<StaffRead>("/auth/me"),
  };
}

export type AuthApi = ReturnType<typeof createAuthApi>;
