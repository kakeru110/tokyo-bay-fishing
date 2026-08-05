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
7. `data/catches.json` の全件(または直近60〜90日分)から `docs/data.js` を再生成する:
   ```js
   window.GENERATED_AT = "YYYY-MM-DD HH:mm";
   window.SOURCES = { "<id>": {"name": "...", "port": "..."}, ... };  // sources.jsonから生成
   window.CATCHES = [ {funayado, date, course, species, size_min, size_max, size_unit, qty_min, qty_max, qty_unit, ground_text, depth_text, lat, lon, source_url}, ... ];
   ```
8. 各ソースの取得成否・新規件数・エラーの有無を簡潔に記録する(このファイルの末尾の「実行ログ」節に追記、直近10回分だけ残して古いものは削除してよい)
9. 変更を `git add -A && git commit -m "..." && git push` でリポジトリのmainブランチに反映する(GitHub Pagesが `docs/` を自動で再公開する)。変更が何もなければcommit/pushはスキップしてよい

## 個別ソースの注意点(data/sources.jsonのparse_notesと重複するが要点のみ)
- ひらい丸・吉野屋・進丸・宮川丸・伊藤遊船: WordPressのRSS(`/feed/`)が使える。RSSは直近10〜20件程度しか含まれないため、既存データと突き合わせて「まだ取り込んでいない投稿」だけ処理すれば十分(通常は前回実行からの差分のみ)。
- 川崎丸: RSSが不安定なため `/blog/` のHTML一覧を直接取得してパースする。

## エラー時の扱い
- 特定の船宿サイトが落ちている・構造が変わってパースできない場合は、そのソースだけスキップし、他のソースの処理は続行する。スキップした場合はその旨を実行ログに残す。
- 1つのソースでパースに失敗するレコードがあっても、そのレコードだけ捨てて他のレコードは取り込む。

## 新しい船宿を追加する場合
`data/sources.json` の `sources` 配列に追記し、`phase2_candidates` から昇格させる。追加直後の初回実行では、その船宿だけ過去1〜2ヶ月分をバックフィル取得する。

## 実行ログ
(このセクションはスケジュールタスク実行のたびに追記される)
- 2026-07-26: 初回セットアップ。ひらい丸(75)・吉野屋(236)・進丸(124)・宮川丸(60)・伊藤遊船(51)・川崎丸(69)の直近1〜2ヶ月分をバックフィル取得(重複排除後615件)し `data/catches.json` を初期構築。座標マッチ内訳: gazetteer 269件・gazetteer_compound 25件・fallback_port 321件(うち269件はground_text自体が記載なし、52件は「各堤」「桟橋」等の陸っぱり釣りで元々沖の地名がない)。
- 2026-07-27: 船宿を10件追加(第三あさなぎ丸・金沢八景黒川丸・つり幸・ひらの丸・鈴福丸・中山丸・岩田屋・山下丸・平作丸・一郎丸、計16件)。直近1〜2ヶ月分をバックフィルし重複排除後1597件に。gazetteerに「下浦沖」「川崎」「第2海堡」「海堡周辺」「京急久里浜沖」を追加。座標マッチ内訳: gazetteer 727件・gazetteer_compound 163件・fallback_port 707件。未組み込みで様子見中: 弁天屋・関義丸・釣り船まる八(本文取得を実証できず)・深川吉野屋(ページング面倒)・鹿島丸(旧世代CGI)。「ぎょさん」「釣りビジョン」「東京湾船釣り速報」の3ポータルは横断取得の可能性ありだが未着手。
- 2026-07-31(手動実行): 全16ソースとも取得不可。WebFetchが全件403 Forbidden、`curl`での直接確認でもCONNECTトンネル自体が403(`gateway answered 403 to CONNECT (policy denial or upstream failure)`)となり、個別サイトの障害ではなく本セッションの egress プロキシ側のポリシーで外部船宿サイトへの通信が丸ごとブロックされていることを確認(hiraimaru.net, susumumaru.com, tsurikou.com, kurokawa-maru.blogspot.com, yamashitamaru.jp, ichiroumaru.jp 等、type違いの複数サイトで再現。一方 github.com 等の許可済みホストへの接続は成功)。README記載の方針どおりリトライ・回避はせず全ソーススキップ。新規取り込み0件、`data/catches.json`・`docs/data.js`は変更なし。次回実行環境では外部船宿ドメインへのegressが許可されていることを確認してから再実行が必要。
- 2026-08-05(手動実行、2026-07-27〜2026-08-05分の未取込をバックフィル): WebFetchツール自体は本セッションでも一貫して403(Anthropicインフラ側の別経路がブロックされたままと推測)だったため、代わりにBash経由の`curl`(ユーザーがegress許可済みと確認したプロキシ経由)で全ソースを取得し、取得したHTML/RSS/AtomをRead/Grepで読んでLLMが手動でレコード化した(スクリプトはcurlでの取得・整形補助と最終JSON組み立てのみに限定し、魚種/釣り場の読み取り判断自体は全て目視で実施)。伊藤遊船(itoyusen.com)のみ全パス403で恒久的にサイト側がブロックしている様子のためスキップ。他15ソースは成功(品川ひらい丸は`www.hiraimaru.net`は生きているが`hiraimaru.net`のみ502でapexドメイン側が不調、`/feed/`は404のため`/category/Choka/`から取得)。つり幸・中山丸・川崎丸は直近ページが更新済み分に届かなかったため、`/api/getRealtimeListPage/` `/api/getChokaListPage/` `/blog/page/2/`等のページングで07-27まで遡って取得。gazetteerに「台船回り」(黒川丸のリレータチ釣り場、走水沖と同座標)を追加。新規取り込み247件(内訳: 吉野屋40・つり幸38・進丸26・黒川丸25・一郎丸17・ひらの丸15・山下丸15・川崎丸14・ひらい丸13・中山丸13・平作丸10・宮川丸8・岩田屋5・鈴福丸5・第三あさなぎ丸3)。座標マッチ内訳: gazetteer 163件・gazetteer_compound 30件・fallback_port 54件。`data/catches.json`は1597→1844件、`docs/data.js`を全件から再生成(GENERATED_AT 2026-08-05 12:10)。
