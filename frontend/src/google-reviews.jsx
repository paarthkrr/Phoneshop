// Live Google reviews strip for the homepage. Reads /public/reviews (the server asks Google's
// Places API and caches it). Shows nothing at all until the shop's Places key and place id are
// set on the server, or if Google returns no reviews — never placeholder or made-up reviews.
import React, { useEffect, useState } from "react";
import { GOOGLE_REVIEW_URL } from "./business-info.js";

const CSS = `
.gr{background:var(--mr-surface);padding:44px 20px 40px;border-top:1px solid var(--mr-line)}
.gr-in{max-width:1120px;margin:0 auto}
.gr-head{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:18px}
.gr-kicker{font-size:12px;letter-spacing:.22em;color:#7a1630;font-weight:700;margin-bottom:6px}
.gr-title{font-family:'Archivo Black',sans-serif;font-size:clamp(22px,3vw,30px);margin:0;color:var(--mr-text)}
.gr-score{display:flex;align-items:center;gap:10px;margin-top:8px;font-size:14.5px;color:#374151}
.gr-score b{font-size:22px;color:var(--mr-text)}
.gr-stars{color:#F5A623;letter-spacing:1px}
.gr-links{display:flex;gap:10px;flex-wrap:wrap}
.gr-links a{display:inline-flex;align-items:center;min-height:44px;padding:0 18px;border-radius:999px;font-weight:700;font-size:14px;text-decoration:none}
.gr-links .p{background:#0f1115;color:#fff}.gr-links .s{border:1px solid var(--mr-line);color:var(--mr-text)}
.gr-row{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(260px,1fr);gap:14px;overflow-x:auto;scroll-snap-type:x mandatory;padding-bottom:8px;-webkit-overflow-scrolling:touch}
.gr-card{scroll-snap-align:start;border:1px solid var(--mr-line);border-radius:16px;padding:16px;background:var(--mr-surface-2);display:flex;flex-direction:column;gap:8px;min-height:170px}
.gr-who{display:flex;align-items:center;gap:10px;font-weight:700;font-size:14px;color:var(--mr-text)}
.gr-who img,.gr-who i{width:32px;height:32px;border-radius:50%;flex:none;background:#E5E7EB;display:block}
.gr-who a{color:inherit;text-decoration:none}
.gr-when{font-size:12px;color:var(--mr-muted);font-weight:500}
.gr-text{font-size:14px;line-height:1.5;color:#374151;display:-webkit-box;-webkit-line-clamp:6;-webkit-box-orient:vertical;overflow:hidden}
.gr-attr{font-size:11.5px;color:var(--mr-muted);margin-top:10px}
@media (min-width:1000px){ .gr-row{grid-auto-flow:row;grid-template-columns:repeat(3,1fr);overflow:visible} .gr-row .gr-card:nth-child(n+4){display:none} }
`;

const stars = (n) => "★★★★★".slice(0, Math.round(n)) + "☆☆☆☆☆".slice(0, 5 - Math.round(n));

export default function GoogleReviews() {
  const [data, setData] = useState(null);
  useEffect(() => {
    let alive = true;
    const base = window.SHOP_API_BASE_URL || "";
    fetch(`${base}/public/reviews`).then((r) => (r.ok ? r.json() : null)).then((j) => { if (alive) setData(j); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  if (!data || !data.configured || !data.reviews || !data.reviews.length) return null;
  return (
    <section className="gr" aria-label="Google reviews">
      <style>{CSS}</style>
      <div className="gr-in">
        <div className="gr-head">
          <div>
            <div className="gr-kicker">WHAT CUSTOMERS SAY</div>
            <h2 className="gr-title">Reviews on Google</h2>
            {data.rating && (
              <div className="gr-score"><b>{data.rating.toFixed(1)}</b><span className="gr-stars" aria-hidden="true">{stars(data.rating)}</span>
                <span>{data.count ? `${data.count.toLocaleString()} Google reviews` : "Google rating"}</span></div>
            )}
          </div>
          <div className="gr-links">
            {data.url && <a className="s" href={data.url} target="_blank" rel="noopener noreferrer">Read all on Google</a>}
            <a className="p" href={GOOGLE_REVIEW_URL} target="_blank" rel="noopener noreferrer">Write a review</a>
          </div>
        </div>
        <div className="gr-row">
          {data.reviews.map((r, i) => (
            <figure key={i} className="gr-card" style={{ margin: 0 }}>
              <figcaption className="gr-who">
                {r.photo ? <img src={r.photo} alt="" width="32" height="32" loading="lazy" referrerPolicy="no-referrer" /> : <i aria-hidden="true" />}
                <span>{r.authorUrl ? <a href={r.authorUrl} target="_blank" rel="noopener noreferrer">{r.author}</a> : r.author}
                  <div className="gr-when">{r.when}</div></span>
              </figcaption>
              <div className="gr-stars" aria-label={`${r.rating} out of 5 stars`}>{stars(r.rating)}</div>
              {r.text && <blockquote className="gr-text" style={{ margin: 0 }}>{r.text}</blockquote>}
            </figure>
          ))}
        </div>
        <div className="gr-attr">Reviews and rating from Google, shown as Google provides them.</div>
      </div>
    </section>
  );
}
