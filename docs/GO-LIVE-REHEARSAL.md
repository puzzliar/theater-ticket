# 🚀 稽古管理サービス 運用開始手順書（クローズド β 向け・操作手順版）

> `docs/rehearsal-requirements.md` v0.2 で実装した稽古・シフト管理サービス（共通アカウント基盤つき）を、招待制のクローズド β として公開するための手順。チケット販売システムと同じ Next.js アプリ・同じ Supabase プロジェクトで動く。
>
> 作成日: 2026-09-14 ／ 対象ブランチ: `claude/theater-rehearsal-management-xpzffv`
>
> **表記について**: 各社の管理画面はメニュー名やボタン名が予告なく変わることがある。本書は 2026 年 9 月時点の画面に基づく。見当たらない場合は「画面内検索」や同じ意味の項目を探すこと。`<ドメイン>` は 0-1 で決めた公開ドメイン（例: `app.puzzliar.jp`）に読み替える。

## 0. 全体像と事前準備

### 0-1. 決めること（3 つ）

| # | 決めること | 例 | 使う場所 |
|---|---|---|---|
| 1 | 公開ドメイン | `app.puzzliar.jp` | A-3、B-1、F-3、G-1 のリダイレクト URL、`NEXT_PUBLIC_SITE_URL` |
| 2 | 送信元メールアドレスと表示名 | `PUZZLIAR <noreply@puzzliar.jp>` | C、B-4、`EMAIL_FROM` |
| 3 | 問い合わせ先 | `support@puzzliar.jp` | D、F-2、`VAPID_SUBJECT` |

ドメインは 1 つだけ。`NEXT_PUBLIC_SITE_URL` が 1 値であり、Google／LINE のリダイレクト URI もこれに合わせるため。既に `ticket.puzzliar.jp` で公開済みで、稽古管理も同じ場所で出すならそれでよい。

### 0-2. 手元に用意するもの

- puzzliar.jp の DNS 管理画面にログインできること（お名前.com、Cloudflare など）
- GitHub `puzzliar/theater-ticket` の書き込み権限
- Vercel、Supabase（プロジェクト `wiqnmebudaadwqdaxwko`）へのログイン
- Google アカウント（Google Cloud 用）、LINE アカウント（LINE Developers 用）
- ターミナル（Mac なら「ターミナル」、Windows なら PowerShell）。`npx` が使える Node.js が入っていること

### 0-3. 作業順と所要時間

| # | 作業 | 必須 | 目安 | 待ち |
|---|---|---|---|---|
| A | Vercel デプロイ・ドメイン・環境変数 | 必須 | 30 分 | DNS 反映 数分〜数時間 |
| B | Supabase Auth（リダイレクト URL・Google・メール確認・SMTP） | 必須 | 30 分 | なし |
| C | Resend（メール送信） | 必須 | 30 分 | DNS 反映 |
| D | 規約・プライバシーポリシー・運営者情報 | 必須 | 法務レビュー次第 | |
| E | Web プッシュ（VAPID 鍵） | 推奨 | 10 分 | なし |
| F | Google カレンダー連携 | 推奨 | 1 時間 | 審査 2〜6 週（審査前もテストユーザーで利用可） |
| G | LINE 連携 | 任意 | 1 時間 | なし |
| H | スケジューラ・運営アカウント・動作確認 | 必須 | 1 時間 | |

最短では A・B・C・H を 1 日で終えて β を開始できる。E〜G は後から追加できる。未設定の機能は画面上に「この環境では未設定です」と表示されるだけで、サービス自体は動く。

---

## A. Vercel デプロイと環境変数

### A-1. ブランチを main にマージする

1. ブラウザで https://github.com/puzzliar/theater-ticket/compare/main...claude/theater-rehearsal-management-xpzffv を開く
2. 緑の **Create pull request** ボタンを押す
3. タイトルはそのまま（例: 「稽古管理 v0.2」）でよい。ページ下の **Create pull request** を押す
4. 作成された Pull Request ページで、下部の緑の **Merge pull request** → **Confirm merge** を押す
5. 「Pull request successfully merged」と表示されれば完了。Vercel が `main` を自動でデプロイし始める（Vercel プロジェクト未作成なら A-2 で作ってからマージ後に再デプロイする）

### A-2. Vercel プロジェクトを開く（未作成なら作る）

**既にある場合**（`docs/DEPLOY.md` で作成済み）: https://vercel.com/dashboard を開き、プロジェクト一覧から `theater-ticket` をクリック。

**無い場合**:
1. https://vercel.com/new を開く
2. 「Import Git Repository」の一覧で `puzzliar/theater-ticket` の右の **Import** を押す（一覧に無ければ「Adjust GitHub App Permissions」からリポジトリへのアクセスを許可する）
3. Framework Preset が **Next.js** になっていることを確認（自動検出）。Root Directory は `./` のまま
4. **Environment Variables** の欄を開き、A-3 の「必須」の変数を 1 行ずつ入れる（Key と Value を入力して **Add**）
5. **Deploy** を押す。数分で「Congratulations!」が出る

### A-3. 環境変数を登録する

1. Vercel のプロジェクト画面上部のタブ **Settings** をクリック
2. 左メニュー **Environment Variables** をクリック
3. 変数ごとに、**Key** と **Value** を入力し、Environments は **Production** と **Preview** の両方にチェック（既定で全部にチェックが入っている）→ **Save**
4. 既に登録済みの変数を変更する場合は、一覧の右端の **…** → **Edit** → Value を書き換えて **Save**

**必須（既存の変数は値を確認）**

| Key | Value | 備考 |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://wiqnmebudaadwqdaxwko.supabase.co` | 設定済みのはず |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | B-0 で確認する `anon` キー | 設定済みのはず |
| `SUPABASE_SERVICE_ROLE_KEY` | B-0 で確認する `service_role` キー | 設定済みのはず。**秘匿** |
| `NEXT_PUBLIC_SITE_URL` | `https://<ドメイン>` | **末尾に `/` を付けない** |
| `RESEND_API_KEY` | C-3 で取得 | C を終えてから登録 |
| `EMAIL_FROM` | `PUZZLIAR <noreply@puzzliar.jp>` | 既存値「PUZZLIAR チケット <…>」から変更する（稽古管理の通知にも使うため） |
| `CRON_SECRET` | A-4 で生成したランダム文字列 | H-1 で同じ値を使う |
| `ORG_CREATION_OPEN` | `false` | 招待制 |
| `LINE_PUSH_MONTHLY_LIMIT` | `200` | |
| `REHEARSAL_DIGEST_HOUR` | `8` | |
| `REHEARSAL_REMINDER_HOUR` | `20` | |

**推奨・任意（各章で取得してから登録）**

| Key | 取得する章 |
|---|---|
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` `VAPID_PRIVATE_KEY` `VAPID_SUBJECT` | E |
| `GOOGLE_CLIENT_ID` `GOOGLE_CLIENT_SECRET` `GOOGLE_TOKEN_KEY` | F |
| `LINE_CHANNEL_SECRET` `LINE_CHANNEL_ACCESS_TOKEN` `LINE_ADD_FRIEND_URL` | G |
| `LINE_LOGIN_CHANNEL_ID` `LINE_LOGIN_CHANNEL_SECRET` `NEXT_PUBLIC_LINE_LOGIN_ENABLED` | G |

### A-4. ランダム文字列を作る（`CRON_SECRET` と `GOOGLE_TOKEN_KEY` 用）

ターミナルで次を実行し、出力された文字列をコピーする（2 回実行して 2 つ作る）:

```bash
openssl rand -base64 48
```

Windows で `openssl` が無い場合は PowerShell で:

```powershell
-join ((48..57)+(65..90)+(97..122) | Get-Random -Count 48 | % {[char]$_})
```

### A-5. ドメインを接続する

1. Vercel プロジェクト → **Settings** → 左メニュー **Domains**
2. 入力欄に `<ドメイン>`（例: `app.puzzliar.jp`）を入力し **Add** を押す
3. 「Add domain」のダイアログで既定のまま **Add** を押す
4. 一覧に追加されたドメインの下に「Invalid Configuration」と DNS の指示が出る。表示された **CNAME** の値（通常 `cname.vercel-dns.com`）を控える
5. DNS 管理画面（例: お名前.com の「DNS 設定／レコード追加」、Cloudflare なら **DNS → Records → Add record**）で次を追加して保存:

```
種別: CNAME
ホスト名(名前): app        ← <ドメイン> のサブドメイン部分
値(ターゲット): cname.vercel-dns.com
TTL: 自動 または 3600
```

   Cloudflare の場合は Proxy status を **DNS only**（灰色の雲）にする
6. Vercel の Domains 画面に戻り **Refresh** を押す。「Valid Configuration」に変わり、SSL 証明書が自動発行される（数分〜数時間）

### A-6. 再デプロイして確認する

1. Vercel プロジェクト → 上部タブ **Deployments**
2. 一番上のデプロイ行の右端 **…** → **Redeploy** → ダイアログで **Redeploy**
3. Status が **Ready** になったら、ブラウザで次を開く
   - `https://<ドメイン>/rehearsal` → 「今日、どこに行けばいいか。」の紹介ページ
   - `https://<ドメイン>/login` → 「Google でログイン」ボタンがある
   - `https://<ドメイン>/terms` と `/privacy` → 文章が表示される

---

## B. Supabase Auth の設定

### B-0. API キーの場所（A-3 で使う）

1. https://supabase.com/dashboard/project/wiqnmebudaadwqdaxwko を開く（ログインを求められたら Supabase アカウントでログイン）
2. 左メニュー最下部の歯車 **Project Settings** → **API Keys**
3. **Legacy API Keys** タブに `anon` `public` と `service_role` `secret` がある。それぞれ右の **Copy** ボタンでコピー（`service_role` は **Reveal** を押してから）

### B-1. URL 設定（最重要）

1. https://supabase.com/dashboard/project/wiqnmebudaadwqdaxwko/auth/url-configuration を開く（左メニュー **Authentication** → **URL Configuration** でも同じ）
2. **Site URL** の欄を `https://<ドメイン>` に書き換え → **Save**
3. **Redirect URLs** の **Add URL** を押し、次を 1 つずつ追加して **Save**:
   - `https://<ドメイン>/auth/callback`
   - `https://<ドメイン>/**`
   - `http://localhost:3000/**`（ローカル確認用）

ここが未登録だと、Google ログインやメール確認リンクの後に `/login?error=auth` へ戻される。

### B-2. Google ログインの確認（設定済みのはず）

1. https://supabase.com/dashboard/project/wiqnmebudaadwqdaxwko/auth/providers を開く
2. 一覧の **Google** をクリックして展開。**Enable Sign in with Google** が ON、**Client ID** と **Client Secret** が入っていることを確認
3. 同じ画面に表示される **Callback URL (for OAuth)**（`https://wiqnmebudaadwqdaxwko.supabase.co/auth/v1/callback`）を控えておく。F-3 で Google 側のクライアントの「承認済みのリダイレクト URI」に含まれている必要がある

### B-3. メール確認を ON にする

1. 同じ **Providers** 画面で **Email** をクリックして展開
2. **Confirm email** を **ON**（新規登録時に確認メールを送る）
3. **Secure email change** を ON
4. **Save**

### B-4. メールテンプレート（任意）

1. https://supabase.com/dashboard/project/wiqnmebudaadwqdaxwko/auth/templates を開く
2. **Confirm signup** タブ → **Subject heading** を `【PUZZLIAR】メールアドレスの確認` に変更。本文は `{{ .ConfirmationURL }}` が残っていればよい → **Save**
3. 必要なら **Reset password** も同様に日本語化

### B-5. カスタム SMTP（Resend）を有効にする

Supabase 標準のメール送信は 1 時間あたり数通しか送れないため、C を終えてから設定する。

1. https://supabase.com/dashboard/project/wiqnmebudaadwqdaxwko/auth/smtp を開く（左メニュー **Authentication** → **Emails** → **SMTP Settings**）
2. **Enable Custom SMTP** を **ON**
3. 次を入力して **Save**:

| 項目 | 値 |
|---|---|
| Sender email | `noreply@puzzliar.jp`（C で認証したドメインのアドレス） |
| Sender name | `PUZZLIAR` |
| Host | `smtp.resend.com` |
| Port number | `465` |
| Username | `resend` |
| Password | C-3 で作った Resend の API キー |

4. **Authentication → Rate Limits**（https://supabase.com/dashboard/project/wiqnmebudaadwqdaxwko/auth/rate-limits）を開き、**Rate limit for sending emails** を `100`（1 時間あたり）程度に上げて **Save**。既定は 30 人/時

### B-6. 確認

1. 左メニュー **Authentication** → **Users** に harbingerstar@gmail.com などの既存ユーザーが見える
2. 左メニュー **Table Editor** → 左のテーブル一覧から `core_profiles` を開き、Users と同じ数の行があること

---

## C. Resend（メール送信）

### C-1. アカウント作成

1. https://resend.com/signup を開き、メールアドレスまたは GitHub で登録
2. 登録後 https://resend.com/overview が開く（無料枠: 月 3,000 通・1 日 100 通）

### C-2. 送信ドメインを認証する

1. 左メニュー **Domains** → 右上 **Add Domain**
2. Name に `puzzliar.jp`（サブドメイン運用なら `mail.puzzliar.jp`）を入力、Region は **Tokyo (ap-northeast-1)** を選び **Add**
3. 表示される **DNS Records** の表（DKIM の TXT または CNAME が 3 行前後、SPF 用の MX と TXT）を、DNS 管理画面に**表示どおり**追加する
   - お名前.com: 「ネームサーバーの設定」→「DNS 設定/転送設定」→ 対象ドメインの「DNS レコード設定」→ 各行を「追加」→ 最後に「確認画面へ進む」→「設定する」
   - Cloudflare: **DNS → Records → Add record** を行数分繰り返す。Proxy status は **DNS only**
4. Resend の Domain 画面で **Verify DNS Records** を押す。Status が **Verified**（緑）になるまで待つ（数分〜数時間。**Pending** のままなら 1 時間後に再度 Verify）

### C-3. API キーを作る

1. 左メニュー **API Keys** → **Create API Key**
2. Name: `puzzliar-app`、Permission: **Sending access**、Domain: 上で認証したドメイン → **Add**
3. 表示されたキー（`re_` で始まる）を**この場でコピー**（後から再表示できない）
4. Vercel の `RESEND_API_KEY`（A-3）と Supabase の SMTP Password（B-5）に貼り付ける

### C-4. リンクのトラッキングを OFF にする（重要）

Resend でクリック計測が ON だと Supabase の確認リンクが書き換えられて壊れることがある。

1. 左メニュー **Domains** → 対象ドメインをクリック
2. **Click Tracking** と **Open Tracking** が **Disabled** であることを確認（Enabled なら切り替える）

### C-5. 動作確認

B-5 まで終えたら、`https://<ドメイン>/signup` で自分の別メールアドレスを登録し、確認メールが届いて件名が B-4 のものになっていること。

---

## D. 規約・プライバシーポリシー・運営者情報

リポジトリの `src/app/terms/page.tsx` と `src/app/privacy/page.tsx` はドラフト。

1. `https://<ドメイン>/terms` と `https://<ドメイン>/privacy` を印刷または PDF にして法務レビューに出す。確認してもらう論点: 無料提供と将来の有料機能（4 条）、空き時間の組織間共有（3 条）、退会時の匿名化（8 条）、Google ユーザーデータの限定的使用（プライバシー 3 項）
2. 修正内容を反映する: GitHub で https://github.com/puzzliar/theater-ticket/blob/main/src/app/privacy/page.tsx を開き、右上の鉛筆アイコン **Edit this file** → 文面を修正 → 右上 **Commit changes…** → **Commit changes**（main に直接コミットすると Vercel が自動デプロイする）。規約も同様
3. 運営者情報を追記する: プライバシーポリシー 7 項「お問い合わせ」に運営者名・所在地（市区町村まででよい）・問い合わせ先メールを書く
4. 版番号を更新する: `src/lib/core/types.ts` の `TERMS_VERSION` と `PRIVACY_VERSION` を確定日（例: `"2026-10-01"`）に変更してコミット
5. F-2 の Google 同意画面には `https://<ドメイン>/privacy` を登録する

---

## E. Web プッシュ（VAPID 鍵）

1. ターミナルで次を実行:

```bash
npx web-push generate-vapid-keys
```

   初回は「Ok to proceed? (y)」と聞かれるので `y` を押す。次のように表示される:

```
Public Key:
BNx...（長い文字列）
Private Key:
abc...（長い文字列）
```

2. Vercel（A-3 の手順）で 3 つ登録する:
   - `NEXT_PUBLIC_VAPID_PUBLIC_KEY` = Public Key
   - `VAPID_PRIVATE_KEY` = Private Key
   - `VAPID_SUBJECT` = `mailto:support@puzzliar.jp`
3. A-6 の手順で Redeploy
4. 確認: スマホまたは PC の Chrome で `https://<ドメイン>/me/settings` を開き（ログイン後）、「プッシュ通知(この端末)」に **この端末で受信する** ボタンが出る → 押す → ブラウザの「通知を許可しますか」で **許可** → 表示が「この端末で受信中」に変わる
   - iPhone の場合: Safari で開き、共有ボタン → **ホーム画面に追加** → ホーム画面のアイコンから開いてから上記を行う

鍵は一度決めたら変えない（変えると全端末の購読が無効になる）。

---

## F. Google カレンダー連携（Google Cloud）

### F-1. プロジェクトを開き Calendar API を有効化

1. https://console.cloud.google.com/ を開き、PUZZLIAR の Google アカウントでログイン
2. 画面上部のプロジェクト名（プルダウン）をクリック → Supabase の Google ログインに使っているプロジェクトを選ぶ（分からなければ **新しいプロジェクト** → 名前 `puzzliar-app` → **作成**）
3. https://console.cloud.google.com/apis/library/calendar-json.googleapis.com を開く（上のプロジェクトが選ばれていることを確認）
4. 青い **有効にする** を押す。「API が有効です」になれば完了

### F-2. OAuth 同意画面（Google Auth Platform）

1. https://console.cloud.google.com/auth/overview を開く。初めての場合は **開始** を押してウィザードに従う（既に設定済みなら 2 へ）
   - アプリ情報: アプリ名 `PUZZLIAR 稽古管理`、ユーザーサポートメール `support@puzzliar.jp` → **次へ**
   - 対象: **外部** → **次へ**
   - 連絡先情報: `support@puzzliar.jp` → **次へ**
   - 同意にチェック → **作成**
2. 左メニュー **ブランディング** を開き、次を入力して **保存**:

| 項目 | 値 |
|---|---|
| アプリ名 | PUZZLIAR 稽古管理 |
| ユーザーサポートメール | support@puzzliar.jp |
| アプリのロゴ | 任意（設定すると審査対象が増えるので β では空でよい） |
| アプリのホームページ | `https://<ドメイン>/rehearsal` |
| アプリのプライバシーポリシー | `https://<ドメイン>/privacy` |
| アプリの利用規約 | `https://<ドメイン>/terms` |
| 承認済みドメイン | `puzzliar.jp`（**ドメインを追加** を押して入力） |

3. 左メニュー **データアクセス** → **スコープを追加または削除** → 右側のパネルで:
   - 検索欄に `calendar` と入れ、`.../auth/calendar.events`（Google Calendar API）と `.../auth/calendar.freebusy` にチェック
   - `openid` と `.../auth/userinfo.email` にもチェック
   - パネル下部 **更新** → 画面下部 **保存**
4. 左メニュー **対象** を開く:
   - 公開ステータスが **テスト** であることを確認（審査完了まではこのまま）
   - **テストユーザー** の **Add users** を押し、β 参加者の Google アカウント（Gmail アドレス）を 1 行 1 件で入力 → **保存**（最大 100 名）

### F-3. OAuth クライアントを作る

1. 左メニュー **クライアント**（または https://console.cloud.google.com/auth/clients）→ **クライアントを作成**
2. アプリケーションの種類: **ウェブ アプリケーション**、名前: `puzzliar-web`
3. **承認済みの JavaScript 生成元** → **URI を追加** → `https://<ドメイン>`
4. **承認済みのリダイレクト URI** → **URI を追加** で次を追加:
   - `https://<ドメイン>/api/google/callback`
   - `https://wiqnmebudaadwqdaxwko.supabase.co/auth/v1/callback`（B-2 で控えたもの。Supabase の Google ログインと同じクライアントを使う場合）
5. **作成** → ダイアログに **クライアント ID** と **クライアント シークレット** が表示される。両方コピー（シークレットは後から **クライアント** 一覧の該当行をクリックしても確認できる）
6. Vercel（A-3）に `GOOGLE_CLIENT_ID`、`GOOGLE_CLIENT_SECRET`、`GOOGLE_TOKEN_KEY`（A-4 で作った 2 つ目のランダム文字列）を登録し、A-6 の手順で Redeploy
7. Supabase の Google ログインを別クライアントで動かしている場合はそのまま。同じにしたい場合は B-2 の画面で Client ID / Secret をこのクライアントの値に差し替えて **Save**

### F-4. 動作確認

1. F-2 でテストユーザーに入れた Google アカウントで `https://<ドメイン>/login` → **Google でログイン**
2. `https://<ドメイン>/me/settings` → 「Google カレンダー」欄の **Google カレンダーと連携する**
3. Google の画面で「このアプリは Google で確認されていません」と出たら **詳細** → **PUZZLIAR 稽古管理（安全ではないページ）に移動** を押す（テスト状態では必ず出る）
4. 「カレンダーの予定の表示、編集…」にチェックが入った状態で **続行**
5. `/me/settings` に戻り「Google カレンダーと連携しました」と表示される
6. H-3 で稽古枠に召集されると Google カレンダーに即時に予定が入り、`/me` の空き時間一覧に「Googleカレンダーの予定」が「不可」として入る

**テスト状態の注意**: 認可は 7 日で失効する。失効すると自動で連携が解除され、`/me/settings` に再連携ボタンが出る。β 参加者には「週 1 回再連携が必要」と伝えるか、F-5 を早めに進める。

### F-5. 審査を申請する（一般公開前）

1. F-2 の **ブランディング** がすべて埋まっていること、D の規約・ポリシーが本番 URL で公開されていることを確認
2. ドメイン所有権の確認: https://search.google.com/search-console を開き、**プロパティを追加** → **ドメイン** に `puzzliar.jp` → 表示された TXT レコードを DNS に追加 → **確認**
3. デモ動画を撮る（画面録画で 2〜3 分、YouTube に **限定公開** でアップロード）。内容: ログイン → `/me/settings` の連携ボタン → Google の同意画面（要求スコープが見える）→ 主催者が稽古枠を作成 → 本人の Google カレンダーに予定が入る → 「今すぐ取り込む」で空き時間が更新される → 「連携を解除」で予定が消える
4. https://console.cloud.google.com/auth/verification（左メニュー **確認センター**）→ **確認を準備** または **確認のために送信** を押し、フォームに次を記入:
   - アプリの説明、スコープごとの利用理由（例: `calendar.events`: 稽古の召集をユーザー自身のカレンダーに登録・更新・削除するため。`calendar.freebusy`: 予定ありの時間帯を空き時間判定に使うため。内容は取得しない）
   - デモ動画の URL
   - 「Google API サービスのユーザーデータに関するポリシー（限定的使用の要件を含む）に準拠」への同意
5. **送信**。Google からメールで質問が来たら返信する（通常 2〜6 週間）
6. 承認後、**対象** 画面で **本番環境に公開** を押す。以後テストユーザー制限と 7 日失効が無くなる

---

## G. LINE 連携（LINE Developers）

### G-1. プロバイダーを作る

1. https://developers.line.biz/console/ を開き、**LINE アカウントでログイン**（PUZZLIAR 運営用の LINE アカウント）
2. 初回は開発者名とメールアドレスの登録画面 → 入力して **作成**
3. 「プロバイダー」の **作成** ボタン → プロバイダー名 `PUZZLIAR` → **作成**

ログインチャネルと Messaging API チャネルは**必ずこのプロバイダー配下**に作る（同じ人の userId が一致するため）。

### G-2. Messaging API チャネル（通知・返信用）

1. プロバイダー `PUZZLIAR` の画面で **チャネル設定** タブ → **新規チャネル作成** → **Messaging API** を選ぶ
2. 「LINE 公式アカウントを作成」への案内が出た場合は **LINE Official Account Manager** に遷移するので、そこで:
   - アカウント名 `PUZZLIAR 稽古管理`、業種 大業種 **サービス**／小業種 **その他** など → **確認** → **完了**
   - 作成後、右上 **設定** → 左メニュー **Messaging API** → **Messaging API を利用する** → プロバイダーで `PUZZLIAR` を選択 → **同意する** → プライバシーポリシー URL（任意）→ **OK**
3. LINE Developers コンソールに戻り、プロバイダー `PUZZLIAR` 配下に Messaging API チャネルが出ているのでクリック
4. **チャネル基本設定** タブ:
   - **チャネルシークレット** の値をコピー → Vercel `LINE_CHANNEL_SECRET`
5. **Messaging API 設定** タブ:
   - **Webhook URL** の **編集** → `https://<ドメイン>/api/line/webhook` → **更新** → **検証** ボタンを押して「成功」が出ること
   - **Webhook の利用** を **ON**
   - ページ下部 **チャネルアクセストークン（長期）** の **発行** → 表示されたトークンをコピー → Vercel `LINE_CHANNEL_ACCESS_TOKEN`
   - 同じタブ上部の **QR コード**／**ボットのベーシック ID** の近くにある **友だち追加 URL**（`https://lin.ee/…`）をコピー → Vercel `LINE_ADD_FRIEND_URL`（見当たらなければ LINE Official Account Manager の **ホーム** → **友だちを増やす** → **友だち追加ガイド** → URL をコピー）
6. **自動応答を止める**（重要）: https://manager.line.biz/ を開き、公式アカウント `PUZZLIAR 稽古管理` → 右上 **設定** → 左メニュー **応答設定**:
   - **応答メッセージ** を **オフ**
   - **Webhook** を **オン**
   - **あいさつメッセージ** は任意（オンなら Messaging API 側の follow 応答と二重になるのでオフ推奨）
7. Vercel で A-6 の手順で Redeploy

### G-3. LINE ログインチャネル（任意）

1. プロバイダー `PUZZLIAR` → **チャネル設定** → **新規チャネル作成** → **LINE ログイン**
2. 入力: チャネル名 `PUZZLIAR 稽古管理 ログイン`、チャネル説明、アプリタイプ **ウェブアプリ**、メールアドレス → 規約に同意 → **作成**
3. **チャネル基本設定** タブ:
   - **チャネル ID** → Vercel `LINE_LOGIN_CHANNEL_ID`
   - **チャネルシークレット** → Vercel `LINE_LOGIN_CHANNEL_SECRET`
   - ページ下部 **OpenID Connect** → **メールアドレス取得権限** の **申請** → 申請フォームでプライバシーポリシー URL（`https://<ドメイン>/privacy`）と利用目的を入力して送信（承認まで LINE のメールは取得できないが、ログイン自体は動く）
   - **リンクされたボット** → G-2 の Messaging API チャネルを選択（ログイン時に友だち追加を案内できる）
4. **LINE ログイン設定** タブ:
   - **コールバック URL** の **編集** → `https://<ドメイン>/auth/line/callback` → **更新**
5. チャネル画面上部のステータスが **開発中** なら、**公開** ボタンを押して **公開済み** にする（開発中のままだと管理者以外がログインできない）
6. Vercel で `NEXT_PUBLIC_LINE_LOGIN_ENABLED` = `true` を登録して Redeploy。`/login` に「LINE でログイン」が出る

### G-4. 料金プランの確認

1. https://manager.line.biz/ → 公式アカウント → 右上 **設定** → 左メニュー **利用と請求** → **月額プラン**
2. **コミュニケーションプラン（無料）** であることを確認。無料枠は月 200 通のプッシュ。アプリの `LINE_PUSH_MONTHLY_LIMIT=200` がこれに対応する。プランを上げた場合は変数も合わせる

### G-5. 動作確認

1. スマホの LINE で `LINE_ADD_FRIEND_URL` を開き **追加**。「友だち追加ありがとうございます…」と返信が来る
2. `https://<ドメイン>/me/settings` → 「LINE」欄の **連携コードを発行(10分有効)** → 6 桁の数字が出る
3. LINE でそのトークに `連携 123456`（自分の数字）と送る → 「○○ さんとして連携しました」と返る
4. `今日` と送る → 予定（無ければ「今日の予定はありません。」）が返る

---

## H. スケジューラ・運営アカウント・動作確認

### H-1. 定時通知のスケジューラ

毎朝の予定配信・前日リマインド・Google 取り込みは `/api/cron/rehearsal-notify` を **15 分おき**に呼ぶことで動く（時刻の判定はアプリ側なので、頻繁に呼んでよい）。

**方法 1: cron-job.org（無料・推奨）**

1. https://cron-job.org/en/signup/ でアカウント作成（メール確認あり）→ https://console.cron-job.org/jobs を開く
2. 右上 **CREATE CRONJOB**
3. **Common** タブ:
   - Title: `rehearsal-notify`
   - URL: `https://<ドメイン>/api/cron/rehearsal-notify`
   - Execution schedule: **Every 15 minutes** を選ぶ
4. **Advanced** タブ:
   - **Headers** の **Add** → Key `Authorization`、Value `Bearer <CRON_SECRET の値>`（`Bearer` と値の間に半角スペース）
   - Request method: **GET**
5. 右下 **CREATE**
6. 一覧に戻り、作った行の右の **▶（Execute now）** を押す → **History** タブで Status が **200 OK**、Response body が `{"skipped":true,"hour":…}` または `{"hour":…,"jobs":[…]}` なら成功。`401` なら Authorization ヘッダーの値が違う
7. チケット側のリマインド用に、URL `https://<ドメイン>/api/cron/send-reminders`、Every 10 minutes で同様にもう 1 件作る（未登録の場合）

**方法 2: Supabase pg_cron（cron-job.org を使わない場合）**

1. https://supabase.com/dashboard/project/wiqnmebudaadwqdaxwko/sql/new を開く（左メニュー **SQL Editor** → **New query**）
2. 次を貼り付け、`<ドメイン>` と `<CRON_SECRET>` を置き換えて右下 **Run**:

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.schedule(
  'rehearsal-notify', '*/15 * * * *',
  $$ select net.http_get(
       url := 'https://<ドメイン>/api/cron/rehearsal-notify',
       headers := '{"Authorization": "Bearer <CRON_SECRET>"}'::jsonb) $$
);
```

3. 「Success. No rows returned」または jobid が返れば登録完了。左メニュー **Integrations** → **Cron** で一覧と実行履歴を見られる

**手動での動作確認**（どちらの方法でも）: ターミナルで

```bash
curl -H "Authorization: Bearer <CRON_SECRET>" "https://<ドメイン>/api/cron/rehearsal-notify?force=digest"
```

`{"hour":…,"jobs":["digest"],"digest":0,…}` のような JSON が返る。今日の召集がある人にダイジェストが送られる（`digest` が送信件数）。

### H-2. 運営アカウントと主催者コード

1. `https://<ドメイン>/login` → メール `harbingerstar@gmail.com` と既存パスワードで **メールでログイン**（この 1 アカウントだけ運営権限が付与済み。パスワード不明なら Supabase → **Authentication** → **Users** → 該当行の **…** → **Send password recovery** でリセット）
2. 初回は `/onboarding` が開く。表示名を入力し、必須の 2 つにチェック → **はじめる**
3. `/me` が開く。画面上部ヘッダーの **運営** をクリック（`https://<ドメイン>/platform`）
4. 「主催者コード」の入力欄に、メモ（例: `劇団○○ 佐藤さん`）、使用回数 `1`、有効日数 `30` を入れて **発行**。`PZ-XXXXXXXX` 形式のコードが一覧に出る。β 参加劇団ごとに 1 つ発行して渡す
5. 運営権限を追加したい場合は Supabase SQL Editor（H-1 方法 2 の手順 1）で:

```sql
update core_profiles set is_platform_admin = true where email = '<メールアドレス>';
```

6. 自劇団（PUZZLIAR）は既に `https://<ドメイン>/o/puzzliar` にあり、harbingerstar@gmail.com がオーナー。ヘッダーに **PUZZLIAR** のリンクが出ている

### H-3. エンドツーエンド動作確認（2 アカウントで行う）

アカウント A = 運営（harbingerstar@gmail.com、通常のブラウザ）、アカウント B = β 参加者役（別のブラウザまたはシークレットウィンドウ。dai@puzzliar.jp で Google ログイン、または新しいメールで登録）。

| # | 誰 | 操作 | 期待結果 |
|---|---|---|---|
| 1 | B | `https://<ドメイン>/signup` → 表示名・メール・パスワード → 規約にチェック → **メールで登録** | 「確認メールを送信しました」。届いたメールのリンクを開くと `/onboarding` → 同意 → `/me` |
| 2 | B | 別ブラウザで `/login` → **Google でログイン** | `/onboarding` または `/me`。Supabase → Users に google の行が増える |
| 3 | A | `/orgs/new` → 団体名 `テスト劇団`、URL 名 `test-troupe` → **作成する**（運営はコード不要） | `https://<ドメイン>/o/test-troupe?created=1` に遷移。ヘッダーに「テスト劇団」 |
| 4 | A | ヘッダー **メンバー** → 「参加者台帳」の欄で名前 `テスト花子`、区分 キャスト → **仮メンバーを追加**。「招待リンク」の欄でラベル `β テスト` → **発行** | QR と `https://<ドメイン>/join/xxxx` が表示される |
| 5 | B | 上のリンクを開く → 関わり方 キャスト → **参加する** | `/o/test-troupe?joined=1`。「この団体での参加者登録」に **テスト花子(キャスト) は私です** ボタン → 押す → 消える |
| 6 | A | `/o/test-troupe` → 「新しいプロダクション」に公演名 `秋公演` → **作成** → シーン欄でコード `1-1`、シーン名 `冒頭`、必要メンバーに テスト花子 → **追加** → 「稽古枠を作成」で明日の日付・18:00〜21:00、対象シーン `1-1`、「作成時に召集を通知」ON → **作成する** | 稽古枠詳細に遷移。メンバー表に テスト花子（未回答）。B にメール（E/G 設定済みならプッシュ／LINE）が届く |
| 7 | B | `/me` → 「要対応」の稽古枠で **参加** | 表示が「参加」。A が稽古枠詳細を再読み込みすると回答が「参加」 |
| 8 | B | `/me` → 空き時間の登録で、明後日・「参加できない」・終日 → **登録** | 一覧に「不可」が出る。A が `/o/test-troupe/availability` を開くと該当日に赤い「不可」 |
| 9 | A | 稽古枠を作成する画面で明後日 18:00〜21:00、シーン `1-1` を選び **参加可否を確認** | テスト花子に「× 不可」と表示 |
| 10 | A | 稽古枠詳細 → 「代役募集」で欠ける人 テスト花子 → **代役を募集する** | 「[募集中] テスト花子 さんの代役 / 候補 0 名」（候補がいる劇団では候補に通知が届き、「入れます」で確定） |
| 11 | A | 稽古枠詳細 → シーン `1-1` を **実施** → 「保存と同時に完了にする」にチェック → **記録を保存** | プロダクション画面のシーン進捗が `1 / 1`、「未消化 0」「全シーン一巡済み」 |
| 12 | B | `/me/settings` → **Google カレンダーと連携する**（F 設定後） | Google カレンダーに `[稽古] テスト劇団 秋公演` が入る |
| 13 | B | `/me/settings` → 「自分の予定・出欠・空き時間を CSV でダウンロード」 | CSV が保存される |
| 14 | B | `/me/settings` → **アカウントを削除(退会)** → `退会` と入力 → **退会する** | `/rehearsal?deleted=1`。A の **メンバー** から B が消え、参加者台帳に「退会済みユーザー」 |

14 の後、B は同じメールで再登録できる。テスト劇団は A の `/o/test-troupe/settings` → **アーカイブする** で片付ける。

### H-4. β 参加劇団への案内文（例）

> PUZZLIAR 稽古管理（β）のご案内
>
> ■ 主催者の方
> 1. `https://<ドメイン>/signup` で登録（Google アカウントが簡単です）
> 2. `https://<ドメイン>/orgs/new` から劇団を作成。主催者コード: `PZ-XXXXXXXX`
> 3. 劇団ページ上部の「メンバー」→「招待リンク」を発行し、キャストの LINE グループに貼ってください
>
> ■ キャストの方
> 1. 主催者から届いた招待リンクを開き、登録して「参加する」
> 2. `https://<ドメイン>/me/settings` で通知の受け取り方と Google カレンダー連携を設定できます
>
> ※ Google カレンダー連携は現在 Google の審査中のため、事前にお知らせいただいた Google アカウントのみ利用でき、1 週間ごとに再連携が必要です。iCal 購読 URL（設定画面）はどなたでも使えます。

---

## I. 一般公開への切り替え（β 終了時）

1. F-5 の審査が承認されたら、Google Auth Platform の **対象** → **本番環境に公開**
2. Vercel → Settings → Environment Variables → `ORG_CREATION_OPEN` を **Edit** → `true` → **Save** → A-6 の Redeploy
3. `src/app/rehearsal/page.tsx` の「現在はクローズド β として招待制で運用しています…」の段落を削除または書き換え（D-2 と同じ GitHub 上の編集手順）
4. LINE: G-4 の画面でプランを見直し、`LINE_PUSH_MONTHLY_LIMIT` を合わせる
5. Supabase: B-5 の Rate Limits と Resend の上限（https://resend.com/settings/billing）を利用者数に合わせる
6. `/rehearsal` と `/privacy` に問い合わせ先を明記する

---

## J. 日常運用とトラブルシューティング

### J-1. 見るところ

- **アプリのエラー**: Vercel プロジェクト → 上部タブ **Logs** → 検索欄に `google sync failed` / `webpush failed` / `LINE API error` / `line webhook failed`。単発なら無視。同じ人で繰り返すなら本人に連携の再設定を案内
- **セキュリティ診断**: https://supabase.com/dashboard/project/wiqnmebudaadwqdaxwko/database/security-advisor を月 1 回。新しい ERROR が出ていないこと
- **LINE 無料枠の消費**: Supabase SQL Editor で

```sql
select count(*) from rh_notifications
where channel = 'line' and sent_at >= date_trunc('month', now() at time zone 'Asia/Tokyo');
```

- **スケジューラの死活**: cron-job.org → Jobs → `rehearsal-notify` → **History** に 200 が並んでいること

### J-2. よくある症状と対処

| 症状 | 原因と対処 |
|---|---|
| Google ログイン後に `/login?error=auth` に戻る | B-1 の Redirect URLs に `https://<ドメイン>/auth/callback` が無い、または `NEXT_PUBLIC_SITE_URL` が実際のドメインと違う |
| メール確認リンクを開いても登録が完了しない | 同上。Supabase の Site URL を確認。Resend の Click Tracking が ON（C-4） |
| 確認メールが届かない | B-5 の SMTP 未設定（標準 SMTP は数通/時）。Resend の Domain が Verified でない。Resend → **Emails** で送信履歴と bounce を確認 |
| Google 連携で「連携に失敗しました」 | F-3 のリダイレクト URI 不一致、または F-1 の API 未有効化。Vercel Logs に `token endpoint 400` |
| Google 連携が 1 週間で切れる | 同意画面がテスト状態。F-5 を進める |
| Google の同意画面で「アクセスをブロック: このアプリは確認されていません」 | 本人がテストユーザーに未登録。F-2 の **対象** → **テストユーザー** に追加 |
| LINE で「今日」と送っても返事がない | G-2 の Webhook が OFF／応答メッセージが ON／`LINE_CHANNEL_SECRET` が違う（署名検証 401）。LINE Developers の Webhook **検証** ボタンで確認 |
| LINE プッシュが届かずメールになる | 月間上限到達（J-1 の SQL で件数確認） |
| プッシュ通知のボタンが出ない | E の鍵未設定、または iPhone でホーム画面に追加していない |
| 招待リンクで「招待が見つかりません」 | 期限切れ・無効化・回数超過。**メンバー** 画面で再発行 |
| 主催者が組織を作れない | 招待制。`/platform` でコードを発行して渡す |
| 毎朝の通知が来ない | H-1 の Job が停止（cron-job.org は連続失敗で自動停止する）。History を確認して **Enable**。`CRON_SECRET` 不一致なら 401 |
| デプロイ後に画面が真っ白／500 | Vercel Logs を確認。環境変数の入れ忘れが多い（特に `SUPABASE_SERVICE_ROLE_KEY`） |

### J-3. データの復旧

- 誤って除名したメンバー: 本人が招待リンクから再参加すれば、参加者台帳の同じレコードに戻る
- アーカイブした組織: `/platform` の組織一覧で **有効化**（または SQL `update core_organizations set status = 'active' where slug = '<slug>'`）
- 退会は取り消せない（匿名化済み）

---

## 付録 1. 環境変数一覧

| Key | 必須 | 用途 | 取得箇所 |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` `NEXT_PUBLIC_SUPABASE_ANON_KEY` `SUPABASE_SERVICE_ROLE_KEY` | 必須 | DB・認証 | B-0 |
| `NEXT_PUBLIC_SITE_URL` | 必須 | 公開 URL | 0-1 |
| `RESEND_API_KEY` `EMAIL_FROM` | 必須 | メール通知 | C-3 |
| `CRON_SECRET` | 必須 | 定時通知の保護 | A-4 |
| `ORG_CREATION_OPEN` | 必須 | `false`=招待制 | |
| `REHEARSAL_DIGEST_HOUR` `REHEARSAL_REMINDER_HOUR` | 任意 | 通知時刻（既定 8／20） | |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` `VAPID_PRIVATE_KEY` `VAPID_SUBJECT` | 推奨 | Web プッシュ | E |
| `GOOGLE_CLIENT_ID` `GOOGLE_CLIENT_SECRET` | 推奨 | Google カレンダー | F-3 |
| `GOOGLE_TOKEN_KEY` | 推奨 | トークン暗号化鍵（変更禁止） | A-4 |
| `LINE_CHANNEL_SECRET` `LINE_CHANNEL_ACCESS_TOKEN` `LINE_ADD_FRIEND_URL` `LINE_PUSH_MONTHLY_LIMIT` | 任意 | LINE 通知・返信 | G-2 |
| `LINE_LOGIN_CHANNEL_ID` `LINE_LOGIN_CHANNEL_SECRET` `NEXT_PUBLIC_LINE_LOGIN_ENABLED` | 任意 | LINE ログイン | G-3 |

## 付録 2. 登録する URL 一覧（コピー用）

| 登録先 | 画面 | 値 |
|---|---|---|
| Supabase | Authentication → URL Configuration → Site URL | `https://<ドメイン>` |
| Supabase | 同 → Redirect URLs | `https://<ドメイン>/auth/callback`、`https://<ドメイン>/**` |
| Google Cloud | クライアント → 承認済みのリダイレクト URI | `https://<ドメイン>/api/google/callback`、`https://wiqnmebudaadwqdaxwko.supabase.co/auth/v1/callback` |
| Google Cloud | ブランディング → ホームページ／プライバシー／規約 | `https://<ドメイン>/rehearsal`、`/privacy`、`/terms` |
| LINE Developers | Messaging API 設定 → Webhook URL | `https://<ドメイン>/api/line/webhook` |
| LINE Developers | LINE ログイン設定 → コールバック URL | `https://<ドメイン>/auth/line/callback` |
| cron-job.org | Job URL | `https://<ドメイン>/api/cron/rehearsal-notify`（Header `Authorization: Bearer <CRON_SECRET>`） |

## 付録 3. 公開前チェックリスト

- [ ] A-1 `main` にマージ済み ／ A-5 ドメインが Valid Configuration ／ A-6 `/rehearsal` が開く
- [ ] A-3 必須 11 変数を登録。`EMAIL_FROM` を汎用名に変更
- [ ] B-1 Site URL と Redirect URLs ／ B-3 Confirm email ON ／ B-5 Custom SMTP ON
- [ ] C-2 Resend Domain が Verified ／ C-4 Click Tracking Disabled
- [ ] D 規約・ポリシー確定、運営者情報記載、`TERMS_VERSION` 更新
- [ ] E `/me/settings` で「この端末で受信する」が出て通知が届く
- [ ] F-1 Calendar API 有効 ／ F-2 テストユーザー登録 ／ F-4 連携成功
- [ ] G-2 Webhook 検証成功・応答メッセージ OFF ／ G-5 「今日」に返事が来る
- [ ] H-1 Job の History が 200 ／ `?force=digest` で JSON が返る
- [ ] H-2 運営ログイン、主催者コード発行
- [ ] H-3 の 14 項目がすべて期待結果どおり
- [ ] H-4 の案内文を β 参加劇団へ送付
