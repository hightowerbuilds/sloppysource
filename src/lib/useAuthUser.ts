import { useContext } from "react";
import { AuthUserContext } from "./authUserContext.ts";

export function useAuthUser() {
  return useContext(AuthUserContext);
}
