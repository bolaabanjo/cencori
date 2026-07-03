import { loader } from "fumadocs-core/source";
import { eline } from "@/.source/server";

export const elineSource = loader({
  baseUrl: "/eline/docs",
  source: eline.toFumadocsSource(),
});
