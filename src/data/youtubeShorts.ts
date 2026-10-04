import { YouTubeShortItem } from '../types';

export const POPULAR_YOUTUBE_SHORTS: YouTubeShortItem[] = [
  {
    id: 'fJ9rUzIMcZQ', // Bohemian Rhapsody / Queen official short clip
    title: 'Queen - Bohemian Rhapsody Live Moment',
    channelTitle: 'Queen Official',
    category: 'Music',
  },
  {
    id: 'dQw4w9WgXcQ', // Rick Astley
    title: 'Classic Rhythm & Groove',
    channelTitle: 'RickAstleyVEVO',
    category: 'Music',
  },
  {
    id: 'L_LUpnjgPso', // Red Bull Extreme sports
    title: 'Extreme Mountain Wingsuit Flight',
    channelTitle: 'Red Bull',
    category: 'Action',
  },
  {
    id: 'kJQP7kiw5Fk', // Despacito clip
    title: 'Latin Island Rhythms & Dance',
    channelTitle: 'Luis Fonsi',
    category: 'Dance',
  },
  {
    id: '9bZkp7q19f0', // PSY Gangnam Style
    title: 'Iconic Stadium Flashmob Dance',
    channelTitle: 'officialpsy',
    category: 'Comedy',
  },
  {
    id: 'jNQXAC9IVRw', // Me at the zoo (YouTube's very first video)
    title: 'Me at the zoo - Historic First Video',
    channelTitle: 'jawed',
    category: 'History',
  },
];

/**
 * Extracts a YouTube Video ID from any standard URL or Shorts URL
 */
export function extractYouTubeId(urlOrId: string): string | null {
  const trimmed = urlOrId.trim();
  // If it's already an 11-char ID
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }

  // Matches /shorts/ID, /watch?v=ID, youtu.be/ID, /embed/ID
  const patterns = [
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
  ];

  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  return null;
}
