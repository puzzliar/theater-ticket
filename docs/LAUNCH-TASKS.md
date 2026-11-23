# ZAGUMIスケジュール 公開までの残タスク（運営者向け・2026-11-02 時点）

> コードは全機能が `main` にマージ済み。残りは「決める」「外部サービスを設定する」「本番相当の環境で確認する」の 3 種類で、すべて運営者（あなた）の手作業。各ステップの画面操作の詳細は `docs/GO-LIVE-REHEARSAL.md` の該当節（A-2 など）を参照。
>
> Claude 側で先に済ませたもの: Supabase のセキュリティ/パフォーマンス警告の解消（`supabase/migrations/20261102010000_security_performance_hardening.sql`、適用済み）。

## 進め方の全体像

| 順 | ステップ | 所要 | 待ち時間 | 前提 |
|---|---|---|---|---|
| 1 | 決める（ドメイン・メール・β範囲） | 30 分 | 商標調査・ドメイン取得 | なし |
| 2 | Vercel に `zagumi-schedule` と `zagumi-shift` を作る | 45 分 | DNS 反映 数分〜数時間 | 1 |
| 3 | Supabase Auth を設定する | 20 分 | なし | 1 |
| 4 | Resend を設定する | 30 分 | DNS 反映 | 1 |
| 5 | Google Cloud（カレンダー連携） | 40 分 | **審査 1〜6 週間** | 1、3 |
| 6 | LINE Developers | 30 分 | なし | 2 |
| 7 | Web プッシュ鍵・スケジューラ・運営アカウント | 30 分 | なし | 2 |
| 8 | 規約・プライバシー・運営者情報 | 法務次第 | 法務レビュー | 1 |
| 9 | 動作確認（H-3 / H-3b / 画面の目視） | 2〜3 時間 | なし | 2〜7 |
| 10 | β 開始 → 一般公開 | 30 分 | 5 の審査承認 | 9 |

**最短ルート**: 1 → 2 → 3 → 4 → 7 → 9（この時点で招待制 β を始められる）。5・6・8 は並行して進め、5 の審査が承認されたら 10 へ。

---

## ステップ 1. 決める

- [x] **1-1 ドメイン（決定: `zagumi.app`、2026-11-23）**。`zagumi.jp` `.com` `.net` は他者が取得済みだった。構成はルート `zagumi.app`＝ブランドのトップ、`schedule.zagumi.app`＝ZAGUMIスケジュール、`shift.zagumi.app`＝ZAGUMIシフト、`ticket.zagumi.app`＝ZAGUMIチケット。
  1. **購入（あなた）**: https://vercel.com/puzzliars-projects/~/domains → **Buy** → `zagumi.app`（初年度 $9.99、更新 $15/年、Auto-renew ON）→ 連絡先を入力 → **Purchase**（GO-LIVE A-0）
  1b. 購入後は Claude に伝える。Vercel API で `zagumi.app` / `www.` / `schedule.` / `shift.` / `ticket.` を各プロジェクトに接続し、DNS と環境変数を登録する
  2. J-PlatPat（https://www.j-platpat.inpit.go.jp/）で「ZAGUMI」「座組」を商標検索し、第 42 類（ソフトウェア提供）に同一・類似がないか確認。あれば名称を再検討
  3. 決めたドメインを以降 `schedule.zagumi.app` として使う
- [ ] **1-2 送信元メールと問い合わせ先**。送信元は `ZAGUMIスケジュール <noreply@zagumi.app>` / `ZAGUMIシフト <noreply@zagumi.app>`（Resend で `zagumi.app` を認証）。問い合わせ先は既存の `support@puzzliar.jp` のまま（新しい受信箱は不要）
- [ ] **1-3 β の範囲**。招待制で始める（`ORG_CREATION_OPEN=false`、推奨）か、最初から公開か。招待制なら参加劇団を 1〜3 団体決めておく

## ステップ 2. Vercel（手順書 A・A-2b）

ZAGUMIスケジュール・ZAGUMIシフト・ブランドのトップ（ルート）を別サービスとして配信するため、Vercel プロジェクトは `zagumi-schedule` `zagumi-shift` `zagumi-brand` の 3 つ（チケットは既存の `theater-ticket`）。どれも同じリポジトリで、`NEXT_PUBLIC_APP` と `NEXT_PUBLIC_SITE_URL`、`EMAIL_FROM` だけが異なる。**プロジェクト作成・非秘密の環境変数・ドメイン接続は Claude が Vercel API で行う**。あなたが入れるのは秘密の値（Supabase の service_role キー、Resend の API キー、Google / LINE の秘密）だけ。

- [x] **2-1** `zagumi-schedule` `zagumi-shift` `zagumi-brand` プロジェクトの作成（Claude が API で実施。GitHub `puzzliar/theater-ticket` の `main` に連動）
- [ ] **2-2** 秘密の環境変数を 3 プロジェクトに登録: `SUPABASE_SERVICE_ROLE_KEY`（Supabase → Settings → API）、`RESEND_API_KEY`（ステップ 4）。非秘密の変数（`NEXT_PUBLIC_APP`、`NEXT_PUBLIC_BRAND_DOMAIN=zagumi.app`、`NEXT_PUBLIC_SITE_URL`、Supabase URL / anon、`EMAIL_FROM`、`ORG_CREATION_OPEN` など）と `CRON_SECRET` / `GOOGLE_TOKEN_KEY` は Claude が登録済み。**既存の `theater-ticket` には `NEXT_PUBLIC_APP` を入れない**（`NEXT_PUBLIC_BRAND_DOMAIN` と `NEXT_PUBLIC_SITE_URL=https://ticket.zagumi.app` は入れる）
- [x] **2-3** `CRON_SECRET` と `GOOGLE_TOKEN_KEY` の生成と登録（Claude が実施。値は Vercel → Settings → Environment Variables で確認）
- [ ] **2-4** ドメイン購入後、Claude が `zagumi.app` `www.zagumi.app` `schedule.zagumi.app` `shift.zagumi.app` `ticket.zagumi.app` を各プロジェクトに接続（DNS は Vercel 管理なので自動）
- [ ] **2-5** 4 つのトップページを確認: `https://zagumi.app/`（ブランド）、`https://schedule.zagumi.app/`（「今日、どこに行けばいいか。」）、`https://shift.zagumi.app/`（「この回、誰が入れるか。」）、`https://ticket.zagumi.app/`（公演一覧）
- [x] **2-6** 相互転送先は `NEXT_PUBLIC_BRAND_DOMAIN` から自動で決まるので個別設定は不要

## ステップ 3. Supabase Auth（手順書 B）

ダッシュボード: https://supabase.com/dashboard/project/wiqnmebudaadwqdaxwko

- [ ] **3-1** Authentication → URL Configuration: Site URL `https://schedule.zagumi.app`、Redirect URLs に `https://schedule.zagumi.app/auth/callback`、`https://schedule.zagumi.app/**`、`https://shift.zagumi.app/auth/callback`、`https://shift.zagumi.app/**`、`https://ticket.zagumi.app/**` を追加（B-1）
- [ ] **3-2** Authentication → Providers → Google が ON であることを確認（B-2）
- [ ] **3-3** Authentication → Settings（旧 Auth → Configuration）→ **Allow manual linking** を **ON**（B-2b）。これが OFF だと「Google アカウントを追加」が失敗する
- [ ] **3-4** Confirm email を **ON**（B-3）
- [ ] **3-5** Authentication → Settings → Password → **Leaked password protection** を **ON**（アドバイザリ警告の解消。メール＋パスワード登録者の保護）
- [ ] **3-6** ステップ 4 の後に SMTP を Resend に切り替える（B-5）

## ステップ 4. Resend（手順書 C）

- [ ] **4-1** https://resend.com/signup でアカウント作成、Domains で `zagumi.app`（Region: Tokyo）を追加 → 表示された TXT/MX/CNAME を Claude に渡せば Vercel の DNS に登録する → **Verified** を確認（C-2）
- [ ] **4-2** API Keys で `zagumi-schedule` 用のキーを発行し、Vercel の `RESEND_API_KEY` に登録（C-3）
- [ ] **4-3** Domains → 該当ドメイン → **Click Tracking を OFF**（C-4）。ON のままだと認証リンクが壊れる
- [ ] **4-4** Supabase B-5 の手順でカスタム SMTP を設定（Host `smtp.resend.com`、Port 465、User `resend`、Pass＝API キー、Sender `noreply@zagumi.app`）
- [ ] **4-5** `https://schedule.zagumi.app/signup` から新しいメールで登録し、確認メールが届くことを確認（C-5）

## ステップ 5. Google Cloud（手順書 F）

- [ ] **5-1** Google Cloud Console で Calendar API を有効化（F-1）
- [ ] **5-2** OAuth 同意画面: アプリ名 `ZAGUMIスケジュール`、サポートメール、承認済みドメイン `zagumi.app`、プライバシーポリシー `https://schedule.zagumi.app/privacy`、スコープ `calendar.events`、テストユーザーにあなたと β 参加者のメールを追加（F-2）
- [ ] **5-3** OAuth クライアント（ウェブ）作成: リダイレクト URI `https://schedule.zagumi.app/api/google/callback` と `https://shift.zagumi.app/api/google/callback`。Client ID / Secret を Vercel の `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` に登録（F-3）
- [ ] **5-4** 再デプロイ後、`/me/settings` で出演者用・主催者用それぞれ「Google カレンダーと連携」が成功することを確認（F-4）
- [ ] **5-5** 一般公開前に審査を申請（F-5）。Search Console でドメイン所有権確認 → 同意画面の「アプリを公開」→ 審査。承認まで 1〜6 週間。テストユーザー 100 人までは審査前でも使える

## ステップ 6. LINE Developers（手順書 G）

- [ ] **6-1** プロバイダー `PUZZLIAR` を作成（G-1）
- [ ] **6-2** Messaging API チャネル作成。Webhook URL `https://schedule.zagumi.app/api/line/webhook`、Webhook を ON、**応答メッセージを OFF**、あいさつメッセージ OFF（G-2）。Channel secret / アクセストークンを Vercel の `LINE_CHANNEL_SECRET` / `LINE_CHANNEL_ACCESS_TOKEN`、友だち追加 URL を `LINE_ADD_FRIEND_URL` に登録
- [ ] **6-2b** ZAGUMIシフト用にもう 1 つ Messaging API チャネルを**同じプロバイダーの下**に作り（Webhook `https://shift.zagumi.app/api/line/webhook`）、`zagumi-shift` プロジェクトに同様に登録。同じプロバイダーなら LINE 連携は一度で両サービスに効く
- [ ] **6-3** （任意）LINE ログインチャネルを作り `LINE_LOGIN_CHANNEL_ID` / `LINE_LOGIN_CHANNEL_SECRET` / `NEXT_PUBLIC_LINE_LOGIN_ENABLED=true` を登録。コールバック `https://schedule.zagumi.app/auth/line/callback`（G-3）
- [ ] **6-4** 料金プラン（コミュニケーションプラン 200 通/月）を確認し `LINE_PUSH_MONTHLY_LIMIT` を合わせる（G-4）
- [ ] **6-5** 公式アカウントを友だち追加 → `/me/settings` で連携 → LINE で「今日」と送り返事が来ることを確認（G-5）

## ステップ 7. プッシュ鍵・スケジューラ・運営アカウント（手順書 E・H-1・H-2）

- [ ] **7-1** ターミナルで `npx web-push generate-vapid-keys` → `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT=mailto:support@puzzliar.jp` を Vercel に登録（E）
- [ ] **7-2** cron-job.org で `https://schedule.zagumi.app/api/cron/rehearsal-notify` と `https://shift.zagumi.app/api/cron/rehearsal-notify` をそれぞれ **15 分おき**、ヘッダー `Authorization: Bearer <CRON_SECRET>` で作成し、Execute now で 200 を確認（H-1）
- [ ] **7-3** チケット側のリマインド `https://ticket.zagumi.app/api/cron/send-reminders`（10 分おき）が未登録なら同様に作る
- [ ] **7-4** 運営アカウントでログインし `/platform` から主催者コードを発行（H-2）。既存コード `PZ-30AFB903` は 2026-12-21 まで有効
- [ ] **7-5** 環境変数をすべて入れ終えたら Vercel で最後に **Redeploy**

## ステップ 8. 規約・プライバシー・運営者情報（手順書 D）

- [ ] **8-1** `https://schedule.zagumi.app/terms` と `/privacy` を PDF にして法務レビュー（論点: 無料提供と将来の有料化、空き時間の組織間共有、退会時の匿名化、Google ユーザーデータの限定的使用）
- [ ] **8-2** 修正を `src/app/terms/page.tsx` / `src/app/privacy/page.tsx` に反映（GitHub 上で編集 → main にコミット）。修正文面を渡してもらえれば Claude 側で反映できる
- [ ] **8-3** プライバシーポリシー 7 項に運営者名・所在地（市区町村まで）・問い合わせ先を記載
- [ ] **8-4** `src/lib/core/types.ts` の `TERMS_VERSION` / `PRIVACY_VERSION` を確定日に更新（再同意が必要になるので β 開始前に）

## ステップ 9. 動作確認（手順書 H-3・H-3b）

ログイン後の画面は開発環境で一度も目視できていない（サンドボックスに Supabase キーがないため）。本番相当の環境で、運営アカウント A と β 参加者役 B（別ブラウザ）で以下を実施する。

- [ ] **9-1** H-3 の 14 項目（座組作成、招待、参加、日程登録、回答、代役募集、通知、カレンダー同期、退会など）
- [ ] **9-2** H-3b の 16 項目（セルフ公演、日程テキスト取り込み、空き状況テキスト＋LINE 共有、仮押さえと重複警告、公式サイト `/<ハンドル>`、公演の引き渡し、主催者/出演者モード切替、Google アカウント追加、ZAGUMIシフトのドメインでのシフト組み、LINE からのシフト希望回答）
- [ ] **9-3** 画面の目視: 両サービスの `/me`、`/manage`、サイドバー、シフト表（シフト側）、`/me/settings` を PC とスマホ幅で確認し、文字の読みにくさ・崩れがあれば Claude にスクリーンショットを渡す
- [ ] **9-4** 問題があれば Claude に報告 → 修正 → 再確認

## ステップ 10. β 開始と一般公開（手順書 H-4・I）

- [ ] **10-1** β 参加劇団に案内文（H-4）と主催者コードを送付
- [ ] **10-2** 1〜2 週間運用し、J-1 の「見るところ」（Vercel Logs、Supabase Auth Logs、Resend Logs、cron-job History）を週 1 で確認
- [ ] **10-3** Google 審査承認後: 同意画面を本番公開、Vercel の `ORG_CREATION_OPEN=true` → Redeploy、トップページの「クローズド β」段落を削除（I-1〜3。段落削除は Claude に依頼可）
- [ ] **10-4** LINE プラン・Resend 上限・Supabase Rate Limits を利用者数に合わせる（I-4〜5）
- [ ] **10-5** トップページと `/privacy` に問い合わせ先が載っていることを最終確認（I-6）

---

## Claude 側で対応済み・対応可能なもの

**対応済み（2026-11-02 / 11-10）**
- ZAGUMIシフトをスケジュールから分離（3 つ目の配信モード）。LINE の「希望」「入れる N」コマンド、サービス別のタブアイコン
- Supabase セキュリティ警告: トリガー関数と RLS 補助関数の匿名実行を遮断、4 関数の `search_path` 固定、集計ビューを `security_invoker` に変更
- Supabase パフォーマンス警告: `rh_` / `core_` テーブルの外部キー 24 本にインデックス追加、RLS ポリシー 14 件の `auth.uid()` を `(select auth.uid())` に書き換え

**依頼があれば対応するもの**
- 規約・プライバシーの修正文面の反映、`TERMS_VERSION` 更新（ステップ 8）
- β 終了時のトップページ文言変更（ステップ 10-3）
- 動作確認で見つかった不具合の修正
- 残っているアドバイザリ（チケット側の RLS 補助関数 `tk_app_role` 等の匿名実行、`btree_gist` 拡張の public スキーマ配置、重複 permissive ポリシーの統合）。いずれも公開を止める内容ではない
- 任意機能: 公式サイトのテーマ・独自ドメイン
