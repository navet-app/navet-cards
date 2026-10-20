import { css } from 'lit';

// Rich-family rules retain their original order, including responsive and later overrides.
export const customContentStyles = css`
  .widget-readings { display:grid; gap:4px; max-height:100px; min-height:0; flex:1; overflow:auto; z-index:1; scrollbar-width:thin; }
  .widget-row { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:4px 12px; width:100%; border:0; border-bottom:1px solid var(--edge); background:none; padding:9px 0; text-align:left; font-size:12px; min-height:38px; }
  .widget-row span { color:var(--muted); overflow-wrap:anywhere; } .widget-row strong { font-weight:500; max-width:120px; overflow-wrap:anywhere; }
  /* GroupedSensorCard / BatteryList: compact icon rows, without separators. */
  .card:is([data-kind='info'],[data-kind='battery']) .widget-readings { display:flex; flex-direction:column; max-height:none; }
  .compact-readings { margin-top:auto; display:grid; gap:6px; flex-shrink:0; }
  .card:is([data-kind='info'],[data-kind='battery']) .widget-row { border:0; padding:0; min-height:16px; line-height:16px; align-items:center; gap:8px; }
  .reading-label { display:flex; align-items:center; gap:4px; min-width:0; }
  .reading-label > svg { width:14px; height:14px; flex-shrink:0; }
  .reading-label > span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .battery-row { grid-template-columns:minmax(0,1fr) 64px auto; }
  .battery-row:not(:has(progress)) { grid-template-columns:minmax(0,1fr) auto; }
  .battery-row .reading-label { gap:8px; }
  .battery-row .reading-label > svg,.battery-row strong { color:var(--battery-color); }
  .battery-row strong { min-width:40px; text-align:right; white-space:nowrap; font-variant-numeric:tabular-nums; }
  .battery-row progress { width:64px; height:6px; border:0; accent-color:var(--battery-color); border-radius:4px; overflow:hidden; }
  .battery-row progress::-webkit-progress-bar { background:var(--control); border-radius:4px; }
  .battery-row progress::-webkit-progress-value { background:var(--battery-color); border-radius:4px; }
  .battery-row progress::-moz-progress-bar { background:var(--battery-color); border-radius:4px; }
  @container (max-width:240px) { .battery-row { grid-template-columns:minmax(0,1fr) auto; } .battery-row progress { display:none; }}
  .card[data-layout='comfortable'] .widget-readings { max-height:180px; } .card[data-kind='ups'] .widget-readings { gap:0; } .card[data-kind='ups'] .widget-row { min-height:30px; padding:6px 0; }
  .energy-reading { max-height:116px; min-height:0; overflow:auto; flex:1; display:grid; gap:8px; margin-top:auto; } .energy-reading button { border:0; padding:0; background:none; text-align:left; display:grid; gap:4px; } .energy-reading .metric { color:var(--text); } .energy-secondary .unit { font-size:12px; }
  .card[data-kind='photo'] { padding:0; min-height:168px; } .photo-image { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; } .card[data-kind='photo'] .header { position:absolute; bottom:0; left:0; right:0; padding:32px 12px 12px; background:linear-gradient(transparent,rgba(0,0,0,.75)); color:#fff; } .card[data-kind='photo'] .eyebrow { color:#ddd; } .card[data-kind='photo'] .header .icon { display:none; } .photo-placeholder { display:grid; place-items:center; gap:12px; margin:auto; padding-bottom:52px; } .photo-placeholder svg { width:36px; height:36px; color:var(--muted); }
  .card[data-kind='note'] { padding:12px 12px 12px 36px; } .card[data-kind='note'] .header { display:none; } .card[data-kind='note']::before { content:''; position:absolute; top:2px; bottom:0; left:10px; width:14px; background:radial-gradient(circle 5px at center 7px,var(--control) 0 74%,var(--edge) 75% 88%,transparent 89%) center top / 14px 30px repeat-y; }
  .note-paper { max-height:140px; min-height:0; overflow:auto; flex:1; background:repeating-linear-gradient(180deg,transparent 0 23px,var(--edge) 23px 24px); } .note-paper p { font-size:13px; line-height:24px; white-space:pre-wrap; overflow-wrap:anywhere; margin:0; } .note-paper form { height:100%; min-height:140px; } .note-paper textarea { font:inherit; font-size:13px; line-height:24px; resize:none; border:0; padding:0 0 40px; width:100%; height:100%; min-height:140px; background:transparent; color:var(--text); } .note-save { position:absolute; bottom:12px; right:12px; }
  .widget-action { border:0; background:none; display:flex; align-items:center; gap:8px; margin-top:auto; padding:0; min-height:36px; font-size:12px; } .widget-action svg { width:20px; height:20px; }

  .card[data-kind='battery'] { --surface:linear-gradient(135deg,#18181b,#09090b); --edge:rgba(63,63,70,.7); }
  .card[data-kind='battery'] .header .icon { color:var(--accent); }
  .card[data-kind='battery'][data-theme='light'] { --surface:linear-gradient(135deg,#fff,#f8fafc); --edge:rgba(203,213,225,.8); }
  .card[data-kind='battery'][data-theme='black'] { --surface:#000; }
  .card[data-kind='battery'][data-theme='glass'] { --surface:rgba(30,41,59,.55); --edge:rgba(255,255,255,.2); }
  .card[data-kind='info'] { --text:var(--navet-card-text,#a7d8d2); --muted:#91c5bd; --surface:radial-gradient(circle at 16% 14%,rgba(45,212,191,.16),transparent 32%),linear-gradient(135deg,#134e4a,#042f2e); --edge:#0f766e; }
  .card[data-kind='info'][data-theme='light'] { --text:var(--navet-card-text,#134e4a); --muted:#22675f; --surface:linear-gradient(135deg,#f0fdfa,#cffafe); --edge:#d1d5db; }
  .card[data-kind='info'][data-theme='black'] { --surface:radial-gradient(circle at 14% 12%,rgba(20,184,166,.16),transparent 28%),linear-gradient(135deg,#000,#001a18); }
  .card[data-kind='info'][data-theme='glass'] { --surface:linear-gradient(135deg,rgba(255,255,255,.16),rgba(153,246,228,.10),rgba(255,255,255,.03)); --edge:rgba(255,255,255,.2); }
  .card[data-layout='comfortable'] .note-paper { max-height:220px; }

  .note-open { display:block; width:100%; height:100%; min-height:140px; border:0; padding:0; background:none; color:inherit; font-size:14px; font-weight:500; line-height:24px; text-align:left; white-space:pre-wrap; overflow-wrap:anywhere; }
  .note-dialog textarea { font:inherit; color:inherit; background:var(--control); border:1px solid var(--edge); border-radius:10px; resize:vertical; min-height:140px; width:calc(100% - 40px); margin:0 20px; padding:12px; }
  .photo-shuffle { position:absolute; z-index:2; top:12px; right:12px; background:rgba(0,0,0,.3); color:#fff; }
  .photo-shuffle[aria-pressed='true'] { background:var(--accent); }
  .photo-primary { position:absolute; inset:0; width:100%; height:100%; border:0; background:none; padding:0; }
  .photo-controls { position:absolute; z-index:2; bottom:12px; left:12px; right:12px; display:flex; align-items:center; justify-content:space-between; color:#fff; }
  .photo-controls .action { background:rgba(0,0,0,.4); }
  .photo-dots { display:flex; gap:6px; align-items:center; }
  .photo-dots button { width:20px; height:24px; padding:6px; border:0; background:none; position:relative; }
  .photo-dots button::before { content:''; display:block; width:6px; height:6px; background:rgba(255,255,255,.5); border-radius:50%; }
  .photo-dots button[aria-pressed='true']::before { background:#fff; }
  .card[data-kind='info'] { --surface:radial-gradient(circle at 16% 14%,rgba(45,212,191,.12),transparent 32%),linear-gradient(135deg,#153f3c,#082724); --edge:rgba(20,184,166,.35); }
  .card[data-kind='ups'] .header .icon { color:var(--accent); }
  .ups-summary { display:flex; gap:12px; align-items:center; margin-top:auto; min-height:40px; }
  .ups-battery { border:0; background:none; text-align:left; margin:0; padding:0; font-size:36px; line-height:40px; }
  .ups-status { margin-left:auto; border:1px solid var(--edge); border-radius:20px; background:var(--control); padding:5px 10px; font-size:11px; max-width:50%; overflow-wrap:anywhere; }
  .ups-status.online { color:#4ade80; background:rgba(34,197,94,.1); border-color:rgba(34,197,94,.25); }
  .ups-status.warning { color:#fb923c; }
  .card[data-theme='light'] .ups-status.online { color:#15803d; }
  .ups-metrics { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:6px; min-height:0; overflow:auto; }
  .ups-battery-label { display:block; font-size:12px; line-height:14px; font-weight:400; }
  .ups-metrics button { background:var(--control); border:1px solid var(--edge); border-radius:10px; padding:6px 8px; text-align:left; display:grid; gap:2px; }
  .ups-metrics strong { font-size:13px; font-weight:500; }
  .card[data-kind='energy-now'] .header { padding-right:140px; }
  .energy-reading { position:absolute; top:12px; right:12px; max-width:140px; display:flex; align-items:start; gap:10px; height:auto; max-height:48px; overflow:hidden; }
  .energy-reading button { min-width:0; text-align:right; display:flex; flex-direction:column; gap:0; }
  .energy-reading strong { font-size:14px; white-space:nowrap; }
  .energy-reading strong > span { font-size:11px; margin-left:3px; font-weight:400; }
  .energy-reading .state { display:none; }
  .card[data-kind='energy-now'] .header { padding-right:100px; }
  .energy-reading { flex-direction:column; align-items:end; gap:0; max-width:100px; }
  .energy-reading .energy-primary strong { font-size:22px; line-height:24px; }
  .energy-reading .energy-primary strong > span { font-size:18px; margin:0; font-weight:600; }
  .energy-secondary strong { font-size:12px; line-height:16px; color:#6ee7b7; }
  .card[data-theme='light'] .energy-secondary strong { color:#15803d; }
  .energy-chart { margin-top:auto; flex:1; min-height:0; display:flex; flex-direction:column; justify-content:end; color:var(--accent); padding-top:4px; }
  .energy-chart > svg { width:100%; height:72px; min-height:0; }
  .chart-times { display:flex; justify-content:space-between; font-size:9px; line-height:14px; color:var(--muted); }
  .note-open { display:flex; align-items:flex-start; }
  .ups-battery { display:block; color:var(--text); font-size:32px; line-height:34px; }
  .ups-battery .unit { display:inline; }
  .card[data-kind='ups'] { gap:4px; }
  .ups-metrics button { padding:4px 8px; border-radius:16px; }
  .ups-metrics .state { font-size:10px; line-height:12px; }
  .ups-metrics strong { font-size:12px; line-height:14px; }
  .card[data-kind='photo'] .header { display:none; }
  .card[data-kind='note'] .note-paper :is(p,textarea) { font-size:14px; font-weight:500; }
  @container (max-width:240px) { .card[data-kind='energy-now'] .header { padding-right:0; } .energy-reading { position:static; flex-direction:row; max-width:none; max-height:none; flex:0; margin:0; justify-content:space-between; }}
`;
