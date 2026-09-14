# 🚀 稽古管理サービス 運用開始手順書（クローズド β 向け）

> `docs/rehearsal-requirements.md` v0.2 で実装した稽古・シフト管理サービス（共通アカウント基盤つき）を、招待制のクローズド β として公開するための手順。チケット販売システムと同じ Next.js アプリ・同じ Supabase プロジェクトで動く。チケット側の公開手順は `docs/DEPLOY.md` を参照。
>
> 作成日: 2026-09-14 ／ 対象コミット: ブランチ `claude/theater-rehearsal-management-xpzffv`

## 0. 全体像

やることは大きく 8 つ。**A〜D が必須**、E〜G は使う機能に応じて、H は公開前の確認。

| # | 作業 | 必須 | 目安時間 | 待ち時間 |
|---|---|---|---|---|
| A | Vercel にデプロイし、ドメインと環境変数を設定 | 必須 | 30 分 | DNS 反映 |
| B | Supabase Auth の設定（リダイレクト URL・Google ログイン・メール） | 必須 | 30 分 | なし |
| C | メール送信（Resend） | 必須 | 30 分 | ドメイン認証の DNS 反映 |
| D | 規約・プライバシーポリシー・運営者情報の確定 | 必須 | 法務レビュー次第 | |
| E | Web プッシュ（VAPID 鍵） | 推奨 | 10 分 | なし |
| F | Google カレンダー連携（Google Cloud） | 推奨 | 1 時間 | 審査 2〜6 週間（審査前はテストユーザーで運用可） |
| G | LINE 連携（LINE Developers） | 任意 | 1 時間 | なし |
| H | 定時通知スケジューラ、運営アカウント、動作確認 | 必須 | 1 時間 | |

最短では **A・B・C・H を 1 日で終えて β を開始**し、E・F・G を後から足せる。未設定の機能は画面上で「この環境では未設定」と表示され、サービス自体は動く。

### 事前に決めること

1. **公開ドメイン**（本書では `https://<ドメイン>` と表記）。候補: `app.puzzliar.jp`（稽古管理とチケットを同居させる場合）。`NEXT_PUBLIC_SITE_URL` は 1 つしか持てないので、Google／LINE のリダイレクト URI もこの 1 ドメインで統一する。既に `ticket.puzzliar.jp` で公開済みならそのままでもよい
2. **送信元メールアドレス**（例: `PUZZLIAR <noreply@puzzliar.jp>`）と**問い合わせ先**（例: `support@puzzliar.jp`）
3. **β 参加劇団**（最初に主催者コードを渡す相手）

---

## A. Vercel デプロイと環境変数

### A-1. ブランチをマージまたはデプロイ対象にする

1. GitHub で `claude/theater-rehearsal-management-xpzffv` を `main` へマージする（Pull Request を作成してマージ）
2. Vercel プロジェクト（`docs/DEPLOY.md` Step 1 で作成済みのもの）が `main` を自動デプロイする。未作成なら DEPLOY.md の Step 1 に従って作成する

### A-2. 環境変数を設定する

Vercel → Project → Settings → Environment Variables。**Production と Preview の両方**に設定する（Preview は値を変えてもよい）。

**必須（既存のものは確認のみ）**

| 変数 | 値 | 備考 |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://wiqnmebudaadwqdaxwko.supabase.co` | 設定済み |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API Keys → `anon` | 設定済み |
| `SUPABASE_SERVICE_ROLE_KEY` | 同 `service_role` | 設定済み。**秘匿** |
| `NEXT_PUBLIC_SITE_URL` | `https://<ドメイン>` | **末尾のスラッシュなし**。すべてのリダイレクト・通知内リンクの基準 |
| `RESEND_API_KEY` | C で取得 | 未設定だとメール通知・確認メールのフォールバックが動かない |
| `EMAIL_FROM` | `PUZZLIAR <noreply@puzzliar.jp>` | 稽古管理の通知にも使うので「チケット」を含まない名前に変える |
| `CRON_SECRET` | ランダムな長い文字列 | 定時通知の保護（H-1 で同じ値を使う） |
| `ORG_CREATION_OPEN` | `false` | 招待制。一般公開時に `true` |
| `LINE_PUSH_MONTHLY_LIMIT` | `200` | LINE 公式アカウント無料枠に合わせる |
| `REHEARSAL_DIGEST_HOUR` | `8` | 毎朝の予定配信（JST の時） |
| `REHEARSAL_REMINDER_HOUR` | `20` | 前日リマインド（JST の時） |

**推奨（機能ごと）**

| 変数 | 値 | 設定する手順 |
|---|---|---|
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | E で生成 | E |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | F で取得 | F |
| `GOOGLE_TOKEN_KEY` | ランダムな長い文字列（32 文字以上） | Google のトークンを暗号化する鍵。**一度決めたら変えない**（変えると全員の Google 連携が失効する） |
| `LINE_CHANNEL_SECRET` / `LINE_CHANNEL_ACCESS_TOKEN` / `LINE_ADD_FRIEND_URL` | G で取得 | G |
| `LINE_LOGIN_CHANNEL_ID` / `LINE_LOGIN_CHANNEL_SECRET` / `NEXT_PUBLIC_LINE_LOGIN_ENABLED` | G で取得 | G |

ランダム文字列の生成（手元のターミナル）:

```bash
openssl rand -base64 48
```

### A-3. ドメインを接続する

`docs/DEPLOY.md` Step 2 と同じ。Vercel → Settings → Domains でドメインを追加し、DNS に CNAME（`cname.vercel-dns.com`）を登録する。SSL は自動。

### A-4. 再デプロイして疎通確認

環境変数を変更したら Deployments → 最新 → Redeploy。次の URL を開いて確認する。

- `https://<ドメイン>/rehearsal` … サービス紹介が表示される
- `https://<ドメイン>/login` … 「Google でログイン」ボタンがある
- `https://<ドメイン>/terms` `https://<ドメイン>/privacy` … 規約とポリシーが表示される

---

## B. Supabase Auth の設定

Supabase Dashboard → プロジェクト `puzzliar's Project`（`wiqnmebudaadwqdaxwko`）→ Authentication。

### B-1. URL 設定（最重要）

Authentication → URL Configuration:

| 項目 | 値 |
|---|---|
| Site URL | `https://<ドメイン>` |
| Redirect URLs | `https://<ドメイン>/auth/callback` と `https://<ドメイン>/**` を追加。ローカル確認用に `http://localhost:3000/**` も追加 |

ここが未登録だと、Google ログインやメール確認リンクの後で `/login?error=auth` に戻される。

### B-2. Google ログイン（既に有効。確認のみ）

Authentication → Providers → Google が **Enabled** で、Client ID / Secret が入っていることを確認する。この Google Cloud の OAuth クライアントは F で作るカレンダー連携用と**同じプロジェクトで構わない**が、Supabase 用クライアントの「承認済みリダイレクト URI」には `https://wiqnmebudaadwqdaxwko.supabase.co/auth/v1/callback` が入っている必要がある（既に Google ログインで登録済みユーザーがいるので設定済みのはず）。

### B-3. メール確認とテンプレート

Authentication → Providers → Email:

- **Confirm email: ON**（メール確認しないと組織作成・参加ができない要件）
- Secure email change: ON

Authentication → Email Templates → Confirm signup の本文に `{{ .ConfirmationURL }}` が含まれていることを確認する（既定のままでよい）。件名は日本語に変えてよい（例: `【PUZZLIAR】メールアドレスの確認`）。

### B-4. カスタム SMTP（Resend）を設定する

Supabase 標準のメール送信は**1 時間あたり数通の上限**があり、β でも足りない。Authentication → SMTP Settings → Enable Custom SMTP:

| 項目 | 値 |
|---|---|
| Sender email | `noreply@puzzliar.jp`（C で認証したドメイン） |
| Sender name | `PUZZLIAR` |
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` |
| Password | Resend の API キー（C で取得） |

保存後、Rate Limits で「Emails per hour」を実態に合わせて上げる（例: 100）。

### B-5. 確認

Supabase → Authentication → Users に既存の 3 ユーザー（harbingerstar@gmail.com など）がいること、`core_profiles` テーブルに同数の行があることを Table Editor で確認する。

---

## C. メール送信（Resend）

1. https://resend.com でアカウント作成（無料枠: 月 3,000 通・1 日 100 通。β には十分）
2. Domains → Add Domain → `puzzliar.jp`（またはサブドメイン `mail.puzzliar.jp`）を追加
3. 表示される DNS レコード（DKIM の TXT/CNAME、SPF の TXT、任意で DMARC）を DNS 管理画面に登録し、Verify が緑になるまで待つ（数分〜数時間）
4. API Keys → Create API Key（権限: Sending access）→ 値を Vercel の `RESEND_API_KEY` と Supabase の SMTP パスワード（B-4）に設定
5. Vercel の `EMAIL_FROM` を認証済みドメインのアドレスにする

動作確認: 自分のアカウントで `/me/settings` → 通知の受け取り方を「メール」にし、H-3 の召集テストでメールが届くこと。

---

## D. 規約・プライバシーポリシー・運営者情報

リポジトリの `src/app/terms/page.tsx` と `src/app/privacy/page.tsx` は**ドラフト**。公開前に次を行う。

1. 法務レビュー（特に: 無料提供と将来の有料機能、空き時間の組織間共有、退会時の匿名化、Google ユーザーデータの限定的使用）
2. 運営者名・所在地・問い合わせ先を追記する（無料サービスなので特商法表示は不要だが、運営者情報とお問い合わせ先は必要）
3. 文面を確定したら `src/lib/core/types.ts` の `TERMS_VERSION` / `PRIVACY_VERSION` を確定日に更新する。以後、改定時にこの値を上げると既存ユーザーに再同意を求められる（※ 再同意画面は v0.2 では未実装。改定時に実装する）
4. Google の審査（F-5）ではプライバシーポリシーの URL が必要。`https://<ドメイン>/privacy` を使う

---

## E. Web プッシュ（VAPID 鍵）

無料の通知チャネル。iPhone はホーム画面に追加した状態でのみ受信できる。

1. 手元のターミナルで鍵を生成する（リポジトリ直下で）:

```bash
npx web-push generate-vapid-keys
```

2. 出力の Public Key を `NEXT_PUBLIC_VAPID_PUBLIC_KEY`、Private Key を `VAPID_PRIVATE_KEY` に設定。`VAPID_SUBJECT` は `mailto:support@puzzliar.jp`
3. 再デプロイ後、`/me/settings` の「プッシュ通知（この端末）」に「この端末で受信する」ボタンが出れば OK。押して許可し、H-3 のテストで通知が届くことを確認する

鍵は**一度決めたら変えない**（変えると全端末の購読が無効になる）。

---

## F. Google カレンダー連携（Google Cloud）

### F-1. プロジェクトと API

1. https://console.cloud.google.com で PUZZLIAR 用プロジェクトを選択（Supabase の Google ログインに使っているものと同じでよい）
2. APIs & Services → Library → **Google Calendar API** を有効化

### F-2. OAuth 同意画面

APIs & Services → OAuth consent screen（Google Auth Platform → Branding / Audience / Data Access）:

| 項目 | 値 |
|---|---|
| User Type | External |
| App name | PUZZLIAR 稽古管理 |
| User support email | support@puzzliar.jp |
| App home page | `https://<ドメイン>/rehearsal` |
| Privacy policy | `https://<ドメイン>/privacy` |
| Terms of service | `https://<ドメイン>/terms` |
| Authorized domains | `puzzliar.jp` |
| Scopes | `.../auth/calendar.events`、`.../auth/calendar.freebusy`、`openid`、`email` |
| Publishing status | **Testing**（審査完了まで） |
| Test users | β 参加者の Google アカウント（最大 100 名）を追加 |

### F-3. OAuth クライアント

APIs & Services → Credentials → Create Credentials → OAuth client ID → Web application:

- Authorized JavaScript origins: `https://<ドメイン>`
- Authorized redirect URIs: `https://<ドメイン>/api/google/callback`（Supabase ログイン用クライアントと共用する場合は `https://wiqnmebudaadwqdaxwko.supabase.co/auth/v1/callback` も残す）

Client ID / Client Secret を Vercel の `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` に設定し、`GOOGLE_TOKEN_KEY` も設定して再デプロイ。

### F-4. 動作確認

テストユーザーに登録した Google アカウントでログインし、`/me/settings` → 「Google カレンダーと連携する」→ 認可 → 「連携しました」と出る。H-3 で作った召集が Google カレンダーに即時に現れ、`/me` の空き時間にカレンダーの「予定あり」が「不可」として取り込まれる。

**Testing 状態の注意**: refresh token が **7 日で失効**する。失効すると自動で連携解除され、`/me/settings` で再連携を促す表示になる。β 参加者には「1 週間ごとに再連携が必要」と案内するか、F-5 の審査を早めに通す。

### F-5. 審査（本番公開）

`calendar.events` は機微スコープのため審査が必要。スケジュール案は `docs/rehearsal-requirements.md` 9.1。申請時に用意するもの:

- 上記の同意画面の項目がすべて埋まっていること
- プライバシーポリシーに「Google API サービスのユーザーデータに関するポリシー（限定的使用の要件を含む）に準拠」と明記（ドラフトに記載済み）
- **デモ動画**（YouTube 限定公開可）: ログイン → 連携ボタン → Google の同意画面（スコープが見える） → 稽古枠を作成してカレンダーに予定が入る → FreeBusy 取り込みで空き時間が更新される → 連携解除で予定が消える、の一連
- ドメイン所有権の確認（Search Console に `puzzliar.jp` を登録）

審査完了後、Publishing status を **In production** に変更する。

---

## G. LINE 連携（LINE Developers）

LINE ログインは任意（Google がメイン）。通知の返信機能（「今日」「参加」など）は Messaging API チャネルだけで動く。

### G-1. プロバイダーとチャネル

https://developers.line.biz/console/ で:

1. **プロバイダー**を 1 つ作る（例: PUZZLIAR）。**ログインと Messaging API を同じプロバイダー配下に置く**ことが重要（同じ人の userId が一致し、LINE ログインだけで通知先が確定する）
2. **Messaging API チャネル**を作成（LINE 公式アカウントが同時に作られる）
   - Basic settings → Channel secret → `LINE_CHANNEL_SECRET`
   - Messaging API → Channel access token (long-lived) を発行 → `LINE_CHANNEL_ACCESS_TOKEN`
   - Messaging API → Webhook URL: `https://<ドメイン>/api/line/webhook` → **Use webhook: ON** → Verify で成功すること
   - LINE Official Account Manager → 応答設定 → **応答メッセージ: OFF**、**Webhook: ON**（既定の自動応答が邪魔をする）
   - 友だち追加 URL（`https://lin.ee/xxxx`）→ `LINE_ADD_FRIEND_URL`
3. **LINE ログインチャネル**を作成（任意）
   - Channel ID → `LINE_LOGIN_CHANNEL_ID`、Channel secret → `LINE_LOGIN_CHANNEL_SECRET`
   - LINE Login → Callback URL: `https://<ドメイン>/auth/line/callback`
   - OpenID Connect → **メールアドレス取得権限**を申請（任意。未申請でも動くが、その場合はメールなしのアカウントになる）
   - 「リンクされたボット」に上記の Messaging API チャネルを設定（ログイン時に友だち追加を案内できる）
   - Vercel の `NEXT_PUBLIC_LINE_LOGIN_ENABLED` を `true` にするとログイン画面に「LINE でログイン」が出る

### G-2. 料金プランの確認

LINE 公式アカウントは**コミュニケーションプラン（無料）**のまま。無料枠は月 200 通のプッシュで、アプリ側の `LINE_PUSH_MONTHLY_LIMIT=200` がこれを超えないように制御する（超えた分はメール等へ）。返信メッセージは無料・無制限。プランを上げた場合は `LINE_PUSH_MONTHLY_LIMIT` も合わせる。

### G-3. 動作確認

公式アカウントを友だち追加し、`/me/settings` で連携コードを発行 → LINE で「連携 123456」と送信 → 「連携しました」と返る。「今日」と送ると予定（なければ「予定はありません」）が返る。

---

## H. スケジューラ・運営アカウント・動作確認

### H-1. 定時通知のスケジューラ

毎朝の予定配信・前日リマインド・Google FreeBusy 取り込みは `/api/cron/rehearsal-notify` を **10〜30 分おき**に呼ぶことで動く（時刻判定はエンドポイント側で行うので、頻度は多くてよい）。Vercel Hobby の Cron は 1 日 1 回までなので外部から呼ぶ。

**方法 1: cron-job.org（無料・推奨）**

1. https://cron-job.org でアカウント作成 → Create cronjob
2. URL: `https://<ドメイン>/api/cron/rehearsal-notify`
3. Schedule: Every 15 minutes
4. Advanced → Headers に `Authorization: Bearer <CRON_SECRET の値>` を追加
5. 保存後 Execute now → Response が `{"skipped":true,"hour":…}` または `{"hour":…,"jobs":[…]}` なら OK

チケット側のリマインド `/api/cron/send-reminders` も同様に登録する（未登録なら）。

**方法 2: Supabase pg_cron（Dashboard → SQL Editor で実行）**

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.schedule(
  'rehearsal-notify', '*/15 * * * *',
  $$ select net.http_get(
       url := 'https://<ドメイン>/api/cron/rehearsal-notify',
       headers := '{"Authorization": "Bearer <CRON_SECRET の値>"}'::jsonb) $$
);
```

動作確認は手動で `?force=digest` を付けて呼ぶ（`curl -H "Authorization: Bearer …" "https://<ドメイン>/api/cron/rehearsal-notify?force=digest"`）。今日の召集がある人にダイジェストが送られる。

### H-2. 運営アカウントと主催者コード

1. `https://<ドメイン>/login` に harbingerstar@gmail.com でログイン（この 1 アカウントだけ運営権限 `is_platform_admin` が付与済み）
2. 初回は `/onboarding` が出るので表示名と同意を入力
3. ヘッダーの「運営」→ `/platform` で **主催者コード**を発行（メモに渡す相手、使用回数 1、有効 30 日）。β 参加劇団ごとに 1 つ発行して渡す
4. 運営権限を他の人にも付与する場合は Supabase → SQL Editor:

```sql
update core_profiles set is_platform_admin = true where email = '<メールアドレス>';
```

既存の PUZZLIAR 組織（チケットと同じ UUID）は `/o/puzzliar` で、harbingerstar@gmail.com がオーナーになっている。自劇団の運用はここで始められる。

### H-3. エンドツーエンド動作確認（2 アカウントで行う）

**準備**: 運営アカウント（A）と、β 参加者役の別アカウント（B。例: dai@puzzliar.jp、または新規に Google で登録）。

| # | 操作するアカウント | 手順 | 期待結果 |
|---|---|---|---|
| 1 | B | `/signup` からメールで登録 → 確認メールのリンクを開く | `/onboarding` が表示され、同意後に `/me` へ |
| 2 | B | `/login` から Google でログイン（別ブラウザ） | 同じく `/me` へ。Supabase の Users に google プロバイダで登録される |
| 3 | A | `/orgs/new` で劇団を作成（運営はコード不要） | `/o/<slug>` に遷移。ヘッダーに劇団名が出る |
| 4 | A | `/o/<slug>/members` → 仮メンバー「テスト花子」を追加 → 招待リンク（メンバー用）を発行 | QR とリンクが表示される |
| 5 | B | 招待リンクを開く → 「参加する」 | `/o/<slug>?joined=1`。「仮メンバーの紐づけ」で「テスト花子は私です」を押すと参加者に紐づく |
| 6 | A | プロダクション作成 → シーン「1-1」を追加（必要メンバー: テスト花子）→ 稽古枠を作成（対象シーン 1-1、通知 ON） | 稽古枠詳細へ遷移。召集にテスト花子が入る。B にメール（またはプッシュ／LINE）が届く |
| 7 | B | `/me` の「要対応」で「参加」 | 出欠が「参加」に。A の稽古枠詳細でも「参加」になる |
| 8 | B | `/me` で空き時間を「不可」で登録（翌日の同時刻） | A が同じ時間帯で「参加可否を確認」すると「× 不可」と出る |
| 9 | A | 稽古枠で「代役を募集する」（欠ける人: テスト花子） | 候補がいなければ「候補 0 名」。候補がいれば通知が届き、「入れます」で確定する |
| 10 | A | 稽古枠で「記録を保存」＋「完了にする」 | プロダクション画面のシーン進捗が 1/1 になり、未消化 0 |
| 11 | B | `/me/settings` → Google 連携（F 設定後） | カレンダーに稽古枠が入る。空き時間に「Googleカレンダーの予定」が取り込まれる |
| 12 | B | `/me/settings` → 自分のデータを CSV でダウンロード | 予定と空き時間が入った CSV |
| 13 | B | `/me/settings` → 退会（「退会」と入力） | ログアウトされ、A のメンバー一覧から消え、参加者台帳では「退会済みユーザー」になる |

13 の後、B のアカウントを再度作り直して問題ない（同じメールで再登録できる）。

### H-4. β 参加劇団への案内文（例）

> PUZZLIAR 稽古管理（β）のご案内
> 1. 主催者の方: `https://<ドメイン>/signup` で登録後、`https://<ドメイン>/orgs/new` から劇団を作成してください。主催者コード: `PZ-XXXXXXXX`
> 2. 劇団の「メンバー」画面で招待リンクを発行し、キャストの LINE グループに貼ってください
> 3. キャストの方: 招待リンクを開いて登録（Google が簡単です）。`/me/settings` で通知の受け取り方と Google カレンダー連携を設定できます
> 4. Google カレンダー連携は審査中のため、事前にお知らせいただいた Google アカウントのみ利用でき、1 週間ごとに再連携が必要です

---

## I. 一般公開への切り替え（β 終了時）

1. Google の審査完了（F-5）を確認し、同意画面を In production にする
2. Vercel の `ORG_CREATION_OPEN` を `true` にして再デプロイ（主催者コードが不要になる）
3. `/rehearsal` の「招待制」の文言を更新する（`src/app/rehearsal/page.tsx`）
4. LINE 公式アカウントのプランと `LINE_PUSH_MONTHLY_LIMIT` を利用者数に合わせて見直す
5. Supabase の Rate Limits（Auth メール）と Resend の上限を見直す
6. サポート窓口（メールまたはフォーム）を `/rehearsal` と `/privacy` に明記する

---

## J. 日常運用とトラブルシューティング

**監視**
- Vercel → Logs で `google sync failed` `webpush failed` `LINE API error` を検索する。単発なら無視してよい。同じユーザーで繰り返す場合は連携の再設定を案内する
- Supabase → Advisors → Security を月 1 回確認する
- `rh_notifications` テーブルで `channel = 'line'` の当月件数を見ると LINE の無料枠の消費が分かる

**よくある問題**

| 症状 | 原因と対処 |
|---|---|
| Google ログイン後に `/login?error=auth` に戻る | B-1 の Redirect URLs に `https://<ドメイン>/auth/callback` が無い。または `NEXT_PUBLIC_SITE_URL` が実際のドメインと違う |
| メール確認のリンクを開いても登録が完了しない | 同上。Supabase の Site URL を確認 |
| 確認メールが届かない | B-4 のカスタム SMTP 未設定（標準 SMTP の上限）か、Resend のドメイン未認証 |
| Google 連携で「連携に失敗しました」 | F-3 のリダイレクト URI が一致していない、または Calendar API が未有効化。Vercel Logs に `token endpoint 400` が出る |
| Google 連携が 1 週間で切れる | 同意画面が Testing 状態。F-5 の審査を通す |
| LINE で「今日」と送っても返事がない | Webhook が OFF、応答メッセージが ON、または `LINE_CHANNEL_SECRET` が違う（署名検証で 401）。Vercel Logs を確認 |
| LINE プッシュが届かずメールになる | 月間上限（`LINE_PUSH_MONTHLY_LIMIT`）到達。`rh_notifications` で件数を確認 |
| プッシュ通知のボタンが出ない | E の VAPID 鍵未設定、または iPhone でホーム画面に追加していない |
| 招待リンクを開くと「招待が見つかりません」 | 期限切れ・無効化・使用回数超過。メンバー画面で再発行 |
| 主催者が組織を作れない | 招待制のため主催者コードが必要。`/platform` で発行 |
| 毎朝の通知が来ない | H-1 のスケジューラが止まっている、または `CRON_SECRET` 不一致（401）。cron-job.org の実行履歴を確認 |

**データの復旧**
- 誤って除名したメンバー: 本人が招待リンクから再参加すれば、参加者台帳の同じレコード（`profile_id` が一致）に戻る
- アーカイブした組織: Supabase で `update core_organizations set status = 'active' where slug = '<slug>'`、または `/platform` の「有効化」
- 退会は取り消せない（匿名化済み）

---

## 付録: 環境変数一覧（稽古管理に関係するもの）

| 変数 | 必須 | 用途 |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` `NEXT_PUBLIC_SUPABASE_ANON_KEY` `SUPABASE_SERVICE_ROLE_KEY` | 必須 | DB・認証 |
| `NEXT_PUBLIC_SITE_URL` | 必須 | 公開 URL。各種リダイレクトと通知内リンク |
| `RESEND_API_KEY` `EMAIL_FROM` | 必須 | メール通知 |
| `CRON_SECRET` | 必須 | 定時通知エンドポイントの保護 |
| `ORG_CREATION_OPEN` | 必須 | `false`=招待制、`true`=誰でも組織作成可 |
| `REHEARSAL_DIGEST_HOUR` `REHEARSAL_REMINDER_HOUR` | 任意 | 通知時刻（既定 8 / 20） |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` `VAPID_PRIVATE_KEY` `VAPID_SUBJECT` | 推奨 | Web プッシュ |
| `GOOGLE_CLIENT_ID` `GOOGLE_CLIENT_SECRET` `GOOGLE_TOKEN_KEY` | 推奨 | Google カレンダー連携 |
| `LINE_CHANNEL_SECRET` `LINE_CHANNEL_ACCESS_TOKEN` `LINE_ADD_FRIEND_URL` `LINE_PUSH_MONTHLY_LIMIT` | 任意 | LINE 通知・返信 |
| `LINE_LOGIN_CHANNEL_ID` `LINE_LOGIN_CHANNEL_SECRET` `NEXT_PUBLIC_LINE_LOGIN_ENABLED` | 任意 | LINE ログイン |

## 付録: 公開前チェックリスト

- [ ] A: `main` にマージ、Vercel デプロイ成功、ドメイン SSL 有効
- [ ] A: 環境変数（必須 11 項目）設定済み、`EMAIL_FROM` を汎用名に変更
- [ ] B: Supabase Site URL / Redirect URLs、メール確認 ON、カスタム SMTP
- [ ] C: Resend ドメイン認証 Verified
- [ ] D: 規約・ポリシー確定、運営者情報・問い合わせ先を掲載、`TERMS_VERSION` 更新
- [ ] E: VAPID 鍵設定、端末で受信確認
- [ ] F: Calendar API 有効化、同意画面（Testing）、テストユーザー登録、連携動作確認
- [ ] G: Webhook Verify 成功、応答メッセージ OFF、「今日」に返事が来る
- [ ] H-1: スケジューラ登録、`?force=digest` で動作確認
- [ ] H-2: 運営アカウントでログイン、主催者コード発行
- [ ] H-3: 13 項目の E2E がすべて期待結果どおり
- [ ] β 参加劇団へ案内文を送付
