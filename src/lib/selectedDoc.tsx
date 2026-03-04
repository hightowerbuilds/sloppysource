import { useState } from "react";
import type { ReactNode } from "react";
import { SelectedDocContext } from "./selectedDocContext.ts";

export function SelectedDocProvider({ children }: { children: ReactNode }) {
  const [docId, setDocId] = useState<string | null>(null);
  return (
    <SelectedDocContext.Provider value={{ docId, setDocId }}>
      {children}
    </SelectedDocContext.Provider>
  );
}
