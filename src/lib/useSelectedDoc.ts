import { useContext } from "react";
import { SelectedDocContext } from "./selectedDocContext.ts";

export function useSelectedDoc() {
  return useContext(SelectedDocContext);
}
