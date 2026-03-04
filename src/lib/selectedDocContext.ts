import { createContext } from "react";

export interface SelectedDocContextValue {
  docId: string | null;
  setDocId: (id: string | null) => void;
}

export const SelectedDocContext = createContext<SelectedDocContextValue>({
  docId: null,
  setDocId: () => {},
});
