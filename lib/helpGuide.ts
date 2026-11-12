// The built-in knowledge base for the Help assistant that academy admins see on every admin page.
// It is written by hand from what the platform really does, so the assistant answers from facts rather than
// guessing, and so a plain keyword search (no AI) can still point people to the right page.
//
// Links are never written by the AI: it names keys from HELP_LINKS and the server turns them into real paths
// for THIS academy, so an answer can only ever link to a page that exists.

export interface HelpLink {
  label: string;
  /** Path under /a/<slug>/admin (no leading slash). "" = the dashboard. */
  path: string;
}

export const HELP_LINKS = {
  dashboard: { label: "Dashboard", path: "" },
  courses: { label: "Courses", path: "courses" },
  modules: { label: "Modules library", path: "modules" },
  newModule: { label: "Create a module", path: "modules/new" },
  newQuiz: { label: "Create a quiz", path: "quizzes/new" },
  newScorm: { label: "Upload a SCORM package", path: "scorm/new" },
  journeys: { label: "Learning journeys", path: "journeys" },
  people: { label: "People", path: "people" },
  analytics: { label: "Analytics", path: "analytics" },
  analyticsLearners: { label: "Learner engagement", path: "analytics/learners" },
  analyticsModules: { label: "Module engagement", path: "analytics/modules" },
  branding: { label: "Branding", path: "branding" },
  site: { label: "Academy Site", path: "site" },
  designer: { label: "Page designer", path: "designer" },
  aiGenerate: { label: "Generate with AI", path: "ai-generate" },
  contentAgent: { label: "Content agent", path: "content-agent" },
  marketing: { label: "SEO & Marketing", path: "marketing" },
  billing: { label: "Billing", path: "billing" },
  settings: { label: "Settings", path: "settings" },
} as const satisfies Record<string, HelpLink>;

export type HelpLinkKey = keyof typeof HELP_LINKS;

export function isHelpLinkKey(k: unknown): k is HelpLinkKey {
  return typeof k === "string" && Object.prototype.hasOwnProperty.call(HELP_LINKS, k);
}

export interface HelpTopic {
  id: string;
  title: string;
  /** Words an admin might use when asking; used by the no-AI search. */
  keywords: string[];
  body: string;
  links: HelpLinkKey[];
}

export function helpTopics(): HelpTopic[] {
  return [
    {
      id: "getting-started",
      title: "Getting started",
      keywords: ["start", "begin", "first", "set up", "setup", "new", "onboarding", "launch", "checklist"],
      body:
        "A good order: 1) Branding - set your logo text, colours and template. 2) Courses - create a course, then add modules to it. " +
        "3) Academy Site - write your headline and tagline, then publish the site (until it is published, visitors only see a 'not published' page). " +
        "4) People - add instructors and learners, or let people register themselves. 5) Optionally the Page designer for full control of the home page.",
      links: ["branding", "courses", "site", "people", "designer"],
    },
    {
      id: "courses",
      title: "Creating and publishing courses",
      keywords: ["course", "create course", "publish course", "price", "free", "level", "type", "hours", "visible", "catalogue", "catalog", "hide"],
      body:
        "Go to Courses and create a course: title, description, category, price (0 = free), type (self-paced, instructor-led or certification), level and study hours. " +
        "A course only appears in the learner catalogue and on your public home page once it is published. Course types you switch off in Settings are hidden from the catalogue, but learners already enrolled keep access. " +
        "Open a course to add modules, assign instructors and enrol learners.",
      links: ["courses", "settings"],
    },
    {
      id: "add-modules",
      title: "Adding modules to a course",
      keywords: ["module", "add module", "new module", "lesson", "content", "assign", "attach", "upload", "file", "pdf", "video", "text", "link", "live session", "zoom", "teams", "order"],
      body:
        "Modules live in the Modules library and can be reused in several courses. Two ways to add one to a course: open the course and use 'Assign an existing module' (shows only modules not already in the course), or create a new module from the course page and it is added automatically. " +
        "Module types: text, link, file (Word/PDF/PowerPoint etc.), video (YouTube/Vimeo link or a small uploaded file), live session (paste your own Zoom or Teams link), and interactive activities such as quizzes, SCORM packages, assignments, polls, forums and lessons. " +
        "Uploaded files and videos are limited to 4MB; for anything bigger host the file elsewhere (for example YouTube, Vimeo, SharePoint or Google Drive) and add it as a link module. " +
        "Modules appear in the course in the order they were added.",
      links: ["courses", "modules", "newModule", "newQuiz", "newScorm"],
    },
    {
      id: "module-sections",
      title: "Modules with sections",
      keywords: ["section", "sections", "training session", "activities", "further learning", "resources", "reading", "rename", "heading", "category", "categories", "organise", "group"],
      body:
        "A 'Module with sections' is a module that holds its own content in sections. In the Modules library choose 'Add an activity or resource' and then 'Module with sections' (or do it from a course so it is added to that course). It starts with three sections: Training Session, Activities and Further Learning & Resources. " +
        "Open it with 'Manage sections & content' to rename a section (Rename), add your own sections ('Add a section'), reorder or delete them (the three-dot menu), and use 'Add an activity or resource' inside any section to create its content: files, links, pages, videos, quizzes, assignments and so on. Move items up or down or into another section from their three-dot menu. " +
        "Learners see the sections as collapsible groups (empty sections are hidden). The module counts as complete once they finish every item in it, and the course progress counts it as one module. Modules created before this feature stay as they are.",
      links: ["modules", "courses"],
    },
    {
      id: "ai-content",
      title: "Generating content with AI",
      keywords: ["ai", "generate", "agent", "draft", "outline", "automatic", "write", "allowance", "limit", "monthly", "credits", "actions"],
      body:
        "Generate with AI turns a description into a whole academy plan (courses and modules) that you review before anything is created. The Content agent drafts or improves a module's content from your instructions and uploaded material; its drafts are only applied when you approve them. " +
        "Each AI request uses one 'AI action' from your plan's monthly allowance (shown on the Generate with AI page, resets monthly). Questions to this Help assistant do not use that allowance.",
      links: ["aiGenerate", "contentAgent", "billing"],
    },
    {
      id: "journeys",
      title: "Learning journeys on your home page",
      keywords: ["journey", "journeys", "pathway", "pathways", "metro", "map", "route", "station", "home page", "not showing", "not visible", "missing"],
      body:
        "A learning journey is a metro-style map: each coloured line is a pathway (for example a career route), each station is a course, module or activity. " +
        "To show one on your home page: create it, add at least one pathway and place stations on it, and make sure 'Add this journey to your academy's home page' is on (it is on by default for new journeys). " +
        "A journey is hidden when: it is switched off; no station has been placed on a pathway (an empty journey is not shown); your academy site isn't published; or your designed home page has no (or a hidden) 'Learning journeys' block - switching a journey on adds that block automatically. " +
        "The Learning Journeys page shows a note explaining exactly what is stopping each journey. A station only links to a course if that course is published.",
      links: ["journeys", "site", "designer"],
    },
    {
      id: "site-design",
      title: "Your public home page: Branding, Academy Site and Page designer",
      keywords: ["website", "site", "home page", "homepage", "design", "colour", "color", "font", "logo", "hero", "headline", "images", "blocks", "sections", "layout", "publish site", "domain"],
      body:
        "Branding sets your logo text, logo picture and colour template for the whole academy. Academy Site is the simple editor: headline, tagline, and content blocks (text, image, video, news, 'what you'll learn'), plus the Publish switch for your public site. " +
        "The Page designer gives full control: colours, fonts, header and footer, and a stack of sections (hero, text, banner, video, news, courses, learning journeys, cards, columns, steps, call to action) that you can reorder, hide and rewrite (with optional AI help). " +
        "You work on a draft, preview it, then Publish; earlier versions are kept so you can restore one. Until you publish a design your academy shows the simple Academy Site page. A custom domain can be connected in Settings.",
      links: ["branding", "site", "designer", "settings"],
    },
    {
      id: "people",
      title: "Adding instructors and learners",
      keywords: ["people", "user", "users", "learner", "learners", "instructor", "instructors", "invite", "add", "register", "enrol", "enroll", "student", "staff", "password", "remove"],
      body:
        "People lists everyone in your academy. Add an instructor or learner there (they sign in with the email and password you set, or reset it with 'forgot password'). Learners can also register themselves from your public site. " +
        "To enrol someone in a course, open the course and add them under Enrolments. Instructors can build courses and modules, grade work and see their learners, but only academy admins manage billing, people, branding, the home page and analytics.",
      links: ["people", "courses"],
    },
    {
      id: "analytics",
      title: "Reports on learner engagement",
      keywords: ["analytics", "report", "reports", "engagement", "progress", "completion", "drop off", "stuck", "inactive", "stalled", "csv", "export", "download", "statistics", "stats", "weekly", "email", "digest"],
      body:
        "Analytics shows learners, active learners, new enrolments, modules completed, average progress, quiz results and certificates over 7 days to all time, with trend charts and a per-course table. " +
        "Open a course to see where learners drop off, module by module. The Modules report lists modules with the lowest completion rate first; the Learners report shows who is active, inactive (an unfinished course and nothing for 14 days), not started or finished. " +
        "Every report can be downloaded as CSV, and a short summary email goes to academy admins every Monday (switch it off on the Analytics page).",
      links: ["analytics", "analyticsModules", "analyticsLearners"],
    },
    {
      id: "payments",
      title: "Charging for courses",
      keywords: ["payment", "payments", "pay", "paid", "charge", "price", "link", "card", "money", "revenue", "income", "sell", "checkout", "fee", "refund", "charity", "public sector", "invoice"],
      body:
        "SkillsAcademy.ai does not take payments for your courses: you charge on your own website or payment system. To do that, open the course, fill in 'Payment link' (a https page on your own site where learners pay) and, if you like, 'Price shown' so learners see what it costs. " +
        "Learners can't enrol themselves in a course that has a price or a payment link: they are sent to your payment page, pay there, and you then add them to the course (from the course page or People). Leave both empty for a free course, which learners join with one click. " +
        "Refunds, invoices and receipts are handled in your own payment system. This works the same for businesses, charities and public-sector bodies.",
      links: ["courses", "people"],
    },
    {
      id: "billing",
      title: "Your subscription, trial and billing",
      keywords: ["billing", "subscription", "plan", "upgrade", "downgrade", "trial", "cancel", "cancellation", "invoice", "stripe", "card", "renew", "price of plan"],
      body:
        "Billing shows your plan, trial status and invoices. During the free trial you can switch plans; to continue after the trial, subscribe through Stripe's secure checkout, and manage your card or invoices from the same page. " +
        "To cancel, use the cancel option on the Billing page: you keep access for a short period, after which the academy is archived. Your plan sets the monthly AI allowance and other limits.",
      links: ["billing"],
    },
    {
      id: "quizzes-grading",
      title: "Quizzes, assignments, SCORM and certificates",
      keywords: ["quiz", "assignment", "grade", "grading", "marking", "scorm", "certificate", "certificates", "pass", "poll", "forum", "submission"],
      body:
        "Create a quiz from the Modules library (questions, pass mark, optional time limit and attempt limit); quizzes mark themselves. Assignments are handed in by learners and graded by you or an instructor from the module's page. " +
        "SCORM packages (1.2 and 2004) can be uploaded as a module and track completion automatically. When a learner finishes every module in a course they receive a certificate (PDF) with a public verification page.",
      links: ["newQuiz", "newScorm", "modules"],
    },
    {
      id: "marketing",
      title: "SEO and marketing",
      keywords: ["seo", "marketing", "social", "google", "search", "keywords", "meta", "ads", "facebook", "linkedin", "promote", "share"],
      body: "SEO & Marketing helps you write search-engine titles and descriptions, social posts and ad copy for your courses. How much is available depends on your plan.",
      links: ["marketing", "billing"],
    },
    {
      id: "settings",
      title: "Settings, language and custom domain",
      keywords: ["settings", "language", "french", "spanish", "german", "english", "translate", "domain", "custom domain", "contact", "name", "course types", "email"],
      body:
        "Settings holds your academy name and contact email, the language learners see (English, French, Spanish or German - AI content is written in it too), which course types are offered, and connecting your own web address (custom domain).",
      links: ["settings"],
    },
    {
      id: "troubleshooting",
      title: "Something is not showing or not working",
      keywords: ["not working", "problem", "error", "broken", "missing", "cannot", "can't", "why", "fail", "failed", "too large", "upload", "slow", "learner cannot see", "can't see"],
      body:
        "Common causes: a learner cannot see a course - the course is not published, its type is switched off in Settings, or they are not on the right academy's sign-in. " +
        "Visitors see 'not published' - publish your academy site on Academy Site. An upload fails - files and videos are limited to 4MB; use a link for larger ones. " +
        "A journey is not on the home page - see the Learning journeys topic. A page looks out of date - refresh it after saving; the public page updates within moments of publishing.",
      links: ["courses", "site", "journeys", "settings"],
    },
  ];
}

/** The platform guide as plain text for the model. */
export function helpGuideText(): string {
  return helpTopics()
    .map((t) => `## ${t.title}\n${t.body}\nRelated pages: ${t.links.join(", ")}`)
    .join("\n\n");
}

/** The most relevant guide topics for a question - used when AI isn't available. */
export function searchGuide(query: string, limit = 3): HelpTopic[] {
  const words = query
    .toLowerCase()
    .replace(/[^a-z0-9' ]+/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
  if (words.length === 0) return [];
  const topics = helpTopics();
  const scored = topics.map((t) => {
    let score = 0;
    const title = t.title.toLowerCase();
    const body = t.body.toLowerCase();
    for (const w of words) {
      if (t.keywords.some((k) => k === w)) score += 4;
      else if (t.keywords.some((k) => k.includes(w) || (w.length > 4 && w.includes(k)))) score += 2;
      if (title.includes(w)) score += 2;
      if (body.includes(w)) score += 1;
    }
    return { t, score };
  });
  return scored
    .filter((x) => x.score >= 3)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.t);
}

export const SUGGESTED_QUESTIONS = [
  "How do I add a module to a course?",
  "Why isn't my learning journey on my home page?",
  "How do I charge for a course?",
  "How do I see which learners are stuck?",
  "How do I change the design of my home page?",
];
