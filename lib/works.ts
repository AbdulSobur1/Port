/**
 * Everything the portfolio says about the work, in one place.
 *
 * The 3D street, the phone journey, the case pages, the directory and the
 * search-engine text all read from here, so a project can never be described
 * differently in two places.
 *
 * Writing rules for this file:
 *  - Only claims the owner has stated. No invented users, revenue or awards.
 *  - Every `line` is plain language a non-developer can follow.
 *  - Anything not yet known goes in `gaps`, shown to the owner as a to-do
 *    ("Add a screenshot") and never shown to visitors as fact.
 *
 * Keep this file free of path aliases: build scripts import it directly.
 */

export type DistrictId = 'products' | 'client' | 'builds' | 'ideas' | 'about';

export type District = {
  id: DistrictId;
  /** Real OpenStreetMap street name; the signs show it unchanged. */
  street: string;
  /** What this street is for, in the words a visitor needs. */
  name: string;
  /** One sentence that appears on the street sign and in the directory. */
  blurb: string;
  color: string;
  /** Sign shape, so colour is never the only way to tell streets apart. */
  shape: 'circle' | 'square' | 'triangle' | 'diamond' | 'hexagon';
};

export const districts: District[] = [
  {
    id: 'products',
    street: 'Adeniji Adele Road',
    name: 'Products',
    blurb: 'Apps and sites real people can open and use.',
    color: '#f2b300',
    shape: 'circle',
  },
  {
    id: 'client',
    street: 'Oshodi Street',
    name: 'Client and team work',
    blurb: 'Built for someone else, or with a team.',
    color: '#d9432f',
    shape: 'square',
  },
  {
    id: 'builds',
    street: 'Glover Street',
    name: 'Training builds',
    blurb: 'Bigger projects made to learn, on a placement or as practice.',
    color: '#1f8a5b',
    shape: 'triangle',
  },
  {
    id: 'ideas',
    street: 'Omidi Dum Street',
    name: 'Ideas and early drafts',
    blurb: 'Concepts and prototypes that are not finished products.',
    color: '#2f6fcf',
    shape: 'diamond',
  },
  {
    id: 'about',
    street: 'Okepopo Street',
    name: 'About and contact',
    blurb: 'Who is behind the work, how I work, where I write, how to reach me.',
    color: '#e8762a',
    shape: 'hexagon',
  },
];

export const districtById = (id: DistrictId) => districts.find((d) => d.id === id)!;

export type WorkStatus = 'Live' | 'In build' | 'Delivered' | 'Prototype' | 'Idea' | 'Status to confirm';

export type Work = {
  slug: string;
  title: string;
  district: DistrictId;
  /** What kind of thing it is, as a noun phrase: "Chat app for phones". */
  kind: string;
  /** One plain sentence for someone who has never written code. */
  line: string;
  status: WorkStatus;
  role: string;
  team: string;
  stack: string[];
  /** The story, in the order a visitor wants it. */
  story: { heading: string; body: string }[];
  links: { label: string; href: string }[];
  /** Things the owner still has to supply. Never rendered as facts. */
  gaps: string[];
  confidential?: boolean;
};

export const works: Work[] = [
  /* ---------------------------------------------------------- Products */
  {
    slug: 'chatbuddy',
    title: 'ChatBuddy',
    district: 'products',
    kind: 'Chat app for phones',
    line: 'A messaging app for phones that I am building as CEO of ChatBuddy.',
    status: 'In build',
    role: 'Founder, CEO and lead developer',
    team: 'A small team I onboard and lead',
    stack: ['React Native', 'Expo', 'Supabase', 'EAS Build'],
    story: [
      {
        heading: 'What it is',
        body: 'ChatBuddy is a mobile chat app. It runs on React Native with Expo on the phone and Supabase behind it for accounts, messages and storage.',
      },
      {
        heading: 'What I have done on it',
        body: 'I set up the build pipeline with EAS, wrote and audited the row-level security rules that decide who can read which messages, built the status viewer, prepared the app for a Play Store release, and brought new teammates up to speed on the codebase.',
      },
      {
        heading: 'Why the security audit mattered',
        body: 'In a chat app the most serious bug is one person reading another person’s messages. Auditing the access rules table by table, and testing them as different users, was the work I trusted least to guesswork.',
      },
    ],
    links: [],
    gaps: [
      'Add 3 screenshots (chat list, a conversation, status viewer).',
      'Add the Play Store or testing link once it exists.',
      'Add the date work started and the number of people on the team.',
      'Add one sentence on what makes ChatBuddy different from other chat apps.',
    ],
  },
  {
    slug: 'ummahconnect',
    title: 'UmmahConnect',
    district: 'products',
    kind: 'Networking site for Muslim professionals',
    line: 'A website where Muslim professionals can find each other and connect.',
    status: 'Live',
    role: 'Full-stack developer',
    team: 'Two collaborators',
    stack: ['Next.js', 'Neon Postgres', 'Drizzle', 'Auth.js v5'],
    story: [
      {
        heading: 'What it is',
        body: 'A professional networking site built around a shared faith: profiles, discovery and connections between people who want to meet others in their field.',
      },
      {
        heading: 'What I had to rebuild',
        body: 'The first version kept the sign-in state in the browser, a database migration was broken, and database access rules failed under testing. I replaced browser-side sign-in with real server sessions through Auth.js v5, moved the data to Neon with Drizzle migrations, and re-tested the access rules.',
      },
    ],
    links: [{ label: 'Open the live site', href: 'https://ummah-connect-ochre.vercel.app' }],
    gaps: [
      'Add 3 screenshots (profile, discovery, connection request).',
      'Add how many people have signed up, if you want to share that.',
      'Confirm what each collaborator built, so credit is exact.',
    ],
  },
  {
    slug: 'pastq-hub',
    title: 'PastQ Hub',
    district: 'products',
    kind: 'Past exam questions for Nigerian students',
    line: 'A site where Nigerian students can find past exam questions to practise with.',
    status: 'Status to confirm',
    role: 'Developer',
    team: 'To confirm',
    stack: [],
    story: [
      {
        heading: 'What it is',
        body: 'Past questions are how most Nigerian students prepare for exams, and they usually travel as photos and PDFs in group chats. PastQ Hub is an attempt to put them in one searchable place.',
      },
    ],
    links: [],
    gaps: [
      'Say whether it is live, in testing or paused, and add the link.',
      'Add the tech stack and 2 screenshots.',
      'Add what you built and what is still missing.',
    ],
  },

  /* ------------------------------------------------- Client and team work */
  {
    slug: 'ybd-clothing',
    title: 'YBD Clothing',
    district: 'client',
    kind: 'Online shop for a clothing brand',
    line: 'I rebuilt the online shop of a clothing brand for its owner.',
    status: 'Status to confirm',
    role: 'Freelance developer',
    team: 'Solo, working with the client',
    stack: ['Next.js', 'Supabase', 'Drizzle', 'Resend'],
    story: [
      {
        heading: 'What it is',
        body: 'A client project: a rebuilt online store for a clothing brand, covering the product catalogue, ordering and the emails customers receive.',
      },
    ],
    links: [],
    confidential: true,
    gaps: [
      'Ask the client whether the shop name and link can be shown.',
      'Add 2 screenshots the client has approved.',
      'Add what was wrong with the old shop and what is better now.',
      'Do not publish prices or fees.',
    ],
  },
  {
    slug: 'medcore',
    title: 'MedCore',
    district: 'client',
    kind: 'Hospital management system',
    line: 'Software for running a hospital: patients, staff and who is allowed to see what.',
    status: 'Delivered',
    role: 'Developer',
    team: 'University group project',
    stack: ['Next.js', 'Drizzle', 'Auth.js v5', 'Role-based dashboards'],
    story: [
      {
        heading: 'What it is',
        body: 'A hospital management system built by a university group. Different staff, such as doctors, nurses and administrators, each get their own dashboard.',
      },
      {
        heading: 'What the audit found',
        body: 'When I reviewed the first version I found that one-time passcodes were being checked in the browser, where anyone can change the result, and that an administrator key was exposed to the front end. Both are the kind of mistake that is invisible until someone looks.',
      },
      {
        heading: 'What I changed',
        body: 'I moved sign-in to server-side sessions with Auth.js v5, moved database work to Drizzle, kept secrets on the server, and split the interface into dashboards by role.',
      },
    ],
    links: [],
    gaps: [
      'Confirm group size and which parts you built.',
      'Add 3 screenshots of the role dashboards (no real patient data).',
      'Add the course and year.',
    ],
  },
  {
    slug: 'bytebank',
    title: 'byteBANK',
    district: 'client',
    kind: 'Banking app',
    line: 'A banking app built by a team, with the customer app and the money logic kept apart.',
    status: 'Delivered',
    role: 'Product engineering',
    team: 'Four frontend and three backend developers',
    stack: ['Customer app', 'Backend services'],
    story: [
      {
        heading: 'What it is',
        body: 'A banking product split into two parts: the app the customer sees, and the services that move and record money. Seven developers worked on it, four on the front and three on the back.',
      },
      {
        heading: 'Why the split matters',
        body: 'Keeping the two parts separate means the screen can never decide what the balance is. The screen asks; the service answers. It also let the two groups work without stepping on each other.',
      },
    ],
    links: [],
    gaps: [
      'Say exactly which part you built.',
      'Add the tech stack, 2 screenshots and a link if one exists.',
      'Say whether this was a hackathon, a course or a client.',
    ],
  },
  {
    slug: 'fashion-marketplace',
    title: 'Fashion marketplace',
    district: 'client',
    kind: 'Marketplace for fashion sellers',
    line: 'Early design and planning for a marketplace where fashion sellers can list their work.',
    status: 'Prototype',
    role: 'Product and architecture',
    team: 'Confidential',
    stack: [],
    story: [
      {
        heading: 'What I can say',
        body: 'This is confidential client work. I produced the system architecture and interface mock-ups. The client’s name and details stay private.',
      },
    ],
    links: [],
    confidential: true,
    gaps: [
      'Ask the client what may be shown. A redacted diagram is enough.',
      'Add the date and what stage the project reached.',
    ],
  },

  /* ------------------------------------------------------ Training builds */
  {
    slug: 'mangaverse',
    title: 'MangaVerse',
    district: 'builds',
    kind: 'Manga reading platform',
    line: 'A manga reading site, web and phone app, built during my industrial training placement.',
    status: 'Delivered',
    role: 'Developer',
    team: 'Solo, on a SIWES placement',
    stack: ['Next.js 15', 'Expo', 'Express', 'Prisma', 'PostgreSQL', 'Redis', 'BullMQ', 'Meilisearch'],
    story: [
      {
        heading: 'What it is',
        body: 'One codebase holding a website, a phone app and the server behind them. The server handles accounts, a search engine for finding titles quickly, and background jobs that run behind the scenes.',
      },
      {
        heading: 'How far it has been tested',
        body: 'It has been used by my lecturers and classmates. It has not been tested by the public, and I would not describe it as launched.',
      },
    ],
    links: [{ label: 'Read the code on GitHub', href: 'https://github.com/Abdulsobur1-alt/MangaVerse' }],
    gaps: [
      'Add 3 screenshots (home, reader, search).',
      'Add the placement dates and the organisation, if you want it named.',
      'Add one thing you would do differently.',
    ],
  },
  {
    slug: 'nexachat',
    title: 'NexaChat',
    district: 'builds',
    kind: 'Android chat app',
    line: 'A chat app for Android, built to learn how native apps are made.',
    status: 'Status to confirm',
    role: 'Developer',
    team: 'Solo',
    stack: ['Kotlin', 'Jetpack Compose'],
    story: [
      {
        heading: 'What it is',
        body: 'A native Android chat app written in Kotlin with Jetpack Compose, the modern toolkit for building Android screens.',
      },
    ],
    links: [],
    gaps: [
      'Add 2 screenshots and say what the backend is.',
      'Say what you learned compared with building ChatBuddy in React Native.',
    ],
  },
  {
    slug: 'thegrindimpact',
    title: 'TheGrindImpact',
    district: 'builds',
    kind: 'Workout accountability tracker',
    line: 'A site that helps people keep each other accountable for their workouts.',
    status: 'Status to confirm',
    role: 'Developer',
    team: 'Solo',
    stack: ['Next.js', 'Supabase'],
    story: [
      {
        heading: 'What it is',
        body: 'A workout tracker built around accountability: you log sessions so that the people you train with can see them.',
      },
    ],
    links: [],
    gaps: [
      'Add the link and 2 screenshots.',
      'Say whether anyone besides you uses it.',
    ],
  },

  /* ------------------------------------------------- Ideas and early drafts */
  {
    slug: 'proofmesh',
    title: 'ProofMesh',
    district: 'ideas',
    kind: 'Idea for proving real skills',
    line: 'An idea for a way to show what someone can actually do, instead of only what certificates say.',
    status: 'Idea',
    role: 'Product and engineering',
    team: 'Two collaborators',
    stack: ['AI', 'Protocol design'],
    story: [
      {
        heading: 'The question',
        body: 'Certificates are easy to collect and hard to trust. ProofMesh explores whether AI can help check evidence of a real skill without turning a person into a score.',
      },
      {
        heading: 'Where it stands',
        body: 'It was written up for a hackathon and is at idea stage. It is not a working product.',
      },
    ],
    links: [],
    gaps: ['Add the hackathon name and the Devpost link.', 'Add a one-page diagram of how it would work.'],
  },
  {
    slug: 'africonnect',
    title: 'AfriConnect',
    district: 'ideas',
    kind: 'Cultural tourism platform',
    line: 'A site for finding local cultural experiences across Africa, with local hosts getting a fair share.',
    status: 'Prototype',
    role: 'Full-stack developer',
    team: 'Two collaborators',
    stack: ['Next.js', 'Prisma'],
    story: [
      {
        heading: 'The question',
        body: 'Travel sites often hide the local people who make a place worth visiting. AfriConnect puts hosts, stories and places at the front.',
      },
      {
        heading: 'How it is built',
        body: 'Experiences, people and places each have their own shape in the database rather than being forced into one table.',
      },
    ],
    links: [],
    gaps: ['Say what works today and what is mock-up.', 'Add 2 screenshots and a link.'],
  },
  {
    slug: 'kobo-and-lex',
    title: 'Kobo and Lex',
    district: 'ideas',
    kind: 'Two product concepts with clickable prototypes',
    line: 'Two product ideas, each written up as a plan and built as a prototype you can click through.',
    status: 'Prototype',
    role: 'Product and design',
    team: 'Solo',
    stack: ['Product requirements documents', 'HTML prototypes'],
    story: [
      {
        heading: 'What I made',
        body: 'For each idea I wrote a product requirements document, which says who it is for and exactly what it must do, then built an interactive HTML prototype to test the flow before writing real software.',
      },
    ],
    links: [],
    gaps: [
      'Say in one line what Kobo is and what Lex is.',
      'Link the prototypes and the two documents.',
    ],
  },
];

export const workBySlug = (slug: string) => works.find((w) => w.slug === slug);
export const worksIn = (id: DistrictId) => works.filter((w) => w.district === id);

/* ----------------------------------------------------------- Page stops */

export type PageStop = {
  zone: 'home' | 'about' | 'skills' | 'writing' | 'contact';
  title: string;
  kind: string;
  line: string;
  district: DistrictId;
  body: string[];
  links: { label: string; href: string }[];
  gaps: string[];
};

export const pageStops: PageStop[] = [
  {
    zone: 'home',
    title: 'Start here',
    kind: 'Welcome',
    line: 'You are at the start of Adeniji Adele Road. Every building is something I have made.',
    district: 'products',
    body: [
      'I am Abdulsobur, a full-stack developer and computer science student at LASUSTECH. I am also the CEO of ChatBuddy.',
      'This is a map of my work. Each street holds one kind of work, and each building on it is one project.',
    ],
    links: [],
    gaps: [],
  },
  {
    zone: 'about',
    title: 'About me',
    kind: 'Who I am',
    line: 'Developer, student, founder. In that order of hours per week.',
    district: 'about',
    body: [
      'I build web and mobile products, front to back. I study computer science at LASUSTECH, and I run ChatBuddy as its CEO.',
      'The projects I trust most are the ones I rebuilt after finding what was wrong with the first version.',
    ],
    links: [],
    gaps: ['Add a photo of you.', 'Add your city and what kind of work you are open to.'],
  },
  {
    zone: 'skills',
    title: 'How I work',
    kind: 'Tools and habits',
    line: 'What I use, and the habits that show up in every project.',
    district: 'about',
    body: [
      'Languages and tools: TypeScript, React, Next.js, React Native and Expo, Kotlin, Node.js with Express, PostgreSQL, Supabase, Drizzle and Prisma.',
      'Habits: I audit who can see what before I ship, I keep secrets on the server, and I write down what a thing is for before I build it.',
    ],
    links: [],
    gaps: [],
  },
  {
    zone: 'writing',
    title: 'Rough Commits',
    kind: 'My newsletter',
    line: 'Where I write about building software, including the mistakes.',
    district: 'about',
    body: ['Rough Commits is my Substack. It is where I write up what broke and what I changed.'],
    links: [],
    gaps: ['Add the Substack link.', 'Add the titles of your 3 best posts.'],
  },
  {
    zone: 'contact',
    title: 'Contact',
    kind: 'Get in touch',
    line: 'The fastest way to reach me today is through GitHub.',
    district: 'about',
    body: ['Open an issue or message me on GitHub. A public email address will be added here.'],
    links: [{ label: 'GitHub profile', href: 'https://github.com/AbdulSobur1' }],
    gaps: ['Add a public email address and, if you want, LinkedIn or X.'],
  },
];

export const pageByZone = (zone: string) => pageStops.find((p) => p.zone === zone);

/**
 * Stop order along every street. `zone` is `project:<slug>` for work and the
 * bare page name for page stops, which is what the world data stores.
 */
export const streetPlan: { district: DistrictId; zones: string[] }[] = [
  { district: 'products', zones: ['home', 'project:chatbuddy', 'project:ummahconnect', 'project:pastq-hub'] },
  { district: 'client', zones: ['project:ybd-clothing', 'project:medcore', 'project:bytebank', 'project:fashion-marketplace'] },
  { district: 'builds', zones: ['project:mangaverse', 'project:nexachat', 'project:thegrindimpact'] },
  { district: 'ideas', zones: ['project:proofmesh', 'project:africonnect', 'project:kobo-and-lex'] },
  { district: 'about', zones: ['about', 'skills', 'writing', 'contact'] },
];

export const allZones = streetPlan.flatMap((s) => s.zones);
