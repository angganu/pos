import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { can } from "@/lib/rbac";
import { AppProvider } from "@/components/app-context";
import Sidebar from "@/components/sidebar";
import Topbar from "@/components/topbar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSession();
  if (!user) redirect("/login");

  const canPickAllStores = can(user, "store.all");
  const stores = await prisma.store.findMany({
    where: canPickAllStores ? { active: true } : { id: user.storeId ?? -1 },
    orderBy: { code: "asc" },
    select: { id: true, code: true, name: true, address: true, phone: true },
  });

  return (
    <AppProvider user={user} stores={stores} canPickAllStores={canPickAllStores}>
      <div className="flex h-screen overflow-hidden bg-bg">
        <Sidebar />
        <main className="flex min-w-0 flex-1 flex-col">
          <Topbar />
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">{children}</div>
        </main>
      </div>
    </AppProvider>
  );
}
