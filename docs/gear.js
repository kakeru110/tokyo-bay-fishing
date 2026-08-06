// Amazon アソシエイト用の魚種別おすすめ仕掛け・タックル検索キーワード辞書。
// PA-APIは使わず、Amazon検索結果への素のリンク(?k=キーワード&tag=タグ)のみで完結させる。
window.AMAZON_ASSOCIATE_TAG = "kakeru020-22";

window.GEAR_RECOMMENDATIONS = {
  "マアジ": [
    { label: "サビキ仕掛け(船釣り用)", keyword: "サビキ仕掛け 船釣り" },
    { label: "アジビシャン(コマセカゴ)", keyword: "アジビシャン コマセカゴ" },
  ],
  "ビジアジ": [
    { label: "サビキ仕掛け(船釣り用)", keyword: "サビキ仕掛け 船釣り" },
  ],
  "タチウオ": [
    { label: "タチウオ ワインドルアー", keyword: "タチウオ ワインド ルアー" },
    { label: "タチウオ天秤仕掛け", keyword: "タチウオ 天秤 仕掛け" },
  ],
  "シロギス": [
    { label: "キス投げ釣り仕掛け", keyword: "キス 投げ釣り 仕掛け" },
    { label: "キス用天秤", keyword: "キス 天秤 仕掛け" },
  ],
  "マダコ": [
    { label: "タコエギ", keyword: "タコエギ" },
    { label: "タコ用テンヤ", keyword: "タコ テンヤ 仕掛け" },
  ],
  "アナゴ": [
    { label: "アナゴ仕掛け(船釣り用)", keyword: "アナゴ 仕掛け 船釣り" },
  ],
  "あなご": [
    { label: "アナゴ仕掛け(船釣り用)", keyword: "アナゴ 仕掛け 船釣り" },
  ],
  "イサキ": [
    { label: "イサキ用コマセ仕掛け", keyword: "イサキ 仕掛け コマセ" },
  ],
  "カワハギ": [
    { label: "カワハギ仕掛け(船釣り用)", keyword: "カワハギ 仕掛け 船釣り" },
    { label: "カワハギ用集寄", keyword: "カワハギ 集寄" },
  ],
  "ふぐ": [
    { label: "船フグ仕掛け", keyword: "船 フグ 仕掛け" },
    { label: "フグ専用ワイヤーハリス", keyword: "フグ ワイヤーハリス" },
  ],
  "フグ": [
    { label: "船フグ仕掛け", keyword: "船 フグ 仕掛け" },
  ],
  "ショウサイフグ": [
    { label: "ショウサイフグ仕掛け", keyword: "ショウサイフグ 仕掛け" },
  ],
  "カサゴ": [
    { label: "カサゴ仕掛け(胴突き)", keyword: "カサゴ 仕掛け 胴突き" },
    { label: "根魚用ワームセット", keyword: "根魚 ワーム セット" },
  ],
  "マゴチ": [
    { label: "マゴチ天秤仕掛け", keyword: "マゴチ 天秤 仕掛け" },
  ],
  "クロダイ": [
    { label: "クロダイ落とし込み仕掛け", keyword: "クロダイ 落とし込み 仕掛け" },
  ],
  "カイズ": [
    { label: "クロダイ(カイズ)仕掛け", keyword: "クロダイ 落とし込み 仕掛け" },
  ],
  "ハゼ": [
    { label: "ハゼ釣り仕掛けセット", keyword: "ハゼ釣り 仕掛け セット" },
  ],
  "マダイ": [
    { label: "タイラバ", keyword: "タイラバ" },
    { label: "鯛カブラ", keyword: "鯛カブラ" },
  ],
  "スルメイカ": [
    { label: "イカメタル仕掛け", keyword: "イカメタル 仕掛け" },
  ],
  "麦烏賊": [
    { label: "イカメタル仕掛け", keyword: "イカメタル 仕掛け" },
  ],
  "シマダイ": [
    { label: "船釣り万能仕掛け", keyword: "船釣り 仕掛け 万能" },
  ],
  "イシモチ": [
    { label: "イシモチ仕掛け(船釣り用)", keyword: "イシモチ 仕掛け 船釣り" },
  ],
  "シーバス": [
    { label: "シーバスルアーセット", keyword: "シーバス ルアー セット" },
  ],
};

// 報告数の多い魚種向けに、画像付きの具体的な商品(ASIN直リンク)を試験的に用意。
// ここに無い魚種は従来どおりGEAR_RECOMMENDATIONSの検索リンクにフォールバックする。
window.GEAR_PRODUCTS = {
  "マアジ": [
    { asin: "B00D3RLNHQ", title: "ハヤブサ(Hayabusa) 下カゴ飛ばしサビキセット リアルアミエビ 8-3", image: "https://m.media-amazon.com/images/I/71zAErAltIL._AC_UL320_.jpg" },
    { asin: "B002OARBXS", title: "第一精工 コマセカゴシリーズ サビキカゴ プラカゴ", image: "https://m.media-amazon.com/images/I/61akH2ussTL._AC_UL320_.jpg" },
  ],
  "タチウオ": [
    { asin: "B07FFTLQZC", title: "メジャークラフト ワーム 太刀魚道場 テンヤスタートセット", image: "https://m.media-amazon.com/images/I/618Dg6pDHEL._AC_UL320_.jpg" },
    { asin: "B0CB7KS6LL", title: "ダイワ(DAIWA) 船タチウオ天秤仕掛SS SPケン付", image: "https://m.media-amazon.com/images/I/51G3C+eNXdL._AC_UL320_.jpg" },
  ],
  "シロギス": [
    { asin: "B008QQSRUA", title: "ハヤブサ(Hayabusa) 投げキス天秤式 早掛キス 2本鈎", image: "https://m.media-amazon.com/images/I/61rzNDm4MeL._AC_UL320_.jpg" },
    { asin: "B00IN2JQC0", title: "ハヤブサ(Hayabusa) ライトショット 立つ天秤スマッシュ", image: "https://m.media-amazon.com/images/I/511D4o6+OnL._AC_UL320_.jpg" },
  ],
};

window.GEAR_DEFAULT = [
  { label: "船釣り仕掛け各種", keyword: "船釣り 仕掛け" },
  { label: "船釣り用クーラーボックス", keyword: "船釣り クーラーボックス" },
];
