import { TODO_GROUPS, type TodoGroup, type TodoItem } from "../../lib/todo";

interface Props {
  items: TodoItem[];
  busyKey: string | null;
  onOpenClient: (clientId: string) => void;
  onMarkDone: (item: TodoItem) => void;
  onAcknowledge: (item: TodoItem) => void;
}

/** Which one-tap action each group offers, besides opening the client. */
const ACTION: Partial<Record<TodoGroup, { label: string; run: keyof Pick<Props, "onMarkDone" | "onAcknowledge"> }>> = {
  new: { label: "Got it", run: "onAcknowledge" },
  overdue: { label: "Mark done", run: "onMarkDone" },
  soon: { label: "Mark done", run: "onMarkDone" },
};

/** The case worker's to-do list, in groups. Groups with nothing in them are left out. */
export default function TodoList({ items, busyKey, onOpenClient, ...actions }: Props) {
  return (
    <div className="todo">
      {TODO_GROUPS.map(({ group, title }) => {
        const rows = items.filter((i) => i.group === group);
        if (rows.length === 0) return null;
        const action = ACTION[group];
        return (
          <section key={group} className="todo-group" aria-labelledby={`todo-${group}`}>
            <h3 id={`todo-${group}`} className={`todo-head todo-head-${group}`}>
              {title} <span className="panel-count">({rows.length})</span>
            </h3>
            <ul className="row-list">
              {rows.map((item) => (
                <li key={item.key} className="todo-item">
                  <div className="todo-main">
                    <span className="todo-client">{item.clientName}</span>
                    <span className="todo-title">{item.title}</span>
                    <span className="todo-detail">{item.detail}</span>
                  </div>
                  <div className="todo-actions">
                    {action && (
                      <button
                        type="button"
                        className="dash-btn"
                        disabled={busyKey === item.key}
                        onClick={() => actions[action.run](item)}
                      >
                        {busyKey === item.key ? "Saving…" : action.label}
                      </button>
                    )}
                    <button type="button" className="dash-btn dash-btn-quiet" onClick={() => onOpenClient(item.clientId)}>
                      Open client
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
