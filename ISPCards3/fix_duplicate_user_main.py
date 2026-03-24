from pathlib import Path
import re

p = Path("src/screens/MainScreens.js")
text = p.read_text()

# إزالة التكرار المتتالي داخل InvoicesScreen
text = text.replace(
"""export function InvoicesScreen({ navigation }) {
  const { user } = useAuth();
  const { user } = useAuth();""",
"""export function InvoicesScreen({ navigation }) {
  const { user } = useAuth();"""
)

# إزالة أي تكرار متتالٍ عام
text = re.sub(
    r"(const \{ user \} = useAuth\(\);\n)\s*const \{ user \} = useAuth\(\);\n",
    r"\1",
    text
)

p.write_text(text)
print("fixed duplicate user declarations")
