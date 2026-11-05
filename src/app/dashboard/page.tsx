 "use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  Plus,
  LogOut,
  RefreshCw,
  Upload,
  Trash2,
  Pencil,
  ChartNoAxesCombined,
} from "lucide-react";
import { getSupabase } from "@/lib/supabase";
import { money, dateLabel } from "@/lib/format";
import { transactionSchema } from "@/lib/validation";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type TransactionType = "income" | "expense";

type Tx = {
  id: string;
  title: string;
  amount: number;
  transaction_type: TransactionType;
  transaction_date: string;
  payment_method: string;
  notes: string | null;
  category_id: string;
  categories?: { name: string } | null;
};

type Category = {
  id: string;
  name: string;
  type: TransactionType;
};

type TransactionInsert = {
  title: string;
  amount: number;
  transaction_type: TransactionType;
  category_id: string;
  transaction_date: string;
  payment_method: string;
  notes: string | null;
  user_id: string;
  currency: string;
  status: string;
};

type TransactionForm = {
  title: string;
  amount: string;
  transaction_type: TransactionType;
  category_id: string;
  transaction_date: string;
  payment_method: string;
  notes: string;
};

const PAYMENT_METHODS = [
  "upi",
  "cash",
  "debit_card",
  "credit_card",
  "bank_transfer",
  "net_banking",
  "other",
] as const;

function localDateString(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function localMonthString(date = new Date()): string {
  return localDateString(date).slice(0, 7);
}

function getMonthRange(month: string): { start: string; end: string } {
  const [yearPart, monthPart] = month.split("-");
  const year = Number(yearPart);
  const monthNumber = Number(monthPart);

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(monthNumber) ||
    monthNumber < 1 ||
    monthNumber > 12
  ) {
    const fallback = localMonthString();
    return getMonthRange(fallback);
  }

  const nextMonth = monthNumber === 12 ? 1 : monthNumber + 1;
  const nextYear = monthNumber === 12 ? year + 1 : year;

  return {
    start: `${year}-${String(monthNumber).padStart(2, "0")}-01`,
    end: `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`,
  };
}

/**
 * Parses standard CSV including quoted commas, escaped quotes and newlines.
 * Throws when a quoted field is not closed.
 */
function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    const next = input[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      if (field.length > 0) {
        throw new Error("Invalid CSV: a quote appeared in the middle of a field.");
      }
      inQuotes = true;
    } else if (char === ",") {
      row.push(field.trim());
      field = "";
    } else if (char === "\n") {
      row.push(field.trim());
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      field = "";
    } else if (char === "\r") {
      // Ignore CR; the following LF ends the record.
    } else {
      field += char;
    }
  }

  if (inQuotes) {
    throw new Error("Invalid CSV: a quoted field was not closed.");
  }

  row.push(field.trim());
  if (row.some((value) => value.length > 0)) rows.push(row);

  return rows;
}

const createInitialForm = (): TransactionForm => ({
  title: "",
  amount: "",
  transaction_type: "expense",
  category_id: "",
  transaction_date: localDateString(),
  payment_method: "upi",
  notes: "",
});

export default function DashboardPage() {
  const router = useRouter();
  const supabase = useMemo(() => getSupabase(), []);

  const [userEmail, setUserEmail] = useState("");
  const [userId, setUserId] = useState("");
  const [transactions, setTransactions] = useState<Tx[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [form, setForm] = useState<TransactionForm>(createInitialForm);
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [month, setMonth] = useState(localMonthString());
  const [filter, setFilter] = useState<"" | TransactionType>("");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setError("");

    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) throw authError;

      if (!user) {
        router.replace("/login");
        return;
      }

      setUserId(user.id);
      setUserEmail(user.email ?? "");

      const { start, end } = getMonthRange(month);

      const [transactionResult, categoryResult] = await Promise.all([
        supabase
          .from("transactions")
          .select(
            "id,title,amount,transaction_type,transaction_date,payment_method,notes,category_id,categories(name)",
          )
          .eq("user_id", user.id)
          .gte("transaction_date", start)
          .lt("transaction_date", end)
          .is("deleted_at", null)
          .order("transaction_date", { ascending: false })
          .order("created_at", { ascending: false }),
        supabase
          .from("categories")
          .select("id,name,type")
          .eq("is_active", true)
          .order("name"),
      ]);

      if (transactionResult.error) throw transactionResult.error;
      if (categoryResult.error) throw categoryResult.error;

      setTransactions((transactionResult.data ?? []) as unknown as Tx[]);
      setCategories((categoryResult.data ?? []) as Category[]);
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : "Unable to load your dashboard.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [month, router, supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`paisatrack-transactions-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "transactions",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          void load();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [load, supabase, userId]);

  const totals = useMemo(() => {
    return transactions.reduce(
      (result, transaction) => {
        const amount = Number(transaction.amount) || 0;
        if (transaction.transaction_type === "income") {
          result.income += amount;
        } else {
          result.expenses += amount;
        }
        result.net = result.income - result.expenses;
        return result;
      },
      { income: 0, expenses: 0, net: 0 },
    );
  }, [transactions]);

  const chartData = useMemo(() => {
    const byCategory = new Map<string, number>();

    transactions
      .filter((transaction) => transaction.transaction_type === "expense")
      .forEach((transaction) => {
        const categoryName = transaction.categories?.name ?? "Uncategorised";
        const current = byCategory.get(categoryName) ?? 0;
        byCategory.set(categoryName, current + Number(transaction.amount || 0));
      });

    return Array.from(byCategory.entries())
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 7);
  }, [transactions]);

  const visible = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return transactions.filter((transaction) => {
      const matchesType =
        filter === "" || transaction.transaction_type === filter;
      const searchableText =
        `${transaction.title} ${transaction.categories?.name ?? ""}`.toLowerCase();
      const matchesSearch =
        normalizedSearch === "" || searchableText.includes(normalizedSearch);

      return matchesType && matchesSearch;
    });
  }, [filter, search, transactions]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    setBusy(true);
    setError("");
    setSuccess("");

    try {
      const parsed = transactionSchema.safeParse(form);

      if (!parsed.success) {
        setError(parsed.error.issues[0]?.message ?? "Please check the form.");
        return;
      }

      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) throw authError;
      if (!user) {
        router.replace("/login");
        return;
      }

      const payload = {
        ...parsed.data,
        amount: Number(parsed.data.amount),
        notes: parsed.data.notes?.trim() || null,
      };

      if (editing) {
        const { error: updateError } = await supabase
          .from("transactions")
          .update(payload)
          .eq("id", editing)
          .eq("user_id", user.id)
          .is("deleted_at", null);

        if (updateError) throw updateError;
        setSuccess("Transaction updated.");
      } else {
        const insertPayload: TransactionInsert = {
          ...payload,
          user_id: user.id,
          currency: "INR",
          status: "posted",
        };

        const { error: insertError } = await supabase
          .from("transactions")
          .insert(insertPayload);

        if (insertError) throw insertError;
        setSuccess("Transaction added.");
      }

      setForm(createInitialForm());
      setEditing(null);
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to save this transaction.",
      );
    } finally {
      setBusy(false);
    }
  }

  function edit(transaction: Tx) {
    setEditing(transaction.id);
    setForm({
      title: transaction.title,
      amount: String(transaction.amount),
      transaction_type: transaction.transaction_type,
      category_id: transaction.category_id,
      transaction_date: transaction.transaction_date,
      payment_method: transaction.payment_method,
      notes: transaction.notes ?? "",
    });

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function remove(id: string) {
    const confirmed = window.confirm(
      "Delete this transaction? It will be hidden from normal views.",
    );
    if (!confirmed) return;

    setError("");
    setSuccess("");

    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) throw authError;
      if (!user) {
        router.replace("/login");
        return;
      }

      const { error: deleteError } = await supabase
        .from("transactions")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id)
        .eq("user_id", user.id)
        .is("deleted_at", null);

      if (deleteError) throw deleteError;

      setSuccess("Transaction deleted.");
      if (editing === id) {
        setEditing(null);
        setForm(createInitialForm());
      }
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to delete this transaction.",
      );
    }
  }

  async function importCsv(file: File) {
    setBusy(true);
    setError("");
    setSuccess("");

    try {
      const csvText = (await file.text()).replace(/^\uFEFF/, "");
      const records = parseCsv(csvText);

      if (records.length < 2) {
        throw new Error("The CSV must contain a header and at least one data row.");
      }

      const headers = records[0].map((header) => header.trim().toLowerCase());
      const requiredHeaders = [
        "title",
        "amount",
        "transaction_type",
        "category",
        "transaction_date",
        "payment_method",
      ];
      const missingHeaders = requiredHeaders.filter(
        (header) => !headers.includes(header),
      );

      if (missingHeaders.length > 0) {
        throw new Error(`Missing CSV columns: ${missingHeaders.join(", ")}`);
      }

      const columnIndex = (name: string) => headers.indexOf(name);
      const issues: string[] = [];
      const rows: TransactionInsert[] = [];

      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) throw authError;
      if (!user) {
        router.replace("/login");
        return;
      }

      for (let rowIndex = 1; rowIndex < records.length; rowIndex += 1) {
        const columns = records[rowIndex];

        if (columns.length !== headers.length) {
          issues.push(
            `Row ${rowIndex + 1}: expected ${headers.length} columns but found ${columns.length}`,
          );
          continue;
        }

        const title = columns[columnIndex("title")] ?? "";
        const amountText = columns[columnIndex("amount")] ?? "";
        const rawType = (columns[columnIndex("transaction_type")] ?? "")
          .trim()
          .toLowerCase();
        const categoryName = (columns[columnIndex("category")] ?? "").trim();
        const transactionDate = columns[columnIndex("transaction_date")] ?? "";
        const paymentMethod = (columns[columnIndex("payment_method")] ?? "")
          .trim()
          .toLowerCase();
        const notesIndex = columnIndex("notes");
        const notes = notesIndex >= 0 ? columns[notesIndex] ?? "" : "";

        if (rawType !== "income" && rawType !== "expense") {
          issues.push(`Row ${rowIndex + 1}: transaction_type must be income or expense`);
          continue;
        }

        const transactionType: TransactionType = rawType;
        const category = categories.find(
          (item) =>
            item.name.trim().toLowerCase() === categoryName.toLowerCase() &&
            item.type === transactionType,
        );

        if (!category) {
          issues.push(
            `Row ${rowIndex + 1}: category "${categoryName}" was not found for ${transactionType}`,
          );
          continue;
        }

        if (!PAYMENT_METHODS.includes(paymentMethod as (typeof PAYMENT_METHODS)[number])) {
          issues.push(`Row ${rowIndex + 1}: invalid payment_method "${paymentMethod}"`);
          continue;
        }

        const parsed = transactionSchema.safeParse({
          title,
          amount: amountText.replace(/,/g, ""),
          transaction_type: transactionType,
          category_id: category.id,
          transaction_date: transactionDate,
          payment_method: paymentMethod,
          notes,
        });

        if (!parsed.success) {
          issues.push(
            `Row ${rowIndex + 1}: ${parsed.error.issues[0]?.message ?? "invalid transaction"}`,
          );
          continue;
        }

        rows.push({
          ...parsed.data,
          amount: Number(parsed.data.amount),
          notes: parsed.data.notes?.trim() || null,
          user_id: user.id,
          currency: "INR",
          status: "posted",
        });
      }

      if (issues.length > 0) {
        throw new Error(
          `Import cancelled. ${issues.slice(0, 5).join(" | ")}${
            issues.length > 5 ? ` | and ${issues.length - 5} more errors` : ""
          }`,
        );
      }

      if (rows.length === 0) {
        throw new Error("No valid transactions were found in the CSV.");
      }

      const { error: insertError } = await supabase
        .from("transactions")
        .insert(rows);

      if (insertError) throw insertError;

      setSuccess(`${rows.length} transaction${rows.length === 1 ? "" : "s"} imported.`);
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to import this CSV file.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    setError("");
    const { error: signOutError } = await supabase.auth.signOut();

    if (signOutError) {
      setError(signOutError.message);
      return;
    }

    router.replace("/login");
  }

  if (loading) {
    return (
      <main className="min-h-screen grid place-items-center muted">
        Loading PaisaTrack…
      </main>
    );
  }

  return (
    <main className="min-h-screen">
      <header className="border-b border-slate-800 bg-slate-950/80 sticky top-0 z-20 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-emerald-400/15 text-emerald-300">
              <Wallet />
            </div>
            <div>
              <h1 className="font-bold text-lg">PaisaTrack</h1>
              <p className="muted text-xs">Personal finance workspace</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="hidden sm:block muted text-xs">{userEmail}</span>
            <button
              type="button"
              className="btn btn-secondary flex items-center gap-2"
              onClick={() => void logout()}
            >
              <LogOut size={16} />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto p-4 md:p-8 space-y-7">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="muted text-sm">Your financial overview</p>
            <h2 className="text-2xl md:text-3xl font-bold mt-1">Dashboard</h2>
          </div>
          <div className="flex gap-2 items-center">
            <input
              aria-label="Selected month"
              className="field max-w-44"
              type="month"
              value={month}
              onChange={(event) => setMonth(event.target.value || localMonthString())}
            />
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => void load()}
              title="Refresh"
              aria-label="Refresh dashboard"
            >
              <RefreshCw size={17} />
            </button>
          </div>
        </div>

        {error && (
          <div
            role="alert"
            className="rounded-xl border border-red-800 bg-red-950/50 p-3 text-sm text-red-200"
          >
            {error}
          </div>
        )}

        {success && (
          <div
            role="status"
            className="rounded-xl border border-emerald-800 bg-emerald-950/40 p-3 text-sm text-emerald-200"
          >
            {success}
          </div>
        )}

        <section className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <Stat
            title="Income"
            value={money(totals.income)}
            icon={<TrendingUp />}
            color="text-emerald-300"
          />
          <Stat
            title="Expenses"
            value={money(totals.expenses)}
            icon={<TrendingDown />}
            color="text-rose-300"
          />
          <Stat
            title="Net for month"
            value={money(totals.net)}
            icon={<Wallet />}
            color={totals.net >= 0 ? "text-emerald-300" : "text-rose-300"}
          />
          <Stat
            title="Transactions"
            value={String(transactions.length)}
            icon={<ChartNoAxesCombined />}
            color="text-sky-300"
          />
        </section>

        <section className="grid lg:grid-cols-[1.1fr_.9fr] gap-5">
          <div className="panel p-5">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="font-semibold text-lg">Spending by category</h3>
                <p className="muted text-xs mt-1">
                  Selected month · top categories
                </p>
              </div>
            </div>

            {chartData.length === 0 ? (
              <p className="muted text-sm py-12 text-center">
                No expense data for this month yet.
              </p>
            ) : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={chartData}
                    layout="vertical"
                    margin={{ left: 8, right: 20 }}
                  >
                    <CartesianGrid stroke="#263449" strokeDasharray="3 3" />
                    <XAxis
                      type="number"
                      tick={{ fill: "#91a0b7", fontSize: 11 }}
                    />
                    <YAxis
                      type="category"
                      dataKey="category"
                      width={105}
                      tick={{ fill: "#cbd5e1", fontSize: 11 }}
                    />
                    <Tooltip
                      formatter={(value) => money(Number(value))}
                      contentStyle={{
                        background: "#111827",
                        border: "1px solid #334155",
                        borderRadius: 10,
                      }}
                    />
                    <Bar
                      dataKey="amount"
                      fill="#34d399"
                      radius={[0, 6, 6, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className="panel p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-semibold text-lg">
                  {editing ? "Edit transaction" : "Add transaction"}
                </h3>
                <p className="muted text-xs mt-1">
                  Changes sync to your other devices.
                </p>
              </div>
              <Plus className="text-emerald-300" />
            </div>

            <form className="space-y-3" onSubmit={save}>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  className={`btn ${
                    form.transaction_type === "expense"
                      ? "btn-primary"
                      : "btn-secondary"
                  }`}
                  onClick={() =>
                    setForm({
                      ...form,
                      transaction_type: "expense",
                      category_id: "",
                    })
                  }
                >
                  Expense
                </button>
                <button
                  type="button"
                  className={`btn ${
                    form.transaction_type === "income"
                      ? "btn-primary"
                      : "btn-secondary"
                  }`}
                  onClick={() =>
                    setForm({
                      ...form,
                      transaction_type: "income",
                      category_id: "",
                    })
                  }
                >
                  Income
                </button>
              </div>

              <label className="block text-sm">
                Title
                <input
                  className="field mt-1"
                  value={form.title}
                  onChange={(event) =>
                    setForm({ ...form, title: event.target.value })
                  }
                  minLength={2}
                  maxLength={60}
                  placeholder="e.g. Groceries"
                  required
                />
              </label>

              <label className="block text-sm">
                Amount (₹)
                <input
                  className="field mt-1"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={form.amount}
                  onChange={(event) =>
                    setForm({ ...form, amount: event.target.value })
                  }
                  placeholder="0.00"
                  required
                />
              </label>

              <label className="block text-sm">
                Category
                <select
                  className="field mt-1"
                  value={form.category_id}
                  onChange={(event) =>
                    setForm({ ...form, category_id: event.target.value })
                  }
                  required
                >
                  <option value="">Choose category</option>
                  {categories
                    .filter((category) => category.type === form.transaction_type)
                    .map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                </select>
              </label>

              <div className="grid grid-cols-2 gap-2">
                <label className="block text-sm">
                  Date
                  <input
                    className="field mt-1"
                    type="date"
                    value={form.transaction_date}
                    onChange={(event) =>
                      setForm({ ...form, transaction_date: event.target.value })
                    }
                    required
                  />
                </label>

                <label className="block text-sm">
                  Payment
                  <select
                    className="field mt-1"
                    value={form.payment_method}
                    onChange={(event) =>
                      setForm({ ...form, payment_method: event.target.value })
                    }
                  >
                    <option value="upi">UPI</option>
                    <option value="cash">Cash</option>
                    <option value="debit_card">Debit card</option>
                    <option value="credit_card">Credit card</option>
                    <option value="bank_transfer">Bank transfer</option>
                    <option value="net_banking">Net banking</option>
                    <option value="other">Other</option>
                  </select>
                </label>
              </div>

              <label className="block text-sm">
                Notes (optional)
                <textarea
                  className="field mt-1"
                  rows={2}
                  maxLength={500}
                  value={form.notes}
                  onChange={(event) =>
                    setForm({ ...form, notes: event.target.value })
                  }
                />
              </label>

              <div className="flex gap-2">
                <button
                  disabled={busy}
                  className="btn btn-primary flex-1 disabled:opacity-50"
                  type="submit"
                >
                  {busy
                    ? "Saving…"
                    : editing
                      ? "Update transaction"
                      : "Save transaction"}
                </button>

                {editing && (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      setEditing(null);
                      setForm(createInitialForm());
                    }}
                  >
                    Cancel
                  </button>
                )}
              </div>
            </form>
          </div>
        </section>

        <section className="panel p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <h3 className="font-semibold text-lg">Transactions</h3>
              <p className="muted text-xs mt-1">
                {visible.length} records in selected month
              </p>
            </div>

            <label
              className={`btn btn-secondary flex items-center gap-2 ${
                busy ? "opacity-50 pointer-events-none" : "cursor-pointer"
              }`}
            >
              <Upload size={16} />
              Import CSV
              <input
                className="hidden"
                type="file"
                accept=".csv,text/csv"
                disabled={busy}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void importCsv(file);
                  event.currentTarget.value = "";
                }}
              />
            </label>
          </div>

          <div className="flex flex-col sm:flex-row gap-2 mb-4">
            <input
              className="field"
              placeholder="Search title or category…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <select
              className="field sm:max-w-48"
              value={filter}
              onChange={(event) =>
                setFilter(event.target.value as "" | TransactionType)
              }
            >
              <option value="">All types</option>
              <option value="expense">Expenses</option>
              <option value="income">Income</option>
            </select>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[650px]">
              <thead>
                <tr className="muted text-left border-b border-slate-700">
                  <th className="py-3">Transaction</th>
                  <th>Date</th>
                  <th>Category</th>
                  <th>Payment</th>
                  <th className="text-right">Amount</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>

              <tbody>
                {visible.map((transaction) => (
                  <tr
                    key={transaction.id}
                    className="border-b border-slate-800/80"
                  >
                    <td className="py-3 font-medium">
                      {transaction.title}
                      <div className="muted text-xs">
                        {transaction.notes ?? ""}
                      </div>
                    </td>
                    <td>{dateLabel(transaction.transaction_date)}</td>
                    <td>{transaction.categories?.name ?? "—"}</td>
                    <td className="capitalize">
                      {transaction.payment_method.replaceAll("_", " ")}
                    </td>
                    <td
                      className={`text-right font-semibold ${
                        transaction.transaction_type === "income"
                          ? "text-emerald-300"
                          : "text-slate-100"
                      }`}
                    >
                      {transaction.transaction_type === "income" ? "+" : "−"}
                      {money(transaction.amount)}
                    </td>
                    <td>
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          className="p-2 rounded-lg hover:bg-slate-700"
                          aria-label="Edit transaction"
                          onClick={() => edit(transaction)}
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          type="button"
                          className="p-2 rounded-lg hover:bg-red-950 text-rose-300"
                          aria-label="Delete transaction"
                          onClick={() => void remove(transaction.id)}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {visible.length === 0 && (
              <p className="muted text-center py-10">
                No transactions found. Add one above or import a CSV.
              </p>
            )}
          </div>
        </section>

        <footer className="muted text-xs text-center pb-5">
          PaisaTrack · Private financial workspace · INR
        </footer>
      </div>
    </main>
  );
}

function Stat({
  title,
  value,
  icon,
  color,
}: {
  title: string;
  value: string;
  icon: ReactNode;
  color: string;
}) {
  return (
    <div className="panel p-5">
      <div className="flex justify-between items-center muted text-sm">
        <span>{title}</span>
        <span className={color}>{icon}</span>
      </div>
      <p className="text-2xl font-bold mt-3 tracking-tight">{value}</p>
    </div>
  );
}
