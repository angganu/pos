import { PrismaClient, Role, MovementType } from "@prisma/client";
import bcrypt from "bcryptjs";
import { docCode } from "../src/lib/format";

const prisma = new PrismaClient();

const STORES = [
  { code: "TK-01", name: "Gudang Lembang", address: "Jl. Punclut", phone: "081234567890" },
];

const UNITS = [
  { code: "PCS", name: "Pcs" },
  { code: "GR", name: "Gram" },
  { code: "KG", name: "Kilogram" },
  { code: "LT", name: "Liter" },
  { code: "ONS", name: "Ons" },
  { code: "SAK", name: "Sak" },
  { code: "KRT", name: "Karton" },
  { code: "PETI", name: "Peti" },
];

const CATEGORIES = [
  { code: "CAT-01", name: "Beras & Biji", description: "Beras, gula, tepung dan sejenisnya" },
  { code: "CAT-02", name: "Minyak & Bumbu", description: "Minyak goreng dan bumbu dapur" },
  { code: "CAT-03", name: "Sayur & Bumbu", description: "Sayuran segar dan bumbu basah" },
  { code: "CAT-04", name: "Telur & Susu", description: "Produk telur dan olahan susu" },
  { code: "CAT-05", name: "Minuman", description: "Air mineral, kopi, teh" },
  { code: "CAT-06", name: "Makanan Instan", description: "Mie instan dan makanan siap saji" },
  { code: "CAT-07", name: "Kebersihan", description: "Sabun, deterjen, pembersih" },
];

const CUSTOMERS = [
  { code: "MB-001", name: "Bu Sari Wulandari", tier: "Silver", phone: "0812 2650 118", address: "Jl. Kaliurang KM 6, Sleman", points: 1240 },
  { code: "MB-002", name: "Pak Hadi Santoso", tier: "Gold", phone: "0813 9042 771", address: "Jl. Veteran 88, Yogyakarta", points: 4310 },
  { code: "MB-003", name: "Warung Bu Tin", tier: "Reseller", phone: "0857 1122 908", address: "Pasar Kranggan Los 12, Yogyakarta", points: 9820 },
  { code: "MB-004", name: "Katering Melati", tier: "Gold", phone: "0821 3344 512", address: "Jl. Wates KM 3, Bantul", points: 3675 },
];

const SUPPLIERS = [
  { code: "SP-01", name: "Pasar Induk Lembang", address: "Jl. Imogiri Timur 12, Bantul", phone: "0274 441 220", pic: "Bpk. Slamet", terms: "Tunai" },
  { code: "SP-02", name: "Pasar Ciroyom", address: "Pasar Beringharjo Blok C, Yogyakarta", phone: "0812 2788 410", pic: "Bu Mursidah", terms: "Tunai" },
  { code: "SP-03", name: "Supplier Sayur 1", address: "Jl. Ring Road Utara 9, Sleman", phone: "0274 885 300", pic: "Bpk. Wijaya", terms: "Tempo 30 hari" },
  { code: "SP-04", name: "Supplier Sayur 2", address: "Jl. Kaliurang KM 12, Sleman", phone: "0813 2900 771", pic: "Bpk. Harjono", terms: "Tempo 14 hari" },
];

type ItemSeed = {
  code: string; barcode: string; name: string; cat: string; base: string;
  buyUnit: { label: string; unit: string; factor: number };
  cost: number;
  price: Record<string, number>;
  member: Record<string, number>;
  stock: Record<string, number>;
  min: number;
};

const ITEMS: ItemSeed[] = [
  { code: "BR-001", barcode: "8990001000011", name: "Beras Pandan Wangi", cat: "CAT-01", base: "GR",
    buyUnit: { label: "Sak 25 Kg", unit: "SAK", factor: 25000 }, cost: 10,
    price: { "TK-01": 14 }, member: { "MB-003": 12, "MB-002": 13 },
    stock: { "TK-01": 148000 }, min: 40000 },
  { code: "GL-001", barcode: "8990001000028", name: "Gula Pasir Kristal", cat: "CAT-01", base: "GR",
    buyUnit: { label: "Karung 50 Kg", unit: "SAK", factor: 50000 }, cost: 13,
    price: { "TK-01": 17 }, member: { "MB-003": 15 },
    stock: { "TK-01": 84000 }, min: 25000 },
  { code: "TP-001", barcode: "8990001000035", name: "Tepung Terigu Serbaguna", cat: "CAT-01", base: "GR",
    buyUnit: { label: "Sak 25 Kg", unit: "SAK", factor: 25000 }, cost: 9,
    price: { "TK-01": 13 }, member: { "MB-003": 11, "MB-004": 11 },
    stock: { "TK-01": 52000 }, min: 20000 },
  { code: "MG-001", barcode: "8990001000042", name: "Minyak Goreng 1 Liter", cat: "CAT-02", base: "PCS",
    buyUnit: { label: "Karton 12 Pcs", unit: "KRT", factor: 12 }, cost: 18200,
    price: { "TK-01": 21000 }, member: { "MB-003": 19500, "MB-004": 20000 },
    stock: { "TK-01": 186 }, min: 48 },
  { code: "CB-001", barcode: "8990001000059", name: "Cabai Merah Keriting", cat: "CAT-03", base: "GR",
    buyUnit: { label: "Kg", unit: "KG", factor: 1000 }, cost: 34,
    price: { "TK-01": 48 }, member: { "MB-004": 44 },
    stock: { "TK-01": 12500 }, min: 5000 },
  { code: "BW-001", barcode: "8990001000066", name: "Bawang Merah Brebes", cat: "CAT-03", base: "GR",
    buyUnit: { label: "Kg", unit: "KG", factor: 1000 }, cost: 27,
    price: { "TK-01": 38 }, member: { "MB-004": 34 },
    stock: { "TK-01": 16400 }, min: 6000 },
  { code: "TL-001", barcode: "8990001000073", name: "Telur Ayam Negeri", cat: "CAT-04", base: "GR",
    buyUnit: { label: "Peti 15 Kg", unit: "PETI", factor: 15000 }, cost: 25,
    price: { "TK-01": 32 }, member: { "MB-003": 29 },
    stock: { "TK-01": 44000 }, min: 12000 },
  { code: "SS-001", barcode: "8990001000080", name: "Susu UHT Full Cream 1L", cat: "CAT-04", base: "PCS",
    buyUnit: { label: "Karton 12 Pcs", unit: "KRT", factor: 12 }, cost: 16800,
    price: { "TK-01": 19500 }, member: { "MB-002": 18500 },
    stock: { "TK-01": 96 }, min: 36 },
  { code: "AQ-001", barcode: "8990001000097", name: "Air Mineral 600 ml", cat: "CAT-05", base: "PCS",
    buyUnit: { label: "Karton 24 Pcs", unit: "KRT", factor: 24 }, cost: 2600,
    price: { "TK-01": 3500 }, member: { "MB-003": 3000 },
    stock: { "TK-01": 420 }, min: 120 },
  { code: "KP-001", barcode: "8990001000103", name: "Kopi Bubuk Robusta 250 g", cat: "CAT-05", base: "PCS",
    buyUnit: { label: "Karton 20 Pcs", unit: "KRT", factor: 20 }, cost: 20500,
    price: { "TK-01": 24000 }, member: { "MB-002": 22500 },
    stock: { "TK-01": 74 }, min: 24 },
  { code: "ML-001", barcode: "8990001000110", name: "Mie Instan Goreng", cat: "CAT-06", base: "PCS",
    buyUnit: { label: "Karton 40 Pcs", unit: "KRT", factor: 40 }, cost: 2900,
    price: { "TK-01": 3400 }, member: { "MB-003": 3000 },
    stock: { "TK-01": 640 }, min: 200 },
  { code: "SB-001", barcode: "8990001000127", name: "Sabun Cuci Cair 800 ml", cat: "CAT-07", base: "PCS",
    buyUnit: { label: "Karton 12 Pcs", unit: "KRT", factor: 12 }, cost: 15200,
    price: { "TK-01": 17500 }, member: { "MB-001": 16800 },
    stock: { "TK-01": 58 }, min: 24 },
];

/** Which suppliers quote which items, priced per THEIR purchase unit. */
const OFFERS: Record<string, Record<string, number>> = {
  "SP-01": { "BR-001": 250000, "GL-001": 650000, "TP-001": 230000 },
  "SP-02": { "BR-001": 262500, "CB-001": 34000, "BW-001": 27000, "TL-001": 390000 },
  "SP-03": { "MG-001": 218400, "ML-001": 116000, "AQ-001": 62400, "SS-001": 201600, "SB-001": 182400, "KP-001": 410000 },
  "SP-04": { "BR-001": 245000, "TL-001": 375000, "CB-001": 33000, "BW-001": 27500 },
};

async function main() {
  // The seed wipes every table and recreates demo logins with a known password.
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_SEED !== "1") {
    throw new Error("Refusing to seed in production (set ALLOW_SEED=1 to override).");
  }

  console.log("→ Seeding KASAKU…");

  // Wipe in dependency order so the seed is re-runnable.
  await prisma.$transaction([
    prisma.auditLog.deleteMany(), prisma.stockMovement.deleteMany(),
    prisma.deliveryNote.deleteMany(), prisma.delivery.deleteMany(),
    prisma.rejectLine.deleteMany(), prisma.reject.deleteMany(),
    prisma.saleLine.deleteMany(), prisma.orderItem.deleteMany(), prisma.returnLine.deleteMany(),
    prisma.purchaseLine.deleteMany(), prisma.transferLine.deleteMany(),
    prisma.opnameLine.deleteMany(), prisma.heldSale.deleteMany(),
    prisma.returnDoc.deleteMany(), prisma.sale.deleteMany(), prisma.order.deleteMany(),
    prisma.purchase.deleteMany(), prisma.transfer.deleteMany(),
    prisma.stockOpname.deleteMany(), prisma.shift.deleteMany(),
    prisma.itemPrice.deleteMany(), prisma.itemStock.deleteMany(),
    prisma.itemUnit.deleteMany(), prisma.item.deleteMany(),
    prisma.category.deleteMany(), prisma.unit.deleteMany(),
    prisma.customer.deleteMany(), prisma.supplier.deleteMany(),
    prisma.user.deleteMany(), prisma.store.deleteMany(),
    prisma.setting.deleteMany(),
  ]);

  const stores = new Map<string, number>();
  for (const s of STORES) {
    const row = await prisma.store.create({ data: s });
    stores.set(s.code, row.id);
  }

  const units = new Map<string, number>();
  for (const u of UNITS) {
    const row = await prisma.unit.create({ data: u });
    units.set(u.code, row.id);
  }

  const cats = new Map<string, number>();
  for (const c of CATEGORIES) {
    const row = await prisma.category.create({ data: c });
    cats.set(c.code, row.id);
  }

  const customers = new Map<string, number>();
  for (const c of CUSTOMERS) {
    const row = await prisma.customer.create({ data: c });
    customers.set(c.code, row.id);
  }

  const suppliers = new Map<string, number>();
  for (const s of SUPPLIERS) {
    const row = await prisma.supplier.create({ data: s });
    suppliers.set(s.code, row.id);
  }

  const pw = await bcrypt.hash("password123", 10);
  const users = [
    { name: "Rina Kusuma", email: "admin@satupos.id", role: Role.ADMIN, storeCode: null },
    { name: "H. Bambang S.", email: "owner@satupos.id", role: Role.OWNER, storeCode: null },
    { name: "Dwi Prasetyo", email: "manajer@satupos.id", role: Role.MANAGER, storeCode: "TK-01" },
    { name: "Yanti Rahayu", email: "kasir@satupos.id", role: Role.CASHIER, storeCode: "TK-01" },
  ];
  const userIds = new Map<string, number>();
  for (const u of users) {
    const row = await prisma.user.create({
      data: {
        name: u.name, email: u.email, passwordHash: pw, role: u.role,
        storeId: u.storeCode ? stores.get(u.storeCode)! : null,
      },
    });
    userIds.set(u.email, row.id);
  }

  const items = new Map<string, number>();
  for (const it of ITEMS) {
    const row = await prisma.item.create({
      data: {
        code: it.code, barcode: it.barcode, name: it.name,
        description: `${it.name} — dijual per ${it.base === "GR" ? "gram" : "pcs"}.`,
        categoryId: cats.get(it.cat)!, baseUnitId: units.get(it.base)!,
      },
    });
    items.set(it.code, row.id);

    // base unit (factor 1) + the alternative purchase unit
    await prisma.itemUnit.createMany({
      data: [
        { itemId: row.id, unitId: units.get(it.base)!, label: it.base === "GR" ? "Gram" : "Pcs", factor: 1, isBase: true, isBuying: true },
        { itemId: row.id, unitId: units.get(it.buyUnit.unit)!, label: it.buyUnit.label, factor: it.buyUnit.factor, isBase: false, isBuying: true },
      ],
    });

    for (const [storeCode, storeId] of stores) {
      await prisma.itemStock.create({
        data: { itemId: row.id, storeId, stock: it.stock[storeCode] ?? 0, minStock: it.min },
      });
      await prisma.itemPrice.create({
        data: { itemId: row.id, storeId, customerId: null, price: it.price[storeCode] ?? 0 },
      });
      await prisma.stockMovement.create({
        data: {
          itemId: row.id, storeId, type: MovementType.OPENING,
          qty: it.stock[storeCode] ?? 0, balanceAfter: it.stock[storeCode] ?? 0,
          unitCost: it.cost, refType: "SEED", note: "Saldo awal",
        },
      });
    }

    // Member prices: offset per store so a member pays that store's rate.
    for (const [memberCode, basePrice] of Object.entries(it.member)) {
      for (const [storeCode, storeId] of stores) {
        const delta = (it.price[storeCode] ?? 0) - (it.price["TK-01"] ?? 0);
        await prisma.itemPrice.create({
          data: {
            itemId: row.id, storeId, customerId: customers.get(memberCode)!,
            price: Math.max(0, basePrice + delta),
          },
        });
      }
    }
  }

  // Purchase history — establishes real HPP for every item.
  let pSeq = 0;
  for (const [supCode, offers] of Object.entries(OFFERS)) {
    for (const [, storeId] of stores) {
      pSeq += 1;
      const lines = Object.entries(offers).map(([itemCode, unitPrice]) => {
        const seed = ITEMS.find((i) => i.code === itemCode)!;
        const qty = 2;
        const factor = seed.buyUnit.factor;
        return {
          itemId: items.get(itemCode)!, unitLabel: seed.buyUnit.label, factor,
          qty, baseQty: qty * factor, pricePerUnit: unitPrice,
          pricePerBase: unitPrice / factor, discount: 0, total: qty * unitPrice,
        };
      });
      if (lines.length === 0) continue;
      const subtotal = lines.reduce((a, l) => a + l.total, 0);

      await prisma.purchase.create({
        data: {
          code: `PB-2609-${String(pSeq).padStart(4, "0")}`,
          supplierId: suppliers.get(supCode)!, storeId,
          userId: userIds.get("manajer@satupos.id")!,
          date: new Date(Date.now() - pSeq * 36e5 * 12),
          subtotal, discount: 0, tax: 0, total: subtotal,
          lines: { create: lines },
        },
      });
    }
  }

  // Sales history across six months, so the profit dashboard has a real trend:
  // each sale is a PO that was delivered, then invoiced in full.
  const SOLD: Record<string, number> = {
    "BR-001": 420000, "GL-001": 180000,
    "TP-001": 120000, "MG-001": 640,
    "CB-001": 38000, "BW-001": 42000,
    "TL-001": 210000, "SS-001": 320,
    "AQ-001": 2100, "KP-001": 190,
    "ML-001": 3400, "SB-001": 145,
  };
  const storeCode = "TK-01";
  const storeId = stores.get(storeCode)!;
  const memberCodes = [null, "MB-001", "MB-002", "MB-003", "MB-004"];

  let sSeq = 0;
  for (let monthsAgo = 5; monthsAgo >= 0; monthsAgo--) {
    // a handful of representative orders per month
    for (let n = 0; n < 6; n++) {
      sSeq += 1;
      const memberCode = memberCodes[(sSeq + n) % memberCodes.length];
      const customerId = memberCode ? customers.get(memberCode)! : null;
      const date = new Date();
      date.setMonth(date.getMonth() - monthsAgo);
      date.setDate(3 + n * 4);
      date.setHours(9 + n, 15, 0, 0);

      const picks = ITEMS.filter((_, i) => (i + n) % 4 === 0).slice(0, 3);
      if (picks.length === 0) continue;

      const lines = [];
      let subtotal = 0;
      let cogs = 0;
      for (const seed of picks) {
        const share = (SOLD[seed.code] ?? 0) / 6 / 6;
        const q = Math.max(1, Math.round(share));
        const generalPrice = seed.price[storeCode] ?? 0;
        const memberBase = memberCode ? seed.member[memberCode] : undefined;
        const unitPrice = memberBase ?? generalPrice;

        const total = q * unitPrice;
        subtotal += total;
        cogs += q * seed.cost;
        lines.push({
          itemId: items.get(seed.code)!, qty: q, unitPrice,
          basePrice: generalPrice, unitCost: seed.cost, discount: 0, total,
          isMember: memberBase !== undefined,
        });
      }

      const tax = Math.round(subtotal * 0.11);
      const total = subtotal + tax;
      // This month's last orders are still open, waiting for the pengiriman screen.
      const open = monthsAgo === 0 && n >= 3;
      // Dated in their own month, so this month's codes continue from them.
      const order = await prisma.order.create({
        data: {
          code: docCode("PO", n + 1, date),
          storeId, customerId,
          userId: userIds.get("kasir@satupos.id")!,
          date, createdAt: date, subtotal, discount: 0, tax, total,
          status: open ? "UNPAID" : "PAID",
          isDelivered: !open,
          items: {
            create: lines.map((l) => ({
              itemId: l.itemId, qty: l.qty, unitPrice: l.unitPrice, basePrice: l.basePrice,
              discount: l.discount, total: l.total, isMember: l.isMember,
            })),
          },
        },
      });
      if (open) continue;

      await prisma.sale.create({
        data: {
          code: docCode("INV", n + 1, date), orderId: order.id,
          storeId, customerId,
          userId: userIds.get("kasir@satupos.id")!,
          date, createdAt: date, subtotal, discount: 0, tax, total, cogs,
          paid: total, change: 0, paymentMethod: "CASH",
          pointsEarned: Math.round(total / 1000),
          lines: { create: lines },
        },
      });
    }
  }

  await prisma.setting.createMany({
    data: [
      { key: "company.name", value: "KASAKU" },
      { key: "tax.rate", value: "11" },
      { key: "tax.enabled", value: "true" },
      { key: "receipt.footer", value: "Terima kasih — Thank you" },
      { key: "loyalty.rupiahPerPoint", value: "1000" },
    ],
  });

  const counts = {
    stores: STORES.length, users: users.length, items: ITEMS.length,
    customers: CUSTOMERS.length, suppliers: SUPPLIERS.length,
    orders: await prisma.order.count(), sales: await prisma.sale.count(),
    purchases: await prisma.purchase.count(),
  };
  console.log("✓ Seed complete", counts);
  console.log("  Login: admin@satupos.id / owner@satupos.id / manajer@satupos.id / kasir@satupos.id");
  console.log("  Password for all: password123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
