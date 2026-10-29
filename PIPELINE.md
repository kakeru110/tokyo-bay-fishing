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

- 2026-10-24(自動実行、18:04 JST): originを最新化の上、curlで全ソースを取得し既存source_urlと突合。10社から新規26件を取り込み(進丸10/24 午前/午後シロギス・午前/午後アジ 4・平作丸ゴモク船 イサキ/マダイ/ワラサ 3・山下丸カワハギ 1・一郎丸 タチウオ/アジ/カワハギ/ふぐ 4・黒川丸blog-post_24 3・つり幸308527/308526/308525 6・中山丸380792/380791 2・ひらい丸380850 2・ひらの丸380833 1。`data/catches.json` 4049→4075件、id4053〜4078)。第三あさなぎ丸は尾数記載なしのため除外、宮川丸・吉野屋・鈴福丸・岩田屋は新着なし。伊藤遊船・川崎丸はHTTP 403(恒久ブロック)、ひらい丸feedは404(category_urlで確認)でスキップ。`data/tide.json`に2026-10-24(大潮)を追記。`data/weather.json`はOpen-MeteoがHTTP 429(日次上限)のため10/23〜10/24分は未取得(後日の実行で補完)。GENERATED_AT/LAST_CHECKED_ATを更新、キャッシュバスターをv=241へ。
- 2026-10-24(自動実行、21:06 JST): originを最新化の上、curlで全ソースを取得し既存source_urlと突合。2船宿から新規4件を取り込み(ひらの丸380823 タチウオ船 2・宮川丸90227 クロダイ堤防/90237 ブリ堤防ルアー 2。`data/catches.json` 4075→4079件、id4079〜4082)。他船宿は新着なし、ひらい丸380585・第三あさなぎ丸は尾数記載なしのため除外。伊藤遊船・川崎丸はHTTP 403(恒久ブロック)、ひらい丸feedは404(category_urlで確認)でスキップ。`data/weather.json`はOpen-MeteoがHTTP 429(日次上限)のため10/23〜10/24分は未取得(後日補完)。GENERATED_AT/LAST_CHECKED_ATを更新、キャッシュバスターをv=242へ。
- 2026-10-25(自動実行、13:09 JST): originを最新化の上、curlで全ソースを取得し既存source_urlと突合。新規釣果0件(10/24までの投稿は取り込み済み、10/25分の投稿はまだ無し、宮川丸は出船予定告知のみ、第三あさなぎ丸真鯛五目船は尾数記載なしのため除外、他船宿は新着なし)。伊藤遊船・川崎丸はHTTP 403(恒久ブロック)、ひらい丸feedは404(category_urlで確認)でスキップ。LAST_CHECKED_ATのみ更新、キャッシュバスターをv=243へ。
- 2026-10-25(自動実行、18:05 JST): originを最新化の上、curlで全ソースを取得し既存source_urlと突合。8船宿から新規12件を取り込み(進丸10/25 シロギス・午前/午後アジ 3・平作丸ゴモク船イサキ 1・山下丸カワハギ 1・中山丸380910/380908/380907 3・ひらの丸380914 タチウオ天秤/テンヤ 2・一郎丸ふぐ 1・黒川丸blog-post_25 リレータチ 1。`data/catches.json` 4079→4091件、id4083〜4094)。第三あさなぎ丸10/25真鯛五目船は尾数記載なし、黒川丸リレーアジは「型見た程度」で尾数なしのため除外、他船宿は新着なし。伊藤遊船・川崎丸はHTTP 403(恒久ブロック)、ひらい丸feedは404(category_urlで確認)でスキップ。`data/tide.json`に2026-10-25(大潮)を追記。`data/weather.json`はOpen-Meteoが応答なし(日次上限の可能性)のため10/23〜10/25分は未取得(後日補完)。GENERATED_AT/LAST_CHECKED_ATを更新、キャッシュバスターをv=244へ。
- 2026-10-25(自動実行、21:06 JST): originを最新化の上、curlで全ソースを取得し既存source_urlと突合。4船宿から新規14件を取り込み(吉野屋post-1421(10/24 LTアジ/タチウオ/カワハギ/シロギス、前回取りこぼし)4・post-1423(10/25 LTアジ/カワハギ/ハゼ/フグ/タチウオ/サワラ)6・宮川丸90244(10/24)/90250(10/25) ルアー乗合船サワラ 2・鈴福丸380953 ビシアジ 1・岩田屋28395 タチウオ(湾奥) 1。`data/catches.json` 4091→4105件、id4095〜4108)。ひらい丸380949/380950(10/25)は尾数記載なしのため除外、他船宿は新着なし。伊藤遊船・川崎丸はHTTP 403(恒久ブロック)、ひらい丸feedは404(category_urlで確認)でスキップ。`data/tide.json`は10/25まで格納済み。`data/weather.json`はOpen-Meteoが日次上限超過(「Daily API request limit exceeded」)のため10/23〜10/25分は未取得(後日補完)。GENERATED_AT/LAST_CHECKED_ATを更新、キャッシュバスターをv=245へ。
- 2026-10-26(自動実行、13:09 JST): originを最新化の上、curlで全ソースを取得し既存source_urlと突合。つり幸から新規6件を取り込み(308621 日曜日アジ釣果 5・308622 午前シロギス 1。ページ見出し日付は10/26だが題名が「日曜日」のため釣行日は2026-10-25とした。`data/catches.json` 4105→4111件、id4109〜4114)。宮川丸86229/89993は出船予定告知のみ、ひらい丸380949/380950・第三あさなぎ丸は尾数記載なしのため除外、他船宿は新着なし。伊藤遊船・川崎丸はHTTP 403(恒久ブロック)、ひらい丸feedは404(category_urlで確認)でスキップ。`data/tide.json`は10/25まで格納済み。`data/weather.json`はOpen-Meteoが日次上限超過のため10/23〜10/25分は未取得(後日補完)。GENERATED_AT/LAST_CHECKED_ATを更新、キャッシュバスターをv=246へ。
- 2026-10-26(自動実行、18:02 JST): originを最新化の上、curlで全ソースを取得し既存source_urlと突合。ひらの丸380969(10/26 タチウオ船 テンビン/テンヤ)から新規2件を取り込み(`data/catches.json` 4111→4113件、id4115〜4116)。他船宿は10/25分まで取り込み済みで新着なし、ひらい丸380949/380950・第三あさなぎ丸は尾数記載なし、宮川丸86229/89993は出船予定告知のみ。伊藤遊船・川崎丸はHTTP 403(恒久ブロック)、ひらい丸feedは404(category_urlで確認)でスキップ。`data/tide.json`に2026-10-26(大潮)を追記、`data/weather.json`はOpen-Meteoが復旧したため10/23〜10/25分を補完(10/26は当日分のため未取得)。GENERATED_AT/LAST_CHECKED_ATを更新、キャッシュバスターをv=247へ。
- 2026-10-26(自動実行、21:14 JST): originを最新化の上、curlで全ソースを取得し既存source_urlと突合。新規釣果0件(10/26分はひらの丸380969・つり幸308621/308622(題名「日曜日」=10/25)のみで取り込み済み、ひらい丸380949/380950・第三あさなぎ丸は尾数記載なし、宮川丸は出船予定告知のみ、他船宿は新着なし)。伊藤遊船・川崎丸はHTTP 403(恒久ブロック)、ひらい丸feedは404(category_urlで確認)でスキップ。LAST_CHECKED_ATのみ更新、キャッシュバスターをv=248へ。
- 2026-10-27(自動実行、13:10 JST): originを最新化の上、curlで全ソースを取得し既存source_urlと突合。新規釣果0件(10/26までの投稿は取り込み済み、10/27分の投稿はまだ無し、第三あさなぎ丸真鯛五目船(p=11887/11896)は「トップ◯枚」のみで尾数記載なしのため除外、他船宿は新着なし)。伊藤遊船・川崎丸はHTTP 403(恒久ブロック)、ひらい丸feedは404でスキップ。LAST_CHECKED_ATのみ更新、キャッシュバスターをv=249へ。
- 2026-10-27(自動実行、18:10 JST): originを最新化の上、curlで全ソースを取得し既存source_urlと突合。4船宿から新規9件を取り込み(ひらの丸381002 タチウオ 1・一郎丸1793081511 タチウオ/アジ 2・つり幸308668 タチウオ テンビン/ルアー 2・308663 ルアーサワラ 1・308651 午前アジ 1・山下丸カワハギ 1。`data/catches.json` 4116→4125件、id4117〜4125)。他船宿は新着なし。伊藤遊船・川崎丸はHTTP 403(恒久ブロック)、ひらい丸feedは404(category_urlで確認)でスキップ。tide736 APIは`api.tide736.net`が`tide736.net/api/`へ301転送されるため`curl -L`が必要。`data/tide.json`に2026-10-27(大潮)を追記、`data/weather.json`に2026-10-26を補完。GENERATED_AT/LAST_CHECKED_ATを更新、キャッシュバスターをv=250へ。
- 2026-10-27(自動実行、21:10 JST): originを最新化の上、curlで全ソースを取得し既存source_urlと突合。平作丸10/26 ゴモク船(マダイ・イサキ)から新規2件を取り込み(`data/catches.json` 4121→4123件、id4125〜4126)。他船宿は新着なし(第三あさなぎ丸は尾数記載なし)。伊藤遊船・川崎丸はHTTP 403(恒久ブロック)、ひらい丸feedは404(category_urlで確認)でスキップ。`data/tide.json`は10/27まで格納済み、`data/weather.json`は10/27当日分のため未取得。GENERATED_AT/LAST_CHECKED_ATを更新、キャッシュバスターをv=251へ。
- 2026-10-28(自動実行、13:10 JST): originを最新化の上、curlで全ソースを取得し既存source_urlと突合。新規釣果0件(10/27までの投稿は取り込み済み、10/28分の投稿はまだ無し、宮川丸の10/27・10/28投稿は出船予定/中止告知のみ、第三あさなぎ丸真鯛五目船は尾数記載なしのため除外、他船宿は新着なし)。伊藤遊船・川崎丸はHTTP 403(恒久ブロック)、ひらい丸feedは404(category_urlで確認)でスキップ。LAST_CHECKED_ATのみ更新、キャッシュバスターをv=252へ。
- 2026-10-28(自動実行、18:05 JST): originを最新化の上、curlで全ソースを取得し既存source_urlと突合。一郎丸10/28(タチウオ・アジリレー1793167419/ふぐ釣り1793166907)から新規3件を取り込み(`data/catches.json` 4123→4126件、id4127〜4129)。他船宿は新着なし(第三あさなぎ丸は尾数記載なし、宮川丸は出船予定告知のみ)。伊藤遊船・川崎丸はHTTP 403(恒久ブロック)、ひらい丸feedは404(category_urlで確認)でスキップ。`data/tide.json`に2026-10-28(中潮)を追記。`data/weather.json`はOpen-Meteoが日次上限超過のため10/27分は未取得(後日補完)。GENERATED_AT/LAST_CHECKED_ATを更新、キャッシュバスターをv=253へ。
- 2026-10-28(自動実行、21:20 JST): originを最新化の上、curlで全ソースを取得し既存source_urlと突合。新規釣果0件(10/28分は一郎丸取り込み済み、宮川丸89993/86229は出船予定告知のみ、第三あさなぎ丸は尾数記載なし、他船宿は新着なし)。伊藤遊船・川崎丸はHTTP 403(恒久ブロック)、ひらい丸feedは404(category_urlで確認)でスキップ。LAST_CHECKED_ATのみ更新、キャッシュバスターをv=254へ。
- 2026-10-29(自動実行、13:10 JST): originを最新化の上、curlで全ソースを取得し既存source_urlと突合。つり幸308710(10/28 午前アジ 第18/第21さくら丸)から新規2件を取り込み(`data/catches.json` 4126→4128件、id4130〜4131)。宮川丸86229は出船予定告知のみ、第三あさなぎ丸は尾数記載なし、他船宿は新着なし。伊藤遊船・川崎丸はHTTP 403(恒久ブロック)、ひらい丸feedは404(category_urlで確認)でスキップ。`data/tide.json`は10/28まで格納済み。`data/weather.json`はOpen-Meteoが日次上限超過のため10/27〜10/28分は未取得(後日補完)。GENERATED_AT/LAST_CHECKED_ATを更新、キャッシュバスターをv=255へ。
- 2026-10-29(自動実行、18:10 JST): originを最新化の上、curlで全ソースを取得し既存source_urlと突合。4船宿から新規11件を取り込み(吉野屋post-1431(10/29 ビシアジ/LTアジ/ふぐ/タチウオ/カワハギ)5・中山丸381115/381111(タチウオ湾奥/LTアジ) 2・黒川丸blog-post_29(リレータチ/リレーアジ) 2・山下丸10/29 カワハギ/アマダイ 2。`data/catches.json` 4128→4139件、id4132〜4142)。宮川丸は出船予定告知のみ、第三あさなぎ丸は尾数記載なし、他船宿は新着なし。伊藤遊船・川崎丸はHTTP 403(恒久ブロック)、ひらい丸はcategory_urlで確認(新着なし)。`data/tide.json`に2026-10-29(中潮)を追記、`data/weather.json`に10/27〜10/28分を補完。GENERATED_AT/LAST_CHECKED_ATを更新、キャッシュバスターをv=256へ。
