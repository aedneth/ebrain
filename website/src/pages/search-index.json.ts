import type { APIRoute } from "astro";
import { getCollection } from "astro:content";

import { docById, docRoute } from "../lib/navigation";

export const prerender = true;

function headings(body: string): string[] {
  return [...body.matchAll(/^#{2,3}\s+(.+)$/gm)].map((match) => match[1]?.replace(/[`*_]/g, "").trim() ?? "").filter(Boolean);
}

export const GET: APIRoute = async () => {
  const entries = await getCollection("publicDocs");
  const index = entries.flatMap((entry) => {
    const doc = docById(entry.id);
    if (!doc) return [];
    return [{ title: doc.title, description: doc.description, headings: headings(entry.body ?? ""), href: docRoute(entry.id) }];
  });
  return new Response(JSON.stringify(index), { headers: { "Content-Type": "application/json; charset=utf-8" } });
};
