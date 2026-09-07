import { getSession } from "@/lib/session";
import { connectPerms } from "@/lib/connectPerms";
import { ContactsList } from "@/components/connect/ContactsList";
import { ConnectGate } from "@/components/connect/ConnectGate";

export const metadata = { title: "Contacts · Connect" };

export default async function ContactsPage() {
  const [, perms] = await Promise.all([getSession(), connectPerms()]);
  if (!perms.use) return <ConnectGate />;
  return <ContactsList />;
}
