from pathlib import Path
import re

p = Path("src/screens/MainScreens.js")
text = p.read_text()

pattern = r"""let q = supabase\.from\('agent_wallets'\)\s*
\s*if \(user\?\.(?:role|role) === 'agent'\) q = q\.eq\('agent_id', user\.id\);\s*
\s*\.select\('\*,users\(name\),card_categories\(name,price\),batches\(batch_number,serial_number\)'\)\s*
\s*\.order\('created_at',\{ascending:false\}\);\s*
\s*if \(user\?\.role==='agent'\) q = q\.eq\('agent_id',user\.id\);"""

replacement = """let q = supabase
        .from('agent_wallets')
        .select('*,users(name),card_categories(name,price),batches(batch_number,serial_number)')
        .order('created_at',{ascending:false});
      if (user?.role === 'agent') q = q.eq('agent_id', user.id);"""

new_text, n = re.subn(pattern, replacement, text, flags=re.S)

if n == 0:
    # fallback: replace the whole broken sequence more loosely
    pattern2 = r"""let q = supabase\.from\('agent_wallets'\)[\s\S]{0,300}?const \{ data \} = await q;"""
    replacement2 = """let q = supabase
        .from('agent_wallets')
        .select('*,users(name),card_categories(name,price),batches(batch_number,serial_number)')
        .order('created_at',{ascending:false});
      if (user?.role === 'agent') q = q.eq('agent_id', user.id);
      const { data } = await q;"""
    new_text, n = re.subn(pattern2, replacement2, text, count=1, flags=re.S)

p.write_text(new_text)
print(f"patched={n}")
