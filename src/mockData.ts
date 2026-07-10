import { Post, User } from './types';

export const currentUser: User = {
  id: 'u1',
  name: 'Vibe Designer',
  avatar: 'https://api.dicebear.com/7.x/pixel-art/svg?seed=Lucky',
  bio: 'Exploring the intersection of vibes and code.'
};

export const mockPosts: Post[] = [
  {
    id: 'p1',
    authorId: 'u2',
    authorName: 'NeonKnight',
    authorAvatar: 'https://api.dicebear.com/7.x/pixel-art/svg?seed=Knight',
    title: 'Cyberpunk Portfolio',
    description: 'A glowing, futuristic portfolio with neon accents and terminal effects.',
    prompt: 'Build a cyberpunk portfolio with neon pink and blue accents, glassmorphism cards, and a terminal-style intro.',
    code: `<!DOCTYPE html><html><head><script src="https://cdn.tailwindcss.com"></script></head><body class="bg-black text-white p-20"><h1 class="text-6xl font-black text-fuchsia-500 shadow-fuchsia-500/50 shadow-2xl">CYBERPUNK v1.0</h1><p class="mt-10 text-xl text-cyan-400">Welcome to the future of vibes.</p></body></html>`,
    tags: ['cyberpunk', 'portfolio', 'neon'],
    likes: 42,
    createdAt: '2024-05-01T10:00:00Z',
    status: 'published',
    comments: [
      {
        id: 'c1',
        userId: 'u3',
        postId: null,
        parentId: 'p1',
        rootPostId: 'p1',
        authorName: 'VibeMaster',
        authorAvatar: 'https://api.dicebear.com/7.x/pixel-art/svg?seed=Master',
        content: 'I love the terminal feel! Can we add a flickering screen effect to the header?',
        createdAt: '2024-05-01T12:00:00Z'
      }
    ]
  },
  {
    id: 'p2',
    authorId: 'u3',
    authorName: 'VibeMaster',
    authorAvatar: 'https://api.dicebear.com/7.x/pixel-art/svg?seed=Master',
    title: 'Minimalist Zen Tracker',
    description: 'A clean, calm habit tracker focused on white space and soft shadows.',
    prompt: 'Create a minimalist zen-style habit tracker. Use soft cream colors, serif typography, and plenty of breathing room.',
    code: `<!DOCTYPE html><html><head><script src="https://cdn.tailwindcss.com"></script><link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;600&display=swap" rel="stylesheet"><style>body { font-family: 'Cormorant Garamond', serif; }</style></head><body class="bg-[#F9F7F2] text-[#2D2D2D] p-20"><h1 class="text-4xl font-light tracking-widest text-[#5A5A5A]">ZEN TRACKER</h1><div class="mt-20 border-b border-[#D1D1D1] pb-4">01. Meditation</div><div class="mt-4 border-b border-[#D1D1D1] pb-4">02. Mindful Reading</div></body></html>`,
    tags: ['minimal', 'zen', 'productivity'],
    likes: 128,
    createdAt: '2024-05-02T15:30:00Z',
    status: 'help_requested',
    comments: [
      {
        id: 'c2',
        userId: 'u1',
        postId: null,
        parentId: 'p2',
        rootPostId: 'p2',
        authorName: 'Vibe Designer',
        authorAvatar: 'https://api.dicebear.com/7.x/pixel-art/svg?seed=Lucky',
        content: 'This is gorgeous, but it needs a simple chart to visualize progress. Can someone help?',
        createdAt: '2024-05-02T16:00:00Z'
      }
    ]
  }
];
