require('dotenv').config();
const express = require('express'), path = require('path'), bcrypt = require('bcryptjs'), jwt = require('jsonwebtoken');
const { Pool, types } = require('pg');
types.setTypeParser(1082, v => v);
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: process.env.VERCEL ? 2 : 10, idleTimeoutMillis: 10000 });
const q = (s, p) => pool.query(s, p).then(r => r.rows);
const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));
const w = f => (req, res) => f(req, res).catch(e => res.status(400).json({ error: e.message }));
const log = (u, a, d) => q('insert into audit_logs(username,action,detail) values($1,$2,$3)', [u, a, d]).catch(() => {});

// table: [group, title, fields[name,label,type], readRoles, writeRoles]  ('*'=everyone, ''=admin only, null=read-only)
const DAYS = 'sel:Monday,Tuesday,Wednesday,Thursday,Friday,Saturday,Sunday';
const M = {
  patients: ['Clinical', 'Patients', [['code', 'ID', 'ro'], ['name', 'Name'], ['age', 'Age', 'number'], ['gender', 'Gender', 'sel:Male,Female,Other'], ['blood_group', 'Blood Group', 'sel:A+,A-,B+,B-,O+,O-,AB+,AB-'], ['phone', 'Phone'], ['address', 'Address']], '*', 'receptionist,nurse,doctor'],
  doctors: ['Clinical', 'Doctors', [['code', 'ID', 'ro'], ['name', 'Name'], ['department_id', 'Department', 'ref:departments:name'], ['specialization', 'Specialization'], ['phone', 'Phone']], '*', ''],
  schedules: ['Clinical', 'Doctor Schedules', [['doctor_id', 'Doctor', 'ref:doctors:name'], ['day_of_week', 'Day', DAYS], ['start_time', 'From', 'time'], ['end_time', 'To', 'time']], '*', 'receptionist'],
  appointments: ['Clinical', 'Appointments', [['patient_id', 'Patient', 'ref:patients:name'], ['doctor_id', 'Doctor', 'ref:doctors:name'], ['appt_date', 'Date', 'date'], ['appt_time', 'Time', 'time'], ['reason', 'Reason'], ['status', 'Status', 'sel:Scheduled,Confirmed,Rescheduled,Completed,Cancelled']], 'doctor,nurse,receptionist', 'receptionist,doctor'],
  admissions: ['Clinical', 'Inpatient / Outpatient', [['patient_id', 'Patient', 'ref:patients:name'], ['doctor_id', 'Doctor', 'ref:doctors:name'], ['type', 'Type', 'sel:Outpatient,Inpatient'], ['room', 'Room / Bed'], ['admit_date', 'Admit Date', 'date'], ['discharge_date', 'Discharge Date', 'date'], ['status', 'Status', 'sel:Admitted,Discharged']], 'doctor,nurse,receptionist,accountant', 'doctor,nurse,receptionist'],
  medical_records: ['Clinical', 'Medical Records', [['patient_id', 'Patient', 'ref:patients:name'], ['doctor_id', 'Doctor', 'ref:doctors:name'], ['visit_date', 'Visit Date', 'date'], ['diagnosis', 'Diagnosis', 'area'], ['treatment', 'Treatment', 'area'], ['notes', 'Notes', 'area']], 'doctor,nurse', 'doctor'],
  documents: ['Clinical', 'Patient Documents', [['patient_id', 'Patient', 'ref:patients:name'], ['title', 'Title'], ['file_data', 'File (max 1 MB)', 'file'], ['file_name', '', 'hide']], 'doctor,nurse,lab', 'doctor,nurse,lab'],
  lab_tests: ['Services', 'Laboratory', [['patient_id', 'Patient', 'ref:patients:name'], ['doctor_id', 'Requested By', 'ref:doctors:name'], ['test_name', 'Test'], ['price', 'Price (LKR)', 'number'], ['status', 'Status', 'sel:Requested,Sample Collected,Result Entered,Completed'], ['sample_date', 'Sample Date', 'date'], ['result', 'Result', 'area'], ['file_data', 'Lab Report File (PDF/image, optional, max 1 MB)', 'file'], ['file_name', '', 'hide']], 'doctor,nurse,lab,accountant', 'doctor,lab'],
  medicines: ['Services', 'Pharmacy Inventory', [['name', 'Medicine'], ['stock', 'Stock', 'number'], ['unit_price', 'Unit Price (LKR)', 'number'], ['expiry_date', 'Expiry Date', 'date'], ['reorder_level', 'Reorder Level', 'number']], 'doctor,pharmacist', 'pharmacist'],
  prescriptions: ['Services', 'Prescriptions', [['patient_id', 'Patient', 'ref:patients:name'], ['doctor_id', 'Doctor', 'ref:doctors:name'], ['items', 'Medicines', 'ro'], ['notes', 'Notes', 'area'], ['status', 'Status', 'ro'], ['file_data', 'Attachment (image/PDF, optional, max 1 MB)', 'file'], ['file_name', '', 'hide']], 'doctor,nurse,pharmacist', 'doctor'],
  bills: ['Finance', 'Billing', [['code', 'Bill No', 'ro'], ['patient_id', 'Patient', 'ref:patients:name'], ['category', 'Category', 'sel:Consultation,Laboratory,Pharmacy,Admission'], ['description', 'Description'], ['amount', 'Amount (LKR)', 'number'], ['status', 'Status (auto)', 'ro']], 'accountant,receptionist', 'accountant'],
  payments: ['Finance', 'Payments', [['bill_id', 'Bill No', 'ref:bills:description'], ['amount', 'Amount (LKR)', 'number'], ['method', 'Method', 'sel:Cash,Card,Bank Transfer'], ['paid_on', 'Date', 'date']], 'accountant', 'accountant'],
  employees: ['HR', 'Employees', [['code', 'ID', 'ro'], ['name', 'Name'], ['designation', 'Designation'], ['department_id', 'Department', 'ref:departments:name'], ['phone', 'Phone'], ['joined_date', 'Joined', 'date']], '', ''],
  attendance: ['HR', 'Attendance', [['employee_id', 'Employee', 'ref:employees:name'], ['att_date', 'Date', 'date'], ['status', 'Status', 'sel:Present,Absent,Late']], '', ''],
  leaves: ['HR', 'Leave Records', [['employee_id', 'Employee', 'ref:employees:name'], ['from_date', 'From', 'date'], ['to_date', 'To', 'date'], ['reason', 'Reason'], ['status', 'Status', 'sel:Pending,Approved,Rejected']], '', ''],
  departments: ['Admin', 'Departments', [['name', 'Name'], ['description', 'Description']], '*', ''],
  users: ['Admin', 'Users', [['username', 'Username'], ['role_id', 'Role', 'ref:roles:name'], ['doctor_id', 'Linked Doctor (doctor logins only)', 'ref:doctors:name'], ['active', 'Active', 'sel:Yes,No'], ['password', 'Password (blank = unchanged)', 'password']], '', ''],
  roles: ['Admin', 'Roles', [['name', 'Role']], '', ''],
  audit_logs: ['Admin', 'Audit Logs', [['username', 'User', 'ro'], ['action', 'Action', 'ro'], ['detail', 'Detail', 'ro'], ['created_at', 'Time', 'ro']], '', null]
};
const ORDER = ['roles', 'departments', 'patients', 'doctors', 'users', 'schedules', 'appointments', 'admissions', 'medical_records', 'lab_tests', 'medicines', 'prescriptions', 'prescription_items', 'bills', 'payments', 'employees', 'attendance', 'leaves', 'documents'];
const RP = {
  patients: ['Patient Report', "select to_char(created_at,'YYYY-MM') as month, gender, count(*) as patients from patients group by 1,2 order by 1 desc", 'doctor,receptionist'],
  appointments: ['Appointment Report', 'select appt_date, status, count(*) as appointments from appointments group by 1,2 order by 1 desc', 'doctor,receptionist'],
  revenue: ['Revenue Report', 'select b.category, sum(b.amount) as billed_lkr, coalesce(sum(p.paid),0) as collected_lkr from bills b left join (select bill_id,sum(amount) paid from payments group by bill_id) p on p.bill_id=b.id group by 1', 'accountant'],
  pharmacy: ['Pharmacy Report', "select name, stock, expiry_date, case when stock<=reorder_level then 'Low stock' when expiry_date<current_date+30 then 'Expiring / expired' else 'OK' end as alert from medicines order by name", 'pharmacist'],
  laboratory: ['Laboratory Report', 'select test_name, status, count(*) as tests, sum(price) as value_lkr from lab_tests group by 1,2 order by 1', 'lab,doctor'],
  staff: ['Staff Report', "select e.name, e.designation, count(a.id) filter (where a.status='Present') as present, count(a.id) filter (where a.status='Absent') as absent, (select count(*) from leaves l where l.employee_id=e.id and l.status='Approved') as approved_leaves from employees e left join attendance a on a.employee_id=e.id group by e.id order by e.name", '']
};
const can = (role, t, m) => { if (role === 'admin') return m === 'r' || M[t][4] !== null; const s = M[t][m === 'r' ? 3 : 4]; return s === '*' || (s || '').split(',').includes(role); };
const allow = (t, m) => (req, res, next) => can(req.user.role, t, m) ? next() : res.status(403).json({ error: 'Access denied for your role' });
const adm = (req, res, next) => req.user.role === 'admin' ? next() : res.status(403).json({ error: 'Admin only' });
const auth = (req, res, next) => { try { req.user = jwt.verify((req.headers.authorization || '').split(' ')[1], process.env.JWT_SECRET); next(); } catch { res.status(401).json({ error: 'Session expired. Please log in again.' }); } };
const CODE = { patients: 'P', doctors: 'D', employees: 'E', bills: 'B' };
const sel = (t, where = '') => {
  let j = '', s = 't.*';
  if (CODE[t]) s += `,'${CODE[t]}-'||lpad(t.id::text,4,'0') as code`;
  if (t === 'prescriptions') s += ",(select string_agg(m.name||' x'||i.quantity||coalesce(' ('||i.dosage||')',''),', ') from prescription_items i join medicines m on m.id=i.medicine_id where i.prescription_id=t.id) as items,(select coalesce(json_agg(json_build_object('medicine_id',i.medicine_id,'quantity',i.quantity,'dosage',i.dosage)),'[]'::json) from prescription_items i where i.prescription_id=t.id) as items_json";
  M[t][2].forEach(([n, , ty = 'text'], i) => { if (ty.startsWith('ref:')) { const [, rt, rc] = ty.split(':'); j += ` left join ${rt} r${i} on r${i}.id=t.${n}`; s += `,${CODE[rt] ? `'${CODE[rt]}-'||lpad(r${i}.id::text,4,'0')||coalesce(' · '||r${i}.${rc},'')` : `r${i}.${rc}`} as ${n}_label`; } });
  return `select ${s} from ${t} t${j} ${where} order by t.id desc limit 1000`;
};

const fails = {};
app.post('/api/login', w(async (req, res) => {
  const key = String(req.body.username || '').toLowerCase(), f = fails[key] || { n: 0, until: 0 };
  if (f.until > Date.now()) return res.status(429).json({ error: 'Too many failed attempts. Try again in 15 minutes.' });
  const [u] = await q('select u.*,r.name role from users u join roles r on r.id=u.role_id where username=$1', [req.body.username]);
  if (!u || u.active !== 'Yes' || !(await bcrypt.compare(req.body.password || '', u.password_hash))) { f.n++; if (f.n >= 5) { f.n = 0; f.until = Date.now() + 15 * 60e3; } fails[key] = f; log(req.body.username, 'LOGIN FAILED', ''); return res.status(401).json({ error: 'Invalid username or password' }); }
  delete fails[key]; log(u.username, 'LOGIN', '');
  res.json({ token: jwt.sign({ id: u.id, username: u.username, role: u.role, doctor_id: u.doctor_id }, process.env.JWT_SECRET, { expiresIn: '30m' }) });
}));
app.get('/api/me', auth, (req, res) => res.json({ username: req.user.username, role: req.user.role,
  modules: Object.keys(M).filter(k => can(req.user.role, k, 'r')).map(k => ({ key: k, g: M[k][0], t: M[k][1], f: M[k][2], w: can(req.user.role, k, 'w') })),
  reports: Object.entries(RP).filter(([, r]) => req.user.role === 'admin' || r[2].split(',').includes(req.user.role)).map(([k, r]) => [k, r[0]]) }));
app.post('/api/password', auth, w(async (req, res) => {
  const [u] = await q('select * from users where id=$1', [req.user.id]);
  if (!(await bcrypt.compare(req.body.old || '', u.password_hash))) throw new Error('Current password is wrong');
  if ((req.body.new || '').length < 8) throw new Error('New password must be at least 8 characters');
  await q('update users set password_hash=$1 where id=$2', [await bcrypt.hash(req.body.new, 10), u.id]); log(u.username, 'PASSWORD CHANGED', ''); res.json({ ok: true });
}));
app.get('/api/stats', auth, w(async (req, res) => res.json((await q(`select (select count(*) from patients) patients,(select count(*) from appointments where appt_date=current_date and status<>'Cancelled') today,(select coalesce(sum(amount),0) from payments) revenue,(select coalesce(sum(amount),0) from bills) billed,(select count(*) from lab_tests where status<>'Completed') labs,(select count(*) from medicines where stock<=reorder_level or expiry_date<current_date+30) alerts,(select count(*) from admissions where status='Admitted') admitted,(select count(*) from prescriptions where status='Pending') rx,(select count(*) from bills where status<>'Paid') unpaid,(select count(*) from lab_tests where status='Requested') new_labs,(select count(*) from appointments where doctor_id=$1 and appt_date=current_date and status<>'Cancelled') my_today,(select count(*) from appointments where doctor_id=$1 and appt_date>=current_date and status in ('Scheduled','Confirmed','Rescheduled')) my_upcoming`, [req.user.doctor_id || 0]))[0])));
app.get('/api/reports/:k', auth, w(async (req, res) => { const r = RP[req.params.k]; if (!r || !(req.user.role === 'admin' || r[2].split(',').includes(req.user.role))) throw new Error('Not allowed'); res.json(await q(r[1])); }));
app.get('/api/patients/:id/history', auth, w(async (req, res) => { const h = {}; for (const t of ['appointments', 'admissions', 'medical_records', 'lab_tests', 'prescriptions', 'documents', 'bills']) if (can(req.user.role, t, 'r')) h[t] = await q(sel(t, 't.patient_id=$1'.replace(/^/, 'where ')), [req.params.id]); res.json(h); }));
app.get('/api/bills/:id/invoice', auth, allow('bills', 'r'), w(async (req, res) => { const [b] = await q('select b.*,\'B-\'||lpad(b.id::text,4,\'0\') as code,p.name patient from bills b join patients p on p.id=b.patient_id where b.id=$1', [req.params.id]); b.payments = await q('select * from payments where bill_id=$1 order by id', [b.id]); res.json(b); }));

const PRE = {
  async appointments(b, id) {
    if (!b.appt_date || b.status === 'Cancelled') return;
    const [s] = await q("select 1 from schedules where doctor_id=$1 and day_of_week=trim(to_char($2::date,'Day')) and $3::time between start_time and end_time", [b.doctor_id, b.appt_date, b.appt_time]);
    if (!s) throw new Error("Doctor is not scheduled at that day/time. Add the doctor's schedule first.");
    const [c] = await q("select 1 from appointments where doctor_id=$1 and appt_date=$2 and appt_time=$3 and status<>'Cancelled' and id<>$4", [b.doctor_id, b.appt_date, b.appt_time, id || 0]);
    if (c) throw new Error('This time slot is already booked.');
  },
  async prescriptions(b, id) {
    let o;
    if (id) { [o] = await q('select status from prescriptions where id=$1', [id]); if (o && o.status === 'Dispensed' && !b.dispense) throw new Error('Dispensed prescriptions cannot be changed'); }
    else if (!(b.items || []).some(i => i.medicine_id) && !b.file_data) throw new Error('Add at least one medicine line or attach a file');
    if (!b.dispense || (o && o.status === 'Dispensed')) return;
    const it = (await q('select * from prescription_items where prescription_id=$1', [id])).filter(i => i.medicine_id);
    for (const i of it) { const [m] = await q('select name,stock from medicines where id=$1', [i.medicine_id]); if (!m || m.stock < i.quantity) throw new Error('Insufficient stock for ' + (m ? m.name : 'a medicine')); }
    for (const i of it) await q('update medicines set stock=stock-$1 where id=$2', [i.quantity, i.medicine_id]);
  }
};
const after = async (t, req, act, id, old) => {
  log(req.user.username, act, t + ' #' + id);
  if (t === 'prescriptions' && req.body.items) { await q('delete from prescription_items where prescription_id=$1', [id]); for (const i of req.body.items) if (i.medicine_id) await q('insert into prescription_items(prescription_id,medicine_id,quantity,dosage) values($1,$2,$3,$4)', [id, i.medicine_id, i.quantity || 1, i.dosage || null]); }
  if (t === 'payments') { const bid = old ? old.bill_id : (await q('select bill_id from payments where id=$1', [id]))[0].bill_id;
    await q("update bills b set status=case when (select coalesce(sum(amount),0) from payments where bill_id=b.id)>=b.amount then 'Paid' when (select coalesce(sum(amount),0) from payments where bill_id=b.id)>0 then 'Partially Paid' else 'Unpaid' end where id=$1", [bid]); }
};
const own = (req, t) => req.user.role === 'doctor' && req.user.doctor_id && ['appointments', 'schedules'].includes(t) ? `where t.doctor_id=${+req.user.doctor_id}` : '';
app.post('/api/prescriptions/:id/dispense', auth, (req, res, next) => ['pharmacist', 'admin'].includes(req.user.role) ? next() : res.status(403).json({ error: 'Pharmacists only' }), w(async (req, res) => {
  await PRE.prescriptions({ dispense: true }, req.params.id);
  await q("update prescriptions set status='Dispensed' where id=$1", [req.params.id]);
  await after('prescriptions', req, 'DISPENSE', req.params.id); res.json({ ok: true });
}));
Object.keys(M).forEach(t => {
  const cols = M[t][2].filter(f => !['ro', 'password'].includes(f[2])).map(f => f[0]).concat(t === 'users' ? ['password_hash'] : []);
  app.get('/api/' + t, auth, allow(t, 'r'), w(async (req, res) => { const r = await q(sel(t, own(req, t))); r.forEach(x => delete x.password_hash); res.json(r); }));
  if (M[t][4] === null) return;
  const prep = async (b, id) => { if (t === 'users' && b.password) b.password_hash = await bcrypt.hash(b.password, 10); if (PRE[t]) await PRE[t](b, id); return cols.filter(x => x in b); };
  app.post('/api/' + t, auth, allow(t, 'w'), w(async (req, res) => {
    const b = req.body, k = await prep(b);
    const r = await q(`insert into ${t}(${k}) values(${k.map((_, i) => '$' + (i + 1))}) returning id`, k.map(x => b[x]));
    await after(t, req, 'CREATE', r[0].id); res.status(201).json(r[0]);
  }));
  app.put('/api/' + t + '/:id', auth, allow(t, 'w'), w(async (req, res) => {
    const b = req.body, k = await prep(b, req.params.id);
    await q(`update ${t} set ${k.map((x, i) => x + '=$' + (i + 1))} where id=$${k.length + 1}`, [...k.map(x => b[x]), req.params.id]);
    await after(t, req, 'UPDATE', req.params.id); res.json({ ok: true });
  }));
  app.delete('/api/' + t + '/:id', auth, allow(t, 'w'), w(async (req, res) => {
    const [o] = await q(`select * from ${t} where id=$1`, [req.params.id]);
    await q(`delete from ${t} where id=$1`, [req.params.id]); await after(t, req, 'DELETE', req.params.id, o); res.json({ ok: true });
  }));
});

const snap = async () => { const d = {}; for (const t of ORDER) d[t] = await q(`select * from ${t}`); return d; };
const saveSnap = async () => { await q('insert into backups(data) values($1)', [await snap()]); await q('delete from backups where id not in (select id from backups order by id desc limit 7)'); };
app.get('/api/backup', auth, adm, w(async (req, res) => { log(req.user.username, 'BACKUP DOWNLOAD', ''); res.json(await snap()); }));
app.post('/api/backup-now', auth, adm, w(async (req, res) => { await saveSnap(); res.json({ ok: true }); }));
app.post('/api/restore', auth, adm, w(async (req, res) => {
  const d = req.body.latest ? (await q('select data from backups order by id desc limit 1'))[0].data : req.body, c = await pool.connect();
  try {
    await c.query('begin'); await c.query(`truncate ${ORDER} restart identity cascade`);
    for (const t of ORDER) for (const r of d[t] || []) { const k = Object.keys(r); await c.query(`insert into ${t}(${k}) values(${k.map((_, i) => '$' + (i + 1))})`, k.map(x => r[x])); }
    for (const t of ORDER) await c.query(`select setval(pg_get_serial_sequence('${t}','id'),coalesce(max(id),1)) from ${t}`);
    await c.query('commit'); log('system', 'RESTORE', req.user.username); res.json({ ok: true });
  } catch (e) { await c.query('rollback'); throw e; } finally { c.release(); }
}));
if (!process.env.VERCEL) setInterval(async () => { const [b] = await q("select 1 from backups where created_at>now()-interval '24 hours'"); if (!b) saveSnap().catch(console.error); }, 3600e3);

(async () => {
  if (!(await q('select 1 from users limit 1')).length) {
    await q("insert into users(username,password_hash,role_id) select 'admin',$1,id from roles where name='admin'", [await bcrypt.hash(process.env.ADMIN_PASSWORD, 10)]);
    console.log('Admin user created');
  }
})().catch(e => console.error('Startup error:', e.message));
if (require.main === module) app.listen(process.env.PORT || 3000, () => console.log('HMS running'));
module.exports = app;
