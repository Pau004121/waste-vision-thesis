'use strict';
(() => {
  const root = document.querySelector('#root');
  const dialog = document.querySelector('#review-dialog');
  const toast = document.querySelector('#toast');
  const allowedApiOrigins = Object.freeze(['https://waste-vision-student-qr.icy-lamp-1597.chatgpt.site']);
  let apiOrigin;
  try {
    const configured = new URL(window.WASTE_VISION_CONFIG?.apiOrigin);
    if (configured.protocol !== 'https:' || configured.href !== configured.origin + '/' || !allowedApiOrigins.includes(configured.origin)) throw new Error('Untrusted API origin');
    apiOrigin = configured.origin;
  } catch (_) {
    root.textContent = 'The school service configuration is invalid. Please contact the thesis project team.';
    return;
  }
  const appBase = new URL('.', document.baseURI).href;
  const state = { session: null, epoch: 0, page: 'home', authMode: 'login', busy: false, message: '',
    fresh: false, qr: null, clockSkew: 0, rewards: null, receipts: null, transfers: null, ranks: null,
    category: 'bottles', review: null, recipient: null };
  const pendingPrefix = 'wastevision.pending.v1:';
  let toastTimer, qrRefreshInFlight = false;
  const controllers = new Set();
  const nav = [['home', 'Overview', 'grid'], ['rewards', 'Rewards', 'gift'], ['send', 'Send points', 'send'], ['ranks', 'Leaderboard', 'trophy']];
  const categories = { bottles: ['Bottles', 'bottle'], paper: ['Paper', 'paper'], plastics: ['Other plastics', 'plastic'] };
  const paths = {
    grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M5 12v9h14v-9M12 8v13M12 8H8a3 3 0 1 1 3-3l1 3Zm0 0h4a3 3 0 1 0-3-3l-1 3Z"/>',
    send: '<path d="m21 3-7 18-4-7-7-4L21 3ZM10 14 21 3"/>',
    trophy: '<path d="M8 3h8v6a4 4 0 0 1-8 0V3Zm4 10v6m-4 2h8M8 5H4v3a4 4 0 0 0 4 4m8-7h4v3a4 4 0 0 1-4 4"/>',
    qr: '<rect x="3" y="3" width="6" height="6" rx="1"/><rect x="15" y="3" width="6" height="6" rx="1"/><rect x="3" y="15" width="6" height="6" rx="1"/><path d="M15 15h3v3h3v3h-6v-3m6-3h-1M12 3v3m0 6h3m-6 0H3m9 3v6"/>',
    refresh: '<path d="M20 8a8 8 0 0 0-14-3L3 8m0-5v5h5M4 16a8 8 0 0 0 14 3l3-3m0 5v-5h-5"/>',
    arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
    logout: '<path d="M9 4H5v16h4m4-8h8m-4-4 4 4-4 4"/>',
    shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z"/><path d="m8 12 3 3 5-6"/>',
    leaf: '<path d="M20 3C8 3 3 7 4 13s8 9 12 3c3-4 3-8 4-13ZM4 21 16 9"/>',
    coin: '<circle cx="12" cy="12" r="9"/><path d="m7 9 2 7 3-7 3 7 2-7"/>',
    bottle: '<path d="M10 2h4v4l2 3v10a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2V9l2-3V2Zm0 3h4M8 11h8M8 17h8"/>',
    paper: '<path d="M6 3h9l4 4v14H6V3Zm9 0v5h4M9 12h7m-7 4h7"/>',
    plastic: '<path d="m6 8 2 13h8l2-13H6Zm-1-3h14M9 2h6M8 12h8m-7 5h6"/>',
    notebook: '<path d="M5 3h13a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H5V3Zm3 0v18M3 7h4m-4 5h4m-4 5h4m6-9h4m-4 4h4"/>',
    pen: '<path d="m5 16-1 5 5-1L21 8l-4-4L5 16Zm10-10 4 4M5 16l4 4M17 4l2-2 4 4-2 2"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    ticket: '<path d="M3 7h18v4a2 2 0 0 0 0 4v4H3v-4a2 2 0 0 0 0-4V7Zm11 0v2m0 3v2m0 3v2"/>',
    recycle: '<path d="m9 4 3-2 4 7m-1-6 1 6-6-1m10 4 2 3-5 6m5-1h-6l1-6M7 20H3l-1-5m-1 3 3-5 5 3M3 13l4-7"/>'
  };
  const icon = (name, extra = '') => `<svg class="icon ${extra}" viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.gift}</svg>`;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const fmt = value => Number(value || 0).toLocaleString('en-PH');
  const initials = name => String(name || '').trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase();
  const date = value => { const d = new Date(value); return Number.isFinite(+d) ? new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short' }).format(d) : ''; };
  const brand = () => `<div class="brand"><img src="./logo.png" alt="FEU Pampanga seal"><div><div class="brand-name">Waste Vision<span aria-hidden="true">.</span></div><div class="brand-school">FEU Pampanga</div></div></div>`;
  const button = (label, action, style = '', extra = '', disabled = false) => `<button class="btn ${style}" data-action="${action}" ${extra} ${disabled || state.busy ? 'disabled' : ''}>${label}</button>`;
  const empty = (heading, detail, symbol = 'leaf') => `<div class="empty">${icon(symbol)}<strong>${esc(heading)}</strong>${esc(detail)}</div>`;
  const now = () => Date.now() / 1000 + state.clockSkew;
  const identity = () => state.session ? JSON.stringify([appBase, apiOrigin, state.session.student.studentId, state.session.student.accountVersion]) : null;
  const capture = () => ({ token: state.session?.sessionToken ?? null, identity: identity(), epoch: state.epoch });
  const current = snapshot => snapshot.epoch === state.epoch && snapshot.token === (state.session?.sessionToken ?? null) && snapshot.identity === identity();
  function pendingKey() { return pendingPrefix + identity(); }
  function pending() {
    if (!state.session) return null;
    try {
      const raw = localStorage.getItem(pendingKey());
      if (raw === null) return null;
      const value = JSON.parse(raw);
      const p = value?.payload;
      const positive = item => Number.isSafeInteger(item) && item > 0 && item <= 1000000000;
      const names = name => typeof name === 'string' && name.length > 0 && name.length <= 128;
      const payloadValid = value?.kind === 'redeem' ? positive(p?.rewardId) && positive(p?.quantity) && positive(p?.expectedUnitCost) && names(p?.expectedRewardName) :
        value?.kind === 'transfer' && names(p?.recipientId) && names(p?.expectedRecipientName) && positive(p?.points) && Number.isSafeInteger(p?.expectedRecipientAccountVersion) && p.expectedRecipientAccountVersion >= 0;
      if (value && value.owner === identity() && payloadValid && names(p?.requestId) && typeof value.summary === 'string') return value;
    } catch (_) { /* Preserve the journal when storage is damaged or unavailable. */ }
    return { damaged: true, owner: identity(), summary: 'This browser could not read its saved transaction. Check your receipt history or ask school staff before clearing site storage.' };
  }
  function savePending(operation) {
    const previous = pending();
    if (previous?.damaged) throw new Error(previous.summary);
    if (previous && JSON.stringify(previous) !== JSON.stringify(operation)) throw new Error('Retrieve your previous receipt before starting another request.');
    localStorage.setItem(pendingKey(), JSON.stringify(operation));
    if (localStorage.getItem(pendingKey()) !== JSON.stringify(operation)) throw new Error('This browser could not save your request safely. Please enable site storage.');
  }
  function removePending(operation) {
    const key = pendingPrefix + operation.owner;
    const saved = JSON.parse(localStorage.getItem(key) || 'null');
    if (saved?.payload?.requestId === operation.payload.requestId) localStorage.removeItem(key);
  }
  class ApiError extends Error { constructor(message, status = 0, code = '') { super(message); this.status = status; this.code = code; } }
  async function api(path, { token = null, payload, method = payload === undefined ? 'GET' : 'POST' } = {}) {
    if (typeof path !== 'string' || !path.startsWith('/api/mobile/')) throw new Error('Invalid school service request.');
    const target = new URL(path, apiOrigin);
    if (target.origin !== apiOrigin || !target.pathname.startsWith('/api/mobile/') || target.username || target.password || target.hash) throw new Error('Invalid school service request.');
    const controller = new AbortController(); controllers.add(controller);
    const timer = setTimeout(() => controller.abort(), 22000);
    try {
      const response = await fetch(target.href, { method, body: payload === undefined ? undefined : JSON.stringify(payload),
        headers: { Accept: 'application/json', ...(payload === undefined ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        signal: controller.signal, redirect: 'error', cache: 'no-store', credentials: 'omit', mode: 'cors', referrerPolicy: 'no-referrer' });
      const reader = response.body?.getReader(); let size = 0; const chunks = [];
      if (!reader) throw new ApiError('The school service returned an empty response.');
      while (true) { const result = await reader.read(); if (result.done) break; size += result.value.byteLength;
        if (size > 1048576) { await reader.cancel(); throw new ApiError('The school service response was too large. Please contact school staff.'); }
        chunks.push(result.value);
      }
      const bytes = new Uint8Array(size); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      let value;
      try { value = JSON.parse(new TextDecoder().decode(bytes)); } catch (_) { throw new ApiError('The school service is unavailable. Please try again later.', response.status); }
      if (!response.ok) throw new ApiError(String(value?.error?.message || 'The request could not be completed. Please try again.').slice(0, 240), response.status, value?.error?.code || '');
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ApiError('The school service returned an invalid response.');
      return value;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError('Could not reach the school service. Check your connection and try again.');
    } finally { clearTimeout(timer); controllers.delete(controller); }
  }
  function validStudent(student) { return student && typeof student.studentId === 'string' && student.studentId && typeof student.fullName === 'string' && Number.isSafeInteger(student.accountVersion) && student.accountVersion >= 0 && Number.isSafeInteger(student.balance) && student.balance >= 0; }
  function clearPrivate() { state.qr = null; state.review = null; state.recipient = null; state.rewards = null; state.receipts = null; state.transfers = null; state.ranks = null; state.fresh = false; }
  function signOut(message = 'You have signed out.', notifyServer = true) {
    const previous = state.session; state.epoch++; state.session = null; state.busy = false; state.message = message;
    for (const controller of controllers) controller.abort();
    clearPrivate(); if (dialog.open) dialog.close(); render();
    if (notifyServer && previous) api('/api/mobile/logout', { token: previous.sessionToken, payload: {} }).catch(() => {});
  }
  function notify(message) { toast.textContent = message; toast.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { toast.hidden = true; }, 5200); }
  async function run(label, operation, apply, { auth = true } = {}) {
    if (state.busy || (auth && !state.session)) return;
    const snapshot = capture(); state.busy = true; state.message = ''; render();
    const status = document.querySelector('#loading-status'); if (status) status.textContent = label;
    try {
      const result = await operation(snapshot.token);
      if (!current(snapshot)) return;
      state.busy = false; apply(result); render();
    } catch (error) {
      if (!current(snapshot)) return;
      state.busy = false;
      if (error.status === 401 && auth) { signOut('Your sign-in expired. Please sign in again.', false); return; }
      state.message = error.message || 'The request could not be completed.';
      state.fresh = false; render();
    }
  }
  function notice() { return state.message ? `<div class="notice ${state.session ? 'error' : ''}" role="alert">${esc(state.message)}</div>` : ''; }
  function pendingNotice() {
    const operation = pending();
    return operation ? `<div class="notice pending-notice"><div><strong>${operation.damaged ? 'Your saved request needs attention' : 'Your previous request needs a receipt'}</strong><p>${esc(operation.summary)}${operation.damaged ? '' : '. Its reply was interrupted. Retrieve it before starting another transaction.'}</p></div>${operation.damaged ? '' : button('Retrieve receipt '+icon('arrow'), 'retry', 'btn-gold')}</div>` : '';
  }
  function authView() {
    const activate = state.authMode === 'activate';
    return `<div class="auth-layout"><section class="auth-story">${brand()}<div class="auth-copy"><div class="eyebrow">Small actions. Shared impact.</div><h1>A greener campus.<br> <em>A little more rewarding.</em></h1><p>Turn everyday recycling into something good. Sort your waste. Collect WV Points. Make your impact count.</p><div class="auth-art" aria-hidden="true"><div class="art-tile">${icon('bottle')}</div><div class="art-tile">${icon('leaf')}</div><div class="art-tile">${icon('paper')}</div></div></div><div class="auth-footer"><span>A clearer way to sort.<br>A better way to give back.</span><span>FEU PAMPANGA<br>STUDENT REWARDS</span></div></section><main class="auth-form-side" id="main"><div class="auth-form-wrap"><div class="eyebrow">Your campus. Your impact.</div><h2>${activate ? 'Start something good.' : 'Welcome back.'}</h2><p class="auth-intro">${activate ? 'Activate your student account and make every deposit count.' : 'Sign in to your student rewards account.'}</p><div class="auth-tabs" role="group" aria-label="Account access"><button data-action="auth-login" class="${activate ? '' : 'active'}" ${state.busy ? 'disabled' : ''}>Sign in</button><button data-action="auth-activate" class="${activate ? 'active' : ''}" ${state.busy ? 'disabled' : ''}>Activate account</button></div>${notice()}<form id="auth-form"><label class="field"><span>Student ID</span><input name="studentId" type="text" placeholder="Enter your student ID" maxlength="64" autocomplete="username" required ${state.busy ? 'disabled' : ''}></label>${activate ? '<label class="field"><span>School activation code</span><input name="enrollmentCode" type="text" placeholder="Code from your school counter" maxlength="160" autocomplete="off" required></label>' : ''}<label class="field"><span>${activate ? 'Create a password' : 'Password'}</span><input name="password" type="password" placeholder="${activate ? 'At least 12 characters' : 'Enter your password'}" minlength="12" maxlength="128" autocomplete="${activate ? 'new-password' : 'current-password'}" required ${state.busy ? 'disabled' : ''}></label>${activate ? '<label class="field"><span>Confirm password</span><input name="confirmation" type="password" placeholder="Re-enter your password" minlength="12" maxlength="128" autocomplete="new-password" required></label>' : ''}<button class="btn btn-primary wide" type="submit" ${state.busy ? 'disabled' : ''}>${state.busy ? 'Connecting…' : activate ? 'Activate account' : 'Sign in'} ${icon('arrow')}</button><div id="loading-status" class="loading-line" aria-live="polite"></div></form><p class="auth-help">${activate ? 'Your school must verify your student record first.' : 'Need an account or a password reset? Visit your school counter.'}</p><div class="auth-safe">${icon('shield')}<span>Your student QR and rewards are linked to your verified school account. Your password stays private.</span></div><p class="auth-bottom">STUDENT THESIS PROTOTYPE · FEU PAMPANGA</p></div></main></div>`;
  }
  function shellView() {
    const student = state.session.student; const page = nav.find(item => item[0] === state.page);
    return `<div class="app-layout"><aside class="sidebar">${brand()}<div class="nav-label">YOUR CAMPUS SPACE</div><nav class="nav-list" aria-label="Main navigation">${nav.map(([key, label, symbol], index) => `<button class="nav-item ${state.page === key ? 'active' : ''}" data-action="nav" data-page="${key}" ${state.busy ? 'disabled' : ''} ${state.page === key ? 'aria-current="page"' : ''}>${icon(symbol)}<span>${label}</span><span class="nav-index">0${index + 1}</span></button>`).join('')}</nav><div class="sidebar-note">${icon('leaf')}<p><strong>A little effort. A lasting difference.</strong>Every correctly sorted item is a step toward a greener FEU Pampanga.</p></div><div class="sidebar-student"><div class="row"><div class="avatar">${esc(initials(student.fullName))}</div><div><div class="student-name">${esc(student.fullName)}</div><div class="student-id">${esc(student.studentId)}</div></div></div><button class="signout" data-action="logout">${icon('logout')} Sign out</button></div></aside><main class="app-main" id="main"><header class="topbar">${brand()}<div class="breadcrumb">Student space <span>/</span> <strong>${esc(page[1])}</strong></div><div class="topbar-right"><span class="topbar-points">${icon('coin')}${fmt(student.balance)} pts</span><span class="pill">Verified student</span><div class="avatar">${esc(initials(student.fullName))}</div><button class="btn btn-text mobile-signout" data-action="logout" aria-label="Sign out" hidden>${icon('logout')}</button></div></header><div class="page-heading"><div><div class="eyebrow">FEU PAMPANGA · STUDENT REWARDS</div><h1>${state.page === 'home' ? `Good to see you, ${esc(student.fullName.split(/\s+/)[0])}.` : { rewards: 'Good choices. Great rewards.', send: 'Share a little good.', ranks: 'Making an impact, together.' }[state.page]}</h1><p>${{ home: 'Your next small action could make a big difference.', rewards: 'A little thank-you for making your campus greener.', send: 'Send WV Points to another verified student.', ranks: 'Celebrating the students who keep our campus greener.' }[state.page]}</p></div>${button(icon('refresh')+'Refresh', 'refresh')}</div>${notice()}${pendingNotice()}<div id="loading-status" class="loading-line" aria-live="polite">${state.busy ? 'Refreshing your student space…' : ''}</div>${{ home: overviewView, rewards: rewardsView, send: sendView, ranks: ranksView }[state.page]()}<footer class="page-footer"><span>Waste Vision · Thesis prototype</span><span>Small actions. Shared impact.</span></footer></main><nav class="mobile-nav" aria-label="Mobile navigation">${nav.map(([key, label, symbol]) => `<button data-action="nav" data-page="${key}" class="${state.page === key ? 'active' : ''}" ${state.busy ? 'disabled' : ''} ${state.page === key ? 'aria-current="page"' : ''}>${icon(symbol)}${key === 'home' ? 'My space' : key === 'send' ? 'Send points' : label}</button>`).join('')}</nav></div>`;
  }
  function overviewView() {
    return `<div class="overview-grid"><div><section class="balance-hero"><div class="eyebrow">${state.fresh ? 'Your WV Points balance' : 'Last known WV Points balance'}</div><div class="balance-value">${fmt(state.session.student.balance)}<span>pts</span></div><p>${state.fresh ? 'Earned through better everyday choices.' : 'Refresh online to check your current balance.'}</p><div class="hero-art" aria-hidden="true">${icon('recycle')}</div><div class="hero-actions">${button('Explore rewards '+icon('arrow'), 'go-rewards', 'btn-gold')}${button('Send points', 'go-send', 'btn-text')}</div></section><section class="earn-panel"><h2>Little things add up.</h2><p>Earn points for each confirmed deposit at the scanner.</p><div class="earn-rates">${[['bottle', '5', 'Plastic bottles'], ['paper', '2', 'Paper'], ['plastic', '1', 'Other plastics']].map(([symbol, points, label]) => `<div class="earn-rate">${icon(symbol)}<strong>+${points} <span>WV Points</span></strong><p>${label}</p></div>`).join('')}</div></section></div><section class="panel qr-panel"><div class="qr-heading"><h2>Your student QR</h2>${icon('qr')}</div><p class="qr-caption">Show this at the Waste Vision scanner. Check your name before depositing.</p><div class="qr-box" id="qr-box">${state.qr ? '<canvas id="student-qr" width="512" height="512" role="img" aria-label="Your temporary student identification QR code"></canvas>' : `<div class="qr-placeholder">${icon('qr')}<span>${state.busy ? 'Preparing your student QR…' : 'Generate a fresh code when you are ready to recycle.'}</span></div>`}</div><div class="qr-countdown" id="qr-countdown">${state.qr ? 'Your code is ready.' : 'A fresh code keeps your account secure.'}</div>${button(icon('refresh')+'Refresh QR code', 'qr', 'btn-soft')}<p class="qr-bottom">Student ID ${esc(state.session.student.studentId)}<br>Personal QR · Automatically expires in 2 minutes</p></section></div><div class="how-it-works">${[['01', 'Scan your QR', 'Let the scanner know who is making a difference.'], ['02', 'Sort & deposit', 'Show one item, then click Deposit at the scanner.'], ['03', 'Enjoy your rewards', 'Spend your points at the school reward counter.']].map(([number, heading, detail]) => `<div class="step"><span class="step-number">${number}</span><div><strong>${heading}</strong><p>${detail}</p></div></div>`).join('')}</div>`;
  }
  function rewardKind(name) { return /pen|pencil|marker/i.test(name) ? ['pen', 'pen'] : /paper|pad|sheet/i.test(name) ? ['paper', 'paper'] : /bottle|drink|water/i.test(name) ? ['bottle', 'drink'] : /notebook|book/i.test(name) ? ['notebook', 'paper'] : ['gift', '']; }
  function rewardsView() {
    const rows = state.rewards; const blocked = Boolean(pending());
    return `<section aria-label="Available rewards"><div class="rewards-toolbar"><p>${rows ? `<strong>${rows.length}</strong> rewards in your school catalog` : 'The school reward catalog will appear here.'}</p><span class="pill gold">${fmt(state.session.student.balance)} WV Points</span></div>${rows?.length ? `<div class="reward-grid">${rows.map(item => { const [symbol, kind] = rewardKind(item.name); return `<article class="reward-card"><div class="reward-art ${kind}">${icon(symbol)}<span class="pill ${item.stock ? '' : 'gray'}">${item.stock ? 'In stock' : 'Sold out'}</span></div><div class="reward-detail"><h3>${esc(item.name)}</h3><div class="reward-meta"><span class="reward-price">${fmt(item.pointCost)}<span>pts</span></span><span>${fmt(item.stock)} available</span></div>${button((item.stock ? 'Redeem reward' : 'Out of stock')+' '+icon('arrow'), 'reward', 'btn-soft', `data-reward="${item.rewardId}"`, blocked || item.stock < 1 || state.session.student.balance < item.pointCost)}</div></article>`; }).join('')}</div>` : `<div class="panel">${empty(rows === null && state.busy ? 'Loading your rewards…' : 'Good things are on their way.', rows === null ? 'Refresh to see the latest school rewards and stock.' : 'Your school has not listed any rewards yet. Check back soon.', 'gift')}</div>`}</section><section class="receipt-list"><div class="section-head"><div><h2>Your reward receipts</h2><p>Show an uncollected receipt at the school counter.</p></div></div><div class="panel">${state.receipts?.length ? state.receipts.map(receipt => `<div class="receipt-row"><div class="row"><div class="receipt-icon">${icon('ticket')}</div><div><h3>${fmt(receipt.quantity)} × ${esc(receipt.rewardName)}</h3><p>${fmt(receipt.totalPoints)} pts · ${esc(date(receipt.createdAt))}</p></div></div><div class="receipt-right"><div class="claim-code">${esc(receipt.claimCode)}</div><span class="pill ${receipt.collectedAt ? 'gray' : 'gold'}">${receipt.collectedAt ? 'Collected' : 'Ready for pickup'}</span></div></div>`).join('') : empty('No receipts yet.', 'Your redeemed rewards will be saved here for counter pickup.', 'ticket')}</div></section>`;
  }
  function sendView() {
    return `<div class="send-grid"><section class="panel send-form"><h2>Pass it forward.</h2><p>Enter the student’s exact ID and the points you want to send. You will review their name before confirming.</p><form id="send-form"><label class="field"><span>Recipient student ID</span><input name="recipientId" type="text" placeholder="Enter their student ID" maxlength="64" autocomplete="off" required ${state.busy ? 'disabled' : ''}></label><label class="field"><span>WV Points to send</span><input name="points" type="number" min="1" max="${state.session.student.balance}" step="1" inputmode="numeric" placeholder="e.g. 10" required ${state.busy ? 'disabled' : ''}><small>Available balance: ${fmt(state.session.student.balance)} WV Points</small></label><button class="btn btn-primary wide" type="submit" ${state.busy || pending() ? 'disabled' : ''}>Review transfer ${icon('arrow')}</button></form></section><aside class="send-aside">${icon('shield')}<h3>A little care goes a long way.</h3><p>Double-check the student’s name and ID on the next screen. Confirmed point transfers cannot be cancelled.</p><div class="mini-balance"><p>YOUR ${state.fresh ? '' : 'LAST KNOWN '}BALANCE</p><strong>${fmt(state.session.student.balance)}</strong><span>WV Points</span></div></aside></div><section class="receipt-list"><div class="section-head"><div><h2>Your point activity</h2><p>Points shared, and points received.</p></div></div><div class="panel">${state.transfers?.length ? state.transfers.map(item => `<div class="receipt-row transfer-row"><div class="row"><div class="receipt-icon">${icon(item.direction === 'sent' ? 'send' : 'coin')}</div><div><h3>${item.direction === 'sent' ? 'Sent to' : 'Received from'} ${esc(item.otherStudentName)}</h3><p>${esc(item.otherStudentId)} · ${esc(date(item.createdAt))}</p></div></div><span class="amount ${item.direction === 'sent' ? 'sent' : ''}">${item.direction === 'sent' ? '−' : '+'}${fmt(item.points)} <small>pts</small></span></div>`).join('') : empty('Good things are better shared.', 'Your sent and received points will appear here.', 'send')}</div></section>`;
  }
  function ranksView() {
    return `<div class="rank-tabs" role="group" aria-label="Waste category">${Object.entries(categories).map(([key, [label, symbol]]) => `<button data-action="category" data-category="${key}" class="${key === state.category ? 'active' : ''}" aria-pressed="${key === state.category}" ${state.busy ? 'disabled' : ''}>${icon(symbol)}${label}</button>`).join('')}</div><section class="rank-intro"><div><h2>Every item makes a difference.</h2><p>Meet the students leading the way in ${state.category === 'bottles' ? 'bottle' : state.category === 'paper' ? 'paper' : 'plastic'} recycling. One correctly sorted deposit at a time.</p></div>${icon('trophy')}</section><section class="panel">${state.ranks?.length ? `<table class="rank-table"><thead><tr><th scope="col">Rank</th><th scope="col">Student</th><th scope="col">${esc(categories[state.category][0])}</th></tr></thead><tbody>${state.ranks.map((item, index) => `<tr class="${index < 3 ? 'top-rank' : ''}"><td><span class="rank-number">${fmt(item.rank)}</span></td><td><span class="rank-student"><span class="avatar">${esc(initials(item.displayName))}</span>${esc(item.displayName)}</span></td><td class="rank-count">${fmt(item.count)}<small>items deposited</small></td></tr>`).join('')}</tbody></table>` : empty(state.busy ? 'Loading your campus leaders…' : 'The next campus champion could be you.', 'Completed deposits will appear in this category’s leaderboard.', 'trophy')}</section><p class="rank-footnote">Rankings count completed waste deposits. Spending or sending WV Points does not reduce your item count.</p>`;
  }
  function render() {
    root.innerHTML = state.session ? shellView() : authView();
    if (state.session && state.page === 'home' && state.qr) renderQr();
  }
  function renderQr() {
    const canvas = document.querySelector('#student-qr');
    if (!canvas || !state.qr || state.qr.expiresAt <= now() || document.hidden) { canvas?.remove(); return; }
    try {
      const code = window.qrcode(0, 'M'); code.addData(state.qr.qrText, 'Byte'); code.make();
      const count = code.getModuleCount(), scale = Math.floor(512 / (count + 8)), size = scale * (count + 8);
      canvas.width = size; canvas.height = size; const context = canvas.getContext('2d'); context.fillStyle = '#ffffff'; context.fillRect(0, 0, size, size); context.fillStyle = '#000000';
      for (let row = 0; row < count; row++) for (let col = 0; col < count; col++) if (code.isDark(row, col)) context.fillRect((col + 4) * scale, (row + 4) * scale, scale, scale);
      updateCountdown();
    } catch (_) {
      state.qr = null; canvas.remove();
      const box = document.querySelector('#qr-box');
      if (box) box.innerHTML = '<div class="qr-placeholder">Your QR could not be displayed. Please refresh it.</div>';
      const label = document.querySelector('#qr-countdown');
      if (label) label.textContent = 'QR unavailable · Tap Refresh QR code';
    }
  }
  function checkQr(result) {
    if (typeof result.qrText !== 'string' || !result.qrText.startsWith('WVQR1.') || result.qrText.length > 4096 || !Number.isSafeInteger(result.serverTime) || !Number.isSafeInteger(result.expiresAt) || result.expiresAt <= result.serverTime || result.expiresAt > result.serverTime + 120) throw new ApiError('The school service returned an invalid QR code.');
    state.clockSkew = result.serverTime - Date.now() / 1000; return document.hidden ? null : result;
  }
  function loadPage() {
    if (!state.session) return;
    const page = state.page; const student = state.session.student;
    return run('Refreshing your student space…', async token => {
      const me = await api('/api/mobile/me', { token });
      if (!validStudent(me.student) || me.student.studentId !== student.studentId || me.student.accountVersion !== student.accountVersion) throw new ApiError('This account changed. Please sign in again.', 401);
      if (page === 'home') return { me, qr: await api('/api/mobile/qr', { token, payload: {} }) };
      if (page === 'rewards') { const [rewards, receipts] = await Promise.all([api('/api/mobile/rewards', { token }), api('/api/mobile/redemptions', { token })]); return { me, rewards, receipts }; }
      if (page === 'send') return { me, transfers: await api('/api/mobile/transfers', { token }) };
      return { me, ranks: await api(`/api/mobile/leaderboard?category=${state.category}`, { token }) };
    }, result => {
      state.session.student = result.me.student; state.fresh = true;
      if (result.qr) state.qr = checkQr(result.qr);
      if (result.rewards) state.rewards = result.rewards.items;
      if (result.receipts) state.receipts = result.receipts.items;
      if (result.transfers) state.transfers = result.transfers.items;
      if (result.ranks) state.ranks = result.ranks.items;
    });
  }
  function refreshQr() { return run('Preparing a fresh student QR…', token => api('/api/mobile/qr', { token, payload: {} }), result => { state.qr = checkQr(result); }); }
  function navigate(page) { if (state.busy || !nav.some(item => item[0] === page)) return; state.page = page; state.message = ''; render(); loadPage(); window.scrollTo({ top: 0, behavior: 'instant' }); }
  function line(label, value, extra = '') { return `<div class="review-line ${extra}"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`; }
  function openReward(rewardId) {
    if (pending()) return notify('Retrieve your previous receipt before redeeming another reward.');
    const reward = state.rewards?.find(item => item.rewardId === rewardId); if (!reward || reward.stock < 1) return;
    state.review = { kind: 'reward-quantity', reward: structuredClone(reward), identity: capture() };
    dialog.innerHTML = `<div class="dialog-content"><div class="dialog-heading-icon">${icon('gift')}</div><h2>A well-earned little reward.</h2><p>Choose a quantity, then review your points before redeeming.</p><div class="review-lines">${line('Reward', reward.name)}${line('Each', `${fmt(reward.pointCost)} WV Points`)}${line('Available', `${fmt(reward.stock)} items`)}</div><form id="quantity-form"><label class="field dialog-quantity"><span>Quantity</span><input name="quantity" type="number" min="1" max="${Math.min(reward.stock, 10000)}" value="1" step="1" inputmode="numeric" required></label><div class="dialog-actions"><button class="btn" type="button" data-action="close-dialog">Cancel</button><button class="btn btn-primary" type="submit">Review redemption ${icon('arrow')}</button></div></form></div>`;
    dialog.showModal();
  }
  function openReview(operation) {
    state.review = operation;
    const transfer = operation.kind === 'transfer';
    dialog.innerHTML = `<div class="dialog-content"><div class="dialog-heading-icon">${icon(transfer ? 'send' : 'gift')}</div><h2>${transfer ? 'The right person. The right points.' : 'Ready to make it yours?'}</h2><p>${transfer ? 'Check the recipient carefully. A confirmed transfer cannot be cancelled.' : 'Your points and reward stock will be updated together. Collect your item at the school counter.'}</p><div class="review-lines">${transfer ? line('Recipient', operation.payload.expectedRecipientName) + line('Student ID', operation.payload.recipientId) : line('Reward', operation.payload.expectedRewardName) + line('Quantity', operation.payload.quantity) + line('Each', `${fmt(operation.payload.expectedUnitCost)} pts`)}${line(transfer ? 'Points to send' : 'Total cost', `${fmt(operation.total)} WV Points`, 'total')}${line('Your balance after', `${fmt(state.session.student.balance - operation.total)} pts`)}</div><div class="dialog-actions"><button class="btn" data-action="close-dialog">Go back</button><button class="btn btn-primary" data-action="confirm-operation">${transfer ? 'Send points' : 'Confirm redemption'} ${icon('check')}</button></div></div>`;
    if (!dialog.open) dialog.showModal();
  }
  function checkReceipt(receipt, operation, actor) {
    const safe = (value, max = 1000000000) => Number.isSafeInteger(value) && value >= 0 && value <= max;
    const text = value => typeof value === 'string' && value.length > 0 && value.length <= 128;
    const payload = operation.payload;
    let valid = receipt && receipt.requestId === payload.requestId && receipt.studentId === actor.studentId && receipt.accountVersion === actor.accountVersion &&
      text(receipt.studentName) && safe(receipt.balanceAfter) && safe(receipt.dataVersion, Number.MAX_SAFE_INTEGER) && receipt.dataVersion > 0 &&
      typeof receipt.createdAt === 'string' && Number.isFinite(Date.parse(receipt.createdAt));
    if (operation.kind === 'redeem') valid = valid && text(receipt.redemptionId) && text(receipt.claimCode) && receipt.rewardId === payload.rewardId &&
      receipt.rewardName === payload.expectedRewardName && receipt.unitCost === payload.expectedUnitCost && receipt.quantity === payload.quantity &&
      receipt.totalPoints === payload.quantity * payload.expectedUnitCost && safe(receipt.totalPoints) && receipt.totalPoints > 0 && safe(receipt.stockAfter, 1000000) && receipt.collectedAt === null;
    else valid = valid && text(receipt.transferId) && receipt.recipientId === payload.recipientId && receipt.recipientVersion === payload.expectedRecipientAccountVersion &&
      receipt.recipientName === payload.expectedRecipientName && receipt.points === payload.points && safe(receipt.points) && receipt.points > 0;
    if (!valid) throw new ApiError('The receipt did not match your confirmed request. Your request is saved; retrieve its receipt before trying another transaction.');
    return receipt;
  }
  async function performOperation(operation) {
    if (!state.session || operation.damaged || operation.owner !== identity() || state.busy) return;
    const snapshot = capture();
    const actor = structuredClone(state.session.student);
    if (dialog.open) dialog.close();
    return run('Saving your confirmed request…', async token => {
      const submit = async () => {
        if (!current(snapshot)) throw new Error('The active account changed. Sign in again.');
        savePending(operation);
        try { const receipt = checkReceipt(await api(`/api/mobile/${operation.kind}`, { token, payload: operation.payload }), operation, actor); removePending(operation); return receipt; }
        catch (error) { if ([400, 404, 409, 422].includes(error.status) && !String(error.code).includes('REQUEST')) removePending(operation); throw error; }
      };
      if (!navigator.locks) throw new Error('Please use an up-to-date browser to submit point transactions safely.');
      return navigator.locks.request(`wastevision:${operation.owner}`, submit);
    }, receipt => {
      state.fresh = false; state.review = null; showReceipt(receipt, operation.kind);
      // A replayed receipt's balance may predate later deposits or transfers.
      // Refresh /me rather than overwriting the account with balanceAfter.
      loadPage();
    });
  }
  function showReceipt(receipt, kind) {
    const reward = kind === 'redeem';
    dialog.innerHTML = `<div class="dialog-content"><div class="dialog-heading-icon">${icon('check')}</div><h2>${reward ? 'A little good, rewarded.' : 'A little good, passed on.'}</h2><p>${reward ? 'Your redemption is saved. Show this receipt at the school counter to collect your item.' : 'Your points have been sent successfully.'}</p><div class="receipt-success">${reward ? `<div class="claim-code">${esc(receipt.claimCode)}</div><p>Ready for counter pickup</p>` : `<h3>${fmt(receipt.points)} WV Points</h3><p>Sent to ${esc(receipt.recipientName)} · ${esc(receipt.recipientId)}</p>`}</div><div class="review-lines">${reward ? line('Reward', `${receipt.quantity} × ${receipt.rewardName}`) + line('Points used', `${fmt(receipt.totalPoints)} pts`) : line('Reference', receipt.transferId)}${line('Recorded at', date(receipt.createdAt))}</div><button class="btn btn-primary wide" data-action="close-dialog">All done ${icon('check')}</button></div>`;
    if (!dialog.open) dialog.showModal();
  }
  root.addEventListener('submit', event => {
    event.preventDefault(); const form = event.target; if (state.busy) return;
    const data = new FormData(form);
    if (form.id === 'auth-form') {
      const studentId = String(data.get('studentId')).trim().toUpperCase(); const password = String(data.get('password')); const activate = state.authMode === 'activate';
      if (password.length < 12 || password.length > 128) return notify('Use a password with 12–128 characters.');
      if (activate && password !== String(data.get('confirmation'))) return notify('Your password confirmation must match.');
      const payload = { studentId, password, ...(activate ? { enrollmentCode: String(data.get('enrollmentCode')).trim() } : {}) };
      form.reset();
      run('Connecting to your school…', () => api(`/api/mobile/${activate ? 'activate' : 'login'}`, { payload }), result => {
        if (!validStudent(result.student) || result.student.studentId !== studentId || typeof result.sessionToken !== 'string' || result.sessionToken.length < 16 || !Number.isSafeInteger(result.expiresAt)) throw new ApiError('The sign-in response did not match your account.');
        clearPrivate(); state.epoch++; state.session = result; state.page = 'home'; state.fresh = true; state.message = ''; loadPage();
      }, { auth: false });
    }
    if (form.id === 'send-form') {
      if (pending()) return notify('Retrieve your previous receipt first.');
      const recipientId = String(data.get('recipientId')).trim().toUpperCase(); const points = Number(data.get('points'));
      if (!recipientId || recipientId === state.session.student.studentId || !Number.isSafeInteger(points) || points < 1 || points > state.session.student.balance) return notify('Enter another student’s ID and points within your balance.');
      run('Checking the recipient…', token => api(`/api/mobile/recipient?studentId=${encodeURIComponent(recipientId)}`, { token }), target => {
        if (target.studentId !== recipientId || typeof target.fullName !== 'string' || !Number.isSafeInteger(target.accountVersion) || target.accountVersion < 0) throw new ApiError('The recipient details changed. Please try again.');
        openReview({ kind: 'transfer', owner: identity(), total: points, summary: `${fmt(points)} pts to ${target.fullName} (${target.studentId})`,
          payload: { recipientId, points, expectedRecipientName: target.fullName, expectedRecipientAccountVersion: target.accountVersion, requestId: crypto.randomUUID() } });
      });
    }
  });
  dialog.addEventListener('submit', event => {
    if (event.target.id !== 'quantity-form') return; event.preventDefault();
    const review = state.review; if (!review || review.kind !== 'reward-quantity' || !current(review.identity)) { dialog.close(); return; }
    const quantity = Number(new FormData(event.target).get('quantity')), item = review.reward, total = quantity * item.pointCost;
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > Math.min(item.stock, 10000) || !Number.isSafeInteger(total) || total > state.session.student.balance) return notify('Choose an available quantity within your points balance.');
    openReview({ kind: 'redeem', owner: identity(), total, summary: `${quantity} × ${item.name} for ${fmt(total)} pts`,
      payload: { rewardId: item.rewardId, quantity, expectedUnitCost: item.pointCost, expectedRewardName: item.name, requestId: crypto.randomUUID() } });
  });
  function click(event) {
    const element = event.target.closest('[data-action]'); if (!element || element.disabled) return;
    const action = element.dataset.action;
    if (action === 'logout') { signOut(); return; }
    if (action === 'close-dialog') { dialog.close(); state.review = null; return; }
    if (state.busy) return;
    if (action === 'auth-login' || action === 'auth-activate') { state.authMode = action === 'auth-login' ? 'login' : 'activate'; state.message = ''; render(); }
    if (action === 'nav') navigate(element.dataset.page);
    if (action === 'go-rewards') navigate('rewards');
    if (action === 'go-send') navigate('send');
    if (action === 'refresh') loadPage();
    if (action === 'qr') refreshQr();
    if (action === 'category') { state.category = element.dataset.category; state.ranks = null; loadPage(); }
    if (action === 'reward') openReward(Number(element.dataset.reward));
    if (action === 'confirm-operation' && state.review) performOperation(structuredClone(state.review));
    if (action === 'retry' && pending() && !pending().damaged) performOperation(pending());
  }
  root.addEventListener('click', click); dialog.addEventListener('click', click);
  dialog.addEventListener('cancel', () => { state.review = null; });
  function updateCountdown() {
    const label = document.querySelector('#qr-countdown');
    if (!state.qr || !label) return;
    const seconds = Math.max(0, Math.ceil(state.qr.expiresAt - now()));
    label.textContent = seconds ? `Fresh code · refreshes in ${seconds}s` : 'This code has expired. Refreshing…';
    if (!seconds) { state.qr = null; document.querySelector('#student-qr')?.remove();
      if (!state.busy && !document.hidden && !qrRefreshInFlight) { qrRefreshInFlight = true; Promise.resolve(refreshQr()).finally(() => { qrRefreshInFlight = false; }); }
    }
  }
  setInterval(updateCountdown, 1000);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { state.qr = null; document.querySelector('#student-qr')?.remove(); }
    else if (state.session && state.page === 'home' && !state.busy) loadPage();
  });
  window.addEventListener('storage', event => { if (event.key?.startsWith(pendingPrefix) && state.session) render(); });
  render();
})();
