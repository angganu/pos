import { Suspense } from "react";
import HargaClient from "./harga-client";
import { Loading } from "@/components/ui";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <HargaClient />
    </Suspense>
  );
}
