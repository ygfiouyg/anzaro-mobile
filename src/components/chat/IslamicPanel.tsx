'use client';

import { useMemo, useState, useEffect } from 'react';
import { Moon, BookOpen, Clock, Star, MessageSquare, Loader2, MapPin } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';

interface IslamicPanelProps {
  onQuickPrompt?: (prompt: string) => void;
}

interface PrayerTimesResponse {
  success: boolean;
  timings: Record<string, string>;
  hijriDate: {
    day: string;
    month: string;
    monthAr: string;
    year: string;
  } | null;
  gregorianDate: string;
  source: string;
  warning?: string;
}

// Fallback Hijri date calculation (client-side, used while API loads)
function getApproximateHijriDate(): { day: number; month: number; year: number; monthName: string } {
  const now = new Date();
  const jd = Math.floor(now.getTime() / 86400000) + 2440587.5;
  const l = jd - 1948440 + 10632;
  const n = Math.floor((l - 1) / 10631);
  const lPrime = l - 10631 * n + 354;
  const j = Math.floor((10985 - lPrime) / 5316) * Math.floor((50 * lPrime) / 17719) + Math.floor(lPrime / 5670) * Math.floor((43 * lPrime) / 15238);
  const lDPrime = lPrime - Math.floor((30 - j) / 15) * Math.floor((17719 * j) / 50) - Math.floor(j / 16) * Math.floor((15238 * j) / 43) + 29;
  const m = Math.floor((24 * lDPrime) / 709);
  const d = lDPrime - Math.floor((709 * m) / 24);
  const y = 30 * n + j - 30;

  const hijriMonths = [
    'محرم', 'صفر', 'ربيع الأول', 'ربيع الثاني',
    'جمادى الأولى', 'جمادى الثانية', 'رجب', 'شعبان',
    'رمضان', 'شوال', 'ذو القعدة', 'ذو الحجة'
  ];

  return { day: d, month: m, year: y, monthName: hijriMonths[m - 1] || 'محرم' };
}

const QURAN_VERSES = [
  { text: 'بِسْمِ اللَّهِ الرَّحْمَنِ الرَّحِيمِ', source: 'الفاتحة: 1' },
  { text: 'اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ الْحَيُّ الْقَيُّومُ', source: 'البقرة: 255' },
  { text: 'وَمَن يَتَّقِ اللَّهَ يَجْعَل لَّهُ مَخْرَجًا', source: 'الطلاق: 2-3' },
  { text: 'إِنَّ مَعَ الْعُسْرِ يُسْرًا', source: 'الشرح: 6' },
  { text: 'وَقُل رَّبِّ زِدْنِي عِلْمًا', source: 'طه: 114' },
  { text: 'فَاذْكُرُونِي أَذْكُرْكُمْ', source: 'البقرة: 152' },
  { text: 'وَلَسَوْفَ يُعْطِيكَ رَبُّكَ فَتَرْضَىٰ', source: 'الضحى: 5' },
  { text: 'رَبَّنَا آتِنَا فِي الدُّنْيَا حَسَنَةً وَفِي الْآخِرَةِ حَسَنَةً وَقِنَا عَذَابَ النَّارِ', source: 'البقرة: 201' },
];

const QUICK_PROMPTS = [
  'ما حكم صلاة الجماعة؟',
  'تفسير سورة الفاتحة',
  'أدعية الصباح',
  'أحكام الصيام',
  'فضل ذكر الله',
  'أخلاق المسلم',
];

// Prayer time display config
const PRAYER_DISPLAY = [
  { key: 'Fajr', name: 'الفجر', icon: '🌅' },
  { key: 'Sunrise', name: 'الشروق', icon: '☀️' },
  { key: 'Dhuhr', name: 'الظهر', icon: '🌤️' },
  { key: 'Asr', name: 'العصر', icon: '⛅' },
  { key: 'Maghrib', name: 'المغرب', icon: '🌅' },
  { key: 'Isha', name: 'العشاء', icon: '🌙' },
];

export function IslamicPanel({ onQuickPrompt }: IslamicPanelProps) {
  const fallbackHijri = useMemo(() => getApproximateHijriDate(), []);
  const [prayerData, setPrayerData] = useState<PrayerTimesResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const fetchTimes = async () => {
      try {
        const res = await fetch('/api/islamic/times', { signal: AbortSignal.timeout(8000) });
        if (!res.ok) throw new Error('API error');
        const data = await res.json();
        if (!cancelled) {
          setPrayerData(data);
        }
      } catch {
        // Fallback already handled by API — if API fails entirely, use static
        if (!cancelled) {
          setPrayerData(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchTimes();
    return () => { cancelled = true; };
  }, []);

  const verseIndex = useMemo(() => {
    const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
    return dayOfYear % QURAN_VERSES.length;
  }, []);

  const todayVerse = QURAN_VERSES[verseIndex];

  // Use live hijri date if available, otherwise fallback
  const hijriDisplay = prayerData?.hijriDate
    ? `${prayerData.hijriDate.day} ${prayerData.hijriDate.monthAr || prayerData.hijriDate.month} ${prayerData.hijriDate.year} هـ`
    : `${fallbackHijri.day} ${fallbackHijri.monthName} ${fallbackHijri.year} هـ`;

  // Build prayer times array from API or fallback
  const prayerTimes = prayerData?.timings
    ? PRAYER_DISPLAY.map((p) => ({
        name: p.name,
        time: prayerData.timings[p.key] || '--:--',
        icon: p.icon,
      }))
    : PRAYER_DISPLAY.map((p) => ({
        name: p.name,
        time: '--:--',
        icon: p.icon,
      }));

  return (
    <div className="h-full flex flex-col gap-4 p-4 overflow-y-auto" dir="rtl">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Moon className="size-5 text-blue-500" />
        <h2 className="text-lg font-bold text-foreground">الوضع الإسلامي</h2>
      </div>

      {/* Hijri Date */}
      <Card className="border-blue-500">
        <CardContent className="p-4 text-center">
          <p className="text-xs text-muted-foreground mb-1">التاريخ الهجري</p>
          <p className="text-xl font-bold text-blue-600 dark:text-blue-400">
            {loading ? '...' : hijriDisplay}
          </p>
        </CardContent>
      </Card>

      {/* Prayer Times */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm flex items-center gap-2">
            <Clock className="size-4 text-blue-500" />
            مواقيت الصلاة
            {prayerData?.source === 'aladhan' && (
              <span className="flex items-center gap-0.5 text-[10px] text-green-600 dark:text-green-400">
                <MapPin className="size-2.5" /> مباشر
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {loading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {prayerTimes.map((prayer) => (
                <div
                  key={prayer.name}
                  className="flex items-center justify-between p-2 rounded-lg bg-muted"
                >
                  <span className="text-xs font-medium">{prayer.icon} {prayer.name}</span>
                  <Badge variant="outline" className="text-[10px] font-mono">
                    {prayer.time}
                  </Badge>
                </div>
              ))}
            </div>
          )}
          <p className="text-[10px] text-muted-foreground text-center mt-2">
            {prayerData?.source === 'aladhan'
              ? 'الأوقات مباشرة من Aladhan API'
              : prayerData?.warning || 'أوقات تقريبية للقاهرة'}
          </p>
        </CardContent>
      </Card>

      <Separator />

      {/* Daily Quran Verse */}
      <Card className="border-blue-500 bg-blue-50 dark:bg-blue-950">
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm flex items-center gap-2">
            <BookOpen className="size-4 text-blue-500" />
            آية اليوم
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <p className="text-sm leading-relaxed text-foreground font-arabic" dir="rtl">
            ﴿ {todayVerse.text} ﴾
          </p>
          <p className="text-[10px] text-muted-foreground mt-2 text-left" dir="ltr">
            {todayVerse.source}
          </p>
        </CardContent>
      </Card>

      <Separator />

      {/* Quick Islamic Prompts */}
      <div>
        <h3 className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
          <Star className="size-3.5" />
          أسئلة سريعة
        </h3>
        <div className="space-y-1.5">
          {QUICK_PROMPTS.map((prompt) => (
            <Button
              key={prompt}
              variant="ghost"
              size="sm"
              className="w-full justify-start text-xs h-9 px-3 hover:bg-blue-50 dark:hover:bg-blue-950 hover:text-blue-600 dark:hover:text-blue-400"
              onClick={() => onQuickPrompt?.(prompt)}
            >
              <MessageSquare className="size-3 ml-2 flex-shrink-0" />
              {prompt}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
