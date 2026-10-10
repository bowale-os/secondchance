import { useAuth0 } from "@auth0/auth0-react";
import { useEffect, useState } from "react";
import { ApiError, useApi } from "./api";
import LandingPage from "./components/auth/LandingPage";
import SignupPage from "./components/auth/SignupPage";
import StatusPage from "./components/auth/StatusPage";
import ClientHome from "./components/client-portal/ClientHome";
import ClientLoginPage from "./components/client-portal/ClientLoginPage";
import CalendarPage from "./components/calendar/CalendarPage";
import ClientPage from "./components/client/ClientPage";
import Dashboard from "./components/dashboard/Dashboard";
import LearnPage from "./components/learn/LearnPage";
import type { AppNav, Section } from "./components/layout/nav";
import NewClientFlow from "./components/new-client/NewClientFlow";
import ResourcesPage from "./components/resources/ResourcesPage";
import { useClientSession } from "./hooks/useClientSession";
import { toStaffSignup, type StaffRead } from "./schemas";

/** Which staff screen is showing. */
type View =
  | { name: "clients" }
  | { name: "client"; clientId: string }
  | { name: "new-client" }
  | { name: "resources" }
  | { name: "calendar" }
  | { name: "learn" };

const VIEW_FOR: Record<Section, View> = {
  home: { name: "clients" },
  resources: { name: "resources" },
  calendar: { name: "calendar" },
  learn: { name: "learn" },
};

export default function App() {
  const { isLoading, isAuthenticated, user, error, loginWithRedirect, logout } = useAuth0();

  // "checking" | "needs-signup" | "ready" | "error"
  const [stage, setStage] = useState<"checking" | "needs-signup" | "ready" | "error">("checking");
  const [staff, setStaff] = useState<StaffRead | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [view, setView] = useState<View>({ name: "clients" });
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

  if (stage === "ready" && staff) {
    const toClients = () => setView({ name: "clients" });
    // A client's page and the new-client flow both sit under Home.
    const nav: AppNav = {
      section: view.name === "resources" || view.name === "calendar" || view.name === "learn" ? view.name : "home",
      go: (section: Section) => setView(VIEW_FOR[section]),
      onNewClient: () => setView({ name: "new-client" }),
    };

    switch (view.name) {
      case "clients":
        return (
          <Dashboard
            key={listVersion}
            staff={staff}
            nav={nav}
            onSelectClient={(clientId) => setView({ name: "client", clientId })}
            onLogout={doLogout}
          />
        );
      case "client":
        return <ClientPage clientId={view.clientId} staff={staff} nav={nav} onBack={toClients} onLogout={doLogout} />;
      case "new-client":
        return (
          <NewClientFlow
            staff={staff}
            nav={nav}
            onLogout={doLogout}
            onCancel={toClients}
            onCreated={() => {
              toClients();
              setListVersion((v) => v + 1);
            }}
          />
        );
      case "resources":
        return <ResourcesPage staff={staff} nav={nav} onLogout={doLogout} />;
      case "calendar":
        return <CalendarPage staff={staff} nav={nav} onLogout={doLogout} />;
      case "learn":
        return <LearnPage staff={staff} nav={nav} onLogout={doLogout} />;
    }
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
