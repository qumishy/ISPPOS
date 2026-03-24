from pathlib import Path

p = Path("src/screens/MainScreens.js")
text = p.read_text()

# 1. إضافة useAuth import إذا غير موجود
if "useAuth" not in text:
    text = text.replace(
        "from '../services/database';",
        "from '../services/database';\nimport { useAuth } from '../services/AuthContext';"
    )

# 2. داخل CollectionsScreen نضيف const user
text = text.replace(
    "export default function CashierScreen() {",
    "export default function CashierScreen() {\n  const { user } = useAuth();"
)

text = text.replace(
    "export function CollectionsScreen({ navigation }) {",
    "export function CollectionsScreen({ navigation }) {\n  const { user } = useAuth();"
)

text = text.replace(
    "export function InvoicesScreen({ navigation }) {",
    "export function InvoicesScreen({ navigation }) {\n  const { user } = useAuth();"
)

p.write_text(text)
print("FIXED user injection")
