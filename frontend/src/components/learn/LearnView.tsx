import { useState } from "react";
import { LEARN_ITEMS, LEARN_TOPICS, type LearnItem, type LearnTopic } from "../../lib/learnContent";
import "./learn.css";

interface Props {
  role: "staff" | "client";
}

function PlayIcon() {
  return (
    <svg className="learn-play" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="11" />
      <path d="M10 8l6 4-6 4z" />
    </svg>
  );
}

/** Videos and guides by topic. Sample content for now: the buttons do nothing until the content exists. */
export default function LearnView({ role }: Props) {
  const [topic, setTopic] = useState<LearnTopic | "all">("all");
  const shown = LEARN_ITEMS.filter((i) => topic === "all" || i.topic === topic);
  const videos = shown.filter((i) => i.kind === "video");
  const guides = shown.filter((i) => i.kind === "guide");
  const action = role === "staff" ? "Send to a client" : "Save for later";

  return (
    <div className="learn">
      <p className="learn-note" role="note">
        <strong>Coming soon.</strong> These are examples of how this page will look. Real videos and guides will be added.
      </p>

      <div className="learn-chips" role="group" aria-label="Topic">
        <button type="button" className="learn-chip" aria-pressed={topic === "all"} onClick={() => setTopic("all")}>All</button>
        {LEARN_TOPICS.map((t) => (
          <button key={t} type="button" className="learn-chip" aria-pressed={topic === t} onClick={() => setTopic(t)}>{t}</button>
        ))}
      </div>

      <p className="learn-count" role="status">{shown.length} {shown.length === 1 ? "item" : "items"}</p>

      {videos.length > 0 && (
        <section aria-labelledby="learn-videos">
          <h2 id="learn-videos">Short videos</h2>
          <div className="learn-grid">
            {videos.map((v) => <Card key={v.id} item={v} action={action} />)}
          </div>
        </section>
      )}

      {guides.length > 0 && (
        <section aria-labelledby="learn-guides">
          <h2 id="learn-guides">Guides</h2>
          <div className="learn-guides">
            {guides.map((g) => <Card key={g.id} item={g} action={action} />)}
          </div>
        </section>
      )}

      {shown.length === 0 && <p className="learn-note">Nothing here yet.</p>}
    </div>
  );
}

function Card({ item, action }: { item: LearnItem; action: string }) {
  const video = item.kind === "video";
  return (
    <article className={`learn-card${video ? " video" : ""}`}>
      {video && (
        <div className="learn-thumb" aria-hidden="true">
          <PlayIcon />
          <span>{item.minutes} min</span>
        </div>
      )}
      <div className="learn-card-body">
        <span className="learn-topic">{item.topic}</span>
        <h3>{item.title}</h3>
        <p>{item.summary}</p>
        <span className="learn-meta">{video ? `Video · ${item.minutes} min · captions` : `Guide · ${item.minutes} min read`}</span>
        <div className="learn-actions">
          <button type="button" className="dash-btn" disabled>{video ? "Watch" : "Read"}</button>
          {video && <button type="button" className="dash-btn dash-btn-quiet" disabled>Read instead</button>}
          <button type="button" className="dash-btn dash-btn-quiet" disabled>{action}</button>
        </div>
      </div>
    </article>
  );
}
