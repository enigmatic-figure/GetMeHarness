import { createFileRoute } from "@tanstack/react-router";
import { GetMeApp } from "@/components/getme/app";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <GetMeApp />;
}
