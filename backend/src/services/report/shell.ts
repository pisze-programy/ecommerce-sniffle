import { esc, icon } from '../report-components.ts';

export function pageShell(title: string, body: string): string {
  return `<!doctype html>
<html lang="pl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/core@1/dist/css/tabler.min.css">
</head>
<body>
<div class="page">
  <div class="page-wrapper">
    <a class="visually-hidden-focusable" href="#main-content">Przejdź do treści</a>
    <header class="navbar navbar-expand-lg navbar-light bg-white border-bottom sticky-top">
      <div class="container-xl">
        <a class="navbar-brand" href="/dashboard">ecommerce-sniffle</a>
        <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#main-nav" aria-controls="main-nav" aria-expanded="false"><span class="navbar-toggler-icon"></span></button>
        <div class="collapse navbar-collapse" id="main-nav">
          <form class="d-flex ms-auto mt-2 mt-lg-0" action="/search" method="get" role="search">
            <input class="form-control me-2" type="search" name="q" placeholder="szukaj produktu lub sklepu" aria-label="Szukaj produktu lub sklepu">
            <button class="btn btn-outline-secondary" type="submit">${icon('search')}</button>
          </form>
          <ul class="navbar-nav ms-lg-2">
            <li class="nav-item"><a class="nav-link" href="/dashboard">Dashboard</a></li>
          </ul>
        </div>
      </div>
    </header>
    <main id="main-content" class="container-xl py-3">
      ${body}
    </main>
  </div>
</div>
<script src="https://cdn.jsdelivr.net/npm/apexcharts@3/dist/apexcharts.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@tabler/core@1/dist/js/tabler.min.js"></script>
<script>
async function loadSeries(btn, shop, productId) {
  if (btn.dataset.loaded === '1') return;
  btn.dataset.loaded = '1';
  const holder = btn.parentElement.querySelector('.series');
  try {
    const res = await fetch('/series/' + encodeURIComponent(productId) + '?shop=' + encodeURIComponent(shop));
    const data = await res.json();
    if (!data.series || data.series.length === 0) { holder.innerHTML = '<p class="text-secondary fs-6">brak historii</p>'; return; }
    const labels = data.series.map((p) => (p.snapshotAt || '').slice(0, 16).replace('T', ' '));
    const qty = data.series.map((p) => (p.quantity === null ? null : p.quantity));
    const price = data.series.map((p) => (p.price === null ? null : p.price));
    if (window.ApexCharts) {
      const chartEl = document.createElement('div');
      holder.innerHTML = '';
      holder.appendChild(chartEl);
      new ApexCharts(chartEl, {
        chart: { type: 'line', height: 220, fontFamily: 'inherit', animations: { enabled: false }, toolbar: { show: false }, sparkline: { enabled: true } },
        series: [{ name: 'ilość', data: qty, yaxis: 0 }, { name: 'cena', data: price, yaxis: 1 }],
        xaxis: { categories: labels },
        stroke: { curve: 'straight', width: 2 },
        colors: ['#2fb344', '#4263eb'],
        tooltip: { theme: 'dark' },
        yaxis: [{}, { opposite: true }],
      }).render();
    } else {
      holder.innerHTML = '<p class="text-secondary fs-6">brak wykresu (apexcharts)</p>';
    }
  } catch (e) {
    console.error('series load failed', e);
    holder.innerHTML = '<p class="text-secondary fs-6">błąd ładowania historii</p>';
  }
}
document.addEventListener('click', function (event) {
  const target = event.target;
  if (target === null) return;
  const btn = target.closest('[data-series-product]');
  if (btn === null) return;
  loadSeries(btn, btn.dataset.seriesShop, btn.dataset.seriesProduct);
});
function toggleWindows(open) {
  document.querySelectorAll('#changes-windows .window-collapse').forEach(function (el) {
    if (open) { el.classList.add('show'); } else { el.classList.remove('show'); }
  });
}
function filterChanges(select) {
  var value = select.value;
  document.querySelectorAll('#changes-windows tr[data-type]').forEach(function (tr) {
    tr.style.display = value === '' || tr.getAttribute('data-type') === value ? '' : 'none';
  });
}
document.addEventListener('shown.bs.collapse', function (event) {
  var el = event.target;
  if (el === null || el.id === '' || el.id.indexOf('stock-') !== 0) return;
  var holder = el.querySelector('.stock-variants');
  if (holder === null || holder.dataset.loaded === '1') return;
  holder.dataset.loaded = '1';
  holder.innerHTML = '<div class="text-secondary fs-6">wczytywanie…</div>';
  fetch(holder.dataset.load).then(function (response) { return response.text(); }).then(function (html) { holder.innerHTML = html; }).catch(function () { holder.innerHTML = '<p class="text-secondary fs-6">błąd wczytywania</p>'; });
});
</script>
</body>
</html>`;
}
