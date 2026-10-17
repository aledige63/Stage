// Salvataggio file: su Chrome/Edge si sceglie dove salvare (File System Access API),
// altrove si scarica nella cartella Download.

interface SaveFilePickerOptions {
  suggestedName?: string;
  types?: { description: string; accept: Record<string, string[]> }[];
}
interface FileHandle {
  createWritable(): Promise<{ write(data: Blob): Promise<void>; close(): Promise<void> }>;
}
type PickerWindow = Window & { showSaveFilePicker?: (o: SaveFilePickerOptions) => Promise<FileHandle> };

export interface SaveTarget {
  write(blob: Blob): Promise<void>;
}

export function sanitizeFileName(name: string) {
  return name.trim().replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, '_') || 'stage';
}

function downloadTarget(name: string): SaveTarget {
  return {
    async write(blob) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    },
  };
}

/**
 * Da chiamare subito al clic (prima di lavori lunghi): il selettore file richiede
 * un gesto recente dell'utente. Restituisce null se l'utente annulla.
 */
export async function pickSaveTarget(name: string, description: string, mime: string, ext: string): Promise<SaveTarget | null> {
  const w = window as PickerWindow;
  if (!w.showSaveFilePicker) return downloadTarget(name);
  try {
    const handle = await w.showSaveFilePicker({ suggestedName: name, types: [{ description, accept: { [mime]: [ext] } }] });
    return {
      async write(blob) {
        const out = await handle.createWritable();
        await out.write(blob);
        await out.close();
      },
    };
  } catch (e) {
    if ((e as DOMException).name === 'AbortError') return null;
    return downloadTarget(name);
  }
}
