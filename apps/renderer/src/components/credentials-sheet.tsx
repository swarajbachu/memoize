import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";

import type { AgentAvailability, ProviderId } from "@forkzero/wire";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Sheet,
  SheetDescription,
  SheetHeader,
  SheetPanel,
  SheetPopup,
  SheetTitle,
} from "~/components/ui/sheet";
import { useAgentsStore } from "../store/agents.ts";

export function CredentialsSheet() {
  const open = useAgentsStore((s) => s.credentialsOpen);
  const setOpen = useAgentsStore((s) => s.setCredentialsOpen);
  const availability = useAgentsStore((s) => s.availability);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetPopup side="right">
        <SheetHeader>
          <SheetTitle>Provider credentials</SheetTitle>
          <SheetDescription>
            API keys are stored in your OS keychain and only sent to the
            provider's SDK. They never appear in logs or transcripts.
          </SheetDescription>
        </SheetHeader>
        <SheetPanel>
          <div className="flex flex-col gap-4">
            {availability.map((a) => (
              <ProviderRow key={a.providerId} availability={a} />
            ))}
          </div>
        </SheetPanel>
      </SheetPopup>
    </Sheet>
  );
}

function ProviderRow({ availability }: { availability: AgentAvailability }) {
  const setCredential = useAgentsStore((s) => s.setCredential);
  const [value, setValue] = useState("");
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const onSave = async (id: ProviderId) => {
    if (value.trim().length === 0) return;
    setBusy(true);
    setStatus(null);
    try {
      await setCredential(id, value.trim());
      setValue("");
      setStatus("Saved.");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-3">
      <div className="flex items-center justify-between">
        <Label className="font-medium">{availability.displayName}</Label>
        <span
          className={
            availability.sdkConfigured
              ? "text-emerald-500 text-xs"
              : "text-muted-foreground text-xs"
          }
        >
          {availability.sdkConfigured ? "configured" : "not set"}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Input
            type={reveal ? "text" : "password"}
            placeholder="paste API key"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            disabled={busy}
          />
          <button
            type="button"
            onClick={() => setReveal((r) => !r)}
            className="absolute end-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
            aria-label={reveal ? "Hide key" : "Reveal key"}
            tabIndex={-1}
          >
            {reveal ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
          </button>
        </div>
        <Button
          size="sm"
          onClick={() => void onSave(availability.providerId)}
          disabled={busy || value.trim().length === 0}
        >
          Save
        </Button>
      </div>
      {status !== null && (
        <p className="text-muted-foreground text-xs">{status}</p>
      )}
    </div>
  );
}
