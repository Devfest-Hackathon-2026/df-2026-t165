#!/usr/bin/env bash
# Run inside Google Cloud Shell as a project administrator. Secrets are read without echo.
set -euo pipefail
cd "$(dirname "$0")/.."
TSUGITE_PROJECT="${1:-devfest165}"
TSUGITE_REGION="${TSUGITE_REGION:-asia-northeast1}"
TSUGITE_DB="${TSUGITE_DB:-(default)}"
TSUGITE_SERVICE="tsugite-demo"
TSUGITE_BUCKET="${TSUGITE_BUCKET:-$TSUGITE_PROJECT-tsugite-materials}"
command -v gcloud >/dev/null || { echo 'Google Cloud Shellで実行してください。'; exit 1; }
echo "公開先: $TSUGITE_PROJECT / $TSUGITE_REGION"
echo 'Cloud Run・Firestore・Cloud Storage・ビルド・Secret Managerを設定します。請求先の有効化が必要です。'
gcloud projects describe "$TSUGITE_PROJECT" --format='value(projectId)'
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com firestore.googleapis.com storage.googleapis.com secretmanager.googleapis.com iam.googleapis.com aiplatform.googleapis.com --project="$TSUGITE_PROJECT"
for TSUGITE_ACCOUNT in tsugite-runtime tsugite-build; do
 if ! gcloud iam service-accounts describe "$TSUGITE_ACCOUNT@$TSUGITE_PROJECT.iam.gserviceaccount.com" --project="$TSUGITE_PROJECT" >/dev/null 2>&1; then
  gcloud iam service-accounts create "$TSUGITE_ACCOUNT" --project="$TSUGITE_PROJECT" --display-name="$TSUGITE_ACCOUNT"
 fi
done
TSUGITE_RUNTIME="tsugite-runtime@$TSUGITE_PROJECT.iam.gserviceaccount.com"
TSUGITE_BUILDER="tsugite-build@$TSUGITE_PROJECT.iam.gserviceaccount.com"
gcloud projects add-iam-policy-binding "$TSUGITE_PROJECT" --member="serviceAccount:$TSUGITE_RUNTIME" --role=roles/datastore.user --condition=None >/dev/null
gcloud projects add-iam-policy-binding "$TSUGITE_PROJECT" --member="serviceAccount:$TSUGITE_RUNTIME" --role=roles/aiplatform.user --condition=None >/dev/null
gcloud projects add-iam-policy-binding "$TSUGITE_PROJECT" --member="serviceAccount:$TSUGITE_BUILDER" --role=roles/run.builder --condition=None >/dev/null
if ! gcloud firestore databases describe --database="$TSUGITE_DB" --project="$TSUGITE_PROJECT" >/dev/null 2>&1; then
 gcloud firestore databases create --database="$TSUGITE_DB" --location="$TSUGITE_REGION" --type=firestore-native --project="$TSUGITE_PROJECT"
fi
# 町の資料（PDF・写真）のファイル置き場。公開はせず、実行用サービスアカウントだけが読み書きする
if ! gcloud storage buckets describe "gs://$TSUGITE_BUCKET" --project="$TSUGITE_PROJECT" >/dev/null 2>&1; then
 gcloud storage buckets create "gs://$TSUGITE_BUCKET" --project="$TSUGITE_PROJECT" --location="$TSUGITE_REGION" --uniform-bucket-level-access --public-access-prevention
fi
gcloud storage buckets add-iam-policy-binding "gs://$TSUGITE_BUCKET" --member="serviceAccount:$TSUGITE_RUNTIME" --role=roles/storage.objectAdmin >/dev/null
for TSUGITE_SECRET in tsugite-gemini-key tsugite-access-code; do
 if ! gcloud secrets describe "$TSUGITE_SECRET" --project="$TSUGITE_PROJECT" >/dev/null 2>&1; then
  gcloud secrets create "$TSUGITE_SECRET" --replication-policy=automatic --project="$TSUGITE_PROJECT"
 fi
 if [[ "$TSUGITE_SECRET" == tsugite-gemini-key ]]; then
  read -r -s -p 'Gemini APIキー（表示されません）: ' TSUGITE_VALUE
 else
  read -r -s -p 'チームで共有するデモアクセスコード（表示されません、12文字以上）: ' TSUGITE_VALUE
  [[ ${#TSUGITE_VALUE} -ge 12 ]] || { echo; echo '12文字以上にしてください。'; exit 1; }
 fi
 echo
 [[ -n "$TSUGITE_VALUE" ]] || { echo '空の値は登録できません。'; exit 1; }
 printf '%s' "$TSUGITE_VALUE" | gcloud secrets versions add "$TSUGITE_SECRET" --data-file=- --project="$TSUGITE_PROJECT" >/dev/null
 unset TSUGITE_VALUE
 gcloud secrets add-iam-policy-binding "$TSUGITE_SECRET" --member="serviceAccount:$TSUGITE_RUNTIME" --role=roles/secretmanager.secretAccessor --project="$TSUGITE_PROJECT" >/dev/null
done
gcloud run deploy "$TSUGITE_SERVICE" --project="$TSUGITE_PROJECT" --region="$TSUGITE_REGION" --source=. --allow-unauthenticated --service-account="$TSUGITE_RUNTIME" --build-service-account="projects/$TSUGITE_PROJECT/serviceAccounts/$TSUGITE_BUILDER" --min=0 --max=1 --concurrency=10 --cpu=1 --memory=512Mi --timeout=60 --set-env-vars="GOOGLE_CLOUD_PROJECT=$TSUGITE_PROJECT,FIRESTORE_DATABASE=$TSUGITE_DB,TSUGITE_BUCKET=$TSUGITE_BUCKET,GEMINI_BACKEND=${GEMINI_BACKEND:-gemini},GEMINI_TEXT_MODEL=${GEMINI_TEXT_MODEL:-auto},GEMINI_LIVE_MODEL=${GEMINI_LIVE_MODEL:-gemini-3.8-live}" --set-secrets=GEMINI_API_KEY=tsugite-gemini-key:latest,DEMO_ACCESS_CODE=tsugite-access-code:latest
TSUGITE_URL="$(gcloud run services describe "$TSUGITE_SERVICE" --project="$TSUGITE_PROJECT" --region="$TSUGITE_REGION" --format='value(status.url)')"
echo "公開URL: $TSUGITE_URL"
echo '画面の設定からデモアクセスコードを入力し、聞き取りと保存を実際に試してください。'
echo '動作確認前に、提出用の完成URLとして扱わないでください。'
