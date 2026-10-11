import { useEffect, useMemo, useState } from "react";
import { useApi } from "../../api";
import { errorText } from "../../lib/errors";
import { buildTodo, type TodoItem } from "../../lib/todo";
import type { ClientAttention, ClientRead, StaffEventRead, StaffRead } from "../../types";
import AppShell, { staffUser } from "../layout/AppShell";
import type { AppNav } from "../layout/nav";
import ClientRows from "./ClientRows";
import TodoList from "./TodoList";
import "./dashboard.css";

interface Props {
  staff: StaffRead;
  nav: AppNav;
  onSelectClient: (id: string) => void;
  onLogout: () => void;
}

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

/** Home: what needs the case worker today, then the full client list. */
export default function Dashboard({ staff, nav, onSelectClient, onLogout }: Props) {
  const api = useApi();
  const [clients, setClients] = useState<ClientRead[] | null>(null);
  const [events, setEvents] = useState<StaffEventRead[] | null>(null);
  const [attention, setAttention] = useState<ClientAttention[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [todoError, setTodoError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    api.clients
      .listMine()
      .then(setClients)
      .catch((e) => setError(errorText(e)));
    api.events
      .list()
      .then(setEvents)
      .catch((e) => setTodoError(errorText(e)));
    api.clients
      .attention()
      .then(setAttention)
      .catch((e) => setTodoError(errorText(e)));
  }, [api]);

  const todo = useMemo(
    () => (clients && events && attention ? buildTodo(clients, events, attention) : null),
    [clients, events, attention]
  );

  // Tell the Home tab how many things are waiting.
  const { setHomeCount } = nav;
  const todoCount = todo?.length ?? 0;
  useEffect(() => setHomeCount(todoCount), [setHomeCount, todoCount]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || !clients) return clients;
    return clients.filter((c) =>
      [c.first_name, c.last_name, c.preferred_name, c.phone].some((v) => v?.toLowerCase().includes(q))
    );
  }, [clients, query]);

  async function markDone(item: TodoItem) {
    if (!item.eventIds) return;
    setTodoError(null);
    setBusyKey(item.key);
    try {
      const updated = await Promise.all(item.eventIds.map((id) => api.events.setStatus(id, "done")));
      setEvents((all) => all?.map((e) => updated.find((u) => u.id === e.id) ? { ...e, status: "done" } : e) ?? null);
    } catch (e) {
      setTodoError(errorText(e));
    } finally {
      setBusyKey(null);
    }
  }

  /** Acknowledges all of this client's new events at once, which is what the backend does. */
  async function acknowledge(item: TodoItem) {
    setTodoError(null);
    setBusyKey(item.key);
    try {
      await api.events.markSeen(item.clientId);
      const now = new Date().toISOString();
      setEvents((all) =>
        all?.map((e) => (e.client_id === item.clientId && e.added_by_client && !e.staff_seen_at ? { ...e, staff_seen_at: now } : e)) ?? null
      );
    } catch (e) {
      setTodoError(errorText(e));
    } finally {
      setBusyKey(null);
    }
  }

  const firstName = staff.full_name.split(" ")[0];

  return (
    <AppShell user={staffUser(staff)} nav={nav} onLogout={onLogout}>
      <main id="dash-main" className="dash-main">
        <div className="dash-title">
          <h1>{greeting()}, {firstName}</h1>
        </div>

        <section className="dash-panel" aria-labelledby="todo-heading">
          <div className="dash-panel-head">
            <h2 id="todo-heading">To do</h2>
            {todo && todo.length > 0 && <span className="panel-count">{todo.length} {todo.length === 1 ? "item" : "items"}</span>}
          </div>
          {todoError && <p className="dash-error" role="alert">{todoError}</p>}
          {!todo ? (
            !todoError && !error && <p className="dash-empty" role="status">Loading your to-do list…</p>
          ) : todo.length === 0 ? (
            <p className="dash-empty todo-clear">You are all caught up. Nothing needs you right now.</p>
          ) : (
            <TodoList
              items={todo}
              busyKey={busyKey}
              onOpenClient={onSelectClient}
              onMarkDone={markDone}
              onAcknowledge={acknowledge}
            />
          )}
        </section>

        <section className="dash-panel" aria-labelledby="clients-heading">
          <div className="dash-panel-head">
            <h2 id="clients-heading">My clients</h2>
            <input
              type="search"
              className="dash-search"
              placeholder="Search by name or phone"
              aria-label="Search clients"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              disabled={!clients?.length}
            />
          </div>

          {error ? (
            <p className="dash-error" role="alert">{error}</p>
          ) : !visible ? (
            <p className="dash-empty" role="status">Loading clients…</p>
          ) : clients?.length === 0 ? (
            <div className="dash-empty">
              <p>No clients assigned yet. Use “+ New client” in the menu to add your first.</p>
            </div>
          ) : visible.length === 0 ? (
            <p className="dash-empty">No clients match “{query}”.</p>
          ) : (
            <ClientRows clients={visible} onSelect={onSelectClient} />
          )}
        </section>
      </main>
    </AppShell>
  );
}
