# حذف أي تكرار إضافي لـ allInvoices وترك أول واحد فقط
awk '
/const \[allInvoices, setAllInvoices\] = useState\(\[\]\);/ {
  count++
  if (count > 1) next
}
{ print }
' src/screens/FormScreens.js > tmp && mv tmp src/screens/FormScreens.js
