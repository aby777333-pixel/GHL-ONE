import { MessageSquare } from "lucide-react";
import { EmptyState } from "@/components/ui";

export default function ChatIndexPage() {
  return (
    <div className="hidden lg:flex flex-1 items-center justify-center h-full">
      <EmptyState icon={<MessageSquare size={18} />} title="Pick a conversation" hint="Choose a channel or a person on the left, or start a new conversation." />
    </div>
  );
}
