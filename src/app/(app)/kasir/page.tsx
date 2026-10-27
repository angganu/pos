import KasirClient from "./kasir-client";

export const dynamic = "force-dynamic";

/** ?edit= opens a PO that is not delivered yet in the kasir form, to change it. */
export default async function KasirPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  const { edit } = await searchParams;
  return <KasirClient editId={Number(edit) || null} />;
}
