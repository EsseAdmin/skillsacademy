// Unit tests for the Terms & Conditions text (lib/terms.ts). No database needed.
//   npx tsx scripts/terms-test.ts
import { termsCompany, termsSections, termsPlainText, TERMS_VERSION, PLACEHOLDER } from "../lib/terms";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"} - ${name}${detail ? " :: " + detail : ""}`);
}

const blank = termsCompany({});
check("with nothing set the company details are placeholders and the terms say so", !blank.complete && termsPlainText(blank).includes(PLACEHOLDER.name) && termsPlainText(blank).includes(PLACEHOLDER.email));
check("whitespace-only values count as not set", !termsCompany({ TERMS_COMPANY_NAME: "   " }).complete);

const set = termsCompany({ TERMS_COMPANY_NAME: "Acme Ltd", TERMS_COMPANY_NUMBER: "01234567", TERMS_COMPANY_ADDRESS: "1 High Street, London", TERMS_CONTACT_EMAIL: "legal@acme.test", TERMS_EFFECTIVE_DATE: "1 January 2027" });
const text = termsPlainText(set);
check("with all four set the terms are complete", set.complete && set.effectiveDate === "1 January 2027");
check("company details are written into the text", text.includes("Acme Ltd") && text.includes("01234567") && text.includes("1 High Street, London") && text.includes("legal@acme.test"));
check("no placeholder is left once the details are set", !/\[(Company name|Company number|Registered office address|Contact email)\]/.test(text));

const ids = termsSections(set).map((s) => s.id);
for (const need of ["about", "service", "accounts", "fees", "cancel", "content", "use", "ai", "payments", "data", "security", "warranty", "liability", "changes", "general", "law", "contact"]) {
  check(`section "${need}" is present`, ids.includes(need));
}
check("section ids are unique", new Set(ids).size === ids.length);
check("titles are numbered in order", termsSections(set).every((s, i) => s.title.startsWith(`${i + 1}. `)));
check("governed by England and Wales", text.includes("England and Wales") && /Contracts \(Rights of Third Parties\) Act 1999/.test(text));
check("covers UK GDPR roles (controller / processor) and sub-processors", /controller/.test(text) && /processor/.test(text) && /sub-processor/i.test(text) && /UK GDPR/.test(text));
check("states the platform takes no learner payments", /does not take payments from your Learners/.test(text));
check("states AI output is a draft the customer must approve", /AI output is a draft/.test(text));
check("mentions the 24-hour archive after cancelling", /about 24 hours later/.test(text));
check("liability carve-outs for death, personal injury and fraud", /death or personal injury caused by negligence/.test(text) && /fraud/.test(text));
check("version is set", /^\d+\.\d+$/.test(TERMS_VERSION), TERMS_VERSION);
console.log(failures ? `${failures} FAILED` : "All checks passed.");
process.exit(failures ? 1 : 0);
