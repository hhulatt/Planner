'use strict';

/* =========================================================
   Planner: a content planner for short-form video.
   Everything is stored on the device (localStorage).
   ========================================================= */

const STORE_KEY = 'planner.v1';

const STATUSES = [
  { id: 'idea', label: 'Idea' },
  { id: 'planned', label: 'Planned' },
  { id: 'filmed', label: 'Filmed' },
  { id: 'posted', label: 'Posted' },
];
const STATUS_LABEL = Object.fromEntries(STATUSES.map((s) => [s.id, s.label]));

const PLATFORM_LABEL = { tiktok: 'TikTok', instagram: 'Instagram', youtube: 'YouTube', link: 'Link' };

const ICON = {
  back: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  star: '<svg viewBox="0 0 24 24"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
  x: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  clip: '<svg viewBox="0 0 24 24"><rect x="6" y="4" width="12" height="17" rx="2"/><path d="M9 4h6v3H9z"/></svg>',
  link: '<svg viewBox="0 0 24 24"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>',
  cal: '<svg viewBox="0 0 24 24"><rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="M4 12l5 5L20 6"/></svg>',
  open: '<svg viewBox="0 0 24 24"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
  bulb: '<svg viewBox="0 0 24 24"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1.1 2V16h5v-.2c.1-.8.5-1.5 1.1-2A6 6 0 0 0 12 3z"/></svg>',
  left: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
  right: '<svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>',
};

/* ---------------- Helpers ---------------- */

const $ = (sel, root = document) => root.querySelector(sel);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const now = () => new Date().toISOString();

function esc(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function isoDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function parseISO(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
const todayISO = () => isoDate(new Date());

function fmtDate(s, opts = { weekday: 'short', day: 'numeric', month: 'short' }) {
  if (!s) return '';
  return parseISO(s).toLocaleDateString(undefined, opts);
}
function relDate(s) {
  const diff = Math.round((parseISO(s) - parseISO(todayISO())) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  return fmtDate(s);
}

function parseTags(str) {
  return [...new Set(String(str).split(/[,#\n]/).map((t) => t.trim().toLowerCase()).filter(Boolean))];
}

function extractUrl(text) {
  const m = String(text || '').match(/https?:\/\/[^\s<>"']+/i);
  return m ? m[0].replace(/[).,]+$/, '') : null;
}

function detectPlatform(url) {
  let host = '';
  try { host = new URL(url).hostname.replace(/^www\./, ''); } catch { return 'link'; }
  if (/(^|\.)tiktok\.com$/.test(host)) return 'tiktok';
  if (/(^|\.)instagram\.com$/.test(host) || host === 'instagr.am') return 'instagram';
  if (/(^|\.)youtube\.com$/.test(host) || host === 'youtu.be') return 'youtube';
  return 'link';
}

function youtubeId(url) {
  try {
    const u = new URL(url);
    if (u.hostname === 'youtu.be') return u.pathname.slice(1).split('/')[0] || null;
    if (u.searchParams.get('v')) return u.searchParams.get('v');
    const m = u.pathname.match(/\/(shorts|embed|live)\/([\w-]{6,})/);
    return m ? m[2] : null;
  } catch { return null; }
}

/* ---------------- State ---------------- */

function normIdea(i) {
  return {
    id: i.id || uid(),
    title: i.title || '',
    status: STATUS_LABEL[i.status] ? i.status : 'idea',
    starred: !!i.starred,
    postDate: i.postDate || null,
    hook: i.hook || '',
    script: i.script || '',
    caption: i.caption || '',
    hashtags: i.hashtags || '',
    sound: i.sound || '',
    notes: i.notes || '',
    shots: Array.isArray(i.shots) ? i.shots.map((s) => ({ id: s.id || uid(), text: s.text || '', done: !!s.done })) : [],
    inspoIds: Array.isArray(i.inspoIds) ? i.inspoIds : [],
    createdAt: i.createdAt || now(),
    updatedAt: i.updatedAt || now(),
  };
}
function normInspo(x) {
  return {
    id: x.id || uid(),
    url: x.url || '',
    platform: x.platform || detectPlatform(x.url || ''),
    title: x.title || '',
    author: x.author || '',
    thumb: x.thumb || '',
    note: x.note || '',
    tags: Array.isArray(x.tags) ? x.tags : [],
    createdAt: x.createdAt || now(),
  };
}
function normalize(d) {
  return {
    ideas: Array.isArray(d?.ideas) ? d.ideas.map(normIdea) : [],
    inspo: Array.isArray(d?.inspo) ? d.inspo.map(normInspo) : [],
    settings: { theme: 'auto', ...(d?.settings || {}) },
  };
}

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return normalize(JSON.parse(raw));
  } catch (e) {
    console.warn('Could not load saved data', e);
  }
  return normalize({});
}

let state = load();

function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  } catch (e) {
    toast('Could not save. Your phone storage may be full.');
  }
}

let saveTimer = null;
function saveSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 300);
}
window.addEventListener('pagehide', save);
document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });

const getIdea = (id) => state.ideas.find((i) => i.id === id);
const getInspo = (id) => state.inspo.find((x) => x.id === id);

function createIdea(fields = {}) {
  const idea = normIdea({ ...fields, id: uid(), createdAt: now(), updatedAt: now() });
  state.ideas.unshift(idea);
  save();
  return idea;
}
function touch(idea) { idea.updatedAt = now(); }

/* UI-only state (not saved) */
const ui = {
  ideaFilter: 'all',
  starredOnly: false,
  ideaSearch: '',
  inspoTag: 'all',
  inspoSearch: '',
  calMonth: (() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); })(),
  calSel: todayISO(),
};

/* ---------------- Link metadata ---------------- */

async function fetchMeta(item) {
  try {
    if (item.platform === 'tiktok') {
      const r = await fetch('https://www.tiktok.com/oembed?url=' + encodeURIComponent(item.url));
      if (!r.ok) return null;
      const j = await r.json();
      return { title: j.title || '', author: j.author_unique_id ? '@' + j.author_unique_id : (j.author_name || ''), thumb: j.thumbnail_url || '' };
    }
    if (item.platform === 'youtube') {
      const meta = {};
      const id = youtubeId(item.url);
      if (id) meta.thumb = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
      try {
        const r = await fetch('https://noembed.com/embed?url=' + encodeURIComponent(item.url));
        if (r.ok) {
          const j = await r.json();
          if (j.title) meta.title = j.title;
          if (j.author_name) meta.author = j.author_name;
        }
      } catch { /* title is optional */ }
      return meta;
    }
  } catch (e) {
    console.warn('Metadata lookup failed', e);
  }
  return null;
}

async function refreshMeta(item) {
  const meta = await fetchMeta(item);
  if (!meta) return false;
  const live = getInspo(item.id);
  if (!live) return false;
  if (meta.title && !live.title) live.title = meta.title;
  if (meta.author) live.author = meta.author;
  if (meta.thumb) live.thumb = meta.thumb;
  save();
  return true;
}

// TikTok thumbnail links expire after a while, so refetch once per session when one breaks.
const thumbRetried = new Set();
window.thumbFail = (img, id) => {
  img.remove();
  if (thumbRetried.has(id)) return;
  thumbRetried.add(id);
  const item = getInspo(id);
  if (item && item.platform === 'tiktok') {
    refreshMeta(item).then((ok) => { if (ok) render(); });
  }
};

/* ---------------- Rendering: shared pieces ---------------- */

function thumbHTML(item) {
  const img = item.thumb
    ? `<img src="${esc(item.thumb)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="thumbFail(this,'${item.id}')">`
    : '';
  return `<div class="thumb"><div class="ph ph-${item.platform}">${PLATFORM_LABEL[item.platform]}</div>${img}</div>`;
}

function inspoLabel(item) {
  return item.note || item.title || PLATFORM_LABEL[item.platform] + ' video';
}

function ideaCardHTML(idea) {
  const shotsDone = idea.shots.filter((s) => s.done).length;
  const meta = [`<span class="status st-${idea.status}">${STATUS_LABEL[idea.status]}</span>`];
  if (idea.postDate) meta.push(`<span>${ICON.cal}${esc(relDate(idea.postDate))}</span>`);
  if (idea.shots.length) meta.push(`<span>${ICON.check}${shotsDone}/${idea.shots.length}</span>`);
  if (idea.inspoIds.length) meta.push(`<span>${ICON.link}${idea.inspoIds.length}</span>`);
  return `<li><a class="card idea-card" href="#/idea/${idea.id}">
    <div class="body">
      <div class="title ${idea.title ? '' : 'empty'}">${esc(idea.title || 'Untitled idea')}</div>
      <div class="meta">${meta.join('')}</div>
    </div>
    ${idea.starred ? `<span class="star">${ICON.star}</span>` : ''}
  </a></li>`;
}

function miniInspoHTML(item, extra = '') {
  return `${thumbHTML(item)}
    <div class="txt">${esc(inspoLabel(item))}<div class="sub">${PLATFORM_LABEL[item.platform]}${item.author ? ' · ' + esc(item.author) : ''}</div></div>${extra}`;
}

function topBar(title, { back = false, count = null, right = '' } = {}) {
  return `<header class="top">
    ${back ? `<button class="back" data-action="back">${ICON.back}Back</button><span class="spacer"></span>` : `<h1>${esc(title)}</h1>`}
    ${count !== null ? `<span class="count">${count}</span>` : ''}
    ${right}
  </header>`;
}

/* ---------------- View: Ideas ---------------- */

function filteredIdeas() {
  const q = ui.ideaSearch.trim().toLowerCase();
  return state.ideas
    .filter((i) => ui.ideaFilter === 'all' || i.status === ui.ideaFilter)
    .filter((i) => !ui.starredOnly || i.starred)
    .filter((i) => !q || [i.title, i.hook, i.script, i.caption, i.hashtags, i.notes].join(' ').toLowerCase().includes(q))
    .sort((a, b) => (b.starred - a.starred) || b.updatedAt.localeCompare(a.updatedAt));
}

function ideasListHTML() {
  const list = filteredIdeas();
  if (!state.ideas.length) {
    return `<div class="empty"><strong>No ideas yet</strong>Tap + to jot one down before you forget it.
      <br><button class="btn primary" data-action="new-idea">${ICON.plus}New idea</button></div>`;
  }
  if (!list.length) return `<div class="empty">Nothing matches.</div>`;
  return `<ul class="list">${list.map(ideaCardHTML).join('')}</ul>`;
}

function viewIdeas() {
  const counts = Object.fromEntries(STATUSES.map((s) => [s.id, state.ideas.filter((i) => i.status === s.id).length]));
  const chip = (id, label, n) =>
    `<button class="chip ${ui.ideaFilter === id ? 'on' : ''}" data-action="idea-filter" data-id="${id}">${label}<span class="n">${n}</span></button>`;
  return `
    ${topBar('Ideas')}
    <input class="search" type="search" placeholder="Search ideas" value="${esc(ui.ideaSearch)}" data-ui="ideaSearch" enterkeyhint="search">
    <div class="chips">
      ${chip('all', 'All', state.ideas.length)}
      ${STATUSES.map((s) => chip(s.id, s.label, counts[s.id])).join('')}
      <button class="chip ${ui.starredOnly ? 'on' : ''}" data-action="toggle-starred">★ Starred</button>
    </div>
    <div id="list">${ideasListHTML()}</div>
    <button class="fab" data-action="new-idea" aria-label="New idea">${ICON.plus}</button>`;
}

/* ---------------- View: Idea detail ---------------- */

function viewIdea(id) {
  const idea = getIdea(id);
  if (!idea) return notFound('That idea was deleted.');
  const linked = idea.inspoIds.map(getInspo).filter(Boolean);
  const done = idea.shots.filter((s) => s.done).length;

  return `
    ${topBar('', {
      back: true,
      right: `<button class="icon-btn ${idea.starred ? 'on' : ''}" data-action="star-idea" aria-label="Star">${ICON.star}</button>`,
    })}
    <textarea class="title-input" data-field="title" rows="1" placeholder="Name this idea">${esc(idea.title)}</textarea>

    <div class="segmented">
      ${STATUSES.map((s) => `<button class="st-${s.id} ${idea.status === s.id ? 'on' : ''}" data-action="set-status" data-id="${s.id}">${s.label}</button>`).join('')}
    </div>

    <label class="field"><span>Post date</span>
      <div class="row">
        <input type="date" data-field="postDate" value="${esc(idea.postDate || '')}">
        ${idea.postDate ? `<button class="btn small" style="flex:none" data-action="clear-date">Clear</button>` : ''}
      </div>
    </label>

    <label class="field"><span>Hook</span>
      <textarea data-field="hook" rows="2" placeholder="The first 2 seconds. What stops the scroll?">${esc(idea.hook)}</textarea>
    </label>
    <label class="field"><span>Script / talking points</span>
      <textarea data-field="script" rows="5" placeholder="What you'll say or show">${esc(idea.script)}</textarea>
    </label>

    <div class="section-title">Shot list <span class="progress">${idea.shots.length ? `${done}/${idea.shots.length} done` : ''}</span></div>
    <ul class="shots">
      ${idea.shots.map((s) => `
        <li class="shot ${s.done ? 'done' : ''}" data-shot="${s.id}">
          <input type="checkbox" ${s.done ? 'checked' : ''} data-action="toggle-shot" aria-label="Done">
          <input type="text" value="${esc(s.text)}" placeholder="Describe the shot" data-shot-text enterkeyhint="next">
          <button class="icon-btn" data-action="remove-shot" aria-label="Remove shot">${ICON.x}</button>
        </li>`).join('')}
    </ul>
    <button class="btn small soft" data-action="add-shot">${ICON.plus}Add shot</button>

    <div class="section-title">Posting</div>
    <label class="field"><span>Caption</span>
      <textarea data-field="caption" rows="3" placeholder="Caption for the post">${esc(idea.caption)}</textarea>
    </label>
    <label class="field"><span>Hashtags</span>
      <input data-field="hashtags" value="${esc(idea.hashtags)}" placeholder="#fyp #tutorial" autocapitalize="off">
    </label>
    <label class="field"><span>Sound / audio</span>
      <input data-field="sound" value="${esc(idea.sound)}" placeholder="Trending sound, voiceover, music…">
    </label>
    <label class="field"><span>Notes</span>
      <textarea data-field="notes" rows="3" placeholder="Props, location, outfit, anything else">${esc(idea.notes)}</textarea>
    </label>

    <div class="section-title">Inspiration <button data-action="link-inspo">+ Link</button></div>
    ${linked.length
      ? `<ul class="list">${linked.map((x) => `<li><div class="mini-inspo"><a href="#/inspo/${x.id}" style="display:contents;color:inherit;text-decoration:none">${miniInspoHTML(x)}</a>
          <button class="icon-btn" data-action="unlink-inspo" data-id="${x.id}" aria-label="Unlink">${ICON.x}</button></div></li>`).join('')}</ul>`
      : `<div class="empty" style="padding:20px">No inspiration linked yet.</div>`}

    <div class="danger-zone"><button class="btn block danger" data-action="delete-idea">${ICON.trash}Delete idea</button></div>`;
}

/* ---------------- View: Inspo ---------------- */

function allTags() {
  const counts = {};
  state.inspo.forEach((x) => x.tags.forEach((t) => { counts[t] = (counts[t] || 0) + 1; }));
  return Object.entries(counts).sort((a, b) => b[1] - a[1]);
}

function filteredInspo() {
  const q = ui.inspoSearch.trim().toLowerCase();
  return state.inspo
    .filter((x) => ui.inspoTag === 'all' || x.tags.includes(ui.inspoTag))
    .filter((x) => !q || [x.title, x.note, x.author, x.url, x.tags.join(' ')].join(' ').toLowerCase().includes(q));
}

function inspoUseCount(id) {
  return state.ideas.filter((i) => i.inspoIds.includes(id)).length;
}

function inspoListHTML() {
  if (!state.inspo.length) {
    return `<div class="empty"><strong>Save videos that inspire you</strong>
      In TikTok, Instagram or YouTube tap <b>Share → Copy link</b>, then come back here and tap <b>Paste link</b>.</div>`;
  }
  const list = filteredInspo();
  if (!list.length) return `<div class="empty">Nothing matches.</div>`;
  return `<div class="grid">${list.map((x) => {
    const used = inspoUseCount(x.id);
    return `<a class="inspo-card" href="#/inspo/${x.id}">
      ${thumbHTML(x)}
      <div class="info">
        <div class="t">${esc(inspoLabel(x))}</div>
        ${x.tags.length ? `<div class="tags">${x.tags.slice(0, 3).map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>` : ''}
        ${used ? `<div class="used">Used in ${used} idea${used > 1 ? 's' : ''}</div>` : ''}
      </div>
    </a>`;
  }).join('')}</div>`;
}

function viewInspo() {
  const tags = allTags();
  if (ui.inspoTag !== 'all' && !tags.some(([t]) => t === ui.inspoTag)) ui.inspoTag = 'all';
  return `
    ${topBar('Inspo', { count: state.inspo.length || null })}
    <div class="paste-bar">
      <button class="btn primary" data-action="paste-link">${ICON.clip}Paste link</button>
      <button class="btn" style="flex:none" data-action="add-inspo" aria-label="Type a link">${ICON.plus}</button>
    </div>
    ${state.inspo.length ? `<input class="search" type="search" placeholder="Search notes, tags, creators" value="${esc(ui.inspoSearch)}" data-ui="inspoSearch" enterkeyhint="search">` : ''}
    ${tags.length ? `<div class="chips">
      <button class="chip ${ui.inspoTag === 'all' ? 'on' : ''}" data-action="inspo-tag" data-id="all">All</button>
      ${tags.map(([t, n]) => `<button class="chip ${ui.inspoTag === t ? 'on' : ''}" data-action="inspo-tag" data-id="${esc(t)}">${esc(t)}<span class="n">${n}</span></button>`).join('')}
    </div>` : '<div style="height:12px"></div>'}
    <div id="list">${inspoListHTML()}</div>`;
}

/* ---------------- View: Inspo detail ---------------- */

function viewInspoItem(id) {
  const item = getInspo(id);
  if (!item) return notFound('That link was deleted.');
  const ideas = state.ideas.filter((i) => i.inspoIds.includes(id));
  return `
    ${topBar('', { back: true })}
    <div class="inspo-hero">
      ${thumbHTML(item)}
      <div class="hero-info">
        <h2>${esc(item.title || PLATFORM_LABEL[item.platform] + ' video')}</h2>
        <div class="by">${item.author ? esc(item.author) + ' · ' : ''}${PLATFORM_LABEL[item.platform]}</div>
        <a class="btn small" href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">${ICON.open}Open video</a>
      </div>
    </div>

    <button class="btn primary block" data-action="inspo-to-idea">${ICON.bulb}Turn into idea</button>

    <div style="height:18px"></div>
    <label class="field"><span>Why I saved it</span>
      <textarea data-inspo-field="note" rows="3" placeholder="Great hook, transition idea, format to copy…">${esc(item.note)}</textarea>
    </label>
    <label class="field"><span>Tags</span>
      <input data-inspo-field="tags" value="${esc(item.tags.join(', '))}" placeholder="hooks, transitions, trends" autocapitalize="off">
      <div class="hint">Separate with commas.</div>
    </label>

    <div class="section-title">Ideas from this</div>
    ${ideas.length ? `<ul class="list">${ideas.map(ideaCardHTML).join('')}</ul>` : `<div class="empty" style="padding:20px">Not used in any ideas yet.</div>`}

    <div class="danger-zone"><button class="btn block danger" data-action="delete-inspo">${ICON.trash}Delete link</button></div>`;
}

/* ---------------- View: Calendar ---------------- */

function viewCalendar() {
  const first = ui.calMonth;
  const startOffset = (first.getDay() + 6) % 7; // weeks start on Monday
  const start = new Date(first.getFullYear(), first.getMonth(), 1 - startOffset);
  const today = todayISO();

  const byDate = {};
  state.ideas.forEach((i) => { if (i.postDate) (byDate[i.postDate] ||= []).push(i); });

  const days = [];
  for (let n = 0; n < 42; n++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + n);
    if (n === 35 && d.getMonth() !== first.getMonth()) break; // drop an empty 6th week
    const iso = isoDate(d);
    const items = byDate[iso] || [];
    const cls = ['day', d.getMonth() !== first.getMonth() && 'out', iso === today && 'today', iso === ui.calSel && 'sel'].filter(Boolean).join(' ');
    days.push(`<button class="${cls}" data-action="cal-day" data-id="${iso}" aria-label="${fmtDate(iso, { day: 'numeric', month: 'long' })}, ${items.length} posts">
      <span class="num">${d.getDate()}</span>
      <span class="dots">${items.slice(0, 3).map((i) => `<i class="st-${i.status}"></i>`).join('')}</span>
    </button>`);
  }

  const selItems = byDate[ui.calSel] || [];
  const upcoming = state.ideas
    .filter((i) => i.postDate && i.postDate >= today && i.status !== 'posted')
    .sort((a, b) => a.postDate.localeCompare(b.postDate))
    .slice(0, 8);
  const unscheduled = state.ideas.filter((i) => !i.postDate && i.status !== 'posted').length;

  return `
    ${topBar('Calendar')}
    <div class="cal-head">
      <button class="icon-btn" data-action="cal-prev" aria-label="Previous month">${ICON.left}</button>
      <h2>${first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h2>
      <button class="icon-btn" data-action="cal-next" aria-label="Next month">${ICON.right}</button>
    </div>
    <div class="cal">
      ${['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d) => `<div class="dow">${d}</div>`).join('')}
      ${days.join('')}
    </div>

    <div class="section-title">${esc(relDate(ui.calSel))}${relDate(ui.calSel) !== fmtDate(ui.calSel) ? ' · ' + esc(fmtDate(ui.calSel)) : ''}</div>
    ${selItems.length ? `<ul class="list">${selItems.map(ideaCardHTML).join('')}</ul>` : `<div class="empty" style="padding:18px">Nothing planned for this day.</div>`}
    <div class="row" style="margin-top:10px">
      <button class="btn small soft" data-action="schedule-existing" ${unscheduled ? '' : 'disabled style="opacity:.5"'}>Schedule an idea${unscheduled ? ` (${unscheduled})` : ''}</button>
      <button class="btn small soft" data-action="new-idea-on-day">${ICON.plus}New idea</button>
    </div>

    ${upcoming.length ? `<div class="section-title">Coming up</div><ul class="list">${upcoming.map(ideaCardHTML).join('')}</ul>` : ''}`;
}

/* ---------------- View: More ---------------- */

function viewMore() {
  const posted = state.ideas.filter((i) => i.status === 'posted').length;
  const t = state.settings.theme;
  return `
    ${topBar('More')}
    <div class="group stats">
      <div><b>${state.ideas.length}</b><span>Ideas</span></div>
      <div><b>${state.inspo.length}</b><span>Inspo links</span></div>
      <div><b>${posted}</b><span>Posted</span></div>
    </div>

    <div class="section-title">Appearance</div>
    <div class="segmented" style="grid-template-columns:repeat(3,1fr)">
      ${['auto', 'light', 'dark'].map((v) => `<button class="${t === v ? 'on' : ''}" style="--st:var(--accent)" data-action="theme" data-id="${v}">${v[0].toUpperCase() + v.slice(1)}</button>`).join('')}
    </div>

    <div class="section-title">Backup</div>
    <div class="group">
      <p>Your plans are saved on this phone only. Export a backup now and then (to Files or iCloud Drive) so you never lose them.</p>
      <div class="btn-col">
        <button class="btn primary" data-action="export">Export backup</button>
        <button class="btn" data-action="import">Restore from backup</button>
      </div>
      <input type="file" id="import-file" accept="application/json,.json" hidden>
    </div>

    <div class="section-title">Install on iPhone</div>
    <div class="group">
      <ol>
        <li>Open this page in <b>Safari</b>.</li>
        <li>Tap the <b>Share</b> button, then <b>Add to Home Screen</b>.</li>
        <li>Open Planner from your home screen from now on.</li>
      </ol>
      <p style="margin:10px 0 0">Saved links and ideas live inside the app you opened, so stick to the home-screen icon.</p>
    </div>

    <div class="section-title">Saving inspiration</div>
    <div class="group">
      <ol>
        <li>On a video in TikTok, Instagram or YouTube, tap <b>Share → Copy link</b>.</li>
        <li>Open Planner, go to <b>Inspo</b> and tap <b>Paste link</b>.</li>
        <li>Add a quick note on why you liked it, then save.</li>
      </ol>
    </div>

    <div class="danger-zone"><button class="btn block danger" data-action="erase">Erase all data</button></div>`;
}

function notFound(msg) {
  return `${topBar('', { back: true })}<div class="empty"><strong>Not found</strong>${esc(msg)}</div>`;
}

function autosize(el) {
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
}

/* ---------------- Router ---------------- */

function currentRoute() {
  const [view = 'ideas', id] = location.hash.replace(/^#\/?/, '').split('/');
  return { view, id };
}

let lastRouteKey = '';
function render() {
  const { view, id } = currentRoute();
  const html = {
    ideas: viewIdeas,
    idea: () => viewIdea(id),
    inspo: () => (id ? viewInspoItem(id) : viewInspo()),
    calendar: viewCalendar,
    more: viewMore,
  }[view]?.() ?? (location.replace('#/ideas'), '');
  if (!html) return;

  const routeKey = view + '/' + (id || '');
  const keepScroll = routeKey === lastRouteKey;
  const y = window.scrollY;
  $('#view').innerHTML = html;
  window.scrollTo(0, keepScroll ? y : 0);
  lastRouteKey = routeKey;
  document.querySelectorAll('.title-input').forEach(autosize);

  const tab = { idea: 'ideas' }[view] || view;
  document.querySelectorAll('#tabs a').forEach((a) => a.classList.toggle('on', a.dataset.tab === tab));
}

function rerenderList() {
  const { view } = currentRoute();
  const el = $('#list');
  if (!el) return render();
  el.innerHTML = view === 'inspo' ? inspoListHTML() : ideasListHTML();
}

window.addEventListener('hashchange', render);

// Back returns to wherever you came from; on a fresh launch straight into a detail page, go to its list.
let navigatedInApp = false;
window.addEventListener('hashchange', () => { navigatedInApp = true; });
function goBack() {
  if (navigatedInApp) history.back();
  else location.hash = currentRoute().view === 'inspo' ? '#/inspo' : '#/ideas';
}

/* ---------------- Sheets & toast ---------------- */

function openSheet(html, onMount) {
  const root = $('#sheet-root');
  root.innerHTML = `<div class="backdrop" data-action="close-sheet"></div>
    <div class="sheet" role="dialog" aria-modal="true"><div class="grabber"></div>${html}</div>`;
  document.body.style.overflow = 'hidden';
  onMount?.($('.sheet', root));
}
function closeSheet() {
  $('#sheet-root').innerHTML = '';
  document.body.style.overflow = '';
}

let toastTimer = null;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
}

/* ---- New idea sheet ---- */

function sheetNewIdea(postDate = null) {
  openSheet(`
    <h2>New idea</h2>
    <form id="new-idea-form">
      <label class="field"><span>What's the idea?</span>
        <textarea name="title" rows="3" placeholder="e.g. 3 mistakes beginners make with…" required></textarea>
      </label>
      ${postDate ? `<p class="hint" style="margin:-4px 2px 12px;color:var(--muted)">Scheduled for ${esc(fmtDate(postDate))}</p>` : ''}
      <div class="actions">
        <button type="button" class="btn" data-action="save-idea-open">Save & add details</button>
        <button type="submit" class="btn primary">Save</button>
      </div>
    </form>`, (sheet) => {
    const form = $('form', sheet);
    const ta = $('textarea', sheet);
    ta.focus();
    const submit = (open) => {
      const title = ta.value.trim();
      if (!title) { ta.focus(); return; }
      const idea = createIdea({ title, postDate, status: postDate ? 'planned' : 'idea' });
      closeSheet();
      if (open) location.hash = '#/idea/' + idea.id;
      else { render(); toast('Idea saved'); }
    };
    form.addEventListener('submit', (e) => { e.preventDefault(); submit(false); });
    ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(false); } });
    $('[data-action="save-idea-open"]', sheet).addEventListener('click', () => submit(true));
  });
}

/* ---- Add inspiration sheet ---- */

function sheetAddInspo(prefill = '', message = '') {
  const tags = allTags().slice(0, 12);
  openSheet(`
    <h2>Save inspiration</h2>
    ${message ? `<p style="margin:-6px 0 12px;color:var(--muted);font-size:14px">${esc(message)}</p>` : ''}
    <form id="inspo-form">
      <label class="field"><span>Video link</span>
        <input name="url" type="url" inputmode="url" value="${esc(prefill)}" placeholder="https://www.tiktok.com/…" autocapitalize="off" autocorrect="off" required>
      </label>
      <label class="field"><span>Why I saved it</span>
        <textarea name="note" rows="2" placeholder="Great hook, transition idea, format to copy…"></textarea>
      </label>
      <label class="field"><span>Tags</span>
        <input name="tags" placeholder="hooks, transitions, trends" autocapitalize="off">
      </label>
      ${tags.length ? `<div class="tags" style="margin:-6px 0 14px">${tags.map(([t]) => `<button type="button" class="chip" data-add-tag="${esc(t)}">${esc(t)}</button>`).join('')}</div>` : ''}
      <div class="actions">
        <button type="button" class="btn" data-action="close-sheet">Cancel</button>
        <button type="submit" class="btn primary">Save</button>
      </div>
    </form>`, (sheet) => {
    const form = $('form', sheet);
    (prefill ? form.note : form.url).focus();
    sheet.addEventListener('click', (e) => {
      const t = e.target.closest('[data-add-tag]');
      if (!t) return;
      const cur = parseTags(form.tags.value);
      if (!cur.includes(t.dataset.addTag)) cur.push(t.dataset.addTag);
      form.tags.value = cur.join(', ');
      t.classList.add('on');
    });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const url = extractUrl(form.url.value) || (form.url.value.trim() && 'https://' + form.url.value.trim().replace(/^\/+/, ''));
      if (!url) { form.url.focus(); return; }
      const existing = state.inspo.find((x) => x.url === url);
      if (existing) {
        closeSheet();
        toast('You already saved this one');
        location.hash = '#/inspo/' + existing.id;
        return;
      }
      const item = normInspo({ id: uid(), url, note: form.note.value.trim(), tags: parseTags(form.tags.value), createdAt: now() });
      state.inspo.unshift(item);
      save();
      closeSheet();
      ui.inspoTag = 'all';
      if (currentRoute().view !== 'inspo') location.hash = '#/inspo';
      else render();
      toast('Saved to Inspo');
      refreshMeta(item).then((ok) => { if (ok && currentRoute().view === 'inspo') render(); });
    });
  });
}

async function pasteLink() {
  let text = '';
  try {
    text = await navigator.clipboard.readText();
  } catch {
    return sheetAddInspo('', 'Paste the link below (tap and hold the box, then Paste).');
  }
  const url = extractUrl(text);
  if (!url) return sheetAddInspo('', "There's no link on your clipboard. Copy one from the app first, or paste it below.");
  const existing = state.inspo.find((x) => x.url === url);
  if (existing) {
    toast('You already saved this one');
    location.hash = '#/inspo/' + existing.id;
    return;
  }
  sheetAddInspo(url);
}

/* ---- Pickers ---- */

function sheetLinkInspo(idea) {
  if (!state.inspo.length) {
    toast('Save some inspiration in the Inspo tab first');
    return;
  }
  const selected = new Set(idea.inspoIds);
  openSheet(`
    <h2>Link inspiration</h2>
    <ul class="pick-list">
      ${state.inspo.map((x) => `<li><button type="button" class="mini-inspo ${selected.has(x.id) ? 'on' : ''}" data-pick="${x.id}">${miniInspoHTML(x)}</button></li>`).join('')}
    </ul>
    <div class="actions"><button class="btn primary" data-action="close-sheet">Done</button></div>`, (sheet) => {
    sheet.addEventListener('click', (e) => {
      const b = e.target.closest('[data-pick]');
      if (!b) return;
      const id = b.dataset.pick;
      if (selected.has(id)) selected.delete(id); else selected.add(id);
      b.classList.toggle('on');
      idea.inspoIds = state.inspo.map((x) => x.id).filter((x) => selected.has(x));
      touch(idea);
      save();
      render();
    });
  });
}

function sheetScheduleExisting(date) {
  const ideas = state.ideas.filter((i) => !i.postDate && i.status !== 'posted');
  openSheet(`
    <h2>Schedule for ${esc(fmtDate(date))}</h2>
    <ul class="pick-list">
      ${ideas.map((i) => `<li><button type="button" class="card" data-pick="${i.id}">
        <div style="font-weight:600;margin-bottom:4px">${esc(i.title || 'Untitled idea')}</div>
        <span class="status st-${i.status}">${STATUS_LABEL[i.status]}</span></button></li>`).join('')}
    </ul>
    <div class="actions"><button class="btn" data-action="close-sheet">Cancel</button></div>`, (sheet) => {
    sheet.addEventListener('click', (e) => {
      const b = e.target.closest('[data-pick]');
      if (!b) return;
      const idea = getIdea(b.dataset.pick);
      idea.postDate = date;
      if (idea.status === 'idea') idea.status = 'planned';
      touch(idea);
      save();
      closeSheet();
      render();
      toast('Scheduled');
    });
  });
}

/* ---------------- Backup ---------------- */

async function exportBackup() {
  const data = JSON.stringify({ app: 'planner', version: 1, exportedAt: now(), ...state }, null, 2);
  const name = `planner-backup-${todayISO()}.json`;
  const file = new File([data], name, { type: 'application/json' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Planner backup' });
      return;
    } catch (e) {
      if (e.name === 'AbortError') return;
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

function importBackup(file) {
  const reader = new FileReader();
  reader.onload = () => {
    let data;
    try {
      data = JSON.parse(reader.result);
      if (!Array.isArray(data.ideas) || !Array.isArray(data.inspo)) throw new Error('bad shape');
    } catch {
      toast("That file isn't a Planner backup");
      return;
    }
    const msg = `Replace everything with this backup?\n\n${data.ideas.length} ideas, ${data.inspo.length} inspo links.\nYour current data will be overwritten.`;
    if (!confirm(msg)) return;
    state = normalize(data);
    save();
    applyTheme();
    render();
    toast('Backup restored');
  };
  reader.readAsText(file);
}

/* ---------------- Theme ---------------- */

function applyTheme() {
  const t = state.settings.theme;
  if (t === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
}

/* ---------------- Events ---------------- */

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const action = el.dataset.action;
  const { view, id } = currentRoute();
  const idea = view === 'idea' ? getIdea(id) : null;
  const inspo = view === 'inspo' && id ? getInspo(id) : null;

  switch (action) {
    case 'back': goBack(); break;
    case 'close-sheet': closeSheet(); break;

    case 'new-idea': sheetNewIdea(); break;
    case 'idea-filter': ui.ideaFilter = el.dataset.id; render(); break;
    case 'toggle-starred': ui.starredOnly = !ui.starredOnly; render(); break;

    case 'star-idea': idea.starred = !idea.starred; touch(idea); save(); render(); break;
    case 'set-status': idea.status = el.dataset.id; touch(idea); save(); render(); break;
    case 'clear-date': idea.postDate = null; touch(idea); save(); render(); break;
    case 'add-shot': {
      const shot = { id: uid(), text: '', done: false };
      idea.shots.push(shot);
      touch(idea); save(); render();
      $(`[data-shot="${shot.id}"] input[type="text"]`)?.focus();
      break;
    }
    case 'toggle-shot': {
      const shot = idea.shots.find((s) => s.id === el.closest('[data-shot]').dataset.shot);
      shot.done = el.checked;
      touch(idea); save(); render();
      break;
    }
    case 'remove-shot': {
      const sid = el.closest('[data-shot]').dataset.shot;
      idea.shots = idea.shots.filter((s) => s.id !== sid);
      touch(idea); save(); render();
      break;
    }
    case 'link-inspo': sheetLinkInspo(idea); break;
    case 'unlink-inspo':
      idea.inspoIds = idea.inspoIds.filter((x) => x !== el.dataset.id);
      touch(idea); save(); render();
      break;
    case 'delete-idea':
      if (confirm('Delete this idea? This cannot be undone.')) {
        state.ideas = state.ideas.filter((i) => i.id !== idea.id);
        save();
        location.replace('#/ideas');
        toast('Idea deleted');
      }
      break;

    case 'paste-link': pasteLink(); break;
    case 'add-inspo': sheetAddInspo(); break;
    case 'inspo-tag': ui.inspoTag = el.dataset.id; render(); break;
    case 'inspo-to-idea': {
      const created = createIdea({ title: inspo.note || '', inspoIds: [inspo.id] });
      location.hash = '#/idea/' + created.id;
      setTimeout(() => $('.title-input')?.focus(), 50);
      break;
    }
    case 'delete-inspo':
      if (confirm('Delete this link? Ideas that use it will keep everything else.')) {
        state.inspo = state.inspo.filter((x) => x.id !== inspo.id);
        state.ideas.forEach((i) => { i.inspoIds = i.inspoIds.filter((x) => x !== inspo.id); });
        save();
        location.replace('#/inspo');
        toast('Link deleted');
      }
      break;

    case 'cal-prev': ui.calMonth = new Date(ui.calMonth.getFullYear(), ui.calMonth.getMonth() - 1, 1); render(); break;
    case 'cal-next': ui.calMonth = new Date(ui.calMonth.getFullYear(), ui.calMonth.getMonth() + 1, 1); render(); break;
    case 'cal-day': {
      ui.calSel = el.dataset.id;
      const d = parseISO(ui.calSel);
      ui.calMonth = new Date(d.getFullYear(), d.getMonth(), 1);
      render();
      break;
    }
    case 'schedule-existing': sheetScheduleExisting(ui.calSel); break;
    case 'new-idea-on-day': sheetNewIdea(ui.calSel); break;

    case 'theme': state.settings.theme = el.dataset.id; save(); applyTheme(); render(); break;
    case 'export': exportBackup(); break;
    case 'import': $('#import-file').click(); break;
    case 'erase':
      if (confirm('Erase ALL ideas and inspiration from this phone? Export a backup first if you might want them back.')) {
        state = normalize({ settings: state.settings });
        save();
        render();
        toast('All data erased');
      }
      break;
  }
});

document.addEventListener('input', (e) => {
  const el = e.target;
  const { view, id } = currentRoute();

  if (el.dataset.ui) {
    ui[el.dataset.ui] = el.value;
    rerenderList();
    return;
  }

  if (el.classList.contains('title-input')) autosize(el);

  if (view === 'idea') {
    const idea = getIdea(id);
    if (!idea) return;
    if (el.dataset.field) {
      idea[el.dataset.field] = el.dataset.field === 'postDate' ? (el.value || null) : el.value;
      touch(idea);
      saveSoon();
    } else if (el.hasAttribute('data-shot-text')) {
      const shot = idea.shots.find((s) => s.id === el.closest('[data-shot]').dataset.shot);
      shot.text = el.value;
      touch(idea);
      saveSoon();
    }
  }

  if (view === 'inspo' && id && el.dataset.inspoField) {
    const item = getInspo(id);
    if (!item) return;
    if (el.dataset.inspoField === 'tags') item.tags = parseTags(el.value);
    else item[el.dataset.inspoField] = el.value;
    saveSoon();
  }
});

document.addEventListener('change', (e) => {
  const el = e.target;
  if (el.id === 'import-file' && el.files[0]) {
    importBackup(el.files[0]);
    el.value = '';
  }
  // Re-render after the date picker closes so "Clear" shows up.
  if (el.dataset.field === 'postDate') {
    const idea = getIdea(currentRoute().id);
    if (idea && idea.postDate && idea.status === 'idea') idea.status = 'planned';
    save();
    render();
  }
});

// Enter in a shot field jumps to a new shot, like a checklist.
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.hasAttribute?.('data-shot-text')) {
    e.preventDefault();
    $('[data-action="add-shot"]')?.click();
  }
  if (e.key === 'Escape') closeSheet();
});

/* ---------------- Start ---------------- */

applyTheme();
if (!location.hash) location.replace('#/ideas');
render();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
navigator.storage?.persist?.().catch(() => {});
