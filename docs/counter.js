// サイト全体の累計アクセス数を表示する。外部の無料カウンターAPI(登録不要)に
// ページ読み込みのたびにヒットを送り、返ってきた累計値を id="pageViewCount" に表示する。
// 厳密なユニーク訪問者数ではなく、素朴な累計ページビュー数(同じ人の再訪問・別ページ遷移も
// それぞれ1カウントされる)。
(function () {
  var NAMESPACE = 'tokyo-bay-fishing-kakeru110';
  var KEY = 'total-pageviews';
  var el = document.getElementById('pageViewCount');
  if (!el) return;

  fetch('https://abacus.jasoncameron.dev/hit/' + NAMESPACE + '/' + KEY)
    .then(function (res) { return res.json(); })
    .then(function (data) {
      if (typeof data.value === 'number') {
        el.textContent = data.value.toLocaleString('ja-JP');
      }
    })
    .catch(function () {
      el.textContent = '-';
    });
})();
