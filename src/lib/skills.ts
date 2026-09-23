/**
 * The skills a person can add to their profile.
 *
 * Skills were free text, so "abc" went onto a profile as readily as "Figma" and skill search stopped being
 * trustworthy. New skills are now picked from this list (matched without regard to case, spaces or dots,
 * and stored in the spelling below). Skills already on a profile are left exactly as they are — nothing is
 * removed from anybody. Missing something real? Add it here; it is one line.
 *
 * Plain data, no React or Supabase — safe to import anywhere.
 */
export const SKILL_CATALOG: string[] = [
  // Software & data
  "JavaScript", "TypeScript", "React", "Next.js", "Node.js", "Vue.js", "Angular", "HTML", "CSS", "Tailwind CSS",
  "Python", "Java", "Kotlin", "Swift", "C", "C++", "C#", ".NET", "Go", "Rust", "PHP", "Laravel", "Ruby", "Ruby on Rails",
  "Django", "Flask", "FastAPI", "Spring Boot", "Flutter", "React Native", "Android development", "iOS development",
  "SQL", "PostgreSQL", "MySQL", "MongoDB", "Redis", "Supabase", "Firebase", "GraphQL", "REST APIs",
  "AWS", "Azure", "Google Cloud", "Docker", "Kubernetes", "Terraform", "CI/CD", "Git", "Linux", "DevOps",
  "Netlify", "Vercel", "Microservices", "System design", "Software architecture", "Unit testing", "Test automation",
  "Manual testing", "QA", "Selenium", "Cypress", "Playwright", "Performance testing", "Security testing",
  "Cybersecurity", "Network administration", "IT support", "Hardware troubleshooting", "Active Directory",
  "Microsoft 365 administration", "Google Workspace administration", "Data analysis", "Data engineering",
  "Data visualisation", "Power BI", "Tableau", "Looker Studio", "Excel", "Advanced Excel", "Google Sheets",
  "Machine learning", "Deep learning", "Natural language processing", "Computer vision", "Prompt engineering",
  "Generative AI", "Statistics", "R", "Pandas", "ETL", "Data modelling", "Web scraping", "Automation", "Zapier",
  "WordPress", "Shopify", "Webflow", "SEO", "Technical SEO", "Web accessibility",

  // Design & content
  "Figma", "Adobe XD", "Sketch", "UI design", "UX design", "UX research", "Wireframing", "Prototyping",
  "Design systems", "Interaction design", "Graphic design", "Brand design", "Illustration", "Typography",
  "Motion graphics", "Video editing", "Photography", "Photo editing", "3D modelling", "Animation",
  "Adobe Photoshop", "Adobe Illustrator", "Adobe InDesign", "Adobe Premiere Pro", "Adobe After Effects",
  "Canva", "CorelDRAW", "Blender", "DaVinci Resolve", "Final Cut Pro",
  "Copywriting", "Content writing", "Technical writing", "Editing", "Proofreading", "Blogging", "Scriptwriting",
  "Storytelling", "Content strategy", "Social media management", "Community management", "Presentation design",
  "Investor decks", "Translation",

  // Product & project
  "Product management", "Product strategy", "Product roadmapping", "User stories", "Requirements gathering",
  "Business analysis", "Project management", "Program management", "Agile", "Scrum", "Kanban", "Jira",
  "Stakeholder management", "Risk management", "Change management", "Process improvement", "Lean", "Six Sigma",
  "Documentation", "SOP writing", "Quality management", "ISO standards",

  // Sales, marketing & customers
  "Sales", "B2B sales", "B2C sales", "Inside sales", "Field sales", "Lead generation", "Cold calling",
  "Negotiation", "Key account management", "Business development", "Partnerships", "CRM", "Salesforce",
  "HubSpot", "Zoho CRM", "Pre-sales", "Proposal writing", "Tendering", "Customer success", "Customer support",
  "Customer service", "Client relationship management", "Complaint handling", "Retention", "Upselling",
  "Digital marketing", "Performance marketing", "Google Ads", "Meta Ads", "LinkedIn Ads", "Email marketing",
  "Marketing automation", "Growth marketing", "Brand management", "Public relations", "Event management",
  "Market research", "Competitive analysis", "Influencer marketing", "Affiliate marketing", "Google Analytics",
  "Conversion rate optimisation", "Product marketing",

  // Finance, legal & admin
  "Accounting", "Bookkeeping", "Tally", "Tally Prime", "Zoho Books", "QuickBooks", "SAP", "SAP FICO",
  "GST filing", "TDS", "Income tax", "Payroll", "Accounts payable", "Accounts receivable", "Reconciliation",
  "Financial analysis", "Financial modelling", "Budgeting", "Forecasting", "Costing", "Audit", "Internal audit",
  "Taxation", "Treasury", "Invoicing", "MIS reporting", "Fundraising", "Investor relations", "Valuation",
  "Compliance", "Company secretarial", "Contract drafting", "Contract management", "Legal research",
  "Intellectual property", "Data privacy", "Procurement", "Vendor management", "Purchasing", "Office administration",
  "Facilities management", "Front office", "Data entry", "Record keeping",

  // People
  "Recruitment", "Talent acquisition", "Interviewing", "Onboarding", "HR operations", "HR policies",
  "Employee relations", "Performance management", "Compensation and benefits", "Learning and development",
  "Training delivery", "Coaching", "Mentoring", "Employer branding", "HRMS", "Labour law", "Payroll compliance",

  // Operations
  "Operations management", "Supply chain", "Logistics", "Inventory management", "Warehouse management",
  "Dispatch", "Production planning", "Manufacturing", "Quality control", "Health and safety", "Fleet management",
  "Field operations", "Customer onboarding", "Scheduling", "Real estate", "Site supervision", "AutoCAD",
  "Civil engineering", "Mechanical engineering", "Electrical engineering",

  // Leadership & ways of working
  "Leadership", "Team management", "People management", "Strategic planning", "Decision making",
  "Problem solving", "Critical thinking", "Communication", "Public speaking", "Presentation skills",
  "Business writing", "Time management", "Prioritisation", "Collaboration", "Cross-functional coordination",
  "Conflict resolution", "Facilitation", "Research", "Attention to detail", "Customer empathy", "Crisis management",

  // Languages
  "English", "Hindi", "Tamil", "Telugu", "Kannada", "Malayalam", "Marathi", "Bengali", "Gujarati", "Punjabi",
  "Urdu", "Odia", "Arabic", "French", "German", "Spanish", "Japanese", "Mandarin",
];

/** Compare skills by letters, digits, + and # only: "node js", "NodeJS" and "Node.js" are the same skill. */
export function skillMatchKey(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9+#]/g, "");
}

const BY_KEY = new Map(SKILL_CATALOG.map((s) => [skillMatchKey(s), s]));

/** The catalogue spelling of a skill, or null when it is not in the list. */
export function canonicalSkill(input: string): string | null {
  const k = skillMatchKey(input.trim());
  return (k && BY_KEY.get(k)) || null;
}

export const SKILL_NOT_LISTED = "That isn't in the skills list — pick one of the suggestions. If a real skill is missing, ask HR to add it.";
