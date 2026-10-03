const $ = s => document.querySelector(s), E = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let token = localStorage.token, me, meta = [], cur, rows = [], idle, prof, MED = [];
async function api(p, m = 'GET', b) {
  const r = await fetch('/api/' + p, { method: m, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: b && JSON.stringify(b) });
  const d = await r.json();
  if (r.status === 401 && token) logout();
  if (!r.ok) throw new Error(d.error);
  return d;
}
async function login() { try { const d = await api('login', 'POST', { username: $('#u').value, password: $('#p').value }); token = localStorage.token = d.token; start(); } catch (e) { $('#err').textContent = e.message; } }
function logout() { localStorage.removeItem('token'); token = null; $('#p').value = ''; start(); }
async function start() {
  $('#login').hidden = !!token; $('#app').hidden = !token; if (!token) return;
  try { me = await api('me'); } catch { return; }
  meta = me.modules; let n = `<h2>HMS</h2><small>${E(me.username)} (${me.role})</small><a data-v="dashboard" onclick="view('dashboard')">Dashboard</a>`, g = '';
  meta.forEach(m => { if (m.g !== g) { g = m.g; n += `<div class="grp">${g}</div>`; } n += `<a data-v="${m.key}" onclick="view('${m.key}')">${m.t}</a>`; });
  n += '<div class="grp">System</div>';
  if (me.reports.length) n += '<a data-v="reports" onclick="view(\'reports\')">Reports</a>';
  if (me.role === 'admin') n += '<a data-v="backup" onclick="view(\'backup\')">Backup &amp; Recovery</a>';
  $('nav').innerHTML = n + '<a onclick="pw()">Change Password</a><a class="out" onclick="logout()">Logout</a>';
  view('dashboard');
}
const cols = m => m.f.filter(f => !['hide', 'password'].includes(f[2]));
function cell(f, x) {
  const [n, , t = 'text'] = f; if (t === 'file') return x[n] ? `<a href="${E(x[n])}" download="${E(x.file_name)}">Download</a>` : '';
  let v = t.startsWith('ref:') ? x[n + '_label'] : x[n];
  if (typeof v === 'string' && /^\d{4}-\d\d-\d\dT/.test(v)) v = v.slice(0, 16).replace('T', ' ');
  return E(v);
}
function acts(x) {
  const k = cur.key; let a = '';
  if (k === 'patients') a += `<a onclick="openProfile(${x.id})">Profile</a>`;
  if (k === 'bills') a += `<a onclick="invoice(${x.id})">Invoice</a>`;
  if (k === 'prescriptions' && x.status === 'Pending' && ['pharmacist', 'admin'].includes(me.role)) a += `<a onclick="dispense(${x.id})">Dispense</a>`;
  if (k === 'lab_tests' && x.result) a += `<a onclick="labReport(${x.id})">Print Report</a>`;
  if (k === 'payments') a += `<a onclick="receipt(${x.id})">Print Receipt</a>`;
  if (cur.w) { a += `<a onclick="openForm(${x.id})">${k === 'appointments' ? 'Reschedule' : 'Edit'}</a>`; if (k === 'appointments' && x.status !== 'Cancelled') a += `<a onclick="cancelAppt(${x.id})">Cancel</a>`; a += `<a onclick="del(${x.id})">Delete</a>`; }
  return a;
}
const tbl = (m, r, a) => `<table><tr>${cols(m).map(f => `<th>${f[1]}</th>`).join('')}${a ? '<th></th>' : ''}</tr>${r.map(x => `<tr>${cols(m).map(f => `<td>${cell(f, x)}</td>`).join('')}${a ? `<td>${acts(x)}</td>` : ''}</tr>`).join('')}</table>`;
async function view(v) {
  prof = null;
  document.querySelectorAll('nav a[data-v]').forEach(a => a.classList.toggle('on', a.dataset.v === v));
  if (v === 'dashboard') {
    const s = await api('stats');
    const all = { patients: ['Total Patients', s.patients], today: ["Today's Appointments", s.today], revenue: ['Revenue Collected', 'LKR ' + Number(s.revenue).toFixed(2)], out: ['Outstanding Bills', 'LKR ' + (s.billed - s.revenue).toFixed(2)], labs: ['Pending Lab Requests', s.labs], alerts: ['Pharmacy Alerts', s.alerts], my_today: ['My Appointments Today', s.my_today], my_upcoming: ['My Upcoming Appointments', s.my_upcoming], admitted: ['Admitted Inpatients', s.admitted], rx: ['Prescriptions to Dispense', s.rx], unpaid: ['Unpaid Bills', s.unpaid], new_labs: ['Awaiting Sample Collection', s.new_labs] };
    const show = { admin: ['patients', 'today', 'revenue', 'out', 'labs', 'alerts'], doctor: ['my_today', 'my_upcoming', 'labs'], receptionist: ['today', 'patients', 'admitted'], nurse: ['admitted', 'today', 'labs'], lab: ['new_labs', 'labs'], pharmacist: ['alerts', 'rx'], accountant: ['revenue', 'out', 'unpaid'] }[me.role] || ['patients'];
    let h = `<h2>Dashboard</h2><div class="cards">${show.map(k => `<div class="card"><span>${all[k][0]}</span><b>${all[k][1]}</b></div>`).join('')}</div>`;
    if (me.role === 'doctor') {
      const [ap, sc] = await Promise.all([api('appointments'), api('schedules')]), t0 = new Date().toLocaleDateString('en-CA'), mm = k => meta.find(m => m.key === k);
      h += `<h4>Upcoming Appointments</h4>${tbl(mm('appointments'), ap.filter(x => x.appt_date >= t0 && x.status !== 'Cancelled').reverse().slice(0, 10))}<h4>My Schedule</h4>${tbl(mm('schedules'), sc)}`;
    }
    $('#main').innerHTML = h; return;
  }
  if (v === 'reports') return reports(); if (v === 'backup') return backup();
  cur = meta.find(m => m.key === v); rows = await api(v);
  $('#main').innerHTML = `<div class="bar"><h2>${cur.t}</h2><input id="s" placeholder="Search..." oninput="draw()">${v === 'appointments' ? '<button class="ghost" onclick="calendar()">Calendar View</button>' : ''}${cur.w ? '<button onclick="openForm()">+ Add New</button>' : ''}</div><div id="tbl"></div>`; draw();
}
function draw() { const k = ($('#s').value || '').toLowerCase(); $('#tbl').innerHTML = tbl(cur, rows.filter(x => JSON.stringify(x).toLowerCase().includes(k)), 1); }
async function opts(t) { const [k, v, c] = t.split(':'); return k === 'ref' ? [['', '—'], ...(await api(v)).map(r => [r.id, r.code ? r.code + (r[c] ? ' · ' + r[c] : '') : r[c]])] : v.split(',').map(x => [x, x]); }
async function openForm(id) {
  const x = rows.find(r => r.id === id) || {}; let h = '';
  for (const [n, l, t = 'text'] of cur.f) {
    if (t === 'hide' || t === 'ro') continue;
    if (prof && n === 'patient_id') { h += `<input type="hidden" name="patient_id" value="${prof.id}">`; continue; }
    h += `<label>${l}`;
    if (t === 'area') h += `<textarea name="${n}">${E(x[n])}</textarea>`;
    else if (t.includes(':')) h += `<select name="${n}">${(await opts(t)).map(([v, s]) => `<option value="${E(v)}" ${v == x[n] ? 'selected' : ''}>${E(s)}</option>`).join('')}</select>`;
    else h += `<input name="${n}" type="${t}" step="any" ${t === 'file' ? '' : `value="${E(t === 'password' ? '' : x[n])}"`}>`;
    h += '</label>';
  }
  if (cur.key === 'prescriptions') { MED = await opts('ref:medicines:name'); h += `<h4>Medicines</h4><div id="lines">${(x.items_json || [{}]).map(lineHtml).join('')}</div><a onclick="addLine()" style="cursor:pointer;color:var(--pri-d)">+ Add medicine line</a><br><br>`; }
  $('#modal').innerHTML = `<div class="box ${cur.key === 'prescriptions' ? 'wide' : ''}"><h3>${id ? 'Edit' : 'Add'} ${cur.t}</h3><div id="f">${h}</div><div class="act"><button class="ghost" onclick="cancelM()">Cancel</button><button onclick="save(${id || 0})">Save</button></div></div>`;
  $('#modal').classList.add('open');
}
function closeM() { $('#modal').classList.remove('open'); }
async function save(id) {
  const b = {};
  for (const e of document.querySelectorAll('#f [name]')) {
    if (e.type === 'file') { const f = e.files[0]; if (f) { if (f.size > 1e6) return alert('File too large (max 1 MB)'); b.file_data = await new Promise(r => { const R = new FileReader(); R.onload = () => r(R.result); R.readAsDataURL(f); }); b.file_name = f.name; } }
    else b[e.name] = e.value || null;
  }
  if (cur.key === 'prescriptions') b.items = [...document.querySelectorAll('.line')].map(l => ({ medicine_id: l.querySelector('.im').value, quantity: l.querySelector('.iq').value, dosage: l.querySelector('.idg').value }));
  try { await api(cur.key + (id ? '/' + id : ''), id ? 'PUT' : 'POST', b); closeM(); refresh(); } catch (e) { alert(e.message); }
}
async function del(id) { if (confirm('Delete this record?')) try { await api(cur.key + '/' + id, 'DELETE'); refresh(); } catch (e) { alert(e.message); } }
async function cancelAppt(id) { if (confirm('Cancel this appointment?')) { await api('appointments/' + id, 'PUT', { status: 'Cancelled' }); refresh(); } }
async function invoice(id) {
  const b = await api('bills/' + id + '/invoice'), paid = b.payments.reduce((s, p) => s + Number(p.amount), 0), w = open('', '_blank');
  w.document.write(`<body style="font-family:Segoe UI,Arial;max-width:600px;margin:30px auto;color:#33475b"><h2>Hospital Invoice ${b.code}</h2><p>Patient: ${E(b.patient)}<br>Date: ${E(b.created_at).slice(0, 10)}<br>Category: ${E(b.category)}</p><table width="100%" border="1" cellpadding="8" style="border-collapse:collapse"><tr><td>${E(b.description)}</td><td align="right">LKR ${Number(b.amount).toFixed(2)}</td></tr><tr><td>Paid</td><td align="right">LKR ${paid.toFixed(2)}</td></tr><tr><th align="left">Balance</th><th align="right">LKR ${(b.amount - paid).toFixed(2)}</th></tr></table><br><button onclick="print()">Print</button></body>`); w.document.close();
}
function reports() { $('#main').innerHTML = `<div class="bar"><h2>Reports</h2><select id="rp" onchange="runReport()" style="width:260px;margin:0">${me.reports.map(r => `<option value="${r[0]}">${r[1]}</option>`).join('')}</select><button onclick="print()">Print</button></div><div id="tbl"></div>`; runReport(); }
async function runReport() { const r = await api('reports/' + $('#rp').value); $('#tbl').innerHTML = r.length ? `<table><tr>${Object.keys(r[0]).map(k => `<th>${E(k.replace(/_/g, ' '))}</th>`).join('')}</tr>${r.map(x => `<tr>${Object.values(x).map(v => `<td>${E(v)}</td>`).join('')}</tr>`).join('')}</table>` : '<p>No data.</p>'; }
function backup() { $('#main').innerHTML = `<h2>Backup &amp; Recovery</h2><p>An automatic snapshot is saved every 24 hours (last 7 kept).</p><div class="act" style="justify-content:flex-start"><button onclick="bk()">Download Backup</button><button onclick="api('backup-now','POST').then(()=>alert('Snapshot saved'))">Backup Now</button><button class="ghost" onclick="rs(1)">Restore Latest Snapshot</button></div><h4>Restore from a backup file</h4><input type="file" id="rf" accept=".json" style="width:300px"><button class="ghost" onclick="rs()">Restore File</button>`; }
async function bk() { const d = await api('backup'), a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(d)], { type: 'application/json' })); a.download = 'hms-backup-' + new Date().toISOString().slice(0, 10) + '.json'; a.click(); }
async function rs(latest) { if (!confirm('This replaces ALL current data. Continue?')) return; try { await api('restore', 'POST', latest ? { latest: 1 } : JSON.parse(await $('#rf').files[0].text())); alert('Restore complete. Please log in again.'); logout(); } catch (e) { alert(e.message); } }
async function pw() { const o = prompt('Current password'), n = o && prompt('New password (min 8 characters)'); if (n) try { await api('password', 'POST', { old: o, new: n }); alert('Password changed'); } catch (e) { alert(e.message); } }
['click', 'keydown', 'mousemove'].forEach(e => addEventListener(e, () => { clearTimeout(idle); if (token) idle = setTimeout(() => { alert('Logged out due to inactivity'); logout(); }, 15 * 60e3); }));
const refresh = async () => { if (!prof) return view(cur.key); if (cur.key === 'patients') { prof.p = (await api('patients')).find(r => r.id === prof.id); return openProfile(prof.id, prof.tab, prof.p); } return openProfile(prof.id, cur.key); };
const lineHtml = i => `<div class="line"><select class="im">${MED.map(([v, s]) => `<option value="${E(v)}" ${v == i.medicine_id ? 'selected' : ''}>${E(s)}</option>`).join('')}</select><input class="iq" type="number" min="1" value="${i.quantity || 1}" title="Quantity"><input class="idg" placeholder="Dosage, e.g. 1-0-1 for 5 days" value="${E(i.dosage)}"><a onclick="this.parentNode.remove()">✕</a></div>`;
const addLine = () => $('#lines').insertAdjacentHTML('beforeend', lineHtml({}));
async function openProfile(id, tab, p) {
  const h = await api('patients/' + id + '/history'), keys = Object.keys(h); prof = { id, p: p || (prof && prof.p) || rows.find(r => r.id === id) };
  tab = keys.includes(tab) ? tab : keys[0]; prof.tab = tab; cur = meta.find(m => m.key === tab); rows = h[tab]; const P = prof.p;
  document.querySelectorAll('nav a[data-v]').forEach(x => x.classList.toggle('on', x.dataset.v === 'patients'));
  $('#main').innerHTML = `<div class="bar"><h2>${E(P.name)} <small style="color:var(--mut)">${E(P.code)}</small></h2>${meta.find(m => m.key === 'patients').w ? '<button onclick="editPatient()">Edit Details</button>' : ''}<button class="ghost" onclick="view('patients')">← Back to Patients</button></div>
  <div class="prof">${[['Age', P.age], ['Gender', P.gender], ['Blood Group', P.blood_group], ['Phone', P.phone], ['Address', P.address]].map(x => `<span>${x[0]}: <b>${E(x[1])}</b></span>`).join('')}</div>
  <div class="tabs">${keys.map(k => `<a class="${k === tab ? 'on' : ''}" onclick="openProfile(${id},'${k}')">${meta.find(m => m.key === k).t}</a>`).join('')}</div>
  <div class="bar"><h4 style="flex:1;margin:0">${cur.t}</h4>${cur.w ? '<button onclick="openForm()">+ Add</button>' : ''}</div><div id="tbl">${tbl(cur, rows, 1)}</div>`;
}

async function dispense(id) { if (confirm('Dispense this prescription and deduct stock?')) try { await api('prescriptions/' + id + '/dispense', 'POST', {}); refresh(); } catch (e) { alert(e.message); } }
function labReport(id) {
  const x = rows.find(r => r.id === id), w = open('', '_blank');
  w.document.write(`<body style="font-family:Segoe UI,Arial;max-width:650px;margin:30px auto;color:#33475b"><h2>Laboratory Report</h2><p>Patient: ${E(x.patient_id_label)}<br>Requested by: ${E(x.doctor_id_label)}<br>Sample date: ${E(x.sample_date)}<br>Test: <b>${E(x.test_name)}</b></p><h4>Result</h4><pre style="white-space:pre-wrap;font:inherit;border:1px solid #d8e2ee;padding:12px">${E(x.result)}</pre><br><button onclick="print()">Print</button></body>`); w.document.close();
}
addEventListener('unhandledrejection', e => { e.preventDefault(); const m = $('#main'); if (m) m.insertAdjacentHTML('afterbegin', `<p style="color:#b5616b">Error: ${E(e.reason && e.reason.message)}</p>`); });
function editPatient() { cur = meta.find(m => m.key === 'patients'); rows = [prof.p]; openForm(prof.p.id); }
function cancelM() { closeM(); if (prof && cur.key === 'patients') openProfile(prof.id, prof.tab); }
async function receipt(id) {
  const x = rows.find(r => r.id === id), b = await api('bills/' + x.bill_id + '/invoice'), w = open('', '_blank');
  const paid = b.payments.filter(p => p.id <= x.id).reduce((s, p) => s + Number(p.amount), 0);
  w.document.write(`<body style="font-family:Segoe UI,Arial;max-width:560px;margin:30px auto;color:#33475b"><h2>Payment Receipt R-${String(x.id).padStart(4, '0')}</h2><p>Patient: ${E(b.patient)}<br>Bill: ${E(b.code)} (${E(b.category)})<br>Date: ${E(x.paid_on)}<br>Method: ${E(x.method)}</p><table width="100%" border="1" cellpadding="8" style="border-collapse:collapse"><tr><th align="left">Amount received</th><th align="right">LKR ${Number(x.amount).toFixed(2)}</th></tr><tr><td>Bill total</td><td align="right">LKR ${Number(b.amount).toFixed(2)}</td></tr><tr><td>Balance after this payment</td><td align="right">LKR ${(b.amount - paid).toFixed(2)}</td></tr></table><br><button onclick="print()">Print</button></body>`); w.document.close();
}
async function calendar(off = 0, doc = '') {
  const [ap, sc, dr] = await Promise.all([api('appointments'), api('schedules'), api('doctors')]); doc = doc || (dr[0] && dr[0].id);
  const mon = new Date(); mon.setDate(mon.getDate() - ((mon.getDay() + 6) % 7) + off * 7);
  const days = [...Array(7)].map((_, i) => { const d = new Date(mon); d.setDate(mon.getDate() + i); return d; }), nm = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  $('#main').innerHTML = `<div class="bar"><h2>Appointment Calendar</h2><select onchange="calendar(${off},this.value)" style="width:240px;margin:0">${dr.map(d => `<option value="${d.id}" ${d.id == doc ? 'selected' : ''}>${E(d.code)} · ${E(d.name)}</option>`).join('')}</select><button class="ghost" onclick="calendar(${off - 1},${doc})">‹ Prev</button><button class="ghost" onclick="calendar(0,${doc})">This Week</button><button class="ghost" onclick="calendar(${off + 1},${doc})">Next ›</button><button onclick="view('appointments')">List View</button></div>
  <div class="cal">${days.map((d, i) => { const k = d.toLocaleDateString('en-CA'), hrs = sc.filter(z => z.doctor_id == doc && z.day_of_week === nm[i]).map(z => z.start_time.slice(0, 5) + '–' + z.end_time.slice(0, 5)).join(', '), list = ap.filter(z => z.doctor_id == doc && z.appt_date === k && z.status !== 'Cancelled').sort((p, q) => p.appt_time.localeCompare(q.appt_time));
    return `<div class="day"><b>${nm[i].slice(0, 3)} ${k.slice(5)}</b><small>${hrs || 'Not scheduled'}</small>${list.map(z => `<div class="ev">${z.appt_time.slice(0, 5)} · ${E(z.patient_id_label)}<br><small>${E(z.status)}</small></div>`).join('')}</div>`; }).join('')}</div>`;
}
start();
