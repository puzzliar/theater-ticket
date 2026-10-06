# ZAGUMI ブランド(ロゴ)

生成元: ロゴは `public/brand/` に SVG で置く。手で描いたものではなく、座標から生成しているので、太さや配色を変えるときは生成スクリプトの数値を変えて作り直す(`docs/brand-gen.mjs`。リポジトリ直下で `node docs/brand-gen.mjs` を実行すると `public/brand/` と `src/app/icon.svg` を書き換える)。

## コンセプト

- **座組マーク**: 円状に座る 8 つの点が「座組」(出演者とスタッフの全体)。その 4 点を一筆で結ぶ線が **Z**(ZAGUMI)で、「人と人をつなぐ予定表」を表す。真上の琥珀色の点が「あなた」。時計の文字盤にも見え、スケジュールの含みを持たせている
- **ワードマーク**: 線だけで組んだ幾何学的な大文字。丸い線端で柔らかく、裏方の道具らしい実用感を残す
- **色**: 墨 `#121212`、琥珀 `#F5A524`(アプリのアクセント amber と同系)、紙 `#FFFFFF`。暗い背景では墨を白に置き換える

## サービスごとの琥珀の点

円周の 8 つの点のうち、琥珀色にする位置でサービスを表す。真上がブランド(ZAGUMI 全体・アカウント)、以降は時計回りに割り当てる。8 サービスを超える場合はロゴ自体を見直す。

| 位置(真上を 0、時計回り) | 用途 | ファイル |
|---|---|---|
| 0(真上) | ZAGUMI ブランド、ZAGUMIアカウント、アプリアイコン | `zagumi-logo.svg`、`zagumi-mark.svg`、`zagumi-icon.svg` |
| 1(右上) | ZAGUMIスケジュール | `zagumi-schedule*.svg` |
| 2(右) | ZAGUMIチケット | `zagumi-ticket*.svg` |
| 3(右下) | ZAGUMI物販 | `zagumi-goods*.svg` |
| 4(真下) | ZAGUMI精算 | `zagumi-pay*.svg` |
| 5〜7 | 予備 | |

割り当ては `docs/brand-gen.mjs` の `SERVICE_DOT` が正。

## ファイル

| ファイル | 用途 |
|---|---|
| `zagumi-logo.svg` / `zagumi-logo-white.svg` | 基本ロゴ(横組み)。明るい背景用 / 暗い背景用 |
| `zagumi-mark.svg` / `-white` / `-mono` | シンボル単体。SNS アイコン、小さい表示、単色印刷 |
| `zagumi-wordmark.svg` | 文字のみ |
| `zagumi-icon.svg` | アプリアイコン(琥珀の角丸に墨のマーク)。`src/app/icon.svg` と同じ |
| `zagumi-schedule.svg` 等 | サービス名つき(スケジュール・チケット・物販・精算)。`-white` は暗い背景用、`-mark` はそのサービスの点位置のシンボル単体 |
| `preview.png` | 一覧プレビュー |

## 使い方の決まり

- マークの周囲には、マークの高さの 1/4 以上の余白を取る
- 最小サイズ: マーク単体 16px、横組みロゴ 120px 幅
- 色は上記 3 色のみ。グラデーション・影・変形(縦横比の変更、回転)はしない
- サービス名の文字はシステムの日本語フォントで描かれる。印刷物など字形を固定したい場合はアウトライン化した版を別途作る

## 画面の配色トークン(アプリ UI)

国内の業務 SaaS(SmartHR、freee、note など)に倣った**白基調**。`src/app/globals.css` の `@theme` で定義し、Tailwind のユーティリティ(`bg-surface`、`text-muted` など)として使う。素の `neutral-*` は使わない。

| トークン | 値 | 用途 |
|---|---|---|
| `bg` | `#f7f6f3` | ページ背景(紙のような暖色寄りの薄いグレー) |
| `surface` / `surface-2` / `surface-3` | `#ffffff` / `#f3f2ee` / `#e9e7e1` | カード／入力欄・ホバー／二次ボタン |
| `line` / `line-strong` | `#e6e4de` / `#cfccc4` | 罫線／入力欄の枠 |
| `fg` / `fg-2` / `muted` / `dim` | `#23221f` / `#4a4845` / `#6f6c66` / `#9c9890` | 本文／二次／補足／控えめ |
| `accent` / `accent-hover` | `#f5a524` / `#e9981a` | 主ボタンの面(文字は `accent-ink`) |
| `accent-text` | `#a35f00` | 文字・リンクとしての琥珀(白地でのコントラスト確保) |
| `accent-soft` / `accent-ink` | `#fff1d6` / `#1a1200` | 淡い強調の面／主ボタン上の文字 |

- 意味色(成功・警告・エラー・種別)は Tailwind の 600〜700 番台を文字に、50〜500/10 を面に使う
- 角丸: 入力欄・ボタン `rounded-lg`、カード `rounded-xl`〜`rounded-2xl`。影はカードに `shadow-card`、主要 CTA に `shadow-pop`
- フォント: Inter + Noto Sans JP(Google Fonts。未読込時はシステムフォント)
- レイアウト: ログイン後はサイドバー(デスクトップ)／下部タブ(モバイル)の `src/app/(app)/layout.tsx`。公開ページは `src/app/(public)/layout.tsx`
- ロゴは墨版(`zagumi-*.svg`)を使う。暗い面に置く場合のみ `-white`
