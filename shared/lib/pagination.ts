export const loadAllPages = async <Row>(
  loadPage: (offset: number, pageSize: number) => PromiseLike<Row[]>,
  pageSize = 1_000,
): Promise<Row[]> => {
  const rows: Row[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const page = await loadPage(offset, pageSize);
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
};
