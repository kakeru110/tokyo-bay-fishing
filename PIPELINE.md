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


- 2026-11-10(自動実行、18:05 JST): originを最新化の上、curlで全ソースを取得し既存source_urlと突合。進丸2026-11-10(午前シロギス 1〜10尾)・一郎丸 ふぐ釣り(11/10 2〜9匹)から新規2件を取り込み(`data/catches.json` 4417→4419件、id4421〜4422)。第三あさなぎ丸11/10(真鯛五目)は尾数記載なしで除外、他船宿は新着なし(ひらの丸は予約告知のみ)。伊藤遊船・川崎丸はHTTP 403(恒久ブロック)、ひらい丸feedは404(category_urlで確認)でスキップ。`data/tide.json`に2026-11-10(大潮)を追記。`data/weather.json`はOpen-Meteoが日次上限超過のため11/9〜11/10未取得(後日補完)。GENERATED_AT/LAST_CHECKED_ATを更新、キャッシュバスターをv=292へ。
- 2026-11-10(自動実行、21:05 JST): originを最新化の上、curlで全ソースを取得し既存source_urlと突合。山下丸11/10 カワハギ(久里浜沖〜下浦沖)から新規1件を取り込み(`data/catches.json` 4419→4420件、id4423)。他船宿は新着なし(宮川丸は告知のみ、ひらの丸は予約告知のみ、第三あさなぎ丸は尾数記載なし)。伊藤遊船・川崎丸はHTTP 403(恒久ブロック)、ひらい丸feedは404(category_urlで確認)、黒川丸category_urlは503(feedで確認)でスキップ。`data/tide.json`は11/10まで格納済み。`data/weather.json`はOpen-Meteoが日次上限超過のため11/9〜11/10未取得(後日補完)。GENERATED_AT/LAST_CHECKED_ATを更新、キャッシュバスターをv=293へ。
- 2026-11-11(自動実行、13:15 JST): originを最新化の上、curlで全ソースを取得し既存source_urlと突合。ひらの丸381986(11/10 タチウオ船 テンビン/テンヤ)・つり幸309339(11/11 午前アジ 第21さくら丸)から新規3件を取り込み(`data/catches.json` 4420→4423件、id4424〜4426)。他船宿は新着なし(第三あさなぎ丸11/10は尾数記載なし、宮川丸は告知のみ、山下丸・平作丸ほかは取り込み済み)。伊藤遊船・川崎丸はHTTP 403(恒久ブロック)、ひらい丸feedは404(category_urlで確認)でスキップ。`data/tide.json`に2026-11-11(中潮)を追記。`data/weather.json`は11/9〜11/10をOpen-Meteoから補完(初回は接続リセット、再試行で成功)。GENERATED_AT/LAST_CHECKED_ATを更新、キャッシュバスターをv=294へ。
- 2026-11-11(自動実行、18:04 JST): originを最新化の上、curlで全ソースを取得し既存source_urlと突合。進丸2026-11-11(午前アジ/午後シロギス)・黒川丸blog-post_10(11/11 ショートアジ 観音崎沖)・ひらの丸382010(11/11 タチウオ テンビン)・中山丸382015/382028(11/11 LTアジ/タチウオ)・一郎丸 タチウオ・アジリレー/カワハギ(11/11)から新規9件を取り込み(`data/catches.json` 4423→4432件、id4427〜4435)。種名辞書に「午後シロギス」「ｼｮｰﾄｱｼﾞ」を追記。他船宿は新着なし(第三あさなぎ丸は尾数記載なし、宮川丸は告知のみ、一郎丸1602832835はモバイルバッテリー告知のみ)。伊藤遊船・川崎丸はHTTP 403(恒久ブロック)、ひらい丸feedは404(category_urlで確認)でスキップ。`data/tide.json`は11/11まで格納済み。`data/weather.json`はOpen-Meteoが日次上限超過のため11/11未取得(後日補完)。GENERATED_AT/LAST_CHECKED_ATを更新、キャッシュバスターをv=295へ。
- 2026-11-11(自動実行、21:05 JST): originを最新化の上、curlで全ソースを取得し既存source_urlと突合。つり幸309370(11/11 午前シロギス 第三さくら丸)・309369(11/11 ルアーサワラ サワラ/サゴシ)から新規3件を取り込み(`data/catches.json` 4432→4435件、id4436〜4438)。平作丸11/11 ゴモク船は魚種「ゴモク」一括表記(5〜11匹、イサキ主体の混合)で単一魚種に正規化できないため除外。他船宿は新着なし(第三あさなぎ丸は尾数記載なし、宮川丸は告知のみ、山下丸は11/10まで取り込み済み)。伊藤遊船・川崎丸はHTTP 403(恒久ブロック)、ひらい丸feedは404(category_urlで確認)でスキップ、宮川丸feedは初回接続リセット・再試行で取得。`data/tide.json`は11/11まで格納済み。`data/weather.json`はOpen-Meteoが日次上限超過のため11/11未取得(後日補完)。GENERATED_AT/LAST_CHECKED_ATを更新、キャッシュバスターをv=296へ。
- 2026-11-12(自動実行、13:08 JST): originを最新化の上、curlで全ソースを取得し既存source_urlと突合。宮川丸90372(11/8 クロダイ堤防 0〜5枚 30〜42cm 各堤)が未取り込みだったため新規1件を取り込み(`data/catches.json` 4435→4436件、id4439、各堤のためfallback_port)。第三あさなぎ丸11/11(真鯛五目 トップ5枚・最大2.6kg)は下限尾数の記載なしのため従来方針どおり除外、黒川丸blog-post_468は10/17分の重複投稿(blog-post_17で取り込み済み)のため除外、他船宿は新着なし(ひらい丸381951/381952/381817/381444は尾数記載なしで除外済み、平作丸11/11はゴモク一括表記で除外済み、宮川丸86229/89993/90332は告知のみ)。伊藤遊船・川崎丸はHTTP 403(恒久ブロック)、ひらい丸feedは404(category_urlで確認)でスキップ。`data/tide.json`は11/11まで格納済み(新規レコード日付11/8は登録済み)。`data/weather.json`に11/11をOpen-Meteoから補完(初回は接続リセット、再試行で成功)。GENERATED_AT/LAST_CHECKED_ATを更新、キャッシュバスターをv=297へ。
- 2026-11-12(自動実行、18:05 JST): originを最新化の上、curlで全ソースを取得し既存source_urlと突合。吉野屋post-1529(11/12 LTアジ/ふぐ/カワハギ/ビシアジ/シロギス/サワラルアー)・中山丸382116(11/12 タチウオ 湾奥)・一郎丸 タチウオアジリレー/カワハギ/ふぐ(11/12)・黒川丸blog-post_11(11/12 ショートアジ/五目船ワラサ・イサキ)・山下丸11/12 カワハギ/アマダイ・平作丸11/11 タチウオ船(走水沖、前回までに未取り込み)から新規17件を取り込み(`data/catches.json` 4436→4453件、id4440〜4456)。他船宿は新着なし(第三あさなぎ丸は尾数記載なし、宮川丸86229/89993/90332は告知のみ、岩田屋の旧仕立船投稿は従来どおり除外、一郎丸1602832835はモバイルバッテリー告知のみ、進丸・つり幸・ひらの丸・鈴福丸・ひらい丸は取り込み済み)。伊藤遊船・川崎丸はHTTP 403(恒久ブロック)、ひらい丸feedは404(category_urlで確認)でスキップ、宮川丸feedは初回接続リセット・再試行で取得。`data/tide.json`に2026-11-12(中潮)を追記。`data/weather.json`は11/12が当日途中のため未取得(後日補完)。GENERATED_AT/LAST_CHECKED_ATを更新、キャッシュバスターをv=298へ。
- 2026-11-12(自動実行、21:05 JST): originを最新化の上、curlで全ソースを取得し既存source_urlと突合。鈴福丸382142(11/12 ビシアジ船 アジ25〜38cm 12〜34匹)から新規1件を取り込み(`data/catches.json` 4453→4454件、id4457、釣り場記載なしのためfallback_port)。他船宿は新着なし(第三あさなぎ丸は尾数記載なしで除外済み、宮川丸86229/89993/90332は告知のみ、黒川丸blog-post_468は重複投稿、一郎丸1602832835は告知のみ、山下丸・平作丸・吉野屋・中山丸・つり幸・ひらの丸・進丸・ひらい丸・岩田屋は取り込み済み)。伊藤遊船・川崎丸はHTTP 403(恒久ブロック)、ひらい丸feedは404(category_urlで確認)でスキップ。`data/tide.json`は11/12まで格納済み。`data/weather.json`は11/12が当日途中のため未取得(後日補完)。GENERATED_AT/LAST_CHECKED_ATを更新、キャッシュバスターをv=299へ。
- 2026-11-13(自動実行、13:10 JST): originを最新化の上、curlで全ソースを取得し既存source_urlと突合。新規レコードは0件(第三あさなぎ丸・ひらい丸381444/381817/381951/381952は尾数記載なしで除外済み、宮川丸86229/89993/90332は告知のみ、黒川丸blog-post_468は重複投稿、一郎丸1602832835は告知のみ、岩田屋の旧仕立船投稿は従来どおり除外、吉野屋post-390/414/459は5月の旧投稿、山下丸・平作丸は11/12・11/11まで取り込み済み、他船宿も取り込み済み)。伊藤遊船・川崎丸はHTTP 403(恒久ブロック)、ひらい丸feedは404(category_urlで確認)でスキップ。`data/tide.json`は11/12まで格納済み。`data/weather.json`に11/12をOpen-Meteoから補完(初回は接続リセット、再試行で成功)。GENERATED_AT据え置き、LAST_CHECKED_ATを更新、キャッシュバスターをv=300へ。
- 2026-11-13(自動実行、18:05 JST): originを最新化の上、curlで全ソースを取得し既存source_urlと突合。ひらい丸382166(11/13 ショートLTアジ 本牧沖)・つり幸309440/309441/309451(11/13 午前シロギス/午前アジ/ルアーサワラ・サゴシ)・ひらの丸382172/382175(11/13 タチウオ テンビン/テンヤ、カワハギ 富津南・竹岡沖)・中山丸382180/382189(11/13 LTアジ 川崎沖/タチウオ 湾奥)・吉野屋post-1546(11/13 LTアジ/ふぐ/タチウオ/シロギス/ビシアジ/サワラルアー)・山下丸11/13 カワハギ/アマダイから新規18件を取り込み(`data/catches.json` 4454→4472件、id4458〜4475)。第三あさなぎ丸11/13(真鯛五目)は尾数記載なしで除外、他船宿は新着なし(宮川丸86229/89993/90332は告知のみ、黒川丸blog-post_468は重複投稿、岩田屋の旧仕立船投稿は従来どおり除外、平作丸は11/11まで・一郎丸・進丸・鈴福丸・黒川丸は取り込み済み)。伊藤遊船・川崎丸はHTTP 403(恒久ブロック)、ひらい丸feedは404(category_urlで確認)でスキップ。`data/tide.json`に2026-11-13(中潮)を追記。`data/weather.json`は11/13が当日途中のため未取得(後日補完)。GENERATED_AT/LAST_CHECKED_ATを更新、キャッシュバスターをv=301へ。
