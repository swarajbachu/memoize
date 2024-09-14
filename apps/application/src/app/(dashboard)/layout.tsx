import { SidebarComponent } from '~/components/layout/sidebar-comp'

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <section className="relative h-full gap-8 md:flex">
      <SidebarComponent />
      <div className="relative mt-8 grid w-full items-center px-2 md:block  md:p-12">
        {children}
      </div>
    </section>
  )
}
