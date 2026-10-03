# Hospital Management System (HMS)

A web-based system that centralises hospital operations: patient registration, doctor schedules, appointments, electronic medical records, laboratory, pharmacy, billing and payments, inpatient/outpatient admissions, staff management, and reports. Built to the supplied Software Specification Document.

**Live demo:** https://hospital-management-system-seven-drab-47.vercel.app/
*(logins are provided separately.)*

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | HTML5, CSS, vanilla JavaScript (responsive, blue theme) |
| Backend | Node.js, Express.js (REST API) |
| Database | PostgreSQL on Supabase |
| Authentication | JWT (30-minute sessions) |
| Password security | bcrypt algorithm (via `bcryptjs`) |
| API testing | Postman |
| Hosting | Vercel (app) and Supabase (database), both on free plans |

## Features

- **Patients:** register, update, search, unique IDs (`P-0001`), document upload, and a profile page with the full medical history in one place.
- **Doctors and schedules:** doctor records (`D-0001`), weekly schedules, department assignment.
- **Appointments:** booking, rescheduling, cancelling, status tracking, double-booking and schedule checks, weekly calendar view.
- **Inpatient / outpatient:** admissions, room/bed, discharge.
- **Medical records:** diagnosis, treatment history, notes.
- **Prescriptions:** several medicine lines per prescription, optional image/PDF attachment, pharmacist dispensing that deducts stock.
- **Laboratory:** test requests, sample collection, result entry, report file upload, printable report.
- **Pharmacy:** medicine inventory, stock levels, expiry and low-stock alerts.
- **Billing:** bills by category (consultation, laboratory, pharmacy, admission), payments, automatic Paid / Partially Paid status, printable invoices and receipts (LKR).
- **Staff:** employees (`E-0001`), attendance, leave records.
- **Reports:** patient, appointment, revenue, pharmacy, laboratory and staff reports.
- **Dashboard:** role-specific summary cards.

## Roles and Access

| Role | Main access |
|---|---|
| Administrator | Everything, including users, audit logs, backup and restore |
| Doctor | Own appointments and schedule, medical records, prescriptions, lab requests, admissions |
| Nurse | Patients, admissions, documents; views records, prescriptions, lab results |
| Receptionist | Patients, appointments, schedules, admissions; views bill status |
| Laboratory staff | Lab tests, results and report files |
| Pharmacist | Medicine inventory; views and dispenses prescriptions |
| Accountant | Bills, payments, invoices, receipts, revenue report |

Access is enforced on the server for every API route, not only hidden in the menu.

## Security

- Passwords hashed with bcrypt; JWT login; role-based access control
- Audit log of logins, failed logins, and every create / update / delete
- Automatic session timeout (30-minute token, 15-minute inactivity logout)
- Temporary lockout after 5 failed logins
- Backup download, restore from file, and daily database snapshots (when running as a normal server)

## Project Structure

```
server.js          Express app, routes, access rules
api/index.js       Entry point for Vercel
vercel.json        Vercel configuration
schema.sql         Full database schema
public/            Frontend (index.html, style.css, app.js)
migration*.sql     Upgrade scripts for databases created from earlier versions
.env.example       Environment variable template
```

## Run Locally

1. Install **Node.js (LTS)**.
2. Create a free project at **supabase.com**. In the SQL Editor, run the contents of `schema.sql`.
3. Copy `.env.example` to `.env` and fill in:
   - `DATABASE_URL`: Supabase connection string (Session pooler). Encode special characters in the password (for example `@` becomes `%40`).
   - `JWT_SECRET`: a long random text
   - `ADMIN_PASSWORD`: password for the first `admin` account
4. Install and start:
   ```
   npm install
   npm start
   ```
5. Open http://localhost:3000 and log in as `admin`. Create staff accounts under **Admin → Users**, and link each doctor login to its doctor record.

## Deployment

Deployed on **Vercel** from this repository. Set `DATABASE_URL` (Supabase Transaction pooler), `JWT_SECRET` and `ADMIN_PASSWORD` as environment variables. Every push to `main` redeploys automatically.

## API

REST API under `/api`. Log in with `POST /api/login`, then send the returned token as `Authorization: Bearer <token>`. Each module (`patients`, `doctors`, `appointments`, `bills`, and so on) supports `GET`, `POST`, `PUT /:id` and `DELETE /:id`, subject to the user's role.

## Known Limitations

- Uploaded files are stored in the database and limited to 1 MB.
- The login lockout is held in server memory and is best-effort on serverless hosting.
- Automatic daily snapshots run only on a normal server; on Vercel use **Backup Now** or **Download Backup**.
- High availability is not provided on free hosting plans.

## Future Enhancements

Patient portal, SMS and email notifications, telemedicine, insurance integration, AI decision support, biometric authentication, cloud scaling.

## Author

K.G.L.Mihara
