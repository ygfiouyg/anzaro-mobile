'use client';

import { useState, useMemo } from 'react';
import { X, Search, ChevronDown, CheckCircle2, Clock, Sparkles } from 'lucide-react';
import { skills, SKILL_CATEGORIES } from '@/lib/skills';
import { models } from '@/lib/models';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';

interface SkillsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  activeModel?: string;
  onModelSelect?: (modelId: string) => void;
}

export function SkillsPanel({ isOpen, onClose, activeModel, onModelSelect }: SkillsPanelProps) {
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedModel, setSelectedModel] = useState<string>(activeModel || 'all');

  // Filter skills based on search, category, and model
  const filteredSkills = useMemo(() => {
    let result = skills;

    // Filter by category
    if (activeCategory !== 'all') {
      result = result.filter(s => s.category === activeCategory);
    }

    // Filter by model
    if (selectedModel !== 'all') {
      const model = models.find(m => m.id === selectedModel);
      if (model) {
        result = result.filter(s => Array.isArray(model.skills) && model.skills.includes(s.id));
      }
    }

    // Filter by search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(s =>
        s.name.includes(q) ||
        s.nameEn.toLowerCase().includes(q) ||
        s.description.includes(q) ||
        s.descriptionEn.toLowerCase().includes(q)
      );
    }

    return result;
  }, [activeCategory, searchQuery, selectedModel]);

  // Get models that support a specific skill
  const getModelsForSkill = (skillId: string) => {
    return models.filter(m => Array.isArray(m.skills) && m.skills.includes(skillId));
  };

  if (!isOpen) return null;

  return (
    <div
      className="w-[340px] border-l border-border/60 dark:border-white/10 bg-card bg-gradient-to-br from-card via-card to-muted/30 flex flex-col h-full overflow-hidden shadow-2xl shadow-blue-900/20 dark:shadow-blue-950/40"
      dir="rtl"
    >
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-lg flex items-center gap-2 text-foreground">
            <Sparkles className="w-5 h-5 text-blue-500" />
            مهارات Anzaro AI
          </h3>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="إغلاق">
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Search */}
        <div className="relative mb-3">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="ابحث عن مهارة..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pr-9 text-sm"
          />
        </div>

        {/* Model Filter */}
        <div className="relative">
          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            className="w-full text-sm bg-muted border border-border rounded-md px-3 py-2 appearance-none cursor-pointer text-foreground"
          >
            <option value="all">كل النماذج</option>
            {models.map(m => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        </div>
      </div>

      {/* Category Tabs */}
      <div className="flex gap-1 p-2 border-b border-border overflow-x-auto">
        <button
          onClick={() => setActiveCategory('all')}
          className={`px-3 py-1.5 text-xs rounded-full whitespace-nowrap transition-colors ${
            activeCategory === 'all'
              ? 'bg-blue-500 text-white'
              : 'bg-muted text-muted-foreground hover:bg-accent'
          }`}
        >
          الكل ({skills.length})
        </button>
        {SKILL_CATEGORIES.map(cat => {
          const count = skills.filter(s => s.category === cat.id).length;
          return (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`px-3 py-1.5 text-xs rounded-full whitespace-nowrap transition-colors ${
                activeCategory === cat.id
                  ? 'bg-blue-500 text-white'
                  : 'bg-muted text-muted-foreground hover:bg-accent'
              }`}
            >
              {cat.name} ({count})
            </button>
          );
        })}
      </div>

      {/* Skills List */}
      <ScrollArea className="flex-1 min-h-0 p-3">
        <div className="space-y-2">
          {filteredSkills.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <p>لا توجد مهارات مطابقة</p>
            </div>
          ) : (
            filteredSkills.map(skill => {
              const supportingModels = getModelsForSkill(skill.id);
              const activeModelObj = activeModel ? models.find(m => m.id === activeModel) : undefined;
              const isSupportedByActiveModel = activeModelObj
                ? Array.isArray(activeModelObj.skills) && activeModelObj.skills.includes(skill.id)
                : false;

              return (
                <motion.div
                  key={skill.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`p-3 rounded-lg border transition-all hover:shadow-md ${
                    isSupportedByActiveModel
                      ? 'border-blue-500 bg-blue-500/[0.07]'
                      : 'border-border bg-card'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <span className="text-xl flex-shrink-0">{skill.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-sm text-foreground">{skill.name}</span>
                        <span className="text-[10px] text-gray-400">{skill.nameEn}</span>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed mb-2">
                        {skill.description}
                      </p>

                      {/* SDK Method & Route */}
                      {skill.sdkMethod && (
                        <div className="text-[10px] font-mono text-blue-600 dark:text-blue-400 mb-2 bg-blue-50 dark:bg-blue-900 px-2 py-0.5 rounded">
                          {skill.sdkMethod}
                        </div>
                      )}

                      {/* Status Badge */}
                      <div className="flex items-center gap-1 mb-2">
                        {skill.isImplemented ? (
                          <Badge variant="outline" className="text-[10px] gap-1 border-blue-300 text-blue-600 dark:border-blue-700 dark:text-blue-400">
                            <CheckCircle2 className="w-3 h-3" /> متاح
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] gap-1 border-gray-300 text-gray-400">
                            <Clock className="w-3 h-3" /> قريباً
                          </Badge>
                        )}
                      </div>

                      {/* Supporting Models */}
                      {supportingModels.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {supportingModels.slice(0, 8).map(m => (
                            <button
                              key={m.id}
                              onClick={() => onModelSelect?.(m.id)}
                              className="text-[10px] px-1.5 py-0.5 rounded bg-muted hover:bg-accent transition-colors cursor-pointer"
                              title={`${m.name} — ${m.rank}`}
                            >
                              {m.name}
                            </button>
                          ))}
                          {supportingModels.length > 8 && (
                            <span className="text-[10px] text-gray-400">
                              +{supportingModels.length - 8}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })
          )}
        </div>
      </ScrollArea>

      {/* Footer Stats */}
      <div className="p-3 border-t border-border text-center">
        <p className="text-xs text-gray-400">
          {skills.filter(s => s.isImplemented).length} مهارة متاحة من أصل {skills.length}
        </p>
      </div>
    </div>
  );
}
