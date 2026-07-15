import Link from "next/link";

export function HistoryFilters({ basePath, q, from, to, page, pageSize, total, placeholder = "搜尋單號或備註…" }: {
  basePath: string; q: string; from: string; to: string; page: number; pageSize: number; total: number; placeholder?: string;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const href = (nextPage: number) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (nextPage > 1) params.set("page", String(nextPage));
    const query = params.toString();
    return query ? `${basePath}?${query}` : basePath;
  };
  return <div className="history-controls">
    <form className="history-filter-form">
      <input className="input" name="q" defaultValue={q} placeholder={placeholder}/>
      <input className="input" name="from" type="date" defaultValue={from} aria-label="開始日期"/>
      <input className="input" name="to" type="date" defaultValue={to} aria-label="結束日期"/>
      <button className="btn primary">搜尋</button>
      {(q || from || to) && <Link className="btn" href={basePath}>清除</Link>}
    </form>
    <div className="pagination"><span>共 {total} 筆・第 {Math.min(page, pages)}／{pages} 頁</span>{page > 1 ? <Link className="btn sm" href={href(page - 1)}>上一頁</Link> : <span className="btn sm disabled">上一頁</span>}{page < pages ? <Link className="btn sm" href={href(page + 1)}>下一頁</Link> : <span className="btn sm disabled">下一頁</span>}</div>
  </div>;
}
