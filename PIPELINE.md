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


- 2026-11-08(自動実行、13:10 JST): originを最新化の上、curlで全ソースを取得し既存source_urlと突合。鈴福丸381840(11/7 ビシアジ)・宮川丸90337(11/7 ルアー乗合船サワラ)・90348(11/7 堤防ブリ)から新規3件を取り込み(`data/catches.json` 4374→4377件、id4378〜4380)。11/8分の投稿はまだ無し、他船宿は新着なし(宮川丸89993は告知のみ、第三あさなぎ丸・ひらい丸381817は尾数記載なしで除外)。伊藤遊船・川崎丸はHTTP 403(恒久ブロック)、ひらい丸feedは404(category_urlで確認)でスキップ。`data/tide.json`は11/7まで格納済み。`data/weather.json`はOpen-Meteoから応答なしのため11/5以降未取得(後日補完)。GENERATED_AT/LAST_CHECKED_ATを更新、キャッシュバスターをv=285へ。
- 2026-11-08(自動実行、18:10 JST): originを最新化の上、curlで全ソースを取得し既存source_urlと突合。13船宿から新規31件を取り込み(吉野屋post-1525 5・進丸2026-11-08 4・つり幸309250/309252/309256/309257 8・ひらの丸381880/381893 3・中山丸381862/381865 3・岩田屋28500(11/7 カワハギ) 1・一郎丸 ふぐ/カワハギ/タチウオ・アジリレー 4・山下丸カワハギ 1・平作丸ゴモク船イサキ 1・宮川丸90353 サワラ 1。`data/catches.json` 4377→4408件、id4381〜4411)。第三あさなぎ丸は尾数記載なし、宮川丸89993/86229は告知のみ、ひらい丸・鈴福丸・黒川丸は新着なし。伊藤遊船・川崎丸はHTTP 403(恒久ブロック)、ひらい丸feedは404(category_urlで確認)でスキップ。`data/tide.json`に2026-11-08(大潮)を追記。`data/weather.json`はOpen-Meteoが日次上限超過(HTTP 429)のため11/5以降未取得(後日補完)。GENERATED_AT/LAST_CHECKED_ATを更新、キャッシュバスターをv=286へ。
- 2026-11-08(自動実行、21:05 JST): originを最新化の上、curlで全ソースを取得し既存source_urlと突合。黒川丸blog-post_07(11/8 リレータチ/リレーアジ)から新規2件を取り込み(`data/catches.json` 4408→4410件、id4412〜4413)。他船宿は新着なし(宮川丸90332は大会告知のみ、89993/86229は告知のみ、第三あさなぎ丸・ひらい丸381817/381444は尾数記載なしで除外)。伊藤遊船・川崎丸はHTTP 403(恒久ブロック)、ひらい丸feedは404(category_urlで確認)でスキップ。`data/tide.json`は11/8まで格納済み。`data/weather.json`は11/5以降未取得(後日補完)。GENERATED_AT/LAST_CHECKED_ATを更新、キャッシュバスターをv=287へ。
- 2026-11-09(自動実行、13:10 JST): originを最新化の上、curlで全ソースを取得し既存source_urlと突合。ひらい丸381954(11/8 タチウオ乗合船 本牧沖)・鈴福丸381940(11/8 ビシアジ)から新規2件を取り込み(`data/catches.json` 4410→4412件、id4414〜4415)。ひらい丸381951/381952(LTアジ・BBQ)は尾数記載なしで除外、11/9分の釣果投稿はまだ無し(ひらの丸は予約告知のみ)、他船宿は新着なし。伊藤遊船・川崎丸はHTTP 403(恒久ブロック)、ひらい丸feedは404(category_urlで確認)でスキップ。`data/tide.json`は11/8まで格納済み。`data/weather.json`は11/5〜11/8をOpen-Meteoから補完。GENERATED_AT/LAST_CHECKED_ATを更新、キャッシュバスターをv=288へ。
- 2026-11-09(自動実行、18:10 JST): originを最新化の上、curlで全ソースを取得し既存source_urlと突合。進丸2026-11-09(貸切シロギス)・平作丸11/9 ゴモク船(ワラサ/イサキ)から新規3件を取り込み(`data/catches.json` 4412→4415件、id4416〜4418)。他船宿は新着なし(宮川丸は告知のみ、ひらの丸は予約告知のみ)。伊藤遊船・川崎丸はHTTP 403(恒久ブロック)、ひらい丸feedは404(category_urlで確認)でスキップ。`data/tide.json`に2026-11-09(大潮)を追記(新URL tide736.net/apiへ301転送)。`data/weather.json`はOpen-Meteoが日次上限超過(HTTP 429)のため11/9未取得(後日補完)。GENERATED_AT/LAST_CHECKED_ATを更新、キャッシュバスターをv=289へ。
- 2026-11-09(自動実行、21:10 JST): originを最新化の上、curlで全ソースを取得し既存source_urlと突合。つり幸309299(11/9 午後アジ 第21さくら丸)から新規1件を取り込み(`data/catches.json` 4415→4416件、id4419)。他船宿は新着なし(ひらい丸381951/381952/381817/381444は尾数記載なしで除外済み、宮川丸は告知のみ、第三あさなぎ丸・岩田屋は尾数記載なし)。伊藤遊船・川崎丸はHTTP 403(恒久ブロック)、ひらい丸feedは404(category_urlで確認)でスキップ。`data/tide.json`は11/9まで格納済み。`data/weather.json`は11/9未取得(後日補完)。GENERATED_AT/LAST_CHECKED_ATを更新、キャッシュバスターをv=290へ。
- 2026-11-10(自動実行、13:09 JST): originを最新化の上、curlで全ソースを取得し既存source_urlと突合。岩田屋28515(11/8 カワハギ 竹岡沖)から新規1件を取り込み(`data/catches.json` 4416→4417件、id4420)。他船宿は新着なし(ひらい丸381951/381952/381817/381444・第三あさなぎ丸は尾数記載なしで除外、宮川丸は告知のみ、一郎丸・山下丸・平作丸ほかは取り込み済み)。伊藤遊船・川崎丸はHTTP 403(恒久ブロック)、ひらい丸feedは404(category_urlで確認)でスキップ。`data/tide.json`は11/9まで格納済み。`data/weather.json`はOpen-Meteoが日次上限超過のため11/9未取得(後日補完)。GENERATED_AT/LAST_CHECKED_ATを更新、キャッシュバスターをv=291へ。
- 2026-11-10(自動実行、18:05 JST): originを最新化の上、curlで全ソースを取得し既存source_urlと突合。進丸2026-11-10(午前シロギス 1〜10尾)・一郎丸 ふぐ釣り(11/10 2〜9匹)から新規2件を取り込み(`data/catches.json` 4417→4419件、id4421〜4422)。第三あさなぎ丸11/10(真鯛五目)は尾数記載なしで除外、他船宿は新着なし(ひらの丸は予約告知のみ)。伊藤遊船・川崎丸はHTTP 403(恒久ブロック)、ひらい丸feedは404(category_urlで確認)でスキップ。`data/tide.json`に2026-11-10(大潮)を追記。`data/weather.json`はOpen-Meteoが日次上限超過のため11/9〜11/10未取得(後日補完)。GENERATED_AT/LAST_CHECKED_ATを更新、キャッシュバスターをv=292へ。
- 2026-11-10(自動実行、21:05 JST): originを最新化の上、curlで全ソースを取得し既存source_urlと突合。山下丸11/10 カワハギ(久里浜沖〜下浦沖)から新規1件を取り込み(`data/catches.json` 4419→4420件、id4423)。他船宿は新着なし(宮川丸は告知のみ、ひらの丸は予約告知のみ、第三あさなぎ丸は尾数記載なし)。伊藤遊船・川崎丸はHTTP 403(恒久ブロック)、ひらい丸feedは404(category_urlで確認)、黒川丸category_urlは503(feedで確認)でスキップ。`data/tide.json`は11/10まで格納済み。`data/weather.json`はOpen-Meteoが日次上限超過のため11/9〜11/10未取得(後日補完)。GENERATED_AT/LAST_CHECKED_ATを更新、キャッシュバスターをv=293へ。
- 2026-11-11(自動実行、13:15 JST): originを最新化の上、curlで全ソースを取得し既存source_urlと突合。ひらの丸381986(11/10 タチウオ船 テンビン/テンヤ)・つり幸309339(11/11 午前アジ 第21さくら丸)から新規3件を取り込み(`data/catches.json` 4420→4423件、id4424〜4426)。他船宿は新着なし(第三あさなぎ丸11/10は尾数記載なし、宮川丸は告知のみ、山下丸・平作丸ほかは取り込み済み)。伊藤遊船・川崎丸はHTTP 403(恒久ブロック)、ひらい丸feedは404(category_urlで確認)でスキップ。`data/tide.json`に2026-11-11(中潮)を追記。`data/weather.json`は11/9〜11/10をOpen-Meteoから補完(初回は接続リセット、再試行で成功)。GENERATED_AT/LAST_CHECKED_ATを更新、キャッシュバスターをv=294へ。
