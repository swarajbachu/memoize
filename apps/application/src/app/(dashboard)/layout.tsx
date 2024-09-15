import { SidebarComponent } from '~/components/layout/sidebar-comp'

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <section className="relative h-full gap-0 md:flex">
      <SidebarComponent />
      <div className="relative grid w-full items-center px-2 md:block  md:p-0">
        {children}
      </div>
    </section>
  )
}
