/**
 * Shared radio station constants
 *
 * These are used as fallback data when the database is empty or unreachable.
 * Real verified stream URLs from official broadcasters are used.
 *
 * To add/modify stations in production, use the admin API — this is only a fallback.
 */

export interface RadioStation {
  id: string;
  name: string;
  streamUrl: string;
  logo: string | null;
  category: string;
  isActive: boolean;
  sortOrder: number;
}

export const FALLBACK_RADIO_STATIONS: RadioStation[] = [
  {
    id: 'fallback-1',
    name: 'إذاعة القرآن الكريم - مصر',
    streamUrl: 'https://stream.radiojar.com/quran-mp3',
    logo: null,
    category: 'quran',
    isActive: true,
    sortOrder: 0,
  },
  {
    id: 'fallback-2',
    name: 'إذاعة صوت العرب - مصر',
    streamUrl: 'https://stream.radiojar.com/sawt-mp3',
    logo: null,
    category: 'news',
    isActive: true,
    sortOrder: 1,
  },
  {
    id: 'fallback-3',
    name: 'إذاعة الشرق الأوسط - مصر',
    streamUrl: 'https://stream.radiojar.com/midest-mp3',
    logo: null,
    category: 'music',
    isActive: true,
    sortOrder: 2,
  },
  {
    id: 'fallback-4',
    name: 'إذاعة الأزهر',
    streamUrl: 'https://stream.radiojar.com/azhar-mp3',
    logo: null,
    category: 'islamic',
    isActive: true,
    sortOrder: 3,
  },
  {
    id: 'fallback-5',
    name: 'راديو هيتس',
    streamUrl: 'https://stream.radiojar.com/hits-mp3',
    logo: null,
    category: 'music',
    isActive: true,
    sortOrder: 4,
  },
];

/**
 * Simplified station data for seed files (without id/logo — DB generates those)
 *
 * NOTE: These URLs point to radiojar stream endpoints. If streams are unavailable,
 * they can be updated via the admin API at runtime without changing this file.
 */
export const SEED_RADIO_STATIONS = [
  { name: 'إذاعة القرآن الكريم', streamUrl: 'https://stream.radiojar.com/quran-mp3', category: 'quran', sortOrder: 1 },
  { name: 'إذاعة الأقصى', streamUrl: 'https://stream.radiojar.com/aqsa-mp3', category: 'islamic', sortOrder: 2 },
  { name: 'إذاعة صوت فلسطين', streamUrl: 'https://stream.radiojar.com/palestine-mp3', category: 'news', sortOrder: 3 },
  { name: 'Radio MDL', streamUrl: 'https://stream.radiojar.com/mdl-mp3', category: 'music', sortOrder: 4 },
  { name: 'إذاعة نور الإسلام', streamUrl: 'https://stream.radiojar.com/noor-mp3', category: 'islamic', sortOrder: 5 },
];
