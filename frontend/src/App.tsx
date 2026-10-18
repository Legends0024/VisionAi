
import { useCallback, useEffect, useRef, useState } from "react";
import "./App.css";

const API_URL = "http://127.0.0.1:8000";

type TopPrediction = {
  class_name: string;
  confidence: number;
  confidence_percent: number;
};

type Prediction = {
  id?: number;
  filename: string;
  predicted_class: string;
  confidence: number;
  confidence_percent: number;
  inference_ms: number | null;
  device: string | null;
  created_at: string;
  top5: TopPrediction[];
  image_url: string | null;
};

type HistoryItem = Prediction & {
  id: number;
};

function isPrediction(data: unknown): data is Prediction {
  if (!data || typeof data !== "object") return false;

  const item = data as Record<string, unknown>;

  return (
    typeof item.predicted_class === "string" &&
    typeof item.confidence_percent === "number" &&
    Array.isArray(item.top5)
  );
}

function imageUrl(path: string | null | undefined): string {
  if (!path) return "";
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return `${API_URL}${path.startsWith("/") ? "" : "/"}${path}`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function App() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [result, setResult] = useState<Prediction | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);

    try {
      const response = await fetch(`${API_URL}/history?limit=50`);

      if (!response.ok) {
        throw new Error("Could not load prediction history.");
      }

      const data: unknown = await response.json();

      if (!Array.isArray(data)) {
        throw new Error("The history response was not valid.");
      }

      setHistory(
        data.filter(
          (item): item is HistoryItem =>
            item !== null &&
            typeof item === "object" &&
            typeof item.id === "number" &&
            isPrediction(item),
        ),
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? `${err.message} Make sure the backend is running.`
          : "Could not connect to the backend.",
      );
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  function chooseFile(file?: File) {
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("Please select an image file.");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setError("The image must be smaller than 10 MB.");
      return;
    }

    setSelectedFile(file);
    setPreview(URL.createObjectURL(file));
    setResult(null);
    setError("");
    setNotice("");
  }

  function onFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    chooseFile(event.target.files?.[0]);
    event.target.value = "";
  }

  async function runPrediction() {
    if (!selectedFile) {
      setError("Choose an image before running a prediction.");
      return;
    }

    setLoading(true);
    setError("");
    setNotice("");

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);

      const response = await fetch(`${API_URL}/predict`, {
        method: "POST",
        body: formData,
      });

      const data: unknown = await response.json();

      if (!response.ok) {
        const detail =
          data && typeof data === "object" && "detail" in data
            ? String((data as { detail: unknown }).detail)
            : "Prediction failed.";
        throw new Error(detail);
      }

      if (!isPrediction(data)) {
        throw new Error("The prediction response was not valid.");
      }

      setResult(data);
      await loadHistory();
      setNotice("Prediction completed and saved to history.");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not complete the prediction.",
      );
    } finally {
      setLoading(false);
    }
  }

  function openHistoryItem(item: HistoryItem) {
    setResult(item);
    setPreview(imageUrl(item.image_url));
    setSelectedFile(null);
    setError("");
    setNotice(`Viewing saved prediction #${item.id}.`);

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function deleteItem(id: number) {
    if (!window.confirm("Delete this prediction and its saved image?")) {
      return;
    }

    setError("");
    setNotice("");

    try {
      const response = await fetch(`${API_URL}/history/${id}`, {
        method: "DELETE",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Could not delete prediction.");
      }

      setHistory((previous) => previous.filter((item) => item.id !== id));

      if (result?.id === id) {
        setResult(null);
        setPreview("");
        setSelectedFile(null);
      }

      setNotice("Prediction deleted.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed.");
    }
  }

  async function clearHistory() {
    if (!history.length) return;

    if (
      !window.confirm(
        "Clear all prediction history and delete all saved images?",
      )
    ) {
      return;
    }

    setError("");
    setNotice("");

    try {
      const response = await fetch(`${API_URL}/history`, {
        method: "DELETE",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Could not clear history.");
      }

      setHistory([]);
      setResult(null);
      setPreview("");
      setSelectedFile(null);
      setNotice("All history and saved images have been cleared.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not clear history.");
    }
  }

  function resetWorkspace() {
    setSelectedFile(null);
    setPreview("");
    setResult(null);
    setError("");
    setNotice("");

    if (inputRef.current) inputRef.current.value = "";
  }

  const top5 = result?.top5 ?? [];

  return (
    <main className="vision-app">
      <style>{`
        .vision-app {
          --bg: #090b16;
          --panel: #111528;
          --panel2: #171c32;
          --border: #292f49;
          --text: #f4f5ff;
          --muted: #9ba4c1;
          --accent: #9275ff;
          --cyan: #52d9f7;
          min-height: 100vh;
          padding: 28px clamp(16px, 4vw, 56px) 50px;
          background:
            radial-gradient(ellipse at 15% 0%, #29205b 0%, transparent 36%),
            radial-gradient(ellipse at 95% 20%, #10314a 0%, transparent 30%),
            var(--bg);
          color: var(--text);
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, sans-serif;
        }
        .vision-app * { box-sizing: border-box; }
        .va-container { max-width: 1440px; margin: 0 auto; }
        .va-header { display:flex; justify-content:space-between; align-items:center; gap:18px; flex-wrap:wrap; margin-bottom:40px; }
        .va-brand { display:flex; align-items:center; gap:13px; }
        .va-logo { display:grid; place-items:center; width:46px; height:46px; border-radius:15px; background:linear-gradient(135deg,#9275ff,#42d7ef); color:#090b16; font-size:22px; font-weight:900; box-shadow:0 0 30px #9275ff38; }
        .va-brand-name { font-size:21px; font-weight:800; letter-spacing:-.7px; }
        .va-brand-sub { color:var(--muted); font-size:12px; margin-top:3px; }
        .va-status { display:flex; align-items:center; gap:8px; border:1px solid var(--border); background:#111528bb; padding:10px 14px; border-radius:999px; color:#b9c4d9; font-size:12px; }
        .va-dot { width:8px; height:8px; background:#49e4ad; border-radius:50%; box-shadow:0 0 12px #49e4ad80; }
        .va-hero { margin-bottom:32px; }
        .va-eyebrow { color:var(--cyan); text-transform:uppercase; font-size:11px; font-weight:800; letter-spacing:2px; margin-bottom:12px; }
        .va-hero h1 { font-size:clamp(32px,5vw,54px); line-height:1.08; letter-spacing:-2px; margin:0; }
        .va-gradient { background:linear-gradient(90deg,#a996ff,#56dff4); color:transparent; background-clip:text; }
        .va-hero p { max-width:680px; color:var(--muted); line-height:1.7; margin-top:15px; }
        .va-grid { display:grid; grid-template-columns:minmax(0,1.15fr) minmax(320px,.85fr); gap:22px; align-items:start; }
        .va-card { border:1px solid var(--border); border-radius:22px; padding:23px; background:linear-gradient(160deg,#14192ddd,#0e1222f2); box-shadow:0 18px 55px #00000020; min-width:0; }
        .va-card-heading { display:flex; justify-content:space-between; align-items:center; gap:12px; margin-bottom:18px; }
        .va-card h2 { margin:0; font-size:17px; letter-spacing:-.3px; }
        .va-sub { color:var(--muted); font-size:12px; margin-top:6px; line-height:1.5; }
        .va-chip { border:1px solid #3b3766; color:#c7bbff; background:#211d40; border-radius:999px; padding:6px 10px; font-size:11px; white-space:nowrap; }
        .va-drop { border:1px dashed #464c70; border-radius:17px; padding:24px; min-height:250px; display:flex; flex-direction:column; justify-content:center; align-items:center; text-align:center; background:#0b1020aa; transition:.2s; }
        .va-drop.active { border-color:var(--cyan); background:#102333; }
        .va-drop-icon { font-size:36px; margin-bottom:10px; }
        .va-drop strong { font-size:15px; }
        .va-drop p { color:var(--muted); font-size:12px; line-height:1.6; margin:9px 0 17px; }
        .va-button { border:1px solid var(--border); border-radius:11px; padding:11px 15px; color:var(--text); background:#202641; cursor:pointer; font-weight:700; font-size:12px; transition:transform .15s,opacity .15s; }
        .va-button:hover { transform:translateY(-1px); }
        .va-button:disabled { opacity:.45; cursor:not-allowed; transform:none; }
        .va-primary { background:linear-gradient(110deg,#9275ff,#6a83ff); border-color:transparent; color:white; }
        .va-cyan { color:#7ce5f8; background:#102a37; border-color:#245266; }
        .va-danger { color:#ff9dba; background:#351b2a; border-color:#5a2a40; }
        .va-actions { display:flex; flex-wrap:wrap; gap:10px; margin-top:15px; }
        .va-preview { width:100%; max-height:300px; object-fit:contain; border-radius:13px; background:#080b14; margin-top:18px; border:1px solid var(--border); }
        .va-file-name { color:var(--muted); font-size:12px; overflow-wrap:anywhere; margin-top:10px; }
        .va-message { padding:12px 14px; border-radius:12px; margin-bottom:17px; font-size:12px; line-height:1.5; }
        .va-error { border:1px solid #74374b; background:#351b2a; color:#ffb4c6; }
        .va-notice { border:1px solid #255b50; background:#102b28; color:#a4f5d8; }
        .va-result { margin-top:21px; }
        .va-result-main { border:1px solid #3b3568; background:linear-gradient(130deg,#241d48,#142537); border-radius:17px; padding:20px; }
        .va-label { color:var(--muted); font-size:11px; text-transform:uppercase; letter-spacing:1.4px; font-weight:800; }
        .va-prediction { font-size:clamp(25px,3vw,36px); text-transform:capitalize; font-weight:850; letter-spacing:-1px; margin:8px 0; overflow-wrap:anywhere; }
        .va-confidence { font-size:25px; color:#81e9f8; font-weight:800; }
        .va-metrics { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; margin-top:13px; }
        .va-metric { background:#0c1121; border:1px solid var(--border); padding:13px; border-radius:13px; min-width:0; }
        .va-metric-label { color:var(--muted); font-size:11px; }
        .va-metric-value { font-size:16px; font-weight:750; margin-top:7px; overflow-wrap:anywhere; }
        .va-section-title { font-size:13px; font-weight:800; margin:23px 0 13px; }
        .va-top-row { margin-bottom:15px; }
        .va-top-meta { display:flex; justify-content:space-between; gap:10px; font-size:12px; margin-bottom:7px; text-transform:capitalize; }
        .va-top-meta span:last-child { color:#c3c9df; font-variant-numeric:tabular-nums; }
        .va-track { height:7px; background:#272d45; border-radius:999px; overflow:hidden; }
        .va-bar { height:100%; border-radius:999px; background:linear-gradient(90deg,#9275ff,#53dff2); }
        .va-history-card { margin-top:22px; }
        .va-history-list { display:grid; gap:10px; }
        .va-history-item { display:grid; grid-template-columns:62px minmax(0,1fr) auto; align-items:center; gap:13px; padding:12px; border:1px solid var(--border); background:#0d1222; border-radius:14px; }
        .va-thumb { width:62px; height:62px; object-fit:cover; border-radius:10px; background:#202640; }
        .va-thumb-placeholder { display:grid; place-items:center; font-weight:900; color:#b8a9ff; font-size:19px; }
        .va-history-name { font-size:13px; font-weight:750; text-transform:capitalize; overflow-wrap:anywhere; }
        .va-history-file { font-size:11px; color:var(--muted); margin-top:5px; overflow-wrap:anywhere; }
        .va-history-date { font-size:10px; color:var(--muted); margin-top:5px; }
        .va-history-actions { display:flex; flex-wrap:wrap; gap:6px; justify-content:flex-end; }
        .va-small { padding:8px 10px; font-size:11px; }
        .va-empty { padding:28px 12px; color:var(--muted); font-size:12px; text-align:center; border:1px dashed var(--border); border-radius:14px; }
        .va-footer { color:#727c9a; font-size:11px; text-align:center; margin-top:30px; line-height:1.7; }
        @media(max-width:900px) { .va-grid { grid-template-columns:1fr; } }
        @media(max-width:540px) {
          .vision-app { padding:20px 12px 35px; }
          .va-card { padding:16px; border-radius:17px; }
          .va-history-item { grid-template-columns:52px minmax(0,1fr); }
          .va-thumb { width:52px; height:52px; }
          .va-history-actions { grid-column:1 / -1; justify-content:flex-start; }
          .va-history-actions .va-button { flex:1; }
          .va-hero h1 { letter-spacing:-1.2px; }
        }
      `}</style>

      <div className="va-container">
        <header className="va-header">
          <div className="va-brand">
            <div className="va-logo">V</div>
            <div>
              <div className="va-brand-name">VisionAI</div>
              <div className="va-brand-sub">Computer Vision Intelligence Platform</div>
            </div>
          </div>

          <div className="va-status">
            <span className="va-dot" />
            ResNet-50 · CIFAR-10
          </div>
        </header>

        <section className="va-hero">
          <div className="va-eyebrow">AI-powered image intelligence</div>
          <h1>
            See beyond the <span className="va-gradient">pixels.</span>
          </h1>
          <p>
            Upload an image and let your fine-tuned ResNet-50 model classify
            it, compare its top predictions, and save every inference to your
            persistent prediction history.
          </p>
        </section>

        {error && (
          <div className="va-message va-error" role="alert">
            {error}
          </div>
        )}

        {notice && (
          <div className="va-message va-notice" role="status">
            {notice}
          </div>
        )}

        <div className="va-grid">
          <section className="va-card">
            <div className="va-card-heading">
              <div>
                <h2>Image workspace</h2>
                <div className="va-sub">
                  Upload JPG, PNG, or WEBP · Maximum 10 MB
                </div>
              </div>
              <span className="va-chip">Step 01</span>
            </div>

            <div
              className={`va-drop ${dragging ? "active" : ""}`}
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragging(false);
                chooseFile(event.dataTransfer.files?.[0]);
              }}
            >
              <div className="va-drop-icon">⌁</div>
              <strong>Drop your image here</strong>
              <p>
                Or browse your computer to choose an image for classification.
              </p>

              <button
                className="va-button va-cyan"
                type="button"
                onClick={() => inputRef.current?.click()}
              >
                Choose image
              </button>

              <input
                ref={inputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                hidden
                onChange={onFileChange}
              />
            </div>

            {preview && (
              <img
                className="va-preview"
                src={preview}
                alt="Selected or previously saved image"
              />
            )}

            {selectedFile && (
              <div className="va-file-name">
                Selected: {selectedFile.name} ·{" "}
                {(selectedFile.size / 1024).toFixed(1)} KB
              </div>
            )}

            <div className="va-actions">
              <button
                className="va-button va-primary"
                type="button"
                onClick={runPrediction}
                disabled={!selectedFile || loading}
              >
                {loading ? "Analyzing image..." : "Run prediction →"}
              </button>

              <button
                className="va-button"
                type="button"
                onClick={resetWorkspace}
              >
                Reset workspace
              </button>
            </div>

            {loading && (
              <div className="va-sub" style={{ marginTop: 14 }}>
                Running inference and saving the result...
              </div>
            )}
          </section>

          <section className="va-card">
            <div className="va-card-heading">
              <div>
                <h2>Model analysis</h2>
                <div className="va-sub">
                  Prediction confidence and class probabilities
                </div>
              </div>
              <span className="va-chip">Step 02</span>
            </div>

            {result ? (
              <div className="va-result">
                <div className="va-result-main">
                  <div className="va-label">Predicted class</div>
                  <div className="va-prediction">
                    {result.predicted_class}
                  </div>
                  <div className="va-confidence">
                    {result.confidence_percent.toFixed(2)}%
                  </div>
                  <div className="va-sub">Model confidence</div>
                </div>

                <div className="va-metrics">
                  <div className="va-metric">
                    <div className="va-metric-label">Inference time</div>
                    <div className="va-metric-value">
                      {result.inference_ms == null
                        ? "N/A"
                        : `${result.inference_ms.toFixed(1)} ms`}
                    </div>
                  </div>
                  <div className="va-metric">
                    <div className="va-metric-label">Compute device</div>
                    <div className="va-metric-value">
                      {result.device || "Unknown"}
                    </div>
                  </div>
                  <div className="va-metric">
                    <div className="va-metric-label">Prediction ID</div>
                    <div className="va-metric-value">
                      {result.id ?? "Not saved"}
                    </div>
                  </div>
                  <div className="va-metric">
                    <div className="va-metric-label">Top classes</div>
                    <div className="va-metric-value">{top5.length}</div>
                  </div>
                </div>

                <div className="va-section-title">Top predictions</div>

                {top5.length ? (
                  top5.map((item, index) => (
                    <div
                      className="va-top-row"
                      key={`${item.class_name}-${index}`}
                    >
                      <div className="va-top-meta">
                        <span>
                          {index + 1}. {item.class_name}
                        </span>
                        <span>
                          {item.confidence_percent.toFixed(2)}%
                        </span>
                      </div>
                      <div className="va-track">
                        <div
                          className="va-bar"
                          style={{
                            width: `${Math.min(
                              100,
                              Math.max(0, item.confidence_percent),
                            )}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="va-empty">
                    No top-5 probabilities were saved for this record.
                  </div>
                )}

                <div className="va-sub" style={{ marginTop: 15 }}>
                  {result.created_at
                    ? `Created: ${formatDate(result.created_at)}`
                    : ""}
                </div>
              </div>
            ) : (
              <div className="va-empty" style={{ padding: "58px 16px" }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>◎</div>
                <strong style={{ color: "#e5e8f8" }}>
                  Waiting for an image
                </strong>
                <p style={{ lineHeight: 1.7 }}>
                  Run a prediction or open a saved history record to see its
                  classification results here.
                </p>
              </div>
            )}
          </section>
        </div>

        <section className="va-card va-history-card">
          <div className="va-card-heading">
            <div>
              <h2>Prediction history</h2>
              <div className="va-sub">
                Saved in SQLite · Images stored by the backend
              </div>
            </div>
            <span className="va-chip">{history.length} records</span>
          </div>

          <div className="va-actions" style={{ marginTop: 0, marginBottom: 18 }}>
            <button
              className="va-button"
              type="button"
              onClick={() => void loadHistory()}
              disabled={historyLoading}
            >
              {historyLoading ? "Refreshing..." : "↻ Refresh history"}
            </button>
            <button
              className="va-button va-danger"
              type="button"
              onClick={clearHistory}
              disabled={!history.length}
            >
              Clear all history
            </button>
          </div>

          {historyLoading ? (
            <div className="va-empty">Loading saved predictions...</div>
          ) : history.length === 0 ? (
            <div className="va-empty">
              No saved predictions yet. Upload an image to get started.
            </div>
          ) : (
            <div className="va-history-list">
              {history.map((item) => (
                <article className="va-history-item" key={item.id}>
                  {item.image_url ? (
                    <img
                      className="va-thumb"
                      src={imageUrl(item.image_url)}
                      alt={item.filename}
                      loading="lazy"
                    />
                  ) : (
                    <div className="va-thumb va-thumb-placeholder">AI</div>
                  )}

                  <div>
                    <div className="va-history-name">
                      {item.predicted_class} · {item.confidence_percent.toFixed(2)}%
                    </div>
                    <div className="va-history-file">{item.filename}</div>
                    <div className="va-history-date">
                      #{item.id} · {formatDate(item.created_at)}
                    </div>
                  </div>

                  <div className="va-history-actions">
                    <button
                      className="va-button va-small va-cyan"
                      type="button"
                      onClick={() => openHistoryItem(item)}
                    >
                      View
                    </button>
                    <button
                      className="va-button va-small va-danger"
                      type="button"
                      onClick={() => void deleteItem(item.id)}
                    >
                      Delete
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <footer className="va-footer">
          VisionAI · Fine-tuned ResNet-50 · CIFAR-10 classification
          <br />
          Local development build · FastAPI + React + SQLite
        </footer>
      </div>
    </main>
  );
}

export default App;
