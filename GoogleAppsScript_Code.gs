/**
 * ==============================================================================
 * كود Google Apps Script الكامل لنظام السنتر (التحصيل الشهري)
 * ==============================================================================
 * الفئات الدراسية المدعومة:
 *   ابتدائي        → تأسيس، الثالث، الرابع، الخامس، السادس
 *   اعدادي         → الأول، الثاني، الثالث
 *   ثانوي          → الأول، الثاني، الثالث
 *   ابتدائي لغات   → تأسيس، الثالث، الرابع، الخامس، السادس
 *   اعدادي لغات    → الأول، الثاني، الثالث
 *   ثانوي لغات     → الأول، الثاني، الثالث
 * ==============================================================================
 * الإجراءات المدعومة (action):
 *   1. addTeacher      — إضافة معلم وإنشاء صفحته
 *   2. addTransaction  — إضافة تحصيل ورفع إيصال
 *   3. clearDues       — تصفية حساب معلم (تصفير مبالغ فرقة محددة)
 *   4. deleteTeacher   — حذف معلم نهائياً مع كل بياناته وصفحته
 * ==============================================================================
 */

// ✅ قائمة الفئات الدراسية المسموح بها (للتحقق على مستوى السيرفر)
var VALID_CATEGORIES = [
  "ابتدائي",
  "اعدادي",
  "ثانوي",
  "ابتدائي لغات",
  "اعدادي لغات",
  "ثانوي لغات"
];

// ✅ قائمة الصفوف المسموح بها
var VALID_GRADES = ["تأسيس", "الأول", "الثاني", "الثالث", "الرابع", "الخامس", "السادس"];

// =========================================================
// دالة doPost — معالجة جميع طلبات الكتابة (POST)
// =========================================================
function doPost(e) {

  // ✅ قفل على مستوى السكريبت — يمنع التداخل عند وصول أكثر من طلب في نفس الوقت
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000); // انتظار القفل حتى 15 ثانية
  } catch (lockErr) {
    return createResponse({ status: "error", message: "الخادم مشغول حالياً، يرجى إعادة المحاولة بعد لحظة." });
  }

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var data = JSON.parse(e.postData.contents);
    var action = data.action;

    // ===========================================================
    // 1. إضافة معلم وإنشاء صفحته الخاصة
    // ===========================================================
    if (action === "addTeacher") {
      var teacherName = (data.teacherName || "").toString().trim();
      if (!teacherName) {
        return createResponse({ status: "error", message: "اسم المعلم مطلوب." });
      }

      var teacherSheet = ss.getSheetByName("Teachers");
      if (!teacherSheet) {
        return createResponse({ status: "error", message: "صفحة Teachers غير موجودة في الشيت." });
      }
      teacherSheet.appendRow([teacherName]);

      // إنشاء صفحة خاصة بالمعلم إن لم تكن موجودة
      if (!ss.getSheetByName(teacherName)) {
        var newSheet = ss.insertSheet(teacherName);
        newSheet.setRightToLeft(true);
        newSheet.appendRow(["التاريخ", "اسم الطالب", "الفئة", "الصف", "المبلغ", "رابط الإيصال"]);
        formatHeaderRow(newSheet, 6);
      }
      return createResponse({ status: "success", message: "تم إضافة المعلم بنجاح." });
    }

    // ===========================================================
    // 2. إضافة تحصيل ورفع إيصال
    // ===========================================================
    if (action === "addTransaction") {
      var studentName = (data.studentName || "").toString().trim();
      var teacherName = (data.teacherName || "").toString().trim();
      var category    = (data.category || "").toString().trim();
      var grade       = (data.grade || "").toString().trim();
      var amount      = (data.amount || "").toString().trim();
      var date        = (data.date || new Date().toLocaleString('ar-EG')).toString().trim();

      // ✅ التحقق من الفئة على مستوى السيرفر
      if (category && VALID_CATEGORIES.indexOf(category) === -1) {
        return createResponse({ status: "error", message: "الفئة الدراسية غير صالحة: " + category });
      }

      // رفع الإيصال إلى Google Drive (اختياري)
      var fileUrl = "لا يوجد إيصال";
      if (data.fileBase64) {
        var folder = DriveApp.getFolderById("1plK4RY1foN1tBJ-nDw6YIiYW5J1Jduo8");
        var decodedData = Utilities.base64Decode(data.fileBase64);
        var blob = Utilities.newBlob(decodedData, data.mimeType, data.fileName);
        var file = folder.createFile(blob);
        fileUrl = file.getUrl();
      }

      // ✅ تسجيل في صفحة Transactions المجمعة
      var transSheet = ss.getSheetByName("Transactions");
      if (!transSheet) {
        return createResponse({ status: "error", message: "صفحة Transactions غير موجودة في الشيت." });
      }
      // appendRow آمن هنا لأن القفل ممسك — لا يمكن لأي طلب آخر الوصول في نفس اللحظة
      transSheet.appendRow([date, studentName, teacherName, category, grade, amount, fileUrl]);

      // ✅ تسجيل في صفحة المعلم الخاصة (ينشئها تلقائياً لو مش موجودة)
      var tSheet = ss.getSheetByName(teacherName);
      if (!tSheet) {
        tSheet = ss.insertSheet(teacherName);
        tSheet.setRightToLeft(true);
        tSheet.appendRow(["التاريخ", "اسم الطالب", "الفئة", "الصف", "المبلغ", "رابط الإيصال"]);
        formatHeaderRow(tSheet, 6);
      }
      tSheet.appendRow([date, studentName, category, grade, amount, fileUrl]);

      return createResponse({ status: "success", message: "تم حفظ بيانات التحصيل بنجاح." });
    }

    // ===========================================================
    // 3. تصفية حساب معلم (تصفير مبالغ فرقة محددة)
    //    يدعم جميع الفئات الست بما فيها فئات اللغات
    // ===========================================================
    if (action === "clearDues") {
      var teacherName = (data.teacherName || "").toString().trim();
      var category    = (data.category || "").toString().trim();
      var grade       = (data.grade || "").toString().trim();

      if (!teacherName || !category || !grade) {
        return createResponse({ status: "error", message: "يجب تحديد المعلم والفئة والصف لإتمام التصفية." });
      }

      // ✅ التحقق من الفئة على مستوى السيرفر
      if (VALID_CATEGORIES.indexOf(category) === -1) {
        return createResponse({ status: "error", message: "الفئة الدراسية غير صالحة: " + category });
      }

      var clearedCount = 0;

      // أ) تصفير في صفحة Transactions المجمعة
      //    الأعمدة: [0]=التاريخ، [1]=الطالب، [2]=المعلم، [3]=الفئة، [4]=الصف، [5]=المبلغ، [6]=الإيصال
      var transSheet = ss.getSheetByName("Transactions");
      if (transSheet) {
        var tData = transSheet.getDataRange().getValues();
        for (var i = 1; i < tData.length; i++) {
          var rowTeacher  = (tData[i][2] || "").toString().trim();
          var rowCategory = (tData[i][3] || "").toString().trim();
          var rowGrade    = (tData[i][4] || "").toString().trim();

          if (rowTeacher === teacherName && rowCategory === category && rowGrade === grade) {
            transSheet.getRange(i + 1, 6).setValue(0); // العمود السادس = المبلغ
            clearedCount++;
          }
        }
      }

      // ب) تصفير في صفحة المعلم الخاصة
      //    الأعمدة: [0]=التاريخ، [1]=الطالب، [2]=الفئة، [3]=الصف، [4]=المبلغ، [5]=الإيصال
      var teacherPersonalSheet = ss.getSheetByName(teacherName);
      if (teacherPersonalSheet) {
        var pData = teacherPersonalSheet.getDataRange().getValues();
        for (var j = 1; j < pData.length; j++) {
          var pCategory = (pData[j][2] || "").toString().trim();
          var pGrade    = (pData[j][3] || "").toString().trim();

          if (pCategory === category && pGrade === grade) {
            teacherPersonalSheet.getRange(j + 1, 5).setValue(0); // العمود الخامس = المبلغ
          }
        }
      }

      return createResponse({
        status: "success",
        message: "تم تصفية حساب أستاذ/ " + teacherName + " لفرقة " + category + " (" + grade + ") — " + clearedCount + " سجل تم تصفيره."
      });
    }

    // ===========================================================
    // 4. حذف المعلم نهائياً (الاسم + المعاملات + الصفحة الخاصة)
    // ===========================================================
    if (action === "deleteTeacher") {
      var teacherName = (data.teacherName || "").toString().trim();
      if (!teacherName) {
        return createResponse({ status: "error", message: "اسم المعلم مطلوب لإتمام الحذف." });
      }

      // أ) حذف اسمه من صفحة Teachers
      var teacherListSheet = ss.getSheetByName("Teachers");
      if (teacherListSheet) {
        var tListData = teacherListSheet.getDataRange().getValues();
        for (var i = tListData.length - 1; i >= 1; i--) {
          if ((tListData[i][0] || "").toString().trim() === teacherName) {
            teacherListSheet.deleteRow(i + 1);
          }
        }
      }

      // ب) حذف كل معاملاته من صفحة Transactions
      var transSheet = ss.getSheetByName("Transactions");
      if (transSheet) {
        var transData = transSheet.getDataRange().getValues();
        for (var j = transData.length - 1; j >= 1; j--) {
          if ((transData[j][2] || "").toString().trim() === teacherName) {
            transSheet.deleteRow(j + 1);
          }
        }
      }

      // ج) حذف الصفحة الخاصة بالمعلم بالكامل
      var personalSheet = ss.getSheetByName(teacherName);
      if (personalSheet) {
        ss.deleteSheet(personalSheet);
      }

      return createResponse({ status: "success", message: "تم حذف المعلم وكل بياناته بنجاح." });
    }

    return createResponse({ status: "error", message: "إجراء غير معروف: " + action });

  } catch (error) {
    return createResponse({ status: "error", message: error.toString() });
  } finally {
    // ✅ تحرير القفل دائماً — حتى لو حصل خطأ في أي خطوة
    lock.releaseLock();
  }
}

// =========================================================
// دالة doGet — جلب قائمة المعلمين للقوائم المنسدلة
// =========================================================
function doGet(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName("Teachers");
    if (!sheet) return createResponse([]);

    var data = sheet.getDataRange().getValues();
    var teachers = [];
    for (var i = 1; i < data.length; i++) {
      var name = (data[i][0] || "").toString().trim();
      if (name !== "") {
        teachers.push(name);
      }
    }
    return createResponse(teachers);
  } catch (err) {
    return createResponse({ status: "error", message: err.toString() });
  }
}

// =========================================================
// دوال مساعدة
// =========================================================

/**
 * إنشاء استجابة JSON موحدة
 */
function createResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * تنسيق صف الترويسة (header) بلون وخط مميز
 * @param {Sheet} sheet    - الورقة المراد تنسيقها
 * @param {number} cols    - عدد الأعمدة
 * @param {string} bgColor - لون الخلفية (اختياري)
 */
function formatHeaderRow(sheet, cols, bgColor) {
  bgColor = bgColor || "#1e3a8a";
  var headerRange = sheet.getRange(1, 1, 1, cols);
  headerRange.setBackground(bgColor);
  headerRange.setFontColor("#ffffff");
  headerRange.setFontWeight("bold");
  headerRange.setFontSize(11);
  headerRange.setHorizontalAlignment("center");
  headerRange.setVerticalAlignment("middle");
  sheet.setFrozenRows(1);
  sheet.setRowHeight(1, 35);
  for (var col = 1; col <= cols; col++) {
    sheet.setColumnWidth(col, 160);
  }
}
