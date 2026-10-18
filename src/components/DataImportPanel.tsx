import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Upload, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { Habit } from "@/types/habit";
import { isSealedBackup, openBackup } from "@/lib/backupFile";
import type { Task } from "@/types/task";

type Imported = { habits?: Habit[]; tasks?: Task[]; calendarNotes?: any[] };

export const DataImportPanel = ({ onImport }: { onImport: (d: Imported) => void }) => {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const handle = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    const all: Imported = { habits: [], tasks: [], calendarNotes: [] };
    try {
      for (const f of Array.from(files)) {
        const bytes = new Uint8Array(await f.arrayBuffer());
        let d: Imported;
        const lower = f.name.toLowerCase();
        if (isSealedBackup(bytes) || lower.endsWith(".htb") || lower.endsWith(".htbak")) {
          const j = await openBackup(bytes);
          d = { habits: j.habits, tasks: j.tasks, calendarNotes: j.calendarNotes ?? j.notes };
        } else {
          throw new Error("Only Protected Backup (.htb) files can be imported. Spreadsheets are view-only.");
        }
        all.habits!.push(...(d.habits ?? []));
        all.tasks!.push(...(d.tasks ?? []));
        all.calendarNotes!.push(...(d.calendarNotes ?? []));
      }
      const n = all.habits!.length + all.tasks!.length + all.calendarNotes!.length;
      if (!n) throw new Error("Nothing to import in this file");
      onImport(all);
      toast.success(`Imported ${all.habits!.length} habits, ${all.tasks!.length} tasks, ${all.calendarNotes!.length} notes`);
    } catch (e) {
      toast.error((e as Error).message || "Couldn't read this file");
    } finally {
      setBusy(false);
      if (ref.current) ref.current.value = "";
    }
  };

  return (
    <div className="space-y-3 pt-4 border-t border-border">
      <div className="flex items-center gap-2">
        <Upload className="h-4 w-4 text-muted-foreground" />
        <h3 className="font-medium">Import Data</h3>
      </div>
      <p className="text-sm text-muted-foreground">
        Bring back a Protected Backup (.htb) or spreadsheet you exported. Backups are checked for tampering automatically. Imported data is added — nothing you have now is removed.
      </p>
      <input ref={ref} type="file" multiple accept=".htb,.htbak,application/octet-stream" className="hidden"
        onChange={e => handle(e.target.files)} />
      <Button variant="outline" className="w-full gap-2" disabled={busy} onClick={() => ref.current?.click()}>
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
        Choose file(s) to import
      </Button>
    </div>
  );
};
