import { redirect } from "next/navigation";

/**
 * /search — Search now lives inside Discover (unified social discovery).
 * Redirect keeps old links working.
 */
export default function SearchPage(): never {
  redirect("/discover");
}
