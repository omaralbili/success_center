/* ===================================================
   student-inquiry.js — الاستعلام الذكي عن مدفوعات الطلاب
   نظام إدارة حسابات النجاح
   =================================================== */

// روابط قواعد البيانات
const STUDENTS_DB_URL = "https://script.google.com/macros/s/AKfycbx35GjixD83S6R69c2mnA9KvgG93I0PX-yrIDdokwLRzaTTkd9fRR3fwuyHRWLUJDK5/exec";
const TRANSACTIONS_URL = "https://script.google.com/macros/s/AKfycbxazZen_peC1JAwtTJ-eScQmuCWpsPYvqeubzj0ZL1NdBVOxV4hJjixFYQ_LkU_rSvs/exec";
const ATTENDANCE_URL = "https://script.google.com/macros/s/AKfycbwqGlBz-aIG9uqyHOB5Y30Io7GnIkRzKWbejh-nHMl2nhVXEUNkNPAG9S4IvXRObd-N/exec";

let allStudents = [];
let allTransactions = [];
let allAttendance = [];

/* ===================================================
   توحيد الأسماء المركبة وإزالة الفروق الإملائية
   يدمج: "عبد الله" -> "عبدالله", "أبو بكر" -> "أبوبكر"
   ويوحد الهمزات والياء والألف اللينة
   =================================================== */
function normalizeArabicName(name) {
    if (!name) return "";
    let str = name.toString().trim();

    // إزالة التشكيل والتطويل
    str = str.replace(/[\u064B-\u065F\u0640]/g, '');

    // دمج الأسماء المركبة الشائعة ككلمة واحدة (سواء كتبت بمسافة أو بدون)
    // 1) عبد + اسم: عبد الله -> عبدالله، عبد الرحمن -> عبدالرحمن
    str = str.replace(/\bعبد\s+([\u0621-\u064A])/g, 'عبد$1');

    // 2) أبو / ابي / ابا + اسم: أبو بكر -> أبوبكر
    str = str.replace(/\b(أبو|ابو|أبي|ابي|أبا|ابا)\s+([\u0621-\u064A])/g, '$1$2');

    // 3) بن / ابن
    str = str.replace(/\bابن\s+/g, 'بن ');

    // 4) توحيد أشكال الهمزات
    str = str.replace(/[إأآٱ]/g, 'ا');
    str = str.replace(/ة\b/g, 'ه');
    str = str.replace(/[ىي]/g, 'ي');

    // إزالة المسافات الزائدة
    str = str.replace(/\s+/g, ' ').trim();

    return str;
}

/**
 * تنظيف وعرض الاسم المركب ككلمة واحدة دائماً في العرض المرئي
 * مثال: "عبد الله محمد" -> "عبدالله محمد"
 */
function displayNormalizedName(name) {
    if (!name) return "";
    let str = name.toString().trim().replace(/\s+/g, ' ');
    // دمج "عبد ..." لتصبح جزءاً واحداً دائماً في العرض
    str = str.replace(/\bعبد\s+([\u0621-\u064A])/g, 'عبد$1');
    // دمج "أبو ..."
    str = str.replace(/\b(أبو|ابو|أبي|ابي|أبا|ابا)\s+([\u0621-\u064A])/g, '$1$2');
    return str;
}

document.addEventListener("DOMContentLoaded", () => {
    initTheme();
    loadAllData();
    initInquirySearch();

    // فحص ما إذا كان هناك اسم طالب ممرر عبر رابط الصفحة ?student=...
    const urlParams = new URLSearchParams(window.location.search);
    const queryStudent = urlParams.get('student');
    if (queryStudent) {
        const input = document.getElementById("inquiryStudentInput");
        if (input) {
            input.value = decodeURIComponent(queryStudent);
            // الانتظار حتى تحميل البيانات ثم البحث
            setTimeout(() => {
                selectStudent(input.value);
            }, 600);
        }
    }
});

/* ───────────────────────────────────────────────────
   إدارة المظهر (Dark / Light)
   ─────────────────────────────────────────────────── */
function initTheme() {
    const saved = localStorage.getItem('theme');
    const sys = window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    applyTheme(saved || sys);
}

function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
    document.querySelectorAll('.theme-toggle-btn').forEach(btn => {
        const ic = btn.querySelector('i');
        const sp = btn.querySelector('span');
        if (ic && sp) {
            ic.className = theme === 'dark' ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
            ic.style.color = theme === 'dark' ? '#f59e0b' : '';
            sp.textContent = theme === 'dark' ? 'الوضع النهاري' : 'الوضع الليلي';
        }
    });
}

function toggleTheme() {
    const cur = document.documentElement.getAttribute('data-theme') || 'light';
    applyTheme(cur === 'dark' ? 'light' : 'dark');
}

function showToast(msg, type = "info") {
    const container = document.getElementById("toastContainer");
    if (!container) return;
    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    const icons = { success: "circle-check", danger: "circle-xmark", warning: "triangle-exclamation", info: "circle-info" };
    toast.innerHTML = `<i class="fa-solid fa-${icons[type] || 'circle-info'}"></i><span>${msg}</span>`;
    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add("show"));
    setTimeout(() => {
        toast.classList.remove("show");
        setTimeout(() => toast.remove(), 400);
    }, 3500);
}

/* ───────────────────────────────────────────────────
   تحميل بيانات الطلاب والتحصيلات
   ─────────────────────────────────────────────────── */
async function loadAllData(forceRefresh = false) {
    // محاولة استخدام الكاش السريع
    if (!forceRefresh) {
        const cachedStudents = localStorage.getItem('center_students_db_cache');
        if (cachedStudents) {
            try { allStudents = JSON.parse(cachedStudents); } catch(_) {}
        }
        const cachedTxs = localStorage.getItem('center_txs_cache');
        if (cachedTxs) {
            try { allTransactions = JSON.parse(cachedTxs); } catch(_) {}
        }
        const cachedAtt = localStorage.getItem('center_att_cache');
        if (cachedAtt) {
            try { allAttendance = JSON.parse(cachedAtt); } catch(_) {}
        }
    }

    try {
        // جلب الطلاب
        const p1 = fetch(STUDENTS_DB_URL, { redirect: 'follow' })
            .then(r => r.json())
            .catch(() => []);

        // جلب المعاملات من الشيت
        const p2 = fetch(`${TRANSACTIONS_URL}?action=getTransactions`, { redirect: 'follow' })
            .then(r => r.json())
            .catch(() => []);

        // جلب سجلات الحضور والغياب
        const p3 = fetch(`${ATTENDANCE_URL}?action=getAttendance`, { redirect: 'follow' })
            .then(r => r.json())
            .catch(() => []);

        const [studentsData, txsData, attData] = await Promise.all([p1, p2, p3]);

        if (Array.isArray(studentsData) && studentsData.length > 0) {
            allStudents = studentsData.map((item, idx) => ({
                id: item.id || idx,
                studentName: (item.studentName || item.name || '').trim(),
                teacherName: (item.teacherName || item.teacher || '').trim(),
                category: (item.category || '').trim(),
                grade: (item.grade || '').trim()
            })).filter(s => s.studentName);
            localStorage.setItem('center_students_db_cache', JSON.stringify(allStudents));
        }

        // التعامل مع بيانات التحصيلات
        let txList = [];
        if (Array.isArray(txsData)) {
            txList = txsData;
        } else if (txsData && Array.isArray(txsData.transactions)) {
            txList = txsData.transactions;
        }

        if (txList.length > 0) {
            allTransactions = txList.map(t => ({
                studentName: (t.studentName || t['اسم الطالب'] || '').trim(),
                teacherName: (t.teacherName || t['المعلم'] || '').trim(),
                category: (t.category || t['الفئة'] || '').trim(),
                grade: (t.grade || t['الصف'] || '').trim(),
                amount: t.amount || t['المبلغ'] || '0',
                date: t.date || t['التاريخ'] || '',
                fileLink: t.fileLink || t['رابط الإيصال'] || ''
            }));
            localStorage.setItem('center_txs_cache', JSON.stringify(allTransactions));
        }

        // التعامل مع بيانات الحضور والغياب
        let attList = [];
        if (Array.isArray(attData)) {
            attList = attData;
        } else if (attData && Array.isArray(attData.records)) {
            attList = attData.records;
        }

        if (attList.length > 0) {
            allAttendance = attList.map(a => ({
                studentName: (a.studentName || '').trim(),
                teacherName: (a.teacher || a.teacherName || '').trim(),
                category: (a.category || '').trim(),
                grade: (a.grade || '').trim(),
                status: (a.status || '').trim(),
                date: (a.date || '').trim(),
                note: (a.note || '').trim()
            }));
            localStorage.setItem('center_att_cache', JSON.stringify(allAttendance));
        }

        if (forceRefresh) {
            showToast("تم تحديث كافة البيانات بنجاح من جوجل شيت ✅", "success");
            const inputVal = document.getElementById("inquiryStudentInput")?.value.trim();
            if (inputVal) selectStudent(inputVal);
        }
    } catch (e) {
        console.warn("Data load error:", e);
    }
}

/* ───────────────────────────────────────────────────
   تهيئة شريط البحث والإكمال التلقائي
   ─────────────────────────────────────────────────── */
function initInquirySearch() {
    const input = document.getElementById("inquiryStudentInput");
    const dropdown = document.getElementById("inquiryDropdown");
    const clearBtn = document.getElementById("clearInquiryBtn");
    if (!input || !dropdown) return;

    input.addEventListener("input", function() {
        const query = this.value.trim().toLowerCase();

        if (clearBtn) {
            clearBtn.style.display = query ? "flex" : "none";
        }

        if (!query) {
            dropdown.style.display = "none";
            dropdown.innerHTML = "";
            return;
        }

        // جمع كل الطلاب مع تمييزهم بالفئة والصف الدراسي
        const matchesMap = new Map();
        const normQuery = normalizeArabicName(query);

        allStudents.forEach(s => {
            const rawName = s.studentName || '';
            const normName = normalizeArabicName(rawName);

            if (normName.includes(normQuery)) {
                // مفتاح فريد يجمع بين الاسم والفئة والصف
                const key = `${normName}_${(s.category || '').trim()}_${(s.grade || '').trim()}`;
                if (!matchesMap.has(key)) {
                    matchesMap.set(key, {
                        name: displayNormalizedName(rawName),
                        normName: normName,
                        teacher: s.teacherName,
                        category: (s.category || '').trim(),
                        grade: (s.grade || '').trim(),
                        id: s.id
                    });
                }
            }
        });

        // أيضاً المعاملات إذا كان هناك طلاب فيها
        allTransactions.forEach(t => {
            const rawName = t.studentName || '';
            const normName = normalizeArabicName(rawName);

            if (normName.includes(normQuery)) {
                const key = `${normName}_${(t.category || '').trim()}_${(t.grade || '').trim()}`;
                if (!matchesMap.has(key)) {
                    matchesMap.set(key, {
                        name: displayNormalizedName(rawName),
                        normName: normName,
                        teacher: t.teacherName,
                        category: (t.category || '').trim(),
                        grade: (t.grade || '').trim(),
                        id: null
                    });
                }
            }
        });

        const matches = Array.from(matchesMap.values());

        if (matches.length === 0) {
            dropdown.innerHTML = `
                <div style="padding: 12px; text-align: center; color: var(--text-muted); font-size: 13px;">
                    <i class="fa-solid fa-circle-question" style="margin-left: 6px;"></i>
                    لم يتم العثور على طالب باسم "${query}"
                </div>
            `;
            dropdown.style.display = "block";
            return;
        }

        const topMatches = matches.slice(0, 10);
        dropdown.innerHTML = topMatches.map((m, idx) => `
            <div class="autocomplete-item" data-idx="${idx}">
                <div class="autocomplete-item-info">
                    <strong><i class="fa-solid fa-user-check" style="color: #10b981; margin-left: 6px;"></i>${highlightMatch(m.name, query)}</strong>
                    <span><i class="fa-solid fa-layer-group"></i> ${m.category ? `<b style="color: #6366f1;">${m.category}</b> (${m.grade || ''})` : 'غير محدد'} • أ/ ${m.teacher || 'مدرسين متعددين'}</span>
                </div>
                <i class="fa-solid fa-arrow-turn-down-left" style="color: #6366f1; font-size: 11px;"></i>
            </div>
        `).join('');

        dropdown.style.display = "block";

        dropdown.querySelectorAll(".autocomplete-item").forEach(item => {
            item.addEventListener("click", function() {
                const selected = topMatches[parseInt(this.getAttribute("data-idx"))];
                if (!selected) return;

                input.value = selected.name;
                dropdown.style.display = "none";
                selectStudent(selected.name, selected.category, selected.grade);
            });
        });
    });

    // البحث عند الضغط على Enter
    input.addEventListener("keydown", function(e) {
        if (e.key === "Enter") {
            e.preventDefault();
            dropdown.style.display = "none";
            selectStudent(this.value.trim());
        }
    });

    document.addEventListener("click", function(e) {
        if (!input.contains(e.target) && !dropdown.contains(e.target)) {
            dropdown.style.display = "none";
        }
    });
}

function clearInquirySearch() {
    const input = document.getElementById("inquiryStudentInput");
    const dropdown = document.getElementById("inquiryDropdown");
    const clearBtn = document.getElementById("clearInquiryBtn");
    if (input) input.value = "";
    if (dropdown) dropdown.style.display = "none";
    if (clearBtn) clearBtn.style.display = "none";

    document.getElementById("studentResultsContainer").style.display = "none";
    document.getElementById("initialEmptyState").style.display = "block";
}

/* ───────────────────────────────────────────────────
   عرض بيانات ومدفوعات الطالب
   ─────────────────────────────────────────────────── */
function selectStudent(studentName, targetCategory = null, targetGrade = null) {
    if (!studentName) return;

    const resultsContainer = document.getElementById("studentResultsContainer");
    const emptyState = document.getElementById("initialEmptyState");

    const normTargetName = normalizeArabicName(studentName);

    // إذا لم تُمرر الفئة والصف، نحاول اكتشافها من قائمة الطلاب
    if (!targetCategory) {
        const found = allStudents.find(s => normalizeArabicName(s.studentName) === normTargetName);
        if (found) {
            targetCategory = (found.category || '').trim();
            targetGrade = (found.grade || '').trim();
        }
    }

    // جلب كل المعاملات الخاصة بهذا الطالب المطابق للاسم والفئة (لمنع خلط طالب الابتدائي مع الثانوي)
    const studentTxs = allTransactions.filter(t => {
        const matchesName = normalizeArabicName(t.studentName) === normTargetName;
        if (!matchesName) return false;
        if (targetCategory && t.category) {
            return t.category.trim() === targetCategory;
        }
        return true;
    });

    // جلب معلومات الطالب من جدول الطلاب المسجلين
    const studentRegistrations = allStudents.filter(s => {
        const matchesName = normalizeArabicName(s.studentName) === normTargetName;
        if (!matchesName) return false;
        if (targetCategory && s.category) {
            return s.category.trim() === targetCategory;
        }
        return true;
    });

    // جلب سجلات غياب الطالب
    const studentAbsences = allAttendance.filter(a => {
        const matchesName = normalizeArabicName(a.studentName) === normTargetName && a.status === 'غائب';
        if (!matchesName) return false;
        if (targetCategory && a.category) {
            return a.category.trim() === targetCategory;
        }
        return true;
    });

    emptyState.style.display = "none";
    resultsContainer.style.display = "block";

    // تحديث بيانات بطاقة الطالب وعرض الاسم المركب موحداً
    document.getElementById("cardStudentName").textContent = displayNormalizedName(studentName);

    let subtextParts = [];
    if (targetCategory) {
        subtextParts.push(`${targetCategory}${targetGrade ? ' (' + targetGrade + ')' : ''}`);
    } else if (studentRegistrations.length > 0) {
        const cat = studentRegistrations[0].category;
        const gr = studentRegistrations[0].grade;
        if (cat || gr) subtextParts.push(`${cat || ''}${gr ? ' (' + gr + ')' : ''}`);
    }
    document.getElementById("cardStudentSubtext").textContent = subtextParts.join(" • ") || "طالب مسجل بالسنتر";

    // حساب الإحصائيات
    let totalPaid = 0;
    const teachersMap = new Map();

    studentTxs.forEach(t => {
        const amt = parseFloat(t.amount) || 0;
        totalPaid += amt;

        const tName = t.teacherName || "مدرس غير محدد";
        if (!teachersMap.has(tName)) {
            teachersMap.set(tName, {
                teacherName: tName,
                category: t.category,
                grade: t.grade,
                payments: [],
                absences: []
            });
        }
        teachersMap.get(tName).payments.push(t);
    });

    // إذا كان مسجلاً مع معلمين بدون معاملات بعد، نعرضهم أيضاً
    studentRegistrations.forEach(r => {
        if (r.teacherName && !teachersMap.has(r.teacherName)) {
            teachersMap.set(r.teacherName, {
                teacherName: r.teacherName,
                category: r.category,
                grade: r.grade,
                payments: [],
                absences: []
            });
        }
    });

    // توزيع سجلات الغياب على كل معلم
    studentAbsences.forEach(a => {
        const tName = a.teacherName || "مدرس غير محدد";
        if (!teachersMap.has(tName)) {
            teachersMap.set(tName, {
                teacherName: tName,
                category: a.category,
                grade: a.grade,
                payments: [],
                absences: []
            });
        }
        teachersMap.get(tName).absences.push(a);
    });

    document.getElementById("cardTotalPaid").textContent = `${totalPaid} ج.م`;
    document.getElementById("cardMonthsCount").textContent = studentTxs.length;
    document.getElementById("cardTeachersCount").textContent = teachersMap.size;
    document.getElementById("cardTotalAbsences").textContent = studentAbsences.length;

    // بناء شبكة المعلمين
    const grid = document.getElementById("teachersGrid");
    grid.innerHTML = "";

    if (teachersMap.size === 0) {
        grid.innerHTML = `
            <div class="empty-history" style="grid-column: 1 / -1;">
                <i class="fa-solid fa-file-invoice-dollar"></i>
                <h3>لا توجد سجلات مسجلة لهذا الطالب حتى الآن</h3>
            </div>
        `;
        return;
    }

    teachersMap.forEach((teacherData) => {
        const card = document.createElement("div");
        card.className = "teacher-pay-card";

        const absCount = teacherData.absences.length;
        const absBadge = absCount === 0
            ? `<span class="badge-absent-count zero"><i class="fa-solid fa-circle-check"></i> لا يوجد غياب</span>`
            : `<span class="badge-absent-count"><i class="fa-solid fa-triangle-exclamation"></i> غياب: ${absCount} ${absCount === 1 ? 'مرة' : 'مرات'}</span>`;

        let paymentsHtml = "";
        if (teacherData.payments.length === 0) {
            paymentsHtml = `
                <div style="text-align: center; padding: 12px; color: var(--text-muted); font-size: 13px;">
                    <i class="fa-solid fa-clock-rotate-left" style="margin-left: 6px;"></i>
                    مسجل مع هذا المعلم ولكن لم يتم تسجيل أي مدفوعات بعد
                </div>
            `;
        } else {
            // ترتيب الدفعات حسب التاريخ
            paymentsHtml = teacherData.payments.map(p => {
                const dateText = formatPaymentDate(p.date);
                const monthName = extractMonthName(p.date);
                const hasReceipt = p.fileLink && p.fileLink !== "لا يوجد إيصال" && p.fileLink.startsWith("http");

                return `
                    <div class="month-item">
                        <div class="month-info">
                            <i class="fa-solid fa-calendar-check"></i>
                            <span>${monthName} (${dateText})</span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <span class="month-amount">${p.amount} ج.م</span>
                            ${hasReceipt ? `<a href="${p.fileLink}" target="_blank" class="receipt-link-btn" title="عرض الإيصال"><i class="fa-solid fa-receipt"></i> الإيصال</a>` : ''}
                        </div>
                    </div>
                `;
            }).join('');
        }

        card.innerHTML = `
            <div class="teacher-pay-header">
                <div class="teacher-name-box">
                    <div class="teacher-icon">
                        <i class="fa-solid fa-chalkboard-user"></i>
                    </div>
                    <div>
                        <h3>أ/ ${teacherData.teacherName}</h3>
                        <span>${teacherData.category || ''} ${teacherData.grade ? `(${teacherData.grade})` : ''}</span>
                    </div>
                </div>
                <div class="teacher-badges-group">
                    <span class="badge-present" style="font-size: 11.5px;">${teacherData.payments.length} شهر مسدد</span>
                    ${absBadge}
                </div>
            </div>
            <div class="months-timeline">
                ${paymentsHtml}
            </div>
        `;

        grid.appendChild(card);
    });
}

function extractMonthName(dateStr) {
    if (!dateStr) return "شهر غير محدد";
    try {
        const d = new Date(dateStr);
        if (!isNaN(d.getTime())) {
            const months = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
            return `شهر ${months[d.getMonth()]}`;
        }
    } catch (_) {}
    return "سداد قسط";
}

function formatPaymentDate(dateStr) {
    if (!dateStr) return "";
    try {
        const d = new Date(dateStr);
        if (!isNaN(d.getTime())) {
            return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
        }
    } catch (_) {}
    return dateStr.split("T")[0] || dateStr;
}

function highlightMatch(text, query) {
    if (!query) return text;
    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return text.replace(regex, '<span style="color: #6366f1; text-decoration: underline; font-weight: 800;">$1</span>');
}

