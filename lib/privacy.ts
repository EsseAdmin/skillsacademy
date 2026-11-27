// Privacy notice for SkillsAcademy.ai: how the platform uses the personal data it is responsible for (England and Wales / UK GDPR).
//
// This is a DRAFT for the platform owner to complete and have a solicitor review. It covers the data the platform itself decides
// how to use (the people who sign up and run academies, billing details, security and usage records, enquiries). The personal data of an academy's
// own learners belongs to that academy, which is its controller; the platform only processes it for the academy (see the Terms, section 10).
// Company details reuse the TERMS_* environment variables, so they are set once.

import { termsCompany, type TermsCompany, type TermsSection } from "@/lib/terms";

export const PRIVACY_VERSION = "1.0";

export function privacySections(c: TermsCompany = termsCompany()): TermsSection[] {
  return [
    {
      id: "who",
      title: "1. Who we are",
      blocks: [
        `${c.name}, company number ${c.number}, registered office ${c.address}, runs SkillsAcademy.ai (\"we\", \"us\"). We are the controller of the personal data described in this notice. You can contact us about it at ${c.email}.`,
        "This notice is for people who visit our website, sign up an academy, run an academy (Academy Admins) or contact us. If you are a learner or instructor inside someone else's academy, that academy decides what is collected about you and why, and is responsible for it. We act for the academy and only follow its instructions. Please read that academy's own privacy information and send your requests to it first.",
      ],
    },
    {
      id: "collect",
      title: "2. What we collect",
      blocks: [
        {
          list: [
            "Account details: your name, email address and password (stored only as a one-way hash), your role, and your academy's name, address on the platform and branding.",
            "Billing details: the plan you choose, payment status and invoice history. Card numbers are entered on Stripe's secure pages and are never seen or stored by us.",
            "Terms acceptance: the version of our terms you accepted, when, and by whom.",
            "Usage and security records: sign-in times, the IP address and device details used for sign-in, failed sign-in attempts, error logs and actions taken in the admin area, used to keep the platform secure and working.",
            "Content you give us for AI features: the descriptions, files and instructions you submit when you ask the platform to generate courses, lessons or pages.",
            "Messages: what you send us when you ask for help or write to us, and our replies.",
            "Cookies: we set one essential cookie to keep you signed in. We do not use advertising or tracking cookies.",
          ],
        },
      ],
    },
    {
      id: "why",
      title: "3. Why we use it and our lawful basis",
      blocks: [
        {
          list: [
            "To create and run your academy and provide the service you asked for: performance of our contract with you.",
            "To take payment, keep invoices and meet tax and accounting rules: performance of our contract and our legal obligations.",
            "To keep the platform secure, prevent fraud and abuse, limit repeated sign-in attempts, fix faults and improve the service: our legitimate interests in running a safe and reliable platform.",
            "To send you service messages such as verification, password reset, billing and cancellation emails: performance of our contract and our legitimate interests.",
            "To send you news or marketing about SkillsAcademy.ai: your consent, or our legitimate interests where the law allows it. You can opt out at any time.",
            "To respond to your questions and requests, and to establish or defend legal claims: our legitimate interests and our legal obligations.",
          ],
        },
      ],
    },
    {
      id: "share",
      title: "4. Who we share it with",
      blocks: [
        "We do not sell personal data. We share it only with the companies that help us run the platform, each under a contract that limits what they can do with it:",
        {
          list: [
            "Netlify: website hosting, file storage and scheduled tasks.",
            "Our database hosting provider: storing the platform's data.",
            "Stripe: taking and managing subscription payments.",
            "Resend: sending service emails.",
            "Anthropic: powering the AI features, which receive the content you submit when you use them.",
          ],
        },
        "We may also share information where the law requires it, with our professional advisers, or as part of a sale or reorganisation of the business, in which case the new owner must protect it under this notice.",
      ],
    },
    {
      id: "transfers",
      title: "5. Transfers outside the UK",
      blocks: [
        "Some of the companies above handle data outside the UK. Where they do, we rely on a UK adequacy decision or on approved standard contractual clauses, so your data keeps an equivalent level of protection.",
      ],
    },
    {
      id: "keep",
      title: "6. How long we keep it",
      blocks: [
        "We keep personal data only for as long as we need it for the reasons above.",
        {
          list: [
            "Account and academy data: while your academy exists. If an academy is cancelled it is archived and then deleted or returned on request, as described in our terms.",
            "Billing and invoice records: for the period tax and company law require, generally six years.",
            "Security and error logs: for a short rolling period, unless needed to investigate a problem.",
            "Messages and enquiries: for as long as needed to deal with them and a reasonable time afterwards.",
          ],
        },
      ],
    },
    {
      id: "rights",
      title: "7. Your rights",
      blocks: [
        "You can ask us to give you a copy of your personal data, correct it, delete it, restrict or object to how we use it, or move it to another provider. Where we rely on your consent you can withdraw it at any time. Contact us at the address below and we will reply within one month. We may need to check who you are first.",
        "If you are unhappy with how we handled your data, please tell us so we can put it right. You also have the right to complain to the Information Commissioner's Office at ico.org.uk.",
      ],
    },
    {
      id: "security",
      title: "8. Keeping data safe",
      blocks: [
        "We use encrypted connections, hashed passwords, access controls, sign-in limits and separation between academies. No system is completely secure. If a breach puts your rights at risk we will tell you and the regulator as the law requires.",
      ],
    },
    {
      id: "children",
      title: "9. Children",
      blocks: [
        "SkillsAcademy.ai is for organisations. We do not knowingly collect personal data from children through our own website or sign-up. An academy that enrols children is responsible for doing so lawfully and for its own notices and consents.",
      ],
    },
    {
      id: "changes",
      title: "10. Changes to this notice",
      blocks: [
        "We may update this notice. The date at the top shows when it last changed, and we will tell Academy Admins about important changes.",
      ],
    },
    {
      id: "contact",
      title: "11. Contact",
      blocks: [`${c.name}, ${c.address}. Email: ${c.email}.`],
    },
  ];
}

export function privacyPlainText(c: TermsCompany = termsCompany()): string {
  return privacySections(c)
    .map((s) => [s.title, ...s.blocks.map((b) => (typeof b === "string" ? b : b.list.map((i) => "- " + i).join("\n")))].join("\n"))
    .join("\n\n");
}
