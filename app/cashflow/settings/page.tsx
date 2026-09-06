import { redirect } from "next/navigation";

export default function SettingsIndex() {
  redirect("/cashflow/settings/accounts");
}
