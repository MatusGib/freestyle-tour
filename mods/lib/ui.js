// The mods' shared look, taken from the game's own menu ("lagoon"): mint
// cards, dark teal ink, sage borders, the teal of its highlighted button, and
// its Arial. One stylesheet, so chips, popovers and cards get real hover,
// focus and small-screen states instead of inline styles.
const CSS = `
.ft-tray{position:fixed;top:80px;left:16px;z-index:99999;display:flex;flex-direction:column;align-items:flex-start;gap:6px;max-width:min(320px,calc(100vw - 32px));pointer-events:none;font:13px/1.35 Arial,Helvetica,sans-serif;color:#133e40}
.ft-tray>*{pointer-events:auto}
.ft-slot{display:contents}
.ft-tray-toggle{display:none}
.ft-tray>[data-mod]:empty,.ft-tray>[hidden]{display:none}
.ft-note{font-size:11px;line-height:1.35;color:#2c5553;background:rgba(241,247,232,.72);border-radius:8px;padding:3px 8px;max-width:100%;pointer-events:none}
.ft-chip{display:inline-flex;align-items:center;gap:8px;min-height:34px;box-sizing:border-box;max-width:100%;padding:5px 12px;border:1px solid #749f8c;border-radius:12px;background:rgba(237,247,234,.9);color:#133e40;font:700 13px/1.25 Arial,Helvetica,sans-serif;text-align:left;cursor:pointer;box-shadow:0 4px 14px rgba(22,72,64,.12);transition:background-color .15s ease-out,border-color .15s ease-out,transform .1s ease-out}
.ft-chip:hover{background:#f6fbf2;border-color:#247b72}
.ft-chip:active{transform:translateY(1px)}
.ft-chip:focus-visible,.ft-button:focus-visible,.ft-option:focus-visible,.ft-icon-button:focus-visible,.ft-field select:focus-visible,.ft-toggle input:focus-visible{outline:2px solid #247b72;outline-offset:2px}
.ft-chip-thumb{width:40px;height:24px;flex:none;object-fit:cover;border-radius:6px;border:1px solid rgba(19,62,64,.18)}
.ft-chip-text{display:flex;flex-direction:column;min-width:0}
.ft-chip-label{font-size:11px;font-weight:400;color:#4b6a68}
.ft-chip-value{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ft-toggle{cursor:pointer}
.ft-toggle input{accent-color:#247b72;width:16px;height:16px;margin:0}
.ft-status{font-weight:400;color:#2c5553;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.ft-popover{position:fixed;top:80px;left:16px;z-index:100000;box-sizing:border-box;width:min(400px,calc(100vw - 32px));max-height:calc(100vh - 96px);overflow:auto;overscroll-behavior:contain;padding:18px 20px 20px;border:1px solid rgba(255,255,255,.47);border-radius:15px;background:rgba(241,247,232,.97);color:#133e40;font:14px/1.45 Arial,Helvetica,sans-serif;box-shadow:0 15px 60px rgba(22,72,64,.25);scrollbar-width:thin;scrollbar-color:#749f8c transparent}
.ft-popover ::selection,.ft-card ::selection{background:#bfe0d6}
.ft-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 0 6px}
.ft-title{margin:0;font-size:19px;line-height:1.25;font-weight:700;text-wrap:balance}
.ft-sub{margin:0 0 14px;color:#4b6a68;font-size:13px}
.ft-muted{color:#4b6a68;font-size:13px}
.ft-icon-button{display:inline-grid;place-items:center;flex:none;width:34px;height:34px;padding:0;border:1px solid transparent;border-radius:999px;background:transparent;color:#133e40;cursor:pointer}
.ft-icon-button:hover{background:rgba(36,123,114,.1);border-color:rgba(36,123,114,.3)}
.ft-options{display:flex;flex-direction:column;gap:10px;margin:0;padding:0;list-style:none}
.ft-option{display:grid;grid-template-columns:96px 1fr;gap:12px;align-items:start;width:100%;box-sizing:border-box;padding:10px;border:1px solid #749f8c;border-radius:12px;background:rgba(237,247,234,.79);color:inherit;font:inherit;text-align:left;cursor:pointer;transition:border-color .15s ease-out,background-color .15s ease-out}
.ft-option:hover{background:#f6fbf2;border-color:#247b72}
.ft-option[aria-pressed=true]{border-color:#247b72;box-shadow:0 0 0 1px #247b72;background:#f6fbf2}
.ft-option img{width:96px;height:64px;object-fit:cover;border-radius:8px;border:1px solid rgba(19,62,64,.15)}
.ft-option-name{display:flex;align-items:center;justify-content:space-between;gap:8px;font-weight:700;font-size:15px}
.ft-option-meta{margin-top:2px;font-size:13px;font-weight:700;color:#247b72}
.ft-option-text{margin-top:4px;font-size:13px;color:#2c5553}
.ft-check{flex:none;font-size:12px;font-weight:700;color:#247b72}
.ft-option.ft-plain{grid-template-columns:1fr}
.ft-details{margin:6px 0 0;font-size:13px;color:#2c5553}
.ft-details summary{cursor:pointer;color:#247b72;font-weight:700;width:max-content}
.ft-details p{margin:6px 0 0}
.ft-fields{display:grid;grid-template-columns:96px 1fr;gap:10px;margin:0 0 14px}
.ft-field{display:flex;flex-direction:column;gap:4px;font-size:12px;color:#4b6a68}
.ft-field select{appearance:none;box-sizing:border-box;width:100%;height:36px;padding:0 30px 0 10px;border:1px solid #749f8c;border-radius:10px;background:#fbfdf8 url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23133e40' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E") no-repeat right 10px center;color:#133e40;font:700 14px Arial,Helvetica,sans-serif;cursor:pointer}
.ft-venue{display:flex;gap:12px;align-items:center;margin:0 0 14px;padding:10px;border-radius:12px;background:rgba(36,123,114,.08)}
.ft-venue img{width:84px;height:52px;flex:none;object-fit:cover;border-radius:8px}
.ft-division{margin:14px 0 6px;font-size:15px;font-weight:700}
.ft-riders{margin:0;padding:0;list-style:none;border-top:1px solid rgba(116,159,140,.45)}
.ft-rider{display:grid;grid-template-columns:28px 1fr auto auto;gap:8px;align-items:center;min-height:42px;border-bottom:1px solid rgba(116,159,140,.45)}
.ft-rider-place{color:#4b6a68;font-variant-numeric:tabular-nums}
.ft-rider-score{color:#2c5553;font-variant-numeric:tabular-nums}
.ft-banner{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:0 0 14px;padding:10px 12px;border:1px solid #247b72;border-radius:12px;background:#f6fbf2}
.ft-button{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:36px;padding:7px 14px;border:1px solid #749f8c;border-radius:10px;background:rgba(237,247,234,.9);color:#133e40;font:700 14px/1.2 Arial,Helvetica,sans-serif;cursor:pointer;transition:background-color .15s ease-out,border-color .15s ease-out}
.ft-button:hover{background:#f6fbf2;border-color:#247b72}
.ft-button:disabled{opacity:.55;cursor:default}
.ft-button-primary{background:#247b72;border-color:#247b72;color:#fff}
.ft-button-primary:hover{background:#1c675f;border-color:#1c675f}
.ft-button-small{min-height:30px;padding:4px 10px;font-size:13px}
.ft-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:16px}
.ft-backdrop{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(19,62,64,.45)}
.ft-card{box-sizing:border-box;width:100%;max-width:460px;max-height:100%;overflow:auto;padding:22px 24px 24px;border:1px solid rgba(255,255,255,.47);border-radius:15px;background:rgba(241,247,232,.98);color:#133e40;font:15px/1.5 Arial,Helvetica,sans-serif;box-shadow:0 15px 60px rgba(22,72,64,.3)}
.ft-card h3{margin:16px 0 4px;font-size:15px}
.ft-card ol{margin:0 0 4px;padding-left:22px;list-style:decimal}
.ft-prize{display:flex;gap:14px;align-items:center;margin:16px 0 0;padding:12px;border-radius:12px;background:rgba(36,123,114,.08)}
@media (max-width:640px){
.ft-tray{top:60px;left:12px;right:12px;flex-direction:row;flex-wrap:wrap;max-width:none}
.ft-tray-toggle{display:inline-flex}
.ft-tray:not(.ft-open)>:not(.ft-tray-toggle){display:none}
.ft-note{display:none}
.ft-popover{top:auto;bottom:12px;left:12px;width:calc(100vw - 24px);max-height:70vh}
.ft-option{grid-template-columns:72px 1fr}
.ft-option img{width:72px;height:52px}
}
@media (prefers-reduced-motion:reduce){.ft-chip,.ft-option,.ft-button{transition:none}}
`;

export function ensureStyles() {
  if (document.getElementById("ft-styles")) return;
  document.head.append(Object.assign(document.createElement("style"), { id: "ft-styles", textContent: CSS }));
}

export const el = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children.flat().filter((child) => child !== null && child !== undefined && child !== false));
  return node;
};

// Lucide-style icons, drawn at the game's 2px stroke.
const ICONS = {
  close: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  sliders: '<path d="M10 5H3"/><path d="M12 19H3"/><path d="M14 3v4"/><path d="M16 17v4"/><path d="M21 12h-9"/><path d="M21 19h-5"/><path d="M21 5h-7"/><path d="M8 10v4"/><path d="M8 12H3"/>',
};
export function icon(name, size = 18) {
  const span = document.createElement("span");
  span.style.display = "inline-flex";
  span.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;
  return span;
}

// A popover under the tray: a heading with a close button, then its content.
// Escape or a click outside closes it, and focus goes back to the chip that
// opened it.
export function createPopover(title, label) {
  ensureStyles();
  const heading = el("h2", { className: "ft-title", textContent: title, id: `ft-${label}-title` });
  const close = el("button", { type: "button", className: "ft-icon-button", ariaLabel: "Close" }, icon("close"));
  const body = el("div");
  const node = el("section", { className: "ft-popover", hidden: true, role: "dialog" }, el("div", { className: "ft-head" }, heading, close), body);
  node.setAttribute("aria-labelledby", heading.id);
  document.body.append(node);
  let opener = null;
  const hide = () => {
    if (node.hidden) return;
    node.hidden = true;
    opener?.focus();
  };
  close.addEventListener("click", hide);
  node.addEventListener("keydown", (event) => event.key === "Escape" && hide());
  document.addEventListener("pointerdown", (event) => {
    if (!node.hidden && !node.contains(event.target) && !opener?.contains(event.target)) hide();
  });
  return {
    node,
    body,
    get open() {
      return !node.hidden;
    },
    show(from) {
      opener = from ?? opener;
      node.hidden = false;
      (node.querySelector("[aria-pressed=true]") ?? node.querySelector(".ft-option, select, .ft-button") ?? close).focus();
    },
    hide,
  };
}
