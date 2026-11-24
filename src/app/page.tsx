import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { loadAdminWorkspace } from "@/lib/admin-workspace";
import Workspace from "./workspace";
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const params = await searchParams;
  if (user.role !== "admin") {
    if (params.view === "drafts") redirect("/school?view=history");
    redirect("/school");
  }
  const data = await loadAdminWorkspace(params);
  return (
    <Workspace
      user={user}
      {...data}
      initialView={
        params.view === "drafts" || data.searchError ? "drafts" : "admin"
      }
    />
  );
}
