// Shared state/data/filter logic for both index.html (実績) and analysis.html (分析).
// Filter state (days/species/funayado) is synced to the URL query string so
// navigating between the two pages keeps the same view.
window.TBF = (function () {
  const CATCHES = window.CATCHES || [];
  const SOURCES = window.SOURCES || {};
  const WEATHER = window.WEATHER || {};
  const GENERATED_AT = window.GENERATED_AT || null;

  const allSpecies = Array.from(new Set(CATCHES.map(r => r.species).filter(Boolean))).sort();
  const allFunayado = Array.from(new Set(CATCHES.map(r => r.funayado).filter(Boolean)));
  const allDates = CATCHES.map(r => r.date).filter(Boolean).sort();
  const minDate = allDates[0] || null;
  const maxDate = allDates[allDates.length - 1] || null;

  const qp = new URLSearchParams(location.search);
  const hasRange = qp.has('from') || qp.has('to');
  const state = {
    periodMode: hasRange ? 'range' : 'preset',
    days: qp.has('days') ? Number(qp.get('days')) : 30,
    dateFrom: qp.get('from') || minDate,
    dateTo: qp.get('to') || maxDate,
    species: new Set(),
    funayado: new Set(),
  };
  if (qp.has('species')) {
    const sel = new Set(qp.get('species').split(',').filter(Boolean));
    allSpecies.forEach(s => { if (sel.has(s)) state.species.add(s); });
  } else {
    allSpecies.forEach(s => state.species.add(s));
  }
  if (qp.has('funayado')) {
    const sel = new Set(qp.get('funayado').split(',').filter(Boolean));
    allFunayado.forEach(f => { if (sel.has(f)) state.funayado.add(f); });
  } else {
    allFunayado.forEach(f => state.funayado.add(f));
  }

  function currentQueryString() {
    const p = new URLSearchParams();
    if (state.periodMode === 'range') {
      if (state.dateFrom) p.set('from', state.dateFrom);
      if (state.dateTo) p.set('to', state.dateTo);
    } else {
      p.set('days', state.days);
    }
    if (state.species.size !== allSpecies.length) p.set('species', Array.from(state.species).join(','));
    if (state.funayado.size !== allFunayado.length) p.set('funayado', Array.from(state.funayado).join(','));
    return p.toString();
  }

  function syncUrlAndNav() {
    const qs = currentQueryString();
    history.replaceState(null, '', qs ? `?${qs}` : location.pathname);
    document.querySelectorAll('[data-nav-page]').forEach(a => {
      const base = a.dataset.navPage;
      a.href = qs ? `${base}?${qs}` : base;
    });
  }
  syncUrlAndNav();

  function todayJstStr() {
    // JST = UTC+9, no DST
    const jstNow = new Date(Date.now() + 9 * 3600000);
    return jstNow.toISOString().slice(0, 10);
  }

  function yesterdayJstStr() {
    const jstYesterday = new Date(Date.now() + 9 * 3600000 - 86400000);
    return jstYesterday.toISOString().slice(0, 10);
  }

  function withinPeriod(dateStr) {
    if (!dateStr) return false;
    if (state.periodMode === 'range') {
      if (state.dateFrom && dateStr < state.dateFrom) return false;
      if (state.dateTo && dateStr > state.dateTo) return false;
      return true;
    }
    if (state.days === 0) return dateStr === todayJstStr();
    if (state.days === -1) return dateStr === yesterdayJstStr();
    if (state.days >= 9999) return true;
    const d = new Date(dateStr + 'T00:00:00+09:00');
    const now = new Date();
    const diffDays = (now - d) / 86400000;
    return diffDays >= -1 && diffDays <= state.days;
  }

  function filteredRecords() {
    return CATCHES.filter(r =>
      withinPeriod(r.date) &&
      state.species.has(r.species) &&
      state.funayado.has(r.funayado)
    );
  }

  function fmtRange(min, max, unit) {
    if (min == null && max == null) return '-';
    if (min == null) return `${max}${unit || ''}`;
    if (max == null) return `${min}${unit || ''}`;
    if (min === max) return `${min}${unit || ''}`;
    return `${min}〜${max}${unit || ''}`;
  }

  function displayGroundLabel(r) {
    const port = (SOURCES[r.funayado] || {}).port;
    if (!r.ground_text) return port ? `${port}港周辺` : '不明';
    // Pier/breakwater fishing (各堤・桟橋 etc.) has no offshore ground name, so the
    // pipeline falls back to the boat's home port coordinates; prefix the port name
    // so "各堤" alone doesn't read as an unlabeled, ambiguous location.
    if (r.geocode_match === 'fallback_port' && port && !r.ground_text.includes(port)) {
      return `${port}港 ${r.ground_text}`;
    }
    return r.ground_text;
  }

  function rangeBucket(map, key, unit, lo, hi) {
    const entry = map[key] || (map[key] = {});
    const b = entry[unit] || (entry[unit] = { min: Infinity, max: -Infinity, sum: 0, count: 0 });
    b.min = Math.min(b.min, lo);
    b.max = Math.max(b.max, hi);
    b.sum += (lo + hi) / 2;
    b.count += 1;
  }

  // --- Filter chip UI (only wired up on pages that have these DOM elements) ---
  const chipConfigs = {};
  const countElIds = { speciesChips: 'speciesCount', funayadoChips: 'funayadoCount' };

  function updateFilterCount(containerId) {
    const countEl = document.getElementById(countElIds[containerId]);
    const cfg = chipConfigs[containerId];
    if (!countEl || !cfg) return;
    countEl.textContent = `${cfg.activeSet.size}/${cfg.values.length}`;
  }

  function buildChips(containerId, values, activeSet, labelFn, onChange) {
    chipConfigs[containerId] = { values, activeSet, labelFn };
    const container = document.getElementById(containerId);
    container.innerHTML = '';
    values.forEach(v => {
      const chip = document.createElement('div');
      chip.className = 'chip' + (activeSet.has(v) ? ' active' : '');
      chip.textContent = labelFn ? labelFn(v) : v;
      chip.dataset.value = v;
      chip.addEventListener('click', () => {
        if (activeSet.has(v)) activeSet.delete(v); else activeSet.add(v);
        chip.classList.toggle('active');
        updateFilterCount(containerId);
        onChange();
      });
      container.appendChild(chip);
    });
    updateFilterCount(containerId);
  }

  function initFilterUI(onChangeRaw) {
    if (!document.getElementById('speciesChips')) return; // this page has no filter UI
    const onChange = () => { syncUrlAndNav(); onChangeRaw(); };

    buildChips('speciesChips', allSpecies, state.species, null, onChange);
    buildChips('funayadoChips', allFunayado, state.funayado, f => (SOURCES[f] && SOURCES[f].name) || f, onChange);

    document.querySelectorAll('.select-all-buttons button').forEach(btn => {
      btn.addEventListener('click', () => {
        const target = btn.dataset.target; // "species" | "funayado"
        const containerId = target === 'species' ? 'speciesChips' : 'funayadoChips';
        const cfg = chipConfigs[containerId];
        cfg.activeSet.clear();
        if (btn.dataset.mode === 'all') cfg.values.forEach(v => cfg.activeSet.add(v));
        buildChips(containerId, cfg.values, cfg.activeSet, cfg.labelFn, onChange);
        onChange();
      });
    });

    function updatePeriodButtonsActive() {
      document.querySelectorAll('#periodButtons button').forEach(b => {
        b.classList.toggle('active', state.periodMode === 'preset' && Number(b.dataset.days) === state.days);
      });
    }
    updatePeriodButtonsActive();

    document.querySelectorAll('#periodButtons button').forEach(btn => {
      btn.addEventListener('click', () => {
        state.periodMode = 'preset';
        state.days = Number(btn.dataset.days);
        updatePeriodButtonsActive();
        onChange();
      });
    });

    const dateFromEl = document.getElementById('dateFrom');
    const dateToEl = document.getElementById('dateTo');
    if (dateFromEl && dateToEl) {
      if (minDate) { dateFromEl.min = minDate; dateToEl.min = minDate; }
      if (maxDate) { dateFromEl.max = maxDate; dateToEl.max = maxDate; }
      if (state.periodMode === 'range') {
        if (state.dateFrom) dateFromEl.value = state.dateFrom;
        if (state.dateTo) dateToEl.value = state.dateTo;
      }
      const onDateChange = () => {
        if (!dateFromEl.value || !dateToEl.value) return;
        state.periodMode = 'range';
        state.dateFrom = dateFromEl.value;
        state.dateTo = dateToEl.value;
        updatePeriodButtonsActive();
        onChange();
      };
      dateFromEl.addEventListener('change', onDateChange);
      dateToEl.addEventListener('change', onDateChange);
    }
  }

  function renderHeaderMeta() {
    const lastUpdatedEl = document.getElementById('lastUpdated');
    if (lastUpdatedEl) {
      lastUpdatedEl.textContent = GENERATED_AT ? `最終更新: ${GENERATED_AT}` : '最終更新: 不明';
    }
    const sourceCountEl = document.getElementById('sourceCount');
    if (sourceCountEl) sourceCountEl.textContent = Object.keys(SOURCES).length;
    const recordCountEl = document.getElementById('recordCount');
    if (recordCountEl) recordCountEl.textContent = CATCHES.length;
  }
  renderHeaderMeta();

  function renderFilterSummary(elId) {
    const el = document.getElementById(elId);
    if (!el) return;
    const periodLabel = state.periodMode === 'range'
      ? `${state.dateFrom || '?'}〜${state.dateTo || '?'}`
      : state.days === 0 ? '今日' : state.days === -1 ? '昨日' : state.days >= 9999 ? '全期間' : `直近${state.days}日`;
    el.textContent = `絞り込み中: ${periodLabel} / 魚種${state.species.size}/${allSpecies.length} / 船宿${state.funayado.size}/${allFunayado.length}`;
  }

  // --- Amazon アフィリエイト用のギア推薦カード(実績・分析どちらのページからも呼べる) ---
  function amazonSearchUrl(keyword) {
    const tag = window.AMAZON_ASSOCIATE_TAG || '';
    const params = new URLSearchParams({ k: keyword, tag });
    return `https://www.amazon.co.jp/s?${params.toString()}`;
  }

  function productCardHtml(item, species) {
    const tag = window.AMAZON_ASSOCIATE_TAG || '';
    const url = `https://www.amazon.co.jp/dp/${item.asin}?tag=${tag}`;
    return `
      <a class="gear-card gear-product" href="${url}" target="_blank" rel="noopener sponsored">
        ${species ? `<div class="gear-species">${species}</div>` : ''}
        <img class="gear-product-img" src="${item.image}" alt="${item.title}" loading="lazy">
        <div class="gear-label">${item.title}</div>
        <div class="gear-cta">Amazonで見る →</div>
      </a>
    `;
  }

  function keywordCardHtml(item, species) {
    return `
      <a class="gear-card" href="${amazonSearchUrl(item.keyword)}" target="_blank" rel="noopener sponsored">
        ${species ? `<div class="gear-species">${species}</div>` : ''}
        <div class="gear-label">${item.label}</div>
        <div class="gear-cta">Amazonで見る →</div>
      </a>
    `;
  }

  function renderGearRecommendations(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const GEAR_RECOMMENDATIONS = window.GEAR_RECOMMENDATIONS || {};
    const GEAR_PRODUCTS = window.GEAR_PRODUCTS || {};
    const GEAR_DEFAULT = window.GEAR_DEFAULT || [];

    const records = filteredRecords();
    const speciesTotals = {};
    records.forEach(r => { if (r.species) speciesTotals[r.species] = (speciesTotals[r.species] || 0) + 1; });
    const topSpecies = Object.entries(speciesTotals)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([sp]) => sp);

    const cardsHtml = [];
    const seenKeys = new Set();

    topSpecies.forEach(sp => {
      const products = GEAR_PRODUCTS[sp];
      if (products && products.length) {
        products.forEach(item => {
          if (seenKeys.has(item.asin)) return;
          seenKeys.add(item.asin);
          cardsHtml.push(productCardHtml(item, sp));
        });
      } else {
        (GEAR_RECOMMENDATIONS[sp] || []).forEach(item => {
          if (seenKeys.has(item.keyword)) return;
          seenKeys.add(item.keyword);
          cardsHtml.push(keywordCardHtml(item, sp));
        });
      }
    });

    if (cardsHtml.length === 0) {
      GEAR_DEFAULT.forEach(item => {
        if (seenKeys.has(item.keyword)) return;
        seenKeys.add(item.keyword);
        cardsHtml.push(keywordCardHtml(item, null));
      });
    }

    container.innerHTML = cardsHtml.join('');
  }

  return {
    CATCHES, SOURCES, WEATHER, GENERATED_AT,
    state, allSpecies, allFunayado, minDate, maxDate,
    filteredRecords, fmtRange, displayGroundLabel, rangeBucket, todayJstStr, withinPeriod,
    syncUrlAndNav, initFilterUI, renderFilterSummary, renderGearRecommendations,
  };
})();
