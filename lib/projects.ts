export type FilterKey =
  | 'web'
  | 'ai'
  | 'fintech'
  | 'platform'
  | 'commerce'
  | 'community'
  | 'media'
  | 'education'
  | 'health';

export type ProjectStatus = 'live' | 'built';

export type ProjectLinks = { demo?: string; repo?: string };

export type Project = {
  slug: string;
  number: string;
  title: string;
  category: string;
  filters: FilterKey[];
  summary: string;
  stack: string[];
  color: string;
  year: string;
  status: ProjectStatus;
  /** Featured projects hold a physical station in the 3D world. */
  featured?: boolean;
  links?: ProjectLinks;
  role?: string;
  team?: string;
  problem?: string;
  direction?: string;
  decisions?: string[];
};

/** Clearly-labelled forks of other people's work, kept separate from original projects. */
export type Fork = {
  name: string;
  description: string;
  repo: string;
  demo?: string;
  language?: string;
};

export const projects: Project[] = [
  {
    slug: 'proofmesh', number: '01', title: 'ProofMesh', category: 'AI / trust infrastructure', filters: ['web', 'ai'],
    summary: 'A decentralized proof-of-skill platform exploring how AI can help verify real-world ability without reducing people to a score.',
    stack: ['Next.js', 'AI', 'Protocol design', 'TypeScript'], color: '#d8f851', year: '2026', status: 'live', featured: true,
    role: 'Product and engineering', team: 'Two collaborators',
    problem: 'Credentials are easy to collect and hard to trust.',
    direction: 'ProofMesh keeps the human claim visible before the technical mechanism: what is being verified, what evidence supports it, and where uncertainty remains.',
    decisions: ['Evidence before verdicts.', 'Explain confidence instead of hiding it behind a score.', 'Keep the system legible outside the AI and protocol world.'],
    links: { demo: 'https://proof-mesh.vercel.app' },
  },
  {
    slug: 'aureon', number: '02', title: 'Aureon', category: 'Institutional platform', filters: ['web', 'platform'],
    summary: 'An institutional operating system that gives a university one authoritative record of its people, programmes, results, fees, and library.',
    stack: ['Next.js', 'TypeScript', 'Platform design'], color: '#6de0dd', year: '2026', status: 'live',
    role: 'Product and engineering', team: 'Solo build',
    problem: 'Institutions read the same data differently, so operational truth fragments.',
    direction: 'Aureon models the institution as one role-aware, data-rich structure so every office reads the same record the same way.',
    decisions: ['One record, many role-aware views.', 'Design for administrators and students with equal weight.', 'Keep dense operational data legible.'],
    links: { demo: 'https://aureon-coral.vercel.app' },
  },
  {
    slug: 'africonnect', number: '03', title: 'AfriConnect', category: 'Culture / travel / commerce', filters: ['web', 'platform', 'commerce'],
    summary: 'A cultural-tourism platform connecting travellers to authentic African experiences and fairer revenue for local partners.',
    stack: ['Next.js', 'Prisma', 'TypeScript'], color: '#6de0dd', year: '2026', status: 'live', featured: true,
    role: 'Full-stack product', team: 'Two collaborators',
    problem: 'Travel discovery often hides the people and stories that make a place worth visiting.',
    direction: 'AfriConnect brings discovery, storytelling, partner visibility, and booking-adjacent flows into one product, backed by a flexible data model for experiences, people, and places.',
    decisions: ['Design for travellers and local partners.', 'Give cultural context the same visual weight as conversion.', 'Avoid forcing experiences, people, and places into one shape.'],
    links: { demo: 'https://afri-connect-tau.vercel.app' },
  },
  {
    slug: 'ummahconnect', number: '04', title: 'UmmahConnect', category: 'Community / platform', filters: ['web', 'community'],
    summary: 'A global professional network for Muslim professionals and creatives, built so faith and career are never in conflict.',
    stack: ['Next.js', 'TypeScript', 'Platform design'], color: '#ff7863', year: '2025', status: 'live', featured: true,
    role: 'Product engineering', team: 'Two collaborators',
    problem: 'Communities need more than a feed: they need shared context and reasons to return.',
    direction: 'UmmahConnect treats community as an active product system: identity, discovery, contribution, and values-aligned opportunity.',
    decisions: ['Prioritise useful connection over empty engagement.', 'Design for return visits, not a one-time sign-up.', 'Give the product a recognisable sense of place.'],
    links: { demo: 'https://ummah-connect-ochre.vercel.app' },
  },
  {
    slug: 'medcore', number: '05', title: 'MedCore', category: 'Healthcare / operations', filters: ['web', 'health', 'platform'],
    summary: 'A hospital management system for patient care, appointments, pharmacy, and billing, designed to reduce operational cognitive load.',
    stack: ['Next.js', 'TypeScript', 'UX systems'], color: '#a28cff', year: '2026', status: 'live', featured: true,
    role: 'Product and interface engineering', team: 'One collaborator',
    problem: 'Healthcare operations are already complex; the software should not add to it.',
    direction: 'MedCore explores calmer healthcare-management workflows through practical information hierarchy, clearer states, and a product language suited to operational decisions.',
    decisions: ['Give urgent and routine information different weight.', 'Use plain language for time-sensitive decisions.', 'Make operational software a tool, not an obstacle course.'],
    links: { demo: 'https://medcore1.vercel.app' },
  },
  {
    slug: 'bytebank', number: '06', title: 'byteBANK', category: 'Fintech / full stack', filters: ['web', 'fintech'],
    summary: 'A banking product split between a customer-facing application and dedicated backend services.',
    stack: ['Client app', 'Backend services', 'Team build'], color: '#ffb467', year: '2025', status: 'built', featured: true,
    role: 'Product engineering', team: 'Four frontend and three backend collaborators',
    problem: 'Financial products need reassurance, clarity, and dependable flows.',
    direction: 'byteBANK treats the customer interface and service layer as connected but distinct engineering problems — a clearer model for product boundaries and team collaboration.',
    decisions: ['Separate customer experience from service concerns.', 'Make state and language unambiguous where confidence matters.', 'Explain money movement; do not merely display it.'],
  },
  {
    slug: 'ybd-clothing', number: '07', title: 'YBD Clothing', category: 'Commerce / brand', filters: ['web', 'commerce'],
    summary: 'A Nigerian streetwear storefront for premium caps, tees, and jerseys — bold design with a fast, product-first shop experience.',
    stack: ['Next.js', 'TypeScript', 'Commerce'], color: '#ff7863', year: '2026', status: 'live',
    role: 'Product and engineering', team: 'Solo build',
    direction: 'YBD Clothing pairs a strong visual identity with a straightforward browsing and purchase path.',
    links: { demo: 'https://ybdclothing.vercel.app' },
  },
  {
    slug: 'vault', number: '08', title: 'Vault', category: 'Fintech / private banking', filters: ['web', 'fintech'],
    summary: 'A private-banking interface for multi-currency accounts, instant transfers, and cards, framed around trust and clarity.',
    stack: ['Next.js', 'TypeScript', 'Product design'], color: '#d8f851', year: '2026', status: 'live',
    role: 'Product and engineering', team: 'Solo build',
    direction: 'Vault centres confidence: money movement is explained, currency is unambiguous, and security reads as reassurance rather than jargon.',
    links: { demo: 'https://vaulte-xi.vercel.app' },
  },
  {
    slug: 'the-grind-pact', number: '09', title: 'The Grind Pact', category: 'Fitness / accountability', filters: ['web', 'community'],
    summary: 'A fitness-accountability web app built around consistency, commitment, and follow-through.',
    stack: ['Next.js', 'TypeScript'], color: '#6de0dd', year: '2026', status: 'live',
    role: 'Product and engineering', team: 'Solo build',
    direction: 'The Grind Pact is designed to make commitment visible and keep people returning, not just logging a single session.',
    links: { demo: 'https://the-grind-impact.vercel.app' },
  },
  {
    slug: 'lyranews', number: '10', title: 'LyraNews', category: 'Media / publishing', filters: ['web', 'media'],
    summary: 'A global news platform presenting breaking news and analysis across politics, business, technology, and culture.',
    stack: ['Next.js', 'TypeScript', 'Content'], color: '#ffb467', year: '2026', status: 'live',
    role: 'Product and engineering', team: 'Solo build',
    direction: 'LyraNews prioritises fast scanning and clear hierarchy so readers can move from headlines to depth quickly.',
    links: { demo: 'https://lyranews.vercel.app' },
  },
  {
    slug: 'bloom-va-academy', number: '11', title: 'Bloom VA Academy', category: 'Education / training', filters: ['web', 'education'],
    summary: 'A training academy site for virtual assistants — curriculum, certification, and enrolment in one flow.',
    stack: ['Next.js', 'TypeScript'], color: '#a28cff', year: '2026', status: 'live',
    role: 'Product and engineering', team: 'Solo build',
    direction: 'Bloom VA Academy turns a course offering into a clear, credible path from interest to enrolment.',
    links: { demo: 'https://bloom-va-academy.vercel.app' },
  },
  {
    slug: 'nafs-conference', number: '12', title: 'NAFS Conference', category: 'Education / events', filters: ['web', 'education'],
    summary: 'A conference registration site with online payment via Paystack, instant confirmation, and group pricing.',
    stack: ['Next.js', 'TypeScript', 'Paystack'], color: '#6de0dd', year: '2026', status: 'live',
    role: 'Product and engineering', team: 'Solo build',
    direction: 'NAFS keeps a time-sensitive registration flow short and dependable, with payment and confirmation handled end-to-end.',
    links: { demo: 'https://nafs-1.vercel.app' },
  },
  {
    slug: 'ladies-in-tech', number: '13', title: 'Ladies in Tech', category: 'Community / events', filters: ['web', 'community'],
    summary: 'A landing experience for an AI build day for women shaping what is next in Nigeria.',
    stack: ['Next.js', 'CSS'], color: '#ff7863', year: '2026', status: 'live',
    role: 'Product and engineering', team: 'Solo build',
    direction: 'Ladies in Tech communicates a single event clearly, with the schedule, venue, and sign-up in one place.',
    links: { demo: 'https://ladiesin-tech.vercel.app' },
  },
  {
    slug: 'shales-constructions', number: '14', title: 'Shales Constructions', category: 'Commerce / services', filters: ['web', 'commerce'],
    summary: 'A product site for high-security burglary windows, premium doors, and custom house boats.',
    stack: ['Next.js', 'HTML'], color: '#ffb467', year: '2025', status: 'live',
    role: 'Product and engineering', team: 'Solo build',
    direction: 'Shales Constructions presents a specialised catalogue with trust signals drawn from years of construction experience.',
    links: { demo: 'https://v0-shalesconstructions-website.vercel.app' },
  },
  {
    slug: 'sobur-retail-manager', number: '15', title: 'SoburRetailManager', category: 'Retail / operations', filters: ['platform'],
    summary: 'A retail management system for inventory, sales, and day-to-day store operations.',
    stack: ['C#', 'Desktop'], color: '#a28cff', year: '2026', status: 'built',
    role: 'Product and engineering', team: 'Soburr Enterprise Solution',
    direction: 'SoburRetailManager focuses on the routine operational tasks a store repeats every day.',
  },
  {
    slug: 'chatbuddy', number: '16', title: 'Chatbuddy', category: 'Web app', filters: ['web'],
    summary: 'A conversational chat application.',
    stack: ['JavaScript'], color: '#d8f851', year: '2026', status: 'built',
    role: 'Product and engineering', team: 'Solo build',
    direction: 'Chatbuddy explores lightweight, real-time conversation.',
  },
  {
    slug: 'nexachat', number: '17', title: 'NexaChat', category: 'Mobile app', filters: ['web'],
    summary: 'A native Android chat application.',
    stack: ['Kotlin', 'Android'], color: '#6de0dd', year: '2026', status: 'built',
    role: 'Product and engineering', team: 'Solo build',
    direction: 'NexaChat applies the messaging model as a native, mobile-first experience.',
  },
  {
    slug: 'techhaven', number: '18', title: 'TechHaven', category: 'Commerce / electronics', filters: ['web', 'commerce'],
    summary: 'A gadget storefront offering premium devices at budget prices.',
    stack: ['HTML', 'CSS'], color: '#ffb467', year: '2025', status: 'built',
    role: 'Product and engineering', team: 'Solo build',
    direction: 'TechHaven keeps a broad device catalogue easy to browse and price-compare.',
  },
  {
    slug: 'among-us', number: '19', title: 'AmongUs', category: 'Experiment / web', filters: ['web'],
    summary: 'A Call of Duty-themed chat terminal for an Among Us squad.',
    stack: ['TypeScript'], color: '#ff7863', year: '2025', status: 'built',
    role: 'Product and engineering', team: 'Solo build',
    direction: 'A small experiment in themed, terminal-style interfaces.',
  },
  {
    slug: 'synapse', number: '20', title: 'Synapse', category: 'Experiment / web', filters: ['web'],
    summary: 'An early-stage web project.',
    stack: ['TypeScript'], color: '#a28cff', year: '2026', status: 'built',
    role: 'Product and engineering', team: 'Solo build',
    direction: 'A work-in-progress concept kept as part of the record.',
  },
  {
    slug: 'ai-literacy', number: '21', title: 'AI Literacy', category: 'AI / education', filters: ['web', 'ai'],
    summary: 'A web project exploring AI literacy.',
    stack: ['TypeScript'], color: '#6de0dd', year: '2026', status: 'built',
    role: 'Product and engineering', team: 'Solo build',
    direction: 'AI Literacy experiments with explaining AI concepts simply to a general audience.',
  },
  {
    slug: 'ai-assignment', number: '22', title: 'AI Assignment', category: 'AI / web', filters: ['web', 'ai'],
    summary: 'A web-based AI assignment project.',
    stack: ['TypeScript'], color: '#d8f851', year: '2026', status: 'built',
    role: 'Product and engineering', team: 'Solo build',
    direction: 'A focused exercise in applying AI within a small web interface.',
  },
];

export const forks: Fork[] = [
  { name: 'react-bits', description: 'An open-source collection of animated, interactive React components for building memorable websites.', repo: 'https://github.com/AbdulSobur1/react-bits', demo: 'https://reactbits.dev', language: 'JavaScript' },
  { name: 'Open-Generative-AI', description: 'A self-hosted, multi-model open-source studio for AI image and video generation.', repo: 'https://github.com/AbdulSobur1/Open-Generative-AI', demo: 'https://muapi.ai/open-generative-ai', language: 'JavaScript' },
  { name: 'opensre', description: 'An open-source toolkit for building AI SRE agents.', repo: 'https://github.com/AbdulSobur1/opensre', demo: 'https://opensre.com', language: 'Python' },
  { name: 'free-claude-code1', description: 'Run a Claude-style coding agent from the terminal, an editor extension, or chat.', repo: 'https://github.com/AbdulSobur1/free-claude-code1', language: 'Python' },
  { name: 'NutriSense-ai', description: 'A nutrition-focused AI experiment.', repo: 'https://github.com/AbdulSobur1/NutriSense-ai', language: 'TypeScript' },
  { name: 'Knightbot-MD', description: 'A WhatsApp group-management bot.', repo: 'https://github.com/AbdulSobur1/Knightbot-MD', language: 'JavaScript' },
  { name: 'Suhail-Md', description: 'A multi-feature WhatsApp bot.', repo: 'https://github.com/AbdulSobur1/Suhail-Md', language: 'JavaScript' },
  { name: 'ABHISHEK-SER', description: 'A WhatsApp bot with a large built-in feature set.', repo: 'https://github.com/AbdulSobur1/ABHISHEK-SER', language: 'JavaScript' },
];

export const projectBySlug = (slug: string) => projects.find((project) => project.slug === slug);

export const featuredProjects = projects.filter((project) => project.featured);

export const liveProjectCount = projects.filter((project) => project.status === 'live').length;
