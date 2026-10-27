# KASAKU — Sistem Kasir Multi-Toko

Point-of-sale for a multi-store retail business, built with **Next.js 16 (App Router) · TypeScript · Tailwind CSS v4 · Prisma · MySQL**.

Built from the approved UI mockups: same layout, same bilingual copy, same blue/pastel Modernist styling — now backed by a real database.

---

## ⚠ Security first

The `.env` in this repo contains the credentials you shared in chat. Before anything goes live:

1. **Rotate the MySQL password** — it has been transmitted in plain text.
2. **Create a dedicated user** instead of `root`:
   ```sql
   CREATE DATABASE pos CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   CREATE USER 'pos_app'@'%' IDENTIFIED BY 'a-long-random-password';
   GRANT ALL PRIVILEGES ON pos.* TO 'pos_app'@'%';
   FLUSH PRIVILEGES;
   ```
3. **Firewall port 3308** so only your app server can reach it.
4. **Set a real `AUTH_SECRET`**: `openssl rand -base64 32`.
5. `.env` is gitignored — keep it that way.

---

## Getting started

```bash
npm install
npx prisma generate
npx prisma migrate dev --name init   # creates every table
npm run db:seed                      # 3 stores, 12 items, 6 users, 6 months of sales
npm run dev                          # http://localhost:3000
```

### Demo logins — password `password123`

| Role | Email | Sees |
|---|---|---|
| Administrator | `admin@satupos.id` | Everything, including user management |
| Owner | `owner@satupos.id` | All stores, profit dashboard, supplier comparison |
| Manajer Toko | `manajer@satupos.id` | Its own store only (TK-01) |
| Kasir | `kasir@satupos.id` | Sell, returns, stock view — its own store |

---

## What is implemented

### Core requirements

| Requirement | Where |
|---|---|
| One item, many prices — per store, plus special prices per member | `ItemPrice(itemId, storeId, customerId)`, resolved in `src/lib/pricing.ts` |
| Member pays that store's member price | `resolvePrice()` falls back store price → 0 |
| Purchasing records supplier + buying price, sets new selling prices | `POST /api/purchases` with `newPrices[]` |
| Purchase and sale update stock | `applyMovement()` in `src/lib/stock.ts`, inside the same transaction |
| Base unit for selling, any unit for buying (1 Kg → 1000 Gram) | `ItemUnit.factor`, `src/lib/units.ts` |
| Owner accounting: buy price, sell price, profit per item / store / period | `GET /api/reports/profit` |
| Member who spends the most, total items sold | `GET /api/reports/top-members` |
| Cheapest supplier for the same item, highest member price | `GET /api/reports/supplier-comparison` |
| 4 roles with distinct privileges | `src/lib/rbac.ts` — enforced server-side, mirrored in the nav |
| Employees, with or without a login; every login belongs to one | `Employee`, `User.employeeId` (required, unique) |
| Attendance per day, recapped per pay period | `EmployeeAttendance`, `/api/attendance` |
| Wages from attendance × daily wage, each employee on their own period (daily / weekly / monthly) | `EmployeeWage`, `Employee.wagePeriod`, `src/lib/wages.ts` |

### Standard POS features added

Barcode scanning · receipt print preview · cash-drawer shift open/close with expected-vs-counted reconciliation · split payment (cash / QRIS / card) · hold & resume parked sales · sales and purchase returns · per-line discounts · weight-based items (gram/kg) · quick-pick grid by category · price check without selling · loyalty points · stock transfer between stores · stock opname with variance adjustment · low-stock alerts · full stock-movement ledger (kartu stok) · audit log · CSV export of every report.

---

## Architecture

```
src/
  app/
    (app)/              authenticated shell — one folder per screen
      kasir/            purchase order (PO): scanner, quick-pick, cart, PO slip
      pengiriman/       delivery of POs, one surat jalan per customer
      invoice/          "Buat Invoice": bills a delivered PO for what the customer received
      pembelian/        purchasing: unit conversion + new selling prices
      retur/            sale & supplier returns
      barang/ harga/    items + the store × member price matrix
      pelanggan/ supplier/
      stok/ opname/     inventory, transfers, stock count
      karyawan/         employees: photo, personal data, store, wage period + daily wage
      absensi/          attendance: daily input sheet + monthly recap grid (CSV)
      upah/             wages: per-period pay sheet, pay / undo, history, pay slip
      laba/ banding/ laporan/
      pengguna/         users (each made for an employee), roles, permission matrix
      profil/ sistem/ pengaturan/
    api/                route handlers (REST, JSON envelope)
    login/
  components/           shell (sidebar, topbar), shared UI primitives
  lib/
    db.ts               Prisma client + Decimal serialisation
    auth.ts             JWT cookie sessions, bcrypt
    rbac.ts             permission matrix, store scoping
    pricing.ts          item × store × customer price resolution
    units.ts            base-unit conversion
    stock.ts            the ONLY place stock changes; writes the ledger
    format.ts           Rupiah / date formatting
    wages.ts            pay periods, paid days per attendance status, wage arithmetic
    employees.ts        photo validation, store scoping, re-counting unpaid wages
prisma/
  schema.prisma         36 models
  seed.ts               realistic demo data
```

### Sales flow: PO → pengiriman → invoice

1. **Kasir** takes a purchase order (`Order` + `OrderItem`, status `UNPAID`). Prices are resolved as before; stock does not move yet, but stock promised to other open POs can't be ordered again.
2. **Pengiriman** puts POs on a vehicle trip and prints one surat jalan per customer (`Order.isDelivered`, `Order.deliveryNoteId`).
3. **Buat Invoice** picks a delivered, unpaid PO and bills what the customer actually received: qty (at most what was ordered), price (changing it needs `price.manage`), per-line discount and PPN. Posting writes the `Sale` + `SaleLine` (`Sale.orderId`, one invoice per PO), lowers stock, snapshots COGS, awards points and marks the PO `PAID`. Goods not received came back on the truck and never left stock.

An unpaid PO can be cancelled (`VOID`) from Riwayat PO; a delivery can be cancelled until one of its POs is invoiced.

### Employees: karyawan → absensi → upah

1. **Data Karyawan** (`employee.manage`: admin, owner) keeps each employee's photo, gender, birth date, contact, store, `joined_at` / `resign_at`, status, **wage period** and **daily wage**. A login (Pengguna & Peran) is always created *for* an employee and takes its name; renaming the employee renames the login, and making the employee inactive deactivates the login. An employee with a login, attendance or wages can't be deleted, only made inactive.
2. **Absensi** (`attendance.manage`: admin, owner, and managers for their own store) records one status per employee per day: `PRESENT` = 1 paid day, `HALF_DAY` = ½, `LEAVE` / `SICK` / `ABSENT` = unpaid. Only employees on the payroll that day (between `joined_at` and `resign_at`) can be recorded.
3. **Upah Karyawan** (`wage.manage`: admin, owner) works one period at a time: a day, a Monday–Sunday week or a calendar month. The sheet lists everyone paid on that period with their days worked; saving writes an `EmployeeWage` per employee, `days × daily wage + allowance − deduction`, as `UNPAID`. Paying marks it `PAID`.

The rules that keep pay and attendance in step:

- **The daily wage and period are copied into the wage** when it is calculated, so raising someone's rate never rewrites pay already worked out.
- **Each day is paid once**: a wage can't overlap another wage of the same employee (this matters when an employee moves from weekly to monthly pay).
- **Attendance inside a paid wage is locked.** Undo the payment first (`Batal bayar`) to correct it.
- **Attendance inside an unpaid wage re-counts that wage** in the same transaction, so the stored days always match the attendance.

Photos are resized in the browser to a 400 px square JPEG, stored in `EmployeePhoto` (not `public/`, which anyone can read) and served by `/api/employees/[id]/photo` behind the session check.

### Two rules worth knowing

**1. Stock only changes through `applyMovement()`.** It updates `ItemStock` and writes a `StockMovement` row with the resulting balance, in the same transaction as the document that caused it. The ledger and the balance can never disagree.

**2. COGS is snapshotted at invoice time.** `SaleLine.unitCost` stores the moving-average cost when the invoice was posted, so changing a purchase price next month never rewrites last month's profit.

### API shape

Every endpoint returns `{ ok: true, data }` or `{ ok: false, error }`. Auth is an httpOnly JWT cookie; `src/proxy.ts` (Next 16's replacement for middleware) is the first gate and each handler re-checks permissions with `requirePerm()`.

| Method | Path | Notes |
|---|---|---|
| POST | `/api/auth/login` · `/logout` · GET `/me` | |
| GET/POST | `/api/items` · GET/PATCH/DELETE `/api/items/[id]` | |
| GET/PUT | `/api/prices` | the whole matrix for one item |
| GET/POST/PATCH | `/api/customers` · `/api/suppliers` | |
| GET/POST | `/api/categories` · `/api/units` · `/api/stores` | |
| GET | `/api/stock` (+`?card=1` for kartu stok) | |
| GET/POST/DELETE | `/api/orders` | PO from the kasir; DELETE cancels an unpaid PO |
| GET/POST/DELETE | `/api/deliveries` | pengiriman of POs + surat jalan; DELETE cancels it |
| GET/POST | `/api/sales` | invoice of a delivered PO; posting moves stock |
| GET/POST | `/api/purchases` · `/api/returns` | posting moves stock |
| GET/POST | `/api/transfers` · `/api/opname` · `/api/shifts` | |
| GET/POST/DELETE | `/api/held-sales` | parked carts |
| GET | `/api/price-check` | price across all stores |
| GET | `/api/reports/profit` · `/supplier-comparison` · `/top-members` | |
| GET/POST/PATCH | `/api/users` | admin only; POST takes the `employeeId` the login is for |
| GET/POST/PATCH/DELETE | `/api/employees` (+`?available=1`) · GET `/api/employees/[id]/photo` | photo sent as a data URL in POST/PATCH |
| GET/PUT | `/api/attendance` | `?date=` one day's sheet, `?from=&to=` recap; PUT saves a day for many employees |
| GET/POST/PATCH/DELETE | `/api/wages` · POST `/api/wages/pay` | `?period=&date=` pay sheet, otherwise history; pay / undo in bulk |

---

## Keyboard shortcuts (cashier)

`F2` price check · `F3` hold sale · `F6` choose customer · `F12` save PO · `Esc` close dialog

---

## Deployment notes

- Set `DATABASE_URL` and `AUTH_SECRET` as environment variables on the host.
- Run `npx prisma migrate deploy` (not `dev`) in production.
- `npm run build && npm start`.
- Serverless hosts (Vercel) need connection pooling — use PlanetScale, Prisma Accelerate, or a proxy; a raw MySQL connection will exhaust its connection limit.

## Suggested next steps

Item photo upload (the schema has `imageUrl`; the UI shows monogram placeholders) · thermal-printer ESC/POS output · offline queue with IndexedDB · barcode label printing · supplier purchase orders with due-date tracking.
