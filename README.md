# 🎫 PUZZLIAR チケット販売管理システム

小劇場の演劇公演向けチケット販売管理システム。指定席+自由席の混合販売、キャスト「扱い」管理とギャランティ連動、キャストによるゲスト予約、QRチェックインを提供する。

- 要件定義: [docs/requirements.md](docs/requirements.md)(v1.1)
- ドメインモデル・DB設計: [docs/domain-model.md](docs/domain-model.md)
- 稽古・シフト管理 要件定義(質問事項つき): [docs/rehearsal-requirements.md](docs/rehearsal-requirements.md)(v0.1)
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

### 稽古・シフト管理(`rh_` テーブル群)

| パス | 対象 | 内容 |
|---|---|---|
| `/admin/rehearsal` | 主催 | プロダクション・メンバー(公演横断)の管理 |
| `/admin/rehearsal/p/[id]` | 主催 | シーン進捗(未消化シーン)、稽古枠/本番シフトの作成(参加可否チェック付き) |
| `/admin/rehearsal/p/[id]/s/[sessionId]` | 主催 | 召集・出欠・実施シーン記録・代役募集 |
| `/admin/rehearsal/availability` | 主催 | 週間の空き時間マトリクス |
| `/me` | キャスト・スタッフ | 今日/今週の予定(全公演横断)、出欠回答、代役応募、空き時間登録、LINE連携、カレンダー購読URL |
| `/api/ical/[token]` | Googleカレンダー等 | 個人用 iCal フィード |
| `/api/google/connect` `/api/google/callback` | Google | Calendar API 連携(OAuth)。召集の即時同期と空き時間の自動取り込み |
| `/api/line/webhook` | LINE | Messaging API Webhook(「今日」「参加」「入れます」等に応答) |
| `/api/cron/rehearsal-notify` | スケジューラ | 毎朝の予定配信・前日リマインド |

## 開発

```bash
cp .env.example .env.local   # 値を設定
npm install
npm run dev
```

DBスキーマは Supabase のマイグレーション(`ticket_system_initial_schema` ほか)として適用済み。
