import { createContext } from "react";
import type { User } from "@supabase/supabase-js";

export const AuthUserContext = createContext<User | null>(null);
