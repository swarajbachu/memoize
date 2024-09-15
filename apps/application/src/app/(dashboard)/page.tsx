import { Button } from '@memoize/ui/button'
import { Input } from '@memoize/ui/input'
import { ScrollArea } from '@memoize/ui/scroll-area'
import { Textarea } from '@memoize/ui/textarea'
import { MenuIcon, PlusIcon } from 'lucide-react'

export const runtime = 'edge'

console.log('dashboard')

const entries = [
  { id: 1, title: 'My first journal entry', date: '2023-05-01' },
  { id: 2, title: 'Reflections on spring', date: '2023-05-05' },
  { id: 3, title: 'Goals for the month', date: '2023-05-10' },
]

export default async function HomePage() {
  // You can await this here if you don't want to show Suspense fallback below
  // const res = await client.test.testRoute.$get();
  // const test = await res.json();

  return (
    <main className="flex h-screen">
      {/* Sidebar */}
      {/* <div className={`${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} fixed inset-y-0 left-0 z-50 w-64 bg-card shadow-lg transition-transform duration-300 ease-in-out lg:relative lg:translate-x-0`}>
        <div className="flex items-center justify-between p-4 border-b">
          <h1 className="text-xl font-semibold">My Journal</h1>
          <Button variant="ghost" size="icon" onClick={toggleSidebar} className="lg:hidden">
            <MenuIcon className="h-6 w-6" />
          </Button>
        </div>
        <nav className="p-4">
          <Button variant="ghost" className="w-full justify-start mb-2">
            <CalendarIcon className="mr-2 h-4 w-4" />
            Calendar View
          </Button>
          <Button variant="ghost" className="w-full justify-start">
            <BookIcon className="mr-2 h-4 w-4" />
            All Entries
          </Button>
        </nav>
      </div> */}

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        <div className="w-full lg:w-64 border-r">
          <div className="p-4 border-b">
            <Input placeholder="Search entries..." />
          </div>
          <ScrollArea className="h-[calc(100vh-9rem)]">
            {entries.map((entry) => (
              <div
                key={entry.id}
                className="p-4 border-b cursor-pointer hover:bg-accent"
              >
                <h3 className="font-medium">{entry.title}</h3>
                <p className="text-sm text-muted-foreground">{entry.date}</p>
              </div>
            ))}
          </ScrollArea>
        </div>

        <div className="flex-1 flex flex-col p-4">
          <div className="mb-4 flex justify-between items-center">
            <Input
              placeholder="Entry title"
              className="text-2xl font-bold bg-transparent border-none"
            />
            <Button>
              <PlusIcon className="mr-2 h-4 w-4" />
              New Entry
            </Button>
          </div>
          <Textarea
            placeholder="Start writing your journal entry here..."
            className="flex-1 resize-none"
          />
        </div>
      </div>
    </main>
  )
}
