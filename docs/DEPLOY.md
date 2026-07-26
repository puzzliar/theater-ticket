# 🚀 デプロイ手順(Vercel + ticket.puzzliar.jp)

本アプリを `puzzliar.jp` 配下(推奨: `ticket.puzzliar.jp`)で公開するための手順。
コード側の準備(ビルド確認・Cron設定・環境変数テンプレート)は完了済み。以下の3ステップで公開できます。

## Step 1. Vercel プロジェクト作成(約3分)

1. https://vercel.com/new を開き、GitHubリポジトリ `puzzliar/theater-ticket` をImport
   (Vercel GitHub Appはリポジトリにインストール済み)
2. Framework: **Next.js**(自動検出)、Root Directory: そのまま(リポジトリ直下)
3. **Environment Variables** に以下を設定:

| 変数 | 値 | 備考 |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://wiqnmebudaadwqdaxwko.supabase.co` | 共有Supabase(puzzliar's Project) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase Dashboard → Settings → API Keys → `anon` `public` | 公開可のキー |
| `SUPABASE_SERVICE_ROLE_KEY` | 同画面の `service_role` | **秘匿**。サーバー専用 |
| `NEXT_PUBLIC_SITE_URL` | `https://ticket.puzzliar.jp` | |
| `STRIPE_SECRET_KEY` | (任意)Stripeの `sk_live_...` または `sk_test_...` | **未設定の間はモック決済モード**(実課金なしで即確定。動作確認向け) |
| `STRIPE_WEBHOOK_SECRET` | (任意)Step 3参照 | |
| `RESEND_API_KEY` | (任意)Resendキー | 未設定の間はメール送信スキップ |
| `EMAIL_FROM` | `PUZZLIAR チケット <tickets@puzzliar.jp>` | Resend側でドメイン認証が必要 |
| `CRON_SECRET` | 任意のランダム文字列 | Cron保護(Vercelが自動でヘッダ付与) |

4. Deploy を実行

## Step 2. ドメイン設定(約2分 + DNS反映待ち)

1. Vercel プロジェクト → Settings → Domains → `ticket.puzzliar.jp` を追加
2. puzzliar.jp のDNS管理画面(お名前.com / Cloudflare等)で以下を追加:

```
種別: CNAME
ホスト名: ticket
値: cname.vercel-dns.com
```

3. Vercel側の検証が通れば `https://ticket.puzzliar.jp` で公開(SSL自動)

※ apexの `puzzliar.jp` 本体は既存サイトのまま。チケットはサブドメイン運用が安全です。

## Step 3. Stripe 本番決済の有効化(実売開始時)

1. Stripe ダッシュボード → Developers → API keys から `sk_...` を取得し、Vercelの `STRIPE_SECRET_KEY` に設定
2. Developers → Webhooks → Add endpoint:
   - URL: `https://ticket.puzzliar.jp/api/stripe/webhook`
   - イベント: `checkout.session.completed`
3. 表示される Signing secret (`whsec_...`) を `STRIPE_WEBHOOK_SECRET` に設定して再デプロイ

> ⚠️ **モック決済モードについて**: `STRIPE_SECRET_KEY` 未設定の間、購入フローは「テスト決済」として課金なしで確定します(画面に明示されます)。実売前に必ずStripeキーを設定し、デモ公演を非公開にしてください。

## 初期アカウント・デモデータ(設定済み)

- **管理者ログイン**: `https://ticket.puzzliar.jp/login`
  - メール: `harbingerstar@gmail.com` ／ 初期パスワード: 別途共有(チャット参照)。ログイン後の変更を推奨
  - ログインできない場合: Supabase Dashboard → Authentication → Users → 該当ユーザー → Reset password
- **デモ公演『星の航路』**が公開状態で入っています(指定席16席 + 自由席40枚、キャスト2名・扱いルール設定済み)。動作確認後、管理画面から非公開にしてください
- キャスト・受付スタッフのアカウントは管理画面(/admin)の「アカウント発行」から作成できます

## 動作確認チェックリスト

1. トップ → デモ公演 → ステージ選択 → 指定席を座席図から選択 + 自由席枚数選択 → 扱い(キャスト)選択 → 購入 → チケットページにQRが表示される
2. キャスト個別URL(`/e/<eventId>?c=hoshino`)から購入 → 扱いが自動設定される
3. /admin で売上サマリ(扱い別・ギャラ見込み)に反映されている
4. キャストアカウントで /cast → 自分の売上のみ表示・ゲスト予約起票(当日現金)ができる
5. 受付アカウントで /reception → 該当ステージ → 未収の収受・チェックインができる
6. CSVエクスポートが取得できる

## 運用メモ

- **DB**: 共有Supabaseプロジェクト(`wiqnmebudaadwqdaxwko`)に `tk_` プレフィックスで同居(物販システムと同一基盤・共通Auth方針)
- **契約ビュー**: 事前物販OSは `tk_ticket_sales_by_cast_v1` のみ参照可(ギャラ合算連携用)
- **リマインドメール**: Vercel Cron(10分毎)が開演55〜75分前の注文にQRページURLを送付(`RESEND_API_KEY` 設定時のみ)
- **期限切れ仮押さえ**: ページアクセス時に随時クリーンアップ(35分で失効)
