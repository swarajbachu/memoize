import { SidebarComponent } from "~/components/layout/sidebar-comp";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <section className="relative h-screen flex-1 gap-0 flex p-5">
      <SidebarComponent />
      <main className="flex-1 px-3 pb-28 sm:mb-0 overflow-y-auto">
        {children}
      </main>
    </section>
  );
}
