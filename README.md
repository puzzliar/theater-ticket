# ZAGUMI — 🎭 ZAGUMIスケジュール / 🎫 ZAGUMIチケット

小劇場向けブランド **ZAGUMI**（座組）の 2 つのサービスを 1 つのリポジトリで開発している。運営は PUZZLIAR。**アカウント（ZAGUMIアカウント）は共通（同じ Supabase Auth・`core_` 基盤）だが、サービスとしては独立**しており、別ドメイン・別 Vercel プロジェクトで配信する。環境変数 `NEXT_PUBLIC_APP` でどちらとしてビルドするかを切り替える（`rehearsal`＝稽古管理、未設定＝チケット販売）。

- **ZAGUMIチケット**: 指定席+自由席の混合販売、キャスト「扱い」管理とギャランティ連動、キャストによるゲスト予約、QRチェックイン
- **ZAGUMIスケジュール**（無料・多主催者向け）: 稽古・本番の予定の召集と出欠、セルフ公演(主催者未登録でも使える)、空き状況の ○×△ 共有、仮押さえ、キャスト公式サイト、シーン進捗、空き時間、代役募集、Google カレンダー／LINE 連携

- 要件定義: [docs/requirements.md](docs/requirements.md)(v1.1)
- ドメインモデル・DB設計: [docs/domain-model.md](docs/domain-model.md)
- 稽古・シフト管理 要件定義(質問事項つき): [docs/rehearsal-requirements.md](docs/rehearsal-requirements.md)(v0.2: 多主催者向け無料 SaaS 化)
- 共通アカウント基盤(ZAGUMIアカウント)設計案: [docs/account-platform.md](docs/account-platform.md)
- 稽古管理 運用開始手順書: [docs/GO-LIVE-REHEARSAL.md](docs/GO-LIVE-REHEARSAL.md)
- デプロイ手順: [docs/DEPLOY.md](docs/DEPLOY.md)

## 技術スタック

- Next.js (App Router) + TypeScript + Tailwind CSS
- Supabase (PostgreSQL + RLS + Auth) — 物販システム群と同一プロジェクト共有(`tk_` プレフィックス)
- Stripe Checkout(未設定時はモック決済モード)
- Resend(メール送信・任意)/ Vercel Cron(開演前リマインド)

## 主な画面

`src/proxy.ts` が配信中のサービスに属さないパスを遮断する（API は 404、画面はトップへ転送）。`/login` `/auth/callback` `/terms` `/privacy` は両サービス共通。

### ZAGUMIチケット（`NEXT_PUBLIC_APP` 未設定。`tk_`）

| パス | 対象 | 内容 |
|---|---|---|
| `/` `/e/[eventId]` | 購入者 | 公演一覧・ステージ選択・購入(座席選択/扱い選択/決済) |
| `/my/[token]` | 購入者 | チケット表示(QR)・未決済分の支払い |
| `/admin` | 主催 | 公演/座席/キャスト/扱いルール管理・売上集計・CSV |
| `/cast` | キャスト | 自分の扱い売上・ギャラ見込み・ゲスト予約起票 |
| `/reception` | 受付 | QR照合チェックイン・当日現金収受 |

### ZAGUMIスケジュール（`NEXT_PUBLIC_APP=rehearsal`。無料・多主催者向け。`core_` 共通アカウント基盤 + `rh_`）

| パス | 対象 | 内容 |
|---|---|---|
| `/` `/signup` `/login` `/onboarding` | 全員 | 独立したトップページ(サービス紹介)・登録(メール/Google/LINE)・初回設定 |
| `/me` `/me/settings` | 本人 | 全組織横断の予定、出欠、代役応募、空き時間、通知設定、LINE/Google 連携、Web プッシュ、iCal、退会 |
| `/orgs/new` `/join/[token]` | 主催者・招待された人 | 組織作成(招待制)・招待リンクの受諾 |
| `/o/[slug]` 以下 | 組織 | プロダクション、シーン進捗、予定(稽古・本番。参加可否チェック)、出欠・実施記録、代役募集、空き時間マトリクス、メンバー・招待・参加者台帳 |
| `/platform` | 運営 | 主催者コード発行、組織管理 |
| `/me/availability` `/a/[token]` | 本人・主催者 | 空き状況の ○×△ テキスト(コピー/LINE で送る)と共有リンク |
| `/me/site` `/[handle]` | 本人・公開 | キャスト公式サイト(出演履歴・近日の出演・写真・リンク) |
| `/o/[slug]/p/[id]/import` `/handover/[token]` | 管理者・主催者 | 日程テキストの取り込み、セルフ公演の主催者への引き渡し |
| `/api/ical/[token]` `/api/google/*` `/api/line/webhook` `/api/push/subscribe` `/api/cron/rehearsal-notify` | 連携 | iCal、Google Calendar API、LINE Messaging API、Web プッシュ、定時通知 |

## 開発

```bash
cp .env.example .env.local   # 値を設定
npm install
npm run dev
```

DBスキーマは Supabase のマイグレーション(`ticket_system_initial_schema` ほか)として適用済み。
