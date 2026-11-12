'use strict';
/*
 * Finance Dashboard — an Obsidian plugin for tracking net worth, credit score,
 * spending, savings goals and retirement. Plain JavaScript, no build step.
 * All data is stored locally in this plugin's data.json inside your vault.
 */
const obsidian = require('obsidian');
const { Plugin, ItemView, Modal, FuzzySuggestModal, Notice, PluginSettingTab, Setting, normalizePath, setIcon: obsidianSetIcon } = obsidian;

/*
 * Obsidian bundles a specific Lucide icon set that varies by app version, and some newer icon names
 * (or renamed ones) don't exist in older builds. setIcon() tries each fallback until one renders,
 * so an unknown name never leaves a blank space.
 */
const ICON_FALLBACKS = {
  sunset: ['sunrise', 'sun', 'calendar'],
  'palm-tree': ['sunset', 'sun', 'calendar'],
  'calendar-clock': ['calendar'],
  'layout-dashboard': ['layout-grid', 'layout', 'home'],
  'sliders-horizontal': ['sliders', 'settings'],
  'settings-2': ['settings'],
  'plus-circle': ['circle-plus', 'plus'],
  'check-circle': ['circle-check', 'check'],
  'alert-triangle': ['triangle-alert', 'alert-circle', 'info'],
  'sticky-note': ['file-text', 'pencil'],
  banknote: ['dollar-sign', 'wallet'],
  'piggy-bank': ['wallet', 'landmark'],
  gauge: ['activity', 'bar-chart'],
  'trending-up': ['bar-chart', 'activity'],
  receipt: ['file-text', 'list'],
  'refresh-cw': ['rotate-cw', 'refresh-ccw'],
  sparkles: ['star', 'wand'],
  landmark: ['building', 'home'],
  'circle-help': ['help-circle', 'info'],
  'flask-conical': ['beaker', 'flask-round', 'sparkles'],
  'file-down': ['download', 'file-text'],
  copy: ['files', 'clipboard'],
  eye: ['view', 'check'],
  'eye-off': ['eye', 'minus'],
  lightbulb: ['sparkles', 'star'],
  calculator: ['sigma', 'hash'],
  'book-open': ['book', 'library'],
  'rotate-ccw': ['undo', 'refresh-ccw'],
  pause: ['circle-pause', 'pause-circle', 'square'],
  'notebook-pen': ['notebook', 'pencil', 'file-text'],
  coins: ['circle-dollar-sign', 'dollar-sign'],
  'shield-check': ['shield', 'check'],
  'heart-pulse': ['heart', 'activity'],
  car: ['truck', 'circle'],
  home: ['house', 'building'],
  'git-compare': ['arrow-left-right', 'repeat'],
  'list-checks': ['list-checks', 'list', 'check'],
  'calendar-check': ['calendar', 'check'],
  check: ['check-circle', 'circle-check'],
  'line-chart': ['chart-line', 'trending-up', 'activity'],
  history: ['clock', 'calendar'],
  'calendar-plus': ['calendar', 'plus'],
};
function setIcon(el, name) {
  for (const n of [name, ...(ICON_FALLBACKS[name] || [])]) {
    try { obsidianSetIcon(el, n); } catch (e) { /* try the next name */ }
    if (el.querySelector('svg')) return;
  }
}

const VIEW_TYPE = 'finance-dashboard-view';

const TABS = [
  { id: 'overview', label: 'Overview', icon: 'layout-dashboard' },
  { id: 'networth', label: 'Net Worth', icon: 'trending-up' },
  { id: 'investments', label: 'Investments', icon: 'line-chart' },
  { id: 'spending', label: 'Spending & Savings', icon: 'credit-card' },
  { id: 'retirement', label: 'Retirement', icon: 'sunset' },
];

const PALETTE = ['#4C78A8', '#F58518', '#54A24B', '#E45756', '#72B7B2', '#B279A2', '#EECA3B', '#9D755D', '#FF9DA6', '#79706E', '#2F8F9D', '#A0CBE8'];
const DEBIT_COLOR = '#4C78A8';
const CREDIT_COLOR = '#F58518';

const ACCOUNT_GROUPS = {
  budget: 'On-budget (checking, savings, cash)',
  investment: 'Investment (taxable)',
  retirement: 'Retirement',
  property: 'Property & other assets',
  debt: 'Debt / liability',
};

const KINDS_BY_GROUP = {
  budget: ['Checking', 'Savings', 'High-yield savings', 'Money market', 'Cash', 'Other'],
  investment: ['Brokerage', 'TOD Individual', 'Stocks', 'ETFs / index funds', 'Mutual funds', 'Bonds', 'CDs', 'Crypto', 'Other'],
  retirement: ['401(k)', 'Roth 401(k)', '403(b)', '457(b)', 'Traditional IRA', 'Rollover IRA', 'Roth IRA', 'SEP IRA', 'SIMPLE IRA', 'HSA', 'Pension', 'Other'],
  property: ['Home', 'Vehicle', 'Land', 'Rental property', 'Collectibles', 'Other'],
  debt: ['Credit card', 'Mortgage', 'Auto loan', 'Student loan', 'Personal loan', 'Line of credit', 'Medical debt', 'Other'],
};
const DEFAULT_CATEGORIES = [
  ['Housing', 0], ['Groceries', 0], ['Dining', 0], ['Transportation', 0], ['Utilities', 0],
  ['Insurance', 0], ['Health', 0], ['Shopping', 0], ['Entertainment', 0], ['Subscriptions', 0],
  ['Travel', 0], ['Personal care', 0], ['Gifts & donations', 0], ['Other', 0],
].map(([name, budget]) => ({ name, budget }));

function defaultData() {
  return {
    version: 1,
    settings: { currency: 'USD', locale: '', incomeView: 'net', filingStatus: 'single', link: { label: 'Finance dashboard', icon: 'wallet', image: '', style: 'card', size: 'medium', reuseTab: true },
      invest: { showTab: true, range: '12', view: 'total', estimateContrib: true },
      report: { name: '', months: '3', order: ['retirement', 'networth', 'investments', 'spending'] } },
    accounts: [],      // {id, name, group, kind, balance, contribution}
    history: [],       // {date:'YYYY-MM', assets, debts, net, retirement}
    invHistory: {},    // {'YYYY-MM': {accountId: balance}} — investment & retirement accounts, one entry per month
    cashHistory: {},   // {'YYYY-MM': {accountId: balance}} — on-budget (checking, savings, cash) accounts
    invMeta: {},       // {accountId: {name, group, kind}} — so history still has a name after an account is deleted
    credit: [],        // {id, date:'YYYY-MM-DD', score, bureau}
    transactions: [],  // {id, date, desc, amount, category, source:'debit'|'credit', card, note}
    incomeHistory: [], // {id, date, reason, employer, title, gross, net, note} — gross/net are guaranteed amounts PER MONTH
    extraIncome: [],   // {id, name, kind, gross, net, start, end, note} — additional monthly income on top of the job above
    balanceNotes: [],  // {id, date, text} — written with each "Update balances" (or added by hand)
    whatIf: { scenarios: [], selected: 'base' }, // retirement sandbox; never used by the dashboard's own numbers
    retirementNotes: { text: '', updated: null },
    taxRules: null,   // refreshed U.S. tax values (see DEFAULT_TAX_RULES); null = use built-in
    goals: [],         // {id, name, target, saved, deadline}
    categories: DEFAULT_CATEGORIES.map((c) => ({ ...c })),
    retirement: {
      birthDate: '1990-01-01', targetAge: 65, annualIncome: 60000, otherIncome: 0,
      withdrawalRate: 4, expectedReturn: 7, inflation: 2.5, includeInvestments: false,
    },
  };
}

/* ------------------------------------------------------------------ utils */

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const pad2 = (n) => String(n).padStart(2, '0');
const isoDate = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const todayISO = () => isoDate(new Date());
const monthKey = (d) => (typeof d === 'string' ? d.slice(0, 7) : isoDate(d).slice(0, 7));
const sum = (arr, f = (x) => x) => arr.reduce((s, x) => s + (Number(f(x)) || 0), 0);
const num = (v) => {
  if (typeof v === 'number') return v;
  const n = parseFloat(String(v == null ? '' : v).replace(/[^0-9.\-]/g, ''));
  return isFinite(n) ? n : 0;
};
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function addMonths(key, n) {
  const [y, m] = key.split('-').map(Number);
  return monthKey(new Date(y, m - 1 + n, 1));
}
function monthLabel(key, long) {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, long ? { month: 'long', year: 'numeric' } : { month: 'short', year: '2-digit' });
}
function dateLabel(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
function monthsBetween(fromDate, toDate) {
  return (toDate.getFullYear() - fromDate.getFullYear()) * 12 + (toDate.getMonth() - fromDate.getMonth()) + (toDate.getDate() - fromDate.getDate()) / 30.44;
}

class Fmt {
  constructor(settings) {
    const locale = settings.locale || undefined;
    const currency = settings.currency || 'USD';
    try {
      this.cur = new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 0 });
      this.cur2 = new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 });
      this.compactF = new Intl.NumberFormat(locale, { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1 });
    } catch (e) {
      this.cur = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
      this.cur2 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });
      this.compactF = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 });
    }
  }
  money(v) { return this.cur.format(Math.round(v || 0)); }
  cents(v) { return this.cur2.format(v || 0); }
  compact(v) { return Math.abs(v) < 1000 ? this.cur.format(v || 0) : this.compactF.format(v || 0); }
  pct(v, digits = 0) { return `${(v * 100).toFixed(digits)}%`; }
}

/* ------------------------------------------------------------ calculations */

function totals(data) {
  let assets = 0, debts = 0;
  const byGroup = {};
  for (const a of data.accounts) {
    const v = num(a.balance);
    if (a.group === 'debt') { debts += Math.abs(v); byGroup.debt = (byGroup.debt || 0) + Math.abs(v); }
    else { assets += v; byGroup[a.group] = (byGroup[a.group] || 0) + v; }
  }
  return { assets, debts, net: assets - debts, byGroup };
}

function upsertSnapshot(data) {
  if (!data.accounts.length) return;
  const t = totals(data);
  const key = monthKey(new Date());
  const entry = { date: key, assets: Math.round(t.assets), debts: Math.round(t.debts), net: Math.round(t.net), retirement: Math.round(t.byGroup.retirement || 0), cash: Math.round(t.byGroup.budget || 0) };
  const i = data.history.findIndex((h) => h.date === key);
  if (i >= 0) data.history[i] = entry; else data.history.push(entry);
  data.history.sort((a, b) => a.date.localeCompare(b.date));
  // Per-account balances for investment & retirement accounts (this month is always rewritten from current balances).
  if (!data.invHistory || typeof data.invHistory !== 'object') data.invHistory = {};
  if (!data.invMeta || typeof data.invMeta !== 'object') data.invMeta = {};
  const inv = data.accounts.filter(isInvAccount);
  for (const a of inv) data.invMeta[a.id] = { name: a.name, group: a.group, kind: a.kind || '' };
  if (inv.length) { const m = {}; for (const a of inv) m[a.id] = Math.round(num(a.balance) * 100) / 100; data.invHistory[key] = m; }
  else delete data.invHistory[key];
  // Same for on-budget accounts, so past months can be edited per account.
  if (!data.cashHistory || typeof data.cashHistory !== 'object') data.cashHistory = {};
  const cash = data.accounts.filter((a) => a.group === 'budget');
  for (const a of cash) data.invMeta[a.id] = { name: a.name, group: a.group, kind: a.kind || '' };
  if (cash.length) { const m = {}; for (const a of cash) m[a.id] = Math.round(num(a.balance) * 100) / 100; data.cashHistory[key] = m; }
  else delete data.cashHistory[key];
}
const isInvAccount = (a) => a.group === 'investment' || a.group === 'retirement';
const invTabShown = (data) => !(data.settings && data.settings.invest && data.settings.invest.showTab === false);

function ageOn(birthISO, date) {
  const [y, m, d] = (birthISO || '1990-01-01').split('-').map(Number);
  return (date - new Date(y, (m || 1) - 1, d || 1)) / (365.2425 * 864e5);
}

function retirementPlan(data) {
  const r = data.retirement;
  const accounts = data.accounts.filter((a) => a.group === 'retirement' || (r.includeInvestments && a.group === 'investment'));
  const balance = sum(accounts, (a) => a.balance);
  const contribution = sum(accounts, (a) => a.contribution);
  const nominal = num(r.expectedReturn) / 100;
  const inflation = num(r.inflation) / 100;
  const real = (1 + nominal) / (1 + inflation) - 1;          // projections are in today's dollars
  const need = Math.max(0, num(r.annualIncome) - num(r.otherIncome));
  const wr = num(r.withdrawalRate) / 100;
  const target = wr > 0 ? need / wr : 0;
  const now = new Date();
  const age = ageOn(r.birthDate, now);
  const targetAge = num(r.targetAge);
  const rm = Math.pow(1 + real, 1 / 12) - 1;
  const cm = contribution / 12;
  const fv = (n) => {
    const g = Math.pow(1 + rm, n);
    return balance * g + (rm === 0 ? cm * n : cm * (g - 1) / rm);
  };

  // Year-by-year projection out to age 100
  const points = [];
  const maxMonths = Math.max(12, Math.ceil((100 - age) * 12));
  let hitMonth = target > 0 && balance >= target ? 0 : null;
  let B = balance;
  points.push({ age, balance: B });
  for (let m = 1; m <= maxMonths; m++) {
    B = B * (1 + rm) + cm;
    if (hitMonth === null && target > 0 && B >= target) hitMonth = m;
    if (m % 12 === 0) points.push({ age: age + m / 12, balance: B });
  }

  const nTarget = Math.max(0, Math.round((targetAge - age) * 12));
  const projectedAtTarget = fv(nTarget);
  let requiredContribution = 0;
  if (nTarget > 0) {
    const g = Math.pow(1 + rm, nTarget);
    const gap = target - balance * g;
    requiredContribution = gap <= 0 ? 0 : (rm === 0 ? gap / nTarget : gap * rm / (g - 1)) * 12;
  } else {
    requiredContribution = Math.max(0, target - balance);
  }
  const estAge = hitMonth === null ? null : age + hitMonth / 12;
  let estDate = null;
  if (hitMonth !== null) { estDate = new Date(now.getFullYear(), now.getMonth() + hitMonth, 1); }
  const ratio = target > 0 ? projectedAtTarget / target : 1;
  const status = ratio >= 1 ? 'on-track' : ratio >= 0.85 ? 'close' : 'behind';
  const sustainableIncome = projectedAtTarget * wr + num(r.otherIncome);
  return { accounts, balance, contribution, real, need, target, age, targetAge, points, projectedAtTarget,
    requiredContribution, estAge, estDate, ratio, status, progress: target > 0 ? balance / target : 0, sustainableIncome };
}

const STATUS_TEXT = { 'on-track': 'On track', close: 'Slightly behind', behind: 'Off track' };

function txFor(data, key, source = 'all') {
  return data.transactions.filter((t) => t.date && t.date.startsWith(key) && (source === 'all' || t.source === source));
}
function byCategory(txs) {
  const map = new Map();
  for (const t of txs) {
    const c = t.category || 'Other';
    if (!map.has(c)) map.set(c, { name: c, debit: 0, credit: 0, total: 0, count: 0 });
    const e = map.get(c);
    const a = Math.abs(num(t.amount));
    e[t.source === 'credit' ? 'credit' : 'debit'] += a;
    e.total += a; e.count++;
  }
  return [...map.values()].sort((a, b) => b.total - a.total);
}
function budgetFor(data, name) {
  const c = data.categories.find((x) => x.name === name);
  return c ? num(c.budget) : 0;
}
function goalInfo(g) {
  const target = num(g.target), saved = num(g.saved);
  const remaining = Math.max(0, target - saved);
  let monthly = null, monthsLeft = null, onPace = null;
  if (g.deadline) {
    const [y, m, d] = g.deadline.split('-').map(Number);
    monthsLeft = monthsBetween(new Date(), new Date(y, m - 1, d));
    monthly = monthsLeft > 0 ? remaining / monthsLeft : remaining;
  }
  if (g.created && g.deadline && remaining > 0) {
    const [y1, m1, d1] = g.created.split('-').map(Number);
    const [y2, m2, d2] = g.deadline.split('-').map(Number);
    const total = monthsBetween(new Date(y1, m1 - 1, d1), new Date(y2, m2 - 1, d2));
    const elapsed = monthsBetween(new Date(y1, m1 - 1, d1), new Date());
    if (total > 0) onPace = saved / target >= clamp(elapsed / total, 0, 1) - 0.05;
  }
  return { target, saved, remaining, progress: target > 0 ? clamp(saved / target, 0, 1) : 0, monthly, monthsLeft, onPace, done: remaining <= 0 };
}
const CHANGE_REASONS = ['Starting income', 'Raise', 'Promotion', 'New job', 'Cost-of-living adjustment', 'Pay cut', 'Hours change', 'Other'];
const PAY_FREQ = { weekly: { label: 'Weekly', n: 52 }, biweekly: { label: 'Every two weeks', n: 26 }, semimonthly: { label: 'Twice a month', n: 24 }, monthly: { label: 'Monthly', n: 12 } };

/**
 * Income is a fixed, guaranteed amount per month that stays in effect until the next change
 * (raise, promotion, new job…). Returns the change in effect on a date, the one before it, and any future-dated change.
 */
function incomeOn(data, iso) {
  const hist = [...(data.incomeHistory || [])].sort((a, b) => a.date.localeCompare(b.date));
  let cur = null, prev = null;
  for (const h of hist) if (h.date <= iso) { prev = cur; cur = h; }
  return { cur, prev, upcoming: hist.find((h) => h.date > iso) || null, hist };
}
const EXTRA_KINDS = ['Side job', 'Freelance / gig work', 'Rental income', 'Dividends & interest', 'Pension / annuity', 'Social Security', 'Child support / alimony', 'Other'];
/** Additional income sources active on a date (start ≤ date ≤ end). */
function extraIncomeOn(data, iso) {
  return (data.extraIncome || []).filter((x) => (!x.start || x.start <= iso) && (!x.end || x.end >= iso));
}
/** Job income plus every additional source in effect on a date, all per month. */
function totalIncomeOn(data, iso) {
  const { cur } = incomeOn(data, iso);
  const extras = extraIncomeOn(data, iso);
  const pg = cur ? num(cur.gross) : 0, pn = cur ? num(cur.net) : 0;
  return { cur, extras, primaryGross: pg, primaryNet: pn, gross: pg + sum(extras, (x) => x.gross), net: pn + sum(extras, (x) => x.net) };
}
/** Guaranteed monthly income in effect for a month (YYYY-MM), using what's in effect at month end. */
function monthlyIncome(data, key) {
  const [y, m] = key.split('-').map(Number);
  const t = totalIncomeOn(data, isoDate(new Date(y, m, 0)));
  return { gross: t.gross, net: t.net };
}

/** Every note that belongs to a month: balance-update notes, transaction notes and income notes. */
function notesFor(data, key, f) {
  const items = [];
  for (const n of data.balanceNotes || []) if (n.date && n.date.startsWith(key)) items.push({ kind: 'balance', date: n.date, title: 'Balance update', text: n.text, ref: n });
  for (const t of data.transactions) if (t.note && t.date && t.date.startsWith(key)) items.push({ kind: 'transaction', date: t.date, title: `${t.desc || t.category} · ${f.cents(num(t.amount))}`, text: t.note, ref: t });
  for (const h of data.incomeHistory || []) if (h.note && h.date && h.date.startsWith(key)) items.push({ kind: 'income', date: h.date, title: `${h.reason || 'Income change'}${h.employer ? ' · ' + h.employer : ''} · ${f.money(num(h.net))}/mo net`, text: h.note, ref: h });
  const order = { balance: 0, income: 1, transaction: 2 };
  return items.sort((a, b) => b.date.localeCompare(a.date) || order[a.kind] - order[b.kind]);
}
function noteMonths(data) {
  const keys = new Set();
  (data.balanceNotes || []).forEach((n) => n.date && keys.add(n.date.slice(0, 7)));
  data.transactions.forEach((t) => t.note && t.date && keys.add(t.date.slice(0, 7)));
  (data.incomeHistory || []).forEach((h) => h.note && h.date && keys.add(h.date.slice(0, 7)));
  return [...keys].sort().reverse();
}

function creditBand(score) {
  if (score >= 800) return 'Exceptional';
  if (score >= 740) return 'Very good';
  if (score >= 670) return 'Good';
  if (score >= 580) return 'Fair';
  return 'Poor';
}

/* ------------------------------------------------------------------ charts */

const SVGNS = 'http://www.w3.org/2000/svg';
function svgEl(parent, tag, attrs, text) {
  const el = document.createElementNS(SVGNS, tag);
  if (attrs) for (const k in attrs) if (attrs[k] != null) el.setAttribute(k, attrs[k]);
  if (text != null) el.textContent = text;
  if (parent) parent.appendChild(el);
  return el;
}
function niceScale(min, max, ticks = 4) {
  if (!isFinite(min) || !isFinite(max)) { min = 0; max = 1; }
  if (min === max) { const d = Math.abs(min) * 0.1 || 1; min -= d; max += d; }
  const step0 = (max - min) / ticks;
  const mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const norm = step0 / mag;
  const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
  return { min: Math.floor(min / step) * step, max: Math.ceil(max / step) * step, step };
}
function chartWidth(parent) {
  const w = parent && parent.clientWidth;
  return w && w > 200 ? Math.round(w) : 640;
}
function emptyState(parent, text) {
  parent.createDiv({ cls: 'fd-empty', text: text || 'No data yet' });
}
const pctText = (v, d = 0) => `${(v * 100).toFixed(d)}%`;
const signed = (v, fmt) => (v > 0 ? '+' : v < 0 ? '−' : '±') + fmt(Math.abs(v));

/* ---------------------------------------------------------------- tooltip */

/**
 * One floating tooltip shared by every chart. Content: {key, title, rows:[{label,value,color,strong,tone,muted}], foot}.
 * Rows are rebuilt only when `key` changes, so moving the pointer within one data point just repositions it.
 */
const Tip = {
  el: null,
  key: null,
  ensure(doc) {
    if (!this.el || this.el.ownerDocument !== doc || !this.el.isConnected) {
      if (this.el) this.el.remove();
      this.el = doc.body.createDiv({ cls: 'fd-tooltip', attr: { role: 'tooltip' } });
      this.key = null;
    }
    return this.el;
  },
  show(e, c) {
    const doc = (e.target && e.target.ownerDocument) || document;
    const el = this.ensure(doc);
    if (c.key == null || c.key !== this.key) {
      this.key = c.key;
      el.empty();
      el.toggleClass('is-wide', !!c.wide);
      if (c.title) el.createDiv({ cls: 'fd-tip-title', text: c.title });
      for (const p of c.body ? [].concat(c.body) : []) el.createDiv({ cls: 'fd-tip-body', text: p });
      if (c.calc) {
        const b = el.createDiv({ cls: 'fd-tip-calc' });
        b.createDiv({ cls: 'fd-tip-calc-label', text: c.calcLabel || 'In your plan' });
        b.createDiv({ text: c.calc });
      }
      for (const r of c.rows || []) {
        const row = el.createDiv({ cls: 'fd-tip-row' + (r.strong ? ' is-strong' : '') + (r.muted ? ' is-muted' : '') });
        const l = row.createSpan({ cls: 'fd-tip-label' });
        if (r.color) l.createSpan({ cls: 'fd-swatch' }).style.setProperty('--sw', r.color);
        l.createSpan({ text: r.label });
        row.createSpan({ cls: 'fd-tip-val' + (r.tone ? ' is-' + r.tone : ''), text: r.value });
      }
      if (c.foot && c.foot.length) {
        const ft = el.createDiv({ cls: 'fd-tip-foot' });
        for (const line of Array.isArray(c.foot) ? c.foot : [c.foot]) ft.createDiv({ text: line });
      }
    }
    el.addClass('is-visible');
    const win = doc.defaultView || window;
    const pad = 14, w = el.offsetWidth, h = el.offsetHeight;
    let x = e.clientX + pad, y = e.clientY + pad;
    if (x + w > win.innerWidth - 8) x = e.clientX - w - pad;
    if (y + h > win.innerHeight - 8) y = e.clientY - h - pad;
    el.style.left = `${Math.max(8, x)}px`;
    el.style.top = `${Math.max(8, y)}px`;
  },
  hide() { if (this.el) this.el.removeClass('is-visible'); this.key = null; },
  destroy() { if (this.el) this.el.remove(); this.el = null; this.key = null; },
};

/** Attach hover (and tap) behaviour: fn(event) returns tooltip content or null. */
function hover(target, fn, onLeave) {
  const move = (e) => { const c = fn(e); if (c) Tip.show(e, c); else Tip.hide(); };
  target.addEventListener('pointermove', move);
  target.addEventListener('pointerdown', move);
  target.addEventListener('pointerleave', () => { Tip.hide(); if (onLeave) onLeave(); });
}
const setCls = (el, cls, on) => el.classList.toggle(cls, !!on);

/**
 * Line chart. opts: labels[], series[{name,color,values[],dashed,area,noDots}], fmt(v) axis, tipFmt(v) tooltip,
 * yMin, yMax, bands[], hlines[], vlines[], height, tipTitle(i), tipExtra(i)→rows, changeTone ('up-good'|'down-good')
 */
function lineChart(parent, opts) {
  const labels = opts.labels || [];
  const series = (opts.series || []).filter((s) => s.values && s.values.some((v) => v != null));
  if (!labels.length || !series.length) return emptyState(parent, opts.emptyText);
  const W = opts.width || chartWidth(parent), H = opts.height || 240;
  const P = { l: opts.padLeft || 58, r: 14, t: 12, b: 26 };
  const all = [];
  series.forEach((s) => s.values.forEach((v) => v != null && all.push(v)));
  (opts.hlines || []).forEach((h) => all.push(h.value));
  const lo = opts.yMin != null ? opts.yMin : Math.min(...all);
  const hi = opts.yMax != null ? opts.yMax : Math.max(...all);
  const sc = (opts.yMin != null && opts.yMax != null) ? { min: lo, max: hi, step: opts.yStep || (hi - lo) / 4 } : niceScale(lo, hi);
  if (opts.zeroBased && sc.min > 0) sc.min = 0;
  const x = (i) => P.l + (labels.length === 1 ? (W - P.l - P.r) / 2 : (i * (W - P.l - P.r)) / (labels.length - 1));
  const y = (v) => P.t + (1 - (v - sc.min) / (sc.max - sc.min)) * (H - P.t - P.b);
  const fmt = opts.fmt || ((v) => String(v));
  const tf = opts.tipFmt || fmt;

  const wrap = parent.createDiv({ cls: 'fd-chart' });
  const svg = svgEl(wrap, 'svg', { viewBox: `0 0 ${W} ${H}`, class: 'fd-svg', role: 'img', 'aria-label': opts.title || 'Line chart' });

  for (const b of opts.bands || []) {
    const top = y(Math.min(b.to, sc.max)), bot = y(Math.max(b.from, sc.min));
    if (bot <= top) continue;
    svgEl(svg, 'rect', { x: P.l, y: top, width: W - P.l - P.r, height: bot - top, fill: b.color, opacity: 0.09 });
    if (b.label) svgEl(svg, 'text', { x: W - P.r - 4, y: top + 12, 'text-anchor': 'end', class: 'fd-band-label' }, b.label);
  }
  for (let v = sc.min; v <= sc.max + sc.step / 2; v += sc.step) {
    svgEl(svg, 'line', { x1: P.l, x2: W - P.r, y1: y(v), y2: y(v), class: 'fd-gridline' });
    svgEl(svg, 'text', { x: P.l - 8, y: y(v) + 4, 'text-anchor': 'end', class: 'fd-axis' }, fmt(v));
  }
  const maxX = Math.max(2, Math.min(opts.maxXLabels || 8, Math.floor((W - P.l - P.r) / 72)));
  const every = Math.max(1, Math.ceil(labels.length / maxX));
  labels.forEach((l, i) => {
    if (i % every !== 0 && i !== labels.length - 1) return;
    if (i !== labels.length - 1 && labels.length - 1 - i < every) return;
    svgEl(svg, 'text', { x: x(i), y: H - 6, 'text-anchor': i === 0 && labels.length > 1 ? 'start' : i === labels.length - 1 && labels.length > 1 ? 'end' : 'middle', class: 'fd-axis' }, l);
  });
  for (const h of opts.hlines || []) {
    svgEl(svg, 'line', { x1: P.l, x2: W - P.r, y1: y(h.value), y2: y(h.value), class: 'fd-hline', style: h.color ? `stroke:${h.color}` : null });
    if (h.label) svgEl(svg, 'text', { x: P.l + 6, y: y(h.value) - 6, class: 'fd-ref-label', style: h.color ? `fill:${h.color}` : null }, h.label);
  }
  (opts.vlines || []).forEach((v, k) => {
    if (v.index < 0 || v.index > labels.length - 1) return;
    svgEl(svg, 'line', { x1: x(v.index), x2: x(v.index), y1: P.t, y2: H - P.b, class: 'fd-vline' });
    const right = x(v.index) < W * 0.82;
    if (v.label) svgEl(svg, 'text', { x: x(v.index) + (right ? 6 : -6), y: P.t + 12 + k * 15, 'text-anchor': right ? 'start' : 'end', class: 'fd-ref-label' }, v.label);
  });
  for (const s of series) {
    const pts = s.values.map((v, i) => (v == null ? null : [x(i), y(v)])).filter(Boolean);
    const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('');
    if (s.area && pts.length > 1) {
      const base = y(Math.max(sc.min, 0));
      svgEl(svg, 'path', { d: `${d}L${pts[pts.length - 1][0]},${base}L${pts[0][0]},${base}Z`, fill: s.color, opacity: 0.12 });
    }
    svgEl(svg, 'path', { d, fill: 'none', stroke: s.color, 'stroke-width': 2.25, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', 'stroke-dasharray': s.dashed ? '6 5' : null });
    if (pts.length <= 40 && !s.noDots) for (const p of pts) svgEl(svg, 'circle', { cx: p[0], cy: p[1], r: 3, fill: s.color, class: 'fd-dot' });
  }

  // Small dots on the x-axis mark months that have notes.
  for (const i of opts.markers || []) {
    if (i < 0 || i > labels.length - 1) continue;
    svgEl(svg, 'circle', { cx: x(i), cy: H - P.b, r: 3.5, class: 'fd-note-marker' });
  }
  // Hover layer: crosshair snaps to the nearest point and lists every series' value there.
  const cross = svgEl(svg, 'line', { y1: P.t, y2: H - P.b, class: 'fd-crosshair', style: 'display:none' });
  const hoverDots = series.map((s) => svgEl(svg, 'circle', { r: 5, fill: s.color, class: 'fd-hover-dot', style: 'display:none' }));
  const hit = svgEl(svg, 'rect', { x: P.l - 8, y: 0, width: W - P.l - P.r + 16, height: H - P.b, fill: 'transparent', class: 'fd-hit' });
  const step = labels.length > 1 ? (W - P.l - P.r) / (labels.length - 1) : 1;
  hover(hit, (e) => {
    const r = svg.getBoundingClientRect();
    const mx = (e.clientX - r.left) * (W / r.width);
    const i = labels.length === 1 ? 0 : clamp(Math.round((mx - P.l) / step), 0, labels.length - 1);
    cross.setAttribute('x1', x(i)); cross.setAttribute('x2', x(i)); cross.style.display = '';
    series.forEach((s, k) => {
      const v = s.values[i], dot = hoverDots[k];
      if (v == null) { dot.style.display = 'none'; return; }
      dot.setAttribute('cx', x(i)); dot.setAttribute('cy', y(v)); dot.style.display = '';
    });
    const rows = series.filter((s) => s.values[i] != null)
      .map((s, k) => ({ label: s.name || 'Value', value: tf(s.values[i]), color: s.color, strong: k === 0 && series.length > 1 }));
    if (opts.tipExtra) rows.push(...(opts.tipExtra(i) || []));
    else {
      const s0 = series[0];
      if (i > 0 && s0.values[i] != null && s0.values[i - 1] != null) {
        const dv = s0.values[i] - s0.values[i - 1];
        rows.push({ label: `Change vs ${labels[i - 1]}`, value: signed(dv, tf), tone: dv === 0 ? null : (dv > 0) === (opts.changeTone !== 'down-good') ? 'good' : 'bad', muted: true });
      }
      const first = s0.values.findIndex((v) => v != null);
      if (i > first + 1 && s0.values[first]) {
        const dv = s0.values[i] - s0.values[first];
        rows.push({ label: `Since ${labels[first]}`, value: `${signed(dv, tf)} (${signed(dv / Math.abs(s0.values[first]), (v) => pctText(v, 1))})`, muted: true });
      }
    }
    return { key: `${i}`, title: opts.tipTitle ? opts.tipTitle(i) : labels[i], rows, foot: opts.tipFoot ? opts.tipFoot(i) : null };
  }, () => { cross.style.display = 'none'; hoverDots.forEach((d) => { d.style.display = 'none'; }); });
  if (opts.onPick) {
    hit.style.cursor = 'pointer';
    hit.addEventListener('click', (e) => {
      const r = svg.getBoundingClientRect();
      const mx = (e.clientX - r.left) * (W / r.width);
      opts.onPick(labels.length === 1 ? 0 : clamp(Math.round((mx - P.l) / step), 0, labels.length - 1));
    });
  }

  if (series.length > 1 || opts.legend) legend(wrap, series.map((s) => ({ label: s.name, color: s.color, dashed: s.dashed })));
  return wrap;
}

function legend(parent, items) {
  const l = parent.createDiv({ cls: 'fd-legend' });
  for (const it of items) {
    const i = l.createDiv({ cls: 'fd-legend-item' });
    const sw = i.createSpan({ cls: 'fd-swatch' + (it.dashed ? ' is-dashed' : '') });
    sw.style.setProperty('--sw', it.color);
    i.createSpan({ text: it.label });
  }
}

/** Donut chart with side legend. items[{label,value,color,extra:[rows]}]. Hover a slice or legend row for details. */
function donutChart(parent, items, opts = {}) {
  items = items.filter((i) => i.value > 0);
  const total = sum(items, (i) => i.value);
  if (!items.length || total <= 0) return emptyState(parent, opts.emptyText);
  const fmt = opts.fmt || ((v) => String(v));
  const wrap = parent.createDiv({ cls: 'fd-donut-wrap' + (opts.legendBelow ? ' is-stacked' : '') });
  const size = 180, R = 84, r = 56, cx = 90, cy = 90;
  const svg = svgEl(wrap.createDiv({ cls: 'fd-donut' }), 'svg', { viewBox: `0 0 ${size} ${size}`, class: 'fd-svg', role: 'img', 'aria-label': opts.title || 'Donut chart' });
  const slices = [];
  let a0 = -Math.PI / 2;
  const gap = items.length > 1 ? 0.012 : 0;
  for (const it of items) {
    const frac = it.value / total;
    const a1 = a0 + frac * Math.PI * 2;
    const g = svgEl(svg, 'g', { class: 'fd-slice' });
    if (frac >= 0.9999) {
      svgEl(g, 'circle', { cx, cy, r: (R + r) / 2, fill: 'none', stroke: it.color, 'stroke-width': R - r });
    } else {
      const s = a0 + gap, e = a1 - gap;
      const large = e - s > Math.PI ? 1 : 0;
      const p = (rad, ang) => `${(cx + rad * Math.cos(ang)).toFixed(2)},${(cy + rad * Math.sin(ang)).toFixed(2)}`;
      svgEl(g, 'path', { d: `M${p(R, s)}A${R},${R} 0 ${large} 1 ${p(R, e)}L${p(r, e)}A${r},${r} 0 ${large} 0 ${p(r, s)}Z`, fill: it.color });
    }
    slices.push(g);
    a0 = a1;
  }
  const centerText = opts.center != null ? opts.center : fmt(total);
  const centerSub = opts.sub || 'Total';
  const tTotal = svgEl(svg, 'text', { x: cx, y: cy + 2, 'text-anchor': 'middle', class: 'fd-donut-total' }, centerText);
  const tSub = svgEl(svg, 'text', { x: cx, y: cy + 20, 'text-anchor': 'middle', class: 'fd-donut-sub' }, centerSub);

  const lg = wrap.createDiv({ cls: 'fd-donut-legend' });
  const rows = items.map((it) => {
    const row = lg.createDiv({ cls: 'fd-dl-row' });
    row.createSpan({ cls: 'fd-swatch' }).style.setProperty('--sw', it.color);
    row.createSpan({ cls: 'fd-dl-label', text: it.label });
    row.createSpan({ cls: 'fd-dl-val', text: fmt(it.value) });
    row.createSpan({ cls: 'fd-dl-pct', text: pctText(it.value / total) });
    return row;
  });
  const ranked = items.map((it, i) => i).sort((a, b) => items[b].value - items[a].value);
  const activate = (idx) => {
    setCls(wrap, 'is-hovering', true);
    slices.forEach((g, j) => setCls(g, 'is-active', j === idx));
    rows.forEach((rw, j) => setCls(rw, 'is-active', j === idx));
    tTotal.textContent = (opts.compactFmt || fmt)(items[idx].value);
    tSub.textContent = pctText(items[idx].value / total, 1);
  };
  const reset = () => {
    setCls(wrap, 'is-hovering', false);
    slices.forEach((g) => setCls(g, 'is-active', false));
    rows.forEach((rw) => setCls(rw, 'is-active', false));
    tTotal.textContent = centerText; tSub.textContent = centerSub;
  };
  const tip = (idx) => {
    const it = items[idx];
    return { key: `d${idx}`, title: it.label, rows: [
      { label: 'Amount', value: fmt(it.value), color: it.color, strong: true },
      { label: 'Share', value: pctText(it.value / total, 1) },
      { label: 'Rank', value: `${ranked.indexOf(idx) + 1} of ${items.length}`, muted: true },
      ...(it.extra || []),
    ], foot: `${opts.sub ? opts.sub[0].toUpperCase() + opts.sub.slice(1) : 'Total'}: ${fmt(total)}` };
  };
  items.forEach((_, idx) => {
    hover(slices[idx], () => { activate(idx); return tip(idx); }, reset);
    hover(rows[idx], () => { activate(idx); return tip(idx); }, reset);
  });
  return wrap;
}

/** Horizontal bars, optionally stacked with a budget marker. rows[{label,segments[{value,color,name}],marker,extra:[rows]}] */
function hbarChart(parent, rows, opts = {}) {
  if (!rows.length) return emptyState(parent, opts.emptyText);
  const fmt = opts.fmt || ((v) => String(v));
  const max = Math.max(...rows.map((r) => Math.max(sum(r.segments, (s) => s.value), r.marker || 0))) || 1;
  const grand = sum(rows, (r) => sum(r.segments, (s) => s.value));
  const wrap = parent.createDiv({ cls: 'fd-hbars' });
  rows.forEach((r, ri) => {
    const total = sum(r.segments, (s) => s.value);
    const row = wrap.createDiv({ cls: 'fd-hbar-row' });
    row.createDiv({ cls: 'fd-hbar-label', text: r.label });
    const track = row.createDiv({ cls: 'fd-hbar-track' });
    for (const s of r.segments) {
      if (s.value <= 0) continue;
      const seg = track.createDiv({ cls: 'fd-hbar-seg' });
      seg.style.width = `${(s.value / max) * 100}%`;
      seg.style.background = s.color;
    }
    if (r.marker) track.createDiv({ cls: 'fd-hbar-marker' }).style.left = `${(r.marker / max) * 100}%`;
    const val = row.createDiv({ cls: 'fd-hbar-val' });
    val.createSpan({ text: fmt(total) });
    if (r.marker) val.createSpan({ cls: 'fd-hbar-budget' + (total > r.marker ? ' is-over' : ''), text: ` / ${fmt(r.marker)}` });

    hover(row, () => {
      const tipRows = [];
      const parts = r.segments.filter((s) => s.value > 0);
      if (parts.length > 1) for (const s of parts) tipRows.push({ label: s.name || 'Value', value: `${fmt(s.value)} · ${pctText(s.value / total)}`, color: s.color });
      tipRows.push({ label: 'Total', value: fmt(total), strong: true, color: parts.length === 1 ? parts[0].color : null });
      if (parts.length === 1 && parts[0].name) tipRows.push({ label: 'Paid with', value: parts[0].name });
      if (grand) tipRows.push({ label: opts.shareLabel || 'Share of total', value: pctText(total / grand, 1) });
      if (r.marker) {
        const left = r.marker - total;
        tipRows.push({ label: 'Budget', value: fmt(r.marker) });
        tipRows.push({ label: left >= 0 ? 'Remaining' : 'Over budget', value: `${fmt(Math.abs(left))} (${pctText(total / r.marker)} used)`, tone: left >= 0 ? 'good' : 'bad' });
      }
      if (r.extra) tipRows.push(...r.extra);
      return { key: `h${ri}`, title: r.label, rows: tipRows };
    });
  });
  return wrap;
}

/** Stacked column chart. labels[], series[{name,color,values[]}]. opts: refLine, refLabel, highlight, tipExtra(i) */
function columnChart(parent, labels, series, opts = {}) {
  const totalsArr = labels.map((_, i) => sum(series, (s) => s.values[i] || 0));
  if (!labels.length || Math.max(...totalsArr) <= 0) return emptyState(parent, opts.emptyText);
  const W = chartWidth(parent), H = opts.height || 220, P = { l: 58, r: 10, t: 14, b: 26 };
  const fmt = opts.fmt || ((v) => String(v));
  const tf = opts.tipFmt || fmt;
  const sc = niceScale(0, Math.max(...totalsArr, opts.refLine || 0));
  sc.min = 0;
  const y = (v) => P.t + (1 - v / sc.max) * (H - P.t - P.b);
  const bw = (W - P.l - P.r) / labels.length;
  const avg = sum(totalsArr) / labels.length;
  const wrap = parent.createDiv({ cls: 'fd-chart' });
  const svg = svgEl(wrap, 'svg', { viewBox: `0 0 ${W} ${H}`, class: 'fd-svg', role: 'img', 'aria-label': opts.title || 'Column chart' });
  for (let v = 0; v <= sc.max + sc.step / 2; v += sc.step) {
    svgEl(svg, 'line', { x1: P.l, x2: W - P.r, y1: y(v), y2: y(v), class: 'fd-gridline' });
    svgEl(svg, 'text', { x: P.l - 8, y: y(v) + 4, 'text-anchor': 'end', class: 'fd-axis' }, fmt(v));
  }
  const cols = labels.map((l, i) => {
    let acc = 0;
    const x0 = P.l + i * bw + bw * 0.2, w = bw * 0.6;
    const g = svgEl(svg, 'g', { class: 'fd-col' + (opts.highlight === i ? ' is-current' : '') });
    series.forEach((s, si) => {
      const v = s.values[i] || 0;
      if (v <= 0) return;
      const top = y(acc + v), bottom = y(acc);
      const isTop = series.slice(si + 1).every((s2) => !(s2.values[i] > 0));
      svgEl(g, 'rect', { x: x0, y: top, width: w, height: Math.max(0, bottom - top - (isTop ? 0 : 1)), fill: s.color, rx: isTop ? 3 : 0 });
      acc += v;
    });
    svgEl(svg, 'text', { x: x0 + w / 2, y: H - 6, 'text-anchor': 'middle', class: 'fd-axis' + (opts.highlight === i ? ' is-strong' : '') }, l);
    return g;
  });
  if (opts.refLine) {
    svgEl(svg, 'line', { x1: P.l, x2: W - P.r, y1: y(opts.refLine), y2: y(opts.refLine), class: 'fd-hline' });
    svgEl(svg, 'text', { x: W - P.r, y: y(opts.refLine) - 6, 'text-anchor': 'end', class: 'fd-ref-label' }, opts.refLabel || '');
  }
  // Full-height hit areas so hovering anywhere in a column's slot shows its stats.
  labels.forEach((l, i) => {
    const hit = svgEl(svg, 'rect', { x: P.l + i * bw, y: P.t, width: bw, height: H - P.t - P.b, fill: 'transparent', class: 'fd-hit' });
    hover(hit, () => {
      setCls(cols[i], 'is-hover', true);
      const t = totalsArr[i];
      const rows = [];
      if (series.length > 1) for (const s of series) rows.push({ label: s.name, value: `${tf(s.values[i] || 0)}${t ? ` · ${pctText((s.values[i] || 0) / t)}` : ''}`, color: s.color });
      rows.push({ label: opts.totalLabel || 'Total', value: tf(t), strong: true, color: series.length === 1 ? series[0].color : null });
      if (i > 0) { const dv = t - totalsArr[i - 1]; rows.push({ label: `vs ${labels[i - 1]}`, value: `${signed(dv, tf)}${totalsArr[i - 1] ? ` (${signed(dv / totalsArr[i - 1], (v) => pctText(v))})` : ''}`, tone: dv === 0 ? null : (dv < 0) !== !!opts.upGood ? 'good' : 'bad', muted: true }); }
      rows.push({ label: `${labels.length}-month average`, value: tf(avg), muted: true });
      if (opts.refLine && opts.refTip !== false) { const left = opts.refLine - t; rows.push({ label: left >= 0 ? 'Under budget' : 'Over budget', value: tf(Math.abs(left)), tone: left >= 0 ? 'good' : 'bad' }); }
      if (opts.tipExtra) rows.push(...(opts.tipExtra(i) || []));
      return { key: `c${i}`, title: opts.tipTitle ? opts.tipTitle(i) : l, rows };
    }, () => setCls(cols[i], 'is-hover', false));
  });
  if (series.length > 1) legend(wrap, series.map((s) => ({ label: s.name, color: s.color })));
  return wrap;
}

function ring(parent, frac, opts = {}) {
  const wrap = parent.createDiv({ cls: 'fd-ring' });
  const svg = svgEl(wrap, 'svg', { viewBox: '0 0 120 120', class: 'fd-svg', role: 'img', 'aria-label': opts.title || 'Progress' });
  const R = 50, C = 2 * Math.PI * R;
  svgEl(svg, 'circle', { cx: 60, cy: 60, r: R, class: 'fd-ring-track' });
  const f = clamp(frac, 0, 1);
  svgEl(svg, 'circle', { cx: 60, cy: 60, r: R, class: 'fd-ring-bar', style: `stroke:${opts.color || 'var(--interactive-accent)'}`,
    'stroke-dasharray': `${(f * C).toFixed(1)} ${C.toFixed(1)}`, transform: 'rotate(-90 60 60)' });
  svgEl(svg, 'text', { x: 60, y: 64, 'text-anchor': 'middle', class: 'fd-ring-text' }, opts.text || `${Math.round(frac * 100)}%`);
  if (opts.sub) svgEl(svg, 'text', { x: 60, y: 80, 'text-anchor': 'middle', class: 'fd-donut-sub' }, opts.sub);
  if (opts.tip) hover(wrap, () => opts.tip);
  return wrap;
}

function progressBar(parent, frac, opts = {}) {
  const bar = parent.createDiv({ cls: 'fd-progress' + (opts.cls ? ' ' + opts.cls : '') });
  const fill = bar.createDiv({ cls: 'fd-progress-fill' });
  fill.style.width = `${clamp(frac, 0, 1) * 100}%`;
  if (opts.color) fill.style.background = opts.color;
  if (opts.tip) { bar.addClass('has-tip'); hover(bar, () => opts.tip); }
  return bar;
}

/* ------------------------------------------------------------------- forms */

/**
 * Generic form modal. fields: [{key,label,type:'text'|'number'|'date'|'select'|'checkbox'|'textarea',
 * options:[{value,label}|string], required, placeholder, suggestions[], desc, step,
 * optionsFor(values) → options re-evaluated whenever another field changes (dependent dropdowns),
 * showIf(values) → bool to show/hide the field, labelFor(values) / descFor(values) → dynamic text}]
 * cfg.onChange(key, values, set) runs whenever a field changes; set(key, value) updates another field.
 * f.help = glossary key → (?) icon with a hover definition; cfg.helpCtx() supplies numbers for it.
 */
class FormModal extends Modal {
  constructor(app, cfg) { super(app); this.cfg = cfg; }
  onOpen() {
    const { cfg } = this;
    this.modalEl.addClass('fd-modal');
    this.titleEl.setText(cfg.title);
    this.contentEl.empty();
    if (cfg.intro) this.contentEl.createEl('p', { cls: 'fd-modal-intro', text: cfg.intro });
    const form = this.contentEl.createEl('form', { cls: 'fd-form' });
    const inputs = {};
    const rows = {};
    const labels = {};
    const descs = {};
    const values = cfg.values || {};
    const fillSelect = (el, options, want, keepCustom) => {
      el.empty();
      const opts = options.map((o) => (typeof o === 'string' ? { value: o, label: o } : o));
      // On first fill, keep a saved value that isn't in the list (e.g. a custom type from older data).
      if (keepCustom && want && !opts.some((o) => o.value === want)) opts.unshift({ value: want, label: want });
      for (const o of opts) el.createEl('option', { text: o.label, attr: { value: o.value } });
      el.value = want && opts.some((o) => o.value === want) ? want : (opts[0] ? opts[0].value : '');
    };
    for (const f of cfg.fields) {
      if (f.type === 'heading') { form.createEl('h4', { cls: 'fd-form-heading', text: f.label }); continue; }
      const row = form.createDiv({ cls: 'fd-field' + (f.type === 'checkbox' ? ' is-checkbox' : '') + (f.half ? ' is-half' : '') });
      const id = 'fd-' + uid();
      const lab = row.createEl('label', { attr: { for: id } });
      labels[f.key] = lab.createSpan({ text: f.label + (f.required ? ' *' : '') });
      if (f.help) helpIcon(lab, f.help, cfg.helpCtx);
      rows[f.key] = row;
      let el;
      const v = values[f.key] != null ? values[f.key] : f.default != null ? f.default : '';
      if (f.type === 'select') {
        el = row.createEl('select', { cls: 'dropdown', attr: { id } });
        fillSelect(el, f.optionsFor ? f.optionsFor(values) : f.options, v !== '' ? String(v) : '', true);
      } else if (f.type === 'textarea') {
        el = row.createEl('textarea', { attr: { id, rows: 3, placeholder: f.placeholder || '' } });
        el.value = v;
      } else if (f.type === 'checkbox') {
        el = row.createEl('input', { attr: { id, type: 'checkbox' } });
        el.checked = !!v;
      } else {
        el = row.createEl('input', { attr: { id, type: f.type === 'number' ? 'text' : (f.type || 'text'), placeholder: f.placeholder || '' } });
        if (f.type === 'number') el.setAttr('inputmode', 'decimal');
        if (f.suggestions && f.suggestions.length) {
          const listId = id + '-list';
          el.setAttr('list', listId);
          const dl = row.createEl('datalist', { attr: { id: listId } });
          for (const s of f.suggestions) dl.createEl('option', { attr: { value: s } });
        }
        el.value = v;
      }
      if (f.desc || f.descFor) descs[f.key] = row.createDiv({ cls: 'fd-field-desc', text: f.desc || '' });
      inputs[f.key] = el;
    }
    const current = () => {
      const o = {};
      for (const f of cfg.fields) if (inputs[f.key]) o[f.key] = f.type === 'checkbox' ? inputs[f.key].checked : inputs[f.key].value;
      return o;
    };
    const visible = (f) => !f.showIf || f.showIf(current());
    // Re-evaluate dependent options, visibility and labels whenever something changes.
    const sync = (changedKey) => {
      if (cfg.onChange && changedKey) cfg.onChange(changedKey, current(), (k, val) => { if (inputs[k]) inputs[k].value = val; });
      for (const f of cfg.fields) {
        if (!inputs[f.key]) continue;
        if (f.optionsFor && f.key !== changedKey) {
          const before = inputs[f.key].value;
          fillSelect(inputs[f.key], f.optionsFor(current()), before);
        }
      }
      const vals = current();
      for (const f of cfg.fields) {
        if (!rows[f.key]) continue;
        rows[f.key].style.display = f.showIf && !f.showIf(vals) ? 'none' : '';
        if (f.labelFor) labels[f.key].setText(f.labelFor(vals) + (f.required ? ' *' : ''));
        if (f.descFor && descs[f.key]) descs[f.key].setText(f.descFor(vals) || '');
      }
    };
    for (const f of cfg.fields) {
      if (!inputs[f.key]) continue;
      inputs[f.key].addEventListener('change', () => sync(f.key));
      if (f.type !== 'select' && f.type !== 'checkbox') inputs[f.key].addEventListener('input', () => sync(f.key));
    }
    sync(null);
    const err = form.createDiv({ cls: 'fd-form-error' });
    const btns = form.createDiv({ cls: 'fd-form-buttons' });
    if (cfg.onDelete) {
      const del = btns.createEl('button', { cls: 'mod-warning', text: 'Delete', attr: { type: 'button' } });
      del.addEventListener('click', async () => { await cfg.onDelete(); this.close(); });
    }
    btns.createDiv({ cls: 'fd-spacer' });
    const cancel = btns.createEl('button', { text: 'Cancel', attr: { type: 'button' } });
    cancel.addEventListener('click', () => this.close());
    btns.createEl('button', { cls: 'mod-cta', text: cfg.submitText || 'Save', attr: { type: 'submit' } });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const out = {};
      for (const f of cfg.fields) {
        if (f.type === 'heading') continue;
        const el = inputs[f.key];
        if (!visible(f)) { out[f.key] = f.hiddenValue !== undefined ? f.hiddenValue : null; continue; }
        let v = f.type === 'checkbox' ? el.checked : el.value.trim();
        if (f.required && (v === '' || v == null)) { err.setText(`${f.label} is required.`); el.focus(); return; }
        if (f.type === 'number') {
          if (v === '') v = f.optional ? null : 0;
          else {
            const n = num(v);
            if (!isFinite(n) || /[a-z]/i.test(String(v).replace(/[$€£¥,\s]/g, ''))) { err.setText(`${f.label} must be a number.`); el.focus(); return; }
            v = n;
          }
        }
        out[f.key] = v;
      }
      try {
        const res = await cfg.onSubmit(out);
        if (res === false) return;
        this.close();
      } catch (ex) { err.setText(String(ex && ex.message || ex)); }
    });
    const first = form.querySelector('input:not([type=checkbox]), select, textarea');
    if (first) setTimeout(() => first.focus(), 30);
  }
  onClose() { this.contentEl.empty(); }
}

class ConfirmModal extends Modal {
  constructor(app, title, message, onConfirm, cta = 'Confirm') { super(app); this.t = title; this.m = message; this.cb = onConfirm; this.cta = cta; }
  onOpen() {
    this.titleEl.setText(this.t);
    this.contentEl.createEl('p', { text: this.m });
    const b = this.contentEl.createDiv({ cls: 'fd-form-buttons' });
    b.createDiv({ cls: 'fd-spacer' });
    b.createEl('button', { text: 'Cancel' }).addEventListener('click', () => this.close());
    b.createEl('button', { cls: 'mod-warning', text: this.cta }).addEventListener('click', async () => { await this.cb(); this.close(); });
  }
  onClose() { this.contentEl.empty(); }
}

/* ---------------------------------------------------------------- CSV import */

function parseCSV(text) {
  const rows = [];
  let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ',' || c === '\t' || c === ';') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((x) => x.trim() !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((x) => x.trim() !== '')) rows.push(row);
  return rows;
}

function parseAnyDate(s) {
  s = String(s || '').trim();
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return `${m[1]}-${pad2(m[2])}-${pad2(m[3])}`;
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (m) {
    let y = Number(m[3]); if (y < 100) y += 2000;
    return `${y}-${pad2(m[1])}-${pad2(m[2])}`; // assumes month/day/year
  }
  const d = new Date(s);
  return isNaN(d) ? null : isoDate(d);
}

function importTransactions(data, text, defaults) {
  const rows = parseCSV(text);
  if (rows.length < 2) throw new Error('No rows found. Include a header row.');
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = (...names) => header.findIndex((h) => names.some((n) => h === n || h.includes(n)));
  const ci = {
    date: col('date', 'posted', 'transaction date'),
    desc: col('description', 'desc', 'payee', 'merchant', 'name', 'memo'),
    amount: col('amount', 'debit', 'value'),
    category: col('category'),
    source: col('source', 'card type', 'type', 'method'),
    card: col('card', 'account'),
    note: col('note', 'notes', 'comment'),
  };
  if (ci.date < 0 || ci.amount < 0) throw new Error('CSV needs at least "date" and "amount" columns.');
  let added = 0, skipped = 0;
  const existing = new Set(data.transactions.map((t) => `${t.date}|${num(t.amount).toFixed(2)}|${(t.desc || '').toLowerCase()}`));
  for (const r of rows.slice(1)) {
    const date = parseAnyDate(r[ci.date]);
    let amt = num(r[ci.amount]);
    if (!date || !amt) { skipped++; continue; }
    const rawCat = ci.category >= 0 ? (r[ci.category] || '').trim() : '';
    const note = ci.note >= 0 ? (r[ci.note] || '').trim() : '';
    // Income is tracked as a fixed monthly amount (Update income), so deposit rows are skipped.
    if (/^(income|paycheck|salary|payroll|deposit|direct deposit)$/i.test(rawCat)) { skipped++; continue; }
    if (defaults.sign === 'negative') { if (amt > 0) { skipped++; continue; } }
    else if (defaults.sign === 'positive') { if (amt < 0) { skipped++; continue; } }
    amt = Math.abs(amt);
    let category = ci.category >= 0 ? (r[ci.category] || '').trim() : '';
    if (/^(transfer|payment|credit card payment)$/i.test(category)) { skipped++; continue; }
    const known = data.categories.find((c) => c.name.toLowerCase() === category.toLowerCase());
    if (known) category = known.name;
    else if (category) data.categories.push({ name: category, budget: 0 });
    else category = 'Other';
    let source = defaults.source;
    if (ci.source >= 0) {
      const s = (r[ci.source] || '').toLowerCase();
      if (s.includes('credit')) source = 'credit'; else if (s.includes('debit')) source = 'debit';
    }
    const desc = ci.desc >= 0 ? (r[ci.desc] || '').trim() : '';
    const key = `${date}|${amt.toFixed(2)}|${desc.toLowerCase()}`;
    if (existing.has(key)) { skipped++; continue; }
    existing.add(key);
    data.transactions.push({ id: uid(), date, desc, amount: amt, category, source, card: ci.card >= 0 ? (r[ci.card] || '').trim() : defaults.card || '', note });
    added++;
  }
  return { added, skipped };
}

class ImportModal extends Modal {
  constructor(app, plugin) { super(app); this.plugin = plugin; }
  onOpen() {
    this.modalEl.addClass('fd-modal');
    this.titleEl.setText('Import transactions from CSV');
    const c = this.contentEl;
    c.createEl('p', { cls: 'fd-modal-intro', text: 'Columns recognized: date, description, amount, category, source (debit/credit), card, note. Only date and amount are required. Income/Paycheck deposits (income is set with Update income), Transfer/Payment rows and duplicates are skipped.' });
    const form = c.createDiv({ cls: 'fd-form' });
    const f1 = form.createDiv({ cls: 'fd-field' });
    f1.createEl('label', { text: 'CSV file' });
    const file = f1.createEl('input', { attr: { type: 'file', accept: '.csv,.tsv,.txt,text/csv' } });
    const f2 = form.createDiv({ cls: 'fd-field' });
    f2.createEl('label', { text: '…or paste CSV text' });
    const ta = f2.createEl('textarea', { attr: { rows: 6, placeholder: 'date,description,amount,category,source,card\n2026-11-02,Green Valley Market,-84.12,Groceries,credit,Visa' } });
    file.addEventListener('change', async () => { if (file.files && file.files[0]) ta.value = await file.files[0].text(); });
    const f3 = form.createDiv({ cls: 'fd-field is-half' });
    f3.createEl('label', { text: 'Default source (if no column)' });
    const src = f3.createEl('select', { cls: 'dropdown' });
    src.createEl('option', { text: 'Credit card', attr: { value: 'credit' } });
    src.createEl('option', { text: 'Debit card', attr: { value: 'debit' } });
    const f4 = form.createDiv({ cls: 'fd-field is-half' });
    f4.createEl('label', { text: 'Amount sign' });
    const sign = f4.createEl('select', { cls: 'dropdown' });
    sign.createEl('option', { text: 'Use absolute value', attr: { value: 'abs' } });
    sign.createEl('option', { text: 'Negative = spending (skip positives)', attr: { value: 'negative' } });
    sign.createEl('option', { text: 'Positive = spending (skip negatives)', attr: { value: 'positive' } });
    const f5 = form.createDiv({ cls: 'fd-field' });
    f5.createEl('label', { text: 'Card name (optional)' });
    const card = f5.createEl('input', { attr: { type: 'text', placeholder: 'e.g. Visa Signature' } });
    const err = form.createDiv({ cls: 'fd-form-error' });
    const b = form.createDiv({ cls: 'fd-form-buttons' });
    b.createDiv({ cls: 'fd-spacer' });
    b.createEl('button', { text: 'Cancel' }).addEventListener('click', () => this.close());
    b.createEl('button', { cls: 'mod-cta', text: 'Import' }).addEventListener('click', async () => {
      try {
        let res;
        await this.plugin.mutate((d) => { res = importTransactions(d, ta.value, { source: src.value, sign: sign.value, card: card.value.trim() }); });
        new Notice(`Imported ${res.added} transaction${res.added === 1 ? '' : 's'}${res.skipped ? `, skipped ${res.skipped}` : ''}.`);
        this.close();
      } catch (e) { err.setText(e.message); }
    });
  }
  onClose() { this.contentEl.empty(); }
}

/* ------------------------------------------------------- manage accounts */

const GROUP_ORDER = ['budget', 'investment', 'retirement', 'property', 'debt'];

/**
 * Account manager opened from the dashboard's gear icon: search/filter, add, edit, delete,
 * and edit balances or contributions inline. Stays open and refreshes as data changes.
 */
class AccountsModal extends Modal {
  constructor(app, plugin) {
    super(app);
    this.plugin = plugin;
    this.filter = 'all';
    this.query = '';
    this.suppress = false;
  }
  onOpen() {
    this.modalEl.addClass('fd-modal', 'fd-manage-modal');
    this.titleEl.setText('Manage accounts & assets');
    this.listener = () => { if (!this.suppress) { this.renderSummary(); this.renderList(); } };
    this.plugin.listeners.add(this.listener);
    const c = this.contentEl;
    c.empty();
    this.summaryEl = c.createDiv({ cls: 'fd-manage-summary' });
    this.pagesEl = c.createDiv({ cls: 'fd-manage-pages' });
    this.renderPages();
    const bar = c.createDiv({ cls: 'fd-manage-toolbar' });
    const search = bar.createEl('input', { cls: 'fd-manage-search', attr: { type: 'search', placeholder: 'Search accounts…', 'aria-label': 'Search accounts' } });
    search.addEventListener('input', () => { this.query = search.value.trim().toLowerCase(); this.renderList(); });
    const sel = bar.createEl('select', { cls: 'dropdown', attr: { 'aria-label': 'Filter by group' } });
    sel.createEl('option', { text: 'All groups', attr: { value: 'all' } });
    for (const g of GROUP_ORDER) sel.createEl('option', { text: ACCOUNT_GROUPS[g].split(' (')[0], attr: { value: g } });
    sel.addEventListener('change', () => { this.filter = sel.value; this.renderList(); });
    bar.createDiv({ cls: 'fd-spacer' });
    const past = bar.createEl('button', { cls: 'fd-btn', attr: { 'aria-label': 'Enter balances for a past month' } });
    setIcon(past.createSpan({ cls: 'fd-btn-icon' }), 'calendar-plus');
    past.createSpan({ text: 'Past balances' });
    past.addEventListener('click', () => this.plugin.editPastBalances());
    const add = bar.createEl('button', { cls: 'mod-cta fd-btn' });
    setIcon(add.createSpan({ cls: 'fd-btn-icon' }), 'plus');
    add.createSpan({ text: 'Add account' });
    add.addEventListener('click', () => this.plugin.editAccount(this.filter !== 'all' ? { group: this.filter } : null, true));
    this.listEl = c.createDiv({ cls: 'fd-manage-list' });
    const foot = c.createDiv({ cls: 'fd-manage-foot' });
    foot.createSpan({ cls: 'fd-muted', text: 'Tip: edit a balance or contribution right in the list — it saves when you press Enter or leave the field.' });
    const more = foot.createEl('button', { cls: 'fd-btn is-small' });
    setIcon(more.createSpan({ cls: 'fd-btn-icon' }), 'sliders-horizontal');
    more.createSpan({ text: 'Categories, currency & data' });
    more.addEventListener('click', () => { this.close(); this.plugin.openSettings(); });
    this.renderSummary();
    this.renderList();
    setTimeout(() => search.focus(), 30);
  }
  onClose() {
    this.plugin.listeners.delete(this.listener);
    this.contentEl.empty();
  }

  /** Dashboard pages that can be turned off (currently the Investments tab). */
  renderPages() {
    const el = this.pagesEl;
    el.empty();
    const p = this.plugin;
    const head = el.createDiv({ cls: 'fd-manage-group-head' });
    head.createSpan({ cls: 'fd-manage-group-name', text: 'Dashboard pages' });
    const row = el.createDiv({ cls: 'fd-manage-row fd-manage-toggle-row' });
    const name = row.createDiv({ cls: 'fd-manage-name' });
    const t = name.createDiv({ cls: 'fd-manage-title' });
    setIcon(t.createSpan({ cls: 'fd-btn-icon' }), 'line-chart');
    t.createSpan({ text: ' Investments tab' });
    name.createDiv({ cls: 'fd-muted fd-manage-kind', text: 'Growth charts for investment & retirement accounts. Hiding it keeps saving monthly history, so nothing is lost if you turn it back on.' });
    const on = invTabShown(p.data);
    const tg = row.createDiv({ cls: 'checkbox-container' + (on ? ' is-enabled' : ''), attr: { role: 'switch', tabindex: '0', 'aria-checked': String(on), 'aria-label': 'Show Investments tab' } });
    tg.createEl('input', { attr: { type: 'checkbox', tabindex: '-1' } }).checked = on;
    const flip = async () => {
      this.suppress = true;
      try { await p.setInvTabShown(!invTabShown(p.data)); } finally { this.suppress = false; }
      this.renderPages();
      new Notice(invTabShown(p.data) ? 'Investments tab shown.' : 'Investments tab hidden. Turn it back on here or in Settings.');
    };
    tg.addEventListener('click', flip);
    tg.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flip(); } });
  }

  renderSummary() {
    const f = new Fmt(this.plugin.data.settings);
    const t = totals(this.plugin.data);
    const el = this.summaryEl;
    el.empty();
    const stat = (label, value, cls) => {
      const s = el.createDiv({ cls: 'fd-manage-stat' + (cls ? ' ' + cls : '') });
      s.createDiv({ cls: 'fd-mini-label', text: label });
      s.createDiv({ cls: 'fd-mini-value', text: value });
    };
    stat('Accounts', String(this.plugin.data.accounts.length));
    stat('Assets', f.money(t.assets));
    stat('Debts', f.money(t.debts), 'is-neg');
    stat('Net worth', f.money(t.net), 'is-strong');
  }

  renderList() {
    const plugin = this.plugin;
    const f = new Fmt(plugin.data.settings);
    const el = this.listEl;
    el.empty();
    const q = this.query;
    const match = (a) => !q || (a.name || '').toLowerCase().includes(q) || (a.kind || '').toLowerCase().includes(q);
    const groups = this.filter === 'all' ? GROUP_ORDER : [this.filter];
    let shown = 0;
    for (const g of groups) {
      const list = plugin.data.accounts.filter((a) => a.group === g && match(a)).sort((a, b) => Math.abs(num(b.balance)) - Math.abs(num(a.balance)));
      if (!list.length && (q || this.filter === 'all')) continue;
      const sec = el.createDiv({ cls: 'fd-manage-group' });
      const head = sec.createDiv({ cls: 'fd-manage-group-head' });
      head.createSpan({ cls: 'fd-manage-group-name', text: ACCOUNT_GROUPS[g] });
      const subtotal = head.createSpan({ cls: 'fd-manage-subtotal', text: (g === 'debt' ? '−' : '') + f.money(sum(list, (a) => Math.abs(num(a.balance)))) });
      const addHere = head.createEl('button', { cls: 'fd-icon-btn clickable-icon', attr: { 'aria-label': `Add ${ACCOUNT_GROUPS[g].split(' (')[0].toLowerCase()} account` } });
      setIcon(addHere, 'plus');
      addHere.addEventListener('click', () => plugin.editAccount({ group: g }, true));
      if (!list.length) { sec.createDiv({ cls: 'fd-manage-empty', text: 'No accounts in this group yet.' }); continue; }
      const hasContrib = g === 'retirement' || g === 'investment';
      for (const a of list) {
        shown++;
        const row = sec.createDiv({ cls: 'fd-manage-row' });
        const name = row.createDiv({ cls: 'fd-manage-name' });
        name.createDiv({ cls: 'fd-manage-title', text: a.name });
        const kd = name.createDiv({ cls: 'fd-muted fd-manage-kind' });
        if (a.kind) { const ks = kd.createSpan({ cls: 'fd-term', text: a.kind }); hover(ks, () => accountTaxTip(a, f)); } else kd.setText('—');
        const fields = row.createDiv({ cls: 'fd-manage-fields' });
        const numInput = (label, key, value) => {
          const w = fields.createDiv({ cls: 'fd-manage-input' });
          w.createSpan({ cls: 'fd-manage-input-label', text: label });
          const inp = w.createEl('input', { attr: { type: 'text', inputmode: 'decimal', 'aria-label': `${label} for ${a.name}` } });
          inp.value = String(Math.round(Math.abs(num(value)) * 100) / 100);
          const save = async () => {
            const raw = inp.value.trim();
            const n = num(raw);
            if (raw === '' || !isFinite(n) || /[a-z]/i.test(raw.replace(/[$€£¥,\s]/g, ''))) { inp.addClass('is-invalid'); return; }
            inp.removeClass('is-invalid');
            if (Math.abs(n) === Math.abs(num(a[key]))) return;
            this.suppress = true;
            try { await plugin.mutate((d) => { const x = d.accounts.find((y) => y.id === a.id); if (x) x[key] = Math.abs(n); }); }
            finally { this.suppress = false; }
            inp.value = String(Math.abs(n));
            w.addClass('is-saved');
            setTimeout(() => w.removeClass('is-saved'), 900);
            this.renderSummary();
            subtotal.setText((g === 'debt' ? '−' : '') + f.money(sum(plugin.data.accounts.filter((x) => x.group === g && match(x)), (x) => Math.abs(num(x.balance)))));
          };
          inp.addEventListener('change', save);
          inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); inp.blur(); } });
          return inp;
        };
        numInput(g === 'debt' ? 'Owed' : g === 'property' ? 'Value' : 'Balance', 'balance', a.balance);
        if (hasContrib) numInput('Per year', 'contribution', a.contribution);
        const act = row.createDiv({ cls: 'fd-manage-actions' });
        const edit = act.createEl('button', { cls: 'fd-icon-btn clickable-icon', attr: { 'aria-label': `Edit ${a.name}` } });
        setIcon(edit, 'pencil');
        edit.addEventListener('click', () => plugin.editAccount(a));
        const del = act.createEl('button', { cls: 'fd-icon-btn clickable-icon fd-danger', attr: { 'aria-label': `Delete ${a.name}` } });
        setIcon(del, 'trash-2');
        del.addEventListener('click', () => plugin.deleteAccount(a));
      }
    }
    if (!shown && (q || this.filter === 'all')) {
      el.createDiv({ cls: 'fd-empty', text: q ? `No accounts match “${this.query}”.` : 'No accounts yet — add your first one.' });
    }
  }
}

/** Income history: every raise, promotion or job change, newest first. Opened from the Income card. */
class IncomeModal extends Modal {
  constructor(app, plugin) { super(app); this.plugin = plugin; }
  onOpen() {
    this.modalEl.addClass('fd-modal', 'fd-manage-modal');
    this.titleEl.setText('Income');
    this.listener = () => this.renderList();
    this.plugin.listeners.add(this.listener);
    const bar = this.contentEl.createDiv({ cls: 'fd-manage-toolbar' });
    bar.createSpan({ cls: 'fd-muted', text: 'Amounts are guaranteed monthly income. Click an item to edit or delete it.' });
    bar.createDiv({ cls: 'fd-spacer' });
    const addX = bar.createEl('button', { cls: 'fd-btn' });
    setIcon(addX.createSpan({ cls: 'fd-btn-icon' }), 'plus');
    addX.createSpan({ text: 'Add income' });
    addX.addEventListener('click', () => this.plugin.editExtraIncome());
    const add = bar.createEl('button', { cls: 'mod-cta fd-btn' });
    setIcon(add.createSpan({ cls: 'fd-btn-icon' }), 'trending-up');
    add.createSpan({ text: 'Update income' });
    add.addEventListener('click', () => this.plugin.editIncome());
    this.listEl = this.contentEl.createDiv({ cls: 'fd-manage-list' });
    this.renderList();
  }
  onClose() { this.plugin.listeners.delete(this.listener); this.contentEl.empty(); }
  renderList() {
    const f = new Fmt(this.plugin.data.settings);
    const el = this.listEl;
    el.empty();
    const today = todayISO();
    const { hist, cur } = incomeOn(this.plugin.data, today);
    const extras = [...(this.plugin.data.extraIncome || [])].sort((a, b) => String(b.start || '').localeCompare(String(a.start || '')));
    if (extras.length) {
      const head = el.createDiv({ cls: 'fd-manage-group-head' });
      head.createSpan({ cls: 'fd-manage-group-name', text: 'Additional income' });
      head.createSpan({ cls: 'fd-manage-subtotal', text: `${f.money(sum(extraIncomeOn(this.plugin.data, today), (x) => x.net))}/mo net now` });
      for (const x of extras) {
        const row = el.createDiv({ cls: 'fd-manage-row is-clickable fd-income-hist-row' });
        row.addEventListener('click', () => this.plugin.editExtraIncome(x));
        const name = row.createDiv({ cls: 'fd-manage-name' });
        const t = name.createDiv({ cls: 'fd-manage-title' });
        t.createSpan({ text: x.name || x.kind });
        const active = (!x.start || x.start <= today) && (!x.end || x.end >= today);
        if (active) t.createSpan({ cls: 'fd-badge is-on-track', text: 'Active' });
        else if (x.start > today) t.createSpan({ cls: 'fd-badge is-close', text: 'Upcoming' });
        else t.createSpan({ cls: 'fd-badge is-neutral', text: 'Ended' });
        name.createDiv({ cls: 'fd-muted fd-manage-kind', text: [x.kind, x.start ? `from ${dateLabel(x.start)}` : '', x.end ? `to ${dateLabel(x.end)}` : ''].filter(Boolean).join(' · ') });
        if (x.note) name.createDiv({ cls: 'fd-tx-note', text: x.note });
        const amts = row.createDiv({ cls: 'fd-income-amts' });
        amts.createDiv({ cls: 'fd-income-net', text: `${f.money(num(x.net))}/mo net` });
        amts.createDiv({ cls: 'fd-muted', text: `${f.money(num(x.gross))}/mo gross` });
      }
      if (hist.length) { const h2 = el.createDiv({ cls: 'fd-manage-group-head' }); h2.createSpan({ cls: 'fd-manage-group-name', text: 'Job income changes' }); }
    }
    if (!hist.length) { if (!extras.length) emptyState(el, 'No income set up yet.'); return; }
    const rev = [...hist].reverse();
    rev.forEach((h, idx) => {
      const prev = rev[idx + 1];
      const row = el.createDiv({ cls: 'fd-manage-row is-clickable fd-income-hist-row' });
      row.addEventListener('click', () => this.plugin.editIncome(h));
      const name = row.createDiv({ cls: 'fd-manage-name' });
      const t = name.createDiv({ cls: 'fd-manage-title' });
      t.createSpan({ text: h.reason || 'Income change' });
      if (h === cur) t.createSpan({ cls: 'fd-badge is-on-track', text: 'Current' });
      else if (h.date > today) t.createSpan({ cls: 'fd-badge is-close', text: 'Upcoming' });
      name.createDiv({ cls: 'fd-muted fd-manage-kind', text: [dateLabel(h.date), h.title, h.employer].filter(Boolean).join(' · ') });
      if (h.note) name.createDiv({ cls: 'fd-tx-note', text: h.note });
      const amts = row.createDiv({ cls: 'fd-income-amts' });
      amts.createDiv({ cls: 'fd-income-net', text: `${f.money(num(h.net))}/mo net` });
      amts.createDiv({ cls: 'fd-muted', text: `${f.money(num(h.gross))}/mo gross` });
      if (prev && num(prev.gross)) {
        const dv = num(h.gross) - num(prev.gross);
        amts.createDiv({ cls: dv >= 0 ? 'fd-good' : 'fd-bad', text: `${signed(dv, (v) => f.money(v))}/mo (${signed(dv / num(prev.gross), (v) => f.pct(v, 1))})` });
      }
    });
  }
}

/* ===================================================== retirement: explainers */

/** Sources behind each part of the retirement math. Shown in the “How it works” panel and the PDF. */
const SOURCES = {
  trinity: { title: 'Trinity study (safe withdrawal rate research)', by: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Trinity_study',
    why: 'Summary of the research behind the 4% rule: how often portfolios lasted 30 years at different withdrawal rates.' },
  cooley: { title: 'Retirement Savings: Choosing a Withdrawal Rate That Is Sustainable (1998)', by: 'Cooley, Hubbard & Walz · AAII Journal', url: 'https://www.aaii.com/journal/article/retirement-savings-choosing-a-withdrawal-rate-that-is-sustainable',
    why: 'The original “Trinity study” paper on sustainable withdrawal rates.' },
  bengen: { title: 'Determining Withdrawal Rates Using Historical Data (1994)', by: 'William Bengen · Journal of Financial Planning', url: 'https://robberger.com/research/determining-withdrawal-rates-using-historical-data',
    why: 'The first study proposing a ~4% inflation-adjusted starting withdrawal.' },
  morningstar: { title: 'The State of Retirement Income', by: 'Morningstar (updated yearly)', url: 'https://www.morningstar.com/lp/the-state-of-retirement-income',
    why: 'Current research on safe starting withdrawal rates given today’s market conditions.' },
  fisher: { title: 'Fisher equation (real vs nominal returns)', by: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Fisher_equation',
    why: 'Where real return = (1 + return) ÷ (1 + inflation) − 1 comes from.' },
  cpi: { title: 'Consumer Price Index (CPI)', by: 'U.S. Bureau of Labor Statistics', url: 'https://www.bls.gov/cpi/',
    why: 'Official inflation data to sanity-check your inflation assumption.' },
  damodaran: { title: 'Historical Returns on Stocks, Bonds and Bills', by: 'Aswath Damodaran · NYU Stern', url: 'https://pages.stern.nyu.edu/~adamodar/New_Home_Page/datafile/histretSP.html',
    why: 'Year-by-year U.S. stock, bond and cash returns since 1928, for choosing an expected return.' },
  compound: { title: 'Compound interest', by: 'Investor.gov (U.S. SEC)', url: 'https://www.investor.gov/introduction-investing/investing-basics/glossary/compound-interest',
    why: 'How growth on top of growth works — the core of the monthly projection.' },
  savingsGoal: { title: 'Savings Goal Calculator', by: 'Investor.gov (U.S. SEC)', url: 'https://www.investor.gov/financial-tools-calculators/calculators/savings-goal-calculator',
    why: 'Same idea as “needed contribution”: how much to save regularly to reach a goal by a date.' },
  fees: { title: 'How Fees and Expenses Affect Your Investment Portfolio', by: 'Investor.gov (U.S. SEC)', url: 'https://www.investor.gov/introduction-investing/investing-basics/glossary/how-fees-and-expenses-affect-your-investment-portfolio',
    why: 'Why fees lower your effective return, and how much that compounds to.' },
  ssaEstimate: { title: 'Get your Social Security benefit estimate', by: 'Social Security Administration', url: 'https://www.ssa.gov/prepare/get-benefits-estimate',
    why: 'Your personal estimate to use for “Social Security / pension”.' },
  ssaDelay: { title: 'Delayed retirement credits', by: 'Social Security Administration', url: 'https://www.ssa.gov/benefits/retirement/planner/delayret.html',
    why: 'How waiting past full retirement age (up to 70) increases your benefit.' },
};
const SOURCE_GROUPS = [
  ['Withdrawal rate & target nest egg', ['trinity', 'cooley', 'bengen', 'morningstar']],
  ['Returns & inflation (real return)', ['fisher', 'damodaran', 'cpi', 'fees']],
  ['Growth & contributions', ['compound', 'savingsGoal']],
  ['Social Security & other income', ['ssaEstimate', 'ssaDelay']],
];

/** Plain-language definitions for retirement terms. calc(ctx) adds a line using the person's own numbers. */
const GLOSSARY = {
  targetNestEgg: { title: 'Target nest egg',
    body: ['The savings balance that can pay your desired retirement income for the long run.', 'Target = (desired income − Social Security/pension) ÷ withdrawal rate.'],
    calc: ({ r, f, plan }) => `(${f.money(num(r.annualIncome))} − ${f.money(num(r.otherIncome))}) ÷ ${num(r.withdrawalRate)}% = ${f.money(plan.target)}` },
  withdrawalRate: { title: 'Withdrawal rate',
    body: ['The share of your savings you take out in your first year of retirement, then keep steady in today’s dollars.', '4% is a common rule of thumb from research on balanced portfolios lasting about 30 years. A lower rate is safer but needs a bigger nest egg.'],
    calc: ({ r, f, plan }) => { const w = num(r.withdrawalRate); return w > 0.5 ? `At ${w}% your target is ${f.money(plan.target)}; at ${w - 0.5}% it would be ${f.money(plan.need / ((w - 0.5) / 100))}.` : null; } },
  expectedReturn: { title: 'Expected annual return',
    body: ['The average yearly growth you expect from your retirement investments, before inflation and after fund fees.', 'Stock-heavy portfolios have historically averaged roughly 7–10% a year over long periods; bonds and cash less. Individual years vary a lot.'],
    calc: ({ f, plan }) => `Combined with inflation it gives your real return of ${f.pct(plan.real, 1)}, which grows your balance every month.` },
  inflation: { title: 'Inflation',
    body: ['How fast prices rise each year. Because projections are in today’s dollars, inflation is taken out of your return instead of being added to your target.'],
    calc: ({ r, f, plan }) => `Real return = (1 + ${num(r.expectedReturn)}%) ÷ (1 + ${num(r.inflation)}%) − 1 = ${f.pct(plan.real, 2)}` },
  returnInflation: { title: 'Return / inflation',
    body: ['Expected return is how fast your investments grow; inflation is how fast prices rise. What’s left over — the real return — is growth in buying power, and it’s what the projection uses.'],
    calc: ({ r, f, plan }) => `(1 + ${num(r.expectedReturn)}%) ÷ (1 + ${num(r.inflation)}%) − 1 = ${f.pct(plan.real, 2)} a year, about ${f.pct(Math.pow(1 + plan.real, 1 / 12) - 1, 3)} a month.` },
  todaysDollars: { title: 'Today’s dollars',
    body: ['All amounts are adjusted for inflation, so a projected $1M means what $1M buys today. That’s why your target doesn’t grow over time.'] },
  desiredIncome: { title: 'Desired retirement income',
    body: ['How much you want to spend each year in retirement, in today’s dollars. A common starting point is 70–80% of your income before retiring; include housing, healthcare and travel.'],
    calc: ({ f, plan }) => `After other income, your savings need to cover ${f.money(plan.need)}/yr.` },
  otherIncome: { title: 'Social Security / pension',
    body: ['Income in retirement that doesn’t come from your savings, such as Social Security, a pension or an annuity. It lowers how much your savings must provide.', 'Use your official benefit estimate (in the U.S., from ssa.gov).'],
    calc: ({ r, f }) => { const o = num(r.otherIncome), w = num(r.withdrawalRate) / 100; return o && w ? `It lowers your target by ${f.money(o / w)}.` : null; } },
  targetAge: { title: 'Target retirement age',
    body: ['The age you’d like to stop working. The projection checks whether your savings reach your target nest egg by then.'],
    calc: ({ plan }) => { const y = Math.max(0, plan.targetAge - plan.age); return `${y.toFixed(1)} years from now (${new Date().getFullYear() + Math.round(y)}).`; } },
  estimatedRetirement: { title: 'Estimated retirement',
    body: ['The first month your projected balance reaches your target nest egg if you keep saving at today’s rate. It can be earlier or later than your target age.'],
    calc: ({ plan }) => (plan.estDate ? `${plan.estDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}, at age ${plan.estAge.toFixed(1)}.` : 'Not reached by age 100 at today’s savings rate.') },
  status: { title: 'On-track status',
    body: ['Compares your projected savings at your target age with your target nest egg.', 'On track: 100% or more · Slightly behind: 85–99% · Off track: under 85%.'],
    calc: ({ f, plan }) => `${f.money(plan.projectedAtTarget)} ÷ ${f.money(plan.target)} = ${f.pct(plan.ratio)}` },
  projected: { title: 'Projected balance',
    body: ['Today’s retirement savings grown at your real return, plus your yearly contributions added in monthly installments. Shown in today’s dollars.'],
    calc: ({ f, plan }) => `At ${plan.targetAge}: ${f.money(plan.projectedAtTarget)}.` },
  contributions: { title: 'Contributions',
    body: ['What goes into your retirement accounts each year, including any employer match. Set them on each account.'],
    calc: ({ f, plan }) => `${f.money(plan.contribution)}/yr (${f.money(plan.contribution / 12)}/mo).` },
  neededContribution: { title: 'Needed contribution',
    body: ['The yearly contribution that would make your projection reach your target exactly at your target age, at your expected return.'],
    calc: ({ f, plan }) => `${f.money(plan.requiredContribution)}/yr needed vs ${f.money(plan.contribution)}/yr today.` },
  taxTreatment: { title: 'Tax treatment',
    body: ['Tax-deferred (traditional 401(k)/IRA): lowers taxes now; withdrawals are taxed. Tax-free (Roth): taxed now; qualified withdrawals are tax-free. HSA: tax-free for medical costs. Taxable: no special treatment.', 'A mix gives you flexibility in retirement. The projection itself doesn’t model taxes.'] },
  sustainableIncome: { title: 'Income it supports',
    body: ['What your projected savings could pay each year at your withdrawal rate, plus Social Security/pension.'],
    calc: ({ f, plan }) => (plan.sustainableIncome != null ? `${f.money(plan.sustainableIncome)}/yr at your target age.` : null) },
  moneyLasts: { title: 'Money lasts until',
    body: ['If you retire at your target age and withdraw what you need each year (desired income minus other income), how long your savings last at the same real return. “100+” means beyond age 100.'] },
  includeInvestments: { title: 'Count taxable investments',
    body: ['Turn on if you plan to use brokerage or other taxable investments for retirement. Their balances and contributions are then added to the projection.'] },
};

function glossaryTip(key, ctx) {
  const g = GLOSSARY[key];
  if (!g) return null;
  let calc = null;
  try { calc = ctx && g.calc ? g.calc(ctx) : null; } catch (e) { calc = null; }
  return { key: 'g:' + key, title: g.title, body: g.body, calc, calcLabel: g.calcLabel, wide: true };
}
/** Underlined term with a hover definition. */
function termEl(parent, text, key, ctxFn) {
  const s = parent.createSpan({ cls: 'fd-term', text, attr: { tabindex: '0' } });
  hover(s, () => glossaryTip(key, ctxFn ? ctxFn() : null));
  return s;
}
/** Small (?) icon with a hover definition. */
function helpIcon(parent, key, ctxFn) {
  const s = parent.createSpan({ cls: 'fd-help', attr: { tabindex: '0', 'aria-label': `What is ${GLOSSARY[key] ? GLOSSARY[key].title.toLowerCase() : key}?` } });
  setIcon(s, 'circle-help');
  hover(s, () => glossaryTip(key, ctxFn ? ctxFn() : null));
  s.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); });
  return s;
}
function sourceLink(parent, key, label) {
  const s = SOURCES[key];
  const a = parent.createEl('a', { cls: 'fd-src-link external-link', text: label || s.title, attr: { href: s.url, target: '_blank', rel: 'noopener', title: s.url } });
  return a;
}

/* ====================================================== retirement: scenarios */

const WI_KEYS = ['targetAge', 'annualIncome', 'otherIncome', 'withdrawalRate', 'expectedReturn', 'inflation', 'includeInvestments'];
const WI_LABELS = { targetAge: 'Retirement age', annualIncome: 'Desired income', otherIncome: 'Social Security / pension', withdrawalRate: 'Withdrawal rate',
  expectedReturn: 'Expected return', inflation: 'Inflation', includeInvestments: 'Count taxable investments' };
const WI_HELP = { targetAge: 'targetAge', annualIncome: 'desiredIncome', otherIncome: 'otherIncome', withdrawalRate: 'withdrawalRate', expectedReturn: 'expectedReturn', inflation: 'inflation', includeInvestments: 'includeInvestments' };
const SC_COLORS = ['#F58518', '#4C78A8', '#B279A2', '#E45756', '#72B7B2', '#9D755D', '#EECA3B', '#FF9DA6'];
const BASE_COLOR = '#54A24B';
const EVENT_TYPES = {
  contrib: { label: 'Contribution change', icon: 'piggy-bank', hint: 'Save more or less each month' },
  pay: { label: 'Pay change', icon: 'trending-up', hint: 'Raise, new job or pay cut' },
  lump: { label: 'One-time amount', icon: 'banknote', hint: 'Bonus, inheritance or withdrawal' },
  pause: { label: 'Pause contributions', icon: 'pause', hint: 'Career break or sabbatical' },
  ret: { label: 'Market returns', icon: 'activity', hint: 'Different returns for a while' },
};
const OTHER_BUCKET = '__other';

function wiFmtAssumption(k, v, f) {
  if (k === 'includeInvestments') return v ? 'Yes' : 'No';
  if (k === 'annualIncome' || k === 'otherIncome') return `${f.money(num(v))}/yr`;
  if (k === 'targetAge') return String(num(v));
  return `${num(v)}%`;
}
function effectiveAssumptions(data, sc) {
  const r = Object.assign({}, data.retirement);
  if (sc && sc.assumptions) for (const k of WI_KEYS) if (sc.assumptions[k] != null) r[k] = sc.assumptions[k];
  return r;
}
/** Month offset (from now) for a "when" spec: {mode:'now'|'years'|'age'|'date', value, date}. */
function specMonth(spec, age) {
  if (!spec || !spec.mode || spec.mode === 'now' || spec.mode === 'never') return 0;
  if (spec.mode === 'years') return Math.max(0, Math.round(num(spec.value) * 12));
  if (spec.mode === 'age') return Math.max(0, Math.round((num(spec.value) - age) * 12));
  if (spec.mode === 'date' && spec.date) {
    const [y, m, d] = spec.date.split('-').map(Number);
    return Math.max(0, Math.round(monthsBetween(new Date(), new Date(y, (m || 1) - 1, d || 1))));
  }
  return 0;
}
function specText(spec, age) {
  if (!spec || !spec.mode || spec.mode === 'now') return 'now';
  const n = new Date(), mo = specMonth(spec, age);
  const my = new Date(n.getFullYear(), n.getMonth() + mo, 1).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
  if (spec.mode === 'years') return `in ${num(spec.value)} year${num(spec.value) === 1 ? '' : 's'} (${my})`;
  if (spec.mode === 'age') return `at age ${num(spec.value)} (${my})`;
  if (spec.mode === 'date') return `on ${dateLabel(spec.date)}`;
  return 'now';
}

/** End-date wording: “until Nov 2030”, “until age 55 (Apr 2043)”, “until Mar 1, 2031”. */
function specUntil(spec, age) {
  const n = new Date(), mo = specMonth(spec, age);
  const my = new Date(n.getFullYear(), n.getMonth() + mo, 1).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
  if (spec.mode === 'age') return `age ${num(spec.value)} (${my})`;
  if (spec.mode === 'date') return dateLabel(spec.date);
  return my;
}

/**
 * Month-by-month projection for a scenario (null = your current plan). Same math as the dashboard
 * (real return, monthly contributions), plus scenario changes. Works on copies — never touches data.
 */
function simulateRetirement(data, sc) {
  sc = sc || { events: [], assumptions: {} };
  const r = effectiveAssumptions(data, sc);
  const now = new Date();
  const age = ageOn(r.birthDate, now);
  const accts = data.accounts.filter((a) => a.group === 'retirement' || (r.includeInvestments && a.group === 'investment'));
  const buckets = new Map(accts.map((a) => [a.id, { id: a.id, name: a.name, bal: num(a.balance), base: num(a.contribution) / 12 }]));
  const bucket = (id) => {
    const key = id || OTHER_BUCKET;
    if (!buckets.has(key)) {
      const a = data.accounts.find((x) => x.id === key);
      buckets.set(key, { id: key, name: a ? a.name : 'Other / new savings', bal: 0, base: 0 });
    }
    return buckets.get(key);
  };
  const inflation = num(r.inflation) / 100;
  const realOf = (pct) => (1 + pct / 100) / (1 + inflation) - 1;
  const monthlyOf = (real) => Math.pow(1 + real, 1 / 12) - 1;
  const baseReal = realOf(num(r.expectedReturn));
  const need = Math.max(0, num(r.annualIncome) - num(r.otherIncome));
  const wr = num(r.withdrawalRate) / 100;
  const target = wr > 0 ? need / wr : 0;
  const targetAge = num(r.targetAge);
  const M = Math.max(12, Math.ceil((100 - age) * 12));
  const nTarget = clamp(Math.round((targetAge - age) * 12), 0, M);
  const balance0 = sum([...buckets.values()], (b) => b.bal);
  const contribution0 = sum([...buckets.values()], (b) => b.base) * 12;

  const evs = (sc.events || []).map((e) => ({ e, s: specMonth(e.start, age),
    end: e.type === 'lump' || !e.end || !e.end.mode || e.end.mode === 'never' ? null : specMonth(e.end, age) }));
  for (const x of evs) if (x.e.type === 'contrib' || x.e.type === 'pay' || x.e.type === 'lump') bucket(x.e.account);
  // Pay changes stack in date order; the saved share becomes an extra monthly contribution.
  const inc = incomeOn(data, todayISO()).cur;
  let gross = inc ? num(inc.gross) : 0;
  for (const x of evs.filter((y) => y.e.type === 'pay').sort((a, b) => a.s - b.s)) {
    x.raise = x.e.mode === 'pct' ? gross * num(x.e.value) / 100 : num(x.e.value);
    gross += x.raise;
    x.extra = x.raise * num(x.e.saveShare) / 100;
  }
  const active = (x, m) => m > x.s && (x.end == null || m <= x.end);
  const total = () => { let t = 0; for (const b of buckets.values()) t += b.bal; return t; };
  const lumps = (m) => { for (const x of evs) if (x.e.type === 'lump' && x.s === m) { const b = bucket(x.e.account); b.bal = Math.max(0, b.bal + num(x.e.amount)); } };

  lumps(0);
  const points = [{ age, balance: total() }];
  let hit = target > 0 && total() >= target ? 0 : null;
  let atTarget = nTarget === 0 ? total() : null, byAccount = nTarget === 0 ? [...buckets.values()].map((b) => ({ name: b.name, balance: b.bal })) : null;
  let contributed = 0, contributedToTarget = 0, factor = 0, contribNow = null;
  for (let m = 1; m <= M; m++) {
    let real = baseReal;
    for (const x of evs) if (x.e.type === 'ret' && active(x, m)) real = realOf(num(x.e.rate));
    const g = monthlyOf(real);
    for (const b of buckets.values()) b.bal *= 1 + g;
    let added = 0;
    if (!evs.some((x) => x.e.type === 'pause' && active(x, m))) {
      for (const b of buckets.values()) { b.bal += b.base; added += b.base; }
      for (const x of evs) {
        if (!active(x, m)) continue;
        if (x.e.type === 'contrib') { const b = bucket(x.e.account); const v = num(x.e.amount); const before = b.bal; b.bal = Math.max(0, b.bal + v); added += b.bal - before; }
        else if (x.e.type === 'pay' && x.extra) { bucket(x.e.account).bal += x.extra; added += x.extra; }
      }
    }
    if (m === 1) contribNow = added * 12;
    contributed += added;
    lumps(m);
    if (m <= nTarget) { contributedToTarget = contributed; factor = factor * (1 + g) + 1; }
    const T = total();
    if (hit === null && target > 0 && T >= target) hit = m;
    if (m === nTarget) { atTarget = T; byAccount = [...buckets.values()].map((b) => ({ name: b.name, balance: b.bal })); }
    if (m % 12 === 0) points.push({ age: age + m / 12, balance: T });
  }
  if (atTarget == null) atTarget = total();
  // Draw down from the target age: withdraw the yearly need monthly at the base real return.
  let lastsAge = null;
  if (need > 0) {
    const g = monthlyOf(baseReal);
    let B = atTarget;
    for (let k = 1; k <= 12 * 60; k++) {
      B = B * (1 + g) - need / 12;
      if (B <= 0) { lastsAge = Math.max(targetAge, age) + k / 12; break; }
    }
  }
  const lastsText = need <= 0 ? 'Forever' : lastsAge == null || lastsAge > 100 ? '100+' : `Age ${Math.floor(lastsAge)}`;
  const extraNeededYr = factor > 0 ? Math.max(0, target - atTarget) / factor * 12 : Math.max(0, target - atTarget);
  const estAge = hit === null ? null : age + hit / 12;
  const estDate = hit === null ? null : new Date(now.getFullYear(), now.getMonth() + hit, 1);
  const ratio = target > 0 ? atTarget / target : 1;
  return {
    r, age, targetAge, need, wr, target, real: baseReal, balance: balance0, contribution: contribution0, contribNow: contribNow == null ? contribution0 : contribNow,
    points, projectedAtTarget: atTarget, byAccount: (byAccount || []).filter((b) => b.balance > 0.5).sort((a, b) => b.balance - a.balance),
    ratio, status: ratio >= 1 ? 'on-track' : ratio >= 0.85 ? 'close' : 'behind', estAge, estDate,
    lastsAge, lastsText, sustainableIncome: atTarget * wr + num(r.otherIncome), extraNeededYr, requiredContribution: contribution0 + extraNeededYr,
    contributedToTarget, events: evs, accounts: accts, progress: target > 0 ? balance0 / target : 0,
  };
}

function wiAccountName(data, id) {
  if (!id || id === OTHER_BUCKET) return 'other / new savings';
  const a = data.accounts.find((x) => x.id === id);
  return a ? a.name : 'other / new savings';
}
function describeEvent(e, data, sim, f) {
  const age = sim.age, x = (sim.events || []).find((y) => y.e === e) || {};
  const start = specText(e.start, age);
  const until = e.end && e.end.mode && e.end.mode !== 'never' ? ` until ${specUntil(e.end, age)}` : '';
  const acct = wiAccountName(data, e.account);
  switch (e.type) {
    case 'contrib': {
      const a = num(e.amount);
      return `${a >= 0 ? 'Save' : 'Cut contributions by'} ${f.money(Math.abs(a))}/mo ${a >= 0 ? 'more in' : 'to'} ${acct}, starting ${start}${until}`;
    }
    case 'pay': {
      const chg = e.mode === 'pct' ? `${num(e.value) >= 0 ? '+' : ''}${num(e.value)}%` : `${num(e.value) >= 0 ? '+' : '−'}${f.money(Math.abs(num(e.value)))}/mo gross`;
      const extra = x.extra != null ? ` (${x.extra >= 0 ? '+' : '−'}${f.money(Math.abs(x.extra))}/mo)` : '';
      return `Pay ${chg} ${start === 'now' ? 'starting now' : start}; save ${num(e.saveShare)}% of the change to ${acct}${extra}`;
    }
    case 'lump': {
      const a = num(e.amount);
      return `One-time ${a >= 0 ? 'deposit of' : 'withdrawal of'} ${f.money(Math.abs(a))} ${a >= 0 ? 'into' : 'from'} ${acct}, ${start}`;
    }
    case 'pause': return `Pause all contributions ${start === 'now' ? 'starting now' : start}${until || ' (no end set)'}`;
    case 'ret': return `Investments return ${num(e.rate)}%/yr ${start === 'now' ? 'starting now' : start}${until || ' onward'}`;
    default: return 'Change';
  }
}

/* ============================================================ mini PDF writer */

// Helvetica glyph widths (1/1000 em) for WinAnsi codes 32–255, used to measure and wrap text.
const HELV = { r: [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584,761,556,0,222,556,333,1000,556,556,333,1000,667,333,1000,0,611,0,0,222,222,333,333,350,556,1000,333,1000,500,333,944,0,500,667,278,333,556,556,556,556,260,556,333,737,370,556,584,333,737,333,400,584,333,333,333,556,537,278,333,333,365,556,834,834,834,611,667,667,667,667,667,667,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,500,556,556,556,556,278,278,278,278,556,556,556,556,556,556,556,584,611,556,556,556,556,500,556,500],
  b: [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584,761,556,0,278,556,500,1000,556,556,333,1000,667,333,1000,0,611,0,0,278,278,500,500,350,556,1000,333,1000,556,333,944,0,500,667,278,333,556,556,556,556,280,556,333,737,370,556,584,333,737,333,400,584,333,333,333,611,556,278,333,333,365,556,834,834,834,611,722,722,722,722,722,722,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,556,556,556,556,556,278,278,278,278,611,611,611,611,611,611,611,584,611,611,611,611,611,556,611,556] };

const PDF_WINANSI = { '€': 128, '‚': 130, 'ƒ': 131, '„': 132, '…': 133, '†': 134, '‡': 135, 'ˆ': 136, '‰': 137, 'Š': 138,
  '‹': 139, 'Œ': 140, 'Ž': 142, '‘': 145, '’': 146, '“': 147, '”': 148, '•': 149, '–': 150, '—': 151, '˜': 152,
  '™': 153, 'š': 154, '›': 155, 'œ': 156, 'ž': 158, 'Ÿ': 159 };
const PDF_SUBST = { '→': '->', '←': '<-', '≈': '~', '−': '-', ' ': ' ', ' ': ' ', ' ': ' ', '≥': '>=', '≤': '<=',
  '▲': '+', '▼': '-', '✓': 'v', ' ': ' ' };
/** Convert text to the PDF's WinAnsi encoding (one byte per character). */
function pdfText(s) {
  let out = '';
  for (const ch of String(s == null ? '' : s)) {
    const c = ch.codePointAt(0);
    if (PDF_SUBST[ch] != null) out += PDF_SUBST[ch];
    else if ((c >= 32 && c < 127) || (c >= 161 && c <= 255)) out += ch;
    else if (PDF_WINANSI[ch]) out += String.fromCharCode(PDF_WINANSI[ch]);
    else if (c === 9 || c === 10 || c === 13) out += ' ';
    else if (c >= 0xFE00 && c <= 0xFE0F) continue;
    else out += '?';
  }
  return out;
}
const pdfEsc = (t) => t.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');

/** Tiny dependency-free PDF builder: Helvetica text, rectangles, lines and link areas. Coordinates are from the top-left, in points. */
class MiniPDF {
  constructor(opts = {}) { this.W = opts.width || 612; this.H = opts.height || 792; this.title = opts.title || 'Document'; this.pages = []; this.addPage(); }
  addPage() { this.page = { ops: [], links: [] }; this.pages.push(this.page); return this; }
  static rgb(hex) {
    let h = String(hex || '#000').replace('#', '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const n = parseInt(h, 16) || 0;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => (v / 255).toFixed(3)).join(' ');
  }
  width(s, size = 10, bold = false) {
    const t = pdfText(s), w = bold ? HELV.b : HELV.r;
    let total = 0;
    for (let i = 0; i < t.length; i++) { const c = t.charCodeAt(i); total += c >= 32 ? (w[c - 32] || 556) : 0; }
    return (total * size) / 1000;
  }
  /** y is the text baseline. */
  text(x, y, s, o = {}) {
    const size = o.size || 10;
    let tx = x;
    if (o.align === 'right') tx = x - this.width(s, size, o.bold);
    else if (o.align === 'center') tx = x - this.width(s, size, o.bold) / 2;
    this.page.ops.push(`BT /${o.bold ? 'F2' : 'F1'} ${size} Tf ${MiniPDF.rgb(o.color || '#1f2328')} rg ${tx.toFixed(2)} ${(this.H - y).toFixed(2)} Td (${pdfEsc(pdfText(s))}) Tj ET`);
    return tx;
  }
  /** Shorten text with an ellipsis so it fits a width. */
  fit(s, maxW, size, bold) {
    s = String(s);
    if (this.width(s, size, bold) <= maxW) return s;
    while (s.length > 1 && this.width(s + '…', size, bold) > maxW) s = s.slice(0, -1);
    return s.trimEnd() + '…';
  }
  wrap(s, maxW, size = 10, bold = false) {
    const lines = [];
    for (const para of String(s).split('\n')) {
      let line = '';
      for (const word of para.split(/\s+/).filter(Boolean)) {
        const test = line ? line + ' ' + word : word;
        if (this.width(test, size, bold) <= maxW) { line = test; continue; }
        if (line) lines.push(line);
        line = this.width(word, size, bold) > maxW ? this.fit(word, maxW, size, bold) : word;
      }
      lines.push(line);
    }
    return lines;
  }
  rect(x, y, w, h, o = {}) {
    const p = [];
    if (o.fill) p.push(`${MiniPDF.rgb(o.fill)} rg`);
    if (o.stroke) p.push(`${MiniPDF.rgb(o.stroke)} RG ${o.lw || 0.75} w [] 0 d`);
    p.push(`${x.toFixed(2)} ${(this.H - y - h).toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re ${o.fill && o.stroke ? 'B' : o.fill ? 'f' : 'S'}`);
    this.page.ops.push(p.join(' '));
  }
  line(x1, y1, x2, y2, o = {}) { this.polyline([[x1, y1], [x2, y2]], o); }
  polyline(pts, o = {}) {
    if (pts.length < 2) return;
    const dash = o.dash ? `[${o.dash.join(' ')}] 0 d` : '[] 0 d';
    this.page.ops.push(`${MiniPDF.rgb(o.color || '#000')} RG ${o.width || 1} w 1 J 1 j ${dash} ` +
      pts.map((p, i) => `${p[0].toFixed(2)} ${(this.H - p[1]).toFixed(2)} ${i ? 'l' : 'm'}`).join(' ') + ' S');
  }
  /** Clickable area that opens a URL. */
  link(x, y, w, h, url) { this.page.links.push({ rect: [x, this.H - y - h, x + w, this.H - y], url }); }
  output() {
    const objs = [];
    const add = (s) => { objs.push(s); return objs.length; };
    add('<< /Type /Catalog /Pages 2 0 R >>');
    add(null);
    add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
    const kids = [];
    for (const pg of this.pages) {
      const content = pg.ops.join('\n');
      const cId = add(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
      const annots = pg.links.map((l) => add(`<< /Type /Annot /Subtype /Link /Rect [${l.rect.map((v) => v.toFixed(2)).join(' ')}] /Border [0 0 0] /A << /S /URI /URI (${pdfEsc(pdfText(l.url))}) >> >>`));
      kids.push(add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${this.W} ${this.H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${cId} 0 R` +
        (annots.length ? ` /Annots [${annots.map((a) => `${a} 0 R`).join(' ')}]` : '') + ' >>'));
    }
    objs[1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`;
    const d = new Date();
    const stamp = `D:${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`;
    const info = add(`<< /Title (${pdfEsc(pdfText(this.title))}) /Producer (Finance Dashboard for Obsidian) /CreationDate (${stamp}) >>`);
    let out = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
    const offsets = [];
    objs.forEach((o, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
    const xref = out.length;
    out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
    out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    const bytes = new Uint8Array(out.length);
    for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 255;
    return bytes;
  }
}

/** Build the what-if report: current plan, comparison, chart, each scenario's setup and results, and sources. */
function buildWhatIfPDF(data, scenarios, f) {
  const pdf = new MiniPDF({ title: 'Retirement what-if scenarios' });
  const M = 48, W = pdf.W - 2 * M, BOTTOM = pdf.H - 54;
  const INK = '#1f2328', MUTED = '#59636e', LINE = '#d8dee4', SOFT = '#f3f5f7';
  let y = M;
  const ensure = (h) => { if (y + h > BOTTOM) { pdf.addPage(); y = M; } };
  const para = (text, o = {}) => {
    const size = o.size || 9.5, lh = size * 1.42, x = o.x || M;
    for (const ln of pdf.wrap(text, o.width || (W - (x - M)), size, o.bold)) { ensure(lh); pdf.text(x, y + size, ln, { size, bold: o.bold, color: o.color || INK }); y += lh; }
  };
  const heading = (t, color) => {
    ensure(44);
    y += 12;
    let x = M;
    if (color) { pdf.rect(M, y + 2, 10, 10, { fill: color }); x = M + 16; }
    pdf.text(x, y + 12, t, { size: 13.5, bold: true });
    y += 20;
    pdf.line(M, y, M + W, y, { color: LINE, width: 0.75 });
    y += 10;
  };
  const sub = (t) => { ensure(24); y += 4; pdf.text(M, y + 10, t, { size: 10.5, bold: true }); y += 16; };
  const bullets = (items) => {
    for (const it of items) {
      const lines = pdf.wrap(it, W - 14, 9.5);
      ensure(lines.length * 13.5);
      pdf.text(M + 2, y + 9.5, '•', { size: 9.5, color: MUTED });
      for (const ln of lines) { pdf.text(M + 14, y + 9.5, ln, { size: 9.5 }); y += 13.5; }
    }
  };
  /** cols: [{label, w (fraction), align}], rows: [{cells:[], color, bold}] */
  const table = (cols, rows) => {
    const widths = cols.map((c) => c.w * W);
    const rowH = 18;
    const drawHead = () => {
      pdf.rect(M, y, W, rowH, { fill: SOFT });
      let x = M;
      cols.forEach((c, i) => {
        const tx = c.align === 'right' ? x + widths[i] - 6 : x + 6;
        pdf.text(tx, y + 12, pdf.fit(c.label, widths[i] - 10, 8, true), { size: 8, bold: true, color: MUTED, align: c.align === 'right' ? 'right' : 'left' });
        x += widths[i];
      });
      y += rowH;
    };
    ensure(rowH * 2);
    drawHead();
    for (const r of rows) {
      if (y + rowH > BOTTOM) { pdf.addPage(); y = M; drawHead(); }
      let x = M;
      r.cells.forEach((cell, i) => {
        let tx = cols[i].align === 'right' ? x + widths[i] - 6 : x + 6;
        let avail = widths[i] - 12;
        if (i === 0 && r.color) { pdf.rect(x + 6, y + 5, 8, 8, { fill: r.color }); tx += 13; avail -= 13; }
        pdf.text(tx, y + 12.5, pdf.fit(cell, avail, 9, r.bold || (i === 0)), { size: 9, bold: r.bold || i === 0, color: r.tones && r.tones[i] ? r.tones[i] : INK, align: cols[i].align === 'right' ? 'right' : 'left' });
        x += widths[i];
      });
      y += rowH;
      pdf.line(M, y, M + W, y, { color: LINE, width: 0.5 });
    }
    y += 6;
  };
  const kv = (pairs) => {
    const colW = W / 2, rowH = 16;
    for (let i = 0; i < pairs.length; i += 2) {
      ensure(rowH);
      [pairs[i], pairs[i + 1]].forEach((p, j) => {
        if (!p) return;
        const x = M + j * colW;
        pdf.text(x, y + 11, p[0], { size: 9, color: MUTED });
        pdf.text(x + colW - 14, y + 11, pdf.fit(p[1], colW * 0.55, 9, true), { size: 9, bold: true, align: 'right' });
      });
      y += rowH;
      pdf.line(M, y - 3, M + W, y - 3, { color: '#eef1f4', width: 0.5 });
    }
    y += 4;
  };
  const GOOD = '#1a7f37', BAD = '#cf222e';
  const delta = (v, fmt, upGood = true) => (Math.abs(v) < 0.5 ? '—' : `${v > 0 ? '+' : '−'}${fmt(Math.abs(v))}`);
  const toneOf = (v, upGood = true) => (Math.abs(v) < 0.5 ? null : (v > 0) === upGood ? GOOD : BAD);
  const ageTxt = (s) => (s.estAge != null ? `Age ${s.estAge.toFixed(1)}` : 'After 100');

  const base = simulateRetirement(data, null);
  const sims = scenarios.map((sc) => ({ sc, s: simulateRetirement(data, sc) }));
  const r = data.retirement;

  // Title block
  pdf.rect(M, y, W, 4, { fill: BASE_COLOR });
  y += 18;
  pdf.text(M, y + 18, 'Retirement what-if scenarios', { size: 22, bold: true });
  y += 30;
  pdf.text(M, y + 10, `Prepared ${new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })} · all amounts in today’s dollars · U.S. tax limits: ${taxAsOf()}`, { size: 10, color: MUTED });
  y += 22;
  // Prediction disclaimer (also repeated in every page footer)
  const disc = 'These numbers are predictions, not guarantees. They are estimates based on your assumptions (steady average returns, inflation, contributions and income) and real results will differ, possibly by a lot. They do not model taxes, fees (unless included in your expected return) or market swings. This report is for planning and education only and is not financial, tax or legal advice; consider speaking with a qualified professional before making decisions. Scenarios are a sandbox: nothing in them changes your dashboard, accounts or predictions.';
  const dl = pdf.wrap(disc, W - 24, 8.8);
  const boxH = dl.length * 12.4 + 28;
  pdf.rect(M, y, W, boxH, { fill: '#fff8c5', stroke: '#d4a72c', lw: 0.75 });
  pdf.text(M + 12, y + 16, 'Disclaimer: this is a prediction', { size: 9.5, bold: true, color: '#7d4e00' });
  dl.forEach((ln, i) => pdf.text(M + 12, y + 30 + i * 12.4, ln, { size: 8.8, color: '#4d3800' }));
  y += boxH + 10;

  heading('Your current plan', BASE_COLOR);
  kv([
    ['Current age', base.age.toFixed(1)], ['Target retirement age', String(base.targetAge)],
    ['Retirement savings', f.money(base.balance)], ['Contributions', `${f.money(base.contribution)}/yr`],
    ['Desired income', `${f.money(num(r.annualIncome))}/yr`], ['Social Security / pension', `${f.money(num(r.otherIncome))}/yr`],
    ['Withdrawal rate', `${num(r.withdrawalRate)}%`], ['Return / inflation', `${num(r.expectedReturn)}% / ${num(r.inflation)}% (real ${f.pct(base.real, 1)})`],
    ['Target nest egg', f.money(base.target)], [`Projected at ${base.targetAge}`, `${f.money(base.projectedAtTarget)} (${f.pct(base.ratio)})`],
    ['Status', STATUS_TEXT[base.status]], ['Reaches target', base.estDate ? `${base.estDate.getFullYear()} (age ${base.estAge.toFixed(1)})` : 'After age 100'],
    ['Money lasts until', base.lastsText], ['Income it supports', `${f.money(base.sustainableIncome)}/yr`],
  ]);

  heading('Scenario comparison');
  const cols = [{ label: 'Scenario', w: 0.27 }, { label: 'Ready to retire', w: 0.13, align: 'right' }, { label: 'Projected at target age', w: 0.2, align: 'right' },
    { label: 'Funded', w: 0.1, align: 'right' }, { label: 'Money lasts', w: 0.12, align: 'right' }, { label: 'Income/yr', w: 0.18, align: 'right' }];
  const rowOf = (name, s, color, bold) => ({ color, bold, cells: [name, ageTxt(s), `${f.money(s.projectedAtTarget)} @ ${s.targetAge}`, f.pct(s.ratio), s.lastsText, f.money(s.sustainableIncome)],
    tones: [null, null, null, s.status === 'on-track' ? GOOD : s.status === 'behind' ? BAD : '#9a6700'] });
  table(cols, [rowOf('Current plan', base, BASE_COLOR, true), ...sims.map(({ sc, s }) => rowOf(sc.name, s, sc.color))]);

  // Chart
  ensure(300);
  sub('Projected retirement savings by age');
  const chartTop = y, chartH = 230;
  const all = [{ name: 'Current plan', color: BASE_COLOR, s: base, dash: [4, 3] }, ...sims.map(({ sc, s }) => ({ name: sc.name, color: sc.color, s }))];
  const maxAge = Math.min(100, Math.max(...all.map((a) => Math.max(a.s.targetAge + 10, (a.s.estAge || 0) + 3, a.s.age + 10))));
  const n = base.points.filter((p) => p.age <= maxAge + 0.01).length;
  const P = { l: 56, r: 10, t: 8, b: 24 };
  const px0 = M + P.l, px1 = M + W - P.r, py0 = chartTop + P.t, py1 = chartTop + chartH - P.b;
  const vals = all.flatMap((a) => a.s.points.slice(0, n).map((p) => p.balance)).concat([base.target]);
  const sc = niceScale(0, Math.max(...vals, 1)); sc.min = 0;
  const X = (i) => px0 + (n <= 1 ? 0 : (i * (px1 - px0)) / (n - 1));
  const Y = (v) => py1 - ((v - sc.min) / (sc.max - sc.min)) * (py1 - py0);
  for (let v = sc.min; v <= sc.max + sc.step / 2; v += sc.step) {
    pdf.line(px0, Y(v), px1, Y(v), { color: '#e6eaef', width: 0.5 });
    pdf.text(px0 - 6, Y(v) + 3, f.compact(v), { size: 7.5, color: MUTED, align: 'right' });
  }
  const every = Math.max(1, Math.ceil(n / 12));
  for (let i = 0; i < n; i += every) pdf.text(X(i), py1 + 13, String(Math.round(base.points[i].age)), { size: 7.5, color: MUTED, align: 'center' });
  pdf.text((px0 + px1) / 2, py1 + 23, 'Age', { size: 7.5, color: MUTED, align: 'center' });
  if (base.target) {
    pdf.line(px0, Y(base.target), px1, Y(base.target), { color: '#8c959f', width: 0.75, dash: [3, 3] });
    pdf.text(px0 + 4, Y(base.target) - 4, `Target ${f.money(base.target)}`, { size: 7.5, color: MUTED, bold: true });
  }
  const ti = base.points.findIndex((p) => Math.round(p.age) >= base.targetAge);
  if (ti >= 0 && ti < n) { pdf.line(X(ti), py0, X(ti), py1, { color: '#afb8c1', width: 0.75, dash: [1, 3] }); pdf.text(X(ti) + 4, py0 + 9, `Goal ${base.targetAge}`, { size: 7.5, color: MUTED }); }
  for (const a of all) pdf.polyline(a.s.points.slice(0, n).map((p, i) => [X(i), Y(p.balance)]), { color: a.color, width: 1.8, dash: a.dash });
  y = chartTop + chartH + 6;
  let lx = M + P.l;
  for (const a of all) {
    const label = pdf.fit(a.name, 150, 8.5);
    const wLab = pdf.width(label, 8.5) + 34;
    if (lx + wLab > M + W) { lx = M + P.l; y += 14; }
    ensure(14);
    pdf.line(lx, y + 6, lx + 16, y + 6, { color: a.color, width: 2, dash: a.dash });
    pdf.text(lx + 20, y + 9, label, { size: 8.5, color: MUTED });
    lx += wLab;
  }
  y += 22;

  // Each scenario
  for (const { sc: s0, s } of sims) {
    ensure(170);
    heading(`Scenario: ${s0.name}`, s0.color);
    if (s0.notes) { para(s0.notes, { color: MUTED }); y += 4; }
    sub('Assumptions');
    const changed = WI_KEYS.filter((k) => s0.assumptions && s0.assumptions[k] != null && s0.assumptions[k] !== data.retirement[k]);
    bullets(changed.length ? changed.map((k) => `${WI_LABELS[k]}: ${wiFmtAssumption(k, data.retirement[k], f)} -> ${wiFmtAssumption(k, s0.assumptions[k], f)}`) : ['Same as your current plan']);
    sub('Changes');
    bullets((s0.events || []).length ? s0.events.map((e) => describeEvent(e, data, s, f)) : ['No changes added']);
    const lw = wiLimitWarnings(data, s0, s);
    if (lw.length) { sub(`Contribution-limit warnings (${taxYear()} IRS limits)`); bullets(lw); }
    sub('Results compared with your current plan');
    const money = (v) => f.money(v);
    const ageDiff = (a, b) => (a == null || b == null ? '—' : Math.abs(a - b) < 0.05 ? '—' : `${a > b ? '+' : '−'}${Math.abs(a - b).toFixed(1)} yrs`);
    const rows = [
      ['Ready to retire (reach target)', ageTxt(base), ageTxt(s), ageDiff(s.estAge, base.estAge), s.estAge != null && base.estAge != null && Math.abs(base.estAge - s.estAge) >= 0.05 ? (s.estAge < base.estAge ? GOOD : BAD) : null],
      [`Projected at target age`, `${money(base.projectedAtTarget)} @ ${base.targetAge}`, `${money(s.projectedAtTarget)} @ ${s.targetAge}`, delta(s.projectedAtTarget - base.projectedAtTarget, money), toneOf(s.projectedAtTarget - base.projectedAtTarget)],
      ['Target nest egg', money(base.target), money(s.target), delta(s.target - base.target, money), null],
      ['Funded at target age', f.pct(base.ratio), f.pct(s.ratio), Math.abs(s.ratio - base.ratio) < 0.005 ? '—' : `${s.ratio > base.ratio ? '+' : '−'}${Math.round(Math.abs(s.ratio - base.ratio) * 100)} pts`, toneOf((s.ratio - base.ratio) * 1000)],
      ['Status', STATUS_TEXT[base.status], STATUS_TEXT[s.status], '', null],
      ['Money lasts until', base.lastsText, s.lastsText, '', null],
      ['Income it supports', `${money(base.sustainableIncome)}/yr`, `${money(s.sustainableIncome)}/yr`, delta(s.sustainableIncome - base.sustainableIncome, money), toneOf(s.sustainableIncome - base.sustainableIncome)],
      ['Contributions now', `${money(base.contribNow)}/yr`, `${money(s.contribNow)}/yr`, delta(s.contribNow - base.contribNow, money), null],
      ['Extra savings needed for target', base.extraNeededYr > 0.5 ? `${money(base.extraNeededYr)}/yr` : 'None', s.extraNeededYr > 0.5 ? `${money(s.extraNeededYr)}/yr` : 'None', '', null],
    ];
    table([{ label: 'Measure', w: 0.34 }, { label: 'Current plan', w: 0.22, align: 'right' }, { label: 'This scenario', w: 0.24, align: 'right' }, { label: 'Difference', w: 0.2, align: 'right' }],
      rows.map((rw) => ({ cells: rw.slice(0, 4), tones: [null, null, null, rw[4]] })));
  }

  // How it's calculated + sources
  heading('How these projections are calculated');
  bullets([
    'Target nest egg = (desired yearly income - Social Security/pension) ÷ withdrawal rate.',
    'Real return = (1 + expected return) ÷ (1 + inflation) - 1, so all amounts are in today’s dollars.',
    'Each month, every account grows by the monthly real return and that month’s contributions are added; scenario changes adjust contributions, returns or balances from their start dates.',
    'Ready to retire = the first month the projected balance reaches the target nest egg. Funded = projected balance at the target age ÷ target (on track at 100%+, slightly behind at 85–99%).',
    'Money lasts until = starting at the target age, withdraw the yearly need each month at the same real return until savings run out.',
    'Not modeled: taxes on withdrawals, year-to-year market swings (sequence-of-returns risk), changes in Social Security rules, or one-off retirement costs.',
  ]);
  sub('Sources & further reading');
  for (const [group, keys] of SOURCE_GROUPS) {
    ensure(30);
    pdf.text(M, y + 10, group, { size: 9, bold: true, color: MUTED });
    y += 15;
    for (const k of keys) {
      const src = SOURCES[k];
      ensure(30);
      const t = pdf.fit(`${src.title} — ${src.by}`, W - 14, 9, true);
      pdf.text(M + 14, y + 9, t, { size: 9, bold: true, color: '#0969da' });
      pdf.link(M + 14, y, pdf.width(t, 9, true), 12, src.url);
      y += 12;
      const u = pdf.fit(src.url, W - 14, 8);
      pdf.text(M + 14, y + 8, u, { size: 8, color: '#0969da' });
      pdf.link(M + 14, y, pdf.width(u, 8), 11, src.url);
      y += 15;
    }
    y += 2;
  }

  // Footers
  pdf.pages.forEach((pg, i) => {
    pdf.page = pg;
    pdf.line(M, pdf.H - 38, M + W, pdf.H - 38, { color: LINE, width: 0.5 });
    pdf.text(M, pdf.H - 26, 'Finance Dashboard · Retirement what-if scenarios · Predictions only — not guarantees or financial advice', { size: 7.5, color: MUTED });
    pdf.text(M + W, pdf.H - 26, `Page ${i + 1} of ${pdf.pages.length}`, { size: 7.5, color: MUTED, align: 'right' });
  });
  return pdf.output();
}

/* ================================================= retirement: modals & helpers */

function mkButton(parent, icon, label, onClick, cls) {
  const b = parent.createEl('button', { cls: 'fd-btn' + (cls ? ' ' + cls : ''), attr: { 'aria-label': label } });
  if (icon) setIcon(b.createSpan({ cls: 'fd-btn-icon' }), icon);
  if (label) b.createSpan({ text: label });
  b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); onClick(e); });
  return b;
}
function mkIconButton(parent, icon, label, onClick) {
  const b = parent.createEl('button', { cls: 'fd-icon-btn clickable-icon', attr: { 'aria-label': label, title: label } });
  setIcon(b, icon);
  b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); onClick(e); });
  return b;
}
/** “This is a prediction” notice used on the retirement page, overview, explainer and what-if planner. */
function predictionNote(parent, compact) {
  const n = parent.createDiv({ cls: 'fd-prediction' + (compact ? ' is-compact' : ''), attr: { role: 'note' } });
  setIcon(n.createSpan({ cls: 'fd-prediction-icon' }), 'alert-triangle');
  const t = n.createDiv({ cls: 'fd-prediction-text' });
  t.createEl('strong', { text: 'Prediction, not a guarantee. ' });
  t.createSpan({ text: compact
    ? 'These are estimates from your inputs and steady average returns; actual results will differ. Not financial advice.'
    : 'Retirement figures are estimates based on your inputs, steady average returns and today’s dollars. Real markets, taxes, fees and life changes will make actual results differ — possibly by a lot. Use them for planning, not as a promise, and consider a qualified professional for financial, tax or legal advice.' });
  return n;
}

/** Ready-made scenarios for the What-if planner and the explainer’s “Try it” buttons. */
function wiPresets(data, f) {
  const base = simulateRetirement(data, null);
  const accts = base.accounts;
  const roth = accts.find((a) => /roth/i.test(a.kind || '')) || accts[0];
  const work = accts.find((a) => /401|403|457/i.test(a.kind || '')) || accts[0];
  const inc = incomeOn(data, todayISO()).cur;
  const g = inc ? num(inc.gross) : 0;
  const share = g ? clamp(Math.round((base.contribution / (g * 12)) * 100), 5, 50) : 15;
  const r = data.retirement, ta = num(r.targetAge);
  const id = (a) => (a ? a.id : OTHER_BUCKET), nm = (a) => (a ? a.name : 'savings');
  return [
    { key: 'roth100', label: `+${f.money(100)}/mo to ${nm(roth)}`, sc: { name: `+${f.money(100)}/mo to ${nm(roth)}`, events: [{ type: 'contrib', account: id(roth), amount: 100, start: { mode: 'now' } }] } },
    { key: 'raise2', label: 'Raise in 2 years', sc: { name: g ? '5% raise in 2 years' : 'Pay increase in 2 years', events: [{ type: 'pay', mode: g ? 'pct' : 'amount', value: g ? 5 : 500, saveShare: share, account: id(work), start: { mode: 'years', value: 2 } }] } },
    { key: 'later2', label: 'Retire 2 years later', sc: { name: `Retire at ${ta + 2}`, assumptions: { targetAge: ta + 2 } } },
    { key: 'earlier3', label: 'Retire 3 years earlier', sc: { name: `Retire at ${ta - 3}`, assumptions: { targetAge: ta - 3 } } },
    { key: 'lowret', label: 'Lower returns (5%)', sc: { name: 'Lower returns (5%)', assumptions: { expectedReturn: 5 } } },
    { key: 'bonus', label: `${f.compact(10000)} bonus invested`, sc: { name: `${f.compact(10000)} bonus invested`, events: [{ type: 'lump', account: id(work), amount: 10000, start: { mode: 'now' } }] } },
    { key: 'break', label: '1-year career break', sc: { name: '1-year career break in 3 years', events: [{ type: 'pause', start: { mode: 'years', value: 3 }, end: { mode: 'years', value: 4 } }] } },
    { key: 'spend10', label: 'Spend 10% less', sc: { name: 'Spend 10% less in retirement', assumptions: { annualIncome: Math.round(num(r.annualIncome) * 0.9) } } },
  ];
}

/** Explainer opened from the (?) icon: the math with your numbers, ways to improve, limits, sources. */
class RetirementInfoModal extends Modal {
  constructor(app, plugin) { super(app); this.plugin = plugin; }
  onOpen() {
    const d = this.plugin.data, f = new Fmt(d.settings), r = d.retirement;
    const plan = retirementPlan(d), sim = simulateRetirement(d, null);
    const ctx = () => ({ plan, f, r });
    this.modalEl.addClass('fd-modal', 'fd-info-modal');
    this.titleEl.setText('How your retirement projection works');
    const c = this.contentEl;
    c.empty();
    predictionNote(c, false);

    const sum0 = c.createDiv({ cls: `fd-callout is-${plan.status}` });
    sum0.createEl('strong', { text: `${STATUS_TEXT[plan.status]}. ` });
    sum0.createSpan({ text: retirementSentence(plan, f) });

    const section = (title, icon) => {
      const s = c.createDiv({ cls: 'fd-info-section' });
      const h = s.createEl('h3');
      if (icon) setIcon(h.createSpan({ cls: 'fd-info-h-icon' }), icon);
      h.createSpan({ text: title });
      return s;
    };
    const srcRow = (parent, keys) => {
      if (!keys || !keys.length) return;
      const row = parent.createDiv({ cls: 'fd-src-row' });
      row.createSpan({ cls: 'fd-muted', text: 'Sources: ' });
      keys.forEach((k, i) => { if (i) row.append(' · '); sourceLink(row, k, SOURCES[k].by.split(' · ')[0] === 'Wikipedia' ? SOURCES[k].title.split(' (')[0] : SOURCES[k].title.split(' (')[0]); });
    };

    // 1. The math, step by step with the person's numbers
    const s1 = section('How it’s calculated', 'calculator');
    const ol = s1.createEl('ol', { cls: 'fd-steps' });
    const wr = num(r.withdrawalRate), rm = Math.pow(1 + plan.real, 1 / 12) - 1;
    const step = (title, help, text, formula, sources) => {
      const li = ol.createEl('li', { cls: 'fd-step' });
      const h = li.createDiv({ cls: 'fd-step-title' });
      if (help) termEl(h, title, help, ctx); else h.setText(title);
      li.createDiv({ cls: 'fd-step-text', text });
      if (formula) li.createDiv({ cls: 'fd-formula', text: formula });
      srcRow(li, sources);
    };
    step('Set your target nest egg', 'targetNestEgg', 'Your savings need to cover the income you want minus what Social Security or a pension pays. Dividing by your withdrawal rate gives the balance that can sustain that.',
      `(${f.money(num(r.annualIncome))} − ${f.money(num(r.otherIncome))}) ÷ ${wr}% = ${f.money(plan.target)}`, ['trinity', 'cooley', 'bengen', 'morningstar']);
    step('Turn your return into a real return', 'returnInflation', 'Everything is in today’s dollars, so inflation is taken out of your expected return instead of inflating your target.',
      `(1 + ${num(r.expectedReturn)}%) ÷ (1 + ${num(r.inflation)}%) − 1 = ${f.pct(plan.real, 2)}/yr ≈ ${f.pct(rm, 3)}/month`, ['fisher', 'damodaran', 'cpi']);
    step('Start from today’s savings', null, `${f.money(plan.balance)} across ${plan.accounts.length} account${plan.accounts.length === 1 ? '' : 's'}${r.includeInvestments ? ' (including taxable investments)' : ''}, plus ${f.money(plan.contribution)}/yr in contributions.`, null, null);
    step('Grow it month by month', 'projected', 'Each month the balance earns the monthly real return, then that month’s contributions are added — compound growth.',
      `next month = balance × (1 + ${f.pct(rm, 3)}) + ${f.money(plan.contribution / 12)}`, ['compound']);
    step(`Compare at your target age (${plan.targetAge})`, 'status', 'The projected balance at your target age is divided by your target. 100%+ is on track, 85–99% slightly behind, under 85% off track.',
      `${f.money(plan.projectedAtTarget)} ÷ ${f.money(plan.target)} = ${f.pct(plan.ratio)} → ${STATUS_TEXT[plan.status]}`, null);
    step('Estimate when you’re ready', 'estimatedRetirement', 'The first month the projected balance reaches the target, if you keep saving at today’s rate.',
      plan.estDate ? `${plan.estDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })} · age ${plan.estAge.toFixed(1)}` : 'Not reached by age 100 at today’s rate', null);
    step('Work out what it would take', 'neededContribution', 'The steady yearly contribution that lands exactly on your target at your target age (the standard future-value-of-savings formula, solved for the payment).',
      plan.requiredContribution > plan.contribution ? `${f.money(plan.requiredContribution)}/yr needed — ${f.money(plan.requiredContribution - plan.contribution)}/yr more than today` : `${f.money(plan.requiredContribution)}/yr would be enough — you’re already saving ${f.money(plan.contribution)}/yr`, ['savingsGoal']);
    step('Check how long it lasts', 'moneyLasts', 'Starting at your target age, the yearly need is withdrawn monthly at the same real return until the money runs out.',
      `${f.money(sim.projectedAtTarget)} withdrawing ${f.money(sim.need)}/yr → lasts until ${sim.lastsText.replace('Age ', 'age ')}`, ['trinity']);

    // 2. Personalized levers
    const s2 = section('What could improve your outcome', 'lightbulb');
    s2.createDiv({ cls: 'fd-muted fd-info-intro', text: 'Each row changes one thing and reruns your projection. These are predictions too — use “Try it” to explore in the What-if planner.' });
    const accts = sim.accounts, first = accts[0] ? accts[0].id : OTHER_BUCKET;
    const inc = incomeOn(d, todayISO()).cur;
    const levers = [
      { name: `Save ${f.money(100)}/mo more`, sc: { name: `Save ${f.money(100)}/mo more`, events: [{ type: 'contrib', account: first, amount: 100, start: { mode: 'now' } }] } },
      { name: `Save ${f.money(500)}/mo more`, sc: { name: `Save ${f.money(500)}/mo more`, events: [{ type: 'contrib', account: first, amount: 500, start: { mode: 'now' } }] } },
    ];
    if (sim.extraNeededYr > 1) levers.push({ name: `Save ${f.money(sim.extraNeededYr / 12)}/mo more (what’s needed)`, sc: { name: 'Save what’s needed', events: [{ type: 'contrib', account: first, amount: Math.ceil(sim.extraNeededYr / 12), start: { mode: 'now' } }] } });
    if (inc && num(inc.gross)) levers.push({ name: 'Raise contributions by 1% of pay', sc: { name: 'Contribute 1% more of pay', events: [{ type: 'contrib', account: first, amount: Math.round(num(inc.gross) * 0.01), start: { mode: 'now' } }] } });
    levers.push({ name: `Retire 2 years later (${plan.targetAge + 2})`, sc: { name: `Retire at ${plan.targetAge + 2}`, assumptions: { targetAge: plan.targetAge + 2 } } });
    levers.push({ name: 'Spend 10% less in retirement', sc: { name: 'Spend 10% less in retirement', assumptions: { annualIncome: Math.round(num(r.annualIncome) * 0.9) } } });
    levers.push({ name: '0.5% higher return (e.g. lower fees)', src: 'fees', sc: { name: '0.5% lower fees', assumptions: { expectedReturn: Math.round((num(r.expectedReturn) + 0.5) * 100) / 100 } } });
    const t = s2.createEl('table', { cls: 'fd-table fd-info-table' });
    const hr = t.createEl('thead').createEl('tr');
    ['Change', 'Projected at target age', 'Funded', 'Ready to retire', ''].forEach((h, i) => hr.createEl('th', { text: h, cls: i && i < 4 ? 'is-num' : '' }));
    const tb = t.createEl('tbody');
    const row = (name, s, lever) => {
      const tr = tb.createEl('tr', { cls: lever ? '' : 'fd-info-base' });
      const td = tr.createEl('td');
      td.createSpan({ text: name });
      if (lever && lever.src) { td.append(' '); sourceLink(td, lever.src, '(why)'); }
      const dv = s.projectedAtTarget - sim.projectedAtTarget;
      const pc = tr.createEl('td', { cls: 'is-num' });
      pc.createDiv({ text: `${f.money(s.projectedAtTarget)} @ ${s.targetAge}` });
      if (lever && Math.abs(dv) >= 1) pc.createDiv({ cls: dv > 0 ? 'fd-good fd-small' : 'fd-bad fd-small', text: `${dv > 0 ? '+' : '−'}${f.money(Math.abs(dv))}` });
      tr.createEl('td', { cls: 'is-num' }).createSpan({ cls: `fd-badge is-${s.status}`, text: f.pct(s.ratio) });
      tr.createEl('td', { cls: 'is-num', text: s.estAge != null ? `Age ${s.estAge.toFixed(1)}` : 'After 100' });
      const act = tr.createEl('td', { cls: 'fd-row-actions-visible' });
      if (lever) mkButton(act, 'flask-conical', 'Try it', () => { this.close(); new WhatIfModal(this.app, this.plugin, { create: lever.sc }).open(); }, 'is-small');
    };
    row('Your current plan', sim, null);
    for (const lv of levers) row(lv.name, simulateRetirement(d, lv.sc), lv);

    const tips = s2.createEl('ul', { cls: 'fd-info-tips' });
    const tip = (text, src) => { const li = tips.createEl('li'); li.createSpan({ text }); if (src) { li.append(' '); sourceLink(li, src, 'Learn more'); } };
    tip('Capture your full employer match — it’s extra money for the same contribution.');
    tip('Raise contributions with every pay rise (for example, save half of each raise); automatic escalation makes it painless.');
    tip('Use tax-advantaged accounts such as a 401(k)/403(b), IRA and, if eligible, an HSA, and keep a mix of tax treatments for flexible withdrawals.');
    tip('Keep fund fees low — fees come straight out of your return, and the difference compounds for decades.', 'fees');
    tip('In the U.S., waiting to claim Social Security past full retirement age raises your benefit for each month you wait, up to age 70.', 'ssaDelay');
    tip('Use your official benefit estimate for “Social Security / pension” instead of a guess.', 'ssaEstimate');
    tip('Revisit your desired income: a paid-off home, downsizing or a lower-cost area can reduce it.');
    tip('Update balances regularly so the projection starts from real numbers.');

    // Tax rules that affect your retirement accounts
    const sT = section('Tax rules used', 'landmark');
    taxRulesBar(sT, this.plugin);
    const TR = taxR();
    const tl = sT.createEl('ul', { cls: 'fd-info-tips' });
    for (const c of contributionChecks(d)) { const li = tl.createEl('li'); li.createEl('strong', { text: `${c.label}: ` }); li.append(`${f.money(c.contribution)}/yr vs ${f.money(c.limit)} limit for you. ${c.note}`); }
    tl.createEl('li', { text: `Withdrawals from tax-deferred accounts before ${TR.earlyAge === 59.5 ? '59½' : TR.earlyAge} generally owe an extra ${TR.earlyPenalty}% tax${plan.targetAge < TR.earlyAge ? ` — relevant because your target age is ${plan.targetAge}` : ''}.` });
    tl.createEl('li', { text: `Required minimum distributions from tax-deferred accounts generally start at ${TR.rmdAge}; Roth accounts have none while you’re alive.` });
    tl.createEl('li', { text: 'The projection itself is before tax. Traditional (tax-deferred) withdrawals will be taxed as income; qualified Roth withdrawals won’t — see the Net Worth (?) panel for an after-tax estimate.' });
    srcRow(sT, ['irsLimits', 'rmd', 'tc557', 'tc558', 'roth', 'pub969']);

    // 3. Limits
    const s3 = section('What this doesn’t include', 'alert-triangle');
    const lim = s3.createEl('ul', { cls: 'fd-info-tips' });
    for (const x of [
      'Steady average returns every year. Real markets go up and down, and a downturn early in retirement (sequence-of-returns risk) can matter a lot.',
      'Taxes on withdrawals and fund fees (unless you lowered your expected return to reflect them).',
      'Contributions keep going after your target age on the chart, so you can see when the target is reached; the “money lasts” check assumes you stop saving at your target age.',
      'Changes to Social Security rules, healthcare and long-term-care costs, or one-off expenses.',
      'Everything is in today’s dollars; your actual balances will be larger in future dollars.',
    ]) lim.createEl('li', { text: x });

    // 4. Sources
    const s4 = section('Sources & further reading', 'book-open');
    for (const [group, keys] of SOURCE_GROUPS) {
      s4.createDiv({ cls: 'fd-src-group', text: group });
      const ul = s4.createEl('ul', { cls: 'fd-src-list' });
      for (const k of keys) {
        const s = SOURCES[k], li = ul.createEl('li');
        sourceLink(li, k);
        li.createSpan({ cls: 'fd-muted', text: ` — ${s.by}` });
        li.createDiv({ cls: 'fd-src-why', text: s.why });
      }
    }

    const b = c.createDiv({ cls: 'fd-form-buttons fd-info-buttons' });
    b.createDiv({ cls: 'fd-spacer' });
    mkButton(b, 'settings-2', 'Edit goals', () => { this.close(); this.plugin.editRetirementGoals(); });
    mkButton(b, 'flask-conical', 'Open What-if planner', () => { this.close(); this.plugin.openWhatIf(); }, 'mod-cta');
  }
  onClose() { Tip.hide(); this.contentEl.empty(); }
}

/** Large sandbox for testing retirement scenarios. Works on copies; never changes the dashboard. */
class WhatIfModal extends Modal {
  constructor(app, plugin, opts = {}) { super(app); this.plugin = plugin; this.opts = opts; }
  get data() { return this.plugin.data; }
  get store() {
    const d = this.data;
    if (!d.whatIf || !Array.isArray(d.whatIf.scenarios)) d.whatIf = { scenarios: [], selected: 'base' };
    return d.whatIf;
  }
  async persist() { await this.plugin.save(); this.render(); }
  onOpen() {
    this.modalEl.addClass('fd-modal', 'fd-whatif-modal');
    this.titleEl.setText('What-if planner');
    if (this.opts.create) this.addScenario(this.opts.create, false);
    this.render();
    if (this.opts.create) this.plugin.save();
  }
  onClose() { Tip.hide(); this.contentEl.empty(); }
  current() { return this.store.scenarios.find((s) => s.id === this.store.selected) || null; }
  nextColor() {
    const used = new Set(this.store.scenarios.map((s) => s.color));
    return SC_COLORS.find((c) => !used.has(c)) || SC_COLORS[this.store.scenarios.length % SC_COLORS.length];
  }
  addScenario(preset, save = true) {
    const p = preset ? JSON.parse(JSON.stringify(preset)) : {};
    const sc = Object.assign({ name: `Scenario ${this.store.scenarios.length + 1}`, visible: true, assumptions: {}, events: [], notes: '' }, p,
      { id: uid(), color: this.nextColor(), created: todayISO() });
    sc.events = (sc.events || []).map((e) => Object.assign({}, e, { id: uid() }));
    this.store.scenarios.push(sc);
    this.store.selected = sc.id;
    if (save) this.persist();
    return sc;
  }
  duplicate(sc) {
    const copy = JSON.parse(JSON.stringify(sc));
    delete copy.id; delete copy.color;
    copy.name = `${sc.name} (copy)`;
    this.addScenario(copy);
  }
  remove(sc) {
    new ConfirmModal(this.app, `Delete “${sc.name}”?`, 'This scenario and its changes will be removed. Your dashboard is not affected.', async () => {
      this.store.scenarios = this.store.scenarios.filter((s) => s.id !== sc.id);
      this.store.selected = 'base';
      await this.persist();
    }, 'Delete').open();
  }

  render() {
    const oldMain = this.contentEl.querySelector('.fd-wi-main');
    const scroll = oldMain ? oldMain.scrollTop : 0;
    Tip.hide();
    const c = this.contentEl;
    c.empty();
    c.addClass('fd-wi-content');
    const d = this.data;
    this.f = new Fmt(d.settings);
    this.base = simulateRetirement(d, null);
    this.sims = new Map(this.store.scenarios.map((s) => [s.id, simulateRetirement(d, s)]));
    if (this.store.selected !== 'base' && !this.current()) this.store.selected = 'base';

    const top = c.createDiv({ cls: 'fd-wi-top' });
    const sb = top.createDiv({ cls: 'fd-wi-sandbox' });
    setIcon(sb.createSpan({ cls: 'fd-wi-sandbox-icon' }), 'flask-conical');
    sb.createSpan({ text: 'Sandbox — nothing here changes your dashboard, accounts or predictions. Scenarios are saved so you can come back to them.' });
    const acts = top.createDiv({ cls: 'fd-wi-top-actions' });
    mkButton(acts, 'file-down', 'Save as PDF', () => this.exportPDF(), 'mod-cta');
    mkIconButton(acts, 'circle-help', 'How the projection works', () => new RetirementInfoModal(this.app, this.plugin).open()).addClass('fd-info-btn');
    // Prediction disclaimer on its own row at the very top.
    c.insertBefore(predictionNote(c, true), top);

    const lay = c.createDiv({ cls: 'fd-wi-layout' });
    this.renderSide(lay.createDiv({ cls: 'fd-wi-side' }));
    const main = lay.createDiv({ cls: 'fd-wi-main' });
    this.renderMain(main);
    main.scrollTop = scroll;
  }

  renderSide(side) {
    const f = this.f;
    const head = side.createDiv({ cls: 'fd-wi-side-head' });
    head.createSpan({ cls: 'fd-wi-side-title', text: 'Scenarios' });
    mkButton(head, 'plus', 'New', () => this.addScenario(), 'is-small');
    const list = side.createDiv({ cls: 'fd-wi-list' });
    const item = (id, name, color, s, sc) => {
      const it = list.createDiv({ cls: 'fd-wi-item' + (this.store.selected === id ? ' is-active' : '') + (sc && sc.visible === false ? ' is-hidden' : ''), attr: { role: 'button', tabindex: '0' } });
      const sw = it.createSpan({ cls: 'fd-swatch fd-wi-sw' + (sc ? '' : ' is-dashed') });
      sw.style.setProperty('--sw', color);
      const tx = it.createDiv({ cls: 'fd-wi-item-text' });
      tx.createDiv({ cls: 'fd-wi-item-name', text: name });
      tx.createDiv({ cls: 'fd-wi-item-sub', text: `${s.estAge != null ? `Ready at ${s.estAge.toFixed(1)}` : 'Not by 100'} · ${f.pct(s.ratio)} funded` });
      if (sc) {
        const eye = mkIconButton(it, sc.visible === false ? 'eye-off' : 'eye', sc.visible === false ? 'Show on chart' : 'Hide from chart', async () => { sc.visible = sc.visible === false; await this.persist(); });
        eye.addClass('fd-wi-eye');
      }
      const pick = () => { this.store.selected = id; this.persist(); };
      it.addEventListener('click', pick);
      it.addEventListener('keydown', (e) => { if (e.key === 'Enter') pick(); });
    };
    item('base', 'Current plan', BASE_COLOR, this.base, null);
    for (const sc of this.store.scenarios) item(sc.id, sc.name, sc.color, this.sims.get(sc.id), sc);
    if (!this.store.scenarios.length) list.createDiv({ cls: 'fd-wi-empty', text: 'No scenarios yet — start a new one or pick a quick idea.' });
    const ideas = side.createDiv({ cls: 'fd-wi-ideas' });
    ideas.createDiv({ cls: 'fd-wi-side-title', text: 'Quick ideas' });
    const chips = ideas.createDiv({ cls: 'fd-wi-chips' });
    for (const p of wiPresets(this.data, f)) {
      const ch = chips.createEl('button', { cls: 'fd-wi-chip', text: p.label });
      ch.addEventListener('click', () => this.addScenario(p.sc));
    }
  }

  renderMain(main) {
    const f = this.f, d = this.data, base = this.base;
    const sc = this.current();
    const s = sc ? this.sims.get(sc.id) : base;
    const ctx = () => ({ plan: s, f, r: s.r });

    const head = main.createDiv({ cls: 'fd-wi-head' });
    head.createSpan({ cls: 'fd-swatch fd-wi-head-sw' + (sc ? '' : ' is-dashed') }).style.setProperty('--sw', sc ? sc.color : BASE_COLOR);
    if (sc) {
      const name = head.createEl('input', { cls: 'fd-wi-name', attr: { type: 'text', 'aria-label': 'Scenario name' } });
      name.value = sc.name;
      name.addEventListener('change', async () => { sc.name = name.value.trim() || sc.name; await this.persist(); });
      name.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); name.blur(); } });
      const ha = head.createDiv({ cls: 'fd-wi-head-actions' });
      mkButton(ha, 'copy', 'Duplicate', () => this.duplicate(sc), 'is-small');
      mkButton(ha, 'trash-2', 'Delete', () => this.remove(sc), 'is-small fd-danger');
    } else {
      const t = head.createDiv({ cls: 'fd-wi-head-text' });
      t.createEl('h3', { text: 'Your current plan' });
      t.createDiv({ cls: 'fd-muted', text: 'What your dashboard predicts today. Create a scenario to test changes side by side.' });
      mkButton(head, 'plus', 'New scenario', () => this.addScenario(), 'mod-cta');
    }

    // Results
    const tiles = main.createDiv({ cls: 'fd-wi-tiles' });
    const cmp = !!sc;
    const tile = (label, help, value, o = {}) => {
      const t = tiles.createDiv({ cls: 'fd-wi-tile' });
      termEl(t.createDiv({ cls: 'fd-wi-tile-label' }), label, help, ctx);
      const v = t.createDiv({ cls: 'fd-wi-tile-value', text: value });
      if (o.badge) v.createSpan({ cls: `fd-badge is-${o.badge}`, text: STATUS_TEXT[o.badge] });
      if (cmp && o.delta !== undefined) t.createDiv({ cls: `fd-wi-delta is-${o.tone || 'flat'}`, text: o.delta ? `${o.delta} vs current` : 'Same as current' });
      if (o.sub) t.createDiv({ cls: 'fd-wi-tile-sub', text: o.sub });
    };
    const money = (v) => f.money(v);
    const dMoney = (v) => (Math.abs(v) < 1 ? '' : `${v > 0 ? '+' : '−'}${money(Math.abs(v))}`);
    const tone = (v, upGood = true) => (Math.abs(v) < 1e-9 ? 'flat' : (v > 0) === upGood ? 'good' : 'bad');
    const dYears = (a, b) => (a == null || b == null || Math.abs(a - b) < 0.05 ? '' : `${a > b ? '+' : '−'}${Math.abs(a - b).toFixed(1)} yrs`);
    tile('Ready to retire', 'estimatedRetirement', s.estAge != null ? `Age ${s.estAge.toFixed(1)}` : 'After 100',
      { delta: dYears(s.estAge, base.estAge), tone: s.estAge != null && base.estAge != null ? tone(base.estAge - s.estAge) : (s.estAge != null ? 'good' : base.estAge != null ? 'bad' : 'flat'),
        sub: s.estDate ? s.estDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) : 'Target not reached by 100' });
    tile(`Projected at ${s.targetAge}`, 'projected', money(s.projectedAtTarget), { delta: dMoney(s.projectedAtTarget - base.projectedAtTarget), tone: tone(s.projectedAtTarget - base.projectedAtTarget), sub: `Target ${money(s.target)}` });
    tile('Funded at target age', 'status', f.pct(s.ratio), { badge: s.status, delta: Math.abs(s.ratio - base.ratio) < 0.005 ? '' : `${s.ratio > base.ratio ? '+' : '−'}${Math.round(Math.abs(s.ratio - base.ratio) * 100)} pts`, tone: tone(s.ratio - base.ratio) });
    const lastsVal = (x) => (x.need <= 0 || x.lastsAge == null || x.lastsAge > 100 ? 101 : x.lastsAge);
    tile('Money lasts until', 'moneyLasts', s.lastsText, { delta: s.lastsText === base.lastsText ? '' : `was ${base.lastsText.toLowerCase()}`,
      tone: s.lastsText === base.lastsText ? 'flat' : lastsVal(s) > lastsVal(base) ? 'good' : 'bad', sub: `Withdrawing ${money(s.need)}/yr from ${s.targetAge}` });
    tile('Income it supports', 'sustainableIncome', `${money(s.sustainableIncome)}/yr`, { delta: dMoney(s.sustainableIncome - base.sustainableIncome), tone: tone(s.sustainableIncome - base.sustainableIncome), sub: `Goal ${money(num(s.r.annualIncome))}/yr` });
    tile('Extra needed for target', 'neededContribution', s.extraNeededYr > 0.5 ? `${money(s.extraNeededYr)}/yr` : 'None', { delta: dMoney(s.extraNeededYr - base.extraNeededYr), tone: tone(base.extraNeededYr - s.extraNeededYr),
      sub: s.extraNeededYr > 0.5 ? `${money(s.extraNeededYr / 12)}/mo more from now` : `On track at ${s.targetAge}` });

    // Chart
    const cc = main.createDiv({ cls: 'fd-wi-card' });
    const chh = cc.createDiv({ cls: 'fd-wi-card-head' });
    const h4 = chh.createEl('h4');
    termEl(h4, 'Projected retirement savings', 'projected', ctx);
    chh.createSpan({ cls: 'fd-muted', text: 'Predicted by age, in today’s dollars' });
    const lines = [{ id: 'base', name: 'Current plan', color: BASE_COLOR, s: base, dashed: !!sc }];
    for (const x of this.store.scenarios) if (x.visible !== false || x === sc) lines.push({ id: x.id, name: x.name, color: x.color, s: this.sims.get(x.id) });
    const maxAge = Math.min(100, Math.max(...lines.map((l) => Math.max(l.s.targetAge + 10, (l.s.estAge || 0) + 3, l.s.age + 10))));
    const n = base.points.filter((p) => p.age <= maxAge + 0.01).length;
    const labels = base.points.slice(0, n).map((p) => String(Math.round(p.age)));
    const ti = base.points.findIndex((p) => Math.round(p.age) >= s.targetAge);
    lineChart(cc, { labels, height: 260, legend: true, zeroBased: true, maxXLabels: 12,
      series: lines.map((l) => ({ name: l.name, color: l.color, values: l.s.points.slice(0, n).map((p) => p.balance), dashed: l.dashed, noDots: true, area: l.id === (sc ? sc.id : 'base') })),
      hlines: s.target ? [{ value: s.target, label: `Target ${money(s.target)}`, color: 'var(--text-muted)' }] : [],
      vlines: ti >= 0 && ti < n ? [{ index: ti, label: `Goal ${s.targetAge}` }] : [],
      fmt: (v) => f.compact(v), tipFmt: (v) => money(v),
      tipTitle: (i) => `Age ${labels[i]} · ${new Date().getFullYear() + i}`,
      tipExtra: (i) => {
        const v = s.points[i] ? s.points[i].balance : 0;
        return s.target ? [{ label: `${sc ? sc.name : 'Current plan'} vs target`, value: f.pct(v / s.target), muted: true }] : [];
      } });

    if (sc) {
      const cols = main.createDiv({ cls: 'fd-wi-cols' });
      // Assumptions
      const ac = cols.createDiv({ cls: 'fd-wi-card' });
      const ah = ac.createDiv({ cls: 'fd-wi-card-head' });
      ah.createEl('h4', { text: 'Assumptions' });
      const changed = WI_KEYS.filter((k) => sc.assumptions && sc.assumptions[k] != null);
      const at = ah.createDiv({ cls: 'fd-card-tools' });
      if (changed.length) mkButton(at, 'rotate-ccw', 'Reset', async () => { sc.assumptions = {}; await this.persist(); }, 'is-small');
      mkButton(at, 'pencil', 'Edit', () => this.editAssumptions(sc), 'is-small');
      const tbl = ac.createEl('table', { cls: 'fd-table fd-wi-assume' });
      const thr = tbl.createEl('thead').createEl('tr');
      ['', 'Current plan', 'This scenario'].forEach((h, i) => thr.createEl('th', { text: h, cls: i ? 'is-num' : '' }));
      const tb = tbl.createEl('tbody');
      for (const k of WI_KEYS) {
        const tr = tb.createEl('tr', { cls: changed.includes(k) ? 'is-changed' : '' });
        termEl(tr.createEl('td'), WI_LABELS[k], WI_HELP[k], ctx);
        tr.createEl('td', { cls: 'is-num fd-muted', text: wiFmtAssumption(k, d.retirement[k], f) });
        tr.createEl('td', { cls: 'is-num', text: wiFmtAssumption(k, s.r[k], f) });
      }
      // Changes
      const ec = cols.createDiv({ cls: 'fd-wi-card' });
      const eh = ec.createDiv({ cls: 'fd-wi-card-head' });
      eh.createEl('h4', { text: 'Changes' });
      eh.createSpan({ cls: 'fd-muted', text: `${(sc.events || []).length} in this scenario` });
      const list = ec.createDiv({ cls: 'fd-wi-events' });
      if (!(sc.events || []).length) list.createDiv({ cls: 'fd-wi-empty', text: 'No changes yet. Add one below — for example extra contributions starting now or a raise in two years.' });
      for (const e of sc.events || []) {
        const row = list.createDiv({ cls: 'fd-wi-event', attr: { role: 'button', tabindex: '0' } });
        setIcon(row.createSpan({ cls: `fd-wi-event-icon is-${e.type}` }), (EVENT_TYPES[e.type] || {}).icon || 'circle');
        const tx = row.createDiv({ cls: 'fd-wi-event-text' });
        tx.createDiv({ cls: 'fd-wi-event-type', text: (EVENT_TYPES[e.type] || {}).label || 'Change' });
        tx.createDiv({ text: describeEvent(e, d, s, f) });
        const ra = row.createDiv({ cls: 'fd-wi-event-actions' });
        mkIconButton(ra, 'pencil', 'Edit change', () => this.editEvent(sc, e));
        mkIconButton(ra, 'trash-2', 'Remove change', async () => { sc.events = sc.events.filter((x) => x !== e); await this.persist(); }).addClass('fd-danger');
        row.addEventListener('click', () => this.editEvent(sc, e));
      }
      const warns = wiLimitWarnings(d, sc, s);
      if (warns.length) {
        const wb = ec.createDiv({ cls: 'fd-wi-warns' });
        for (const w of warns) { const r = wb.createDiv({ cls: 'fd-wi-warn' }); setIcon(r.createSpan({ cls: 'fd-wi-warn-icon' }), 'alert-triangle'); r.createSpan({ text: w }); }
        wb.createDiv({ cls: 'fd-muted fd-small', text: `Limits: ${taxAsOf()}. The projection still counts these amounts.` });
      }
      const add = ec.createDiv({ cls: 'fd-wi-add' });
      add.createDiv({ cls: 'fd-wi-add-label', text: 'Add a change' });
      const chips = add.createDiv({ cls: 'fd-wi-chips' });
      for (const [type, t] of Object.entries(EVENT_TYPES)) {
        const b = chips.createEl('button', { cls: 'fd-wi-chip has-icon', attr: { title: t.hint } });
        setIcon(b.createSpan({ cls: 'fd-btn-icon' }), t.icon);
        b.createSpan({ text: t.label });
        b.addEventListener('click', () => this.editEvent(sc, null, type));
      }
      // Notes
      const nc = main.createDiv({ cls: 'fd-wi-card' });
      nc.createDiv({ cls: 'fd-wi-card-head' }).createEl('h4', { text: 'Notes' });
      const ta = nc.createEl('textarea', { cls: 'fd-wi-notes', attr: { rows: 2, placeholder: 'Why you’re testing this, what you learned… (included in the PDF)' } });
      ta.value = sc.notes || '';
      ta.addEventListener('change', async () => { sc.notes = ta.value; await this.plugin.save(); });
    } else {
      const tc = main.createDiv({ cls: 'fd-wi-card fd-wi-start' });
      tc.createDiv({ cls: 'fd-wi-card-head' }).createEl('h4', { text: 'Try a change' });
      tc.createDiv({ cls: 'fd-muted', text: 'Start a scenario with one change, then add more. You can test extra contributions (starting now or on a date), raises or a new job, bonuses, career breaks, different market returns, or a different retirement age or budget.' });
      const chips = tc.createDiv({ cls: 'fd-wi-chips' });
      for (const [type, t] of Object.entries(EVENT_TYPES)) {
        const b = chips.createEl('button', { cls: 'fd-wi-chip has-icon', attr: { title: t.hint } });
        setIcon(b.createSpan({ cls: 'fd-btn-icon' }), t.icon);
        b.createSpan({ text: t.label });
        b.addEventListener('click', () => { const ns = this.addScenario({ name: t.label }, false); this.render(); this.editEvent(ns, null, type, true); });
      }
      const b2 = chips.createEl('button', { cls: 'fd-wi-chip has-icon' });
      setIcon(b2.createSpan({ cls: 'fd-btn-icon' }), 'sliders-horizontal');
      b2.createSpan({ text: 'Retirement age, budget or returns' });
      b2.addEventListener('click', () => { const ns = this.addScenario({ name: 'New assumptions' }, false); this.render(); this.editAssumptions(ns, true); });
    }

    // Comparison of all scenarios
    if (this.store.scenarios.length) {
      const cmpCard = main.createDiv({ cls: 'fd-wi-card' });
      const chd = cmpCard.createDiv({ cls: 'fd-wi-card-head' });
      chd.createEl('h4', { text: 'All scenarios compared' });
      chd.createSpan({ cls: 'fd-muted', text: 'Click a row to open it' });
      const wrap = cmpCard.createDiv({ cls: 'fd-wi-table-wrap' });
      const t = wrap.createEl('table', { cls: 'fd-table fd-wi-compare' });
      const hr = t.createEl('thead').createEl('tr');
      [['Scenario'], ['Ready to retire', 'estimatedRetirement'], ['Projected at target age', 'projected'], ['Funded', 'status'], ['Money lasts', 'moneyLasts'], ['Income / yr', 'sustainableIncome']]
        .forEach(([h, help], i) => { const th = hr.createEl('th', { cls: i ? 'is-num' : '' }); if (help) termEl(th, h, help, () => ({ plan: base, f, r: base.r })); else th.setText(h); });
      const tb = t.createEl('tbody');
      const row = (id, name, color, x, dashed) => {
        const tr = tb.createEl('tr', { cls: 'is-clickable' + (this.store.selected === id ? ' is-selected' : '') });
        tr.addEventListener('click', () => { this.store.selected = id; this.persist(); });
        const td = tr.createEl('td');
        td.createSpan({ cls: 'fd-swatch' + (dashed ? ' is-dashed' : '') }).style.setProperty('--sw', color);
        td.createSpan({ cls: 'fd-wi-cmp-name', text: ` ${name}` });
        tr.createEl('td', { cls: 'is-num', text: x.estAge != null ? `Age ${x.estAge.toFixed(1)}` : 'After 100' });
        tr.createEl('td', { cls: 'is-num', text: `${money(x.projectedAtTarget)} @ ${x.targetAge}` });
        tr.createEl('td', { cls: 'is-num' }).createSpan({ cls: `fd-badge is-${x.status}`, text: f.pct(x.ratio) });
        tr.createEl('td', { cls: 'is-num', text: x.lastsText });
        tr.createEl('td', { cls: 'is-num', text: money(x.sustainableIncome) });
      };
      row('base', 'Current plan', BASE_COLOR, base, true);
      for (const x of this.store.scenarios) row(x.id, x.name, x.color, this.sims.get(x.id), false);
    }
  }

  editAssumptions(sc, isNew) {
    const d = this.data, eff = effectiveAssumptions(d, sc), f = this.f;
    const ctx = () => ({ plan: this.sims.get(sc.id) || this.base, f, r: eff });
    new FormModal(this.app, {
      title: `Assumptions · ${sc.name}`,
      intro: 'Change any assumption for this scenario only. Your dashboard keeps using its own retirement goals.',
      values: eff, helpCtx: ctx,
      fields: [
        { key: 'targetAge', label: 'Retirement age', type: 'number', half: true, help: 'targetAge' },
        { key: 'annualIncome', label: 'Desired yearly income', type: 'number', half: true, help: 'desiredIncome' },
        { key: 'otherIncome', label: 'Social Security / pension per year', type: 'number', half: true, help: 'otherIncome' },
        { key: 'withdrawalRate', label: 'Withdrawal rate (%)', type: 'number', half: true, help: 'withdrawalRate' },
        { key: 'expectedReturn', label: 'Expected annual return (%)', type: 'number', half: true, help: 'expectedReturn' },
        { key: 'inflation', label: 'Inflation (%)', type: 'number', half: true, help: 'inflation' },
        { key: 'includeInvestments', label: 'Count taxable investment accounts toward retirement', type: 'checkbox', help: 'includeInvestments' },
      ],
      submitText: 'Apply to scenario',
      onSubmit: async (v) => {
        if (v.targetAge < 30 || v.targetAge > 90) throw new Error('Retirement age should be between 30 and 90.');
        if (v.withdrawalRate <= 0 || v.withdrawalRate > 15) throw new Error('Withdrawal rate should be between 0 and 15%.');
        sc.assumptions = {};
        for (const k of WI_KEYS) {
          const same = k === 'includeInvestments' ? !!v[k] === !!d.retirement[k] : num(v[k]) === num(d.retirement[k]);
          if (!same) sc.assumptions[k] = k === 'includeInvestments' ? !!v[k] : num(v[k]);
        }
        await this.persist();
      },
    }).open();
  }

  editEvent(sc, ev, type, isNew) {
    type = ev ? ev.type : type;
    const d = this.data, f = this.f;
    const s = this.sims.get(sc.id) || this.base;
    const age = s.age;
    const acctOpts = [...s.accounts.map((a) => ({ value: a.id, label: `${a.name}${a.kind ? ` (${a.kind})` : ''}` })), { value: OTHER_BUCKET, label: 'Other / new savings' }];
    const inc = incomeOn(d, todayISO()).cur;
    const gross = inc ? num(inc.gross) : 0;
    const share = gross ? clamp(Math.round((this.base.contribution / (gross * 12)) * 100), 1, 100) : 15;
    const MODES = { now: 'Now', years: 'In … years', age: 'At age …', date: 'On a date', never: 'No end' };
    const when = (p, label, modes) => [
      { key: `${p}Mode`, label, type: 'select', half: true, options: modes.map((m) => ({ value: m, label: MODES[m] })) },
      { key: `${p}Years`, label: 'Years from now', type: 'number', optional: true, half: true, showIf: (v) => v[`${p}Mode`] === 'years' },
      { key: `${p}Age`, label: `Age (you’re ${age.toFixed(1)})`, type: 'number', optional: true, half: true, showIf: (v) => v[`${p}Mode`] === 'age' },
      { key: `${p}Date`, label: 'Date', type: 'date', half: true, showIf: (v) => v[`${p}Mode`] === 'date' },
    ];
    const vals = (p, spec, def) => {
      spec = spec && spec.mode ? spec : def;
      return { [`${p}Mode`]: spec.mode, [`${p}Years`]: spec.mode === 'years' ? spec.value : '', [`${p}Age`]: spec.mode === 'age' ? spec.value : '',
        [`${p}Date`]: spec.mode === 'date' ? spec.date : todayISO() };
    };
    const read = (p, v) => {
      const mode = v[`${p}Mode`];
      if (mode === 'years') { if (v[`${p}Years`] == null || v[`${p}Years`] < 0) throw new Error('Enter how many years from now.'); return { mode, value: v[`${p}Years`] }; }
      if (mode === 'age') { if (v[`${p}Age`] == null) throw new Error('Enter an age.'); if (v[`${p}Age`] < Math.floor(age)) throw new Error(`That age is in the past — you’re ${age.toFixed(1)}.`); return { mode, value: v[`${p}Age`] }; }
      if (mode === 'date') { if (!v[`${p}Date`]) throw new Error('Pick a date.'); return { mode, date: v[`${p}Date`] }; }
      return { mode };
    };
    let fields = [], values = {};
    const e0 = ev || {};
    if (type === 'contrib') {
      fields = [
        { key: 'account', label: 'Account', type: 'select', options: acctOpts },
        { key: 'amount', label: 'Change per month', type: 'number', required: true, desc: 'Positive to save more, negative to save less (e.g. -200).' },
        ...when('start', 'Starts', ['now', 'years', 'age', 'date']),
        ...when('end', 'Ends', ['never', 'years', 'age', 'date']),
      ];
      values = Object.assign({ account: e0.account || acctOpts[0].value, amount: e0.amount != null ? e0.amount : 100 }, vals('start', e0.start, { mode: 'now' }), vals('end', e0.end, { mode: 'never' }));
    } else if (type === 'pay') {
      fields = [
        { key: 'mode', label: 'Change by', type: 'select', half: true, options: [{ value: 'pct', label: 'Percent of pay' }, { value: 'amount', label: 'Amount per month (gross)' }] },
        { key: 'value', label: 'Change', type: 'number', required: true, half: true, labelFor: (v) => (v.mode === 'pct' ? 'Change (%)' : 'Change per month (gross)'),
          descFor: () => (gross ? `Current gross pay: ${f.money(gross)}/mo. Use a negative number for a pay cut.` : 'No income set up on the Overview — use an amount.') },
        ...when('start', 'Starts', ['now', 'years', 'age', 'date']),
        { key: 'saveShare', label: 'Share of the change you’d save (%)', type: 'number', half: true, desc: gross ? `You save about ${share}% of gross pay today.` : 'For example 15%.' },
        { key: 'account', label: 'Saved into', type: 'select', half: true, options: acctOpts },
      ];
      values = Object.assign({ mode: e0.mode || (gross ? 'pct' : 'amount'), value: e0.value != null ? e0.value : (gross ? 5 : 500), saveShare: e0.saveShare != null ? e0.saveShare : share, account: e0.account || acctOpts[0].value },
        vals('start', e0.start, { mode: 'years', value: 2 }));
    } else if (type === 'lump') {
      fields = [
        { key: 'account', label: 'Account', type: 'select', options: acctOpts },
        { key: 'amount', label: 'Amount', type: 'number', required: true, desc: 'Positive for a deposit (bonus, inheritance), negative for a withdrawal.' },
        ...when('start', 'When', ['now', 'years', 'age', 'date']),
      ];
      values = Object.assign({ account: e0.account || acctOpts[0].value, amount: e0.amount != null ? e0.amount : 10000 }, vals('start', e0.start, { mode: 'now' }));
    } else if (type === 'pause') {
      fields = [...when('start', 'Pause starts', ['now', 'years', 'age', 'date']), ...when('end', 'Contributions resume', ['years', 'age', 'date'])];
      values = Object.assign(vals('start', e0.start, { mode: 'years', value: 1 }), vals('end', e0.end, { mode: 'years', value: 2 }));
    } else if (type === 'ret') {
      fields = [
        { key: 'rate', label: 'Expected annual return during this period (%)', type: 'number', required: true, help: 'expectedReturn', desc: `Your plan assumes ${num(s.r.expectedReturn)}%. Inflation stays at ${num(s.r.inflation)}%.` },
        ...when('start', 'Starts', ['now', 'years', 'age', 'date']),
        ...when('end', 'Ends', ['never', 'years', 'age', 'date']),
      ];
      values = Object.assign({ rate: e0.rate != null ? e0.rate : 4 }, vals('start', e0.start, { mode: 'now' }), vals('end', e0.end, { mode: 'years', value: 10 }));
    }
    const ctx = () => ({ plan: s, f, r: s.r });
    let saved = false;
    const modal = new FormModal(this.app, {
      title: `${ev ? 'Edit' : 'Add'} ${(EVENT_TYPES[type] || {}).label.toLowerCase()} · ${sc.name}`,
      intro: (EVENT_TYPES[type] || {}).hint + '. Only affects this scenario.',
      values, fields, helpCtx: ctx,
      submitText: ev ? 'Save change' : 'Add change',
      onDelete: ev ? async () => { sc.events = sc.events.filter((x) => x !== ev); await this.persist(); } : null,
      onSubmit: async (v) => {
        const out = { id: ev ? ev.id : uid(), type };
        out.start = read('start', v);
        if (type === 'contrib' || type === 'ret' || type === 'pause') {
          out.end = read('end', v);
          if (out.end.mode !== 'never' && specMonth(out.end, age) <= specMonth(out.start, age)) throw new Error('The end must be after the start.');
        }
        if (type === 'contrib') { if (!v.amount) throw new Error('Enter an amount.'); Object.assign(out, { account: v.account, amount: v.amount }); }
        if (type === 'pay') { if (!v.value) throw new Error('Enter how much pay changes.'); if (v.mode === 'pct' && !gross) throw new Error('Set up your income first, or use an amount.'); Object.assign(out, { mode: v.mode, value: v.value, saveShare: clamp(num(v.saveShare), 0, 100), account: v.account }); }
        if (type === 'lump') { if (!v.amount) throw new Error('Enter an amount.'); Object.assign(out, { account: v.account, amount: v.amount }); }
        if (type === 'ret') { if (v.rate < -20 || v.rate > 25) throw new Error('Use a return between -20% and 25%.'); out.rate = v.rate; }
        if (ev) Object.assign(ev, out);
        else sc.events.push(out);
        saved = true;
        await this.persist();
      },
    });
    // A scenario created just for this change is removed again if the change is cancelled.
    if (isNew) { const close = modal.onClose.bind(modal); modal.onClose = () => { close(); if (!saved && !(sc.events || []).length) { this.store.scenarios = this.store.scenarios.filter((x) => x !== sc); this.store.selected = 'base'; this.render(); } }; }
    modal.open();
  }

  exportPDF() {
    const scs = this.store.scenarios;
    const fields = [{ key: 'fileName', label: 'File name', required: true }];
    const values = { fileName: `Retirement what-if ${todayISO()}`, openAfter: true };
    if (scs.length) {
      fields.push({ type: 'heading', label: 'Scenarios to include' });
      for (const s of scs) { fields.push({ key: `sc_${s.id}`, label: s.name, type: 'checkbox' }); values[`sc_${s.id}`] = s.visible !== false; }
    }
    fields.push({ type: 'heading', label: 'After saving' }, { key: 'openAfter', label: 'Open the PDF in a new tab', type: 'checkbox' });
    new FormModal(this.app, {
      title: 'Save what-if scenarios as PDF',
      intro: `Includes your current plan, a comparison table and chart, each scenario’s settings and results, how it’s calculated, sources and a prediction disclaimer. Saved to the “Finance Dashboard” folder in your vault.${scs.length ? '' : ' You have no scenarios yet, so it will show your current plan only.'}`,
      values, fields, submitText: 'Save PDF',
      onSubmit: async (v) => {
        const chosen = scs.filter((s) => v[`sc_${s.id}`]);
        const bytes = buildWhatIfPDF(this.data, chosen, this.f);
        const file = await this.plugin.savePdf(v.fileName, bytes);
        new Notice(`Saved ${file.path}`);
        if (v.openAfter) { this.close(); await this.app.workspace.getLeaf('tab').openFile(file); }
      },
    }).open();
  }
}

/* ============================================================ PDF report */

const REPORT_TYPES = {
  retirement: { label: 'Retirement & Income', icon: 'sunset', desc: 'Settings and goals, projection, accounts, contribution limits, income sources and changes' },
  networth: { label: 'Net Worth', icon: 'trending-up', desc: 'Trend, accounts and how they’re taxed, credit score, notes' },
  investments: { label: 'Investments', icon: 'line-chart', desc: 'Growth, money put in vs market growth, account performance' },
  spending: { label: 'Spending & Savings', icon: 'credit-card', desc: 'Spending by month and category, budgets, savings goals' },
};

/** Pick which reports go into the PDF (none pre-selected) and the order they print in. */
class ReportModal extends Modal {
  constructor(app, plugin) {
    super(app);
    this.plugin = plugin;
    const st = plugin.data.settings.report;
    const saved = Array.isArray(st.order) ? st.order.filter((k) => REPORT_TYPES[k]) : [];
    this.order = [...new Set([...saved, ...Object.keys(REPORT_TYPES)])];
    this.chosen = new Set();
    this.vals = { fileName: `Finance report ${todayISO()}`, name: st.name || '', months: String(st.months || '3'), transactions: false, openAfter: true };
  }
  onOpen() {
    this.modalEl.addClass('fd-modal', 'fd-report-modal');
    this.titleEl.setText('Create PDF report');
    this.render();
  }
  onClose() { this.contentEl.empty(); }
  render() {
    const c = this.contentEl, p = this.plugin;
    c.empty();
    c.createEl('p', { cls: 'fd-modal-intro', text: 'Tick the reports to include and use the arrows to set the order they print in. Every PDF has a cover with contents and an appendix explaining how each figure is calculated, with sources. It’s saved to the “Finance Dashboard” folder in your vault.' });
    const form = c.createDiv({ cls: 'fd-form' });
    const field = (label, half) => { const r = form.createDiv({ cls: 'fd-field' + (half ? ' is-half' : '') }); r.createEl('label', { text: label }); return r; };
    const fn = field('File name *', true).createEl('input', { attr: { type: 'text' } });
    fn.value = this.vals.fileName;
    fn.addEventListener('input', () => { this.vals.fileName = fn.value; });
    const nm = field('Name on the report (optional)', true).createEl('input', { attr: { type: 'text', placeholder: 'Default: Settings → Your name' } });
    nm.value = this.vals.name;
    nm.addEventListener('input', () => { this.vals.name = nm.value; });

    form.createEl('h4', { cls: 'fd-form-heading', text: 'Reports to include, in print order' });
    const list = form.createDiv({ cls: 'fd-report-list' });
    const invHidden = !invTabShown(p.data);
    let n = 0;
    this.order.forEach((key, idx) => {
      const R = REPORT_TYPES[key], on = this.chosen.has(key);
      const row = list.createDiv({ cls: 'fd-report-row' + (on ? ' is-on' : '') });
      const num = row.createDiv({ cls: 'fd-report-num', text: on ? String(++n) : '' });
      num.setAttr('aria-hidden', 'true');
      const lab = row.createEl('label', { cls: 'fd-report-label' });
      const cb = lab.createEl('input', { attr: { type: 'checkbox', 'aria-label': R.label } });
      cb.checked = on;
      cb.addEventListener('change', () => { if (cb.checked) this.chosen.add(key); else this.chosen.delete(key); this.render(); });
      const txt = lab.createDiv({ cls: 'fd-report-text' });
      const t = txt.createDiv({ cls: 'fd-report-title' });
      setIcon(t.createSpan({ cls: 'fd-report-icon' }), R.icon);
      t.createSpan({ text: R.label });
      txt.createDiv({ cls: 'fd-muted fd-report-desc', text: R.desc + (key === 'investments' && invHidden ? ' · the tab is hidden, but its history is still saved' : '') });
      const arrows = row.createDiv({ cls: 'fd-report-arrows' });
      const move = (d) => { const j = idx + d; if (j < 0 || j >= this.order.length) return; [this.order[idx], this.order[j]] = [this.order[j], this.order[idx]]; this.render(); };
      const up = arrows.createEl('button', { cls: 'fd-icon-btn clickable-icon', attr: { type: 'button', 'aria-label': `Move ${R.label} up` } });
      setIcon(up, 'chevron-up'); up.disabled = idx === 0; up.addEventListener('click', () => move(-1));
      const dn = arrows.createEl('button', { cls: 'fd-icon-btn clickable-icon', attr: { type: 'button', 'aria-label': `Move ${R.label} down` } });
      setIcon(dn, 'chevron-down'); dn.disabled = idx === this.order.length - 1; dn.addEventListener('click', () => move(1));
      if (key === 'spending' && on) {
        const opts = row.createDiv({ cls: 'fd-report-sub' });
        const sel = opts.createEl('select', { cls: 'dropdown', attr: { 'aria-label': 'Spending period' } });
        for (const [v, l] of [['1', 'Last full month'], ['3', 'Last 3 full months'], ['6', 'Last 6 full months'], ['12', 'Last 12 full months']]) sel.createEl('option', { text: l, attr: { value: v } });
        sel.value = this.vals.months;
        sel.addEventListener('change', () => { this.vals.months = sel.value; });
        const tl = opts.createEl('label', { cls: 'fd-report-check' });
        const tc = tl.createEl('input', { attr: { type: 'checkbox' } });
        tc.checked = this.vals.transactions;
        tc.addEventListener('change', () => { this.vals.transactions = tc.checked; });
        tl.createSpan({ text: 'List every transaction' });
      }
    });

    form.createEl('h4', { cls: 'fd-form-heading', text: 'After saving' });
    const ol = form.createDiv({ cls: 'fd-field is-checkbox' }).createEl('label');
    const oc = ol.createEl('input', { attr: { type: 'checkbox' } });
    oc.checked = this.vals.openAfter;
    oc.addEventListener('change', () => { this.vals.openAfter = oc.checked; });
    ol.append(' Open the PDF in a new tab');

    const err = form.createDiv({ cls: 'fd-form-error' });
    const btns = form.createDiv({ cls: 'fd-form-buttons' });
    btns.createDiv({ cls: 'fd-spacer' });
    btns.createEl('button', { text: 'Cancel', attr: { type: 'button' } }).addEventListener('click', () => this.close());
    const go = btns.createEl('button', { cls: 'mod-cta', text: this.chosen.size ? `Save PDF (${this.chosen.size} report${this.chosen.size === 1 ? '' : 's'})` : 'Save PDF', attr: { type: 'button' } });
    go.addEventListener('click', async () => {
      if (!this.chosen.size) { err.setText('Choose at least one report to include.'); return; }
      if (!this.vals.fileName.trim()) { err.setText('File name is required.'); fn.focus(); return; }
      const st = p.data.settings.report;
      Object.assign(st, { name: this.vals.name.trim(), months: this.vals.months, order: [...this.order] });
      await p.save();
      const order = this.order.filter((k) => this.chosen.has(k));
      try {
        const bytes = buildFinanceReport(p.data, { name: this.vals.name, order, retirement: this.chosen.has('retirement'), netWorth: this.chosen.has('networth'),
          investments: this.chosen.has('investments'), spending: this.chosen.has('spending'), months: Number(this.vals.months || 3), transactions: this.vals.transactions }, new Fmt(p.data.settings));
        const file = await p.savePdf(this.vals.fileName.trim(), bytes);
        new Notice(`Saved ${file.path}`);
        this.close();
        if (this.vals.openAfter) await this.app.workspace.getLeaf('tab').openFile(file);
      } catch (e) { err.setText(String((e && e.message) || e)); }
    });
  }
}


/**
 * Multi-part finance report in the style of a clinical summary: a cover with contents and headline tiles, then one
 * part per section (each with its own running header and "Page x of y"), and an appendix explaining the methods with
 * numbered references. opts: {name, netWorth, investments, spending, months, transactions}
 */
function buildFinanceReport(data, opts, f) {
  const pdf = new MiniPDF({ title: 'Finance report' });
  const M = 48, W = pdf.W - 2 * M, TOP = 48, BOTTOM = pdf.H - 56;
  const INK = '#1f2328', MUTED = '#6e7781', FAINT = '#8c959f', LINE = '#d0d7de', SOFT = '#f4f5f7', TILE = '#f3f4f6';
  const GOOD = '#1a7f37', BAD = '#cf222e', WARN = '#9a6700';
  const ACC = { summary: '#6d4fd8', retirement: '#2f8a57', networth: '#3a6db5', investments: '#25808f', spending: '#c05621', appendix: '#6d4fd8' };
  const now = new Date();
  const todayLong = now.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  const money = (v) => f.money(v), sMoney = (v) => signed(v, money);
  const pct1 = (v) => f.pct(v, 1);
  const tone = (v) => (v > 0 ? GOOD : v < 0 ? BAD : INK);

  let y = TOP;
  let part = null;                 // current part {key, title, color, footer, headerRight, pages:[]}
  const parts = [];
  const toc = [];                  // {title, part, page (absolute index)}
  const newPage = () => {
    pdf.addPage();
    part.pages.push(pdf.page);
    y = TOP;
    // Running header on continuation pages
    pdf.text(M, y + 9, part.title, { size: 8.5, bold: true, color: MUTED });
    pdf.text(M + W, y + 9, part.headerRight, { size: 8.5, color: MUTED, align: 'right' });
    y += 16;
    pdf.line(M, y, M + W, y, { color: LINE, width: 0.6 });
    y += 18;
  };
  const ensure = (h) => { if (y + h > BOTTOM) newPage(); };
  const startPart = (key, title, metaLines, footer, headerRight) => {
    if (parts.length) pdf.addPage();
    part = { key, title, color: ACC[key], footer, headerRight: headerRight || `as of ${todayLong}`, pages: [pdf.page] };
    parts.push(part);
    y = TOP;
    pdf.rect(M, y, W, 4.5, { fill: part.color });
    y += 16;
    pdf.text(M, y + 20, title, { size: 23, bold: true, color: INK });
    y += 32;
    for (const ml of metaLines.filter(Boolean)) for (const ln of pdf.wrap(ml, W, 10.5)) { pdf.text(M, y + 10, ln, { size: 10.5, color: MUTED }); y += 15; }
    y += 10;
  };
  const heading = (t, o = {}) => {
    ensure(o.keep || 90);
    if (o.compact) {
      pdf.text(M, y + 12, t, { size: 12.5, bold: true, color: o.color || part.color });
      y += 18;
      pdf.line(M, y, M + W, y, { color: LINE, width: 0.6 });
      y += 9;
      return;
    }
    y += 6;
    pdf.text(M, y + 13, t, { size: 14, bold: true, color: o.color || part.color });
    y += 21;
    pdf.line(M, y, M + W, y, { color: LINE, width: 0.6 });
    y += 12;
    if (o.toc) toc.push({ title: t, part, pageObj: pdf.page });
  };
  const subheading = (t) => { ensure(36); pdf.text(M, y + 10, t, { size: 10.5, bold: true, color: INK }); y += 18; };
  const para = (text, o = {}) => {
    const size = o.size || 9, lh = size * 1.45, x = o.x || M;
    for (const ln of pdf.wrap(text, o.width || (W - (x - M)), size, o.bold)) { ensure(lh); pdf.text(x, y + size, ln, { size, bold: o.bold, color: o.color || MUTED }); y += lh; }
    y += o.after != null ? o.after : 4;
  };
  const bullets = (items, o = {}) => {
    const size = o.size || 9, lh = size * 1.45;
    for (const it of items.filter(Boolean)) {
      const lines = pdf.wrap(`• ${it}`, W, size);
      ensure(lines.length * lh);
      for (const ln of lines) { pdf.text(M, y + size, ln, { size, color: INK }); y += lh; }
    }
    y += 2;
  };
  /** Grey stat tiles, 3 (or n) per row: {label, value, sub, color} */
  const tiles = (items, n = 3, compact) => {
    const gap = 10, w = (W - gap * (n - 1)) / n, h = compact ? 44 : 50;
    for (let i = 0; i < items.length; i += n) {
      ensure(h + 8);
      items.slice(i, i + n).forEach((t, j) => {
        if (!t) return;
        const x = M + j * (w + gap);
        pdf.rect(x, y, w, h, { fill: TILE });
        pdf.text(x + 9, y + 15, pdf.fit(String(t.label).toUpperCase(), w - 18, 6.6, true), { size: 6.6, bold: true, color: MUTED });
        pdf.text(x + 9, y + (compact ? 30 : 32), pdf.fit(t.value, w - 18, 13, true), { size: 13, bold: true, color: t.color || INK });
        if (t.sub) pdf.text(x + 9, y + (compact ? 40 : 43), pdf.fit(t.sub, w - 18, 6.8), { size: 6.8, color: MUTED });
      });
      y += h + (compact ? 6 : 8);
    }
    y += compact ? 0 : 2;
  };
  /** Left-bar callout. kind: 'warn' (amber) | 'note' (accent on grey) */
  const callout = (text, kind = 'note', color, onlyIfFits) => {
    const size = 9, lh = 13;
    const lines = pdf.wrap(text, W - 26, size);
    const h = lines.length * lh + 14;
    if (onlyIfFits && y + h > BOTTOM) return;
    ensure(h + 6);
    const bar = kind === 'warn' ? '#bf5b04' : color || part.color;
    pdf.rect(M, y, W, h, { fill: kind === 'warn' ? '#fff4e0' : SOFT });
    pdf.rect(M, y, 3, h, { fill: bar });
    lines.forEach((ln, i) => pdf.text(M + 14, y + 11 + size * 0.35 + i * lh, ln, { size, color: kind === 'warn' ? '#8a4b00' : INK }));
    y += h + 8;
  };
  /** Table with a grey header row and hairlines. cols:[{label,w,align}] rows:[{cells, tones, bold, swatch}] */
  const table = (cols, rows, o = {}) => {
    const widths = cols.map((c) => c.w * W);
    const size = o.size || 8.5;
    const head = () => {
      pdf.rect(M, y, W, 18, { fill: SOFT });
      let x = M;
      cols.forEach((c, i) => {
        pdf.text(c.align === 'right' ? x + widths[i] - 6 : x + 6, y + 12, pdf.fit(c.label, widths[i] - 10, 7.8, true), { size: 7.8, bold: true, color: MUTED, align: c.align === 'right' ? 'right' : 'left' });
        x += widths[i];
      });
      y += 18;
    };
    ensure(18 + 40);
    head();
    for (const r of rows) {
      // Wrap the cells that allow it; the row grows to the tallest cell.
      const lines = r.cells.map((cell, i) => (cols[i].wrap ? pdf.wrap(String(cell == null ? '' : cell), widths[i] - 12 - (i === 0 && r.swatch ? 12 : 0), size) : [String(cell == null ? '' : cell)]));
      const rh = Math.max(19, 8 + Math.max(...lines.map((l) => l.length)) * (size + 3.5));
      if (y + rh > BOTTOM) { newPage(); head(); }
      let x = M;
      lines.forEach((ls, i) => {
        let tx = cols[i].align === 'right' ? x + widths[i] - 6 : x + 6;
        let avail = widths[i] - 12;
        if (i === 0 && r.swatch) { pdf.rect(x + 6, y + 6, 8, 8, { fill: r.swatch }); tx += 12; avail -= 12; }
        ls.forEach((ln, k) => pdf.text(tx, y + 13 + k * (size + 3.5), cols[i].wrap ? ln : pdf.fit(ln, avail, size, r.bold), { size, bold: r.bold || (r.boldCols && r.boldCols.includes(i)),
          color: (r.tones && r.tones[i]) || INK, align: cols[i].align === 'right' ? 'right' : 'left' }));
        x += widths[i];
      });
      y += rh;
      pdf.line(M, y, M + W, y, { color: LINE, width: 0.45 });
    }
    y += 8;
  };
  /** Line chart: labels[], series[{name,color,values,dash,width}], hlines[{value,label,color}], vlines[{index,label}] */
  const lineChart = (o) => {
    const H = o.height || 190;
    ensure(H + 30);
    const P = { l: 46, r: 8, t: 10, b: 20 };
    const x0 = M + P.l, x1 = M + W - P.r, y0 = y + P.t, y1 = y + H - P.b;
    const n = o.labels.length;
    const vals = o.series.flatMap((s) => s.values.filter((v) => v != null)).concat((o.hlines || []).map((h) => h.value));
    if (!vals.length || n < 1) return;
    const sc = niceScale(o.zero ? Math.min(0, ...vals) : Math.min(...vals), Math.max(...vals, 1));
    if (o.zero && sc.min > 0) sc.min = 0;
    const X = (i) => x0 + (n <= 1 ? (x1 - x0) / 2 : (i * (x1 - x0)) / (n - 1));
    const Y = (v) => y1 - ((v - sc.min) / (sc.max - sc.min || 1)) * (y1 - y0);
    for (let v = sc.min; v <= sc.max + sc.step / 2; v += sc.step) {
      pdf.line(x0, Y(v), x1, Y(v), { color: '#e3e6ea', width: 0.5 });
      pdf.text(x0 - 6, Y(v) + 3, f.compact(v), { size: 7, color: FAINT, align: 'right' });
    }
    const every = Math.max(1, Math.ceil(n / (o.maxLabels || 8)));
    for (let i = 0; i < n; i += every) if (n - 1 - i >= every / 2 || i === 0) pdf.text(X(i), y1 + 12, o.labels[i], { size: 7, color: FAINT, align: i === 0 ? 'left' : 'center' });
    if (n > 1) pdf.text(X(n - 1), y1 + 12, o.labels[n - 1], { size: 7, color: FAINT, align: 'right' });
    for (const h of o.hlines || []) {
      pdf.line(x0, Y(h.value), x1, Y(h.value), { color: h.color || '#57606a', width: 0.7, dash: [3, 3] });
      if (h.label) pdf.text(x1 - 2, Y(h.value) - 4, h.label, { size: 7, color: h.color || MUTED, align: 'right', bold: true });
    }
    for (const v of o.vlines || []) {
      if (v.index < 0 || v.index > n - 1) continue;
      pdf.line(X(v.index), y0, X(v.index), y1, { color: '#afb8c1', width: 0.6, dash: [1, 3] });
      if (v.label) pdf.text(X(v.index) + 4, y0 + 8, v.label, { size: 7, color: MUTED });
    }
    for (const s of o.series) {
      // Draw each unbroken run of values
      let run = [];
      const flush = () => { if (run.length > 1) pdf.polyline(run, { color: s.color, width: s.width || 1.6, dash: s.dash }); run = []; };
      s.values.forEach((v, i) => { if (v == null) flush(); else run.push([X(i), Y(v)]); });
      flush();
    }
    y += H;
    legendRow(o.series.map((s) => ({ label: s.name, color: s.color, dash: s.dash })).concat(o.extraLegend || []));
  };
  const legendRow = (items) => {
    if (!items.length) return;
    let lx = M + 46;
    ensure(14);
    for (const it of items) {
      const wl = pdf.width(it.label, 7.5) + 30;
      if (lx + wl > M + W) { lx = M + 46; y += 12; ensure(12); }
      if (it.dash) pdf.line(lx, y + 4, lx + 12, y + 4, { color: it.color, width: 1.8, dash: it.dash });
      else pdf.rect(lx, y, 8, 8, { fill: it.color });
      pdf.text(lx + (it.dash ? 16 : 12), y + 7, it.label, { size: 7.5, color: MUTED });
      lx += wl;
    }
    y += 18;
  };
  /** Column chart for monthly values (positive only). */
  const columnChart = (labels, series, o = {}) => {
    const H = o.height || 170;
    ensure(H + 30);
    const P = { l: 46, r: 8, t: 12, b: 20 };
    const x0 = M + P.l, x1 = M + W - P.r, y0 = y + P.t, y1 = y + H - P.b;
    const totalsArr = labels.map((_, i) => sum(series, (s) => s.values[i] || 0));
    const sc = niceScale(0, Math.max(...totalsArr, o.ref || 0, 1)); sc.min = 0;
    const Y = (v) => y1 - (v / sc.max) * (y1 - y0);
    for (let v = 0; v <= sc.max + sc.step / 2; v += sc.step) {
      pdf.line(x0, Y(v), x1, Y(v), { color: '#e3e6ea', width: 0.5 });
      pdf.text(x0 - 6, Y(v) + 3, f.compact(v), { size: 7, color: FAINT, align: 'right' });
    }
    const bw = (x1 - x0) / labels.length;
    labels.forEach((l, i) => {
      let acc = 0;
      const bx = x0 + i * bw + bw * 0.22, w = bw * 0.56;
      for (const s of series) {
        const v = s.values[i] || 0;
        if (v <= 0) continue;
        pdf.rect(bx, Y(acc + v), w, Y(acc) - Y(acc + v), { fill: s.color });
        acc += v;
      }
      if (o.valueLabels && totalsArr[i] > 0) pdf.text(bx + w / 2, Y(totalsArr[i]) - 3, f.compact(totalsArr[i]), { size: 6.5, color: MUTED, align: 'center' });
      pdf.text(bx + w / 2, y1 + 12, l, { size: 7, color: FAINT, align: 'center' });
    });
    if (o.ref) {
      pdf.line(x0, Y(o.ref), x1, Y(o.ref), { color: '#24292f', width: 0.7 });
    }
    y += H;
    legendRow(series.map((s) => ({ label: s.name, color: s.color })).concat(o.ref ? [{ label: o.refLabel || 'Line: budget', color: '#24292f' }] : []));
  };
  /** Horizontal bars with a label column and value text (template "Symptoms" style). rows:[{label,value,frac,color,text}] */
  const hbars = (rows, o = {}) => {
    const lw = o.labelW || 150, tw = o.textW || 120, bw = W - lw - tw - 12;
    for (const r of rows) {
      ensure(16);
      pdf.text(M, y + 9, pdf.fit(r.label, lw - 8, 8.5), { size: 8.5, color: INK });
      pdf.rect(M + lw, y + 2, bw, 8, { fill: '#eceef1' });
      pdf.rect(M + lw, y + 2, Math.max(0.5, bw * clamp(r.frac, 0, 1)), 8, { fill: r.color || part.color });
      pdf.text(M + W, y + 9, r.text, { size: 8, color: r.textColor || MUTED, align: 'right' });
      y += 15;
    }
    y += 6;
  };

  /* ---------------- data */
  const d = data, r = d.retirement;
  const plan = simulateRetirement(d, null);
  const t = totals(d);
  const nw = nwStats(d);
  const iv = invStats(d);
  const today = todayISO(), curKey = monthKey(now);
  const tot = totalIncomeOn(d, today);
  const incH = incomeOn(d, today);
  const name = String(opts.name || '').trim();
  const avgSpend3 = sum([1, 2, 3].map((i) => sum(txFor(d, addMonths(curKey, -i)), (x) => x.amount))) / 3;
  const included = { retirement: !!opts.retirement, income: !!opts.retirement, networth: !!opts.netWorth, investments: !!opts.investments, spending: !!opts.spending };
  // Print order: opts.order lists report keys; anything missing falls back to the standard order.
  const ORDER = [...new Set([...(opts.order || []), 'retirement', 'networth', 'investments', 'spending'])].filter((k) => included[k]);
  const run = (fns) => ORDER.forEach((k) => fns[k] && fns[k]());

  // References used by the appendix, numbered in order of first use.
  const refs = [];
  const cite = (keys) => keys.filter((k) => SOURCES[k]).map((k) => { let i = refs.indexOf(k); if (i < 0) { refs.push(k); i = refs.length - 1; } return `[${i + 1}]`; }).join(' ');

  /* ---------------- cover / summary */
  startPart('summary', 'Finance report', [name ? `Name: ${name}` : null, `Created ${todayLong}`, `Amounts in ${d.settings.currency || 'USD'} · retirement projections in today’s dollars · predictions, not guarantees`],
    'Finance report · from Finance Dashboard for Obsidian · predictions, not financial advice');
  heading('Contents', { keep: 40, compact: true });
  const tocRowsPlanned = (included.retirement ? 1 : 0) + (included.networth ? 1 : 0) + (included.investments ? 1 : 0) + (included.spending ? 1 : 0) + 1;
  const tocY = y, tocPage = pdf.page;
  y += 18 + tocRowsPlanned * 17 + 12;

  const coverRet = () => {
    heading('Retirement', { color: ACC.retirement, compact: true, keep: 80 });
    tiles([
      { label: 'Status', value: plan.target ? `${STATUS_TEXT[plan.status]} · ${f.pct(plan.ratio)}` : '—', sub: `of target projected at ${plan.targetAge}`, color: plan.status === 'on-track' ? GOOD : plan.status === 'behind' ? BAD : WARN },
      { label: 'Estimated retirement', value: plan.estDate ? `${plan.estDate.getFullYear()} · age ${plan.estAge.toFixed(1)}` : 'After 100', sub: `goal age ${plan.targetAge}` },
      { label: 'Retirement savings', value: money(plan.balance), sub: `${money(plan.contribution)}/yr contributions` },
    ]);
    heading('Income', { color: ACC.retirement, compact: true, keep: 80 });
    tiles([
      { label: 'Monthly take-home', value: money(tot.net), sub: tot.extras.length ? `${tot.extras.length + (tot.cur ? 1 : 0)} sources` : 'guaranteed each month' },
      { label: 'Monthly gross', value: money(tot.gross), sub: `${money(tot.gross * 12)} per year` },
      { label: 'Left after spending', value: avgSpend3 ? money(tot.net - avgSpend3) : '—', sub: avgSpend3 ? `avg spend ${money(avgSpend3)}/mo` : 'no spending yet', color: avgSpend3 ? tone(tot.net - avgSpend3) : null },
    ]);
  };
  const coverNW = () => {
    heading('Net worth', { color: ACC.networth, compact: true, keep: 80 });
    tiles([
      { label: 'Net worth', value: money(nw.net), sub: nw.prev ? `${sMoney(nw.net - nw.prev.net)} vs ${monthLabel(nw.prev.date)}` : '' },
      { label: '12-month change', value: nw.yearAgo ? sMoney(nw.net - nw.yearAgo.net) : '—', sub: nw.yearAgo && nw.yearAgo.net ? signed((nw.net - nw.yearAgo.net) / Math.abs(nw.yearAgo.net), pct1) : 'needs a year of history', color: nw.yearAgo ? tone(nw.net - nw.yearAgo.net) : null },
      { label: 'Credit score', value: nw.lastScore ? String(nw.lastScore.score) : '—', sub: nw.lastScore ? `${creditBand(nw.lastScore.score)} · ${dateLabel(nw.lastScore.date)}` : '' },
    ], 3, true);
  };
  const coverInv = () => {
    heading('Investments', { color: ACC.investments, compact: true, keep: 80 });
    tiles([
      { label: 'Total invested', value: money(iv.total), sub: `taxable ${f.compact(iv.taxable)} · retirement ${f.compact(iv.retirement)}` },
      { label: iv.y1 && !iv.y1Exact ? `Market growth since ${monthLabel(iv.y1.from)}` : '12-month market growth', value: iv.y1 ? sMoney(iv.y1.growth) : '—', sub: iv.y1 ? `${sMoney(iv.y1.moneyIn)} put in (est.)` : 'needs history', color: iv.y1 ? tone(iv.y1.growth) : null },
      { label: 'Estimated return', value: iv.y1 ? retLabel(iv.y1, f) : '—', sub: iv.y1 ? `over ${iv.y1.months} months` : '' },
    ], 3, true);
  };
  const coverSp = () => {
    const months = Math.max(1, num(opts.months) || 3);
    const keys = Array.from({ length: months }, (_, i) => addMonths(curKey, -(months - i)));
    const spent = sum(keys, (k) => sum(txFor(d, k), (x) => x.amount));
    heading('Spending & savings', { color: ACC.spending, compact: true, keep: 80 });
    tiles([
      { label: `Spending · last ${months} mo`, value: money(spent), sub: `${money(spent / months)}/mo average` },
      { label: `Spent in ${monthLabel(curKey, true).split(' ')[0]}`, value: money(sum(txFor(d, curKey), (x) => x.amount)), sub: 'month to date' },
      { label: 'Savings goals', value: d.goals.length ? `${f.pct(sum(d.goals, (g) => goalInfo(g).saved) / Math.max(1, sum(d.goals, (g) => goalInfo(g).target)))} saved` : '—', sub: d.goals.length ? `${d.goals.length} goals` : 'none yet' },
    ], 3, true);
  };
  run({ retirement: coverRet, networth: coverNW, investments: coverInv, spending: coverSp });
  // The cover stays one page: the disclaimer is repeated in every footer and the appendix, so it's skipped here if it won't fit.
  callout('Prediction, not a guarantee. Retirement figures are estimates from your inputs and steady average returns; actual results will differ. Balances are before tax. Not financial, tax or legal advice.', 'warn', null, true);

  /* ---------------- retirement report */
  const partRet = () => {
    const retMeta = [name ? `Name: ${name}` : null, `Created ${todayLong} · current age ${plan.age.toFixed(1)} · goal: retire at ${plan.targetAge}`, `Today’s dollars · ${f.pct(plan.real, 1)} real return · U.S. tax rules: ${taxAsOf()}`];
    startPart('retirement', 'Retirement report', retMeta, 'Retirement report · predictions in today’s dollars · not a guarantee or financial advice');
    toc.push({ title: 'Retirement & income', part, pageObj: pdf.page });
    heading('Summary');
    tiles([
      { label: 'Retirement savings', value: money(plan.balance), sub: `${plan.accounts.length} accounts${num(r.includeInvestments) || r.includeInvestments ? ' · incl. taxable' : ''}` },
      { label: 'Contributions', value: `${money(plan.contribution)}/yr`, sub: `${money(plan.contribution / 12)}/mo` },
      { label: 'Target nest egg', value: money(plan.target), sub: `${money(plan.need)}/yr at ${num(r.withdrawalRate)}% withdrawal` },
      { label: 'Estimated retirement', value: plan.estDate ? `${plan.estDate.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}` : 'After 100', sub: plan.estAge != null ? `age ${plan.estAge.toFixed(1)} · goal ${plan.targetAge}` : 'target not reached by 100' },
      { label: `Projected at ${plan.targetAge}`, value: money(plan.projectedAtTarget), sub: `${f.pct(plan.ratio)} of target · ${STATUS_TEXT[plan.status]}`, color: plan.status === 'on-track' ? GOOD : plan.status === 'behind' ? BAD : WARN },
      { label: 'Money lasts until', value: plan.lastsText, sub: `supports ${money(plan.sustainableIncome)}/yr` },
    ]);
    if (plan.extraNeededYr > 0.5) callout(`To reach your target by age ${plan.targetAge}, contributions would need to rise by about ${money(plan.extraNeededYr)}/yr (to ${money(plan.contribution + plan.extraNeededYr)}/yr), or plan on retiring around ${plan.estAge != null ? Math.ceil(plan.estAge) : 'a later age'}.`, 'warn');
    else callout(`On track: at ${plan.targetAge} you’re projected to have ${money(plan.projectedAtTarget)}, ${f.pct(plan.ratio)} of your ${money(plan.target)} target.`);

    heading('Your settings and goals');
    table([{ label: 'Setting', w: 0.36 }, { label: 'Your value', w: 0.26, align: 'right' }, { label: 'What it means', w: 0.38, wrap: true }], [
      { cells: ['Birth date · current age', `${dateLabel(r.birthDate)} · ${plan.age.toFixed(1)}`, 'Used to place your goals on a timeline.'] },
      { cells: ['Target retirement age', String(plan.targetAge), 'When you’d like to stop working.'] },
      { cells: ['Desired income (today’s $)', `${money(num(r.annualIncome))}/yr`, 'What you plan to spend each year in retirement.'] },
      { cells: ['Social Security / pension', `${money(num(r.otherIncome))}/yr`, 'Income that doesn’t come from savings; lowers the target.'] },
      { cells: ['Withdrawal rate', `${num(r.withdrawalRate)}%`, 'Share of savings taken in the first year of retirement.'] },
      { cells: ['Expected annual return', `${num(r.expectedReturn)}%`, 'Average yearly growth before inflation, after fees.'] },
      { cells: ['Inflation', `${num(r.inflation)}%`, 'Taken out of the return so amounts stay in today’s dollars.'] },
      { cells: ['Real return (calculated)', pct1(plan.real), '(1 + return) ÷ (1 + inflation) − 1.'] },
      { cells: ['Count taxable investments', r.includeInvestments ? 'Yes' : 'No', 'Whether brokerage accounts count toward retirement.'] },
    ].map((row) => Object.assign(row, { boldCols: [1] })));

    heading('Projected savings by age', { keep: 270 });
    para('Your retirement savings grown at your real return with today’s contributions added monthly. The dashed line is your target nest egg.');
    {
      const maxAge = Math.min(100, Math.max(plan.targetAge + 10, (plan.estAge || 0) + 3, plan.age + 10));
      const pts = plan.points.filter((p) => p.age <= maxAge + 0.01);
      const stepP = Math.max(1, Math.round(pts.length / 60));
      const sampled = pts.filter((_, i) => i % stepP === 0 || i === pts.length - 1);
      const ti = sampled.findIndex((p) => p.age >= plan.targetAge - 0.01);
      lineChart({ labels: sampled.map((p) => `Age ${Math.round(p.age)}`), maxLabels: 9, zero: true, height: 200,
        series: [{ name: 'Projected savings (today’s dollars)', color: ACC.retirement, values: sampled.map((p) => p.balance), width: 2 }],
        hlines: plan.target ? [{ value: plan.target, label: `Target ${money(plan.target)}`, color: '#57606a' }] : [],
        vlines: ti >= 0 ? [{ index: ti, label: `Goal ${plan.targetAge}` }] : [],
        extraLegend: plan.target ? [{ label: 'Target nest egg', color: '#57606a', dash: [3, 3] }] : [] });
    }

    heading('Retirement accounts');
    const retAccts = plan.accounts || [];
    table([{ label: 'Account', w: 0.3 }, { label: 'Type', w: 0.16 }, { label: 'Tax treatment', w: 0.2 }, { label: 'Balance', w: 0.13, align: 'right' }, { label: 'Per year', w: 0.12, align: 'right' }, { label: 'Share', w: 0.09, align: 'right' }],
      retAccts.map((a, i) => ({ swatch: PALETTE[i % PALETTE.length], cells: [a.name, a.kind || '—', taxBucket(a.kind), money(num(a.balance)), money(num(a.contribution)), plan.balance ? f.pct(num(a.balance) / plan.balance) : '—'] }))
        .concat([{ bold: true, cells: ['Total', '', '', money(plan.balance), money(plan.contribution), '100%'] }]));

    const checks = contributionChecks(d);
    if (checks.length) {
      heading(`${taxYear()} IRS contribution limits`);
      table([{ label: 'Limit', w: 0.3, wrap: true }, { label: 'You contribute', w: 0.15, align: 'right' }, { label: 'Limit', w: 0.13, align: 'right' }, { label: 'Note', w: 0.42, wrap: true }],
        checks.map((c) => ({ cells: [c.label, money(c.contribution), money(c.limit), c.note], tones: [null, c.status === 'over' ? BAD : c.status === 'warn' ? WARN : null] })));
    }
    {
      const hist = invTimeline(d).filter((h) => h.retirement != null).slice(-24);
      if (hist.length >= 2) {
        heading('Retirement balance history', { keep: 220 });
        lineChart({ labels: hist.map((h) => monthLabel(h.date)), height: 160, series: [{ name: 'Retirement savings', color: ACC.retirement, values: hist.map((h) => h.retirement), width: 1.8 }] });
      }
    }

    // Income (from the Overview tab)
    heading('Income');
    para('Income is a guaranteed amount per month and stays in effect until a change is recorded. Additional sources count while they’re active.');
    {
      const G = tot.gross, N = tot.net, D = Math.max(0, G - N);
      tiles([
        { label: 'Monthly take-home', value: money(N), sub: tot.extras.length ? `${tot.extras.length + (tot.cur ? 1 : 0)} sources` : 'guaranteed each month' },
        { label: 'Monthly gross', value: money(G), sub: 'before taxes & deductions' },
        { label: 'Taxes & deductions', value: `${money(D)}/mo`, sub: G ? `${f.pct(D / G)} of gross` : '' },
        { label: 'Take-home per year', value: money(N * 12), sub: `${money(G * 12)} gross` },
        { label: 'Average spending', value: avgSpend3 ? `${money(avgSpend3)}/mo` : '—', sub: 'last 3 full months' },
        { label: 'Left after spending', value: avgSpend3 ? money(N - avgSpend3) : '—', sub: avgSpend3 && N ? `${f.pct((N - avgSpend3) / N)} savings rate` : '', color: avgSpend3 ? tone(N - avgSpend3) : null },
      ]);
      const srcRows = [];
      if (tot.cur) srcRows.push({ cells: [[tot.cur.title, tot.cur.employer].filter(Boolean).join(' · ') || 'Job', 'Job', `since ${dateLabel(tot.cur.date)}`, money(num(tot.cur.gross)), money(num(tot.cur.net))] });
      for (const x of (d.extraIncome || []).filter((x) => !x.end || x.end >= today)) {
        srcRows.push({ cells: [x.name || x.kind, x.kind || '', x.start > today ? `starts ${dateLabel(x.start)}` : x.end ? `until ${dateLabel(x.end)}` : `since ${dateLabel(x.start)}`, money(num(x.gross)), money(num(x.net))] });
      }
      if (srcRows.length) {
        subheading('Income sources');
        table([{ label: 'Source', w: 0.32 }, { label: 'Type', w: 0.18 }, { label: 'When', w: 0.2 }, { label: 'Gross / mo', w: 0.15, align: 'right' }, { label: 'Net / mo', w: 0.15, align: 'right' }],
          srcRows.concat([{ bold: true, cells: ['Total now', '', '', money(G), money(N)] }]));
      }
      if (incH.hist.length) {
        subheading('Income changes');
        const hs = [...incH.hist].reverse();
        table([{ label: 'Date', w: 0.14 }, { label: 'What changed', w: 0.17 }, { label: 'Job', w: 0.27 }, { label: 'Gross / mo', w: 0.13, align: 'right' }, { label: 'Net / mo', w: 0.13, align: 'right' }, { label: 'Change', w: 0.16, align: 'right' }],
          hs.map((h, i) => {
            const p = hs[i + 1];
            const dv = p ? num(h.net) - num(p.net) : null;
            return { cells: [dateLabel(h.date), h.reason || '', [h.title, h.employer].filter(Boolean).join(' · '), money(num(h.gross)), money(num(h.net)), dv == null ? '—' : `${sMoney(dv)} net`], tones: [null, null, null, null, null, dv == null ? null : tone(dv)] };
          }));
        const notes = hs.filter((h) => h.note);
        if (notes.length) table([{ label: 'Date', w: 0.18 }, { label: 'Income note', w: 0.82, wrap: true }], notes.map((h) => ({ cells: [dateLabel(h.date), h.note] })));
      }
    }
    if (d.retirementNotes && String(d.retirementNotes.text || '').trim()) {
      heading('My retirement notes');
      callout(String(d.retirementNotes.text).trim());
    }
  };

  /* ---------------- net worth report */
  const partNW = () => {
    startPart('networth', 'Net worth report', [name ? `Name: ${name}` : null, `Created ${todayLong} · ${nw.hist.length} monthly snapshots${nw.hist.length ? ` since ${monthLabel(nw.hist[0].date, true)}` : ''}`, 'Balances before tax'],
      'Net worth report · balances before tax · not financial advice');
    toc.push({ title: 'Net worth', part, pageObj: pdf.page });
    heading('Summary');
    tiles([
      { label: 'Net worth', value: money(nw.net), sub: nw.prev ? `${sMoney(nw.net - nw.prev.net)} this month` : '' },
      { label: 'Total assets', value: money(nw.assets), sub: `${d.accounts.filter((a) => a.group !== 'debt').length} accounts` },
      { label: 'Total debts', value: money(nw.debts), sub: nw.dta != null ? `debt-to-asset ${f.pct(nw.dta)}` : '' },
      { label: '12-month change', value: nw.yearAgo ? sMoney(nw.net - nw.yearAgo.net) : '—', sub: nw.yearAgo && nw.yearAgo.net ? signed((nw.net - nw.yearAgo.net) / Math.abs(nw.yearAgo.net), pct1) : 'needs a year of history', color: nw.yearAgo ? tone(nw.net - nw.yearAgo.net) : null },
      { label: 'Emergency cushion', value: nw.emergencyMonths != null ? `${nw.emergencyMonths.toFixed(1)} months` : '—', sub: `cash ${money(nw.cash)}` },
      { label: 'Credit score', value: nw.lastScore ? String(nw.lastScore.score) : '—', sub: nw.lastScore ? `${creditBand(nw.lastScore.score)}${nw.prevScore ? ` · ${signed(nw.lastScore.score - nw.prevScore.score, (v) => `${v} pts`)}` : ''}` : '' },
    ]);
    const h = nw.hist.slice(-24);
    if (h.length >= 2) {
      heading('Net worth trend', { keep: 250 });
      para(`Monthly snapshots, ${monthLabel(h[0].date, true)} to ${monthLabel(h[h.length - 1].date, true)}.`);
      lineChart({ labels: h.map((x) => monthLabel(x.date)), height: 180, series: [
        { name: 'Net worth', color: ACC.networth, values: h.map((x) => x.net), width: 2 },
        { name: 'Assets', color: '#54A24B', values: h.map((x) => x.assets), dash: [4, 3], width: 1.2 },
        { name: 'Debts', color: '#E45756', values: h.map((x) => x.debts), dash: [4, 3], width: 1.2 }] });
    }
    heading('Assets and debts by group');
    const glab = { budget: 'On-budget (cash)', investment: 'Taxable investments', retirement: 'Retirement', property: 'Property & other', debt: 'Debts' };
    const gcol = { budget: PALETTE[4], investment: PALETTE[0], retirement: PALETTE[2], property: PALETTE[7], debt: PALETTE[3] };
    hbars(['budget', 'investment', 'retirement', 'property'].filter((g) => t.byGroup[g]).map((g) => ({ label: glab[g], frac: t.assets ? (t.byGroup[g] || 0) / t.assets : 0, color: gcol[g], text: `${money(t.byGroup[g] || 0)} (${t.assets ? f.pct((t.byGroup[g] || 0) / t.assets) : '—'})` })),
      { labelW: 140, textW: 130 });
    heading('Accounts');
    const order = ['budget', 'investment', 'retirement', 'property', 'debt'];
    const accts = [...d.accounts].sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group) || Math.abs(num(b.balance)) - Math.abs(num(a.balance)));
    table([{ label: 'Account', w: 0.21 }, { label: 'Group', w: 0.15 }, { label: 'Type', w: 0.13 }, { label: 'Balance', w: 0.12, align: 'right' }, { label: 'How it’s taxed (U.S. federal)', w: 0.39, wrap: true }],
      accts.map((a) => {
        const cat = taxCategoryOf(a), info = taxInfo()[cat];
        return { swatch: gcol[a.group], cells: [a.name, glab[a.group], a.kind || '—', (a.group === 'debt' ? '−' : '') + money(Math.abs(num(a.balance))), cat === 'debt' ? debtTax(debtKindOf(a)) : info ? info.short : ''], tones: [null, null, null, a.group === 'debt' ? BAD : null] };
      }), { size: 8 });
    const credit = [...(d.credit || [])].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 12);
    if (credit.length) {
      heading('Credit score history');
      table([{ label: 'Date', w: 0.25 }, { label: 'Score', w: 0.15, align: 'right' }, { label: 'Rating', w: 0.25 }, { label: 'Change', w: 0.15, align: 'right' }, { label: 'Source', w: 0.2 }],
        credit.map((c, i) => { const p = credit[i + 1]; const dv = p ? c.score - p.score : null; return { cells: [dateLabel(c.date), String(c.score), creditBand(c.score), dv == null ? '—' : `${dv > 0 ? '+' : dv < 0 ? '−' : '±'}${Math.abs(dv)}`, c.bureau || ''], tones: [null, null, null, dv ? tone(dv) : null] }; }));
    }
    const notes = [...(d.balanceNotes || [])].filter((n) => n.date >= isoDate(new Date(now.getFullYear() - 1, now.getMonth(), 1))).sort((a, b) => a.date.localeCompare(b.date));
    if (notes.length) {
      heading('Notes');
      table([{ label: 'Date', w: 0.18 }, { label: 'Note', w: 0.82, wrap: true }], notes.map((n) => ({ cells: [dateLabel(n.date), n.text] })));
    }
  };

  /* ---------------- investments report */
  const partInv = () => {
    startPart('investments', 'Investments report', [name ? `Name: ${name}` : null, `Created ${todayLong} · ${iv.accts.length} accounts · ${iv.months} months of account history`, iv.est ? 'Money put in is estimated from each account’s yearly contribution' : 'Contribution estimate off: all change counts as growth'],
      'Investments report · estimates, not investment advice');
    toc.push({ title: 'Investments', part, pageObj: pdf.page });
    heading('Summary');
    tiles([
      { label: 'Total invested', value: money(iv.total), sub: iv.m1 ? `${sMoney(iv.m1.change)} this month` : '' },
      { label: 'Taxable investments', value: money(iv.taxable), sub: iv.total ? `${f.pct(iv.taxable / iv.total)} of invested` : '' },
      { label: 'Retirement accounts', value: money(iv.retirement), sub: iv.total ? `${f.pct(iv.retirement / iv.total)} of invested` : '' },
      { label: iv.y1 && !iv.y1Exact ? `Change since ${monthLabel(iv.y1.from)}` : '12-month change', value: iv.y1 ? sMoney(iv.y1.change) : '—', sub: iv.y1 ? `${money(iv.y1.start)} → ${money(iv.y1.end)}` : 'needs history' },
      { label: 'Money put in (est.)', value: iv.y1 ? sMoney(iv.y1.moneyIn) : '—', sub: iv.y1 && iv.y1.flows ? `incl. ${sMoney(iv.y1.flows)} accounts opened/closed` : `${money(iv.contribYr)}/yr from settings` },
      { label: 'Market growth', value: iv.y1 ? sMoney(iv.y1.growth) : '—', sub: iv.y1 ? `${retLabel(iv.y1, f)} estimated return` : '', color: iv.y1 ? tone(iv.y1.growth) : null },
    ]);
    const tl = iv.tl.slice(-24);
    if (tl.length >= 2) {
      heading('Growth', { keep: 250 });
      lineChart({ labels: tl.map((x) => monthLabel(x.date)), height: 180, series: [
        { name: 'Total invested', color: ACC.investments, values: tl.map((x) => x.total), width: 2 },
        { name: 'Taxable', color: PALETTE[0], values: tl.map((x) => x.taxable), dash: [4, 3], width: 1.2 },
        { name: 'Retirement', color: PALETTE[2], values: tl.map((x) => x.retirement), dash: [4, 3], width: 1.2 }] });
      subheading('Month by month');
      const rows = [];
      const full = iv.tl;
      const lastRows = full.slice(-13);
      for (let k = lastRows.length - 1; k >= 1; k--) {
        const ti = full.indexOf(lastRows[k]);
        const g = invGrowth(d, full, ti - 1, ti);
        rows.push({ cells: [monthLabel(lastRows[k].date, true), lastRows[k].taxable != null ? money(lastRows[k].taxable) : '—', money(lastRows[k].retirement), lastRows[k].total != null ? money(lastRows[k].total) : '—',
          g ? sMoney(g.moneyIn) : '—', g ? sMoney(g.growth) : '—', g && g.ret != null ? signed(g.ret, pct1) : '—'], tones: [null, null, null, null, null, g ? tone(g.growth) : null, g && g.ret != null ? tone(g.ret) : null] });
      }
      table([{ label: 'Month', w: 0.18 }, { label: 'Taxable', w: 0.13, align: 'right' }, { label: 'Retirement', w: 0.14, align: 'right' }, { label: 'Total', w: 0.14, align: 'right' }, { label: 'Put in (est.)', w: 0.14, align: 'right' }, { label: 'Market', w: 0.14, align: 'right' }, { label: 'Return', w: 0.13, align: 'right' }], rows);
    }
    heading('Account performance');
    const full = iv.tl, last = full.length - 1, yearFrom = addMonths(curKey, -12);
    table([{ label: 'Account', w: 0.26 }, { label: 'Type', w: 0.16 }, { label: 'Balance', w: 0.13, align: 'right' }, { label: '1-month', w: 0.13, align: 'right' }, { label: '12-month', w: 0.14, align: 'right' }, { label: 'Market', w: 0.1, align: 'right' }, { label: 'Return', w: 0.08, align: 'right' }],
      iv.accts.sort((a, b) => (a.group === b.group ? num(b.balance) - num(a.balance) : a.group === 'investment' ? -1 : 1)).map((a) => {
        let p = -1; for (let k = last - 1; k >= 0; k--) if (full[k].byAcct[a.id] != null) { p = k; break; }
        const live = last >= 0 && full[last].date === curKey;
        const g1 = live ? invGrowth(d, full, p, last, a.id) : null;
        const gy = live ? invGrowth(d, full, invIndexFrom(full, yearFrom, a.id, curKey), last, a.id) : null;
        return { swatch: a.group === 'retirement' ? PALETTE[2] : PALETTE[0], cells: [a.name, a.kind || '—', money(num(a.balance)), g1 ? sMoney(g1.change) : '—', gy ? sMoney(gy.change) : '—', gy ? sMoney(gy.growth) : '—', gy && gy.ret != null ? signed(gy.ret, pct1) : '—'],
          tones: [null, null, null, g1 ? tone(g1.change) : null, gy ? tone(gy.change) : null, gy ? tone(gy.growth) : null, gy && gy.ret != null ? tone(gy.ret) : null] };
      }), { size: 8 });
    heading('Tax treatment');
    const cats = {};
    for (const a of iv.accts) { const c = taxCategoryOf(a); (cats[c] = cats[c] || []).push(a); }
    const ti2 = taxInfo();
    const catColor = { taxable: PALETTE[0], crypto: PALETTE[6], deferred: PALETTE[2], roth: PALETTE[5], hsa: PALETTE[4], pension: PALETTE[7], bank: PALETTE[11] };
    hbars(Object.keys(cats).map((c) => { const v = sum(cats[c], (a) => a.balance); return { label: (ti2[c] || { title: c }).title, frac: iv.total ? v / iv.total : 0, color: catColor[c], text: `${money(v)} (${iv.total ? f.pct(v / iv.total) : '—'})` }; }), { labelW: 160, textW: 120 });
    table([{ label: 'Treatment', w: 0.28 }, { label: 'How it’s taxed (U.S. federal)', w: 0.72, wrap: true }], Object.keys(cats).map((c) => ({ swatch: catColor[c], cells: [(ti2[c] || { title: c }).title, (ti2[c] || {}).short || ''] })));
  };

  /* ---------------- spending report */
  const partSp = () => {
    const months = Math.max(1, num(opts.months) || 3);
    const keys = Array.from({ length: months }, (_, i) => addMonths(curKey, -(months - i)));
    const periodTx = keys.flatMap((k) => txFor(d, k));
    const spent = sum(periodTx, (x) => x.amount);
    const budgetTotal = sum(d.categories, (c) => c.budget);
    const range = `${monthLabel(keys[0], true)} – ${monthLabel(keys[keys.length - 1], true)}`;
    startPart('spending', 'Spending & savings report', [name ? `Name: ${name}` : null, `Period: ${range} (${months} full month${months === 1 ? '' : 's'})`, `Created ${todayLong} · debit and credit card spending`],
      'Spending & savings report · from your transactions', range);
    toc.push({ title: 'Spending & savings', part, pageObj: pdf.page });
    heading('Summary');
    const debit = sum(periodTx.filter((x) => x.source === 'debit'), (x) => x.amount), credit = spent - debit;
    const cats = byCategory(periodTx);
    const incAvg = sum(keys, (k) => monthlyIncome(d, k).net) / months;
    tiles([
      { label: 'Total spending', value: money(spent), sub: `${periodTx.length} transactions` },
      { label: 'Monthly average', value: money(spent / months), sub: budgetTotal ? `budget ${money(budgetTotal)}/mo` : 'no budgets set', color: budgetTotal ? (spent / months > budgetTotal ? BAD : GOOD) : null },
      { label: 'Debit / credit', value: `${f.compact(debit)} / ${f.compact(credit)}`, sub: spent ? `${f.pct(credit / spent)} on credit cards` : '' },
      { label: 'Top category', value: cats[0] ? cats[0].name : '—', sub: cats[0] ? `${money(cats[0].total)} · ${f.pct(cats[0].total / (spent || 1))}` : '' },
      { label: 'Take-home (avg)', value: incAvg ? `${money(incAvg)}/mo` : '—', sub: 'guaranteed income' },
      { label: 'Savings rate (avg)', value: incAvg ? f.pct((incAvg - spent / months) / incAvg) : '—', sub: incAvg ? `${money(incAvg - spent / months)}/mo left` : '', color: incAvg ? tone(incAvg - spent / months) : null },
    ]);
    heading('Spending by month', { keep: 230 });
    columnChart(keys.map((k) => monthLabel(k)), [
      { name: 'Debit', color: DEBIT_COLOR, values: keys.map((k) => sum(txFor(d, k, 'debit'), (x) => x.amount)) },
      { name: 'Credit', color: CREDIT_COLOR, values: keys.map((k) => sum(txFor(d, k, 'credit'), (x) => x.amount)) },
    ], { ref: budgetTotal || null, refLabel: `Line: monthly budget ${money(budgetTotal)}`, valueLabels: true, height: 170 });
    heading('Spending by category');
    para(`Share of spending over the period. Monthly budgets are compared with the average per month.`);
    const maxCat = cats[0] ? cats[0].total : 1;
    hbars(cats.slice(0, 12).map((c, i) => ({ label: c.name, frac: c.total / maxCat, color: PALETTE[i % PALETTE.length], text: `${money(c.total)} (${f.pct(c.total / (spent || 1))})` })), { labelW: 130, textW: 120 });
    table([{ label: 'Category', w: 0.26 }, { label: 'Total', w: 0.14, align: 'right' }, { label: 'Per month', w: 0.14, align: 'right' }, { label: 'Budget / mo', w: 0.14, align: 'right' }, { label: 'vs budget', w: 0.16, align: 'right' }, { label: 'Transactions', w: 0.16, align: 'right' }],
      cats.map((c, i) => { const b = budgetFor(d, c.name), pm = c.total / months; return { swatch: PALETTE[i % PALETTE.length], cells: [c.name, money(c.total), money(pm), b ? money(b) : '—', b ? `${pm > b ? 'over ' : 'under '}${money(Math.abs(b - pm))}` : '—', String(c.count)], tones: [null, null, null, null, b ? (pm > b ? BAD : GOOD) : null] }; }));
    if (d.goals.length) {
      heading('Savings goals');
      table([{ label: 'Goal', w: 0.26 }, { label: 'Saved', w: 0.13, align: 'right' }, { label: 'Target', w: 0.13, align: 'right' }, { label: 'Progress', w: 0.11, align: 'right' }, { label: 'Deadline', w: 0.14 }, { label: 'Needed / mo', w: 0.12, align: 'right' }, { label: 'Status', w: 0.11 }],
        d.goals.map((g) => { const i = goalInfo(g); const st = i.done ? 'Done' : i.onPace === false ? 'Behind' : i.onPace ? 'On pace' : '—'; return { cells: [g.name, money(i.saved), money(i.target), f.pct(i.progress), g.deadline ? dateLabel(g.deadline) : '—', i.done ? '—' : i.monthly != null ? money(i.monthly) : '—', st], tones: [null, null, null, null, null, null, st === 'Behind' ? BAD : st === 'Done' || st === 'On pace' ? GOOD : null] }; }));
    }
    if (opts.transactions) {
      heading('Transactions');
      const txs = [...periodTx].sort((a, b) => a.date.localeCompare(b.date));
      table([{ label: 'Date', w: 0.13 }, { label: 'Description', w: 0.27, wrap: true }, { label: 'Category', w: 0.15 }, { label: 'Paid with', w: 0.14 }, { label: 'Amount', w: 0.11, align: 'right' }, { label: 'Note', w: 0.2, wrap: true }],
        txs.map((x) => ({ cells: [dateLabel(x.date), x.desc, x.category, x.source === 'credit' ? (x.card || 'Credit') : 'Debit', f.cents(x.amount), x.note || ''] })), { size: 7.8 });
    }
  };

  run({ retirement: partRet, networth: partNW, investments: partInv, spending: partSp });

  /* ---------------- appendix */
  startPart('appendix', 'Appendix: how this report was calculated', ['The methods, settings and limits behind the figures in this report, with sources. Numbers in brackets refer to the references at the end.'],
    'Finance report · appendix · predictions, not financial advice');
  toc.push({ title: 'Appendix: methods & references', part, pageObj: pdf.page });
  const settingsBox = (text) => callout(`Settings used in this report: ${text}`);
  const apxRet = () => {
    heading('Retirement', { color: ACC.retirement });
    bullets([
      'Target nest egg = (desired yearly income − Social Security/pension) ÷ withdrawal rate.',
      `Real return = (1 + expected return) ÷ (1 + inflation) − 1 = ${pct1(plan.real)} a year, so every amount is in today’s dollars and the target doesn’t grow over time.`,
      'Projection: each month every retirement account grows by the monthly real return and its yearly contribution ÷ 12 is added.',
      'Estimated retirement = the first month the projected balance reaches the target. Status compares the projection at your target age with the target: on track at 100% or more, slightly behind at 85–99%, off track below 85%.',
      'Money lasts until: from the target age, the yearly need (desired income − other income) is withdrawn monthly at the same real return until savings run out. “100+” means beyond age 100.',
      'Needed contribution = the yearly contribution that makes the projection reach the target exactly at the target age.',
      `Contribution limits are the ${taxYear()} IRS limits (${taxAsOf()}), including catch-up amounts for your age.`,
      'Not modeled: taxes on withdrawals, fees beyond what your expected return assumes, year-to-year market swings (sequence-of-returns risk) and changes to Social Security.',
    ]);
    settingsBox(`retire at ${plan.targetAge}; desired income ${money(num(r.annualIncome))}/yr; other income ${money(num(r.otherIncome))}/yr; withdrawal rate ${num(r.withdrawalRate)}%; return ${num(r.expectedReturn)}%; inflation ${num(r.inflation)}%; taxable investments ${r.includeInvestments ? 'counted' : 'not counted'}. Sources: ${cite(['trinity', 'cooley', 'bengen', 'morningstar', 'fisher', 'damodaran', 'cpi', 'fees', 'compound', 'savingsGoal', 'ssaEstimate', 'ssaDelay', 'irsLimits'])}`);
    heading('Income', { color: ACC.retirement });
    bullets([
      'Income is a guaranteed amount per month (gross before taxes and deductions; net is take-home). Amounts entered per year or per paycheck are converted to monthly.',
      'A change stays in effect until the next one. Additional income counts from its start date to its end date (if any); when no net amount was entered, net equals gross.',
      'Left after spending = monthly take-home − average spending over the last three full months. Savings rate = what’s left ÷ take-home.',
    ]);
  };
  const apxNW = () => {
    heading('Net worth', { color: ACC.networth });
    bullets([
      'Net worth = total assets − total debts, using balances as you last entered them; property values are your own estimates. Balances are before tax.',
      'Monthly snapshots are saved when balances are updated; past months can be added or edited. 12-month change compares with the snapshot from the same month last year.',
      'Debt-to-asset = debts ÷ assets. Emergency cushion = on-budget cash ÷ average monthly spending over the last three full months.',
      'Credit score bands: Poor under 580, Fair 580–669, Good 670–739, Very good 740–799, Exceptional 800+.',
      'Tax notes are general U.S. federal rules and are not tax advice.',
    ]);
    settingsBox(`${nw.hist.length} snapshots; ${d.accounts.length} accounts; U.S. tax rules ${taxAsOf()}. Sources: ${cite(['cfpbCredit', 'myfico', 'cfpbEmergency', 'tc403', 'tc404', 'tc409', 'pub590b', 'irsIndex'])}`);
  };
  const apxInv = () => {
    heading('Investments', { color: ACC.investments });
    bullets([
      'Total invested = taxable investment accounts + retirement accounts. Each account’s balance is saved every month it’s updated, or entered later as a past balance.',
      'Money put in (estimated) = each account’s yearly contribution ÷ 12 for every month, plus the balance of accounts opened or rolled in during the period, minus accounts closed.',
      'Market growth = ending balance − starting balance − money put in. It includes interest, dividends and price changes after fund fees.',
      'Estimated return uses the Modified Dietz method: market growth ÷ (starting balance + ½ × money put in). It’s an estimate that assumes deposits arrived evenly, and it isn’t annualized unless the period is 12 months.',
      'TOD Individual accounts are taxed like other brokerage accounts; rollover IRAs are taxed like traditional IRAs.',
    ]);
    settingsBox(`contribution estimate ${iv.est ? 'on' : 'off'}; ${iv.months} months of account history. Sources: ${cite(['dietz', 'compound', 'fees', 'finraTod', 'irsRollover', 'tc413'])}`);
  };
  const apxSp = () => {
    heading('Spending & savings', { color: ACC.spending });
    bullets([
      'Spending is the sum of debit and credit card transactions in each calendar month; deposits and income rows aren’t counted.',
      'Per month = total for the period ÷ number of full months. Budgets are monthly and compared with that average.',
      'Savings goals: needed per month = amount remaining ÷ months until the deadline. A goal is behind pace when the share saved is more than 5 points below the share of time elapsed.',
    ]);
    settingsBox(`${num(opts.months) || 3} full months; ${d.categories.filter((c) => c.budget).length} categories with budgets. Sources: ${cite(['cfpbEmergency'])}`);
  };
  run({ retirement: apxRet, networth: apxNW, investments: apxInv, spending: apxSp });
  heading('References', { color: ACC.appendix });
  refs.forEach((k, i) => {
    const s = SOURCES[k];
    const lines = pdf.wrap(`${i + 1}. ${s.by}. ${s.title}.`, W, 8.5);
    ensure(lines.length * 12 + 14);
    lines.forEach((ln) => { pdf.text(M, y + 8.5, ln, { size: 8.5, color: INK }); y += 12; });
    const u = pdf.fit(s.url, W - 12, 7.2);
    pdf.text(M + 12, y + 7, u, { size: 7.2, color: '#0969da' });
    pdf.link(M + 12, y - 1, pdf.width(u, 7.2), 10, s.url);
    y += 14;
  });
  y += 6;
  {
    const disc = 'This report was produced by Finance Dashboard, a personal record-keeping tool for Obsidian. Figures come from the balances, income and transactions you entered and may be incomplete. Retirement and growth figures are predictions based on your assumptions, not guarantees. Tax notes describe general U.S. federal rules. This report is for planning and education and is not financial, investment, tax or legal advice; consider a qualified professional before making decisions.';
    const lines = pdf.wrap(disc, W - 28, 8.5);
    const h = lines.length * 12 + 30;
    ensure(h);
    pdf.rect(M, y, W, h, { fill: SOFT });
    pdf.text(M + 14, y + 17, 'Disclaimer', { size: 9.5, bold: true, color: INK });
    lines.forEach((ln, i) => pdf.text(M + 14, y + 31 + i * 12, ln, { size: 8.5, color: MUTED }));
    y += h;
  }

  /* ---------------- contents, footers */
  const pageNo = (pg) => pdf.pages.indexOf(pg) + 1;
  pdf.page = tocPage;
  {
    let ty = tocY;
    pdf.rect(M, ty, W, 18, { fill: SOFT });
    pdf.text(M + 6, ty + 12, 'Section', { size: 7.8, bold: true, color: MUTED });
    pdf.text(M + W - 6, ty + 12, 'Page', { size: 7.8, bold: true, color: MUTED, align: 'right' });
    ty += 18;
    for (const e of toc) {
      pdf.rect(M + 6, ty + 5, 7, 7, { fill: e.part.color });
      pdf.text(M + 19, ty + 11.5, e.title, { size: 9, color: INK });
      pdf.text(M + W - 6, ty + 11.5, String(pageNo(e.pageObj)), { size: 9, color: INK, align: 'right' });
      ty += 17;
      pdf.line(M, ty, M + W, ty, { color: LINE, width: 0.45 });
    }
  }
  for (const p of parts) {
    p.pages.forEach((pg, i) => {
      pdf.page = pg;
      pdf.text(M, pdf.H - 30, pdf.fit(p.footer, W - 80, 7.5), { size: 7.5, color: FAINT });
      pdf.text(M + W, pdf.H - 30, `Page ${i + 1} of ${p.pages.length}`, { size: 7.5, color: FAINT, align: 'right' });
    });
  }
  return pdf.output();
}

/* ========================================================== tax rules (U.S.) */

/**
 * Built-in U.S. federal tax rules, gathered from IRS.gov on Nov 11, 2026 for tax year 2026.
 * “Refresh tax rules” re-reads the IRS pages listed in TAX_SPECS and updates any value it can confirm.
 */
const DEFAULT_TAX_RULES = {
  year: 2026,
  gathered: '2026-11-11',
  values: {
    k401: 24500, k401Catch50: 8000, k401Catch6063: 11250, ira: 7500, iraCatch50: 1100,
    hsaSelf: 4400, hsaFamily: 8750,
    stdSingle: 16100, stdJoint: 32200,
    rates: [10, 12, 22, 24, 32, 35, 37],
    brSingle: [12400, 50400, 105700, 201775, 256225, 640600],
    brJoint: [24800, 100800, 211400, 403550, 512450, 768700],
    ltcg0Single: 49450, ltcg0Joint: 98900, ltcg15Single: 545500, ltcg15Joint: 613700,
    capLoss: 3000, capLossMfs: 1500,
    rmdAge: 73, earlyAge: 59.5, earlyPenalty: 10, hsaPenalty: 20, hsaAge: 65,
    homeSingle: 250000, homeJoint: 500000,
    studentLoan: 2500,
    carLoan: 10000, carFrom: 2025, carTo: 2028, carPhaseSingle: 100000, carPhaseJoint: 200000,
  },
};
const TAX_LABELS = {
  k401: '401(k) / 403(b) / 457(b) employee limit', k401Catch50: '401(k) catch-up (age 50+)', k401Catch6063: '401(k) catch-up (ages 60–63)',
  ira: 'IRA contribution limit', iraCatch50: 'IRA catch-up (age 50+)', hsaSelf: 'HSA limit (self-only)', hsaFamily: 'HSA limit (family)',
  stdSingle: 'Standard deduction (single)', stdJoint: 'Standard deduction (married filing jointly)',
  brSingle: 'Tax brackets (single)', brJoint: 'Tax brackets (married filing jointly)',
  ltcg0Single: '0% capital-gain rate up to (single)', ltcg0Joint: '0% capital-gain rate up to (joint)', ltcg15Single: '15% capital-gain rate up to (single)', ltcg15Joint: '15% capital-gain rate up to (joint)',
  capLoss: 'Capital loss deduction limit', rmdAge: 'Required minimum distributions start at age', homeSingle: 'Home-sale exclusion (single)', homeJoint: 'Home-sale exclusion (joint)',
  studentLoan: 'Student loan interest deduction (max)', carLoan: 'New-car loan interest deduction (max)',
};
/** Live state: the rules in use and how each value was last checked. Set on load and after a refresh. */
const TAX_STATE = { rules: DEFAULT_TAX_RULES, status: {}, refreshed: null, upcoming: null, filing: 'single' };

function applyTaxRules(data) {
  const saved = data.taxRules || {};
  const useSaved = saved.values && num(saved.year) >= DEFAULT_TAX_RULES.year;
  TAX_STATE.rules = useSaved ? { year: saved.year, gathered: saved.gathered || DEFAULT_TAX_RULES.gathered, values: Object.assign({}, DEFAULT_TAX_RULES.values, saved.values) } : DEFAULT_TAX_RULES;
  TAX_STATE.status = useSaved ? saved.status || {} : {};
  TAX_STATE.refreshed = useSaved ? saved.refreshed || null : null;
  TAX_STATE.upcoming = useSaved ? saved.upcoming || null : null;
  TAX_STATE.filing = (data.settings && data.settings.filingStatus) || 'single';
}
const taxR = () => TAX_STATE.rules.values;
const taxYear = () => TAX_STATE.rules.year;
function taxAsOf() {
  const g = TAX_STATE.refreshed || TAX_STATE.rules.gathered;
  return `${taxYear()} rules · ${TAX_STATE.refreshed ? 'refreshed' : 'gathered'} ${dateLabel(String(g).slice(0, 10))}`;
}

/** Marginal federal bracket for a yearly gross income (after the standard deduction). */
function marginalRate(grossYear, filing) {
  const R = taxR(), joint = filing === 'joint';
  const taxable = Math.max(0, grossYear - (joint ? R.stdJoint : R.stdSingle));
  const br = joint ? R.brJoint : R.brSingle;
  let rate = R.rates[0];
  br.forEach((t, i) => { if (taxable > t) rate = R.rates[i + 1]; });
  return { rate, taxable };
}
function ltcgRate(taxable, filing) {
  const R = taxR(), joint = filing === 'joint';
  if (taxable <= (joint ? R.ltcg0Joint : R.ltcg0Single)) return 0;
  if (taxable <= (joint ? R.ltcg15Joint : R.ltcg15Single)) return 15;
  return 20;
}

/** Retirement contribution checks against this year's IRS limits (uses age for catch-ups). */
function contributionChecks(data) {
  const R = taxR(), age = ageOn(data.retirement.birthDate, new Date());
  const a50 = age >= 50, a6063 = age >= 60 && age < 64;
  const kinds = (re) => data.accounts.filter((a) => (a.group === 'retirement' || a.group === 'investment') && re.test(String(a.kind || '')));
  const out = [];
  const iras = kinds(/\bira\b|roth ira/i).filter((a) => !/sep|simple/i.test(a.kind || ''));
  if (iras.length) {
    const limit = R.ira + (a50 ? R.iraCatch50 : 0), c = sum(iras, (a) => a.contribution);
    out.push({ key: 'ira', label: 'IRAs (traditional + Roth combined)', accounts: iras, contribution: c, limit, status: c > limit + 0.5 ? 'over' : 'ok',
      note: c > limit + 0.5 ? `Over the ${taxYear()} limit by ${new Fmt(data.settings).money(c - limit)}.` : `Room for ${new Fmt(data.settings).money(limit - c)} more this year.` });
  }
  const work = kinds(/401|403|457|tsp/i);
  if (work.length) {
    const limit = R.k401 + (a6063 ? R.k401Catch6063 : a50 ? R.k401Catch50 : 0), c = sum(work, (a) => a.contribution);
    out.push({ key: 'k401', label: 'Workplace plans (401(k), 403(b), 457(b))', accounts: work, contribution: c, limit, status: 'info',
      note: `Your own pay deferrals can be up to ${new Fmt(data.settings).money(limit)}${a6063 ? ' (includes the age 60–63 catch-up)' : a50 ? ' (includes the 50+ catch-up)' : ''}. Employer match doesn’t count toward this, so if your ${new Fmt(data.settings).money(c)} includes a match you may have more room.` });
  }
  const hsas = kinds(/hsa|health sav/i);
  if (hsas.length) {
    const c = sum(hsas, (a) => a.contribution), fam = R.hsaFamily, self = R.hsaSelf, f = new Fmt(data.settings);
    out.push({ key: 'hsa', label: 'HSA', accounts: hsas, contribution: c, limit: fam, status: c > fam + 0.5 ? 'over' : c > self + 0.5 ? 'warn' : 'ok',
      note: c > fam + 0.5 ? `Over the ${taxYear()} family limit of ${f.money(fam)}.` : c > self + 0.5 ? `Above the self-only limit (${f.money(self)}) — fine only with family coverage (limit ${f.money(fam)}).` : `Room for ${f.money(self - c)} more with self-only coverage, ${f.money(fam - c)} with family.` });
  }
  return out;
}

/* ---- Refresh: re-read IRS pages and update values that can be confirmed ---- */

function htmlToText(html) {
  return String(html || '').replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;|&#xa0;/gi, ' ').replace(/&amp;/g, '&').replace(/&#36;|&dollar;/g, '$')
    .replace(/&#8217;|&rsquo;/g, '’').replace(/&#8209;|&#8211;|&ndash;/g, '-').replace(/‑/g, '-').replace(/\s+/g, ' ');
}
const money2num = (s) => Number(String(s).replace(/[$,]/g, ''));
/** First regex match within `win` characters after an anchor. */
function findAfter(text, anchor, re, win = 600) {
  const m = anchor.exec(text);
  if (!m) return null;
  return re.exec(text.slice(m.index, m.index + win));
}
async function fetchText(url) {
  if (obsidian.requestUrl) { const r = await obsidian.requestUrl({ url, method: 'GET', throw: false }); if (r.status >= 400) throw new Error(`HTTP ${r.status}`); return r.text; }
  const r = await fetch(url); if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.text();
}
const IRS = 'https://www.irs.gov';
const IRS_INDEX = `${IRS}/newsroom/inflation-adjusted-tax-items-by-tax-year`;

/** Parsers are pure functions of page text so they can be tested without the network. */
const TAX_PARSERS = {
  /** From the IRS index page HTML: links to each year's retirement-limit and tax-adjustment releases. */
  index(html) {
    const years = {};
    const re = /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    let m;
    while ((m = re.exec(html))) {
      const text = htmlToText(m[2]).trim(), href = m[1].startsWith('http') ? m[1] : IRS + m[1];
      const y = text.match(/401\(k\)[\s\S]*?\$([\d,]+)[\s\S]*?for (\d{4})/i);
      if (y) {
        const yr = Number(y[2]);
        (years[yr] = years[yr] || {}).limits = href;
        const ira = text.match(/IRA limit[^$]*\$([\d,]+)/i);
        years[yr].title = { k401: money2num(y[1]), ira: ira ? money2num(ira[1]) : null };
      } else {
        const z = text.match(/inflation adjustments for tax year (\d{4})/i);
        if (z) (years[Number(z[1])] = years[Number(z[1])] || {}).tax = href;
      }
    }
    return years;
  },
  limits(text) {
    const v = {};
    let m;
    if ((m = /401\(k\)[^$]{0,250}?(?:increased to|remains|is) \$([\d,]+)/i.exec(text))) v.k401 = money2num(m[1]);
    if ((m = /catch-?up contribution limit (?:that generally applies )?for employees aged 50 and over[^$]{0,250}?\$([\d,]+)/i.exec(text))) v.k401Catch50 = money2num(m[1]);
    if ((m = findAfter(text, /60,? 61,? 62,? and 63/i, /(?:remains|increased to|is) \$([\d,]+)/i, 700))) v.k401Catch6063 = money2num(m[1]);
    if ((m = /limit on annual contributions to an IRA[^$]{0,80}?\$([\d,]+)/i.exec(text))) v.ira = money2num(m[1]);
    if ((m = /IRA catch-?\s?up contribution limit[^$]{0,250}?\$([\d,]+)/i.exec(text))) v.iraCatch50 = money2num(m[1]);
    return v;
  },
  inflation(text) {
    const v = {};
    let m;
    if ((m = /single taxpayers and married individuals filing separately,? the standard deduction[^$]{0,60}\$([\d,]+)/i.exec(text))) v.stdSingle = money2num(m[1]);
    if ((m = /married couples filing jointly,? the standard deduction[^$]{0,60}\$([\d,]+)/i.exec(text)) ||
        (m = /standard deduction (?:increases|rises|will be|is) (?:to )?\$([\d,]+) for married couples filing jointly/i.exec(text))) v.stdJoint = money2num(m[1]);
    const rows = {};
    if ((m = /(\d{2})% for individual single taxpayers with incomes? greater than \$([\d,]+) \(\$([\d,]+)/i.exec(text))) rows[m[1]] = [money2num(m[2]), money2num(m[3])];
    const re = /(\d{2})% for incomes over \$([\d,]+) \(\$([\d,]+)/gi;
    while ((m = re.exec(text))) rows[m[1]] = [money2num(m[2]), money2num(m[3])];
    const order = ['12', '22', '24', '32', '35', '37'];
    if (order.every((r) => rows[r])) { v.brSingle = order.map((r) => rows[r][0]); v.brJoint = order.map((r) => rows[r][1]); }
    return v;
  },
  rmd(text) { const m = /reach(?:es)? age (\d{2})/i.exec(text); return m ? { rmdAge: Number(m[1]) } : {}; },
  home(text) {
    const v = {}; let m;
    if ((m = /exclude up to \$([\d,]+) of (?:that|the) gain/i.exec(text))) v.homeSingle = money2num(m[1]);
    if ((m = /up to \$([\d,]+) of (?:that|the) gain if you file a joint return/i.exec(text))) v.homeJoint = money2num(m[1]);
    return v;
  },
  capLoss(text) { const m = /lesser of \$([\d,]+) \(\$([\d,]+) if (?:you are )?married filing separately\)/i.exec(text); return m ? { capLoss: money2num(m[1]), capLossMfs: money2num(m[2]) } : {}; },
  student(text) { const m = findAfter(text, /student loan interest/i, /(?:up to|maximum (?:deduction )?(?:of|is)) \$([\d,]+)/i, 2500); return m ? { studentLoan: money2num(m[1]) } : {}; },
  car(text) {
    const v = {}; const a = /car loan interest|vehicle loan interest/i.exec(text);
    if (!a) return v;
    const w = text.slice(a.index, a.index + 2500); let m;
    if ((m = /Maximum annual deduction is \$([\d,]+)/i.exec(w))) v.carLoan = money2num(m[1]);
    if ((m = /Effective for (\d{4}) through (\d{4})/i.exec(w))) { v.carFrom = Number(m[1]); v.carTo = Number(m[2]); }
    if ((m = /above \$([\d,]+) \(\$([\d,]+) for joint filers\)/i.exec(w))) { v.carPhaseSingle = money2num(m[1]); v.carPhaseJoint = money2num(m[2]); }
    return v;
  },
  hsa(text, year) {
    const v = {};
    const s = new RegExp(`For ${year}, if you have self-only HDHP coverage, you can contribute up to \\$([\\d,]+)`, 'i').exec(text);
    const f = new RegExp(`(?:For ${year}, )?[^.]{0,40}family HDHP coverage, you can contribute up to \\$([\\d,]+)`, 'i').exec(s ? text.slice(s.index, s.index + 600) : '');
    if (s) v.hsaSelf = money2num(s[1]);
    if (f) v.hsaFamily = money2num(f[1]);
    return v;
  },
};

/**
 * Re-read the IRS pages. Returns a report of every value: updated / confirmed / not found / error.
 * Values that can't be confirmed are kept as they are.
 */
async function refreshTaxRules(fetcher = fetchText, now = new Date()) {
  const year = now.getFullYear();
  const cur = TAX_STATE.rules.values;
  const found = {}, report = [], pages = [];
  const note = (keys, src, status, msg) => pages.push({ keys, src, status, msg });
  let targetYear = Math.max(taxYear(), Math.min(year, taxYear() + 1));
  let upcoming = null;
  // 1. Which year's releases exist?
  let idx = {};
  try { idx = TAX_PARSERS.index(await fetcher(IRS_INDEX)); note(['index'], IRS_INDEX, 'ok', `Found releases for ${Object.keys(idx).sort().slice(-3).join(', ')}`); }
  catch (e) { note(['index'], IRS_INDEX, 'error', String(e.message || e)); }
  const yearsAvail = Object.keys(idx).map(Number).filter((y) => idx[y].limits || idx[y].tax).sort();
  if (yearsAvail.length) {
    const usable = yearsAvail.filter((y) => y <= year);
    if (usable.length) targetYear = usable[usable.length - 1];
    const next = yearsAvail.filter((y) => y > targetYear);
    if (next.length && idx[next[0]].title) upcoming = { year: next[0], ...idx[next[0]].title, url: idx[next[0]].limits };
  }
  const yr = idx[targetYear] || {};
  // 2. Read each page and parse
  const jobs = [
    ['limits', yr.limits, (t) => TAX_PARSERS.limits(t)],
    ['inflation', yr.tax, (t) => TAX_PARSERS.inflation(t)],
    ['rmd', SOURCES.rmd.url, (t) => TAX_PARSERS.rmd(t)],
    ['home', SOURCES.tc701.url, (t) => TAX_PARSERS.home(t)],
    ['capLoss', SOURCES.tc409.url, (t) => TAX_PARSERS.capLoss(t)],
    ['student', SOURCES.tc456.url, (t) => TAX_PARSERS.student(t)],
    ['car', SOURCES.obbba.url, (t) => TAX_PARSERS.car(t)],
    ['hsa', SOURCES.pub969.url, (t) => TAX_PARSERS.hsa(t, targetYear)],
  ];
  for (const [name, url, parse] of jobs) {
    if (!url) { note([name], null, 'missing', `No ${targetYear} page found on the IRS index`); continue; }
    try {
      const v = parse(htmlToText(await fetcher(url)));
      Object.assign(found, v);
      note(Object.keys(v), url, Object.keys(v).length ? 'ok' : 'nomatch', Object.keys(v).length ? '' : 'Page read, but the expected wording wasn’t found');
    } catch (e) { note([name], url, 'error', String(e.message || e)); }
  }
  // 3. Compare
  const yearChanged = targetYear !== taxYear();
  const next = Object.assign({}, yearChanged ? DEFAULT_TAX_RULES.values : cur);
  if (yearChanged) Object.assign(next, cur); // start from the last known values, then overwrite with confirmed ones
  const status = {};
  const today = isoDate(now);
  for (const k of Object.keys(TAX_LABELS)) {
    const old = cur[k], got = found[k];
    const sane = got != null && (Array.isArray(got) ? got.every((x) => x > 0) : got > 0);
    if (sane) {
      const same = JSON.stringify(old) === JSON.stringify(got);
      next[k] = got;
      status[k] = { status: same ? 'confirmed' : 'updated', checked: today, old: same ? undefined : old };
    } else {
      status[k] = { status: k.startsWith('ltcg') ? 'manual' : 'unconfirmed', checked: today };
    }
    report.push({ key: k, label: TAX_LABELS[k], old, value: next[k], ...status[k] });
  }
  // Capital-gain thresholds come from Rev. Proc. PDFs; keep them unless the year changed (then flag for review).
  return { year: targetYear, values: next, status, report, pages, upcoming, refreshed: now.toISOString(), yearChanged };
}

/* ===================================================== net worth: explainers */

Object.assign(SOURCES, {
  cfpbCredit: { title: 'What is a credit score?', by: 'Consumer Financial Protection Bureau', url: 'https://www.consumerfinance.gov/ask-cfpb/what-is-a-credit-score-en-315/',
    why: 'What credit scores are, who calculates them and how lenders use them.' },
  myfico: { title: 'Credit scores and score ranges', by: 'myFICO (FICO)', url: 'https://www.myfico.com/credit-education/credit-scores',
    why: 'The 300–850 range and the Poor / Fair / Good / Very good / Exceptional bands used on the credit chart.' },
  cfpbEmergency: { title: 'An essential guide to building an emergency fund', by: 'Consumer Financial Protection Bureau', url: 'https://www.consumerfinance.gov/start-small-save-up/start-saving/an-essential-guide-to-building-an-emergency-fund/',
    why: 'Why a cash cushion matters and how to build one.' },
  tc403: { title: 'Topic no. 403, Interest received', by: 'IRS', url: 'https://www.irs.gov/taxtopics/tc403', why: 'How bank, CD, money-market and Treasury interest is taxed.' },
  tc404: { title: 'Topic no. 404, Dividends', by: 'IRS', url: 'https://www.irs.gov/taxtopics/tc404', why: 'Ordinary vs qualified dividends.' },
  tc409: { title: 'Topic no. 409, Capital gains and losses', by: 'IRS', url: 'https://www.irs.gov/taxtopics/tc409', why: 'Short- vs long-term gains, the 0/15/20% rates, the $3,000 loss limit and personal-use property.' },
  pub550: { title: 'Publication 550, Investment Income and Expenses', by: 'IRS', url: 'https://www.irs.gov/publications/p550', why: 'The full guide to taxes on interest, dividends and investment sales.' },
  digital: { title: 'Digital assets', by: 'IRS', url: 'https://www.irs.gov/filing/digital-assets', why: 'How crypto and other digital assets are taxed and reported.' },
  rmd: { title: 'Required minimum distributions (RMDs)', by: 'IRS', url: 'https://www.irs.gov/retirement-plans/plan-participant-employee/retirement-topics-required-minimum-distributions-rmds',
    why: 'When withdrawals from tax-deferred accounts become mandatory, and why Roth accounts are exempt for owners.' },
  tc557: { title: 'Topic no. 557, Additional tax on early IRA distributions', by: 'IRS', url: 'https://www.irs.gov/taxtopics/tc557', why: 'The 10% additional tax before age 59½ and its exceptions (IRAs).' },
  tc558: { title: 'Topic no. 558, Early distributions from other retirement plans', by: 'IRS', url: 'https://www.irs.gov/taxtopics/tc558', why: 'The same rule for 401(k), 403(b) and other workplace plans.' },
  pub590b: { title: 'Publication 590-B, Distributions from IRAs', by: 'IRS', url: 'https://www.irs.gov/publications/p590b', why: 'Detailed rules for traditional and Roth IRA withdrawals, including qualified Roth distributions.' },
  roth: { title: 'Roth IRAs', by: 'IRS', url: 'https://www.irs.gov/retirement-plans/roth-iras', why: 'Non-deductible contributions and tax-free qualified distributions.' },
  pub969: { title: 'Publication 969, Health Savings Accounts', by: 'IRS', url: 'https://www.irs.gov/publications/p969', why: 'HSA deductions, tax-free medical withdrawals and the 20% additional tax.' },
  tc410: { title: 'Topic no. 410, Pensions and annuities', by: 'IRS', url: 'https://www.irs.gov/taxtopics/tc410', why: 'When pension payments are fully or partly taxable.' },
  tc701: { title: 'Topic no. 701, Sale of your home', by: 'IRS', url: 'https://www.irs.gov/taxtopics/tc701', why: 'The $250,000 / $500,000 home-sale exclusion and the 2-of-5-years tests.' },
  pub936: { title: 'Publication 936, Home Mortgage Interest Deduction', by: 'IRS', url: 'https://www.irs.gov/publications/p936', why: 'When mortgage interest is deductible and the limits.' },
  tc456: { title: 'Topic no. 456, Student loan interest deduction', by: 'IRS', url: 'https://www.irs.gov/taxtopics/tc456', why: 'The up-to-$2,500 deduction and income limits.' },
  tc505: { title: 'Topic no. 505, Interest expense', by: 'IRS', url: 'https://www.irs.gov/taxtopics/tc505', why: 'Which kinds of interest are deductible and which (like credit cards) aren’t.' },
  irsLimits: { title: 'Retirement contribution limits for the current year', by: 'IRS newsroom', url: 'https://www.irs.gov/newsroom/401k-limit-increases-to-24500-for-2026-ira-limit-increases-to-7500',
    why: '401(k), 403(b), 457(b), IRA and catch-up limits for 2026.' },
  irsInflation: { title: 'Tax inflation adjustments for tax year 2026', by: 'IRS newsroom', url: 'https://www.irs.gov/newsroom/irs-releases-tax-inflation-adjustments-for-tax-year-2026-including-amendments-from-the-one-big-beautiful-bill',
    why: '2026 tax brackets and standard deduction, used for the estimated tax rate.' },
  irsIndex: { title: 'Inflation-adjusted tax items by tax year', by: 'IRS newsroom', url: 'https://www.irs.gov/newsroom/inflation-adjusted-tax-items-by-tax-year',
    why: 'Where “Refresh tax rules” looks for each year’s new limits and brackets.' },
  revproc2532: { title: 'Revenue Procedure 2025-32 (2026 inflation adjustments)', by: 'IRS', url: 'https://www.irs.gov/pub/irs-drop/rp-25-32.pdf',
    why: 'Official 2026 figures, including the long-term capital-gain rate thresholds.' },
  revproc2519: { title: 'Revenue Procedure 2025-19 (2026 HSA limits)', by: 'IRS', url: 'https://www.irs.gov/pub/irs-drop/rp-25-19.pdf',
    why: 'Official 2026 HSA contribution limits.' },
  obbba: { title: 'One, Big, Beautiful Bill Act: tax deductions for working Americans and seniors', by: 'IRS', url: 'https://www.irs.gov/newsroom/one-big-beautiful-bill-act-tax-deductions-for-working-americans-and-seniors',
    why: 'The 2025–2028 deduction for interest on loans for new U.S.-assembled vehicles.' },
});
const NW_SOURCE_GROUPS = [
  ['Credit & cash cushion', ['cfpbCredit', 'myfico', 'cfpbEmergency']],
  ['Bank accounts & investments', ['tc403', 'tc404', 'tc409', 'pub550', 'digital']],
  ['Retirement & health accounts', ['rmd', 'tc557', 'tc558', 'pub590b', 'roth', 'pub969', 'tc410']],
  ['Home & debts', ['tc701', 'pub936', 'tc456', 'tc505', 'obbba']],
  ['Current-year tax numbers', ['irsIndex', 'irsLimits', 'irsInflation', 'revproc2532', 'revproc2519']],
];

const usd = (v) => `$${Number(v).toLocaleString('en-US')}`;
/** How each kind of account is taxed (general U.S. federal rules), built from the current tax rules. */
function taxInfo() {
  const R = taxR(), Y = taxYear();
  return {
  bank: { title: 'Bank accounts & cash', covers: 'Checking, savings, high-yield savings, money market, CDs, cash', icon: 'landmark',
    points: ['The money itself isn’t taxed again — you already paid tax when you earned it.',
      'Interest is taxable income in the year it’s credited to your account, even if you don’t withdraw it. Banks send Form 1099-INT for $10 or more.',
      'Interest on U.S. Treasury bills, notes and bonds is taxed federally but exempt from state and local income tax.'],
    effect: 'Counted at full value — no tax is due when you spend it.', short: 'Interest is taxed as ordinary income each year; the balance itself isn’t taxed.', sources: ['tc403'] },
  taxable: { title: 'Taxable investments', covers: 'Brokerage and TOD individual accounts, stocks, ETFs and funds, bonds', icon: 'trending-up',
    points: ['Dividends are taxed each year: qualified dividends at the lower long-term capital-gain rates, others as ordinary income.',
      `Growth isn’t taxed until you sell. Gains on investments held more than one year are long-term: for ${Y}, 0% up to ${usd(R.ltcg0Single)} of taxable income (${usd(R.ltcg0Joint)} joint), 15% up to ${usd(R.ltcg15Single)} (${usd(R.ltcg15Joint)} joint), 20% above. Held one year or less, they’re taxed as ordinary income.`,
      `Losses offset gains, and up to ${usd(R.capLoss)} a year (${usd(R.capLossMfs)} if married filing separately) of extra losses can offset other income; the rest carries forward.`,
      'Interest on some state and local government (municipal) bonds isn’t taxed federally, but must still be reported.'],
    effect: 'Counted before tax. Selling at a gain means some of the gain goes to tax.', short: `Dividends taxed yearly; gains taxed when you sell (0/15/20% if held over a year).`, sources: ['tc404', 'tc409', 'revproc2532', 'pub550'] },
  crypto: { title: 'Crypto & digital assets', covers: 'Bitcoin, other cryptocurrencies, NFTs', icon: 'coins',
    points: ['The IRS treats digital assets as property, not currency.',
      'Selling, trading one coin for another, or spending crypto can create a taxable gain or loss, using the same short- and long-term rules as stocks.',
      'Crypto received as pay or as rewards is generally taxable income.'],
    effect: 'Counted before tax; gains are taxed when you sell, trade or spend.', short: 'Taxed like property: gains or losses when you sell, trade or spend it.', sources: ['digital', 'tc409'] },
  deferred: { title: 'Tax-deferred retirement', covers: 'Traditional 401(k), 403(b), 457(b), traditional and rollover IRAs, SEP and SIMPLE IRAs', icon: 'piggy-bank',
    points: [`Contributions are usually made before tax (or are deductible), and growth isn’t taxed each year. ${Y} limits: ${usd(R.k401)} to a 401(k)/403(b)/457(b) (+${usd(R.k401Catch50)} at 50+, +${usd(R.k401Catch6063)} at 60–63) and ${usd(R.ira)} to IRAs (+${usd(R.iraCatch50)} at 50+).`,
      'Withdrawals are taxed as ordinary income.',
      `Withdrawals before age ${R.earlyAge === 59.5 ? '59½' : R.earlyAge} generally owe an additional ${R.earlyPenalty}% tax unless an exception applies.`,
      `Required minimum distributions generally start at age ${R.rmdAge}.`],
    effect: 'Counted before tax — part of this balance will go to income tax when you withdraw it.', short: `Withdrawals taxed as ordinary income; ${R.earlyPenalty}% extra before ${R.earlyAge === 59.5 ? '59½' : R.earlyAge}; RMDs from ${R.rmdAge}.`, sources: ['rmd', 'tc557', 'tc558', 'pub590b', 'irsLimits'] },
  roth: { title: 'Roth accounts', covers: 'Roth IRA, Roth 401(k) and other designated Roth accounts', icon: 'shield-check',
    points: [`Contributions are made with after-tax money — there’s no deduction. Roth IRA contributions share the ${usd(R.ira)} IRA limit for ${Y}.`,
      'Qualified withdrawals — generally after age 59½ and once the account has been open five years — are tax-free, including growth.',
      'No required minimum distributions while the owner is alive.'],
    effect: 'Close to its full value after tax when withdrawals are qualified.', short: 'After-tax contributions; qualified withdrawals (incl. growth) are tax-free.', sources: ['roth', 'pub590b', 'rmd', 'irsLimits'] },
  hsa: { title: 'Health savings account (HSA)', covers: 'HSA', icon: 'heart-pulse',
    points: [`Contributions are tax-deductible (or pre-tax through payroll), and growth isn’t taxed. ${Y} limits: ${usd(R.hsaSelf)} self-only, ${usd(R.hsaFamily)} family.`,
      'Withdrawals for qualified medical expenses are tax-free.',
      `Other withdrawals are taxable income plus an additional ${R.hsaPenalty}% tax, unless you’re ${R.hsaAge} or older, disabled, or the withdrawal follows death.`],
    effect: 'Full value when used for medical costs; otherwise taxed like a traditional account.', short: 'Tax-free in, growing and out for qualified medical costs.', sources: ['pub969', 'revproc2519'] },
  pension: { title: 'Pensions', covers: 'Defined-benefit pensions and annuities', icon: 'landmark',
    points: ['Pension payments are generally taxed as ordinary income when you receive them.',
      'If you contributed after-tax money, part of each payment may be tax-free.'],
    effect: 'Payments are taxed as you receive them.', short: 'Payments generally taxed as ordinary income when received.', sources: ['tc410'] },
  home: { title: 'Your home & real estate', covers: 'Main home, second homes, rental property, land', icon: 'home',
    points: ['No income tax while you own it (property taxes are separate and set locally).',
      `When you sell your main home, you can exclude up to ${usd(R.homeSingle)} of gain (${usd(R.homeJoint)} if married filing jointly) if you owned and lived in it for at least 2 of the last 5 years.`,
      'Gains above the exclusion, and on homes that don’t qualify (such as rentals), are generally taxable.'],
    effect: 'Counted at your estimated value; selling costs such as agent fees would reduce what you keep.', short: `Main-home sale: up to ${usd(R.homeSingle)}/${usd(R.homeJoint)} of gain excluded if you lived there 2 of 5 years.`, sources: ['tc701'] },
  personal: { title: 'Vehicles & personal property', covers: 'Cars, collectibles and other things you own', icon: 'car',
    points: ['No income tax while you own it.',
      'A loss when you sell something you used personally, like your car, isn’t deductible; a gain is taxable.'],
    effect: 'Usually loses value over time.', short: 'Loss on sale isn’t deductible; a gain is taxable.', sources: ['tc409'] },
  debt: { title: 'Debts & interest', covers: 'Mortgage, student, auto and personal loans, credit cards', icon: 'receipt',
    points: ['Repaying a loan isn’t taxed or deductible — only the interest can matter.',
      'Mortgage interest on your main or second home can be deductible if you itemize, within limits.',
      `Student loan interest: up to ${usd(R.studentLoan)} a year can be deducted, subject to income limits, even if you don’t itemize.`,
      `New-car loan interest (${R.carFrom}–${R.carTo}): up to ${usd(R.carLoan)} a year for a new, U.S.-assembled vehicle for personal use, with a loan taken out after ${R.carFrom - 1}; phases out above ${usd(R.carPhaseSingle)} of income (${usd(R.carPhaseJoint)} joint). Available whether or not you itemize.`,
      'Interest on credit cards and personal loans for personal spending isn’t deductible.'],
    effect: 'Counted at the amount owed.', short: 'Only interest matters; most personal interest isn’t deductible.', sources: ['pub936', 'tc456', 'obbba', 'tc505'] },
  };
}
function debtTax(kind) {
  const R = taxR();
  return {
    mortgage: 'Interest may be deductible if you itemize, within limits.',
    student: `Up to ${usd(R.studentLoan)} of interest a year may be deductible (income limits apply), even without itemizing.`,
    auto: `For a new, U.S.-assembled personal vehicle financed after ${R.carFrom - 1}, up to ${usd(R.carLoan)} of interest a year may be deductible in ${R.carFrom}–${R.carTo} (income limits).`,
    card: 'Interest on personal credit cards isn’t deductible.',
    other: 'Interest on personal loans for personal spending generally isn’t deductible.',
  }[kind];
}
function taxCategoryOf(a) {
  const k = String(a.kind || '').toLowerCase();
  if (a.group === 'debt') return 'debt';
  if (/roth/.test(k)) return 'roth';
  if (/hsa|health sav/.test(k)) return 'hsa';
  if (/pension|annuit/.test(k)) return 'pension';
  if (/crypto|bitcoin|digital|nft/.test(k)) return 'crypto';
  if (/401|403|457|\bira\b|sep|simple|tsp|traditional|rollover/.test(k)) return 'deferred';
  if (a.group === 'retirement') return 'deferred';
  if (/\bcds?\b|certificate|money market|saving|checking|cash/.test(k)) return 'bank';
  if (a.group === 'budget') return 'bank';
  if (/home|house|condo|rental|land|real estate|property/.test(k)) return 'home';
  if (a.group === 'property') return 'personal';
  if (a.group === 'investment') return 'taxable';
  return 'bank';
}
function debtKindOf(a) {
  const k = String(a.kind || '').toLowerCase();
  if (/mortgage|heloc|home equity/.test(k)) return 'mortgage';
  if (/student/.test(k)) return 'student';
  if (/auto|car|vehicle/.test(k)) return 'auto';
  if (/credit card|card/.test(k)) return 'card';
  return 'other';
}
/** Tooltip for one account: what kind of account it is and how it's taxed. */
function accountTaxTip(a, f) {
  const cat = taxCategoryOf(a), info = taxInfo()[cat];
  const line = cat === 'debt' ? debtTax(debtKindOf(a)) : info.short;
  return { key: `acct:${a.id}`, title: `${a.kind || info.title} · ${info.title}`, wide: true,
    body: [cat === 'debt' ? `${f.money(Math.abs(num(a.balance)))} owed. Debts are subtracted from your assets to get net worth.` : info.effect],
    calcLabel: `How it’s taxed (U.S. federal, ${taxYear()} rules)`, calc: line };
}

/** Everything the Net Worth explainer and tooltips need, computed from current data. */
function nwStats(data) {
  const t = totals(data);
  const hist = data.history || [];
  const key = monthKey(new Date());
  const prev = hist.filter((h) => h.date < key).slice(-1)[0] || null;
  const cur = hist.find((h) => h.date === key) || null;
  const yearAgo = hist.find((h) => h.date === addMonths(key, -12)) || null;
  const g = t.byGroup;
  const cash = g.budget || 0, inv = g.investment || 0, ret = g.retirement || 0, prop = g.property || 0;
  const spends = [1, 2, 3].map((i) => sum(txFor(data, addMonths(key, -i)), (x) => x.amount)).filter((v) => v > 0);
  const avgSpend = spends.length ? sum(spends) / spends.length : 0;
  const credit = [...(data.credit || [])].sort((a, b) => a.date.localeCompare(b.date));
  const byCat = {};
  for (const a of data.accounts) { const c = taxCategoryOf(a); (byCat[c] = byCat[c] || []).push(a); }
  const deferredTotal = sum(byCat.deferred || [], (a) => a.balance);
  return { t, assets: t.assets, debts: t.debts, net: t.net, cash, inv, ret, prop, liquid: cash + inv, prev, cur, yearAgo, hist,
    dta: t.assets ? t.debts / t.assets : null, avgSpend, emergencyMonths: avgSpend ? cash / avgSpend : null,
    lastScore: credit[credit.length - 1] || null, prevScore: credit[credit.length - 2] || null, byCat, deferredTotal,
    debtList: data.accounts.filter((a) => a.group === 'debt').sort((a, b) => num(b.balance) - num(a.balance)) };
}

Object.assign(GLOSSARY, {
  netWorth: { title: 'Net worth', body: ['Everything you own minus everything you owe. It’s a snapshot of your finances at one moment, shown before any taxes you’d owe when selling or withdrawing.'],
    calc: ({ nw, f }) => `${f.money(nw.assets)} assets − ${f.money(nw.debts)} debts = ${f.money(nw.net)}` },
  totalAssets: { title: 'Total assets', body: ['The current value of what you own: cash, investments, retirement accounts, your home, vehicles and other property. Property values are your own estimates.'],
    calc: ({ nw, f }) => `Cash ${f.money(nw.cash)} + investments ${f.money(nw.inv)} + retirement ${f.money(nw.ret)} + property ${f.money(nw.prop)} = ${f.money(nw.assets)}` },
  totalDebts: { title: 'Total debts', body: ['Everything you owe today: mortgage, student, auto and personal loans, and credit card balances.'],
    calc: ({ nw, f }) => (nw.debtList.length ? nw.debtList.slice(0, 4).map((a) => `${a.name} ${f.money(num(a.balance))}`).join(' + ') + (nw.debtList.length > 4 ? ' + …' : '') + ` = ${f.money(nw.debts)}` : 'No debts recorded.') },
  debtToAsset: { title: 'Debt-to-asset ratio', body: ['Your debts divided by your assets. Lower means more of what you own is truly yours; a new mortgage raises it, and paying down debt lowers it.'],
    calc: ({ nw, f }) => (nw.dta == null ? null : `${f.money(nw.debts)} ÷ ${f.money(nw.assets)} = ${f.pct(nw.dta, 1)}`) },
  monthChange: { title: 'Change this month', body: ['The difference from last month’s snapshot. It includes market moves, money you saved, debt you paid down and any change in property estimates.'],
    calc: ({ nw, f }) => (nw.prev ? `${f.money(nw.net)} now − ${f.money(nw.prev.net)} in ${monthLabel(nw.prev.date, true)} = ${signed(nw.net - nw.prev.net, (v) => f.money(v))}` : null) },
  yearChange: { title: '12-month change', body: ['How much your net worth has changed compared with the same month last year.'],
    calc: ({ nw, f }) => (nw.yearAgo ? `${f.money(nw.net)} − ${f.money(nw.yearAgo.net)} = ${signed(nw.net - nw.yearAgo.net, (v) => f.money(v))}${nw.yearAgo.net ? ` (${signed((nw.net - nw.yearAgo.net) / Math.abs(nw.yearAgo.net), (v) => f.pct(v, 1))})` : ''}` : 'Needs a snapshot from 12 months ago.') },
  snapshots: { title: 'Monthly snapshots', body: ['Each month, your totals are saved the first time you update balances — and refreshed if you change them again that month. The trend chart is built from these. Add past months with the pencil icon, or enter past account balances with “Past balances” in the gear menu — they’re added to that month’s net worth.'],
    calc: ({ nw }) => (nw.hist.length ? `${nw.hist.length} snapshot${nw.hist.length === 1 ? '' : 's'} since ${monthLabel(nw.hist[0].date, true)}.` : 'No snapshots yet.') },
  beforeTax: { title: 'Balances before tax', body: ['Net worth adds up balances as they are today. It doesn’t subtract taxes you might owe later — for example on withdrawals from a traditional 401(k) or on investment gains when you sell.', 'The (?) panel explains how each kind of account is taxed.'] },
  onBudget: { title: 'On-budget accounts (cash)', body: ['Money you can spend right away: checking, savings, money market and cash. It’s your cushion for emergencies and near-term goals.'],
    calc: ({ nw, f }) => `${f.money(nw.cash)}${nw.emergencyMonths != null ? ` · about ${nw.emergencyMonths.toFixed(1)} months of your recent spending` : ''}` },
  investments: { title: 'Investments', body: ['Taxable investments (brokerage, stocks, funds, bonds, crypto) plus retirement accounts. Taxable ones can be sold any time; retirement accounts have tax advantages but usually limits on early withdrawals.'],
    calc: ({ nw, f }) => `Taxable ${f.money(nw.inv)} + retirement ${f.money(nw.ret)} = ${f.money(nw.inv + nw.ret)}` },
  assetMix: { title: 'Asset mix', body: ['How your assets split between cash, taxable investments, retirement accounts and property. Cash and taxable investments are the easiest to turn into spending money.'],
    calc: ({ nw, f }) => (nw.assets ? `Liquid (cash + taxable investments): ${f.money(nw.liquid)} · ${f.pct(nw.liquid / nw.assets)} of assets` : null) },
  liquid: { title: 'Liquid assets', body: ['Cash plus taxable investments — money you could reach within days without early-withdrawal penalties (selling investments may still trigger tax on gains).'],
    calc: ({ nw, f }) => `${f.money(nw.cash)} + ${f.money(nw.inv)} = ${f.money(nw.liquid)}` },
  emergency: { title: 'Emergency cushion', body: ['Your cash divided by your average monthly spending over the last three months — roughly how long you could cover expenses if income stopped.'],
    calc: ({ nw, f }) => (nw.emergencyMonths != null ? `${f.money(nw.cash)} ÷ ${f.money(nw.avgSpend)}/mo = ${nw.emergencyMonths.toFixed(1)} months` : 'Needs a few months of spending data.') },
  creditScore: { title: 'Credit score', body: ['A three-digit number, most often 300–850, that lenders use to estimate how likely you are to repay. Higher scores generally mean better loan and card rates. It isn’t part of net worth.',
    'Bands used here: Poor under 580 · Fair 580–669 · Good 670–739 · Very good 740–799 · Exceptional 800+.'],
    calc: ({ nw }) => (nw.lastScore ? `Latest ${nw.lastScore.score} (${creditBand(nw.lastScore.score)})${nw.prevScore ? `, ${nw.lastScore.score - nw.prevScore.score >= 0 ? 'up' : 'down'} ${Math.abs(nw.lastScore.score - nw.prevScore.score)} pts` : ''}.` : null) },
  accountGroups: { title: 'Account groups', body: ['On-budget (cash), taxable investments, retirement, property and debts. Hover an account’s type to see how it’s taxed.'] },
  grp_budget: { title: 'On-budget (cash)', body: ['Checking, savings, money market and cash.'], calcLabel: 'How it’s taxed (U.S. federal)', calc: () => taxInfo().bank.short },
  grp_investment: { title: 'Taxable investments', body: ['Brokerage, stocks, funds, bonds and crypto held outside retirement accounts.'], calcLabel: 'How it’s taxed (U.S. federal)', calc: () => taxInfo().taxable.short },
  grp_retirement: { title: 'Retirement accounts', body: ['401(k), IRA, Roth, HSA and pensions. Taxes depend on the type — hover each account’s type.'], calcLabel: 'How it’s taxed (U.S. federal)', calc: () => 'Traditional: taxed on withdrawal. Roth: qualified withdrawals tax-free. HSA: tax-free for medical costs.' },
  grp_property: { title: 'Property & other assets', body: ['Your home, vehicles and other valuables, at your estimated value.'], calcLabel: 'How it’s taxed (U.S. federal)', calc: () => `${taxInfo().home.short} ${taxInfo().personal.short}` },
  grp_debt: { title: 'Debts', body: ['Amounts you owe, subtracted from your assets.'], calcLabel: 'How it’s taxed (U.S. federal)', calc: () => taxInfo().debt.short },
});

/** Generic notice box (used for the tax disclaimer). */
function noticeBox(parent, title, text, icon) {
  const n = parent.createDiv({ cls: 'fd-prediction is-info', attr: { role: 'note' } });
  setIcon(n.createSpan({ cls: 'fd-prediction-icon' }), icon || 'info');
  const t = n.createDiv({ cls: 'fd-prediction-text' });
  t.createEl('strong', { text: `${title} ` });
  t.createSpan({ text });
  return n;
}

/** Explainer opened from the (?) on the Net Worth page: the math with your numbers, how accounts are taxed, sources. */
class NetWorthInfoModal extends Modal {
  constructor(app, plugin) { super(app); this.plugin = plugin; }
  onOpen() {
    const d = this.plugin.data, f = new Fmt(d.settings), nw = nwStats(d);
    const ctx = () => ({ nw, f });
    this.modalEl.addClass('fd-modal', 'fd-info-modal');
    this.titleEl.setText('How your net worth is calculated');
    const c = this.contentEl;
    c.empty();

    const sum0 = c.createDiv({ cls: 'fd-callout is-on-track fd-nw-summary' });
    sum0.createEl('strong', { text: `Net worth ${f.money(nw.net)}. ` });
    const bits = [];
    if (nw.prev) bits.push(`${nw.net - nw.prev.net >= 0 ? 'Up' : 'Down'} ${f.money(Math.abs(nw.net - nw.prev.net))} since ${monthLabel(nw.prev.date, true)}`);
    if (nw.yearAgo) bits.push(`${signed(nw.net - nw.yearAgo.net, (v) => f.money(v))} over 12 months`);
    sum0.createSpan({ text: (bits.join(' · ') || 'Update balances each month to build your trend.') + '.' });

    const section = (title, icon) => {
      const s = c.createDiv({ cls: 'fd-info-section' });
      const h = s.createEl('h3');
      setIcon(h.createSpan({ cls: 'fd-info-h-icon' }), icon);
      h.createSpan({ text: title });
      return s;
    };
    const srcRow = (parent, keys) => {
      if (!keys || !keys.length) return;
      const row = parent.createDiv({ cls: 'fd-src-row' });
      row.createSpan({ cls: 'fd-muted', text: 'Sources: ' });
      keys.forEach((k, i) => { if (i) row.append(' · '); sourceLink(row, k, SOURCES[k].title.split(' (')[0]); });
    };

    // 1. The math
    const s1 = section('How it’s calculated', 'calculator');
    const ol = s1.createEl('ol', { cls: 'fd-steps' });
    const step = (title, help, text, formula, sources) => {
      const li = ol.createEl('li', { cls: 'fd-step' });
      const h = li.createDiv({ cls: 'fd-step-title' });
      if (help) termEl(h, title, help, ctx); else h.setText(title);
      if (text) li.createDiv({ cls: 'fd-step-text', text });
      if (formula) li.createDiv({ cls: 'fd-formula', text: formula });
      srcRow(li, sources);
    };
    step('Add up what you own', 'totalAssets', 'Every account and asset at its current balance or your estimated value.',
      `Cash ${f.money(nw.cash)} + taxable investments ${f.money(nw.inv)} + retirement ${f.money(nw.ret)} + property ${f.money(nw.prop)} = ${f.money(nw.assets)}`);
    step('Add up what you owe', 'totalDebts', 'Every loan and card balance, entered as the amount owed.',
      nw.debtList.length ? `${nw.debtList.map((a) => `${a.name} ${f.money(num(a.balance))}`).join(' + ')} = ${f.money(nw.debts)}` : 'No debts recorded = $0');
    step('Subtract', 'netWorth', 'Net worth is what would be left if you sold everything and paid off every debt — before taxes and selling costs.',
      `${f.money(nw.assets)} − ${f.money(nw.debts)} = ${f.money(nw.net)}`);
    step('Save a monthly snapshot', 'snapshots', 'Updating balances saves this month’s totals; the trend chart and the month-over-month and 12-month changes compare snapshots.',
      [nw.prev ? `vs ${monthLabel(nw.prev.date, true)}: ${signed(nw.net - nw.prev.net, (v) => f.money(v))}` : null,
        nw.yearAgo ? `vs 12 months ago: ${signed(nw.net - nw.yearAgo.net, (v) => f.money(v))}${nw.yearAgo.net ? ` (${signed((nw.net - nw.yearAgo.net) / Math.abs(nw.yearAgo.net), (v) => f.pct(v, 1))})` : ''}` : null].filter(Boolean).join(' · ') || `${nw.hist.length} snapshot(s) so far`);
    step('Debt-to-asset ratio', 'debtToAsset', 'Shows how much of what you own is financed by debt.', nw.dta == null ? 'Add assets to calculate' : `${f.money(nw.debts)} ÷ ${f.money(nw.assets)} = ${f.pct(nw.dta, 1)}`);
    step('Liquid assets', 'liquid', 'The part of your assets you could reach quickly without early-withdrawal penalties.',
      `${f.money(nw.cash)} cash + ${f.money(nw.inv)} taxable investments = ${f.money(nw.liquid)}${nw.assets ? ` (${f.pct(nw.liquid / nw.assets)} of assets)` : ''}`);
    step('Emergency cushion', 'emergency', 'Cash divided by your average spending over the last three months.',
      nw.emergencyMonths != null ? `${f.money(nw.cash)} ÷ ${f.money(nw.avgSpend)}/mo = ${nw.emergencyMonths.toFixed(1)} months` : 'Needs a few months of spending data', ['cfpbEmergency']);
    step('Credit score (tracked alongside)', 'creditScore', 'Not part of net worth. Scores you enter are charted with the common FICO bands.',
      nw.lastScore ? `Latest ${nw.lastScore.score} on ${dateLabel(nw.lastScore.date)} → ${creditBand(nw.lastScore.score)}` : 'No scores entered yet', ['cfpbCredit', 'myfico']);

    // 2. Taxes
    const s2 = section('How your accounts are taxed', 'landmark');
    taxRulesBar(s2, this.plugin);
    noticeBox(s2, 'General U.S. federal rules, not tax advice.', 'Your situation, state taxes and future law changes can differ, and other countries tax these accounts differently. Check the linked IRS pages or a tax professional before acting.', 'info');
    s2.createDiv({ cls: 'fd-muted fd-info-intro', text: 'Your net worth counts balances before tax. Here’s what that means for each kind of account you have — yours are listed on each card.' });
    const R = taxR();
    const grossYear = totalIncomeOn(d, todayISO()).gross * 12;
    // Estimated bracket from this year's brackets and your income
    const est = s2.createDiv({ cls: 'fd-tax-illus' });
    est.createDiv({ cls: 'fd-tax-illus-title', text: `Your estimated ${taxYear()} federal tax picture` });
    const er = est.createDiv({ cls: 'fd-tax-illus-row' });
    er.createSpan({ text: 'Filing status: ' });
    const fs = er.createEl('select', { cls: 'dropdown', attr: { 'aria-label': 'Filing status' } });
    fs.createEl('option', { text: 'Single', attr: { value: 'single' } });
    fs.createEl('option', { text: 'Married filing jointly', attr: { value: 'joint' } });
    fs.value = TAX_STATE.filing;
    er.createSpan({ text: '  ·  Assumed tax rate on withdrawals: ' });
    const sel = er.createEl('select', { cls: 'dropdown', attr: { 'aria-label': 'Assumed tax rate' } });
    for (const r of R.rates) sel.createEl('option', { text: `${r}%`, attr: { value: String(r) } });
    const out = est.createDiv({ cls: 'fd-tax-illus-out' });
    const pickRate = () => (grossYear ? marginalRate(grossYear, fs.value).rate : 22);
    sel.value = String(pickRate());
    const draw = () => {
      out.empty();
      if (grossYear) {
        const mr = marginalRate(grossYear, fs.value), lt = ltcgRate(mr.taxable, fs.value);
        out.createDiv({ text: `${f.money(grossYear)} gross pay − ${f.money(fs.value === 'joint' ? R.stdJoint : R.stdSingle)} standard deduction ≈ ${f.money(mr.taxable)} taxable → ${mr.rate}% bracket. Long-term gains would likely be taxed at ${lt}%.` });
      } else out.createDiv({ cls: 'fd-muted', text: 'Set up your income on the Overview to estimate your bracket; using 22% for the example below.' });
      if (nw.deferredTotal > 0) {
        const rate = Number(sel.value) / 100, tax = nw.deferredTotal * rate;
        out.createDiv({ text: `${f.money(nw.deferredTotal)} in tax-deferred accounts at ${sel.value}% → about ${f.money(tax)} of income tax, leaving ${f.money(nw.deferredTotal - tax)}.` });
        out.createDiv({ cls: 'fd-strong', text: `Net worth after this tax: about ${f.money(nw.net - tax)} (vs ${f.money(nw.net)} before tax).` });
      }
      out.createDiv({ cls: 'fd-muted fd-small', text: 'Illustration only. Uses this year’s brackets and standard deduction for wages only; ignores other income, credits, state taxes, tax on investment gains (depends on what you paid), the early-withdrawal tax and selling costs. Your rate in retirement may be different.' });
    };
    fs.addEventListener('change', async () => { d.settings.filingStatus = fs.value; TAX_STATE.filing = fs.value; await this.plugin.save(); sel.value = String(pickRate()); draw(); });
    sel.addEventListener('change', draw);
    draw();
    const grid = s2.createDiv({ cls: 'fd-tax-grid' });
    const order = ['bank', 'taxable', 'crypto', 'deferred', 'roth', 'hsa', 'pension', 'home', 'personal', 'debt'];
    const sorted = [...order.filter((k) => nw.byCat[k]), ...order.filter((k) => !nw.byCat[k])];
    for (const k of sorted) {
      const info = taxInfo()[k], mine = nw.byCat[k] || [];
      const card = grid.createDiv({ cls: 'fd-tax-card' + (mine.length ? '' : ' is-none') });
      const h = card.createDiv({ cls: 'fd-tax-head' });
      setIcon(h.createSpan({ cls: 'fd-tax-icon' }), info.icon);
      const ht = h.createDiv();
      ht.createDiv({ cls: 'fd-tax-title', text: info.title });
      ht.createDiv({ cls: 'fd-tax-covers', text: info.covers });
      const yours = card.createDiv({ cls: 'fd-tax-yours' });
      if (mine.length) {
        yours.createSpan({ cls: 'fd-tax-yours-label', text: `Yours · ${f.money(sum(mine, (a) => Math.abs(num(a.balance))))}${k === 'debt' ? ' owed' : ''}: ` });
        yours.createSpan({ text: mine.map((a) => a.name).join(', ') });
      } else yours.createSpan({ cls: 'fd-muted', text: 'You don’t have accounts of this type.' });
      const ul = card.createEl('ul', { cls: 'fd-tax-points' });
      for (const p of info.points) ul.createEl('li', { text: p });
      if (k === 'debt' && mine.length) {
        const dl = card.createDiv({ cls: 'fd-tax-debts' });
        for (const a of mine) { const r = dl.createDiv(); r.createEl('strong', { text: `${a.name}: ` }); r.createSpan({ text: debtTax(debtKindOf(a)) }); }
      }
      card.createDiv({ cls: 'fd-tax-effect', text: `In your net worth: ${info.effect}` });
      srcRow(card, info.sources);
    }

    // 3. Limits
    const s3 = section('Things to keep in mind', 'alert-triangle');
    const lim = s3.createEl('ul', { cls: 'fd-info-tips' });
    for (const x of ['Balances are as of your last update; property values are your own estimates.',
      'Net worth is before taxes and selling costs (see the tax section above).',
      'It doesn’t include future income such as Social Security or the value of a pension you haven’t started receiving.',
      'Tax rules here are general U.S. federal rules and can change; this isn’t tax, legal or financial advice.']) lim.createEl('li', { text: x });

    // 4. Sources
    const s4 = section('Sources & further reading', 'book-open');
    for (const [group, keys] of NW_SOURCE_GROUPS) {
      s4.createDiv({ cls: 'fd-src-group', text: group });
      const ul = s4.createEl('ul', { cls: 'fd-src-list' });
      for (const k of keys) {
        const s = SOURCES[k], li = ul.createEl('li');
        sourceLink(li, k);
        li.createSpan({ cls: 'fd-muted', text: ` — ${s.by}` });
        li.createDiv({ cls: 'fd-src-why', text: s.why });
      }
    }
    const b = c.createDiv({ cls: 'fd-form-buttons fd-info-buttons' });
    b.createDiv({ cls: 'fd-spacer' });
    mkButton(b, 'settings', 'Manage accounts', () => { this.close(); this.plugin.manageAccounts(); });
    mkButton(b, 'refresh-cw', 'Update balances', () => { this.close(); this.plugin.updateBalances(); }, 'mod-cta');
  }
  onClose() { Tip.hide(); this.contentEl.empty(); }
}


/* ===================================================== tax rules: UI & impact */

/** One-sentence summary of each account type, shown under “Account type” when adding or editing an account. */
function kindSummary(kind) {
  const R = taxR(), Y = taxYear();
  const S = {
    'Checking': 'Everyday account for paying bills and spending; any interest it earns is taxed as ordinary income.',
    'Savings': 'Account for money you’re setting aside; its interest is taxable income each year.',
    'High-yield savings': 'Savings account paying a higher interest rate, often at an online bank; the interest is taxable each year.',
    'Money market': 'Interest-bearing deposit account, often with check-writing; the interest is taxable each year.',
    'Cash': 'Physical cash on hand — it earns nothing and isn’t taxed.',
    'Brokerage': 'Taxable investment account for stocks, funds and bonds; dividends are taxed each year and gains when you sell.',
    'TOD Individual': 'Individual brokerage account with a transfer-on-death beneficiary, so it passes to them without probate; while you’re alive it’s taxed like any brokerage account — dividends yearly, gains when you sell.',
    'Stocks': 'Shares of individual companies; dividends are taxed each year and gains when you sell.',
    'ETFs / index funds': 'Low-cost funds that hold many investments at once; taxed like stocks — dividends yearly, gains when you sell.',
    'Mutual funds': 'Professionally managed pools of investments that can pay taxable distributions even if you don’t sell.',
    'Bonds': 'Loans to governments or companies that pay interest; Treasury interest is free of state tax and some municipal bond interest is free of federal tax.',
    'CDs': 'Bank certificates of deposit with a fixed rate for a set term; the interest is taxable as it’s credited.',
    'Crypto': 'Digital assets the IRS treats as property, so gains or losses are taxed when you sell, trade or spend them.',
    '401(k)': `Employer retirement plan funded from your paycheck, usually before tax (up to ${usd(R.k401)} in ${Y}); withdrawals are taxed as income, generally with an extra ${R.earlyPenalty}% before 59½.`,
    'Roth 401(k)': `Employer plan funded with after-tax pay (shares the ${usd(R.k401)} limit for ${Y}); qualified withdrawals, including growth, are tax-free.`,
    '403(b)': `Retirement plan for public schools and nonprofits that works like a 401(k) (up to ${usd(R.k401)} in ${Y}); withdrawals are taxed as income.`,
    '457(b)': `Retirement plan for state and local government workers (up to ${usd(R.k401)} in ${Y}); withdrawals are taxed as income.`,
    'Traditional IRA': `Individual retirement account where contributions may be deductible (up to ${usd(R.ira)} in ${Y}) and withdrawals are taxed as income.`,
    'Rollover IRA': `Traditional IRA that holds money moved from a former employer’s 401(k) or similar plan; a direct rollover isn’t taxed, it keeps growing tax-deferred, and withdrawals are taxed as income.`,
    'Roth IRA': `Individual retirement account funded with after-tax money (up to ${usd(R.ira)} in ${Y}); qualified withdrawals are tax-free, with no required withdrawals in your lifetime.`,
    'SEP IRA': 'Retirement account for self-employed people and small businesses that’s taxed like a traditional IRA.',
    'SIMPLE IRA': 'Retirement plan for small employers that’s taxed like a traditional IRA.',
    'HSA': `Health savings account paired with a high-deductible health plan (up to ${usd(R.hsaSelf)} self-only / ${usd(R.hsaFamily)} family in ${Y}); tax-free in, growing and out for qualified medical costs.`,
    'Pension': 'Employer-funded plan that pays a set income in retirement; payments are generally taxed as income.',
    'Home': `Your home at its estimated market value; up to ${usd(R.homeSingle)} of gain (${usd(R.homeJoint)} joint) on selling a main home can be tax-free.`,
    'Vehicle': 'A car or other vehicle at its estimated resale value, which usually falls over time.',
    'Land': 'Land you own at its estimated value; any gain is taxable when you sell.',
    'Rental property': 'Real estate you rent out; rental income and gains when you sell are generally taxable.',
    'Collectibles': 'Art, coins and other valuables; long-term gains can be taxed at up to 28%.',
    'Credit card': 'Revolving debt from card balances; the interest isn’t tax-deductible.',
    'Mortgage': 'Loan secured by your home; the interest may be deductible if you itemize.',
    'Auto loan': `Loan for a vehicle; interest on a new, U.S.-assembled personal vehicle may be deductible in ${R.carFrom}–${R.carTo} (up to ${usd(R.carLoan)} a year).`,
    'Student loan': `Education loan; up to ${usd(R.studentLoan)} of its interest a year may be deductible, subject to income limits.`,
    'Personal loan': 'Unsecured loan for personal use; its interest generally isn’t deductible.',
    'Line of credit': 'Borrowing you can draw on as needed; home-equity line interest may be deductible if used to buy, build or improve the home.',
    'Medical debt': 'Unpaid medical bills or loans taken out for medical care.',
    'Other': 'Choose this for anything not listed and describe it in the next field.',
  };
  return S[kind] || '';
}

/** Run a calculation with a different set of tax rules, then restore the current ones. */
function withTaxValues(values, year, fn) {
  const saved = TAX_STATE.rules;
  TAX_STATE.rules = { year, gathered: saved.gathered, values };
  try { return fn(); } finally { TAX_STATE.rules = saved; }
}

/** Contributions in a scenario that would go over this year's IRA or HSA limit (in today's dollars). */
function wiLimitWarnings(data, sc, sim) {
  const R = taxR(), Y = taxYear(), f = new Fmt(data.settings), out = [];
  sim = sim || simulateRetirement(data, sc);
  const accts = data.accounts;
  const isIra = (a) => /\bira\b|roth ira/i.test(a.kind || '') && !/sep|simple/i.test(a.kind || '');
  const isHsa = (a) => /hsa|health sav/i.test(a.kind || '');
  const points = new Set([1, ...sim.events.filter((x) => x.e.type === 'contrib' || x.e.type === 'pay').map((x) => x.s + 1)]);
  const seen = new Set();
  for (const m of [...points].sort((a, b) => a - b)) {
    const ageAt = sim.age + m / 12;
    const yearly = (pred) => {
      let t = sum(accts.filter(pred), (a) => a.contribution);
      for (const x of sim.events) {
        if (!(m > x.s && (x.end == null || m <= x.end))) continue;
        const acc = accts.find((a) => a.id === x.e.account);
        if (!acc || !pred(acc)) continue;
        if (x.e.type === 'contrib') t += num(x.e.amount) * 12;
        if (x.e.type === 'pay' && x.extra) t += x.extra * 12;
      }
      return t;
    };
    const when = m <= 1 ? 'now' : `from ${new Date(new Date().getFullYear(), new Date().getMonth() + m - 1, 1).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}`;
    const iraLim = R.ira + (ageAt >= 50 ? R.iraCatch50 : 0), iraT = yearly(isIra);
    if (!seen.has('ira') && iraT > iraLim + 0.5) { seen.add('ira'); out.push(`IRA contributions would be ${f.money(iraT)}/yr ${when} — above the ${Y} IRA limit of ${f.money(iraLim)}.`); }
    const hsaT = yearly(isHsa);
    if (!seen.has('hsa') && hsaT > R.hsaFamily + 0.5) { seen.add('hsa'); out.push(`HSA contributions would be ${f.money(hsaT)}/yr ${when} — above the ${Y} family limit of ${f.money(R.hsaFamily)}.`); }
  }
  return out;
}

/** What a set of new tax values would change on the dashboard, compared with the current ones. */
function computeTaxImpact(data, next) {
  const f = new Fmt(data.settings), filing = TAX_STATE.filing;
  const inc = incomeOn(data, todayISO()).cur;
  const grossYear = inc ? num(inc.gross) * 12 : 0;
  const nw = nwStats(data);
  const calc = () => {
    const mr = grossYear ? marginalRate(grossYear, filing) : null;
    return {
      rate: mr ? mr.rate : null, ltcg: mr ? ltcgRate(mr.taxable, filing) : null,
      afterTax: mr && nw.deferredTotal ? nw.net - nw.deferredTotal * mr.rate / 100 : null,
      checks: contributionChecks(data),
      warnings: ((data.whatIf && data.whatIf.scenarios) || []).reduce((n, sc) => n + wiLimitWarnings(data, sc).length, 0),
    };
  };
  const before = calc();
  const after = withTaxValues(next.values, next.year, calc);
  const lines = [];
  const chg = (a, b) => (a === b ? 'no change' : 'changes');
  if (before.rate != null) {
    lines.push({ area: 'Net Worth', text: `Estimated federal tax bracket for your income: ${before.rate}% → ${after.rate}%`, changed: before.rate !== after.rate });
    if (before.afterTax != null) lines.push({ area: 'Net Worth', text: `After-tax illustration (tax-deferred accounts at your bracket): ${f.money(before.afterTax)} → ${f.money(after.afterTax)}`, changed: Math.round(before.afterTax) !== Math.round(after.afterTax) });
    lines.push({ area: 'Net Worth', text: `Likely long-term capital-gain rate if you sold investments: ${before.ltcg}% → ${after.ltcg}%`, changed: before.ltcg !== after.ltcg });
  } else lines.push({ area: 'Net Worth', text: 'Set up your income on the Overview to get an estimated tax bracket — it isn’t calculated yet.', changed: false });
  for (const b of before.checks) {
    const a = after.checks.find((x) => x.key === b.key);
    if (!a) continue;
    lines.push({ area: 'Retirement', text: `${b.label} limit for you: ${f.money(b.limit)} → ${f.money(a.limit)}${a.status !== b.status ? ` (status: ${b.status} → ${a.status})` : ''}`, changed: b.limit !== a.limit || a.status !== b.status });
  }
  if (!before.checks.length) lines.push({ area: 'Retirement', text: 'No IRA, workplace plan or HSA accounts to check against contribution limits.', changed: false });
  lines.push({ area: 'What-if', text: `Contribution-limit warnings across your scenarios: ${before.warnings} → ${after.warnings}`, changed: before.warnings !== after.warnings });
  const cur = TAX_STATE.rules.values;
  if (cur.rmdAge !== next.values.rmdAge || cur.earlyAge !== next.values.earlyAge) lines.push({ area: 'Retirement', text: `Withdrawal ages in explanations: RMDs from ${cur.rmdAge} → ${next.values.rmdAge}`, changed: true });
  return { lines, unaffected: 'Not affected: your net worth total, monthly snapshots, spending and the retirement projection itself — they’re calculated before tax.' };
}

/** Pop-up after a refresh: what changed, what was confirmed, what couldn't be checked, and the effect on the dashboard. */
class TaxRefreshModal extends Modal {
  constructor(app, plugin, result) { super(app); this.plugin = plugin; this.result = result; }
  onOpen() {
    const res = this.result, d = this.plugin.data, f = new Fmt(d.settings);
    this.modalEl.addClass('fd-modal', 'fd-info-modal', 'fd-tax-refresh-modal');
    this.titleEl.setText('Tax rules refreshed');
    const c = this.contentEl;
    c.empty();
    const fmtV = (k, v) => (v == null ? '—' : Array.isArray(v) ? v.map((x) => usd(x)).join(' / ') : /Age$/.test(k) ? String(v) : usd(v));
    const updated = res.report.filter((r) => r.status === 'updated');
    const confirmed = res.report.filter((r) => r.status === 'confirmed');
    const unconf = res.report.filter((r) => r.status === 'unconfirmed' || r.status === 'manual');
    const head = c.createDiv({ cls: `fd-callout ${updated.length || res.yearChanged ? 'is-close' : 'is-on-track'}` });
    head.createEl('strong', { text: updated.length || res.yearChanged ? `${updated.length} value${updated.length === 1 ? '' : 's'} changed. ` : 'Everything we could check is up to date. ' });
    head.createSpan({ text: `Checked IRS.gov on ${dateLabel(res.refreshed.slice(0, 10))} for tax year ${res.year}${res.yearChanged ? ` (was ${taxYear()})` : ''}. ${confirmed.length} confirmed · ${unconf.length} couldn’t be confirmed automatically and were kept as they are.` });
    if (res.upcoming) c.createDiv({ cls: 'fd-tax-upcoming', text: `Heads-up: ${res.upcoming.year} limits are already announced — 401(k) ${usd(res.upcoming.k401)}${res.upcoming.ira ? `, IRA ${usd(res.upcoming.ira)}` : ''}. They’ll be used from January ${res.upcoming.year} after a refresh.` });

    const sec = (title, icon) => { const s = c.createDiv({ cls: 'fd-info-section' }); const h = s.createEl('h3'); setIcon(h.createSpan({ cls: 'fd-info-h-icon' }), icon); h.createSpan({ text: title }); return s; };
    const s1 = sec('What changed', 'git-compare');
    if (!updated.length && !res.yearChanged) s1.createDiv({ cls: 'fd-muted', text: 'No values changed.' });
    else {
      const t = s1.createEl('table', { cls: 'fd-table fd-info-table' });
      const hr = t.createEl('thead').createEl('tr');
      ['Rule', 'Before', 'Now'].forEach((h, i) => hr.createEl('th', { text: h, cls: i ? 'is-num' : '' }));
      const tb = t.createEl('tbody');
      for (const r of updated) { const tr = tb.createEl('tr'); tr.createEl('td', { text: r.label }); tr.createEl('td', { cls: 'is-num fd-muted', text: fmtV(r.key, r.old) }); tr.createEl('td', { cls: 'is-num fd-strong', text: fmtV(r.key, r.value) }); }
    }
    const s2 = sec('How this affects your dashboard', 'layout-dashboard');
    const impact = computeTaxImpact(d, res);
    const ul = s2.createEl('ul', { cls: 'fd-impact' });
    for (const l of impact.lines) {
      const li = ul.createEl('li', { cls: l.changed ? 'is-changed' : '' });
      li.createSpan({ cls: 'fd-impact-area', text: l.area });
      li.createSpan({ text: l.text });
      if (!l.changed) li.createSpan({ cls: 'fd-muted', text: ' · no change' });
    }
    s2.createDiv({ cls: 'fd-muted fd-info-intro', text: impact.unaffected });

    const s3 = sec('Checked values', 'list-checks');
    const t3 = s3.createEl('table', { cls: 'fd-table fd-info-table' });
    const tb3 = t3.createEl('tbody');
    for (const r of res.report) {
      const tr = tb3.createEl('tr');
      tr.createEl('td', { text: r.label });
      tr.createEl('td', { cls: 'is-num', text: fmtV(r.key, r.value) });
      const st = tr.createEl('td', { cls: 'is-num' });
      const label = { updated: 'Updated', confirmed: 'Confirmed', unconfirmed: 'Not confirmed — kept', manual: 'Check manually' }[r.status];
      st.createSpan({ cls: `fd-badge ${r.status === 'updated' ? 'is-close' : r.status === 'confirmed' ? 'is-on-track' : r.status === 'manual' ? 'is-neutral' : 'is-behind'}`, text: label });
    }
    const bad = res.pages.filter((p) => p.status !== 'ok');
    if (bad.length) {
      const pl = s3.createDiv({ cls: 'fd-muted fd-info-intro' });
      pl.createDiv({ text: 'Pages that couldn’t be read or didn’t match the expected wording (values kept; you can edit them in Settings → Tax rules):' });
      const ul2 = pl.createEl('ul', { cls: 'fd-src-list' });
      for (const p of bad) { const li = ul2.createEl('li'); if (p.src) li.createEl('a', { cls: 'fd-src-link external-link', text: p.src.replace('https://www.irs.gov', 'irs.gov'), attr: { href: p.src, target: '_blank', rel: 'noopener' } }); li.append(` — ${p.msg}`); }
    }
    s3.createDiv({ cls: 'fd-muted fd-info-intro', text: 'Capital-gain rate thresholds are published only in an IRS revenue procedure PDF, so they’re marked “Check manually”. Edit them in Settings → Tax rules when a new year’s figures come out.' });

    const b = c.createDiv({ cls: 'fd-form-buttons fd-info-buttons' });
    b.createDiv({ cls: 'fd-spacer' });
    const anyChange = updated.length || res.yearChanged;
    if (anyChange) mkButton(b, null, 'Keep current values', async () => { await this.plugin.saveTaxRules({ ...res, values: TAX_STATE.rules.values, year: taxYear(), keepValues: true }); this.close(); });
    mkButton(b, 'check', anyChange ? 'Apply updates' : 'Done', async () => { await this.plugin.saveTaxRules(res); this.close(); new Notice(anyChange ? `Tax rules updated for ${res.year}.` : 'Tax rules are up to date.'); }, 'mod-cta');
  }
  onClose() { Tip.hide(); this.contentEl.empty(); }
}

/** Small line showing which tax year is in use, when it was gathered/refreshed, and a Refresh button. */
function taxRulesBar(parent, plugin) {
  const bar = parent.createDiv({ cls: 'fd-tax-bar' });
  setIcon(bar.createSpan({ cls: 'fd-tax-bar-icon' }), 'calendar-check');
  const t = bar.createDiv({ cls: 'fd-tax-bar-text' });
  t.createEl('strong', { text: `U.S. federal tax rules for ${taxYear()}` });
  t.createSpan({ cls: 'fd-muted', text: ` · ${TAX_STATE.refreshed ? 'last refreshed' : 'gathered from IRS.gov'} ${dateLabel(String(TAX_STATE.refreshed || TAX_STATE.rules.gathered).slice(0, 10))}` });
  const btn = mkButton(bar, 'refresh-cw', 'Refresh tax rules', async () => {
    btn.setAttr('disabled', 'true'); btn.addClass('is-loading');
    btn.querySelector('span:last-child').setText('Checking IRS.gov…');
    try { await plugin.refreshTaxRules(); } finally { btn.removeAttribute('disabled'); btn.removeClass('is-loading'); btn.querySelector('span:last-child').setText('Refresh tax rules'); }
  }, 'is-small');
  return bar;
}

/* --------------------------------------------------------------- dashboard */

/* ============================================== investments: history & growth */

const INV_COLORS = { total: '#2F8F9D', investment: PALETTE[0], retirement: PALETTE[2], moneyIn: '#79706E', growthUp: '#54A24B', growthDown: '#E45756', contrib: '#4C78A8' };
const INV_RANGES = [['6', '6M'], ['12', '1Y'], ['36', '3Y'], ['all', 'All']];
const INV_VIEWS = [['total', 'Total'], ['group', 'By group'], ['account', 'By account']];

function monthGap(a, b) {
  const [y1, m1] = a.split('-').map(Number), [y2, m2] = b.split('-').map(Number);
  return (y2 - y1) * 12 + (m2 - m1);
}

/** Name, group and yearly contribution for an account id, including accounts that have since been deleted. */
function invAccountInfo(data, id) {
  const a = data.accounts.find((x) => x.id === id);
  const m = (data.invMeta || {})[id];
  if (a) {
    const group = isInvAccount(a) ? a.group : (m && m.group) || 'investment';
    return { id, name: a.name, group, kind: a.kind || '', contribution: isInvAccount(a) ? num(a.contribution) : 0, open: isInvAccount(a), account: a };
  }
  return m ? { id, name: m.name, group: m.group, kind: m.kind || '', contribution: 0, open: false } : null;
}

/**
 * Month-by-month balances of investment & retirement accounts. Months with per-account history are "detailed";
 * older months that only have a net-worth snapshot still show the retirement total.
 */
function invTimeline(data) {
  const ih = data.invHistory || {};
  const snaps = {};
  for (const h of data.history || []) snaps[h.date] = h;
  const keys = new Set(Object.keys(ih).filter((k) => /^\d{4}-\d{2}$/.test(k)));
  for (const h of data.history || []) if (h.retirement != null && h.retirement !== '') keys.add(h.date);
  return [...keys].sort().map((date) => {
    const m = ih[date];
    if (m && Object.keys(m).length) {
      let taxable = 0, retirement = 0, nTax = 0;
      const byAcct = {};
      for (const id in m) {
        const info = invAccountInfo(data, id);
        if (!info) continue;
        const v = num(m[id]);
        byAcct[id] = v;
        if (info.group === 'retirement') retirement += v; else { taxable += v; nTax++; }
      }
      return { date, taxable, retirement, total: taxable + retirement, byAcct, detailed: true };
    }
    return { date, taxable: null, retirement: num(snaps[date].retirement), total: null, byAcct: {}, detailed: false };
  });
}

function invValue(row, key) {
  if (key === 'total') return row.total;
  if (key === 'taxable') return row.taxable;
  if (key === 'retirement') return row.retirement;
  return row.byAcct[key] != null ? row.byAcct[key] : null;
}
const invKeyMatches = (info, key) => key === 'total' || (key === 'taxable' && info.group !== 'retirement') || (key === 'retirement' && info.group === 'retirement') || info.id === key;

/** Estimated money added to `key` during the months leading up to `row`, from each account's yearly contribution. */
function invContrib(data, row, key, months) {
  if (!data.settings.invest || data.settings.invest.estimateContrib === false) return 0;
  const ids = row.detailed ? Object.keys(row.byAcct) : data.accounts.filter((a) => a.group === 'retirement').map((a) => a.id);
  let c = 0;
  for (const id of ids) {
    const info = invAccountInfo(data, id);
    if (info && invKeyMatches(info, key)) c += (info.contribution / 12) * months;
  }
  return c;
}

/**
 * Growth between two timeline rows. Money in = estimated contributions + balances of accounts that appear
 * (minus accounts that disappear), so opening or rolling over an account isn't counted as market growth.
 * Return uses the Modified Dietz method: growth ÷ (start + half of money in).
 */
function invGrowth(data, tl, a, b, key = 'total') {
  if (a < 0 || b <= a || !tl[a] || !tl[b]) return null;
  const start = invValue(tl[a], key), end = invValue(tl[b], key);
  if (start == null || end == null) return null;
  let contrib = 0, flows = 0;
  for (let i = a + 1; i <= b; i++) {
    const p = tl[i - 1], r = tl[i];
    contrib += invContrib(data, r, key, monthGap(p.date, r.date));
    if (p.detailed && r.detailed && (key === 'total' || key === 'taxable' || key === 'retirement')) {
      for (const id in r.byAcct) if (!(id in p.byAcct)) { const info = invAccountInfo(data, id); if (info && invKeyMatches(info, key)) flows += r.byAcct[id]; }
      for (const id in p.byAcct) if (!(id in r.byAcct)) { const info = invAccountInfo(data, id); if (info && invKeyMatches(info, key)) flows -= p.byAcct[id]; }
    }
  }
  const moneyIn = contrib + flows;
  const growth = end - start - moneyIn;
  const denom = start + moneyIn / 2;
  return { from: tl[a].date, to: tl[b].date, months: monthGap(tl[a].date, tl[b].date), start, end, change: end - start, contrib, flows, moneyIn, growth, ret: denom > 0 ? growth / denom : null };
}

/** Index of the row closest to `target` (exact, else the first after it) that has a value for key. */
function invIndexFrom(tl, target, key, before) {
  for (let i = 0; i < tl.length; i++) {
    if (tl[i].date < target) continue;
    if (before && tl[i].date >= before) return -1;
    if (invValue(tl[i], key) != null) return i;
  }
  return -1;
}

/** Everything the Investments page, its tooltips and explainer need. */
function invStats(data) {
  const tl = invTimeline(data);
  const now = monthKey(new Date());
  const accts = data.accounts.filter(isInvAccount);
  const taxable = sum(accts.filter((a) => a.group === 'investment'), (a) => a.balance);
  const retirement = sum(accts.filter((a) => a.group === 'retirement'), (a) => a.balance);
  const last = tl.length - 1;
  const lastIsNow = last >= 0 && tl[last].date === now;
  let prevIdx = -1;
  for (let i = last - 1; i >= 0; i--) if (tl[i].total != null) { prevIdx = i; break; }
  const m1 = lastIsNow && prevIdx >= 0 ? invGrowth(data, tl, prevIdx, last) : null;
  const yIdx = invIndexFrom(tl, addMonths(now, -12), 'total', now);
  const y1 = lastIsNow && yIdx >= 0 ? invGrowth(data, tl, yIdx, last) : null;
  const detailed = tl.filter((r) => r.detailed);
  return { tl, accts, taxable, retirement, total: taxable + retirement, contribYr: sum(accts, (a) => num(a.contribution)),
    m1, y1, y1Exact: !!(y1 && y1.from === addMonths(now, -12)), est: data.settings.invest.estimateContrib !== false,
    months: detailed.length, first: detailed[0] ? detailed[0].date : null, snapshotOnly: tl.length - detailed.length };
}

const retLabel = (g, f) => (g && g.ret != null ? signed(g.ret, (v) => f.pct(v, 1)) : '—');

Object.assign(SOURCES, {
  dietz: { title: 'Modified Dietz method', by: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Modified_Dietz_method',
    why: 'The formula used for “estimated return”: growth divided by the starting balance plus half of the money added.' },
  finraTod: { title: 'When a Brokerage Account Holder Dies — What Comes Next?', by: 'FINRA', url: 'https://www.finra.org/investors/alerts/plan-transition-what-you-should-know-about-transfer-brokerage-account-assets-death',
    why: 'How transfer-on-death (TOD) registration passes a brokerage account to a beneficiary without probate.' },
  irsRollover: { title: 'Rollovers of retirement plan and IRA distributions', by: 'IRS', url: 'https://www.irs.gov/retirement-plans/plan-participant-employee/rollovers-of-retirement-plan-and-ira-distributions',
    why: 'Direct vs 60-day rollovers, and why a direct rollover into an IRA isn’t taxed.' },
  tc413: { title: 'Topic no. 413, Rollovers from retirement plans', by: 'IRS', url: 'https://www.irs.gov/taxtopics/tc413',
    why: 'Short summary of rollover rules, withholding on indirect rollovers and the 60-day limit.' },
});
const INV_SOURCE_GROUPS = [
  ['Growth & return', ['dietz', 'compound', 'fees']],
  ['TOD & rollover accounts', ['finraTod', 'irsRollover', 'tc413']],
  ['How investments are taxed', ['tc404', 'tc409', 'pub590b']],
];

Object.assign(GLOSSARY, {
  invTotal: { title: 'Total invested', body: ['The combined balance of your taxable investment accounts and your retirement accounts today, before any tax you’d owe on selling or withdrawing.'],
    calc: ({ iv, f }) => `Taxable ${f.money(iv.taxable)} + retirement ${f.money(iv.retirement)} = ${f.money(iv.total)}` },
  invTaxable: { title: 'Taxable investments', body: ['Brokerage, TOD individual, stock, fund, bond and crypto accounts held outside retirement plans. You can sell any time; dividends are taxed yearly and gains when you sell.'],
    calc: ({ iv, f }) => `${iv.accts.filter((a) => a.group === 'investment').length} accounts · ${f.money(iv.taxable)}` },
  invRetirement: { title: 'Retirement accounts', body: ['401(k), 403(b), IRAs (including rollover IRAs), Roth accounts, HSAs and pensions. They grow tax-advantaged but usually limit withdrawals before 59½.'],
    calc: ({ iv, f }) => `${iv.accts.filter((a) => a.group === 'retirement').length} accounts · ${f.money(iv.retirement)} · ${f.money(sum(iv.accts.filter((a) => a.group === 'retirement'), (a) => num(a.contribution)))}/yr contributions` },
  invMonthChange: { title: 'Change this month', body: ['How much your invested total moved since the previous month you have, split into money you put in and market growth.'],
    calc: ({ iv, f }) => (iv.m1 ? `${f.money(iv.m1.end)} − ${f.money(iv.m1.start)} = ${signed(iv.m1.change, (v) => f.money(v))} (${signed(iv.m1.moneyIn, (v) => f.money(v))} put in, ${signed(iv.m1.growth, (v) => f.money(v))} market)` : 'Needs last month’s balances — add them with “Past balances” in the gear menu.') },
  marketGrowth: { title: 'Market growth (estimated)', body: ['The part of the change that came from the market — interest, dividends and price moves — rather than money you added.',
    'Market growth = ending balance − starting balance − money put in.'],
    calc: ({ iv, f }) => (iv.y1 ? `${f.money(iv.y1.end)} − ${f.money(iv.y1.start)} − ${f.money(iv.y1.moneyIn)} = ${signed(iv.y1.growth, (v) => f.money(v))} since ${monthLabel(iv.y1.from, true)}` : 'Needs at least two months of history.') },
  estReturn: { title: 'Estimated return', body: ['Your market growth as a percentage, adjusted for when money was added (the Modified Dietz method). It’s an estimate: it assumes contributions arrived evenly through the period.',
    'Return = market growth ÷ (starting balance + ½ × money put in).'],
    calc: ({ iv, f }) => (iv.y1 && iv.y1.ret != null ? `${f.money(iv.y1.growth)} ÷ (${f.money(iv.y1.start)} + ½ × ${f.money(iv.y1.moneyIn)}) = ${f.pct(iv.y1.ret, 1)} over ${iv.y1.months} month${iv.y1.months === 1 ? '' : 's'}` : null) },
  moneyIn: { title: 'Money put in (estimated)', body: ['Your yearly contributions (set on each account, including any employer match) spread evenly over the months, plus the balance of any account that was opened or rolled in during the period, minus accounts that were closed.',
    'Turn the estimate off in Settings → Investments if your contributions vary a lot; then all change counts as growth.'],
    calc: ({ iv, f }) => (iv.est ? `${f.money(iv.contribYr)}/yr from your accounts’ contribution settings (${f.money(iv.contribYr / 12)}/mo).` : 'Contribution estimate is off — all change counts as growth.') },
  invHistory: { title: 'Monthly account history', body: ['Each month, every investment and retirement account’s balance is saved when you update balances. Add or correct earlier months with “Past balances” in the gear menu (Manage accounts & assets).',
    'Months from before per-account history only have the retirement total from your net-worth snapshot.'],
    calc: ({ iv }) => (iv.months ? `${iv.months} month${iv.months === 1 ? '' : 's'} of account history since ${monthLabel(iv.first, true)}${iv.snapshotOnly ? ` · ${iv.snapshotOnly} older month${iv.snapshotOnly === 1 ? '' : 's'} with the retirement total only` : ''}.` : 'No account history yet.') },
  invPerAccount: { title: 'Account performance', body: ['Each account’s change over one month and over the last 12 months (or since its first saved month), with its estimated return after taking out that account’s contributions.'] },
  taxMix: { title: 'Tax treatment mix', body: ['How your invested money splits by how it’s taxed. Tax-deferred money is taxed when withdrawn, Roth money comes out tax-free if qualified, HSA money is tax-free for medical costs, and taxable accounts are taxed on dividends and gains as you go.',
    'Having some in each gives you more control over taxes in retirement.'],
    calc: ({ iv, f }) => { const r = sum(iv.accts.filter((a) => /roth/i.test(a.kind || '')), (a) => a.balance); return iv.total ? `Roth ${f.pct(r / iv.total)} of your invested total.` : null; } },
  growthSources: { title: 'Where the change came from', body: ['Each month’s change split into money you put in (blue) and market growth or loss (green or red). Bars above the line added to your balance; bars below took away.'] },
  balanceVsIn: { title: 'Balance vs money put in', body: ['The solid line is your actual balance. The dashed line is where you’d be if your money had earned nothing: the starting balance plus everything you put in. The gap between them is your market growth.'] },
  tod: { title: 'TOD Individual', body: ['An individual brokerage account with a transfer-on-death beneficiary. When you die it passes straight to them without probate; until then it’s yours alone and taxed like any brokerage account.'] },
  rollover: { title: 'Rollover IRA', body: ['A traditional IRA that holds money moved from a former employer’s 401(k), 403(b) or similar plan. A direct rollover isn’t taxed; the money keeps growing tax-deferred and withdrawals are taxed as income.'] },
});

/** Tiny trend line for a table cell. */
function sparkline(parent, values, opts = {}) {
  const pts = values.map((v, i) => [i, v]).filter((p) => p[1] != null);
  const W = opts.width || 96, H = opts.height || 26;
  const wrap = parent.createSpan({ cls: 'fd-spark' });
  if (pts.length < 2) { wrap.createSpan({ cls: 'fd-muted', text: '—' }); return wrap; }
  const lo = Math.min(...pts.map((p) => p[1])), hi = Math.max(...pts.map((p) => p[1]));
  const x = (i) => 2 + (i * (W - 4)) / Math.max(1, values.length - 1);
  const y = (v) => 3 + (1 - (hi === lo ? 0.5 : (v - lo) / (hi - lo))) * (H - 6);
  const svg = svgEl(wrap, 'svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: 'fd-svg', 'aria-hidden': 'true' });
  const up = pts[pts.length - 1][1] >= pts[0][1];
  const color = opts.color || (up ? 'var(--color-green)' : 'var(--color-red)');
  svgEl(svg, 'path', { d: pts.map((p, k) => `${k ? 'L' : 'M'}${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join(''), fill: 'none', style: `stroke:${color}`, 'stroke-width': 1.75, 'stroke-linejoin': 'round' });
  const lp = pts[pts.length - 1];
  svgEl(svg, 'circle', { cx: x(lp[0]), cy: y(lp[1]), r: 2.4, style: `fill:${color}` });
  if (opts.tip) { wrap.addClass('has-tip'); hover(wrap, opts.tip); }
  return wrap;
}

/**
 * Diverging stacked columns: money put in and market growth per month. rows[{label, contrib, growth, tip}].
 * Positive parts stack up from zero, negative parts stack down.
 */
function flowChart(parent, rows, opts = {}) {
  if (!rows.length) return emptyState(parent, opts.emptyText);
  const W = chartWidth(parent), H = opts.height || 210, P = { l: 58, r: 10, t: 12, b: 26 };
  let hi = 0, lo = 0;
  for (const r of rows) {
    hi = Math.max(hi, Math.max(0, r.contrib) + Math.max(0, r.growth));
    lo = Math.min(lo, Math.min(0, r.contrib) + Math.min(0, r.growth));
  }
  const sc = niceScale(lo, hi || 1);
  if (lo >= 0) sc.min = 0;
  const y = (v) => P.t + (1 - (v - sc.min) / (sc.max - sc.min)) * (H - P.t - P.b);
  const bw = (W - P.l - P.r) / rows.length;
  const fmt = opts.fmt || String;
  const wrap = parent.createDiv({ cls: 'fd-chart' });
  const svg = svgEl(wrap, 'svg', { viewBox: `0 0 ${W} ${H}`, class: 'fd-svg', role: 'img', 'aria-label': opts.title || 'Where the change came from' });
  for (let v = sc.min; v <= sc.max + sc.step / 2; v += sc.step) {
    svgEl(svg, 'line', { x1: P.l, x2: W - P.r, y1: y(v), y2: y(v), class: Math.abs(v) < sc.step / 2 ? 'fd-zeroline' : 'fd-gridline' });
    svgEl(svg, 'text', { x: P.l - 8, y: y(v) + 4, 'text-anchor': 'end', class: 'fd-axis' }, fmt(Math.abs(v) < sc.step / 2 ? 0 : v));
  }
  const maxX = Math.max(2, Math.floor((W - P.l - P.r) / 56));
  const every = Math.max(1, Math.ceil(rows.length / maxX));
  const cols = rows.map((r, i) => {
    const x0 = P.l + i * bw + bw * 0.18, w = Math.max(2, bw * 0.64);
    const g = svgEl(svg, 'g', { class: 'fd-col' });
    let up = 0, down = 0;
    for (const [v, color] of [[r.contrib, INV_COLORS.contrib], [r.growth, r.growth >= 0 ? INV_COLORS.growthUp : INV_COLORS.growthDown]]) {
      if (!v) continue;
      if (v > 0) { svgEl(g, 'rect', { x: x0, y: y(up + v), width: w, height: Math.max(0.5, y(up) - y(up + v)), fill: color, rx: 1.5 }); up += v; }
      else { svgEl(g, 'rect', { x: x0, y: y(down), width: w, height: Math.max(0.5, y(down + v) - y(down)), fill: color, rx: 1.5 }); down += v; }
    }
    if ((i % every === 0 && rows.length - 1 - i >= every) || i === rows.length - 1) svgEl(svg, 'text', { x: x0 + w / 2, y: H - 6, 'text-anchor': 'middle', class: 'fd-axis' }, r.label);
    return g;
  });
  rows.forEach((r, i) => {
    const hit = svgEl(svg, 'rect', { x: P.l + i * bw, y: P.t, width: bw, height: H - P.t - P.b, fill: 'transparent', class: 'fd-hit' });
    hover(hit, () => { setCls(cols[i], 'is-hover', true); return r.tip; }, () => setCls(cols[i], 'is-hover', false));
  });
  legend(wrap, [{ label: 'Money put in (est.)', color: INV_COLORS.contrib }, { label: 'Market growth', color: INV_COLORS.growthUp }, { label: 'Market loss', color: INV_COLORS.growthDown }]);
  return wrap;
}

/** Explainer opened from the (?) on the Investments page. */
class InvestmentsInfoModal extends Modal {
  constructor(app, plugin) { super(app); this.plugin = plugin; }
  onOpen() {
    const d = this.plugin.data, f = new Fmt(d.settings), iv = invStats(d);
    const ctx = () => ({ iv, f });
    this.modalEl.addClass('fd-modal', 'fd-info-modal');
    this.titleEl.setText('How investment growth is calculated');
    const c = this.contentEl;
    c.empty();
    const top = c.createDiv({ cls: 'fd-callout is-on-track fd-nw-summary' });
    top.createEl('strong', { text: `Invested ${f.money(iv.total)}. ` });
    top.createSpan({ text: iv.y1 ? `${signed(iv.y1.change, (v) => f.money(v))} since ${monthLabel(iv.y1.from, true)}: about ${signed(iv.y1.moneyIn, (v) => f.money(v))} you put in and ${signed(iv.y1.growth, (v) => f.money(v))} from the market (${retLabel(iv.y1, f)}).` : 'Add past balances to see how your investments have grown.' });

    const section = (title, icon) => {
      const s = c.createDiv({ cls: 'fd-info-section' });
      const h = s.createEl('h3');
      setIcon(h.createSpan({ cls: 'fd-info-h-icon' }), icon);
      h.createSpan({ text: title });
      return s;
    };
    const step = (parent, n, title, key, text) => {
      const st = parent.createDiv({ cls: 'fd-info-step' });
      st.createDiv({ cls: 'fd-info-step-num', text: String(n) });
      const b = st.createDiv({ cls: 'fd-info-step-body' });
      const h = b.createDiv({ cls: 'fd-info-step-title' });
      if (key) termEl(h, title, key, ctx); else h.setText(title);
      b.createDiv({ cls: 'fd-info-step-text', text });
      const g = key && GLOSSARY[key] && GLOSSARY[key].calc ? (() => { try { return GLOSSARY[key].calc(ctx()); } catch (e) { return null; } })() : null;
      if (g) b.createDiv({ cls: 'fd-info-formula', text: g });
    };

    const s1 = section('How the numbers are calculated', 'calculator');
    step(s1, 1, 'Total invested', 'invTotal', 'Adds up today’s balances of your taxable investment and retirement accounts.');
    step(s1, 2, 'Money put in', 'moneyIn', 'Estimates how much you added: each account’s yearly contribution ÷ 12 for every month, plus accounts opened or rolled in (minus accounts closed).');
    step(s1, 3, 'Market growth', 'marketGrowth', 'Whatever change isn’t explained by money put in came from the market — interest, dividends and price changes, after fund fees.');
    step(s1, 4, 'Estimated return', 'estReturn', 'Turns market growth into a percentage that isn’t inflated by new deposits, using the Modified Dietz method.');

    const s2 = section('Where the history comes from', 'history');
    step(s2, 1, 'Monthly account history', 'invHistory', 'Saved automatically every time you update balances, one balance per account per month.');
    { const ul = s2.createEl('ul', { cls: 'fd-info-tips' });
      for (const x of ['Use “Past balances” in the gear menu to enter any earlier month from old statements — pick the month and type each account’s balance. Leave an account blank if you didn’t have it yet.',
        'If that month has a net-worth snapshot, it can be updated too, so the Net Worth and Retirement charts stay in step.',
        'Deleted accounts keep their history and still count in totals for the months they existed.',
        'A transfer or rollover between two of your accounts in the same month cancels out and isn’t counted as growth.']) ul.createEl('li', { text: x });
    }

    const s3 = section('TOD and rollover accounts', 'landmark');
    for (const [k, kind] of [['tod', 'TOD Individual'], ['rollover', 'Rollover IRA']]) {
      const p = s3.createDiv({ cls: 'fd-info-step' });
      const b = p.createDiv({ cls: 'fd-info-step-body' });
      termEl(b.createDiv({ cls: 'fd-info-step-title' }), kind, k, ctx);
      b.createDiv({ cls: 'fd-info-step-text', text: kindSummary(kind) });
    }

    const s4 = section('Keep in mind', 'alert-triangle');
    { const ul = s4.createEl('ul', { cls: 'fd-info-tips' });
      for (const x of ['Contributions are estimated from today’s settings, not your real deposits, so growth for a single month can be off. Longer periods even out.',
        'Returns aren’t annualized unless the period is exactly 12 months, and past growth doesn’t predict future returns.',
        'Balances are before tax; selling taxable investments or withdrawing from tax-deferred accounts can owe tax.',
        'This is general information, not investment, tax or financial advice.']) ul.createEl('li', { text: x });
    }

    const s5 = section('Sources & further reading', 'book-open');
    for (const [group, keys] of INV_SOURCE_GROUPS) {
      s5.createDiv({ cls: 'fd-src-group', text: group });
      const ul = s5.createEl('ul', { cls: 'fd-src-list' });
      for (const k of keys) {
        const s = SOURCES[k], li = ul.createEl('li');
        sourceLink(li, k);
        li.createSpan({ cls: 'fd-muted', text: ` — ${s.by}` });
        li.createDiv({ cls: 'fd-src-why', text: s.why });
      }
    }
    const b = c.createDiv({ cls: 'fd-form-buttons fd-info-buttons' });
    b.createDiv({ cls: 'fd-spacer' });
    mkButton(b, 'history', 'Monthly history', () => { this.close(); this.plugin.manageInvHistory(); });
    mkButton(b, 'calendar-plus', 'Add past balances', () => { this.close(); this.plugin.editPastBalances(); }, 'mod-cta');
  }
  onClose() { Tip.hide(); this.contentEl.empty(); }
}

class Dashboard {
  constructor(plugin, el, opts = {}) {
    this.plugin = plugin;
    this.el = el;
    this.embedded = !!opts.embedded;
    this.tab = opts.tab || 'overview';
    this.month = monthKey(new Date());
    this.source = 'all';
    this.nwRange = '12';
    this.txLimit = 25;
    this.onTab = opts.onTab;
  }
  get data() { return this.plugin.data; }
  get app() { return this.plugin.app; }

  setTab(id) { this.tab = id; if (this.onTab) this.onTab(id); this.render(); }

  render() {
    const scroller = this.el.closest('.view-content') || this.el;
    const top = scroller.scrollTop;
    Tip.hide();
    this.fmt = new Fmt(this.data.settings);
    this.el.empty();
    this.el.addClass('fd-root');
    this.el.toggleClass('is-embedded', this.embedded);
    if (!this.embedded) this.renderHeader();
    const body = this.el.createDiv({ cls: 'fd-body' });
    if (!this.data.accounts.length && !this.data.transactions.length) { this.renderWelcome(body); return; }
    if (this.tab === 'investments' && !invTabShown(this.data) && !this.embedded) this.tab = 'overview';
    const fn = { overview: this.renderOverview, networth: this.renderNetWorth, investments: this.renderInvestments, spending: this.renderSpending, retirement: this.renderRetirement }[this.tab] || this.renderOverview;
    fn.call(this, body);
    scroller.scrollTop = top;
  }

  renderHeader() {
    const head = this.el.createDiv({ cls: 'fd-header' });
    const title = head.createDiv({ cls: 'fd-title' });
    title.createEl('h2', { text: 'Finance dashboard' });
    const t = totals(this.data);
    title.createDiv({ cls: 'fd-subtitle', text: `Net worth ${this.fmt.money(t.net)} · ${new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}` });
    const actions = head.createDiv({ cls: 'fd-actions' });
    this.button(actions, 'plus', 'Transaction', () => this.plugin.addTransaction());
    this.button(actions, 'refresh-cw', 'Update balances', () => this.plugin.updateBalances());
    this.button(actions, 'upload', 'Import CSV', () => new ImportModal(this.app, this.plugin).open());
    this.button(actions, 'file-down', 'PDF report', () => this.plugin.createReport());
    const gear = this.iconButton(actions, 'settings', 'Manage accounts & assets', () => this.plugin.manageAccounts());
    gear.addClass('fd-gear');
    const nav = this.el.createDiv({ cls: 'fd-tabs', attr: { role: 'tablist' } });
    for (const t2 of TABS) {
      if (t2.id === 'investments' && !invTabShown(this.data)) continue;
      const b = nav.createEl('button', { cls: 'fd-tab' + (t2.id === this.tab ? ' is-active' : ''), attr: { role: 'tab', 'aria-selected': String(t2.id === this.tab) } });
      const ic = b.createSpan({ cls: 'fd-tab-icon' });
      setIcon(ic, t2.icon);
      b.createSpan({ text: t2.label });
      b.addEventListener('click', () => this.setTab(t2.id));
    }
  }

  button(parent, icon, label, onClick, cls) {
    const b = parent.createEl('button', { cls: 'fd-btn' + (cls ? ' ' + cls : ''), attr: { 'aria-label': label } });
    if (icon) setIcon(b.createSpan({ cls: 'fd-btn-icon' }), icon);
    if (label) b.createSpan({ text: label });
    b.addEventListener('click', (e) => { e.stopPropagation(); onClick(e); });
    return b;
  }
  iconButton(parent, icon, label, onClick) {
    const b = parent.createEl('button', { cls: 'fd-icon-btn clickable-icon', attr: { 'aria-label': label } });
    setIcon(b, icon);
    b.addEventListener('click', (e) => { e.stopPropagation(); onClick(e); });
    return b;
  }

  card(parent, title, opts = {}) {
    const c = parent.createDiv({ cls: 'fd-card' + (opts.span ? ` span-${opts.span}` : '') + (opts.cls ? ' ' + opts.cls : '') });
    const h = c.createDiv({ cls: 'fd-card-head' });
    const ht = h.createDiv({ cls: 'fd-card-title' });
    const h3 = ht.createEl('h3', { text: title });
    if (opts.help) helpIcon(h3, opts.help, this.retCtx);
    if (opts.sub) ht.createDiv({ cls: 'fd-card-sub', text: opts.sub });
    const tools = h.createDiv({ cls: 'fd-card-tools' });
    if (opts.tools) opts.tools(tools);
    if (opts.link && !this.embedded) {
      const a = tools.createEl('a', { cls: 'fd-link', text: 'Open →', attr: { href: '#' } });
      a.addEventListener('click', (e) => { e.preventDefault(); this.setTab(opts.link); });
    }
    return c.createDiv({ cls: 'fd-card-body' });
  }

  kpi(parent, label, value, opts = {}) {
    const k = parent.createDiv({ cls: 'fd-kpi' + (opts.onClick && !this.embedded ? ' is-clickable' : '') });
    if (opts.onClick && !this.embedded) k.addEventListener('click', opts.onClick);
    const top = k.createDiv({ cls: 'fd-kpi-label' });
    if (opts.icon) setIcon(top.createSpan({ cls: 'fd-kpi-icon' }), opts.icon);
    if (opts.help) termEl(top, label, opts.help, this.retCtx); else top.createSpan({ text: label });
    k.createDiv({ cls: 'fd-kpi-value', text: value });
    if (opts.badge) k.createDiv({ cls: `fd-badge is-${opts.badge.tone}`, text: opts.badge.text });
    if (opts.delta != null && isFinite(opts.delta)) {
      const good = opts.invert ? opts.delta <= 0 : opts.delta >= 0;
      const d = k.createDiv({ cls: 'fd-kpi-delta ' + (opts.delta === 0 ? 'is-flat' : good ? 'is-good' : 'is-bad') });
      d.createSpan({ text: `${opts.delta > 0 ? '▲' : opts.delta < 0 ? '▼' : '■'} ${opts.deltaText}` });
    }
    if (opts.sub) k.createDiv({ cls: 'fd-kpi-sub', text: opts.sub });
    return k;
  }

  renderWelcome(body) {
    const c = this.card(body, 'Welcome to your finance dashboard', { span: 3 });
    c.createEl('p', { text: 'Start by adding your accounts (checking, savings, investments, retirement, property and debts). Every time you update balances, the current month’s net-worth snapshot is saved automatically, building your trend over time.' });
    c.createEl('p', { text: 'Want to look around first? Load sample data — you can clear it later from the plugin settings.' });
    const b = c.createDiv({ cls: 'fd-row-buttons' });
    this.button(b, 'plus', 'Add account', () => this.plugin.editAccount(), 'mod-cta');
    this.button(b, 'upload', 'Import transactions', () => new ImportModal(this.app, this.plugin).open());
    this.button(b, 'sparkles', 'Load sample data', () => this.plugin.loadSample());
  }

  /* ----------------------------------------------------------- overview */
  renderOverview(body) {
    const d = this.data, f = this.fmt;
    const t = totals(d);
    const hist = d.history;
    const prev = hist.length > 1 ? hist[hist.length - 2] : null;
    const curKey = monthKey(new Date());
    const monthTx = txFor(d, curKey);
    const spent = sum(monthTx, (x) => x.amount);
    const lastSpent = sum(txFor(d, addMonths(curKey, -1)), (x) => x.amount);
    const budgetTotal = sum(d.categories, (c) => c.budget);
    const plan = retirementPlan(d);
    const nwS = nwStats(d);
    this.retCtx = () => ({ plan, f, r: d.retirement, nw: nwS });
    const credit = [...d.credit].sort((a, b) => a.date.localeCompare(b.date));
    const lastScore = credit[credit.length - 1];
    const prevScore = credit[credit.length - 2];

    const kpis = body.createDiv({ cls: 'fd-kpis' });
    this.kpi(kpis, 'Net worth', f.money(t.net), { icon: 'trending-up', help: 'netWorth', onClick: () => this.setTab('networth'),
      delta: prev ? t.net - prev.net : null, deltaText: prev ? `${f.money(Math.abs(t.net - prev.net))} vs last month` : '' });
    this.kpi(kpis, 'Credit score', lastScore ? String(lastScore.score) : '—', { icon: 'gauge', help: 'creditScore', onClick: () => this.setTab('networth'),
      delta: prevScore ? lastScore.score - prevScore.score : null, deltaText: prevScore ? `${Math.abs(lastScore.score - prevScore.score)} pts` : '',
      sub: lastScore ? creditBand(lastScore.score) : 'No scores yet' });
    const dayFrac = new Date().getDate() / new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
    this.kpi(kpis, `Spent in ${monthLabel(curKey, true).split(' ')[0]}`, f.money(spent), { icon: 'credit-card', onClick: () => this.setTab('spending'),
      sub: budgetTotal ? `${f.pct(spent / budgetTotal)} of ${f.money(budgetTotal)} budget · ${f.pct(dayFrac)} of month gone` : lastSpent ? `Last month ${f.money(lastSpent)}` : '' });
    this.kpi(kpis, 'Retirement', plan.estAge ? `Age ${Math.ceil(plan.estAge)}` : '—', { icon: 'sunset', onClick: () => this.setTab('retirement'),
      badge: plan.target ? { text: STATUS_TEXT[plan.status], tone: plan.status } : null,
      sub: plan.estDate ? `Estimated ${plan.estDate.getFullYear()} · goal age ${plan.targetAge}` : 'Set goals on the Retirement tab' });

    const grid = body.createDiv({ cls: 'fd-grid' });

    // Net worth summary
    const nw = this.card(grid, 'Net worth', { sub: 'Last 12 months', link: 'networth' });
    const last12 = hist.slice(-12);
    lineChart(nw, { labels: last12.map((h) => monthLabel(h.date)), series: [{ name: 'Net worth', color: PALETTE[0], values: last12.map((h) => h.net), area: true }],
      fmt: (v) => f.compact(v), tipFmt: (v) => f.money(v), height: 190,
      markers: last12.map((x, i) => (notesFor(d, x.date, f).length ? i : -1)).filter((i) => i >= 0), tipFoot: (i) => this.noteFoot(last12[i].date), maxXLabels: 6, emptyText: 'Update balances to start your trend' });
    const split = nw.createDiv({ cls: 'fd-stat-row' });
    this.miniStat(split, 'Assets', f.money(t.assets));
    this.miniStat(split, 'Debts', f.money(t.debts));
    this.miniStat(split, 'Investments', f.money((t.byGroup.investment || 0) + (t.byGroup.retirement || 0)));
    this.miniStat(split, 'Cash', f.money(t.byGroup.budget || 0));

    // Spending summary
    const sp = this.card(grid, 'Spending & savings', { sub: monthLabel(curKey, true), link: 'spending' });
    const cats = byCategory(monthTx);
    const top = cats.slice(0, 5).map((c, i) => ({ label: c.name, value: c.total, color: PALETTE[i], extra: this.catExtra(c) }));
    const rest = sum(cats.slice(5), (c) => c.total);
    if (rest > 0) top.push({ label: 'Everything else', value: rest, color: PALETTE[9], extra: [{ label: 'Categories', value: cats.slice(5).map((c) => c.name).join(', ') }] });
    donutChart(sp, top, { fmt: (v) => f.money(v), sub: 'spent', emptyText: 'No transactions this month' });
    const goals = d.goals.map((g) => ({ g, i: goalInfo(g) }));
    if (goals.length) {
      const gsum = sp.createDiv({ cls: 'fd-goal-summary' });
      const saved = sum(goals, (x) => x.i.saved), target = sum(goals, (x) => x.i.target);
      const gh = gsum.createDiv({ cls: 'fd-goal-summary-head' });
      gh.createSpan({ text: `Savings goals · ${goals.length}` });
      gh.createSpan({ cls: 'fd-muted', text: `${f.money(saved)} of ${f.money(target)}` });
      progressBar(gsum, target ? saved / target : 0, { color: PALETTE[2], tip: { key: 'goals-all', title: 'All savings goals', rows: [
        { label: 'Saved', value: f.money(saved), color: PALETTE[2], strong: true },
        { label: 'Target', value: f.money(target) },
        { label: 'Remaining', value: f.money(Math.max(0, target - saved)) },
        { label: 'Progress', value: f.pct(target ? saved / target : 0) },
        { label: 'Completed', value: `${goals.filter((x) => x.i.done).length} of ${goals.length}`, muted: true },
        ...goals.filter((x) => !x.i.done).map((x) => ({ label: x.g.name, value: `${f.pct(x.i.progress)} · ${f.money(x.i.remaining)} to go`, muted: true })),
      ] } });
    }

    // Retirement summary
    const rt = this.card(grid, 'Retirement', { sub: `Goal: retire at ${plan.targetAge}`, link: 'retirement' });
    const rrow = rt.createDiv({ cls: 'fd-ring-row' });
    ring(rrow, plan.progress, { sub: 'of nest egg', color: statusColor(plan.status), title: 'Progress toward retirement target', tip: { key: 'ring', title: 'Retirement progress', rows: [
      { label: 'Saved today', value: f.money(plan.balance), strong: true },
      { label: 'Target nest egg', value: f.money(plan.target) },
      { label: 'Still needed', value: f.money(Math.max(0, plan.target - plan.balance)) },
      { label: 'Contributions', value: `${f.money(plan.contribution)}/yr` },
      { label: `Projected at ${plan.targetAge}`, value: `${f.money(plan.projectedAtTarget)} (${f.pct(plan.ratio)})`, tone: plan.status === 'on-track' ? 'good' : 'bad' },
      { label: 'Status', value: STATUS_TEXT[plan.status], tone: plan.status === 'on-track' ? 'good' : plan.status === 'behind' ? 'bad' : null },
    ] } });
    const facts = rrow.createDiv({ cls: 'fd-facts' });
    this.fact(facts, 'Saved today', f.money(plan.balance));
    this.fact(facts, 'Target nest egg', f.money(plan.target), 'targetNestEgg');
    this.fact(facts, `Projected at ${plan.targetAge}`, f.money(plan.projectedAtTarget), 'projected');
    this.fact(facts, 'Est. retirement', plan.estDate ? `${monthLabel(monthKey(plan.estDate), true)} (age ${plan.estAge.toFixed(1)})` : 'Not reached by 100', 'estimatedRetirement');
    const st = rt.createDiv({ cls: `fd-callout is-${plan.status}` });
    st.setText(retirementSentence(plan, f));
    rt.createDiv({ cls: 'fd-prediction-line', text: 'Prediction based on your inputs — not a guarantee or financial advice.' });

    // Investments summary
    if (invTabShown(d)) {
      const iv = invStats(d);
      const ctx0 = this.retCtx;
      this.retCtx = () => Object.assign(ctx0(), { iv });
      const ic = this.card(grid, 'Investments', { sub: iv.y1 ? `Since ${monthLabel(iv.y1.from, true)}` : 'Taxable + retirement', link: 'investments' });
      const rows = iv.tl.filter((r) => r.total != null).slice(-12);
      lineChart(ic, { labels: rows.map((r) => monthLabel(r.date)), series: [{ name: 'Total invested', color: INV_COLORS.total, values: rows.map((r) => r.total), area: true }],
        fmt: (v) => f.compact(v), tipFmt: (v) => f.money(v), height: 150, maxXLabels: 4, emptyText: 'Add past balances to see growth' });
      const facts = ic.createDiv({ cls: 'fd-facts' });
      this.fact(facts, 'Total invested', f.money(iv.total), 'invTotal');
      if (iv.y1) {
        this.fact(facts, 'Money put in (est.)', signed(iv.y1.moneyIn, (v) => f.money(v)), 'moneyIn');
        this.fact(facts, 'Market growth', `${signed(iv.y1.growth, (v) => f.money(v))} (${retLabel(iv.y1, f)})`, 'marketGrowth');
      }
    }

    // Income (net / gross / both) and this month's notes
    this.renderIncomeCard(grid);
    const nc = this.card(grid, 'Notes', { sub: monthLabel(curKey, true), tools: (tl) => this.button(tl, 'plus', 'Note', () => this.plugin.editBalanceNote()) });
    this.notesList(nc, notesFor(d, curKey, f), { limit: 5, emptyText: 'No notes yet this month. Add one when you update balances or log a transaction.' });

    // Insights
    const ins = this.card(grid, 'Things to look at', { span: invTabShown(d) ? 2 : 3 });
    const list = ins.createEl('ul', { cls: 'fd-insights' });
    for (const item of insights(d, f, plan)) {
      const li = list.createEl('li', { cls: `is-${item.tone}` });
      setIcon(li.createSpan({ cls: 'fd-insight-icon' }), item.tone === 'good' ? 'check-circle' : item.tone === 'bad' ? 'alert-triangle' : 'info');
      li.createSpan({ text: item.text });
    }
  }
  /** Overview income card: static guaranteed monthly income with a Net / Gross / Both toggle. */
  renderIncomeCard(grid) {
    const d = this.data, f = this.fmt;
    const view = ['net', 'gross', 'both'].includes(d.settings.incomeView) ? d.settings.incomeView : 'net';
    const today = todayISO();
    const { cur, prev, upcoming, hist } = incomeOn(d, today);
    const tot = totalIncomeOn(d, today);
    const extrasAll = d.extraIncome || [];
    const jobSub = cur ? [cur.title, cur.employer].filter(Boolean).join(' · ') : '';
    const card = this.card(grid, 'Income', { span: 2,
      sub: (jobSub || 'Guaranteed monthly income') + (tot.extras.length ? ` + ${tot.extras.length} other source${tot.extras.length === 1 ? '' : 's'}` : ''),
      tools: (tl) => {
        const seg = tl.createDiv({ cls: 'fd-seg' });
        for (const [v, l] of [['net', 'Net'], ['gross', 'Gross'], ['both', 'Both']]) {
          const b = seg.createEl('button', { text: l, cls: view === v ? 'is-active' : '', attr: { 'aria-pressed': String(view === v) } });
          b.addEventListener('click', async () => { d.settings.incomeView = v; await this.plugin.save(); this.plugin.refresh(); });
        }
        this.button(tl, 'trending-up', cur ? 'Update income' : 'Set up income', () => this.plugin.editIncome());
        this.button(tl, 'plus', 'Add income', () => this.plugin.editExtraIncome());
        if (hist.length || extrasAll.length) this.iconButton(tl, 'history', 'Income history & sources', () => this.plugin.manageIncome());
      } });
    if (!cur && !tot.extras.length) {
      emptyState(card, upcoming ? `Income starts ${dateLabel(upcoming.date)}.` : 'Set your monthly income (gross and take-home) to see it here. Update it any time you get a raise or change jobs, and use “Add income” for side jobs, rental income and other sources.');
      return;
    }
    const G = tot.gross, N = tot.net, D = Math.max(0, G - N);
    const multi = tot.extras.length > 0;
    const figs = card.createDiv({ cls: 'fd-income-figs' });
    const fig = (label, value, sub, cls) => {
      const el = figs.createDiv({ cls: 'fd-income-fig' + (cls ? ' ' + cls : '') });
      el.createDiv({ cls: 'fd-mini-label', text: label });
      el.createDiv({ cls: 'fd-income-fig-value', text: value });
      if (sub) el.createDiv({ cls: 'fd-income-fig-sub', text: sub });
    };
    // Cash flow vs average spending over the last three full months
    const curKey = monthKey(new Date());
    const avgSpend = sum([1, 2, 3].map((i) => sum(txFor(d, addMonths(curKey, -i)), (x) => x.amount))) / 3;
    const left = N - avgSpend;
    if (view === 'net') {
      fig('Monthly take-home', f.money(N), multi ? `${tot.extras.length + (cur ? 1 : 0)} sources · guaranteed each month` : 'Guaranteed each month', 'is-primary');
      fig('Per year', f.money(N * 12));
      fig('Taxes & deductions', `${f.money(D)}/mo`, G ? `${f.pct(D / G)} of gross` : '');
      fig('Left after spending', avgSpend ? f.money(left) : '—', avgSpend ? `${f.pct(left / N)} savings rate · avg spend ${f.money(avgSpend)}` : 'No spending history yet', left >= 0 ? 'is-good' : 'is-bad');
    } else if (view === 'gross') {
      fig('Monthly gross', f.money(G), multi ? `${tot.extras.length + (cur ? 1 : 0)} sources · before taxes & deductions` : 'Before taxes & deductions', 'is-primary');
      fig('Per year', f.money(G * 12));
      fig('Taxes & deductions', `${f.money(D)}/mo`, `${f.money(D * 12)}/yr`);
      fig('Take-home rate', G ? f.pct(N / G) : '—', `${f.money(N)}/mo net`);
    } else {
      fig('Monthly gross → net', `${f.money(G)} → ${f.money(N)}`, multi ? `${tot.extras.length + (cur ? 1 : 0)} sources · guaranteed each month` : 'Guaranteed each month', 'is-primary is-wide');
      fig('Per year', `${f.compact(G * 12)} → ${f.compact(N * 12)}`);
      fig('Deductions', G ? f.pct(D / G) : '—', `${f.money(D)}/mo`);
    }
    // Income sources: the job plus each additional source (shown once there's more than one)
    const amt = (h) => (view === 'gross' ? num(h.gross) : num(h.net));
    const lbl = view === 'gross' ? 'gross' : 'net';
    const showExtras = extrasAll.filter((x) => !x.end || x.end >= today);
    if (showExtras.length) {
      const list = card.createDiv({ cls: 'fd-income-sources' });
      const row = (name, meta, value, onClick, cls) => {
        const r = list.createDiv({ cls: 'fd-income-source' + (onClick ? ' is-clickable' : '') + (cls ? ' ' + cls : ''), attr: onClick ? { role: 'button', tabindex: '0' } : {} });
        const l = r.createDiv({ cls: 'fd-income-source-name' });
        l.createSpan({ text: name });
        if (meta) l.createSpan({ cls: 'fd-muted', text: ` · ${meta}` });
        r.createDiv({ cls: 'fd-income-source-val', text: value });
        if (onClick && !this.embedded) { r.addEventListener('click', onClick); r.addEventListener('keydown', (e) => { if (e.key === 'Enter') onClick(); }); }
      };
      const both = (x) => (view === 'both' ? `${f.money(num(x.gross))} → ${f.money(num(x.net))}/mo` : `${f.money(amt(x))}/mo`);
      if (cur) row(jobSub || 'Job', 'Job', both(cur), () => this.plugin.editIncome());
      for (const x of showExtras) {
        const future = x.start && x.start > today;
        row(x.name || x.kind || 'Income', [x.kind, future ? `starts ${dateLabel(x.start)}` : x.end ? `until ${dateLabel(x.end)}` : ''].filter(Boolean).join(' · '), both(x), () => this.plugin.editExtraIncome(x), future ? 'is-upcoming' : '');
      }
    }
    // Last change (raise / new job) and any upcoming one
    if (!cur) return;
    if (prev) {
      const dv = amt(cur) - amt(prev);
      const c = card.createDiv({ cls: 'fd-income-change' });
      setIcon(c.createSpan({ cls: 'fd-income-change-icon' }), dv >= 0 ? 'trending-up' : 'trending-down');
      c.createSpan({ text: `${cur.reason || 'Change'} on ${dateLabel(cur.date)}: ` });
      c.createSpan({ cls: dv >= 0 ? 'fd-good' : 'fd-bad', text: `${signed(dv, (v) => f.money(v))}/mo ${lbl} (${amt(prev) ? signed(dv / amt(prev), (v) => f.pct(v, 1)) : '—'})` });
      if (cur.employer && prev.employer && cur.employer !== prev.employer) c.createSpan({ cls: 'fd-muted', text: ` · ${prev.employer} → ${cur.employer}` });
    } else {
      card.createDiv({ cls: 'fd-income-change fd-muted', text: `In effect since ${dateLabel(cur.date)}.` });
    }
    if (upcoming) {
      const dv = amt(upcoming) - amt(cur);
      card.createDiv({ cls: 'fd-income-change is-upcoming', text: `Upcoming ${String(upcoming.reason || 'change').toLowerCase()} on ${dateLabel(upcoming.date)}: ${f.money(amt(upcoming))}/mo ${lbl} (${signed(dv, (v) => f.money(v))})` });
    }
    if (cur.note) card.createDiv({ cls: 'fd-tx-note fd-income-note', text: cur.note });
  }

  notesList(parent, items, opts = {}) {
    if (!items.length) return emptyState(parent, opts.emptyText || 'No notes');
    const list = parent.createDiv({ cls: 'fd-notes' });
    const icons = { balance: 'refresh-cw', income: 'banknote', transaction: 'receipt' };
    for (const n of items.slice(0, opts.limit || items.length)) {
      const row = list.createDiv({ cls: `fd-note is-${n.kind}`, attr: { role: 'button', tabindex: '0', 'aria-label': `Edit note: ${n.text}` } });
      setIcon(row.createSpan({ cls: 'fd-note-icon' }), icons[n.kind]);
      const body = row.createDiv({ cls: 'fd-note-body' });
      const head = body.createDiv({ cls: 'fd-note-head' });
      head.createSpan({ cls: 'fd-note-title', text: n.title });
      head.createSpan({ cls: 'fd-muted fd-note-date', text: dateLabel(n.date).replace(/, \d{4}$/, '') });
      body.createDiv({ cls: 'fd-note-text', text: n.text });
      const open = () => this.plugin.editNoteItem(n);
      row.addEventListener('click', open);
      row.addEventListener('keydown', (e) => { if (e.key === 'Enter') open(); });
    }
    if (opts.limit && items.length > opts.limit) {
      const more = parent.createEl('a', { cls: 'fd-link fd-note-more', text: `+${items.length - opts.limit} more`, attr: { href: '#' } });
      more.addEventListener('click', (e) => { e.preventDefault(); if (opts.onMore) opts.onMore(); else { this.notesMonth = null; this.setTab('networth'); } });
    }
  }

  catExtra(c) {
    const b = budgetFor(this.data, c.name);
    const rows = [{ label: 'Transactions', value: String(c.count), muted: true }, { label: 'Average', value: this.fmt.cents(c.total / (c.count || 1)), muted: true }];
    if (c.debit && c.credit) rows.push({ label: 'Debit / credit', value: `${this.fmt.money(c.debit)} / ${this.fmt.money(c.credit)}`, muted: true });
    if (b) rows.push({ label: 'Budget', value: `${this.fmt.money(b)} (${this.fmt.pct(c.total / b)} used)`, tone: c.total > b ? 'bad' : 'good' });
    return rows;
  }
  noteFoot(key) {
    const items = notesFor(this.data, key, this.fmt);
    if (!items.length) return null;
    const lines = items.slice(0, 3).map((n) => `📝 ${n.text.length > 70 ? n.text.slice(0, 68) + '…' : n.text}`);
    if (items.length > 3) lines.push(`+${items.length - 3} more note${items.length - 3 === 1 ? '' : 's'}`);
    return lines;
  }
  miniStat(parent, label, value) {
    const s = parent.createDiv({ cls: 'fd-mini' });
    s.createDiv({ cls: 'fd-mini-label', text: label });
    s.createDiv({ cls: 'fd-mini-value', text: value });
  }
  fact(parent, label, value, help) {
    const r = parent.createDiv({ cls: 'fd-fact' });
    const l = r.createSpan({ cls: 'fd-fact-label' });
    if (help) termEl(l, label, help, this.retCtx); else l.setText(label);
    r.createSpan({ cls: 'fd-fact-value', text: value });
  }

  /* ---------------------------------------------------------- net worth */
  renderNetWorth(body) {
    const d = this.data, f = this.fmt, t = totals(d);
    const hist = d.history;
    const prev = hist.length > 1 ? hist[hist.length - 2] : null;
    const yearAgo = hist.find((h) => h.date === addMonths(monthKey(new Date()), -12));
    const nw = nwStats(d);
    this.retCtx = () => ({ nw, f });

    // Toolbar: what the numbers are, plus the (?) explainer
    const bar = body.createDiv({ cls: 'fd-toolbar fd-ret-toolbar' });
    const lead = bar.createDiv({ cls: 'fd-ret-lead' });
    termEl(lead, 'Balances before tax', 'beforeTax', this.retCtx);
    lead.createSpan({ cls: 'fd-muted', text: ` · ${d.accounts.length} account${d.accounts.length === 1 ? '' : 's'} · ` });
    termEl(lead, `${hist.length} monthly snapshot${hist.length === 1 ? '' : 's'}`, 'snapshots', this.retCtx);
    lead.createSpan({ cls: 'fd-muted', text: ` · tax notes use ${taxYear()} U.S. rules` });
    const ra = bar.createDiv({ cls: 'fd-ret-actions' });
    const info = this.iconButton(ra, 'circle-help', 'How your net worth is calculated and how your accounts are taxed', () => this.plugin.openNetWorthInfo());
    info.addClass('fd-info-btn');
    info.setAttr('title', 'How is this calculated?');

    const kpis = body.createDiv({ cls: 'fd-kpis' });
    this.kpi(kpis, 'Net worth', f.money(t.net), { icon: 'landmark', help: 'netWorth', delta: prev ? t.net - prev.net : null, deltaText: prev ? `${f.money(Math.abs(t.net - prev.net))} this month` : '' });
    this.kpi(kpis, 'Total assets', f.money(t.assets), { icon: 'piggy-bank', help: 'totalAssets', sub: `${d.accounts.filter((a) => a.group !== 'debt').length} accounts` });
    this.kpi(kpis, 'Total debts', f.money(t.debts), { icon: 'receipt', help: 'totalDebts', invert: true, delta: prev ? t.debts - prev.debts : null, deltaText: prev ? `${f.money(Math.abs(t.debts - prev.debts))} this month` : '',
      sub: t.assets ? `Debt-to-asset ${f.pct(t.debts / t.assets)}` : '' });
    this.kpi(kpis, '12-month change', yearAgo ? f.money(t.net - yearAgo.net) : '—', { icon: 'calendar', help: 'yearChange',
      delta: yearAgo ? t.net - yearAgo.net : null, deltaText: yearAgo && yearAgo.net ? f.pct((t.net - yearAgo.net) / Math.abs(yearAgo.net), 1) : '', sub: yearAgo ? '' : 'Needs a year of history' });

    const grid = body.createDiv({ cls: 'fd-grid' });
    const trend = this.card(grid, 'Net worth trend', { span: 3, sub: 'Monthly snapshots', help: 'snapshots', tools: (tl) => {
      const seg = tl.createDiv({ cls: 'fd-seg' });
      for (const [v, l] of [['6', '6M'], ['12', '1Y'], ['36', '3Y'], ['all', 'All']]) {
        const b = seg.createEl('button', { text: l, cls: this.nwRange === v ? 'is-active' : '' });
        b.addEventListener('click', () => { this.nwRange = v; this.render(); });
      }
      this.iconButton(tl, 'pencil', 'Edit snapshots', () => this.plugin.editHistory());
    } });
    const h = this.nwRange === 'all' ? hist : hist.slice(-Number(this.nwRange));
    lineChart(trend, { labels: h.map((x) => monthLabel(x.date)), height: 250,
      series: [
        { name: 'Net worth', color: PALETTE[0], values: h.map((x) => x.net), area: true },
        { name: 'Assets', color: PALETTE[2], values: h.map((x) => x.assets), dashed: true, noDots: true },
        { name: 'Debts', color: PALETTE[3], values: h.map((x) => x.debts), dashed: true, noDots: true },
      ], fmt: (v) => f.compact(v), tipFmt: (v) => f.money(v), tipTitle: (i) => monthLabel(h[i].date, true),
      markers: h.map((x, i) => (notesFor(d, x.date, f).length ? i : -1)).filter((i) => i >= 0),
      tipFoot: (i) => this.noteFoot(h[i].date),
      onPick: (i) => { this.notesMonth = h[i].date; this.render(); },
      tipExtra: (i) => {
        const rows = [];
        if (i > 0) { const dv = h[i].net - h[i - 1].net; rows.push({ label: 'Net worth change', value: signed(dv, (v) => f.money(v)), tone: dv >= 0 ? 'good' : 'bad' }); }
        if (h[i].assets) rows.push({ label: 'Debt-to-asset', value: f.pct(h[i].debts / h[i].assets, 1), muted: true });
        const ch = (d.cashHistory || {})[h[i].date];
        const cashV = ch ? sum(Object.values(ch)) : h[i].cash;
        if (cashV != null) rows.push({ label: 'On-budget (cash)', value: f.money(cashV), muted: true });
        if (h[i].retirement) rows.push({ label: 'Retirement', value: f.money(h[i].retirement), muted: true });
        return rows;
      }, emptyText: 'Snapshots appear here each month you update balances' });

    if (noteMonths(d).length) trend.createDiv({ cls: 'fd-chart-hint', text: 'Dots on the axis mark months with notes — hover to read them, click a month to show its notes below.' });

    const groupColor = (accts) => accts.map((a, i) => ({ label: a.name, value: num(a.balance), color: PALETTE[i % PALETTE.length],
      extra: [{ label: 'Type', value: a.kind || '—', muted: true }, { label: 'Group', value: ACCOUNT_GROUPS[a.group].split(' (')[0], muted: true }, { label: 'Share of net worth', value: t.net > 0 ? f.pct(num(a.balance) / t.net, 1) : '—', muted: true }] }));
    const inv = d.accounts.filter((a) => a.group === 'investment' || a.group === 'retirement').sort((a, b) => num(b.balance) - num(a.balance));
    const invCard = this.card(grid, 'Investments', { sub: 'Taxable + retirement accounts', help: 'investments' });
    donutChart(invCard, groupColor(inv), { fmt: (v) => f.money(v), sub: 'invested', center: f.compact(sum(inv, (a) => a.balance)), emptyText: 'Add investment or retirement accounts' });
    const bud = d.accounts.filter((a) => a.group === 'budget').sort((a, b) => num(b.balance) - num(a.balance));
    const budCard = this.card(grid, 'On-budget accounts', { sub: 'Checking, savings & cash', help: 'onBudget' });
    donutChart(budCard, groupColor(bud), { fmt: (v) => f.money(v), sub: 'cash', center: f.compact(sum(bud, (a) => a.balance)), emptyText: 'Add checking, savings or cash accounts' });
    const allocCard = this.card(grid, 'Asset mix', { sub: 'Where your assets sit', help: 'assetMix' });
    const groups = ['budget', 'investment', 'retirement', 'property'];
    const glabels = { budget: 'Cash', investment: 'Taxable investments', retirement: 'Retirement', property: 'Property & other' };
    donutChart(allocCard, groups.map((g, i) => ({ label: glabels[g], value: t.byGroup[g] || 0, color: [PALETTE[4], PALETTE[0], PALETTE[2], PALETTE[7]][i],
      extra: [{ label: 'Accounts', value: d.accounts.filter((a) => a.group === g).map((a) => a.name).join(', '), muted: true }] })),
      { fmt: (v) => f.money(v), sub: 'assets', center: f.compact(t.assets) });

    const credit = [...d.credit].sort((a, b) => a.date.localeCompare(b.date));
    const last = credit[credit.length - 1];
    const cc = this.card(grid, 'Credit score trend', { span: 3, help: 'creditScore', sub: last ? `Latest ${last.score} · ${creditBand(last.score)} · ${dateLabel(last.date)}` : 'Track your score monthly', tools: (tl) => {
      this.button(tl, 'plus', 'Add score', () => this.plugin.editCredit());
      if (credit.length) this.iconButton(tl, 'list', 'Edit scores', () => this.plugin.listCredit());
    } });
    const lo = credit.length ? Math.max(300, Math.floor((Math.min(...credit.map((c) => c.score)) - 40) / 50) * 50) : 300;
    const hi = credit.length ? Math.min(850, Math.ceil((Math.max(...credit.map((c) => c.score)) + 30) / 50) * 50) : 850;
    lineChart(cc, { labels: credit.map((c) => monthLabel(c.date.slice(0, 7))), height: 220,
      series: [{ name: 'Credit score', color: PALETTE[5], values: credit.map((c) => c.score) }],
      yMin: lo, yMax: hi, yStep: 50, fmt: (v) => String(Math.round(v)), padLeft: 44,
      bands: [{ from: 300, to: 579, color: '#E45756', label: 'Poor' }, { from: 580, to: 669, color: '#F58518', label: 'Fair' }, { from: 670, to: 739, color: '#EECA3B', label: 'Good' },
        { from: 740, to: 799, color: '#54A24B', label: 'Very good' }, { from: 800, to: 850, color: '#4C78A8', label: 'Exceptional' }],
      tipTitle: (i) => dateLabel(credit[i].date),
      tipExtra: (i) => {
        const rows = [{ label: 'Rating', value: creditBand(credit[i].score) }];
        if (i > 0) { const dv = credit[i].score - credit[i - 1].score; rows.push({ label: 'Change', value: `${dv > 0 ? '+' : dv < 0 ? '−' : '±'}${Math.abs(dv)} pts`, tone: dv > 0 ? 'good' : dv < 0 ? 'bad' : null }); }
        const next = [580, 670, 740, 800].find((b) => b > credit[i].score);
        if (next) rows.push({ label: `To ${creditBand(next)}`, value: `${next - credit[i].score} pts`, muted: true });
        if (credit[i].bureau) rows.push({ label: 'Source', value: credit[i].bureau, muted: true });
        return rows;
      },
      emptyText: 'Add your first credit score' });

    // Notes for one month at a time (current month by default; arrows or a click on the chart change it)
    const nk = this.notesMonth || monthKey(new Date());
    const items = notesFor(d, nk, f);
    const snap = hist.find((x) => x.date === nk);
    const prevSnap = hist.find((x) => x.date === addMonths(nk, -1));
    let sub = items.length ? `${items.length} note${items.length === 1 ? '' : 's'}` : 'No notes';
    if (snap) sub += ` · Net worth ${f.money(snap.net)}` + (prevSnap ? ` (${signed(snap.net - prevSnap.net, (v) => f.money(v))})` : '');
    const nmCard = this.card(grid, `Notes · ${monthLabel(nk, true)}`, { span: 3, sub, tools: (tl) => {
      const nav = tl.createDiv({ cls: 'fd-month-nav is-compact' });
      this.iconButton(nav, 'chevron-left', 'Previous month', () => { this.notesMonth = addMonths(nk, -1); this.render(); });
      this.iconButton(nav, 'chevron-right', 'Next month', () => { this.notesMonth = addMonths(nk, 1); this.render(); });
      if (nk !== monthKey(new Date())) {
        const today = nav.createEl('button', { cls: 'fd-btn is-small', text: 'This month' });
        today.addEventListener('click', () => { this.notesMonth = null; this.render(); });
      }
      this.button(tl, 'plus', 'Note', () => this.plugin.editBalanceNote({ date: nk === monthKey(new Date()) ? todayISO() : `${nk}-01` }));
    } });
    this.notesList(nmCard, items, { emptyText: `No notes for ${monthLabel(nk, true)}.` });

    const ac = this.card(grid, 'Accounts', { span: 3, help: 'accountGroups', sub: 'Hover an account type to see how it’s taxed', tools: (tl) => {
      this.button(tl, 'settings', 'Manage', () => this.plugin.manageAccounts());
      this.button(tl, 'refresh-cw', 'Update balances', () => this.plugin.updateBalances());
      this.button(tl, 'plus', 'Add account', () => this.plugin.editAccount());
    } });
    this.accountsTable(ac, d.accounts);
  }

  accountsTable(parent, accounts, opts = {}) {
    const f = this.fmt;
    if (!accounts.length) return emptyState(parent, 'No accounts yet');
    const table = parent.createEl('table', { cls: 'fd-table' });
    const head = table.createEl('thead').createEl('tr');
    const cols = opts.cols || ['Account', 'Type', 'Balance'];
    cols.forEach((c, i) => head.createEl('th', { text: c, cls: i >= 2 ? 'is-num' : '' }));
    head.createEl('th');
    const tb = table.createEl('tbody');
    const order = ['budget', 'investment', 'retirement', 'property', 'debt'];
    const groups = opts.flat ? [null] : order;
    for (const g of groups) {
      const list = accounts.filter((a) => !g || a.group === g).sort((a, b) => Math.abs(num(b.balance)) - Math.abs(num(a.balance)));
      if (!list.length) continue;
      if (g) {
        const gr = tb.createEl('tr', { cls: 'fd-group-row' });
        const tc = opts.totalCol || cols.length - 1;
        termEl(gr.createEl('td', { attr: { colspan: tc } }), ACCOUNT_GROUPS[g], `grp_${g}`, () => ({ nw: nwStats(this.data), f }));
        gr.createEl('td', { cls: 'is-num', text: (g === 'debt' ? '−' : '') + f.money(sum(list, (a) => Math.abs(num(a.balance)))) });
        gr.createEl('td', { attr: { colspan: cols.length - tc } });
      }
      for (const a of list) {
        const tr = tb.createEl('tr', { cls: 'is-clickable' });
        tr.addEventListener('click', () => this.plugin.editAccount(a));
        tr.createEl('td', { text: a.name });
        const kt = tr.createEl('td', { cls: 'fd-muted' });
        if (a.kind) { const ks = kt.createSpan({ cls: 'fd-term', text: a.kind }); hover(ks, () => accountTaxTip(a, f)); }
        if (opts.extra) opts.extra(tr, a);
        else tr.createEl('td', { cls: 'is-num' + (a.group === 'debt' ? ' is-neg' : ''), text: (a.group === 'debt' ? '−' : '') + f.money(Math.abs(num(a.balance))) });
        const act = tr.createEl('td', { cls: 'fd-row-actions' });
        this.iconButton(act, 'pencil', 'Edit', () => this.plugin.editAccount(a));
      }
    }
  }

  /* -------------------------------------------------------- investments */
  renderInvestments(body) {
    const d = this.data, f = this.fmt;
    const iv = invStats(d);
    const tl = iv.tl;
    const st = d.settings.invest;
    if (!this.invRange) this.invRange = st.range || '12';
    if (!this.invView) this.invView = st.view || 'total';
    this.retCtx = () => ({ iv, f });
    const now = monthKey(new Date());
    const money = (v) => f.money(v), sMoney = (v) => signed(v, money);

    // Toolbar
    const bar = body.createDiv({ cls: 'fd-toolbar fd-ret-toolbar' });
    const lead = bar.createDiv({ cls: 'fd-ret-lead' });
    lead.createSpan({ cls: 'fd-muted', text: `${iv.accts.length} account${iv.accts.length === 1 ? '' : 's'} · ` });
    termEl(lead, iv.months ? `${iv.months} month${iv.months === 1 ? '' : 's'} of history` : 'No history yet', 'invHistory', this.retCtx);
    lead.createSpan({ cls: 'fd-muted', text: ' · ' });
    termEl(lead, iv.est ? 'contributions estimated from your settings' : 'contribution estimate off', 'moneyIn', this.retCtx);
    const ra = bar.createDiv({ cls: 'fd-ret-actions' });
    if (!this.embedded) {
      this.iconButton(ra, 'history', 'Monthly history', () => this.plugin.manageInvHistory());
    }
    const info = this.iconButton(ra, 'circle-help', 'How investment growth is calculated', () => this.plugin.openInvestmentsInfo());
    info.addClass('fd-info-btn');
    info.setAttr('title', 'How is this calculated?');

    if (!iv.accts.length && !tl.length) {
      const c = this.card(body, 'Track your investments', { span: 3 });
      c.createEl('p', { text: 'Add a brokerage, TOD individual, 401(k), IRA or other investment or retirement account. Each month’s balances are saved so you can watch them grow.' });
      const b = c.createDiv({ cls: 'fd-row-buttons' });
      this.button(b, 'plus', 'Add investment account', () => this.plugin.editAccount({ group: 'investment' }, true), 'mod-cta');
      this.button(b, 'plus', 'Add retirement account', () => this.plugin.editAccount({ group: 'retirement' }, true));
      return;
    }

    // KPIs
    const kpis = body.createDiv({ cls: 'fd-kpis' });
    this.kpi(kpis, 'Total invested', money(iv.total), { icon: 'line-chart', help: 'invTotal',
      delta: iv.m1 ? iv.m1.change : null, deltaText: iv.m1 ? `${money(Math.abs(iv.m1.change))} this month` : '' });
    this.kpi(kpis, 'Taxable investments', money(iv.taxable), { icon: 'trending-up', help: 'invTaxable', sub: iv.total ? `${f.pct(iv.taxable / iv.total)} of invested` : '' });
    this.kpi(kpis, 'Retirement accounts', money(iv.retirement), { icon: 'sunset', help: 'invRetirement', sub: iv.total ? `${f.pct(iv.retirement / iv.total)} of invested` : '' });
    const y1 = iv.y1;
    this.kpi(kpis, y1 && !iv.y1Exact ? `Market growth since ${monthLabel(y1.from)}` : '12-month market growth', y1 ? sMoney(y1.growth) : '—', { icon: 'sparkles', help: 'marketGrowth',
      delta: y1 && y1.ret != null ? y1.ret : null, deltaText: y1 && y1.ret != null ? `${f.pct(Math.abs(y1.ret), 1)} est. return` : '',
      sub: y1 ? `${sMoney(y1.moneyIn)} put in · ${sMoney(y1.change)} total change` : 'Add past balances to see growth' });

    const grid = body.createDiv({ cls: 'fd-grid' });

    // Growth chart
    const rangeRows = this.invRange === 'all' ? tl : tl.filter((r) => r.date > addMonths(now, -Number(this.invRange)) || r.date === addMonths(now, -Number(this.invRange)));
    const rows = rangeRows;
    const gc = this.card(grid, 'Investment & retirement growth', { span: 3, help: 'invHistory', sub: 'Month-end balances · hover for details', tools: (tl2) => {
      const seg = tl2.createDiv({ cls: 'fd-seg' });
      for (const [v, l] of INV_VIEWS) {
        const b = seg.createEl('button', { text: l, cls: this.invView === v ? 'is-active' : '' });
        b.addEventListener('click', () => { this.invView = v; this.render(); });
      }
      const seg2 = tl2.createDiv({ cls: 'fd-seg' });
      for (const [v, l] of INV_RANGES) {
        const b = seg2.createEl('button', { text: l, cls: this.invRange === v ? 'is-active' : '' });
        b.addEventListener('click', () => { this.invRange = v; this.render(); });
      }
      if (!this.embedded) this.iconButton(tl2, 'pencil', 'Edit monthly history', () => this.plugin.manageInvHistory());
    } });
    const idxOf = (r) => tl.indexOf(r);
    const growthRows = (i, key, label) => {
      const ti = idxOf(rows[i]);
      let pi = -1;
      for (let k = ti - 1; k >= 0; k--) if (invValue(tl[k], key) != null) { pi = k; break; }
      const g = invGrowth(d, tl, pi, ti, key);
      if (!g) return [];
      const out = [{ label: `${label || 'Change'} vs ${monthLabel(g.from)}`, value: sMoney(g.change), tone: g.change >= 0 ? 'good' : 'bad' }];
      if (g.moneyIn) out.push({ label: 'Money put in (est.)', value: sMoney(g.moneyIn), muted: true });
      out.push({ label: 'Market growth', value: `${sMoney(g.growth)}${g.ret != null ? ` (${retLabel(g, f)})` : ''}`, tone: g.growth >= 0 ? 'good' : 'bad', muted: true });
      return out;
    };
    const markers = rows.map((x, i) => (notesFor(d, x.date, f).length ? i : -1)).filter((i) => i >= 0);
    const common = { labels: rows.map((r) => monthLabel(r.date)), height: 260, fmt: (v) => f.compact(v), tipFmt: money,
      tipTitle: (i) => monthLabel(rows[i].date, true) + (rows[i].detailed ? '' : ' · snapshot total only'), markers, tipFoot: (i) => this.noteFoot(rows[i].date),
      onPick: this.embedded ? null : (i) => (rows[i].date === now ? this.plugin.updateBalances() : this.plugin.editPastBalances(rows[i].date)),
      emptyText: 'Balances appear here each month — add earlier months with “Past balances” in the gear menu' };
    if (this.invView === 'group') {
      lineChart(gc, Object.assign(common, {
        series: [
          { name: 'Total', color: INV_COLORS.total, values: rows.map((r) => r.total), dashed: true, noDots: true },
          { name: 'Taxable', color: INV_COLORS.investment, values: rows.map((r) => r.taxable) },
          { name: 'Retirement', color: INV_COLORS.retirement, values: rows.map((r) => r.retirement) },
        ],
        tipExtra: (i) => [...growthRows(i, 'taxable', 'Taxable'), ...growthRows(i, 'retirement', 'Retirement')],
      }));
    } else if (this.invView === 'account') {
      const ids = new Set();
      for (const r of rows) for (const id in r.byAcct) ids.add(id);
      const latest = (id) => { for (let k = rows.length - 1; k >= 0; k--) if (rows[k].byAcct[id] != null) return rows[k].byAcct[id]; return 0; };
      const list = [...ids].map((id) => invAccountInfo(d, id)).filter(Boolean).sort((a, b) => latest(b.id) - latest(a.id));
      const top = list.slice(0, 8), rest = list.slice(8);
      const series = top.map((a, k) => ({ name: a.name + (a.open ? '' : ' (closed)'), color: PALETTE[k % PALETTE.length], values: rows.map((r) => (r.byAcct[a.id] != null ? r.byAcct[a.id] : null)), noDots: rows.length > 24 }));
      if (rest.length) series.push({ name: `${rest.length} other account${rest.length === 1 ? '' : 's'}`, color: PALETTE[9], dashed: true, values: rows.map((r) => (r.detailed ? sum(rest, (a) => r.byAcct[a.id] || 0) : null)) });
      lineChart(gc, Object.assign(common, { series,
        emptyText: 'Per-account lines need monthly account history — add it with “Past balances” in the gear menu',
        tipExtra: (i) => {
          const r = rows[i];
          if (!r.detailed) return [{ label: 'Retirement total', value: money(r.retirement), muted: true }];
          return [{ label: 'Total', value: money(r.total), strong: true }];
        } }));
    } else {
      lineChart(gc, Object.assign(common, {
        series: [{ name: 'Total invested', color: INV_COLORS.total, values: rows.map((r) => (r.total != null ? r.total : null)), area: true },
          { name: 'Retirement only (older snapshots)', color: INV_COLORS.retirement, dashed: true, values: rows.map((r) => (r.detailed ? null : r.retirement)) }],
        tipExtra: (i) => {
          const r = rows[i];
          const out = [];
          if (r.detailed) {
            out.push({ label: 'Taxable', value: money(r.taxable), color: INV_COLORS.investment, muted: true });
            out.push({ label: 'Retirement', value: money(r.retirement), color: INV_COLORS.retirement, muted: true });
          }
          return out.concat(growthRows(i, 'total'));
        } }));
      if (rows.some((r) => !r.detailed)) gc.createDiv({ cls: 'fd-chart-hint', text: `${rows.filter((r) => !r.detailed).length} earlier month${rows.filter((r) => !r.detailed).length === 1 ? '' : 's'} only have the retirement total from your net-worth snapshots (dashed). Add each account’s balance with “Past balances” in the gear menu to include them in the total.` });
    }
    if (markers.length) gc.createDiv({ cls: 'fd-chart-hint', text: 'Dots on the axis mark months with notes. Click a month to edit its balances.' });

    // Balance vs money put in
    const detailedIdx = rows.map((r) => idxOf(r)).filter((i) => tl[i].detailed);
    const bc = this.card(grid, 'Balance vs money put in', { span: 2, help: 'balanceVsIn', sub: 'The gap is market growth' });
    if (detailedIdx.length >= 2) {
      const a0 = detailedIdx[0];
      const labels = [], bal = [], inn = [], gs = [];
      for (const i of detailedIdx) {
        const g = i === a0 ? { start: tl[a0].total, end: tl[a0].total, moneyIn: 0, growth: 0, change: 0, ret: 0, from: tl[a0].date } : invGrowth(d, tl, a0, i);
        labels.push(monthLabel(tl[i].date)); bal.push(tl[i].total); inn.push(g.start + g.moneyIn); gs.push(g);
      }
      lineChart(bc, { labels, height: 220, fmt: (v) => f.compact(v), tipFmt: money,
        series: [{ name: 'Balance', color: INV_COLORS.total, values: bal, area: true }, { name: 'Start + money put in', color: INV_COLORS.moneyIn, values: inn, dashed: true, noDots: true }],
        tipTitle: (k) => `${monthLabel(tl[detailedIdx[k]].date, true)} · since ${monthLabel(tl[a0].date)}`,
        tipExtra: (k) => {
          const g = gs[k];
          return [{ label: 'Market growth', value: sMoney(g.growth), tone: g.growth >= 0 ? 'good' : 'bad' },
            { label: 'Estimated return', value: retLabel(g, f), muted: true },
            ...(g.flows ? [{ label: 'Accounts opened / closed', value: sMoney(g.flows), muted: true }] : [])];
        } });
    } else emptyState(bc, 'Needs two or more months of account history');

    // Tax treatment mix
    const mc = this.card(grid, 'Tax treatment', { help: 'taxMix', sub: 'Hover a slice for how it’s taxed' });
    const cats = {};
    for (const a of iv.accts) { const c = taxCategoryOf(a); (cats[c] = cats[c] || []).push(a); }
    const catColor = { taxable: PALETTE[0], crypto: PALETTE[6], deferred: PALETTE[2], roth: PALETTE[5], hsa: PALETTE[4], pension: PALETTE[7], bank: PALETTE[11] };
    const ti = taxInfo();
    donutChart(mc, Object.keys(cats).map((c) => ({ label: (ti[c] || { title: c }).title, value: sum(cats[c], (a) => a.balance), color: catColor[c] || PALETTE[9],
      extra: [{ label: 'Accounts', value: cats[c].map((a) => a.name).join(', '), muted: true }, { label: 'Taxed', value: (ti[c] || {}).short || '—', muted: true }] })),
    { fmt: money, sub: 'invested', center: f.compact(iv.total), emptyText: 'No investment accounts' });

    // Where the change came from
    const fc = this.card(grid, 'Where the change came from', { span: 3, help: 'growthSources', sub: iv.est ? 'Each month: money put in (estimated) + market growth' : 'Contribution estimate is off — all change shows as market growth' });
    const flows = [];
    for (let k = 1; k < detailedIdx.length; k++) {
      const g = invGrowth(d, tl, detailedIdx[k - 1], detailedIdx[k]);
      if (!g) continue;
      const lab = monthLabel(g.to);
      flows.push({ label: lab, contrib: g.moneyIn, growth: g.growth, tip: { key: `flow${k}`, title: g.months > 1 ? `${monthLabel(g.from, true)} → ${monthLabel(g.to, true)}` : monthLabel(g.to, true), rows: [
        { label: 'Money put in (est.)', value: sMoney(g.moneyIn), color: INV_COLORS.contrib },
        { label: 'Market growth', value: sMoney(g.growth), color: g.growth >= 0 ? INV_COLORS.growthUp : INV_COLORS.growthDown, tone: g.growth >= 0 ? 'good' : 'bad' },
        { label: 'Total change', value: sMoney(g.change), strong: true },
        { label: 'Estimated return', value: retLabel(g, f), muted: true },
        { label: 'Balance', value: `${money(g.start)} → ${money(g.end)}`, muted: true },
      ], foot: this.noteFoot(g.to) } });
    }
    flowChart(fc, flows, { fmt: (v) => f.compact(v), emptyText: 'Needs two or more months of account history' });

    // Per-account performance
    const pc = this.card(grid, 'Account performance', { span: 3, help: 'invPerAccount', sub: 'Hover a type for how it’s taxed, or a trend line for details', tools: (tl2) => {
      if (this.embedded) return;
      this.button(tl2, 'refresh-cw', 'Update balances', () => this.plugin.updateBalances());
      this.button(tl2, 'plus', 'Add account', () => this.plugin.editAccount({ group: 'investment' }, true));
    } });
    const last = tl.length - 1;
    const yearFrom = addMonths(now, -12);
    const spark = tl.filter((r) => r.date >= yearFrom);
    this.accountsTable(pc, iv.accts, { totalCol: 3, cols: ['Account', 'Type', 'Trend (12 mo)', 'Balance', '1-month', '12-month', 'Est. return'], extra: (tr, a) => {
      const g1 = (() => { let p = -1; for (let k = last - 1; k >= 0; k--) if (tl[k].byAcct[a.id] != null) { p = k; break; } return tl[last] && tl[last].date === now ? invGrowth(d, tl, p, last, a.id) : null; })();
      const gy = tl[last] && tl[last].date === now ? invGrowth(d, tl, invIndexFrom(tl, yearFrom, a.id, now), last, a.id) : null;
      const sp = tr.createEl('td', { cls: 'fd-spark-cell' });
      sparkline(sp, spark.map((r) => (r.byAcct[a.id] != null ? r.byAcct[a.id] : null)), { tip: () => ({ key: `sp:${a.id}`, title: a.name, rows: [
        ...spark.filter((r) => r.byAcct[a.id] != null).slice(-6).map((r) => ({ label: monthLabel(r.date, true), value: money(r.byAcct[a.id]), muted: r.date !== now })),
        ...(gy ? [{ label: `Change since ${monthLabel(gy.from)}`, value: sMoney(gy.change), tone: gy.change >= 0 ? 'good' : 'bad' },
          { label: 'Money put in (est.)', value: sMoney(gy.moneyIn), muted: true }, { label: 'Market growth', value: sMoney(gy.growth), muted: true }] : []),
      ] }) });
      tr.createEl('td', { cls: 'is-num', text: money(num(a.balance)) });
      const cell = (g) => {
        const td = tr.createEl('td', { cls: 'is-num' });
        if (!g) { td.setText('—'); td.addClass('fd-muted'); return; }
        td.createDiv({ cls: g.change >= 0 ? 'fd-good' : 'fd-bad', text: sMoney(g.change) });
        if (g.start) td.createDiv({ cls: 'fd-muted fd-small', text: signed(g.change / g.start, (v) => f.pct(v, 1)) });
        hover(td, () => ({ key: `c:${a.id}:${g.from}`, title: `${a.name} · since ${monthLabel(g.from, true)}`, rows: [
          { label: 'Start', value: money(g.start), muted: true }, { label: 'Now', value: money(g.end) },
          { label: 'Money put in (est.)', value: sMoney(g.moneyIn), muted: true },
          { label: 'Market growth', value: sMoney(g.growth), tone: g.growth >= 0 ? 'good' : 'bad' },
          { label: 'Estimated return', value: retLabel(g, f), muted: true }] }));
      };
      cell(g1);
      cell(gy);
      const rt = tr.createEl('td', { cls: 'is-num' });
      if (gy && gy.ret != null) {
        rt.createSpan({ cls: 'fd-term ' + (gy.ret >= 0 ? 'fd-good' : 'fd-bad'), text: retLabel(gy, f) });
        hover(rt, () => ({ key: `r:${a.id}`, title: 'Estimated return', wide: true, body: [`${gy.months}-month return after taking out this account’s estimated contributions (${money(num(a.contribution))}/yr).`],
          calcLabel: 'Modified Dietz', calc: `${money(gy.growth)} ÷ (${money(gy.start)} + ½ × ${money(gy.moneyIn)}) = ${f.pct(gy.ret, 1)}` }));
      } else { rt.setText('—'); rt.addClass('fd-muted'); }
    } });
  }

  /* ----------------------------------------------------------- spending */
  renderSpending(body) {
    const d = this.data, f = this.fmt;
    const bar = body.createDiv({ cls: 'fd-toolbar' });
    const mnav = bar.createDiv({ cls: 'fd-month-nav' });
    this.iconButton(mnav, 'chevron-left', 'Previous month', () => { this.month = addMonths(this.month, -1); this.txLimit = 25; this.render(); });
    mnav.createSpan({ cls: 'fd-month-label', text: monthLabel(this.month, true) });
    this.iconButton(mnav, 'chevron-right', 'Next month', () => { this.month = addMonths(this.month, 1); this.txLimit = 25; this.render(); });
    if (this.month !== monthKey(new Date())) {
      const today = mnav.createEl('button', { cls: 'fd-btn is-small', text: 'This month' });
      today.addEventListener('click', () => { this.month = monthKey(new Date()); this.render(); });
    }
    const seg = bar.createDiv({ cls: 'fd-seg' });
    for (const [v, l] of [['all', 'All cards'], ['debit', 'Debit'], ['credit', 'Credit']]) {
      const b = seg.createEl('button', { text: l, cls: this.source === v ? 'is-active' : '' });
      b.addEventListener('click', () => { this.source = v; this.render(); });
    }

    const allTx = txFor(d, this.month);
    const tx = txFor(d, this.month, this.source);
    const isCurrent = this.month === monthKey(new Date());
    const todayDay = new Date().getDate();
    // For the current month, compare against the same point last month (month-to-date).
    const prevTx = txFor(d, addMonths(this.month, -1), this.source).filter((x) => !isCurrent || Number(x.date.slice(8, 10)) <= todayDay);
    const total = sum(tx, (x) => x.amount), prevTotal = sum(prevTx, (x) => x.amount);
    const debit = sum(allTx.filter((x) => x.source !== 'credit'), (x) => x.amount);
    const credit = sum(allTx.filter((x) => x.source === 'credit'), (x) => x.amount);
    const budgetTotal = sum(d.categories, (c) => c.budget);

    const kpis = body.createDiv({ cls: 'fd-kpis' });
    this.kpi(kpis, this.source === 'all' ? 'Total spent' : `Spent on ${this.source}`, f.money(total), { icon: 'wallet', invert: true,
      delta: prevTx.length ? total - prevTotal : null, deltaText: prevTotal ? `${f.pct(Math.abs(total - prevTotal) / prevTotal)} vs ${isCurrent ? 'same day last month' : 'last month'}` : '', sub: `${tx.length} transactions` });
    this.kpi(kpis, 'Debit cards', f.money(debit), { icon: 'landmark', sub: allTx.length ? `${f.pct(debit / (debit + credit || 1))} of spending` : '' });
    this.kpi(kpis, 'Credit cards', f.money(credit), { icon: 'credit-card', sub: allTx.length ? `${f.pct(credit / (debit + credit || 1))} of spending` : '' });
    const budgetLeft = budgetTotal - sum(allTx, (x) => x.amount);
    this.kpi(kpis, 'Budget left', budgetTotal ? f.money(budgetLeft) : '—', { icon: 'target',
      badge: budgetTotal ? (budgetLeft >= 0 ? { text: 'Under budget', tone: 'on-track' } : { text: 'Over budget', tone: 'behind' }) : null,
      sub: budgetTotal ? `of ${f.money(budgetTotal)} monthly budget` : 'Set category budgets in settings' });

    const grid = body.createDiv({ cls: 'fd-grid' });
    const cats = byCategory(tx);
    const cc = this.card(grid, 'Spending by category', { span: 2, sub: 'Bar = spent, tick = budget' });
    hbarChart(cc, cats.map((c) => ({ label: c.name, marker: budgetFor(d, c.name),
      segments: [{ name: 'Debit', value: c.debit, color: DEBIT_COLOR }, { name: 'Credit', value: c.credit, color: CREDIT_COLOR }],
      extra: [{ label: 'Transactions', value: `${c.count} · avg ${f.cents(c.total / (c.count || 1))}`, muted: true },
        ...(() => { const pv = byCategory(txFor(d, addMonths(this.month, -1), this.source)).find((x) => x.name === c.name); return pv ? [{ label: 'Last month', value: f.money(pv.total), muted: true }] : []; })()] })),
    { fmt: (v) => f.money(v), shareLabel: 'Share of spending', emptyText: 'No spending recorded for this month' });
    if (cats.length && this.source === 'all') legend(cc, [{ label: 'Debit', color: DEBIT_COLOR }, { label: 'Credit', color: CREDIT_COLOR }]);

    const dc = this.card(grid, 'Category share', { sub: monthLabel(this.month, true) });
    const topCats = cats.slice(0, 7).map((c, i) => ({ label: c.name, value: c.total, color: PALETTE[i], extra: this.catExtra(c) }));
    const rest = sum(cats.slice(7), (c) => c.total);
    if (rest) topCats.push({ label: 'Other categories', value: rest, color: PALETTE[9] });
    donutChart(dc, topCats, { fmt: (v) => f.money(v), sub: 'spent', center: f.compact(total) });

    const months = [];
    for (let i = 5; i >= 0; i--) months.push(addMonths(this.month, -i));
    const tc = this.card(grid, 'Six-month trend', { span: 3, sub: 'Debit vs credit card spending' });
    const series = this.source === 'all'
      ? [{ name: 'Debit', color: DEBIT_COLOR, values: months.map((m) => sum(txFor(d, m, 'debit'), (x) => x.amount)) },
        { name: 'Credit', color: CREDIT_COLOR, values: months.map((m) => sum(txFor(d, m, 'credit'), (x) => x.amount)) }]
      : [{ name: this.source === 'credit' ? 'Credit' : 'Debit', color: this.source === 'credit' ? CREDIT_COLOR : DEBIT_COLOR, values: months.map((m) => sum(txFor(d, m, this.source), (x) => x.amount)) }];
    columnChart(tc, months.map((m) => monthLabel(m)), series, { fmt: (v) => f.compact(v), tipFmt: (v) => f.money(v), highlight: 5, refLine: this.source === 'all' ? budgetTotal : 0, refLabel: 'Budget',
      tipTitle: (i) => monthLabel(months[i], true),
      tipExtra: (i) => {
        const mt = txFor(d, months[i], this.source);
        const top = byCategory(mt)[0];
        return [{ label: 'Transactions', value: String(mt.length), muted: true }, ...(top ? [{ label: 'Top category', value: `${top.name} · ${f.money(top.total)}`, muted: true }] : [])];
      } });

    // Savings goals
    const gc = this.card(grid, 'Savings goals', { span: 3, tools: (tl) => this.button(tl, 'plus', 'Add goal', () => this.plugin.editGoal()) });
    if (!d.goals.length) emptyState(gc, 'No savings goals yet — add one to track progress');
    const gg = gc.createDiv({ cls: 'fd-goals' });
    d.goals.forEach((g, i) => {
      const info = goalInfo(g);
      const tile = gg.createDiv({ cls: 'fd-goal' + (info.done ? ' is-done' : '') });
      const th = tile.createDiv({ cls: 'fd-goal-head' });
      th.createDiv({ cls: 'fd-goal-name', text: g.name });
      const tools = th.createDiv({ cls: 'fd-goal-tools' });
      this.iconButton(tools, 'plus-circle', 'Add funds', () => this.plugin.contributeGoal(g));
      this.iconButton(tools, 'pencil', 'Edit goal', () => this.plugin.editGoal(g));
      const amt = tile.createDiv({ cls: 'fd-goal-amount' });
      amt.createSpan({ cls: 'fd-goal-saved', text: f.money(info.saved) });
      amt.createSpan({ cls: 'fd-muted', text: ` of ${f.money(info.target)}` });
      progressBar(tile, info.progress, { color: info.done ? 'var(--color-green)' : PALETTE[i % PALETTE.length], tip: { key: `g${i}`, title: g.name, rows: [
        { label: 'Saved', value: f.money(info.saved), color: info.done ? 'var(--color-green)' : PALETTE[i % PALETTE.length], strong: true },
        { label: 'Target', value: f.money(info.target) },
        { label: 'Remaining', value: f.money(info.remaining) },
        { label: 'Progress', value: f.pct(info.progress, 1) },
        ...(g.deadline ? [{ label: 'Target date', value: dateLabel(g.deadline), muted: true }] : []),
        ...(!info.done && info.monthly != null && info.monthsLeft > 0 ? [{ label: 'Needed per month', value: f.money(info.monthly), muted: true }, { label: 'Months left', value: info.monthsLeft.toFixed(1), muted: true }] : []),
        ...(info.onPace != null ? [{ label: 'Pace', value: info.onPace ? 'On pace' : 'Behind pace', tone: info.onPace ? 'good' : 'bad' }] : []),
      ] } });
      const meta = tile.createDiv({ cls: 'fd-goal-meta' });
      meta.createSpan({ text: `${Math.round(info.progress * 100)}%` });
      if (info.done) meta.createSpan({ cls: 'fd-good', text: 'Goal reached 🎉' });
      else if (g.deadline) meta.createSpan({ text: info.monthsLeft > 0 ? `${f.money(info.monthly)}/mo until ${dateLabel(g.deadline)}` : `Deadline passed · ${f.money(info.remaining)} to go` });
      else meta.createSpan({ text: `${f.money(info.remaining)} to go` });
      if (info.onPace === false) tile.createDiv({ cls: 'fd-badge is-close', text: 'Behind pace' });
    });

    // Notes for the selected month
    const monthNotes = notesFor(d, this.month, f);
    const mn = this.card(grid, `Notes · ${monthLabel(this.month, true)}`, { span: 3, sub: monthNotes.length ? `${monthNotes.length} note${monthNotes.length === 1 ? '' : 's'}` : '',
      tools: (tl) => this.button(tl, 'plus', 'Note', () => this.plugin.editBalanceNote({ date: this.month === monthKey(new Date()) ? todayISO() : `${this.month}-01` })) });
    this.notesList(mn, monthNotes, { emptyText: 'No notes for this month.' });

    // Transactions
    const sorted = [...tx].sort((a, b) => b.date.localeCompare(a.date));
    const txc = this.card(grid, 'Transactions', { span: 3, sub: `${sorted.length} in ${monthLabel(this.month, true)}`, tools: (tl) => {
      this.button(tl, 'upload', 'Import', () => new ImportModal(this.app, this.plugin).open());
      this.button(tl, 'plus', 'Add', () => this.plugin.addTransaction({ date: this.month === monthKey(new Date()) ? todayISO() : `${this.month}-01` }));
    } });
    if (!sorted.length) emptyState(txc, 'No transactions for this month');
    else {
      const table = txc.createEl('table', { cls: 'fd-table' });
      const hr = table.createEl('thead').createEl('tr');
      ['Date', 'Description', 'Category', 'Card', 'Note', 'Amount', ''].forEach((h, i) => hr.createEl('th', { text: h, cls: i === 5 ? 'is-num' : i === 4 ? 'fd-col-note' : '' }));
      const tb = table.createEl('tbody');
      for (const t of sorted.slice(0, this.txLimit)) {
        const tr = tb.createEl('tr', { cls: 'is-clickable' });
        tr.addEventListener('click', () => this.plugin.addTransaction(t));
        tr.createEl('td', { cls: 'fd-muted fd-nowrap', text: dateLabel(t.date).replace(/, \d{4}$/, '') });
        tr.createEl('td', { text: t.desc || '—' });
        tr.createEl('td').createSpan({ cls: 'fd-chip', text: t.category });
        const cardTd = tr.createEl('td', { cls: 'fd-nowrap' });
        const pill = cardTd.createSpan({ cls: `fd-pill is-${t.source}`, text: t.source === 'credit' ? 'Credit' : 'Debit' });
        pill.title = t.card || '';
        if (t.card) cardTd.createSpan({ cls: 'fd-muted fd-card-name', text: ' ' + t.card });
        const noteTd = tr.createEl('td', { cls: 'fd-col-note' });
        if (t.note) {
          const nt = noteTd.createDiv({ cls: 'fd-tx-note', attr: { title: t.note } });
          setIcon(nt.createSpan({ cls: 'fd-tx-note-icon' }), 'sticky-note');
          nt.createSpan({ cls: 'fd-tx-note-text', text: t.note });
        }
        tr.createEl('td', { cls: 'is-num', text: f.cents(num(t.amount)) });
        this.iconButton(tr.createEl('td', { cls: 'fd-row-actions' }), 'trash-2', 'Delete', () => this.plugin.mutate((dd) => { dd.transactions = dd.transactions.filter((x) => x.id !== t.id); }));
      }
      if (sorted.length > this.txLimit) {
        const more = txc.createEl('button', { cls: 'fd-btn fd-more', text: `Show ${Math.min(50, sorted.length - this.txLimit)} more` });
        more.addEventListener('click', () => { this.txLimit += 50; this.render(); });
      }
    }
  }

  /* --------------------------------------------------------- retirement */
  renderRetirement(body) {
    const d = this.data, f = this.fmt, r = d.retirement;
    const plan = retirementPlan(d);
    this.retCtx = () => ({ plan, f, r });

    // Toolbar: what the numbers are, plus What-if and the (?) explainer
    const bar = body.createDiv({ cls: 'fd-toolbar fd-ret-toolbar' });
    const lead = bar.createDiv({ cls: 'fd-ret-lead' });
    lead.createSpan({ cls: 'fd-muted', text: 'Predictions in ' });
    termEl(lead, 'today’s dollars', 'todaysDollars', this.retCtx);
    lead.createSpan({ cls: 'fd-muted', text: ` · ${plan.accounts.length} account${plan.accounts.length === 1 ? '' : 's'} · ` });
    termEl(lead, `${f.pct(plan.real, 1)} real return`, 'returnInflation', this.retCtx);
    const ra = bar.createDiv({ cls: 'fd-ret-actions' });
    const nSc = ((d.whatIf && d.whatIf.scenarios) || []).length;
    this.button(ra, 'flask-conical', nSc ? `What if… (${nSc})` : 'What if…', () => this.plugin.openWhatIf(), 'mod-cta fd-whatif-btn');
    const info = this.iconButton(ra, 'circle-help', 'How your retirement projection is calculated', () => this.plugin.openRetirementInfo());
    info.addClass('fd-info-btn');
    info.setAttr('title', 'How is this calculated?');
    // Prediction disclaimer on its own row at the very top of the page.
    body.insertBefore(predictionNote(body, true), bar);

    const kpis = body.createDiv({ cls: 'fd-kpis' });
    this.kpi(kpis, 'Retirement savings', f.money(plan.balance), { icon: 'piggy-bank', sub: `${f.money(plan.contribution)}/yr contributions`, help: 'contributions' });
    this.kpi(kpis, 'Target nest egg', f.money(plan.target), { icon: 'target', sub: `${f.money(plan.need)}/yr at ${r.withdrawalRate}% withdrawal`, help: 'targetNestEgg' });
    this.kpi(kpis, 'Estimated retirement', plan.estDate ? `${plan.estDate.getFullYear()}` : '—', { icon: 'calendar-clock', help: 'estimatedRetirement',
      sub: plan.estAge != null ? `Age ${plan.estAge.toFixed(1)} · goal ${plan.targetAge}` : 'Target not reached by age 100' });
    this.kpi(kpis, 'Status', plan.target ? `${Math.round(plan.ratio * 100)}%` : '—', { icon: 'activity', help: 'status',
      badge: plan.target ? { text: STATUS_TEXT[plan.status], tone: plan.status } : null, sub: `of target projected at ${plan.targetAge}` });

    const grid = body.createDiv({ cls: 'fd-grid' });
    const goals = this.card(grid, 'Retirement goals', { tools: (tl) => this.button(tl, 'settings-2', 'Edit goals', () => this.plugin.editRetirementGoals()) });
    const facts = goals.createDiv({ cls: 'fd-facts' });
    this.fact(facts, 'Current age', plan.age.toFixed(1));
    this.fact(facts, 'Target retirement age', String(plan.targetAge), 'targetAge');
    this.fact(facts, 'Desired income (today’s $)', `${f.money(num(r.annualIncome))}/yr`, 'desiredIncome');
    this.fact(facts, 'Social Security / pension', `${f.money(num(r.otherIncome))}/yr`, 'otherIncome');
    this.fact(facts, 'Withdrawal rate', `${r.withdrawalRate}%`, 'withdrawalRate');
    this.fact(facts, 'Return / inflation', `${r.expectedReturn}% / ${r.inflation}% (real ${f.pct(plan.real, 1)})`, 'returnInflation');
    const call = goals.createDiv({ cls: `fd-callout is-${plan.status}` });
    call.createEl('strong', { text: STATUS_TEXT[plan.status] + '. ' });
    call.createSpan({ text: retirementSentence(plan, f) });
    const TR = taxR();
    if (plan.targetAge < TR.earlyAge && plan.accounts.some((a) => ['deferred', 'roth', 'hsa'].includes(taxCategoryOf(a)))) {
      goals.createDiv({ cls: 'fd-callout is-close fd-tax-warn', text: `Retiring before ${TR.earlyAge === 59.5 ? '59½' : TR.earlyAge}: withdrawals from tax-deferred accounts generally owe an extra ${TR.earlyPenalty}% tax unless an exception applies, and Roth earnings may be taxed. Plan to bridge those years with cash or taxable investments. (${taxYear()} U.S. rules)` });
    }

    const pc = this.card(grid, 'Projected growth', { span: 2, sub: 'Prediction in today’s dollars at current contributions', help: 'projected' });
    const pts = plan.points.filter((p) => p.age <= Math.max(plan.targetAge + 10, (plan.estAge || 0) + 3, plan.age + 10));
    const labels = pts.map((p) => String(Math.round(p.age)));
    const ti = pts.findIndex((p) => Math.round(p.age) >= plan.targetAge);
    const ei = plan.estAge != null ? pts.findIndex((p) => p.age >= plan.estAge) : -1;
    const vlines = [];
    if (ti >= 0) vlines.push({ index: ti, label: `Goal ${plan.targetAge}` });
    if (ei >= 0 && ei !== ti) vlines.push({ index: ei, label: `Reach target ${Math.ceil(plan.estAge)}` });
    lineChart(pc, { labels, height: 250, series: [{ name: 'Projected balance', color: PALETTE[2], values: pts.map((p) => p.balance), area: true, noDots: true }],
      hlines: plan.target ? [{ value: plan.target, label: `Target ${f.money(plan.target)}`, color: 'var(--text-muted)' }] : [],
      vlines, fmt: (v) => f.compact(v), tipFmt: (v) => f.money(v), zeroBased: true, maxXLabels: 10,
      tipTitle: (i) => `Age ${labels[i]} · ${new Date().getFullYear() + Math.round(pts[i].age - plan.age)}`,
      tipExtra: (i) => {
        const b = pts[i].balance, rows = [];
        if (plan.target) {
          rows.push({ label: 'Of target', value: f.pct(b / plan.target), tone: b >= plan.target ? 'good' : null });
          rows.push(b >= plan.target ? { label: 'Above target', value: f.money(b - plan.target), tone: 'good' } : { label: 'Short of target', value: f.money(plan.target - b), muted: true });
        }
        rows.push({ label: 'Income it supports', value: `${f.money(b * num(r.withdrawalRate) / 100 + num(r.otherIncome))}/yr`, muted: true });
        const yrs = Math.round(pts[i].age - plan.age);
        rows.push({ label: 'Contributed by then', value: f.money(plan.balance + plan.contribution * yrs), muted: true });
        return rows;
      }, emptyText: 'Add retirement accounts to see projections' });
    pc.createDiv({ cls: 'fd-axis-caption', text: 'Age' });

    const accts = plan.accounts.slice().sort((a, b) => num(b.balance) - num(a.balance));
    const colors = new Map(accts.map((a, i) => [a.id, PALETTE[i % PALETTE.length]]));
    const al = this.card(grid, 'Allocation by account', { sub: 'Current balances' });
    donutChart(al, accts.map((a) => ({ label: a.name, value: num(a.balance), color: colors.get(a.id), extra: [
      { label: 'Type', value: a.kind || '—', muted: true }, { label: 'Tax treatment', value: taxBucket(a.kind), muted: true },
      { label: 'Contribution', value: `${f.money(num(a.contribution))}/yr`, muted: true }] })), { fmt: (v) => f.money(v), sub: 'saved', center: f.compact(plan.balance), legendBelow: true, emptyText: 'Add retirement accounts' });

    const kinds = new Map();
    for (const a of accts) {
      const k = taxBucket(a.kind);
      kinds.set(k, (kinds.get(k) || 0) + num(a.balance));
    }
    const tax = this.card(grid, 'Tax treatment', { sub: 'Diversify for flexible withdrawals', help: 'taxTreatment' });
    const taxColors = { 'Tax-deferred': PALETTE[0], 'Tax-free (Roth)': PALETTE[2], 'Triple tax-advantaged (HSA)': PALETTE[4], Taxable: PALETTE[1], Pension: PALETTE[5], Other: PALETTE[9] };
    donutChart(tax, [...kinds].map(([k, v]) => ({ label: k, value: v, color: taxColors[k] || PALETTE[9],
      extra: [{ label: 'Accounts', value: accts.filter((a) => taxBucket(a.kind) === k).map((a) => a.name).join(', '), muted: true }] })), { fmt: (v) => f.money(v), sub: 'saved', center: f.compact(plan.balance), legendBelow: true });

    const ctb = this.card(grid, 'Annual contributions', { sub: `${f.money(plan.contribution)}/yr total`, help: 'contributions' });
    hbarChart(ctb, accts.filter((a) => num(a.contribution) > 0).map((a) => ({ label: a.name, segments: [{ value: num(a.contribution), color: colors.get(a.id) }],
      extra: [{ label: 'Per month', value: f.money(num(a.contribution) / 12), muted: true }, { label: 'Balance', value: f.money(num(a.balance)), muted: true },
        { label: 'Savings rate on balance', value: num(a.balance) ? f.pct(num(a.contribution) / num(a.balance), 1) : '—', muted: true }] })),
      { fmt: (v) => f.money(v), shareLabel: 'Share of contributions', emptyText: 'Set yearly contributions on each retirement account' });
    const checks = contributionChecks(d);
    if (checks.length) {
      const lim = ctb.createDiv({ cls: 'fd-limits' });
      const lh = lim.createDiv({ cls: 'fd-limits-head' });
      lh.createSpan({ text: `${taxYear()} IRS contribution limits` });
      lh.createSpan({ cls: 'fd-muted', text: TAX_STATE.refreshed ? ` · refreshed ${dateLabel(TAX_STATE.refreshed.slice(0, 10))}` : ` · gathered ${dateLabel(TAX_STATE.rules.gathered)}` });
      for (const c of checks) {
        const row = lim.createDiv({ cls: `fd-limit-row is-${c.status}` });
        const top = row.createDiv({ cls: 'fd-limit-top' });
        top.createSpan({ cls: 'fd-limit-label', text: c.label });
        top.createSpan({ cls: 'fd-limit-val', text: `${f.money(c.contribution)} / ${f.money(c.limit)}` });
        progressBar(row, c.limit ? c.contribution / c.limit : 0, { color: c.status === 'over' ? 'var(--color-red)' : c.status === 'warn' ? 'var(--color-orange)' : PALETTE[2] });
        row.createDiv({ cls: 'fd-limit-note', text: c.note });
      }
    }
    if (plan.requiredContribution > plan.contribution) {
      const nn = ctb.createDiv({ cls: 'fd-note' });
      termEl(nn, `Needed to retire at ${plan.targetAge}`, 'neededContribution', this.retCtx);
      nn.append(`: ${f.money(plan.requiredContribution)}/yr (+${f.money(plan.requiredContribution - plan.contribution)}).`);
    }

    const hist = invTimeline(d).filter((h) => h.retirement != null);
    const hc = this.card(grid, 'Retirement balance history', { span: 3, sub: 'Monthly account history', tools: (tl) => {
      if (this.embedded) return;
      if (invTabShown(d)) { const a = tl.createEl('a', { cls: 'fd-link', text: 'Growth details →', attr: { href: '#' } }); a.addEventListener('click', (e) => { e.preventDefault(); this.invView = 'group'; this.setTab('investments'); }); }
    } });
    lineChart(hc, { labels: hist.map((h) => monthLabel(h.date)), height: 200, series: [{ name: 'Retirement savings', color: PALETTE[2], values: hist.map((h) => h.retirement), area: true }],
      fmt: (v) => f.compact(v), tipFmt: (v) => f.money(v), tipTitle: (i) => monthLabel(hist[i].date, true),
      tipExtra: (i) => {
        const rows = [];
        if (i > 0) { const dv = hist[i].retirement - hist[i - 1].retirement; rows.push({ label: `Change vs ${monthLabel(hist[i - 1].date)}`, value: signed(dv, (v) => f.money(v)), tone: dv >= 0 ? 'good' : 'bad', muted: true }); }
        if (hist[i].detailed) for (const id in hist[i].byAcct) { const info = invAccountInfo(d, id); if (info && info.group === 'retirement') rows.push({ label: info.name, value: f.money(hist[i].byAcct[id]), muted: true }); }
        return rows;
      }, emptyText: 'History builds as you update balances' });

    this.renderRetirementNotes(grid);

    const tc = this.card(grid, 'Retirement accounts', { span: 3, tools: (tl) => this.button(tl, 'plus', 'Add account', () => this.plugin.editAccount({ group: 'retirement' }, true)) });
    this.accountsTable(tc, accts, { flat: true, cols: ['Account', 'Type', 'Balance', 'Contribution / yr', 'Share'], extra: (tr, a) => {
      tr.createEl('td', { cls: 'is-num', text: f.money(num(a.balance)) });
      tr.createEl('td', { cls: 'is-num', text: f.money(num(a.contribution)) });
      tr.createEl('td', { cls: 'is-num', text: plan.balance ? f.pct(num(a.balance) / plan.balance) : '—' });
    } });
    predictionNote(body, false).addClass('fd-prediction-footer');
  }

  /** Free-form personal notes for retirement planning. Autosaves; not used in any calculation. */
  renderRetirementNotes(grid) {
    const d = this.data;
    const rn = d.retirementNotes || (d.retirementNotes = { text: '', updated: null });
    let status;
    const card = this.card(grid, 'My retirement notes', { span: 3, sub: 'Private notes for your planning — questions for an advisor, ideas, reminders. Not used in any calculation.',
      tools: (tl) => { status = tl.createSpan({ cls: 'fd-notes-status fd-muted' }); } });
    const stamp = () => status.setText(rn.updated ? `Saved · last edited ${new Date(rn.updated).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}` : 'Saves automatically');
    stamp();
    const ta = card.createEl('textarea', { cls: 'fd-ret-notes', attr: { rows: 6, 'aria-label': 'My retirement notes',
      placeholder: 'e.g. Ask about Roth conversions · Check pension estimate in March · Max HSA next year · Revisit target age after the kids finish college' } });
    ta.value = rn.text || '';
    const grow = () => { ta.style.height = 'auto'; ta.style.height = `${Math.max(120, ta.scrollHeight + 4)}px`; };
    requestAnimationFrame(grow);
    let timer = null;
    const save = async () => {
      clearTimeout(timer); timer = null;
      if (ta.value === rn.text) return;
      rn.text = ta.value;
      rn.updated = new Date().toISOString();
      await this.plugin.save();
      stamp();
    };
    ta.addEventListener('input', () => { grow(); status.setText('Saving…'); clearTimeout(timer); timer = setTimeout(save, 700); });
    ta.addEventListener('blur', save);
  }
}

function taxBucket(kind) {
  const k = (kind || '').toLowerCase();
  if (k.includes('roth')) return 'Tax-free (Roth)';
  if (k.includes('hsa')) return 'Triple tax-advantaged (HSA)';
  if (k.includes('pension')) return 'Pension';
  if (/401|403|457|traditional|sep|simple|ira/.test(k)) return 'Tax-deferred';
  if (/brokerage|stock|bond|crypto|cd|tod|etf|fund|individual/.test(k)) return 'Taxable';
  return 'Other';
}
function statusColor(s) { return s === 'on-track' ? 'var(--color-green)' : s === 'close' ? 'var(--color-orange)' : 'var(--color-red)'; }
function retirementSentence(plan, f) {
  if (!plan.target) return 'Set a desired retirement income to calculate your target.';
  const at = `At ${plan.targetAge} you're projected to have ${f.money(plan.projectedAtTarget)} — ${Math.round(plan.ratio * 100)}% of your ${f.money(plan.target)} target, enough to support about ${f.money(plan.sustainableIncome)}/yr.`;
  if (plan.status === 'on-track') return `${at} Keep contributing ${f.money(plan.contribution)}/yr to stay on course.`;
  const gap = plan.requiredContribution - plan.contribution;
  return `${at} Raising contributions by ${f.money(gap)}/yr (to ${f.money(plan.requiredContribution)}) would close the gap${plan.estAge ? `, or plan on retiring around ${Math.ceil(plan.estAge)}` : ''}.`;
}

function insights(d, f, plan) {
  const out = [];
  const key = monthKey(new Date());
  const cats = byCategory(txFor(d, key));
  const dayFrac = new Date().getDate() / new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
  const over = cats.filter((c) => budgetFor(d, c.name) > 0 && c.total > budgetFor(d, c.name));
  for (const c of over.slice(0, 3)) out.push({ tone: 'bad', text: `${c.name} is over budget: ${f.money(c.total)} of ${f.money(budgetFor(d, c.name))} this month.` });
  const fixed = /housing|rent|mortgage|utilit|insurance|subscription/i;
  const pacing = cats.filter((c) => { if (fixed.test(c.name)) return false; const b = budgetFor(d, c.name); return b > 0 && c.total <= b && c.total / b > dayFrac + 0.25 && dayFrac < 0.9; });
  for (const c of pacing.slice(0, 2)) out.push({ tone: 'info', text: `${c.name} is running ahead of pace — ${f.pct(c.total / budgetFor(d, c.name))} of budget used with ${f.pct(1 - dayFrac)} of the month left.` });
  const h = d.history;
  if (h.length >= 2) {
    const ch = h[h.length - 1].net - h[h.length - 2].net;
    out.push({ tone: ch >= 0 ? 'good' : 'bad', text: `Net worth ${ch >= 0 ? 'grew' : 'fell'} ${f.money(Math.abs(ch))} since last month.` });
  }
  const behind = d.goals.filter((g) => goalInfo(g).onPace === false);
  for (const g of behind.slice(0, 2)) { const i = goalInfo(g); out.push({ tone: 'info', text: `“${g.name}” is behind pace — save ${f.money(i.monthly)}/mo to hit it by ${dateLabel(g.deadline)}.` }); }
  const done = d.goals.filter((g) => goalInfo(g).done);
  for (const g of done.slice(0, 2)) out.push({ tone: 'good', text: `You reached your “${g.name}” goal.` });
  if (plan.target) out.push({ tone: plan.status === 'on-track' ? 'good' : plan.status === 'close' ? 'info' : 'bad',
    text: plan.status === 'on-track' ? `Retirement is on track for age ${plan.targetAge}.` : `Retirement is ${Math.round(plan.ratio * 100)}% funded for age ${plan.targetAge}; add ${f.money(plan.requiredContribution - plan.contribution)}/yr to close the gap.` });
  const cr = [...d.credit].sort((a, b) => a.date.localeCompare(b.date));
  if (cr.length >= 2) {
    const delta = cr[cr.length - 1].score - cr[cr.length - 2].score;
    if (delta) out.push({ tone: delta > 0 ? 'good' : 'bad', text: `Credit score ${delta > 0 ? 'up' : 'down'} ${Math.abs(delta)} points to ${cr[cr.length - 1].score}.` });
  }
  const lastKey = addMonths(key, -1);
  const lastInc = monthlyIncome(d, lastKey).net;
  if (lastInc > 0) {
    const sp = sum(txFor(d, lastKey), (x) => x.amount);
    const rate = (lastInc - sp) / lastInc;
    out.push({ tone: rate >= 0.2 ? 'good' : rate >= 0 ? 'info' : 'bad', text: `You saved ${f.pct(rate)} of take-home pay in ${monthLabel(lastKey, true).split(' ')[0]} (${f.money(lastInc - sp)} of ${f.money(lastInc)}).` });
  }
  const cash = totals(d).byGroup.budget || 0;
  const avgSpend = sum([1, 2, 3].map((i) => sum(txFor(d, addMonths(key, -i)), (x) => x.amount))) / 3;
  if (avgSpend > 0) {
    const months = cash / avgSpend;
    out.push({ tone: months >= 6 ? 'good' : months >= 3 ? 'info' : 'bad', text: `Cash covers about ${months.toFixed(1)} months of recent spending (${f.money(avgSpend)}/mo average).` });
  }
  if (!out.length) out.push({ tone: 'info', text: 'Add accounts, transactions and goals to see insights here.' });
  // Problems first, then things to watch, then good news (order within each kept).
  const rank = { bad: 0, info: 1, good: 2 };
  return out.map((x, i) => [x, i]).sort((a, b) => (rank[a[0].tone] - rank[b[0].tone]) || a[1] - b[1]).map((p) => p[0]);
}

/* -------------------------------------------------------------- the view */

class FinanceView extends ItemView {
  constructor(leaf, plugin) { super(leaf); this.plugin = plugin; this.tab = 'overview'; }
  getViewType() { return VIEW_TYPE; }
  getDisplayText() { return 'Finance dashboard'; }
  getIcon() { return 'wallet'; }
  getState() { return { tab: this.tab }; }
  async setState(state, result) {
    if (state && state.tab && TABS.some((t) => t.id === state.tab)) { this.tab = state.tab; if (this.dash) { this.dash.tab = this.tab; this.dash.render(); } }
    return super.setState(state, result);
  }
  async onOpen() {
    const el = this.containerEl.children[1];
    this.dash = new Dashboard(this.plugin, el, { tab: this.tab, onTab: (t) => { this.tab = t; this.app.workspace.requestSaveLayout && this.app.workspace.requestSaveLayout(); } });
    this.plugin.dashboards.add(this.dash);
    this.dash.render();
    this._w = this.containerEl.clientWidth;
  }
  onResize() {
    clearTimeout(this._rz);
    this._rz = setTimeout(() => {
      const w = this.containerEl.clientWidth;
      if (this.dash && w && Math.abs(w - (this._w || 0)) > 24) { this._w = w; this.dash.render(); }
    }, 150);
  }
  async onClose() { this.plugin.dashboards.delete(this.dash); }
}

/* ----------------------------------------------------------- the plugin */

module.exports = class FinanceDashboardPlugin extends Plugin {
  async onload() {
    this.dashboards = new Set();
    this.listeners = new Set();
    await this.loadAll();
    this.registerView(VIEW_TYPE, (leaf) => new FinanceView(leaf, this));
    this.addRibbonIcon('wallet', 'Open finance dashboard', () => this.openDashboard());
    this.addCommand({ id: 'open-dashboard', name: 'Open dashboard', callback: () => this.openDashboard() });
    for (const t of TABS) this.addCommand({ id: `open-${t.id}`, name: `Open ${t.label} page`, callback: () => this.openDashboard(t.id) });
    this.addCommand({ id: 'add-transaction', name: 'Add transaction', callback: () => this.addTransaction() });
    this.addCommand({ id: 'update-income', name: 'Update income (raise, promotion or new job)', callback: () => this.editIncome() });
    this.addCommand({ id: 'income-history', name: 'Income history', callback: () => this.manageIncome() });
    this.addCommand({ id: 'add-income', name: 'Add additional income (side job, rental…)', callback: () => this.editExtraIncome() });
    this.addCommand({ id: 'add-note', name: 'Add note', callback: () => this.editBalanceNote() });
    this.addCommand({ id: 'update-balances', name: 'Update account balances', callback: () => this.updateBalances() });
    this.addCommand({ id: 'add-credit-score', name: 'Add credit score', callback: () => this.editCredit() });
    this.addCommand({ id: 'add-account', name: 'Add account', callback: () => this.editAccount() });
    this.addCommand({ id: 'manage-accounts', name: 'Manage accounts & assets', callback: () => this.manageAccounts() });
    this.addCommand({ id: 'pdf-report', name: 'Create PDF report', callback: () => this.createReport() });
    this.addCommand({ id: 'what-if', name: 'Retirement: What-if planner', callback: () => this.openWhatIf() });
    this.addCommand({ id: 'retirement-info', name: 'Retirement: How the projection is calculated', callback: () => this.openRetirementInfo() });
    this.addCommand({ id: 'networth-info', name: 'Net worth: How it’s calculated and how accounts are taxed', callback: () => this.openNetWorthInfo() });
    this.addCommand({ id: 'past-balances', name: 'Add past balances (on-budget, investment & retirement)', callback: () => this.editPastBalances() });
    this.addCommand({ id: 'investment-history', name: 'Investments: Monthly history', callback: () => this.manageInvHistory() });
    this.addCommand({ id: 'investments-info', name: 'Investments: How growth is calculated', callback: () => this.openInvestmentsInfo() });
    this.addCommand({ id: 'toggle-investments-tab', name: 'Show or hide the Investments tab', callback: () => this.setInvTabShown(!invTabShown(this.data)) });
    this.addCommand({ id: 'refresh-tax-rules', name: 'Refresh tax rules from IRS.gov', callback: () => this.refreshTaxRules() });
    this.addCommand({ id: 'add-goal', name: 'Add savings goal', callback: () => this.editGoal() });
    this.addCommand({ id: 'import-csv', name: 'Import transactions from CSV', callback: () => new ImportModal(this.app, this).open() });
    this.addSettingTab(new FinanceSettingTab(this.app, this));

    // Embed any page in a note:  ```finance-dashboard\ntab: retirement\n```
    this.registerMarkdownCodeBlockProcessor('finance-dashboard', (src, el) => {
      const m = src.match(/tab:\s*(\w+)/);
      const dash = new Dashboard(this, el.createDiv(), { tab: m ? m[1] : 'overview', embedded: true });
      this.dashboards.add(dash);
      dash.render();
      // Re-render once attached so charts can measure their real width.
      requestAnimationFrame(() => { if (dash.el.isConnected) dash.render(); });
    });

    // Clickable link that opens the dashboard in a new tab.
    // Block form:   ```finance-link\nlabel: My money\nsize: large\nalign: center\n```
    // Inline form:  `finance-link: label=My money; size=small`  — anywhere in a sentence, list, callout or table.
    this.linkEmbeds = new Set();
    this.registerMarkdownCodeBlockProcessor('finance-link', (src, el) => {
      this.mountLink(el.createDiv(), parseOptions(src), false);
    });
    this.registerMarkdownPostProcessor((el) => {
      el.querySelectorAll('code').forEach((code) => {
        if (code.parentElement && code.parentElement.tagName === 'PRE') return;
        const txt = code.textContent.trim();
        if (!INLINE_RE_ONE.test(txt)) return;
        const holder = document.createElement('span');
        holder.className = 'fd-link-inline-holder';
        code.replaceWith(holder);
        this.mountLink(holder, parseInline(txt), true);
      });
    });
    // Live Preview support is optional: if it can't load, inline links still render in Reading view.
    try { const ext = buildLivePreviewLinks(this); if (ext) this.registerEditorExtension(ext); }
    catch (e) { console.warn('Finance Dashboard: inline links in Live Preview unavailable', e); }
    // Also works as a plain Markdown link: [Finances](obsidian://finance-dashboard?tab=spending)
    this.registerObsidianProtocolHandler('finance-dashboard', (params) => this.openDashboard(params.tab, { fromLink: true }));
    this.addCommand({ id: 'insert-link', name: 'Insert dashboard link in this note', editorCallback: (editor) => {
      editor.replaceSelection(LINK_SNIPPET());
    } });
    this.addCommand({ id: 'insert-inline-link', name: 'Insert inline dashboard link (inside a sentence)', editorCallback: (editor) => {
      editor.replaceSelection(INLINE_SNIPPET());
    } });
  }

  onunload() { Tip.destroy(); }

  async loadAll() {
    const saved = (await this.loadData()) || {};
    const base = defaultData();
    this.data = Object.assign(base, saved);
    this.data.settings = Object.assign(defaultData().settings, saved.settings || {});
    this.data.settings.link = Object.assign(defaultData().settings.link, (saved.settings && saved.settings.link) || {});
    this.data.settings.invest = Object.assign(defaultData().settings.invest, (saved.settings && saved.settings.invest) || {});
    this.data.settings.report = Object.assign(defaultData().settings.report, (saved.settings && saved.settings.report) || {});
    if (!this.data.invHistory || typeof this.data.invHistory !== 'object' || Array.isArray(this.data.invHistory)) this.data.invHistory = {};
    if (!this.data.invMeta || typeof this.data.invMeta !== 'object') this.data.invMeta = {};
    if (!this.data.cashHistory || typeof this.data.cashHistory !== 'object' || Array.isArray(this.data.cashHistory)) this.data.cashHistory = {};
    // Start per-account history from this month for vaults upgraded from older versions.
    const nowKey = monthKey(new Date()), invAccts = this.data.accounts.filter(isInvAccount);
    if (invAccts.length && !this.data.invHistory[nowKey]) {
      const m = {};
      for (const a of invAccts) { m[a.id] = Math.round(num(a.balance) * 100) / 100; this.data.invMeta[a.id] = { name: a.name, group: a.group, kind: a.kind || '' }; }
      this.data.invHistory[nowKey] = m;
    }
    this.data.retirement = Object.assign(defaultData().retirement, saved.retirement || {});
    if (!Array.isArray(this.data.incomeHistory)) this.data.incomeHistory = [];
    if (!Array.isArray(this.data.extraIncome)) this.data.extraIncome = [];
    if (!Array.isArray(this.data.balanceNotes)) this.data.balanceNotes = [];
    if (!this.data.whatIf || !Array.isArray(this.data.whatIf.scenarios)) this.data.whatIf = { scenarios: [], selected: 'base' };
    if (!this.data.retirementNotes || typeof this.data.retirementNotes !== 'object') this.data.retirementNotes = { text: '', updated: null };
    applyTaxRules(this.data);
    if (!Array.isArray(this.data.categories) || !this.data.categories.length) this.data.categories = defaultData().categories;
  }

  async save() { await this.saveData(this.data); }

  /** Apply a change, refresh the monthly snapshot, persist, and re-render every open dashboard. */
  async mutate(fn) {
    await fn(this.data);
    upsertSnapshot(this.data);
    await this.save();
    this.refresh();
  }
  refresh() {
    for (const fn of [...this.listeners]) { try { fn(); } catch (e) { console.error(e); } }
    for (const l of [...(this.linkEmbeds || [])]) {
      if (!l.el.isConnected) { this.linkEmbeds.delete(l); continue; }
      this.renderLink(l.el, l.opts, l.inline);
    }
    for (const d of [...this.dashboards]) {
      if (!d.el.isConnected) { this.dashboards.delete(d); continue; }
      d.render();
    }
  }

  async openDashboard(tab, opts = {}) {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(VIEW_TYPE)[0];
    // Links open a new tab; if the dashboard is already open they switch to it (unless "Always open a new tab" is set).
    if (opts.fromLink && this.data.settings.link.reuseTab === false) leaf = null;
    if (!leaf) {
      leaf = workspace.getLeaf('tab');
      await leaf.setViewState({ type: VIEW_TYPE, active: true, state: tab ? { tab } : {} });
    } else if (tab) {
      await leaf.setViewState({ type: VIEW_TYPE, active: true, state: { tab } });
    }
    workspace.revealLeaf(leaf);
  }

  /** Turn a vault path, [[wikilink]] or URL into something an <img> can load. */
  resolveImage(src) {
    if (!src) return null;
    src = String(src).trim();
    if (/^(https?:|data:|app:|capacitor:)/i.test(src)) return src;
    const clean = src.replace(/^!?\[\[/, '').replace(/\]\]$/, '').split('|')[0].trim();
    const file = this.app.vault.getAbstractFileByPath(normalizePath(clean))
      || (this.app.metadataCache.getFirstLinkpathDest && this.app.metadataCache.getFirstLinkpathDest(clean, ''));
    return file && file.extension ? this.app.vault.getResourcePath(file) : null;
  }

  /** Render a link into a holder element and keep it updated when link settings change. */
  mountLink(holder, opts, inline) {
    this.linkEmbeds.add({ el: holder, opts, inline });
    this.renderLink(holder, opts, inline);
  }

  /**
   * Render a dashboard link. Options (block: one per line; inline: key=value separated by ; or |), all optional:
   * label, tab (overview|networth|investments|spending|retirement), icon (Lucide name), image (vault path, [[wikilink]] or URL),
   * style (card|button|icon), size (tiny|small|medium|large|xl|xxl, a multiplier like 1.5, a percent like 150%, or px like 22px),
   * subtitle, and for blocks: align (left|center|right), float (left|right), width (auto|full).
   */
  renderLink(el, o, inline) {
    o = o || {};
    const L = this.data.settings.link;
    const label = o.label || o.title || L.label || 'Finance dashboard';
    const tab = TABS.some((t) => t.id === o.tab) ? o.tab : 'overview';
    const tabLabel = TABS.find((t) => t.id === tab).label;
    const styles = ['card', 'button', 'icon'];
    // Inline links default to the compact button so they sit naturally in a line of text.
    const style = styles.includes(o.style) ? o.style : inline ? 'button' : (styles.includes(L.style) ? L.style : 'card');
    const imgSrc = o.image != null ? o.image : (o.icon ? '' : L.image);
    const iconName = o.icon || L.icon || 'wallet';
    const size = linkSize(o.size != null ? o.size : inline ? 'medium' : L.size);

    el.empty();
    // Block placement: alignment, floating with text wrap, or full width.
    if (!inline) {
      el.className = 'fd-link-block';
      const align = ['left', 'center', 'right'].includes(o.align) ? o.align : 'left';
      el.addClass(`is-align-${align}`);
      if (o.float === 'left' || o.float === 'right') el.addClass(`is-float-${o.float}`);
    }
    const a = el.createEl(inline ? 'span' : 'div', { cls: `fd-link-embed is-${style}` + (inline ? ' is-inline' : '') + (!inline && o.width === 'full' && style !== 'icon' ? ' is-full' : ''),
      attr: { role: 'link', tabindex: '0', 'aria-label': `Open ${label} (${tabLabel}) in a new tab` } });
    if (size.px) a.style.fontSize = size.px; else a.style.setProperty('--fd-link-scale', String(size.scale));
    const media = a.createEl('span', { cls: 'fd-link-media' });
    const drawIcon = () => { media.empty(); media.addClass('is-icon'); setIcon(media, iconName); if (!media.querySelector('svg')) setIcon(media, 'wallet'); };
    const url = this.resolveImage(imgSrc);
    if (url) {
      media.removeClass('is-icon');
      const img = media.createEl('img', { attr: { src: url, alt: '' } });
      img.addEventListener('error', drawIcon);   // broken picture → fall back to the icon
    } else drawIcon();
    if (style !== 'icon') {
      const tx = a.createEl('span', { cls: 'fd-link-text' });
      tx.createEl('span', { cls: 'fd-link-title', text: label });
      if (style === 'card') tx.createEl('span', { cls: 'fd-link-sub', text: o.subtitle || (tab === 'overview' ? 'Open dashboard' : `Open ${tabLabel}`) });
      setIcon(a.createSpan({ cls: 'fd-link-arrow' }), 'external-link');
    } else a.setAttr('title', label);
    const go = (e) => { e.preventDefault(); e.stopPropagation(); this.openDashboard(tab, { fromLink: true }); };
    a.addEventListener('click', go);
    // Keep the editor from moving the cursor into the link's source when it's clicked.
    a.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); });
    a.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') go(e); });
  }

  categoryNames() { return this.data.categories.map((c) => c.name); }
  cardNames() {
    const names = new Set(this.data.transactions.map((t) => t.card).filter(Boolean));
    this.data.accounts.filter((a) => /credit card|checking/i.test(a.kind || '')).forEach((a) => names.add(a.name));
    return [...names];
  }

  addTransaction(t) {
    const editing = t && t.id;
    new FormModal(this.app, {
      title: editing ? 'Edit transaction' : 'Add transaction',
      values: Object.assign({ date: todayISO(), source: 'credit', category: 'Groceries' }, t || {}),
      fields: [
        { key: 'date', label: 'Date', type: 'date', required: true, half: true },
        { key: 'amount', label: 'Amount', type: 'number', required: true, placeholder: '0.00', half: true },
        { key: 'desc', label: 'Description', placeholder: 'Where did the money go?', suggestions: [...new Set(this.data.transactions.map((x) => x.desc).filter(Boolean))].slice(0, 200) },
        { key: 'category', label: 'Category', type: 'select', options: this.categoryNames(), half: true },
        { key: 'source', label: 'Paid with', type: 'select', options: [{ value: 'credit', label: 'Credit card' }, { value: 'debit', label: 'Debit card' }], half: true },
        { key: 'card', label: 'Card name (optional)', suggestions: this.cardNames() },
        { key: 'note', label: 'Note (optional)', type: 'textarea', placeholder: 'Why, who, what for… shows up in this month’s notes.' },
      ],
      submitText: editing ? 'Save' : 'Add',
      onDelete: editing ? () => this.mutate((d) => { d.transactions = d.transactions.filter((x) => x.id !== t.id); }) : null,
      onSubmit: (v) => this.mutate((d) => {
        v.amount = Math.abs(v.amount);
        if (editing) Object.assign(d.transactions.find((x) => x.id === t.id), v);
        else d.transactions.push(Object.assign({ id: uid() }, v));
      }),
    }).open();
  }

  editAccount(a, presetOnly) {
    const editing = a && a.id && !presetOnly;
    new FormModal(this.app, {
      title: editing ? `Edit ${a.name}` : 'Add account',
      values: Object.assign({ group: 'budget' }, a || {}, editing ? { balance: Math.abs(num(a.balance)) } : {}),
      fields: [
        { key: 'name', label: 'Account name', required: true, placeholder: 'e.g. Joint checking' },
        { key: 'group', label: 'Group', type: 'select', options: Object.entries(ACCOUNT_GROUPS).map(([value, label]) => ({ value, label })), half: true, help: 'accountGroups',
          descFor: (v) => (GLOSSARY[`grp_${v.group}`] ? GLOSSARY[`grp_${v.group}`].body[0] : '') },
        // Options refresh automatically whenever Group changes; the summary below follows the selected type.
        { key: 'kind', label: 'Account type', type: 'select', half: true, optionsFor: (v) => KINDS_BY_GROUP[v.group] || KINDS_BY_GROUP.budget,
          descFor: (v) => kindSummary(v.kind) },
        { key: 'kindOther', label: 'Describe the type', placeholder: 'e.g. Treasury bills', showIf: (v) => v.kind === 'Other' },
        { key: 'balance', label: 'Current balance', type: 'number', required: true,
          labelFor: (v) => (v.group === 'debt' ? 'Amount owed' : v.group === 'property' ? 'Estimated value' : 'Current balance'),
          descFor: (v) => (v.group === 'debt' ? 'Enter what you owe as a positive number.' : '') },
        { key: 'contribution', label: 'Yearly contribution', type: 'number', hiddenValue: 0,
          showIf: (v) => v.group === 'retirement' || v.group === 'investment',
          descFor: (v) => (v.group === 'retirement' ? 'Include employer match. Used for retirement projections.' : 'Only used if you count taxable investments toward retirement.') },
      ],
      onDelete: editing ? () => this.deleteAccount(a) : null,
      onSubmit: (v) => this.mutate((d) => {
        v.balance = Math.abs(v.balance);
        if (v.kind === 'Other' && v.kindOther) v.kind = v.kindOther;
        delete v.kindOther;
        v.contribution = num(v.contribution);
        if (editing) Object.assign(d.accounts.find((x) => x.id === a.id), v);
        else d.accounts.push(Object.assign({ id: uid() }, v));
      }),
    }).open();
  }

  manageAccounts() { new AccountsModal(this.app, this).open(); }

  /** Ask what to include, then save the finance report PDF to the "Finance Dashboard" folder. */
  createReport() { new ReportModal(this.app, this).open(); }

  openWhatIf(opts) { new WhatIfModal(this.app, this, opts).open(); }
  openNetWorthInfo() { new NetWorthInfoModal(this.app, this).open(); }
  /**
   * Past balances for one month: on-budget, investment and retirement accounts in one form (opened from the
   * gear menu). Balances are kept per account; the month's net-worth snapshot is adjusted by the difference,
   * or created when the month has none, so the Net Worth trend, Investments and Retirement charts all include them.
   */
  editPastBalances(month) {
    const d = this.data;
    const now = monthKey(new Date());
    const f = new Fmt(d.settings);
    const GROUPS = ['budget', 'investment', 'retirement'];
    const accts = d.accounts.filter((a) => GROUPS.includes(a.group));
    if (!accts.length) { new Notice('Add a checking, savings, investment or retirement account first.'); return this.editAccount(); }
    const start = month && month < now ? month : addMonths(now, -1);
    const valid = (m) => /^\d{4}-\d{2}$/.test(m || '') && m < now;
    const snapOf = (m) => d.history.find((h) => h.date === m);
    const store = (g) => (g === 'budget' ? 'cashHistory' : 'invHistory');
    const t = totals(d);
    const closest = (keys, m) => keys.filter((k) => k !== m).sort((a, b) => Math.abs(monthGap(a, m)) - Math.abs(monthGap(b, m)) || a.localeCompare(b))[0] || null;
    const nearSnap = (m) => { const k = closest(d.history.map((h) => h.date), m); return k ? snapOf(k) : null; };
    const cashKnown = (m) => !!(d.cashHistory || {})[m] || (snapOf(m) && snapOf(m).cash != null);
    const valuesFor = (m) => {
      const o = {};
      for (const a of accts) { const row = (d[store(a.group)] || {})[m] || {}; o[a.id] = row[a.id] != null ? row[a.id] : ''; }
      const ns = nearSnap(m);
      o.__debts = Math.round(ns ? num(ns.debts) : t.debts);
      o.__prop = Math.round(t.byGroup.property || 0);
      return o;
    };
    const statusFor = (m) => {
      if (!/^\d{4}-\d{2}$/.test(m || '')) return 'Pick a month.';
      if (m >= now) return 'This month comes from your current balances — use “Update balances” instead.';
      const saved = (d.cashHistory || {})[m] || (d.invHistory || {})[m];
      const s = snapOf(m);
      return `${saved ? 'Editing saved balances for this month.' : 'No balances saved for this month yet.'} ${s ? `Net-worth snapshot: ${f.money(s.net)}.` : 'No net-worth snapshot for this month yet.'}`;
    };
    const hasSnap = (v) => valid(v.date) && !!snapOf(v.date);
    const noSnap = (v) => valid(v.date) && !snapOf(v.date);
    const fields = [{ key: 'date', label: 'Month', type: 'month', required: true, descFor: (v) => statusFor(v.date) }];
    for (const g of GROUPS) {
      const list = accts.filter((a) => a.group === g);
      if (!list.length) continue;
      fields.push({ type: 'heading', label: ACCOUNT_GROUPS[g] });
      for (const a of list) fields.push({ key: a.id, label: a.name + (a.kind && !a.name.toLowerCase().includes(a.kind.toLowerCase()) ? ` (${a.kind})` : ''), type: 'number', optional: true, half: true, placeholder: 'Blank = didn’t have it' });
    }
    fields.push({ type: 'heading', label: 'Net-worth trend' });
    fields.push({ key: '__adjust', label: 'Update this month’s net-worth snapshot', type: 'checkbox', default: true, showIf: hasSnap,
      descFor: (v) => { const s = snapOf(v.date); return s ? `Adds the difference to its assets and net worth (now ${f.money(s.net)}), so the trend includes these balances.` : ''; } });
    fields.push({ key: '__apply', label: 'Its total was saved without a cash breakdown', type: 'select', showIf: (v) => hasSnap(v) && v.__adjust && !cashKnown(v.date) && accts.some((a) => a.group === 'budget' && v[a.id] !== ''),
      options: [{ value: 'keep', label: 'It already includes this cash — keep the total' }, { value: 'add', label: 'It doesn’t include this cash — add it' }] });
    fields.push({ key: '__create', label: 'Add this month to the net-worth trend', type: 'checkbox', default: true, showIf: noSnap,
      desc: 'Creates a snapshot from the balances above plus the debts and property below.' });
    fields.push({ key: '__debts', label: 'Total debts', type: 'number', half: true, showIf: (v) => noSnap(v) && v.__create,
      descFor: (v) => { const n = valid(v.date) && nearSnap(v.date); return n ? `From ${monthLabel(n.date, true)}’s snapshot — change it if it was different.` : 'Today’s total — change it if it was different.'; } });
    fields.push({ key: '__prop', label: 'Property & other assets', type: 'number', half: true, showIf: (v) => noSnap(v) && v.__create, desc: 'Today’s value (home, car…) — change it if it was different.' });
    const existing = month && ((d.cashHistory || {})[month] || (d.invHistory || {})[month]);
    const modal = new FormModal(this.app, {
      title: 'Past balances',
      intro: 'Enter each account’s balance at the end of a past month, e.g. from old statements. Leave an account blank if you didn’t have it yet. Changing the month loads what’s already saved.',
      fields, values: Object.assign({ date: start, __adjust: true, __create: true, __apply: 'keep' }, valuesFor(start)),
      helpCtx: () => ({ nw: nwStats(d), iv: invStats(d), f }),
      onChange: (key, v, set) => {
        if (key !== 'date') return;
        if (/^\d{4}-\d{2}$/.test(v.date)) { const o = valuesFor(v.date); for (const id in o) set(id, o[id]); }
        // Delete applies to the month the form opened with, so hide it once another month is picked.
        const del = modal.contentEl.querySelector('button.mod-warning');
        if (del) del.style.display = v.date === month ? '' : 'none';
      },
      submitText: 'Save month',
      onDelete: existing ? async () => {
        await this.mutate((dd) => { delete dd.cashHistory[month]; delete dd.invHistory[month]; });
        new Notice(`Removed the account balances for ${monthLabel(month, true)}. That month’s net worth is unchanged — edit it with the pencil on the Net worth trend.`);
      } : null,
      onSubmit: async (v) => {
        const m = v.date;
        if (!/^\d{4}-\d{2}$/.test(m)) throw new Error('Month must look like 2026-05.');
        if (m >= now) throw new Error('Pick a past month — this month comes from your current balances (Update balances).');
        const entered = accts.filter((a) => v[a.id] != null);
        let msg = '';
        await this.mutate((dd) => {
          for (const k of ['cashHistory', 'invHistory']) if (!dd[k] || typeof dd[k] !== 'object') dd[k] = {};
          for (const a of accts) dd.invMeta[a.id] = { name: a.name, group: a.group, kind: a.kind || '' };
          const groupOf = (id) => { const i = invAccountInfo(dd, id); return i ? i.group : null; };
          const total = (map, test) => { let s = 0; for (const id in map || {}) if (test(groupOf(id))) s += num(map[id]); return s; };
          const isCash = (g) => g === 'budget', isRet = (g) => g === 'retirement', isTax = (g) => g !== 'budget' && g !== 'retirement';
          const build = (k, gs) => {
            const prior = dd[k][m] ? { ...dd[k][m] } : null;
            const next = {};
            if (prior) for (const id in prior) if (!accts.some((a) => a.id === id)) next[id] = prior[id];
            for (const a of entered) if (gs.includes(a.group)) next[a.id] = Math.round(Math.abs(num(v[a.id])) * 100) / 100;
            return { prior, next, touched: !!prior || entered.some((a) => gs.includes(a.group)) };
          };
          const cash = build('cashHistory', ['budget']);
          const inv = build('invHistory', ['investment', 'retirement']);
          const s = dd.history.find((h) => h.date === m);
          if (s && v.__adjust) {
            let delta = 0;
            if (cash.touched) {
              const newCash = total(cash.next, isCash);
              const oldCash = cash.prior ? total(cash.prior, isCash) : s.cash != null ? num(s.cash) : v.__apply === 'add' ? 0 : newCash;
              delta += newCash - oldCash;
              s.cash = Math.round(newCash);
            }
            if (inv.touched) {
              const newRet = total(inv.next, isRet), newTax = total(inv.next, isTax);
              const oldRet = inv.prior ? total(inv.prior, isRet) : num(s.retirement);
              delta += (newRet - oldRet) + (inv.prior ? newTax - total(inv.prior, isTax) : 0);
              s.retirement = Math.round(newRet);
            }
            s.assets = Math.round(num(s.assets) + delta);
            s.net = Math.round(num(s.net) + delta);
            if (delta) msg = ` Net worth ${delta > 0 ? 'up' : 'down'} ${f.money(Math.abs(delta))}.`;
          } else if (!s && v.__create && entered.length) {
            const assets = Math.round(total(cash.next, isCash) + total(inv.next, (g) => !isCash(g)) + Math.abs(num(v.__prop)));
            const debts = Math.round(Math.abs(num(v.__debts)));
            dd.history.push({ date: m, assets, debts, net: assets - debts, retirement: inv.touched ? Math.round(total(inv.next, isRet)) : null, cash: cash.touched ? Math.round(total(cash.next, isCash)) : null });
            dd.history.sort((a, b) => a.date.localeCompare(b.date));
            msg = ` Added ${monthLabel(m, true)} to the net-worth trend (${f.money(assets - debts)}).`;
          }
          for (const [k, x] of [['cashHistory', cash], ['invHistory', inv]]) {
            if (Object.keys(x.next).length) dd[k][m] = x.next; else delete dd[k][m];
          }
        });
        new Notice((entered.length ? `Saved ${entered.length} balance${entered.length === 1 ? '' : 's'} for ${monthLabel(m, true)}.` : `Cleared ${monthLabel(m, true)}.`) + msg);
      },
    });
    modal.open();
  }
  editPastCash(month) { return this.editPastBalances(month); }

  openInvestmentsInfo() { new InvestmentsInfoModal(this.app, this).open(); }

  /** Show or hide the Investments tab (history keeps being saved either way). */
  async setInvTabShown(on) {
    this.data.settings.invest.showTab = !!on;
    await this.save();
    this.refresh();
  }

  /** List of months with investment & retirement history; click one to edit it. */
  manageInvHistory() {
    const plugin = this;
    new (class extends Modal {
      onOpen() {
        this.titleEl.setText('Investment & retirement history');
        this.modalEl.addClass('fd-modal');
        this.render = () => {
          const c = this.contentEl;
          c.empty();
          const d = plugin.data, f = new Fmt(d.settings), now = monthKey(new Date());
          c.createEl('p', { cls: 'fd-modal-intro', text: 'This month updates automatically from your current balances. Add or fix earlier months to fill in your growth charts.' });
          const b = c.createDiv({ cls: 'fd-row-buttons' });
          b.createEl('button', { cls: 'mod-cta', text: 'Add past month' }).addEventListener('click', () => { this.close(); plugin.editPastBalances(); });
          const tl = invTimeline(d);
          if (!tl.length) { emptyState(c, 'No history yet.'); return; }
          const t = c.createEl('table', { cls: 'fd-table' });
          const hr = t.createEl('thead').createEl('tr');
          ['Month', 'Taxable', 'Retirement', 'Total', 'Accounts'].forEach((h, i) => hr.createEl('th', { text: h, cls: i ? 'is-num' : '' }));
          const tb = t.createEl('tbody');
          for (const r of [...tl].reverse()) {
            const live = r.date === now;
            const tr = tb.createEl('tr', { cls: live ? '' : 'is-clickable' });
            const td = tr.createEl('td', { text: monthLabel(r.date, true) });
            if (live) td.createSpan({ cls: 'fd-badge is-neutral fd-inline-badge', text: 'live' });
            tr.createEl('td', { cls: 'is-num', text: r.taxable != null ? f.money(r.taxable) : '—' });
            tr.createEl('td', { cls: 'is-num', text: f.money(r.retirement) });
            tr.createEl('td', { cls: 'is-num', text: r.total != null ? f.money(r.total) : '—' });
            tr.createEl('td', { cls: 'is-num fd-muted', text: r.detailed ? String(Object.keys(r.byAcct).length) : 'Snapshot total only' });
            if (!live) tr.addEventListener('click', () => { this.close(); plugin.editPastBalances(r.date); });
          }
        };
        this.render();
      }
      onClose() { this.contentEl.empty(); }
    })(this.app).open();
  }


  /** Check IRS.gov for updated tax values, then show what changed and how it affects the dashboard. */
  async refreshTaxRules() {
    const n = new Notice('Checking IRS.gov for updated tax rules…', 0);
    try {
      const res = await refreshTaxRules();
      n.hide();
      new TaxRefreshModal(this.app, this, res).open();
      return res;
    } catch (e) {
      n.hide();
      new Notice(`Couldn’t refresh tax rules: ${e.message || e}`);
      return null;
    }
  }
  /** Save refreshed (or manually edited) tax rules and re-render everything that uses them. */
  async saveTaxRules(res) {
    const values = res.keepValues ? TAX_STATE.rules.values : res.values;
    const status = res.keepValues ? Object.fromEntries(Object.entries(res.status).map(([k, v]) => [k, v.status === 'updated' ? { status: 'kept', checked: v.checked } : v])) : res.status;
    this.data.taxRules = { year: res.keepValues ? taxYear() : res.year, gathered: TAX_STATE.rules.gathered, refreshed: res.refreshed || new Date().toISOString(),
      values, status, upcoming: res.upcoming || null };
    applyTaxRules(this.data);
    await this.save();
    this.refresh();
  }
  openRetirementInfo() { new RetirementInfoModal(this.app, this).open(); }

  /** Save PDF bytes to “Finance Dashboard/<name>.pdf” in the vault without overwriting an existing file. */
  async savePdf(name, bytes) {
    const vault = this.app.vault, folder = 'Finance Dashboard';
    if (!vault.getAbstractFileByPath(folder)) await vault.createFolder(folder);
    const clean = String(name || '').replace(/\.pdf$/i, '').replace(/[\\/:*?"<>|#^[\]]/g, '-').trim() || 'Retirement what-if';
    let path = normalizePath(`${folder}/${clean}.pdf`), i = 2;
    while (vault.getAbstractFileByPath(path)) path = normalizePath(`${folder}/${clean} (${i++}).pdf`);
    return vault.createBinary(path, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  }

  deleteAccount(a) {
    const f = new Fmt(this.data.settings);
    new ConfirmModal(this.app, `Delete “${a.name}”?`,
      `This removes the account (${a.kind || ACCOUNT_GROUPS[a.group]}, ${f.money(Math.abs(num(a.balance)))}) from your totals. Past monthly snapshots are kept; this month’s snapshot updates.`,
      () => this.mutate((d) => { d.accounts = d.accounts.filter((x) => x.id !== a.id); }).then(() => new Notice(`Deleted ${a.name}.`)), 'Delete').open();
  }

  openSettings() {
    // Obsidian doesn't expose this officially; fall back to a notice if it changes.
    try { this.app.setting.open(); this.app.setting.openTabById(this.manifest.id); }
    catch (e) { new Notice('Open Settings → Community plugins → Finance Dashboard.'); }
  }

  updateBalances() {
    const accts = this.data.accounts;
    if (!accts.length) { new Notice('Add an account first.'); return this.editAccount(); }
    const fields = [];
    for (const g of Object.keys(ACCOUNT_GROUPS)) {
      const list = accts.filter((a) => a.group === g);
      if (!list.length) continue;
      fields.push({ type: 'heading', label: ACCOUNT_GROUPS[g] });
      for (const a of list) fields.push({ key: a.id, label: a.name + (a.kind ? ` (${a.kind})` : ''), type: 'number', half: true });
    }
    const credit = [...(this.data.credit || [])].sort((a, b) => a.date.localeCompare(b.date));
    const lastScore = credit[credit.length - 1];
    fields.push({ type: 'heading', label: 'Credit score' });
    fields.push({ key: '__score', label: 'Today’s score (optional)', type: 'number', optional: true, half: true, placeholder: '300–850',
      desc: lastScore ? `Last: ${lastScore.score} on ${dateLabel(lastScore.date)}${lastScore.bureau ? ` (${lastScore.bureau})` : ''}.` : 'Adds a point to your credit score trend.' });
    fields.push({ key: '__bureau', label: 'Source', half: true, suggestions: ['Equifax', 'Experian', 'TransUnion', 'FICO', 'VantageScore'], placeholder: 'e.g. Experian' });
    fields.push({ type: 'heading', label: 'Note' });
    fields.push({ key: '__note', label: 'What changed this time? (optional)', type: 'textarea', placeholder: 'e.g. Bonus invested, paid off the car loan, market dip…',
      desc: `Saved with today’s date and shown in ${monthLabel(monthKey(new Date()), true)}’s notes and on the net-worth chart.` });
    const values = { __bureau: lastScore && lastScore.bureau ? lastScore.bureau : '' };
    accts.forEach((a) => { values[a.id] = Math.abs(num(a.balance)); });
    new FormModal(this.app, {
      title: 'Update balances',
      intro: `Saving records this month’s net-worth snapshot (${monthLabel(monthKey(new Date()), true)}). You can add today’s credit score too.`,
      fields, values,
      onSubmit: (v) => {
        if (v.__score != null && (v.__score < 300 || v.__score > 850)) throw new Error('Credit score should be between 300 and 850.');
        return this.mutate((d) => {
          for (const a of d.accounts) if (v[a.id] != null) a.balance = Math.abs(v[a.id]);
          if (v.__note) (d.balanceNotes = d.balanceNotes || []).push({ id: uid(), date: todayISO(), text: v.__note });
          if (v.__score != null) {
            // One score per day: today's entry is replaced if you update twice.
            const rec = { date: todayISO(), score: Math.round(v.__score), bureau: (v.__bureau || '').trim() };
            const same = (d.credit = d.credit || []).find((c) => c.date === rec.date && (c.bureau || '') === rec.bureau);
            if (same) Object.assign(same, rec); else d.credit.push(Object.assign({ id: uid() }, rec));
          }
        }).then(() => new Notice(['Balances', v.__score != null ? 'credit score' : null, v.__note ? 'note' : null].filter(Boolean).join(', ').replace(/, ([^,]*)$/, ' and $1') + ' saved.'));
      },
    }).open();
  }

  /**
   * Set or update income. Amounts are a guaranteed amount per month unless you switch "Amounts are" to
   * per year or per paycheck; everything is stored as monthly. A raise % fills in the new amounts from current pay.
   */
  editIncome(h) {
    const editing = h && h.id;
    const { cur } = incomeOn(this.data, todayISO());
    const base = editing ? h : cur;
    const round2 = (v) => Math.round(v * 100) / 100;
    const perFactor = (per, freq) => (per === 'year' ? 1 / 12 : per === 'paycheck' ? (PAY_FREQ[freq] || PAY_FREQ.biweekly).n / 12 : 1); // entered → monthly
    let lastPer = 'month', lastFreq = 'biweekly';
    const employers = [...new Set((this.data.incomeHistory || []).map((x) => x.employer).filter(Boolean))];
    const titles = [...new Set((this.data.incomeHistory || []).map((x) => x.title).filter(Boolean))];
    new FormModal(this.app, {
      title: editing ? 'Edit income change' : cur ? 'Update income' : 'Set up income',
      intro: 'Income is a guaranteed amount per month and stays in effect until your next change. Gross is before taxes and deductions; net is your take-home.',
      values: {
        date: editing ? h.date : todayISO(),
        reason: editing ? h.reason : cur ? 'Raise' : 'Starting income',
        employer: base ? base.employer : '', title: base ? base.title : '',
        per: 'month', frequency: 'biweekly',
        gross: base ? round2(num(base.gross)) : '', net: base ? round2(num(base.net)) : '',
        note: editing ? h.note : '',
      },
      fields: [
        { key: 'date', label: 'Effective date', type: 'date', required: true, half: true },
        { key: 'reason', label: 'What changed', type: 'select', options: CHANGE_REASONS, half: true },
        { key: 'employer', label: 'Employer', placeholder: 'e.g. Brightline Health', suggestions: employers, half: true },
        { key: 'title', label: 'Job title', placeholder: 'e.g. Senior designer', suggestions: titles, half: true },
        { key: 'raisePct', label: 'Raise or cut (%)', type: 'number', optional: true, placeholder: 'e.g. 4 or -5',
          showIf: (v) => !editing && !!cur && ['Raise', 'Promotion', 'Cost-of-living adjustment', 'Pay cut', 'Hours change'].includes(v.reason),
          desc: 'Fills in new gross and net from your current pay. Net is scaled by the same %, so adjust it if your actual take-home differs.' },
        { key: 'per', label: 'Amounts are', type: 'select', half: true,
          options: [{ value: 'month', label: 'Per month (default)' }, { value: 'year', label: 'Per year' }, { value: 'paycheck', label: 'Per paycheck' }] },
        { key: 'frequency', label: 'Paid', type: 'select', half: true, showIf: (v) => v.per === 'paycheck',
          options: Object.entries(PAY_FREQ).map(([value, o]) => ({ value, label: o.label })) },
        { key: 'gross', label: 'Gross per month', type: 'number', required: true, half: true,
          labelFor: (v) => `Gross per ${v.per === 'year' ? 'year' : v.per === 'paycheck' ? 'paycheck' : 'month'}` },
        { key: 'net', label: 'Net (take-home) per month', type: 'number', required: true, half: true,
          labelFor: (v) => `Net (take-home) per ${v.per === 'year' ? 'year' : v.per === 'paycheck' ? 'paycheck' : 'month'}` },
        { key: 'note', label: 'Note (optional)', type: 'textarea', placeholder: 'e.g. Annual review, new role, better 401(k) match…' },
      ],
      // Live helpers: raise % fills amounts; changing "Amounts are"/"Paid" converts what's typed.
      onChange: (key, v, set) => {
        if (key === 'raisePct' && cur) {
          const p = num(v.raisePct) / 100;
          if (String(v.raisePct).trim() === '') return;
          const k = 1 / perFactor(v.per, v.frequency);
          set('gross', round2(num(cur.gross) * (1 + p) * k));
          set('net', round2(num(cur.net) * (1 + p) * k));
        }
        if (key === 'per' || (key === 'frequency' && v.per === 'paycheck')) {
          const from = perFactor(lastPer, lastFreq), to = perFactor(v.per, v.frequency);
          for (const fld of ['gross', 'net']) if (String(v[fld]).trim() !== '') set(fld, round2(num(v[fld]) * from / to));
          lastPer = v.per; lastFreq = v.frequency;
        }
      },
      onDelete: editing ? () => this.mutate((d) => { d.incomeHistory = d.incomeHistory.filter((x) => x.id !== h.id); }) : null,
      submitText: editing ? 'Save' : cur ? 'Save change' : 'Save income',
      onSubmit: (v) => {
        const k = perFactor(v.per, v.frequency);
        const gross = round2(Math.abs(v.gross) * k), net = round2(Math.abs(v.net) * k);
        if (!gross) throw new Error('Enter your gross income.');
        if (net > gross) throw new Error('Net can’t be more than gross.');
        const rec = { date: v.date, reason: v.reason, employer: v.employer, title: v.title, gross, net, note: v.note };
        return this.mutate((d) => {
          d.incomeHistory = d.incomeHistory || [];
          if (editing) Object.assign(d.incomeHistory.find((x) => x.id === h.id), rec);
          else d.incomeHistory.push(Object.assign({ id: uid() }, rec));
        }).then(() => new Notice(editing ? 'Income change saved.' : 'Income updated.'));
      },
    }).open();
  }

  manageIncome() { new IncomeModal(this.app, this).open(); }

  /** Add or edit an additional income source (side job, rental, pension…), counted every month it's active. */
  editExtraIncome(x) {
    const editing = x && x.id;
    const round2 = (v) => Math.round(v * 100) / 100;
    const k = (per) => (per === 'year' ? 1 / 12 : 1);
    let lastPer = 'month';
    new FormModal(this.app, {
      title: editing ? 'Edit income source' : 'Add income',
      intro: 'Additional income on top of your job, such as a side job, rental income or a pension. It’s added to your monthly income from the start date until the end date (if any).',
      values: editing ? { ...x, per: 'month', gross: round2(num(x.gross)), net: round2(num(x.net)) } : { kind: 'Side job', per: 'month', start: todayISO() },
      fields: [
        { key: 'name', label: 'Name', required: true, placeholder: 'e.g. Weekend photography, Duplex rent', half: true },
        { key: 'kind', label: 'Type', type: 'select', options: EXTRA_KINDS, half: true },
        { key: 'per', label: 'Amounts are', type: 'select', options: [{ value: 'month', label: 'Per month (default)' }, { value: 'year', label: 'Per year' }] },
        { key: 'gross', label: 'Gross per month', type: 'number', required: true, half: true, labelFor: (v) => `Gross per ${v.per === 'year' ? 'year' : 'month'}` },
        { key: 'net', label: 'Net (after tax) per month', type: 'number', optional: true, half: true, labelFor: (v) => `Net (after tax) per ${v.per === 'year' ? 'year' : 'month'}`,
          desc: 'Leave blank if no tax is taken out — net then equals gross. Set aside for taxes yourself if needed.' },
        { key: 'start', label: 'Starts', type: 'date', required: true, half: true },
        { key: 'end', label: 'Ends (optional)', type: 'date', half: true, desc: 'Leave blank if it continues.' },
        { key: 'note', label: 'Note (optional)', type: 'textarea', placeholder: 'e.g. Lease renews in June' },
      ],
      onChange: (key, v, set) => {
        if (key !== 'per') return;
        for (const fld of ['gross', 'net']) if (String(v[fld]).trim() !== '') set(fld, round2(num(v[fld]) * k(lastPer) / k(v.per)));
        lastPer = v.per;
      },
      onDelete: editing ? () => this.mutate((d) => { d.extraIncome = (d.extraIncome || []).filter((y) => y.id !== x.id); }).then(() => new Notice('Income source deleted.')) : null,
      submitText: editing ? 'Save' : 'Add income',
      onSubmit: (v) => {
        const gross = round2(Math.abs(v.gross) * k(v.per));
        const net = v.net == null ? gross : round2(Math.abs(v.net) * k(v.per));
        if (!gross) throw new Error('Enter how much it pays.');
        if (net > gross) throw new Error('Net can’t be more than gross.');
        if (v.end && v.end < v.start) throw new Error('The end date is before the start date.');
        const rec = { name: v.name, kind: v.kind, gross, net, start: v.start, end: v.end || null, note: v.note || '' };
        return this.mutate((d) => {
          d.extraIncome = d.extraIncome || [];
          if (editing) Object.assign(d.extraIncome.find((y) => y.id === x.id), rec);
          else d.extraIncome.push(Object.assign({ id: uid() }, rec));
        }).then(() => new Notice(editing ? 'Income source saved.' : `${v.name} added to your income.`));
      },
    }).open();
  }

  editBalanceNote(n) {
    const editing = n && n.id;
    new FormModal(this.app, {
      title: editing ? 'Edit note' : 'Add note',
      intro: 'Notes appear in their month on the Overview, Spending and Net Worth pages, and on the net-worth chart.',
      values: Object.assign({ date: todayISO() }, n || {}),
      fields: [
        { key: 'date', label: 'Date', type: 'date', required: true },
        { key: 'text', label: 'Note', type: 'textarea', required: true, placeholder: 'What happened with your money?' },
      ],
      onDelete: editing ? () => this.mutate((d) => { d.balanceNotes = d.balanceNotes.filter((x) => x.id !== n.id); }) : null,
      onSubmit: (v) => this.mutate((d) => {
        d.balanceNotes = d.balanceNotes || [];
        if (editing) Object.assign(d.balanceNotes.find((x) => x.id === n.id), v);
        else d.balanceNotes.push(Object.assign({ id: uid() }, v));
      }),
    }).open();
  }

  editNoteItem(item) {
    if (item.kind === 'transaction') this.addTransaction(item.ref);
    else if (item.kind === 'income') this.editIncome(item.ref);
    else this.editBalanceNote(item.ref);
  }

  editCredit(c) {
    const editing = c && c.id;
    new FormModal(this.app, {
      title: editing ? 'Edit credit score' : 'Add credit score',
      values: Object.assign({ date: todayISO() }, c || {}),
      fields: [
        { key: 'date', label: 'Date', type: 'date', required: true, half: true },
        { key: 'score', label: 'Score', type: 'number', required: true, placeholder: '300–850', half: true },
        { key: 'bureau', label: 'Source (optional)', suggestions: ['Equifax', 'Experian', 'TransUnion', 'FICO', 'VantageScore'] },
      ],
      onDelete: editing ? () => this.mutate((d) => { d.credit = d.credit.filter((x) => x.id !== c.id); }) : null,
      onSubmit: (v) => {
        if (v.score < 300 || v.score > 850) throw new Error('Score should be between 300 and 850.');
        return this.mutate((d) => {
          v.score = Math.round(v.score);
          if (editing) Object.assign(d.credit.find((x) => x.id === c.id), v);
          else d.credit.push(Object.assign({ id: uid() }, v));
        });
      },
    }).open();
  }

  listCredit() {
    const plugin = this;
    new (class extends Modal {
      onOpen() {
        this.titleEl.setText('Credit scores');
        this.modalEl.addClass('fd-modal');
        const list = [...plugin.data.credit].sort((a, b) => b.date.localeCompare(a.date));
        const t = this.contentEl.createEl('table', { cls: 'fd-table' });
        for (const c of list) {
          const tr = t.createEl('tr', { cls: 'is-clickable' });
          tr.createEl('td', { text: dateLabel(c.date) });
          tr.createEl('td', { cls: 'is-num', text: String(c.score) });
          tr.createEl('td', { cls: 'fd-muted', text: c.bureau || '' });
          tr.addEventListener('click', () => { this.close(); plugin.editCredit(c); });
        }
      }
      onClose() { this.contentEl.empty(); }
    })(this.app).open();
  }

  editHistory() {
    const plugin = this;
    new (class extends Modal {
      onOpen() {
        this.titleEl.setText('Net-worth snapshots');
        this.modalEl.addClass('fd-modal');
        this.contentEl.createEl('p', { cls: 'fd-modal-intro', text: 'The current month updates automatically. Add past months to backfill your trend.' });
        const b = this.contentEl.createDiv({ cls: 'fd-row-buttons' });
        b.createEl('button', { cls: 'mod-cta', text: 'Add past month' }).addEventListener('click', () => { this.close(); plugin.editSnapshot(); });
        b.createEl('button', { text: 'Past balances' }).addEventListener('click', () => { this.close(); plugin.editPastBalances(); });
        const t = this.contentEl.createEl('table', { cls: 'fd-table' });
        const hr = t.createEl('thead').createEl('tr');
        ['Month', 'On-budget', 'Assets', 'Debts', 'Net worth'].forEach((h, i) => hr.createEl('th', { text: h, cls: i ? 'is-num' : '' }));
        const f = new Fmt(plugin.data.settings);
        for (const h of [...plugin.data.history].reverse()) {
          const tr = t.createEl('tr', { cls: 'is-clickable' });
          tr.createEl('td', { text: monthLabel(h.date, true) });
          const cv = (plugin.data.cashHistory || {})[h.date] ? sum(Object.values(plugin.data.cashHistory[h.date])) : h.cash;
          tr.createEl('td', { cls: 'is-num' + (cv == null ? ' fd-muted' : ''), text: cv == null ? '—' : f.money(cv) });
          tr.createEl('td', { cls: 'is-num', text: f.money(h.assets) });
          tr.createEl('td', { cls: 'is-num', text: f.money(h.debts) });
          tr.createEl('td', { cls: 'is-num', text: f.money(h.net) });
          tr.addEventListener('click', () => { this.close(); plugin.editSnapshot(h); });
        }
      }
      onClose() { this.contentEl.empty(); }
    })(this.app).open();
  }

  editSnapshot(h) {
    const editing = !!h;
    new FormModal(this.app, {
      title: editing ? `Snapshot · ${monthLabel(h.date, true)}` : 'Add past snapshot',
      values: h ? { ...h } : { date: addMonths(monthKey(new Date()), -1) },
      fields: [
        { key: 'date', label: 'Month', type: 'month', required: true },
        { key: 'assets', label: 'Total assets', type: 'number', required: true, half: true },
        { key: 'debts', label: 'Total debts', type: 'number', half: true },
        { key: 'retirement', label: 'Retirement savings (optional)', type: 'number', optional: true },
      ],
      onDelete: editing ? async () => { this.data.history = this.data.history.filter((x) => x !== h); await this.save(); this.refresh(); } : null,
      onSubmit: async (v) => {
        if (!/^\d{4}-\d{2}$/.test(v.date)) throw new Error('Month must look like 2026-05.');
        const entry = { date: v.date, assets: v.assets, debts: Math.abs(v.debts || 0), net: v.assets - Math.abs(v.debts || 0), retirement: v.retirement };
        if (h && h.cash != null && h.date === v.date) entry.cash = h.cash;
        this.data.history = this.data.history.filter((x) => x !== h && x.date !== v.date);
        this.data.history.push(entry);
        this.data.history.sort((a, b) => a.date.localeCompare(b.date));
        await this.save(); this.refresh();
      },
    }).open();
  }

  editGoal(g) {
    const editing = g && g.id;
    new FormModal(this.app, {
      title: editing ? `Edit ${g.name}` : 'Add savings goal',
      values: g || {},
      fields: [
        { key: 'name', label: 'Goal', required: true, placeholder: 'e.g. Emergency fund' },
        { key: 'target', label: 'Target amount', type: 'number', required: true, half: true },
        { key: 'saved', label: 'Saved so far', type: 'number', half: true },
        { key: 'deadline', label: 'Target date (optional)', type: 'date' },
      ],
      onDelete: editing ? () => this.mutate((d) => { d.goals = d.goals.filter((x) => x.id !== g.id); }) : null,
      onSubmit: (v) => this.mutate((d) => {
        if (editing) Object.assign(d.goals.find((x) => x.id === g.id), v);
        else d.goals.push(Object.assign({ id: uid(), created: todayISO() }, v));
      }),
    }).open();
  }

  contributeGoal(g) {
    new FormModal(this.app, {
      title: `Add to ${g.name}`,
      fields: [{ key: 'amount', label: 'Amount (use a negative number to withdraw)', type: 'number', required: true }],
      submitText: 'Add funds',
      onSubmit: (v) => this.mutate((d) => { const x = d.goals.find((y) => y.id === g.id); x.saved = Math.max(0, num(x.saved) + v.amount); }),
    }).open();
  }

  editRetirementGoals() {
    new FormModal(this.app, {
      title: 'Retirement goals',
      intro: 'Projections are predictions in today’s dollars: growth uses your expected return minus inflation. Hover the (?) icons for what each setting means.',
      values: this.data.retirement,
      helpCtx: () => ({ plan: retirementPlan(this.data), f: new Fmt(this.data.settings), r: this.data.retirement }),
      fields: [
        { key: 'birthDate', label: 'Date of birth', type: 'date', required: true, half: true },
        { key: 'targetAge', label: 'Target retirement age', type: 'number', required: true, half: true, help: 'targetAge' },
        { key: 'annualIncome', label: 'Desired yearly income in retirement', type: 'number', required: true, half: true, help: 'desiredIncome' },
        { key: 'otherIncome', label: 'Social Security / pension per year', type: 'number', half: true, help: 'otherIncome' },
        { key: 'withdrawalRate', label: 'Safe withdrawal rate (%)', type: 'number', half: true, help: 'withdrawalRate', desc: '4% is the common rule of thumb.' },
        { key: 'expectedReturn', label: 'Expected annual return (%)', type: 'number', half: true, help: 'expectedReturn' },
        { key: 'inflation', label: 'Inflation (%)', type: 'number', half: true, help: 'inflation' },
        { key: 'includeInvestments', label: 'Count taxable investment accounts toward retirement', type: 'checkbox', help: 'includeInvestments' },
      ],
      onSubmit: (v) => {
        if (v.targetAge < 30 || v.targetAge > 90) throw new Error('Target age should be between 30 and 90.');
        return this.mutate((d) => { Object.assign(d.retirement, v); });
      },
    }).open();
  }

  loadSample() {
    const go = () => this.mutate((d) => { Object.assign(d, sampleData(), { settings: d.settings }); }).then(() => new Notice('Sample data loaded.'));
    if (this.data.accounts.length || this.data.transactions.length) new ConfirmModal(this.app, 'Replace your data?', 'Loading sample data replaces all accounts, transactions, goals and history.', go, 'Replace').open();
    else go();
  }
};

/* ---------------------------------------------------------- link helpers */

function parseOptions(src) {
  const o = {};
  for (const line of String(src || '').split('\n')) {
    const m = line.match(/^\s*([a-zA-Z]+)\s*:\s*(.*?)\s*$/);
    if (m) o[m[1].toLowerCase()] = m[2].replace(/^["']|["']$/g, '');
  }
  return o;
}
const LINK_SIZES = { tiny: 0.7, xs: 0.7, small: 0.85, sm: 0.85, medium: 1, normal: 1, md: 1, large: 1.3, lg: 1.3, xl: 1.7, 'x-large': 1.7, xxl: 2.2, huge: 2.2 };
/** size: preset name, multiplier (1.5), percent (150%) or pixels (22px). Returns {scale} or {px}. */
function linkSize(v) {
  const s = String(v == null ? '' : v).trim().toLowerCase();
  if (!s) return { scale: 1 };
  if (LINK_SIZES[s]) return { scale: LINK_SIZES[s] };
  let m = s.match(/^(\d+(?:\.\d+)?)\s*px$/);
  if (m) return { px: `${clamp(Number(m[1]), 8, 96)}px` };
  m = s.match(/^(\d+(?:\.\d+)?)\s*%$/);
  if (m) return { scale: clamp(Number(m[1]) / 100, 0.5, 4) };
  m = s.match(/^(\d+(?:\.\d+)?)x?$/);
  if (m) return { scale: clamp(Number(m[1]), 0.5, 4) };
  return { scale: 1 };
}
const INLINE_RE_ONE = /^finance-link(?:\s*[:\s].*)?$/;
const INLINE_RE = /`(finance-link(?:[:\s][^`\n]*)?)`/g;
/** Inline options: `finance-link: label=My money; tab=spending; size=small` (separators ; or |, key=value or key: value). */
function parseInline(src) {
  const o = {};
  const body = String(src).trim().replace(/^finance-link\s*:?\s*/, '');
  for (const part of body.split(/[;|]/)) {
    const m = part.match(/^\s*([a-zA-Z]+)\s*[=:]\s*(.*?)\s*$/);
    if (m) o[m[1].toLowerCase()] = m[2].replace(/^["']|["']$/g, '');
    else if (part.trim() && !o.label) o.label = part.trim();   // bare text is the label
  }
  return o;
}
const INLINE_SNIPPET = () => '`finance-link: label=Finance dashboard`';

/**
 * Live Preview: show inline `finance-link …` code as the clickable link (raw text comes back when the cursor is on it).
 * Uses the CodeMirror modules Obsidian ships; if they aren't available, inline links still render in Reading view.
 */
function buildLivePreviewLinks(plugin) {
  let view, state, language;
  try { view = require('@codemirror/view'); state = require('@codemirror/state'); } catch (e) { return null; }
  try { language = require('@codemirror/language'); } catch (e) { language = null; }
  const { ViewPlugin, Decoration, WidgetType } = view || {};
  const { RangeSetBuilder } = state || {};
  if (!ViewPlugin || !Decoration || !WidgetType || !RangeSetBuilder) return null;
  class LinkWidget extends WidgetType {
    constructor(src) { super(); this.src = src; }
    eq(other) { return other.src === this.src; }
    toDOM() {
      const holder = document.createElement('span');
      holder.className = 'fd-link-inline-holder';
      plugin.mountLink(holder, parseInline(this.src), true);
      return holder;
    }
    ignoreEvent() { return true; }
  }
  const isLivePreview = (v) => {
    try { return obsidian.editorLivePreviewField ? v.state.field(obsidian.editorLivePreviewField) : true; } catch (e) { return true; }
  };
  const inCodeBlock = (st, pos) => {
    if (!language || !language.syntaxTree) return false;
    try { const n = language.syntaxTree(st).resolveInner(pos, 1); return /codeblock|code-block|hmd-codeblock/i.test(n.name); } catch (e) { return false; }
  };
  const build = (v) => {
    const b = new RangeSetBuilder();
    if (!isLivePreview(v)) return b.finish();
    const ranges = v.state.selection.ranges;
    for (const { from, to } of v.visibleRanges) {
      const text = v.state.doc.sliceString(from, to);
      INLINE_RE.lastIndex = 0;
      let m;
      while ((m = INLINE_RE.exec(text))) {
        const start = from + m.index, end = start + m[0].length;
        if (ranges.some((r) => r.from <= end && r.to >= start)) continue;   // editing it → show the source
        if (inCodeBlock(v.state, start)) continue;
        b.add(start, end, Decoration.replace({ widget: new LinkWidget(m[1]) }));
      }
    }
    return b.finish();
  };
  return ViewPlugin.fromClass(class {
    constructor(v) { this.decorations = build(v); }
    update(u) { this.decorations = build(u.view); }
  }, { decorations: (p) => p.decorations });
}

const LINK_SNIPPET = (tab) => '```finance-link\nlabel: Finance dashboard\n' + (tab && tab !== 'overview' ? `tab: ${tab}\n` : '') + '```\n';
const IMAGE_EXT = /^(png|jpe?g|gif|svg|webp|avif|bmp|ico)$/i;

class ImagePickModal extends FuzzySuggestModal {
  constructor(app, onPick) { super(app); this.onPick = onPick; this.setPlaceholder('Pick an image from your vault…'); }
  getItems() { return this.app.vault.getFiles().filter((f) => IMAGE_EXT.test(f.extension)); }
  getItemText(f) { return f.path; }
  onChooseItem(f) { this.onPick(f.path); }
}

/* ------------------------------------------------------------- settings */

class FinanceSettingTab extends PluginSettingTab {
  constructor(app, plugin) { super(app, plugin); this.plugin = plugin; }

  displayTaxSettings(containerEl) {
    const p = this.plugin, R = taxR();
    new Setting(containerEl).setName('Tax rules (U.S. federal)').setHeading();
    containerEl.createEl('p', { cls: 'setting-item-description', text: `Used for tax notes, estimated brackets and contribution-limit checks. Built-in values are for tax year ${DEFAULT_TAX_RULES.year}, gathered from IRS.gov on ${dateLabel(DEFAULT_TAX_RULES.gathered)}. Currently using: ${taxAsOf()}.` });
    new Setting(containerEl).setName('Refresh from IRS.gov').setDesc('Re-reads the IRS pages, shows what changed and how it affects your dashboard, and lets you apply or keep the current values.')
      .addButton((b) => b.setButtonText('Refresh tax rules').setCta().onClick(async () => { b.setDisabled(true); b.setButtonText('Checking…'); await p.refreshTaxRules(); b.setDisabled(false); b.setButtonText('Refresh tax rules'); }));
    new Setting(containerEl).setName('Filing status').setDesc('Used to estimate your tax bracket and capital-gain rate.')
      .addDropdown((dd) => dd.addOption('single', 'Single').addOption('joint', 'Married filing jointly').setValue(p.data.settings.filingStatus || 'single')
        .onChange(async (v) => { p.data.settings.filingStatus = v; TAX_STATE.filing = v; await p.save(); p.refresh(); }));
    const st = TAX_STATE.status || {};
    const label = { updated: 'updated', confirmed: 'confirmed', unconfirmed: 'not confirmed', manual: 'check manually', kept: 'kept', edited: 'edited by you' };
    for (const k of Object.keys(TAX_LABELS)) {
      if (Array.isArray(R[k])) continue;
      const s = st[k];
      new Setting(containerEl).setName(TAX_LABELS[k]).setDesc(s ? `${label[s.status] || s.status}${s.checked ? ` · ${dateLabel(s.checked)}` : ''}` : `built-in ${DEFAULT_TAX_RULES.year} value`)
        .addText((t) => { t.inputEl.type = 'number'; t.setValue(String(R[k])).onChange(async (v) => {
          const n = Number(v); if (!(n > 0)) return;
          const values = Object.assign({}, taxR(), { [k]: n });
          const status = Object.assign({}, TAX_STATE.status, { [k]: { status: 'edited', checked: todayISO() } });
          p.data.taxRules = { year: taxYear(), gathered: TAX_STATE.rules.gathered, refreshed: TAX_STATE.refreshed, values, status, upcoming: TAX_STATE.upcoming };
          applyTaxRules(p.data); await p.save(); p.refresh();
        }); });
    }
    new Setting(containerEl).setName('Tax brackets').setDesc(`Single: ${R.brSingle.map((x, i) => `${R.rates[i + 1]}% over ${usd(x)}`).join(', ')}. Joint: ${R.brJoint.map((x, i) => `${R.rates[i + 1]}% over ${usd(x)}`).join(', ')}. Updated by Refresh.`);
    new Setting(containerEl).setName('Reset to built-in values').setDesc(`Go back to the ${DEFAULT_TAX_RULES.year} values that shipped with the plugin.`)
      .addButton((b) => b.setButtonText('Reset').onClick(async () => { p.data.taxRules = null; applyTaxRules(p.data); await p.save(); p.refresh(); this.display(); new Notice('Tax rules reset.'); }));
  }

  displayInvestSettings(containerEl) {
    const p = this.plugin, st = p.data.settings.invest;
    const save = async () => { await p.save(); p.refresh(); };
    new Setting(containerEl).setName('Investments').setHeading();
    new Setting(containerEl).setName('Show Investments tab').setDesc('Growth charts for investment & retirement accounts. Monthly history is still saved while hidden. Also in the dashboard’s gear menu.')
      .addToggle((t) => t.setValue(invTabShown(p.data)).onChange(async (v) => { st.showTab = v; await save(); }));
    new Setting(containerEl).setName('Default range').setDesc('Range the growth chart opens with.')
      .addDropdown((dd) => { for (const [v, l] of INV_RANGES) dd.addOption(v, l === 'All' ? 'All history' : l.replace('M', ' months').replace('1Y', '1 year').replace('3Y', '3 years')); dd.setValue(st.range || '12').onChange(async (v) => { st.range = v; await save(); }); });
    new Setting(containerEl).setName('Default view').setDesc('Show the total, taxable vs retirement, or each account.')
      .addDropdown((dd) => { for (const [v, l] of INV_VIEWS) dd.addOption(v, l); dd.setValue(st.view || 'total').onChange(async (v) => { st.view = v; await save(); }); });
    new Setting(containerEl).setName('Estimate contributions').setDesc('Uses each account’s yearly contribution to split monthly changes into money put in and market growth. Turn off to count all change as growth.')
      .addToggle((t) => t.setValue(st.estimateContrib !== false).onChange(async (v) => { st.estimateContrib = v; await save(); }));
    new Setting(containerEl).setName('Past balances').setDesc('Enter on-budget, investment & retirement balances for earlier months. Also in the dashboard’s gear menu.')
      .addButton((b) => b.setButtonText('Add past balances').onClick(() => p.editPastBalances()))
      .addButton((b) => b.setButtonText('Monthly history').onClick(() => p.manageInvHistory()));
  }

  displayLinkSettings(containerEl) {
    const p = this.plugin;
    const L = p.data.settings.link;
    const save = async () => { await p.save(); p.refresh(); drawPreview(); };
    new Setting(containerEl).setName('Dashboard link').setHeading();
    containerEl.createEl('p', { cls: 'setting-item-description', text: 'Add a clickable link to any note that opens the dashboard in a new tab. Run “Insert dashboard link in this note” from the command palette, or paste the code below.' });
    const preview = containerEl.createDiv({ cls: 'fd-link-preview' });
    const block = preview.createDiv();
    const sentence = preview.createEl('p', { cls: 'fd-link-preview-inline' });
    sentence.append('Inline: check my ');
    const inl = sentence.createSpan({ cls: 'fd-link-inline-holder' });
    sentence.append(' before the weekend.');
    const drawPreview = () => { p.renderLink(block, {}, false); p.renderLink(inl, { label: 'budget', tab: 'spending' }, true); };
    drawPreview();

    new Setting(containerEl).setName('Link text').setDesc('Default label. A link can override it with “label: …”.')
      .addText((t) => t.setValue(L.label).onChange(async (v) => { L.label = v.trim() || 'Finance dashboard'; await save(); }));
    new Setting(containerEl).setName('Size').setDesc('Default size for block links. Any link can use “size: …” (tiny, small, large, xl, xxl, 1.5, 150%, 22px). Inline links follow the size of the surrounding text.')
      .addDropdown((d) => { for (const [v, l] of [['tiny', 'Tiny'], ['small', 'Small'], ['medium', 'Medium'], ['large', 'Large'], ['xl', 'Extra large'], ['xxl', 'Huge']]) d.addOption(v, l);
        d.setValue(L.size || 'medium').onChange(async (v) => { L.size = v; await save(); }); });
    new Setting(containerEl).setName('Style')
      .addDropdown((d) => d.addOption('card', 'Card (picture, title, subtitle)').addOption('button', 'Compact button').addOption('icon', 'Picture only')
        .setValue(L.style || 'card').onChange(async (v) => { L.style = v; await save(); }));
    const iconSetting = new Setting(containerEl).setName('Icon').setDesc('Any Lucide icon name (lucide.dev), e.g. wallet, piggy-bank, landmark, coins. Used when no picture is set.');
    const iconPrev = iconSetting.controlEl.createSpan({ cls: 'fd-icon-preview' });
    const drawIconPrev = () => { iconPrev.empty(); setIcon(iconPrev, L.icon || 'wallet'); };
    iconSetting.addText((t) => t.setPlaceholder('wallet').setValue(L.icon).onChange(async (v) => { L.icon = v.trim() || 'wallet'; drawIconPrev(); await save(); }));
    drawIconPrev();

    const pic = new Setting(containerEl).setName('Picture').setDesc(L.image ? `Using: ${L.image}` : 'Replace the icon with your own picture: choose one from your vault, upload one, or paste a vault path or image URL.');
    pic.addText((t) => t.setPlaceholder('e.g. Attachments/money.png or https://…').setValue(L.image).onChange(async (v) => { L.image = v.trim(); await save(); }));
    pic.addButton((b) => b.setButtonText('Choose…').setTooltip('Pick an image already in your vault').onClick(() => new ImagePickModal(this.app, async (path) => { L.image = path; await save(); this.display(); }).open()));
    pic.addButton((b) => b.setButtonText('Upload…').setTooltip('Upload a picture from your computer into your vault').onClick(() => {
      const input = document.createElement('input');
      input.type = 'file'; input.accept = 'image/*';
      input.addEventListener('change', async () => {
        const file = input.files && input.files[0];
        if (!file) return;
        try {
          const folder = 'Finance Dashboard';
          if (!this.app.vault.getAbstractFileByPath(folder)) await this.app.vault.createFolder(folder);
          const ext = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
          const path = `${folder}/link-picture.${ext}`;
          const buf = await file.arrayBuffer();
          const existing = this.app.vault.getAbstractFileByPath(path);
          if (existing) await this.app.vault.modifyBinary(existing, buf); else await this.app.vault.createBinary(path, buf);
          L.image = path; await save(); this.display();
          new Notice(`Saved picture to ${path}`);
        } catch (e) { new Notice(`Couldn’t save the picture: ${e.message || e}`); }
      });
      input.click();
    }));
    if (L.image) pic.addExtraButton((b) => b.setIcon('x').setTooltip('Remove picture (use the icon)').onClick(async () => { L.image = ''; await save(); this.display(); }));

    new Setting(containerEl).setName('Always open a new tab').setDesc('Off: if the dashboard is already open, the link switches to it. On: every click opens another tab.')
      .addToggle((t) => t.setValue(L.reuseTab === false).onChange(async (v) => { L.reuseTab = !v; await p.save(); }));
    const copy = async (text, what) => {
      try { await navigator.clipboard.writeText(text); new Notice(`${what} copied — paste it into a note.`); }
      catch (e) { new Notice('Couldn’t copy. Use the “Insert dashboard link” commands instead.'); }
    };
    new Setting(containerEl).setName('Link code').setDesc('Block link: its own line, can be sized, aligned (align: center) or floated beside text (float: right). Inline link: goes anywhere inside a sentence, list item, callout or table.')
      .addButton((b) => b.setButtonText('Copy block link').onClick(() => copy(LINK_SNIPPET(), 'Block link')))
      .addButton((b) => b.setButtonText('Copy inline link').onClick(() => copy(INLINE_SNIPPET(), 'Inline link')));
  }

  display() {
    const { containerEl } = this;
    const p = this.plugin;
    containerEl.empty();
    new Setting(containerEl).setName('Your name').setDesc('Shown on PDF reports. You can still change it for a single report when you create one.')
      .addText((t) => t.setPlaceholder('e.g. Alex Rivera').setValue(p.data.settings.report.name || '').onChange(async (v) => { p.data.settings.report.name = v.trim(); await p.save(); }));
    new Setting(containerEl).setName('Currency').setDesc('ISO code, e.g. USD, EUR, GBP, ISK.')
      .addText((t) => t.setValue(p.data.settings.currency).onChange(async (v) => { p.data.settings.currency = v.trim().toUpperCase() || 'USD'; await p.save(); p.refresh(); }));
    new Setting(containerEl).setName('Number locale').setDesc('Optional, e.g. en-US or de-DE. Blank uses your system setting.')
      .addText((t) => t.setValue(p.data.settings.locale).onChange(async (v) => { p.data.settings.locale = v.trim(); await p.save(); p.refresh(); }));

    new Setting(containerEl).setName('Spending categories & monthly budgets').setHeading();
    containerEl.createEl('p', { cls: 'setting-item-description', text: 'Set a budget of 0 for no budget. Renaming a category also renames it on existing transactions.' });
    p.data.categories.forEach((c, i) => {
      const s = new Setting(containerEl);
      s.addText((t) => t.setValue(c.name).onChange(async (v) => {
        const old = c.name; c.name = v.trim() || old;
        p.data.transactions.forEach((x) => { if (x.category === old) x.category = c.name; });
        await p.save(); p.refresh();
      }));
      s.addText((t) => { t.inputEl.type = 'number'; t.setPlaceholder('Budget').setValue(String(c.budget || 0)).onChange(async (v) => { c.budget = num(v); await p.save(); p.refresh(); }); });
      s.addExtraButton((b) => b.setIcon('trash-2').setTooltip('Remove').onClick(async () => { p.data.categories.splice(i, 1); await p.save(); this.display(); p.refresh(); }));
    });
    new Setting(containerEl).addButton((b) => b.setButtonText('Add category').onClick(async () => { p.data.categories.push({ name: 'New category', budget: 0 }); await p.save(); this.display(); }));

    this.displayInvestSettings(containerEl);
    this.displayLinkSettings(containerEl);
    this.displayTaxSettings(containerEl);

    new Setting(containerEl).setName('Data').setHeading();
    new Setting(containerEl).setName('Export to vault').setDesc('Saves a JSON backup plus CSVs of transactions and income history in your vault root.')
      .addButton((b) => b.setButtonText('Export').onClick(async () => {
        const stamp = todayISO();
        const write = async (name, content) => { const ex = this.app.vault.getAbstractFileByPath(name); if (ex) await this.app.vault.modify(ex, content); else await this.app.vault.create(name, content); };
        await write(`Finance backup ${stamp}.json`, JSON.stringify(p.data, null, 2));
        const esc = (s) => `"${String(s == null ? '' : s).replace(/"/g, '""')}"`;
        await write(`Finance transactions ${stamp}.csv`, 'date,description,amount,category,source,card,note\n' + p.data.transactions.map((t) => [t.date, esc(t.desc), t.amount, esc(t.category), t.source, esc(t.card), esc(t.note)].join(',')).join('\n'));
        await write(`Finance income ${stamp}.csv`, 'effective_date,reason,employer,title,gross_per_month,net_per_month,note\n' + (p.data.incomeHistory || []).map((h) => [h.date, esc(h.reason), esc(h.employer), esc(h.title), h.gross, h.net, esc(h.note)].join(',')).join('\n'));
        new Notice('Exported to your vault.');
      }));
    new Setting(containerEl).setName('Load sample data').setDesc('Replace everything with realistic demo data.')
      .addButton((b) => b.setButtonText('Load sample').onClick(() => p.loadSample()));
    new Setting(containerEl).setName('Reset all data').setDesc('Permanently deletes accounts, history, transactions, goals and scores.')
      .addButton((b) => b.setButtonText('Reset').setWarning().onClick(() => new ConfirmModal(this.app, 'Reset all data?', 'This cannot be undone. Consider exporting first.', async () => {
        const keep = p.data.settings; p.data = defaultData(); p.data.settings = keep; await p.save(); p.refresh(); this.display();
      }, 'Reset').open()));
  }
}

/* ----------------------------------------------------------- sample data */

function sampleData() {
  let seed = 42;
  const rnd = () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const between = (a, b) => a + rnd() * (b - a);
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const d = defaultData();
  const A = (name, group, kind, balance, contribution) => ({ id: uid(), name, group, kind, balance, contribution: contribution || 0 });
  d.accounts = [
    A('Everyday checking', 'budget', 'Checking', 6240), A('High-yield savings', 'budget', 'High-yield savings', 18400),
    A('Emergency fund', 'budget', 'Savings', 12000), A('Cash on hand', 'budget', 'Cash', 300),
    A('Index fund brokerage', 'investment', 'TOD Individual', 42800, 3600), A('Individual stocks', 'investment', 'Stocks', 9600), A('Crypto wallet', 'investment', 'Crypto', 3200),
    A('Employer 401(k)', 'retirement', '401(k)', 96400, 14500), A('Roth IRA', 'retirement', 'Roth IRA', 38200, 7000),
    A('Health savings (HSA)', 'retirement', 'HSA', 11800, 4150), A('Rollover IRA', 'retirement', 'Rollover IRA', 22600, 0),
    A('Home', 'property', 'Home', 410000), A('Car', 'property', 'Vehicle', 18500),
    A('Mortgage', 'debt', 'Mortgage', 298000), A('Auto loan', 'debt', 'Auto loan', 9800),
    A('Visa Signature', 'debt', 'Credit card', 1840), A('Rewards Mastercard', 'debt', 'Credit card', 960),
  ];
  const t = totals(d);
  const now = monthKey(new Date());
  // Per-account investment history: walk back from today's balances, taking out each month's contribution
  // and a market return (shared market move + a little per-account noise, with a dip about 7 months ago).
  const market = [];
  for (let i = 0; i <= 23; i++) market[i] = i === 7 ? -0.046 : i === 6 ? -0.012 : 0.0095 + (rnd() - 0.5) * 0.03;
  const inv = d.accounts.filter(isInvAccount);
  const bal = {};
  for (const a of inv) bal[a.id] = [num(a.balance)];
  for (const a of inv) {
    const vol = a.kind === 'Crypto' ? 3.2 : a.kind === 'Stocks' ? 1.5 : a.kind === 'HSA' ? 0.8 : 1;
    let b = num(a.balance);
    for (let i = 0; i < 23; i++) {
      const r = market[i] * vol + (rnd() - 0.5) * 0.008;
      b = Math.max(0, (b - num(a.contribution) / 12) / (1 + r));
      bal[a.id].push(Math.round(b * 100) / 100);
    }
  }
  // The rollover IRA was opened 14 months ago from a previous employer's 401(k).
  const roll = inv.find((a) => a.kind === 'Rollover IRA');
  const cashAccts = d.accounts.filter((a) => a.group === 'budget');
  const prop = t.byGroup.property || 0;
  for (let i = 23; i >= 1; i--) {
    const k = addMonths(now, -i);
    const m = {};
    for (const a of inv) if (!(a === roll && i > 14)) m[a.id] = bal[a.id][i];
    d.invHistory[k] = m;
    const invSum = sum(Object.values(m));
    const ret = sum(inv.filter((a) => a.group === 'retirement' && m[a.id] != null), (a) => m[a.id]);
    const cm = {};
    for (const a of cashAccts) cm[a.id] = a.kind === 'Cash' ? num(a.balance) : Math.round(num(a.balance) * (1 - i * (a.kind === 'Checking' ? 0.004 : 0.016) + (rnd() - 0.5) * (a.kind === 'Checking' ? 0.12 : 0.02)) * 100) / 100;
    d.cashHistory[k] = cm;
    const cashSum = sum(Object.values(cm));
    const assets = Math.round(cashSum + prop * (1 - i * 0.0012 + (rnd() - 0.5) * 0.004) + invSum + (roll && i > 14 ? bal[roll.id][i] : 0));
    const debts = Math.round(t.debts * (1 + i * 0.0045));
    d.history.push({ date: k, assets, debts, net: assets - debts, retirement: Math.round(ret + (roll && i > 14 ? bal[roll.id][i] : 0)), cash: Math.round(cashSum) });
  }
  upsertSnapshot(d);
  let score = 704;
  for (let i = 23; i >= 0; i--) {
    score = clamp(Math.round(score + between(-6, 9)), 640, 812);
    d.credit.push({ id: uid(), date: `${addMonths(now, -i)}-${pad2(i === 0 ? Math.min(14, new Date().getDate()) : 14)}`, score, bureau: 'VantageScore' });
  }
  d.categories = [['Housing', 2250], ['Groceries', 650], ['Dining', 350], ['Transportation', 250], ['Utilities', 260], ['Insurance', 210], ['Health', 120],
    ['Shopping', 300], ['Entertainment', 120], ['Subscriptions', 80], ['Travel', 200], ['Personal care', 60], ['Gifts & donations', 120], ['Other', 100]].map(([name, budget]) => ({ name, budget }));
  const today = new Date();
  const tx = (date, desc, amount, category, source, card) => d.transactions.push({ id: uid(), date, desc, amount: Math.round(amount * 100) / 100, category, source, card: card || (source === 'credit' ? pick(['Visa Signature', 'Rewards Mastercard']) : 'Everyday checking') });
  for (let i = 11; i >= 0; i--) {
    const k = addMonths(now, -i);
    const [y, m] = k.split('-').map(Number);
    const days = i === 0 ? today.getDate() : new Date(y, m, 0).getDate();
    const day = (n) => `${k}-${pad2(clamp(n, 1, days))}`;
    const rday = () => day(1 + Math.floor(rnd() * days));
    const dec = m === 12;
    tx(day(1), 'Mortgage payment', 2185, 'Housing', 'debit');
    if (days >= 3) { tx(day(3), 'City Power & Light', between(85, 140), 'Utilities', 'debit'); tx(day(3), 'Water & sewer', between(38, 55), 'Utilities', 'debit'); }
    if (days >= 8) tx(day(8), 'Home internet', 69.99, 'Utilities', 'credit');
    if (days >= 5) tx(day(5), 'Auto & home insurance', 196, 'Insurance', 'debit');
    tx(day(2), 'Streaming service', 15.49, 'Subscriptions', 'credit');
    if (days >= 6) tx(day(6), 'Music streaming', 10.99, 'Subscriptions', 'credit');
    if (days >= 9) tx(day(9), 'Cloud storage', 2.99, 'Subscriptions', 'credit');
    tx(day(1), 'Neighborhood gym', 45, 'Health', 'debit');
    const scale = days / 30;
    const n = (lo, hi) => Math.round(between(lo, hi) * scale);
    for (let j = 0; j < n(6, 9); j++) tx(rday(), pick(['Green Valley Market', 'Harvest Co-op', 'Fresh Fields Grocer', 'Corner Market']), between(38, 145), 'Groceries', rnd() < 0.75 ? 'credit' : 'debit');
    for (let j = 0; j < n(6, 11); j++) tx(rday(), pick(['Thai Basil Kitchen', 'Bean & Leaf Café', 'Taqueria del Sol', 'Luigi’s Pizzeria', 'Sushi Harbor', 'The Daily Grind']), between(6, 78), 'Dining', 'credit');
    for (let j = 0; j < n(3, 5); j++) tx(rday(), pick(['Valley Fuel', 'QuickStop Gas', 'City Transit']), between(32, 68), 'Transportation', 'credit');
    for (let j = 0; j < n(2, dec ? 7 : 4); j++) tx(rday(), pick(['Online marketplace', 'Home goods store', 'Outdoor outfitters', 'Bookshop']), between(18, dec ? 260 : 160), 'Shopping', 'credit');
    for (let j = 0; j < n(1, 3); j++) tx(rday(), pick(['Cinema tickets', 'Concert tickets', 'Mini golf', 'Board game café']), between(14, 85), 'Entertainment', rnd() < 0.5 ? 'credit' : 'debit');
    if (rnd() < 0.6) tx(rday(), pick(['Pharmacy', 'Dental copay', 'Urgent care copay']), between(12, 90), 'Health', 'debit');
    if (rnd() < 0.7) tx(rday(), pick(['Hair salon', 'Barber shop']), between(28, 65), 'Personal care', 'debit');
    if (dec || rnd() < 0.4) tx(rday(), pick(['Gift shop', 'Charity donation', 'Flower delivery']), between(25, dec ? 320 : 90), 'Gifts & donations', rnd() < 0.5 ? 'credit' : 'debit');
    if (rnd() < 0.35 || i === 3) tx(rday(), pick(['Airline tickets', 'Lakeside lodge', 'Car rental']), between(140, 620), 'Travel', 'credit');
    if (rnd() < 0.4) tx(rday(), pick(['Hardware store', 'Post office', 'Dry cleaning']), between(9, 70), 'Other', 'debit');
  }
  d.transactions = d.transactions.filter((x) => new Date(x.date) <= today);
  const ago = (months) => isoDate(new Date(today.getFullYear(), today.getMonth() - months, 1));
  const ahead = (months) => isoDate(new Date(today.getFullYear(), today.getMonth() + months, 15));
  d.goals = [
    { id: uid(), name: 'Emergency fund (6 months)', target: 24000, saved: 12000, deadline: ahead(13), created: ago(12) },
    { id: uid(), name: 'Japan trip', target: 6500, saved: 4300, deadline: ahead(5), created: ago(8) },
    { id: uid(), name: 'Next car down payment', target: 8000, saved: 1500, deadline: ahead(19), created: ago(10) },
    { id: uid(), name: 'Kitchen refresh', target: 15000, saved: 4750, deadline: ahead(25), created: ago(6) },
    { id: uid(), name: 'New laptop', target: 1800, saved: 1800, deadline: ahead(1), created: ago(5) },
  ];
  // Income: guaranteed monthly pay with a job change and raises over time.
  const monthsAgo = (m, day) => isoDate(new Date(today.getFullYear(), today.getMonth() - m, day || 1));
  d.incomeHistory = [
    { id: uid(), date: monthsAgo(44, 14), reason: 'Starting income', employer: 'Northwind Studio', title: 'Product designer', gross: 8166.67, net: 5866.67, note: '' },
    { id: uid(), date: monthsAgo(31), reason: 'Raise', employer: 'Northwind Studio', title: 'Product designer', gross: 8575, net: 6141.67, note: '' },
    { id: uid(), date: monthsAgo(15, 19), reason: 'New job', employer: 'Brightline Health', title: 'Senior product designer', gross: 9583.33, net: 6766.67, note: 'Switched jobs — better 401(k) match' },
    { id: uid(), date: monthsAgo(4), reason: 'Raise', employer: 'Brightline Health', title: 'Senior product designer', gross: 9966.67, net: 7025, note: 'Annual review: 4% raise, bumped 401(k) to 10%' },
  ];
  d.extraIncome = [
    { id: uid(), name: 'Freelance illustration', kind: 'Freelance / gig work', gross: 650, net: 500, start: monthsAgo(8, 1), end: null, note: 'About two small projects a month' },
  ];
  // Notes on a few transactions
  const noteFirst = (pred, text) => { const t = d.transactions.find(pred); if (t) t.note = text; };
  noteFirst((t) => t.category === 'Travel', 'Japan trip — flights booked early with rewards card');
  noteFirst((t) => t.desc === 'Outdoor outfitters', 'Hiking boots, replaced the old pair');
  noteFirst((t) => t.desc === 'Urgent care copay' || t.desc === 'Dental copay', 'Submit receipt to HSA for reimbursement');
  noteFirst((t) => t.date.startsWith(now) && t.category === 'Dining', 'Team dinner — half will be expensed');
  noteFirst((t) => t.date.startsWith(addMonths(now, -1)) && t.category === 'Shopping', 'Early holiday gifts');
  // Notes written with balance updates
  const on = (m, day) => { const dt = new Date(today.getFullYear(), today.getMonth() - m, day); return isoDate(dt > today ? today : dt); };
  d.balanceNotes = [
    { id: uid(), date: on(10, 27), text: 'Paid off the holiday credit card balance in full' },
    { id: uid(), date: on(7, 28), text: 'Market dip — brokerage down ~4%, stayed the course' },
    { id: uid(), date: on(4, 28), text: 'Raise started: bumped 401(k) contribution to 10%' },
    { id: uid(), date: on(3, 28), text: 'Bonus split: $3k to Japan fund, rest invested in index fund' },
    { id: uid(), date: on(2, 27), text: 'Refinanced auto loan from 6.9% to 4.4%' },
    { id: uid(), date: on(1, 28), text: 'Car value reassessed lower after inspection' },
    { id: uid(), date: todayISO(), text: 'Monthly check-in: emergency fund now 50% funded' },
  ];
  d.settings = Object.assign({}, d.settings);
  d.retirement = { birthDate: '1988-04-12', targetAge: 60, annualIncome: 80000, otherIncome: 18000, withdrawalRate: 4, expectedReturn: 7, inflation: 2.5, includeInvestments: false };
  return d;
}

// Exposed for testing outside Obsidian.
module.exports.__test = { simulateRetirement, buildWhatIfPDF, buildFinanceReport, MiniPDF, retirementPlan, totals, byCategory, goalInfo, parseCSV, importTransactions, sampleData, Dashboard, defaultData };
