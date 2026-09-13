# 🎫 PUZZLIAR チケット販売管理システム

小劇場の演劇公演向けチケット販売管理システム。指定席+自由席の混合販売、キャスト「扱い」管理とギャランティ連動、キャストによるゲスト予約、QRチェックインを提供する。

- 要件定義: [docs/requirements.md](docs/requirements.md)(v1.1)
- ドメインモデル・DB設計: [docs/domain-model.md](docs/domain-model.md)
- 稽古・シフト管理 要件定義(質問事項つき): [docs/rehearsal-requirements.md](docs/rehearsal-requirements.md)(v0.2: 多主催者向け無料 SaaS 化)
- 共通アカウント基盤(PUZZLIAR ID)設計案: [docs/account-platform.md](docs/account-platform.md)
- デプロイ手順: [docs/DEPLOY.md](docs/DEPLOY.md)

## 技術スタック

- Next.js (App Router) + TypeScript + Tailwind CSS
- Supabase (PostgreSQL + RLS + Auth) — 物販システム群と同一プロジェクト共有(`tk_` プレフィックス)
- Stripe Checkout(未設定時はモック決済モード)
- Resend(メール送信・任意)/ Vercel Cron(開演前リマインド)

## 主な画面

| パス | 対象 | 内容 |
|---|---|---|
| `/` `/e/[eventId]` | 購入者 | 公演一覧・ステージ選択・購入(座席選択/扱い選択/決済) |
| `/my/[token]` | 購入者 | チケット表示(QR)・未決済分の支払い |
| `/admin` | 主催 | 公演/座席/キャスト/扱いルール管理・売上集計・CSV |
| `/cast` | キャスト | 自分の扱い売上・ギャラ見込み・ゲスト予約起票 |
| `/reception` | 受付 | QR照合チェックイン・当日現金収受 |

### 稽古・シフト管理(無料・多主催者向け。`core_` 共通アカウント基盤 + `rh_`)

| パス | 対象 | 内容 |
|---|---|---|
| `/rehearsal` `/signup` `/login` `/onboarding` | 全員 | 紹介・登録(メール/Google/LINE)・初回設定 |
| `/me` `/me/settings` | 本人 | 全組織横断の予定、出欠、代役応募、空き時間、通知設定、LINE/Google 連携、Web プッシュ、iCal、退会 |
| `/orgs/new` `/join/[token]` | 主催者・招待された人 | 組織作成(招待制)・招待リンクの受諾 |
| `/o/[slug]` 以下 | 組織 | プロダクション、シーン進捗、稽古枠(参加可否チェック)、出欠・実施記録、代役募集、空き時間マトリクス、メンバー・招待・参加者台帳 |
| `/platform` | 運営 | 主催者コード発行、組織管理 |
| `/api/ical/[token]` `/api/google/*` `/api/line/webhook` `/api/push/subscribe` `/api/cron/rehearsal-notify` | 連携 | iCal、Google Calendar API、LINE Messaging API、Web プッシュ、定時通知 |

## 開発

```bash
cp .env.example .env.local   # 値を設定
npm install
npm run dev
```

DBスキーマは Supabase のマイグレーション(`ticket_system_initial_schema` ほか)として適用済み。
