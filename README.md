# 英単語テスト

英語から日本語、日本語から英語、混合モードで4択テストができる静的Webアプリです。

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

`main` ブランチにpushすると、`.github/workflows/pages.yml` がGitHub Pagesへ自動デプロイします。
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
