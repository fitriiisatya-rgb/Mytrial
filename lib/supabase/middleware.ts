import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/database.types";

/**
 * Route-group -> allowed-role map. This is a UX convenience (fast
 * redirect, no flash of the wrong dashboard) — it is NOT the security
 * boundary. The security boundary is RLS (migration 0008), which holds
 * even if this map is ever wrong or bypassed.
 */
const ROUTE_ROLES: Record<string, Database["public"]["Enums"]["user_role"][]> = {
  "/investor": ["investor"],
  "/accounting": ["accounting", "super_admin"],
  "/finance": ["finance_manager", "super_admin"],
  "/management": ["management", "super_admin", "finance_manager"],
  "/admin": ["super_admin"],
  // Broadest staff set that can reach any master-data section. Which
  // specific tables a role may write is still enforced by RLS (0008) —
  // this is only the route-level UX guard, not the security boundary.
  "/master-data": ["super_admin", "accounting", "finance_manager", "management"],
  // Matches staff_rw_import_batches / staff_rw_import_source_configs
  // (0008/0009) exactly — management has no policy on any import table.
  "/import": ["super_admin", "accounting", "finance_manager"],
};

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request: { headers: request.headers } });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          response = NextResponse.next({ request: { headers: request.headers } });
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          response = NextResponse.next({ request: { headers: request.headers } });
          response.cookies.set({ name, value: "", ...options });
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;

  if (!user && path !== "/login" && !path.startsWith("/auth")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user) {
    const matchedPrefix = Object.keys(ROUTE_ROLES).find((prefix) => path.startsWith(prefix));
    if (matchedPrefix) {
      const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
      const allowed = ROUTE_ROLES[matchedPrefix];
      if (!profile || !allowed?.includes(profile.role)) {
        const url = request.nextUrl.clone();
        url.pathname = "/";
        return NextResponse.redirect(url);
      }
    }
  }

  return response;
}
