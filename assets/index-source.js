import { createClient } from '@supabase/supabase-js';
var supabase={createClient};

var SITE_URL = 'https://www.pinitworld.com';

var INFO_CONTENT = {
  about: {
    title: 'About Pinit',
    html: '<p>Pinit is a daily global notes wall. Each person leaves one short note per day — a thought, wish, truth, or question.</p>' +
      '<p>Your trace joins voices from around the world on an interactive map. At midnight UTC the live wall resets for a new day, but every day is saved in the archive — a record of what humanity was feeling.</p>' +
      '<ul><li>One note per person per day</li><li>60 words max</li><li>Optional mood and note color</li><li>Browse today&rsquo;s wall or past days in the archive</li></ul>'
  },
  privacy: {
    title: 'Privacy',
    html: '<p>Your trust matters. Pinit is built to share feeling, not to expose you.</p>' +
      '<ul><li>We do not show your exact location — <strong>country only</strong></li>' +
      '<li>You may use an alias; your real name is never required</li>' +
      '<li>Public notes may remain visible in the archive</li>' +
      '<li>We use a private identifier that changes daily to limit posting per network. It is never included in public notes. Shared networks may share a limit.</li>' +
      '<li>Notes are checked by local moderation (Pinit Shield) before posting</li></ul>'
  },
  rules: {
    title: 'Wall rules',
    html: '<p>Pinit is a space for honest human feeling. Please keep it safe for everyone.</p>' +
      '<ul><li>One note per day per person</li>' +
      '<li>No abuse, threats, hate, sexual content, or spam</li>' +
      '<li>Emotional honesty is welcome — harm toward others is not</li>' +
      '<li>Notes that break these rules may be blocked or removed</li>' +
      '<li>Anyone can report a note; admins may hide or restore content</li></ul>' +
      '<p>If your note is blocked, try rewriting it without harmful language.</p>'
  },
  howitworks: {
    title: 'How it works',
    html: '<ul>' +
      '<li><strong>Write one short note</strong> — a thought, wish, truth, or question</li>' +
      '<li><strong>Your country is detected</strong> — never your exact location</li>' +
      '<li><strong>It joins today&rsquo;s world wall</strong> — alongside voices from around the earth</li>' +
      '<li><strong>At midnight UTC, today closes</strong> — the live wall resets for a new day</li>' +
      '<li><strong>The day is saved in the archive</strong> — a record of what the world said</li>' +
      '</ul>'
  }
};

function openInfoModal(which) {
  var data = INFO_CONTENT[which];
  if (!data) return;
  document.getElementById('info-title').textContent = data.title;
  document.getElementById('info-body').innerHTML = data.html;
  document.getElementById('info-overlay').classList.add('open');
}

function closeInfoModal() {
  document.getElementById('info-overlay').classList.remove('open');
  scrollPanelToTop();
}

document.getElementById('info-overlay').addEventListener('click', function(e) {
  if (e.target === this) closeInfoModal();
});

var SUPABASE_URL = window.PINIT_CONFIG.url;
var SUPABASE_KEY = window.PINIT_CONFIG.publicKey;
var sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});

var COLORS = [
  '#e63946', // bold red
  '#f4842a', // deep orange
  '#f7c948', // strong yellow
  '#2dc653', // vivid green
  '#1a7abf', // strong blue
  '#7b2ff7', // deep violet
  '#e040a0', // hot pink
  '#00b4d8', // cyan
  '#ff6b35', // burnt orange
  '#1b4332', // forest green (dark — light text)
  '#1a1814', // near black
  '#c94040', // crimson
];

var MOODS = [
  { id: 'hopeful', label: 'Hopeful' },
  { id: 'tired', label: 'Tired' },
  { id: 'lonely', label: 'Lonely' },
  { id: 'grateful', label: 'Grateful' },
  { id: 'angry', label: 'Angry' },
  { id: 'peaceful', label: 'Peaceful' },
  { id: 'lost', label: 'Lost' }
];

var MOOD_LABELS = {};
MOODS.forEach(function(m) { MOOD_LABELS[m.id] = m.label; });

var userCountry = 'Unknown', userCountryCode = '';
var selectedColor = COLORS[0];
var selectedMood = null;
var hasPosted = false;
var lastPostedNote = null;

var TRACES_FETCH_LIMIT = 24;
var TRACE_PREVIEW_MAX = 140;
var MOBILE_TRACE_PREVIEW_MAX = 130;
var MOBILE_CROSSFADE_HOLD_MS = 5200;
var MOBILE_CROSSFADE_FADE_MS = 1100;

function isMobilePortrait() {
  return window.matchMedia('(max-width: 700px) and (orientation: portrait)').matches;
}
var tracesNotes = [];
var landingNoteCount = 0;
var landingPollTimer = null;
var trackRebuildTimer = null;
var mobileCrossfadeTimer = null;
var mobileCrossfadeFadeTimer = null;
var mobileCrossfadeIndex = 0;
var viewportResizeTimer = null;
var notesLiveChannel = null;
var prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
window.pinitGlobePaused = false;

async function init() {
  scrollPanelToTop();
  renderColorPicker();
  renderMoodPicker();
  await detectLocation();
  await checkIfPosted();
  initLandingLiveSync();
}

function scrollPanelToTop() {
  var panel = document.querySelector('.header');
  if (panel) panel.scrollTop = 0;
  try {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  } catch (e) {
    window.scrollTo(0, 0);
  }
}

window.addEventListener('pageshow', function() {
  scrollPanelToTop();
});

async function detectLocation() {
  localStorage.removeItem('pinit_hash');
  localStorage.removeItem('pinit_country');
  try {
    var r=await fetch('/api/location'); var d=await r.json();
    userCountry=d.country || 'Unknown'; userCountryCode=d.countryCode || '';
  } catch(e) {}
  document.getElementById('preview-country').textContent=userCountry;
}
async function checkIfPosted() {
  hasPosted=localStorage.getItem('pinit_posted_date')===todayISO();
  if(hasPosted) { setPostedButtonState(); await loadLastPostedNoteIfAny(); }
  else resetPostButtonState();
}
async function loadLastPostedNoteIfAny() {
  var id=localStorage.getItem('pinit_note_id');
  if(!hasPosted || !id) return;
  var res=await sb.from('notes').select('id,content,alias,color,country,mood,created_at').eq('id',id).maybeSingle();
  if(res.data) lastPostedNote=res.data;
}

function setPostedButtonState() {
  var actions = document.getElementById('hero-actions');
  var postBtn = document.getElementById('open-modal-btn');
  var status = document.getElementById('trace-status');
  var listenBtn = document.getElementById('listen-today-btn');
  var prevBtn = document.getElementById('previous-days-btn');
  if (actions) actions.classList.add('has-posted');
  if (postBtn) postBtn.hidden = true;
  if (status) status.hidden = false;
  if (listenBtn) {
    listenBtn.classList.remove('stat-btn-secondary', 'stat-btn-quiet');
    listenBtn.classList.add('stat-btn-primary');
  }
  if (prevBtn) {
    prevBtn.classList.remove('stat-btn-quiet', 'stat-btn-primary');
    prevBtn.classList.add('stat-btn-secondary');
  }
}

function resetPostButtonState() {
  var actions = document.getElementById('hero-actions');
  var postBtn = document.getElementById('open-modal-btn');
  var status = document.getElementById('trace-status');
  var listenBtn = document.getElementById('listen-today-btn');
  var prevBtn = document.getElementById('previous-days-btn');
  if (actions) actions.classList.remove('has-posted');
  if (postBtn) {
    postBtn.hidden = false;
    postBtn.onclick = openModal;
  }
  if (status) status.hidden = true;
  if (listenBtn) {
    listenBtn.classList.remove('stat-btn-primary', 'stat-btn-quiet');
    listenBtn.classList.add('stat-btn-secondary');
  }
  if (prevBtn) {
    prevBtn.classList.remove('stat-btn-primary', 'stat-btn-secondary');
    prevBtn.classList.add('stat-btn-quiet');
  }
}

async function openMyTraceOnMap() {
  await ensureMapLibrary();
  currentMapDate = todayISO();
  document.getElementById('map-overlay').classList.add('open');
  window.location.hash = 'wall';
  document.getElementById('find-my-note-btn').style.display = 'inline-flex';
  if (!map) initMap();
  loadMapNotes().then(focusMyTraceOnMap);
  ensureNotesLiveSubscription();
}

function focusMyTraceOnMap() {
  if (lastPostedNote) {
    var marker = findMapMarkerForNote(lastPostedNote);
    if (marker) {
      var latlng = marker.getLatLng();
      var flyDelay = prefersReducedMotion ? 100 : 300;
      setTimeout(function() {
        map.flyTo(latlng, Math.max(map.getZoom(), 5), {
          animate: !prefersReducedMotion,
          duration: prefersReducedMotion ? 0.2 : 1.2
        });
        setTimeout(function() { pulseMapMarker(marker); }, prefersReducedMotion ? 150 : 1300);
      }, flyDelay);
      return;
    }
  }
  findMyNote();
}

function renderColorPicker() {
  var picker = document.getElementById('color-picker');
  picker.innerHTML = COLORS.map(c=>`
    <button type="button" class="color-opt${c===selectedColor?' selected':''}" style="background:${c};" data-color="${c}" aria-label="${c}" title="${c}"></button>
  `).join('');
}

function selectColor(color, el) {
  selectedColor = color;
  document.querySelectorAll('.color-opt').forEach(e=>e.classList.remove('selected'));
  el.classList.add('selected');
  document.getElementById('note-preview').style.background = color;
}

function renderMoodPicker() {
  var picker = document.getElementById('mood-picker');
  if (!picker) return;
  picker.innerHTML = MOODS.map(function(m) {
    return '<button type="button" class="mood-opt' + (selectedMood === m.id ? ' selected' : '') + '" data-mood="' + m.id + '">' + m.label + '</button>';
  }).join('');
}

function selectMood(id, el) {
  if (selectedMood === id) {
    selectedMood = null;
    el.classList.remove('selected');
    return;
  }
  selectedMood = id;
  document.querySelectorAll('.mood-opt').forEach(function(e) { e.classList.remove('selected'); });
  el.classList.add('selected');
}

function moodLabel(id) {
  return MOOD_LABELS[id] || (id ? id.charAt(0).toUpperCase() + id.slice(1) : '');
}

async function loadWorldFeeling() {
  var feelingEl = document.getElementById('live-day-feeling');
  if (!feelingEl) return;

  var today = new Date().toISOString().slice(0, 10);
  var res = await sb.from('notes').select('mood').eq('note_date', today).not('mood', 'is', null);
  if (res.error || !res.data || !res.data.length) {
    feelingEl.hidden = true;
    feelingEl.textContent = '';
    return;
  }

  var counts = {};
  var total = 0;
  res.data.forEach(function(row) {
    if (!row.mood) return;
    counts[row.mood] = (counts[row.mood] || 0) + 1;
    total++;
  });
  if (!total) {
    feelingEl.hidden = true;
    feelingEl.textContent = '';
    return;
  }

  var sorted = Object.keys(counts).sort(function(a, b) { return counts[b] - counts[a]; });
  var topCount = counts[sorted[0]];
  var tiedTops = sorted.filter(function(id) { return counts[id] === topCount; });
  var hasTie = tiedTops.length > 1;
  var moodText = hasTie
    ? tiedTops
    : [sorted[0]];
  feelingEl.textContent = formatFeelingLine(moodText);
  feelingEl.hidden = false;
}

function formatFeelingLine(moodIds) {
  var labels = moodIds.map(function(id) { return moodLabel(id).toLowerCase(); });
  if (!labels.length) return '';
  if (labels.length === 1) return 'Feeling ' + labels[0] + '.';
  if (labels.length === 2) return 'Feeling ' + labels[0] + ' and ' + labels[1] + '.';
  var last = labels.pop();
  return 'Feeling ' + labels.join(', ') + ', and ' + last + '.';
}

function onNoteInput(el) {
  var words = el.value.trim().split(/\s+/).filter(Boolean);
  var wc = words.length;
  document.getElementById('word-count').textContent = wc;
  if (wc > 60) {
    el.value = words.slice(0,60).join(' ');
    document.getElementById('word-count').textContent = 60;
  }
}

async function loadNotes() {
  var today = todayISO();
  var { count, error } = await sb.from('notes').select('id', { count: 'exact', head: true }).eq('note_date', today);
  if (error) return;
  landingNoteCount = count || 0;
  updateLiveDayDisplay(landingNoteCount);
}

function formatLiveLocalDate() {
  return new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
}

function voicesSpokenText(count) {
  if (count === 0) return 'Today, no one has spoken yet.';
  if (count === 1) return 'Today, 1 voice has spoken.';
  return 'Today, ' + count.toLocaleString() + ' voices have spoken.';
}

function updateLiveDayDisplay(count) {
  var dateEl = document.getElementById('live-day-date');
  var voicesEl = document.getElementById('live-day-voices');
  if (dateEl) dateEl.textContent = formatLiveLocalDate();
  if (voicesEl) voicesEl.textContent = voicesSpokenText(count == null ? 0 : count);
}

async function openMapAtGlobe(lat, lng) {
  await ensureMapLibrary();
  openMap();
  var attempts = 0;
  function tryFly() {
    if (!map) {
      if (attempts++ < 24) setTimeout(tryFly, 100);
      return;
    }
    if (typeof lat === 'number' && typeof lng === 'number' && !isNaN(lat) && !isNaN(lng)) {
      map.flyTo([lat, lng], 4, { animate: !prefersReducedMotion, duration: prefersReducedMotion ? 0 : 1.1 });
    }
  }
  tryFly();
}
window.pinitOpenMapAtGlobe = openMapAtGlobe;

function isLight(hex) {
  if (!hex || hex[0]!=='#') return true;
  var r = parseInt(hex.slice(1,3),16);
  var g = parseInt(hex.slice(3,5),16);
  var b = parseInt(hex.slice(5,7),16);
  return (r*299 + g*587 + b*114) / 1000 > 128;
}

var PRELUDE_SEEN_KEY = 'pinit_prelude_seen';

function setLandingPaused(paused) {
  window.pinitGlobePaused = !!paused;
  document.body.classList.toggle('landing-paused', !!paused);
  var viewport = document.getElementById('traces-stream-viewport');
  if (viewport) viewport.classList.toggle('is-paused', !!paused);
}

function openNoteFormDirect() {
  setLandingPaused(false);
  document.body.classList.remove('page-dimmed');
  var prelude = document.getElementById('writing-prelude');
  if (prelude) {
    prelude.hidden = true;
    prelude.classList.remove('fade-out');
    prelude.setAttribute('aria-hidden', 'true');
  }
  document.getElementById('overlay').classList.add('open');
  document.getElementById('note-input').focus();
}

function showWritingPrelude() {
  var prelude = document.getElementById('writing-prelude');
  if (!prelude) {
    openNoteFormDirect();
    return;
  }
  document.body.classList.add('page-dimmed');
  setLandingPaused(true);
  prelude.hidden = false;
  prelude.setAttribute('aria-hidden', 'false');
  prelude.classList.remove('fade-out');

  setTimeout(function() {
    prelude.classList.add('fade-out');
    setTimeout(function() {
      try { localStorage.setItem(PRELUDE_SEEN_KEY, '1'); } catch (e) {}
      openNoteFormDirect();
    }, 220);
  }, 520);
}

function openModal() {
  if (hasPosted) return;
  if (prefersReducedMotion || localStorage.getItem(PRELUDE_SEEN_KEY)) {
    openNoteFormDirect();
    return;
  }
  showWritingPrelude();
}

function closeModal() {
  document.getElementById('overlay').classList.remove('open');
  setLandingPaused(false);
  document.body.classList.remove('page-dimmed');
  clearAlerts();
  scrollPanelToTop();
}

function clearAlerts() {
  var e = document.getElementById('modal-alert-error');
  var w = document.getElementById('modal-alert-warn');
  e.classList.remove('show'); e.textContent='';
  w.classList.remove('show'); w.textContent='';
}

async function submitNote() {
  var content = document.getElementById('note-input').value.trim();
  var alias = document.getElementById('alias-input').value.trim();
  clearAlerts();

  if (!content) { showAlert('error', 'Write something on your note first.'); return; }
  if (!alias) { showAlert('error', 'Tell the world what to call you.'); return; }
  if (content.split(/\s+/).filter(Boolean).length < 3) { showAlert('error', 'Say a little more — at least 3 words.'); return; }

  var btn = document.getElementById('submit-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>Pinning to the wall...';

  var saved;
  try {
    var response=await fetch('/api/notes', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({content:content,alias:alias,color:selectedColor,mood:selectedMood})});
    saved=await response.json();
    if(!response.ok) throw new Error(saved.error || 'Could not post your note');
  } catch(e) {
    showAlert('error',e.message); btn.disabled=false; btn.innerHTML='Pin my note to the wall &rarr;'; return;
  }
  localStorage.setItem('pinit_note_id',saved.note.id);
  userCountry=saved.note.country;
  hasPosted = true;
  var _postDate = saved.note.note_date;
  localStorage.setItem('pinit_posted_date', _postDate);
  document.getElementById('find-my-note-btn').style.display = 'inline-flex';
  closeModal();
  setPostedButtonState();
  btn.disabled=false; btn.innerHTML='Pin my note to the wall &rarr;';

  lastPostedNote = saved.note;
  loadLastPostedNoteIfAny();

  loadNotes();
  loadWorldFeeling();
  refreshTracesFromServer();
  showShareOverlay();
}

function showAlert(type, msg) {
  var el = document.getElementById('modal-alert-' + type);
  el.textContent = msg;
  el.classList.add('show');
}

function showToast(msg) {
  var t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'), 4000);
}

// ---- SHARE ----
function getShareUrl() {
  return SITE_URL;
}

function getShareText() {
  return 'I left my trace today on Pinit — one human, one note, one day.';
}

function getFullShareMessage() {
  return getShareText() + ' ' + getShareUrl();
}

function showShareOverlay() {
  var overlay = document.getElementById('share-overlay');
  var nativeBtn = document.getElementById('share-native-btn');
  if (!overlay) return;
  document.getElementById('share-message-text').textContent = getShareText();
  if (nativeBtn) {
    nativeBtn.style.display = navigator.share ? 'block' : 'none';
  }
  renderShareCanvas();
  overlay.classList.add('open');
}

function closeShare() {
  var overlay = document.getElementById('share-overlay');
  if (overlay) overlay.classList.remove('open');
  scrollPanelToTop();
}

async function closeShareAndMap() {
  closeShare();
  await openMap();
  setTimeout(function() { findMyNote(); }, 1500);
}

async function copyShareText() {
  try {
    await navigator.clipboard.writeText(getFullShareMessage());
    showToast('Message copied to clipboard.');
  } catch (e) {
    showToast('Could not copy — try selecting the text manually.');
  }
}

async function shareNative() {
  if (!navigator.share) {
    copyShareText();
    return;
  }
  try {
    var canvas = document.getElementById('share-canvas');
    var shareData = {
      title: 'Pinit',
      text: getShareText(),
      url: getShareUrl()
    };
    if (canvas && navigator.canShare) {
      canvas.toBlob(async function(blob) {
        if (blob) {
          var file = new File([blob], 'pinit-trace.png', { type: 'image/png' });
          if (navigator.canShare({ files: [file] })) {
            try {
              await navigator.share({ title: 'Pinit', text: getShareText(), files: [file] });
              return;
            } catch (err) {
              if (err.name === 'AbortError') return;
            }
          }
        }
        try {
          await navigator.share(shareData);
        } catch (err2) {
          if (err2.name !== 'AbortError') copyShareText();
        }
      }, 'image/png');
      return;
    }
    await navigator.share(shareData);
  } catch (e) {
    if (e.name !== 'AbortError') copyShareText();
  }
}

function downloadShareCard() {
  var canvas = document.getElementById('share-canvas');
  if (!canvas) return;
  var link = document.createElement('a');
  link.download = 'pinit-trace.png';
  link.href = canvas.toDataURL('image/png');
  link.click();
  showToast('Card downloaded.');
}

function wrapCanvasText(ctx, text, maxWidth) {
  var words = text.split(/\s+/);
  var lines = [];
  var line = '';
  words.forEach(function(word) {
    var test = line ? line + ' ' + word : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  });
  if (line) lines.push(line);
  return lines;
}

function renderShareCanvas() {
  var canvas = document.getElementById('share-canvas');
  if (!canvas || !lastPostedNote) return;
  var ctx = canvas.getContext('2d');
  var w = canvas.width;
  var h = canvas.height;
  var note = lastPostedNote;

  // Background — deep space
  var bg = ctx.createLinearGradient(0, 0, w, h);
  bg.addColorStop(0, '#04060f');
  bg.addColorStop(0.5, '#0a1228');
  bg.addColorStop(1, '#1a1020');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // Stars
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  for (var s = 0; s < 60; s++) {
    var sx = ((s * 137) % 1000) / 1000 * w;
    var sy = ((s * 89) % 1000) / 1000 * h;
    var sr = (s % 3) * 0.5 + 0.5;
    ctx.beginPath();
    ctx.arc(sx, sy, sr, 0, Math.PI * 2);
    ctx.fill();
  }

  // Brand
  ctx.fillStyle = 'rgba(201,168,76,0.9)';
  ctx.font = '500 28px DM Sans, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('PINIT', w / 2, 120);
  ctx.fillStyle = 'rgba(245,196,154,0.7)';
  ctx.font = 'italic 32px Playfair Display, Georgia, serif';
  ctx.fillText('I left my trace today.', w / 2, 175);

  // Sticky note
  var nw = 720;
  var nh = 480;
  var nx = (w - nw) / 2;
  var ny = 240;
  var noteColor = safeColor(note.color) || '#fef08a';
  ctx.save();
  ctx.translate(nx + nw / 2, ny + nh / 2);
  ctx.rotate(-0.02);
  ctx.translate(-(nx + nw / 2), -(ny + nh / 2));
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 16;
  ctx.fillStyle = noteColor;
  ctx.fillRect(nx, ny, nw, nh);
  ctx.shadowColor = 'transparent';

  // Pin
  ctx.beginPath();
  ctx.arc(nx + nw / 2, ny - 8, 14, 0, Math.PI * 2);
  var pinGrad = ctx.createRadialGradient(nx + nw / 2 - 4, ny - 12, 2, nx + nw / 2, ny - 8, 14);
  pinGrad.addColorStop(0, '#ececec');
  pinGrad.addColorStop(1, '#888');
  ctx.fillStyle = pinGrad;
  ctx.fill();

  // Note text
  var light = isLightBg(noteColor);
  var tc = light ? '#1a1612' : '#f5f0e8';
  var mc = light ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.5)';
  ctx.fillStyle = tc;
  ctx.font = '48px Caveat, cursive';
  ctx.textAlign = 'left';
  var excerpt = note.content.length > 180 ? note.content.slice(0, 177) + '…' : note.content;
  var lines = wrapCanvasText(ctx, excerpt, nw - 80);
  var lineY = ny + 70;
  lines.slice(0, 6).forEach(function(ln) {
    ctx.fillText(ln, nx + 40, lineY);
    lineY += 58;
  });

  // Footer line
  ctx.strokeStyle = light ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(nx + 40, ny + nh - 70);
  ctx.lineTo(nx + nw - 40, ny + nh - 70);
  ctx.stroke();

  ctx.fillStyle = mc;
  ctx.font = '600 26px DM Sans, sans-serif';
  ctx.fillText(note.alias || 'Anonymous', nx + 40, ny + nh - 35);
  ctx.textAlign = 'right';
  ctx.fillText(note.country || '', nx + nw - 40, ny + nh - 35);
  if (note.mood) {
    ctx.textAlign = 'center';
    ctx.font = '500 22px DM Sans, sans-serif';
    ctx.fillText(moodLabel(note.mood), w / 2, ny + nh + 50);
  }
  ctx.restore();

  // Footer URL
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.font = '24px DM Sans, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('pinit — one human, one note, one day', w / 2, h - 80);
  ctx.fillStyle = 'rgba(201,168,76,0.6)';
  ctx.font = '22px DM Sans, sans-serif';
  ctx.fillText('www.pinitworld.com', w / 2, h - 45);
}

function buildNotePopupHtml(note) {
  var tc = isLightColor(safeColor(note.color)) ? '#1a1612' : '#f5f0e8';
  var mc = isLightColor(safeColor(note.color)) ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.4)';
  var moodPart = note.mood ? '<span style="color:' + mc + ';opacity:0.85;">' + escHtml(moodLabel(note.mood)) + '</span>' : '';
  var reportBtn = note.id
    ? '<button type="button" class="report-note-btn" style="color:' + mc + ';" data-report-id="' + escHtml(note.id) + '">Report this note</button>'
    : '';
  return '<div class="note-popup"><div class="note-popup-inner" style="background:' + (safeColor(note.color) || '#fef08a') + ';">' +
    '<div class="note-popup-text" style="color:' + tc + ';">' + escHtml(note.content) + '</div>' +
    '<div class="note-popup-footer"><span style="color:' + mc + ';">' + escHtml(note.alias) + '</span>' + moodPart +
    '<span style="color:' + mc + ';">' + escHtml(note.country || 'Unknown') + '</span></div>' +
    reportBtn + '</div></div>';
}

async function reportNote(noteId, btn) {
  if (!noteId) return;
  if (btn) btn.disabled = true;
  try {
    var r = await fetch('/api/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ noteId: noteId })
    });
    var data = await r.json().catch(function() { return {}; });
    if (r.ok && data.ok) {
      showToast('Thank you. This note was reported for review.');
    } else {
      showToast(data.error || 'Could not submit report. Try again.');
      if (btn) btn.disabled = false;
    }
  } catch (e) {
    showToast('Could not submit report. Try again.');
    if (btn) btn.disabled = false;
  }
}

function safeColor(c) { return COLORS.includes(c) ? c : '#f7c948'; }
function escHtml(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Close overlay on backdrop click
document.getElementById('overlay').addEventListener('click', function(e) {
  if (e.target === this) closeModal();
});
document.getElementById('share-overlay').addEventListener('click', function(e) {
  if (e.target === this) closeShare();
});

var COUNTRY_COORDS = {
  "Afghanistan": [33.93911, 67.709953],
  "Albania": [41.153332, 20.168331],
  "Algeria": [28.033886, 1.659626],
  "Angola": [-11.202692, 17.873887],
  "Argentina": [-38.416097, -63.616672],
  "Armenia": [40.069099, 45.038189],
  "Australia": [-25.274398, 133.775136],
  "Austria": [47.516231, 14.550072],
  "Azerbaijan": [40.143105, 47.576927],
  "Bahrain": [26.0275, 50.55],
  "Bangladesh": [23.684994, 90.356331],
  "Belarus": [53.709807, 27.953389],
  "Belgium": [50.503887, 4.469936],
  "Bolivia": [-16.290154, -63.588653],
  "Bosnia and Herzegovina": [43.915886, 17.679076],
  "Brazil": [-14.235004, -51.92528],
  "Bulgaria": [42.733883, 25.48583],
  "Cambodia": [12.565679, 104.990963],
  "Cameroon": [7.369722, 12.354722],
  "Canada": [56.130366, -106.346771],
  "Chile": [-35.675147, -71.542969],
  "China": [35.86166, 104.195397],
  "Colombia": [4.570868, -74.297333],
  "Congo": [-0.228021, 15.827659],
  "Costa Rica": [9.748917, -83.753428],
  "Croatia": [45.1, 15.2],
  "Cuba": [21.521757, -77.781167],
  "Czech Republic": [49.817492, 15.472962],
  "Denmark": [56.26392, 9.501785],
  "Dominican Republic": [18.735693, -70.162651],
  "Ecuador": [-1.831239, -78.183406],
  "Egypt": [26.820553, 30.802498],
  "El Salvador": [13.794185, -88.89653],
  "Ethiopia": [9.145, 40.489673],
  "Finland": [61.92411, 25.748151],
  "France": [46.227638, 2.213749],
  "Georgia": [42.315407, 43.356892],
  "Germany": [51.165691, 10.451526],
  "Ghana": [7.946527, -1.023194],
  "Greece": [39.074208, 21.824312],
  "Guatemala": [15.783471, -90.230759],
  "Honduras": [15.199999, -86.241905],
  "Hungary": [47.162494, 19.503304],
  "India": [20.593684, 78.96288],
  "Indonesia": [-0.789275, 113.921327],
  "Iran": [32.427908, 53.688046],
  "Iraq": [33.223191, 43.679291],
  "Ireland": [53.41291, -8.24389],
  "Israel": [31.046051, 34.851612],
  "Italy": [41.87194, 12.56738],
  "Jamaica": [18.109581, -77.297508],
  "Japan": [36.204824, 138.252924],
  "Jordan": [30.585164, 36.238414],
  "Kazakhstan": [48.019573, 66.923684],
  "Kenya": [-0.023559, 37.906193],
  "Kuwait": [29.31166, 47.481766],
  "Kyrgyzstan": [41.20438, 74.766098],
  "Lebanon": [33.854721, 35.862285],
  "Libya": [26.3351, 17.228331],
  "Malaysia": [4.210484, 101.975766],
  "Mexico": [23.634501, -102.552784],
  "Morocco": [31.791702, -7.09262],
  "Mozambique": [-18.665695, 35.529562],
  "Myanmar": [21.913965, 95.956223],
  "Nepal": [28.394857, 84.124008],
  "Netherlands": [52.132633, 5.291266],
  "New Zealand": [-40.900557, 174.885971],
  "Nicaragua": [12.865416, -85.207229],
  "Nigeria": [9.081999, 8.675277],
  "North Korea": [40.339852, 127.510093],
  "Norway": [60.472024, 8.468946],
  "Oman": [21.512583, 55.923255],
  "Pakistan": [30.375321, 69.345116],
  "Palestine": [31.952162, 35.233154],
  "Panama": [8.537981, -80.782127],
  "Paraguay": [-23.442503, -58.443832],
  "Peru": [-9.189967, -75.015152],
  "Philippines": [12.879721, 121.774017],
  "Poland": [51.919438, 19.145136],
  "Portugal": [39.399872, -8.224454],
  "Qatar": [25.354826, 51.183884],
  "Romania": [45.943161, 24.96676],
  "Russia": [61.52401, 105.318756],
  "Saudi Arabia": [23.885942, 45.079162],
  "Senegal": [14.497401, -14.452362],
  "Serbia": [44.016521, 21.005859],
  "Singapore": [1.352083, 103.819836],
  "Somalia": [5.152149, 46.199616],
  "South Africa": [-30.559482, 22.937506],
  "South Korea": [35.907757, 127.766922],
  "Spain": [40.463667, -3.74922],
  "Sri Lanka": [7.873054, 80.771797],
  "Sudan": [12.862807, 30.217636],
  "Sweden": [60.128161, 18.643501],
  "Switzerland": [46.818188, 8.227512],
  "Syria": [34.802075, 38.996815],
  "Taiwan": [23.69781, 120.960515],
  "Tajikistan": [38.861034, 71.276093],
  "Tanzania": [-6.369028, 34.888822],
  "Thailand": [15.870032, 100.992541],
  "Tunisia": [33.886917, 9.537499],
  "Turkey": [38.963745, 35.243322],
  "Turkmenistan": [38.969719, 59.556278],
  "Uganda": [1.373333, 32.290275],
  "Ukraine": [48.379433, 31.16558],
  "United Arab Emirates": [23.424076, 53.847818],
  "United Kingdom": [55.378051, -3.435973],
  "United States": [37.09024, -95.712891],
  "Uruguay": [-32.522779, -55.765835],
  "Uzbekistan": [41.377491, 64.585262],
  "Venezuela": [6.42375, -66.58973],
  "Vietnam": [14.058324, 108.277199],
  "Yemen": [15.552727, 48.516388],
  "Zimbabwe": [-19.015438, 29.154857]
};

// ---- MAP ----
var map = null;
var mapMarkers = [];
var mapNotes = [];

var currentMapDate = new Date().toISOString().slice(0, 10);

async function openMap(optDate) {
  await ensureMapLibrary();
  currentMapDate = optDate || new Date().toISOString().slice(0, 10);
  document.getElementById('map-overlay').classList.add('open');
  window.location.hash = 'wall';
  // Show find my note if user has posted any time
  var postedDate = localStorage.getItem('pinit_posted_date');
  if (postedDate) document.getElementById('find-my-note-btn').style.display = 'inline-flex';
  if (!map) initMap();
  else loadMapNotes();
}

function changeMapDate(dir) {
  var d = new Date(currentMapDate);
  d.setDate(d.getDate() + dir);
  var today = new Date().toISOString().slice(0, 10);
  if (d.toISOString().slice(0, 10) > today) return;
  currentMapDate = d.toISOString().slice(0, 10);
  loadMapNotes();
}

function closeMap() {
  document.getElementById('map-overlay').classList.remove('open');
  history.pushState('', document.title, window.location.pathname);
  scrollPanelToTop();
}

function findMyNote() {
  var coords = COUNTRY_COORDS[userCountry];
  if (!coords) { showToast('Could not locate your country.'); return; }
  map.flyTo(coords, 6, { animate: true, duration: 1.2 });
  // After flying, pulse dots in user country — no position changes
  setTimeout(() => {
    mapMarkers.forEach(m => {
      if (m._noteCountry === userCountry) {
        var el = m.getElement();
        if (!el) return;
        var dot = el.querySelector('.map-dot');
        if (!dot) return;
        dot.style.transform = 'scale(2.5)';
        dot.style.transition = 'transform 0.3s';
        setTimeout(() => { dot.style.transform = 'scale(1)'; }, 600);
      }
    });
  }, 1400);
}

function handleLiveNoteInsert(note) {
  if (!note || note.note_date !== todayISO()) return;

  var exists = tracesNotes.some(function(n) { return n.id === note.id; });
  if (!exists) {
    tracesNotes.unshift({
      id: note.id,
      content: note.content,
      alias: note.alias,
      country: note.country,
      color: safeColor(note.color),
      mood: note.mood || null,
      created_at: note.created_at
    });
    if (tracesNotes.length > TRACES_FETCH_LIMIT) tracesNotes.pop();
    schedulePassingTrackRebuild();
    loadNotes();
    loadWorldFeeling();
  }

  if (map && document.getElementById('map-overlay').classList.contains('open') && currentMapDate === todayISO()) {
    addNoteToMap(note);
    var noteCountEl = document.getElementById('map-note-count');
    if (noteCountEl) {
      var current = parseInt(noteCountEl.textContent.replace(/,/g, ''), 10) || 0;
      updateMapStatsDisplay(current + 1, undefined);
    }
    updateMapCountryCount();
  }
}

function ensureNotesLiveSubscription() { /* Safe projected polling replaces whole-row Realtime. */ }

async function fetchTodayTracesNotes() {
  var today = todayISO();
  var res = await sb.from('notes')
    .select('id,content,alias,country,color,mood,created_at')
    .eq('note_date', today)
    .order('created_at', { ascending: false })
    .limit(TRACES_FETCH_LIMIT);
  return res.error ? [] : (res.data || []);
}

async function refreshTracesFromServer() {
  tracesNotes = await fetchTodayTracesNotes();
  schedulePassingTrackRebuild();
}

function schedulePassingTrackRebuild() {
  if (trackRebuildTimer) clearTimeout(trackRebuildTimer);
  trackRebuildTimer = setTimeout(rebuildPassingTrack, 120);
}

async function pollLandingUpdates() {
  var today = todayISO();
  var countRes = await sb.from('notes').select('id', { count: 'exact', head: true }).eq('note_date', today);
  if (countRes.error) return;

  var remoteCount = countRes.count || 0;
  if (remoteCount !== landingNoteCount) {
    landingNoteCount = remoteCount;
    updateLiveDayDisplay(remoteCount);
    await refreshTracesFromServer();
    await loadWorldFeeling();
    if (map && document.getElementById('map-overlay').classList.contains('open') && currentMapDate === today) {
      loadMapNotes();
    }
  }
}

function initLandingLiveSync() {
  var viewport = document.getElementById('traces-stream-viewport');
  if (viewport) {
    if (prefersReducedMotion) viewport.classList.add('reduced-motion');
    viewport.addEventListener('mouseenter', function() { viewport.classList.add('is-paused'); });
    viewport.addEventListener('mouseleave', function() { viewport.classList.remove('is-paused'); });
    viewport.addEventListener('touchstart', function() { viewport.classList.add('is-paused'); }, { passive: true });
    viewport.addEventListener('touchend', function() { viewport.classList.remove('is-paused'); }, { passive: true });
  }

  loadNotes();
  loadWorldFeeling();
  refreshTracesFromServer();
  updateLiveDayDisplay(landingNoteCount);
  ensureNotesLiveSubscription();

  if (!landingPollTimer) {
    landingPollTimer = setInterval(pollLandingUpdates, 25000);
  }

  window.addEventListener('orientationchange', function() {
    setTimeout(rebuildPassingTrack, 150);
  });
  window.addEventListener('resize', function() {
    if (viewportResizeTimer) clearTimeout(viewportResizeTimer);
    viewportResizeTimer = setTimeout(rebuildPassingTrack, 150);
  });
}

function updateTracesEmptyState() {
  var empty = document.getElementById('traces-stream-empty');
  if (!empty) return;
  empty.classList.toggle('show', !tracesNotes.length);
}

function truncateTracePreview(text) {
  var t = (text || '').trim().replace(/\s+/g, ' ');
  var max = isMobilePortrait() ? MOBILE_TRACE_PREVIEW_MAX : TRACE_PREVIEW_MAX;
  if (t.length <= max) return t;
  return t.slice(0, max - 1).trim() + '\u2026';
}

function stopMobileCrossfade() {
  if (mobileCrossfadeTimer) {
    clearTimeout(mobileCrossfadeTimer);
    mobileCrossfadeTimer = null;
  }
  if (mobileCrossfadeFadeTimer) {
    clearTimeout(mobileCrossfadeFadeTimer);
    mobileCrossfadeFadeTimer = null;
  }
}

function appendMobileVoiceElement(note, visible) {
  var stage = document.getElementById('mobile-voice-stage');
  if (!stage) return null;
  var el = buildTraceItemElement(note);
  if (visible) el.classList.add('is-visible');
  stage.appendChild(el);
  if (!visible) {
    requestAnimationFrame(function() {
      requestAnimationFrame(function() { el.classList.add('is-visible'); });
    });
  }
  return el;
}

function scheduleMobileCrossfadeStep(currentEl) {
  if (!isMobilePortrait() || tracesNotes.length < 2 || prefersReducedMotion) return;

  mobileCrossfadeTimer = setTimeout(function() {
    if (currentEl) currentEl.classList.remove('is-visible');
    mobileCrossfadeFadeTimer = setTimeout(function() {
      if (currentEl && currentEl.parentNode) currentEl.remove();
      mobileCrossfadeIndex = (mobileCrossfadeIndex + 1) % tracesNotes.length;
      var nextEl = appendMobileVoiceElement(tracesNotes[mobileCrossfadeIndex], false);
      scheduleMobileCrossfadeStep(nextEl);
    }, MOBILE_CROSSFADE_FADE_MS);
  }, MOBILE_CROSSFADE_HOLD_MS);
}

function startMobileCrossfade(resetIndex) {
  var viewport = document.getElementById('traces-stream-viewport');
  var stage = document.getElementById('mobile-voice-stage');
  if (!viewport || !stage || !isMobilePortrait()) return;

  stopMobileCrossfade();
  stage.innerHTML = '';
  viewport.classList.add('mobile-voice-mode');

  if (!tracesNotes.length) {
    stage.hidden = true;
    return;
  }

  stage.hidden = false;
  if (resetIndex) mobileCrossfadeIndex = 0;

  if (tracesNotes.length === 1 || prefersReducedMotion) {
    appendMobileVoiceElement(tracesNotes[mobileCrossfadeIndex], true);
    return;
  }

  var firstEl = appendMobileVoiceElement(tracesNotes[mobileCrossfadeIndex], true);
  scheduleMobileCrossfadeStep(firstEl);
}

function bindTraceItemClick(el, note) {
  el.setAttribute('role', 'button');
  el.setAttribute('tabindex', '0');
  el.setAttribute('aria-label', 'Open this trace on the map');
  el.addEventListener('mousedown', function(e) { e.preventDefault(); });
  el.addEventListener('pointerdown', function(e) {
    if (e.pointerType === 'mouse') e.preventDefault();
  });
  el.addEventListener('click', function(e) {
    e.preventDefault();
    e.stopPropagation();
    if (window.getSelection && window.getSelection().removeAllRanges) {
      window.getSelection().removeAllRanges();
    }
    focusTraceOnMap(note);
  });
  el.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      focusTraceOnMap(note);
    }
  });
}

function buildTraceItemElement(note) {
  var block = document.createElement('div');
  block.className = 'trace-item';

  var quote = document.createElement('div');
  quote.className = 'trace-item-quote';
  var preview = truncateTracePreview(note.content);
  quote.textContent = preview ? '\u201c' + preview + '\u201d' : '\u201c\u201d';

  var alias = document.createElement('div');
  alias.className = 'trace-item-alias';
  alias.textContent = '\u2014 ' + (note.alias || 'Anonymous');

  block.appendChild(quote);
  block.appendChild(alias);
  bindTraceItemClick(block, note);

  return block;
}

function rebuildPassingTrack() {
  var track = document.getElementById('passing-track');
  var staticWrap = document.getElementById('traces-stream-static');
  var viewport = document.getElementById('traces-stream-viewport');
  var stage = document.getElementById('mobile-voice-stage');
  if (!track || !viewport) return;

  stopMobileCrossfade();
  track.innerHTML = '';
  track.classList.remove('is-rolling');
  track.style.removeProperty('--credits-duration');
  track.style.removeProperty('--trace-gap');
  track.style.display = 'none';
  if (staticWrap) staticWrap.innerHTML = '';
  if (stage) {
    stage.innerHTML = '';
    stage.hidden = true;
  }
  viewport.classList.remove('mobile-voice-mode', 'reduced-motion');

  updateTracesEmptyState();

  if (!tracesNotes.length) return;

  if (isMobilePortrait()) {
    if (prefersReducedMotion) viewport.classList.add('reduced-motion');
    startMobileCrossfade(true);
    return;
  }

  viewport.classList.remove('reduced-motion');

  if (prefersReducedMotion) {
    viewport.classList.add('reduced-motion');
    renderStaticTraces();
    return;
  }

  var base = tracesNotes.slice();
  var loopItems = base.concat(base);

  loopItems.forEach(function(note) {
    track.appendChild(buildTraceItemElement(note));
  });

  track.style.display = 'flex';

  requestAnimationFrame(function() {
    requestAnimationFrame(function() {
      var halfHeight = track.scrollHeight / 2;
      if (!halfHeight) return;
      var vpHeight = viewport.clientHeight || 360;
      var itemGap = Math.max(Math.round(vpHeight * 1.05), 140);
      track.style.setProperty('--trace-gap', itemGap + 'px');
      var pxPerSec = 3.5;
      var duration = Math.max(72, Math.min(280, halfHeight / pxPerSec));
      track.style.setProperty('--credits-duration', duration + 's');
      track.classList.add('is-rolling');
    });
  });
}

function renderStaticTraces() {
  var wrap = document.getElementById('traces-stream-static');
  var track = document.getElementById('passing-track');
  if (!wrap) return;
  wrap.innerHTML = '';
  if (track) {
    track.innerHTML = '';
    track.classList.remove('is-rolling');
    track.style.display = 'none';
  }
  if (!tracesNotes.length) return;

  tracesNotes.slice(0, isMobilePortrait() ? 1 : 3).forEach(function(note) {
    wrap.appendChild(buildTraceItemElement(note));
  });
}

function findMapMarkerForNote(note) {
  if (!note || !mapMarkers || !mapMarkers.length) return null;
  var i, m;
  if (note.id) {
    for (i = 0; i < mapMarkers.length; i++) {
      m = mapMarkers[i];
      if (m._note && m._note.id === note.id) return m;
    }
  }
  if (note.created_at) {
    for (i = 0; i < mapMarkers.length; i++) {
      m = mapMarkers[i];
      if (m._note && m._note.created_at === note.created_at) return m;
    }
  }
  if (note.content) {
    for (i = 0; i < mapMarkers.length; i++) {
      m = mapMarkers[i];
      if (m._note && m._note.content === note.content) {
        if (!note.alias || m._note.alias === note.alias) return m;
      }
    }
  }
  return null;
}

function pulseMapMarker(marker) {
  if (!marker) return;
  var el = marker.getElement();
  if (!el) return;
  var dot = el.querySelector('.map-dot');
  if (!dot) return;
  dot.style.transform = 'scale(2.5)';
  dot.style.transition = 'transform 0.3s';
  setTimeout(function() { dot.style.transform = 'scale(1)'; }, 600);
}

async function focusTraceOnMap(note) {
  await ensureMapLibrary();
  currentMapDate = todayISO();
  document.getElementById('map-overlay').classList.add('open');
  window.location.hash = 'wall';
  var postedDate = localStorage.getItem('pinit_posted_date');
  if (postedDate) document.getElementById('find-my-note-btn').style.display = 'inline-flex';

  if (!map) initMap();
  await loadMapNotes();
  ensureNotesLiveSubscription();

  if (!note) return;

  var marker = findMapMarkerForNote(note);
  if (!marker) return;

  var latlng = marker.getLatLng();
  var flyDelay = prefersReducedMotion ? 100 : 1300;
  map.flyTo(latlng, Math.max(map.getZoom(), 5), {
    animate: !prefersReducedMotion,
    duration: prefersReducedMotion ? 0.2 : 1.2
  });
  setTimeout(function() {
    showNotePopup(marker._note, marker);
    pulseMapMarker(marker);
  }, flyDelay);
}

var mapLibraryPromise;
function ensureMapLibrary() {
  if(!mapLibraryPromise) mapLibraryPromise=import('/assets/map.js').then(function(m){window.L=m.L;});
  return mapLibraryPromise;
}
function initMap() {
  map = L.map('map', {
    center: [20, 0],
    zoom: 2,
    minZoom: 2,
    maxZoom: 10,
    zoomControl: true,
  });

  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    attribution: '© OpenStreetMap © CARTO',
    subdomains: 'abcd',
    maxZoom: 19
  }).addTo(map);

  loadMapNotes();
  subscribeToNotes();
}

function subscribeToNotes() {
  ensureNotesLiveSubscription();
}

function formatMapStatsLine(noteCount, countryCount) {
  var notes = Number(noteCount) || 0;
  var countries = Number(countryCount) || 0;
  var noteWord = notes === 1 ? 'note' : 'notes';
  var countryWord = countries === 1 ? 'country' : 'countries';
  return notes.toLocaleString() + ' ' + noteWord + ' \u00b7 ' + countries.toLocaleString() + ' ' + countryWord;
}

function updateMapStatsDisplay(noteCount, countryCount) {
  var noteCountEl = document.getElementById('map-note-count');
  var countryCountEl = document.getElementById('map-country-count');
  var pill = document.getElementById('map-stats-pill');
  var notes = (noteCount != null && !isNaN(Number(noteCount)))
    ? Number(noteCount)
    : (noteCountEl ? parseInt(noteCountEl.textContent.replace(/,/g, ''), 10) || 0 : 0);
  var countries = (countryCount != null && !isNaN(Number(countryCount)))
    ? Number(countryCount)
    : (countryCountEl ? parseInt(countryCountEl.textContent.replace(/,/g, ''), 10) || 0 : 0);
  if (noteCountEl) noteCountEl.textContent = notes.toLocaleString();
  if (countryCountEl) countryCountEl.textContent = countries.toLocaleString();
  if (pill) pill.textContent = formatMapStatsLine(notes, countries);
}

function updateMapCountryCount() {
  if (!map) return;
  var countries = new Set();
  map.eachLayer(function(layer) {
    if (layer._noteCountry) countries.add(layer._noteCountry);
  });
  var noteCountEl = document.getElementById('map-note-count');
  var noteCount = noteCountEl ? parseInt(noteCountEl.textContent.replace(/,/g, ''), 10) || 0 : 0;
  updateMapStatsDisplay(noteCount, countries.size);
}

function addNoteToMap(note) {
  var coords = COUNTRY_COORDS[note.country];
  if (!coords) return;
  var scatter = 1.5;
  note._lat = coords[0] + (Math.random() - 0.5) * scatter;
  note._lng = coords[1] + (Math.random() - 0.5) * scatter;

  var dotHtml = `<div class="map-dot" style="background:${safeColor(note.color)||'#fef08a'};"></div>`;
  var icon = L.divIcon({ className: '', html: dotHtml, iconSize: [10,10], iconAnchor: [5,5] });
  var marker = L.marker([note._lat, note._lng], { icon });
  marker._note = note;
  marker._noteCountry = note.country;
  marker._isDot = true;
  marker._isNew = true;
  marker.addTo(map);
  mapMarkers.push(marker);

  // Briefly highlight new note
  setTimeout(() => {
    var el = marker.getElement();
    if (el) {
      el.style.transition = 'transform 0.4s, opacity 0.4s';
      el.style.transform = 'scale(2.5)';
      el.style.opacity = '0.5';
      setTimeout(() => { el.style.transform = 'scale(1)'; el.style.opacity = '1'; }, 500);
    }
  }, 100);

  // If zoomed in enough, show as card immediately
  if (map.getZoom() >= NOTE_ZOOM_THRESHOLD) onZoomEnd();
}

async function loadMapNotes() {
  var dateLabel = document.getElementById('map-date-label');
  var today = new Date().toISOString().slice(0, 10);
  dateLabel.textContent = currentMapDate === today ? 'Today' : currentMapDate;
  document.getElementById('map-next-btn').style.opacity = currentMapDate === today ? '0.3' : '1';
  document.getElementById('map-next-btn').style.pointerEvents = currentMapDate === today ? 'none' : 'auto';
  var { data, error } = await sb.from('notes').select('id,content,alias,country,color,mood,created_at,note_date').eq('note_date', currentMapDate).limit(1000).order('created_at', { ascending: false });
  if (error || !data) return;
  mapNotes = data;

  var countries = new Set(data.map(n => n.country).filter(Boolean));
  updateMapStatsDisplay(data.length, countries.size);

  var mapEmpty = document.getElementById('map-empty');
  var mapEmptyTitle = document.getElementById('map-empty-title');
  var mapEmptyText = document.getElementById('map-empty-text');
  if (mapEmpty) {
    if (!data.length) {
      mapEmpty.classList.add('show');
      if (mapEmptyTitle) mapEmptyTitle.textContent = currentMapDate === today ? 'The wall is quiet' : 'A quiet day';
      if (mapEmptyText) {
        mapEmptyText.textContent = currentMapDate === today
          ? 'No notes here yet. Leave yours and help fill the map.'
          : 'This day was quiet — no notes were left on the wall.';
      }
    } else {
      mapEmpty.classList.remove('show');
    }
  }

  // Clear existing markers
  mapMarkers.forEach(m => map.removeLayer(m));
  mapMarkers = [];

  // Group notes by country
  var byCountry = {};
  data.forEach(note => {
    var c = note.country || 'Unknown';
    if (!byCountry[c]) byCountry[c] = [];
    byCountry[c].push(note);
  });

  Object.entries(byCountry).forEach(([country, notes]) => {
    var coords = COUNTRY_COORDS[country];
    if (!coords) return;

    // Scatter notes within country bounds
    notes.forEach((note, i) => {
      var scatter = 1.5;
      if (!note._lat) {
        note._lat = coords[0] + (Math.random() - 0.5) * scatter;
        note._lng = coords[1] + (Math.random() - 0.5) * scatter;
      }

      var textColor = isLightColor(safeColor(note.color)) ? '#1a1612' : '#f5f0e8';
      var mutedColor = isLightColor(safeColor(note.color)) ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.4)';

      // Build both icon styles
      var dotHtml = `<div class="map-dot" style="background:${safeColor(note.color)||'#fef08a'};"></div>`;

      var noteHtml = `<div class="map-note-card" style="background:${safeColor(note.color)||'#fef08a'};">
        <div class="map-note-pin"></div>
        <div class="map-note-text" style="color:${textColor};">${escHtml(note.content)}</div>
        <div class="map-note-footer" style="border-top-color:${textColor==='#1a1612'?'rgba(0,0,0,0.1)':'rgba(255,255,255,0.15)'};">
          <span style="color:${mutedColor};">${escHtml(note.alias)}</span>
          <span style="color:${mutedColor};">${escHtml(note.country||'Unknown')}</span>
        </div>
      </div>`;

      var icon = L.divIcon({ className: '', html: dotHtml, iconSize: [12,12], iconAnchor: [6,6] });
      var marker = L.marker([note._lat, note._lng], { icon, zIndexOffset: 0 });
      marker._note = note;
      marker._noteCountry = country;
      marker._isDot = true;

      // Click always shows note popup regardless of zoom
      marker.on('click', function() {
        var n = this._note;
        var html = buildNotePopupHtml(n);
        L.popup({ maxWidth: 240, className: 'note-popup-wrap', closeButton: true })
          .setLatLng(this.getLatLng())
          .setContent(html)
          .openOn(map);
      });

      marker.addTo(map);
      mapMarkers.push(marker);
    });
  });

  // Listen to zoom and switch between dot and card icons
  map.off('zoomend', onZoomEnd);
  map.on('zoomend', onZoomEnd);
  onZoomEnd();
}

var NOTE_ZOOM_THRESHOLD = 999; // Disabled — notes shown on click instead

function onZoomEnd() {
  var z = map.getZoom();
  var showCards = z >= NOTE_ZOOM_THRESHOLD;
  mapMarkers.forEach(marker => {
    var note = marker._note;
    if (!note) return;
    var textColor = isLightColor(safeColor(note.color)) ? '#1a1612' : '#f5f0e8';
    var mutedColor = isLightColor(safeColor(note.color)) ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.4)';
    if (showCards && marker._isDot) {
      var noteHtml = buildNoteCardHtml(note, textColor, mutedColor);
      var cardIcon = L.divIcon({ className: '', html: noteHtml, iconSize: [160,10], iconAnchor: [80,5] });
      marker.setIcon(cardIcon);
      marker._isDot = false;
    } else if (!showCards && !marker._isDot) {
      var dotHtml = `<div class="map-dot" style="background:${safeColor(note.color)||'#fef08a'};"></div>`;
      var dotIcon = L.divIcon({ className: '', html: dotHtml, iconSize: [13,13], iconAnchor: [6,6] });
      marker.setIcon(dotIcon);
      marker._isDot = true;
    }
  });
}

function buildNoteCardHtml(note, textColor, mutedColor) {
  return `<div class="map-note-card" style="background:${safeColor(note.color)||'#fef08a'};">
    <div class="map-note-pin"></div>
    <div class="map-note-text" style="color:${textColor};">${escHtml(note.content)}</div>
    <div class="map-note-footer" style="border-top-color:${textColor==='#1a1612'?'rgba(0,0,0,0.1)':'rgba(255,255,255,0.15)'};">
      <span style="color:${mutedColor};">${escHtml(note.alias)}</span>
      <span style="color:${mutedColor};">${escHtml(note.country||'Unknown')}</span>
    </div>
  </div>`;
}

function showNotePopup(note, marker) {
  L.popup({ maxWidth: 240, className: 'note-popup-wrap', closeButton: true, autoClose: true })
    .setLatLng(marker.getLatLng())
    .setContent(buildNotePopupHtml(note))
    .openOn(map);
}

function isLightColor(hex) {
  if (!hex || hex[0] !== '#') return true;
  var r = parseInt(hex.slice(1,3),16);
  var g = parseInt(hex.slice(3,5),16);
  var b = parseInt(hex.slice(5,7),16);
  return (r*299 + g*587 + b*114) / 1000 > 128;
}




function isLightBg(hex) {
  if (!hex || hex[0] !== '#') return true;
  var r = parseInt(hex.slice(1,3),16);
  var g = parseInt(hex.slice(3,5),16);
  var b = parseInt(hex.slice(5,7),16);
  return (r*299 + g*587 + b*114) / 1000 > 128;
}

// Auto-open map if URL has #wall
if (window.location.hash === '#wall') {
  document.addEventListener('DOMContentLoaded', () => openMap());
}
if (window.location.hash === '#archive') {
  document.addEventListener('DOMContentLoaded', () => openArchive());
}

// ---- ARCHIVE ----
var currentArchiveDate = new Date().toISOString().slice(0, 10);
var ARCHIVE_NOTE_LIMIT = 500;

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function formatArchiveHeading(iso) {
  if (iso === todayISO()) return 'Today, the world is saying&hellip;';
  var d = new Date(iso + 'T12:00:00Z');
  var formatted = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  return 'On ' + formatted + ', the world said&hellip;';
}

function formatArchiveMeta(count, countries) {
  if (!count) return 'No traces were left on this day.';
  var c = countries || 0;
  return count.toLocaleString() + ' trace' + (count === 1 ? '' : 's') +
    ' from ' + c + ' countr' + (c === 1 ? 'y' : 'ies');
}

function getArchiveDayMood(notes) {
  var counts = {};
  var total = 0;
  notes.forEach(function(n) {
    if (!n.mood) return;
    counts[n.mood] = (counts[n.mood] || 0) + 1;
    total++;
  });
  if (!total) return null;
  var top = Object.keys(counts).sort(function(a, b) { return counts[b] - counts[a]; })[0];
  return { label: moodLabel(top), total: total };
}

function updateArchiveNavButtons() {
  var today = todayISO();
  var nextBtn = document.getElementById('archive-next-btn');
  var dateInput = document.getElementById('archive-date-input');
  if (dateInput) {
    dateInput.max = today;
    dateInput.value = currentArchiveDate;
  }
  if (nextBtn) {
    var atToday = currentArchiveDate >= today;
    nextBtn.disabled = atToday;
    nextBtn.style.opacity = atToday ? '0.35' : '1';
  }
}

function openArchive(date) {
  currentArchiveDate = date || todayISO();
  document.getElementById('archive-overlay').classList.add('open');
  window.location.hash = 'archive';
  updateArchiveNavButtons();
  loadArchiveNotes();
}

function closeArchive() {
  document.getElementById('archive-overlay').classList.remove('open');
  if (window.location.hash === '#archive') {
    history.pushState('', document.title, window.location.pathname);
  }
  scrollPanelToTop();
}

function changeArchiveDate(dir) {
  var d = new Date(currentArchiveDate + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + dir);
  var next = d.toISOString().slice(0, 10);
  if (next > todayISO()) return;
  currentArchiveDate = next;
  updateArchiveNavButtons();
  loadArchiveNotes();
}

function onArchiveDatePick(value) {
  if (!value || value > todayISO()) return;
  currentArchiveDate = value;
  updateArchiveNavButtons();
  loadArchiveNotes();
}

function openMapFromArchive() {
  var date = currentArchiveDate;
  closeArchive();
  openMap(date);
}

function renderArchiveCard(note) {
  var color = safeColor(note.color) || '#fef08a';
  var light = isLightBg(color);
  var tc = light ? '#1a1612' : '#f5f0e8';
  var mc = light ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.5)';
  var bc = light ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.15)';
  var moodHtml = note.mood
    ? '<span class="archive-card-mood" style="color:' + mc + ';">' + escHtml(moodLabel(note.mood)) + '</span>'
    : '';
  return '<article class="archive-card" style="background:' + escHtml(color) + ';">' +
    '<div class="archive-card-text" style="color:' + tc + ';">' + escHtml(note.content) + '</div>' +
    '<div class="archive-card-footer" style="border-top-color:' + bc + ';">' +
      '<span class="archive-card-alias" style="color:' + mc + ';">' + escHtml(note.alias || 'Anonymous') + '</span>' +
      moodHtml +
      '<span class="archive-card-country" style="color:' + mc + ';">' + escHtml(note.country || 'Unknown') + '</span>' +
    '</div></article>';
}

async function loadArchiveNotes() {
  var content = document.getElementById('archive-content');
  var heading = document.getElementById('archive-heading');
  var meta = document.getElementById('archive-meta');
  var dayMood = document.getElementById('archive-day-mood');
  var limitNote = document.getElementById('archive-limit-note');

  content.innerHTML = '<div class="archive-loading">Loading archive&hellip;</div>';
  heading.innerHTML = formatArchiveHeading(currentArchiveDate);
  meta.textContent = '';
  if (dayMood) { dayMood.style.display = 'none'; dayMood.textContent = ''; }
  if (limitNote) limitNote.style.display = 'none';

  var res = await sb.from('notes')
    .select('content,alias,country,color,mood', { count: 'exact' })
    .eq('note_date', currentArchiveDate)
    .order('created_at', { ascending: false })
    .limit(ARCHIVE_NOTE_LIMIT);

  if (res.error) {
    content.innerHTML = '<div class="archive-empty"><h3>Could not load archive</h3><p>We couldn&rsquo;t reach the archive right now. Check your connection and try again.</p></div>';
    return;
  }

  var notes = res.data || [];
  var totalCount = res.count != null ? res.count : notes.length;
  var countries = new Set(notes.map(function(n) { return n.country; }).filter(Boolean)).size;

  meta.textContent = formatArchiveMeta(totalCount, countries);

  var moodSummary = getArchiveDayMood(notes);
  if (dayMood && moodSummary) {
    dayMood.textContent = 'That day felt mostly ' + moodSummary.label.toLowerCase() +
      ' (' + moodSummary.total + ' shared mood' + (moodSummary.total === 1 ? '' : 's') + ')';
    dayMood.style.display = 'block';
  }

  if (limitNote && totalCount > ARCHIVE_NOTE_LIMIT) {
    limitNote.textContent = 'Showing the most recent ' + ARCHIVE_NOTE_LIMIT + ' of ' + totalCount.toLocaleString() + ' traces.';
    limitNote.style.display = 'block';
  }

  if (!notes.length) {
    content.innerHTML = '<div class="archive-empty"><h3>A quiet day</h3><p>No one left a note on this date. Try another day, or explore today&rsquo;s live wall.</p></div>';
    return;
  }

  content.innerHTML = '<div class="archive-grid">' + notes.map(renderArchiveCard).join('') + '</div>';
}

init();



(function initPwa() {
  var INSTALL_DISMISS_KEY = 'pinit_install_dismissed';
  var deferredPrompt = null;

  function isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  }

  function isIos() {
    return /iphone|ipad|ipod/i.test(navigator.userAgent);
  }

  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    var host = location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') return;
    window.addEventListener('load', function() {
      navigator.serviceWorker.register('/service-worker.js').catch(function() {});
    });
  }

  function hideInstallPrompt() {
    var el = document.getElementById('install-prompt');
    if (el) el.hidden = true;
  }

  function showInstallPrompt(message, showInstallBtn) {
    if (localStorage.getItem(INSTALL_DISMISS_KEY)) return;
    if (isStandalone()) return;
    var el = document.getElementById('install-prompt');
    var text = document.getElementById('install-prompt-text');
    var btn = document.getElementById('install-prompt-action');
    if (!el || !text) return;
    text.textContent = message;
    if (btn) btn.hidden = !showInstallBtn;
    el.hidden = false;
  }

  function initInstallPrompt() {
    if (isStandalone()) return;

    var dismiss = document.getElementById('install-prompt-dismiss');
    var action = document.getElementById('install-prompt-action');

    if (dismiss) {
      dismiss.addEventListener('click', function() {
        localStorage.setItem(INSTALL_DISMISS_KEY, '1');
        hideInstallPrompt();
      });
    }

    window.addEventListener('beforeinstallprompt', function(e) {
      e.preventDefault();
      deferredPrompt = e;
      showInstallPrompt('Install Pinit for quick access.', true);
    });

    if (action) {
      action.addEventListener('click', function() {
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        deferredPrompt.userChoice.finally(function() {
          deferredPrompt = null;
          hideInstallPrompt();
        });
      });
    }

    if (isIos()) {
      setTimeout(function() {
        showInstallPrompt('Add via Share \u2192 Home Screen.', false);
      }, 3000);
    }
  }

  registerServiceWorker();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initInstallPrompt);
  } else {
    initInstallPrompt();
  }
})();

function startGlobe() { import('/assets/globe.js').catch(function(){}); }
if('requestIdleCallback' in window) requestIdleCallback(startGlobe,{timeout:2000}); else setTimeout(startGlobe,800);
document.addEventListener('click',function(event){
 var button=event.target.closest('[data-color],[data-mood],[data-report-id]'); if(!button) return;
 if(button.dataset.color) selectColor(button.dataset.color,button);
 if(button.dataset.mood) selectMood(button.dataset.mood,button);
 if(button.dataset.reportId) reportNote(button.dataset.reportId,button);
});

document.querySelector('[data-control="control-0"]').addEventListener("click",function(event){openModal();});
document.querySelector('[data-control="control-1"]').addEventListener("click",function(event){openMap();});
document.querySelector('[data-control="control-2"]').addEventListener("click",function(event){openArchive();});
document.querySelector('[data-control="control-3"]').addEventListener("click",function(event){openMyTraceOnMap();});
document.querySelector('[data-control="control-4"]').addEventListener("click",function(event){openInfoModal('about');});
document.querySelector('[data-control="control-5"]').addEventListener("click",function(event){openInfoModal('howitworks');});
document.querySelector('[data-control="control-6"]').addEventListener("click",function(event){openInfoModal('privacy');});
document.querySelector('[data-control="control-7"]').addEventListener("click",function(event){openInfoModal('rules');});
document.querySelector('[data-control="control-8"]').addEventListener("click",function(event){closeInfoModal();});
document.querySelector('[data-control="control-9"]').addEventListener("click",function(event){changeMapDate(-1);});
document.querySelector('[data-control="control-10"]').addEventListener("click",function(event){changeMapDate(1);});
document.querySelector('[data-control="control-11"]').addEventListener("click",function(event){closeMap();});
document.querySelector('[data-control="control-12"]').addEventListener("click",function(event){findMyNote();});
document.querySelector('[data-control="control-13"]').addEventListener("click",function(event){closeMap();});
document.querySelector('[data-control="control-14"]').addEventListener("click",function(event){changeArchiveDate(-1);});
document.querySelector('[data-control="control-15"]').addEventListener("change",function(event){onArchiveDatePick(this.value);});
document.querySelector('[data-control="control-16"]').addEventListener("click",function(event){changeArchiveDate(1);});
document.querySelector('[data-control="control-17"]').addEventListener("click",function(event){openMapFromArchive();});
document.querySelector('[data-control="control-18"]').addEventListener("click",function(event){closeArchive();});
document.querySelector('[data-control="control-19"]').addEventListener("click",function(event){closeModal();});
document.querySelector('[data-control="control-20"]').addEventListener("input",function(event){onNoteInput(this);});
document.querySelector('[data-control="control-21"]').addEventListener("input",function(event){document.getElementById('preview-alias').textContent=this.value||'Your name';});
document.querySelector('[data-control="control-22"]').addEventListener("click",function(event){submitNote();});
document.querySelector('[data-control="control-23"]').addEventListener("click",function(event){closeShare();});
document.querySelector('[data-control="control-24"]').addEventListener("click",function(event){copyShareText();});
document.querySelector('[data-control="control-25"]').addEventListener("click",function(event){shareNative();});
document.querySelector('[data-control="control-26"]').addEventListener("click",function(event){downloadShareCard();});
document.querySelector('[data-control="control-27"]').addEventListener("click",function(event){closeShareAndMap();});
document.querySelector('[data-control="control-28"]').addEventListener("click",function(event){closeShare();});
