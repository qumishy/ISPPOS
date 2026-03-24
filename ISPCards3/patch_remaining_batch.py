from pathlib import Path
import re

def replace_or_warn(path, pattern, repl, flags=re.S):
    p = Path(path)
    txt = p.read_text()
    new, n = re.subn(pattern, repl, txt, flags=flags)
    if n:
      p.write_text(new)
      print(f"patched {path} ({n})")
    else:
      print(f"no-match {path}: {pattern[:80]}")

# ---------------- database.js ----------------
p = Path("src/services/database.js")
txt = p.read_text()

txt = txt.replace(
"""      collection_date TEXT,
      active INTEGER DEFAULT 1,""",
"""      collection_date TEXT,
      notes TEXT,
      active INTEGER DEFAULT 1,"""
)

txt = txt.replace(
"""    collection_date: data.collection_date || new Date().toISOString().slice(0, 10),
    active: data.active ?? 1,""",
"""    collection_date: data.collection_date || new Date().toISOString().slice(0, 10),
    notes: data.notes || '',
    active: data.active ?? 1,"""
)

txt = txt.replace(
"""    (id, collection_number, agent_id, pos_id, invoice_id, amount, method, reference_number, status, approved_at, rejection_reason, collection_date, active, created_at, synced)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
"""    (id, collection_number, agent_id, pos_id, invoice_id, amount, method, reference_number, status, approved_at, rejection_reason, collection_date, notes, active, created_at, synced)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"""
)

txt = txt.replace(
"""      payload.amount, payload.method, payload.reference_number, payload.status, payload.approved_at,
      payload.rejection_reason, payload.collection_date, payload.active, payload.created_at, payload.synced""",
"""      payload.amount, payload.method, payload.reference_number, payload.status, payload.approved_at,
      payload.rejection_reason, payload.collection_date, payload.notes, payload.active, payload.created_at, payload.synced"""
)

p.write_text(txt)
print("patched src/services/database.js")

# ---------------- SyncService.js ----------------
p = Path("src/services/SyncService.js")
txt = p.read_text()
txt = txt.replace(
"""    { name: 'collections', fields: 'id,collection_number,agent_id,pos_id,invoice_id,amount,method,reference_number,status,approved_at,rejection_reason,collection_date,active,created_at' },""",
"""    { name: 'collections', fields: 'id,collection_number,agent_id,pos_id,invoice_id,amount,method,reference_number,status,approved_at,rejection_reason,collection_date,notes,active,created_at' },"""
)
p.write_text(txt)
print("patched src/services/SyncService.js")

# ---------------- DashboardScreen.js ----------------
p = Path("src/screens/DashboardScreen.js")
txt = p.read_text()

if "const isAgent = user?.role === 'agent';" not in txt:
    txt = txt.replace(
        "  const { user } = useAuth();",
        "  const { user } = useAuth();\n  const isAgent = user?.role === 'agent';"
    )

txt = txt.replace(
    "        const localInv = await getLocalInvoices();",
    "        const localInv = await getLocalInvoices(isAgent ? { agent_id: user.id } : {});"
)
txt = txt.replace(
    "        const localCol = await getLocalCollections();",
    "        const localCol = await getLocalCollections(isAgent ? { agent_id: user.id } : {});"
)

# post filter common arrays after load if present
for old, new in [
    ("setRecentInvoices(localInv.slice(0, 5));", "setRecentInvoices((isAgent ? localInv.filter(x => String(x.agent_id) === String(user.id)) : localInv).slice(0, 5));"),
    ("setPendingCols(localCol.filter(c => c.status === 'pending').slice(0, 5));", "setPendingCols((isAgent ? localCol.filter(x => String(x.agent_id) === String(user.id)) : localCol).filter(c => c.status === 'pending').slice(0, 5));"),
]:
    txt = txt.replace(old, new)

p.write_text(txt)
print("patched src/screens/DashboardScreen.js")

# ---------------- MainScreens.js ----------------
p = Path("src/screens/MainScreens.js")
txt = p.read_text()

if "const isAgent = user?.role === 'agent';" not in txt and "const { user } = useAuth();" in txt:
    txt = txt.replace(
        "const { user } = useAuth();",
        "const { user } = useAuth();\n  const isAgent = user?.role === 'agent';"
    )

# filter local collections if pattern exists
txt = txt.replace(
    "const data = await getLocalCollections();",
    "const data = await getLocalCollections(user?.role === 'agent' ? { agent_id: user.id } : {});"
)
txt = txt.replace(
    "const data = await getLocalInvoices(filters);",
    "const data = await getLocalInvoices(user?.role === 'agent' ? { ...filters, agent_id: user.id } : filters);"
)

# agent wallets supabase direct
txt = txt.replace(
"""      let q = supabase.from('agent_wallets')""",
"""      let q = supabase.from('agent_wallets')"""
)
txt = txt.replace(
"""      let q = supabase.from('agent_wallets')
""",
"""      let q = supabase.from('agent_wallets')
      if (user?.role === 'agent') q = q.eq('agent_id', user.id);
"""
)

# POS direct filtering if assigned agent exists
txt = txt.replace(
"      const { data } = await supabase.from('pos_customers').select('*').order('name');",
"      let q = supabase.from('pos_customers').select('*').order('name');\n      if (user?.role === 'agent') q = q.eq('assigned_agent_id', user.id);\n      const { data } = await q;"
)

p.write_text(txt)
print("patched src/screens/MainScreens.js")

# ---------------- ReportsScreen.js ----------------
p = Path("src/screens/ReportsScreen.js")
txt = p.read_text()

if "import ExportCsvButton from '../components/ExportCsvButton';" not in txt:
    txt = txt.replace(
        "import { supabase } from '../services/supabase';",
        "import { supabase } from '../services/supabase';\nimport ExportCsvButton from '../components/ExportCsvButton';\nimport { exportRowsToCsv } from '../utils/csvExport';"
    )

if "const isAgent = user?.role === 'agent';" not in txt and "const { user } = useAuth();" in txt:
    txt = txt.replace(
        "const { user } = useAuth();",
        "const { user } = useAuth();\n  const isAgent = user?.role === 'agent';"
    )

# Add export helper before return if possible
if "const handleExportCsv = async () => {" not in txt:
    txt = txt.replace(
        "  if (loading) return <Loading/>;",
        """  const handleExportCsv = async () => {
    const rows =
      activeTab === 'invoices' ? (invoices || []).map(x => ({
        invoice_number: x.invoice_number,
        pos_id: x.pos_id,
        agent_id: x.agent_id,
        total_amount: x.total_amount,
        paid_amount: x.paid_amount,
        status: x.status,
        invoice_date: x.invoice_date,
      })) :
      activeTab === 'collections' ? (collections || []).map(x => ({
        collection_number: x.collection_number,
        agent_id: x.agent_id,
        pos_id: x.pos_id,
        amount: x.amount,
        status: x.status,
        collection_date: x.collection_date,
        notes: x.notes,
      })) :
      activeTab === 'pos' ? (posCustomers || []).map(x => ({
        name: x.name,
        owner_name: x.owner_name,
        city: x.city,
        credit_used: x.credit_used,
        credit_limit: x.credit_limit,
        is_blocked: x.is_blocked,
      })) :
      activeTab === 'inventory' ? (batches || []).map(x => ({
        id: x.id,
        category_id: x.category_id,
        total_cards: x.total_cards,
        available_cards: x.available_cards,
      })) :
      [];
    await exportRowsToCsv(`reports-${activeTab}-${Date.now()}`, rows);
  };

  if (loading) return <Loading/>;"""
    )

# Insert button near top of JSX
txt = txt.replace(
    "<ScrollView style={s.screen} contentContainerStyle={{padding:spacing.md,paddingBottom:60}}>",
    "<ScrollView style={s.screen} contentContainerStyle={{padding:spacing.md,paddingBottom:60}}>\n      <ExportCsvButton onPress={handleExportCsv} />"
)
txt = txt.replace(
    "<ScrollView style={s.screen}",
    "<ScrollView style={s.screen}"
)

# Post-filter results for agent if arrays loaded
for old, new in [
    ("setInvoices(invData || []);", "setInvoices(isAgent ? (invData || []).filter(x => String(x.agent_id) === String(user.id)) : (invData || []));"),
    ("setCollections(colData || []);", "setCollections(isAgent ? (colData || []).filter(x => String(x.agent_id) === String(user.id)) : (colData || []));"),
    ("setPosCustomers(posData || []);", "setPosCustomers(isAgent ? (posData || []).filter(x => String(x.assigned_agent_id || '') === String(user.id)) : (posData || []));"),
    ("setBatches(batchData || []);", "setBatches(batchData || []);"),
]:
    txt = txt.replace(old, new)

p.write_text(txt)
print("patched src/screens/ReportsScreen.js")

# ---------------- FormScreens.js ----------------
p = Path("src/screens/FormScreens.js")
txt = p.read_text()

# initial form state for collection
txt = txt.replace(
    "reference_number: '',",
    "reference_number: '', notes: '',"
)

# pass notes into createLocalCollection if pattern exists
txt = txt.replace(
    "await createLocalCollection({ ...form,",
    "await createLocalCollection({ ...form, notes: form.notes,"
)

# add notes input before actions/save in collection section
pattern = r"(Input label=\"رقم المرجع\".*?\n\s*/>\n)"
if re.search(pattern, txt, flags=re.S):
    txt = re.sub(
        pattern,
        r"""\1          <Input label="ملاحظات" value={form.notes}
            onChangeText={v => setForm({...form, notes:v})}
            placeholder="اختياري..." multiline />
""",
        txt,
        flags=re.S
    )

# Invoice detail already fixed earlier; no extra

p.write_text(txt)
print("patched src/screens/FormScreens.js")
