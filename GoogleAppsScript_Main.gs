/**
 * ==============================================================================
 * كود Google Apps Script الأساسي — نظام التحصيل والمعلمين
 * مدمج به دعم كامل لقراءة المعاملات (getTransactions) لاستعلام الطلاب
 * مع حماية LockService المتزامنة
 * ==============================================================================
 */

function doPost(e) {
  // ✅ قفل على مستوى السكريبت لمنع التداخل عند وصول أكثر من طلب في نفس الوقت
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000); // انتظار حتى 15 ثانية
  } catch (lockErr) {
    return createResponse({ status: "error", message: "الخادم مشغول حالياً، يرجى إعادة المحاولة بعد لحظة." });
  }

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var data = JSON.parse(e.postData.contents);
    var action = data.action;

    // 1. إضافة معلم وإنشاء صفحته
    if (action === "addTeacher") {
      var teacherSheet = ss.getSheetByName("Teachers");
      if (!teacherSheet) {
        teacherSheet = ss.insertSheet("Teachers");
        teacherSheet.appendRow(["المعلم"]);
      }
      teacherSheet.appendRow([data.teacherName]);
      if (!ss.getSheetByName(data.teacherName)) {
        var newSheet = ss.insertSheet(data.teacherName);
        newSheet.appendRow(["التاريخ", "اسم الطالب", "الفئة", "الصف", "المبلغ", "رابط الإيصال"]);
      }
      return createResponse({ status: "success", message: "تم إضافة المعلم" });
    }

    // 2. إضافة تحصيل ورفع إيصال
    if (action === "addTransaction") {
      var fileUrl = "لا يوجد إيصال";
      if (data.fileBase64) {
        var folder = DriveApp.getFolderById("1plK4RY1foN1tBJ-nDw6YIiYW5J1Jduo8");
        var decodedData = Utilities.base64Decode(data.fileBase64);
        var blob = Utilities.newBlob(decodedData, data.mimeType, data.fileName);
        var file = folder.createFile(blob);
        fileUrl = file.getUrl();
      }

      var transSheet = ss.getSheetByName("Transactions");
      if (!transSheet) {
        transSheet = ss.insertSheet("Transactions");
        transSheet.appendRow(["التاريخ", "اسم الطالب", "المعلم", "الفئة", "الصف", "المبلغ", "رابط الإيصال"]);
      }

      // إضافة لجدول Transactions الرئيسي
      transSheet.appendRow([data.date, data.studentName, data.teacherName, data.category, data.grade, data.amount, fileUrl]);

      // إضافة لصفحة المعلم الخاصة
      var tSheet = ss.getSheetByName(data.teacherName);
      if (!tSheet) {
        tSheet = ss.insertSheet(data.teacherName);
        tSheet.appendRow(["التاريخ", "اسم الطالب", "الفئة", "الصف", "المبلغ", "رابط الإيصال"]);
      }
      tSheet.appendRow([data.date, data.studentName, data.category, data.grade, data.amount, fileUrl]);

      return createResponse({ status: "success", message: "تم الحفظ" });
    }

    // 3. تصفية الحساب (تصفير المبالغ)
    if (action === "clearDues") {
      var transSheet = ss.getSheetByName("Transactions");
      if (transSheet) {
        var tData = transSheet.getDataRange().getValues();
        for (var i = 1; i < tData.length; i++) {
          if (tData[i][2] === data.teacherName && tData[i][3] === data.category && tData[i][4] === data.grade) {
            transSheet.getRange(i + 1, 6).setValue(0);
          }
        }
      }

      var teacherPersonalSheet = ss.getSheetByName(data.teacherName);
      if (teacherPersonalSheet) {
        var pData = teacherPersonalSheet.getDataRange().getValues();
        for (var j = 1; j < pData.length; j++) {
          if (pData[j][2] === data.category && pData[j][3] === data.grade) {
            teacherPersonalSheet.getRange(j + 1, 5).setValue(0);
          }
        }
      }
      return createResponse({ status: "success", message: "تم التصفية" });
    }

    // 4. حذف المعلم نهائياً
    if (action === "deleteTeacher") {
      var teacherSheet = ss.getSheetByName("Teachers");
      if (teacherSheet) {
        var tData = teacherSheet.getDataRange().getValues();
        for (var i = tData.length - 1; i >= 1; i--) {
          if (tData[i][0] === data.teacherName) {
            teacherSheet.deleteRow(i + 1);
          }
        }
      }

      var transSheet = ss.getSheetByName("Transactions");
      if (transSheet) {
        var transData = transSheet.getDataRange().getValues();
        for (var j = transData.length - 1; j >= 1; j--) {
          if (transData[j][2] === data.teacherName) {
            transSheet.deleteRow(j + 1);
          }
        }
      }

      var personalSheet = ss.getSheetByName(data.teacherName);
      if (personalSheet) {
        ss.deleteSheet(personalSheet);
      }

      return createResponse({ status: "success", message: "تم حذف المعلم وكل بياناته" });
    }

  } catch (error) {
    return createResponse({ status: "error", message: error.toString() });
  } finally {
    lock.releaseLock();
  }
}

/**
 * دالة doGet لقراءة المعلمين أو قراءة سجلات التحصيل
 */
function doGet(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var action = (e && e.parameter && e.parameter.action) ? e.parameter.action : "";

    // 1. جلب كافة سجلات التحصيل (للشاشة الجديدة للاستعلام)
    if (action === "getTransactions") {
      var transSheet = ss.getSheetByName("Transactions");
      if (!transSheet) {
        return createResponse({ status: "success", transactions: [] });
      }

      var values = transSheet.getDataRange().getValues();
      var transactions = [];

      for (var i = 1; i < values.length; i++) {
        var row = values[i];
        if (!row[1]) continue; // تخطي الصفوف بدون اسم طالب

        transactions.push({
          date: row[0] ? row[0].toString().trim() : "",
          studentName: row[1] ? row[1].toString().trim() : "",
          teacherName: row[2] ? row[2].toString().trim() : "",
          category: row[3] ? row[3].toString().trim() : "",
          grade: row[4] ? row[4].toString().trim() : "",
          amount: row[5] !== undefined ? row[5].toString().trim() : "0",
          fileLink: row[6] ? row[6].toString().trim() : ""
        });
      }

      return createResponse({ status: "success", transactions: transactions });
    }

    // 2. الافتراضي: جلب قائمة أسماء المعلمين
    var sheet = ss.getSheetByName("Teachers");
    if (!sheet) {
      return createResponse([]);
    }
    var data = sheet.getDataRange().getValues();
    var teachers = [];
    for (var j = 1; j < data.length; j++) {
      if (data[j][0] !== "") {
        teachers.push(data[j][0].toString().trim());
      }
    }
    return createResponse(teachers);

  } catch (err) {
    return createResponse({ status: "error", message: err.toString() });
  }
}

function createResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

