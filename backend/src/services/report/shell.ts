import { esc, icon } from '../report-components.ts';

export function pageShell(title: string, body: string): string {
  return `<!doctype html>
<html lang="pl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&display=swap">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/core@1/dist/css/tabler.min.css">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3/dist/tabler-icons.min.css">
<style>
  body { font-family: 'JetBrains Mono', ui-monospace, monospace; }
  [data-bs-toggle="collapse"] .ti-chevron-down { transition: transform .2s ease; }
  [data-bs-toggle="collapse"]:not(.collapsed) .ti-chevron-down { transform: rotate(180deg); }
  .timeline-spacer { border-top: 1px dashed var(--tblr-border-color); margin: .5rem 0; }
  main > .card { margin-bottom: 1rem; }
  .sort-indicators { display: inline-flex; flex-direction: column; gap: 3px; line-height: 1; margin-left: .4rem; vertical-align: middle; font-size: 9px; }
  .sort-indicators .sort-asc, .sort-indicators .sort-desc { color: var(--tblr-secondary-color); opacity: .5; }
  thead th.sorted-asc .sort-asc, thead th.sorted-desc .sort-desc { opacity: 1; color: var(--tblr-primary); }
  thead th.sorted-asc, thead th.sorted-desc { background: var(--tblr-primary-bg-subtle, rgba(6, 111, 209, 0.08)); }
  thead th { white-space: nowrap; }
  .qty-change { display: block; line-height: 1.1; }
  .qty-range { display: block; font-size: 10px; opacity: .75; color: var(--tblr-secondary-color); }
  .table-pager { display: flex; align-items: center; justify-content: flex-end; gap: .35rem; padding: .5rem 0; }
</style>
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
<script src="https://cdn.jsdelivr.net/npm/apexcharts@6/dist/apexcharts.min.js"></script>
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
document.addEventListener('keydown', function (event) {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  const target = event.target;
  if (target === null || target.closest === undefined) return;
  const toggle = target.closest('[data-bs-toggle="collapse"][role="button"]');
  if (toggle === null) return;
  event.preventDefault();
  toggle.click();
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
function tableCellText(cell) {
  var el = cell.querySelector('[data-sort-value]');
  if (el !== null && el !== undefined) return el.getAttribute('data-sort-value') || '';
  return (cell.textContent || '').trim();
}
function toNum(v) {
  var n = parseFloat(String(v).replace(/[^0-9.,-]/g, '').replace(',', '.'));
  return Number.isNaN(n) ? null : n;
}
function enhanceTable(table) {
  var thead = table.querySelector('thead');
  if (thead === null) return;
  var ths = Array.prototype.slice.call(thead.querySelectorAll('th'));
  var state = { col: -1, dir: 1, page: 0 };
  ths.forEach(function (th, index) {
    th.style.cursor = 'pointer';
    th.setAttribute('tabindex', '0');
    th.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); sortTableByIndex(table, index); }
    });
    var def = th.getAttribute('data-default-sort');
    if (def === 'asc' || def === 'desc') {
      state.col = index;
      state.dir = def === 'asc' ? 1 : -1;
    }
  });
  table.__state = state;
  table.__ths = ths;
  table.__render = function () { renderTable(table); };
  if (state.col >= 0) sortTableByIndex(table, state.col, false);
  renderTable(table);
}
function tableRows(table) {
  var tbody = table.querySelector('tbody');
  var units = [];
  if (tbody === null) return units;
  var children = Array.prototype.slice.call(tbody.children);
  for (var i = 0; i < children.length; i++) {
    var tr = children[i];
    if (tr.getAttribute('data-pair') === '1' && units.length > 0) {
      units[units.length - 1].pair = tr;
      continue;
    }
    units.push({ row: tr, pair: null });
  }
  return units;
}
function valueOf(unit, col) {
  var cell = unit.row.children[col];
  return cell === undefined || cell === null ? '' : tableCellText(cell);
}
function sortTableByIndex(table, col, toggle) {
  var state = table.__state;
  if (state === undefined || col < 0) return;
  if (toggle !== false) {
    state.dir = state.col === col ? (state.dir === 1 ? -1 : 1) : 1;
  } else {
    state.dir = state.col === col ? state.dir : 1;
  }
  state.col = col;
  state.page = 0;
  var units = tableRows(table);
  var ths = table.__ths;
  var numeric = ths[col] !== undefined && ths[col].getAttribute('data-sort-type') === 'number';
  if (!numeric) {
    var numericCount = 0;
    for (var ni = 0; ni < units.length; ni++) {
      if (toNum(valueOf(units[ni], col)) !== null) numericCount += 1;
    }
    numeric = units.length >= 3 && numericCount >= Math.ceil(units.length / 2);
  }
  units.sort(function (a, b) {
    var av = valueOf(a, col);
    var bv = valueOf(b, col);
    if (av === bv) return 0;
    if (av === '') return 1;
    if (bv === '') return -1;
    var cmp;
    if (numeric) {
      var an = toNum(av);
      var bn = toNum(bv);
      cmp = (an === null ? 0 : an) - (bn === null ? 0 : bn);
    } else {
      cmp = av.localeCompare(bv, 'pl');
    }
    return cmp * state.dir;
  });
  var tbody = table.querySelector('tbody');
  if (tbody !== null) {
    for (var i = 0; i < units.length; i++) {
      tbody.appendChild(units[i].row);
      if (units[i].pair !== null) tbody.appendChild(units[i].pair);
    }
  }
  renderTable(table, units);
}
function renderTable(table, units) {
  var state = table.__state;
  if (state === undefined) return;
  var pageSize = parseInt(table.getAttribute('data-page-size') || '0', 10);
  var ths = table.__ths;
  ths.forEach(function (th, i) {
    th.classList.remove('sorted-asc', 'sorted-desc');
    if (i === state.col) th.classList.add(state.dir === 1 ? 'sorted-asc' : 'sorted-desc');
  });
  if (units === undefined) units = tableRows(table);
  var ordered = [];
  var wrap = table.closest('[data-table-wrap]');
  var text = wrap === null ? '' : (wrap.getAttribute('data-filter') || '').toLowerCase();
  var lowOnly = wrap !== null && wrap.getAttribute('data-low') === '1';
  var typeFilter = wrap === null ? '' : (wrap.getAttribute('data-type-filter') || '');
  for (var i = 0; i < units.length; i++) {
    var u = units[i];
    var show = true;
    if (text !== '' && (u.row.getAttribute('data-search') || '').toLowerCase().indexOf(text) === -1) show = false;
    if (show && lowOnly && u.row.getAttribute('data-lowqty') !== '1') show = false;
    if (show && typeFilter !== '' && u.row.getAttribute('data-type') !== typeFilter) show = false;
    if (show) ordered.push(u);
  }
  var shownRows = {};
  if (pageSize > 0) {
    var total = ordered.length;
    var pages = Math.max(1, Math.ceil(total / pageSize));
    state.page = Math.min(state.page, pages - 1);
    for (var j = 0; j < ordered.length; j++) {
      if (j >= state.page * pageSize && j < (state.page + 1) * pageSize) shownRows[ordered[j].row] = true;
    }
    renderPager(table, total, pages);
  } else {
    for (var l = 0; l < ordered.length; l++) shownRows[ordered[l].row] = true;
  }
  for (var k = 0; k < units.length; k++) {
    var visible = shownRows[units[k].row] === true;
    units[k].row.style.display = visible ? '' : 'none';
    if (units[k].pair !== null) units[k].pair.style.display = visible ? '' : 'none';
  }
}
function renderPager(table, total, pages) {
  var state = table.__state;
  var pageSize = parseInt(table.getAttribute('data-page-size') || '0', 10);
  var pager = table.nextElementSibling;
  if (pager === null || pager.classList === undefined || !pager.classList.contains('table-pager')) {
    pager = document.createElement('div');
    pager.className = 'table-pager';
    table.parentNode.insertBefore(pager, table.nextSibling);
  }
  var from = total === 0 ? 0 : state.page * pageSize + 1;
  var to = Math.min(total, (state.page + 1) * pageSize);
  var html = '<span class="text-secondary fs-6 me-auto">Pokazano ' + from + '–' + to + ' z ' + total + ' pozycji.</span>';
  html += '<button class="btn btn-sm btn-outline-secondary" data-pager-prev aria-label="Poprzednia strona">‹</button>';
  html += '<span class="text-secondary fs-6">' + (state.page + 1) + ' / ' + pages + '</span>';
  html += '<button class="btn btn-sm btn-outline-secondary" data-pager-next aria-label="Następna strona">›</button>';
  pager.innerHTML = html;
  var prev = pager.querySelector('[data-pager-prev]');
  var next = pager.querySelector('[data-pager-next]');
  prev.disabled = state.page <= 0;
  next.disabled = state.page >= pages - 1;
  prev.onclick = function () { state.page = Math.max(0, state.page - 1); renderTable(table); };
  next.onclick = function () { state.page = Math.min(pages - 1, state.page + 1); renderTable(table); };
}
function enhanceAllTables() {
  document.querySelectorAll('table[data-sortable]').forEach(enhanceTable);
}
function filterChangesByType(value) {
  var wraps = document.querySelectorAll('#changes-tables [data-table-wrap]');
  Array.prototype.forEach.call(wraps, function (wrap) {
    wrap.setAttribute('data-type-filter', value);
    var table = wrap.querySelector('table[data-sortable]');
    if (table !== null && table.__render !== undefined) table.__render();
  });
}
document.addEventListener('click', function (event) {
  const target = event.target;
  if (target === null || target.closest === undefined) return;
  var th = target.closest('th');
  if (th !== null) {
    var table = th.closest('table[data-sortable]');
    if (table !== null && table.__state !== undefined) {
      var index = Array.prototype.indexOf.call(table.querySelectorAll('thead th'), th);
      if (index >= 0) { sortTableByIndex(table, index); return; }
    }
  }
  var btn = target.closest('[data-series-product]');
  if (btn !== null) {
    loadSeries(btn, btn.dataset.seriesShop, btn.dataset.seriesProduct);
    return;
  }
  var metric = target.closest('[data-top-metric]');
  if (metric !== null) {
    var table = document.querySelector(metric.getAttribute('data-table-target'));
    if (table !== null && table.__ths !== undefined) {
      var th = table.querySelector('th[data-metric="' + metric.getAttribute('data-top-metric') + '"]');
      if (th !== null) th.click();
    }
    var group = metric.closest('[data-top-metric-group]');
    if (group !== null) {
      Array.prototype.slice.call(group.querySelectorAll('[data-top-metric]')).forEach(function (b) {
        b.classList.toggle('active', b === metric);
      });
    }
    return;
  }
});
document.addEventListener('input', function (event) {
  var t = event.target;
  if (t === null || t.matches === undefined || !t.matches('[data-table-filter]')) return;
  var table = document.querySelector(t.getAttribute('data-table-filter'));
  if (table === null || table.__render === undefined) return;
  var wrap = table.closest('[data-table-wrap]');
  if (wrap !== null) wrap.setAttribute('data-filter', t.value);
  table.__render();
});
document.addEventListener('change', function (event) {
  var t = event.target;
  if (t === null || t.matches === undefined || !t.matches('[data-table-low]')) return;
  var table = document.querySelector(t.getAttribute('data-table-low'));
  if (table === null || table.__render === undefined) return;
  var wrap = table.closest('[data-table-wrap]');
  if (wrap !== null) wrap.setAttribute('data-low', t.checked ? '1' : '0');
  table.__render();
});
document.addEventListener('DOMContentLoaded', enhanceAllTables);
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
