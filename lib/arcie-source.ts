import { loader } from "fumadocs-core/source";
import { arcie } from "@/.source/server";

export const arcieSource = loader({
  baseUrl: "/arcie/docs",
  source: arcie.toFumadocsSource(),
});
