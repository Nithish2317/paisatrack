 "use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Wallet, TrendingUp, TrendingDown, PiggyBank, Plus, LogOut, RefreshCw, Upload, Trash2, Pencil, ChartNoAxesCombined } from "lucide-react";
import { getSupabase } from "@/lib/supabase";
import { money, dateLabel, monthStart, monthEnd } from "@/lib/format";
import { transactionSchema } from "@/lib/validation";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type Tx = {
  id: string; title: string; amount: number; transaction_type: "income"|"expense";
  transaction_date: string; payment_method: string; notes: string|null; category_id: string;
  categories?: { name: string } | null;
};
type Category = { id: string; name: string; type: string };

const initialForm = { title:"", amount:"", transaction_type:"expense" as "income"|"expense", category_id:"", transaction_date:new Date().toISOString().slice(0,10), payment_method:"upi", notes:"" };

export default function DashboardPage() {
  const router = useRouter();
  const [userEmail,setUserEmail] = useState("");
  const [transactions,setTransactions] = useState<Tx[]>([]);
  const [categories,setCategories] = useState<Category[]>([]);
  const [form,setForm] = useState(initialForm);
  const [editing,setEditing] = useState<string|null>(null);
  const [busy,setBusy] = useState(false);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState("");
  const [success,setSuccess] = useState("");
  const [month,setMonth] = useState(new Date().toISOString().slice(0,7));
  const [filter,setFilter] = useState("");
  const [search,setSearch] = useState("");
  const supabase = useMemo(()=>getSupabase(),[]);

  const load = useCallback(async () => {
    setError("");
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) { router.replace("/login"); return; }
    setUserEmail(auth.user.email ?? "");
    const start = `${month}-01`;
    const endDate = new Date(Number(month.slice(0,4)), Number(month.slice(5,7)), 1);
    const end = endDate.toISOString().slice(0,10);
    const [{data: tx,error:txErr},{data: cats,error:catErr}] = await Promise.all([
      supabase.from("transactions").select("id,title,amount,transaction_type,transaction_date,payment_method,notes,category_id,categories(name)").gte("transaction_date",start).lt("transaction_date",end).is("deleted_at",null).order("transaction_date",{ascending:false}).order("created_at",{ascending:false}),
      supabase.from("categories").select("id,name,type").eq("is_active",true).order("name")
    ]);
    if (txErr) setError(txErr.message);
    if (catErr) setError(catErr.message);
    setTransactions((tx ?? []) as unknown as Tx[]);
    setCategories((cats ?? []) as Category[]);
    setLoading(false);
  },[month,router,supabase]);

  useEffect(()=>{ load(); },[load]);
  useEffect(()=>{
    const channel = supabase.channel("paisatrack-live")
      .on("postgres_changes",{event:"*",schema:"public",table:"transactions"},()=>load())
      .on("postgres_changes",{event:"*",schema:"public",table:"budgets"},()=>load())
      .subscribe();
    return ()=>{ void supabase.removeChannel(channel); };
  },[load,supabase]);

  const totals = useMemo(()=>{
    const income = transactions.filter(t=>t.transaction_type==="income").reduce((s,t)=>s+Number(t.amount),0);
    const expenses = transactions.filter(t=>t.transaction_type==="expense").reduce((s,t)=>s+Number(t.amount),0);
    return {income,expenses,net:income-expenses};
  },[transactions]);

  const chartData = useMemo(()=>{
    const byCategory = new Map<string,number>();
    transactions.filter(t=>t.transaction_type==="expense").forEach(t=>{
      const key=t.categories?.name ?? "Uncategorised"; byCategory.set(key,(byCategory.get(key)??0)+Number(t.amount));
    });
    return [...byCategory.entries()].map(([category,amount])=>({category,amount})).sort((a,b)=>b.amount-a.amount).slice(0,7);
  },[transactions]);

  const visible = transactions.filter(t=>(!filter||t.transaction_type===filter) && (!search||`${t.title} ${t.categories?.name??""}`.toLowerCase().includes(search.toLowerCase())));

  async function save(e:React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(""); setSuccess("");
    const parsed=transactionSchema.safeParse(form);
    if(!parsed.success){setError(parsed.error.issues[0]?.message??"Please check the form.");setBusy(false);return;}
    const payload={...parsed.data,amount:Number(parsed.data.amount),notes:parsed.data.notes||null};
    const {data:auth}=await supabase.auth.getUser();
    if(!auth.user){router.replace("/login");setBusy(false);return;}
    const result=editing
      ? await supabase.from("transactions").update(payload).eq("id",editing).select("id").single()
      : await supabase.from("transactions").insert({...payload,user_id:auth.user.id,currency:"INR",status:"posted"}).select("id").single();
    if(result.error){setError(result.error.message);}
    else {setSuccess(editing?"Transaction updated.":"Transaction added.");setForm(initialForm);setEditing(null);await load();}
    setBusy(false);
  }

  function edit(t:Tx) {
    setEditing(t.id);
    setForm({title:t.title,amount:String(t.amount),transaction_type:t.transaction_type,category_id:t.category_id,transaction_date:t.transaction_date,payment_method:t.payment_method,notes:t.notes??""});
    window.scrollTo({top:0,behavior:"smooth"});
  }

  async function remove(id:string) {
    if(!window.confirm("Delete this transaction? It will be hidden from normal views."))return;
    const {error:e}=await supabase.from("transactions").update({deleted_at:new Date().toISOString()}).eq("id",id);
    if(e)setError(e.message);else{setSuccess("Transaction deleted.");await load();}
  }

  async function importCsv(file:File) {
    setError("");setSuccess("");
    const text=await file.text();
    const lines=text.split(/\r?\n/).filter(Boolean);
    if(lines.length<2){setError("The CSV must contain a header and at least one data row.");return;}
    const headers=lines[0].split(",").map(s=>s.trim().toLowerCase());
    const required=["title","amount","transaction_type","category","transaction_date","payment_method"];
    const missing=required.filter(h=>!headers.includes(h));
    if(missing.length){setError(`Missing CSV columns: ${missing.join(", ")}`);return;}
    const index=(name:string)=>headers.indexOf(name);
    const rows:any[]=[]; const issues:string[]=[];
    const {data:auth}=await supabase.auth.getUser();
    if(!auth.user)return;
    for(let i=1;i<lines.length;i++){
      const cols=lines[i].split(",").map(s=>s.trim());
      const cat=categories.find(c=>c.name.toLowerCase()===cols[index("category")]?.toLowerCase() && c.type===cols[index("transaction_type")]);
      if(!cat){issues.push(`Row ${i+1}: category not found for this transaction type`);continue;}
      const parsed=transactionSchema.safeParse({
        title:cols[index("title")],amount:cols[index("amount")],transaction_type:cols[index("transaction_type")],
        category_id:cat.id,transaction_date:cols[index("transaction_date")],payment_method:cols[index("payment_method")],notes:""
      });
      if(!parsed.success){issues.push(`Row ${i+1}: ${parsed.error.issues[0]?.message}`);continue;}
      rows.push({...parsed.data,amount:Number(parsed.data.amount),user_id:auth.user.id,currency:"INR",status:"posted"});
    }
    if(issues.length){setError(`Import cancelled: ${issues.slice(0,5).join(" | ")}${issues.length>5?` | and ${issues.length-5} more errors`:""}`);return;}
    const {error:e}=await supabase.from("transactions").insert(rows);
    if(e)setError(e.message);else{setSuccess(`${rows.length} transactions imported.`);await load();}
  }

  async function logout(){await supabase.auth.signOut();router.replace("/login");}

  if(loading)return <main className="min-h-screen grid place-items-center muted">Loading PaisaTrack…</main>;

  return <main className="min-h-screen">
    <header className="border-b border-slate-800 bg-slate-950/80 sticky top-0 z-20 backdrop-blur">
      <div className="max-w-7xl mx-auto px-4 md:px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3"><div className="p-2 rounded-xl bg-emerald-400/15 text-emerald-300"><Wallet/></div><div><h1 className="font-bold text-lg">PaisaTrack</h1><p className="muted text-xs">Personal finance workspace</p></div></div>
        <div className="flex items-center gap-3"><span className="hidden sm:block muted text-xs">{userEmail}</span><button className="btn btn-secondary flex items-center gap-2" onClick={logout}><LogOut size={16}/> <span className="hidden sm:inline">Sign out</span></button></div>
      </div>
    </header>

    <div className="max-w-7xl mx-auto p-4 md:p-8 space-y-7">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><p className="muted text-sm">Your financial overview</p><h2 className="text-2xl md:text-3xl font-bold mt-1">Dashboard</h2></div>
        <div className="flex gap-2 items-center"><input aria-label="Selected month" className="field max-w-44" type="month" value={month} onChange={e=>setMonth(e.target.value)}/><button className="btn btn-secondary" onClick={load} title="Refresh"><RefreshCw size={17}/></button></div>
      </div>

      {error&&<div role="alert" className="rounded-xl border border-red-800 bg-red-950/50 p-3 text-sm text-red-200">{error}</div>}
      {success&&<div role="status" className="rounded-xl border border-emerald-800 bg-emerald-950/40 p-3 text-sm text-emerald-200">{success}</div>}

      <section className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <Stat title="Income" value={money(totals.income)} icon={<TrendingUp/>} color="text-emerald-300"/>
        <Stat title="Expenses" value={money(totals.expenses)} icon={<TrendingDown/>} color="text-rose-300"/>
        <Stat title="Net for month" value={money(totals.net)} icon={<Wallet/>} color={totals.net>=0?"text-emerald-300":"text-rose-300"}/>
        <Stat title="Transactions" value={String(transactions.length)} icon={<ChartNoAxesCombined/>} color="text-sky-300"/>
      </section>

      <section className="grid lg:grid-cols-[1.1fr_.9fr] gap-5">
        <div className="panel p-5">
          <div className="flex items-center justify-between mb-5"><div><h3 className="font-semibold text-lg">Spending by category</h3><p className="muted text-xs mt-1">Selected month · top categories</p></div></div>
          {chartData.length===0?<p className="muted text-sm py-12 text-center">No expense data for this month yet.</p>:<div className="h-64"><ResponsiveContainer width="100%" height="100%"><BarChart data={chartData} layout="vertical" margin={{left:8,right:20}}><CartesianGrid stroke="#263449" strokeDasharray="3 3"/><XAxis type="number" tick={{fill:"#91a0b7",fontSize:11}}/><YAxis type="category" dataKey="category" width={105} tick={{fill:"#cbd5e1",fontSize:11}}/><Tooltip formatter={(v)=>money(Number(v))} contentStyle={{background:"#111827",border:"1px solid #334155",borderRadius:10}}/><Bar dataKey="amount" fill="#34d399" radius={[0,6,6,0]}/></BarChart></ResponsiveContainer></div>}
        </div>

        <div className="panel p-5">
          <div className="flex items-center justify-between mb-4"><div><h3 className="font-semibold text-lg">{editing?"Edit transaction":"Add transaction"}</h3><p className="muted text-xs mt-1">Changes sync to your other devices.</p></div><Plus className="text-emerald-300"/></div>
          <form className="space-y-3" onSubmit={save}>
            <div className="grid grid-cols-2 gap-2"><button type="button" className={`btn ${form.transaction_type==="expense"?"btn-primary":"btn-secondary"}`} onClick={()=>setForm({...form,transaction_type:"expense",category_id:""})}>Expense</button><button type="button" className={`btn ${form.transaction_type==="income"?"btn-primary":"btn-secondary"}`} onClick={()=>setForm({...form,transaction_type:"income",category_id:""})}>Income</button></div>
            <label className="block text-sm">Title<input className="field mt-1" value={form.title} onChange={e=>setForm({...form,title:e.target.value})} minLength={2} maxLength={60} placeholder="e.g. Groceries" required/></label>
            <label className="block text-sm">Amount (₹)<input className="field mt-1" type="number" min="0.01" step="0.01" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})} placeholder="0.00" required/></label>
            <label className="block text-sm">Category<select className="field mt-1" value={form.category_id} onChange={e=>setForm({...form,category_id:e.target.value})} required><option value="">Choose category</option>{categories.filter(c=>c.type===form.transaction_type).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-sm">Date<input className="field mt-1" type="date" value={form.transaction_date} onChange={e=>setForm({...form,transaction_date:e.target.value})} required/></label>
              <label className="block text-sm">Payment<select className="field mt-1" value={form.payment_method} onChange={e=>setForm({...form,payment_method:e.target.value})}><option value="upi">UPI</option><option value="cash">Cash</option><option value="debit_card">Debit card</option><option value="credit_card">Credit card</option><option value="bank_transfer">Bank transfer</option><option value="net_banking">Net banking</option><option value="other">Other</option></select></label>
            </div>
            <label className="block text-sm">Notes (optional)<textarea className="field mt-1" rows={2} maxLength={500} value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></label>
            <div className="flex gap-2"><button disabled={busy} className="btn btn-primary flex-1 disabled:opacity-50">{busy?"Saving…":editing?"Update transaction":"Save transaction"}</button>{editing&&<button type="button" className="btn btn-secondary" onClick={()=>{setEditing(null);setForm(initialForm);}}>Cancel</button>}</div>
          </form>
        </div>
      </section>

      <section className="panel p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4"><div><h3 className="font-semibold text-lg">Transactions</h3><p className="muted text-xs mt-1">{visible.length} records in selected month</p></div><label className="btn btn-secondary flex items-center gap-2 cursor-pointer"><Upload size={16}/> Import CSV<input className="hidden" type="file" accept=".csv,text/csv" onChange={e=>{const f=e.target.files?.[0];if(f)void importCsv(f);e.currentTarget.value="";}}/></label></div>
        <div className="flex flex-col sm:flex-row gap-2 mb-4"><input className="field" placeholder="Search title or category…" value={search} onChange={e=>setSearch(e.target.value)}/><select className="field sm:max-w-48" value={filter} onChange={e=>setFilter(e.target.value)}><option value="">All types</option><option value="expense">Expenses</option><option value="income">Income</option></select></div>
        <div className="overflow-x-auto"><table className="w-full text-sm min-w-[650px]"><thead><tr className="muted text-left border-b border-slate-700"><th className="py-3">Transaction</th><th>Date</th><th>Category</th><th>Payment</th><th className="text-right">Amount</th><th className="text-right">Actions</th></tr></thead><tbody>{visible.map(t=><tr key={t.id} className="border-b border-slate-800/80"><td className="py-3 font-medium">{t.title}<div className="muted text-xs">{t.notes??""}</div></td><td>{dateLabel(t.transaction_date)}</td><td>{t.categories?.name??"—"}</td><td className="capitalize">{t.payment_method.replaceAll("_"," ")}</td><td className={`text-right font-semibold ${t.transaction_type==="income"?"text-emerald-300":"text-slate-100"}`}>{t.transaction_type==="income"?"+":"−"}{money(t.amount)}</td><td><div className="flex justify-end gap-2"><button className="p-2 rounded-lg hover:bg-slate-700" aria-label="Edit transaction" onClick={()=>edit(t)}><Pencil size={15}/></button><button className="p-2 rounded-lg hover:bg-red-950 text-rose-300" aria-label="Delete transaction" onClick={()=>void remove(t.id)}><Trash2 size={15}/></button></div></td></tr>)}</tbody></table>{visible.length===0&&<p className="muted text-center py-10">No transactions found. Add one above or import a CSV.</p>}</div>
      </section>
      <footer className="muted text-xs text-center pb-5">PaisaTrack · Private financial workspace · INR</footer>
    </div>
  </main>;
}

function Stat({title,value,icon,color}:{title:string;value:string;icon:React.ReactNode;color:string}) {
  return <div className="panel p-5"><div className="flex justify-between items-center muted text-sm"><span>{title}</span><span className={color}>{icon}</span></div><p className="text-2xl font-bold mt-3 tracking-tight">{value}</p></div>;
}
