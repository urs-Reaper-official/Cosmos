import Link from "next/link";
import { CosmosMark } from "@/components/ui/cosmos-mark";

const tabs = [
  { name: "Overview", href: "/dashboard", active: true },
  { name: "Intelligence", href: "/chat", active: false },
  { name: "System", href: "/settings", active: false },
];

export default function DashboardPage() {
  return (
    <main className="dashboard-page">
      <header className="dashboard-topbar">
        <div className="dashboard-brand-wrap">
          <span className="brand-mark">
            <CosmosMark size={26} />
          </span>
          <div className="brand-copy">
            <strong>COSMOS</strong>
            <small>SUPER INTELLIGENCE</small>
          </div>
        </div>

        <div className="dashboard-tabs" aria-label="Dashboard tabs">
          {tabs.map((tab) => (
            <Link
              key={tab.name}
              href={tab.href}
              className={`dashboard-tab ${tab.active ? "active" : ""}`}
            >
              {tab.name}
            </Link>
          ))}
        </div>
      </header>

      <section className="dashboard-shell">
        <div className="dashboard-panel hero-panel">
          <p className="eyebrow">LEADERSHIP CONTROL</p>
          <h1>Super Intelligence operating layer</h1>
          <p>
            COSMOS combines local model inference, user-controlled memory, and an explicitly
            reviewed learning-data workflow.
          </p>
          <div className="hero-actions">
            <Link className="primary-action" href="/chat">
              Open intelligence
            </Link>
            <Link className="secondary-action" href="/settings">
              Configure system
            </Link>
          </div>
        </div>

        <div className="dashboard-grid">
          <div className="dashboard-panel stat-panel">
            <span className="panel-label">Status</span>
            <strong>Local model</strong>
            <small>A compatible GGUF file is required</small>
          </div>

          <div className="dashboard-panel stat-panel">
            <span className="panel-label">Access</span>
            <strong>Local owner</strong>
            <small>Not a multi-user admin system</small>
          </div>

          <div className="dashboard-panel stat-panel">
            <span className="panel-label">Positioning</span>
            <strong>COSMOS</strong>
            <small>Super Intelligence workspace</small>
          </div>
        </div>

        <div className="dashboard-panel insight-panel">
          <p className="eyebrow">INTELLIGENCE PROFILE</p>
          <ul>
            <li>Local inference with a model artifact you provide</li>
            <li>Memory is opt-in and remains separate from model training</li>
            <li>Learning examples require explicit consent and human review</li>
            <li>Chat activity does not automatically modify model weights</li>
          </ul>
        </div>
      </section>
    </main>
  );
}