import TopNav from "@/components/TopNav";
import BottomNav from "@/components/BottomNav";
import { ProfileProvider } from "@/components/ProfileProvider";
import { ToastProvider } from "@/components/ui/toast";
import SharedLayoutBridge from "@/app/components/transition/SharedLayoutBridge";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <ProfileProvider>
        <SharedLayoutBridge>
          <TopNav />
          <main className="flex-1 pb-[calc(4rem+env(safe-area-inset-bottom))]">
            {children}
          </main>
          <BottomNav />
        </SharedLayoutBridge>
      </ProfileProvider>
    </ToastProvider>
  );
}
