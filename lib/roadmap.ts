// The public "What's new and coming next" page (/roadmap).
//
// Edit this file to change the page. Rules: list only what is genuinely live under "shipped", and keep "planned" honest: it is
// a list of intentions, not promises, and the page says so. Dates are months, not days, so nothing reads as a commitment.

export interface RoadmapItem {
  title: string;
  detail: string;
}
export interface RoadmapGroup {
  when: string;
  items: RoadmapItem[];
}

export const SHIPPED: RoadmapGroup[] = [
  {
    when: "November 2026",
    items: [
      { title: "Free trial that carries into checkout", detail: "Subscribe during your trial and your card is saved, but nothing is charged until the trial ends." },
      { title: "Terms & Conditions and privacy notice", detail: "Terms are accepted as the last step of creating an academy, and a public privacy notice explains how personal data is handled." },
      { title: "Portuguese", detail: "Create and run an academy in Portuguese, alongside English, Spanish, German and French." },
      { title: "Security hardening", detail: "Sign-in limits, sessions that end when an account is switched off, stronger page protections and safer password-reset links." },
      { title: "Faster moving around the admin area", detail: "Pages no longer load in the background, and a loading bar shows when a page is on its way." },
    ],
  },
  {
    when: "October 2026",
    items: [
      { title: "A PowerPoint and Word exercises for every lesson", detail: "When the AI builds your academy, each lesson comes with a slide deck and a matching exercise sheet." },
    ],
  },
  {
    when: "Earlier in 2026",
    items: [
      { title: "Content agent", detail: "An AI assistant proposes improvements and new lessons for your courses; nothing changes until you approve it." },
      { title: "AI academy builder", detail: "Describe your academy once and get courses, modules and pages drafted for you." },
      { title: "Page designer and branding", detail: "Design your academy site, choose colours and logo, and publish with version history." },
      { title: "Learning journeys, certificates and analytics", detail: "Group courses into paths, issue completion certificates and see how learners are doing." },
      { title: "SCORM, quizzes, assignments, polls and forums", detail: "Interactive activities inside your courses, plus live-session links for Zoom and Teams." },
      { title: "Complimentary academies", detail: "The platform team can grant free access, for a period or without an end date, for partners and pilots." },
    ],
  },
];

export const PLANNED: RoadmapItem[] = [
  { title: "Quiz agent", detail: "Have the AI draft quizzes for a course, for you to review and publish." },
  { title: "Learner progress nudges", detail: "Gentle reminder emails to learners who have stalled, always approved by the academy before they are sent." },
  { title: "Learner tutor chat", detail: "A learner-facing assistant that answers questions about the course material." },
  { title: "Learner terms and privacy pages for each academy", detail: "Ready-made pages an academy can publish for its own learners." },
];
