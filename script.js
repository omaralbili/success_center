const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxazZen_peC1JAwtTJ-eScQmuCWpsPYvqeubzj0ZL1NdBVOxV4hJjixFYQ_LkU_rSvs/exec";
const STUDENTS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbx35GjixD83S6R69c2mnA9KvgG93I0PX-yrIDdokwLRzaTTkd9fRR3fwuyHRWLUJDK5/exec";

// قوائم البيانات المحملة للإكمال التلقائي
let cachedStudents = [];
let cachedTeachers = [];

const gradesData = {
    "ابتدائي": ["تأسيس", "الثالث", "الرابع", "الخامس", "السادس"],
    "اعدادي": ["الأول", "الثاني", "الثالث"],
    "ثانوي": ["الأول", "الثاني", "الثالث"],
    "ابتدائي لغات": ["تأسيس", "الثالث", "الرابع", "الخامس", "السادس"],
    "اعدادي لغات": ["الأول", "الثاني", "الثالث"],
    "ثانوي لغات": ["الأول", "الثاني", "الثالث"]
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
    loadStudentsData();
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

async function loadTeachers() {
    showLoading(true);
    try {
        const res = await fetch(SCRIPT_URL);
        const teachers = await res.json();
        cachedTeachers = Array.isArray(teachers) ? teachers : [];
        
        const deleteSelect = document.getElementById("deleteTeacherSelect");
        if (deleteSelect) {
            deleteSelect.innerHTML = '<option value="">-- اختر المعلم المراد حذفه --</option>';
            cachedTeachers.forEach(t => {
                deleteSelect.add(new Option(t, t));
            });
        }
    } catch (e) {
        showToast("حدث خطأ في تحميل قائمة المعلمين من الخادم.", "danger");
    }
    showLoading(false);
}

// تحميل قاعدة بيانات الطلاب
async function loadStudentsData() {
    try {
        const saved = localStorage.getItem('center_students_records');
        if (saved) {
            cachedStudents = JSON.parse(saved);
        }
    } catch (_) {}

    try {
        const res = await fetch(STUDENTS_SCRIPT_URL);
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
            cachedStudents = data.map((item, index) => ({
                id: item.id || (Date.now() + index),
                studentName: (item.studentName || item.name || "").toString().trim(),
                teacherName: (item.teacherName || item.teacher || "").toString().trim(),
                category: (item.category || "").toString().trim(),
                grade: (item.grade || "").toString().trim(),
                date: item.date || ""
            }));
            try {
                localStorage.setItem('center_students_records', JSON.stringify(cachedStudents));
            } catch (_) {}
        }
    } catch (e) {
        console.warn("استخدام قاعدة الطلاب المحلية المخزنة مسبقاً:", e);
    }
}

/* ===================================================
   نظام الإكمال التلقائي الذكي للطلاب والمعلمين
   =================================================== */

// تطبيع النصوص للبحث الذكي (توحيد الألفات والياء والتاء المربوطة)
function normalizeArabic(text) {
    if (!text) return '';
    return text.toString().toLowerCase().trim()
        .replace(/[أإآ]/g, 'ا')
        .replace(/ى/g, 'ي')
        .replace(/ة/g, 'ه')
        .replace(/[\u064B-\u065F]/g, ''); // إزالة التشكيل
}

// تهيئة الإكمال التلقائي لاسم الطالب
function setupStudentAutocomplete() {
    const input = document.getElementById("studentName");
    const dropdown = document.getElementById("studentNameDropdown");
    if (!input || !dropdown) return;

    input.addEventListener("input", function() {
        const val = this.value;
        const normVal = normalizeArabic(val);

        if (!normVal) {
            dropdown.style.display = "none";
            dropdown.innerHTML = "";
            return;
        }

        // تصفية واقتراح الطلاب
        // الأولوية للأسماء التي تبدأ بالمكتوب، ثم التي تحتوي عليه
        const matches = [];
        const seen = new Set();

        cachedStudents.forEach(s => {
            if (!s.studentName) return;
            const normName = normalizeArabic(s.studentName);
            const key = `${s.studentName}_${s.teacherName}_${s.category}_${s.grade}`;

            if (!seen.has(key) && normName.includes(normVal)) {
                seen.add(key);
                const startsWith = normName.startsWith(normVal);
                matches.push({ student: s, startsWith });
            }
        });

        // ترتيب: ما يبدأ بالمكتوب يظهر أولاً
        matches.sort((a, b) => (b.startsWith ? 1 : 0) - (a.startsWith ? 1 : 0));

        if (matches.length === 0) {
            dropdown.innerHTML = `
                <div style="padding: 10px 12px; text-align: center; color: var(--text-muted); font-size: 13px;">
                    <i class="fa-solid fa-circle-info" style="margin-left: 6px;"></i>
                    طالب جديد (غير مسجل مسبقاً)
                </div>
            `;
            dropdown.style.display = "block";
            return;
        }

        dropdown.innerHTML = matches.slice(0, 8).map(m => {
            const s = m.student;
            const metaInfo = [
                s.teacherName ? `أ/ ${s.teacherName}` : '',
                s.category || '',
                s.grade ? `(${s.grade})` : ''
            ].filter(Boolean).join(' • ');

            return `
                <div class="autocomplete-item" data-name="${escapeHtml(s.studentName)}" data-teacher="${escapeHtml(s.teacherName || '')}" data-category="${escapeHtml(s.category || '')}" data-grade="${escapeHtml(s.grade || '')}">
                    <div class="item-title">
                        <i class="fa-solid fa-user-graduate" style="color: #6366f1; font-size: 13px;"></i>
                        <span>${escapeHtml(s.studentName)}</span>
                    </div>
                    ${metaInfo ? `<div class="item-meta">${escapeHtml(metaInfo)}</div>` : ''}
                </div>
            `;
        }).join('');

        dropdown.style.display = "block";

        // أحداث الضغط على كل عنصر
        dropdown.querySelectorAll(".autocomplete-item").forEach(item => {
            item.addEventListener("click", function() {
                const name = this.getAttribute("data-name");
                const teacher = this.getAttribute("data-teacher");
                const category = this.getAttribute("data-category");
                const grade = this.getAttribute("data-grade");

                input.value = name;
                dropdown.style.display = "none";

                // تعبئة المعلم تلقائياً إن وجد
                if (teacher) {
                    const teacherInput = document.getElementById("teacherInput");
                    const teacherSelect = document.getElementById("teacherSelect");
                    if (teacherInput) teacherInput.value = teacher;
                    if (teacherSelect) teacherSelect.value = teacher;
                }

                // تعبئة الفئة والصف تلقائياً إن وجدا
                if (category) {
                    const catSelect = document.getElementById("categorySelect");
                    if (catSelect) {
                        catSelect.value = category;
                        updateGrades('categorySelect', 'gradeSelect');
                        if (grade) {
                            const grSelect = document.getElementById("gradeSelect");
                            if (grSelect) grSelect.value = grade;
                        }
                    }
                }
            });
        });
    });

    // إظهار الاقتراحات عند التركيز لو الحقل به نص
    input.addEventListener("focus", function() {
        if (this.value.trim()) {
            input.dispatchEvent(new Event("input"));
        }
    });
}

// تهيئة الإكمال التلقائي لاسم المعلم
function setupTeacherAutocomplete(inputId, hiddenId, dropdownId) {
    const input = document.getElementById(inputId);
    const hidden = document.getElementById(hiddenId);
    const dropdown = document.getElementById(dropdownId);
    if (!input || !dropdown) return;

    function renderTeachers(query) {
        const normVal = normalizeArabic(query);
        const filtered = cachedTeachers.filter(t => {
            if (!normVal) return true;
            return normalizeArabic(t).includes(normVal);
        });

        if (filtered.length === 0) {
            dropdown.innerHTML = `
                <div style="padding: 10px 12px; text-align: center; color: var(--text-muted); font-size: 13px;">
                    <i class="fa-solid fa-circle-question" style="margin-left: 6px;"></i>
                    لا يوجد معلم بهذا الاسم
                </div>
            `;
            dropdown.style.display = "block";
            return;
        }

        dropdown.innerHTML = filtered.map(t => `
            <div class="autocomplete-item" data-teacher="${escapeHtml(t)}">
                <div class="item-title">
                    <i class="fa-solid fa-chalkboard-user" style="color: #10b981; font-size: 13px;"></i>
                    <span>أ/ ${escapeHtml(t)}</span>
                </div>
            </div>
        `).join('');

        dropdown.style.display = "block";

        dropdown.querySelectorAll(".autocomplete-item").forEach(item => {
            item.addEventListener("click", function() {
                const teacherName = this.getAttribute("data-teacher");
                input.value = teacherName;
                if (hidden) hidden.value = teacherName;
                dropdown.style.display = "none";
            });
        });
    }

    input.addEventListener("input", function() {
        if (hidden) hidden.value = this.value.trim();
        renderTeachers(this.value);
    });

    input.addEventListener("focus", function() {
        renderTeachers(this.value);
    });
}

// دالة حماية النصوص لمنع XSS في الاقتراحات
function escapeHtml(str) {
    if (!str) return '';
    return str.toString()
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// إغلاق أي قائمة منسدلة عند النقر خارجها
document.addEventListener("click", function(e) {
    const wrappers = document.querySelectorAll(".autocomplete-wrapper");
    wrappers.forEach(w => {
        if (!w.contains(e.target)) {
            const dropdown = w.querySelector(".autocomplete-dropdown");
            if (dropdown) dropdown.style.display = "none";
        }
    });
});

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
    const sName = document.getElementById("studentName").value.trim();
    const tName = (document.getElementById("teacherSelect").value || document.getElementById("teacherInput")?.value || "").trim();
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
            ["studentName", "amount", "receiptFile", "categorySelect", "teacherSelect", "teacherInput"].forEach(id => {
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
    const tName = (document.getElementById("clearTeacherSelect").value || document.getElementById("clearTeacherInput")?.value || "").trim();
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
            ["clearTeacherSelect", "clearTeacherInput", "clearCategorySelect"].forEach(id => {
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
    // إعداد الإكمال التلقائي للطلاب والمعلمين
    setupStudentAutocomplete();
    setupTeacherAutocomplete("teacherInput", "teacherSelect", "teacherDropdown");
    setupTeacherAutocomplete("clearTeacherInput", "clearTeacherSelect", "clearTeacherDropdown");

    // تحديث أيقونة ونص الثيم
    const savedTheme = localStorage.getItem('theme') || (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    applyTheme(savedTheme);
};
