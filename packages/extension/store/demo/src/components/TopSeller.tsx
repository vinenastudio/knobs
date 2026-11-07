import { t } from '../i18n';

function reorder() {
  fetch('/api/stock/reorder', {
    body: JSON.stringify({ sku: 'eth-guji-250' }),
    method: 'POST',
  }).catch(() => {});
}

export function TopSeller() {
  return (
    <section className="card side">
      <h2>{t.top}</h2>
      <div className="product">
        <i />
        <div>
          <span>{t.bean}</span>
          <small>{t.sold}</small>
        </div>
      </div>
      <button className="btn" id="reorder" onClick={reorder} type="button">
        {t.reorder}
      </button>
      <div className="map">
        <span className="pin" />
      </div>
    </section>
  );
}
