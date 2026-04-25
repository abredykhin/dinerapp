import Header from "@/components/Header";
import BottomNav from "@/components/BottomNav";

export default function AppShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      {/* pb-20 keeps content above the fixed bottom nav */}
      <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-24 pt-4">
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
