# Careers CRM addition
Open careers.html through the Careers applications link in dashboard.html. Existing app.js and styles.css are unchanged. The only dashboard change is the new link.

Deploy careers.html, careers.js, careers.css and careers-roles.js alongside the existing CRM files and updated dashboard.html.

Database setup: after the two application migrations, run D:/apptitude-nexxt/supabase/migrations/202611150003_career_crm.sql in the project's Supabase SQL Editor. This has not been applied remotely. It creates a private reviewer allowlist and an authenticated listing RPC. At installation it copies existing user_progress.is_admin accounts into the reviewer list. Review that list in Supabase before launch. Future reviewer changes must be made by a trusted database administrator in career_reviewers; removing ordinary CRM admin status does not automatically remove recruitment access. Remove that user's reviewer row too.

Applicant data remains inaccessible to anonymous users and signed-in non-reviewers. This feature is read-only: it does not change application status or delete submissions. It supports server-side search, role/status filtering, 25-row pagination and full submitted details. Resume links are restricted to HTTPS.

Local tests use mocked Supabase responses for desktop/mobile display, details, text escaping, pagination, empty and denied states. Live database authorization and listing require verification after migration installation.
