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

  const qp = new URLSearchParams(location.search);
  const state = {
    days: qp.has('days') ? Number(qp.get('days')) : 30,
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
    p.set('days', state.days);
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

  function withinPeriod(dateStr) {
    if (!dateStr) return false;
    if (state.days === 0) return dateStr === todayJstStr();
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

    document.querySelectorAll('#periodButtons button').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#periodButtons button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.days = Number(btn.dataset.days);
        onChange();
      });
    });
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
    const periodLabel = state.days === 0 ? '今日' : state.days >= 9999 ? '全期間' : `直近${state.days}日`;
    el.textContent = `絞り込み中: ${periodLabel} / 魚種${state.species.size}/${allSpecies.length} / 船宿${state.funayado.size}/${allFunayado.length}`;
  }

  return {
    CATCHES, SOURCES, WEATHER, GENERATED_AT,
    state, allSpecies, allFunayado,
    filteredRecords, fmtRange, displayGroundLabel, rangeBucket, todayJstStr, withinPeriod,
    syncUrlAndNav, initFilterUI, renderFilterSummary,
  };
})();
