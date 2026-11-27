// Unit tests for the privacy notice text (lib/privacy.ts). No database needed.
//   npx tsx scripts/privacy-test.ts
import { termsCompany, PLACEHOLDER } from "../lib/terms";
import { privacySections, privacyPlainText } from "../lib/privacy";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"} - ${name}${detail ? " :: " + detail : ""}`);
}
const blank = termsCompany({});
check("with nothing set the notice shows the placeholders", privacyPlainText(blank).includes(PLACEHOLDER.name) && privacyPlainText(blank).includes(PLACEHOLDER.email));
const set = termsCompany({ TERMS_COMPANY_NAME: "Acme Ltd", TERMS_COMPANY_NUMBER: "01234567", TERMS_COMPANY_ADDRESS: "1 High Street, London", TERMS_CONTACT_EMAIL: "privacy@acme.test" });
const text = privacyPlainText(set);
check("company details are written in and no placeholder is left", text.includes("Acme Ltd") && text.includes("privacy@acme.test") && !/\[(Company name|Company number|Registered office address|Contact email)\]/.test(text));
const ids = privacySections(set).map((s) => s.id);
for (const need of ["who", "collect", "why", "share", "transfers", "keep", "rights", "security", "children", "changes", "contact"]) check(`section "${need}" is present`, ids.includes(need));
check("section ids are unique", new Set(ids).size === ids.length);
check("every sub-processor named in the Terms is named here", ["Netlify", "Stripe", "Resend", "Anthropic"].every((n) => text.includes(n)));
check("it names the regulator", /Information Commissioner/.test(text) && /ico\.org\.uk/.test(text));
check("it says card numbers are not stored", /never seen or stored by us/.test(text));
if (failures) { console.log(`\n${failures} FAILED`); process.exit(1); }
console.log("\nAll passed");
