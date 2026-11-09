# ツギキキ — 町の記憶を、次の担い手へ

2026年11月7日作成のハッカソン用実装です。プロジェクトIDは `devfest165`。架空の青葉地区の夏祭りを題材にしています。

## できること

- 旅行者向け：希望の入力から大まかな地域の候補を表示。風景イメージ、位置の説明、Google マップへのリンク。現状はキーワードによる3地域の振り分けで、実在の語り部の推薦ではありません。
- 「話を残す」を設定外の独立した入口に配置。
- 担い手の質問 → 経験者への聞き取り → 出典付き手引きの下書き → 語り手の確認・修正 → 保存。
- 確認済みの知識への質問。記録のない質問は次回の聞き取りへ。回答文は確認済みの項目を表示する方式です。
- 確認済みの内容と会話を次回に引き継ぐ。未知の項目は「未確認」。
- 全文／手引きから4問に答える時間を実測し、人が正誤を採点。架空データとチーム内テストを区別。CSV出力。

## まずローカルで試す

Node.js 22以降が必要です。

```sh
npm ci
npm run build
npm test
npm start
```

表示された `http://127.0.0.1:4321` を開きます。キーがなければルール処理の体験モードで動きます。会話と測定はブラウザ、サーバーの `.runtime/` に保存されます。`.env.example` は設定例であり、起動時に自動読込はしません。ローカルで実AIを使う場合は `node --env-file=.env server.mjs` のように起動します。

## Google Cloudへ公開する人へ

1. Google Cloudの **devfest165** を操作できる仲間のアカウントで [Cloud Shell](https://console.cloud.google.com/cloudshell/editor?project=devfest165) を開く。
2. Cloud Shellで `git clone https://github.com/Kazuya43/tsugite.git` を実行し、`cd tsugite` で移動。非公開リポジトリなので、アクセスできるGitHubアカウントで認証してください。ZIPをアップロードして展開する方法でも構いません。
3. 請求先が有効なことを確認。デプロイ・サービスアカウント作成／権限付与・API有効化ができる管理者が実行する。
4. 下記を実行。Gemini APIキーとチーム用アクセスコードは、その場で非表示入力する。チャットに貼らない。

```sh
bash scripts/deploy-google.sh devfest165
```

Cloud Run、Firestore、Secret Manager、ビルド用／実行用サービスアカウントを設定します。サービス名は `tsugite-demo`、リージョンは東京、Firestoreは既存の `(default)` を使用します。存在しない場合に東京で作成します。別のDBを使うなら `TSUGITE_DB=名前`、地域を変えるなら `TSUGITE_REGION=名前` を指定してください。既存DBは移動・削除しません。スクリプトは設定に加えてデプロイも実行します。既存の同名サービスがある場合は更新するため、実行前に名前を確認してください。

Firestoreへのアクセスはサーバー側のサービスアカウントを使用します。Firestoreの公開ルールを緩める必要はありません。URL自体は一般公開され、AI利用・保存APIにはデモアクセスコードが必要です。コードは画面の「設定」から入力します。これはハッカソン用の共通コードで、一般向けの個人認証は未実装です。

### デプロイ後に必ず確認すること

- `/healthz` が `{"ok":true}`、画面に「AI接続設定あり」が出る。
- アクセスコード入力後に質問を作り、聞き取り→下書き→確認保存まで一度行う。
- Firestoreの `tsugite_workspaces` に内容が保存されている。
- 「声で会話を続ける」でマイク許可後、実際の音声応答・文字記録・終了を確認する。
- 再読込後も履歴と修正内容が残る。
- Geminiの利用枠・対応モデルがない場合は、利用可能なモデルに環境変数を変更する。テキストモデルは `auto` でFlash系を検索します。Liveは `GEMINI_LIVE_MODEL` で指定、初期値 `gemini-3.8-live`。

### 費用について

Cloud Runは最小0・最大1インスタンス、Liveは画面側で最大5分、AI APIは作業領域ごとに1時間30回の制限です。**20ドルの課金上限を保証する仕組みではありません**。利用枠と課金状況を確認し、デモの前後だけ利用してください。不要になったら仲間の管理者がサービスを停止・削除してください。Firestore・Secret Manager・ビルド成果物の費用は別途残り得ます。

## 現在の検証範囲

ローカルの19件のテストに合格。マイク接続の途中キャンセル・終了処理は、模擬した音声接続で確認しています。実機での音声応答とは区別します。ブラウザで体験モードの質問→聞き取り→確認修正→保存・再読込、旅行希望→候補表示、出典表示を確認しました。Googleの実認証がないため、Geminiの実応答・Liveのマイク／音声・Firestore・Cloud Runは未検証です。Google用のスクリプトは構文確認のみで、実行していません。課題の解決効果や当事者テストの数値は未測定です。

## 接続確認とデモ準備

- [Google公開後の接続チェック](docs/google-connection-check.md)
- [3分のデモ構成とFB反映](docs/demo-and-feedback.md)
- [安定化で修正した点と検証範囲](docs/stability-report.md)

GitHub Actions用の設定例を `docs/check-workflow.yml` に置きました。現在のGitHub認証にworkflow権限がないため、自動実行はまだ有効にしていません。権限を持つ仲間が `.github/workflows/check.yml` として追加すると、プッシュ時にビルド・テスト・公開スクリプトの構文を確認できます。このCIはGoogleへの実接続を検証しません。

## 構成

- `public/`：画面、音声クライアント、画像。
- `src/domain.mjs`：出典の検証、確認処理、体験モード。
- `server.mjs`：Gemini、Live用の短期トークン、Firestore／ローカル保存。
- `scripts/build.mjs`：Google公式SDKのブラウザ用バンドルと静的プレビュー。
- `scripts/deploy-google.sh`：仲間のCloud Shellで実行する公開手順。
- `tests/`：未確認情報、出典ID、確認必須、保存API、測定のテスト。
- `dist/`：Google未接続でも見られる静的プレビュー。ここはサーバー版と異なりブラウザ保存のみ。

生の音声はこのアプリには保存しません。Liveでは会話の音声をGoogleへ送ります。ブラウザの音声入力はブラウザ提供の音声認識サービスを使います。APIキーはサーバーに置き、ブラウザへはLive用の短期トークンだけ返します。AIを使う前に、語り手の了解を得てください。写真はAI生成の架空の風景、アイコンはPhosphor（同梱ライセンス参照）です。

実証前の残課題：語り手の同意・公開範囲と削除、一般利用者の認証、記録の共有、地域の実取材、発言と抽出結果の意味的な照合、費用のより強い制御。現状のデモは実在人物の記憶を公開する用途には未完成です。

## 参照したGoogle公式資料

- [Live APIの短期トークン](https://ai.google.dev/gemini-api/docs/live-api/ephemeral-tokens)
- [Live APIの音声・文字起こし](https://ai.google.dev/gemini-api/docs/live-api/capabilities)
- [Cloud Runのソースからの公開](https://docs.cloud.google.com/run/docs/deploying-source-code)
- [ビルド用サービスアカウント](https://docs.cloud.google.com/run/docs/configuring/services/build-service-account)
- [Cloud Runのシークレット](https://docs.cloud.google.com/run/docs/configuring/services/secrets)
- [Firestore DBの作成](https://docs.cloud.google.com/firestore/native/docs/manage-databases)
