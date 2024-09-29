import { Button } from "@memoize/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@memoize/ui/drawer";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@memoize/ui/tooltip";
import { PlusIcon } from "lucide-react";
import EntryEditor from "./entry-editor";

export default function AddEntry() {
  return (
    <Drawer>
      <TooltipProvider delayDuration={0}>
        <Tooltip>
          <TooltipTrigger asChild>
            <DrawerTrigger asChild>
              <Button
                className="fixed bottom-4 right-4 rounded-full w-12 h-12 z-50"
                size="icon"
              >
                <PlusIcon className="h-6 w-6" />
                <span className="sr-only">New Entry</span>
              </Button>
            </DrawerTrigger>
          </TooltipTrigger>
          <TooltipContent>
            <p>New Entry</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <DrawerContent className="z-50 sm:h-[90vh]">
        <div className="mx-auto w-full h-full">
          <DrawerHeader className="flex justify-between items-center">
            <DrawerTitle>Add New</DrawerTitle>
          </DrawerHeader>
          <EntryEditor />
        </div>
      </DrawerContent>
    </Drawer>
  );
}
