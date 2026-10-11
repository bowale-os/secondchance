/**
 * Common Help topics for the Learn tab. To add a topic, add an entry here; no backend change needed.
 * Keep `last_checked` up to date when you open a link and confirm it still works.
 */
import type { HelpSection, HelpTopic } from "../types/help.types";
import type { RequiredDocument } from "../types/resource.types";

export const HELP_SECTIONS: { section: HelpSection; label: string }[] = [
  { section: "getting_started", label: "Getting started" },
  { section: "work_school", label: "Work and school" },
  { section: "wellbeing", label: "Wellbeing" },
];

const CHECKED = "2026-10-10";

export const HELP_TOPICS: HelpTopic[] = [
  // ---------- Getting started ----------
  {
    id: "get-id",
    section: "getting_started",
    title: { en: "How to get an ID" },
    summary: { en: "The papers you need to bring to get a Georgia ID card." },
    links: [
      {
        label: "Georgia ID checklist",
        url: "https://pop-bookstore.s3.amazonaws.com/opg-content/checklist/drivers/DEFAULT/id-cards/georgia.pdf",
        kind: "pdf",
        source: "DMV checklist",
        language: "en",
        last_checked: CHECKED,
      },
    ],
    related: { document: "photo_id" },
  },
  {
    id: "snap",
    section: "getting_started",
    title: { en: "How to apply for SNAP" },
    summary: { en: "Who qualifies for food benefits in Georgia and how to apply online, by phone, or in person." },
    links: [
      {
        label: "Apply for SNAP",
        url: "https://georgia.gov/apply-snap-supplemental-nutrition-assistance-program",
        kind: "official",
        source: "Georgia.gov",
        language: "en",
        last_checked: CHECKED,
      },
    ],
    // No filter for SNAP help alone, so search Food for "SNAP".
    related: { resourceFilter: { categories: ["food"], q: "SNAP" }, findLabel: "Find SNAP help nearby" },
  },
  {
    id: "marta",
    section: "getting_started",
    title: { en: "How to use MARTA" },
    summary: { en: "How to pay your fare, read the maps, and ride trains and buses in Atlanta." },
    links: [
      {
        label: "MARTA New Rider Guide",
        url: "https://itsmarta.com/ride/customer-service/new-rider-guide",
        kind: "official",
        source: "MARTA",
        language: "en",
        last_checked: CHECKED,
      },
    ],
  },

  // ---------- Work and school ----------
  {
    id: "job-application",
    section: "work_school",
    title: { en: "How to fill out an online job application" },
    summary: { en: "What each part of a job application asks for and how to answer it." },
    links: [
      {
        label: "How to Fill Out an Application",
        url: "https://www.indeed.com/career-advice/finding-a-job/how-to-fill-out-an-application",
        kind: "article",
        source: "Indeed",
        language: "en",
        last_checked: CHECKED,
      },
    ],
  },
  {
    id: "education",
    section: "work_school",
    title: { en: "Ways to further your education" },
    summary: { en: "Options for going back to school, earning a certificate, or learning new skills." },
    links: [
      {
        label: "5 Ways to Further My Education in 2026",
        url: "https://www.furtheringmyeducation.com/articles/5-ways-to-further-my-education-in-2026",
        kind: "article",
        source: "FurtheringMyEducation",
        language: "en",
        last_checked: CHECKED,
      },
    ],
  },

  // ---------- Wellbeing ----------
  {
    id: "eat-healthy",
    section: "wellbeing",
    title: { en: "How to eat healthy on a budget" },
    summary: { en: "Simple tips for planning meals and buying healthy food for less." },
    links: [
      {
        label: "6 Tips for Eating Healthy on a Budget",
        url: "https://www.cdc.gov/diabetes/healthy-eating/6-tips-eating-healthy-on-budget.html",
        kind: "official",
        source: "CDC",
        language: "en",
        last_checked: CHECKED,
      },
    ],
  },
  {
    id: "stress",
    section: "wellbeing",
    title: { en: "Simple ways to reduce stress" },
    summary: { en: "Everyday things you can do to feel calmer when life gets hard." },
    links: [
      {
        label: "10 Simple Ways to Cope With Stress",
        url: "https://www.sutterhealth.org/health/10-simple-ways-to-cope-with-stress",
        kind: "article",
        source: "Sutter Health",
        language: "en",
        last_checked: CHECKED,
      },
    ],
  },
  {
    id: "community",
    section: "wellbeing",
    title: { en: "How to reach out to your community" },
    summary: { en: "Ways to meet people, get involved, and build support around you." },
    links: [
      {
        label: "Stay Connected To Your Community",
        url: "https://relationshipsmag.com/stay-connected-to-your-community/",
        kind: "article",
        source: "Relationships Magazine",
        language: "en",
        last_checked: CHECKED,
      },
    ],
  },
];

export function helpTopic(id: string): HelpTopic | undefined {
  return HELP_TOPICS.find((t) => t.id === id);
}

/** The guide for getting a document, e.g. "How to get an ID" for photo_id. */
export function helpForDocument(document: RequiredDocument): HelpTopic | undefined {
  return HELP_TOPICS.find((t) => t.related?.document === document);
}
