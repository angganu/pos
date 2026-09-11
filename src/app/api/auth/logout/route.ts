import { destroySession, getSession } from "@/lib/auth";
import { ok, audit } from "@/lib/api";

export async function POST() {
  const user = await getSession();
  if (user) await audit(user.id, "logout", "User", user.id);
  await destroySession();
  return ok({ loggedOut: true });
}
