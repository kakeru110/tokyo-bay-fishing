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

- 2026-09-29(自動実行、日次差分取得・当日2回目): 前回(13:13実行、コミットf1fcb18)からoriginを最新化の上(手元と一致)、全16ソースを直接取得し既存source_url/IDと突合。伊藤遊船はHTTP 403(恒久ブロック)のままスキップ。川崎丸は/blog/ HTTP 200(#51976は定休日告知のみで対象外)。ひらい丸のfeed_urlは404のためcategory_urlを使用(新規なし)。吉野屋・進丸・宮川丸・鈴福丸・中山丸・岩田屋は新規0件。新規13件: つり幸(307399ルアーサワラ+混獲サゴシ→サワラ・タチウオ、307400シロギス)4件、ひらの丸(379127タチウオ)1件、一郎丸(タチウオ・アジ)2件、山下丸(カワハギ)1件、平作丸(タチウオ)1件、黒川丸(blog-post_29、タチウオ天秤・リレーアジ)2件、第三あさなぎ丸(真鯛五目船-401、マアジ・マダイ)2件(`data/catches.json` 3419→3432件、id3423〜3435)。新規species_alias・fishing_grounds追加なし。`data/tide.json`は2026-09-29が既に格納済み。`data/weather.json`はOpen-Meteoが日次上限超過エラーのため2026-09-29分は引き続き未追記(次回以降に補完)。`docs/data.js`を再生成(`GENERATED_AT`/`LAST_CHECKED_AT`とも2026-09-29 18:10)、data.jsキャッシュバスターをv=165→v=166に更新。
- 2026-09-29(自動実行、21:30 JST): originを最新化の上、curlで全ソースを確認。新規釣果0件。宮川丸は告知記事のみ(釣果なし)、一郎丸の新規詳細4件は「お客様見えず休み」で釣果なし、山下丸・平作丸・黒川丸・ひらい丸・吉野屋・進丸・第三あさなぎ丸・ぎょさん系4船宿・岩田屋は既存と一致。川崎丸(/blog/)と伊藤遊船(feed)はHTTP 403でスキップ。LAST_CHECKED_ATのみ更新、キャッシュバスターをv=167へ。
- 2026-09-30(自動実行、13:12 JST): originを最新化の上、curlで全ソースを取得し既存source_url/IDと突合。新規釣果0件(つり幸・ひらの丸・鈴福丸・中山丸・ひらい丸・吉野屋・進丸・宮川丸・川崎丸・第三あさなぎ丸・岩田屋・黒川丸・山下丸・平作丸は最新投稿が既存と一致、一郎丸の未収載2件は9/29「お客様見えず休み」のみ)。伊藤遊船はHTTP 403(恒久ブロック)でスキップ。`data/weather.json`の2026-09-29分はOpen-Meteoが日次上限(429)のため引き続き未追記。LAST_CHECKED_ATのみ更新、キャッシュバスターをv=168へ。
- 2026-09-30(自動実行、18:05 JST): originを最新化の上、curlで全ソースを取得し既存source_url/IDと突合。7船宿から新規11件を取り込み(ひらの丸1・中山丸2・ひらい丸1(尾数・釣り場記載なし)・吉野屋3・川崎丸1(フグ)・一郎丸3。一郎丸の9/30カワハギは「お客様見えず休み」のため対象外)。宮川丸は告知記事のみ、他は既存と一致。伊藤遊船はHTTP 403(恒久ブロック)でスキップ。`data/tide.json`に2026-09-30(中潮)を追記。`data/weather.json`はOpen-Meteoが日次上限(429)のため2026-09-29分は引き続き未追記。GENERATED_AT/LAST_CHECKED_ATを更新、キャッシュバスターをv=169へ。
- 2026-09-30(自動実行、21:20 JST): originを最新化の上、curlで全ソースを取得し既存source_urlと突合。つり幸の新着3記事(#307434〜307436、タチウオ天秤/ルアー・午前シロギス・ルアーサワラ+混獲タチウオ)から新規5件を取り込み(`data/catches.json` 3443→3448件)。他船宿は既存と一致、一郎丸9/30カワハギは休業のため対象外、川崎丸#51925/#51976・宮川丸の新規URLは告知のみ。伊藤遊船はHTTP 403(恒久ブロック)でスキップ。`data/weather.json`は未追記だった2026-09-29分をOpen-Meteoから補完(9/30分は未取得)。`data/tide.json`は2026-09-30格納済み。GENERATED_AT/LAST_CHECKED_ATを更新、キャッシュバスターをv=170へ。
- 2026-10-01(自動実行、13:11 JST): originを最新化の上、curlで全ソースを取得し既存source_url/IDと突合。新規釣果0件(つり幸・ひらの丸・鈴福丸・中山丸・ひらい丸・吉野屋・進丸・宮川丸・川崎丸・第三あさなぎ丸・岩田屋・黒川丸・山下丸・平作丸は最新投稿が既存と一致、一郎丸の未収載3件は9/29・9/30「お客様見えず休み」のみ)。伊藤遊船はHTTP 403(恒久ブロック)でスキップ。`data/weather.json`の2026-09-30分はOpen-Meteoが日次上限のため未追記。LAST_CHECKED_ATのみ更新、キャッシュバスターをv=171へ。
- 2026-10-01(自動実行、18:05 JST): originを最新化の上、curlで全ソースを取得し既存source_urlと突合。中山丸の新着#379192(10/1 タチウオ・走水周辺)から新規1件を取り込み(`data/catches.json` 3448→3449件)。他船宿は既存と一致、一郎丸は9/28〜9/30「お客様見えず休み」のみ、吉野屋の旧URL3件(post-390/414/459)は一覧上の古い記事、宮川丸・山下丸・平作丸は既存と一致。伊藤遊船・川崎丸はHTTP 403(恒久ブロック)でスキップ。`data/tide.json`に2026-10-01(中潮)を追記(tide736 APIは新URL `tide736.net/api/get_tide.php` へ301リダイレクトされるため`curl -L`が必要)。`data/weather.json`は未追記だった2026-09-30分を補完(10/1分は未取得)。GENERATED_AT/LAST_CHECKED_ATを更新、キャッシュバスターをv=172へ。
- 2026-10-01(自動実行、21:20 JST): originを最新化の上、curlで全ソースを取得し既存source_urlと突合。第三あさなぎ丸の新着(9/30真鯛五目船)からマアジ・マダイ、川崎丸の新着#51995(10/1フグ、6〜40尾)から計3件を取り込み(`data/catches.json` 3449→3452件)。他船宿は既存と一致、一郎丸は9/30「お客様見えず休み」のみ、宮川丸は告知のみ。伊藤遊船はHTTP 403(恒久ブロック)でスキップ。`data/weather.json`に2026-10-01分を追記。`data/tide.json`は10/1格納済み。GENERATED_AT/LAST_CHECKED_ATを更新、キャッシュバスターをv=173へ。
- 2026-10-02(自動実行、13:10 JST): originを最新化の上、curlで全ソースを取得し既存source_urlと突合。進丸の新着(10/2、午前シロギス・午前アジ。午後は休船)から新規2件を取り込み(`data/catches.json` 3452→3454件)。他船宿は既存と一致、川崎丸#52009は休船告知のみ、ひらい丸feedは404(category_urlで確認)。伊藤遊船はHTTP 403(恒久ブロック)でスキップ。`data/tide.json`に2026-10-02(小潮)を追記。`data/weather.json`の10/2分は当日のため未取得。GENERATED_AT/LAST_CHECKED_ATを更新、キャッシュバスターをv=174へ。
- 2026-10-02(自動実行、18:05 JST): originを最新化の上、curlで全ソースを取得し既存source_urlと突合。7船宿から新規28件を取り込み(つり幸7・中山丸1・ひらい丸2・吉野屋5・第三あさなぎ丸4・黒川丸3・山下丸5・平作丸1。`data/catches.json` 3454→3482件)。川崎丸#52009は休船告知、宮川丸は告知のみ、進丸・岩田屋・一郎丸・ひらの丸・鈴福丸は既存と一致。伊藤遊船はHTTP 403(恒久ブロック)でスキップ。`data/tide.json`は10/2格納済み、`data/weather.json`の10/2分は当日のため未取得。GENERATED_AT/LAST_CHECKED_ATを更新、キャッシュバスターをv=175へ。
- 2026-10-02(自動実行、21:23 JST): originを最新化の上、curlで全ソースを取得し既存source_urlと突合。新規釣果0件(各船宿の最新投稿は18:05実行で取り込み済みと一致、宮川丸は出船予定告知・大会告知のみ)。伊藤遊船・川崎丸はHTTP 403(恒久ブロック)でスキップ、ひらい丸feedは404(category_urlで確認)。LAST_CHECKED_ATのみ更新、キャッシュバスターをv=176へ。
