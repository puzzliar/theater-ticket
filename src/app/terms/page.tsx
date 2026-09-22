import { TERMS_VERSION } from "@/lib/core/types";

// 利用規約(ドラフト)。公開前に法務レビューを受けること
export default function TermsPage() {
  return (
    <article className="prose prose-invert max-w-none space-y-4 text-sm leading-relaxed text-neutral-200">
      <h1 className="text-2xl font-bold">利用規約</h1>
      <p className="text-xs text-neutral-500">版: {TERMS_VERSION}（ドラフト）</p>
      <p>本規約は、PUZZLIAR（以下「当社」）が提供する稽古・シフト管理サービスおよび共通アカウント（以下「本サービス」）の利用条件を定めるものです。</p>
      <h2 className="text-lg font-semibold">1. アカウント</h2>
      <p>利用者は正確な情報でアカウントを登録し、認証情報を自己の責任で管理します。1 人につき 1 アカウントとし、複数の団体に所属できます。</p>
      <h2 className="text-lg font-semibold">2. 団体（組織）と権限</h2>
      <p>団体を作成した利用者はオーナーとして、団体内のデータと参加者の管理に責任を負います。管理者は招待・召集・出欠記録などの操作を行えます。団体間でデータは共有されません。</p>
      <h2 className="text-lg font-semibold">3. 空き時間の共有</h2>
      <p>利用者が登録した空き時間および外部カレンダーから取り込んだ「予定あり」の情報は、利用者が所属するすべての団体の管理者に対し、稽古枠ごとの「参加可／不可／他現場／未回答」という判定結果としてのみ提示されます。予定の内容や他団体の名称は提示されません。</p>
      <h2 className="text-lg font-semibold">4. 料金</h2>
      <p>本サービスの基本機能は無料で提供します。将来、有料の追加機能を提供する場合は事前に告知し、無料の基本機能は継続します。</p>
      <h2 className="text-lg font-semibold">5. 通知</h2>
      <p>当社は、稽古の召集・変更・中止・代役募集などをメール、プッシュ通知、LINE で送信します。通知の到達は保証されません。重要な連絡は団体内で別途確認してください。</p>
      <h2 className="text-lg font-semibold">6. 禁止事項</h2>
      <p>他者へのなりすまし、無関係な人への招待の乱用、本サービスの運営を妨げる行為、法令または公序良俗に反する行為を禁止します。違反した場合、当社はアカウントまたは団体の利用を停止できます。</p>
      <h2 className="text-lg font-semibold">7. 免責</h2>
      <p>本サービスは現状有姿で提供され、可用性や正確性を保証しません。本サービスの利用または利用不能によって生じた損害について、当社は故意または重過失がある場合を除き責任を負いません。</p>
      <h2 className="text-lg font-semibold">8. 退会とデータ</h2>
      <p>利用者はいつでも退会できます。退会時、個人データは削除され、団体の記録上は「退会済みユーザー」として匿名化されます。団体のデータは団体が削除するまで保持されます。</p>
      <h2 className="text-lg font-semibold">9. 規約の変更</h2>
      <p>当社は本規約を変更することがあります。重要な変更は本サービス上で告知し、再同意を求めることがあります。</p>
      <h2 className="text-lg font-semibold">10. 準拠法・管轄</h2>
      <p>本規約は日本法に準拠し、本サービスに関する紛争は当社所在地を管轄する裁判所を第一審の専属的合意管轄裁判所とします。</p>
    </article>
  );
}
