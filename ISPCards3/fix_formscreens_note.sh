FILE="src/screens/FormScreens.js"

# نحذف الجزء المكسور فقط
sed -i '/<Input label="التاريخ"/,/<Row style={st.actions}>/d' $FILE

# نضيف الجزء الصحيح
sed -i '/<Row style={st.actions}>/i\
        <Input\
          label="التاريخ"\
          value={form.collection_date}\
          onChangeText={v=>setForm({...form,collection_date:v})}\
          placeholder="YYYY-MM-DD"\
        />\
\
        <Input\
          label="ملاحظات"\
          value={form.note}\
          onChangeText={v=>setForm({...form,note:v})}\
          placeholder="اختياري..."\
          multiline\
        />\
' $FILE
