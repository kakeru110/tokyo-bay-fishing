# 東京湾 船釣り釣果パイプライン ランブック

このドキュメントは、Claude Codeのクラウドスケジュールルーティン(RemoteTrigger/routines)が毎日実行する更新手順を定義したものです。このリポジトリ(GitHub: kakeru110/tokyo-bay-fishing)のcloneの上で動作し、Python/Node等の実行環境を使わず、Claude自身のWebFetch/Read/Write/Editツールで完結させます。最後にgit commit & pushしてリポジトリに反映することで、GitHub Pagesで公開している `docs/` の内容が更新されます。

## 全体の流れ
1. `data/sources.json` を読み、各船宿の feed_url / category_url を取得
2. 各ソースについて、WebFetchでRSS(またはHTMLページ)を取得し新着投稿を確認
3. `data/catches.json` に既存の `source_url` と重複しない新規投稿だけを抽出・パース
4. 新規レコードの `ground_text` を `data/fishing_grounds.json` の地名と照合して座標を付与する。実装は `data/species_aliases.json` と同様に読み込みのみで完結させ、スクリプト側に日本語リテラルを埋め込まない(後述の文字化け対策)。
   - `ground_text` が空の場合、まず同じ投稿(同じ funayado + source_url)内の他レコードに `ground_text` が入っていればそれを借りる(1つの釣行で釣り場は基本1箇所のため)。それでも空なら船宿の `port_lat`/`port_lon` にフォールバックし `geocode_match: "fallback_port"`
   - `ground_text` は「〜」「～」「~」「・」のいずれでも複数地名を分割できるようにする(表記ゆれが多い)
   - 各地名は完全一致優先、ダメなら**最長一致のprefix match**で照合する(例:「本牧沖 20m前後」→「本牧沖」に前方一致)。分割後の地名が2つ以上マッチしたら中間点(緯度経度平均)を採用し `geocode_match: "gazetteer_compound"`、1つだけなら `"gazetteer"`
   - 「各堤」「各堤防」「桟橋」等の陸っぱり・桟橋釣りは沖の地名ではないため、無理に登録せず`fallback_port`のままでよい(実質的に港の近くなので妥当)
   - それ以外で本当に未知の沖合地名が新たに出てきた場合は、地理的知識からおおよその座標を `fishing_grounds.json` に追記する(コメントに追加理由を残す)。似た表記ゆれ(例:「剣崎沖」と「剱崎沖」のような異体字)は同じ座標で別キーとして両方登録しておくと後々の照合漏れを防げる
5. 魚種名は `data/species_aliases.json` の別名辞書で正規化する(例:「LTアジ」「ビシアジ」「まだこ」→「マアジ」「マダコ」)。元の表記は `species_raw` に残す。新しい別名パターンに気づいたら辞書に追記する
6. 新規レコードを `data/catches.json` の `records` 配列に追記して保存(既存データは削除・上書きしない。追記のみ)。`(funayado, source_url, species, date, qty_min, qty_max, ground_text)` の組で重複排除する
7. `data/tide.json` の `tide_by_date` に、新規レコードの日付がまだ登録されていなければ追記する。取得元は `https://api.tide736.net/get_tide.php?pc=14&hc=8&yr=YYYY&mn=M&dy=1&rg=month`(神奈川県・走水地点、東京湾内)。`rg=month` は月初から30日分しか返らない仕様なので、31日ある月の31日分だけは `dy=31&rg=day` で個別に補う。取得したJSONの `tide.chart["YYYY-MM-DD"].moon.title`(潮名: 大潮/中潮/小潮/長潮/若潮)と `.moon.age`(月齢)、`tide.chart[...].tide[]` の `cm` 値の max-min(潮位差)を保存する。curlにはUser-Agentヘッダーが必要(`-A "Mozilla/5.0"` 等、無いと403になる)
8. `data/weather.json` の `weather_by_date` に、新規レコードの日付がまだ登録されていなければ追記する。取得元は `https://archive-api.open-meteo.com/v1/archive?latitude=35.25&longitude=139.73&start_date=YYYY-MM-DD&end_date=YYYY-MM-DD&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,windspeed_10m_max,windgusts_10m_max,pressure_msl_mean,weathercode&timezone=Asia%2FTokyo`(認証不要、User-Agent不要)。未来日付は取得できないので、当日〜前日までしか埋まらない点に注意(数日後に再実行すれば埋まる)
9. `data/catches.json` の全件(または直近60〜90日分)から `docs/data.js` を再生成する:
   ```js
   window.GENERATED_AT = "YYYY-MM-DD HH:mm";
   window.SOURCES = { "<id>": {"name": "...", "port": "..."}, ... };  // sources.jsonから生成
   window.WEATHER = { "YYYY-MM-DD": {tmax, tmin, precip_mm, wind_kmh, gust_kmh, pressure_hpa, weathercode}, ... };  // weather.jsonから生成
   window.CATCHES = [ {funayado, date, course, species, size_min, size_max, size_unit, qty_min, qty_max, qty_unit, ground_text, depth_text, lat, lon, geocode_match, source_url, tide_title}, ... ];
   ```
   `tide_title` は `data/tide.json` から日付で引いた潮名(大潮/中潮/小潮/長潮/若潮、無ければ`null`)。`docs/data.js` を書き換えたら `docs/index.html` と `docs/analysis.html` 両方の `data.js?v=N` のキャッシュバスターも1つ上げる

   **`GENERATED_AT`と`LAST_CHECKED_AT`は役割が違うので、新規レコードが0件の実行でも両方とも忘れずに更新すること**:
   - `window.GENERATED_AT` = 直近で新規レコードが実際に追加された時刻。新規0件の回はこの値を変更しない
   - `window.LAST_CHECKED_AT` = このパイプラインが最後に全ソースをチェックした時刻。**新規0件でも毎回この行だけは書き換える**(サイト側で「最終更新: {GENERATED_AT}(最終確認: {LAST_CHECKED_AT}・新着なし)」のように表示され、新着が無い日でもパイプラインが生きていることが利用者に伝わる)。新規レコードがあった回は`GENERATED_AT`と同じ時刻にしてよい(その場合サイト側は最終確認の注記を出さない)
   新規0件でも`LAST_CHECKED_AT`更新のためにdocs/data.jsは変更されるので、キャッシュバスターも上げてcommit・pushすること(「変更なしのためスキップ」にしない)
11. 各ソースの取得成否・新規件数・エラーの有無を簡潔に記録する(このファイルの末尾の「実行ログ」節に追記、直近10回分だけ残して古いものは削除してよい)
12. 変更を `git add -A && git commit -m "..." && git push` でリポジトリのmainブランチに反映する(GitHub Pagesが `docs/` を自動で再公開する)。`LAST_CHECKED_AT`の更新分だけであっても、他に変更が本当に何もない場合を除いてcommit・pushする

**注記(2026-08-08時点): 予約可否(空席状況)の自動抽出は廃止**。以前は`data/availability.json`として船宿ごとの空席状況を数時間おきに洗い替えする仕組みを試したが、(a) 16船宿中11船宿でしか拾えず、(b) 船宿ごとに表現形式が全く違い正規化の信頼性が低く、(c) 本質的にパイプラインの実行間隔(数時間おき)より短い周期で古くなる情報だったため、ユーザーの判断でこの自動抽出とその表示機能は削除した。代わりに `docs/funayado.html`(船宿情報ページ、場所・電話番号などほぼ不変の情報のみ)を静的に用意する方針にした。日次パイプラインでこのファイルに触れる必要は無い。

## 個別ソースの注意点(data/sources.jsonのparse_notesと重複するが要点のみ)
- ひらい丸・吉野屋・進丸・宮川丸・伊藤遊船: WordPressのRSS(`/feed/`)が使える。RSSは直近10〜20件程度しか含まれないため、既存データと突き合わせて「まだ取り込んでいない投稿」だけ処理すれば十分(通常は前回実行からの差分のみ)。
- 川崎丸: RSSが不安定なため `/blog/` のHTML一覧を直接取得してパースする。

## エラー時の扱い
- 特定の船宿サイトが落ちている・構造が変わってパースできない場合は、そのソースだけスキップし、他のソースの処理は続行する。スキップした場合はその旨を実行ログに残す。
- 1つのソースでパースに失敗するレコードがあっても、そのレコードだけ捨てて他のレコードは取り込む。

## 新しい船宿を追加する場合
`data/sources.json` の `sources` 配列に追記し、`phase2_candidates` から昇格させる。追加直後の初回実行では、その船宿だけ過去1〜2ヶ月分をバックフィル取得する。

## 実行ログ

- 2026-10-02(自動実行、13:10 JST): originを最新化の上、curlで全ソースを取得し既存source_urlと突合。進丸の新着(10/2、午前シロギス・午前アジ。午後は休船)から新規2件を取り込み(`data/catches.json` 3452→3454件)。他船宿は既存と一致、川崎丸#52009は休船告知のみ、ひらい丸feedは404(category_urlで確認)。伊藤遊船はHTTP 403(恒久ブロック)でスキップ。`data/tide.json`に2026-10-02(小潮)を追記。`data/weather.json`の10/2分は当日のため未取得。GENERATED_AT/LAST_CHECKED_ATを更新、キャッシュバスターをv=174へ。
- 2026-10-02(自動実行、18:05 JST): originを最新化の上、curlで全ソースを取得し既存source_urlと突合。7船宿から新規28件を取り込み(つり幸7・中山丸1・ひらい丸2・吉野屋5・第三あさなぎ丸4・黒川丸3・山下丸5・平作丸1。`data/catches.json` 3454→3482件)。川崎丸#52009は休船告知、宮川丸は告知のみ、進丸・岩田屋・一郎丸・ひらの丸・鈴福丸は既存と一致。伊藤遊船はHTTP 403(恒久ブロック)でスキップ。`data/tide.json`は10/2格納済み、`data/weather.json`の10/2分は当日のため未取得。GENERATED_AT/LAST_CHECKED_ATを更新、キャッシュバスターをv=175へ。
- 2026-10-02(自動実行、21:23 JST): originを最新化の上、curlで全ソースを取得し既存source_urlと突合。新規釣果0件(各船宿の最新投稿は18:05実行で取り込み済みと一致、宮川丸は出船予定告知・大会告知のみ)。伊藤遊船・川崎丸はHTTP 403(恒久ブロック)でスキップ、ひらい丸feedは404(category_urlで確認)。LAST_CHECKED_ATのみ更新、キャッシュバスターをv=176へ。
- 2026-10-03(自動実行、13:11 JST): originを最新化の上、curlで全ソースを取得し既存source_urlと突合。ひらの丸の新着#379275(10/2 タチウオ・テンビン/テンヤ)から新規2件を取り込み(`data/catches.json` 3482→3484件)。他船宿は既存と一致。伊藤遊船・川崎丸はHTTP 403(恒久ブロック)でスキップ、ひらい丸feedは404(category_urlで確認)。`data/weather.json`に2026-10-02分を追記。`data/tide.json`は10/2格納済み。GENERATED_AT/LAST_CHECKED_ATを更新、キャッシュバスターをv=177へ。
- 2026-10-03(自動実行、18:05 JST): originを最新化の上、curlで全ソースを取得し既存source_urlと突合。13船宿から新規47件を取り込み(つり幸11・ひらの丸2・中山丸3・ひらい丸3・吉野屋6・進丸4・黒川丸4・宮川丸1・山下丸5・平作丸4・一郎丸4。`data/catches.json` 3484→3531件、id3488〜3534)。第三あさなぎ丸・鈴福丸・岩田屋は既存と一致。伊藤遊船・川崎丸はHTTP 403(恒久ブロック)でスキップ、ひらい丸feedは404(category_urlで確認)。species_aliasesに「リレータチ(天秤/テンヤ)」を追加。`data/tide.json`に2026-10-03(小潮)を追記。`data/weather.json`の10/3分は当日のため未取得。GENERATED_AT/LAST_CHECKED_ATを更新、キャッシュバスターをv=178へ。
- 2026-10-03(自動実行、21:05 JST): originを最新化の上、curlで全ソースを取得し既存source_urlと突合。3船宿から新規6件を取り込み(ひらい丸#379350 タチウオ仕立船1・鈴福丸#379374 ビシアジ船1・第三あさなぎ丸#403 真鯛五目船4(ワラサ/マアジ/クロダイ/ショゴ、尾数記載なし)。`data/catches.json` 3531→3537件)。他船宿は既存と一致。伊藤遊船・川崎丸はHTTP 403(恒久ブロック)でスキップ、ひらい丸feedは404(category_urlで確認)。`data/tide.json`は10/3格納済み、`data/weather.json`の10/3分は当日のため未取得。GENERATED_AT/LAST_CHECKED_ATを更新、キャッシュバスターをv=179へ。
- 2026-10-04(自動実行、13:11 JST): originを最新化の上、curlで全ソースを取得し既存source_urlと突合。新規釣果0件(各船宿の最新投稿は10/3 21:05実行までに取り込み済みと一致、宮川丸・黒川丸は告知のみ)。伊藤遊船・川崎丸はHTTP 403(恒久ブロック)でスキップ、ひらい丸feedは404(category_urlで確認)。LAST_CHECKED_ATのみ更新、キャッシュバスターをv=180へ。
- 2026-10-04(自動実行、18:05 JST): originを最新化の上、curlで全ソースを取得し既存source_urlと突合。3船宿から新規11件を取り込み(進丸#2026-10-04 シロギス/アジ午前午後4・吉野屋post-1244 ハゼ/LTアジ/タチウオ/カワハギ/フグ5・第三あさなぎ丸#404 真鯛五目船2。`data/catches.json` 3537→3548件、id3541〜3551)。吉野屋カワハギのサイズ「14〜126cm」は原文の誤記と判断し14〜26cmとして取り込み(raw_textは原文のまま)。他船宿は既存と一致、宮川丸は告知のみ。伊藤遊船・川崎丸はHTTP 403(恒久ブロック)でスキップ、ひらい丸feedは404(category_urlで確認)。`data/tide.json`に2026-10-04(小潮)を追記。`data/weather.json`に未追記だった2026-10-03分を補完(10/4分は当日のため未取得)。GENERATED_AT/LAST_CHECKED_ATを更新、キャッシュバスターをv=181へ。
- 2026-10-04(自動実行、21:04 JST): originを最新化の上、curlで全ソースを取得し既存source_urlと突合。9船宿から新規33件を取り込み(ひらい丸4・ひらの丸3・中山丸3・つり幸7・平作丸4・山下丸4(外道キダイ/カイワリ含む)・一郎丸4・黒川丸3・岩田屋1(10/3タチウオ)。`data/catches.json` 3548→3581件、id3552〜3584)。宮川丸は渡船告知のみ。伊藤遊船・川崎丸はHTTP 403(恒久ブロック)でスキップ、ひらい丸feedは404(category_urlで確認)。`data/tide.json`は10/4格納済み、`data/weather.json`の10/4分は当日のため未取得。GENERATED_AT/LAST_CHECKED_ATを更新、キャッシュバスターをv=182へ。
- 2026-10-05(自動実行、13:15 JST): originを最新化の上、curlで全ソースを取得し既存source_urlと突合。岩田屋#28233(10/4 タチウオ・走水沖)と宮川丸#90104(10/3 堤防ブリ/クロダイ/アジ/カワハギ/シロギス)・#90108(10/4 堤防クロダイ/カワハギ)から新規8件を取り込み(`data/catches.json` 3581→3589件、id3585〜3592)。他船宿は既存と一致、宮川丸#89993は渡船中止告知のみ。伊藤遊船・川崎丸はHTTP 403(恒久ブロック)でスキップ、ひらい丸feedは404(category_urlで確認)。`data/tide.json`は10/4格納済み、`data/weather.json`の2026-10-04分はOpen-Meteoが日次上限のため未追記。GENERATED_AT/LAST_CHECKED_ATを更新、キャッシュバスターをv=183へ。
- 2026-10-05(自動実行、18:05 JST): originを最新化の上、curlで全ソースを取得し既存source_urlと突合。5船宿から新規13件を取り込み(吉野屋post-1247 ビシアジ/LTアジ/ふぐ/カワハギ/ハゼ5・黒川丸10/5 リレータチ/リレーアジ2・中山丸#379494 タチウオ1・一郎丸 タチウオアジリレー2(カワハギ・ふぐは休船)・山下丸 カワハギ/アマダイ/キダイ(外道)3。`data/catches.json` 3589→3602件、id3593〜3605)。他船宿は既存と一致。伊藤遊船・川崎丸はHTTP 403(恒久ブロック)でスキップ、ひらい丸feedは404(category_urlで確認)。`data/tide.json`に2026-10-05(長潮)を追記(APIは301でtide736.net/api/へ移転、curl -Lで取得)。`data/weather.json`の10/4・10/5分はOpen-Meteoが日次上限のため未追記。species_aliasesに「はぜ→ハゼ」を追加。GENERATED_AT/LAST_CHECKED_ATを更新、キャッシュバスターをv=184へ。
- 2026-10-05(自動実行、21:30 JST): originを最新化の上、curlで全ソースを取得し既存source_urlと突合。18:05実行の直後に投稿されたつり幸RealtimeDetail/307676(ルアーサワラ)・307677(タチウオ テンビン/ルアー)と第三あさなぎ丸#405(真鯛/クロダイ/ハナダイ/マアジ)から新規7件を取り込み(`data/catches.json` 3602→3609件、id3606〜3612)。他船宿は既存と一致。伊藤遊船・川崎丸はHTTP 403(恒久ブロック)でスキップ、ひらい丸feedは404。`data/tide.json`は10/5格納済み、`data/weather.json`の10/4・10/5分は未追記。GENERATED_AT/LAST_CHECKED_ATを更新、キャッシュバスターをv=185へ。
- 2026-10-06(自動実行、13:15 JST): originを最新化の上、curlで全ソースを取得し既存source_urlと突合。ひらい丸ChokaDetail/379540(10/5 リレー仕立船 タチウオ・マアジ、釣り場記載なし→fallback_port)2件と進丸10/6(午前シロギス・午前アジ、午後は未記入)2件の新規4件を取り込み(`data/catches.json` 3609→3613件、id3613〜3616)。他船宿は既存と一致、一郎丸10/5は休船告知のみ。伊藤遊船・川崎丸はHTTP 403(恒久ブロック)でスキップ、ひらい丸feedは404(category_urlで確認)。`data/tide.json`に2026-10-06(若潮)を追記、`data/weather.json`に10/4・10/5分を補完(10/6は当日のため未取得)。GENERATED_AT/LAST_CHECKED_ATを更新、キャッシュバスターをv=186へ。
- 2026-10-06(自動実行、18:05 JST): originを最新化の上、curlで全ソースを取得し既存source_urlと突合。4船宿から新規12件を取り込み(黒川丸10/6 リレータチ/リレーアジ2・山下丸 カワハギ/アマダイ/キダイ(外道)3・平作丸 ゴモク船(ワラサ/マダイ/イサキ)+タチウオ船4・一郎丸 タチウオアジリレー2+ふぐ1(カワハギは休船)。`data/catches.json` 3613→3625件、id3617〜3628)。他船宿は既存と一致。伊藤遊船・川崎丸はHTTP 403(恒久ブロック)でスキップ、ひらい丸feedは404(category_urlで確認)。`data/tide.json`は10/6格納済み、`data/weather.json`の10/6分は当日のため未取得。GENERATED_AT/LAST_CHECKED_ATを更新、キャッシュバスターをv=187へ。
- 2026-10-06(自動実行、21:30 JST): originを最新化の上、curlで全ソースを取得し既存source_urlと突合。3船宿から新規9件を取り込み(ひらの丸#379554(10/5)1・#379555(10/6)2 タチウオ・鈴福丸#379577 10/6 ビシアジ1・第三あさなぎ丸10/6 真鯛五目船 マダイ/ワラサ/マアジ/クロダイ/オオニベ5(尾数記載なし)。`data/catches.json` 3625→3634件、id3629〜3637)。他船宿は既存と一致。伊藤遊船・川崎丸はHTTP 403(恒久ブロック)でスキップ、ひらい丸feedは404(category_urlで確認)。`data/tide.json`は10/6格納済み、`data/weather.json`の10/6分は当日のため未取得。GENERATED_AT/LAST_CHECKED_ATを更新、キャッシュバスターをv=188へ。
- 2026-10-07(自動実行、13:15 JST): originを最新化の上、curlで全ソースを取得し既存source_urlと突合。新規釣果0件(各船宿の最新投稿は10/6 21:30実行までに取り込み済みと一致、山下丸10/7はカワハギ放流の告知のみ)。伊藤遊船・川崎丸はHTTP 403(恒久ブロック)でスキップ、ひらい丸feedは404(category_urlで確認)。`data/weather.json`の10/6分はOpen-Meteoが応答せず未追記。LAST_CHECKED_ATのみ更新、キャッシュバスターをv=189へ。
- 2026-10-07(自動実行、18:03 JST): originを最新化の上、curlで全ソースを取得し既存source_urlと突合。4船宿から新規14件を取り込み(進丸10/7 午前シロギス・午後シロギス・午後アジ3(午前アジは尾数未記入)・平作丸 ゴモク船(イサキ/ワラサ)2・ひらの丸#379588 タチウオ テンビン/テンヤ2・吉野屋post-1267 ふぐ/タチウオ/ビシアジ/LTアジ/カワハギ/ハゼ/ルアーサワラ7。`data/catches.json` 3634→3648件、id3638〜3651)。山下丸10/7はカワハギ放流告知のみ、中山丸10/7は休船。他船宿は既存と一致。伊藤遊船・川崎丸はHTTP 403(恒久ブロック)でスキップ、ひらい丸feedは404(category_urlで確認)。`data/tide.json`に2026-10-07(中潮)を追記、`data/weather.json`に10/6分を補完(10/7は当日のため未取得)。GENERATED_AT/LAST_CHECKED_ATを更新、キャッシュバスターをv=190へ。
- 2026-10-07(自動実行、21:23 JST): originを最新化の上、curlで全ソースを取得し既存source_urlと突合。鈴福丸#379626(10/7 ビシアジ船 アジ28-40cm 4-43匹、釣り場記載なし→fallback_port)から新規1件を取り込み(`data/catches.json` 3648→3649件、id3652)。中山丸#379581は休船告知のみ、山下丸10/7はカワハギ放流告知のみ。他船宿は既存と一致。伊藤遊船・川崎丸はHTTP 403(恒久ブロック)でスキップ、ひらい丸feedは404(category_urlで確認)。`data/tide.json`は10/7格納済み、`data/weather.json`の10/7分は当日のため未取得。GENERATED_AT/LAST_CHECKED_ATを更新、キャッシュバスターをv=191へ。
- 2026-10-08(自動実行、13:10 JST): originを最新化の上、curlで全ソースを取得し既存source_urlと突合。つり幸RealtimeDetail/307746(10/8 タチウオ テンビン)・307747(10/8 ルアーサワラ)と第三あさなぎ丸10/7 真鯛五目船(マダイ/マアジ/ショゴ/クロダイ、尾数記載なし)から新規6件を取り込み(`data/catches.json` 3649→3655件、id3653〜3658)。宮川丸は出船予定告知のみ、中山丸#379581は休船告知のみ、他船宿は既存と一致。伊藤遊船・川崎丸はHTTP 403(恒久ブロック)でスキップ、ひらい丸feedは404(category_urlで確認)。`data/tide.json`に2026-10-08(中潮)を追記、`data/weather.json`に10/7分を補完(10/8は当日のため未取得)。GENERATED_AT/LAST_CHECKED_ATを更新、キャッシュバスターをv=192へ。
- 2026-10-08(自動実行、18:05 JST): originを最新化の上、curlで全ソースを取得し既存source_urlと突合。5船宿から新規19件を取り込み(中山丸#379644 LTアジ・#379647 タチウオ2・吉野屋post-1289 ビシアジ/LTアジ/タチウオ/カワハギ/ふぐ/シロギス6・黒川丸10/8 リレータチ/リレーアジ2・一郎丸10/8 ふぐ/カワハギ/タチウオ/アジ4・山下丸10/8 カワハギ/アマダイ/外道(カイワリ/イトヨリ/キダイ)5。`data/catches.json` 3655→3674件、id3659〜3677)。他船宿は既存と一致、宮川丸は告知のみ、平作丸・岩田屋は新着なし。伊藤遊船・川崎丸はHTTP 403(恒久ブロック)でスキップ、ひらい丸feedは404(category_urlで確認)。`data/tide.json`は10/8格納済み、`data/weather.json`の10/8分は当日のため未取得。GENERATED_AT/LAST_CHECKED_ATを更新、キャッシュバスターをv=193へ。
