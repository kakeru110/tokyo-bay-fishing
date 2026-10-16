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

- 2026-10-12(自動実行、18:05 JST): originを最新化の上、curlで全ソースを取得し既存source_urlと突合。11船宿から新規37件を取り込み(ひらい丸#380053 タチウオ2・つり幸308002/308001/307997/307996 11・中山丸380025〜27 3・ひらの丸380037/380041 3・進丸10/12 4・宮川丸#90161 サワラ1と#90130(10/9 堤防クロダイ)1・第三あさなぎ丸#408 3(尾数記載なし)・黒川丸10/12 2・一郎丸 4・山下丸 2・平作丸 2。`data/catches.json` 3789→3826件、id3793〜3829)。ひらい丸380052(天ぷら仕立船)は尾数記載なしのため除外、宮川丸#86229は告知のみ、岩田屋#28268は尾数記載なしのため除外、サゴシ等の外道は除外。伊藤遊船・川崎丸はHTTP 403でスキップ、ひらい丸feedは404(category_urlで確認)。`data/tide.json`に2026-10-12(大潮)を追記、`data/weather.json`はOpen-Meteoが日次上限(429)のため10/10〜10/11分を未追記。GENERATED_AT/LAST_CHECKED_ATを更新、キャッシュバスターをv=205へ。
- 2026-10-12(自動実行、21:31 JST): originを最新化の上、curlで全ソースを取得し既存source_urlと突合。新規釣果0件(各船宿の最新投稿は18:05実行までに取り込み済みと一致、ひらい丸380052は尾数記載なし、宮川丸#86229は告知のみ、岩田屋#28268は尾数記載なしのため除外)。伊藤遊船・川崎丸はHTTP 403(恒久ブロック)、ひらい丸feedは404(category_urlで確認)でスキップ。LAST_CHECKED_ATのみ更新、キャッシュバスターをv=206へ。
- 2026-10-13(自動実行、13:12 JST): originを最新化の上、curlで全ソースを取得し既存source_urlと突合。吉野屋post-1324(10/12 6件、イカ船は尾数記載なしで除外)・岩田屋28298(10/12 タチウオ)・28288(10/11 カワハギ)・鈴福丸380075(10/12 ビシアジ、釣り場記載なし→fallback_port)から新規9件を取り込み(`data/catches.json` 3826→3835件、id3830〜3838)。ひらい丸380052/379959は尾数記載なしのため除外、他船宿は既存と一致。伊藤遊船・川崎丸はHTTP 403(恒久ブロック)、ひらい丸feedは404(category_urlで確認)でスキップ。`data/tide.json`は10/11・10/12格納済み、`data/weather.json`の10/12分はOpen-Meteoが日次上限のため未追記。GENERATED_AT/LAST_CHECKED_ATを更新、キャッシュバスターをv=207へ。
- 2026-10-13(自動実行、18:05 JST): originを最新化の上、curlで全ソースを取得し既存source_urlと突合。8船宿から新規18件を取り込み(つり幸308034/308033/308025 4・ひらの丸#380087 タチウオ2・山下丸 カワハギ/アマダイ2・進丸10/13 午前アジ1・一郎丸 タチウオ/アジ/ふぐ3・黒川丸10/13 タチウオ/アジ2・第三あさなぎ丸10/13 真鯛五目船(尾数記載なし)4。`data/catches.json` 3835→3853件、id3839〜3856)。宮川丸は告知のみ、他船宿は既存と一致。伊藤遊船・川崎丸はHTTP 403(恒久ブロック)、ひらい丸feedは404でスキップ。`data/tide.json`に2026-10-13(中潮)を追記、`data/weather.json`の10/12分はOpen-Meteoが日次上限のため未追記。GENERATED_AT/LAST_CHECKED_ATを更新、キャッシュバスターをv=208へ。
- 2026-10-13(自動実行、21:30 JST): originを最新化の上、curlで全ソースを取得し既存source_urlと突合。鈴福丸380120(10/13 ビシアジ アジ1)・平作丸(10/13 ゴモク船 ワラサ・イサキ2)から新規3件を取り込み(`data/catches.json` 3853→3856件、id3857〜3859)。他船宿は既存と一致、宮川丸は告知のみ、ひらい丸379959/380052・岩田屋#28268は尾数記載なしのため除外。伊藤遊船・川崎丸はHTTP 403(恒久ブロック)、ひらい丸feedは404(category_urlで確認)でスキップ。`data/tide.json`は10/13格納済み、`data/weather.json`の10/12分はOpen-Meteo未取得のまま。GENERATED_AT/LAST_CHECKED_ATを更新、キャッシュバスターをv=209へ。
- 2026-10-14(自動実行、13:00 JST): originを最新化の上、curlで全ソースを取得し既存source_urlと突合。つり幸RealtimeDetail/308056(10/14 午前シロギス、釣り場記載なし→fallback_port)から新規1件を取り込み(`data/catches.json` 3856→3857件、id3860)。宮川丸10/14は出船予定告知のみ、他船宿は既存と一致。伊藤遊船・川崎丸はHTTP 403(恒久ブロック)でスキップ、ひらい丸feedは404(category_urlで確認)。潮汐APIは旧URLが301でtide736.net/api/へ移転したため-Lで追従し、`data/tide.json`に2026-10-14(中潮)を追記。`data/weather.json`の10/12〜10/14分はOpen-Meteo未取得のまま。GENERATED_AT/LAST_CHECKED_ATを更新、キャッシュバスターをv=210へ。
- 2026-10-14(自動実行、18:05 JST): originを最新化の上、curlで全ソースを取得し既存source_urlと突合。吉野屋post-1345(10/14 ビシアジ・ふぐ・LTアジ・はぜ・タチウオ5)・ひらの丸#380133(タチウオ テンビン/テンヤ2)・平作丸10/14(ゴモク船イサキ・ワラサ、タチウオ船3)から新規10件を取り込み(`data/catches.json` 3857→3867件、id3861〜3870)。宮川丸は告知のみ、ひらい丸379959/380052は尾数記載なしのため除外、他船宿は既存と一致。伊藤遊船・川崎丸はHTTP 403(恒久ブロック)でスキップ。`data/tide.json`は10/14格納済み、`data/weather.json`の10/12〜10/14分はOpen-Meteoが日次上限のため未取得のまま。GENERATED_AT/LAST_CHECKED_ATを更新、キャッシュバスターをv=211へ。
- 2026-10-14(自動実行、21:25 JST): originを最新化の上、curlで全ソースを取得し既存source_urlと突合。新規釣果0件(各船宿の最新投稿は18:05実行までに取り込み済みと一致、宮川丸は出船予定告知のみ、第三あさなぎ丸10/14(真鯛五目船)は尾数記載なし、ひらい丸379959/380052・岩田屋#28268は尾数記載なしのため除外)。伊藤遊船・川崎丸はHTTP 403(恒久ブロック)、ひらい丸feedは404(category_urlで確認)でスキップ。LAST_CHECKED_ATのみ更新、キャッシュバスターをv=212へ。
- 2026-10-15(自動実行、13:12 JST): originを最新化の上、curlで全ソースを取得し既存source_urlと突合。新規釣果0件(各船宿の最新投稿は10/14 21:25実行までに取り込み済みと一致、宮川丸は出船予定告知のみ、第三あさなぎ丸10/14(真鯛五目船)は尾数記載なし、ひらい丸379959/380052・岩田屋#28268は尾数記載なしのため除外)。伊藤遊船・川崎丸はHTTP 403(恒久ブロック)、ひらい丸feedは404(category_urlで確認)でスキップ。LAST_CHECKED_ATのみ更新、キャッシュバスターをv=213へ。
- 2026-10-15(自動実行、18:10 JST): originを最新化の上、curlで全ソースを取得し既存source_urlと突合。6船宿から新規14件を取り込み(中山丸380177/380178 LTアジ・タチウオ2・黒川丸10/15 タチウオ・アジ2・一郎丸 タチウオ/アジ/カワハギ/ふぐ4・山下丸 カワハギ/アマダイ2・平作丸 ワラサ/イサキ/マダイ/タチウオ4。`data/catches.json` 3867→3881件、id3871〜3884)。宮川丸は告知/イベントのみ、第三あさなぎ丸10/14は尾数記載なしのため除外、他船宿は既存と一致。伊藤遊船・川崎丸はHTTP 403(恒久ブロック)でスキップ、ひらい丸feedは404(category_urlで確認)。`data/tide.json`に2026-10-15(中潮)を追記、`data/weather.json`はOpen-Meteoに接続できず(10/12〜10/14分は未取得のまま)。GENERATED_AT/LAST_CHECKED_ATを更新、キャッシュバスターをv=214へ。
- 2026-10-15(自動実行、21:20 JST): originを最新化の上、curlで全ソースを取得し既存source_urlと突合。宮川丸#90178(10/15 シロギス堤防 25匹、各堤防→fallback_port)から新規1件を取り込み(`data/catches.json` 3881→3882件、id3885)。他船宿は既存と一致、宮川丸の出船予定告知は除外。伊藤遊船・川崎丸はHTTP 403(恒久ブロック)、ひらい丸feedは404(category_urlで確認)でスキップ。`data/tide.json`は10/15格納済み、`data/weather.json`は未取得のまま。GENERATED_AT/LAST_CHECKED_ATを更新、キャッシュバスターをv=215へ。
- 2026-10-16(自動実行、13:12 JST): originを最新化の上、curlで全ソースを取得し既存source_urlと突合。新規釣果0件(各船宿の最新投稿は10/15 21:20実行までに取り込み済みと一致、宮川丸は出船予定告知のみ、第三あさなぎ丸#409(10/14 真鯛五目船)は尾数記載なし、ひらい丸379959/380052・岩田屋#28268は尾数記載なしのため除外)。伊藤遊船・川崎丸はHTTP 403(恒久ブロック)、ひらい丸feedは404(category_urlで確認)でスキップ。`data/weather.json`はOpen-Meteoが復旧したため10/12〜10/15分を追記。LAST_CHECKED_ATを更新、キャッシュバスターをv=216へ。
- 2026-10-16(自動実行、18:10 JST): originを最新化の上、curlで全ソースを取得し既存source_urlと突合。7船宿から新規23件を取り込み(吉野屋post-1357 6・進丸10/16 3・つり幸308154〜308157 5・中山丸380236/380238 2・山下丸 2・平作丸 3・黒川丸10/16 2。`data/catches.json` 3882→3905件、id3886〜3908)。つり幸のサゴシ(外道)、進丸の午後シロギス(尾数なし)は除外、第三あさなぎ丸10/16(真鯛五目船)は尾数記載なしのため除外、宮川丸は出船予定告知のみ。伊藤遊船・川崎丸はHTTP 403(恒久ブロック)、ひらい丸feedは404(category_urlで確認)でスキップ。`data/tide.json`に2026-10-16(中潮)を追記、`data/weather.json`の10/16分は未取得(当日分のため)。GENERATED_AT/LAST_CHECKED_ATを更新、キャッシュバスターをv=217へ。
