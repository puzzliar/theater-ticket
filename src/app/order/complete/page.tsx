import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function OrderCompletePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; mock?: string }>;
}) {
  const { token, mock } = await searchParams;
  return (
    <div className="mx-auto max-w-lg space-y-6 text-center">
      <div className="text-5xl">🎉</div>
      <h1 className="text-2xl font-bold">ご購入ありがとうございます</h1>
      {mock && (
        <p className="rounded-lg border border-yellow-700 bg-yellow-900/30 p-3 text-sm text-yellow-300">
          テスト決済モードで確定しました(Stripe未設定のため実際の課金は発生していません)
        </p>
      )}
      <p className="text-fg-2">
        チケット(QRコード)は以下のページからいつでも表示できます。当日は受付でQRコードをご提示ください。
        メールアドレス宛にもご案内をお送りしています。
      </p>
      {token && (
        <Link
          href={`/my/${token}`}
          className="inline-block rounded-lg bg-accent px-6 py-3 font-semibold text-accent-ink hover:bg-accent-hover"
        >
          チケットを表示する
        </Link>
      )}
      <p className="text-xs text-dim">
        このページのURLは第三者に共有しないでください。
      </p>
    </div>
  );
}
