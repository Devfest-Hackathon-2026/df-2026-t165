# 町のチャット・資料・地域候補のAPI

`integrate/front-main` ブランチで実装済みです。サーバーは `server.mjs`、Geminiに渡す前後の処理は `src/town.mjs`、資料の保存は `src/materials.mjs` にあります。

| API | 役割 | Geminiなし（体験モード） |
| --- | --- | --- |
| `POST /api/town-answer` | 町の資料・登録資料・確認済みの語りを根拠に答える | 409 → 画面側の体験用回答 |
| `POST /api/materials` | 写真・PDFを登録する | 動く（サーバーに保存） |
| `GET /api/materials?place=` | 町の資料一覧 | 動く |
| `GET /api/materials/:id/file` | 資料のファイル本体 | 動く |
| `DELETE /api/materials/:id` | 資料を削除（登録した作業領域だけ） | 動く |
| `GET /api/town?place=` | 町の情報（資料・連絡先・質問例）と資料一覧 | 動く |
| `POST /api/regions` | 登録済みの地域の候補を、答えに合う順に並べる | 409 → 画面側の振り分け |

ヘッダーは既存のAPIと同じです（`x-workspace-id`、`x-demo-access-code`）。Geminiを使う2つは、既存のAI利用上限（作業領域ごとに1時間30回）に数えます。資料の登録は1時間40件までです。

## POST `/api/town-answer`

リクエスト：

```json
{
  "place": "青葉地区",
  "question": "夏祭りはいつから続いているの？",
  "history": [{ "role": "user", "text": "…" }, { "role": "assistant", "text": "…" }],
  "stories": [
    {
      "requestId": "…",
      "speaker": "田中さん",
      "title": "雨の日の提灯準備",
      "confirmedAt": "ISO日時",
      "facts": [{ "label": "雨天の場所", "value": "公民館の集会室" }]
    }
  ]
}
```

- `history` は直近10件。`stories` は、その端末で語り手が確認した手引き（未確認の項目は送らない・使わない）。
- サーバーは次を根拠として番号 S1, S2… を振り、Geminiに渡します。
  1. 町の資料（今は架空の青葉地区だけ。`public/town-data.js`）
  2. その町に登録された資料の説明（最大30件）。写真・PDFのうち、1件10MB以下・合計18MB以下の最大4件は、**ファイルの中身もGeminiに添付**します
  3. 確認済みの語り
- Geminiには「根拠にないことは書かない・推測しない・文末に [S1] を付ける・答えられなければ askable」を指示し、JSONで返させます。
- サーバーは返事を検証し、`[S3]` を画面用の `[1]` `[2]` に振り直します。根拠にない番号は消し、根拠が1つもなければ `askable: true` にします。

レスポンス：

```json
{
  "text": "夏祭りは昭和25年に青年団が始めたと記録されています[1]。",
  "citations": [
    { "id": "ayumi", "title": "『青葉地区のあゆみ』", "author": "…", "year": "1998年", "kind": "郷土誌", "excerpt": "…", "where": "…" }
  ],
  "materials": [],
  "askable": false,
  "mode": "gemini"
}
```

登録資料が根拠のときは、`citations` に `fileId`・`fileKind`（`写真`／`PDF資料`）・`server: true` が入り、画面は写真なら画像、PDFなら「PDFを開く」を出します。語りが根拠のときは `requestId` が入ります。

## 資料（写真・PDF）

### POST `/api/materials`

`multipart/form-data` で `file` と `meta`（JSON文字列）を送ります。

```json
{
  "place": "青葉地区",
  "title": "駅前の商店街",
  "era": "昭和40年ごろ",
  "source": "祖父のアルバム",
  "description": "駅が開業して数年後の商店街。",
  "visibility": "town | keepers | public",
  "consent": true,
  "addedBy": "田中さん"
}
```

- PDF・JPEG・PNG・WebP、1ファイル20MBまで。形式は**ファイルの先頭のバイトで確認**します（拡張子の偽装は弾く）。
- `consent: true`（残してよいか確認した）がないと登録できません。
- 町の名前は空白を除いてそろえます（「青葉 地区」と「青葉地区」は同じ町）。
- 返事は `201 { material }`。`material` には登録した作業領域のIDを含めず、`mine`（自分が登録したか）だけを返します。

### 保存先

| | 説明（メタデータ） | ファイル本体 |
| --- | --- | --- |
| Cloud Run（本番） | Firestore `tsugite_materials` | Cloud Storage `TSUGITE_BUCKET` の `materials/<id>` |
| 手元・テスト | `TSUGITE_DATA_DIR/materials/index.json` | `TSUGITE_DATA_DIR/materials/files/<id>` |

- `scripts/deploy-google.sh` が、非公開のバケット（既定名 `<プロジェクト>-tsugite-materials`）を作り、実行用サービスアカウントに読み書き権限を付け、`TSUGITE_BUCKET` を設定します。
- バケットを設定しないと、ファイルはサーバー内に保存されます。Cloud Runでは再起動で消えるので、本番では必ず設定してください。
- `/api/config` の `materialStorage`（`cloud-storage`／`local-file`）で、今の保存先が分かります。

### 画面の動き

- 登録すると、まずサーバーに送ります。通信の失敗や静的プレビューのときは、その端末のブラウザ（IndexedDB）に保存し、一覧に「この端末のみ」と出します。
- 町のページを開くたびに `GET /api/town` で資料一覧を読み直すので、**別の人が登録した資料も見えます**。体験モードの回答でも根拠に使います。
- ファイルは、端末にあればそこから、なければ `GET /api/materials/:id/file` から取って表示します。

## POST `/api/regions`

```json
{
  "candidates": [{ "id": "setouchi", "name": "瀬戸内の海辺", "hint": "…", "topic": "…", "position": "…" }],
  "answers": ["海の近く", "祭りや行事", "中国"]
}
```

返事は `{ "regions": [{ "id": "setouchi", "fit": true, "reasons": ["海が見える"] }] }`。**候補にない地域は作らせません**（サーバーで除外）。画面は、方面の答えで外れる地域を、AIが合うと言っても出しません。候補を待つ間は、今までの振り分けを表示します。

## 環境変数（追加分）

| 変数 | 内容 |
| --- | --- |
| `TSUGITE_BUCKET` | 資料ファイルを置くCloud Storageのバケット名 |
| `GEMINI_BASE_URL` | GeminiのAPIの接続先を変えるとき（テストで偽のGeminiを使う） |

## 残っていること

- 町の資料（郷土誌など）と連絡先は、架空の青葉地区のぶんだけです。実在の町を扱うなら、町ごとのデータの置き場（Firestoreなど）と登録手段が必要です。
- 確認済みの語りは、その端末の記録から送っています。ほかの人が確認した語りを町のチャットの根拠にするには、確認した手引きを町ごとにサーバーへ集める仕組みが必要です。
- 「見られる人」（町の人だけ／担い手だけ／だれでも）は保存していますが、まだ見る人で絞り込んでいません（ログインがないため）。
- 地域の候補は、登録済みの3地域から選ぶ形です。
