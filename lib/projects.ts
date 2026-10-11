export type Project = {
  slug: string;
  number: string;
  title: string;
  category: string;
  summary: string;
  role: string;
  team: string;
  stack: string[];
  color: string;
  problem: string;
  direction: string;
  decisions: string[];
};

export const projects: Project[] = [
  {
    slug: 'proofmesh', number: '01', title: 'ProofMesh', category: 'AI / trust infrastructure',
    summary: 'A decentralized protocol exploring how AI can help verify real-world skills without turning people into a score.',
    role: 'Product and engineering', team: 'Two collaborators', stack: ['AI', 'Protocol design', 'Devpost'], color: '#d8f851',
    problem: 'Credentials are easy to collect and hard to trust.',
    direction: 'ProofMesh keeps the human claim visible before the technical mechanism: what is being verified, what evidence supports it, and where uncertainty remains.',
    decisions: ['Evidence before verdicts.', 'Explain confidence instead of hiding it behind a score.', 'Keep the system legible outside the AI and protocol world.'],
  },
  {
    slug: 'africonnect', number: '02', title: 'AfriConnect', category: 'Culture / travel / commerce',
    summary: 'A cultural-tourism platform for finding authentic African experiences and creating fairer value for local partners.',
    role: 'Full-stack product', team: 'Two collaborators', stack: ['Next.js', 'Prisma', 'Product design'], color: '#6de0dd',
    problem: 'Travel discovery often hides the people and stories that make a place worth visiting.',
    direction: 'AfriConnect brings discovery, storytelling, partner visibility, and booking-adjacent flows into one product, backed by a flexible data model for experiences, people, and places.',
    decisions: ['Design for travellers and local partners.', 'Give cultural context the same visual weight as conversion.', 'Avoid forcing experiences, people, and places into one shape.'],
  },
  {
    slug: 'bytebank', number: '03', title: 'byteBANK', category: 'Fintech / full stack',
    summary: 'A banking product split thoughtfully between a customer-facing application and dedicated backend services.',
    role: 'Product engineering', team: 'Four frontend and three backend collaborators', stack: ['Client app', 'Services', 'Team build'], color: '#ffb467',
    problem: 'Financial products need reassurance, clarity, and dependable flows.',
    direction: 'byteBANK treats the customer interface and service layer as connected but distinct engineering problems - a clearer model for product boundaries and team collaboration.',
    decisions: ['Separate customer experience from service concerns.', 'Make state and language unambiguous where confidence matters.', 'Explain money movement; do not merely display it.'],
  },
  {
    slug: 'ummahconnect', number: '04', title: 'UmmahConnect', category: 'Community / platform',
    summary: 'A community platform built around access, belonging, and meaningful connection.',
    role: 'Product engineering', team: 'Two collaborators', stack: ['Community', 'Platform', 'Collaboration'], color: '#ff7863',
    problem: 'Communities need more than a feed: they need shared context and reasons to return.',
    direction: 'UmmahConnect treats community as an active product system: identity, discovery, contribution, and the interactions that make an online space feel less disposable.',
    decisions: ['Prioritise useful connection over empty engagement.', 'Design for return visits, not a one-time sign-up.', 'Give the product a recognisable sense of place.'],
  },
  {
    slug: 'medcore', number: '05', title: 'MedCore', category: 'Healthcare / operations',
    summary: 'Healthcare-management product work aimed at making dense operational information easier to understand and act on.',
    role: 'Product and interface engineering', team: 'One collaborator', stack: ['Healthtech', 'UX systems', 'HMS'], color: '#d8f851',
    problem: 'Healthcare operations are already complex; the software should reduce cognitive load instead of adding to it.',
    direction: 'MedCore explores calmer healthcare-management workflows through practical information hierarchy, clearer states, and a product language suited to operational decisions.',
    decisions: ['Give urgent and routine information different weight.', 'Use plain language for time-sensitive decisions.', 'Make operational software a tool, not an obstacle course.'],
  },
];

export const projectBySlug = (slug: string) => projects.find((project) => project.slug === slug);
