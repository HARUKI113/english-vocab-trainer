# 英単語テスト

後期中間範囲150問を、暗記カードと4択テストで反復できる静的Webアプリです。

## 暗記カード

最初に自分で答えを思い出してから「答えを見る」を押し、次の3段階で仕分けます。

- `もう一度`: 3枚後を目安に再出題
- `迷った`: 8枚後を目安に再出題
- `覚えた`: その周回では完了

「もう一度」「迷った」のカードは、同じ周回中に「覚えた」になるまで繰り返します。
キーボードでは `Space` で答えを表示し、`1` / `2` / `3` で仕分けできます。
学習履歴は従来の4択テストと共通で、「要復習」「苦手優先」に反映されます。

## 起動

```sh
cd /home/haruki/Desktop/english-vocab-trainer
python3 -m http.server 8000
```

ブラウザで `http://127.0.0.1:8000` または `http://localhost:8000` を開きます。

## 外部公開

外出先や別ネットワークから使う場合は、GitHub Pagesで公開します。

公開URL:

```txt
https://haruki113.github.io/english-vocab-trainer/
```

`kouki-chukan` ブランチにpushすると、`.github/workflows/pages.yml` がGitHub Pagesへ自動デプロイします。
初回だけGitHubのリポジトリ設定で `Settings` -> `Pages` -> `Build and deployment` のSourceを `GitHub Actions` にしてください。

公開対象は `index.html`、`app.js`、`styles.css`、`data/vocab.json`、`robots.txt` に限定しています。
`robots.txt` と `noindex` メタタグで検索避けをしていますが、アクセス制限ではありません。

## データ形式

`data/vocab.json` は `tests[].questions` があれば Forms 由来の問題として出題します。
`answer_language` が `en` の問題は英語の選択肢、`ja` の問題は日本語の選択肢を使います。

```json
{
  "id": "test2-q001",
  "number": 1,
  "answer_language": "en",
  "prompt_en": "Put a stamp on the letter before you ( ) it.",
  "prompt_ja": "その手紙を郵送する前に切手を貼りなさい。",
  "choices": ["press", "post", "check", "cross"],
  "answer": "post"
}
```

`tests[].questions` がない場合は、従来どおり `items` 配列の単語から4択を自動生成します。4択を作るため、最低4件必要です。

```json
{
  "id": "word-001",
  "english": "abandon",
  "japanese": "放棄する、見捨てる",
  "example_en": "The climbers had to abandon their plan because of the storm.",
  "example_ja": "登山者たちは嵐のために計画を放棄しなければならなかった。",
  "tags": ["verb"]
}
```

## 履歴

正解数、ミス数、前回間違えた単語はブラウザの `localStorage` に保存されます。
別のブラウザや端末では別履歴になります。
