/*
 * CommonForms Web — production frontend.
 *
 * Same visual language as the design prototype (warm cream / charcoal,
 * Geist Sans + Geist Mono, terracotta accent). Wired up to the real
 * FastAPI backend instead of the prototype's simulated stages.
 */

const { useState, useEffect, useRef, useCallback } = React;

// ─── icons ────────────────────────────────────────────────────────────
const I = {
  upload: (p) => <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M10 14V4M6 8l4-4 4 4M3 14v2a2 2 0 002 2h10a2 2 0 002-2v-2"/></svg>,
  close: (p) => <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" {...p}><path d="M2 2l10 10M12 2L2 12"/></svg>,
  chev:  (p) => <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M2.5 4.5L6 8l3.5-3.5"/></svg>,
  check: (p) => <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M2 5.6L4.5 8 9 3"/></svg>,
  download: (p) => <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M9 2v10M5 8l4 4 4-4M3 14v1a1 1 0 001 1h10a1 1 0 001-1v-1"/></svg>,
  recent: (p) => <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="8" cy="8" r="6"/><path d="M8 4.5V8l2 2"/></svg>,
  alert: (p) => <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M7 4v4M7 10.5v.01M7 1l6 11H1L7 1z"/></svg>,
};

// ─── small primitives ────────────────────────────────────────────────
function Toggle({ on, onChange, disabled }) {
  return (
    <button type="button" className="cf-toggle" data-on={!!on} disabled={disabled}
            onClick={() => onChange(!on)} aria-pressed={!!on}>
      <span className="cf-toggle-knob"></span>
    </button>
  );
}

function Segmented({ value, onChange, options }) {
  return (
    <div className="cf-segmented">
      {options.map((opt) => (
        <button key={opt.value} type="button" className="cf-seg"
                data-active={value === opt.value} onClick={() => onChange(opt.value)}>
          <span>{opt.label}</span>
          {opt.sub && <span className="cf-seg-sub">{opt.sub}</span>}
        </button>
      ))}
    </div>
  );
}

function Slider({ value, min, max, step, onChange, disabled }) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="cf-slider" data-disabled={disabled || undefined}>
      <div className="cf-slider-track" style={{ "--cf-pct": pct + "%" }}>
        <input type="range" min={min} max={max} step={step} value={value} disabled={disabled}
               onChange={(e) => onChange(Number(e.target.value))} />
      </div>
    </div>
  );
}

function LabeledRow({ label, hint, control, disabled }) {
  return (
    <div className="cf-field-row" style={disabled ? { opacity: 0.55 } : undefined}>
      <div className="cf-label"><span>{label}</span>{control}</div>
      {hint && <div className="cf-hint">{hint}</div>}
    </div>
  );
}

// ─── header / footer ─────────────────────────────────────────────────
function Header({ hostLabel, onMenu, onHome, recentOpen }) {
  return (
    <header className="cf-header">
      <div className="cf-header-wordmark" onClick={onHome} style={{ cursor: "pointer" }}>
        <span className="cf-wm"><span className="cf-wm-dot"></span>commonforms</span>
        <span className="cf-wm-host">{hostLabel}</span>
      </div>
      <button className="cf-iconbtn" onClick={onMenu} title="Recent jobs"
              aria-pressed={recentOpen ? "true" : "false"}>
        <I.recent />
      </button>
    </header>
  );
}

function Footer({ device, version }) {
  return (
    <footer className="cf-footer">
      <span>commonforms {version || "0.1.6"}</span>
      <span className="cf-footer-stat">
        <span className="cf-footer-dot"></span>
        <span>{device || "cpu"}</span>
        <span style={{ opacity: 0.4 }}>·</span>
        <span>:8000</span>
      </span>
    </footer>
  );
}

// ─── upload screen ────────────────────────────────────────────────────
function UploadScreen({ file, onPickFile, onClearFile, options, setOptions,
                        advancedOpen, setAdvancedOpen, onConvert, maxMb, error }) {
  const inputRef = useRef(null);
  const [dragActive, setDragActive] = useState(false);

  const pick = (f) => {
    if (!f) return;
    if (!/\.pdf$/i.test(f.name)) { alert("Please choose a PDF file."); return; }
    if (maxMb && f.size > maxMb * 1024 * 1024) {
      alert(`File exceeds ${maxMb} MB limit.`); return;
    }
    onPickFile(f);
  };

  return (
    <div className="cf-screen">
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 22 }}>
        <span className="cf-eyebrow">Upload</span>
        <h1 className="cf-h1">Make any PDF<br />fillable.</h1>
      </div>

      {!file && (
        <label className="cf-drop" data-active={dragActive || undefined}
               onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
               onDragLeave={() => setDragActive(false)}
               onDrop={(e) => {
                 e.preventDefault(); setDragActive(false);
                 const f = e.dataTransfer.files && e.dataTransfer.files[0];
                 pick(f);
               }}>
          <span className="cf-drop-icon"><I.upload /></span>
          <span>
            <span className="cf-drop-primary">Drop a PDF here</span>
            <span style={{ display: "block" }} className="cf-drop-secondary">or tap to choose a file</span>
          </span>
          <span className="cf-drop-limit">PDF · max {maxMb || 100} MB</span>
          <input ref={inputRef} type="file" accept="application/pdf" hidden
                 onChange={(e) => pick(e.target.files && e.target.files[0])} />
        </label>
      )}
      {file && (
        <div className="cf-filechip">
          <div className="cf-filechip-icon"></div>
          <div className="cf-filechip-text">
            <span className="cf-filechip-name">{file.name}</span>
            <span className="cf-filechip-meta">{formatSize(file.size)}</span>
          </div>
          <button className="cf-filechip-close" onClick={onClearFile} title="Remove file">
            <I.close />
          </button>
        </div>
      )}

      {error && (
        <div style={{
          marginTop: 14, padding: "10px 12px", borderRadius: 10,
          background: "var(--cf-accent-soft)", color: "var(--cf-accent)",
          fontSize: 13, display: "flex", alignItems: "center", gap: 8,
        }}>
          <I.alert /> {error}
        </div>
      )}

      <div className="cf-disclosure" data-open={advancedOpen}>
        <button className="cf-disclosure-head" onClick={() => setAdvancedOpen(!advancedOpen)}>
          <span>Advanced options</span>
          <span className="cf-disclosure-chev"><I.chev /></span>
        </button>
        {advancedOpen && (
          <div className="cf-disclosure-body">
            <LabeledRow label="Model" control={null} />
            <div style={{ marginTop: -8 }}>
              <Segmented value={options.model}
                onChange={(v) => setOptions({ ...options, model: v })}
                options={[
                  { value: "FFDNet-L", label: "FFDNet-L", sub: "Best accuracy" },
                  { value: "FFDNet-S", label: "FFDNet-S", sub: "Smaller · faster" },
                ]} />
            </div>

            <LabeledRow
              label="Fast mode"
              hint="~50% faster on CPU. Uses ONNX runtime; slight accuracy tradeoff."
              control={<Toggle on={options.fast} onChange={(v) => setOptions({ ...options, fast: v })} />}
            />

            <div className="cf-field">
              <div className="cf-label">
                <span>Confidence threshold</span>
                <span className="cf-slider-val">{options.confidence.toFixed(2)}</span>
              </div>
              <Slider value={options.confidence} min={0.1} max={0.9} step={0.05}
                onChange={(v) => setOptions({ ...options, confidence: v })} />
              <div className="cf-hint">Lower = more fields detected (may include false positives).</div>
            </div>

            <div className="cf-field" style={options.fast ? { opacity: 0.55 } : undefined}>
              <div className="cf-label">
                <span>Image size</span>
                <span className="cf-slider-val">{options.fast ? 1216 : options.image_size}</span>
              </div>
              <Slider value={options.image_size} min={800} max={2400} step={100} disabled={options.fast}
                onChange={(v) => setOptions({ ...options, image_size: v })} />
              <div className="cf-hint">
                {options.fast ? "Fast mode forces 1216." : "Higher = sharper detection, more memory."}
              </div>
            </div>

            <LabeledRow
              label="Keep existing fields"
              hint="Don't strip form fields already in the PDF."
              control={<Toggle on={options.keep_existing_fields}
                               onChange={(v) => setOptions({ ...options, keep_existing_fields: v })} />}
            />
            <LabeledRow
              label="Detect signature fields"
              hint="Use signature widgets instead of text boxes for signature areas."
              control={<Toggle on={options.use_signature_fields}
                               onChange={(v) => setOptions({ ...options, use_signature_fields: v })} />}
            />
            <LabeledRow
              label="Multiline text boxes"
              hint="Allow detected text boxes to wrap to multiple lines."
              control={<Toggle on={options.multiline}
                               onChange={(v) => setOptions({ ...options, multiline: v })} />}
            />
          </div>
        )}
      </div>

      <div className="cf-actionbar">
        <button className="cf-btn cf-btn-primary cf-btn-block" disabled={!file} onClick={onConvert}>
          Convert{file ? "" : "  · choose a PDF first"}
        </button>
      </div>
    </div>
  );
}

// ─── processing screen ────────────────────────────────────────────────
const STAGES = [
  { key: "queued", label: "Queued" },
  { key: "loading", label: "Loading model" },
  { key: "rendering", label: "Rendering pages" },
  { key: "detecting", label: "Detecting fields" },
  { key: "writing", label: "Writing PDF" },
];

function ProcessingScreen({ filename, size, stageIndex, elapsed, onCancel }) {
  return (
    <div className="cf-screen">
      <div className="cf-proc-head">
        <span className="cf-eyebrow">Processing</span>
        <h2 className="cf-h2">{filename}</h2>
        <span className="cf-proc-elapsed">
          {formatSize(size)} · <span>{formatElapsed(elapsed)} elapsed</span>
        </span>
      </div>

      <div className="cf-stages">
        {STAGES.map((s, i) => {
          const state = i < stageIndex ? "done" : i === stageIndex ? "active" : "pending";
          return (
            <div className="cf-stage" key={s.key} data-state={state}>
              <span className="cf-stage-mark">{state === "done" ? <I.check /> : null}</span>
              <span className="cf-stage-label">{s.label}</span>
              {state === "done" && <span className="cf-stage-time">·</span>}
            </div>
          );
        })}
      </div>

      <div className="cf-progressbar"></div>

      <div className="cf-actionbar">
        <button className="cf-btn cf-btn-ghost cf-btn-block" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

// ─── failed screen ───────────────────────────────────────────────────
function FailedScreen({ filename, error, onReset }) {
  return (
    <div className="cf-screen">
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 18 }}>
        <span className="cf-eyebrow" style={{ color: "var(--cf-warn)" }}>Failed</span>
        <h1 className="cf-h1" style={{ fontSize: 22 }}>Something went wrong.</h1>
      </div>
      <div className="cf-result-hero">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div className="cf-result-check" style={{ background: "transparent", border: "1px solid var(--cf-warn)", color: "var(--cf-warn)" }}>
            <I.alert />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="cf-filechip-name" style={{ fontSize: 13.5 }}>{filename}</div>
            <div className="cf-result-sub">{error || "Unknown error."}</div>
          </div>
        </div>
      </div>
      <div className="cf-result-actions">
        <button className="cf-btn cf-btn-primary cf-btn-block" onClick={onReset}>Try another file</button>
      </div>
    </div>
  );
}

// ─── result screen ────────────────────────────────────────────────────
function ResultScreen({ filename, size, fields, pages, downloadUrl, onReset }) {
  const safe = fields || { text: 0, checkbox: 0, signature: 0 };
  const total = safe.text + safe.checkbox + safe.signature;
  const outName = stripExt(filename) + ".fillable.pdf";
  return (
    <div className="cf-screen">
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 18 }}>
        <span className="cf-eyebrow">Done · {total} fields</span>
        <div className="cf-result-line">
          <div className="cf-result-check"><I.check /></div>
          <h1 className="cf-h1" style={{ fontSize: 22 }}>Your fillable PDF<br />is ready.</h1>
        </div>
      </div>

      <div className="cf-result-hero">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div className="cf-filechip-icon" style={{ width: 32, height: 40 }}></div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="cf-filechip-name" style={{ fontSize: 13.5 }}>{outName}</div>
            <div className="cf-result-sub">
              {pages ? `${pages} pages · ` : ""}{formatSize(size)}
            </div>
          </div>
        </div>
        <a className="cf-btn cf-btn-primary cf-btn-block" href={downloadUrl} download={outName}
           style={{ textDecoration: "none" }}>
          <I.download /> Download fillable PDF
        </a>
      </div>

      <div className="cf-fields">
        <div className="cf-field-row-stat">
          <span className="cf-field-row-stat-label">
            <span className="cf-field-row-stat-swatch" style={{ background: "var(--cf-accent)" }}></span>
            Text boxes
          </span>
          <span className="cf-field-row-stat-count">{safe.text}</span>
        </div>
        <div className="cf-field-row-stat">
          <span className="cf-field-row-stat-label">
            <span className="cf-field-row-stat-swatch" style={{ background: "var(--cf-accent-soft)", border: "1px solid var(--cf-accent)" }}></span>
            Checkboxes
          </span>
          <span className="cf-field-row-stat-count">{safe.checkbox}</span>
        </div>
        <div className="cf-field-row-stat">
          <span className="cf-field-row-stat-label">
            <span className="cf-field-row-stat-swatch" style={{ background: "transparent", border: "1.5px dashed var(--cf-accent)" }}></span>
            Signatures
          </span>
          <span className="cf-field-row-stat-count">{safe.signature}</span>
        </div>
        <div className="cf-field-row-stat cf-field-row-stat-total">
          <span className="cf-field-row-stat-label">Total fields</span>
          <span className="cf-field-row-stat-count">{total}</span>
        </div>
      </div>

      <div className="cf-result-actions">
        <button className="cf-btn cf-btn-ghost cf-btn-block" onClick={onReset}>Convert another</button>
      </div>
    </div>
  );
}

// ─── recent jobs (sidebar / mobile drawer) ───────────────────────────
function RecentList({ jobs, onPick, compact }) {
  const list = jobs.slice(0, compact ? 5 : 20);
  return (
    <div className="cf-recent">
      <div className="cf-recent-head">
        <span className="cf-eyebrow">Recent jobs</span>
        <span className="cf-mono" style={{ fontSize: 10.5 }}>this browser</span>
      </div>
      {list.length === 0 && (
        <div className="cf-hint" style={{ padding: "8px 12px" }}>
          No jobs yet. Upload a PDF to get started.
        </div>
      )}
      {list.map((j) => (
        <div key={j.id} className="cf-recent-row" onClick={() => onPick(j)}>
          <div style={{ width: 22, height: 26, borderRadius: 2,
                        background: "linear-gradient(180deg, var(--cf-accent-soft), var(--cf-bg-deep))",
                        flex: "0 0 auto" }}></div>
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
            <span className="cf-recent-row-name">{j.filename}</span>
            <span className="cf-recent-row-meta">
              <span>{timeAgo(j.finished || j.created)}</span>
              <span>·</span>
              <span>{(j.totalFields ?? "?")} fields</span>
            </span>
          </div>
          <span className="cf-recent-row-status" data-s={j.status}>{j.status}</span>
        </div>
      ))}
    </div>
  );
}

// ─── helpers ──────────────────────────────────────────────────────────
function formatSize(b) {
  if (b == null) return "";
  if (b > 1e6) return (b / 1e6).toFixed(1) + " MB";
  if (b > 1e3) return (b / 1e3).toFixed(0) + " KB";
  return b + " B";
}
function formatElapsed(s) {
  s = Math.max(0, Math.floor(s));
  const m = Math.floor(s / 60); const ss = String(s % 60).padStart(2, "0");
  return `${String(m).padStart(2, "0")}:${ss}`;
}
function stripExt(n) { return (n || "file").replace(/\.pdf$/i, ""); }
function timeAgo(epoch) {
  const d = Date.now() / 1000 - epoch;
  if (d < 60) return "just now";
  if (d < 3600) return Math.floor(d / 60) + "m ago";
  if (d < 86400) return Math.floor(d / 3600) + "h ago";
  return Math.floor(d / 86400) + "d ago";
}

const DEFAULT_OPTS = {
  model: "FFDNet-L", fast: false, confidence: 0.30, image_size: 1600,
  keep_existing_fields: false, use_signature_fields: false, multiline: false,
};

const RECENT_KEY = "cf.recent.v1";
function loadRecent() {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]"); }
  catch { return []; }
}
function saveRecent(list) {
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 20))); }
  catch {}
}

// ─── login overlay ────────────────────────────────────────────────────
function Login({ onSuccess }) {
  const [pwd, setPwd] = useState("");
  const [err, setErr] = useState("");
  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    try {
      const r = await fetch("/api/login", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pwd }),
      });
      if (!r.ok) { setErr("Wrong password."); return; }
      onSuccess();
    } catch (e) { setErr(String(e)); }
  };
  return (
    <div className="cf-login cf-root" data-cf-theme="light">
      <form onSubmit={submit}>
        <h1 className="cf-h1" style={{ fontSize: 22, marginBottom: 4 }}>commonforms</h1>
        <div className="cf-hint" style={{ marginBottom: 6 }}>Enter the shared password.</div>
        <input type="password" autoFocus value={pwd} onChange={(e) => setPwd(e.target.value)}
               placeholder="Password" />
        {err && <div className="cf-hint" style={{ color: "var(--cf-warn)" }}>{err}</div>}
        <button className="cf-btn cf-btn-primary" type="submit">Continue</button>
      </form>
    </div>
  );
}

// ─── main app ─────────────────────────────────────────────────────────
function App() {
  const [theme, setTheme] = useState(
    window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
  );
  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const fn = (e) => setTheme(e.matches ? "dark" : "light");
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, []);

  const [isWide, setIsWide] = useState(window.innerWidth >= 900);
  useEffect(() => {
    const onResize = () => setIsWide(window.innerWidth >= 900);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const [authRequired, setAuthRequired] = useState(false);
  const [authed, setAuthed] = useState(true);
  const [config, setConfig] = useState({ max_upload_mb: 100, device: "cpu" });

  useEffect(() => {
    fetch("/health").then((r) => r.json()).then((h) => {
      setAuthRequired(!!h.auth_required);
    }).catch(() => {});
    fetch("/api/config").then((r) => {
      if (r.status === 401) { setAuthRequired(true); setAuthed(false); return null; }
      return r.json();
    }).then((c) => { if (c) setConfig(c); }).catch(() => {});
  }, [authed]);

  const [screen, setScreen] = useState("upload"); // upload | processing | result | failed
  const [file, setFile] = useState(null);
  const [options, setOptions] = useState(DEFAULT_OPTS);
  const [advanced, setAdvanced] = useState(false);
  const [jobId, setJobId] = useState(null);
  const [jobState, setJobState] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [uploadError, setUploadError] = useState(null);
  const [recent, setRecent] = useState(loadRecent());
  const [recentOpen, setRecentOpen] = useState(false);

  const pollRef = useRef(null);
  const timerRef = useRef(null);

  const stopPolling = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  };

  const startConvert = async () => {
    if (!file) return;
    setUploadError(null);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("model", options.model);
    fd.append("fast", options.fast ? "true" : "false");
    fd.append("confidence", String(options.confidence));
    fd.append("image_size", String(options.image_size));
    fd.append("keep_existing_fields", options.keep_existing_fields ? "true" : "false");
    fd.append("use_signature_fields", options.use_signature_fields ? "true" : "false");
    fd.append("multiline", options.multiline ? "true" : "false");

    try {
      const r = await fetch("/api/jobs", { method: "POST", body: fd });
      if (r.status === 401) { setAuthRequired(true); setAuthed(false); return; }
      if (!r.ok) {
        const t = await r.text();
        setUploadError(`Upload failed: ${t || r.statusText}`);
        return;
      }
      const { job_id } = await r.json();
      setJobId(job_id);
      setScreen("processing");
      setElapsed(0);

      timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
      pollRef.current = setInterval(async () => {
        try {
          const sr = await fetch(`/api/jobs/${job_id}`);
          if (!sr.ok) return;
          const s = await sr.json();
          setJobState(s);
          if (s.status === "done") {
            stopPolling();
            const total = (s.field_counts?.text || 0) + (s.field_counts?.checkbox || 0) + (s.field_counts?.signature || 0);
            const entry = {
              id: job_id, filename: file.name, size: file.size,
              created: s.created, finished: s.finished,
              status: "done", totalFields: total,
            };
            const next = [entry, ...recent.filter((x) => x.id !== job_id)];
            setRecent(next); saveRecent(next);
            setScreen("result");
          } else if (s.status === "failed") {
            stopPolling();
            setScreen("failed");
          }
        } catch (e) {}
      }, 1000);
    } catch (e) {
      setUploadError(String(e));
    }
  };

  const goHome = () => {
    stopPolling();
    setScreen("upload");
    setFile(null);
    setJobId(null);
    setJobState(null);
    setUploadError(null);
    setElapsed(0);
  };

  useEffect(() => () => stopPolling(), []);

  const onMenu = () => setRecentOpen((v) => !v);
  const hostLabel = (window.location.host || "");

  if (authRequired && !authed) {
    return <Login onSuccess={() => { setAuthed(true); setAuthRequired(false); }} />;
  }

  const stageIndex = jobState
    ? (typeof jobState.stage_index === "number" ? jobState.stage_index : 0)
    : 0;

  const screenBody = (
    <>
      {screen === "upload" && (
        <UploadScreen
          file={file}
          onPickFile={(f) => { setFile(f); setUploadError(null); }}
          onClearFile={() => setFile(null)}
          options={options} setOptions={setOptions}
          advancedOpen={advanced} setAdvancedOpen={setAdvanced}
          onConvert={startConvert}
          maxMb={config.max_upload_mb}
          error={uploadError}
        />
      )}
      {screen === "processing" && (
        <ProcessingScreen
          filename={file?.name || jobState?.filename || ""}
          size={file?.size || jobState?.size || 0}
          stageIndex={Math.min(stageIndex, STAGES.length - 1)}
          elapsed={elapsed}
          onCancel={() => {
            if (jobId) fetch(`/api/jobs/${jobId}`, { method: "DELETE" }).catch(() => {});
            goHome();
          }}
        />
      )}
      {screen === "result" && (
        <ResultScreen
          filename={file?.name || jobState?.filename || "file.pdf"}
          size={file?.size || jobState?.size || 0}
          fields={jobState?.field_counts}
          pages={jobState?.pages}
          downloadUrl={`/api/jobs/${jobId}/output`}
          onReset={goHome}
        />
      )}
      {screen === "failed" && (
        <FailedScreen
          filename={file?.name || jobState?.filename || "file.pdf"}
          error={jobState?.error}
          onReset={goHome}
        />
      )}
    </>
  );

  // ── desktop layout ──
  if (isWide) {
    return (
      <div className="cf-root" data-cf-theme={theme}>
        <Header hostLabel={hostLabel} onHome={goHome} onMenu={onMenu} recentOpen={recentOpen} />
        <div className="cf-main">
          <div className="cf-desktop">
            <div className="cf-desktop-main">
              <div className="cf-screen" style={{ padding: 0 }}>{screenBody}</div>
            </div>
            <aside className="cf-desktop-side">
              <RecentList jobs={recent} onPick={() => {}} />
              <div style={{ marginTop: 24, paddingTop: 18, borderTop: "1px solid var(--cf-line)" }}>
                <span className="cf-eyebrow">Container</span>
                <div className="cf-mono" style={{ fontSize: 11, lineHeight: 1.7, marginTop: 8, color: "var(--cf-ink-3)" }}>
                  <div>device · {config.device || "cpu"}</div>
                  <div>max upload · {config.max_upload_mb} MB</div>
                  <div>job TTL · {config.ttl_minutes}m</div>
                </div>
              </div>
            </aside>
          </div>
        </div>
        <Footer device={config.device} />
      </div>
    );
  }

  // ── mobile layout ──
  return (
    <div className="cf-root" data-cf-theme={theme}>
      <Header hostLabel={hostLabel} onHome={goHome} onMenu={onMenu} recentOpen={recentOpen} />
      <div className="cf-main">
        {recentOpen ? (
          <div className="cf-screen">
            <RecentList jobs={recent} onPick={() => setRecentOpen(false)} compact />
            <div style={{ marginTop: 12 }}>
              <button className="cf-btn cf-btn-ghost cf-btn-block" onClick={() => setRecentOpen(false)}>
                Back
              </button>
            </div>
          </div>
        ) : screenBody}
      </div>
      <Footer device={config.device} />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("cf-root")).render(<App />);
