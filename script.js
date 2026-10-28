const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxazZen_peC1JAwtTJ-eScQmuCWpsPYvqeubzj0ZL1NdBVOxV4hJjixFYQ_LkU_rSvs/exec";
const STUDENTS_DB_URL = "https://script.google.com/macros/s/AKfycbx35GjixD83S6R69c2mnA9KvgG93I0PX-yrIDdokwLRzaTTkd9fRR3fwuyHRWLUJDK5/exec";
const gradesData = {
    "ابتدائي":        ["تأسيس", "الثالث", "الرابع", "الخامس", "السادس"],
    "ابتدائي لغات":   ["تأسيس", "الثالث", "الرابع", "الخامس", "السادس"],
    "اعدادي":         ["الأول", "الثاني", "الثالث"],
    "اعدادي لغات":    ["الأول", "الثاني", "الثالث"],
    "ثانوي":          ["الأول", "الثاني", "الثالث"],
    "ثانوي لغات":     ["الأول", "الثاني", "الثالث"]
};

/* ===================================================
   تحويل الأرقام العربية/الشرقية إلى أرقام إنجليزية
   يدعم: ٠١٢٣٤٥٦٧٨٩ (عربي) + ۰۱۲۳۴۵۶۷۸۹ (فارسي)
   =================================================== */
function toEnglishNumerals(str) {
    if (!str) return '';
    return str
        .replace(/[٠-٩]/g, d => d.charCodeAt(0) - 1632) // عربي شرقي
        .replace(/[۰-۹]/g, d => d.charCodeAt(0) - 1776) // فارسي
        .replace(/[^\d.]/g, '');                          // احذف أي حرف غير رقمي
}

/**
   توحيد الأسماء المركبة (عبد الله -> عبدالله)
*/
function normalizeArabicName(name) {
    if (!name) return "";
    let str = name.toString().trim().replace(/[\u064B-\u065F\u0640]/g, '');
    str = str.replace(/\bعبد\s+([\u0621-\u064A])/g, 'عبد$1');
    str = str.replace(/\b(أبو|ابو|أبي|ابي|أبا|ابا)\s+([\u0621-\u064A])/g, '$1$2');
    str = str.replace(/[إأآٱ]/g, 'ا').replace(/ة\b/g, 'ه').replace(/[ىي]/g, 'ي');
    return str.replace(/\s+/g, ' ').trim();
}

function displayNormalizedName(name) {
    if (!name) return "";
    let str = name.toString().trim().replace(/\s+/g, ' ');
    str = str.replace(/\bعبد\s+([\u0621-\u064A])/g, 'عبد$1');
    str = str.replace(/\b(أبو|ابو|أبي|ابي|أبا|ابا)\s+([\u0621-\u064A])/g, '$1$2');
    return str;
}

/**
 * بيتحول المبلغ مباشرةً وهو بيكتب
 * @param {HTMLInputElement} input
 */
function convertAmountToEnglish(input) {
    var pos = input.selectionStart;
    var converted = toEnglishNumerals(input.value);
    input.value = converted;
    // المحافظة على موضع cursor بعد التحويل
    try { input.setSelectionRange(pos, pos); } catch(_) {}
}

/* ===================================================
   طابور الطلبات – يضمن إرسال بيانات التحصيل بالترتيب
   عند التزامن بين أكثر من مستخدم في نفس الوقت
   =================================================== */
const _txQueue = { pending: [], running: false };

function enqueueTransaction(fn) {
    return new Promise((resolve, reject) => {
        _txQueue.pending.push({ fn, resolve, reject });
        if (!_txQueue.running) _drainTxQueue();
    });
}

async function _drainTxQueue() {
    if (_txQueue.running || _txQueue.pending.length === 0) return;
    _txQueue.running = true;
    const { fn, resolve, reject } = _txQueue.pending.shift();
    try {
        resolve(await fn());
    } catch (err) {
        reject(err);
    } finally {
        _txQueue.running = false;
        _drainTxQueue();
    }
}

/**
 * يرسل طلب fetch مع إعادة المحاولة تلقائياً عند الفشل
 * المحاولات: 3  –  الانتظار بين المحاولات: 1 ث / 2 ث / 4 ث
 */
async function fetchWithRetry(url, options, maxRetries = 3) {
    let lastError;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const response = await fetch(url, options);
            // Apps Script قد يُعيد 429 أو 503 عند الضغط الزائد
            if (response.status === 429 || response.status === 503) {
                throw new Error(`HTTP ${response.status}`);
            }
            return response;
        } catch (err) {
            lastError = err;
            if (attempt < maxRetries) {
                const delay = Math.pow(2, attempt - 1) * 1000; // 1s, 2s, 4s
                await new Promise(r => setTimeout(r, delay));
            }
        }
    }
    throw lastError;
}

/* ===================================================
   إدارة الوضع الليلي / النهاري (Dark / Light Mode)
   =================================================== */
function initTheme() {
    const savedTheme = localStorage.getItem('theme');
    const systemPrefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const theme = savedTheme || (systemPrefersDark ? 'dark' : 'light');
    applyTheme(theme);
}

function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
    
    document.querySelectorAll('.theme-toggle-btn').forEach(btn => {
        const icon = btn.querySelector('i');
        const text = btn.querySelector('span');
        if (icon && text) {
            if (theme === 'dark') {
                icon.className = 'fa-solid fa-sun';
                icon.style.color = '#f59e0b';
                text.textContent = 'الوضع النهاري';
            } else {
                icon.className = 'fa-solid fa-moon';
                icon.style.color = '';
                text.textContent = 'الوضع الليلي';
            }
        }
    });
}

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    applyTheme(newTheme);
}

// تفعيل الثيم تلقائياً
initTheme();

/* ===================================================
   نظام الإشعارات الحديث (Toast Notifications)
   =================================================== */
function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) {
        alert(message);
        return;
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    let iconClass = 'fa-circle-info';
    if (type === 'success') iconClass = 'fa-circle-check';
    if (type === 'danger') iconClass = 'fa-circle-xmark';
    if (type === 'warning') iconClass = 'fa-triangle-exclamation';

    toast.innerHTML = `
        <i class="fa-solid ${iconClass}"></i>
        <span>${message}</span>
    `;

    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('fade-out');
        setTimeout(() => toast.remove(), 300);
    }, 3800);
}

/* ===================================================
   إدارة شاشات الدخول والصلاحيات (طالب / إدارة)
   =================================================== */
function checkCurrentSession() {
    const role = sessionStorage.getItem('userRole');
    if (role === 'admin' || role === 'student') {
        enterDashboard(role);
    } else {
        showWelcomeScreen();
    }
}

function showWelcomeScreen() {
    const welcome = document.getElementById('welcomeScreen');
    const mainApp = document.getElementById('mainAppScreen');
    const modal = document.getElementById('adminLoginModal');
    
    if (welcome) welcome.style.display = 'block';
    if (mainApp) mainApp.style.display = 'none';
    if (modal) modal.style.display = 'none';
}

function loginAsStudent() {
    sessionStorage.setItem('userRole', 'student');
    enterDashboard('student');
    showToast("مرحباً بك! تم الدخول كطالب لدفع المصروفات.", "info");
}

function openAdminLoginModal() {
    const modal = document.getElementById('adminLoginModal');
    if (modal) {
        modal.style.display = 'flex';
        const userInput = document.getElementById('adminUsername');
        if (userInput) userInput.focus();
    }
}

function closeAdminLoginModal() {
    const modal = document.getElementById('adminLoginModal');
    if (modal) modal.style.display = 'none';
    const pwdInput = document.getElementById('adminPassword');
    if (pwdInput) pwdInput.value = '';
}

/* ===================================================
   إدارة نوافذ الدفع الإلكتروني (انستا باي وفودافون كاش)
   =================================================== */
function openInstapayModal() {
    const modal = document.getElementById('instapayModal');
    if (modal) modal.style.display = 'flex';
}

function closeInstapayModal() {
    const modal = document.getElementById('instapayModal');
    if (modal) modal.style.display = 'none';
}

function openVodafoneModal() {
    const modal = document.getElementById('vodafoneModal');
    if (modal) modal.style.display = 'flex';
}

function closeVodafoneModal() {
    const modal = document.getElementById('vodafoneModal');
    if (modal) modal.style.display = 'none';
}

function copyVodafoneNumber() {
    const num = "01010692410";
    navigator.clipboard.writeText(num).then(() => {
        const copyIcon = document.getElementById('copyIcon');
        const copyText = document.getElementById('copyText');
        if (copyIcon && copyText) {
            copyIcon.className = 'fa-solid fa-check';
            copyText.textContent = 'تم النسخ';
            setTimeout(() => {
                copyIcon.className = 'fa-solid fa-copy';
                copyText.textContent = 'نسخ';
            }, 2500);
        }
        showToast("تم نسخ رقم فودافون كاش بنجاح!", "success");
    }).catch(() => {
        showToast("رقم التحويل: 01010692410", "info");
    });
}

function confirmPaymentAndClose() {
    closeVodafoneModal();
    showToast("تم تأكيد الدفع! يرجى رفع صورة إيصال التحويل لحفظ المعاملة.", "info");
    const receiptInput = document.getElementById('receiptFile');
    if (receiptInput) {
        receiptInput.focus();
        receiptInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

function handleModalOverlayClick(e, modalId) {
    if (e.target && e.target.id === modalId) {
        document.getElementById(modalId).style.display = 'none';
    }
}

function togglePasswordVisibility() {
    const pwdInput = document.getElementById('adminPassword');
    const icon = document.getElementById('pwdToggleIcon');
    if (pwdInput && icon) {
        if (pwdInput.type === 'password') {
            pwdInput.type = 'text';
            icon.className = 'fa-solid fa-eye-slash';
        } else {
            pwdInput.type = 'password';
            icon.className = 'fa-solid fa-eye';
        }
    }
}

function handleAdminLogin(event) {
    if (event) event.preventDefault();
    
    const userInput = document.getElementById('adminUsername');
    const pwdInput = document.getElementById('adminPassword');
    const username = userInput ? userInput.value.trim() : '';
    const password = pwdInput ? pwdInput.value.trim() : '';

    // التحقق من بيانات الدخول الثابتة
    if (username.toLowerCase() === 'admin' && password === 'Admin@1122') {
        closeAdminLoginModal();
        sessionStorage.setItem('userRole', 'admin');
        enterDashboard('admin');
        showToast("تم تسجيل الدخول بنجاح! مرحباً بالإدارة.", "success");
    } else {
        const modalCard = document.getElementById('adminModalCard');
        if (modalCard) {
            modalCard.classList.remove('shake');
            void modalCard.offsetWidth; // إعادة تشغيل الأنيميشن
            modalCard.classList.add('shake');
        }
        showToast("خطأ: اسم المستخدم أو كلمة المرور غير صحيحة!", "danger");
        if (pwdInput) {
            pwdInput.value = '';
            pwdInput.focus();
        }
    }
}

function enterDashboard(role) {
    const welcome = document.getElementById('welcomeScreen');
    const mainApp = document.getElementById('mainAppScreen');
    const roleBadge = document.getElementById('userRoleBadge');

    if (welcome) welcome.style.display = 'none';
    if (mainApp) mainApp.style.display = 'block';

    const adminSections = document.querySelectorAll('.admin-only');

    if (role === 'student') {
        adminSections.forEach(sec => sec.style.display = 'none');

        if (roleBadge) {
            roleBadge.innerHTML = '<span class="user-role-badge badge-student"><i class="fa-solid fa-user-graduate"></i> وضع الطالب</span>';
        }
    } else if (role === 'admin') {
        adminSections.forEach(sec => {
            if (sec.classList.contains('flex-row')) {
                sec.style.display = 'flex';
            } else {
                sec.style.display = 'block';
            }
        });

        if (roleBadge) {
            roleBadge.innerHTML = '<span class="user-role-badge badge-admin"><i class="fa-solid fa-user-shield"></i> لوحة الإدارة</span>';
        }
    }

    // تحميل المعلمين والطلاب من الشيت وتعيين الوقت الحالي
    loadTeachers();
    loadStudentsDatabase();
    initStudentAutocomplete();
    setDefaultDateTime();
}

function logout() {
    sessionStorage.removeItem('userRole');
    showWelcomeScreen();
    showToast("تم تسجيل الخروج بنجاح والعودة للرئيسية.", "info");
}

/* ===================================================
   دوال الواجهة ومعالجة البيانات
   =================================================== */
function showLoading(show) {
    const overlay = document.getElementById("loadingOverlay");
    if (overlay) {
        overlay.style.display = show ? "flex" : "none";
    }
}

// ضبط الوقت والتاريخ الحاليين تلقائياً عند فتح الصفحة
function setDefaultDateTime() {
    const dateInput = document.getElementById("dateTime");
    if (dateInput && !dateInput.value) {
        const now = new Date();
        now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
        dateInput.value = now.toISOString().slice(0, 16);
    }
}

function updateGrades(catId, gradeId) {
    const cat = document.getElementById(catId).value;
    const select = document.getElementById(gradeId);
    select.innerHTML = '<option value="">-- اختر الصف أولاً --</option>';
    if (cat && gradesData[cat]) {
        gradesData[cat].forEach(g => {
            select.appendChild(new Option(g, g));
        });
    }
}

let allTeachersList = [];
let allStudentsList = [];

async function loadTeachers() {
    showLoading(true);
    try {
        const res = await fetch(SCRIPT_URL);
        const teachers = await res.json();
        allTeachersList = Array.isArray(teachers) ? teachers : [];
        
        const selects = [
            document.getElementById("teacherSelect"),
            document.getElementById("clearTeacherSelect"),
            document.getElementById("deleteTeacherSelect")
        ];
        selects.forEach(s => {
            if (s) s.innerHTML = '<option value="">-- اختر المعلم --</option>';
        });
        
        allTeachersList.forEach(t => {
            selects.forEach(s => {
                if (s) s.add(new Option(t, t));
            });
        });
    } catch (e) {
        showToast("حدث خطأ في تحميل قائمة المعلمين من الخادم.", "danger");
    }
    showLoading(false);
}

/* ===================================================
   تحميل قاعدة بيانات الطلاب للإكمال التلقائي
   =================================================== */
async function loadStudentsDatabase() {
    // محاولة جلبها من التخزين المؤقت المحلي أولاً لسرعة الاستجابة
    const cached = localStorage.getItem('center_students_db_cache');
    if (cached) {
        try {
            allStudentsList = JSON.parse(cached);
        } catch(_) {}
    }

    try {
        const res = await fetch(STUDENTS_DB_URL);
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
            allStudentsList = data.map((item, idx) => ({
                id: item.id || idx,
                studentName: (item.studentName || item.name || '').trim(),
                teacherName: (item.teacherName || item.teacher || '').trim(),
                category: (item.category || '').trim(),
                grade: (item.grade || '').trim()
            })).filter(s => s.studentName);

            localStorage.setItem('center_students_db_cache', JSON.stringify(allStudentsList));
        }
    } catch (e) {
        console.warn("Could not fetch remote students database, using cached/local if available", e);
    }
}

/* ===================================================
   تفعيل نظام الإكمال التلقائي الذكي لاسم الطالب
   =================================================== */
function initStudentAutocomplete() {
    const input = document.getElementById("studentName");
    const dropdown = document.getElementById("studentNameDropdown");
    if (!input || !dropdown) return;

    input.addEventListener("input", function() {
        const query = this.value.trim().toLowerCase();
        if (!query) {
            dropdown.style.display = "none";
            dropdown.innerHTML = "";
            return;
        }

        // تصفية الطلاب المطابقين لكلمة البحث بذكاء مع دعم الأسماء المركبة
        const normQuery = normalizeArabicName(query);
        const matches = allStudentsList.filter(s => 
            normalizeArabicName(s.studentName).includes(normQuery)
        );

        if (matches.length === 0) {
            dropdown.style.display = "none";
            dropdown.innerHTML = "";
            return;
        }

        // عرض أول 8 اقتراحات كحد أقصى لمنع ازدحام القائمة
        const topMatches = matches.slice(0, 8);
        dropdown.innerHTML = topMatches.map((s, idx) => `
            <div class="autocomplete-item" data-idx="${idx}">
                <div class="autocomplete-item-info">
                    <strong><i class="fa-solid fa-user-check" style="color: #10b981; margin-left: 6px;"></i>${highlightMatch(displayNormalizedName(s.studentName), query)}</strong>
                    <span><i class="fa-solid fa-chalkboard-user"></i> أ/ ${s.teacherName || 'غير محدد'} • <b style="color: #6366f1;">${s.category || ''}</b> (${s.grade || ''})</span>
                </div>
                <i class="fa-solid fa-arrow-turn-down-left" style="color: #6366f1; font-size: 11px;"></i>
            </div>
        `).join('');

        dropdown.style.display = "block";

        // إضافة أحداث النقر لاختيار الطالب
        dropdown.querySelectorAll(".autocomplete-item").forEach(item => {
            item.addEventListener("click", function() {
                const selected = topMatches[parseInt(this.getAttribute("data-idx"))];
                if (!selected) return;

                input.value = displayNormalizedName(selected.studentName);
                dropdown.style.display = "none";

                // تعبئة المدرس والفئة والصف تلقائياً لتسهيل التجربة
                if (selected.teacherName) {
                    const teacherSel = document.getElementById("teacherSelect");
                    if (teacherSel) {
                        // التأكد من وجود المدرس في القائمة أو إضافته
                        let found = Array.from(teacherSel.options).some(o => o.value === selected.teacherName);
                        if (!found) {
                            teacherSel.add(new Option(selected.teacherName, selected.teacherName));
                        }
                        teacherSel.value = selected.teacherName;
                    }
                }

                if (selected.category) {
                    const catSel = document.getElementById("categorySelect");
                    if (catSel) {
                        catSel.value = selected.category;
                        updateGrades('categorySelect', 'gradeSelect');
                    }
                }

                if (selected.grade) {
                    const gradeSel = document.getElementById("gradeSelect");
                    if (gradeSel) {
                        gradeSel.value = selected.grade;
                    }
                }

                // التركيز على خانة المبلغ
                const amountInput = document.getElementById("amount");
                if (amountInput) amountInput.focus();
            });
        });
    });

    // إغلاق القائمة عند النقر خارجها
    document.addEventListener("click", function(e) {
        if (!input.contains(e.target) && !dropdown.contains(e.target)) {
            dropdown.style.display = "none";
        }
    });
}

function highlightMatch(text, query) {
    if (!query) return text;
    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return text.replace(regex, '<span style="color: #6366f1; text-decoration: underline; font-weight: 800;">$1</span>');
}

async function addTeacher() {
    const input = document.getElementById("newTeacherName");
    const name = input ? input.value.trim() : "";
    if (!name) {
        showToast("يرجى كتابة اسم المعلم أولاً!", "warning");
        if (input) input.focus();
        return;
    }
    showLoading(true);
    try {
        await fetch(SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({ action: "addTeacher", teacherName: name })
        });
        showToast(`تمت إضافة الأستاذ/ ${name} بنجاح!`, "success");
        if (input) input.value = "";
        await loadTeachers();
    } catch (e) {
        showToast("حدث خطأ أثناء إضافة المعلم.", "danger");
    }
    showLoading(false);
}

// دالة حذف المعلم
async function deleteTeacher() {
    const select = document.getElementById("deleteTeacherSelect");
    const name = select ? select.value : "";
    if (!name) {
        showToast("يرجى اختيار المعلم المراد حذفه!", "warning");
        return;
    }

    if (confirm(`⚠️ تحذير خطير!\nهل أنت متأكد من حذف الأستاذ/ ${name} نهائياً؟\nسيتم مسح اسمه، وكل معاملاته، والصفحة الخاصة به من جوجل شيت.`)) {
        showLoading(true);
        try {
            await fetch(SCRIPT_URL, {
                method: 'POST',
                body: JSON.stringify({ action: "deleteTeacher", teacherName: name })
            });
            showToast(`تم حذف المعلم ${name} وجميع بياناته بنجاح!`, "success");
            await loadTeachers();
        } catch (e) {
            showToast("حدث خطأ أثناء محاولة الحذف.", "danger");
        }
        showLoading(false);
    }
}

async function addTransaction() {
    let sName = document.getElementById("studentName").value.trim();
    // توحيد الأسماء المركبة مثل عبد الله -> عبدالله
    sName = displayNormalizedName(sName);
    const tName = document.getElementById("teacherSelect").value;
    const cat = document.getElementById("categorySelect").value;
    const grade = document.getElementById("gradeSelect").value;
    const amount = document.getElementById("amount").value;
    const date = document.getElementById("dateTime").value;
    const file = document.getElementById("receiptFile").files[0];

    if (!sName || !tName || !cat || !grade || !amount || !date) {
        showToast("يرجى إكمال جميع البيانات المطلوبة للتحصيل!", "warning");
        return;
    }

    showLoading(true);

    const sendData = async (b64, type, fname) => {
        try {
            // الإرسال عبر الطابور لضمان الترتيب عند التزامن
            await enqueueTransaction(() =>
                fetchWithRetry(SCRIPT_URL, {
                    method: 'POST',
                    body: JSON.stringify({
                        action: "addTransaction",
                        studentName: sName,
                        teacherName: tName,
                        category: cat,
                        grade: grade,
                        amount: amount,
                        date: date,
                        fileBase64: b64,
                        mimeType: type,
                        fileName: fname
                    })
                })
            );
            showToast("تم حفظ بيانات التحصيل بنجاح في الشيت!", "success");
            ["studentName", "amount", "receiptFile", "categorySelect", "teacherSelect"].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.value = "";
            });
            setDefaultDateTime();
            updateGrades('categorySelect', 'gradeSelect');
        } catch (e) {
            showToast("حدث خطأ أثناء حفظ التحصيل، يرجى المحاولة مرة أخرى.", "danger");
        }
        showLoading(false);
    };

    if (file) {
        const r = new FileReader();
        r.onload = e => sendData(e.target.result.split(",")[1], file.type, file.name);
        r.readAsDataURL(file);
    } else {
        sendData("", "", "");
    }
}

async function clearTeacherDues() {
    const tName = document.getElementById("clearTeacherSelect").value;
    const cat = document.getElementById("clearCategorySelect").value;
    const grade = document.getElementById("clearGradeSelect").value;

    if (!tName || !cat || !grade) {
        showToast("يرجى تحديد المعلم والفئة والصف الدراسي أولاً!", "warning");
        return;
    }

    if (confirm(`تصفير حساب أستاذ/ ${tName} لفرقة ${cat} (الصف ${grade})؟`)) {
        showLoading(true);
        try {
            await fetch(SCRIPT_URL, {
                method: 'POST',
                body: JSON.stringify({
                    action: "clearDues",
                    teacherName: tName,
                    category: cat,
                    grade: grade
                })
            });
            showToast(`تم تصفير حساب أستاذ/ ${tName} للفرقة المحددة!`, "success");
            ["clearTeacherSelect", "clearCategorySelect"].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.value = "";
            });
            updateGrades('clearCategorySelect', 'clearGradeSelect');
        } catch (e) {
            showToast("حدث خطأ أثناء تصفية الحساب.", "danger");
        }
        showLoading(false);
    }
}

// تشغيل عند تحميل الصفحة
window.onload = function() {
    checkCurrentSession();
    // تحديث أيقونة ونص الثيم
    const savedTheme = localStorage.getItem('theme') || (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    applyTheme(savedTheme);
};
