// The keyword map from sitestac-blog-keyword-strategy.md, as data.
// The seeder walks these round-robin so no two consecutive posts come from one
// cluster — but in ROTATION order, not cluster-id order, so the clusters that
// actually convert publish first.
//
// `pillarKeyword` is the head term the pillar owns. It is excluded from the
// supporting pool: without it, the pillar and a supporting post chase the same
// query and split their own authority. Omit it when the pillar is a broad hub
// with no single head term (cluster 5), and the pillar targets its title.
//
// `localVariants: true` marks the high-intent clusters that get city variants.
// Cluster 10 has no neutral keywords — it is templates only, so every cluster-10
// slot produces a location variant.

export const CLUSTERS = [
  {
    id: 1,
    name: "Do I even need a website?",
    pillar: "Does My Small Business Really Need a Website in 2026?",
    pillarKeyword: "do i need a website for my small business",
    keywords: [
      "is a facebook page enough for my business",
      "website vs google business profile do i need both",
      "can i run a business without a website",
      "why isn't my business showing up on google",
      "do customers still use websites or just social media",
      "is instagram enough for a small business",
    ],
  },
  {
    id: 2,
    name: "Cost & pricing",
    pillar: "How Much Does a Small Business Website Cost? (Real Numbers)",
    pillarKeyword: "how much does a website cost for a small business",
    localVariants: true,
    keywords: [
      "website design pricing small business",
      "monthly website cost vs one-time cost",
      "cheap website vs professional website what's the difference",
      "how much should i pay for a website",
      "website maintenance cost per month",
      "hidden costs of diy website builders",
    ],
  },
  {
    id: 3,
    name: "DIY vs hiring a pro",
    pillar: "Wix vs Squarespace vs Hiring a Web Designer: What's Right for Your Business?",
    pillarKeyword: "best website builder for small business",
    keywords: [
      "wix vs squarespace vs wordpress for small business",
      "should i build my own website or hire someone",
      "problems with diy website builders",
      "godaddy website builder honest review",
      "how long does it take to build a website",
      "can i move my wix site to another platform",
    ],
  },
  {
    id: 4,
    name: "Getting found on Google",
    pillar: "How to Get Your Business to Show Up on Google (Local SEO Basics)",
    pillarKeyword: "how to get my business on google",
    localVariants: true,
    keywords: [
      "how to rank on google maps",
      "google business profile setup guide",
      "local seo for small business",
      "how to get more google reviews",
      "why is my competitor above me on google",
      "seo for plumbers",
      "near me searches how to show up",
    ],
  },
  {
    id: 5,
    name: "Industry-specific",
    pillar: "Website Essentials for Local Service Businesses",
    localVariants: true,
    keywords: [
      "website for plumbing company what it needs",
      "hvac company website examples that get calls",
      "landscaping website design ideas",
      "roofing contractor website must-haves",
      "website for a small restaurant or food truck",
      "salon and barbershop website essentials",
      "auto repair shop website guide",
      "pressure washing business website",
      "general contractor website licensing portfolio trust signals",
    ],
  },
  {
    id: 6,
    name: "Leads & conversion",
    pillar: "How a Website Actually Gets You Customers (Not Just Compliments)",
    pillarKeyword: "how to get more customers online",
    keywords: [
      "does a website generate leads",
      "landing page vs website for small business",
      "best call to action for service businesses",
      "why visitors leave your website without calling",
      "contact form vs phone number what converts better",
      "how to track where your leads come from",
    ],
  },
  {
    id: 7,
    name: "Trust & credibility",
    pillar: "Why Customers Don't Call: The Trust Problem With Bad (or No) Websites",
    pillarKeyword: "what makes a website look trustworthy",
    keywords: [
      "does a website make my business look more professional",
      "outdated website hurting business",
      "before and after website redesign examples",
      "do customers check your website before calling",
    ],
  },
  {
    id: 8,
    name: "AI & the future of search",
    pillar: "Will AI Replace Websites? What ChatGPT and Google AI Mean for Your Business",
    pillarKeyword: "do websites still matter with ai search",
    keywords: [
      "how to get recommended by chatgpt",
      "google ai overviews small business impact",
      "seo vs ai search what changes",
      "how to optimize your website for ai answers",
    ],
  },
  {
    id: 9,
    name: "Basics & how-to",
    pillar: "Small Business Website 101: Everything You Need Before You Launch",
    pillarKeyword: "what pages does a website need",
    keywords: [
      "how to choose a domain name for my business",
      "what is web hosting explained simply",
      "how to write website content for my business",
      "mobile friendly website why it matters",
      "how fast should my website load",
      "website photos stock vs real photos",
    ],
  },
  {
    id: 10,
    name: "Location variants",
    localVariants: true,
    // No neutral keywords — these are templates the Location Variant Engine
    // fills from the locations table. {city} / {state} are substituted per row.
    templates: [
      "web design {city} {state_abbr}",
      "website designer near {city}",
      "plumber website design {city}",
      "small business website cost in {city}",
      "how to get your {city} business on google",
    ],
  },
];

// Publish order, highest commercial intent first. Cost and local-SEO lead
// because those are the searches that end in a phone call; "do I even need a
// website" is real traffic but the slowest to convert, so it waits.
export const ROTATION = [2, 4, 10, 5, 6, 3, 9, 1, 7, 8];

export const ORDERED_CLUSTERS = ROTATION.map((id) => CLUSTERS.find((c) => c.id === id));

export const CLUSTER_IDS = CLUSTERS.map((c) => c.id);

export const getCluster = (id) => CLUSTERS.find((c) => c.id === id);

export const fillTemplate = (template, location) =>
  template
    .replaceAll("{city}", location.city)
    .replaceAll("{state}", location.state)
    .replaceAll("{state_abbr}", location.state_abbr);

export const slugify = (text) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 80);
