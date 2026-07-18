'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Search, ImageIcon, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '@/store/auth-store';

interface SearchResult {
  url: string;
  thumbnail?: string;
  title?: string;
  description?: string;
  source?: string;
}

interface ImageSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInsertImage?: (url: string) => void;
}

export function ImageSearchDialog({ open, onOpenChange, onInsertImage }: ImageSearchDialogProps) {
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);

  const token = useAuthStore((s) => s.token);

  const handleSearch = async () => {
    if (!query.trim()) {
      toast.error('أدخل كلمة البحث');
      return;
    }

    setIsSearching(true);
    setResults([]);

    try {
      const response = await fetch(`/api/ai/image/search?q=${encodeURIComponent(query)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      // Handle non-JSON responses
      if (!response.ok) {
        let errorMessage = `خطأ في الخادم (${response.status})`;
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch {
          if (response.status === 504 || response.status === 502) {
            errorMessage = 'انتهت مهلة الخادم. يرجى المحاولة مرة أخرى.';
          }
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();

      setResults(data.images || []);
      if (data.images?.length === 0) {
        toast.info('لم يتم العثور على صور');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'فشل في البحث');
    } finally {
      setIsSearching(false);
    }
  };

  const handleClose = () => {
    onOpenChange(false);
    setTimeout(() => {
      setQuery('');
      setResults([]);
    }, 300);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Search className="size-5 text-blue-500" />
            البحث عن الصور
          </DialogTitle>
          <DialogDescription>
            ابحث عن صور بالكلمات المفتاحية واستخدمها في المحادثة
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* Search Input */}
          <div className="flex gap-2">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ابحث عن صور..."
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="flex-1"
              dir="auto"
              disabled={isSearching}
            />
            <Button onClick={handleSearch} disabled={isSearching}>
              {isSearching ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Search className="size-4" />
              )}
            </Button>
          </div>

          {/* Results Grid */}
          {results.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-96 overflow-y-auto">
              {results.map((img, idx) => (
                <div
                  key={idx}
                  className="group relative border dark:border-gray-700 border-gray-200 rounded-lg overflow-hidden cursor-pointer hover:shadow-lg transition-shadow"
                  onClick={() => {
                    if (onInsertImage) {
                      onInsertImage(img.url);
                      onOpenChange(false);
                    } else {
                      window.open(img.url, '_blank');
                    }
                  }}
                >
                  <img
                    src={img.thumbnail || img.url}
                    alt={img.title || 'Search result'}
                    className="w-full h-32 object-cover"
                    loading="lazy"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = '';
                      (e.target as HTMLImageElement).classList.add('bg-muted');
                    }}
                  />
                  {img.title && (
                    <div className="p-1.5 bg-card">
                      <p className="text-xs truncate">{img.title}</p>
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black group-hover:bg-blue-200 dark:bg-blue-800 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                    {onInsertImage ? (
                      <ImageIcon className="size-6 text-white" />
                    ) : (
                      <ExternalLink className="size-6 text-white" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {results.length === 0 && !isSearching && query && (
            <div className="text-center py-8 text-gray-400">
              <ImageIcon className="size-12 mx-auto mb-2 opacity-50" />
              <p>ابحث عن صور بالكلمات المفتاحية</p>
            </div>
          )}

          {!query && results.length === 0 && (
            <div className="text-center py-8 text-gray-400">
              <Search className="size-12 mx-auto mb-2 opacity-50" />
              <p>أدخل كلمات البحث للعثور على صور</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
