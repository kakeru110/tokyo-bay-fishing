// Amazon アソシエイト用の魚種別おすすめ仕掛け・タックル辞書。
// GEAR_PRODUCTS(画像+ASIN直リンク)が優先され、無い魚種はGEAR_RECOMMENDATIONSの
// 検索結果リンク(?k=キーワード&tag=タグ)にフォールバックする(PA-APIは使わない)。
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

// 画像付きの具体的な商品(ASIN直リンク)。ここに無い魚種は
// GEAR_RECOMMENDATIONSの検索リンクにフォールバックする。
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
  "マダコ": [
    { asin: "B09RDVVCLC", title: "シマノ(SHIMANO) タコエギ タコマスター フラッシュブースト 3.5号", image: "https://m.media-amazon.com/images/I/51bcdrQ424L._AC_UL320_.jpg" },
    { asin: "B004HE1CZC", title: "OWNER(オーナー) 大ダコ木製船テンヤ", image: "https://m.media-amazon.com/images/I/41+apjASq4L._AC_UL320_.jpg" },
  ],
  "アナゴ": [
    { asin: "B00KAPK8UM", title: "がまかつ(Gamakatsu) ウナギ・アナゴ遊動仕掛 UN605", image: "https://m.media-amazon.com/images/I/71tRr27mq4L._AC_UL320_.jpg" },
    { asin: "B003QCMKHU", title: "ささめ針(Sasame) うなぎアナゴ ぶっこみ仕掛", image: "https://m.media-amazon.com/images/I/71ThDaelCGL._AC_UL320_.jpg" },
  ],
  "あなご": [
    { asin: "B00KAPK8UM", title: "がまかつ(Gamakatsu) ウナギ・アナゴ遊動仕掛 UN605", image: "https://m.media-amazon.com/images/I/71tRr27mq4L._AC_UL320_.jpg" },
    { asin: "B003QCMKHU", title: "ささめ針(Sasame) うなぎアナゴ ぶっこみ仕掛", image: "https://m.media-amazon.com/images/I/71ThDaelCGL._AC_UL320_.jpg" },
  ],
  "イサキ": [
    { asin: "B0BZP9RXHF", title: "ダイワ(DAIWA) 快適吹き流し仕掛け イサキ･マダイ 3本針1セット", image: "https://m.media-amazon.com/images/I/61GRjlmtP5L._AC_UL320_.jpg" },
    { asin: "B07S4T87CZ", title: "オーナー(OWNER) 吹き流しイサキの基本", image: "https://m.media-amazon.com/images/I/61bM1UtSQnL._AC_UL320_.jpg" },
  ],
  "カワハギ": [
    { asin: "B0CBJ9ZYFD", title: "ダイワ(DAIWA) カワハギワンデイパック SS", image: "https://m.media-amazon.com/images/I/51v8H-Cm5jL._AC_UL320_.jpg" },
    { asin: "B0CHRGWWN1", title: "ダイワ(DAIWA) 集魚板カワハギピラピラ集寄", image: "https://m.media-amazon.com/images/I/41OS7gXoqjL._AC_UL320_.jpg" },
  ],
  "ふぐ": [
    { asin: "B0CDSTXPJ1", title: "オーナー(OWNER) カットウ一角ふぐチラシ仕掛", image: "https://m.media-amazon.com/images/I/41uL6dsKyuL._AC_UL320_.jpg" },
    { asin: "B0D5LVN7B2", title: "ヤマワ産業(Yamawa Sangyo) カットウ仕掛け ダイレクト", image: "https://m.media-amazon.com/images/I/51Okjz5mZ-L._AC_UL320_.jpg" },
  ],
  "フグ": [
    { asin: "B0CDSTXPJ1", title: "オーナー(OWNER) カットウ一角ふぐチラシ仕掛", image: "https://m.media-amazon.com/images/I/41uL6dsKyuL._AC_UL320_.jpg" },
    { asin: "B0D5LVN7B2", title: "ヤマワ産業(Yamawa Sangyo) カットウ仕掛け ダイレクト", image: "https://m.media-amazon.com/images/I/51Okjz5mZ-L._AC_UL320_.jpg" },
  ],
  "ショウサイフグ": [
    { asin: "B0CDSTXPJ1", title: "オーナー(OWNER) カットウ一角ふぐチラシ仕掛", image: "https://m.media-amazon.com/images/I/41uL6dsKyuL._AC_UL320_.jpg" },
    { asin: "B0D5LVN7B2", title: "ヤマワ産業(Yamawa Sangyo) カットウ仕掛け ダイレクト", image: "https://m.media-amazon.com/images/I/51Okjz5mZ-L._AC_UL320_.jpg" },
  ],
  "カサゴ": [
    { asin: "B002NPHH6U", title: "ハヤブサ(Hayabusa) 堤防メバル・ガシラ 胴突2本鈎3セット", image: "https://m.media-amazon.com/images/I/91sohz-4qoL._AC_UL320_.jpg" },
    { asin: "B002NPHFOE", title: "オーナー(OWNER) 胴突波止カサゴ セット仕掛け", image: "https://m.media-amazon.com/images/I/71IaCEmHa2L._AC_UL320_.jpg" },
  ],
  "マゴチ": [
    { asin: "B086DKR9QS", title: "がまかつ(Gamakatsu) 改良マゴチ仕掛(エビ餌用) F139", image: "https://m.media-amazon.com/images/I/51iYP5sv55L._AC_UL320_.jpg" },
    { asin: "B086DL6S74", title: "がまかつ(Gamakatsu) 改良マゴチ仕掛(ハゼ･メゴチ餌用) F140", image: "https://m.media-amazon.com/images/I/819ypvzHrpL._AC_UL320_.jpg" },
  ],
  "クロダイ": [
    { asin: "B0B58HVTQC", title: "ダイワ(DAIWA) 快適落とし込み仕掛けSS LBG", image: "https://m.media-amazon.com/images/I/618lMA+0tHL._AC_UL320_.jpg" },
    { asin: "B00QVDOGXC", title: "ハヤブサ(Hayabusa) 船極喰わせサビキ ライトタックル 落し込み", image: "https://m.media-amazon.com/images/I/81iKrfBxgDL._AC_UL320_.jpg" },
  ],
  "カイズ": [
    { asin: "B0B58HVTQC", title: "ダイワ(DAIWA) 快適落とし込み仕掛けSS LBG", image: "https://m.media-amazon.com/images/I/618lMA+0tHL._AC_UL320_.jpg" },
    { asin: "B00QVDOGXC", title: "ハヤブサ(Hayabusa) 船極喰わせサビキ ライトタックル 落し込み", image: "https://m.media-amazon.com/images/I/81iKrfBxgDL._AC_UL320_.jpg" },
  ],
  "ハゼ": [
    { asin: "B08XLTGT8P", title: "ハヤブサ(Hayabusa) かんたんハゼ釣り胴突セット 3号", image: "https://m.media-amazon.com/images/I/81MbkBypquL._AC_UL320_.jpg" },
    { asin: "B003XG8HEO", title: "ハヤブサ(Hayabusa) ハゼだぜ 簡単投げ 2本鈎3セット", image: "https://m.media-amazon.com/images/I/81RtnyejBdL._AC_UL320_.jpg" },
  ],
  "マダイ": [
    { asin: "B0BT1MXLZC", title: "ダイワ(DAIWA) タイラバ 紅牙ベイラバーフリーβ", image: "https://m.media-amazon.com/images/I/51z28NtS31L._AC_UL320_.jpg" },
    { asin: "B0DVGD6H3L", title: "ダイワ(DAIWA) 紅牙タイテンヤ/タイカブラSS TB早掛", image: "https://m.media-amazon.com/images/I/415GTY0iafL._AC_UL320_.jpg" },
  ],
  "スルメイカ": [
    { asin: "B08TWR3LMD", title: "がまかつ(Gamakatsu) イカメタルリーダー 3本 IK043", image: "https://m.media-amazon.com/images/I/71ODlHruyIL._AC_UL320_.jpg" },
    { asin: "B0GHRN3SJ3", title: "サンライン(SUNLINE) アジーロ エステル イカメタル仕掛", image: "https://m.media-amazon.com/images/I/71cwKY7jVaL._AC_UL320_.jpg" },
  ],
  "麦烏賊": [
    { asin: "B08TWR3LMD", title: "がまかつ(Gamakatsu) イカメタルリーダー 3本 IK043", image: "https://m.media-amazon.com/images/I/71ODlHruyIL._AC_UL320_.jpg" },
    { asin: "B0GHRN3SJ3", title: "サンライン(SUNLINE) アジーロ エステル イカメタル仕掛", image: "https://m.media-amazon.com/images/I/71cwKY7jVaL._AC_UL320_.jpg" },
  ],
  "シマダイ": [
    { asin: "B0751LJJ8Y", title: "がまかつ(Gamakatsu) 遠投万能カゴ仕掛 ケイムラスキン", image: "https://m.media-amazon.com/images/I/717D1IXhJ8L._AC_UL320_.jpg" },
    { asin: "B002NPDPLG", title: "ささめ針(SASAME) カゴ釣り五目 堤防仕掛", image: "https://m.media-amazon.com/images/I/41J7cj-QSgL._AC_UL320_.jpg" },
  ],
  "イシモチ": [
    { asin: "B004HE1HGQ", title: "OWNER(オーナー) 仕掛け 胴突イシモチ五目 2本 赤バリ", image: "https://m.media-amazon.com/images/I/41r1wCg5Y5L._AC_UL320_.jpg" },
    { asin: "B000AR2EMK", title: "OWNER(オーナー) 胴突イシモチ・(カレイ/セイゴ/アイナメ)鈎", image: "https://m.media-amazon.com/images/I/418NZ1G0RJL._AC_UL320_.jpg" },
  ],
  "シーバス": [
    { asin: "B01N2GM9K4", title: "オルルド釣具 ルアーセット 6個 ミノー Aスペシャル", image: "https://m.media-amazon.com/images/I/71aaqMOISGL._AC_UL320_.jpg" },
    { asin: "B086SYLMKN", title: "オルルド釣具 ヘビーウェイトシンキングミノーA", image: "https://m.media-amazon.com/images/I/61XeuhieI5L._AC_UL320_.jpg" },
  ],
};

window.GEAR_DEFAULT = [
  { label: "船釣り仕掛け各種", keyword: "船釣り 仕掛け" },
  { label: "船釣り用クーラーボックス", keyword: "船釣り クーラーボックス" },
];
