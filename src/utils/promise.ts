export const mapConcurrently = async <T, R>(
  items: readonly T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> => {
  if (concurrency < 1) {
    throw new Error('Concurrency must be at least 1');
  }

  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  const worker = async () => {
    while (true) {
      const currentIndex = nextIndex;

      if (currentIndex >= items.length) {
        return;
      }

      nextIndex += 1;

      const item = items[currentIndex]!;
      results[currentIndex] = await mapper(item, currentIndex);
    }
  };

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());

  await Promise.all(workers);

  return results;
};
