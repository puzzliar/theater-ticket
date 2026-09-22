import { PRIVACY_VERSION } from "@/lib/core/types";

// プライバシーポリシー(ドラフト)。Google API サービスのユーザーデータポリシー(限定的使用)への言及を含む。公開前に法務レビューを受けること
export default function PrivacyPage() {
  return (
    <article className="max-w-none space-y-4 text-sm leading-relaxed text-neutral-200">
      <h1 className="text-2xl font-bold">プライバシーポリシー</h1>
      <p className="text-xs text-neutral-500">版: {PRIVACY_VERSION}（ドラフト）</p>
      <h2 className="text-lg font-semibold">1. 取得する情報</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>アカウント情報: メールアドレス、表示名、ログインに使用した外部サービス（Google、LINE）の識別子</li>
        <li>稽古管理の利用情報: 所属する団体、召集への出欠、出席記録、登録した空き時間</li>
        <li>LINE 連携時: LINE のユーザー ID（通知の送信と、LINE からの問い合わせへの応答に使用）</li>
        <li>Google カレンダー連携時: Google アカウントのメールアドレス、カレンダーへのアクセストークン（暗号化して保存）、および「予定あり」の時間帯（予定の内容は取得しません）</li>
        <li>プッシュ通知の購読情報、アクセスログ</li>
      </ul>
      <h2 className="text-lg font-semibold">2. 利用目的</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>本サービスの提供（予定の表示、召集・出欠の管理、通知の送信）</li>
        <li>所属する団体の管理者への参加可否判定の提示（判定結果のみ。予定の内容や他団体の名称は提示しません）</li>
        <li>同意をいただいた場合に限り、PUZZLIAR の関連サービス（チケット販売・物販管理など）のご案内</li>
        <li>不正利用の防止、問い合わせ対応、サービスの改善</li>
      </ul>
      <h2 className="text-lg font-semibold">3. Google ユーザーデータの取り扱い</h2>
      <p>本サービスによる Google API から取得した情報の使用は、限定的使用の要件を含む Google API サービスのユーザーデータに関するポリシーに準拠します。カレンダーへのアクセスは、稽古予定の登録・更新・削除と、空き時間判定のための「予定あり」時間帯の取得にのみ使用し、それ以外の目的で使用したり第三者に提供したりしません。連携はいつでも解除でき、解除時に本サービスが登録した予定は削除され、トークンは失効させます。</p>
      <h2 className="text-lg font-semibold">4. 第三者提供・委託</h2>
      <p>法令に基づく場合を除き、本人の同意なく第三者に個人情報を提供しません。データの保管・通知の送信のため、Supabase、Vercel、LINE、Google、メール配信事業者に処理を委託します。</p>
      <h2 className="text-lg font-semibold">5. 保存期間と削除</h2>
      <p>個人データは退会時に削除し、団体の記録上は匿名化します。連携情報は連携解除時に削除します。</p>
      <h2 className="text-lg font-semibold">6. 安全管理</h2>
      <p>通信の暗号化、データベースの行レベルアクセス制御、外部サービスのトークンの暗号化保存などの措置を講じます。</p>
      <h2 className="text-lg font-semibold">7. お問い合わせ</h2>
      <p>個人情報の開示・訂正・削除のご請求やお問い合わせは、運営者（PUZZLIAR）までご連絡ください。</p>
    </article>
  );
}
