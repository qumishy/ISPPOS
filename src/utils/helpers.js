export const formatNumber = (n) => {
  if (!n && n !== 0) return '0';
  const parts = parseFloat(String(n).replace(/,/g, '')).toFixed(0).split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return parts[0];
};
export const formatCurrency = (n) => formatNumber(n) + ' ر.ي';
export const formatDateShort = (d) => {
  if (!d) return '—';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return d;
  const p = (n) => String(n).padStart(2, '0');
  return `${p(dt.getDate())}/${p(dt.getMonth() + 1)}/${dt.getFullYear()}`;
};
export const todayISO = () => new Date().toISOString().split('T')[0];

export const statusLabel = (s) => ({
  paid: 'مسددة', pending: 'معلقة', overdue: 'متأخرة', partial: 'جزئي', cancelled: 'ملغاة',
  approved: 'معتمد', rejected: 'مرفوض', unapproved: 'غير معتمدة', approval_partial: 'معتمد جزئي',
  active: 'نشط', depleted: 'منتهي', critical: 'حرج',
  cash: 'نقدي', credit: 'آجل',
}[s] || s);

export const statusColor = (s) => ({
  paid: '#10b981', approved: '#10b981', active: '#10b981',
  pending: '#f59e0b', partial: '#f59e0b', critical: '#f59e0b',
  overdue: '#ef4444', rejected: '#ef4444', depleted: '#ef4444', cancelled: '#ef4444', unapproved: '#f59e0b', approval_partial: '#3b82f6',
  cash: '#3b82f6', credit: '#8b5cf6',
}[s] || '#475569');

export const invoicePaymentStatusMeta = (status) => ({
  pending: { label: 'معلقة', color: '#f59e0b' },
  partial: { label: 'مسددة جزئياً', color: '#3b82f6' },
  paid: { label: 'مسددة', color: '#10b981' },
  cancelled: { label: 'ملغاة', color: '#ef4444' },
}[status] || { label: status || '—', color: '#64748b' });

export const invoiceApprovalStatusMeta = (status) => ({
  unapproved: { label: 'غير معتمدة', color: '#f59e0b' },
  approval_partial: { label: 'معتمد جزئي', color: '#3b82f6' },
  approved: { label: 'معتمدة', color: '#10b981' },
  cancelled: { label: 'ملغاة', color: '#ef4444' },
}[status] || { label: status || '—', color: '#64748b' });

export const creditPercent = (used, limit) => {
  if (!limit || limit === 0) return 0;
  return Math.min(100, Math.round((used / limit) * 100));
};
export const creditColor = (pct, blocked) => {
  if (blocked) return '#ef4444';
  if (pct >= 90) return '#ef4444';
  if (pct >= 75) return '#f59e0b';
  return '#10b981';
};

export const YEMEN_REGIONS = {
  'أمانة العاصمة': ['صنعاء القديمة', 'شعوب', 'آزال', 'الصافية', 'السبعين', 'الوحدة', 'التحرير', 'معين', 'الثورة', 'بني الحارث'],
  'صنعاء': ['همدان', 'أرحب', 'نهم', 'بني حشيش', 'سنحان وبني بهلول', 'بلاد الروس', 'بني مطر', 'الحيمة الداخلية', 'الحيمة الخارجية', 'مناخة', 'صعفان', 'خولان', 'الطيال', 'بني ضبيان', 'الحصن', 'جحانة'],
  'عدن': ['صيرة', 'خور مكسر', 'المعلا', 'التواهي', 'الشيخ عثمان', 'المنصورة', 'دار سعد', 'البريقة'],
  'تعز': ['التعزية', 'جبل حبشي', 'حيفان', 'خدير', 'ذباب', 'سامع', 'شرعب الرونة', 'شرعب السلام', 'الشمايتين', 'صالة', 'صبر الموادم', 'الصلو', 'القاهرة', 'ماوية', 'المخاء', 'المسراخ', 'مشرعة وحدنان', 'المظفر', 'المعافر', 'مقبنة', 'المواسط', 'موزع', 'الوازعية'],
  'الحديدة': ['الحالي', 'الميناء', 'الحوك', 'باجل', 'برع', 'بيت الفقيه', 'التحيتا', 'الجراحي', 'جبل رأس', 'الحجيلة', 'حيس', 'الخوخة', 'الدريهمي', 'زبيد', 'الزهرة', 'الزيدية', 'السخنة', 'الصليف', 'الضحى', 'القناوص', 'كمران', 'اللحية', 'المراوعة', 'المغلاف', 'المنصورية', 'المنيرة'],
  'إب': ['إب', 'الظهار', 'المشنة', 'جبلة', 'العدين', 'حزم العدين', 'فرع العدين', 'ذي السفال', 'السياني', 'المخادر', 'حبيش', 'بعدان', 'الشعر', 'السبرة', 'السدة', 'النادرة', 'الرضمة', 'يريم', 'القفر', 'مذيخرة'],
  'ذمار': ['مدينة ذمار', 'الحداء', 'جهران', 'جبل الشرق', 'مغرب عنس', 'عتمة', 'وصاب العالي', 'وصاب السافل', 'ميفعة عنس', 'عنس', 'ضوران آنس', 'المنار'],
  'حضرموت': ['مدينة المكلا', 'أرياف المكلا', 'الشحر', 'غيل باوزير', 'غيل بن يمين', 'الريدة وقصيعر', 'الديس', 'بروم ميفع', 'حجر', 'يبعث', 'دوعن', 'الضليعة', 'حورة ووادي العين', 'القطن', 'تريم', 'سيئون', 'شبام', 'sah', 'السوم', 'حريضة', 'رخية', 'عمد', 'العبر', 'حجر الصيعر', 'زمخ ومنوخ', 'القف', 'ثمود', 'رماه'],
  'مأرب': ['مدينة مأرب', 'مأرب', 'صرواح', 'الجوبة', 'حريب', 'العبدية', 'ماهلية', 'رحبة', 'جبل مراد', 'مجزر', 'مدغل', 'رغوان', 'بدبدة', 'حريب القراميش'],
  'لحج': ['الحوطة', 'تبن', 'طور الباحة', 'المضاربة ورأس العارة', 'المقاطرة', 'القبيطة', 'المسيمير', 'ردفان', 'الملاح', 'حبيل جبر', 'حالمين', 'يافع', 'يهر', 'المفلحي', 'الحد'],
  'البيضاء': ['مدينة البيضاء', 'البيضاء', 'رداع', 'الشرية', 'الرياشية', 'الزاهر', 'السوادية', 'الصومعة', 'الطفة', 'العرش', 'القريشية', 'الملاجم', 'ذي ناعم', 'ردمان', 'صباح', 'مكيراس', 'ناطع', 'نعمان', 'ولد ربيع', 'مسورة'],
  'شبوة': ['عتق', 'بيحان', 'عين', 'عسيلان', 'مرخة العليا', 'مرخة السفلى', 'نصاب', 'حطيب', 'الصعيد', 'حبان', 'الروضة', 'ميفعة', 'رضوم', 'جردان', 'الطلح', 'دهر', 'عرماء'],
  'الجوف': ['الحزم', 'خب والشعف', 'برط العنان', 'رجوزة', 'خراب المراشي', 'المتون', 'المصلوب', 'المطمة', 'الغيل', 'الخلق', 'الحميدات', 'الزاهر'],
  'صعدة': ['صعدة', 'سحار', 'كتاف والبقع', 'باقم', 'قطابر', 'منبه', 'غمر', 'رازح', 'شداء', 'الظاهر', 'حيدان', 'ساقين', 'مجز', 'الصفراء', 'الحشوة'],
  'عمران': ['عمران', 'حرف سفيان', 'حوث', 'العشة', 'قفلة عذر', 'شهارة', 'المدان', 'صوير', 'ظليمة حبور', 'ذيبين', 'خارف', 'ريدة', 'جبل عيال يزيد', 'السودة', 'السود', 'مسور', 'ثلاء', 'عيال سريح', 'خمر', 'بني صريم'],
  'ريمة': ['الجبين', 'بلاد الطعام', 'السلفية', 'الجعفرية', 'كسمة', 'مزهر'],
  'المحويت': ['مدينة المحويت', 'المحويت', 'شبام كوكبان', 'الطويلة', 'الرجم', 'الخبت', 'ملحان', 'حفاش', 'بني سعد'],
  'حجة': ['بكيل المير', 'حرض', 'ميدي', 'عبس', 'حيران', 'مستباء', 'كشر', 'الجميمة', 'كحلان الشرف', 'أفلح الشام', 'خيران المحرق', 'أسلم', 'قفل شمر', 'أفلح اليمن', 'المحابشة', 'المفتاح', 'المغربة', 'كحلان عفار', 'شرس', 'مبين', 'الشاهل', 'كعيدنة', 'وضرة', 'بني قيس الطور', 'الشغادرة', 'نجرة', 'بني العوام', 'مدينة حجة', 'حجة', 'وشحة', 'قارة'],
  'الضالع': ['الضالع', 'قعطبة', 'دمت', 'جبن', 'الشعيب', 'الحصين', 'جحاف', 'الأزارق', 'الحشاء'],
  'أبين': ['زنجبار', 'خنفر', 'لودر', 'مودية', 'المحفد', 'الوضيع', 'أحور', 'رصد', 'سرار', 'سباح', 'جيشان'],
  'المهرة': ['الغيضة', 'حات', 'شحن', 'حوف', 'قشن', 'سيحوت', 'المسيلة', 'حصوين', 'منعر'],
  'أرخبيل سقطرى': ['حديبو', 'قلنسية وعبد الكوري']
};
export const GOVERNORATES = Object.keys(YEMEN_REGIONS);
export const getDistricts = (gov) => YEMEN_REGIONS[gov] || [];

export const generateSupplyReceiptHTML = (supply, colsDetails, userName, agentNameStr) => {
  const typeStr = supply.type === 'voucher' ? 'سند قبض مباشر' : supply.type === 'deposit' ? 'إيداع نقدي' : 'أخرى';

  // Calculate dynamic date descriptions based on actual collections linked
  const dates = [...new Set((colsDetails || []).map(c => c.collection_date?.split('T')[0]).filter(Boolean))].sort();
  let dateText = '';
  if (dates.length === 1) dateText = `تاريخ ${dates[0]}`;
  else if (dates.length > 1) dateText = `الفترة (${dates[0]} م إلى ${dates[dates.length - 1]} م)`;

  let titleDesc = '';
  if (supply.agent_id && dateText) titleDesc = `إيرادات المندوب ${agentNameStr} لـ ${dateText}`;
  else if (supply.agent_id && !dateText) titleDesc = `إيرادات المندوب ${agentNameStr}`;
  else if (!supply.agent_id && dateText) titleDesc = `إيرادات عامة لـ ${dateText}`;
  else titleDesc = 'إيراد تحصيلات مناديب متعدين';

  let tableRows = '';
  if (colsDetails && colsDetails.length > 0) {
    colsDetails.forEach((c, idx) => {
      const net = Number(c.net_amount) || 0;
      const isFull = (Number(c.approved_amount) || 0) >= (net - 0.1) && net > 0;
      tableRows += `
        <tr>
          <td>${idx + 1}</td>
          <td>${c.collection_number}</td>
          <td>${c.invoice_number}</td>
          <td>${c.agent_name || '—'}</td>
          <td>${c.pos_name || '—'}</td>
          <td>${c.items_desc || '—'}</td>
          <td>${formatCurrency(net)}</td>
          <td>${isFull ? 'مسددة بالكامل' : 'تسديد جزئي'}</td>
          <td style="font-weight: bold;">${formatCurrency(c.collection_amount)}</td>
        </tr>
      `;
    });
  } else {
    tableRows = `<tr><td colspan="9" style="text-align: center; padding: 20px;">لم يتم العثور على تحصيلات مرتبطة بهذا التوريد.</td></tr>`;
  }

  return `
    <html dir="rtl">
      <head>
        <style>
          body { font-family: 'Segoe UI', Tahoma, sans-serif; padding: 20px; color: #333; }
          .receipt-box { padding: 10px; }
          .header { text-align: center; border-bottom: 2px solid #e2e8f0; padding-bottom: 15px; margin-bottom: 20px; }
          .title { font-size: 24px; font-weight: 900; color: #1e3a8a; }
          .subtitle { font-size: 16px; color: #64748b; margin-top: 5px; font-weight: bold; }
          .row { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 14px; border-bottom: 1px dashed #cbd5e1; padding-bottom: 5px; }
          .label { font-weight: bold; color: #64748b; }
          .value { font-weight: 900; color: #1e40af; }
          table { width: 100%; border-collapse: collapse; margin-top: 25px; font-size: 11px; }
          th, td { border: 1px solid #cbd5e1; padding: 8px; text-align: center; }
          th { background-color: #f1f5f9; color: #1e3a8a; font-weight: bold; }
          .footer { margin-top: 30px; text-align: center; font-size: 12px; color: #94a3b8; }
          .signature-box { display: flex; justify-content: space-around; margin-top: 50px; font-weight: bold; }
          .sign-line { border-top: 1px solid #333; width: 200px; text-align: center; padding-top: 5px; margin-top: 40px; }
        </style>
      </head>
      <body>
        <div class="receipt-box">
          <div class="header">
            <div class="title">سند قيد محاسبي</div>
            <div class="subtitle">(${titleDesc})</div>
            <div style="font-size: 14px; margin-top: 10px;">رقم النظام: ${supply.supply_number}</div>
          </div>
          <div class="row"><span class="label">التاريخ:</span> <span class="value">${supply.created_at}</span></div>
          <div class="row"><span class="label">اسم المحاسب (المُنشيء):</span> <span class="value">${userName}</span></div>
          <div class="row"><span class="label">إيراد عن المندوبين:</span> <span class="value">${agentNameStr}</span></div>
          <div class="row"><span class="label">نوع التوريد:</span> <span class="value">${typeStr}</span></div>
          <div class="row"><span class="label">حالة التوريد المستندي:</span> <span class="value">${supply.status === 'approved' ? 'معتمد ✅' : supply.status === 'pending' ? 'قيد المراجعة ⏳' : 'مرفوض ❌'}</span></div>
          <div class="row"><span class="label">ملاحظات التوريد:</span> <span class="value">${supply.notes || '—'}</span></div>
          
          <div style="margin-top: 20px; text-align: left;">
             <span style="font-size: 14px; color: #64748b;">المبلغ الصافي المورد:</span>
             <span style="font-size: 22px; font-weight: 900; color: #1e3a8a; margin-right: 15px;">${formatCurrency(supply.amount)}</span>
          </div>

          <h3 style="margin-top: 25px; color: #1e3a8a; font-size: 16px; border-bottom: 2px solid #1e3a8a; display: inline-block;">كشف تفصيلي بالتحصيلات</h3>
          <table>
            <thead>
              <tr>
                <th>م</th>
                <th>رقم التحصيل</th>
                <th>رقم الفاتورة</th>
                <th>المندوب</th>
                <th>نقطة البيع</th>
                <th>تفاصيل الفاتورة</th>
                <th>إجمالي الفاتورة</th>
                <th>حالة السداد</th>
                <th>المبلغ المحصل</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows}
            </tbody>
          </table>

          <div class="signature-box">
             <div>
               <div>توقيع المحاسب</div>
               <div class="sign-line">الاسم: ${userName}</div>
             </div>
             <div>
               <div>اعتماد الإدارة الماليّة</div>
               <div class="sign-line">الختم/التوقيع</div>
             </div>
          </div>

          <div class="footer">تعهد مالي وصادر عبر نظام ISP Cards System v3</div>
        </div>
      </body>
    </html>
  `;
};
