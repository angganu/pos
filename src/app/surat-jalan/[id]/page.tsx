import SuratJalanClient from "./surat-jalan-client";

export const dynamic = "force-dynamic";

/** Print page, outside the app shell so only the surat jalan reach the paper. ?sj= prints one of them. */
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ sj?: string }>;
}) {
  const { id } = await params;
  const { sj } = await searchParams;
  return <SuratJalanClient id={Number(id) || 0} noteId={sj ? Number(sj) || 0 : null} />;
}
