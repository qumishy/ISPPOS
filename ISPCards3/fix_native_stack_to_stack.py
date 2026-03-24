from pathlib import Path

files = [
    Path("src/navigation/AdminDrawerNavigator.js"),
    Path("src/navigation/AgentNavigator.js"),
]

for p in files:
    if not p.exists():
        print(f"skip {p}")
        continue
    text = p.read_text()
    text = text.replace(
        "import { createNativeStackNavigator } from '@react-navigation/native-stack';",
        "import { createStackNavigator } from '@react-navigation/stack';"
    )
    text = text.replace(
        "const Stack = createNativeStackNavigator();",
        "const Stack = createStackNavigator();"
    )
    p.write_text(text)
    print(f"patched {p}")
