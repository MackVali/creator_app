export type EmbeddedMonumentPage<T> = {
  monuments: T[];
  pageStartIndex: number;
  showNewCard: boolean;
};

export function buildEmbeddedMonumentPages<T>(
  monuments: T[],
  pageSize: number
): EmbeddedMonumentPage<T>[] {
  const safePageSize = Math.max(1, pageSize);
  const pages: EmbeddedMonumentPage<T>[] = [];
  let pageMonuments: T[] = [];
  let pageStartIndex = 0;

  monuments.forEach((monument) => {
    if (pageMonuments.length === safePageSize) {
      pages.push({
        monuments: pageMonuments,
        pageStartIndex,
        showNewCard: false,
      });
      pageStartIndex += pageMonuments.length;
      pageMonuments = [];
    }

    pageMonuments.push(monument);
  });

  if (pageMonuments.length === safePageSize) {
    pages.push({
      monuments: pageMonuments,
      pageStartIndex,
      showNewCard: false,
    });
    pageStartIndex += pageMonuments.length;
    pageMonuments = [];
  }

  pages.push({
    monuments: pageMonuments,
    pageStartIndex,
    showNewCard: true,
  });

  return pages;
}
