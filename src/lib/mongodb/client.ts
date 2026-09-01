import "server-only";
import { MongoClient, type Collection, type Db, type Filter } from "mongodb";
import { cookies } from "next/headers";
import { randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { env, isMongoConfigured } from "@/lib/env";
import { toAdminEmail } from "@/lib/admin-identity";

const ADMIN_COOKIE = "nc_admin";
const ADMIN_COOKIE_MAX_AGE = 60 * 60 * 12;

let client: MongoClient | null = null;
let clientPromise: Promise<MongoClient> | null = null;

function mongoClient() {
  if (!client) client = new MongoClient(env.mongodbUri);
  if (!clientPromise) {
    clientPromise = client.connect();
  }
  return clientPromise;
}

function syncDb(): Db {
  if (!client) client = new MongoClient(env.mongodbUri);
  return client.db(env.mongodbDbName);
}

export async function getDb(): Promise<Db> {
  const client = await mongoClient();
  return client.db(env.mongodbDbName);
}

function now() {
  return new Date().toISOString();
}

function publicDoc<T extends Record<string, unknown>>(doc: T): T {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { _id, ...rest } = doc as T & { _id?: unknown };
  return rest as T;
}

function project<T extends Record<string, unknown>>(
  doc: T,
  fields: string[] | null,
): Partial<T> {
  if (!fields) return publicDoc(doc);
  const out: Partial<T> = {};
  for (const field of fields) {
    const key = field.trim();
    if (key && key in doc) out[key as keyof T] = doc[key as keyof T];
  }
  return out;
}

function parseFields(select: string | undefined): string[] | null {
  if (!select || select === "*") return null;
  const fields: string[] = [];
  let token = "";
  let depth = 0;
  for (const ch of select) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      if (token && !token.includes("(")) fields.push(token.trim());
      token = "";
    } else {
      token += ch;
    }
  }
  if (token && !token.includes("(")) fields.push(token.trim());
  return fields;
}

function matchOr(doc: Record<string, unknown>, expr: string): boolean {
  if (expr.startsWith("status.in.(new,preparing,ready)")) {
    return ["new", "preparing", "ready"].includes(String(doc.status));
  }
  if (expr.startsWith("status.in.(new,ready)")) {
    return ["new", "ready"].includes(String(doc.status));
  }
  return true;
}

// The previous data client returned dynamic row shapes at these call sites.
// Keep the escape hatch local to the compatibility adapter.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DynamicRow = any;
type DbRow = Record<string, DynamicRow>;
type QueryResult = Promise<{ data: DynamicRow[] | null; error: Error | null; count?: number | null }>;

class Query {
  private filters: Filter<DbRow>[] = [];
  private sortSpec: Record<string, 1 | -1> = {};
  private limitCount: number | null = null;
  private selected: string | undefined;
  private wantsCount = false;
  private head = false;

  constructor(
    private readonly collection: Collection<DbRow>,
    private readonly table: string,
  ) {}

  select(fields?: string, opts?: { count?: "exact"; head?: boolean }) {
    this.selected = fields;
    this.wantsCount = opts?.count === "exact";
    this.head = opts?.head === true;
    return this;
  }

  eq(field: string, value: unknown) {
    this.filters.push({ [field]: value } as Filter<DbRow>);
    return this;
  }

  neq(field: string, value: unknown) {
    this.filters.push({ [field]: { $ne: value } } as Filter<DbRow>);
    return this;
  }

  is(field: string, value: unknown) {
    this.filters.push({ [field]: value } as Filter<DbRow>);
    return this;
  }

  in(field: string, values: unknown[]) {
    this.filters.push({ [field]: { $in: values } } as Filter<DbRow>);
    return this;
  }

  lt(field: string, value: unknown) {
    this.filters.push({ [field]: { $lt: value } } as Filter<DbRow>);
    return this;
  }

  gt(field: string, value: unknown) {
    this.filters.push({ [field]: { $gt: value } } as Filter<DbRow>);
    return this;
  }

  gte(field: string, value: unknown) {
    this.filters.push({ [field]: { $gte: value } } as Filter<DbRow>);
    return this;
  }

  or(expr: string) {
    this.manualOr = expr;
    return this;
  }

  order(field: string, opts?: { ascending?: boolean }) {
    this.sortSpec[field] = opts?.ascending === false ? -1 : 1;
    return this;
  }

  limit(n: number) {
    this.limitCount = n;
    return this;
  }

  private manualOr: string | null = null;

  private filter(): Filter<DbRow> {
    const base = this.filters.filter((f) => !("$expr" in f));
    return base.length ? ({ $and: base } as Filter<DbRow>) : ({} as Filter<DbRow>);
  }

  private async attachNested(rows: Record<string, unknown>[]) {
    if (this.table !== "orders" || !this.selected?.includes("order_items(")) return rows;
    const db = await getDb();
    const ids = rows.map((r) => r.id).filter(Boolean);
    const items = await db
      .collection("order_items")
      .find({ order_id: { $in: ids } })
      .sort({ name_snapshot: 1 })
      .toArray();
    const byOrder = new Map<string, Record<string, unknown>[]>();
    for (const item of items) {
      const row = publicDoc(item);
      const list = byOrder.get(String(row.order_id)) ?? [];
      list.push(row);
      byOrder.set(String(row.order_id), list);
    }
    return rows.map((row) => ({ ...row, order_items: byOrder.get(String(row.id)) ?? [] }));
  }

  async execute(): QueryResult {
    try {
      let rows = (await this.collection
        .find(this.filter())
        .sort(this.sortSpec)
        .limit(this.limitCount ?? 0)
        .toArray()) as unknown as Record<string, unknown>[];
      if (this.manualOr) rows = rows.filter((r) => matchOr(r, this.manualOr!));
      const count = this.wantsCount ? rows.length : null;
      if (this.head) return { data: null, error: null, count };
      rows = await this.attachNested(rows.map(publicDoc));
      const fields = parseFields(this.selected);
      return { data: rows.map((r) => project(r, fields)), error: null, count };
    } catch (e) {
      return { data: null, error: e as Error, count: null };
    }
  }

  async maybeSingle(): Promise<{ data: DynamicRow | null; error: Error | null }> {
    const { data, error } = await this.limit(1).execute();
    return { data: data?.[0] ?? null, error };
  }

  async single(): Promise<{ data: DynamicRow | null; error: Error | null }> {
    return this.maybeSingle();
  }

  then<TResult1 = Awaited<QueryResult>, TResult2 = never>(
    onfulfilled?: ((value: Awaited<QueryResult>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return this.execute().then(onfulfilled, onrejected);
  }
}

class Mutate {
  private filters: Filter<DbRow>[] = [];
  private selected: string | undefined;

  constructor(
    private readonly collection: Collection<DbRow>,
    private readonly mode: "insert" | "update" | "delete",
    private readonly payload?: unknown,
  ) {}

  select(fields?: string) {
    this.selected = fields;
    return this;
  }

  eq(field: string, value: unknown) {
    this.filters.push({ [field]: value } as Filter<DbRow>);
    return this;
  }

  neq(field: string, value: unknown) {
    this.filters.push({ [field]: { $ne: value } } as Filter<DbRow>);
    return this;
  }

  private filter(): Filter<DbRow> {
    return this.filters.length ? ({ $and: this.filters } as Filter<DbRow>) : ({} as Filter<DbRow>);
  }

  private withDefaults(doc: Record<string, unknown>) {
    const stamp = now();
    return {
      id: typeof doc.id === "string" ? doc.id : randomUUID(),
      created_at: stamp,
      updated_at: stamp,
      ...doc,
    };
  }

  async execute(): Promise<{ data: DynamicRow[] | null; error: Error | null }> {
    try {
      let rows: Record<string, unknown>[] = [];
      if (this.mode === "insert") {
        const docs = (Array.isArray(this.payload) ? this.payload : [this.payload]).map((d) =>
          this.withDefaults((d ?? {}) as Record<string, unknown>),
        );
        if (docs.length) await this.collection.insertMany(docs);
        rows = docs;
      } else if (this.mode === "update") {
        const patch = { ...((this.payload ?? {}) as Record<string, unknown>), updated_at: now() };
        await this.collection.updateMany(this.filter(), { $set: patch } as never);
        rows = (await this.collection.find(this.filter()).toArray()) as unknown as Record<string, unknown>[];
      } else {
        rows = (await this.collection.find(this.filter()).toArray()) as unknown as Record<string, unknown>[];
        await this.collection.deleteMany(this.filter());
      }
      const fields = parseFields(this.selected);
      return { data: rows.map((r) => project(publicDoc(r), fields)), error: null };
    } catch (e) {
      return { data: null, error: e as Error };
    }
  }

  async maybeSingle(): Promise<{ data: DynamicRow | null; error: Error | null }> {
    const { data, error } = await this.execute();
    return { data: data?.[0] ?? null, error };
  }

  async single(): Promise<{ data: DynamicRow | null; error: Error | null }> {
    return this.maybeSingle();
  }

  then<TResult1 = Awaited<ReturnType<Mutate["execute"]>>, TResult2 = never>(
    onfulfilled?: ((value: Awaited<ReturnType<Mutate["execute"]>>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return this.execute().then(onfulfilled, onrejected);
  }
}

function passwordHash(password: string, salt = randomUUID()) {
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}

function verifyPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const actual = Buffer.from(hash, "hex");
  const expected = scryptSync(password, salt, 64);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

async function bootstrapAdmin(db: Db) {
  if (!env.adminUsername || !env.adminPassword) return;
  const email = toAdminEmail(env.adminUsername);
  const existing = await db.collection("admin_users").findOne({ email });
  if (existing) return;
  const userId = randomUUID();
  const stamp = now();
  await db.collection("admin_users").insertOne({
    id: userId,
    email,
    password_hash: passwordHash(env.adminPassword),
    created_at: stamp,
  });
  await db.collection("admin_profiles").insertOne({
    user_id: userId,
    display_name: env.adminUsername,
    role: "owner",
    created_at: stamp,
  });
}

async function ensureStoreSettings(db: Db) {
  await db.collection("store_settings").updateOne(
    { id: 1 },
    { $setOnInsert: { id: 1, is_open: true, created_at: now(), updated_at: now() } },
    { upsert: true },
  );
}

let setupPromise: Promise<void> | null = null;

export async function ensureMongoSetup() {
  if (!isMongoConfigured()) return;
  if (!setupPromise) {
    setupPromise = (async () => {
      const db = await getDb();
      await Promise.all([
        db.collection("menu_categories").createIndex({ sort_order: 1 }),
        db.collection("menu_items").createIndex({ category_id: 1, sort_order: 1 }),
        db.collection("menu_item_variants").createIndex({ item_id: 1, sort_order: 1 }),
        db.collection("orders").createIndex({ idempotency_key: 1 }, { sparse: true }),
        db.collection("orders").createIndex({ session_id: 1, created_at: -1 }),
        db.collection("order_items").createIndex({ order_id: 1 }),
        db.collection("customer_sessions").createIndex({ token: 1 }, { unique: true }),
        db.collection("rate_limits").createIndex({ key: 1 }, { unique: true }),
      ]);
      await ensureStoreSettings(db);
      await bootstrapAdmin(db);
    })().catch((err) => {
      setupPromise = null;
      throw err;
    });
  }
  return setupPromise;
}

export async function createClient() {
  await ensureMongoSetup();
  const db = await getDb();
  return new AppClient(db);
}

export function createAdminClient() {
  const db = syncDb();
  return {
    from: (table: string) => collectionClient(db, table),
    rpc,
  };
}

function collectionClient(db: Db, table: string) {
  const collection = db.collection(table);
  return {
    select: (fields?: string, opts?: { count?: "exact"; head?: boolean }) =>
      new Query(collection, table).select(fields, opts),
    insert: (payload: unknown) => new Mutate(collection, "insert", payload),
    update: (payload: unknown) => new Mutate(collection, "update", payload),
    delete: () => new Mutate(collection, "delete"),
  };
}

class AppClient {
  constructor(private readonly db: Db) {}

  auth = {
    getUser: async () => {
      const token = (await cookies()).get(ADMIN_COOKIE)?.value;
      if (!token) return { data: { user: null }, error: null };
      const session = await this.db.collection("admin_sessions").findOne({ token });
      if (!session || new Date(String(session.expires_at)).getTime() < Date.now()) {
        return { data: { user: null }, error: null };
      }
      const user = await this.db.collection("admin_users").findOne({ id: session.user_id });
      return { data: { user: user ? { id: user.id, email: user.email } : null }, error: null };
    },
    getSession: async () => ({ data: { session: null }, error: null }),
    signInWithPassword: async ({ email, password }: { email: string; password: string }) => {
      const user = await this.db.collection("admin_users").findOne({ email });
      if (!user || !verifyPassword(password, String(user.password_hash))) {
        return { data: null, error: new Error("Invalid login") };
      }
      const token = randomUUID();
      const expires_at = new Date(Date.now() + ADMIN_COOKIE_MAX_AGE * 1000).toISOString();
      await this.db.collection("admin_sessions").insertOne({
        token,
        user_id: user.id,
        expires_at,
        created_at: now(),
      });
      (await cookies()).set(ADMIN_COOKIE, token, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: ADMIN_COOKIE_MAX_AGE,
      });
      return { data: { user: { id: user.id, email: user.email } }, error: null };
    },
    signOut: async () => {
      const jar = await cookies();
      const token = jar.get(ADMIN_COOKIE)?.value;
      if (token) await this.db.collection("admin_sessions").deleteOne({ token });
      jar.delete(ADMIN_COOKIE);
      return { error: null };
    },
  };

  from(table: string) {
    const collection = this.db.collection(table);
    return {
      select: (fields?: string, opts?: { count?: "exact"; head?: boolean }) =>
        new Query(collection, table).select(fields, opts),
      insert: (payload: unknown) => new Mutate(collection, "insert", payload),
      update: (payload: unknown) => new Mutate(collection, "update", payload),
      delete: () => new Mutate(collection, "delete"),
    };
  }

  rpc = rpc;
}

async function rpc(name: string, params?: Record<string, unknown>) {
  try {
    const db = await getDb();
    if (name === "bump_rate_limit") {
      const key = String(params?.p_key ?? "");
      const limit = Number(params?.p_limit ?? 1);
      const windowSeconds = Number(params?.p_window_seconds ?? 60);
      const nowMs = Date.now();
      const windowStart = new Date(nowMs - windowSeconds * 1000).toISOString();
      const current = await db.collection("rate_limits").findOne({ key });
      if (!current || String(current.window_start) < windowStart) {
        await db.collection("rate_limits").updateOne(
          { key },
          { $set: { key, count: 1, window_start: new Date(nowMs).toISOString() } },
          { upsert: true },
        );
        return { data: true, error: null };
      }
      const count = Number(current.count ?? 0) + 1;
      await db.collection("rate_limits").updateOne({ key }, { $set: { count } });
      return { data: count <= limit, error: null };
    }
    if (name === "next_daily_order_number") {
      const day = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
      const doc = await db.collection("counters").findOneAndUpdate(
        { id: `orders:${day}` },
        { $inc: { value: 1 }, $setOnInsert: { id: `orders:${day}`, day } },
        { upsert: true, returnDocument: "after" },
      );
      return { data: Number(doc?.value ?? 1), error: null };
    }
    if (name === "sweep_orders") {
      const readyMinutes = Number(params?.p_ready_minutes ?? 10);
      const abandonMinutes = Number(params?.p_abandon_minutes ?? 30);
      const readyBefore = new Date(Date.now() - readyMinutes * 60_000).toISOString();
      const abandonBefore = new Date(Date.now() - abandonMinutes * 60_000).toISOString();
      await Promise.all([
        db.collection("orders").updateMany(
          { status: "ready", ready_at: { $lt: readyBefore } },
          { $set: { status: "completed", updated_at: now() } },
        ),
        db.collection("orders").updateMany(
          {
            status: "pending_payment",
            payment_method: "upi",
            payment_status: { $ne: "paid" },
            created_at: { $lt: abandonBefore },
          },
          { $set: { status: "cancelled", payment_status: "failed", updated_at: now() } },
        ),
      ]);
      return { data: true, error: null };
    }
    return { data: null, error: new Error(`Unknown rpc: ${name}`) };
  } catch (e) {
    return { data: null, error: e as Error };
  }
}
