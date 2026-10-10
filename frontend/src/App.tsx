import { useAuth0 } from "@auth0/auth0-react";
import { useEffect, useState } from "react";
import { ApiError, useApi } from "./api";
import LandingPage from "./components/auth/LandingPage";
import SignupPage from "./components/auth/SignupPage";
import StatusPage from "./components/auth/StatusPage";
import ClientHome from "./components/client-portal/ClientHome";
import ClientLoginPage from "./components/client-portal/ClientLoginPage";
import ClientPage from "./components/client/ClientPage";
import Dashboard from "./components/dashboard/Dashboard";
import NewClientFlow from "./components/new-client/NewClientFlow";
import { useClientSession } from "./hooks/useClientSession";
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

  const [showClientLogin, setShowClientLogin] = useState(false);
  const clientSession = useClientSession();

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
          setStage("needs-signup");
        } else {
          setMessage(e instanceof Error ? e.message : String(e));
          setStage("error");
        }
      }
    })();
  }, [isAuthenticated, api, user]);

  // Throws on failure so SignupPage can show the error next to the form.
  async function signup(values: { full_name: string; organization_name: string; phone: string }) {
    if (!user?.email) return;
    setStaff(await api.auth.signup(toStaffSignup({ email: user.email, ...values })));
    setStage("ready");
  }

  const doLogout = () => logout({ logoutParams: { returnTo: window.location.origin } });

  if (isLoading) return <StatusPage loading="Loading…" />;

  if (!isAuthenticated && clientSession.isLoggedIn) {
    return <ClientHome client={clientSession.client} api={clientSession.api} onLogout={clientSession.logout} />;
  }

  if (!isAuthenticated && (showClientLogin || clientSession.notice)) {
    return (
      <ClientLoginPage
        notice={clientSession.notice}
        onLogin={clientSession.login}
        onBack={() => {
          setShowClientLogin(false);
          clientSession.dismissNotice();
        }}
      />
    );
  }

  if (!isAuthenticated) {
    return (
      <LandingPage
        onClientLogin={() => setShowClientLogin(true)}
        error={error?.message}
        onLogin={() => loginWithRedirect()}
        onSignup={() => loginWithRedirect({ authorizationParams: { screen_hint: "signup" } })}
      />
    );
  }

  if (stage === "ready" && staff && !creatingClient && !selectedClientId) {
    return (
      <Dashboard
        key={listVersion}
        staff={staff}
        onNewClient={() => setCreatingClient(true)}
        onSelectClient={setSelectedClientId}
        onLogout={doLogout}
      />
    );
  }

  if (stage === "ready" && staff && selectedClientId && !creatingClient) {
    return (
      <ClientPage
        clientId={selectedClientId}
        staff={staff}
        onBack={() => setSelectedClientId(null)}
        onLogout={doLogout}
      />
    );
  }

  if (stage === "ready" && staff && creatingClient) {
    return (
      <NewClientFlow
        staff={staff}
        onLogout={doLogout}
        onCancel={() => setCreatingClient(false)}
        onCreated={() => {
          setCreatingClient(false);
          setListVersion((v) => v + 1);
        }}
      />
    );
  }

  if (stage === "needs-signup" && user) {
    return (
      <SignupPage
        email={user.email ?? ""}
        initialName={user.name && user.name !== user.email ? user.name : ""}
        onSubmit={signup}
        onLogout={doLogout}
      />
    );
  }

  if (stage === "checking") return <StatusPage loading="Checking your account…" />;

  return <StatusPage error={message ?? error?.message ?? "Something went wrong. Please try again."} onLogout={doLogout} />;
}
