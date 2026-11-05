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

- 2026-11-02(自動実行、13:10 JST): originを最新化の上、curlで全ソースを取得し既存source_urlと突合。新規釣果0件(11/1までの投稿は取り込み済み、11/2分の投稿はまだ無し、ひらの丸は予約状況のみ、他船宿は新着なし)。伊藤遊船・川崎丸はHTTP 403(恒久ブロック)、ひらい丸feedは404(category_urlで確認)でスキップ。LAST_CHECKED_ATのみ更新、キャッシュバスターをv=267へ。
- 2026-11-02(自動実行、18:05 JST): originを最新化の上、curlで全ソースを取得し既存source_urlと突合。9船宿から新規25件を取り込み(吉野屋post-1473 4・進丸2026-11-02 午前シロギス/午前アジ/午後アジ 3・つり幸308969/308967/308966 5・ひらの丸381458/381454 3・中山丸381469 1・山下丸カワハギ/アマダイ 2・平作丸ゴモク船 3・一郎丸タチウオ・アジリレー/カワハギ/ふぐ 4。`data/catches.json` 4230→4255件、id4234〜4258)。進丸午後シロギスは尾数記載なし、ひらい丸381444(BBQ)・第三あさなぎ丸は尾数記載なしのため除外、宮川丸は出船予定告知のみ、黒川丸・岩田屋・鈴福丸は新着なし。伊藤遊船・川崎丸はHTTP 403(恒久ブロック)、ひらい丸feedは404(category_urlで確認)でスキップ。`data/tide.json`に2026-11-02(小潮)を追記。`data/weather.json`はOpen-Meteoが日次上限超過のため10/31〜11/1分は未取得(後日補完)。GENERATED_AT/LAST_CHECKED_ATを更新、キャッシュバスターをv=268へ。
- 2026-11-02(自動実行、21:15 JST): originを最新化の上、curlで全ソースを取得し既存source_urlと突合。平作丸11/1 ゴモク船イサキ・タチウオ船タチウオ(前回までの取りこぼし)から新規2件を取り込み(`data/catches.json` 4255→4257件、id4259〜4260)。岩田屋28429(10/31 カワハギ仕立船)は「トップ7尾」のみで除外、第三あさなぎ丸は尾数記載なし、宮川丸は出船予定告知のみ、他船宿は新着なし。伊藤遊船・川崎丸はHTTP 403(恒久ブロック)、ひらい丸feedは404(category_urlで確認)でスキップ。`data/weather.json`はOpen-Meteoが日次上限(HTTP 429相当)のため10/31以降未取得。GENERATED_AT/LAST_CHECKED_ATを更新、キャッシュバスターをv=269へ。
- 2026-11-03(自動実行、13:10 JST): originを最新化の上、curlで全ソースを取得し既存source_urlと突合。新規釣果0件(11/2までの投稿は取り込み済み、11/3分の投稿はまだ無し、宮川丸は出船予定告知のみ、第三あさなぎ丸は尾数記載なし、他船宿は新着なし)。伊藤遊船・川崎丸はHTTP 403(恒久ブロック)、ひらい丸feedは404(category_urlで確認)でスキップ。`data/weather.json`はOpen-Meteoが日次上限超過のため10/31以降未取得(後日補完)。LAST_CHECKED_ATのみ更新、キャッシュバスターをv=270へ。
- 2026-11-03(自動実行、18:10 JST): originを最新化の上、curlで全ソースを取得し既存source_urlと突合。14船宿から新規40件を取り込み(吉野屋post-1477 6・進丸2026-11-03 午前/午後シロギス・アジ 4・ひらい丸381583/381585 2・ひらの丸381579/381580 3・中山丸381537/381542 2・つり幸308991/308992/309011/309018/309019 11・岩田屋28451 タチウオ 1(タイトルは11/1(日)表記・11/3投稿のため日付は2026-11-01として採用)・山下丸カワハギ 1・平作丸ゴモク船/タチウオ船 3・一郎丸ふぐ/カワハギ/タチウオ・アジリレー 4・黒川丸blog-post_02 3。`data/catches.json` 4257→4297件、id4261〜4300)。宮川丸89993/86229は出船予定告知のみ、第三あさなぎ丸(真鯛五目)は尾数幅の記載なしのため除外。伊藤遊船・川崎丸はHTTP 403(恒久ブロック)、ひらい丸feedは404(category_urlで確認)でスキップ。`data/tide.json`に2026-11-03(小潮)を追記(tide736は301で`https://tide736.net/api/`へ移転、`curl -L`が必要)。`data/weather.json`はOpen-Meteoが日次上限超過(HTTP 429)のため10/31以降未取得(後日補完)。GENERATED_AT/LAST_CHECKED_ATを更新、キャッシュバスターをv=271へ。
- 2026-11-03(自動実行、21:10 JST): originを最新化の上、curlで全ソースを取得し既存source_urlと突合。新規釣果0件(18:10実行以降の新着なし。宮川丸は出船予定告知のみ、第三あさなぎ丸は尾数記載なし、一郎丸は「トップ」のみ、他船宿は新着なし)。伊藤遊船・川崎丸はHTTP 403(恒久ブロック)、ひらい丸feedは404(category_urlで確認)でスキップ。`data/weather.json`は10/31以降未取得(後日補完)。LAST_CHECKED_ATのみ更新、キャッシュバスターをv=272へ。
- 2026-11-04(自動実行、13:15 JST): originを最新化の上、curlで全ソースを取得し既存source_urlと突合。3船宿から新規3件を取り込み(宮川丸90303 11/3 ルアー乗合船サワラ 1・鈴福丸381607 11/3 ビシアジ 1・岩田屋28462 11/2 カワハギ 1。`data/catches.json` 4297→4300件、id4301〜4303)。第三あさなぎ丸は尾数記載なし、他船宿は新着なし。伊藤遊船・川崎丸はHTTP 403(恒久ブロック)、ひらい丸feedは404(category_urlで確認)でスキップ。`data/weather.json`はOpen-Meteoから応答なし(日次上限)のため10/31以降未取得(後日補完)。GENERATED_AT/LAST_CHECKED_ATを更新、キャッシュバスターをv=273へ。
- 2026-11-04(自動実行、18:10 JST): originを最新化の上、curlで全ソースを取得し既存source_urlと突合。黒川丸blog-post_03(11/4 リレータチ/リレーアジ/ショートアジ)から新規3件を取り込み(`data/catches.json` 4300→4303件、id4304〜4306)。岩田屋28475(LTアジ仕立船)・第三あさなぎ丸は尾数記載なし、宮川丸・他船宿は新着なし。伊藤遊船・川崎丸はHTTP 403(恒久ブロック)、ひらい丸feedは404(category_urlで確認)でスキップ。`data/tide.json`に2026-11-04(長潮)を追記。`data/weather.json`はOpen-Meteoが日次上限超過(HTTP 429)のため10/31以降未取得(後日補完)。GENERATED_AT/LAST_CHECKED_ATを更新、キャッシュバスターをv=274へ。
- 2026-11-04(自動実行、21:15 JST): originを最新化の上、curlで全ソースを取得し既存source_urlと突合。3船宿から新規7件を取り込み(つり幸309054 午前シロギス・309055 午前アジ・309058 タチウオ(テンビン/ルアー) 4・中山丸381644 11/4 LTアジショート便 1・平作丸ゴモク船 ワラサ/イサキ 2。`data/catches.json` 4303→4310件、id4307〜4313)。一郎丸11/4のタチウオアジリレー/ふぐは「トップ」のみで除外、岩田屋28475・第三あさなぎ丸は尾数記載なし、宮川丸は渡船中止告知のみ、他船宿は新着なし。伊藤遊船・川崎丸はHTTP 403(恒久ブロック)、ひらい丸feedは404(category_urlで確認)でスキップ。`data/tide.json`は11/4まで格納済み。`data/weather.json`はOpen-Meteoから応答なし(日次上限)のため10/31以降未取得(後日補完)。GENERATED_AT/LAST_CHECKED_ATを更新、キャッシュバスターをv=275へ。
- 2026-11-05(自動実行、13:10 JST): originを最新化の上、curlで全ソースを取得し既存source_urlと突合。一郎丸11/4 タチウオ・アジリレー(1793772863、幅の記載あり)/ふぐ(1793771666)から新規3件を取り込み(`data/catches.json` 4310→4313件、id4314〜4316)。第三あさなぎ丸・岩田屋28475は尾数記載なし、宮川丸は出船予定・渡船中止告知のみ、他船宿は新着なし。伊藤遊船・川崎丸はHTTP 403(恒久ブロック)、ひらい丸feedは404(category_urlで確認)でスキップ。`data/weather.json`はOpen-Meteoが応答したため10/31〜11/4分を補完。`data/tide.json`は11/4まで格納済み(11/5分の釣果なし)。GENERATED_AT/LAST_CHECKED_ATを更新、キャッシュバスターをv=276へ。
- 2026-11-05(自動実行、18:10 JST): originを最新化の上、curlで全ソースを取得し既存source_urlと突合。ひらの丸381676(11/4 タチウオ船 テンビン/テンヤ)から新規2件を取り込み(`data/catches.json` 4313→4315件、id4317〜4318)。ひらい丸381444(BBQ)・岩田屋28475・第三あさなぎ丸は尾数記載なし、宮川丸は告知のみ、他船宿は新着なし。伊藤遊船・川崎丸はHTTP 403(恒久ブロック)、ひらい丸feedは404(category_urlで確認)でスキップ。`data/tide.json`・`data/weather.json`は11/4まで格納済み。GENERATED_AT/LAST_CHECKED_ATを更新、キャッシュバスターをv=277へ。
- 2026-11-05(自動実行、21:10 JST): originを最新化の上、curlで全ソースを取得し既存source_urlと突合。平作丸11/5 ゴモク船(ワラサ/イサキ)から新規2件を取り込み(`data/catches.json` 4315→4317件、id4319〜4320)。他船宿は新着なし(つり幸・ひらの丸・中山丸・一郎丸は11/4まで、宮川丸は告知のみ、第三あさなぎ丸・岩田屋は尾数記載なし)。伊藤遊船・川崎丸はHTTP 403(恒久ブロック)、ひらい丸feedは404(category_urlで確認)でスキップ。`data/tide.json`に2026-11-05(若潮)を追記。`data/weather.json`は11/4まで格納済み(当日分は未取得)。GENERATED_AT/LAST_CHECKED_ATを更新、キャッシュバスターをv=278へ。
