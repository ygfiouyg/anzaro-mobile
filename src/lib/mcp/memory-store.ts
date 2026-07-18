/**
 * In-Memory Store — بديل لـ UserMemory لما مفيش user حقيقي
 * يستخدم في السيناريوهات اللي محتاجة تخزين مؤقت
 */
const store = new Map<string, Map<string, any>>();

export function getStore(namespace: string): Map<string, any> {
  if (!store.has(namespace)) {
    store.set(namespace, new Map());
  }
  return store.get(namespace)!;
}

export function setItem(namespace: string, key: string, value: any): void {
  getStore(namespace).set(key, value);
}

export function getItem(namespace: string, key: string): any | null {
  return getStore(namespace).get(key) || null;
}

export function getAllItems(namespace: string): Array<{ key: string; value: any }> {
  const items = getStore(namespace);
  return Array.from(items.entries()).map(([key, value]) => ({ key, value }));
}

export function searchItems(namespace: string, query: string): Array<{ key: string; value: any; score: number }> {
  const items = getAllItems(namespace);
  const qWords = query.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
  return items.map((item) => {
    const text = JSON.stringify(item.value).toLowerCase();
    const matches = qWords.filter((w) => text.includes(w)).length;
    return { ...item, score: qWords.length > 0 ? matches / qWords.length : 0 };
  }).filter((item) => item.score > 0).sort((a, b) => b.score - a.score);
}
