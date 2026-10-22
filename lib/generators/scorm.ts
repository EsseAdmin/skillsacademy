import JSZip from "jszip";
import type { ScormContent } from "@/lib/moduleContent";

// Builds a real SCORM 1.2 package (a .zip with imsmanifest.xml + a single
// self-contained index.html SCO) from AI-written content: a few lesson
// pages with Back/Next, then an optional multiple-choice self-check. It
// talks to the LMS exactly like third-party authored content does — walks
// up the window chain for `window.API`, calls LMSInitialize / LMSSetValue /
// LMSCommit / LMSFinish — so it runs unmodified in this app's SCORM player
// (components/ScormPlayer.tsx) and in any other SCORM 1.2 LMS.
//
// Completion rules: with no questions, reaching the last page sets
// lesson_status "completed". With questions, submitting the self-check sets
// score.raw and "passed"/"failed" against the pass mark (a learner can retry
// after "failed"). Which of those statuses count as module-complete is
// decided by the LMS side (ScormAttempts.isPassingOrComplete).
function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function manifestXml(title: string, identifier: string): string {
  const t = esc(title);
  return `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="${esc(identifier)}" version="1.0"
  xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2"
  xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.imsproject.org/xsd/imscp_rootv1p1p2 imscp_rootv1p1p2.xsd http://www.adlnet.org/xsd/adlcp_rootv1p2 adlcp_rootv1p2.xsd">
  <metadata>
    <schema>ADL SCORM</schema>
    <schemaversion>1.2</schemaversion>
  </metadata>
  <organizations default="ORG-1">
    <organization identifier="ORG-1">
      <title>${t}</title>
      <item identifier="ITEM-1" identifierref="RES-1">
        <title>${t}</title>
      </item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="RES-1" type="webcontent" adlcp:scormtype="sco" href="index.html">
      <file href="index.html"/>
    </resource>
  </resources>
</manifest>
`;
}

function indexHtml(content: ScormContent): string {
  const pagesHtml = content.pages
    .map(
      (p, i) => `
    <section class="page" data-page="${i}" hidden>
      <h2>${esc(p.heading)}</h2>
      ${p.paragraphs.map((x) => `<p>${esc(x)}</p>`).join("\n      ")}
      ${p.bullets.length ? `<ul>${p.bullets.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>` : ""}
    </section>`
    )
    .join("");

  const quizHtml = content.questions.length
    ? `
    <section class="page" data-page="${content.pages.length}" data-quiz="1" hidden>
      <h2>Check your understanding</h2>
      <form id="quiz">
        ${content.questions
          .map(
            (q, qi) => `
        <fieldset>
          <legend>${qi + 1}. ${esc(q.question)}</legend>
          ${q.options
            .map((o, oi) => `<label><input type="radio" name="q${qi}" value="${oi}"> ${esc(o)}</label>`)
            .join("")}
          <p class="fb" id="fb${qi}" hidden></p>
        </fieldset>`
          )
          .join("")}
        <button type="submit" id="submit">Submit answers</button>
        <p id="result" role="status"></p>
      </form>
    </section>`
    : "";

  // Data for the script — escape "<" so "</script>" in content can't break
  // out of the inline <script> block.
  const data = JSON.stringify({
    pageCount: content.pages.length + (content.questions.length ? 1 : 0),
    passMark: content.passMarkPct,
    questions: content.questions.map((q) => ({ correct: q.correctIndex, explanation: q.explanation })),
  }).replace(/</g, "\\u003c");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(content.title)}</title>
<style>
  body { font-family: -apple-system, Segoe UI, Roboto, sans-serif; color: #1f2937; margin: 0; background: #f8fafc; }
  main { max-width: 760px; margin: 0 auto; padding: 24px 20px 80px; }
  h1 { font-size: 1.4rem; margin: 0 0 4px; color: #0b1f3b; }
  .progress { height: 6px; background: #e5e7eb; border-radius: 3px; margin: 12px 0 24px; }
  .progress > div { height: 100%; background: #0b1f3b; border-radius: 3px; width: 0; transition: width .2s; }
  .page { background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 20px 24px; }
  .page h2 { margin-top: 0; font-size: 1.2rem; }
  .page p, .page li { line-height: 1.6; }
  fieldset { border: 0; padding: 0; margin: 0 0 18px; }
  legend { font-weight: 600; margin-bottom: 8px; }
  label { display: block; padding: 6px 0; cursor: pointer; }
  .nav { display: flex; justify-content: space-between; margin-top: 18px; }
  button { background: #0b1f3b; color: #fff; border: 0; border-radius: 6px; padding: 10px 18px; font-size: .95rem; cursor: pointer; }
  button[disabled] { opacity: .4; cursor: default; }
  .fb { font-size: .9rem; margin: 6px 0 0; } .ok { color: #047857; } .no { color: #b91c1c; }
  #result { font-weight: 600; margin-top: 12px; }
</style>
</head>
<body>
<main>
  <h1>${esc(content.title)}</h1>
  <div class="progress"><div id="bar"></div></div>
  ${pagesHtml}
  ${quizHtml}
  <div class="nav">
    <button type="button" id="back">Back</button>
    <button type="button" id="next">Next</button>
  </div>
</main>
<script>
(function () {
  var CFG = ${data};
  var api = null;
  function findAPI(win) {
    var n = 0;
    while (win && !win.API && n < 10) { if (win.parent && win.parent !== win) win = win.parent; else break; n++; }
    return win && win.API ? win.API : null;
  }
  api = findAPI(window) || (window.opener ? findAPI(window.opener) : null);
  function set(k, v) { try { if (api) api.LMSSetValue(k, v); } catch (e) {} }
  function commit() { try { if (api) api.LMSCommit(""); } catch (e) {} }
  if (api) { try { api.LMSInitialize(""); } catch (e) {} }
  set("cmi.core.lesson_status", "incomplete");
  commit();

  var pages = Array.prototype.slice.call(document.querySelectorAll(".page"));
  var cur = 0, finished = false;
  var back = document.getElementById("back"), next = document.getElementById("next"), bar = document.getElementById("bar");
  var hasQuiz = CFG.questions.length > 0;

  function complete() {
    if (finished || hasQuiz) return;
    finished = true;
    set("cmi.core.lesson_status", "completed");
    commit();
  }
  function show(i) {
    cur = Math.max(0, Math.min(CFG.pageCount - 1, i));
    pages.forEach(function (p, idx) { p.hidden = idx !== cur; });
    bar.style.width = ((cur + 1) / CFG.pageCount * 100) + "%";
    back.disabled = cur === 0;
    var last = cur === CFG.pageCount - 1;
    next.disabled = last;
    next.style.display = last ? "none" : "";
    set("cmi.core.lesson_location", String(cur));
    if (last) complete();
  }
  back.onclick = function () { show(cur - 1); };
  next.onclick = function () { show(cur + 1); };

  var quiz = document.getElementById("quiz");
  if (quiz) quiz.onsubmit = function (e) {
    e.preventDefault();
    var right = 0;
    CFG.questions.forEach(function (q, i) {
      var sel = quiz.querySelector('input[name="q' + i + '"]:checked');
      var ok = !!sel && Number(sel.value) === q.correct;
      if (ok) right++;
      var fb = document.getElementById("fb" + i);
      fb.hidden = false;
      fb.className = "fb " + (ok ? "ok" : "no");
      fb.textContent = (ok ? "Correct. " : "Not quite. ") + (q.explanation || "");
    });
    var pct = Math.round(right / CFG.questions.length * 100);
    var passed = pct >= CFG.passMark;
    set("cmi.core.score.min", "0");
    set("cmi.core.score.max", "100");
    set("cmi.core.score.raw", String(pct));
    set("cmi.core.lesson_status", passed ? "passed" : "failed");
    commit();
    document.getElementById("result").textContent =
      "You scored " + pct + "% (" + right + " of " + CFG.questions.length + "). " +
      (passed ? "Well done — you passed." : "You need " + CFG.passMark + "% to pass. Review the pages and try again.");
  };

  window.addEventListener("beforeunload", function () { try { if (api) { api.LMSCommit(""); api.LMSFinish(""); } } catch (e) {} });
  show(0);
})();
</script>
</body>
</html>
`;
}

// Returns the package as a zip Buffer. `identifier` just needs to be unique
// and XML-safe; callers pass the module id.
export async function buildScormZip(content: ScormContent, identifier: string): Promise<Buffer> {
  const zip = new JSZip();
  zip.file("imsmanifest.xml", manifestXml(content.title, `MANIFEST-${identifier}`));
  zip.file("index.html", indexHtml(content));
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}
