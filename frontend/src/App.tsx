import { useAuth0 } from "@auth0/auth0-react";
import { useEffect, useState } from "react";
import { ApiError, useApi } from "./api";
import LoginPage from "./components/auth/LoginPage";
import ClientDetailPage from "./components/ClientDetailPage";
import ClientList from "./components/ClientList";
import NewClientFlow from "./components/new-client/NewClientFlow";
import { toStaffSignup, type StaffRead } from "./schemas";

export default function App() {
  const { isLoading, isAuthenticated, user, error, loginWithRedirect, logout } = useAuth0();

  // "checking" | "needs-signup" | "ready" | "error"
  const [stage, setStage] = useState<"checking" | "needs-signup" | "ready" | "error">("checking");
  const [staff, setStaff] = useState<StaffRead | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [creatingClient, setCreatingClient] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [listVersion, setListVersion] = useState(0); // bump to reload the client list
  const [form, setForm] = useState({ full_name: "", organization_name: "", phone: "" });

  const api = useApi();

  // After Auth0 login, ask the backend whether this user has a case worker profile.
  useEffect(() => {
    if (!isAuthenticated || !user) return;
    (async () => {
      try {
        setStaff(await api.auth.signin());
        setStage("ready");
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) {
          setForm((f) => ({ ...f, full_name: user.name && user.name !== user.email ? user.name : "" }));
          setStage("needs-signup");
        } else {
          setMessage(e instanceof Error ? e.message : String(e));
          setStage("error");
        }
      }
    })();
  }, [isAuthenticated, api, user]);

  async function submitSignup(e: React.FormEvent) {
    e.preventDefault();
    if (!user?.email) return;
    setMessage(null);
    try {
      setStaff(await api.auth.signup(toStaffSignup({ email: user.email, ...form })));
      setStage("ready");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    }
  }

  const setField = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: e.target.value });
  const doLogout = () => logout({ logoutParams: { returnTo: window.location.origin } });

  if (isLoading) return <main className="card">Loading…</main>;

  if (!isAuthenticated) {
    return (
      <LoginPage
        error={error?.message}
        onLogin={() => loginWithRedirect()}
        onSignup={() => loginWithRedirect({ authorizationParams: { screen_hint: "signup" } })}
      />
    );
  }

  return (
    <main className={creatingClient ? "card card-wide" : "card"}>
      <h1>Hacklanta 2026</h1>
      {error && <p className="error">{error.message}</p>}

      {stage === "checking" ? (
        <p>Checking your account…</p>
      ) : stage === "needs-signup" ? (
        <form onSubmit={submitSignup}>
          <p>Finish setting up your case worker profile.</p>
          <label>
            Email
            <input value={user?.email ?? ""} disabled />
          </label>
          <label>
            Full name
            <input value={form.full_name} onChange={setField("full_name")} required />
          </label>
          <label>
            Organization
            <input value={form.organization_name} onChange={setField("organization_name")} />
          </label>
          <label>
            Phone
            <input value={form.phone} onChange={setField("phone")} type="tel" />
          </label>
          {message && <p className="error">{message}</p>}
          <div className="row">
            <button type="submit">Create profile</button>
            <button type="button" className="secondary" onClick={doLogout}>
              Log out
            </button>
          </div>
        </form>
      ) : stage === "ready" && staff ? (
        creatingClient ? (
          <NewClientFlow
            onCancel={() => setCreatingClient(false)}
            onCreated={() => {
              setCreatingClient(false);
              setListVersion((v) => v + 1);
            }}
          />
        ) : selectedClientId ? (
          <ClientDetailPage clientId={selectedClientId} onBack={() => setSelectedClientId(null)} />
        ) : (
          <>
            <p>Welcome, {staff.full_name}!</p>
            {staff.organization_name && <p>{staff.organization_name}</p>}
            <div className="row">
              <button onClick={() => setCreatingClient(true)}>New client</button>
            </div>
            <ClientList key={listVersion} onSelect={setSelectedClientId} />
            <div className="row">
              <button className="secondary" onClick={doLogout}>
                Log out
              </button>
            </div>
          </>
        )
      ) : (
        <>
          <p className="error">{message}</p>
          <div className="row">
            <button className="secondary" onClick={doLogout}>
              Log out
            </button>
          </div>
        </>
      )}
    </main>
  );
}
