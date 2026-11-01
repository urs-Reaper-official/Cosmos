import Link from "next/link";

export function SetupNotice({ title }: { title: string }) {
  return (
    <main className="setup-page">
      <Link className="sidebar-brand mb-8 text-forest" href="/">
        <span className="brand-mark">C</span>
        <span className="brand-copy">
          <strong>COSMOS</strong>
          <small>SUPER INTELLIGENCE</small>
        </span>
      </Link>
      <section className="setup-panel">
        <p className="eyebrow">LOCAL COSMOS RUNTIME</p>
        <h1>{title}</h1>
        <p>
          The local COSMOS app does not need Supabase or a hosted model API. Run the standalone app
          on port 8000 with a local GGUF model to use private, in-process inference.
        </p>
        <pre>
          {"python -m pip install -e \".[web,local]\"\nexport COSMOS_MODEL_PATH=/path/to/model.gguf\ncosmos-web"}
        </pre>
        <p>
          Set <code>COSMOS_MODEL_PATH</code> to a compatible model file you own or are licensed to
          use. The Next.js account-based prototype still requires its separate service setup.
        </p>
        <a className="primary-action" href="http://localhost:8000">
          Open local COSMOS
        </a>
      </section>
    </main>
  );
}
