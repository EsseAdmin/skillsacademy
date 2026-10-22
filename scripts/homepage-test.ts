// Unit checks for the homepage's "What you'll learn" helpers (no DB needed).
//   npx tsx scripts/homepage-test.ts
import { parseLearnItems, serializeLearnItems, learnItemsFor, MAX_LEARN_ITEMS } from "../lib/learnItems";

import { safeLearnerNext } from "../lib/nextPath";
import { sniffImageExtension } from "../lib/imageSniff";
import { pickArt, usesDefaultEmoji } from "../lib/courseArt";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"} - ${name}${detail ? " :: " + detail : ""}`);
}

check("Blank lines and bullets are cleaned", parseLearnItems("- One\n\n• Two\n3. Three\r\n  ✓ Four ").join("|") === "One|Two|Three|Four");
check("At most 8 points are kept", parseLearnItems(Array.from({ length: 20 }, (_, i) => `P${i}`).join("\n")).length === MAX_LEARN_ITEMS);
check("Very long points are shortened", parseLearnItems("x".repeat(500))[0].length === 160);
check("serialize round-trips", serializeLearnItems(["A", " ", "B"]) === "A\nB");
check("Empty input gives no points", parseLearnItems("").length === 0 && parseLearnItems(null).length === 0);

const courses = [
  { title: "Change 101", description: "Understand why change fails. Then learn how to lead it." },
  { title: "No Description", description: "" },
  { title: "Long", description: "y".repeat(400) },
];
const derived = learnItemsFor("", courses);
check("Without admin points, they come from the courses", derived.length === 3);
check("A course's first sentence is used", derived[0] === "Understand why change fails.");
check("A course with no description becomes 'Complete <title>'", derived[1] === "Complete No Description");
check("A long description is cut with an ellipsis", derived[2].length <= 160 && derived[2].endsWith("…"));
check("Admin-written points win over derived ones", learnItemsFor("Mine one\nMine two", courses).join("|") === "Mine one|Mine two");
check("No courses and no points gives an empty list", learnItemsFor("", []).length === 0);

check("next: a learner page of the same academy is allowed", safeLearnerNext("acme", "/a/acme/learner/courses/abc-123") === "/a/acme/learner/courses/abc-123");
check("next: another academy is refused", safeLearnerNext("acme", "/a/other/learner/courses/x") === null);
check("next: other areas are refused", safeLearnerNext("acme", "/a/acme/admin/people") === null);
check("next: full URLs, protocol-relative and traversal are refused", ["https://evil.example", "//evil.example", "/a/acme/learner/../admin", "/a/acme/learner//x", "/a/acme/learner/x?y=1", "/a/acme/learner/%2e%2e/x"].every((x) => safeLearnerNext("acme", x) === null));
check("next: non-strings are refused", safeLearnerNext("acme", undefined) === null && safeLearnerNext("acme", 5) === null);
check("image sniff: PNG", sniffImageExtension(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0])) === "png");
check("image sniff: JPEG", sniffImageExtension(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0])) === "jpg");
check("image sniff: SVG", sniffImageExtension(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')) === "svg");
check("image sniff: HTML pretending to be an image is refused", sniffImageExtension(Buffer.from("<html><script>alert(1)</script></html>")) === null);
check("image sniff: plain text is refused", sniffImageExtension(Buffer.from("hello, not an image")) === null);

check("art: Applied Counselling Skills -> conversation", pickArt("Applied Counselling Skills") === "people");
check("art: Foundations of Psychology -> brain", pickArt("Foundations of Psychology") === "mind");
check("art: Python basics -> code", pickArt("Python for beginners", "Technology") === "code");
check("art: Fundamentals of Programming and Machine Learning -> code", pickArt("Fundamentals of Programming and Machine Learning") === "code");
check("art: First aid at work -> health", pickArt("First Aid at Work") === "health");
check("art: GDPR compliance -> legal", pickArt("GDPR Compliance Essentials") === "legal");
check("art: Business Transformation -> chart", pickArt("Business Transformation Foundations") === "chart");
check("art: nothing matches -> default learning picture", pickArt("Welcome", "General", "") === "learning");
check("art: falls back to the description when the title says nothing", pickArt("Module 1", "", "Learn how to write clean python code") === "code");
check("art: title wins over description", pickArt("Team Leadership", "", "includes python") === "people");
check("art: 'Fundamentals' does not look like 'mental'", pickArt("Negotiation Fundamentals") === "people");
check("art: 'Excellence' does not look like Excel", pickArt("Client Onboarding Excellence", "Client Success") === "people");
check("art: 'aid'/'aim' are not AI", pickArt("Our aim", "") === "learning" && pickArt("Aid workers", "") === "learning");
check("art: 'Steam' is not a team and 'spreading' is not reading", pickArt("Steam engines") !== "people" && pickArt("Spreading joy") === "learning");
check("emoji: default book / empty counts as 'not chosen'", usesDefaultEmoji("📘") && usesDefaultEmoji("") && usesDefaultEmoji(null) && !usesDefaultEmoji("🧠"));

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
