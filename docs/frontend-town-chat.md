# 町のチャット：フロントとバックエンドの受け口

フロント（`dev/front`）の町のチャットは、AI接続設定があるとき（`/api/config` の `aiReady: true`）に次の受け口を呼びます。受け口がない・失敗したときは、画面側の体験用データ（`public/town-data.js`）で答えます。

## POST `/api/town-answer`

ヘッダーは既存のAPIと同じです（`x-workspace-id`、`x-demo-access-code`）。

### リクエスト

```json
{
  "place": "青葉地区",
  "question": "夏祭りはいつから続いているの？",
  "history": [
    { "role": "user", "text": "…" },
    { "role": "assistant", "text": "…", "citations": [] }
  ]
}
```

`history` は直近10件まで。

### レスポンス

```json
{
  "text": "夏祭りは昭和25年に青年団が始めたと記録されています[1]。神輿は昭和30年に新しくされました[2]。",
  "citations": [
    {
      "id": "ayumi",
      "title": "『青葉地区のあゆみ』",
      "author": "青葉地区自治会 編",
      "year": "1998年",
      "kind": "郷土誌",
      "excerpt": "根拠になった箇所の抜粋",
      "where": "青葉地区公民館 2階 郷土資料室で閲覧できます",
      "url": "https://…（任意）",
      "requestId": "語り手の手引きが根拠のとき、そのrequestのid（任意）"
    }
  ],
  "materials": [
    { "id": "dayori", "title": "青葉公民館だより 第212号", "kind": "広報紙", "where": "公民館の窓口で見られます" }
  ],
  "askable": false,
  "mode": "gemini"
}
```

- `text` 中の `[1]` `[2]` は `citations` の1始まりの番号です。画面では押せる番号になり、押すと抜粋を表示します。
- `citations` には回答の根拠にした資料だけを入れます。根拠がない文は書かない前提です。
- `materials` は「こんな資料があります」として出す、読める資料の案内です。
- `askable: true` のとき、回答の下に「この質問を地域の人に聞く」を出します。資料で答えられないときに `true` にしてください。押すと既存の聞き取りの流れ（`request`）に質問が入ります。
- `mode` が `"experience"` のときだけ「体験用の回答」と表示します。

## 連絡先

連絡先は今は `public/town-data.js` の `contacts` です（青葉地区は架空、電話番号も架空）。実在の町を扱うときは、町ごとの連絡先をバックエンドから返す形にするのがよさそうです（例：`GET /api/town/:place` → `{ contacts, sources, suggestions }`）。登録がない町では、画面は図書館・公民館・役所を地図で探すリンクを出します。

## 統合時に見てほしいこと

- 手引きの6項目（`src/domain.mjs` の `FACTS`）が提灯準備用に固定されているため、町の歴史の聞き取りでも「雨天の場所」などが出ます。
- 町のチャットの履歴はブラウザ（`localStorage` の `tsugite-town-chats-v1`）だけに保存しています。サーバー保存の `state` には入れていません。
