// Terms & Conditions for creating and running an academy on SkillsAcademy.ai (England and Wales law).
//
// This is a DRAFT written for the platform owner to complete and have a solicitor review before relying on it. The company
// details come from environment variables; until they are set the text shows clearly marked placeholders and the Super Admin
// System check page says so.
//
//   TERMS_COMPANY_NAME     e.g. "Esse Systems Ltd"
//   TERMS_COMPANY_NUMBER   Companies House number
//   TERMS_COMPANY_ADDRESS  registered office
//   TERMS_CONTACT_EMAIL    where notices and data-protection requests go
//   TERMS_EFFECTIVE_DATE   optional, defaults to the date below
//
// When the wording changes, change TERMS_VERSION too: the version each academy accepted is stored with it.

export const TERMS_VERSION = "1.0";
const DEFAULT_EFFECTIVE_DATE = "23 November 2026";

export const PLACEHOLDER = {
  name: "[Company name]",
  number: "[Company number]",
  address: "[Registered office address]",
  email: "[Contact email]",
};

export interface TermsCompany {
  name: string;
  number: string;
  address: string;
  email: string;
  effectiveDate: string;
  /** False while any company detail is still a placeholder. */
  complete: boolean;
}

export function termsCompany(env: Record<string, string | undefined> = process.env): TermsCompany {
  const pick = (v: string | undefined, fallback: string) => (v && v.trim() ? v.trim() : fallback);
  const name = pick(env.TERMS_COMPANY_NAME, PLACEHOLDER.name);
  const number = pick(env.TERMS_COMPANY_NUMBER, PLACEHOLDER.number);
  const address = pick(env.TERMS_COMPANY_ADDRESS, PLACEHOLDER.address);
  const email = pick(env.TERMS_CONTACT_EMAIL, PLACEHOLDER.email);
  return {
    name,
    number,
    address,
    email,
    effectiveDate: pick(env.TERMS_EFFECTIVE_DATE, DEFAULT_EFFECTIVE_DATE),
    complete: name !== PLACEHOLDER.name && number !== PLACEHOLDER.number && address !== PLACEHOLDER.address && email !== PLACEHOLDER.email,
  };
}

export type TermsBlock = string | { list: string[] };
export interface TermsSection {
  id: string;
  title: string;
  blocks: TermsBlock[];
}

export function termsSections(c: TermsCompany = termsCompany()): TermsSection[] {
  return [
    {
      id: "about",
      title: "1. About these terms",
      blocks: [
        `These terms are an agreement between ${c.name}, a company registered in England and Wales (company number ${c.number}) whose registered office is at ${c.address} ("we", "us", "SkillsAcademy.ai"), and the organisation that creates an academy on our platform ("you", "the Customer").`,
        "SkillsAcademy.ai is an \"academy-as-a-service\" platform. It lets an organisation run its own branded online academy at skillacademies.ai: courses, modules, learners, instructors, certificates, analytics and, where you choose to use them, AI features that help you draft content.",
        "By ticking the box when you create an academy, or by using your academy, you agree to these terms on behalf of your organisation and confirm you have authority to do so. If you do not agree, do not create an academy.",
        "The platform is for organisations acting for business, charitable or public-sector purposes. It is not offered to consumers, and you must be at least 18 to create an academy.",
        {
          list: [
            "\"Academy\" means the online academy created for you on the platform, including its web address.",
            "\"Academy Admin\" means a person you authorise to administer the Academy, \"Instructor\" a person who creates or runs courses, and \"Learner\" a person who takes courses in the Academy. Together they are \"Users\".",
            "\"Customer Content\" means everything you or your Users put into the Academy: courses, modules, files, videos, quizzes, text, images, logos, learner records and any other material.",
            "\"Plan\" means the subscription plan you choose, with the limits and features shown when you choose it.",
          ],
        },
      ],
    },
    {
      id: "service",
      title: "2. The service",
      blocks: [
        "We will provide the platform and your Academy with reasonable skill and care. We may improve, change or remove features over time. If we make a change that materially reduces what your Plan includes, we will tell you in advance.",
        "We work to keep the platform available but do not promise it will be uninterrupted or error free. We may suspend it briefly for maintenance, security or to meet legal requirements. We will give notice of planned maintenance where we reasonably can.",
        "Each Academy is kept separate from other academies on the platform. Your Academy's web address is chosen at sign-up; we may refuse or change an address that is misleading, infringes someone's rights or impersonates another organisation.",
        "If you connect your own domain name to your Academy, you are responsible for owning that domain and keeping its settings correct.",
      ],
    },
    {
      id: "accounts",
      title: "3. Accounts and your Users",
      blocks: [
        "You must give accurate information when you create your Academy and keep it up to date. The person who creates the Academy becomes its first Academy Admin.",
        "You are responsible for everything done through your Academy, including by your Academy Admins, Instructors and Learners. You must keep sign-in details confidential, tell us promptly if you think an account has been compromised, and remove access for people who should no longer have it.",
        "Your Plan may limit the number of learners, instructors or courses. We may stop new accounts being added once a limit is reached.",
      ],
    },
    {
      id: "fees",
      title: "4. Plans, free trials and fees",
      blocks: [
        "The Plans, their prices and any free trial are shown on our website when you choose a Plan. A free trial lasts for the period shown for that Plan. Prices are shown exclusive of VAT unless stated otherwise, and VAT is added where it applies.",
        "Fees for a paid Plan are taken when you subscribe through our checkout, which is run by our payment provider, Stripe, and then renew automatically each billing period until you cancel. We do not store your full card details.",
        "We may change our prices or Plans. We will give you at least 30 days' notice of a price increase that affects you, and you may cancel before it takes effect.",
        "If a payment fails we may ask you to update your payment details and, if it remains unpaid, suspend or restrict the Academy until it is paid.",
        "We may, at our discretion, give an Academy complimentary access for a set period or without an end date. Complimentary access is a courtesy, carries no payment obligation while it lasts, and we may end it by giving you reasonable notice.",
        "Except where the law requires otherwise, fees already paid are not refundable.",
      ],
    },
    {
      id: "cancel",
      title: "5. Cancelling and ending the agreement",
      blocks: [
        "You can cancel at any time from the Billing area of your Academy's admin pages. When you ask to cancel, renewal payments are switched off straight away. We do not refund the current paid period. After a cancellation request your Academy is taken offline and archived, which currently happens about 24 hours later. Until then you can withdraw the request.",
        "We may suspend or end your Academy if you materially breach these terms and do not fix the problem within a reasonable time after we ask; immediately if you seriously breach them or your use is unlawful or puts the platform, other customers or other people at risk; or if you fail to pay. Where it is reasonable and lawful, we will tell you first.",
        "When the agreement ends, your right to use the platform ends. On your written request we will delete or return your Customer Content within a reasonable period, unless the law requires us to keep it. Learner certificates and records are Customer Content: export what you need before you cancel.",
        "Sections that by their nature should continue (including liability, data protection, intellectual property and governing law) continue after the agreement ends.",
      ],
    },
    {
      id: "content",
      title: "6. Your content and our intellectual property",
      blocks: [
        "You own your Customer Content. You give us a non-exclusive, worldwide licence to host, copy, display and process it only as needed to run the platform for you, keep it secure and backed up, and provide support.",
        "You confirm that you have all rights and permissions needed for your Customer Content, and that it, and our use of it as described here, does not infringe anyone's rights or break the law. This includes the rights in any course material, music, video, images, SCORM packages and third-party content you upload or link to.",
        "We and our licensors own the platform, its software, design and brand. These terms give you only the right to use the platform while the agreement lasts. You may not copy it, reverse engineer it, resell it or use it to build a competing service, except to the extent the law allows.",
        "If you give us feedback or ideas for improving the platform, we may use them freely.",
      ],
    },
    {
      id: "use",
      title: "7. Acceptable use",
      blocks: [
        "You must use the platform lawfully and responsibly. You must not, and must not allow your Users to:",
        {
          list: [
            "upload or share anything unlawful, defamatory, discriminatory, abusive, harassing, obscene or that promotes violence or terrorism;",
            "infringe copyright, trade marks, privacy or other rights, or impersonate any person or organisation;",
            "upload malware, or SCORM packages or other files designed to harm, track or attack users, the platform or other customers;",
            "attempt to access another academy's data, probe or test the platform's security without our written permission, or overload or disrupt it;",
            "send spam or use the platform's email features for anything other than genuine communication with your own Users;",
            "collect or process the personal data of children without the lawful basis, safeguards and parental permissions the law requires;",
            "use the platform to provide training that is itself unlawful, or to issue certificates that falsely claim recognition by a regulator or awarding body.",
          ],
        },
        "We may remove content or suspend access if we reasonably believe these rules have been broken, and we may report unlawful activity to the authorities.",
      ],
    },
    {
      id: "ai",
      title: "8. AI features",
      blocks: [
        "The platform includes optional features that use artificial intelligence, for example to suggest an academy plan, draft course and module content, build files such as slides, answer help questions and suggest changes to your content.",
        "AI output is a draft. It may be inaccurate, incomplete, out of date or similar to other output. You are responsible for reviewing and approving anything before it is published to your Learners, and for checking that it is suitable, accurate and lawful for your purpose. Suggested changes to existing content are presented for your approval and are not applied automatically.",
        "To produce AI output we send the text you provide, and relevant course or academy information, to our AI provider, which processes it on our behalf. Do not put special category data (such as health information), unnecessary personal data, passwords or confidential third-party material into AI prompts.",
        "AI features may be limited each month according to your Plan.",
        "AI output may not be protected by intellectual property rights in every case, and we do not promise that it is original.",
      ],
    },
    {
      id: "payments",
      title: "9. Payments from your Learners",
      blocks: [
        "The platform does not take payments from your Learners for your courses. If you charge for a course you do so on your own website or payment system, and the platform can show a link to it. You are the seller to your Learners.",
        "You are responsible for your prices, refunds, tax, consumer-law information and any other legal obligations to your Learners.",
      ],
    },
    {
      id: "data",
      title: "10. Personal data",
      blocks: [
        "Each of us must comply with the UK GDPR and the Data Protection Act 2018 (together, \"Data Protection Law\"). The two roles below are how we expect the law to apply:",
        {
          list: [
            "For the personal data of your Learners, Instructors and other Users that you put into or collect through your Academy (\"Academy Data\"), you are the controller and we are your processor.",
            "For the account details of the people who sign up your Academy, billing details and how you use the platform, we are a controller. We use that data to provide the service, take payment, keep the platform secure, give support and meet our legal obligations, as described in our privacy notice.",
          ],
        },
        "As your processor we will: process Academy Data only on your documented instructions, which are these terms and your use of the platform's features; make sure everyone who has access to it is bound by confidentiality; keep appropriate technical and organisational security measures; help you respond to requests from individuals and to meet your security, breach-notification and impact-assessment duties, taking account of the nature of the processing; tell you without undue delay after becoming aware of a personal data breach affecting Academy Data; delete or return Academy Data when the agreement ends, as set out in section 5; and make available the information needed to show we comply with this section, allowing for reasonable audits on notice, no more than once a year unless there has been a breach.",
        "You agree that we may use sub-processors to run the platform. At the date of these terms they are: Netlify (website hosting and file storage), our database hosting provider, Stripe (subscription payments), Resend (transactional email) and Anthropic (AI features). We will bind each of them to terms that give equivalent protection and remain responsible for them. We will tell you before adding or replacing a sub-processor so you can object on reasonable data-protection grounds.",
        "Some sub-processors may process data outside the UK. Where they do, we use the transfer safeguards Data Protection Law allows, such as an adequacy decision or approved standard contractual clauses.",
        "You must have a lawful basis and give your Learners and Users a clear privacy notice for the data you collect through your Academy, and you must not ask the platform to process data for purposes you are not entitled to pursue.",
        `For data-protection questions or to exercise your rights, contact ${c.email}.`,
      ],
    },
    {
      id: "security",
      title: "11. Security",
      blocks: [
        "We use reasonable technical and organisational measures to protect the platform and your data, including access controls, encrypted connections, hashed passwords and separation between academies. No system is completely secure, and you must do your part: use strong passwords, limit who is an Academy Admin, and keep your own devices and email accounts safe.",
        "If you find a security problem, please tell us promptly at the contact address below and do not exploit it.",
      ],
    },
    {
      id: "warranty",
      title: "12. Warranties and what we do not promise",
      blocks: [
        "We do not promise that the platform will meet all your requirements, be free of faults, or that the results of AI features, analytics, certificates or reports are accurate or fit for a particular purpose. Certificates issued by your Academy are issued by you, not by us, and we do not accredit your courses.",
        "To the extent the law allows, all warranties and terms not set out in these terms are excluded.",
      ],
    },
    {
      id: "liability",
      title: "13. Liability",
      blocks: [
        "Nothing in these terms limits or excludes liability for death or personal injury caused by negligence, for fraud or fraudulent misrepresentation, or for anything else that cannot lawfully be limited or excluded.",
        "Subject to that, we are not liable to you, under or in connection with these terms, whether in contract, tort (including negligence), breach of statutory duty or otherwise, for: loss of profit, revenue, goodwill or anticipated savings; loss or corruption of data (except as our obligations as your processor require); or any indirect or consequential loss.",
        "Subject again to the first paragraph, our total liability to you for all claims arising in any 12-month period is limited to the fees you paid us for the platform in the 12 months before the first event giving rise to the claim.",
        "You are responsible for your Customer Content and your Users' conduct. You will compensate us for losses, damages and reasonable costs we suffer as a result of a third-party claim that your Customer Content, or the way you use the platform in breach of these terms, is unlawful or infringes someone's rights. We will tell you promptly of any such claim, let you control its defence (we may take part at our own cost) and not settle it without your agreement, which you will not unreasonably withhold.",
      ],
    },
    {
      id: "changes",
      title: "14. Changes to these terms",
      blocks: [
        "We may update these terms, for example when the law, the platform or our practices change. We will tell the Academy Admin by email or in the platform, normally at least 30 days before the change takes effect for existing Academies. If you do not agree to a change you may cancel before it takes effect; continuing to use the platform afterwards means you accept it. We record the version of the terms you accepted when you created your Academy.",
      ],
    },
    {
      id: "general",
      title: "15. General",
      blocks: [
        "Confidentiality. Each of us will keep the other's confidential information confidential and use it only for this agreement, except where disclosure is required by law or it is already public through no fault of ours.",
        "Entire agreement. These terms, together with the Plan details shown when you chose your Plan and our privacy notice, are the whole agreement between us about the platform and replace anything said or written before.",
        "Notices. We may give you notice by email to your Academy Admin or contact email, or through the platform. You can contact us using the details at the end of these terms.",
        "Events outside our control. Neither of us is liable for a delay or failure caused by events beyond our reasonable control, other than a failure to pay.",
        "Assignment and subcontracting. You may not transfer your rights under these terms without our written consent. We may transfer ours to a successor of our business and may use subcontractors, remaining responsible for them.",
        "Waiver and severability. If we do not enforce a right straight away that is not a waiver of it. If any part of these terms is found unenforceable, the rest continues.",
        "Third parties. Only you and we have rights under these terms; nobody else may enforce them under the Contracts (Rights of Third Parties) Act 1999.",
      ],
    },
    {
      id: "law",
      title: "16. Governing law and courts",
      blocks: [
        "These terms and any dispute or claim arising from them (including non-contractual disputes) are governed by the law of England and Wales. The courts of England and Wales have exclusive jurisdiction, except that either of us may seek urgent relief from any court that has jurisdiction.",
      ],
    },
    {
      id: "contact",
      title: "17. Contact us",
      blocks: [
        `${c.name}, company number ${c.number}. Registered office: ${c.address}. Email: ${c.email}. Website: skillacademies.ai.`,
      ],
    },
  ];
}

/** Plain text of the whole terms, used by tests and for a stable record of what was shown. */
export function termsPlainText(c: TermsCompany = termsCompany()): string {
  return termsSections(c)
    .map((s) => [s.title, ...s.blocks.map((b) => (typeof b === "string" ? b : b.list.map((l) => `- ${l}`).join("\n")))].join("\n"))
    .join("\n\n");
}
