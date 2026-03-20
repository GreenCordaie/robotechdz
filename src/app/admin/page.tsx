"use server";

import "server-only";
import { redirect } from "next/navigation";

export default function AdminRootPage() {
    redirect("/admin/dashboard");
}
