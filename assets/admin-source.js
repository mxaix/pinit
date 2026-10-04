

let allNotes = [];
let reportCounts = {};
let pendingDeleteId = null;


function getAuthHeaders() { return {}; }

async function login() {
  const pw = document.getElementById('password-input').value;
  const loginError = document.getElementById('login-error');
  loginError.classList.remove('show');

  try {
    const r = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ password: pw })
    });
    const data = await r.json().catch(() => ({}));

    if (!r.ok || !data.ok) {
      loginError.textContent = data.error || 'Login failed';
      loginError.classList.add('show');
      document.getElementById('password-input').value = '';
      document.getElementById('password-input').focus();
      return;
    }

    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('admin-panel').style.display = 'block';
    loadNotes();
  } catch (e) {
    loginError.textContent = 'Login failed. Please try again.';
    loginError.classList.add('show');
  }
}

async function logout() {
  try {
    const r = await fetch('/api/admin/logout', { method: 'POST', credentials: 'same-origin' });
    if (!r.ok) { showToast('Could not log out. Please retry.'); return; }
  } catch (e) { showToast('Could not log out. Please retry.'); return; }
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('admin-panel').style.display = 'none';
  document.getElementById('password-input').value = '';
  document.getElementById('login-error').textContent = 'Incorrect password';
}

async function loadNotes() {
  document.getElementById('table-status').innerHTML = '<div class="loading">Loading notes...</div>';
  document.getElementById('notes-tbody').innerHTML = '';

  try {
    const r = await fetch('/api/admin/notes', {
      headers: getAuthHeaders(),
      credentials: 'same-origin'
    });
    const data = await r.json().catch(() => ({}));

    if (!r.ok) {
      if (r.status === 401) {
        logout();
        return;
      }
      document.getElementById('table-status').innerHTML = '<div class="empty">Failed to load notes.</div>';
      return;
    }

    const notes = Array.isArray(data.notes) ? data.notes : [];
    reportCounts = data.reportCounts && typeof data.reportCounts === 'object' ? data.reportCounts : {};
    allNotes = notes;
    document.getElementById('table-status').innerHTML = '';
    document.getElementById('total-notes').textContent = notes.length.toLocaleString();
    const countries = [...new Set(notes.map(n => n.country).filter(Boolean))].sort();
    document.getElementById('total-countries').textContent = countries.length;
    const sel = document.getElementById('country-filter');
    sel.innerHTML = '<option value="">All countries</option>';
    countries.forEach(c => { const o = document.createElement('option'); o.value = c; o.textContent = c; sel.appendChild(o); });
    applyFilters();
  } catch (e) {
    document.getElementById('table-status').innerHTML = '<div class="empty">Failed to load notes.</div>';
  }
}

function applyFilters() {
  const search = document.getElementById('search-input').value.toLowerCase();
  const country = document.getElementById('country-filter').value;
  const status = document.getElementById('status-filter').value;
  let filtered = allNotes;
  if (country) filtered = filtered.filter(n => n.country === country);
  if (status === 'live') filtered = filtered.filter(n => !n.hidden);
  if (status === 'hidden') filtered = filtered.filter(n => n.hidden);
  if (status === 'reported') filtered = filtered.filter(n => (reportCounts[n.id] || 0) > 0);
  if (search) filtered = filtered.filter(n =>
    (n.content || '').toLowerCase().includes(search) ||
    (n.alias || '').toLowerCase().includes(search) ||
    (n.mood || '').toLowerCase().includes(search) ||
    (n.country || '').toLowerCase().includes(search)
  );
  document.getElementById('showing-count').textContent = filtered.length;
  renderTable(filtered);
}

function renderTable(notes) {
 const tbody=document.getElementById('notes-tbody'); tbody.replaceChildren();
 document.getElementById('table-status').textContent=notes.length ? '' : 'No notes match your search.';
 notes.forEach(n=>{
  const tr=document.createElement('tr'); if(n.hidden) tr.className='row-hidden';
  const cell=(text,cls)=>{const td=document.createElement('td'); const div=document.createElement('div'); div.className=cls || ''; div.textContent=String(text ?? ''); td.append(div); tr.append(td); return div;};
  const dot=cell('', 'note-color-dot'); dot.style.background=/^#[a-f0-9]{6}$/i.test(n.color || '') ? n.color : '#f7c948';
  cell(n.content,'note-content'); cell(n.alias,'note-alias'); cell(n.mood || '—','note-mood'); cell(n.country || 'Unknown','note-country');
  cell(n.hidden ? 'Hidden' : 'Live',n.hidden ? 'status-hidden' : 'status-live');
  cell(reportCounts[n.id] || '—','report-count'); cell(formatDate(n.created_at),'note-date');
  const td=document.createElement('td'); td.className='action-cell';
  const toggle=document.createElement('button'); toggle.className=n.hidden ? 'restore-btn':'hide-btn'; toggle.textContent=n.hidden ? 'Restore':'Hide'; toggle.addEventListener('click',()=>setNoteHidden(n.id,!n.hidden));
  const del=document.createElement('button'); del.className='delete-btn'; del.textContent='Delete'; del.addEventListener('click',()=>openConfirm(n.id,n.content));
  td.append(toggle,del); tr.append(td); tbody.append(tr);
 });
}

function openConfirm(id, content) {
  pendingDeleteId = id;
  document.getElementById('confirm-preview').textContent = content;
  document.getElementById('confirm-overlay').classList.add('open');
}

function closeConfirm() {
  pendingDeleteId = null;
  document.getElementById('confirm-overlay').classList.remove('open');
}

async function setNoteHidden(id, hidden) {
  try {
    const r = await fetch('/api/admin/notes', {
      method: 'PATCH',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ id, hidden })
    });
    if (!r.ok) {
      if (r.status === 401) { logout(); return; }
      showToast(hidden ? 'Hide failed.' : 'Restore failed.');
      return;
    }
    const note = allNotes.find(n => n.id === id);
    if (note) {
      note.hidden = hidden;
      note.hidden_at = hidden ? new Date().toISOString() : null;
    }
    showToast(hidden ? 'Note hidden from public view.' : 'Note restored to public view.');
    applyFilters();
  } catch (e) {
    showToast(hidden ? 'Hide failed.' : 'Restore failed.');
  }
}

async function confirmDelete() {
  if (!pendingDeleteId) return;

  try {
    const r = await fetch('/api/admin/notes?id=' + encodeURIComponent(pendingDeleteId), {
      method: 'DELETE',
      headers: getAuthHeaders(),
      credentials: 'same-origin'
    });

    if (!r.ok) {
      if (r.status === 401) {
        logout();
        return;
      }
      showToast('Delete failed. Try again.');
      closeConfirm();
      return;
    }

    allNotes = allNotes.filter(n => n.id !== pendingDeleteId);
    closeConfirm();
    showToast('Note deleted.');
    applyFilters();
    document.getElementById('total-notes').textContent = allNotes.length.toLocaleString();
  } catch (e) {
    showToast('Delete failed. Try again.');
    closeConfirm();
  }
}

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3000);
}

function escHtml(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

async function restoreSession() {
  try {
    const r = await fetch('/api/admin/check', {
      headers: getAuthHeaders(),
      credentials: 'same-origin'
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data.authenticated) {
      logout();
      return;
    }
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('admin-panel').style.display = 'block';
    loadNotes();
  } catch (e) {
    logout();
  }
}

restoreSession();

// Close confirm on backdrop click
document.getElementById('confirm-overlay').addEventListener('click', function(e) {
  if (e.target === this) closeConfirm();
});

document.querySelector('[data-control="control-0"]').addEventListener("keydown",function(event){if(event.key==='Enter') login();});
document.querySelector('[data-control="control-1"]').addEventListener("click",function(event){login();});
document.querySelector('[data-control="control-2"]').addEventListener("click",function(event){logout();});
document.querySelector('[data-control="control-3"]').addEventListener("input",function(event){applyFilters();});
document.querySelector('[data-control="control-4"]').addEventListener("change",function(event){applyFilters();});
document.querySelector('[data-control="control-5"]').addEventListener("change",function(event){applyFilters();});
document.querySelector('[data-control="control-6"]').addEventListener("click",function(event){loadNotes();});
document.querySelector('[data-control="control-7"]').addEventListener("click",function(event){closeConfirm();});
document.querySelector('[data-control="control-8"]').addEventListener("click",function(event){confirmDelete();});