import { Processor } from "@/components/bento-one/cards/processor";

export const ComponentsDashboardsAndEverything = () => {
  return (
    <div className="relative p-4">
      <div className="absolute inset-0">
        <Processor />
      </div>
      <div className="text-lg leading-6 font-medium tracking-tight z-10 relative text-foreground">
        Local-first: SQLite on disk, keys in your Keychain
      </div>
    </div>
  );
};

