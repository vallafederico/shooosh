/** Scoped presentation for the reusable DOM integration example. */
export const domIntegrationStyle = `
.dom-lab { --dl-paper:#eeeae1; --dl-ink:#262d2a; --dl-muted:#777e77; --dl-line:#cfcfc4; position:relative; width:100%; height:100%; min-height:0; display:grid; grid-template-rows:auto auto minmax(0,1fr) auto; background:var(--dl-paper); color:var(--dl-ink); font:14px/1.5 system-ui,sans-serif; isolation:isolate; overflow:hidden; }
.dom-lab * { box-sizing:border-box; }
.dom-lab .dl-heading { padding:28px 32px 22px; position:relative; z-index:2; background:var(--dl-paper); }
.dom-lab .dl-eyebrow { display:flex; justify-content:space-between; gap:12px; font:10px/1.5 ui-monospace,monospace; letter-spacing:.13em; text-transform:uppercase; color:var(--dl-muted); }
.dom-lab h1 { margin:10px 0 8px; font-size:clamp(27px,3.8vw,48px); font-weight:500; line-height:1.04; letter-spacing:-.055em; }
.dom-lab .dl-intro { margin:0; max-width:620px; color:var(--dl-muted); font-size:13px; }
.dom-lab .dl-toolbar { position:relative; z-index:2; display:flex; flex-wrap:wrap; align-items:center; gap:14px 22px; padding:13px 32px; border-block:1px solid var(--dl-line); background:var(--dl-paper); }
.dom-lab button,.dom-lab select { font:11px/1.5 ui-monospace,monospace; cursor:pointer; color:var(--dl-ink); border:1px solid var(--dl-line); background:transparent; padding:7px 11px; border-radius:3px; }
.dom-lab button:hover { border-color:var(--dl-ink); }
.dom-lab button:disabled { opacity:.4; cursor:wait; }
.dom-lab button:focus-visible,.dom-lab select:focus-visible,.dom-lab a:focus-visible,.dom-lab input[type=range]:focus-visible { outline:2px solid #a3442f; outline-offset:3px; }
.dom-lab .dl-mode { display:flex; gap:2px; padding:3px; background:#ddded4; border-radius:5px; }
.dom-lab .dl-mode button { border:0; padding:5px 14px; }
.dom-lab .dl-mode button[aria-pressed=true] { background:var(--dl-ink); color:var(--dl-paper); }
.dom-lab label { display:flex; align-items:center; gap:9px; font-size:11px; }
.dom-lab input[type=range] { width:100px; accent-color:#a3442f; }
.dom-lab .dl-scroll { overflow:auto; min-height:0; padding:26px 32px 42px; scrollbar-width:thin; scrollbar-color:#b3b8ac transparent; }
.dom-lab .dl-section-label { margin:0 0 14px; display:flex; justify-content:space-between; font:10px/1.5 ui-monospace,monospace; letter-spacing:.08em; text-transform:uppercase; color:var(--dl-muted); }
.dom-lab .dl-grid { display:grid; grid-template-columns:minmax(0,1.55fr) minmax(0,1fr); gap:24px; }
.dom-lab figure { margin:0; min-width:0; }
.dom-lab .dl-image { display:block; width:100%; height:clamp(190px,26vw,340px); border:0; padding:0; border-radius:0; background:transparent; object-fit:cover; }
.dom-lab .dl-link { display:block; color:inherit; }
.dom-lab .dl-card-info { display:flex; align-items:start; justify-content:space-between; gap:12px; padding:11px 0 18px; border-bottom:1px solid var(--dl-line); }
.dom-lab .dl-card-info h2 { font-size:13px; font-weight:500; margin:0 0 4px; letter-spacing:-.02em; }
.dom-lab .dl-card-info p { margin:0; color:var(--dl-muted); font-size:11px; max-width:340px; }
.dom-lab .dl-state { font:10px/1.5 ui-monospace,monospace; padding:3px 7px; border:1px solid var(--dl-line); border-radius:20px; white-space:nowrap; }
.dom-lab .dl-state[data-state=active] { background:#d7e3c6; color:#3e5333; border-color:#bbcba6; }
.dom-lab .dl-state[data-state=fallback] { background:#ead8c5; color:#80572b; border-color:#d7bc9a; }
.dom-lab .dl-notes { margin-top:24px; display:grid; grid-template-columns:1fr 1fr; gap:24px; }
.dom-lab .dl-nested { overflow:auto; height:250px; border:1px solid #b8beaf; }
.dom-lab .dl-nested img { height:440px; object-fit:cover; }
.dom-lab .dl-note { background:#e1e2d8; padding:22px; }
.dom-lab .dl-form { margin:28px 0; padding:26px; border:1px solid #c7cbbd; border-radius:24px; background:#e6e8de; }
.dom-lab .dl-form-heading,.dom-lab .dl-form-bottom { display:flex; align-items:center; justify-content:space-between; gap:16px; flex-wrap:wrap; }
.dom-lab .dl-form h2 { margin:6px 0 0; font-size:26px; font-weight:500; letter-spacing:-.04em; }
.dom-lab .dl-form p { color:#626b61; font-size:12px; max-width:580px; margin:12px 0 22px; }
.dom-lab .dl-form button { display:inline-flex; gap:8px; align-items:center; justify-content:center; border-radius:24px; min-height:42px; padding:9px 16px; }
.dom-lab .dl-icon { width:20px; height:20px; flex:none; }
.dom-lab .dl-save[aria-pressed=true] { background:#edd6cd; border-color:#bc7965; color:#8c3e2c; }
.dom-lab .dl-save[aria-pressed=true] svg { fill:currentColor; }
.dom-lab label.dl-title-label { display:grid; gap:8px; margin:0 0 18px; font-size:12px; }
.dom-lab .dl-input-wrap { display:flex; align-items:center; gap:12px; border:1px solid #b9bfaf; border-radius:18px; background:#f8f7f1; padding:14px 18px; color:#78806f; }
.dom-lab .dl-input-wrap:focus-within { outline:2px solid #a3442f; outline-offset:3px; border-color:#a3442f; }
.dom-lab .dl-input-wrap input { min-width:0; width:100%; border:0; border-radius:0; padding:0; background:transparent; color:var(--dl-ink); font:16px/1.5 system-ui,sans-serif; outline:none; }
.dom-lab .dl-input-wrap[data-canvas-input=active] { background:transparent; border-color:transparent; outline:none; }
.dom-lab .dl-input-wrap[data-canvas-input=active] > svg,.dom-lab .dl-input-wrap[data-canvas-input=active] > input { opacity:0; }
.dom-lab .dl-form p.dl-input-status { margin:16px 0 0; font:10px/1.5 ui-monospace,monospace; }
.dom-lab .dl-form .dl-apply { color:#f8f7f1; background:#354231; border-color:#354231; }
.dom-lab .dl-form-status { font:11px/1.6 ui-monospace,monospace; color:#626b61; overflow-wrap:anywhere; max-width:440px; }
.dom-lab h3 { font-size:18px; font-weight:500; letter-spacing:-.035em; margin:0 0 10px; }
.dom-lab .dl-note p { color:#626b61; font-size:12px; margin:0 0 16px; }
.dom-lab .dl-actions { display:flex; flex-wrap:wrap; gap:8px; }
.dom-lab .dl-checks { margin:14px 0 0; white-space:pre-wrap; font:11px/1.8 ui-monospace,monospace; }
.dom-lab .dl-footer { position:relative; z-index:2; display:flex; justify-content:space-between; flex-wrap:wrap; gap:8px; align-items:center; border-top:1px solid var(--dl-line); background:var(--dl-paper); padding:12px 32px; font:10px/1.5 ui-monospace,monospace; }
.dom-lab .dl-metric { font:inherit; color:inherit; background:transparent; border:0; padding:0; width:310px; outline:none; }
.dom-lab .dl-engine { font:inherit; color:inherit; background:transparent; border:0; padding:0; width:130px; outline:none; text-transform:uppercase; }
.dom-lab canvas.dl-canvas { position:absolute; z-index:1; inset:0; width:100%; height:100%; pointer-events:none; }
@media(max-width:800px) { .dom-lab .dl-heading { padding:22px; } .dom-lab .dl-toolbar { padding:12px 22px; gap:10px; } .dom-lab .dl-scroll { padding:20px 22px; } .dom-lab .dl-grid,.dom-lab .dl-notes { grid-template-columns:1fr; gap:20px; } .dom-lab .dl-image { height:250px; } .dom-lab .dl-footer { padding:10px 22px; } }
@media(prefers-reduced-motion:reduce) { .dom-lab { scroll-behavior:auto; } }
`
