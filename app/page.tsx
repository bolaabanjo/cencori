// app/page.tsx
import { redirect } from "next/navigation";

export default function Page() {
  // immediate server-side redirect to the login page
  redirect("/login");
}
