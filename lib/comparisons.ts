// Comparison pages: SkillsAcademy.ai next to four well-known alternatives.
//
// Rules for editing this file (it is public marketing copy that names other companies):
//  - State only what the competitor's own site said on the CHECKED date, and say where it was read. Where the page we read
//    was silent, say "Not stated on the page we checked": never guess, and never write "does not support".
//  - State only what SkillsAcademy.ai really does today, including what it does not do.
//  - Re-check each competitor page and bump CHECKED_ON before publishing changes or at least twice a year.

export const CHECKED_ON = "27 November 2026";

export interface CompareRow {
  topic: string;
  them: string;
  us: string;
}
export interface Comparison {
  slug: string;
  name: string;
  source: string; // the page we read
  tagline: string;
  intro: string;
  rows: CompareRow[];
  strongerThem: string[];
  strongerUs: string[];
  chooseThem: string;
  chooseUs: string;
}

const US = {
  built: "Organisations and trainers who want a branded academy of their own, run by people who are not course-platform specialists.",
  ai: "Describe the academy once and the AI drafts courses and modules, with a PowerPoint deck and a Word exercise sheet for each lesson. A generation tool and a content agent keep adding to it.",
  site: "Branded academy site with a page designer and your own colours and logo. Your own web address can be connected in Settings.",
  certs: "Yes: completion certificates issued by your academy.",
  scorm: "Yes: upload SCORM packages as activities, alongside quizzes, assignments, polls, forums and lessons.",
  live: "Live-session modules hold your own Zoom or Teams link. The platform does not host the video itself.",
  sell: "No built-in checkout for learners. You add a price and a link to your own payment page, then enrol learners once they have paid.",
  community: "No community space, email-marketing tool or mobile app. Forums and polls exist inside courses.",
  languages: "Academies can be created and run in English, Spanish, German, French or Portuguese.",
  trial: "Free trial when you create an academy; the current length is shown on the sign-up page.",
};

export const COMPARISONS: Comparison[] = [
  {
    slug: "thinkific",
    name: "Thinkific",
    source: "https://www.thinkific.com/get-started/trial-sell/",
    tagline: "A course-selling platform with communities, memberships and built-in checkout.",
    intro: "Thinkific presents itself as a platform to build, sell and run courses, communities and memberships in one place. SkillsAcademy.ai is narrower: it is built to get a branded academy of your own live quickly, with the course content drafted for you.",
    rows: [
      { topic: "Built for", them: "Course creators and businesses that sell online learning, including seat sales and internal training.", us: US.built },
      { topic: "AI help", them: "AI-assisted course generation and an AI teaching assistant (the page places the assistant in its higher tiers).", us: US.ai },
      { topic: "Your own site and domain", them: "Your school on your own domain; email white-labelling in a higher tier.", us: US.site },
      { topic: "Certificates", them: "Branded certificates on completion.", us: US.certs },
      { topic: "SCORM", them: "SCORM uploads, listed in its highest (custom-quoted) tier.", us: US.scorm },
      { topic: "Selling courses", them: "Built-in checkout with one-off, subscription and payment-plan pricing, coupons, bundles, tax handling.", us: US.sell },
      { topic: "Community and marketing", them: "Communities and mobile apps for communities.", us: US.community },
      { topic: "Languages", them: "The page we checked does not say how many languages are supported.", us: US.languages },
      { topic: "Free trial", them: "A 30-day free trial is offered on the page.", us: US.trial },
    ],
    strongerThem: [
      "Selling: its checkout, payment plans, coupons and tax handling are built in, ours are not.",
      "Community: communities and mobile access are part of the product.",
      "Track record: far larger customer base and ecosystem.",
    ],
    strongerUs: [
      "Speed to a finished academy: the AI drafts courses, slide decks and exercise sheets for you.",
      "SCORM activities sit in the same academy builder as quizzes, assignments and forums.",
      "Academies created and run in five languages, including Portuguese.",
    ],
    chooseThem: "you mainly want to sell courses to the public with payment plans, coupons and a community around them.",
    chooseUs: "you already have know-how or slides, want a branded academy live this week, and are happy to take payment on your own website.",
  },
  {
    slug: "teachable",
    name: "Teachable",
    source: "https://www.teachable.com/online-courses",
    tagline: "A creator platform for courses, coaching and digital products with its own payments.",
    intro: "Teachable describes itself as a place to build, host, market and sell courses, coaching and digital downloads. SkillsAcademy.ai focuses on giving organisations a branded academy with learner tracking and drafted content.",
    rows: [
      { topic: "Built for", them: "Experts and businesses selling courses, coaching and downloads; also onboarding and customer training.", us: US.built },
      { topic: "AI help", them: "AI course starter, lesson summaries, quizzes, subtitles and translations (subtitles in 70+ languages).", us: US.ai },
      { topic: "Your own site and domain", them: "Custom domain and a white-label website are listed.", us: US.site },
      { topic: "Certificates", them: "Completion certificates are listed.", us: US.certs },
      { topic: "SCORM", them: "Not stated on the page we checked.", us: US.scorm },
      { topic: "Live sessions", them: "Live sessions run through third-party embeds such as YouTube, Vimeo or Zoom.", us: US.live },
      { topic: "Selling courses", them: "Its own payments for checkout, with tax handling, payment plans and subscriptions in many currencies.", us: US.sell },
      { topic: "Community and marketing", them: "A community space, coaching sales, apps for iOS and Android, and Zapier and Mailchimp integrations.", us: US.community },
      { topic: "Languages", them: "Subtitles and translations in 70+ languages; interface languages not listed on the page we checked.", us: US.languages },
    ],
    strongerThem: [
      "Selling and payments: payments, tax handling and local payment methods are built in.",
      "Reach: apps, a community space and integrations are part of the product.",
      "Maturity: a long-established platform with a large creator base.",
    ],
    strongerUs: [
      "Courses drafted from a short brief, with a slide deck and exercise sheet per lesson, plus a page designer for your academy site.",
      "SCORM and interactive activities such as quizzes, assignments and forums in the same builder.",
      "Academy creation in five languages, so a team can run its academy in Spanish, German, French or Portuguese.",
    ],
    chooseThem: "you are a solo creator selling to the public and want payments, coaching sales, apps and a community in one place.",
    chooseUs: "you represent a training business, charity or association that wants its own branded academy with learner tracking, certificates and drafted content.",
  },
  {
    slug: "kajabi",
    name: "Kajabi",
    source: "https://kajabi.com/product/online-courses",
    tagline: "An all-in-one platform for courses, websites, email marketing, payments and community.",
    intro: "Kajabi pitches one platform for the whole creator business: courses, a website builder, email marketing, payments and community. SkillsAcademy.ai does one part of that, the academy itself, and aims to make it fast to build.",
    rows: [
      { topic: "Built for", them: "Experts and creators building a business around what they know.", us: US.built },
      { topic: "AI help", them: "Generates a course outline from a topic; an assistant helps with course content, landing pages and marketing emails.", us: US.ai },
      { topic: "Your own site and domain", them: "A website builder, landing pages and lead-capture forms.", us: US.site },
      { topic: "Certificates", them: "Can issue completion certificates.", us: US.certs },
      { topic: "SCORM", them: "States in its FAQ that it is not SCORM compliant.", us: US.scorm },
      { topic: "Live sessions", them: "Cohort courses with live video are described.", us: US.live },
      { topic: "Selling courses", them: "Kajabi Payments with one-off, subscription and payment-plan pricing, coupons, order bumps, upsells and affiliates.", us: US.sell },
      { topic: "Community and marketing", them: "Community spaces, email broadcasts and sequences, funnels and automations, and a branded mobile app.", us: US.community },
    ],
    strongerThem: [
      "Marketing: email, funnels, automations and affiliates are part of the same product.",
      "Selling: payments, upsells and community are built in.",
      "Breadth: it can run most of a creator business from one login.",
    ],
    strongerUs: [
      "SCORM support, which Kajabi says it does not have, for teams that bring existing SCORM content.",
      "An academy built for organisations that need a branded learning site, learner tracking and certificates rather than a marketing stack.",
      "Five-language academy creation, including Portuguese.",
    ],
    chooseThem: "you want one tool for courses, marketing emails, funnels, payments and community, and you are selling to the public.",
    chooseUs: "you need a branded academy quickly, have SCORM or slide content to bring, and handle marketing and payments elsewhere.",
  },
  {
    slug: "talentlms",
    name: "TalentLMS",
    source: "https://www.talentlms.com/features",
    tagline: "A cloud learning management system for employee, partner and customer training.",
    intro: "TalentLMS is a traditional learning management system for businesses, strong on compliance-style training, reporting and integrations. SkillsAcademy.ai is lighter and aimed at launching a branded, public-facing academy fast.",
    rows: [
      { topic: "Built for", them: "Employee onboarding, partner, customer, compliance and cybersecurity training.", us: US.built },
      { topic: "AI help", them: "AI content creator, AI test creator, AI translator (40+ languages), AI coach and more.", us: US.ai },
      { topic: "Your own site and domain", them: "Branded portals; \"Branches\" create separate branded training environments for teams or departments.", us: US.site },
      { topic: "Certificates", them: "Custom certificates for assessments and completions.", us: US.certs },
      { topic: "SCORM", them: "SCORM, xAPI and cmi5.", us: US.scorm },
      { topic: "Selling courses", them: "Not offered as far as we could see: its Course Store is for buying ready-made courses, not for selling your own.", us: US.sell },
      { topic: "Integrations", them: "LTI 1.3, single sign-on, a REST API, and native HR, CRM and communication integrations.", us: "A smaller set: no single sign-on, LTI or HR-system integrations at present." },
      { topic: "Languages", them: "AI translation into 40+ languages; interface languages not stated on the page we checked.", us: US.languages },
    ],
    strongerThem: [
      "Enterprise depth: single sign-on, a REST API, HR and CRM integrations, xAPI and cmi5.",
      "Compliance and reporting for large internal workforces, with branches for separate departments.",
      "A long-established product with a large customer base.",
    ],
    strongerUs: [
      "A public-facing branded academy site with a page designer, not only an internal training portal.",
      "Courses drafted from a brief, with a slide deck and exercise sheet per lesson.",
      "Lets an academy charge for its courses by linking to its own payment page, which TalentLMS does not appear to offer.",
    ],
    chooseThem: "you are training a large workforce and need single sign-on, HR integrations, branches and formal compliance reporting.",
    chooseUs: "you are a trainer, charity, association or small training firm that wants a branded academy open to the public, built quickly.",
  },
];

export function comparisonBySlug(slug: string): Comparison | undefined {
  return COMPARISONS.find((c) => c.slug === slug);
}
