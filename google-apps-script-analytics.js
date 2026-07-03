const SHEET_NAME = "Analitica";

function doPost(e) {
  const sheet = getSheet();
  const data = JSON.parse(e.postData.contents || "{}");

  sheet.appendRow([
    new Date(),
    data.event || "",
    data.videoId || "",
    data.videoTitle || "",
    data.feedback || "",
    data.progress || "",
    data.currentTime || "",
    data.duration || "",
    data.visitorId || "",
    data.page || "",
    data.url || "",
    data.referrer || "",
    data.language || "",
    data.screen || "",
    data.userAgent || "",
  ]);

  return ContentService
    .createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}

function getSheet() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = spreadsheet.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(SHEET_NAME);
    sheet.appendRow([
      "Fecha",
      "Evento",
      "Video ID",
      "Video titulo",
      "Feedback",
      "Progreso",
      "Segundo actual",
      "Duracion",
      "Visitante anonimo",
      "Pagina",
      "URL",
      "Referencia",
      "Idioma",
      "Pantalla",
      "Navegador",
    ]);
  }

  return sheet;
}
