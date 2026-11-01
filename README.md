# COSMOS

**COSMOS is your Super Intelligence workspace.** The self-hosted COSMOS runtime serves its own chat UI, runs a local GGUF model in-process with `llama.cpp`, and stores optional memory in local SQLite. It does not require Supabase, OpenRouter, Ollama, or a hosted inference API. A compatible model file and local compute are still required; COSMOS does not currently train a foundation model from scratch.

## Implemented

- Self-hosted FastAPI runtime and chat UI on port 8000 by default; no hosted database or model API is used by this runtime.
- In-process inference through `llama.cpp` from a local GGUF file.
- Local SQLite/FTS5 memory, opt-in and user-managed.
- Local conversation history in the browser, with an explicit remember-on-device setting.
- Context budgeting, bounded tool orchestration, safe response formatting, and API error handling.
- Responsive chat interface with accessible loading and error states.
- A bounded, arithmetic-only calculator tool in the Python runtime; calls require explicit approval in the CLI.
- A local SQLite learning-data curator with explicit consent, owner review, sensitive-data screening, approved-only versioned datasets, and provenance-aware JSONL export.
- Zod request validation, centralized API error responses, strict TypeScript, ESLint, Prettier, and Vitest configuration.
- Clear setup states when the local runtime or model file is missing. COSMOS does not return fake model replies.

The local runtime and memory belong to COSMOS; model weights are a separate artifact. The current learning feature curates explicitly consented and reviewed examples into datasets. It does not train or update model weights automatically. The Next.js account-based prototype remains in the repository but is not the self-hosted entrypoint described below.

## Controlled Learning Data (Local Experimental)

The Python package includes an opt-in SQLite experience collector and dataset curator. It does not scrape conversations or collect data automatically. `add` requires an explicit `--consent` flag, every new record starts as `pending`, and only records explicitly approved with `review` can be included in a versioned dataset. Obvious email addresses, phone numbers, credentials, and key patterns are rejected before storage; this heuristic is not a guarantee of anonymization, so inspect records before approving them.

Install the package in editable mode to register `cosmos-learning`:

```bash
python -m pip install -e .
```

Example local workflow:

```bash
cosmos-learning add --input "Explain binary search" \
	--output "It halves the search interval on sorted data." \
	--feedback positive --rating 5 --source-reference "manual-review" --consent
cosmos-learning list --status pending
cosmos-learning review EXPERIENCE_ID --decision approved
cosmos-learning dataset create reviewed-examples
cosmos-learning dataset list
cosmos-learning dataset export DATASET_ID > reviewed-examples.jsonl
```

The default database is `~/.local/share/cosmos/learning.sqlite3`; override it with `--database` or `COSMOS_LEARNING_DB`. The default owner namespace is `local`; override it with `--owner` or `COSMOS_LOCAL_USER_ID`. The SQLite file is created with restrictive local permissions where supported. Owner IDs are namespaces, not authenticated identities: use this CLI only for trusted local operation, not as a multi-user service. Dataset export writes to stdout so the operator chooses the destination and protects the resulting file.

This milestone implements consented collection, human review, deduplication, sensitive-data screening, provenance, quality filtering, deterministic train/validation/test assignment, dataset versioning, and JSONL export. It does not launch training, create model adapters, evaluate models, or deploy updated weights. There is no self-training or automatic promotion. PyTorch/Transformers/PEFT training and the evaluation/approval/rollback lifecycle remain future work.

## Requirements

- Python 3.12 is recommended for the prebuilt `llama-cpp-python` CPU wheel.
- A GGUF chat model file you own or are licensed to use.
- CPU memory or supported GPU compute sufficient for that model and context size.
- No Node.js, Supabase, hosted API credential, or separate model server is required for the local runtime.

## Local COSMOS Setup

Install the local runtime and its in-process inference dependency in a private Python 3.12 environment:

```bash
python3.12 -m venv --without-pip "$HOME/.cosmos/venv"
curl --fail --location --output /tmp/cosmos-get-pip.py https://bootstrap.pypa.io/get-pip.py
"$HOME/.cosmos/venv/bin/python" /tmp/cosmos-get-pip.py
"$HOME/.cosmos/venv/bin/python" -m pip install --extra-index-url https://abetlen.github.io/llama-cpp-python/whl/cpu --only-binary=llama-cpp-python 'llama-cpp-python>=0.3.8'
"$HOME/.cosmos/venv/bin/python" -m pip install -e ".[web]"
```

The small starter model can be installed with:

```bash
mkdir -p "$HOME/.cosmos/models"
MODEL_URL=https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf
curl --fail --location --output "$HOME/.cosmos/models/qwen2.5-0.5b-instruct-q4_k_m.gguf" "$MODEL_URL"
```

Run `npm run dev` to start the self-hosted, no-login COSMOS chat app on port 8000. Set `COSMOS_MODEL_PATH` to use another local GGUF model. In Codespaces, the launcher enables unauthenticated API access for the forwarded port; keep that port private. Never enable `COSMOS_ALLOW_REMOTE=1` on a public network. For other deployments, keep the server on loopback or use `COSMOS_API_TOKEN` behind a protected TLS reverse proxy.

The first inference loads the model into the COSMOS process and may take time. The starter Qwen weights are third-party pretrained open weights, not a foundation model trained by you. Replace them with your own compatible weights when available.

### Runtime and Learning Boundaries

This embeds inference in the COSMOS server process, so Ollama or another model server is not needed. It still needs a model file; writing the UI or memory code does not create model weights. To genuinely make a COSMOS-trained foundation model, the project needs a licensed training corpus, model architecture and tokenizer, training compute, evaluations, and safety/release controls. Chat activity alone does not self-train the weights. COSMOS memory is separate from training and remains local.

The local APIs include `GET /api/status`, `GET /api/models`, `GET/POST /api/memories`, `PATCH/DELETE /api/memories/{id}`, and `GET/PUT /api/memory/settings`. Local memory is disabled until explicitly enabled. The local API currently has one owner namespace (`local`), not multi-user identity or an admin authorization system.

### Environment Variables

| Variable              | Required           | Purpose                                                                    |
| --------------------- | ------------------ | -------------------------------------------------------------------------- |
| `COSMOS_MODEL_PATH`   | Yes                | Absolute path to a compatible local GGUF model file.                       |
| `COSMOS_CONTEXT_SIZE` | No                 | Inference context size from 512 to 131072; the default launcher uses 2048. |
| `COSMOS_DATA_DIR`     | No                 | Directory for local SQLite memory; defaults to `~/.cosmos`.                |
| `COSMOS_HOST`         | No                 | Bind address; defaults to loopback `127.0.0.1`.                            |
| `COSMOS_PORT`         | No                 | Web/API port; defaults to `8000`.                                          |
| `COSMOS_API_TOKEN`    | Exposed hosts only | Bearer token required before binding beyond loopback.                      |

The `.env.example` file documents local runtime settings. Do not commit credentials or model weights.

## Data, Memory, and Tools

The local runtime keeps chat history in the browser only when the user enables device history. Local memories are stored in SQLite and included in model context only after the user enables memory. Turning memory off stops future retrieval; it does not delete saved items. Memory and learning data do not update model weights.

The web calculator can evaluate bounded arithmetic expressions only. It is off by default and has no filesystem, network, shell, or account side effects. Other action-taking tools are not enabled. The Python CLI's calculator remains a separate integration and asks for approval on each call. Conversation pins are stored in browser-local storage per account and do not sync across devices. File uploads, project/workspace management, external integrations, theme switching, data export, and full account deletion are not implemented; the interface labels these limits instead of simulating them.

## Checks

```bash
npm run lint
npm run typecheck
npm test
npm run format:check
npm run build
```

The Python implementation has its own offline tests:

```bash
python -m pip install -e ".[web,test]"
python -m unittest discover -s tests -v
```

## Local Learning Data Curation

The Python package includes an opt-in SQLite experience collector and dataset curator. It does not collect conversations automatically. Collection requires an explicit `--consent` flag, new records remain pending, and only owner-approved records can enter a dataset. Obvious email, phone, credential, and API-key patterns are rejected, but this heuristic is not guaranteed anonymization; inspect records before approving them.

After installing the package (`python -m pip install -e .`), use the local CLI:

```bash
cosmos-learning add --input "Explain binary search" \
	--output "It halves the search interval on sorted data." \
	--feedback positive --rating 5 --source-reference "manual-review" --consent
cosmos-learning list --status pending
cosmos-learning review EXPERIENCE_ID --decision approved
cosmos-learning dataset create reviewed-examples
cosmos-learning dataset list
cosmos-learning dataset export DATASET_ID > reviewed-examples.jsonl
```

The database defaults to `~/.local/share/cosmos/learning.sqlite3`; set `COSMOS_LEARNING_DB` or pass `--database` to change it. The owner namespace defaults to `local`; set `COSMOS_LOCAL_USER_ID` or pass `--owner` to change it. The database file uses restrictive permissions where supported. Owner IDs are local namespaces, not authenticated identities, so this CLI is for trusted local operation and is not a multi-user service. Dataset export writes JSONL to stdout so the operator controls the destination.

Implemented learning stages: consented experience capture, human approval/rejection, deduplication, sensitive-data screening, source references, quality filtering, deterministic train/validation/test assignment, dataset versioning, and JSONL export. Model training, evaluation, adapter approval/rollback, and deployment are not implemented. No model weights are updated by this feature.

## Project Structure

```text
app/                    Next.js pages, auth callback, and API routes
components/auth/        Sign-in and sign-up UI
components/chat/        Conversation workspace
components/layout/      Shared setup and layout states
components/settings/    Memory and account settings UI
hooks/                  Client-side state and API orchestration
lib/agents/             System behavior and model orchestration
lib/ai/                 OpenRouter model configuration
lib/auth/               Server auth actions and user guards
lib/database/           Account-scoped conversation persistence
lib/memory/             User memory retrieval
lib/security/           Request schemas and validation
lib/supabase/           Session-aware Supabase client
lib/tools/              Bounded server-side calculator tool
lib/utils/              Environment parsing and API errors
supabase/migrations/    PostgreSQL schema, grants, indexes, and RLS
tests/                  Vitest web checks and Python unit/API tests
types/                  Supabase database types
src/cosmos/              Retained Python agent, CLI, and FastAPI prototype
src/cosmos/memory.py     Local SQLite FTS5 memory store
src/cosmos/learning/     Consent-based experience collection and datasets
src/cosmos/migrations/   Versioned local SQLite schema migrations
src/cosmos/learning/     Consent-based experience and dataset curation
```

## Deployment and Security Notes

For deployment, configure all required environment variables in the hosting provider, set `NEXT_PUBLIC_APP_URL` to the public HTTPS origin, add the production `/auth/callback` URL to Supabase's redirect allow list, and apply every SQL migration before serving users. Run the production build as a deployment gate. The standalone SQLite runtime is for trusted single-owner local use, not public multi-user hosting.

This is a foundation, not a fully hardened public SaaS launch. Before broad production use, add and test rate limiting/abuse controls, operational monitoring and spend limits, data export and account-deletion workflows, retention policy, and a privacy/legal review. Test auth, RLS isolation, email callbacks, and OpenRouter tool-call behavior against dedicated non-production services. Do not treat model output or user-provided memory as trusted instructions.

Model providers may process prompts under their own terms. Avoid sending secrets or unnecessary sensitive data. The local learning database is not encrypted at rest; secure the host and exported datasets. Automatic self-training on private conversations is not implemented and should not be enabled without explicit consent, data governance, evaluation, and controlled model releases.
