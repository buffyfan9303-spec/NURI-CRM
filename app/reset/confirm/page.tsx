import { ResetConfirmClient } from "./ResetConfirmClient";

export default function ResetConfirmPage({
  searchParams,
}: {
  searchParams: { code?: string };
}) {
  return <ResetConfirmClient code={searchParams.code ?? null} />;
}
