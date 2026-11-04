# PaisaTrack — Mac setup guide

PaisaTrack is a Next.js + TypeScript + Supabase starter application. The included working MVP provides:
- Multi-user email/password authentication
- User-isolated PostgreSQL data using Row Level Security
- Income and expense transactions
- Monthly dashboard totals
- Category spending chart
- Transaction search, edit and soft-delete
- CSV import (simple CSV format)
- Realtime refresh for transaction and budget table changes
- Database schema for budgets, savings, credit cards, loans/EMI, recurring rules, imports, notifications and audit logs

**Important scope note:** The database includes the foundation tables for advanced modules, but full credit-card statement reconciliation, amortization schedules, recurring job execution, XLSX import, PDF reports and advanced analytics are not yet implemented in this starter. Do not treat this as a complete accounting or banking product until those workflows and their tests are built.

## 1. Install prerequisites on macOS

1. Install Node.js LTS (Node 22 recommended): https://nodejs.org/
2. Install Git: `xcode-select --install` in Terminal if Git is missing.
3. Use VS Code or another editor: https://code.visualstudio.com/
4. Create a free Supabase project: https://supabase.com/

Verify in Terminal:

```bash
node -v
npm -v
git --version
```

## 2. Extract the project

Download `paisatrack.zip`, double-click it in Finder, then open Terminal and run:

```bash
cd ~/Downloads/paisatrack
```

If you extracted it elsewhere, drag the `paisatrack` folder into Terminal after typing `cd `.

Open the project in VS Code:

```bash
code .
```

If `code` is not found, open VS Code, choose **File → Open Folder**, and select the project folder.

## 3. Create Supabase project and database

1. Sign in to Supabase and create a new project.
2. Choose a strong database password and save it securely.
3. Wait for the project to finish provisioning.
4. Open **SQL Editor → New query**.
5. Open `supabase/schema.sql` from this project.
6. Copy the complete SQL file into the SQL Editor and run it.
7. Open **Project Settings → API** (or the API keys section in project settings).
8. Copy the Project URL and the publishable/anon client key. Never use the `service_role` key in browser code.

If the SQL script reports that the Realtime publication already contains a table, check the publication configuration and enable `transactions` and `budgets` through Database → Publications. Do not blindly rerun a partially applied script without checking which statements succeeded.

## 4. Configure authentication

In Supabase:
1. Open **Authentication → Providers**.
2. Ensure Email provider is enabled.
3. For local development, you may temporarily disable email confirmation to test quickly. Before public launch, enable email confirmation and configure SMTP.
4. Under **Authentication → URL Configuration**, set Site URL to `http://localhost:3000`.
5. Add `http://localhost:3000/**` to allowed redirect URLs if required by the dashboard.

## 5. Add environment variables

In Terminal, from the project folder:

```bash
cp .env.example .env.local
```

Open `.env.local` and fill in:

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_PUBLISHABLE_OR_ANON_KEY
```

Do not commit `.env.local`. It is excluded by `.gitignore`.

## 6. Install packages and run

```bash
npm install
npm run dev
```

Open:

```text
http://localhost:3000
```

Create an account, sign in, and add an income or expense. The starter includes global categories seeded by the SQL script.

## 7. CSV import format

The first version supports CSV with these exact headers:

```csv
title,amount,transaction_type,category,transaction_date,payment_method
Salary,60600,income,Salary,2026-11-01,bank_transfer
Groceries,1250,expense,Food & Groceries,2026-11-02,upi
Petrol,900,expense,Transport / Petrol,2026-11-02,upi
```

Requirements:
- `transaction_type` must be `income` or `expense`.
- `category` must exactly match an available category name for that type.
- Dates must be `YYYY-MM-DD`.
- Amounts must be positive with at most two decimal places.
- This starter's CSV parser is intentionally simple; avoid commas inside quoted fields. A production importer should use a standards-compliant CSV parser, staging rows, duplicate detection, preview, and atomic commit.
- XLSX is not yet wired into the UI.

## 8. Build check

```bash
npm run build
```

Resolve any TypeScript or build errors before deployment.

## 9. Publish to GitHub

Create a private GitHub repository, then:

```bash
git init
git add .
git commit -m "Initial PaisaTrack application"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/paisatrack.git
git push -u origin main
```

Do not add `.env.local` to GitHub.

## 10. Deploy to Vercel

1. Sign in at https://vercel.com/
2. Import the GitHub repository.
3. Select Next.js as the framework (usually detected automatically).
4. Add the same two environment variables in Vercel → Project → Settings → Environment Variables.
5. Deploy.
6. Copy the deployed HTTPS URL.
7. In Supabase Authentication → URL Configuration, set the production Site URL to that deployed URL and add the production callback/redirect URL.
8. Test signup, login, create/edit/delete transactions and Realtime from two browsers/devices.

## 11. Before inviting other users

Do not launch publicly until you have:
- Tested RLS with two separate accounts.
- Tested all ownership relationships and category/account foreign keys.
- Added rate limits and monitoring.
- Added proper CSV parser and duplicate detection.
- Implemented XLSX and PDF generation if required.
- Implemented full credit card, EMI, recurring and savings workflows.
- Implemented audit trail via trusted server/database logic.
- Implemented account balance ledger and balanced journal entries if presenting balances/net worth.
- Set up backup and restore tests.
- Added privacy policy, terms, account deletion and data export workflows.
- Reviewed Supabase and Vercel plan limits and costs.

## 12. Known MVP limitations

- The dashboard totals only income and expense transaction rows in the selected month.
- It does not calculate a bank-account balance or net worth.
- Credit-card purchases should not be entered as ordinary expenses and then counted again when the bill is paid; the advanced card ledger workflow is not implemented yet.
- EMI, loans, budgets, savings and recurring tables are schema foundations, not completed screens/workflows.
- CSV import currently validates rows and inserts them, but is not a full import-job/staging workflow.
- No bank integration is included.
- This is a personal finance organizer, not regulated financial advice or a banking application.

## Troubleshooting

**Missing Supabase environment variables**
- Confirm `.env.local` exists in the project root.
- Restart `npm run dev` after changing it.

**Invalid API key / fetch errors**
- Verify the Project URL and publishable/anon key from the correct Supabase project.
- Never paste the database password or service role key into frontend variables.

**No categories in the dropdown**
- Confirm `supabase/schema.sql` ran successfully.
- Check the `categories` table has seeded system categories.
- Confirm RLS permits reading system categories (`user_id IS NULL`).

**Email confirmation link redirects incorrectly**
- Add the current local or production URL to Supabase Auth redirect allow-list.

**Realtime not refreshing**
- Confirm `transactions` and `budgets` are enabled in the `supabase_realtime` publication.
- Check browser console and Supabase Realtime status.
- RLS must allow the signed-in user to receive their own rows.
